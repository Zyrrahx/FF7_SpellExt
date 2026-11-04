# FF7 SpellExt

A DLL mod for **Final Fantasy VII** (Steam 2013 PC release, `ff7_en.exe`) that lifts limits the engine imposes,
driven entirely by plain text files. It runs as a 7th Heaven mod beside FFNx, and changes no
game file on disk: everything happens in memory.

Expect bugs and issues not everything has been tested.

Most keys named below are explained in the readmes in [`docs/Readme`](docs/Readme/); the game file's basic keys
(`debug`, `seats`, the damage limits, `items_on_load`) are explained in the comment block at the top of a release's
`FF7_SpellExt_Game.ini`, and the shop file's in its own comments. Where a feature has not been seen working in the
game yet, this page says so.

## What it adds

### Spells and materia
- **New spells**, numbered from `[3000]` in `FF7_SpellExt_Spells.ini`: name, description, MP cost up to 999 (above 255
  the DLL charges and shows the real cost), power, element, statuses, targets, damage formula, `fixed_damage` (not yet seen in the game),
  and which materia teach them at which level.
- A spell can play any magic effect, an **enemy attack's or enemy skill's effect** (with fixes so Blue Light on
  several targets and Super Nova outside its arena play correctly), a different effect on several targets
  (`animation_all`), an effect copy or a native effect (below).
- **New summons** (`list = summon`), with uses per battle; support materia (All, Quadra, MP Turbo, the counters) work
  on new spells and summons as on the game's (All on spells only, as in the game).
- **New materia**, numbered `[96]` to `[254]` (159 kinds beside the game's own) in `FF7_SpellExt_Materia.ini`: any of
  the five kinds, up to **20 levels**, teaching game spells (levels 1-5) or new spells (any level, 1-20).
- **Renaming spells**: `FF7_SpellExt_SpellNames.ini` renames the game's magic, summons, enemy skills and limits (the
  file as shipped renames nothing).
- **Damage above 9,999 on enemies**: `enemy_damage_limit` (up to 9,999,999 HP) and `enemy_mp_damage_limit` (up to
  65,532 MP) in the game file; defaults are the game's 9999 and 999, and hits on the party keep the game's limits.

### Items, gear and the item list
- **New items, weapons, armour and accessories** in the fixed ranges inside the game's own numbers (see
  [Item numbers](#item-numbers)), each copying a game piece with `base` and changing what you give. Weapons and armour
  can have up to 8 materia slots, linked in chains of three to eight (`slots = chain5 single`).
- **Changing the game's own gear**: a section numbered for a game weapon (`[128]`-`[255]`), armour (`[256]`-`[287]`)
  or accessory (`[288]`-`[319]`) in its own file changes that piece in whatever kernel the game loaded. Only the keys
  the section gives replace the game's values; taking the section out restores them at the next Re-init.
  Example: `[128]` with `equip = cloud 12` lets Cloud and new character 12 wear the Buster Sword (`equip` replaces
  the whole list, so name everyone who should keep it).
- **High-numbered ("wide") items**, 1024-9999, and **wide weapons, armour and accessories**, 10000-27999.
- **A longer item list**: `wide_rows` = 320, or an even number from 510 to **3,350** (default 510; it needs
  `wide_items = on`, without which the list keeps the game's 320 rows). Above 510 rows, Arrange sorts only the rows in
  use.
- **The Box**: storage beyond the item list, 12,000 kinds and up to 65,535 of each, with its own row under Quit and
  its own screen (take out, put in, store gear, take all out), and the Equip menu offering pieces from it. It opens
  where Save does, unless `box_access = always`. With `box = auto` (the default) it sleeps until a save receives
  something the item list has no row for.
- **Shops**: `FF7_SpellExt_Shops.ini` adds items, wide items and materia to the game's shops (up to 32 entries a
  shop, the game's own included). Wide gear is not sold in shops.
- **Fixes**: new things dropped, stolen or morphed arrive as what they are; with the Box at work, a piece taken off
  with a full item list is no longer lost; a full materia stock and the Wutai theft handle new materia; a mastered new
  materia no longer makes FFNx's Steam-achievement count (a list sized for the game's 91) write outside its list
  (`achievement_materia_view = yes`, the default).

### New characters
- Up to **32 new party members**, `[12]` to `[43]` in `FF7_SpellExt_Characters.ini`, four of them seated at a time
  (`seats = 4`, the default; 2 if the game table the last two need cannot be moved). The PHS scrolls when more than
  nine can be shown.
- Each has its own name, portrait (a picture file, or one of the game's portraits with `portrait = game:NAME`),
  battle model (`battle_like`, or its own model files with `battle_files`), field model (`field_model`), growth
  curves, starting level, equipment and materia, and the equipment rules of one of the nine (`equip_like`;
  `equip_like = none` lets them wear only what all nine can, plus what a gear file's `equip` names them for).
- **Battle AI** of their own: `ai_like` (a copy of a game character's: the nine, young Cloud or Sephiroth) or
  `ai = NAME` (a file in `SpellExtConfig\ai`).
- `keep_seat`, `copy_of` and joining by field script. `atb_follows_dexterity = yes` makes a battle script's change of a
  party member's dexterity change its time gauge's speed at the next action's set-up (it needs at least one new
  character defined; not yet seen in the game).
- `body_blend = yes`: the groups of a new character's own battle model (`battle_files`) keep their `.P` blend mode,
  so a cloak or a veil can be see-through (the game draws every group of a party member's body solid).

### Limit breaks (for new characters)
- Twelve limits per new character (levels 1-4, three each) in `FF7_SpellExt_Limits.ini`, each built on a game limit
  (`base`) with its own name, damage, element, camera, **animation pack** and **action script**, learnt by kills and
  uses like the game's, with a limit gauge, a limit item of its own that teaches its 4-1 limit, and limit sets. A character can also
  borrow one of the nine's limits whole (`limits = cloud` in the character file). The nine cannot be given new limits.
- A limit can play **up to 24 steps** (`spell_effects`): magic, enemy attack and enemy skill effects, game limit
  effects, native effects (`effect N:FRAME`) and bare `hit:FRAME` steps (the Nth step shows the Nth hit, with no
  effect), each on its own frame; `hit_elements` gives each hit its own element. Bare `hit:` steps, and steps past the
  eighth, are read from the code and not yet seen in the game.
- **Props** (a model held during a limit), **states** (a limit that leaves the character in a lasting stance with its
  own attacks, idle and commands) and **follow-up chains**.
- **Transformations** (`form`, defined in a `[form NAME]` section): a limit turns its user into another battle model
  for the rest of the battle, as the game's beast limits do: an enemy's own model (`model_enemy`) with a script file
  in the party layout, a party-slot model of the game's (`model_like`) or a full set of files (`model_files`). The AI
  then takes the character's turns, and when knocked out the character changes back to its own model. A form has no
  size, height or stat changes of its own yet.

### Effects and cameras
- **Effect copies** (`FF7_SpellExt_Effects.ini`, numbered from 0x100): a spell plays its own copy of one of 38 game
  magic effects with files of your own, beside the original (e.g. a recoloured Fire). For spells, not limits.
- **The native effect player**: effects the DLL plays itself from a script in `SpellExtConfig\effects`: sprites and
  `.rsd` models from your own files or the game's magic files, game sounds or sounds of your own (`.ogg`, with FFNx's `use_external_sfx`), screen
  fills, flashes and shake, stage darkening, and moving, hiding or tinting actors. Used by a spell (`animation =
  0x100` and up) or a limit (`effect N:FRAME`). Up to 32 files and 600 frames an effect, one playing at a time. It was
  built to carry effects converted from FF8; none ship with the mod. Some commands are not yet seen in the game
  (see its readme). Up to 1,024 effect sections and 1,024 sound handles; the pool of timeline lines grows to what
  the scripts need (up to 1,048,576).
- **Models that change shape**: a model's file line can name a morph file (`morph=NAME.MRF`, up to 600 vertex sets),
  and a model line steps through its sets (`shape=A>B`, blended with `tween=smooth`): a ribbon growing, a beam
  stretching. The sets are written through the game's own vertex lock. `face=yaw` keeps a model upright and turns it
  about the vertical to face the camera.
- **Battle cameras of your own** (`SpellExtConfig\cameras`, numbered from 190 hex), added in memory to whichever of
  the game's camera files is loaded and used through a spell's or limit's `camera_single` / `camera_multi`. A camera
  can also turn the arena about its long axis (`[roll]`, a roll when the shot looks along it), or use FF8's kind of
  camera (`engine = ff8`: keyframes, splines, zoom, roll, blends and sequences). Both play only while a native effect
  runs. An `engine = ff8` camera with `clock = action` plays instead on the action's own frames, from its effect step
  through all of its steps; FF8 cameras also take the references `home` and `frame0.home`. `clock = action` and the
  two references are not yet seen in the game. Up to 256 cameras and 65,536 bytes of script in all.

### Enemies and battles
- **Enemies and scenes of your own** (`enemies = on` in the game file, read at start-up): battles built by the DLL
  from text files in `SpellExtConfig\enemies` and `SpellExtConfig\scenes`, with no change to `scene.bin`. A scene
  holds up to three enemies, the arena, the camera and up to four formations; scenes are numbered 256-4095, so their
  battles are 1024-16383. Each enemy's model files, AI and attacks come from its own folder.
- `FF7_SpellExt_Enemies.ini` puts them in place of the game's battles: `[battle_map]` lines by field, on the world map
  or anywhere (`field 123 : 268 = 1200`), and `test_battle` takes their numbers. A scene with a mistake is refused
  with the file and line in the log, and the game's own battle plays. Edits to a scene's files take effect at its next
  battle, with no restart.
- **Enemy attacks with SpellExt's effects and cameras**: an enemy's `[attack]` section, or `[attack N]` in the enemies
  file for attack N in any battle (the game's own too), can name a native effect (`effect`, `effect_all`) and cameras
  (`camera`, `camera_multi`).
- **The battle page**: with `debug = true`, the SpellExt menu's "Fight: external battles" lists every registered scene
  and starts the one you pick from the field you stand in, with Again, Next and Previous rows. By default it is a test
  battle: no rewards, a loss returns to the field and the party is put back (the `battle_menu_*` keys change that).
  It starts battles from fields only, not the world map.

### Fields and the engine
- **Bodies in the field for new characters**: `field_entities = party` or `seats` (default off), with the character's
  `field_model` (a field skeleton with Cloud's 21 bones). The body stands, walks and runs.
- **More fields than the game ships**: `fields_file` names a registry of new field ids (from 788, or past another
  mod's longer maplist, up to 32,766), each a whole field file in a mod. `fields_fallback` names a place in one of the
  game's fields: a save made in a new field holds it (the real place goes in the companion), and a door or save that
  leads to a field the game cannot read goes there. Set it before saving in a new field: without it such a save does
  not load without SpellExt. `fields_fallback` is not yet seen in the game.
- **Breaking Limits**: two keys in the game file, both read at start-up only. `breaking_limits = on` is the master
  switch (default off): without it nothing of Breaking Limits is done and `wide_skeletons` is ignored.
  `wide_skeletons` does the work: with `on`, battle models can have **more than 48 bones** (up to 127). It is `on` by
  default once the master is on, so `breaking_limits = on` alone widens skeletons; write `wide_skeletons = off` to
  keep the game's limit. `all` is a testing aid. The game's effects, hit numbers and cursor see bones 0-48 only. Seen
  in the game with a 69-bone model.
  `model_skinning = on` (default off; it needs the master and `wide_skeletons`) lets single vertices of a battle
  model's part follow another bone, from a file in `SpellExtConfig\skins`, so a polygon that crosses a joint bends
  with it instead of tearing. It relies on FFNx keeping a part's vertices in memory.
- More than 256 texts in one field; name codes for new characters in dialogue.

### Saves
- A companion file per save for everything the game's own save cannot hold (see
  [Saves and companion files](#saves-and-companion-files)).

[`docs/FEATURES_CHECKLIST.md`](docs/FEATURES_CHECKLIST.md) records how far each feature up to mid-October has been
confirmed in the game (its Known limits are from then: the item list now has up to 3,350 rows); for the features
added since, see the marks on this page.

## Installing (7th Heaven)
SpellExt runs as a 7th Heaven mod beside FFNx, on the Steam 2013 release of the game (`ff7_en.exe`).

1. **Download** the `.zip` of the latest release from the
   [Releases](https://github.com/Zyrrahx/FF7_SpellExt/releases) page. It holds the compiled `FF7_SpellExt.dll`, its
   `mod.xml` and the `SpellExtConfig` folder with the `.ini` files.
2. **Extract it to `7th Heaven\mods\SpellExt`.**
3. **Open 7th Heaven, choose Import Mod and "From Folder"**, and select `7th Heaven\mods\SpellExt`. From Folder
   keeps the mod as plain files, so the `.ini` files stay editable. Do not pack it into an `.iro`.
4. **Toggle the mod on** in 7th Heaven's list and play. Only one SpellExt mod may be ticked at a time.
5. Upon loading a save or starting a new game, **SpellExt is listed under Quit** in the menu, showing the mod is
   active (with `debug = true` in the game file, as shipped). Once the Box is at work that row says Box instead, and
   the SpellExt menu is the last command of the Box screen.

The readmes inside a release zip can be older than, or missing from, the ones in [`docs/Readme`](docs/Readme/):
read those.

### Configuring
- Edits are made in the mod's `SpellExtConfig` folder: the `.ini` files, and the folders `cameras`, `effects`, `ai`,
  `files` (loose files and portraits), `enemies`, `scenes` and `skins`. Each file's keys are explained in its readme in
  [`docs/Readme`](docs/Readme/).
- **Reloading without a restart**: the SpellExt menu (under Quit, or on the Box screen once the Box is at work, with
  `debug = true`) has **Re-init .ini files**, which reads the files again. Its other pages list what was read:
  spells, materia, gear, items, characters, seats and shops. Some keys are read at start-up only and need a restart:
  `wide_items`, `wide_rows`, `box` and its other keys, `seats`, `breaking_limits`, `wide_skeletons`,
  `model_skinning`, `enemies`, and the field
  keys `fields_file`, `fields_table_size`, `field_buffer_bytes` and `fields_fallback`. A new file (a portrait, a
  model, an effect's or an AI file) is seen only after a restart: 7th Heaven lists a mod's files when the game
  starts.
- **Problems** are reported in `FF7_SpellExt.log`, beside `ff7_en.exe`, with the file and line number.

The main switches, in `FF7_SpellExt_Game.ini`:

| Key | Values | Default | What it does |
|---|---|---|---|
| `wide_items` | `off`, `shadow`, `on` | `off` | Wide items and the item list's takeover; needed by `wide_rows`, the Box and all high numbers. `shadow` rehearses it without changing the game |
| `wide_rows` | `320`, or an even number 510-3350 | `510` | Rows of the item list (needs `wide_items = on`) |
| `box` | `off`, `auto`, `on` | `auto` | The Box (needs `wide_items = on`); `on` sends gear you receive to the box (throwable weapons to the list) |
| `box_access` | `save`, `always` | `save` | Where the Box opens: where Save does, or anywhere |
| `debug` | `true`, `false` | `false` | The SpellExt menu under Quit (Re-init and the lists) |
| `seats` | `2`, `4` | `4` | How many new characters can be seated at once |
| `enemy_damage_limit` | 1-9,999,999 | 9999 | Highest HP damage on an enemy |
| `enemy_mp_damage_limit` | 1-65,532 | 999 | Highest MP damage on an enemy |
| `field_entities` | `off`, `party`, `seats` | `off` | Field bodies for new characters |
| `fields_file` | a file name, or `none` | none | The registry of new fields |
| `breaking_limits` | `on`, `off` | `off` | The master switch: nothing of Breaking Limits is done without `on` |
| `wide_skeletons` | `on`, `off`, `all` | `on` once `breaking_limits = on`; ignored without it | Battle models of more than 48 bones |
| `model_skinning` | `on`, `off` | `off` | Vertices that follow another bone (needs `breaking_limits` and `wide_skeletons`) |
| `enemies` | `on`, `off` | `off` | Enemies and scenes of your own |
| `atb_follows_dexterity` | `yes`, `no` | `no` | Dexterity changes in battle change the time gauge's speed |
| `achievement_materia_view` | `yes`, `no` | `yes` | Keeps FFNx's mastered-materia count from writing outside its list (keep it on) |

**Testing aids** change what a save holds (at each load, or in the next battles and chests): use them on a spare
save only and take them out when done. They include `give_on_load` in the item, gear and materia files,
`items_on_load`, `test_drop`, `test_steal`, `test_stitm`, `test_fill_rows` and `box_selftest` in the game file,
`join = load`, `party_slot` and `remake_on_load` in the character file, `learn_all_on_load`, `full_gauge` and
`limit_item_on_load` in the limits file, and the `[test]` sections. `test_battle = N` (every battle becomes battle N)
and `wide_skeletons = all` change no save but are for testing only.

### Saves and companion files
- **Back up your saves first.** SpellExt keeps what the game's save cannot hold in a companion file, one per save
  that needs one, in `FF7_SpellExt_Saves/` beside `ff7_en.exe`. Keep that folder together with the game's `save/`
  folder.
- The companion holds new characters, wide items, the item list's rows past 320, the Box, worn wide gear, and the real
  place of a save made in a new field. New items and gear in the fixed ranges (105-127 and 320-511) are in the game's
  own save as long as its 320 rows hold them; a longer list keeps the game's own kinds there first and the rest only
  in the companion.
- Without the mod, the game still opens the save, but what lives in the companion is missing: wide items leave gaps,
  worn wide gear shows as a stand-in, and the item list has 320 rows. Things only the mod defines (new characters in
  the party, new items, gear and materia) are not what they are with it: play such a save with the mod.
- **Do not save over a slot without SpellExt**: the save then no longer matches its companion file, and the next load
  with SpellExt may not find its new characters (they are made afresh), wide items, the rows past 320, worn wide gear
  or the Box (locked). The log names the companion that holds them: copy it under the name the log gives before
  saving again.
- A save whose item list uses more than 510 rows must not be played with a build older than the 3,350-row list.
- Before removing the mod for good, take everything out of the Box and save.

### Beta notes
- Expect bugs; report them with `FF7_SpellExt.log`.
- Built to sit beside other mods. Enhanced Stock UI is confirmed working; other UI mods may clash.
- A line in `FF7_SpellExt_SpellNames.ini` replaces the name another mod gives that spell; as shipped the file renames
  nothing.

## Item numbers
Each kind of thing has a fixed range (the old way, inside the game's own 0-511) and a high-numbered ("wide") range.

| Kind | Fixed numbers (the old way) | High numbers | How many high numbers |
|---|---|---|---|
| Items | 105-127 and 448-511 (87) | 1024-9999 | 8,976 |
| Weapons | 320-383 (64) | 10000-15999 | 6,000 |
| Armour | 384-415 (32) | 16000-21999 | 6,000 |
| Accessories | 416-447 (32) | 22000-27999 | 6,000 |

- 0-104 and 128-319 are the game's own items, weapons, armour and accessories (the gear can be changed: see above).
- 512-1023 are never used: a safety gap, because the game's own arithmetic can produce values there.
- 28000-32767 are spare, not assigned to anything.
- Keep wide items to 1024-2999 where you can: 3000 and up are also the numbers of new spells.

What the high numbers need, in `FF7_SpellExt_Game.ini`:

| Range | Needs |
|---|---|
| High-numbered items | `wide_items = on` |
| High-numbered weapons, armour, accessories | `wide_items = on`, the box at work (`box = auto` or `on`), and at least one such piece defined when the game starts |

Where they live in the game:
- High-numbered items go in the item list like any item, 99 of each. The list's rows are shared by every kind of
  thing; when no row is free, a new kind goes to the box (with the box at work, and not during a battle).
- High-numbered weapons, armour and accessories live in the item list, in the box or on a character. In the item list
  they are greyed in the Item menu, and they are never thrown, bought or sold. At most 64 wide weapons, 96 armour and
  96 accessories can be worn at once.

They can be given by enemy drops, steal and morph, shops (wide items), field scripts (Add Item; most field editors
cannot write numbers above 511), and the testing aids. A section numbered in the wrong range is not read, and
`FF7_SpellExt.log` names the range to use instead.

## Building
Needs the 32-bit MinGW cross-compiler (`i686-w64-mingw32-gcc` and `i686-w64-mingw32-dlltool`) and a POSIX shell.

    sh build.sh

builds `build/FF7_SpellExt.dll`, the mod (loaded by 7th Heaven through `<LoadLibrary>` in the mod's `mod.xml`, beside
FFNx), and `build/AF3DN.P`, a wrapper for setups without FFNx (it forwards to the game's own driver renamed
`AF3DN_orig.dll`; not tested). The repository has no `mod.xml`: take the one in a release, or write one with
`<LoadLibrary>FF7_SpellExt.dll</LoadLibrary>`.

## Docs for mod makers
- [`docs/Readme`](docs/Readme/): a readme for most files, with their keys.
- [`docs/Spells_Guide.md`](docs/Spells_Guide.md): new spells and their materia with worked examples (element families,
  statuses, summons, MP above 255, fixed damage, cameras, materia with more than five levels).
- [`docs/Cameras_Guide.md`](docs/Cameras_Guide.md): battle cameras of your own.
- `docs/ExampleConfig`: the commented example files a release ships (a release's `FF7_SpellExt_Game.ini` has the
  switches set).

Distribute the mod as a zipped folder, not as an `.iro`: the DLL and its `.ini` files must be real files.

## External Tools
Tools for mod makers, in [`External Tools/`](External%20Tools/). CAMMY and Skeleton Master are web pages: open its
`index.html` in Firefox, Chrome or Edge; nothing to install. Their 3D views load three.js from the internet the first
time.

- [**SpellExt Config**](External%20Tools/SpellExt%20Config/): a desktop editor for the SpellExt `.ini` files (Linux
  and Windows). Built with `build/build.sh`, which downloads a pinned Electron release; how to use it:
  `build/README_linux.txt`, `build/README_windows.txt`.

- [**CAMMY**](External%20Tools/CAMMY/): a battle camera editor. Shows a camera in 3D, opens any of the game's cameras
  to start from, and saves the camera files SpellExt loads (`SpellExtConfig/cameras/`). It makes the game's kind of
  camera (not `[roll]` or `engine = ff8`). Guide: [`docs/Cameras_Guide.md`](docs/Cameras_Guide.md).
- [**Skeleton Master**](External%20Tools/Skeleton%20Master/): three tabs.
  - **Add slots** adds extra animations to a battle model, keeping every existing one as it was, and tells you the
    script byte that plays each: up to about 100 more on a party member, and on enemies, including those that carry a
    weapon. A body and its weapon track are added together.
  - **Retarget** moves animations from one model's skeleton to another's: pair the bones in 3D (saved as a `.map`),
    watch the result, export it (one `.zip` with the body and its weapon track), retarget a whole limit pack, or give
    it a new slot. A source with no weapon track can be given one as long as the body (at the feet, or held as in the
    idle) so KimeraCS does not fail on it.
  - **Scripts** edits a model's battle action scripts, explaining each command and refusing the ones known to lock or
    crash the game. Its output has not yet been tried in the game.

## Source
`src/spellext.c` is the DLL (it includes `src/png_tex.c` and `src/field_merge.inc`); `src/exports.def` and
`src/orig_imports.def` serve the `AF3DN.P` build. Each hook is commented with the game addresses it works on.
