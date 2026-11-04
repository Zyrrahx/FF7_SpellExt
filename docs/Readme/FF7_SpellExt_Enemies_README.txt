FF7 SpellExt - enemies and scenes of your own
=============================================

Files: FF7_SpellExt_Game.ini (the switch, test_battle), FF7_SpellExt_Enemies.ini
(which folders count, which battle of the game becomes which of yours), and the
folders SpellExtConfig\enemies and SpellExtConfig\scenes. Problems are reported
in FF7_SpellExt.log, each line starting with "enemies:".

A SCENE of yours is a battle setting: up to three enemies, where they stand,
the arena, the camera, and up to four formations. Its battles are numbered
scene x 4 + formation. Your scenes are numbered 256 to 4095, so their battles
are 1024 to 16383 (the game's own are 0 to 1023).


The switch
----------
In FF7_SpellExt_Game.ini:

    enemies = on                     ; or off (the default)

Read when the game starts only: restart the game after changing it. With off,
or without the line, nothing below happens: no file is read, nothing is hooked
for it, and the game plays as before.


Testing a battle: test_battle
-----------------------------
    test_battle = 1200               ; every battle becomes battle 1200
    test_battle = 300:0              ; the same, as scene:formation

With enemies = on, test_battle takes 1 to 16383 (scene 0 to 4095). A battle of
yours (1024 and up) with enemies = off is refused at start-up with a line, and
test_battle is off. Remove the line when done.


Testing battles from the menu
-----------------------------
With debug = true, the SpellExt menu's row "Fight: external battles" lists
every registered scene (its battles, file, enemies and stage) and starts the
one you pick from the field you stand in, as a test battle by default (no
rewards, a loss returns to the field, the party put back). It goes before
[battle_map] and test_battle for that one battle. See
FF7_SpellExt_BattleMenu_README.txt.


FF7_SpellExt_Enemies.ini
------------------------
Optional. Without it every enemy folder and scene file counts, no battle of the
game is replaced, and no pool model is assigned outside your battles.

    [enemies]
    load = all                       ; or folder names, comma or space separated

    [scenes]
    load = all                       ; or scene file names without .ini

    [battle_map]                     ; where : the game's battle = your battle
    field 123 : 268 = 1200           ; in field 123, the game's battle 268 becomes 1200
    world : 140 = 1204               ; on the world map
    any : 16 = 1028                  ; anywhere (a line for the place wins over an any line)

    [models]                         ; a testing aid (see "Beside FFNx")
    365 = my_enemy

    [attack 0x1b]                    ; an attack ID: its effect and cameras in ANY battle
    effect = 0x210                   ;   (see "Enemy attacks with SpellExt's effects")
    effect_all = 0x211
    camera = 0x1a0

- `load` may be given on several lines; the names add up (512 at most).
- A map line's right side must be one of your battles, 1024 to 16383. At most
  256 map lines. A line with a mistake is skipped with a line in the log.
- [attack N]: N is an attack ID, 0x00-0x7f or 0x100-0x7fff; at most 256 such
  sections; a section given twice keeps the first.
- Any other section ([defaults] and the like: the converter's) is skipped, with
  a line in the log. Anything after a ; or # (at the start or after a space) is
  a comment.
- "Re-init .ini files" reads this file again, and the two folders.


The folders
-----------
    SpellExtConfig\enemies\<folder>\generated.ini      the converter's enemy (do not edit)
    SpellExtConfig\enemies\<folder>\enemy.ini          YOUR enemy: a key here wins
    SpellExtConfig\enemies\<folder>\ai.ai.txt          the AI as text (tools/ai_tool.py)
    SpellExtConfig\enemies\<folder>\ai.ai              the AI assembled (tools/ai_tool.py asm)
    SpellExtConfig\enemies\<folder>\model\aa, ab, ...  the enemy's model files
    SpellExtConfig\scenes\generated\<scene>.ini        the converter's scene (do not edit)
    SpellExtConfig\scenes\<scene>.ini                  YOUR scene: a key here wins

The keys are those of the text formats (content\README.md of the converter's
work): the DLL reads exactly what tools/scene_compile.py reads, and refuses what
it refuses, with the same words, naming the file and the line. A folder or scene
file name is 1 to 31 letters, digits, _ and -.

The overlay rule: the generated file first; every key your file gives wins; a
[section] only in your file is added after the generated ones. To take a
generated value back, delete the key from your file.

Your edits take effect at the next battle of yours: every file of a scene is
read again when its battle is handed over (no restart, no re-init). A new
scene file is seen at the next battle too (the folders are looked at again when
they were written since).


Limits both the DLL and the compiler keep
-----------------------------------------
- An attack ID is 00-7f (a kernel attack) or 0100-7fff (a scene attack): the
  game reads an AI's attack ID as a signed number.
- `next` is none, a battle 0-1019 or 1024-16383 (scene 255 has no battles).
- `camera` is scene:formation, scene 0-254 of the game's scene.bin, formation 0-3.
- An [attack NAME] section's NAME is at most 31 characters.
- An AI may only use (after push.b 20) attack IDs its enemy has: the scene is
  refused otherwise, naming the IDs.
- A battle number the game's loader cannot take (scene 255, or past 4095) is
  never handed to it: battle 0 plays in its place, with a line.


The AI
------
`ai = ai.ai.txt` in enemy.ini means the ASSEMBLED block beside it, ai.ai: the
DLL has no assembler. Assemble it with
    python3 -I tools/ai_tool.py asm ai.ai.txt -o ai.ai
after each change of the text. When ai.ai is older than ai.ai.txt the log says
so at the battle (the block is used as it is). Missing ai.ai: the scene is
refused. `ai = none` gives the enemy a plain AI: it attacks a random party
member with its first attack (it needs at least one attack).


The models
----------
In one of your scenes, enemy slot 0, 1 and 2 (the order of `enemies =`) are
drawn as models 365, 366 and 367 (files ob.., oc.., od..), whatever `model`
says. For that battle, each model's files come from its enemy's model folder:

    enemies\<folder>\model\aa        the skeleton
    enemies\<folder>\model\ab
    enemies\<folder>\model\ac ...    the textures (as many as aa says)
    enemies\<folder>\model\am ...    the parts: one per bone with a part (aa says which)
    enemies\<folder>\model\da        the animations

Each file is named by its last two letters only: the game's file OBAC is
model\ac here.

WARNING: the game's battle archive holds a model of its own under these
letters (an unused one: obaa, obab, obam ..., ocaa ...). So:
- a folder with aa must have EVERY file its aa lists (ab, da, each texture,
  each part): otherwise the scene is REFUSED with a line naming the missing
  file, because the archive's file of that name would be mixed in;
- a folder with no model\aa at all is served nothing: the archive's own model
  of that number is drawn (whole), and the hand-over line says so.


Where it all happens, and when the game's own battle plays
----------------------------------------------------------
- When the game hands a battle over to the battle module, a map line or
  test_battle may name one of your battles. The scene is built then (its files
  read, checked, turned into the game's scene data). If anything is wrong, one
  line says what and where, and the GAME'S OWN battle plays.
- The Battle Square plays no scene of yours (refused with a line).
- The battle then loads the STAND-IN battle (the scene:formation that your
  formation's `camera` names); then everything is your scene's: its camera
  placement and pre-battle camera are those of `camera` in the GAME'S OWN
  scene.bin (read at start-up), as the compiler builds them, whichever
  scene.bin a mod makes the active one (New Threat's differs from the game's
  in 202 formations' camera bytes: your scene now looks the same under it).
- A battle of yours named by a scene's `next` or by a field's own BATTLE is
  built when it loads; if it cannot be built, the stand-in battle 0 (scene 0:0)
  plays instead, with a line.


What the log says
-----------------
At start-up:
    enemies: FF7_SpellExt_Enemies.ini: enemies all, scenes all, 1 battle map line(s), [models] 0 of 5 ...
    enemies: scene attacks indexed from ...\data\lang-en\battle\scene.bin (270336 bytes, 256 scenes, 696 records)
    enemies: registered (start-up): 2 enemies (...), 1 scenes (...), 0 file(s) skipped; 12 ms
    enemies: on: 2 enemies, 1 scenes ..., model pool 365-369 ...; the hand-over at 004082b5 is hooked; model files served through this DLL ...
At a battle of yours:
    enemies: battle 268 -> 1200 (DLL scene 300 'my_scene' formation 0; map, field 123 ...): enemies 365 'Name' (folder), ...; stand-in battle 318 (scene 79:2); AI 602 of 4096 bytes; 14 attacks (8 of the kernel); built in 9 ms
    enemies: DLL scene 300 written over stand-in 318 after loader call 1; field flags ...; pool models served from the enemy folders: the driver's file opens pass through this DLL until the battle is over
    battle 1200 (DLL scene 300 'my_scene', formation 0): enemies 365 'Name' (folder), ...; rows hold 365 366 365 -1 -1 -1; party ...
    enemies: model file OBAA -> enemies\folder\model\aa (asked by the driver)
    enemies: the DLL battle is over (its 3D data is freed): the driver's file opens are its own again
    enemies: the pool models of the last DLL battle are given back (another battle loads); the driver's file opens are its own
A refusal:
    enemies: battle 1200 (DLL scene 300 'my_scene', formation 0; test_battle) refused: folder/enemy.ini line 4: "abc" is not a number; the game's own battle 268 (scene 67, formation 0) plays


Enemy attacks with SpellExt's effects and cameras
-------------------------------------------------
An [attack NAME] of an enemy (enemy.ini / generated.ini) may name a native
effect of FF7_SpellExt_Effects.ini (one with play =) and cameras of its own:

    [attack fire]
    id = 0x1b                        ; a kernel spell (00-37: magic)
    script = 4                       ; the model's cast script (it has the ec step)
    camera = 0x1a0                   ; the camera on one target (as before: any number)
    camera_multi = 0x1a1             ; the camera on several targets (needs camera)
    effect = 0x210                   ; the effect on one target
    effect_all = 0x211               ; the effect when the record has results on several (needs effect)

    [attack quake]
    id = 0x047c                      ; a scene attack (0x100 and up)
    ...
    script = 4
    effect = 0x270                   ; 0x100 and up: a SpellExt effect; 0-255 / none: the game's effect byte, as before
    impact = none

- A kernel attack takes effect on magic only (00-37): the game plays an
  enemy's summon (38-47), enemy skill (48-5f) or limit (60-7f) as one, with
  tables of its own (refused, with the line). Its record stays the kernel's
  (power, element, MP, the name shown); only the look is SpellExt's.
- A scene attack with effect 0x100 and up gets the game's enemy effect 94 in
  its record: a routine that loads no file and shows the hit. The DLL plays the
  native effect over it; when it cannot (see below), that plain hit is shown.
  Its record no longer has the effect byte ff, so what the game does for an
  ff attack is not done for it (Cover; a frog enemy's script choice).
- A kernel attack's effect and effect_all must have the same base (the native
  effect's `base =` in the effects file): the record holds one effect byte.
- The effect plays at the model script's effect step (ec): script 4 is the cast
  of every converted monster. With script 3 (the attack, f7, no effect step)
  the effect is never played: the DLL and the compiler say so (not refused).
- One target or several: chosen from the targets the attack has results on, as
  for a party member's spell with animation_all.
- Nothing of this goes in the scene image but a scene attack's effect byte, so
  the compiler's image and the DLL's stay the same bytes.
- Two enemies of one scene may give the same kernel ID different extras: each
  enemy (slot) keeps its own.

FF7_SpellExt_Enemies.ini [attack N] gives the same for attack ID N in any
battle (a battle of the game's own too), when the battle's DLL scene gives
none for that enemy and ID. Keys: effect, effect_all, camera, camera_multi
(needs camera), script (the model script played, 3 to 0x3f: your choice; the
enemy's model must have that script; 0 and 1 are idle loops and 2 the death,
so they are refused, here and in an [attack] section). When the DLL scene's
enemy lists the ID without extras of its own, the registry gives it effect,
effect_all and camera_multi only: that enemy keeps its own camera and script. A camera here is set by the DLL for one target
and, without camera_multi, several. Kernel IDs are every enemy's (one
[attack 0x1b] changes every enemy's Fire); scene IDs are unique in the game.

If the effect is refused at the attack's set-up, nothing of the effect is changed and the
game's own effect plays (a kernel spell's own, a scene attack's plain hit of
enemy effect 94), with one line that says why: the effect is not in the effects
file, is a copy (an enemy attack plays native effects, play =, not copies), its
script is refused, the two effects have other bases, native effects are off,
or (scene attacks) the enemy effect 94 is not the game's file-less routine
(checked at start-up). A native effect that cannot start at its effect step
(its files, no task slot) plays the game's routine of the record's byte instead:
for a kernel attack that is the native effect's base (00-04 or 19: base 0x00,
which every native effect of the effects file has today, is Cure's routine, so
Cure's look is shown); for a scene attack the plain hit of enemy effect 94.

Log lines (at most 200 in a run):
    enemies: scene-attack effects: enemy effect 94 is the game's file-less routine 005d4788 (no preload): ...
    enemies: actor 4's attack 001b (DLL scene 330, enemy slot 0): native effect 0210 (0211 on several), record effect 00, type 02, targets 0001; cameras 01a0 (one target) 01a1 (several)
    native effect 0210: started for actor 4 (effects\MYFIRE.txt, record effect 00, targets 0001, ...)
    enemies: actor 5's attack 0318 (...): effect 0299 NOT played: effect 0299 is not in FF7_SpellExt_Effects.ini; the game's effect 94 plays (type 20)


Beside FFNx
-----------
FFNx reads a battle model's files itself. While a battle of yours whose
enemies have model folders lasts, FFNx's two file-open imports (CreateFileA and
CreateFileW) pass through this DLL; they are given back when that battle is
over (at the first file the driver opens after it), or when another battle
loads. Every request that is not a pool model's file is handed on unchanged,
and nothing of FFNx's code is changed.

FFNx can replace a scene.bin block from a file scene.bin.chunk.N of a mod; it
looks for N from the game's ORIGINAL battle (the one the map line or
test_battle replaced), not from your battle or its stand-in. So a mod that
ships a chunk for that original scene puts its block in place of the
stand-in's: the stand-in's member index then picks another scene's member of
that block, or a garbage offset, and the stand-in's load reads that (what this
DLL writes over the loaded scene afterwards is your scene's either way; a
garbage offset may fail the load itself). No mod known to this project ships
one (New Threat 2.0 does not).

[models] of FF7_SpellExt_Enemies.ini (365 = folder) is a testing aid: it serves
a pool model from a folder in EVERY battle, and while it assigns one, the two
imports pass through this DLL for the whole run. A battle of yours replaces the
assignment while it lasts.


Where the DLL and the converter's compiler differ (by design)
-------------------------------------------------------------
- A UTF-8 byte-order mark at the start of a file is skipped (the compiler
  refuses such a file).
- `ai` names the assembled block (ai.ai for ai.ai.txt); `ai = none` exists.
- Numbers: decimal or 0x hex only (Python's 0o, 0b and _ are not taken).
- Kernel attacks (ID below 0x100) carry the ACTIVE kernel's record and name, as
  the game shows them (a SpellExt rename counts); items by name are the active
  game's item names (0-127).
- A formation's camera placement and pre-battle camera, and a scene attack's
  `base`, come from the scene.bin the DLL read at start-up (the log line says
  which file: the game's own, data\lang-en\battle\scene.bin). If it could not
  be read, the camera placement is the stand-in's as the ACTIVE scene.bin holds
  it, and the line says so.
