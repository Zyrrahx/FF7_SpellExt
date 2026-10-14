# CAMMY: a battle camera tool for Final Fantasy VII

CAMMY shows a battle camera in 3D and lets you edit it: where the camera stands, what it looks at, and how both move
over time. It reads and writes the camera text files that **FF7 SpellExt** loads from `SpellExtConfig/cameras/`, and it
can open any camera from the game's own `camdat0.bin`, `camdat1.bin` and `camdat2.bin` to start from.

It is one web page: open `index.html` in a browser (Firefox, Chrome, Edge). Nothing to install. It needs an internet
connection once, for the 3D library (three.js, loaded from jsdelivr).

## Using it
- **Open game camera**: pick `data/lang-en/battle/camdat0.bin` (or 1, 2) and type a camera number (hex), for example
  `4e`. It is loaded with the number 190; give it a number of its own (190 and up) before saving.
- **Open .txt**: a SpellExt camera file.
- **Play** or drag the timeline. The orange line is the camera's path, the green line the point it looks at; the
  framed view in the corner is roughly what the game shows.
- **Script tab**: one row per command. Change numbers, reorder, add commands with the buttons under each list. For a
  row with x / y / z: orbit the 3D view to where you want the camera (or the point it should look at, which is the
  centre the view turns around) and press **Use view**.
- **Templates** (Script tab): over the shoulder, orbit the target, push in on the face, a wide side shot, a cut
  from the attacker to the target. Pick one and adjust it.
- **Drag**: click a row with x / y / z (or click the orange camera or the green focus marker) and drag the white ball:
  along the ground, or up and down with Shift held. Each row shows the frame it runs at.
  Ctrl+Z / Ctrl+Y undo and redo; Escape lets go of the selected row.
- **Battlefield tab**: who attacks, who is targeted, where the party and the enemies stand.
- **Save .txt**: put the file into `SpellExtConfig/cameras/` of the FF7 SpellExt mod and name the camera in a spell or
  limit (`camera_single = 0x190`, `camera_multi = 0x190`). Cameras are read at each battle's start, so a new battle
  shows the change.

## How close is the preview
It replays the commands as decoded from the game's two camera interpreters. Not modelled yet: bones other than the
root (they are placed at the actor's feet), the actors' facing (offsets are added in the battle's axes), the flags and
the facing placements (`f2`, `f3`). The party's places are an estimate you can change. Always check a camera in a
battle. Corrections are welcome.

## Files
- `index.html`: the page.
- `cammy_core.js`: the camera format, the game files, playback and the text form (no display code).
- `tests/run_tests.js`: `node tests/run_tests.js [battle folder]` checks the core against the game's three camera files,
  against cameras exported by `cam_tool.py`, and against SpellExt's own camera files.

Background on the format: `docs/Cameras_Guide.md` in the FF7_SpellExt repository.
