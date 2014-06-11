Mario Sequencer
====

This is good old Mario Sequencer Web Edition.
Works only on Chrome (at least for now).

Original software for Windows 95 by Anonymous in 2ch:
http://www.geocities.jp/it85904/mariopaint_mariosequencer.html

How to use
------
Try this link:
http://minghai.github.io/MarioSequencer/

Also, here's GREAT music "NikoNiko suite" by Phenix.
http://minghai.github.io/MarioSequencer/?url=NikoNiko_suite.json&auto=true

Feel free to make your local clone.
You can use this appli without internet after download them all.

Basically, What you see is what you get.

The "Download" button will save your music as JSON file.
Drag and drop your file and you can play it again.

This version lacks Undo implementation.
Watch out, no Undo. So save many times.

This web app supports both JSON score files and MSQ files for Mario Sequencer for Windows.
Just drag and drop MSQ files, they will be concatinated, and you can save it as one JSON file.
Please number files such as file1.msq, file2.msq .... fileN.msq.
(Do you know Mario Composer file format? Or can you contribute that for me? :-)

If you want to change the tempo in the middle of the music, separate files,
drag and drop all, then player will change the tempo automatically.

You can use # and b for semitones. Just push Shift and Ctrl key while you left click.

WEB API
-------

There's some WEB API.

- ?url="json or msq file URI"

You can download the score file by this.

- ?auto="true or false"

You can play the music automatically by this.

- ?mag="integer N > 0"

If you believe "The bigger, the better", Go for it!

- ?SCORE="MSQ's sore data"

You can pass the score data by this.

Try these links for example.

  Kerby's OP theme. http://bit.ly/1iuFZs1 
  Aunt Spoon (or Mrs.Pepper Pot) http://bit.ly/1kpLFsd

License
------
This comes from good old SNES game, Mario Paint.
Images and sounds belong to Nintendo.

All code is my original. Written in HTML + JavaScript.
I declare the code in this web app as Public Domain.
Only code, not images and sounds.
Do what you want with my code.
But I'm not responsible for anything, in any means.

Acknowledgement
-----

- Anonymous Mario Sequencer developer in 2ch.

- Phenix who made great music with Mario Sequencer.

  http://phenix2525.blog79.fc2.com/blog-entry-6.html

- Mario Composer Developer

  Similar Mario Paint simulator for Win and Mac

  Developed with Adobe Director

  I owed the idea of Shift and Ctrl click for semitones

- it859 who made MSQ file archive

  http://it859.fc2web.com/mariopaint/mariopaint_music.html#m-2

- Internet Archive

  You really help me a lot for downloading old and disappeared files.

- Simon Whiataker

  "Fork me on GitHub" ribbon in pure CSS. Great work!

  https://github.com/simonwhitaker/github-fork-ribbon-css

Thank you all!
