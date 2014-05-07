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
CURRENTCHAR = 0;

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

// ClipRect (8, 41) to (247, 148)
function drawScore(pos, notes) {
  L2C.clearRect(0, 0, L2C.width, L2C.height);
  if (pos == 0) {
    var w = gclef.width;
    var h = gclef.height;
    L2C.drawImage(gclef,
      0, 0, w, h,
      9 * MAGNIFY, 48 * MAGNIFY, w * MAGNIFY, h * MAGNIFY);
  }

  //ORANGE #F89000
  var i = (pos < 2) ? (2 - pos) : 0;
  var dashList = [MAGNIFY, MAGNIFY];
  for (; i < 8; i++) {
    L2C.beginPath();
    L2C.setLineDash(dashList);
    L2C.lineWidth = MAGNIFY;
    L2C.strokeStyle = (i % 4 == 2) ? '#F89000' : '#A0C0B0';
    L2C.moveTo((16 + 32 * i) * MAGNIFY, 41 * MAGNIFY);
    L2C.lineTo((16 + 32 * i) * MAGNIFY, 148 * MAGNIFY);
    L2C.stroke();
  }
}


function changeCursor(num) {
  SCREEN.style.cursor = 'url(' + SOUNDS[num].image.src + ')' + HALFCHARSIZE +' '+ HALFCHARSIZE + ', auto';
}

function drawCurrentChar(image) {
  var x = 4 * MAGNIFY;
  var y = 7 * MAGNIFY;
  L1C.beginPath();
  L1C.imageSmoothingEnabled = false;
  L1C.clearRect(x, y, CHARSIZE, CHARSIZE);
  L1C.drawImage(image, x, y);
  L1C.fillRect(x, y, CHARSIZE, MAGNIFY);
  L1C.fillRect(x, y + CHARSIZE - MAGNIFY, CHARSIZE, MAGNIFY);
}

SCREEN = document.getElementById("layer2");
// You should not use .style.width(or height) here.
// You must not append "px" here.
SCREEN.width  = 256 * MAGNIFY;
SCREEN.height = 148 * MAGNIFY;
L2C = SCREEN.getContext('2d');
L2C.imageSmoothingEnabled = false;
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
      this.se.play(0);
      CURRENTCHAR = this.num;
      changeCursor(this.num);
      drawCurrentChar(this.se.image);
    });
    CONSOLE.appendChild(b);
  }

  // Initializing Screen
  CURRENTCHAR = 0;
  drawCurrentChar(SOUNDS[0].image);
  changeCursor(0);
  drawScore(0);

  // Make canvases from bomb images
  BOMBS = sliceImage(bombimg, 14, 18);

  // Prepare Scroll Range
  var r = document.createElement('input');
  r.id = 'scroll';
  r.type = 'range';
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
