// GLOBAL VARIABLES
AC = new webkitAudioContext();
SEMITONERATIO = Math.pow(2, 1/12);
MAGNIFY = 3;
CHARSIZE = 16 * MAGNIFY;
HALFCHARSIZE = Math.floor(CHARSIZE / 2);
MOUSEX = 0;
MOUSEY = 0;
CONSOLE = document.getElementById("console");
OFFSETLEFT = CONSOLE.offsetLeft;
OFFSETTOP  = CONSOLE.offsetTop;
CurChar = 0;
CurPos = 0;
CurScore = {};
CurMaxBars = 24 * 4;

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
function SoundEntity(name, path) {
  this.name = name;
  this.path = path;
  this.semitone = 0;
  this.delta = 1;
  this.buffer = null;
}

// SoundEntity#play
SoundEntity.prototype.play = function(scale) {
  var diff = [14, 12, 11, 9, 7, 6, 4, 2, 0, -1, -3, -5, -6];
  var source = AC.createBufferSource();
  var semitone = diff[scale];
  source.buffer = this.buffer;
  source.playbackRate.value = Math.pow(SEMITONERATIO, semitone);
  source.connect(AC.destination);
  source.start(0);
};

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
for (i = 1; i < 17; i++) {
  var tmp = '0';
  tmp += i.toString();
  var file = "wav/sound" + tmp.substr(-2) + ".wav";
  var e = new SoundEntity('mario', file);
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
gclef = new Image();
gclef.src = "image/G_Clef.png";

// Prepare the numbers
numimg = new Image();
numimg.src = "image/numbers.png";

// ClipRect (8, 41) to (247, 148)
function drawScore(pos, notes) {
  L2C.clearRect(0, 0, SCREEN.width, SCREEN.height);

  var realX = MOUSEX - OFFSETLEFT;
  var realY = MOUSEY - OFFSETTOP;
  var g = toGrid(realX, realY);
  if (g !== false && g[1] >= 11) {
      drawHorizontalBar(g[0]);
  }

  if (pos == 0) {
    var w = gclef.width;
    var h = gclef.height;
    L2C.drawImage(gclef,
      0, 0, w, h,
      9 * MAGNIFY, 48 * MAGNIFY, w * MAGNIFY, h * MAGNIFY);
  }

  //ORANGE #F89000
  var dashList = [MAGNIFY, MAGNIFY];
  // orange = 2, 1, 0, 3, 2, 1, 0, 3, .....
  var orange = 3 - ((pos + 1) % 4);
  var i = (pos < 2) ? (2 - pos) : 0;
  for (; i < 8; i++) {
    L2C.beginPath();
    L2C.setLineDash(dashList);
    L2C.lineWidth = MAGNIFY;
    var barnum = pos + i - 2;
    if (i % 4 == orange) {
      drawBarNumber(i, barnum / 4 + 1);
      L2C.strokeStyle = '#F88000';
    } else {
      L2C.strokeStyle = '#A0C0B0';
    }
    L2C.strokeStyle = (i % 4 == orange) ? '#F89000' : '#A0C0B0';
    var x = (16 + 32 * i) * MAGNIFY;
    L2C.moveTo(x,  41 * MAGNIFY);
    L2C.lineTo(x, 148 * MAGNIFY);
    L2C.stroke();

    var b = notes[barnum];
    var hflag = false;
    for (var j = 0; j < b.length; j++) {
      var sndnum = b[j] >> 8;
      var scale  = b[j] & 0x0F;
      if (!hflag && (scale >= 11)) {
        hflag = true;
        drawHorizontalBar(i);
      }
      L2C.drawImage(SOUNDS[sndnum].image, x - 8 * MAGNIFY,
        (40 + scale * 8) * MAGNIFY);
    }
  }
}

// X is the x of vertical bar (in grid)
function drawHorizontalBar(gridX) {
  var width = (gridX == 7) ? 20 : 24;
  width *= MAGNIFY;
  L2C.fillRect((4 + 32 * gridX) * MAGNIFY,
    (38 + 11 * 8) * MAGNIFY + HALFCHARSIZE,
    width, 2 * MAGNIFY);
}

function drawBarNumber(gridX, barnum) {
  var x = (16 + 32 * gridX) * MAGNIFY;
  var y = (40 - 7) * MAGNIFY;
  var nums = [];
  while (barnum > 0) {
    nums.push(barnum % 10);
    barnum = Math.floor(barnum / 10);
  }
  for (var i = 0; i <= nums.length; i++) {
    var n = nums.pop();
    var width = (n == 1) ? 3 : ((n == 4) ? 5 : 4);
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
SCREEN.height = 151 * MAGNIFY;
L2C = SCREEN.getContext('2d');
L2C.imageSmoothingEnabled = false;
L2C.lastMouseX = 0;
L2C.lastMouseY = 0;
// ClipRect (8, 41) to (247, 148)
SCREEN.addEventListener("click", function(e) {
  var realX = e.clientX - OFFSETLEFT;
  var realY = e.clientY - OFFSETTOP;

  var g = toGrid(realX, realY);
  if (g === false) return;
  var gridX = g[0];
  var gridY = g[1];

  // Map logical x to real bar number
  var b = CurPos + gridX - 2;

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
  MOUSEX = e.clientX;
  MOUSEY = e.clientY;
});



function doAnimation(time) {
  // Bomb
  bombTimer.checkAndFire(time);

  drawScore(CurPos, CurScore['notes']);

  requestAnimFrame(doAnimation);
}

// 1st mario:   x=24, y=8, width=13, height=14
// 2nd Kinopio: X=38, y=8, width=13, height=14

window.addEventListener("load", onload);
function onload() {

  // Make buttons for changing a kind of notes.
  var bimgs = sliceImage(char_sheet, 16, 16);
  for (var i = 0; i < 15; i++) {
    var b = document.createElement("button");
    b.num = i;
    b.className = "game";
    b.style.position = 'absolute';
    b.style.left = (24 + 14 * i) * MAGNIFY + "px";
    b.style.top = 8 * MAGNIFY + "px";
    b.style.width = 13 * MAGNIFY + "px";
    b.style.height = 14 * MAGNIFY + "px";
    b.style['z-index'] = 3;
    b.style.background = "rgba(0,0,0,0)";
    
    b.se = SOUNDS[i];
    b.se.image = bimgs[i];
    b.addEventListener("click", function() {
      this.se.play(9); // Note F
      CurChar = this.num;
      changeCursor(this.num);
      drawCurChar(this.se.image);
    });
    CONSOLE.appendChild(b);
  }

  // Prepare current empty score
  var tmpa = [];
  for (var i = 0; i < CurMaxBars; i++) tmpa[i] = [];
  CurScore['notes'] = tmpa;

  // Make number images from the number sheet
  NUMBERS = sliceImage(numimg, 5, 7);

  // Initializing Screen
  CurPos = 0;
  CurChar = 0;
  drawCurChar(SOUNDS[CurChar].image);
  changeCursor(CurChar);
  drawScore(CurPos, CurScore['notes']);

  // Make bomb images from the bomb sheet
  BOMBS = sliceImage(bombimg, 14, 18);

  // Prepare Scroll Range
  var r = document.createElement('input');
  r.id = 'scroll';
  r.type = 'range';
  r.value = 0;
  r.max = CurMaxBars - 8;
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
  var s = document.createElement("style");
  document.head.appendChild(s);
  s.sheet.addRule('#scroll::-webkit-slider-thumb',
	  "-webkit-appearance: none !important;" +
	  "border-radius: 0px;" +
	  "background-color: #A870D0;" +
	  "box-shadow:inset 0 0 0px;" +
	  "border: 0px;" +
	  "width: " + 5 * MAGNIFY + "px;" +
	  "height:" + 7 * MAGNIFY + "px;"
  );
  s.sheet.addRule('#scroll:focus', 'outline: none !important;');

  // Start Animation
  requestAnimFrame(doAnimation);
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
