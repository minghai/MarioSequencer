// GLOBAL VARIABLES
AC = new webkitAudioContext();
SEMITONERATIO = Math.pow(2, 1/12);
MAGNIFY = 3;
CHARSIZE = 16 * MAGNIFY;
HALFCHARSIZE = Math.floor(CHARSIZE / 2);
MOUSEX = 0;
MOUSEY = 0;
OFFSETLEFT = 0;
OFFSETTOP = 0;
CURRENTCHAR = 0;

// shim layer with setTimeout fallback
window.requestAnimFrame = (function(){
return  window.requestAnimationFrame       || 
  window.webkitRequestAnimationFrame || 
  window.mozRequestAnimationFrame    || 
  window.oRequestAnimationFrame      || 
  window.msRequestAnimationFrame     || 
  function( callback ){
  window.setTimeout(callback, 1000 / 60);
};
})();

// constructor
function SoundEntity(name, path) {
  this.name = name;
  this.path = path;
  this.semitone = 0;
  this.delta = 1;
  this.buffer = null;
}

// SoundEntity#play
SoundEntity.prototype.play = function(time) {
  var source = AC.createBufferSource();
  this.semitone += this.delta;
  if (Math.abs(this.semitone) == 12) this.delta *= -1;
  source.buffer = this.buffer;
  source.playbackRate.value = Math.pow(SEMITONERATIO, this.semitone);
  source.connect(AC.destination);
  source.start(time);
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

function changeCursor(num) {
  SCREEN.style.cursor = 'url(' + SOUNDS[num].canvas.toDataURL() + ')' + HALFCHARSIZE +' '+ HALFCHARSIZE + ', auto';
}

function drawCurrentChar(canvas) {
  var x = 4 * MAGNIFY;
  var y = 7 * MAGNIFY;
  L1C.clearRect(x, y, CHARSIZE, CHARSIZE);
  L1C.drawImage(canvas, x, y);
  L1C.fillRect(x, y, CHARSIZE, MAGNIFY);
  L1C.fillRect(x, y + CHARSIZE - MAGNIFY, CHARSIZE, MAGNIFY);
}

SCREEN = document.getElementById("layer2");
L2C = SCREEN.getContext('2d');
L2C.lastMouseX = 0;
L2C.lastMouseY = 0;
SCREEN.addEventListener("click", function(e) {
  console.log("x = " + e.clientX);
  console.log("y = " + e.clientY);
  console.log("sx = " + e.screenX);
  console.log("sy = " + e.screenY);
  console.log("left = " + CONSOLE.offsetLeft);
  console.log("Top  = " + CONSOLE.offsetTop);
});
SCREEN.addEventListener("mousemove", function(e) {
  MOUSEX = e.clientX;
  MOUSEY = e.clientY;
});



// ClipRect (8, 41) to (247, 148)
function doAnimation(time) {
  var x = 8 * MAGNIFY;
  var y = 41 * MAGNIFY;
  var width = (247 - 8 + 1) * MAGNIFY;
  var height = (148 - 41 + 1) * MAGNIFY;
  var realX = MOUSEX - OFFSETLEFT;
  var realY = MOUSEY - OFFSETTOP;

  // Bomb
  bombTimer.checkAndFire(time);

  requestAnimFrame(doAnimation);
}

// 1st mario:   x=24, y=8, width=13, height=14
// 2nd Kinopio: X=38, y=8, width=13, height=14

function onload() {
  CONSOLE = document.getElementById("console");
  OFFSETLEFT = CONSOLE.offsetLeft;
  OFFSETTOP  = CONSOLE.offsetTop;
  var i = 0;
  for (i = 0; i < 15; i++) {
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
    var tmpc = document.createElement("canvas");
    tmpc.width  = CHARSIZE;
    tmpc.height = CHARSIZE;
    tmpc.getContext('2d').drawImage(char_sheet,
        (i % 8) * 16, Math.floor(i / 8) * 16, 16, 16,
        0, 0, CHARSIZE, CHARSIZE);
    b.se.canvas = tmpc;
    b.addEventListener("click", function() {
      this.se.play(0);
      CURRENTCHAR = this.num;
      changeCursor(this.num);
      drawCurrentChar(this.se.canvas);
    });
    CONSOLE.appendChild(b);
  }
  CURRENTCHAR = 0;
  drawCurrentChar(SOUNDS[0].canvas);
  changeCursor(0);

  for (i = 0; i < 3; i++) {
    var tmpc = document.createElement("canvas");
    tmpc.width = 14 * MAGNIFY;
    tmpc.height = 18 * MAGNIFY;
    tmpc.getContext('2d').drawImage(bombimg,
      (i % 8) * 14, 0, 14, 18, 0, 0, 14*MAGNIFY, 18*MAGNIFY);
    BOMBS[i] = tmpc;
  }

  requestAnimFrame(doAnimation);
}

window.addEventListener("load", onload);
