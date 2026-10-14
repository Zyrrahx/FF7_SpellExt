# Skeleton Master

FF7 battle animation slots: a browser page that adds extra animations to a Final Fantasy VII battle model. Open `index.html` in Firefox, Chrome or
Edge; nothing to install, nothing sent anywhere (it works offline).

1. **Load the model**: choose its skeleton `xxaa` and animations `xxda` together (Cloud: `rtaa`, `rtda`), the files the
   game actually loads (a model mod has its own).
2. **Load animations to add**: any `xxda`, a limit pack `.a00`, or a single animation saved as `.anim` (one record). They
   must be made for the model's skeleton (same bone count). A body animation's weapon track comes along when the file
   has one.
3. **Pick a number and add**; repeat. **Build** downloads the two new files (same names) and a list of the new numbers
   with the script bytes that play them.

## Why it works
A party model has 52 body animations (0-2b its own, 2c-33 the limit pack). The game finds body animation n's weapon
track at n + 0x34, so new animations go in the free numbers **68-9b** and **d0-ff**, each with its weapon track 0x34
further on; every slot between is filled with the game's own placeholder, and the skeleton header's count is raised
so the game makes room for them all. Every existing animation stays byte for byte as it was. No DLL is needed.

In the model's action scripts (`xxab`), bytes 00-8d play that animation; numbers above 8d are played with `a7 NN`.
Never use 2c-33 or 34-67 as body animations on a party model. Enemies (no weapon tracks) are extended after their last
animation, up to ff; models with 16 body + 16 weapon tracks are not handled yet.

All of this was read from the game's code (ff7_en.exe, Steam 2013) and checked by building and reading back test files;
please report what you find in the game.

## Files
- `index.html`: the page. `anim_core.js`: the file handling (no display code).
- `tests/run_tests.js`: `node tests/run_tests.js [folder with the party models' xxaa/xxda]`.
