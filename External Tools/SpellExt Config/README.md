# SpellExt Config (desktop app): the JavaScript port

The design is `FF7FF8Fusion/Notes/SpellExt_Config_Desktop_Design.md`. This folder holds what is built so far.

**Stage S1 (2026-10-28): the core port.** `app/core/` is the Python editor's library (`../spellext_config/sxcfg/`)
module for module: `grammar`, `document`, `edit` + `difflib`, `validate` + `cfmt`, `schema`, `workspace`, `safety`,
`discover`, `gamelog`, `slots`, and `py.js` (Python's built-ins where JS's differ: design 2.1). The readers
(`rules/`) are S2. There is no window yet (S3). The Python tool stays the reference and is not changed by the port.

**Stage S2 (2026-10-28): the readers.** `app/core/rules/` holds the ten readers, function for function with
`sxcfg/rules/*.py` and with the DLL's strings: `spells.js` (spell names 10, effects 30, spells 40), `game.js` 20,
`shops.js` 21, `fields.js` 25, `materia.js` 50, `weapons.js` 60, `gear.js` (armour, accessories, items 70-72),
`characters.js` 80, `limits.js` 90, and `gearcommon.js` (what the gear readers share). `rules/index.js` imports them;
each registers itself with `validate.js`, whose `ORDER` is the DLL's. `sxcfg-cli.js` gains `check` and `set`.
The harness gains three modules (`rules`: `check_folder` message for message on the config copy, on it with files
changed or missing, on every key of every kind with its edges, bit 31 and the special shapes, on every header shape and
on the byte fuzz, plus `check_text` of each file and the strict-messages run; `readers`: every reader call the
reference's own `test_rules_*` and `test_schema` make, captured with its shared state, and the state each leaves;
`kinds`: `section_kind` of every header shape; `charnames`: the characters file's name scan). After the S2 review:
`rules/edges` (the edges no other case reached, each proved by a planted bug that got through before: `fields_fallback`
at each number's edges, each gear kind's new numbers all taken, the game and test spell files under other spellings,
the reflect warning on whole special bytes, `kills`/`uses` under every limit position, a character name past 31
characters named by `equip`, a repeated field after line 65,535) and `curves` (`curve_from_targets` called directly,
160,000 seeded curves).

**Stage S3 (2026-10-28): the Electron shell.** `app/main/` (the main process: `main.js` the only file that imports
Electron; `ipc.js` the route table of design 1.3 with its validators, its error mapping and the routes ported from
`server.py`; `paths.js` the path rules of 1.4, the `app://` file rule and the command line; `save.js` Save and Save
all; `store.js` settings.json), `app/preload/preload.cjs` (one channel, the frozen route allowlist, the dropped-folder
token), `app/renderer/` (the Python page adapted: `api()` maps its URL paths to the routes; new: the first screen
`open.js`, the Save preview, the Settings menu, the icon), `app/package.json`, and `build/` (`build.sh`, `verify.sh`,
`fuses.py`, `make_icon.py`, the two README texts). The AI, Live tables and Library routes answer "<route>: coming in
S5/S6/S6a" until then; the page shows that text.

**Stage S4 (2026-10-28): the forms UI and the sidebar.** The Python page's Files tree and top tabs are replaced by a
sidebar of kinds (design 3.2: Game options, Spells, Spell names, Effects, Materia, Weapons, Armour, Accessories,
Items, Characters, Limits, Shops, Fields, Other text, Cameras, Effect scripts, AI, Readme, Problems, Live tables,
Library), each `.ini` entry with a dirty dot and a red count of the DLL's problems. Every file entry opens the kind
page (Form, Raw, Changes, Reload, Save); the game file's Form tab is the Game options page. A kind page (design 3.3):
the section list in file order with the section's name (a shop's place from the shops file's own table), a badge
(wide, test, state, set, commented), a red mark, the Materia file's `[test]` last; a commented-out section is one entry,
grey, with "uncomment" on hover (`uncomment_block`) and "Comment this section out" on a live one (`comment_block`);
the form's rows as before, then **Advanced** (every key of the kind the section does not have, with its default and
help: one click adds the line with the section's `=` column), "add raw key" for the `byte_`/`word_`/`dword_`/`script_`
families by offset, **Add a key** with any name, and **Section text** (the section's lines as they are in the file,
put back through `file.apply_text`); Add section at the end or after the chosen section; problems shown on their row,
under the section's header when no row shows the line, and in the strip, a click going to the row in the form or to
the line in Raw. Problems (Forecast, Game log) is a sidebar page; the AI page and Live tables are there and show their
routes' answer ("coming in S6"), the Library "coming in S5". `app/renderer/kinds.js` holds the page's plain rules
(the sidebar's entries, the Section text's range and text, the shops table, the badges), tested under node.

**Stage S5 (2026-10-28): the template library.** `app/core/templates.js` is the port of the Python reference
`../spellext_config/sxcfg/templates.py` (written first, in this stage): the template format's own parser (placeholders,
`repeat`, repeat segments, `derived`, `into:[..] create`), the placeholder types, filling, ID allocation by the readers'
own rules, the proof at insert (the whole-folder check before, on texts padded with blank lines where the template
inserts, and after: a message of "after" not in "before" refuses the Add) and the tool's own warnings, capture of a
section as a template, and the user's file edited block by block. `app/core/data/builtin_templates.txt` (a copy of
the Python tool's `builtin_templates.txt`, checked identical by the unit tests) holds the 47 templates of design 4.5
(8 items, 10 weapons, 4 armour, 4 accessories, 9 materia with two bundles and the test line, 11 spells, the shop line),
every base and default from KERNEL.BIN, the readmes or the readers. The Library page (`app/renderer/templates.js`):
kinds, cards (bundle, yours), a form per template (the ID suggested, commented IDs offered with the AI files that name
them, the kernel's names for the bases, where each part goes), Preview (the exact lines and the proof's answer, the
warnings), Add (unsaved edits in every file of the template as one change; the kind page opens on the new section);
"+ Add from template" on a kind page; "Save as template" on a section (its keys as placeholders, its linked spells and
shop lines as parts, the text editable, saved to `SpellExtConfig\FF7_SpellExt_Templates.txt` through the Save writer
with a backup; an id already among the user's templates is replaced only after a confirm); Import and Export (file
dialogs; Export is the one write outside the config folder: never a .dll, .exe or .ini, never into the open config
folder or 7th Heaven's own folders). `examples/FF7_SpellExt_Templates.txt` is the example user-templates file (vanilla bases only); the mod
package carries it as `Examples/FF7_SpellExt_Templates_Example.txt` in the mod's own folder, beside SpellExtConfig and
never inside it, since the mod build of the DLL uses a SpellExtConfig beside it whenever that folder exists (the repo's copy:
`7thHeaven_mod/FF7 SpellExt/Examples/`, byte for byte this file, checked by
`tests/unit/templates.test.js` and the Python tool's `test_templates.py`), to be added with the Library's Import, never
as `SpellExtConfig/FF7_SpellExt_Templates.txt` (an update of the mod would write over the user's own templates). The DLL
does not read that folder (it reads its `.ini` files by name, `ai\NAME.ai`, `cameras\*.txt`, the effect scripts it is
told of and the `files` tree), and neither does the app (the workspace lists the folder's own files and `cameras`,
`effects`, `ai`, `Readme`; the Library loads `FF7_SpellExt_Templates.txt` only). The harness gains the module `templates` (75 cases: the parser on every shape, the types on every edge
value and the byte fuzz, every built-in template at its defaults at every offered position and at each edge value of
each placeholder, inserted twice, on the config copy and on the repo's example config, refusals, full ranges,
commented IDs named by an AI file, a shop near its room, captures of every section, the user's file); the oracle fails
when a built-in template draws a new message. `tests/unit/templates.test.js` and `tests/smoke/run_smoke_s5.sh` (the
Library in the hidden window: an item and a materia bundle added and saved, a section saved as a template, the bytes
compared with the Python tool's for the same values).

**Stage S6 (2026-10-28): the AI page, kernels, Live tables.** `app/core/` gains the ports of `tools/ai_tool.py` and
`sxcfg/aipage.py` (`aitool.js`: the assembler, disassembler, checker, kernel and scene.bin readers, the AI files of
`ai\`), `aicards.js`, `aiexplain.js` (the English), `ailibrary.js` (instructions, variables, the 15 recipes),
`kernels.js` (discovery in the game and mods folders, `.iro` archives, the chooser) with `lzs.js` and `lzma.js` (a raw
LZMA1 decoder written from the specification), and `live.js`, `livetables.js`, `liveapi.js` with
`data/live_layouts.json` (the Python tool's copy). gzip is read as Python reads it (`gzip.decompress` for KERNEL.BIN,
zlib's gzip wrapper for scene.bin, whose 0xff padding makes Node's `gunzipSync` throw: design 7.12 settled). The
main process: the AI routes in `ipc.js` (the AI page's, as `server.py`; `ai.kernel_pick` a file dialog; the choice
of kernel kept in settings.json, the Python tool's choice taken over once from `--settings FILE`), and the Live tables
in a worker thread (`main/liveworker.js`, started by `main/livehost.js` on the first request), on Windows through
`app/helper/sxlive_helper.c` (plain Win32, `PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION` only, compiled by the
gate with `x86_64-w64-mingw32-gcc`, never run here). The page: the section window and the card boxes and the Whole
file box put their text back through `apply_edited_text` (`ai.card_edit` op `apply_text`), so an untouched line keeps
its ending; `prompt()` (which Electron lacks) is replaced by the page's own dialog. The harness gains seven modules
(`tests/oracle_s6.py`, `tests/run_diff_s6.js`): `aitool` (both kernels, all 512 scenes of both scene.bin copies,
every AI text made from them, the config copy's ai\ files, 2,000 generated texts and 30 block mutations, save_ai),
`aicards`, `aiexplain`, `ailibrary` (every recipe at every edge of every value), `kernels` (a fake game and mods
folder with loose kernels and plain, LZMA, LZS and broken .iro archives; and this machine's own folders), `lzma`
(every entry of the New Threat .iro read as stored, and every entry packed again with Python's own lzma under seven
setting sets, in 70 archives; 4,000 streams cut or corrupted at every output limit; LZS streams; kernel2.bin) and
`live` (46 cases over 11 fake /proc images: the reader, the seqlock under faults, every table decoded, every route).
`tests/unit/s6.test.js` holds the plumbing (the routes, the worker on a fake /proc, the helper's protocol through a
node stand-in, `tests/unit/fake_helper.mjs`, giving the same answers, the read-only checks); `tests/smoke/s6/` the
hidden-window test (the AI page, its section window and Save against Python's assembler, the kernel chooser, Live).
After the S6 review (2026-10-28): the assembler counts the bytes of a block past 64 KB instead of holding them, so a
huge `fill` gets the reference's "block is N bytes" message (MemoryError only past 2**47 bytes); a card edit on the
file's last line keeps "no final newline"; `ai.save` and `ai.open` go through the path rules of design 1.4 (a
`Backups` or `ai` folder that is a link out of the config folder, a Windows device name such as `CON`); a kernel id in
a route's body must be one of the chooser's list or the choice in use, and an `.iro` path that is a FIFO or a device is
refused before it is opened; the helper bridge waits on the answer's number itself (no lost wake-up after a timeout);
the helper's fallback map reaches 0xffff0000 (ff7_en.exe is large-address-aware). The gate fails on a skipped JS test;
the read-only check looks at every `openSync`'s flags; the differential gains hand-made LZMA streams (a distance at and
past the output, at and past the dictionary as liblzma rounds it) and gzip members (header CRC, trailer CRC and length,
optional fields, members, padding, every cut); the S6 smoke test's AI file has CRLF script lines and an edit in the
Whole file box. The Python reference: `aipage.save_ai` removes a `.tmp` first and opens it with `'xb'` (as
`safety.atomic_write`), and `test_kernels`' oversized upload accepts a closed socket as the 413 it is.

**Stage S6a (2026-10-28): the character, limit and AI templates.** The template format gains its four additions in both
parsers (`sxcfg/templates.py` first, then `app/core/templates.js`): `switch` placeholders (and `switch(NAME)`, a switch
that may be on only while another is), gated body lines (`<?NAME>` / `<?!NAME>`: a closed line is written commented out,
its placeholders at their defaults and unchecked, or dropped when it names the ID of a part that is not written),
`exclusive = A, B` and `when = NAME` on a part (the part, and the IDs it allocates, only with the switch on), plus warn
lines shown under switches (`warn = S !T: text`). New types, every value asked of the readers' own rules (`level`,
`gear_id(weapon, owner)` by the kernel's equip mask, `gear_id(armour)`, `gear_id(accessory)|none`, `portrait`,
`battle_prefix`, `ai_word(...)`, `ai_ref`, `kernel_name(N)` / `kernel_desc(N)` / `kernel_stat(N, field)` read from the
user's KERNEL.BIN at run time, `limit_item_id`, `text11`, `text24`); the kernel readers the editor lacked (the start
records of section 3, the weapons' equip masks, the attack names and descriptions). `app/core/data/vanilla_limits.json`
(the Limits readme's table) and `character_reference.json` (the survey's vanilla model, skeleton, portrait and AI-entry
facts; copies beside the Python tool, checked identical) feed `tools/make_character_templates.py`, which writes the
eleven character templates (the nine kernel characters, Young Cloud, Sephiroth: Option A by default, Option B, a
starter weapon, an AI) into both copies of `builtin_templates.txt`. The AI section: the game's character AI exported
(kernel entries 0, 1, 2, 3, 5, 7, 10, and an entry vanilla leaves empty when the chosen kernel fills it; the entries an
entry links to come along at their own numbers, so Barret's, Tifa's and Yuffie's carry entry 3) and five recipe cards.
Routes: `lib.reference`, `lib.suggest` with the three character checks and the leftover groups, `lib.preview` with the
DLL's notes and the prerequisites (and the AI cards' text, check, size and English), `ai.stage` / `ai.unstage` (staged
files written by Save and Save all into the save's one backup folder, byte for byte what `save_ai` writes), `ai.rename`
(with `update_refs`), `ai.delete` (refused while used, unless forced), `file.edit` `remove_section` with `with_limits`.
The page: the Library's Character and AI kinds (switches, the reference panel, "adopt the leftover group", "make one
now"), the Characters page's Linked strip and remove-together, the Limits page's leftover mark, the tool's own warnings
on both pages (a missing AI file, a leftover group), the AI page's Rename, Delete and staged files. The harness gains the
module `chartpl` (`tests/oracle_s6a.py`, `tests/run_diff_s6a.js`: 70 cases: every character template under every switch
state and every edge value, on the config copy and the example config, inserted twice; the refusals; the types against
their edges and the fuzz; the cards, the reference panel and the kernel readers on the game's kernel, New Threat's and
none; the ID checks; the AI cards and the exports); the Python reference gains `tests/test_character_templates.py`
(4.11's list); `tests/unit/s6a.test.js` holds the routes; `tests/smoke/run_smoke_s6a.sh` the hidden-window flow.

**Stage S7 (2026-10-28): packaging.** `build/build.sh` (no argument: both platforms) builds from the verified Electron
zips, adds `examples/FF7_SpellExt_Templates.txt` beside each README, and writes the release zips to
`build/out/release/` (`SpellExt_Config_<version>_linux64.zip`, `..._win64.zip`, `SHA256SUMS.txt`; nothing is
published). `build/zip_release.sh` does that last step: an earlier zip of the platform built (any version) is removed
with its listing, and `SHA256SUMS.txt` lists every zip left, so the folder holds one zip per platform. The user-facing READMEs (`build/README_linux.txt`, `README_windows.txt`, shipped as
`README.txt`) say how to open the folder, the Library and the example file, where backups go, the Linux sandbox and
`ptrace_scope` notes, and that Live tables on Windows is not tested. `tests/check_release.py CONFIG_COPY` lists each
zip into `<zip>.contents.txt` and checks every member: Electron's own files byte for byte, the binary differing from
Electron's in exactly the three fuse bytes; ours equal to `app/`, the README and the example file; the Windows helper
byte for byte what `app/helper/sxlive_helper.c` compiles to now with `build.sh`'s `HELPER_FLAGS` (compiled again
under `tests/_work/release`; `-Wl,--no-insert-timestamp` makes two compiles identical); no Python, no
tests or build folders, only text besides the icon and the helper (no game data), no path of this machine, none of the
user's own content (words read from the config copy: the custom characters' names, their limits and states, the
`ai\` files, and the names in its Spells, Items, Weapons, Armour, Accessories, Materia, Effects and ParkedLimits
files that its `Readme/` does not use); `--self-test` plants faults and must catch each. `tests/smoke/run_smoke_s7.sh`
checks that the zip's `package.json` starts `main/main.js`, then launches the Linux release build itself (the zip's
fuse-patched binary and its `resources/app`, a smoke entry added in the work copy only) hidden once, read only, and
compares the CSP header and both meta tags with the design's text; `tests/unit/shell.test.js` checks that
`main/main.js` ends with its autostart line. `tools/sync_external_tools.sh config` copies the app's source into the repo's
`External Tools/SpellExt Config/` (`app/`, this README, `build/build.sh`, `zip_release.sh`, `verify.sh`, the two
README texts, the example file); `fuses.py` and `make_icon.py` stay here (no Python enters `External Tools`), so the build runs from
`tools/`. The version is 0.11.0 (2026-11-15: the Portrait block of a character's page, stages 1 and 2, and the 3D view beside the formation diagram, stages 1 to 3, both below; their words for the user are in `build/README_*.txt`; 0.10.0, 2026-11-14: the formation diagrams, the Game formations page, the scene.bin and battle.lgp of the Settings menu and the enemy Model block, stages 1 to 4 below; 0.9.0, 2026-11-13: the config refresh, stages A to D2 below: the DLL's newer keys, the Enemies file, the scene and enemy pages, the scene checks, the enemy AI, the save safety; 0.8.3, 2026-10-29, added the character file's `portrait = NAME` for the game's own menu portraits, with the DLL; 0.8.2 the wide and new gear ranges).

**Config refresh 2026-11-13, stage B (the version stays 0.8.3 until the release).** Three more sidebar entries:
**Enemies file** (`FF7_SpellExt_Enemies.ini`, a kind page like the others), **Scenes** (`scenes\*.ini` and
`scenes\generated\*.ini`) and **Enemies** (each enemy folder's `enemy.ini` and `generated.ini`), the last two listed as
the DLL's start-up scan sees them (names without case; no model, AI or other file of those folders; a link out of the
config folder not listed). They open as Raw text, editable, generated files too: the file's line says that these files
have their own grammar (only `;` starts a comment) and, on a generated file, that running the converter again
overwrites it. Problems has the scan's forecast (each scene file it would skip, on that file, and its counts). The port:
`app/core/rules/enemies.js`, `app/core/enemyscan.js`, `EnDocument` in `app/core/document.js`; the harness module
`enemyscan`.

**Config refresh 2026-11-13, stage C1 (the version stays 0.8.3).** Problems now also has every registered scene's
build as the DLL makes it when one of its battles is handed over: a refusal on the file and line it names (a scene
file's or an enemy file's view shows it), the build's notes, "not forecast" (a tool line) where the game's scene.bin
or kernel2.bin is needed and the game folder does not have it, and a summary line under the Enemies file. The port:
`app/core/scenebuild.js`, `app/core/gamedata.js` (of `sxcfg/scenebuild.py`, `sxcfg/gamedata.py`); the CLI's `scene`;
the harness module `scenebuild`. The scene and enemy form pages are stage C2.

**Config refresh 2026-11-13, stage C2 (the version stays 0.8.3).** The scene and enemy files have a **Form** tab like
the main files' kind pages: the section list (each section's kind: `[scene]`, `[formation 0]`-`[formation 3]`,
`[enemy]`, `[attack NAME]`, any other one marked "not read"), a row per key with its help, range and default from the
schema's `en_files`, Advanced, Add a key, Section text, and the problems on their rows, in the files' own grammar
(EnDocument: a line the form does not change keeps its bytes). Each row says where its value stands in the DLL's
overlay: in your file "wins over the generated line N: VALUE" (with "use the generated value", which removes your line)
or "only in your file"; in the generated file "NOT USED: your file's line N gives VALUE" or "used", with "override in
your file", which writes the key into your file (`scenes\NAME.ini`, `enemies\FOLDER\enemy.ini`), made when the folder
has none and written by its first Save (Reload drops it). The keys a section takes from the other file are listed
under the rows ("override here"), and a section only the other file has is in the section list, greyed. A generated
file says at the top that a converter run overwrites it. A formation of `kind = surrounded` (its own, or formation 0's)
shows the party's triangle and which row stands before which place, as the build assigns them (at most 2 a place);
`party_radius` and `party_front` given with another kind are said to be read and unused. **Check this scene** (on an
enemy file: the scenes that use it) and **Check all scenes** (also on Problems, with a count) give the build's verdict
in the DLL's words. The AI page lists **Enemy AI** (each enemy folder with its `ai` key): one opens under the enemy's
rule (one entry; only its own attack IDs, in en_ai_attacks' words); Save writes the text and assembles the block the
DLL reads (`ai.ai.txt` -> `ai.ai`, as `tools/ai_tool.py asm`). Minors of review C1: the item names come from the
kernel2.bin beside the KERNEL.BIN the AI page is set to (the game folder's when it has none; the summary line names
the file); the log page files a refusal with no file label under its enemy's file (and where the check files the same
problem) and the scene name `-` as no name; with none of the game's data the check says "not forecast" once, in the
summary line (a scene's own page still shows its line); the Problems page's sentence. The port: `app/core/enform.js`
(of `sxcfg/enform.py`), `app/renderer/enpage.js` (the same bytes as the Python page's `sxcfg/static/enpage.js`); the
routes `scene.check`, `scene.range`, `ai.enemies`, `ai.enemy_open`, `ai.enemy_cards`, `ai.enemy_save` and the edit
op `en_override`; the harness module `enform` (`tests/oracle_c2.py`, `tests/run_diff_c2.js`); the hidden-window smoke
`tests/smoke/run_smoke_c2.sh` (it plants a scene and two enemies of its own in the copy).

**Config refresh 2026-11-13, stage D1 (save safety; the version stays 0.8.3).** The minors of review C2, the same in
both ports (`tests/test_enform.py` class StageD1 and `tests/unit/stage_d1.test.js` hold the same cases and words; the
harness module `enform` has a case `d1`): no write through a link inside the config folder (the Enemy AI Save, an
override's user file, a scene or enemy file's Save: refused when the file or a folder on the way is a symbolic link,
`paths.js no_link` / `safety.no_link`); the AI text and block written through two `.tmp` files and renamed text then
block, the old text put back when the block's rename fails, a `.tmp` in the way refused before the backup, no `.tmp`
left; an `ai` name that is `.` or `..`, ends in a dot or a space, breaks another Windows name rule, or names an `.ini`
block, refused before anything (`enform.ai_save_problem`, shown in the AI title); a block that does not disassemble
opens from `ai.generated.txt` (or empty) with the error in the title; a scene or enemy file with a CR not followed by
LF flagged on the form (`en.lone_cr`) and overrides refused on it (Raw as before); "use the generated value" (the edit
op `en_use_generated`) removes the section too when it is one an override added (nothing but blank lines left, no
comment on its header, not in the file as last opened or saved), and then the blank line before it that the override
added; so an override taken back gives the file's bytes back. A real write error is a refusal (the backup, a `.tmp`). The Python reference also refuses a character the file cannot hold before its backup
(the app did already) and clamps Check all scenes' start at 0.

**Config refresh 2026-11-13, stage D2 (the 0.9.0 release).** `app/package.json` says 0.9.0; the user READMEs (`build/README_linux.txt`, `README_windows.txt`) open with "What's new in 0.9.0" (the new keys, the Enemies file, the scene and enemy pages with the surrounded panel, the scene checks, the enemy AI, the save safety: no user content named) and say that `--game` also serves the scene checks. Built with `build/build.sh` from the pinned Electron v44.7.0 in `build/downloads` (nothing downloaded); the zips `SpellExt_Config_0.9.0_linux64.zip` and `..._win64.zip` are in `build/out/release/` with `SHA256SUMS.txt`, checked by `tests/check_release.py` (every file of `app/` must be in each zip, so `app/renderer/enpage.js` and the other stage B-D1 files are; its user-content words now also hold the config copy's scenes and enemies: the names of the files in `scenes\` and `scenes\generated\`, of the folders in `enemies\`, and a `[scene]` or `[enemy]` section's `name`, each unless the DLL's Readme uses it, with a substring test before each word's regex; `--self-test` plants a scene file's, an enemy folder's and an enemy's name). The S6 smoke was not run for this release: its AI section window comes from `window.open`, which `main.js` allows with no `show: false`, so it would be a visible window. Nothing is installed by the build: `tools/sync_external_tools.sh config` and the user's own copy of the app are later steps.

**Formation diagrams, stage 1 (2026-11-13, still 0.9.0).** Ports of the Python reference's stage 1, field for field:
`app/core/formation.js` (one formation's layout for every kind: the party's places for 3, 2 and 1 members with the
back-row spots and facings, from the game's four place tables written in with their exe addresses; the enemies'
facings; the DLL's surrounded triangle; the formation's camera record 0, the view at the start; the notes), `enform.view`'s `formations` (from the keys, the
camera of the `camera = S:F` stand-in), `gamedata.js` keeping every scene's formations and enemy names, `discover.js`
`scene_bin_mods` (an active 7th Heaven mod's own `battle\scene.bin`, seen, not read). The page: every `[formation N]`
of a scene form shows the diagram (`EN.formation` in the shared `enpage.js`; seen from above, front at the top, +x to
the LEFT, as the game's camera shows it), and a sidebar entry **Game formations** after Scenes lists the 1,024 battles
of the scene.bin read and draws the chosen one. The **Settings** menu's **scene.bin**: "Choose a file..." (the main
process's dialog, route `app.game_file`; the page never sends a path) or "Use the game folder's"; kept in settings.json
(`scene_bin`); read in place of the game folder's for the scene build forecast, the Game formations page and the
formation's camera record 0; the menu's line, the check's summary and the page name the file read; a file that cannot be read or is not a
scene.bin is said, never replaced by the game folder's. `sxcfg-cli.js` gains `formations [BATTLE]` and `--scene-bin
FILE` (check, scene, formations). Routes `app.game_file`, `game.formations`, `game.formation` (preload allowlist).
`main.js`: the AI section window (`window.open`) is now made with the main window's `show` (hidden in the smoke tests),
so smoke S6 no longer maps a window. Tests: `tests/unit/formation.test.js`, the harness module `formation`
(`tests/oracle_f1.py`, `run_diff_f1.js`), smoke F1 (`tests/smoke/run_smoke_f1.sh`, `f1/`: every DLL kind, kinds 0-8 of
the game, the Settings menu's scene.bin set, cleared, a bad file, the good one again; PNG pictures of the diagrams), the
command lines side by side in `run_tests.sh`.

**Model preview, stage 2 (2026-11-13, still 0.9.0): the files, read and parsed; no drawing yet.** Ports of the Python
reference's `archives`, `battlemodel`, `mods7h` and `modelsrc`, field for field (the differential compares their whole
descriptions; floats as float32 bits, textures by the sha256 of their RGBA): `app/core/archives.js` (an LGP's table of
contents only, an .iro's directory and entries), `battlemodel.js` (the skeleton, frame 0 of the first animation, the
parts posed with a sine table made with + - * / only, the textures at every depth as RGBA, the problems in the
reference's words), `mods7h.js` (7th Heaven's current profile, each active mod's `mod.xml`, with the reference's small
XML reader), `modelsrc.js` (each file's source in the order the running game asks: SpellExt's pool [read from the
code], 7th Heaven's active mods [read from 7th Heaven 4.6.1's code, by review F2], FFNx's direct folder [read from the code], the archive; what each file
overrides). The **Settings** menu gains **battle.lgp** ("Choose a file..." / "Use the game folder's", kept in
settings.json as `battle_lgp`): read in place of the game folder's `data\battle\battle.lgp` for the models; a file that
is not an LGP is said, never replaced by the game folder's. `sxcfg-cli.js` gains `model FOLDER|LETTERS|NUMBER` (and
`--all`, `--json`, `--battle-lgp FILE`, `--7th-heaven DIR`, `--no-mods`), the Python tool's `model` byte for byte.
Review F1's minors: enemy names read through FF7's characters from 0x60 (`gamedata.display_name`: the dot between
"Jenova" and "BIRTH"); `--scene-bin` and `--battle-lgp` refused where they are not read and a relative FILE named in full;
an app settings.json (or the Python tool's settings file) that cannot be read is said in the Settings menu and never
written over; the camera's words ("the formation's camera record 0 (the view at the start)"); `discover.active_mods`
now takes only the mods the profile has switched on (`IsModActive`). Tests: `tests/unit/models.test.js`, the harness
module `model` (`tests/oracle_m2.py`, `run_diff_m2.js`, the planted world of `spellext_config/tests/model_fixtures.py`),
smoke F1's battle.lgp steps, and the `model` command lines side by side in `run_tests.sh`. After review F2: a part
whose polygon groups overlap is refused (its triangles were unbounded), `kernels.iro_entries` refuses a directory the
file cannot hold or an entry shorter than its fields (it looped for ever: this also guards stage 1's scene.bin check
and the AI page's kernel finder), an LZS entry stops at 64 MB (`lzs.js` writes into a Buffer), an `ActiveWhen` nested
more than 32 deep is not understood, a mod's top folder is used when none of its folders is active (7th Heaven
4.6.1's rule), a settings value that is not a path is said, and `app.game_file` takes only a game file of the settings.

**Model preview, stage 3 (2026-11-14, still 0.9.0): the renderer; no panel yet.** `app/renderer/modelview.js` (the
same bytes as the Python page's `sxcfg/static/modelview.js`; no page loads it yet): a small software rasteriser on a
2D canvas, no library. `prepare(description)` checks and decodes a model as `battlemodel` describes it (posed in
frame 0; the textures' pixels as bytes or base64); `render(mesh, view, width, height)` draws it into RGBA, the same
bytes in Node, Firefox and Electron (no transcendental Math: the sines are battlemodel's table); `attach(canvas,
mesh)` turns it with the mouse (drag, wheel, double click or a reset button, the arrow keys and + - 0). It looks as
the game looks: the game's own look-at (up -y, no mirror), the model's front at -z, v = 0 the texture's first row,
the nearest texel wrapped, alpha 0 not drawn, texture times vertex colour, a tie in depth to the later triangle (as
FFNx draws), no culling. Its work is bounded whatever it is given (a side of 1024, a zoom of 2.5 so the eye stays
outside the model, 200,000 triangles, 600,000 vertices, coordinates within 1,000,000, the near plane, triangles filled
row by row over the pixels they can cover, 14 visits a pixel, a visit being a span's pixel or a row examined;
review F3), each limit said. Tests:
`tests/unit/modelview.test.js` (the copies, the Math scan, the sine table, the decoding of every model, every texture
depth and the colour key, real models, the worst frame of the costliest models at 48 views, no real model cut short,
hostile input (review F3's coplanar textured model and its off-canvas one among it), the widget), `tests/modelview_fixtures.mjs` (the
fixed models and views), smoke MV (`tests/smoke/run_smoke_mv.sh`, `mv/`: the same sha256 for every picture in Node,
in the Python page in a headless Firefox and in the app's page in a hidden window), and the Python tool's
`tests/test_modelview.py` (the posed geometry against `tools/anim_retarget.py`).

**Portrait panel, stages 1 and 2 (2026-11-14): the Portrait block of a character's page.** On a character's section in the Characters
file ([12] to [43], not commented out), `PT.block` in `portrait.js` (same bytes in both pages) asks the route `character.portrait`
(`{id, have}`, in `ipc.js`'s table and the preload's allowlist; the Python page's `/api/character/portrait?id=NN`) and draws the
answer: the character's picture in the main menu's size and in the `_l` size, the part the game draws marked (a dashed line where
the main menu stops, 80 of 84 pixels), the lines that say where each comes from (marked read or inferred), the base's picture when
the character has none of its own. It never offers to write. `core/portrait.js` makes the answer (the Python port's `portrait.py`,
field for field, the same words): the rules' record (`rules/characters.js` keeps `portrait`, `portrait_form`, `portrait_number`,
`portrait_fit`, `base_used`...), the loose-file index of `files\` as the DLL walks it (depth 12, 100-byte names, the 320-byte game
path of a folder, the first of two equal names), the PNG header's verdict in the DLL's words (`core/pnghead.js`), the DLL's crop
box, the menu archive (the `menu_lgp` setting, FFNx's override folder, the game folder's; `archives.js` `read(name, cap)` refuses an
entry over the cap before reading it). Picture (B): a PNG is decoded by the page's browser, a `.tex` by the core. The route runs in a
worker thread (`main/portraithost.js`, `portraitworker.js`: one job at a time, a newer request for the same character replaces a
queued one), so a large decode never freezes the window; the worker keeps the last answers up to 32 MB; `file.reload` drops them. The
Settings menu gains **menu archive** (`menu_lgp`). The command line: `node tools/sxcfg-cli.js portrait [--menu-lgp FILE] [--7th-heaven DIR] [--json]
ID`, the Python tool's `portrait` byte for byte. Tests: `tests/unit/portrait.test.js`, the differential's `oracle_p1.py` /
`run_diff_p1.js`, smoke P1 (`tests/smoke/run_smoke_p1.sh`, `p1/`: the block in a hidden window and in the Python page in a headless
Firefox, each canvas against Node's pixels), the `portrait` command lines side by side in `run_tests.sh`.
**Stage 2 adds picture (A), what the game draws:** FFNx's replacement texture where one is served, else stage 1's picture. `core/dds.js` reads a DDS
(uncompressed RGB with or without alpha, 32 and 24 bits, and BC7, decoded as stored; the header judged before any pixel is read, only the drawn rows
or blocks read), `core/mods7h.js` `lookup` finds a file in the active 7th Heaven mods (profile order, then mod.xml's folder order; case-blind, every
folder listed once and kept by stamp), `core/pnghead.js` `dims` judges an FFNx `.png` replacement (the page's browser draws it), and `core/portrait.js`
reads `FFNx.toml`'s `mod_path`, `mod_ext`, `override_mod_path` and `direct_mode_path`, looks up `<name>_00.<ext>` (`<p>` for the character's own file,
`menu/<stem>` for a texture read from the menu archive), FFNx's direct menu folder before the archive, and fills each picture's `served`
(`replacement` or `texture`), `replacement` and its source lines (marked read or inferred). The 7th Heaven is the one the config folder sits in, else
the page's `--mods`; the command line has `--7th-heaven DIR`. Tests: `tests/unit/dds.test.js` and `portrait_repl.test.js`, the differential's `ddshead`,
`bc7` and `panel_repl_*` cases, smoke P1 in two passes (planted replacements, then the user's own, read only), the `portrait --7th-heaven` command
lines on the user's real tree (read only, the same stat before and after).

**Model preview, stage 4 (2026-11-14, the 0.10.0 release): the Model block of an enemy file's form.** On the `[enemy]`
section of an enemy file (the user's `enemy.ini` and the converter's `generated.ini` alike; also when that section is
only the other file's), `EN.model` in `enpage.js` (same bytes in both pages) asks the route `enemy.model` (`{name,
have}`, in `ipc.js`'s table and the preload's allowlist; the Python page's `/api/enemy/model?name=FOLDER`) and draws
the answer with `modelview.js` on a 400 x 400 canvas scaled by CSS, never by the device pixel ratio (every bound of the
renderer is per canvas pixel): the first frame at once (a window never shown has no animation frames), then the
widget. Beside it: the model's number (`model 183 (files hb..)`, or `pool (365 + slot): shown as slot 1, model 365
(files ob..)`), the lines of `modelsrc.describe` (the DLL's refusal, "has no aa", a file in none of the sources), the
model's problems and notes, the renderer's own notes, a row per file (where from, its mark, what it overrode), the
sources looked in (with 7th Heaven's lines, a runtime-conditional folder among them) and what is not shown (FFNx's
texture replacements, the battle lighting, semi-transparency drawn opaque, the pose). It has one control, Reset
view: it never offers to write. `core/modelsrc.js` `panel()` makes the answer (the Python port's `panel()`, field for
field): the enemy's folder must be one the scan lists (`enemy_files`: no path is made from the name before), `have` a
64-digit digest; the model is carried as `battlemodel.portable` gives it (the textures' pixels as base64), and not at
all when the page's digest is the answer's (`same`). The caches (PLAN D8, `modelsrc.Caches`, one per process): 7th
Heaven's data (the active mods as read) kept while every file and folder that read looked at keeps its stamp (`mods7h`
notes them, `tracked`); the last 8 models described kept while what decides their sources (`Sources.fingerprint`) and
every file read keep their stamps, at most 128 MB of them (an entry larger than that is answered and never kept; each
keeps one form of the pixels, the base64 it sends: review F4); each model's textures are decoded only up to 24 MB of
RGBA in all (`battlemodel.describe`'s `tex_budget`, the panel's only: the command line is unchanged), a texture past
that drawn untextured with a note ("obad: drawn untextured (the panel's texture budget of 24 MB is used)"), and (review F4
round 2) its parts parsed only up to what the renderer draws (`geo_budget`: `MV.MAX_TRIANGLES` and `MV.MAX_VERTICES`,
read from `renderer/modelview.js` itself), a part past that not parsed, with a note ("obao: not drawn (the panel's
200,000-triangle budget is used)"); the LGP and .iro indexes are `archives.open_cached`'s. The form's Reload
(`file.reload`) drops them all, and the page forgets its model (`EN.modelForget`). Tests: `tests/unit/modelpanel.test.js`
(every line of PLAN D9 through the route on the Python fixtures' `panel_world`, the payload, the digest, the refusals,
the caches: kept, a changed texture, a changed `mod.xml`, Reload, at most 8; nothing written), the harness module
`model` gains `panel` (both ports' answers byte for byte on the panel world and on real enemies of the copy, each asked
twice through one cache), and smoke M1 (`tests/smoke/run_smoke_m1.sh`, `m1/`: a DLL enemy, a numbered model's user and
generated files and a planted enemy with no `model\aa`, in the app's page in a hidden window and in the Python page in
a headless Firefox: the words against Node's answer, the canvas's sha256 against Node's render of the same answer,
Reload, no control but Reset view, no page error, the copy unchanged; pictures of each block to a folder given).

## Where S6a differs from the design, and why

- The proof leaves the DLL's notes out: a character without `base` makes the DLL log "character N has no base: built
  from its own sheet ..." (kind note), which is information, not a refusal. The preview shows the notes apart ("The DLL
  will also note"); only new problems turn Add off.
- A limits part's kind is the reader's own word: `character` for `[N]`, `limit` for `[N L-P]` (design: `limit_character`).
- The default ID of a character skips none of the three checks (4.11 item 5; 4.9 said "never takes an ID whose group
  exists"): the checks are warnings under the ID, and the leftover groups are offered as "adopt the leftover group".
- `switch(NAME)` is a type argument, not a fifth construct: Vincent's "editable copy" is offered only with "borrow".
- The battle_files warning is the tool's (any character section with `battle_files`), not a template `warn`.
- `kernel_desc` writes FF7's quotes and ellipsis plainly (`"`, `...`): the DLL reads 0x20-0x7e only.
- The limit item ID defaults to the first free one at run time (105 is taken in the user's folder).
- The starter weapon's name defaults to the class's first weapon's vanilla name plus " II", from the data file.
- Sephiroth's guest record holds 262 Gold Armlet and 296 Touph Ring by the kernel (the survey named them Silver Armlet
  and Earring); the numbers were right and are what the template writes.
- "character [14] has limits = cloud and a group of its own: the group wins" (4.9) is not given: Option B makes exactly
  that on purpose. "Limits.ini group N has no character [N]" is (the Limits page's tool warning).
- `from_kernel` did not bring the linked entry along (design 7.18 settled): the Library's export uses a new
  `bring_links` option (`aipage.export_block` / `aitool.export_block`); the AI page's "New from the kernel" is unchanged.
- The AI cards are data in `templates.py` / `templates.js`, not blocks of `builtin_templates.txt` (they have no `.ini`
  part). A staged name follows the characters port's `ai` rule (1 to 31); `ai.save` keeps the reference's 32.
- The reference panel and the character types read the game folder's KERNEL.BIN, else the AI page's chosen one; the AI
  cards export from the AI page's chosen kernel (as "New from the kernel" does).
- "Save as template" is not offered on a character section (characters were not among 4.6's kinds).

## Layout

```
app/core/            the port (ES modules, Node built-ins only, no Electron import)
app/core/data/       spellext_schema.json (the Python tool's copy, unchanged)
tools/sxcfg-cli.js   check, set, roundtrip, get, diff, scene, formations: the port's command line (writes nothing)
tests/oracle.py      python3 -I: the corpus and the reference's answers -> tests/_work/{corpus,expected}, and
                     tests/_work/manifest.json (cases per module; run_diff.js fails on a module missing or short)
tests/corpus.py      the corpus generator (fixed seed), used by oracle.py
tests/run_diff.js    /usr/bin/node: the same inputs through app/core -> tests/_work/actual, compared
tests/unit/*.test.js node --test: the JS-only checks (the C cfmt table, py.js, difflib, document, safety, validate,
                     rules: the readers' order, pyFind, pyIn; harness: run_diff.js's error names and corpus minimum)
tests/_work/corpus_base/rules_base.json   the config copy's texts and the schema's messages, which every `rules`
                     case starts from (written once by oracle.py)
tests/run_tests.sh   the gate: Python suite, oracle, differential, unit tests, the two command lines side by side
package.json         {"type": "module"} only: Node before 22.7 does not detect ES modules on its own
app/package.json     the app's own (name, productName, version, main: main/main.js, type: module)
app/main/            main.js (Electron), ipc.js, paths.js, save.js, store.js (plain Node: tested under /usr/bin/node)
app/preload/         preload.cjs (sandboxed, CommonJS)
app/renderer/        index.html app.css app.js library.js live.js aiwin.html aiwin.js (the Python page, adapted),
                     open.js (the first screen), kinds.js (S4: the sidebar's entries, the Section text rules),
                     icon.svg, icon.png (made by build/make_icon.py)
build/build.sh       [linux] [win]: download once into build/downloads/<version>/, verify twice, unpack into
                     build/out/stage, add app/ as resources/app, fuses off, zip (bsdtar); win needs the S6 helper
build/verify.sh      the two sha256 checks (the release's SHASUMS256.txt, the pinned value)
build/fuses.py       RunAsNode, NODE_OPTIONS and --inspect fuses off; --check reads them back
tests/unit/shell.test.js  the path rules, validators, preload allowlist, protocol, argv, settings, Save, Save all,
                     the Windows rename retry
tests/unit/build.test.js  fuses.py and verify.sh refusals, the pinned sums, the Node-22 scan of app/
tests/smoke/         the hidden-window smoke test: run_smoke.sh CONFIG_COPY (smoke.mjs drives the real main process,
                     preload and page in build/out/smoke_electron, the pinned Electron unpacked from the verified zip)
tests/smoke/s4/      S4's: run_smoke_s4.sh CONFIG_COPY (every sidebar page reached; a spell of the CRLF Spells file
                     edited by form, Section text and Raw and saved, only those three lines changed on disk; the
                     problem jumps, Advanced, a commented-out section, Add section after, the Game options)
app/core/templates.js   S5: the template library (port of sxcfg/templates.py); data/builtin_templates.txt
app/renderer/templates.js  S5: the Library page and the Save as template dialog
examples/FF7_SpellExt_Templates.txt  S5: the example user-templates file (vanilla bases); in the mod package as Examples/FF7_SpellExt_Templates_Example.txt (beside SpellExtConfig)
tests/unit/templates.test.js  S5: the built-in file, the example file, the lib.* routes (insert as one change,
                     save/remove/import/export of the user's file)
tests/smoke/s5/      S5's: run_smoke_s5.sh CONFIG_COPY (the Library in the hidden window; bytes against Python's)
app/core/aitool.js ...    S6: aitool aicards aiexplain ailibrary kernels lzs lzma live livetables liveapi;
                     data/live_layouts.json (the Python tool's copy, checked identical by the unit tests)
app/main/liveworker.js    S6: the Live reader's worker thread (and the helper bridge: Atomics on a shared buffer)
app/main/livehost.js      S6: starts the worker on the first live.* route; on Windows runs sxlive_helper.exe
app/helper/sxlive_helper.c  S6: the Windows Live helper (plain Win32; built by build.sh win; not seen working)
tests/oracle_s6.py, tests/run_diff_s6.js  S6's modules of the harness (oracle.py and run_diff.js take them in)
tests/unit/s6.test.js, tests/unit/fake_helper.mjs  S6: routes, worker, helper protocol, read-only checks
tests/smoke/s6/           S6's: run_smoke_s6.sh CONFIG_COPY (the AI page, section window, Save, kernel chooser, Live)
app/core/data/vanilla_limits.json, character_reference.json  S6a: the vanilla data the character templates are made from
tools/make_character_templates.py  S6a: writes the character part of both builtin_templates.txt (--check, --print)
tests/oracle_s6a.py, tests/run_diff_s6a.js  S6a's module of the harness (chartpl)
tests/unit/s6a.test.js    S6a: the routes (lib.reference, the bundle and a staged AI saved together, rename, delete,
                     the Linked strip, the leftover mark, remove-together)
tests/smoke/s6a/          S6a's: run_smoke_s6a.sh CONFIG_COPY (the Character and AI kinds, Save all, Rename)
build/out/release/    S7: the release zips, SHA256SUMS.txt, each zip's .contents.txt listing
build/zip_release.sh  S7: build.sh's last step (one zip per platform; SHA256SUMS.txt lists every zip)
tests/check_release.py    S7: the zips' contents checked (--self-test: planted faults caught)
tests/smoke/run_smoke_s7.sh, s7/  S7: the Linux release build itself launched hidden once on a copy, read only
tests/unit/kinds.test.js  kinds.js in a vm context: the sidebar, the Section text's raw range (CRLF to LF, a blank
                     last line kept) put back through file.apply_text on a CRLF file, the shops table, the badges
app/core/rules/enemies.js, app/core/enemyscan.js  stage B (2026-11-13): the enemies registry's reader and the DLL's
                     start-up scan of scenes\ and enemies\ (ports of sxcfg/rules/enemies.py, sxcfg/enemyscan.py)
tests/unit/enemies.test.js  stage B: the scene and enemy files through the routes (listing, grammar, a generated file
                     saved with its note, the scan's lines on their file, the gate refusing a model file)
app/core/scenebuild.js, app/core/gamedata.js  stage C1 (2026-11-13): a DLL scene's build and the game data it reads
                     (ports of sxcfg/scenebuild.py, sxcfg/gamedata.py)
tests/unit/scenes.test.js  stage C1: a scene's build through the routes (its line on the enemy file's line, an unsaved
                     edit, "not forecast" without the game, the CLI's scene)
app/core/enform.js, app/renderer/enpage.js  stage C2 (2026-11-13): the scene and enemy files' form pages (the overlay,
                     the override, the surrounded triangle, an enemy's AI rule; enpage.js is the Python page's file)
tests/unit/enform.test.js  stage C2: the form pages through the routes (round trips, the override and its new file,
                     the triangle, Check this scene / all scenes, an enemy's AI saved as ai_tool.py asm assembles it)
tests/oracle_c2.py, tests/run_diff_c2.js  stage C2: the harness module enform
tests/smoke/run_smoke_c2.sh, c2/  stage C2: the form pages and the Enemy AI in a hidden window (a planted scene)
app/core/formation.js  formation diagrams stage 1: one formation's layout (port of sxcfg/formation.py)
tests/unit/formation.test.js  stage 1: the places table, the notes, the scene.bin setting through the routes
tests/oracle_f1.py, tests/run_diff_f1.js  stage 1: the harness module formation
tests/smoke/run_smoke_f1.sh, f1/  stage 1: the diagrams, the Game formations page and the Settings menu's scene.bin
                     in a hidden window (five planted scenes; PNG pictures to a folder given); stage 2: its battle.lgp
app/core/archives.js, battlemodel.js, mods7h.js, modelsrc.js  model preview stage 2: the files of a battle model, where
                     each comes from, parsed (ports of sxcfg/archives.py, battlemodel.py, mods7h.py, modelsrc.py)
tests/unit/models.test.js  stage 2: the LGP index, no transcendental Math, the settings.json never written over
tests/oracle_m2.py, tests/run_diff_m2.js  stage 2: the harness module model
app/renderer/modelview.js  model preview stage 3: the renderer (the Python page's sxcfg/static/modelview.js, same bytes)
tests/unit/modelview.test.js, tests/modelview_fixtures.mjs  stage 3: the renderer's tests and their fixed models
tests/smoke/run_smoke_mv.sh, mv/  stage 3: the same pictures in Node, the Python page (headless Firefox) and the app's
                     page (hidden window)
tests/unit/modelpanel.test.js  model preview stage 4: the route enemy.model, every D9 line, the caches, the refusals
tests/smoke/run_smoke_m1.sh, m1/  stage 4: the enemy Model block in a hidden window and in the Python page (headless
                     Firefox), its canvas against Node's render; PNG pictures to a folder given
```

## Running

```
cp -a "<the installed SpellExtConfig>" /some/scratch/SpellExtConfig     # a COPY: nothing is written to it
tests/run_tests.sh /some/scratch/SpellExtConfig
node tools/sxcfg-cli.js check --config /some/scratch/SpellExtConfig
node tools/sxcfg-cli.js set   --config /some/scratch/SpellExtConfig FF7_SpellExt_Game.ini - seats 3
node tools/sxcfg-cli.js roundtrip /some/scratch/SpellExtConfig
node tools/sxcfg-cli.js get  --config /some/scratch/SpellExtConfig FF7_SpellExt_Game.ini - debug
node tools/sxcfg-cli.js diff --config /some/scratch/SpellExtConfig FF7_SpellExt_Game.ini - debug no
node tools/sxcfg-cli.js diff OLD.ini NEW.ini
node tools/sxcfg-cli.js formations --config /some/scratch/SpellExtConfig --game "<game folder>" 982
node tools/sxcfg-cli.js check --config /some/scratch/SpellExtConfig --scene-bin /some/other/scene.bin
node tools/sxcfg-cli.js model --config /some/scratch/SpellExtConfig --game "<game folder>" --no-mods rt
node tools/sxcfg-cli.js model --config /some/scratch/SpellExtConfig --game "<game folder>" --7th-heaven "<7th Heaven>" --all
```

`diff --config ... FILE SECTION KEY VALUE` prints what `spellext_config.py set` (without `--write`) prints before
its `  check:` lines; `diff OLD NEW` prints what `python3 -I tests/oracle.py diff OLD NEW` (the reference's
`edit.line_diff`) prints. `check` prints what `spellext_config.py check` prints, and `set` what `spellext_config.py
set` without `--write` prints (its last line, "(not written: add --write)", included); `set --write` is refused
(exit 2): the Python tool and the app are the writers.

`run_diff.js` also fails when the manifest says the config copy gave the readers fewer than 13 files (one per reader:
`MIN_READER_FILES`; the copy's other files, `ai\`, `effects\`, `Readme\` and the rest, do not count) or the oracle
captured fewer than 500 reader calls from the reference's tests (`MIN_READER_CALLS`). The oracle itself refuses such a
copy before it writes anything (exit 2), and the gate checks that it does.

The gate's command-line comparisons (`cmpout` in `run_tests.sh`) need the same stdout and exit code and nothing on
either side's stderr (two tools that crash alike do not agree), and a `check` or `set` must print something; the gate
checks the comparison on two planted crashes. The Python suite's step shows the name of every test that errored or
failed (the whole output is in `tests/_work/cli/python_suite_full.txt`).

## The app (S3)

```
build/build.sh                                         # both platforms; again after a change to app/ (the gate checks both)
build/out/stage/SpellExt_Config_linux64/spellext-config
build/out/stage/SpellExt_Config_linux64/spellext-config --config "/path/to/mods/FF7 SpellExt"
tests/smoke/run_smoke.sh /some/scratch/SpellExtConfig  # hidden window; part of the gate
tests/smoke/run_smoke_s4.sh /some/scratch/SpellExtConfig   # S4's pages and edits; part of the gate (after run_smoke.sh)
```

The gate (`tests/run_tests.sh`) now also verifies the downloaded zips again, reads the fuses of the Linux build back,
checks that the build's `resources/app` is `app/` as it stands, and runs the smoke test.

Security, as design 1.2: `contextIsolation`, `sandbox`, no `nodeIntegration`; pages only from `app://spellext/`
(`paths.serve_path`: `renderer/` only, `..` refused); a CSP in both pages and in the protocol's answer; navigation
out of `app://spellext/` refused; only `aiwin.html` may open as a window; every permission request refused; one IPC
channel whose sender must be `app://spellext/`, whose route must be in the table, whose body must match the route's
shape (unknown fields refused; line numbers from 1). The page sends no folder path: a dialog's answer, a dropped folder
and a recent entry become tokens in the main process.

Save (design 1.6): `save.js` does `safety.atomic_write`'s steps with the checks of every file of the save made first
(stamp, never-touch names, write permission on the file and its folder, `Backups` not a link out), one backup folder
for the whole save (`safety.make_backup` with every path), then per file: the `.tmp` unlinked and opened `'wx'`,
written, fsynced, renamed (on Windows retried on EPERM/EBUSY/EACCES, ten tries 100 ms apart, then "could not replace
<file> (held open by another program?); the backup is in <folder>" and the `.tmp` removed), read back. A failure
while writing leaves the files written before it written and clean, the rest dirty; the answer names both.

The unsaved guard (design 1.7, after the S3 review): "Save all first" runs the page's own Save all
(`SpellExtPage.saveAllForClose`: a Raw-tab edit not applied yet is applied first, the preview is shown, a file changed
on disk is offered for overwrite, a refusal is told); the window stays open meanwhile and closes only when the page
answers that nothing is left unsaved. A settings.json that cannot be written (portable mode in a read-only folder)
never refuses opening a folder or changing a setting: the reason is shown through `settings.problem`. The gate takes
`verify.sh`'s own exit code (a pipe into `cut` hid it) and checks that a wrong pinned sha256 fails; the smoke test
verifies the zip on every run, compares the unpacked Electron with it file by file, and checks the running window's
web preferences, the CSP (header and both meta tags against the design's text), `window.open`, navigation out, a
permission request, and the preload's own refusal ("refused by the preload: ...").

## Language level: Node 22

The app will run under Electron's bundled Node, whose exact version is not known here (design 7.6); the tests run
under `/usr/bin/node` 26. Write to Node 22. Not to be used: what Node 22 lacks (`using` declarations,
`RegExp.escape`, `Float16Array`, `Error.isError`, `Math.sumPrecise`), and, for a margin, the newest it has (iterator
helpers such as `.map` on an iterator, the new `Set` methods, the RegExp `v` flag, import attributes, `Promise.try`).
Used and fine: `import.meta.dirname` / `import.meta.filename` (20.11), `fs.opendirSync`, BigInt, `\p{...}` regexps, `node:test`.

Electron v44.7.0 bundles **Node 24.21.0**: read from the binary's strings (`node.js/v24.21.0`, the headers URL) on
2026-10-28 (the `ELECTRON_RUN_AS_NODE=1 ./electron -p process.versions.node` run was refused by this session's
permission system), then seen as `process.versions.node` = 24.21.0 inside the app in the smoke test. Node 24 has all
of Node 22, so the rule stands; `tests/unit/build.test.js` scans `app/` for the list above.

## Where S6 differs from the design or the Python tool, and why

- `sxcfg/aipage.py`'s functions are in `aitool.js` (the design's file list has no `aipage.js`).
- The AI routes refuse a character above U+00FF, as `file.raw` does ("the file cannot hold U+2014 at line N"): the
  `.txt` is written as Latin-1 anyway, and below U+0100 Python's Unicode `\d` and `int()` agree with the port.
- The assembler holds at most 64 MB (`fill` or `table` counts past it give MemoryError where Python would try to
  allocate); Python's own MemoryError and OverflowError texts are copied past 2**53.
- `save_ai`'s `.tmp` is unlinked and opened `'wx'` (Python's opens `'wb'`, which follows a planted link).
- The section window does not use the `file.apply_text` route: the AI text is not a workspace document until it is
  saved. It uses the same core function through `ai.card_edit` op `apply_text` (the app's own; the cards and the
  Whole file box use it too). A changed line takes the ending of the line above it (design 1.6a). Python's page used
  `set_body` and lost every CR of the script; `set_body` stays as it was for the differential.
- Refusals where Python answered a 500: `ai.from_kernel` with an unknown character, `ai.kernel_choose` with neither
  an id nor a path, a kernel `.iro` entry that LZMA refuses.
- `ai.from_kernel` takes `kernel_id` only (Python also took a path as `kernel`); a typed path goes through
  `ai.kernel_choose`.
- A picked kernel is listed "picked from this computer (kept until the app closes)" (Python: "uploaded from the
  browser"); its label is Python's ("Uploaded: NAME").
- `kernels.iro_read(path, name, entries)`: an optional directory read before (the harness reads the New Threat
  archive's 6,975 entries; the reference reads the directory again for each).
- The Live reader's errors: LiveError is a refusal with its words (`{refused, live: name}`), KeyError "missing: ...",
  ValueError its words (Python's 409, 404, 409).
- Addresses in `/proc/<pid>/maps` above 2**53 are kept as Numbers (in order; the reader looks below 2**32 only).
- On Windows the helper lists the regions with VirtualQueryEx; should Windows refuse it to a handle without
  PROCESS_QUERY_INFORMATION (the reader asks for less, on purpose), it lists the modules and one region over the
  rest of the 32-bit space, and a read there that fails says so. Its refusal text names Windows, not Yama.
- Permission on Linux (the same rule as the Python page's): at `kernel.yama.ptrace_scope` 1 a game the app did not
  start MAY be refused, and then the page shows the refusal text for the scope it read; nothing predicts a refusal
  before the read. Seen in game 2026-10-28 by the coordinator: at scope 1, the game started by 7th Heaven (not a
  descendant of the reader), the worker read it (`mem` "ok", the DLL found by its exports, the directory's 55 entries
  at generation 4, `sx:spells`, `sx:items`, `sx:materia` and `save_party` rows, the kernel2 texts from `kernel2.bin`
  under FFNx, Compare on `k_attacks`; about 250 ms for all the requests). What let it through was not traced.
- LZMA: liblzma, with the stream's size not known, decodes one more symbol when the output is full (to find an end
  marker) and reports a bad distance there; the decoder does the same (read from xz 5.8.1's `lzma_decoder.c`; this
  machine has liblzma 5.8.4).
- No archive on this machine holds an LZMA entry (every entry of every `.iro` in the mods folder is stored), so the
  LZMA proof packs the New Threat archive's entries again with Python's `lzma` (`tests/_work/s6/lzma`).

## Found in the Python reference (reported, not changed)

- `aicards.parse` splits on LF and `ai_tool.tokenize` keeps a CR, so in a CRLF AI `.txt` every `script` line names
  `init\r` (no section): the cards show no script. The port copies it (the installed `ai\*.txt` are LF).
- `livetables.read_vanilla` on the `kernel2_texts` table raises KeyError('record_size') (no route calls it so).

## Where S5 differs from the design, and why

- An `int` type's words are written with `|`: `int(0..9999)|all|none` (design 4.2 wrote `|word[,word]`, which a comma
  in the placeholder line would split).
- A default with commas is written in double quotes (`placeholder = AP, ap, "3000, 18000, 35000", AP totals`): the
  design's own `AP, ap, 3000, 18000, 35000` cannot be told from a label. Inside the quotes `""` is one `"`
  (`"Say ""hi"", Bob"`); a value with a `"` is always quoted so.
- `derived` arithmetic stays within 2^53 - 1 at every step (both languages compute it exactly there); past it the
  template is refused.
- A metadata comment starts at ` ;` only (not ` #`): `NAME#` and a default such as `Spell #` need the `#`.
- A blank line ends a body; a blank line inside a body is written as four spaces (design 4.1 said both "blank lines
  included" and "the body ends at the first line without the indent").
- The magic materia bundle has no optional shop part (design 4.5 "the form offers one more part"): an optional part
  needs `when` (S6a); the shop line template does it in a second step.
- `commands` is a type of its own (up to 6 command IDs) for the command materia: with `attributes` (21 values) an
  edge value made the DLL log "a magic or command materia ... the entries past the game's own are ignored".
- Capture links a materia's spells and the shop lines naming the ID; a spell's `materia =` targets are not offered as
  parts (design 4.6 lists them too).
- An appended user template carries a blank line after it, and a replaced one keeps its block's trailing comments, so
  that add-then-remove gives the file back byte for byte (design 4.1 said a comment between templates belongs to the
  block above).
- `.ai` files are not searched for a commented ID (their disassembly comes with S6): only `ai\*.txt`.
- `sxcfg-cli.js templates` (design 2.2's command list) is not built: the harness drives the library directly.

## Where the S4 page differs from the design, and why

- **Spell names** is a kind page (its sections and rows, Raw, Changes), not the two-column "ID, game name, new name"
  list of design 3.2: the game names need the kernel's text, which the app reads in S6 (the kernel chooser).
- **Characters' Linked strip, the Limits page's leftover mark, remove-together** are S6a's (design 6), not built here.
- **Section text's range**: a live section's lines from its header to its last line, stopping before a commented-out
  section that sits in that range (the usual place: after the keys and a blank line), which is an entry of its own;
  when a live key line of the section follows such a block, the range keeps every line, the block's included.
- **Add section after** inserts through `file.apply_text` (an insert: the new lines take the ending of the line above
  them): a blank line first when the line above is not blank, the header, and a blank line after it unless it is the
  last line. It goes after the chosen section's last line, so after a comment that ends that section (the Items file's
  comment about `[1024]` stays above the new section).
- The ai\ sources (`ai\*.txt`) are listed as text under the AI entry until S6 brings the AI page (the Python page's
  Files tree listed them, so they stay reachable).
- An Advanced key with no default is added as `key = ` (an empty value, which the DLL may refuse: the line shows
  its problem at once); the tool does not refuse it.
- The routes of a later stage answer `<route>: coming in S5|S6|S6a (stage ... of the desktop app; not in this build
  yet)` (S3 said "is not in this build yet (it comes with stage ...)").

## Where the shell differs from the design or the Python page, and why

- `will-prevent-unload`: `event.preventDefault()` lets the window CLOSE (Electron ignores the page's beforeunload);
  "Keep editing" is the one that does nothing. The design (1.7) had it the other way round.
- The fuse indices are 0, 2 and 3 (RunAsNode, EnableNodeOptionsEnvironmentVariable, EnableNodeCliInspectArguments):
  EnableCookieEncryption sits at 1 in v44.7.0's wire `101100011` (design 5.1 said "the next two").
- The release's SHASUMS256.txt writes `<sha256> *<name>`; the design's `grep ' <name>$'` would not match it.
  `verify.sh` reads both forms and wants the name exactly once.
- The smoke test runs in a hidden window (`show: false`) on the session's display, not under
  `--ozone-platform=headless`: Electron v44.7.0 dumps core making a BrowserWindow there.
- `check.run` answers `{problems: {file: [...]}}` as `/api/check` did (the page reads `.problems`).
- Save of a file with no unsaved change: the page says so and writes nothing (the Python page wrote it again with a
  backup). Save asks the main process for the dirty list first.
- `process.versions.node` is shown in the Settings menu (with Electron's), not on the Problems strip.

## Where the port differs from Python, on purpose

- `py.js` is exact on Latin-1 text (every byte of a file); beyond it: `pyInt` refuses non-ASCII decimal digits
  (Python maps them), `pyIsdigit` knows only decimal digits. The `os.path` helpers are posixpath; on Windows they
  fall back to Node's `path.win32` (not testable here).
- `safety.js`: the backup copy's times through `fs.utimesSync` (microseconds, not nanoseconds); the one OSError text
  it quotes ("... is in the way and cannot be removed (...)") carries Node's error code, not the C library's text.
- `Reading.log(line, fmt, ...args)`; Python's `kind=` / `file=` keywords are `log_with({kind, file}, line, fmt, ...)`.
- Python imports the readers lazily; here a caller that checks files imports `rules/index.js` (workspace.js does).
- File names that are not valid UTF-8: Node reads them with U+FFFD where Python keeps surrogate escapes.
- `gamelog.parse`: a tick or line number above 2**53 loses precision (a JS Number).
- `Document`'s line-index edits (`set_value`, `replace_key`, `remove_line`, `comment_out`, `uncomment`) refuse a
  negative index with Python's IndexError; Python counts it from the end (`server.py` 357 reaches that with line 0),
  so the IPC of S3 refuses line numbers below 1.
- `sxcfg-cli.js` reads its arguments plainly, not as argparse does: a VALUE that starts with `-` (`-x`) is taken as
  the value (argparse refuses it: "the following arguments are required: value", exit 2), and an abbreviated option
  (`--conf` for `--config`) is refused (argparse accepts it).
- `rules/spells.js` `SpellDraft.set_bytes` throws Python's IndexError for an offset past the 28-byte record, as the
  reference's list does: `dword_ffffffff = 1` (and `word_`/`byte_` with offsets that wrap) passes the DLL's
  `offset + size > 28` test in 32 bits, and the reference then fails with IndexError (the DLL writes before its
  draft: reported for the coordinator, not changed here).
- The readers' shared state is a `Map`; where Python tested membership with `in`, `pyIn` accepts a Set, a Map or an
  Array, as Python's `in` does for the shapes the limits and materia ports document.

**Release 0.11.0 (2026-11-15): the Portrait block and the 3D formation view, one release.** `app/package.json` says 0.11.0;
`build/README_linux.txt` and `README_windows.txt` open with "What's new in 0.11.0" (the Portrait block: which picture, the two sizes,
the part the game draws, where it comes from, read or inferred, read only; the 3D view: frame 0 of each enemy's idle, the party as
markers numbered from 0 like the diagram, floor and shadows, no battle stage, the picture at 4:3, the scene.bin read, the mouse
controls). One wording change besides: the 3D view's note on the markers (`renderer/enpage.js` line 317, and its byte copy `sxcfg/static/enpage.js`) and a comment in `modelview.js` (both copies, line 835) said "wedge", which is also the name of an enemy in the user's own config, so `check_release.py` (unchanged) refused both zips; they now say "pointer". No logic changed. `tests/check_release.py` and its `--self-test` ran unchanged on both zips.
