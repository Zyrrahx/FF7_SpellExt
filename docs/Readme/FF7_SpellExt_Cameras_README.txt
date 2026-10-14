FF7 SpellExt - battle cameras of your own
=========================================

Folder: SpellExtConfig\cameras. Every .txt file in it is one battle camera.
Read when the first battle starts. Problems are reported in FF7_SpellExt.log
with the file's name and the line number.

The game keeps its battle cameras in three files (camdat0.bin, camdat1.bin,
camdat2.bin; which one is used depends on the kind of battle). The cameras
here are ADDED to whichever of them is loaded, in memory: the file itself is
not replaced or changed, so the game's own cameras, or those of another mod
that ships camera files, stay as they are.

A camera is used by giving its number as camera_single / camera_multi in the
spell file or the limits file.


A camera text
-------------
    camera = 190                     ; its number, in hex

    [variant 0 1 2 position]         ; where the camera is
    f0 0 250 -290 -1100              ; one command per line: its number in hex,
    f5 8                             ; then its operands in decimal
    f4
    ff                               ; a script ends with ff

    [variant 0 1 2 focus]            ; the point it looks at
    f9 0 0 -260 0
    ff

- camera = NUMBER comes first. Use numbers from 190 (hex) up: the game's own
  files use 0 to 189. Each number once only. If the loaded file already has
  that number, the one here takes its place.
- A camera has two scripts that run side by side, position and focus, and
  three variants of each (0, 1, 2). All six must be given; a heading may name
  several variants, as above.
- Anything after a ; is a comment.
- The numbers between the file's last camera and yours behave as camera 0.

The commands, and what each operand means, are listed by
    tools/cam_tool.py list FILE --words
and in Claude Notes/Battle_Camera_Scripts.md. cam_tool.py export writes any
of the game's cameras out in this form, to start from.


Known limits
------------
- Up to 64 cameras, 32768 bytes of script in all.
- A camera file from another mod that already uses numbers from 190 up would
  have those cameras replaced by the ones here.
