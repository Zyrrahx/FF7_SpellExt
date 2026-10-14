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

## Installing (7th Heaven)
SpellExt runs as a 7th Heaven mod beside FFNx, on the Steam 2013 release of the game (`ff7_en.exe`).

1. **Download** `FF7_SpellExt_PublicBeta.zip` from the
   [Releases](https://github.com/Zyrrahx/FF7_SpellExt/releases) page. It holds the compiled `FF7_SpellExt.dll`, its
   `mod.xml`, and the `SpellExtConfig` folder with the default `.ini` files and a readme for each.
2. **Extract the .zip to a folder** (right-click, Extract All, or any unzip tool). The folder holds `mod.xml`,
   `FF7_SpellExt.dll` and `SpellExtConfig/` directly.
3. **Import that folder into 7th Heaven** with its Import Mod option, choosing the extracted folder. Do not pack it as
   an `.iro`: the DLL and its `.ini` files must stay real files.
4. **Tick the mod** in 7th Heaven's mod list and play. Only one SpellExt mod may be ticked at a time.
5. **Close 7th Heaven normally** (its window's close button) after changing ticks: a forced stop loses the change.

### Configuring
Everything is set in the `.ini` files of the mod's `SpellExtConfig` folder, inside 7th Heaven's `mods` folder (for
example `7th Heaven/mods/<the mod's name>/SpellExtConfig/`). Open them with any text editor; each kind has its readme
in `SpellExtConfig/Readme/`. The files are read when the game starts.

- Problems are reported in `FF7_SpellExt.log`, beside `ff7_en.exe`, with the file and line number.
- `SpellExtConfig/FF7_SpellExt_Game.ini` holds the switches (`wide_items`, `wide_rows`, `box`, ...).

### Saves
- **Back up your saves first.** SpellExt keeps what the game's save cannot hold in a companion file per save, in
  `FF7_SpellExt_Saves/` beside `ff7_en.exe`. Keep that folder together with the game's `save/` folder.
- The game's own saves stay loadable without the mod; things that only exist with SpellExt (new items, the box) stay
  in the companion files until the mod is used again.

### Beta notes
- Expect bugs; report them with `FF7_SpellExt.log`.
- Built to sit beside other mods. Enhanced Stock UI is confirmed working; other UI mods may clash.
- Mods that rename spells are overwritten by `FF7_SpellExt_SpellNames.ini`; leave that file out to keep theirs.

## Item numbers
Each kind of thing has a fixed range (the old way, inside the game's own 0-511) and a high-numbered ("wide") range.

| Kind | Fixed numbers (the old way) | High numbers | How many high numbers |
|---|---|---|---|
| Items | 105-127 and 448-511 (87) | 1024-9999 | 8,976 |
| Weapons | 320-383 (64) | 10000-15999 | 6,000 |
| Armour | 384-415 (32) | 16000-21999 | 6,000 |
| Accessories | 416-447 (32) | 22000-27999 | 6,000 |

- 0-319 are the game's own items, weapons, armour and accessories.
- 512-1023 are never used: a safety gap, because the game's own arithmetic can produce values there.
- 28000-32767 are spare, not assigned to anything.

What the high numbers need, in `FF7_SpellExt_Game.ini`:

| Range | Needs |
|---|---|
| High-numbered items | `wide_items = on` |
| High-numbered weapons, armour, accessories | `wide_items = on` and the box at work (`box = auto`, the default, or `on`) |

Where they live in the game:
- High-numbered items go in the item list like any item: up to 510 kinds at once with `wide_rows = 510` (the
  default), 99 of each; when the list is full, more go to the box.
- High-numbered weapons, armour and accessories live only in the box or on a character, never in the item list.
  The box holds up to 12,000 kinds, up to 65,535 of each; the Equip menu offers them straight from the box.

They can be given by field scripts (Add Item), enemy drops, steal and morph, shops, and the testing aids. A section
numbered in the wrong range is not read, and `FF7_SpellExt.log` names the range to use instead.

## Building
Needs the 32-bit MinGW cross-compiler (`i686-w64-mingw32-gcc`).

    sh build.sh

builds `build/FF7_SpellExt.dll` (loaded by 7th Heaven through `<LoadLibrary>` in the mod's `mod.xml`, beside FFNx)
and `build/AF3DN.P` (a stand-in for the original graphics driver, for setups without FFNx).

## Configuring
The DLL reads its settings from a `SpellExtConfig` folder next to it. `docs/ExampleConfig` holds one file of each
kind with a commented example; `docs/Readme` explains every key.
[`docs/Spells_Guide.md`](docs/Spells_Guide.md) walks through new spells and their materia with worked examples
(element families, statuses, summons, MP above 255, fixed damage, cameras, materia with more than five levels). Problems are reported in `FF7_SpellExt.log`
beside `ff7_en.exe`, with the file and line number.

Distribute the mod as a zipped folder, not as an `.iro`: the DLL and its `.ini` files must be real files.

## Source
`src/spellext.c` is the whole DLL. Each hook is commented with the game addresses it works on.
