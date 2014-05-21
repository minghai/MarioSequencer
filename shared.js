// GLOBAL VARIABLES
//   Constants: Full capital letters
//   Variables: CamelCase
AC = new webkitAudioContext();
SEMITONERATIO = Math.pow(2, 1/12);
MAGNIFY = 3;
CHARSIZE = 16 * MAGNIFY;
HALFCHARSIZE = Math.floor(CHARSIZE / 2);
MouseX = 0;
MouseY = 0;
CONSOLE = document.getElementById("console");
OFFSETLEFT = CONSOLE.offsetLeft;
OFFSETTOP  = CONSOLE.offsetTop;
CurChar = 0;
CurPos = 0;
CurScore = {};
DEFAULTMAXBARS = 24 * 4 + 1; // 24 bars by default
CurMaxBars = DEFAULTMAXBARS;
Mario = null; // Mamma Mia!
AnimeID = 0; // ID for cancel animation

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
  var semitone = this.diff[scale];
  if (delay == undefined) delay = 0;
  source.buffer = this.buffer;
  source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
  source.connect(AC.destination);
  source.start(delay);
};

// Play a chord
//   In fact, can be a single note.
//   Purpose is cancel the sounds in previous bar
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
    var semitone = this.diff[noteList[i]];
    source.buffer = this.buffer;
    source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
    source.connect(AC.destination);
    source.start(delay);
    this.prevChord.push(source);
  }
}

SoundEntity.prototype.load = function() {
  // Load buffer asynchronously
  var request = new XMLHttpRequest();
  request.open("GET", this.path, true);
  request.responseType = "arraybuffer";

  var loader = this;

  request.onload = function() {
    // Asynchronously decode the audio file data in request.response
    AC.decodeAudioData(
      request.response,
      function(buffer) {
        if (!buffer) {
          alert('error decoding file data: ' + url);
          return;
        }
        loader.buffer = buffer;
      },
      function(error) {
        console.error('decodeAudioData error', error);
      }
    );
  }

  request.onerror = function() {
    alert('BufferLoader: XHR error');
  }

  request.send();
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
  this.offset = -16;
  this.start = 0;
  this.state = 0;
  this.pos = 0;
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
};

/*
 * You can assume that animation is always 60FPS (in theory :-)
 * So 1[frame] is 1 / 60 = 0.1666...[ms]
 * Mario runs 32[dots] per 1[beat]
 * [beat/sec] = TEMPO[bpm] / 60[sec]
 * [sec/beat] = 60[sec] / TEMPO[bpm]
 * So Mario runs 1[dot] in 60 / TEMPO / 32 [sec]
 * If [sec/1beat] / 32 < [sec/1frame] then Mario warps. (NOT successive)
 * In that case, you have to predicate the postion.
 * (And even the samples, it can't draw every single increments...)
 *
 * MAX BPM is when t[sec/1beat] = 2/60, then TEMPO = 1800
 * Acctually, you can set TEMPO<3600, but it sounds just like noise over 2000
 * Real Mario sequencer tempo limit seems 700.
 * So this is good enough.
 * (Famous fastest song, Hatsune Miku no Shoshitsu is 245 (* 4 < 1000))
 *
 * At first, Mario runs to the center of the stage.
 * Then, Mario will be fixed at the position.
 * Instead, the score is scrolling from then.
 * When the last bar appears, scroll stops and Mario runs again.
 *
 * Mario should jump from one bar before the next bar which has the note(s)
 *
 */
MarioClass.prototype.init4playing = function(timeStamp) {
  this.start = timeStamp;
  this.offset = this.x;
  this.scroll = 0;
  this.pos = 1; // logical bar position at first untill scroll starts
  this.state == 1;
  this.spb = 60  * 1000 / CurScore.tempo; // [ms/beat]
  this.nextNoteOn = timeStamp + this.spb;
};

MarioClass.prototype.play = function(timeStamp) {
  function scheduleAndPlay(notes, time) {
    if (time < 0) time = 0;
    if (notes == undefined || notes.length == 0) return;
    var dic = {};
    for (var i = 0; i < notes.length; i++) {
      var note = notes[i];
      var num = note >> 8;
      var scale = note & 0xFF;
      if  (!dic[num]) dic[num] = [scale];
      else dic[num].push(scale);
    }
    for (var i in dic) {
      SOUNDS[i].playChord(dic[i], time / 1000); // [ms] -> [s]
    }
  }
  var diff = timeStamp - this.start; // both stamp and start are [ms]
  var left = this.nextNoteOn - timeStamp;

  // ToDo: set status jump if needed
  this.state = (Math.floor(diff / 100) % 2 == 0) ? 1 : 0;
  var scroll = document.getElementById('scroll');

  if (Mario.x < 120) { // Mario still has to run
    // If logical left time to next note is smaller than t [sec/1frame]
    if (left <= 1000 / 59) { // t can be longer than 1000/60 but seems like not 1000/59
      this.pos++;
      this.x = (16 + 32 * this.pos - 8);
      this.nextNoteOn = this.start + this.pos * 60 * 1000 / CurScore.tempo;
      scheduleAndPlay(CurScore.notes[this.pos - 2], left);
    } else {
      // 32 dots in t[sec/1beat]
      this.x = diff * (32 * CurScore.tempo / 60000) + this.offset;
      if (this.x >= 120) {
        this.scroll = this.x - 120;
        this.x = 120;
      }
    }
  } else if (CurPos <= CurScore.end - 6) { // Scroll 
    this.x = 120;
    if (left <= 1000/59) {
      this.pos++;
      this.scroll = 16;
      this.nextNoteOn = this.start + this.pos * 60 * 1000 / CurScore.tempo;
      //  Schedule Play!
      scheduleAndPlay(CurScore.notes[this.pos - 2], left);
    } else {
      var s = diff * (32 * CurScore.tempo / 60000) - (120 - 40);
      this.scroll = Math.round(s % 32);
      CurPos = Math.floor(s / 32);
      scroll.value = CurPos;
    }
  } else {
    this.scroll = 0;
    // If logical left time to next note is smaller than t [sec/1frame]
    if (left <= 1000 / 59) { // t can be longer than 1000/60 but seems like not 1000/59
      this.pos++;
      this.x = (16 + 32 * (this.pos - CurPos) - 8);
      this.nextNoteOn = this.start + this.pos * 60 * 1000 / CurScore.tempo;
      scheduleAndPlay(CurScore.notes[this.pos - 2], left);
    } else {
      // 32 dots in t[sec/1beat]
      this.x = diff * (32 * CurScore.tempo / 60000) - (CurPos + 1) * 32 + 72;
    }
  }
  drawScore(CurPos, CurScore.notes, this.scroll);
  this.draw();
};

MarioClass.prototype.draw = function() {
  L2C.drawImage(this.images[this.state],
    this.x * MAGNIFY, (41 - 22) * MAGNIFY);
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
}

easyTimer.prototype.checkAndFire = function(time) {
  if (time - this.lastTime > this.time) {
    this.func(this);
    this.lastTime = time;
  }
};

// Asynchronous load of sounds
SOUNDS = [];
for (i = 1; i < 19; i++) {
  var tmp = '0';
  tmp += i.toString();
  var file = "wav/sound" + tmp.substr(-2) + ".wav";
  var e = new SoundEntity(file);
  e.load();
  SOUNDS[i-1] = e;
}

// Prepare Mat
MAT = document.getElementById("layer1");
L1C = MAT.getContext('2d');
L1C.imageSmoothingEnabled = false;
var mi = new Image();
mi.src = "image/mat.png";
mi.addEventListener("load", function(e) {
  L1C.drawImage(mi, 0, 0, mi.width * MAGNIFY, mi.height * MAGNIFY);
});

// Prepare Characters
char_sheet = new Image();
char_sheet.src = "image/character_sheet.png";

// Prepare the Bomb!
BOMBS = []
bombimg = new Image();
bombimg.src = "image/bomb.png";
bombTimer = new easyTimer(150, drawBomb);
bombTimer.currentFrame = 0;

function drawBomb(mySelf) {
  var x = 9 * MAGNIFY;
  var y = 202 * MAGNIFY;
  L1C.drawImage(BOMBS[mySelf.currentFrame], x, y);
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

// Prepare tempo range slider thumb image
thumbimg = new Image();
thumbimg.src = "image/slider_thumb.png";

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
  L2C.rect(8 * MAGNIFY, 0, (247 - 8 + 1) * MAGNIFY, 152 * MAGNIFY);
  L2C.clip();

  // If mouse cursor on or under the C, draw horizontal line
  var realX = MouseX - OFFSETLEFT;
  var realY = MouseY - OFFSETTOP;
  var g = toGrid(realX, realY);
  // Edit mode only, no scroll
  if (GameStatus == 0 && g !== false && g[1] >= 11) {
      drawHorizontalBar(g[0], 0);
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
  var dashList = [MAGNIFY, MAGNIFY];
  // orange = 2, 1, 0, 3, 2, 1, 0, 3, .....
  var orange = 3 - ((pos + 1) % 4);
  var i = (pos < 2) ? (2 - pos) : 0;
  for (; i < 9; i++) {
    var x = (16 + 32 * i - scroll) * MAGNIFY;
    var barnum = pos + i - 2;

    if (barnum == CurScore.end) {
      var img = CurScore.loop ? RepeatMarks[1] : EndMark;
      L2C.drawImage(img, x - 7 * MAGNIFY, 56 * MAGNIFY);
    }

    L2C.beginPath();
    L2C.setLineDash(dashList);
    L2C.lineWidth = MAGNIFY;
    if (i % 4 == orange) {
      if (GameStatus == 0) drawBarNumber(i, barnum / 4 + 1);
      L2C.strokeStyle = '#F88000';
    } else {
      L2C.strokeStyle = '#A0C0B0';
    }
    L2C.strokeStyle = (i % 4 == orange) ? '#F89000' : '#A0C0B0';
    L2C.moveTo(x,  41 * MAGNIFY);
    L2C.lineTo(x, 148 * MAGNIFY);
    L2C.stroke();

    var b = notes[barnum];
    if (b == undefined) continue;
    var hflag = false;
    for (var j = 0; j < b.length; j++) {
      var sndnum = b[j] >> 8;
      var scale  = b[j] & 0x0F;
      if (!hflag && (scale >= 11)) {
        hflag = true;
        drawHorizontalBar(i, scroll);
      }
      L2C.drawImage(SOUNDS[sndnum].image, x - 8 * MAGNIFY,
        (40 + scale * 8) * MAGNIFY);
    }
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

function toGrid(realX, realY) {
  var gridLeft   = (8   + 4) * MAGNIFY;
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
SCREEN.width  = 256 * MAGNIFY;
SCREEN.height = 152 * MAGNIFY;
L2C = SCREEN.getContext('2d');
L2C.imageSmoothingEnabled = false;
L2C.lastMouseX = 0;
L2C.lastMouseY = 0;
// ClipRect (8, 41) to (247, 148)
SCREEN.addEventListener("click", function(e) {
  if (GameStatus != 0) return;

  var realX = e.clientX - OFFSETLEFT;
  var realY = e.clientY - OFFSETTOP;

  var g = toGrid(realX, realY);
  if (g === false) return;
  var gridX = g[0];
  var gridY = g[1];

  // Map logical x to real bar number
  var b = CurPos + gridX - 2;

  if (b >= CurScore.end) return;

  // Handle semitone
  if (e.shiftKey) gridY |= 0x80;
  if (e.ctrlKey ) gridY |= 0x40;
  var note = (CurChar << 8) | gridY;
  var notes = CurScore['notes'][b];
  SOUNDS[CurChar].play(gridY);
  if (notes.indexOf(note) != -1) return;
  notes.push(note);
  CurScore['notes'][b] = notes;
});

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
  fullInitScore();
  // function to read given file objets.
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
  };
  function addMSQ(fileReader) {
    lines = fileReader.result.split(/\r\n|\r|\n/);
    keyword = ["SCORE", "TEMPO", "LOOP", "END", "TIME44"];
    var values = {};
    lines.forEach(function(line, i) {
      if (line === "") return;
      var kv = line.split("=");
      var k = kv[0];
      var v = kv[1];
      if (i < keyword.length && k !== keyword[i]) {
        throw new Error(fileReader.name + " :" + "line " + i + " must start with '" + keyword[i] + "'");
      }
      this[k] = v;
    }, values);
    
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

    CurScore.end   += parseInt(values.END) - 1;
    CurScore.tempo = values.TEMPO;
    document.getElementById('tempo').value = values.TEMPO;
    CurScore.beats = (values.TIME44 == "TRUE") ? 4 : 3;
    var lf = (values.LOOP == "TRUE") ? true : false;
    if (CurScore.loop != lf) {
      document.getElementById("loop").dispatchEvent(
          new Event("click"));
    }
  };
  // FileList to Array for Mapping
  var files = [].slice.call(e.dataTransfer.files);
  files.map(readFile).reduce(function(chain, fp) {
    return chain.then(function() {
      return fp;
    }).then(function(fileReader) {
      addMSQ(fileReader);
    }).catch(function(err) {
      alert("Loading MSQ failed: " + err.message);
    }).then(function() {
      var r = document.getElementById('scroll');
      CurMaxBars = CurScore.end + 1;
      r.max = CurMaxBars - 6;
      r.value = 0;
      CurPos = 0;
    });
  }, Promise.resolve());

  return false;
});


function doAnimation(time) {
  // Bomb
  bombTimer.checkAndFire(time);

  drawScore(CurPos, CurScore['notes'], 0);

  if (GameStatus != 0) return;

  requestAnimFrame(doAnimation);
}

function makeButton(x, y, w, h) {
  var b = document.createElement("button");
  b.className = "game";
  b.style.position = 'absolute';
  b.style.left =   x * MAGNIFY + "px";
  b.style.top =    y * MAGNIFY + "px";
  b.style.width =  w * MAGNIFY + "px";
  b.style.height = h * MAGNIFY + "px";
  b.style['z-index'] = 3;
  b.style.background = "rgba(0,0,0,0)";
  return b;
}

// INIT routine
window.addEventListener("load", onload);
function onload() {
  // Make buttons for changing a kind of notes.
  //   1st mario:   x=24, y=8, width=13, height=14
  //   2nd Kinopio: X=38, y=8, width=13, height=14
  //   and so on...
  var bimgs = sliceImage(char_sheet, 16, 16);
  delete char_sheet;
  for (var i = 0; i < 15; i++) {
    var b = makeButton((24 + 14 * i), 8, 13, 14);
    b.num = i;
    b.se = SOUNDS[i];
    b.se.image = bimgs[i];
    b.addEventListener("click", function() {
      this.se.play(8); // Note F
      CurChar = this.num;
      changeCursor(this.num);
      drawCurChar(this.se.image);
    });
    CONSOLE.appendChild(b);
  }

  // For inserting pseudo elements' styles
  var s = document.createElement("style");
  document.head.appendChild(s);

  // Prepare Play Button (55, 168)
  var b = makeButton(55, 168, 12, 15);
  b.id = 'play';
  b.images = sliceImage(playbtnimg, 12, 15);
  delete playbtnimg;
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
  delete stopbtnimg;
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
  s.sheet.insertRule('#loop:focus {outline: none !important;}', 0);
  CONSOLE.appendChild(b);

  // Prepare Repeat (global!)
  RepeatMarks = sliceImage(repeatimg, 13, 62);
  delete repeatimg;
  EndMark = RepeatMarks[2];

  // Prepare current empty score
  initScore();

  // Make number images from the number sheet
  NUMBERS = sliceImage(numimg, 5, 7);
  delete numimg;

  // Initializing Screen
  CurPos = 0;
  CurChar = 0;
  drawCurChar(SOUNDS[CurChar].image);
  changeCursor(CurChar);
  drawScore(CurPos, CurScore['notes'], 0);

  // Make bomb images from the bomb sheet
  BOMBS = sliceImage(bombimg, 14, 18);
  delete bombimg;

  // Make Mario images
  Mario = new MarioClass();
  Mario.images = sliceImage(marioimg, 16, 22);
  delete marioimg;

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
  r.style.left = 116 * MAGNIFY + 'px';
  r.style.top  = 172 * MAGNIFY + 'px';
  r.style.width = 40 * MAGNIFY + 'px';
  r.style.height = 8 * MAGNIFY + 'px';
  r.addEventListener("input", function(e) {
    CurScore.tempo = parseInt(this.value);
  });
  CONSOLE.appendChild(r);

  var t = sliceImage(thumbimg, 5, 8)[0];
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
  r.style.left = 191 * MAGNIFY + 'px';
  r.style.top  = 159 * MAGNIFY + 'px';
  r.style.width = 50 * MAGNIFY + 'px';
  r.style.height = 7 * MAGNIFY + 'px';
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
	  "height:" + 7 * MAGNIFY + 'px;}', 0
  );
  s.sheet.insertRule('#scroll:focus {outline: none !important;}', 0);

  // Prepare range's side buttons for inc/decrements
  var b = makeButton(184, 158, 7, 9);
  b.id = 'toLeft';
  b.addEventListener("click", function (e) {
    var r = document.getElementById('scroll');
    if (r.value > 0) {
      r.value--;
      CurPos--;
    }
  });
  CONSOLE.appendChild(b);

  var b = makeButton(241, 158, 7, 9);
  b.id = 'toRight';
  b.addEventListener("click", function (e) {
    var r = document.getElementById('scroll');
    if (r.value < CurMaxBars - 6) {
      r.value++;
      CurPos++;
    }
  });
  CONSOLE.appendChild(b);

  // Start Animation
  requestAnimFrame(doAnimation);
}

// Play Button Listener
function playListener(e) {
  this.style.backgroundImage = "url(" + this.images[1].src + ")";
  SOUNDS[17].play(8);
  var b = document.getElementById("stop");
  b.style.backgroundImage = "url(" + b.images[0].src + ")";
  b.disabled = false;
  this.disabled = true; // Would be unlocked by stop button

  document.getElementById("toLeft").disabled  = true;
  document.getElementById("toRight").disabled = true;
  document.getElementById("scroll").disabled  = true;

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
    if (Mario.pos - 2 != CurScore.end) {
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
  drawScore(CurPos, CurScore.notes, Mario.scroll); // ToDo: Decide offset!
  Mario.leave(timeStamp);

  if (Mario.x < 247) {
    requestAnimFrame(doMarioLeave);
  } else {
    GameStatus = 0;
    document.getElementById("toLeft").disabled  = false;
    document.getElementById("toRight").disabled = false;
    document.getElementById("scroll").disabled  = false;
    document.getElementById("play").disabled    = false;

    requestAnimFrame(doAnimation);
  }
}

// Full Initialize Score
// - Just for file loading...
function fullInitScore() {
  CurScore.notes = [];
  CurMaxBars = 0;
  CurScore.beats = 4;
  CurScore.loop = false;
  CurScore.end = 0;
}

// Initialize Score
function initScore() {
  //var tmpa = [];
  //for (var i = 0; i < DEFAULTMAXBARS; i++) tmpa[i] = [];
  //CurScore.notes = tmpa;
  //CurMaxBars = DEFAULTMAXBARS;
  //CurScore.beats = 4;
  //CurScore.loop = false;
  //document.getElementById("loop").reset();
  //CurScore.end = DEFAULTMAXBARS - 1;
  CurScore = EmbeddedSong[0];
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
  var charw = width  * MAGNIFY;
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
  [258,3588],[],[260,3595],[261,3595],[],[261,267],[],[]],
  "beats":4,"loop":false,"end":96,"tempo":"370"};

EmbeddedSong[1] = {"notes":[[772,779],[768],[770,779],[768],[772,775],
  [768],[770,775],[768],[772,774],[769],[772,774],[769],[768,770,775],
  [],[],[],[769,774,776],[772],[769,774,776],[772],[770,775,777],
  [772],[770,775,777],[772],[771,773,778],[775],[771,778],[773],
  [771,777,779],[],[],[],[775,777],[768],[775,777],[768],[776,778],
  [768],[776,778],[768],[777,779],[768],[777,779],[768],[778,780],
  [],[],[],[775],[768,772],[775],[768,772],[776],[768,772],[776],
  [768,772],[777],[768,772],[777],[768,772],[771,773,778],[],[],[],
  [777,779],[779],[777,779],[779],[775,777],[777],[775,777],[777],
  [774,776],[776],[774,776],[776],[768,775,777],[],[],[],[774,776],
  [776],[774,776],[773],[772,777],[775],[772,777],[],[771,775,778],
  [],[771,775,778],[],[772,777,779],[],[],[],[]],
  "beats":4,"loop":true,"end":96,"tempo":"178"};
