SpellExtConfig\files - loose files used in place of archive files
=================================================================

Any file under this folder is used instead of the file of the same name
inside the game's .lgp archives. Nothing in an archive is changed.

- Arrange it however you like: sub-folders to any depth, any names. Only the
  file's own name matters, and it must be exactly the name used inside the
  archive (battle model parts have no extension: rtaa, rtab ...; portraits
  are cloud.tex, cloud_l.tex ...).
- New files with new names work too, where something asks for them: a new
  character's portrait (named by `portrait =` in the character file) lives
  here.
- The folder is indexed once, when the game starts. Restart the game after
  adding, renaming or moving files.
- If the same name appears twice, a file in a folder is preferred to one in
  its sub-folders; FF7_SpellExt.log names the one that was ignored.
- FF7_SpellExt.log lists each file as it is used (the first 200).
- If this folder does not exist, the feature is off.


PNG images in place of .tex textures
------------------------------------
A PNG can stand in for a .tex texture. When the game asks for a texture and
there is no loose file of that name, the DLL looks for a PNG:

    game asks for   tester.tex   ->   tester.png
    game asks for   rtac         ->   rtac.png      (battle textures have no extension)

The PNG is converted to the game's own format the first time it is needed in
a session, and the result is kept in SpellExtConfig\cache (safe to delete).
FF7_SpellExt.log says "PNG converted: ..." or "PNG not used: ..." and why.

- Supported: 8-bit RGB, RGBA, greyscale and palette PNGs, not interlaced.
  Not supported: 16-bit and interlaced PNGs (re-save them).
- The image is reduced to 256 colours, which is what the game's textures
  use. A PNG that already has 256 colours or fewer is kept exactly.
- Transparency in the PNG is ignored for now: every pixel is opaque.
- Use the same size and layout as the texture being replaced. The game draws
  a fixed part of each texture.

Portraits of a new character (named by `portrait =` in the character file)
are the exception to "same size and layout": give any picture.

    <name>.png      scaled to fill the part of the texture the game draws
    <name>_l.png    optional smaller version; made from <name>.png if absent

- The picture keeps its proportions. The portrait frame is slightly taller
  than wide (7 : 8), so a square picture loses a little from each side. A
  picture already in that shape (84 x 96, 168 x 192, 336 x 384 ...) is not
  trimmed at all.
- A larger source gives a better result than a small one.
- `portrait_fit = no` in the character file turns this off, for a PNG that
  is already laid out as the game's texture: 128 x 128 with the picture in
  the top-left 84 x 96, and 64 x 64 with the picture in the top-left 40 x 48.
