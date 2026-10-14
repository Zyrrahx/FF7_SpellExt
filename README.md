# FF7 SpellExt

A DLL mod for **Final Fantasy VII** (Steam 2013 PC release, `ff7_en.exe`) that lifts limits the engine imposes,
driven entirely by plain text files. It runs as a 7th Heaven mod beside FFNx and Enhanced Stock UI, and changes no
game file on disk: everything happens in memory.

## What it adds
- New spells, materia (up to 254 kinds), items, weapons, armour and accessories, defined in `.ini` files.
- A wider item list: item numbers 1024-9999 and an item list of up to 510 rows.
- The Box: storage beyond the item list (12,000 kinds), and weapons / armour / accessories numbered 10000-27999
  that live in the box or on a character.
- New party members (up to 32 defined, four seated at a time) with their own limit breaks, battle models,
  portraits and battle cameras.
- A companion file beside each save for everything the game's own save cannot hold; the game's save stays loadable
  by the unmodified game.
- Fixes: MP costs above 255, damage caps, more than 256 texts in a field, and others.

## Building
Needs the 32-bit MinGW cross-compiler (`i686-w64-mingw32-gcc`).

    sh build.sh

builds `build/FF7_SpellExt.dll` (loaded by 7th Heaven through `<LoadLibrary>` in the mod's `mod.xml`, beside FFNx)
and `build/AF3DN.P` (a stand-in for the original graphics driver, for setups without FFNx).

## Configuring
The DLL reads its settings from a `SpellExtConfig` folder next to it. `docs/ExampleConfig` holds one file of each
kind with a commented example; `docs/Readme` explains every key. Problems are reported in `FF7_SpellExt.log`
beside `ff7_en.exe`, with the file and line number.

Distribute the mod as a zipped folder, not as an `.iro`: the DLL and its `.ini` files must be real files.

## Source
`src/spellext.c` is the whole DLL. Each hook is commented with the game addresses it works on.
