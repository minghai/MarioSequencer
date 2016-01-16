/*
 *  Mario Sequencer Web edition
 *    Programmed by minghai (http://github.com/minghai)
 */

// First, check the parameters to get MAGNIFY
var OPTS = {};
window.location.search.substr(1).split('&').forEach(function (s) {
  var tmp = s.split('=');
  OPTS[tmp[0]] = tmp[1];
});

// GLOBAL VARIABLES
//   Constants: Full capital letters
//   Variables: CamelCase
AC = (window.AudioContext) ? new AudioContext() : new webkitAudioContext();
SEMITONERATIO = Math.pow(2, 1/12);
MAGNIFY = OPTS.mag || OPTS.magnify || 2;
CHARSIZE = 16 * MAGNIFY;
HALFCHARSIZE = Math.floor(CHARSIZE / 2);
BUTTONS = [];
MouseX = 0;
MouseY = 0;
CONSOLE = document.getElementById("console");
ORGWIDTH  = 256;
ORGHEIGHT = 224;
SCRHEIGHT = 152;
CONSOLE.style.width  = ORGWIDTH  * MAGNIFY + "px";
CONSOLE.style.height = ORGHEIGHT * MAGNIFY + "px";
OFFSETLEFT = CONSOLE.offsetLeft;
OFFSETTOP  = CONSOLE.offsetTop;
CurChar = 0;
CurPos = 0;
CurSong = undefined; // For Embedded Songs
CurScore = {};
DEFAULTMAXBARS = 24 * 4 + 1; // 24 bars by default
DEFAULTTEMPO = 100;
CurMaxBars = DEFAULTMAXBARS;
Mario = null; // Mamma Mia!
AnimeID = 0; // ID for cancel animation
PsedoSheet = null // CSSRules for manipulating pseudo elements
RepeatMark = null // For Score
EndMark    = null

/*
 * GameStatus: Game mode
 *   0: Edit
 *   1: Mario Entering
 *   2: Playing
 *   3: Mario Leaving
 */
GameStatus = 0;

// shim layer with setTimeout fallback
window.requestAnimFrame = (function(){
return  window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame    ||
  window.oRequestAnimationFrame      ||
  window.msRequestAnimationFrame     ||
  function( callback ){
  window.setTimeout(callback, 1000 / 60);
};
})();

// SoundEntity#constructor
function SoundEntity(path) {
  this.path = path;
  this.buffer = null;
  this.prevChord = [];
  this.diff = [14, 12, 11, 9, 7, 6, 4, 2, 0, -1, -3, -5, -6];
}

// SoundEntity#play
// The all wav files are recorded in the tone F.
// You should choose correct playback rate to play a music.
SoundEntity.prototype.play = function(scale, delay) {
  var source = AC.createBufferSource();
  var tmps = scale & 0x0F;
  var semitone = this.diff[tmps];
  if ((scale & 0x80) != 0) semitone++;
  else if ((scale & 0x40) != 0) semitone--;
  if (delay == undefined) delay = 0;
  source.buffer = this.buffer;
  source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
  source.connect(AC.destination);
  source.start(delay);
};

// Play a chord
//   In fact, can be a single note.
//   Purpose is to cancel the sounds in previous bar
//   if the kind of note is the same.
//   Even the chord will be canceled (stoped) playing
//   SNES has channels limit, so that succesive notes
//   cancels previous note when next note comes.
//   Long note like Yoshi can be canceled often
//   BufferSource.stop won't throw an error even if the
//   previous note has already ended.
SoundEntity.prototype.playChord = function(noteList, delay) {
  // Cancel previous chord first
  for (var i = 0; i < this.prevChord.length; i++) {
    this.prevChord[i].stop();
  }
  this.prevChord = [];
  if (delay == undefined) delay = 0;
  // I heard that Array#map is slower than for loop because of costs of calling methods.
  for (var i = 0; i < noteList.length; i++) {
    var source = AC.createBufferSource();
    var scale = (noteList[i] & 0x0F);
    var semitone = this.diff[scale];
    if ((noteList[i] & 0x80) != 0) semitone++;
    else if ((noteList[i] & 0x40) != 0) semitone--;
    source.buffer = this.buffer;
    source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);

    // Compressor: Suppress harsh distortions
    //var compressor = AC.createDynamicsCompressor();
    //source.connect(compressor);
    //compressor.connect(AC.destination);
    source.connect(AC.destination);
    source.start(delay);
    this.prevChord.push(source);
  }
}

SoundEntity.prototype.load = function() {
  var filepath = this.path;
  return new Promise(function (resolve, reject) {
    // Load buffer asynchronously
    var request = new XMLHttpRequest();
    request.open("GET", filepath, true);
    request.responseType = "arraybuffer";

    request.onload = function() {
      // Asynchronously decode the audio file data in request.response
      AC.decodeAudioData(
        request.response,
        function(buffer) {
          if (!buffer) {
            reject('error decoding file data: ' + url);
          }
          resolve(buffer);
        },
        function(error) {
          reject('decodeAudioData error:' + error);
        }
      );
    }

    request.onerror = function() {
      reject('BufferLoader: XHR error');
    }

    request.send();
  });
};

// It's me, Mario!
function MarioClass() {
  this.offset = -16; // offset in X
  this.scroll = 0;   // Scroll amount in dots
  this.x = -16;      // X-position in dots.
  this.images = null;
  this.pos = 0;      // position in bar number
}

MarioClass.prototype.init = function() {
  this.x = -16;
  this.pos = 0;
  this.start = 0;
  this.state = 0;
  this.scroll = 0;
  this.offset = -16;
  this.timer = new easyTimer(100, function(timer) {
    Mario.state = (Mario.state == 1) ? 0 : 1;
  });
  this.timer.switch = true; // forever true;
  this.isJumping = false;
};

MarioClass.prototype.enter = function(timeStamp) {
  if (this.start == 0) this.start = timeStamp;

  var diff = timeStamp - this.start;
  this.x = Math.floor(diff / 5) + this.offset;
  if (this.x >= 40) this.x = 40; // 16 + 32 - 8
  if (Math.floor(diff / 100) % 2 == 0) {
    this.state = 1;
  } else {
    this.state = 0;
  }
  this.draw();
};

MarioClass.prototype.init4leaving = function() {
  this.offset = this.x;
  this.start = 0;
  this.isJumping = false;
};

/*
 * You can assume that animation is always 60FPS (in theory :-)
 * So 1[frame] is 1 / 60 = 0.1666...[sec]
 * Mario runs 32[dots] per 1[beat]
 * [beat/1sec] = TEMPO[bpm] / 60[sec]
 * [sec/1beat] = 60[sec] / TEMPO[bpm] for 32[dots]
 * 1/60 : 60/TEMPO = x : 32
 * 60x/TEMPO = 32/60
 * x = 32 * TEMPO / 60 * 60 [dots/1frame]
 * Acctually, [msec/1frame] = diff is not always 1/60 * 1000; So,
 * diff : 60 * 1000 / TEMPO = x : 32
 * 60000x/TEMPO = 32diff
 * x = 32 * diff * TEMPO / 60000
 * Logical MAX BPM is when t[sec/1beat] = 2/60, then TEMPO = 1800
 * Because Mario must jump up and down, so he needs 2 times to draw in 1 beat.
 * Real Mario sequencer tempo limit seems 700.
 * So this is good enough.
 * (Famous fastest song, Hatsune Miku no Shoshitsu is 245 (* 4 < 1000))
 * (Mario Sequencer handles only 3 or 4 beat, so if you want to do 8 beat, TEMPO*2)
 *
 * At first, Mario runs to the center of the stage.
 * Then Mario will be fixed at the position.
 * Instead, the score is scrolling from then.
 * When the last bar appears, scroll stops and Mario runs again.
 *
 * Mario should jump from one bar before the next bar which has the note(s)
 *
 */
MarioClass.prototype.init4playing = function(timeStamp) {
  this.lastTime = timeStamp;
  this.offset = this.x;
  this.scroll = 0;
  this.pos = 1;
  this.state == 1;
  this.checkMarioShouldJump();
};

MarioClass.prototype.checkMarioShouldJump = function() {
  var notes = CurScore.notes[this.pos - 1];
  if (notes == undefined || notes.length == 0) {
    this.isJumping = false;
  } else if (notes.length == 1) {
    this.isJumping = (typeof notes[0] != 'string');
  } else
    this.isJumping = true;
};

MarioClass.prototype.play = function(timeStamp) {
  // function for setting a chord to SoundEntities and playing it
  function scheduleAndPlay(notes, time) {
    if (time < 0) time = 0;
    if (notes == undefined || notes.length == 0) return;
    var dic = {};
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];

      // Dynamic tempo change
      if (typeof note == "string") {
        var tempo = note.split("=")[1];
        CurScore.tempo = tempo;
        document.getElementById("tempo").value = tempo;
        continue;
      }

      var num = note >> 8;
      var scale = note & 0xFF;
      if  (!dic[num]) dic[num] = [scale];
      else dic[num].push(scale);
    }
    for (var i in dic) {
      SOUNDS[i].playChord(dic[i], time / 1000); // [ms] -> [s]
    }
  }

  var tempo = CurScore.tempo
  var diff = timeStamp - this.lastTime; // both are [ms]
  if (diff > 32) diff = 16; // When user hide the tag, force it
  this.lastTime = timeStamp;
  var step = 32 * diff * tempo / 60000; // (60[sec] * 1000)[msec]

  this.timer.checkAndFire(timeStamp);
  var scroll = document.getElementById('scroll');

  var nextBar = (16 + 32 * (this.pos - CurPos + 1) - 8);
  if (Mario.x < 120) { // Mario still has to run
    this.x += step;
    // If this step crosses the bar
    if (this.x >= nextBar) {
      this.pos++;
      scheduleAndPlay(CurScore.notes[this.pos - 2], 0); // Ignore diff
      this.checkMarioShouldJump();
    } else {
      // 32 dots in t[sec/1beat]
      if (this.x >= 120) {
        this.scroll = this.x - 120;
        this.x = 120;
      }
    }
  } else if (CurPos <= CurScore.end - 6) { // Scroll
    this.x = 120;
    if (this.scroll < 16 && (this.scroll + step) > 16) {
      this.pos++;
      this.scroll += step;
      scheduleAndPlay(CurScore.notes[this.pos - 2], 0); // Ignore error
      this.checkMarioShouldJump();
    } else {
      this.scroll += step;
      if (this.scroll > 32) {
        this.scroll -= 32;
        CurPos++;
        scroll.value = CurPos;
        if (CurPos > (CurScore.end - 6)) {
          this.x += this.scroll;
          this.scroll = 0
        }
      }
    }
  } else {
    this.x += step;
    // If this step crosses the bar
    if (this.x >= nextBar) {
      this.pos++;
      scheduleAndPlay(CurScore.notes[this.pos - 2], 0); // Ignore diff
      this.checkMarioShouldJump();
    }
  }
  drawScore(CurPos, CurScore.notes, this.scroll);
  this.draw();
};

// Mario Jump
MarioClass.prototype.jump = function(x) {
  var h = [0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 18, 19, 19, 19,
           19, 19, 18, 18, 17, 16, 15, 14, 13, 12, 10, 8, 6, 4, 2, 0];
  return h[Math.round(x) % 32];
}

MarioClass.prototype.draw = function() {
  var y = (41 - 22);
  var state = this.state
  if (this.isJumping) {
    state = 2;
    if (this.x == 120) { // In scroll mode
      // (scroll == 16) is just on the bar, 0 and 32 is on the center of between bars
      if (this.scroll != 16) {
        y -= this.jump(this.scroll > 16 ? this.scroll - 16 : this.scroll + 16);
      } /* if scroll == 16 then Mario should be on the ground */
    } else { // Running to the center, or leaving to the goal
      y -= this.jump(Math.round((this.x - 8) % 32));
    }
  }

  L2C.drawImage(this.images[state], this.x * MAGNIFY, y * MAGNIFY);
};

MarioClass.prototype.leave = function(timeStamp) {
  if (this.start == 0) this.start = timeStamp;

  var diff = timeStamp - this.start;
  if (this.scroll > 0 && this.scroll < 32) {
    this.scroll += Math.floor(diff / 4);
    if (this.scroll > 32) {
      this.x += this.scroll - 32;
      this.scroll = 0;
      CurPos++;
    }
  } else
    this.x = Math.floor(diff / 4) + this.offset;
  if (Math.floor(diff / 100) % 2 == 0) {
    this.state =  8;
    this.draw();
    var w = sweatimg.width;
    var h = sweatimg.height;
    L2C.drawImage(sweatimg,
        0, 0, w, h,
        (this.x - (w + 1)) * MAGNIFY, (41 - 22) * MAGNIFY,
        w * MAGNIFY, h * MAGNIFY);
  } else {
    this.state = 9;
    this.draw();
  }
};

// Timer
function easyTimer(time, func) {
  this.time = time;
  this.func = func;
  this.lastTime = 0;
  this.switch = false;
}

easyTimer.prototype.checkAndFire = function(time) {
  if (this.switch && time - this.lastTime > this.time) {
    this.func(this);
    this.lastTime = time;
  }
};

// Asynchronous load of sounds
SOUNDS = [];
for (i = 1; i < 21; i++) {
  var tmp = '0';
  tmp += i.toString();
  var file = "wav/sound" + tmp.substr(-2) + ".wav";
  var e = new SoundEntity(file);
  SOUNDS[i-1] = e;
}

// Prepare Mat
MAT = document.getElementById("layer1");
MAT.width  = ORGWIDTH  * MAGNIFY;
MAT.height = ORGHEIGHT * MAGNIFY;
L1C = MAT.getContext('2d');
L1C.imageSmoothingEnabled = false;
var mi = new Image();
mi.src = "image/mat.png";
mi.onload = function() {
  L1C.drawImage(mi, 0, 0, mi.width * MAGNIFY, mi.height * MAGNIFY);
};

// Prepare Characters
char_sheet = new Image();
char_sheet.src = "image/character_sheet.png";

// Prepare the Bomb!
BOMBS = []
bombimg = new Image();
bombimg.src = "image/bomb.png";
bombTimer = new easyTimer(150, drawBomb);
bombTimer.switch = true; // always true for the bomb
bombTimer.currentFrame = 0;

function drawBomb(mySelf) {
  var x = 9 * MAGNIFY;
  var y = 202 * MAGNIFY;
  var img = BOMBS[mySelf.currentFrame];
  L1C.drawImage(img, x, y);
  switch (mySelf.currentFrame) {
    case 0:
      mySelf.currentFrame = 1;
      break;
    case 1:
      mySelf.currentFrame = 0;
      break;
    case 2:
      break;
  }
  if (CurSong == undefined || GameStatus != 2) return;
  CurSong.style.backgroundImage =
    "url(" + CurSong.images[mySelf.currentFrame + 1].src + ")";
}

// Prepare the G-Clef. (x, y) = (9, 48)
GClef = new Image();
GClef.src = "image/G_Clef.png";

// Prepare the numbers
numimg = new Image();
numimg.src = "image/numbers.png";

// Prepare the Mario images
marioimg = new Image();
marioimg.src = "image/Mario.png";

sweatimg = new Image();
sweatimg.src = "image/mario_sweat.png";

// Prepare the Play button
playbtnimg = new Image();
playbtnimg.src = "image/play_button.png";

// Prepare the Stop button
stopbtnimg = new Image();
stopbtnimg.src = "image/stop_button.png";

// Prepare the CLEAR button
clearimg = new Image();
clearimg.src = "image/clear_button.png";

// Prepare tempo range slider thumb image
thumbimg = new Image();
thumbimg.src = "image/slider_thumb.png";

// Prepare beat button
beatimg = new Image();
beatimg.src = "image/beat_button.png";

// Prepare Song buttons
songimg = new Image();
songimg.src = "image/song_buttons.png";

// Prepare End Mark
endimg = new Image();
endimg.src = "image/end_mark.png";

// Prepare Semitone
semitoneimg = new Image();
semitoneimg.src = "image/semitone.png";

// Prepare the repeat marks
repeatimg = new Image();
repeatimg.src = "image/repeat_head.png";

function drawRepeatHead(x) {
  var w = RepeatMarks[0].width;
  var h = RepeatMarks[0].height;
  L2C.drawImage(RepeatMarks[0], x * MAGNIFY, 56 * MAGNIFY);
}

// Score Area (8, 41) to (247, 148)
function drawScore(pos, notes, scroll) {
  // Clip only X
  L2C.clearRect(0, 0, SCREEN.width, SCREEN.height);
  L2C.save();
  L2C.rect(8 * MAGNIFY, 0, (247 - 8 + 1) * MAGNIFY, SCRHEIGHT * MAGNIFY);
  L2C.clip();

  // If mouse cursor on or under the C, draw horizontal line
  var realX = MouseX - OFFSETLEFT;
  var realY = MouseY - OFFSETTOP;
  var g = toGrid(realX, realY);
  var gridX;
  var gridY;
  // Edit mode only, no scroll
  if (GameStatus == 0 && g !== false) {
    gridX = g[0];
    gridY = g[1];
    if (gridY >= 11) drawHorizontalBar(gridX, 0);
  }

  if (pos == 0) {
    var w = GClef.width;
    var h = GClef.height;
    // GClef image is NOT magnified yet.
    L2C.drawImage(GClef,
      0, 0, w, h,
      (9 - scroll) * MAGNIFY, 48 * MAGNIFY, w * MAGNIFY, h * MAGNIFY);

    if (CurScore.loop) {
      drawRepeatHead(41 - scroll);
    }
  } else if (pos == 1 && CurScore.loop) {
    drawRepeatHead(9 - scroll);
  }

  //ORANGE #F89000
  var beats = CurScore.beats;
  // orange = 2, 1, 0, 3, 2, 1, 0, 3, ..... (if beats = 4)
  //        = 2, 1, 0, 2, 1, 0, 2, 1, ..... (if beats = 3)
  var orange = (beats == 4) ? 3 - ((pos + 1) % 4) : 2 - ((pos + 3) % 3);
  var i = (pos < 2) ? (2 - pos) : 0;
  for (; i < 9; i++) {
    var xorg = 16 + 32 * i - scroll;
    var x = xorg * MAGNIFY;
    var barnum = pos + i - 2;

    if (barnum == CurScore.end) {
      var img = CurScore.loop ? RepeatMarks[1] : EndMark;
      L2C.drawImage(img, x - 7 * MAGNIFY, 56 * MAGNIFY);
    }

    L2C.beginPath();
    L2C.setLineDash([MAGNIFY, MAGNIFY]);
    L2C.lineWidth = MAGNIFY;
    if (i % beats == orange) {
      if (GameStatus == 0) drawBarNumber(i, barnum / beats + 1);
      L2C.strokeStyle = '#F89000';
    } else {
      L2C.strokeStyle = '#A0C0B0';
    }
    L2C.moveTo(x,  41 * MAGNIFY);
    L2C.lineTo(x, 148 * MAGNIFY);
    L2C.stroke();

    var b = notes[barnum];
    if (b == undefined) continue;

    // Get notes down
    var delta = 0;
    if (GameStatus == 2  && Mario.pos - 2 == barnum) {
      var idx;
      if (Mario.x == 120) {
        idx = (Mario.scroll >= 16) ? Mario.scroll - 16 : Mario.scroll + 16;
      } else {
        idx = Mario.x + 8 - xorg;
      }
      var tbl = [0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 8, 8, 8, 8,
                 8, 8, 8, 8, 8, 7, 7, 6, 6, 5, 5, 4, 3, 3, 2, 1, 0];
      delta = tbl[Math.round(idx)];
    }
    var hflag = false;
    for (var j = 0; j < b.length; j++) {
      if (typeof b[j] == "string") continue; // for dynamic TEMPO

      var sndnum = b[j] >> 8;
      var scale  = b[j] & 0x0F;
      // When CurChar is eraser, and the mouse cursor is on the note,
      // an Image of note blinks.
      if (CurChar == 16 && g != false && i == gridX && scale == gridY &&
          eraserTimer.currentFrame == 1) {continue;}

      if (!hflag && (scale >= 11)) {
        hflag = true;
        drawHorizontalBar(i, scroll);
      }
      L2C.drawImage(SOUNDS[sndnum].image, x - HALFCHARSIZE,
        (40 + scale * 8 + delta) * MAGNIFY);

      var x2 = (x - 13 * MAGNIFY);
      var y = (44 + scale * 8 + delta) * MAGNIFY;
      if ((b[j] & 0x80) != 0) {
        L2C.drawImage(Semitones[0], x2, y);
      } else if ((b[j] & 0x40) != 0) {
        L2C.drawImage(Semitones[1], x2, y);
      }
    }
  }
  if (GameStatus == 0) {
    L2C.beginPath();
    L2C.setLineDash([7 * MAGNIFY, 2 * MAGNIFY, 7 * MAGNIFY, 0]);
    L2C.lineWidth = MAGNIFY;
    L2C.strokeStyle = '#F00';
    var xorg = (16 + 32 * gridX - 8);
    var x = xorg * MAGNIFY;
    var y = (40 + gridY * 8) * MAGNIFY;
    L2C.rect(x, y, CHARSIZE, CHARSIZE);
    L2C.stroke();
  }
  L2C.restore();
}

// X is the x of vertical bar (in grid)
function drawHorizontalBar(gridX, scroll) {
  var width = 24 * MAGNIFY;
  L2C.fillRect((4 + 32 * gridX - scroll) * MAGNIFY,
    (38 + 11 * 8) * MAGNIFY + HALFCHARSIZE,
    width, 2 * MAGNIFY);
}

function drawBarNumber(gridX, barnum) {
  var x = (16 + 32 * gridX) * MAGNIFY - 1;
  var y = (40 - 7) * MAGNIFY;
  var nums = [];
  while (barnum > 0) {
    nums.push(barnum % 10);
    barnum = Math.floor(barnum / 10);
  }
  var len = nums.length;
  if (len == 1) x += 2 * MAGNIFY;
  while (nums.length > 0) {
    var n = nums.pop();
    var width = (n == 4) ? 5 : 4;
    L2C.drawImage(NUMBERS[n], x, y, 5 * MAGNIFY, 7 * MAGNIFY);
    x += width * MAGNIFY;
  }
}

function changeCursor(num) {
  SCREEN.style.cursor = 'url(' + SOUNDS[num].image.src + ')' + HALFCHARSIZE +' '+ HALFCHARSIZE + ', auto';
}

function drawCurChar(image) {
  var x = 4 * MAGNIFY;
  var y = 7 * MAGNIFY;
  L1C.beginPath();
  L1C.imageSmoothingEnabled = false;
  L1C.clearRect(x, y, CHARSIZE, CHARSIZE);
  L1C.drawImage(image, x, y);
  L1C.fillRect(x, y, CHARSIZE, MAGNIFY);
  L1C.fillRect(x, y + CHARSIZE - MAGNIFY, CHARSIZE, MAGNIFY);
}

// Right-Top (19,8)
// 19 - 4 + 1 = 16
// icon size (14, 13)
function drawEndMarkIcon(img) {
  L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
  L1C.drawImage(img, 5 * MAGNIFY, 8 * MAGNIFY);
}
// Draw Eraser Icon
// In fact, this only erases Icon
function drawEraserIcon() {
  L1C.clearRect(4 * MAGNIFY, 8 * MAGNIFY, 16 * MAGNIFY, 14 * MAGNIFY);
}

function toGrid(realX, realY) {
  var gridLeft   = (8   + 0) * MAGNIFY;
  var gridTop    = (41     ) * MAGNIFY;
  var gridRight  = (247 - 4) * MAGNIFY;
  var gridBottom = (148 - 4) * MAGNIFY;
  if (realX < gridLeft || realX > gridRight ||
      realY < gridTop  || realY > gridBottom)
    return false;

  var gridX = Math.floor((realX - gridLeft) / CHARSIZE);
  if (gridX % 2 != 0) return false; // Not near the bar
  gridX /= 2;
  var gridY = Math.floor((realY - gridTop) / HALFCHARSIZE);

  // Consider G-Clef and repeat head area
  if (CurPos == 0 && gridX < 2 || CurPos == 1 && gridX == 0)
    return false;
  else
    return [gridX, gridY];
}

SCREEN = document.getElementById("layer2");
// You should not use .style.width(or height) here.
// You must not append "px" here.
SCREEN.width  = ORGWIDTH  * MAGNIFY;
SCREEN.height = SCRHEIGHT * MAGNIFY;
L2C = SCREEN.getContext('2d');
L2C.imageSmoothingEnabled = false;
// Delete
// Google don't support MouseEvent.buttons even it is in W3C standard?
// Low priority? No milestone?
// I'm outta here. #IAmGoogle
// https://code.google.com/p/chromium/issues/detail?id=276941
SCREEN.addEventListener("contextmenu", mouseClickListener);

// ClipRect (8, 41) to (247, 148)
SCREEN.addEventListener("click", mouseClickListener);

function mouseClickListener(e) {
  if (GameStatus != 0) return;
  e.preventDefault();

  var realX = e.clientX - OFFSETLEFT;
  var realY = e.clientY - OFFSETTOP;

  var g = toGrid(realX, realY);
  if (g == false) return;
  var gridX = g[0];
  var gridY = g[1];

  // Map logical x to real bar number
  var b = CurPos + gridX - 2;

  // process End Mark
  if (CurChar == 15) {
    CurScore.end = b;
    return;
  }

  if (b >= CurScore.end) return;

  var notes = CurScore['notes'][b];
  // Delete
  if (CurChar == 16 || e.button == 2) {
    // Delete Top of the stack
    for (var i = notes.length - 1; i >= 0; i--) {
      if ((notes[i] & 0x3F) == gridY) {
        notes.splice(i, 1);
        CurScore.notes[b] = notes;
        SOUNDS[17].play(8);
        break;
      }
    }
    return;
  }

  var note = (CurChar << 8) | gridY;
  if (notes.indexOf(note) != -1) return;
  //
  // Handle semitone
  if (e.shiftKey) gridY |= 0x80;
  if (e.ctrlKey ) gridY |= 0x40;
  SOUNDS[CurChar].play(gridY);
  note = (CurChar << 8) | gridY;
  notes.push(note);
  CurScore['notes'][b] = notes;
}

SCREEN.addEventListener("mousemove", function(e) {
  MouseX = e.clientX;
  MouseY = e.clientY;
});

// Read MSQ File
// You really need this "dragover" event listener.
// Check StackOverflow: http://bit.ly/1hHEINZ
SCREEN.addEventListener("dragover", function(e) {
  e.preventDefault();
  return false;
});
// Translate dropped MSQ files into inner SCORE array.
// You have to handle each file sequencially,
// But you might want to download files parallel.
// In such a case, Promise is very convinient utility.
// http://www.html5rocks.com/en/tutorials/es6/promises/
SCREEN.addEventListener("drop", function(e) {
  e.preventDefault();
  clearSongButtons();
  fullInitScore();
  // function to read a given file
  // Input is a instance of a File object.
  // Returns a instance of a Promise.
  function readFile(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.name = file.name;
      reader.addEventListener("load", function(e) {
        resolve(e.target);
      });
      reader.readAsText(file, 'shift-jis');
    });
  }

  // FileList to Array for Mapping
  var files = [].slice.call(e.dataTransfer.files);
  // Support Mr.Phenix's files. He numbered files with decimal numbers :-)
  // http://music.geocities.jp/msq_phenix/
  // For example, suite15.5.msq must be after the suite15.msq
  files.sort(function(a,b) {
    var n1 = a.name;
    var n2 = b.name;
    function strip(name) {
      n = /\d+\.\d+|\d+/.exec(name);
      if (n == null) return 0;
      n = n[0];
      return parseFloat(n);
    }
    return strip(n1) - strip(n2);
  });
  files.map(readFile).reduce(function(chain, fp, idx) {
    return chain.then(function() {
      return fp;
    }).then(function(fileReader) {
      var ext = fileReader.name.slice(-3);
      if (ext == "msq") {
        addMSQ(fileReader.result);
      } else {
        addJSON(fileReader.result);
      }
    }).catch(function(err) {
      alert("Loading MSQ failed: " + err.message);
      console.log(err);
    });
  }, Promise.resolve())
  .then(closing);

  return false;
});

// Closing to add files to the score
//   Configure Score parameters
function closing() {
  // Finally, after reducing, set parameters to Score
  var b = document.getElementById(CurScore.beats == 3 ? '3beats' : '4beats');
  var e = new Event("click");
  e.soundOff = true;
  b.dispatchEvent(e);

  var r = document.getElementById('scroll');
  CurMaxBars = CurScore.end + 1;
  r.max = CurMaxBars - 6;
  r.value = 0;
  CurPos = 0;

  var tempo = CurScore.notes[0][0];
  if (typeof tempo == "string" && tempo.substr(0, 5) == "TEMPO") {
    tempo = tempo.split("=")[1];
    CurScore.tempo = tempo;
    document.getElementById("tempo").value = tempo;
  }
}

function addMSQ(text) {
  lines = text.split(/\r\n|\r|\n/);
  keyword = ["SCORE", "TEMPO", "LOOP", "END", "TIME44"];
  var values = {};
  lines.forEach(function(line, i) {
    if (line === "") return;
    var kv = line.split("=");
    var k = kv[0];
    var v = kv[1];
    if (i < keyword.length && k !== keyword[i]) {
      throw new Error("Line " + i + " must start with '" + keyword[i] + "'");
    }
    this[k] = v;
  }, values);

  var oldEnd = CurScore.end;
  var s = values.SCORE;
  var i = 0, count = CurScore.end;
  // MSQ format is variable length string.
  out:
  while (i < s.length) {
    var bar = [];
    for (var j = 0; j < 3; j++) {
      if (s[i] === "\r" || s[i] == undefined) break out;
      var scale = parseInt(s[i++], 16);
      if (scale !== 0) {
        scale -= 1;
        var tone = parseInt(s[i++], 16) - 1;
        var note = (tone << 8) | scale;
        bar.push(note);
      }
    }
    CurScore.notes[count++] = bar;
  }

  CurScore.end  += parseInt(values.END) - 1;
  if (CurScore.tempo != values.TEMPO)
    CurScore.notes[oldEnd].splice(0, 0, "TEMPO=" + values.TEMPO);
  CurScore.tempo = values.TEMPO;
  var beats = (values.TIME44 == "TRUE") ? 4 : 3;
  CurScore.beats = beats;
  // click listener will set CurScore.loop
  b = document.getElementById("loop");
  (values.LOOP == "TRUE") ? b.set() : b.reset();
}

// addJSON
//   Prase JSON and add contents into CurScore
//   Input parameter type is FileReader,
//   but use only its result property.
//   This means you can use any object with result.
function addJSON(text) {
  var json = JSON.parse(text);
  for (var i = 0; i < json.end; i++)
    CurScore.notes.push(json.notes[i]);

  var notes = CurScore.notes[CurScore.end];
  if (CurScore.tempo != json.tempo && notes.length != 0) {
    var tempostr = notes[0];
    if (typeof tempostr != "string") {
      notes.splice(0, 0, "TEMPO=" + json.tempo);
    }
  }
  CurScore.tempo = json.tempo;

  CurScore.end += json.end;

  b = document.getElementById("loop");
  if (CurScore.loop) b.set; else b.reset();
}

function doAnimation(time) {
  // Bomb
  bombTimer.checkAndFire(time);
  eraserTimer.checkAndFire(time);
  endMarkTimer.checkAndFire(time);

  drawScore(CurPos, CurScore['notes'], 0);

  if (GameStatus != 0) return;

  requestAnimFrame(doAnimation);
}

function makeButton(x, y, w, h) {
  var b = document.createElement("button");
  b.className = "game";
  b.style.position = 'absolute';
  moveDOM(b, x, y);
  resizeDOM(b, w, h);
  b.style['z-index'] = 3;
  b.style.background = "rgba(0,0,0,0)";

  // Save position and size for later use
  b.originalX = x;
  b.originalY = y;
  b.originalW = w;
  b.originalH = h;
  b.redraw = function() {
    moveDOM(this, this.originalX, this.originalY);
    resizeDOM(this, this.originalW, this.originalH);
  }
  return b;
}

function resizeDOM(b, w, h) {
  b.style.width =  w * MAGNIFY + "px";
  b.style.height = h * MAGNIFY + "px";
}

function moveDOM(b, x, y) {
  b.style.left =   x * MAGNIFY + "px";
  b.style.top =    y * MAGNIFY + "px";
}

// Select Listener
function selectListener(e) {
  console.log(e);
  MAGNIFY = e.target.selectedIndex + 1;
  resizeScreen();
}

// resize screen using MAGNIFY
//   If we can use Elm.style.imageRendering = Crisp-edged,
//   You can avoid these re-configuring. Sigh.
function resizeScreen() {
  CHARSIZE = 16 * MAGNIFY;
  HALFCHARSIZE = Math.floor(CHARSIZE / 2);

  CONSOLE.style.width  = ORGWIDTH  * MAGNIFY + "px";
  CONSOLE.style.height = ORGHEIGHT * MAGNIFY + "px";
  OFFSETLEFT = CONSOLE.offsetLeft;
  OFFSETTOP  = CONSOLE.offsetTop;

  BOMBS = sliceImage(bombimg, 14, 18);
  Mario.images = sliceImage(marioimg, 16, 22);
  Semitones = sliceImage(semitoneimg, 5, 12);

  MAT.width  = ORGWIDTH  * MAGNIFY;
  MAT.height = ORGHEIGHT * MAGNIFY;
  L1C.drawImage(mi, 0, 0, mi.width * MAGNIFY, mi.height * MAGNIFY);

  SCREEN.width  = ORGWIDTH  * MAGNIFY;
  SCREEN.height = SCRHEIGHT * MAGNIFY;

  var imgs = sliceImage(char_sheet, 16, 16);
  for (var i = 0; i < BUTTONS.length; i++) {
    var b = BUTTONS[i];
    b.redraw();
    if (i < 15) b.se.image = imgs[i];
  }
  BUTTONS[15].images = sliceImage(endimg, 14, 13);
  endMarkTimer.images = BUTTONS[15].images;

  // Endmark Cursor (= 15) will be redrawn by its animation
  // Eraser (= 16) will be redrawn later below
  if (CurChar < 15) {
   changeCursor(CurChar);
  }

  if (CurChar == 15)
    drawEndMarkIcon(BUTTONS[15].images[0]);
  else if (CurChar == 16)
    drawEraserIcon();
  else
    drawCurChar(SOUNDS[CurChar].image);

  var b = document.getElementById("play");
  b.redraw();
  b.images = sliceImage(playbtnimg, 12, 15);
  var num = b.disabled ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";

  var b = document.getElementById("stop");
  b.redraw();
  var imgs = sliceImage(stopbtnimg, 16, 15);
  b.images = [imgs[0], imgs[1]];
  b.style.backgroundImage = "url(" + b.images[1 - num].src + ")";

  var b = document.getElementById("loop");
  b.redraw();
  b.images = [imgs[2], imgs[3]]; // made in Stop button (above)
  var num = CurScore.loop ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";

  // Prepare Repeat (global!)
  RepeatMarks = sliceImage(repeatimg, 13, 62);
  EndMark = RepeatMarks[2];

  var b = document.getElementById("scroll");
  moveDOM(b, b.originalX, b.originalY);
  resizeDOM(b, b.originalW, b.originalH);
  var rules = PseudoSheet.cssRules;
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].selectorText == "#scroll::-webkit-slider-thumb") {
      PseudoSheet.deleteRule(i);
      PseudoSheet.insertRule('#scroll::-webkit-slider-thumb {' +
        "-webkit-appearance: none !important;" +
        "border-radius: 0px;" +
        "background-color: #A870D0;" +
        "box-shadow:inset 0 0 0px;" +
        "border: 0px;" +
        "width: " + 5 * MAGNIFY + "px;" +
        "height:" + 7 * MAGNIFY + 'px;}', 0
      );
    }
  }
  var b = document.getElementById("toLeft");
  b.redraw();
  var b = document.getElementById("toRight");
  b.redraw();
  var b = document.getElementById("clear");
  b.redraw();
  b.images = sliceImage(clearimg, 34, 16);
  b.style.backgroundImage = "url(" + b.images[0].src + ")";

  // Make number images from the number sheet
  NUMBERS = sliceImage(numimg, 5, 7);

  var b = document.getElementById("3beats");
  b.redraw();
  var imgs = sliceImage(beatimg, 14, 15);
  b.images = [imgs[0], imgs[1]];
  var num = (CurScore.beats == 3) ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";
  var b = document.getElementById("4beats");
  b.redraw();
  b.images = [imgs[2], imgs[3]];
  b.style.backgroundImage = "url(" + b.images[1 - num].src + ")";

  var b = document.getElementById("frog");
  b.redraw();
  var imgs = sliceImage(songimg, 15, 17);
  b.images = [imgs[0], imgs[1], imgs[2]];
  var num = (CurSong === b) ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";
  var b = document.getElementById("beak");
  b.redraw();
  b.images = [imgs[3], imgs[4], imgs[5]];
  var num = (CurSong === b) ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";
  var b = document.getElementById("1up");
  b.redraw();
  b.images = [imgs[6], imgs[7], imgs[8]];
  var num = (CurSong === b) ? 1 : 0;
  b.style.backgroundImage = "url(" + b.images[num].src + ")";
  var b = document.getElementById("eraser");
  b.redraw();
  b.images = [imgs[9], imgs[10], imgs[11]];
  var num;
  if (CurChar == 16) {
    num = 1;
    SCREEN.style.cursor = 'url(' + b.images[2].src + ')' + ' 0 0, auto';
  } else {
    num = 0;
  }
  b.style.backgroundImage = "url(" + b.images[num].src + ")";

  var b = document.getElementById("tempo");
  moveDOM(b, b.originalX, b.originalY);
  resizeDOM(b, b.originalW, b.originalH);
  var rules = PseudoSheet.cssRules;
  for (var i = 0; i < rules.length; i++) {
    if (rules[i].selectorText == "#tempo::-webkit-slider-thumb") {
      PseudoSheet.deleteRule(i);
      PseudoSheet.insertRule('#tempo::-webkit-slider-thumb {' +
        "-webkit-appearance: none !important;" +
        "background-image: url('" + b.image.src + "');" +
        "background-repeat: no-repeat;" +
        "background-size: 100% 100%;" +
        "border: 0px;" +
        "width: " + 5 * MAGNIFY + "px;" +
        "height:" + 8 * MAGNIFY + 'px;}', 0
      );
    }
  }
}

// INIT routine
window.addEventListener("load", onload);
function onload() {
  // Make buttons for changing a kind of notes.
  //   1st mario:   x=24, y=8, width=13, height=14
  //   2nd Kinopio: X=38, y=8, width=13, height=14
  //   and so on...
  var bimgs = sliceImage(char_sheet, 16, 16);
  for (var i = 0; i < 15; i++) {
    var b = makeButton((24 + 14 * i), 8, 13, 14);
    b.num = i;
    b.se = SOUNDS[i];
    b.se.image = bimgs[i];
    b.addEventListener("click", function() {
      this.se.play(8); // Note F
      CurChar = this.num;
      clearEraserButton();
      changeCursor(this.num);
      drawCurChar(this.se.image);
    });
    CONSOLE.appendChild(b);
    BUTTONS[i] = b;
  }

  // Prepare End Mark button (Char. No. 15)
  var b = makeButton(235, 8, 13, 14);
  b.images = sliceImage(endimg, 14, 13); // Note: Different size from the button
  endMarkTimer = new easyTimer(150, function (self) {
    // If current is not end mark, just return;
    if (CurChar != 15) {
      self.switch = false;
      return;
    }
    self.currentFrame = (self.currentFrame == 0) ? 1 : 0;
    SCREEN.style.cursor = 'url(' + self.images[self.currentFrame].src + ')' +
      7 * MAGNIFY +' '+ 7 * MAGNIFY + ', auto';
  });
  endMarkTimer.images = b.images;
  endMarkTimer.currentFrame = 0;
  b.addEventListener("click", function() {
    endMarkTimer.switch = true;
    CurChar = 15;
    SOUNDS[15].play(8);
    clearEraserButton();
    drawEndMarkIcon(this.images[0]);
  });
  CONSOLE.appendChild(b);
  BUTTONS[15] = b;

  // For inserting pseudo elements' styles
  var s = document.createElement("style");
  document.head.appendChild(s);
  PseudoSheet = s.sheet;

  // Prepare Play Button (55, 168)
  var b = makeButton(55, 168, 12, 15);
  b.id = 'play';
  b.images = sliceImage(playbtnimg, 12, 15);
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  b.addEventListener("click", playListener);
  s.sheet.insertRule('#play:focus {outline: none !important;}', 0);
  CONSOLE.appendChild(b);

  // Prepare Stop Button (21, 168)
  var b = makeButton(21, 168, 16, 15);
  b.id = 'stop';
  b.disabled = false;
  // stopbtn image including loop button (next)
  var imgs = sliceImage(stopbtnimg, 16, 15);
  b.images = [imgs[0], imgs[1]];
  b.style.backgroundImage = "url(" + b.images[1].src + ")";
  b.addEventListener("click", stopListener);
  s.sheet.insertRule('#stop:focus {outline: none !important;}', 0);
  CONSOLE.appendChild(b);

  // Prepare Loop Button (85, 168)
  var b = makeButton(85, 168, 16, 15);
  b.id = 'loop';
  b.images = [imgs[2], imgs[3]]; // made in Stop button (above)
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  CurScore.loop = false;
  b.addEventListener("click", function(e) {
    var num;
    if (CurScore.loop) {
      CurScore.loop = false;
      num = 0;
    } else {
      CurScore.loop = true;
      num = 1;
    }
    this.style.backgroundImage = "url(" + this.images[num].src + ")";
    SOUNDS[17].play(8);
  });
  b.reset = function () {
    CurScore.loop = false;
    this.style.backgroundImage = "url(" + this.images[0].src + ")";
  };
  b.set   = function () {
    CurScore.loop = true;
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
  }
  s.sheet.insertRule('#loop:focus {outline: none !important;}', 0);
  CONSOLE.appendChild(b);

  // Prepare Repeat (global!)
  RepeatMarks = sliceImage(repeatimg, 13, 62);
  EndMark = RepeatMarks[2];

  // Prepare Scroll Range
  var r = document.createElement('input');
  r.id = 'scroll';
  r.type = 'range';
  r.value = 0;
  r.max = CurMaxBars - 6;
  r.min = 0;
  r.step = 1;
  r.style['-webkit-appearance']='none';
  r.style['border-radius'] = '0px';
  r.style['background-color'] = '#F8F8F8';
  r.style['box-shadow'] = 'inset 0 0 0 #000';
  r.style['vertical-align'] = 'middle';
  r.style.position = 'absolute';
  r.style.margin = 0;
  r.originalX = 191;
  r.originalY = 159;
  r.originalW = 50;
  r.originalH = 7;
  moveDOM(r, r.originalX, r.originalY);
  resizeDOM(r, r.originalW, r.originalH);
  r.addEventListener("input", function(e) {
    CurPos = parseInt(this.value);
  });
  CONSOLE.appendChild(r);

  // It's very hard to set values to a pseudo element with JS.
  // http://pankajparashar.com/posts/modify-pseudo-elements-css/
  s.sheet.insertRule('#scroll::-webkit-slider-thumb {' +
    "-webkit-appearance: none !important;" +
    "border-radius: 0px;" +
    "background-color: #A870D0;" +
    "box-shadow:inset 0 0 0px;" +
    "border: 0px;" +
    "width: " + 5 * MAGNIFY + "px;" +
    "height:" + 7 * MAGNIFY + "px;}", 0
  );
  s.sheet.insertRule('#scroll:focus {outline: none !important;}', 0);

  // Make number images from the number sheet
  NUMBERS = sliceImage(numimg, 5, 7);

  // Prepare Beat buttons w=14, h=15 (81, 203) (96, 203)
  // (1) Disable self, Enable the other
  // (2) Change both images
  // (3) Play Sound
  // (4) Set CurScore.beat
  function makeExclusiveFunction(doms, num, success) {
    var clone = doms.slice(0); // Clone the Array
    var self = clone[num];
    clone.splice(num, 1); // Remove No.i element
    var theOthers = clone;

    return function(e) {
      // Sound Off for file loading
      if (!e.soundOff) SOUNDS[17].play(8);
      self.disabled = true;
      self.style.backgroundImage = "url(" + self.images[1].src + ")";
      theOthers.map(function (x) {
        x.disabled = false;
        x.style.backgroundImage = "url(" + x.images[0].src + ")";
      });
      success(self);
    };
  }

  var imgs = sliceImage(beatimg, 14, 15);
  var b1 = makeButton(81, 203, 14, 15);
  b1.id = '3beats';
  b1.beats = 3;
  b1.images = [imgs[0], imgs[1]];
  b1.style.backgroundImage = "url(" + b1.images[0].src + ")";
  b1.disabled = false;
  CONSOLE.appendChild(b1);
  var b2 = makeButton(96, 203, 14, 15);
  b2.id = '4beats';
  b2.beats = 4;
  b2.images = [imgs[2], imgs[3]];
  b2.style.backgroundImage = "url(" + b2.images[1].src + ")";
  b2.disabled = true;
  CONSOLE.appendChild(b2);
  var func = function(self) {CurScore.beats = self.beats};
  b1.addEventListener("click", makeExclusiveFunction([b1, b2], 0, func));
  b2.addEventListener("click", makeExclusiveFunction([b1, b2], 1, func));

  // Preapre Song Buttons (136, 202) 15x17, 160 - 136 = 24
  var imgs = sliceImage(songimg, 15, 17);
  var b = ['frog','beak','1up'].map(function (id, idx) {
    var b = makeButton(136 + 24 * idx, 202, 15, 17);
    b.id = id;
    b.num = idx;
    b.images = imgs.slice(idx * 3, idx * 3 + 3);
    b.style.backgroundImage = "url(" + b.images[0].src + ")";
    b.disabled = false;
    CONSOLE.appendChild(b);
    return b;
  });
  var func = function (self) {
    CurScore = clone(EmbeddedSong[self.num]);
    document.getElementById("tempo").value = CurScore.tempo;
    var b = document.getElementById("loop");
    if (CurScore.loop) b.set(); else b.reset();
    var s = document.getElementById("scroll");
    s.max = CurScore.end - 5;
    s.value = 0;
    CurPos = 0;
    CurSong = self;
  };
  b[0].addEventListener("click", makeExclusiveFunction(b, 0, func));
  b[1].addEventListener("click", makeExclusiveFunction(b, 1, func));
  b[2].addEventListener("click", makeExclusiveFunction(b, 2, func));

  // Prepare Eraser (Warning: Depends on the Song button images)
  b = makeButton(40, 202, 15, 17);
  b.id = 'eraser';
  b.images = [imgs[9], imgs[10], imgs[11]]; // In the Song button images
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  eraserTimer = new easyTimer(200, function (self) {
    // If current is not end mark, just return;
    if (CurChar != 16) {
      self.switch = false;
      return;
    }
    self.currentFrame = (self.currentFrame == 0) ? 1 : 0;
  });
  eraserTimer.currentFrame = 0;
  b.addEventListener("click", function() {
    eraserTimer.switch = true;
    CurChar = 16;
    SOUNDS[17].play(8);
    drawEraserIcon();
    clearSongButtons();
    this.style.backgroundImage = "url(" + this.images[1].src + ")";
    SCREEN.style.cursor = 'url(' + this.images[2].src + ')' + ' 0 0, auto';
  });
  CONSOLE.appendChild(b);

  // Prepare tempo range
  // (116, 172) width 40px, height 8px
  var r = document.createElement('input');
  r.id = 'tempo';
  r.type = 'range';
  r.value = 525;
  r.max = 1000;
  r.min = 50;
  r.step = 1;
  r.style['-webkit-appearance']='none';
  r.style['border-radius'] = '0px';
  r.style['background-color'] = 'rgba(0, 0, 0, 0.0)';
  r.style['box-shadow'] = 'inset 0 0 0 #000';
  r.style['vertical-align'] = 'middle';
  r.style.position = 'absolute';
  r.style.margin = 0;
  r.originalX = 116;
  r.originalY = 172;
  r.originalW = 40;
  r.originalH = 8;
  moveDOM(r, r.originalX, r.originalY);
  resizeDOM(r, r.originalW, r.originalH);
  r.addEventListener("input", function(e) {
    CurScore.tempo = parseInt(this.value);
  });
  CONSOLE.appendChild(r);

  var t = sliceImage(thumbimg, 5, 8)[0];
  r.image = t;
  // It's very hard to set values to a pseudo element with JS.
  // http://pankajparashar.com/posts/modify-pseudo-elements-css/
  s.sheet.insertRule('#tempo::-webkit-slider-thumb {' +
    "-webkit-appearance: none !important;" +
    "background-image: url('" + t.src + "');" +
    "background-repeat: no-repeat;" +
    "background-size: 100% 100%;" +
    "border: 0px;" +
    "width: " + 5 * MAGNIFY + "px;" +
    "height:" + 8 * MAGNIFY + 'px;}', 0
  );
  s.sheet.insertRule('#tempo:focus {outline: none !important;}', 0);

  // Prepare range's side buttons for inc/decrements
  var b = makeButton(184, 158, 7, 9);
  b.id = 'toLeft';
  b.addEventListener("click", function (e) {
    var r = document.getElementById('scroll');
    if (r.value > 0) {
      CurPos = --r.value;
    }
  });
  CONSOLE.appendChild(b);

  var b = makeButton(241, 158, 7, 9);
  b.id = 'toRight';
  b.addEventListener("click", function (e) {
    var r = document.getElementById('scroll');
    if (r.value < CurMaxBars - 6) {
      CurPos = ++r.value;
    }
  });
  CONSOLE.appendChild(b);

  // Prepare CLEAR button (200, 176)
  var b = makeButton(200, 176, 34, 16);
  b.id = 'clear';
  b.images = sliceImage(clearimg, 34, 16);
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  b.addEventListener("click", clearListener);
  CONSOLE.appendChild(b);
  s.sheet.insertRule('#clear:focus {outline: none !important;}', 0);

  // Prepare current empty score
  initScore();

  // Initializing Screen
  CurPos = 0;
  CurChar = 0;
  drawCurChar(SOUNDS[CurChar].image);
  changeCursor(CurChar);
  drawScore(CurPos, CurScore['notes'], 0);

  // Make bomb images from the bomb sheet
  BOMBS = sliceImage(bombimg, 14, 18);

  // Make Mario images
  Mario = new MarioClass();
  Mario.images = sliceImage(marioimg, 16, 22);

  // Make Semitone images
  Semitones = sliceImage(semitoneimg, 5, 12);

  // Load Sound Files
  Promise.all(SOUNDS.map(function (s) {return s.load()})).then(function (all) {
    all.map(function (buffer, i) {
      SOUNDS[i].buffer = buffer;
    });

    CONSOLE.removeChild(document.getElementById("spinner"));

    if (Object.keys(OPTS).length == 0) return;

    if (OPTS['url'] != undefined) {
      fullInitScore();
      var url = OPTS['url'];
      new Promise(function (resolve, reject) {
        var req = new XMLHttpRequest();
        req.open('GET', url);
        req.onload = function() {
          if (req.status == 200) {
            resolve(req.response);
          } else {
            reject(Error(req.statusText));
          }
        };

        req.onerror = function() {
          reject(Error("Network Error"));
        };

        req.send();
      }).then(function(response) {
        var msq = false;
        if (url.slice(-3) == "msq")
          addMSQ(response);
        else
          addJSON(response);

        closing();

        autoPlayIfDemanded(OPTS);

      }).catch(function (err) {
        alert("Downloading File: " + url + " failed :" + err);
        console.error("Downloading File: " + url + " failed :" + err.stack);
      })
    } else if (OPTS.S != undefined || OPTS.SCORE != undefined) {
      var score = OPTS.SCORE || OPTS.S;
      var tempo = OPTS.TEMPO || OPTS.T;
      var loop  = (OPTS.LOOP  || OPTS.L);
      var end   = OPTS.END   || OPTS.E;
      var beats = (OPTS.TIME44 || OPTS.B);

      if (tempo == undefined || loop == undefined || end == undefined ||
          beats == undefined) {
        throw new Error("Not enough parameters");
      }

      loop  = loop.toUpperCase();
      beats = beats.toUpperCase();

      var text = "SCORE=" + score + "\n" +
                 "TEMPO=" + tempo + "\n" +
                 "LOOP=" + ((loop == "T" || loop == "TRUE") ? "TRUE" : "FALSE") + "\n" +
                 "END=" + end + "\n" +
                 "TIME44=" + ((beats == "T" || beats == "TRUE") ? "TRUE" : "FALSE");
      fullInitScore();
      addMSQ(text);
      closing();

      autoPlayIfDemanded(OPTS);
    }
  }).catch(function (err) {
    alert("Invalid GET parameter :" + err);
    console.error("Invalid GET parameter :" + err.stack);
  });

  document.addEventListener('keydown',function(e) {
    switch (e.keyCode) {
      case 32: // space -> play/stop or restart with shift
        var playBtn = document.getElementById('play');
        if (playBtn.disabled == false || e.shiftKey) {
          playListener.call(playBtn,e);
        } else {
          stopListener.call(document.getElementById('stop'),e);
        }
        e.preventDefault();
        break;

      case 37: // left -> scroll left
        var r = document.getElementById('scroll');
        if (r.value > 0) CurPos = --r.value;
        e.preventDefault();
        break;

      case 39: // right -> scroll right
        var r = document.getElementById('scroll');
        if (r.value < CurMaxBars - 6) CurPos = ++r.value;
        e.preventDefault();
        break;
    }
  });

  requestAnimFrame(doAnimation);

  var b = document.getElementById("magnify");
  b.addEventListener("change", selectListener);
}

function autoPlayIfDemanded(opts) {
  var auto = opts['a'] || opts['auto'];
  if (auto != undefined) {
    auto = auto.toUpperCase();
    if (auto == "T" || auto == "TRUE")
      document.getElementById("play").dispatchEvent(new Event("click"));
  }
}
// Clear Button Listener
function clearListener(e) {
  this.style.backgroundImage = "url(" + this.images[1].src + ")";
  SOUNDS[19].play(8);
  var self = this;
  function makePromise(num) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        self.style.backgroundImage = "url(" + self.images[num].src + ")";
        resolve()
      }, 150);
    });
  }

  makePromise(2).then(function () {
    return makePromise(1);
  }).then(function () {
    return makePromise(0);
  }).then(function () {
    initScore();
    CurPos = 0;
  });

  clearSongButtons();
}

// Play Button Listener
function playListener(e) {
  this.style.backgroundImage = "url(" + this.images[1].src + ")";
  SOUNDS[17].play(8);
  var b = document.getElementById("stop");
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  b.disabled = false;
  this.disabled = true; // Would be unlocked by stop button

  ["toLeft", "toRight", "scroll", "clear", "frog", "beak", "1up"].
    map(function (id) {document.getElementById(id).disabled = true;});

  GameStatus = 1; // Mario Entering the stage
  CurPos = 0;     // doAnimation will draw POS 0 and stop
  Mario.init();
  requestAnimFrame(doMarioEnter);
}

// Stop Button Listener
function stopListener(e) {
  this.style.backgroundImage = "url(" + this.images[1].src + ")";
  // Sound ON: click , OFF: called by doMarioPlay
  if (e != undefined) SOUNDS[17].play(8);
  var b = document.getElementById("play");
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  //b.disabled = false; // Do after Mario left the stage
  this.disabled = true; // Would be unlocked by play button

  GameStatus = 3; // Mario leaves from the stage
  Mario.init4leaving();
  if (AnimeID != 0) cancelAnimationFrame(AnimeID);
  requestAnimFrame(doMarioLeave);
}

// Let Mario run on the stage
function doMarioEnter(timeStamp) {
  bombTimer.checkAndFire(timeStamp);
  drawScore(0, CurScore.notes, 0);
  Mario.enter(timeStamp);

  if (Mario.x < 40) {
    AnimeID = requestAnimFrame(doMarioEnter);
  } else {
    Mario.init4playing(timeStamp);
    GameStatus = 2;
    AnimeID = requestAnimFrame(doMarioPlay);
  }
}

// Let Mario play the music!
function doMarioPlay(timeStamp) {
  bombTimer.checkAndFire(timeStamp);
  Mario.play(timeStamp);
  if (GameStatus == 2) {
    if (Mario.pos - 2 != CurScore.end - 1) {
      AnimeID = requestAnimFrame(doMarioPlay);
    } else if (CurScore.loop) {
      CurPos = 0;
      Mario.pos = 1;
      Mario.x = 40;
      Mario.init4playing(timeStamp);
      AnimeID = requestAnimFrame(doMarioPlay);
    } else {
      // Calls stopListener without a event arg
      stopListener.call(document.getElementById('stop'));
    }
  }
}

// Let Mario leave from the stage
function doMarioLeave(timeStamp) {
  bombTimer.checkAndFire(timeStamp);
  drawScore(CurPos, CurScore.notes, Mario.scroll);
  Mario.leave(timeStamp);

  if (Mario.x < 247) {
    requestAnimFrame(doMarioLeave);
  } else {
    GameStatus = 0;

    ["toLeft", "toRight", "scroll", "play", "clear", "frog", "beak", "1up"].
      map(function (id) {
        document.getElementById(id).disabled = false;
      });

    requestAnimFrame(doAnimation);
  }
}

// Clear Song Buttons
function clearSongButtons() {
  ['frog','beak','1up'].map(function (id, idx) {
    var b = document.getElementById(id);
    b.disabled = false;
    b.style.backgroundImage = "url(" + b.images[0].src + ")";
  });
  CurSong = undefined;
}

// Clear Eraser Button
function clearEraserButton() {
  var b = document.getElementById('eraser');
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  eraserTimer.switch = false;
}

// Full Initialize Score
// - Just for file loading...
function fullInitScore() {
  CurScore.notes = [];
  CurMaxBars = 0;
  CurScore.beats = 4;
  // Loop button itself has a state, so keep current value;
  // CurScore.loop = false;
  CurScore.end = 0;
  CurScore.tempo = 0;
}

// Initialize Score
function initScore() {
  var tmpa = [];
  for (var i = 0; i < DEFAULTMAXBARS; i++) tmpa[i] = [];
  CurScore.notes = tmpa;
  CurMaxBars = DEFAULTMAXBARS;
  var s = document.getElementById("scroll");
  s.max = DEFAULTMAXBARS - 6;
  s.value = 0;
  CurScore.loop = false;
  document.getElementById("loop").reset();
  CurScore.end = DEFAULTMAXBARS - 1;
  CurScore.tempo = DEFAULTTEMPO;
  document.getElementById("tempo").value = DEFAULTTEMPO;
  CurScore.beats = 4;
  var e = new Event("click");
  e.soundOff = true;
  document.getElementById("4beats").dispatchEvent(e);
}

// Easiest and Fastest way to clone
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// sliceImage(img, width, height)
//   img: Image of the sprite sheet
//   width: width of the Character
//   height: height of the Charactter
function sliceImage(img, width, height) {
  var result = [];
  var imgw = img.width * MAGNIFY;
  var imgh = img.height * MAGNIFY;
  var num = Math.floor(img.width / width);
  var all = num * Math.floor(img.height / height);
  var charw = width * MAGNIFY;
  var charh = height * MAGNIFY;

  for (var i = 0; i < all; i++) {
    var tmpcan = document.createElement("canvas");
    tmpcan.width  = charw;
    tmpcan.height = charh;
    var tmpctx = tmpcan.getContext('2d');
    tmpctx.imageSmoothingEnabled = false;
    tmpctx.drawImage(img,
      (i % num) * width, Math.floor(i / num) * height,
      width, height, 0, 0, charw, charh);
    var charimg = new Image();
    charimg.src = tmpcan.toDataURL();
    result[i] = charimg;
  }
  return result;
}

// Download Score as JSON
//   http://jsfiddle.net/koldev/cW7W5/
function download() {
  var link = document.createElement("a");
  link.download = 'MSQ_Data.json';
  var json = JSON.stringify(CurScore);
  var blob = new Blob([json], {type: "octet/stream"});
  var url = window.URL.createObjectURL(blob);
  link.href = url;
  link.click();
}

EmbeddedSong = [];
EmbeddedSong[0] = {"notes":[[1026,2313],[1026,2313],[],[1026,2313],
  [],[1028,2315],[1026,2313],[],[1024,2311],[],[],[],[517,3591,265],
  [],[],[],[2818,2820,267],[],[3072,3595],[3072,2818,3595],
  [2817,2820,267],[],[3072,3592],[3072,2817,3591],[2816,2819,267],[],
  [3072,3591],[2816,1287,3595],[2817,1286,1288],[262,1288,1290],
  [1286,3591,1288],[1285,1287,266],[2,3595,3084],[],[256],[257,3595],
  [4,3593,3084],[],[256],[257,7,3593],[6,3592,3084],[4],[256,3592],
  [257,4,3590],[3084],[256],[],[257,6,3591],[7,3084],[3591],
  [256,4,3592],[257],[4,3593,3084],[],[0,3594],[257],[2,3591],[1031],
  [256,1030],[3,1029,3592],[1028],[1027,262],[1026],[1025,263],
  [1026,266,3595],[7],[2050,4],[7,266,3595],[1028,3593,266],[7],
  [2050,4],[5,1031,3593],[1030,3592,266],[1028,6,2568],[4],
  [1,1028,3590],[264],[2049,2,260],[3,260],[261,1030],[1031,266],
  [3584,2,7],[1028],[1,5,7],[1025,3591],[1026],[1027],[],[1028],
  [258,3588],[],[260,3595],[261,3595],[],[261,267]],
  "beats":4,"loop":false,"end":96,"tempo":"350"};

EmbeddedSong[1] = {"notes":[[772,779],[768],[770,779],[768],[772,775],
  [768],[770,775],[768],[772,774],[769],[772,774],[769],[768,770,775],
  [],[],[],[769,774,776],[772],[769,774,776],[772],[770,775,777],
  [772],[770,775,777],[772],[771,773,778],[775],[771,778],[773],
  [772,777,779],[],[],[],[775,777],[768],[775,777],[768],[776,778],
  [768],[776,778],[768],[777,779],[768],[777,779],[768],[778,780],
  [],[],[],[775],[768,772],[775],[768,772],[776],[768,772],[776],
  [768,772],[777],[768,772],[777],[768,772],[771,773,778],[],[],[],
  [777,779],[779],[777,779],[779],[775,777],[777],[775,777],[777],
  [774,776],[776],[774,776],[776],[768,775,777],[],[],[],[774,776],
  [776],[774,776],[773],[772,777],[775],[772,777],[],[771,775,778],
  [],[771,775,778],[],[772,777,779]],
  "beats":4,"loop":true,"end":96,"tempo":"165"};

EmbeddedSong[2] = {"notes":[[266,3595],[3072,2,7],[3591,3081],[3072,2,7],
  [2305,3590,266],[2305,2,7],[1,2307,3594],[3078],[266,3595],[3072,2,7],
  [3591,3081],[3072,2,7],[2305,3590,266],[2305,3,7],[1,2307,3594],[],
  [1028,3079,3595],[3072,2,7],[1028,3078,3591],[1026,261,7],[1024,267],
  [],[1543],[],[1281,3594],[1,6],[1281,3590],[1282,6],[1283],[],[1798],
  [],[1027,3079,3594],[3072,1,6],[1027,3590,3082],[1025,261,6],[1030,267],
  [],[2055,2059],[],[1280,1285,3595],[2,7],[1280,1285,3591],[1281,2,1286],
  [1282,1287,266],[2571],[],[],[1287,779],[775],[1287,777],[772,1287],
  [1284,775,264],[2306,3077],[2306,264],[2308,3077],[1286,2826],[2822],
  [1286,2824],[2819,1286],[1284,2822,264],[2305,3077],[2305,264],
  [2307,3077],[1285,3335,264],[3331],[1285,3335],[3329,1285],
  [1283,1029,264],[],[519],[],[2304,1282,1028],[2304,1282,1028],
  [2304,1282,1028],[2305,1283,1029],[2306,1284,1030],[],[2304,1282,1028]],
  "beats":4,"loop":true,"end":80,"tempo":"260"};
