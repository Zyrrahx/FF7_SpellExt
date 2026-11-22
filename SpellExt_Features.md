# FF7 SpellExt: what it brings

Compiled 2026-11-22 from the installed readmes, the config file headers, the release plan and the 2026-11-21/22 work folders. Source cross-check: `spellext.c` md5 250067aa (start-up log prefixes). Everything here is read from files and code. Anything marked NOT SEEN is read from the code only; the user has not seen it in the game. No character, limit or field of any particular mod is named.

## Overview

SpellExt is a DLL for the Steam FINAL FANTASY VII (`ff7_en.exe`) that lifts limits the engine puts on modders. It runs as a 7th Heaven mod beside FFNx. With plain text `.ini` files in a `SpellExtConfig` folder, a mod author can add spells, summons, materia, weapons, armour, accessories, items, shops, whole new party characters with their own limit breaks and battle AI, new battle commands, enemies and battles, battle effects, cameras and models, extra fields, and field text and scenes for the new characters. It also lifts hard engine limits: damage caps, bone counts, item numbers, field counts and the command list. Every feature is switched by a key in `FF7_SpellExt_Game.ini`, and with nothing configured the game plays as before. A modder can reread most files without restarting. Each file has a readme in `SpellExtConfig/Readme/`.

## Spells and magic

- Add spells of your own (IDs 3000 to 65534) with every attack-record field (accuracy, MP, target flags, element, status, damage formula, special flags, camera, sound) in `FF7_SpellExt_Spells.ini` `[3000]`.
- Copy an existing spell and change only what you name: `base`.
- Spells cost up to 999 MP: `mp` (the engine keeps 255 per byte; the DLL supplies the real cost).
- Give a spell to a materia, with a level, or to everyone: `materia`, and `spells =` in `FF7_SpellExt_Materia.ini`.
- Choose the Magic-list group a spell sits in: `order = restore | attack | indirect`.
- Add summons: `list = summon`, with uses per battle from the granting materia, and a choice of whether the party vanishes: `party_vanishes`.
- Use one effect for one target and another for several: `animation`, `animation_all`.
- Fixed damage per hit whatever the formula: `fixed_damage`.
- Choose the caster's gesture among the model's scripts: `script`.
- Write the caster's gesture as raw script bytes, with the full model-script command set and safety checks (up to 255 bytes, up to 64 spells): `script_bytes`. Installed 2026-11-22, DLL 6aeb6405.
- Tie a spell's `script_bytes` to a caster model, with several lines per spell, so each model gets its own gesture: `script_bytes_model`, `xy:` prefixes. BUILT, NOT INSTALLED. It passed its independent review (round 1, no majors). The config editors still keep only the last of a repeated key.
- Support materia (All, Quadra Magic, MP Turbo, HP/MP Absorb, Added Cut, Steal as well, Magic Counter, Sneak Attack, Final Attack) act on new spells and summons as on the game's own.
- Rename the game's own spells, including inside the descriptions that quote them: `FF7_SpellExt_SpellNames.ini`.
- Raise the enemy HP-damage cap to 9,999,999 and the MP-damage cap to 65,532: `enemy_damage_limit`, `enemy_mp_damage_limit` (`Game.ini`). Party limits are unchanged.

## Limit breaks and Breaking Limits

- Give each new character up to 12 limit breaks of their own: 4 levels with 3 positions each: `FF7_SpellExt_Limits.ini` `[12 1-1]`.
- Set a limit's name, description, base limit (for its animation), element, strength, status, accuracy, camera, and gauge speed per level: `gauge`.
- Give a limit its own animation pack: `animation_pack` (`.a00` under `files`).
- Write the limit's action script as bytes: `script`.
- Build a limit from spell effects, one per hit (up to 24), with a per-hit element, an "all targets" form and a "visual only" form: `spell_effects`, `hit_elements`, `additional_effect`, `additional_modifier`.
- Define limit sets and switch between them: `limit_set`. Keep unused limits in `FF7_SpellExt_ParkedLimits.ini` (not read by the game).
- Transform the user into another battle model (a "form" taken from an enemy model or a party-slot model) for the rest of the battle, with an AI taking its turns and a change back on KO: `[form NAME]`, `form =`. NOT SEEN in the game.
- Define "states" a limit leaves its user in (up to 4 per character): multi-hit attacks, a standing pose, a held prop model, attacks on all enemies with their own element, physical evade, raised cover and counter chances, replaced scripts, a raised view and pointer: `[12 state NAME]` (`hits`, `idle_script`, `prop`, `attack_targets`, `physical_evade`, `cover`, `counter`, `view_raise` ...).
- Teach each character's fourth-level limit with an item of its own, with its own name and lines: `limit_item`, `limit_item_*`.
- Breaking Limits (engine limits that live in code, not data), switched by `breaking_limits = on`:
  - Battle models above 48 bones, up to 127, with their animations: `wide_skeletons`. Bones 49 and up draw and move but cannot be targeted.
  - Model skinning: single vertices of a battle model follow another bone, so joints stop tearing: `model_skinning`, with `SpellExtConfig/skins/*.skin` files.
- Testing aids for limits: `learn_all_on_load`, `full_gauge`, `limit_item_on_load`, `[test]` section, `wide_skeletons = all`.

## Materia

- Add up to 159 new materia (IDs 96 to 254) of any kind: magic, summon, command, support, independent: `FF7_SpellExt_Materia.ini` `[96]` with `kind`.
- Set the AP totals per level, up to 20 levels, with the menu showing stars and "12/15"-style figures: `ap`.
- Assign the kernel spells and new spells each level teaches: `kernel_spells`, `spells = 3001:7`.
- Set uses per battle for summons, per level: `uses`.
- Set one of the game's 17 fixed stat changes while equipped: `equip_effect`.
- Raw type and record bytes, or a start from a kernel materia: `type`, `byte_XX`, `base`.
- Change the game's own materia and give new materia in shops: `Shops.ini` `m49`.
- Testing aid: `give_materia` in the `[test]` section.

## Battle commands

- Add new battle-menu commands, 30 numbers in all (0x1c to 0x1f and 0x26 to 0x3f), each a row of the menu: `FF7_SpellExt_Commands.ini` `[0x1c]`. Installed 2026-11-22.
- Give a command through a command materia (`kind = command`, `attributes = 0x1c`), with level ladders such as `0x26, 0x27`.
- Command kind `spell`: casts one spell (an extended spell or a kernel magic): `spell`.
- Command kind `physical`: a weapon attack made like one of the game's weapon commands, with its own gesture, power, formula, accuracy, element, status, steal/morph, turns, cameras and targeting: `like`, `power` ...
- Command kind `item`: opens the Item list under its own name, limited to some items (the rest dim) and with stronger or weaker effect: `items`, `potency`.
- Command kind `list`: opens its own spell sub-list in the Magic window: `spells`.
- Entries of a list that appear by materia level or character level: `ID:N`, `ID:level:N`. Blank places stay while locked. Installed 2026-11-22.
- Entries a character learns from an enemy attack, an item, or a field event, saved per character in the companion save file: `ID:enemy:`, `ID:item:`, `ID:event:`. Installed 2026-11-22. Enemy- and event-learning is NOT SEEN (the item scroll was seen working).
- The command takes the support materia that make sense for it, or a chosen set: `support` (Counter, Sneak Attack, Final Attack, All, Quadra Magic, Mega All, MP Turbo).
- Put a command in the Attack row, as Slash-All and Double Cut do, by a type-0x12 materia: `type = 0x12`.
- Make a command a W- command (two picks in one turn): `w_form = yes`.
- Mime repeats the new commands. The command list is kept at 16 rows.
- Stages 4-8 were seen working by the user (2026-11-22). Stage 9 (conditions and learning) is installed; only part of it has been seen.

## New characters and seats

- Define new party characters in `FF7_SpellExt_Characters.ini`, either from a base character or from a full stat sheet with growth curves: `[12]`, `base`, `level`, `strength` ..., `exp_rate`.
- Set looks and battle borrowing: `portrait`, `battle_like`, `battle_files`, `equip_like`, `body_blend`.
- Copy a character: `copy_of`.
- Set starting equipment and materia: `weapon`, `armour`, `accessory`, `weapon_materia`, `armour_materia`.
- Give a character a battle AI, borrowed or written: `ai`, `ai_like`.
- Make the battle gauge follow the dexterity set by a battle script: `atb_follows_dexterity`.
- Up to 32 characters in the file take turns in 2 or 4 seats (character IDs 12 to 15): `seats` (`Game.ini`), `keep_seat`.
- Let the character join by script or by condition, and choose how it is forgotten: `join`, `forget_flag`, `seat_when`.
- The PHS grid scrolls past nine characters.
- The SpellExt menu has an "External Characters" screen that seats any character into a party slot.
- Testing aids: `party_slot`, `remake_on_load`, `give_on_load`.

## Items, wide item list and the box

- Add 87 new items: IDs 105 to 127 and 448 to 511: `FF7_SpellExt_Items.ini`.
- Add up to 8,976 more "wide" items, numbered 1024 to 9999, with a longer item list (up to 3350 rows): `wide_items = on`, `wide_rows`.
- A shadow mode rehearses the wide list without changing the game: `wide_items = shadow`.
- A throwable wide item (a wide weapon with `throw = yes`): `wide_throw`.
- The box holds what the item list has no row for. It sleeps until something needs it, then wakes and shows a "Box new" row in the main menu: `box = auto | on | off`.
- Enemies can drop and steal wide items and new gear. New things sort by name among the game's: no key, always on.
- Use your own icon pictures for items and gear: `icon = file:NAME.png` under `files/icons`.
- Testing aids: `items_on_load`, `test_drop`, `test_steal`, `test_fill_rows`.
- A save with wide items needs the DLL to load.

## Weapons, armour, accessories and shops

- Add 64 new weapons (IDs 320 to 383), 32 new armour (384 to 415) and 32 new accessories (416 to 447), plus wide gear: weapons from 10000, armour from 16000, accessories from 22000 (about 6,000 numbers each): `Weapons.ini`, `Armour.ini`, `Accessories.ini`.
- Change the game's own weapons, armour and accessories by their item IDs, keeping what you do not name: `[128]`, `[256]`, `[288]`.
- Set who may equip each piece, by name, ID or mask, including the new characters: `equip`.
- Set materia slots (pairs, chains of up to 8, no-growth slots) and growth: `slots`, `growth`.
- Set stats, power, element, status, effects and the raw record bytes: `power`, `defense`, `damage_formula`, `byte_XX`.
- Put anything on sale in the game's 37 shops (32 entries each, a scrolling buy list), including wide gear and materia: `FF7_SpellExt_Shops.ini` `add =`.
- Gear can be given at a load (a testing aid): `give_on_load`.

## Enemies, battles and AI

- Add enemies of your own from folders: `SpellExtConfig/enemies`, `enemies = on`.
- Add scenes of your own (up to 3 enemies, an arena, a camera, 4 formations; scenes 256 to 4095, battles 1024 to 16383): `SpellExtConfig/scenes`.
- Make the game's own encounters become your battles, per field, the world map or anywhere: `[battle_map]` in `Enemies.ini`.
- Give enemies an AI written in a text format and assembled with `ai_tool.py`, using enemy attack IDs 0 to 0x7f and 0x100 to 0x7fff.
- Use your own enemy models (several slots per battle, including FF8 models with over 48 bones) with skeleton, textures, parts and animations from a folder.
- Change an enemy attack to play one of SpellExt's effects and cameras: `[attack 0x1b]`.
- Surround and reach rules and hits on every target for new attacks (internal; named in the log).
- Testing aids: `test_battle` (every battle becomes a chosen one), `test_party_damage`, and `[models]` in `Enemies.ini`.

## Effects, cameras, skins and models

- Native effect player: write a spell or limit effect as a text timeline of sprites, models, sounds, hits, flashes, fills, shakes, actor moves, fades and morph files: `FF7_SpellExt_Effects.ini` `[effect 0x201]` with `play = name` (`effects/name.txt`).
- Effect scripts take up to 32 files, 600 frames, 128 sprites and 256 models per frame, and your own sound handles.
- Copy a game effect with replaced textures and files (recolours): `[effect 0x100] copy =`.
- Add your own battle cameras (numbers from 190 hex up) with position and focus scripts, three variants each, and a roll that turns the arena: `SpellExtConfig/cameras`, `camera_single`, `camera_multi`.
- FF8-style cameras: `engine = ff8`, `select =`, `[sequence]` programs, `clock =` timing. About 70 FF8 camera texts are installed.
- Skin a battle model: `SpellExtConfig/skins/*.skin`, `model_skinning`.
- Use your own animation packs and battle model files: `animation_pack`, `battle_files`, `files/battle`.
- An FF8 importer folder (`FF8Importer`) holds the conversion tools.

## Fields and field scenes

- Add more fields than the game ships: register id and name, ship the field file, and doors and scripts can lead there: `fields_file`, `fields_table_size`, `field_buffer_bytes`, `FF7_SpellExt_Fields.ini`.
- Set a fallback place for a save made in a registered field: `fields_fallback`.
- Give new characters a body in the field: `field_entities = party | seats`, `field_model`.
- Write a new character's current name in field text: byte codes E5 and following, the same as {CLOUD}.
- Let the player name a new character in a scene (menu type 6).
- JOIN, SPLIT and party commands and PXYZI move new characters.
- Field items and events can teach commands (see Battle commands).

## Battle menu and testing aids

Items marked TA are testing aids and are meant to be removed when you are done.

- SpellExt menu under Quit: `debug = true`. It has Re-init .ini files, Check External Spells, External Characters and more.
- "Fight: external battles" page: start any registered scene from the field you stand in, with Next, Previous and Again buttons: `debug = true` + `enemies = on`. TA.
- `test_battle`, `test_party_damage` (set to 9999 in the installed Game.ini), `items_on_load`, `test_drop`, `test_steal`, `learn_all_on_load`, `full_gauge`, `limit_item_on_load`, `give_materia`, `remake_on_load`, `wide_skeletons = all`. All TA.
- The log `FF7_SpellExt.log` names every feature that starts and every refusal, with line numbers.

## Config, reloading and the editor

- Re-read all .ini files without restarting: "Re-init .ini files". Items that need a restart are listed in the Reloading readme (seats, wide list, field table, Breaking Limits, a character's portrait, the command-table move).
- Every file loads with a bad line skipped and reported; the rest still loads.
- Check External Spells prints a table of your spells.
- A config editor (the Config app and `sxcfg-cli`) reads and checks the files; `FF7_SpellExt_Game.ini` documents each key.
- Release builder: `tools/work/release/make_release.py` builds a user package without the test mod's data.

Related, separate: `tools/work/battle_bar_flip/` is a hext mod, not part of SpellExt.

## Limits worth knowing

- New battle commands: 30 in all (0x1c to 0x1f, 0x26 to 0x3f). The 26 from 0x26 up need the DLL to move the game's command tables at start-up. Add the first one with a restart. If another mod changes the places the move needs, only the four low numbers work.
- A command menu holds 16 rows, with Attack and Item always there: 12 to 14 new rows on one character (12 with Magic and Summon). The rest are left out with a log line.
- The `script_bytes` path allows 3 to 255 bytes per spell and 64 spells with their own bytes. Per-model lines are built, not installed.
- Seats: 4 new characters known to the game at once (2 with `seats = 2`); the file may define up to 32.
- Characters: 12 limits each (4 levels by 3 positions), up to 4 states each; limits borrow an existing limit's animation.
- Materia: 159 new (IDs 96 to 254) with up to 20 levels; stat effects are limited to the 17 fixed ones.
- Items: 87 new (105 to 127, 448 to 511), plus wide items 1024 to 9999 (needs `wide_items = on`; row count up to 3350). 512 to 1023 are never used.
- Gear: 64 new weapons, 32 new armour, 32 new accessories. Wide gear: 64 weapons, 96 armour and 96 accessories worn at one moment; a stock of 99 per item.
- Spell names are 31 characters, descriptions 95; the menus were laid out for about 9 characters of name.
- Spell effects in a limit: up to 24 per limit. A spell summons list: 16 summon slots per character. The `spells` list on a materia holds up to 24 per line, and a spell may be granted by at most 4 materia.
- Battle skeletons up to 127 bones; bones above 48 cannot be targeted; effects see the first 49 bones. A model of 128 bones or more is not drawn.
- Scenes 256 to 4095 (battles 1024 to 16383); scene 255 has no battles; each scene up to 3 enemies and 4 formations.
- Cameras: up to 256 and 65,536 bytes of script in all; FF8-engine cameras up to 16 segments a chain.
- Effect player: 32 files per effect, 600 frames, 128 sprites and 256 models drawn per frame, 1024 effect sections.
- Fields: ids up to 32766; fields table from 1200 to 32767 entries.
- Enemy damage cap 9,999,999 and enemy MP-damage cap 65,532; party hits keep the game's caps.
- Save files that hold new materia, wide items, wide gear or new characters need the DLL and its files to load.
- Nothing is seen in the game unless marked so: the wide list, wide items, forms, model skinning, learned entries (enemy and event), and the Attack row and list commands past the stages listed above are read from the code.
