FF7 SpellExt - the battle page: fight your own battles from the SpellExt menu
============================================================================

Files: FF7_SpellExt_Game.ini (the keys below), and what the enemies facility
already reads (SpellExtConfig\scenes, SpellExtConfig\enemies,
FF7_SpellExt_Enemies.ini: see FF7_SpellExt_Enemies_README.txt). Every start,
refusal and test-mode step is written to FF7_SpellExt.log, each line starting
with "battle menu:".

The SpellExt menu (debug = true) has a row "Fight: external battles". It lists
every DLL scene the enemies facility registered and starts the one you choose
as a battle, from the field you are standing in. The battle comes back to the
same spot, as after a random encounter. No test_battle line and no Re-init are
needed to go from one battle to the next.

It needs:
- debug = true (the SpellExt menu), and
- enemies = on (read when the game starts): without it the page lists nothing.


The page
--------
    Again      battle 1320   scene 330   f0   my_scene_074
    Next       battle 1324   scene 331   f0   my_scene_075
    Previous   battle 1316   scene 329   f0   my_scene_073
    Battle  Scene  F  File            Enemies                   Stage
    1024    256    0  my_scene_000    Sentry                    24
    1028    257    0  my_scene_001    Sentry                    24
    ...

- Again: the last battle started from this page (grey "none yet" before the
  first). Next / Previous: the registered scene after or before it, by number,
  round from the end to the start, in the same formation. With nothing fought
  yet, Next is the first scene and Previous the last.
- The list: every registered scene, by number, eleven at a time. Battle is
  scene x 4 + formation; F is the formation shown; File is the scene file's
  name (without .ini); Enemies are the `name =` of up to three enemy folders
  of `enemies =` (the folder's name when it has none, ? for a folder that is
  not registered); Stage is the formation's `stage =` (formation 0's when the
  formation has no section or key of its own).
- The bottom line ends with how many scenes are listed.

Buttons:
    Up / Down         a row
    page buttons      eleven rows (100 rows after [SWITCH]; [SWITCH] again: eleven)
    Left / Right      the formation (0-3) of the row under the cursor; kept
                      while the page is open, 0 again the next time it opens
    OK                fight it
    Cancel            back to the SpellExt list

The names are read when the scenes are registered (at start-up, at Re-init
.ini files, and when a scene or enemy folder was written since). After Re-init
the list is made again at once; the cursor stays on its row number.


What OK does
------------
1. The checks (below). A refusal is written over the list in red, whole, until
   the cursor moves, and in the log. Nothing is written into the game.
2. The scene is built as at a battle's start: a scene file with a mistake is
   refused on the page with the same line the log gives (file, line, what).
3. The menu closes and the field starts the battle the way a random encounter
   does: the swirl, the battle music of the field, then your battle. Your
   battle goes before [battle_map] lines and before test_battle, for this one
   battle; the next battle of the field is the game's own again (or
   test_battle's, if that line is on).
4. After the battle the field comes back at the same spot.

Refused (nothing written; the line says which):
- enemies = off; or the hand-over at 004082b5 is not hooked (see the log);
- the world map: battles start from a field only (the world map is a later
  stage);
- a menu that is not a field's main menu opened with the menu button: a menu
  opened by a script (a tutorial's), the menu after a won battle;
- a special scene is running (the game's SPECIAL flag);
- with battle_menu_locked = refuse: a field whose random battles are off
  (the field's BTLON lock, or no encounter table on: towns).
A save point is no reason to refuse: its menu is the menu button's.


Test mode (on unless you say otherwise)
---------------------------------------
A battle from the page is a test: it should not change your game.
- No rewards: no EXP, AP, gil or items won, no level-up, no battle-end
  screen (the game's own "no rewards" battle flag, bit 0x80).
- A lost battle is not a game over: the field comes back (the game's own
  switch that scripted "you may lose this" battles use).
- The party is put back: the three party members' records (HP, MP, status,
  limit gauge and level, EXP, the materia they hold with its AP, kills) are
  copied when the battle starts and written back when the field returns,
  before the field draws or runs a script. A new character in a seat is put
  back the same way. The game's working copy of the party's HP and MP is set
  to match, so walking with a Cat's Bell (or a field's healing) starts from
  the HP put back, not from the battle's.

NOT put back:
- items used up in the battle (Potions, thrown items) and items stolen: the
  item list is as the battle leaves it;
- the game's own counters in the save: battles fought, escapes;
- a party member who changed seats or left between the battle's start and
  its return (that record is left as it is; the log says so).
After a lost test battle with battle_menu_restore = off the party is on the
field with 0 HP, as after a scripted battle you may lose: a Phoenix Down or a
rest fixes it.

If the field never takes the battle (you opened the menu again at once,
another battle came first, or - rarely - a field script that was about to
start its own battle took the request for it), the request is forgotten and
the log says so ("NOT taken", with what the DLL can tell of the cause); test
mode's loss switch and the request's random-encounter mark are put back, so
no scripted battle plays twice.


The keys (FF7_SpellExt_Game.ini)
--------------------------------
Read at start-up and at Re-init .ini files; taken at once (the next battle
started from the page uses them).

    battle_menu         = on       ; on | off. off: no row "Fight: external battles"
    battle_menu_test    = on       ; on | off. The master of the three below
    battle_menu_rewards = off      ; on | off. Each of these three, when given,
    battle_menu_lose    = return   ; return | game_over    wins over the master;
    battle_menu_restore = party    ; party | off           left out, the master decides
    battle_menu_fast    = off      ; on | off. on: no victory fanfare, no victory pose
    battle_menu_locked  = allow    ; allow | refuse. Fields whose random battles are off

- battle_menu_test = off makes all three the game's: rewards given, a loss is
  a game over, the party stays as the battle leaves it.
- battle_menu_rewards = on with test on: you get the rewards (and the
  battle-end screen), but with battle_menu_restore = party the party's
  records are put back after it (EXP, levels and AP undone for the three
  party members; gil and items kept, and the half EXP the game gives the
  characters outside the party kept too). Use battle_menu_restore = off with
  it to keep everything.
- battle_menu_fast = on: the battle flags 0x20 (no fanfare) and 0x100 (no
  victory pose) as well; read from the game's code only, not yet seen.
- A line with a wrong value is said in the log and its default is used.
- When the party cannot be put back (the field reader's call at 0060ba9f is
  not the game's: another mod's code there), the log says so at the first
  test battle and the page's battles leave the party as they find it; the
  loss switch still works, and is put back at the next battle.

The keys may be left out: the defaults are the values shown above.


The log
-------
    battle menu: the SpellExt menu's "Fight: external battles" is on; test mode on: ...
    battle menu: TEST MODE SET: 00cc0dc5 (a loss is no game over) 0 -> 1 in field 117
    battle menu: START battle 1320 (DLL scene 330 'my_scene_074', formation 0) asked from field 117 (...)
    battle menu: the field started battle 1320, the page's (...); TEST MODE SET: battle flags 00db958a 0000 -> 0080 (...)
    enemies: battle 1320 -> 1320 (DLL scene 330 'my_scene_074' formation 0; battle menu): enemies ...
    battle menu: back on the field after the test battle (result word 00db958a = ...): the party is put back:
    battle menu:   character 0: HP 120 -> 314, MP ...
    battle menu: TEST MODE RESTORED: 3 of 3 record(s) put back; the menu's party copy (...) of 3 made the same
    battle menu: 00cc0dc5 (a loss is no game over) back to the field's 0 (the field resumes after the test battle)
    battle menu: battle 1320 REFUSED: <why> (mode ..., request ...)
    battle menu: the request for battle 1320 was NOT taken ...: dropped


Beside test_battle and [battle_map]
-----------------------------------
They are independent. With test_battle on, the start-up line "TESTING AID on:
test_battle" still prints and every battle of the game becomes that one; a
battle from the page is the page's, for that one battle.


Nothing names a character, a game or a monster: the page lists your files.
