FF7 SpellExt - spell file reference
===================================

Spells are defined in FF7_SpellExt_Spells.ini, in the SpellExtConfig folder
inside the game folder. The file is read each time the game starts. Problems are reported,
with line numbers, in FF7_SpellExt.log; a bad line is skipped and the rest
of the file still loads.

Layout
------
  [3000]                     attack ID in brackets: 3000 to 65534, unique
  key = value                one per line, in any order

- The Magic list is in three groups (restore, attack, indirect), in the order
  chosen under Config > Magic order. A new spell is listed after the game's
  original spells of its own group (see `order`), new spells in the order
  they are written here.
- Numbers are decimal, or hexadecimal with 0x.
- A comment starts with ; or # at the start of a line or after a space, so
  do not put " ;" or " #" inside a name or description.
- Lists take names and numbers separated by spaces or commas.

Basics
------
  name         shown in menus and the cast banner, up to 31 characters
               (about 12 fit a column of the Magic list)
  description  help line, up to 95 characters
  base         kernel attack ID (0 to 0x7f) to copy; anything not set by
               another key comes from it. Needed unless `bytes` is given.
  materia      who gets the spell:
                 any            every character
                 none           nobody (the default)
                 ID or ID:level up to four materia IDs; level 1-20, default 1
               Example: materia = 0x34:2 0x32

Support materia
---------------
Nothing is set in this file for support materia; they follow the links the
player makes, as for the original spells.
- All, Quadra Magic, MP Turbo, MP Absorb, HP Absorb, Added Cut, Steal as
  well: apply to every spell the linked materia has taught, new or original.
- Magic Counter, Sneak Attack, Final Attack: cast the last learned spell in
  the linked materia's ability list, as the Materia menu shows it. Spells
  are listed by the level that teaches them, originals before new ones, new
  ones in file order.

Record fields (offset in the 28-byte attack record)
---------------------------------------------------
  accuracy             0x00  attack %
  impact_effect        0x01  impact effect ID
  hurt_action          0x02  target hurt action
  mp                   0x04  MP cost, 0-999. (The game keeps a cost in one
                             byte; above 255 the DLL supplies the real cost
                             for the charge, the can-afford check and the
                             number shown. MP Turbo raises it as usual, to
                             999 at most.)
  impact_sound         0x06  impact sound (2 bytes)
  camera_single        0x08  camera movement, single target (2 bytes)
  camera_multi         0x0a  camera movement, multiple targets (2 bytes)
  target               0x0c  targeting flags (list, see below)
  animation            0x0d  attack effect: the kernel spell whose animation plays
  list                 -     magic (the default) or summon. A summon sits in
                             the Summon list instead of the Magic list and
                             has a limited number of uses per battle: one
                             for each level of the materia that grants it.
                             It is shown as a summon: the summon chime, the
                             caster's summoning glow, the party fading out
                             and coming back afterwards. The effect itself
                             is still the one named by animation. Grant it
                             from a materia of kind summon.
                             A character has 16 summon slots in all, the
                             game's summons included.
                               list = summon
  order                -     which group of the Magic list the spell sits in,
                             for the Config menu's Magic order setting:
                             restore, attack or indirect. The spell is listed
                             straight after the game's own spells of that
                             group, new spells in file order. Left out (or
                             auto): restore if it is restorative or takes
                             statuses away, attack if it does damage,
                             indirect otherwise.
                               order = attack
  fixed_damage         -     every hit of the spell does exactly this much HP
                             damage, 1 to 9999999, whatever the formula,
                             strength, defence and elements would have made
                             it. Still held to the damage limit (see
                             FF7_SpellExt_Game.ini), and a target that
                             absorbs the element is healed by it. none or
                             left out: the normal calculation.
  party_vanishes       -     for a summon: no casts it the way magic is cast,
                             with the party left on screen. Default: yes.
  animation_all        -     a different effect when the spell is cast on more
                             than one target (All, Mega All, a spell that
                             always hits a group); animation is then used
                             only for one target. Leave out, or none, to
                             use animation for both.
                               animation     = 0x9d
                               animation_all = 0x68
                             Enemy attack effects: scene.bin effect + 0x4e.
                             Enemy skill effects: + 0x36. Some effects made
                             for one target misbehave on several.
                             Seen working from a party member: 0x4e Light
                             Shell, 0x68 Big Wave, 0x9d Bubble, 0xaa Aero3,
                             0xb2 Blue Light, 0xb5 Tornade Wave, 0xba
                             St. Elmo's Fire, 0xe9 Diamond Flash, and 0xdd
                             Super Nova (the DLL makes Blue Light safe on
                             several targets and Super Nova safe outside
                             Safer Sephiroth's arena).
  script               -     the model script the CASTER plays, in place of
                             the command's own (Magic 0x1d, Summon 0x1f): a
                             party member's battle model has 74 scripts, and
                             this picks the one that shows the casting (the
                             wind-up before the effect, and the effect step,
                             ec).
                               script = 0x20
                             0x1c-0x21, 0x23, 0x25, 0x27, 0x29, 0x2b or 0x2d
                             (hex as here, or decimal); none (the default):
                             the command's own.
                             Used only when the caster's model, as it is at
                             that moment (a transformed form's, a frog's),
                             has that script and it preloads (e8) and plays
                             the effect (ec); otherwise the command's own
                             script plays, and the log says why, once. So a
                             spell that only a form's model has a gesture for
                             is cast the plain way by anyone else.
                             A spell that can be reflected may use 0x1c-0x1f
                             only (a reflected cast gives the number to the
                             actor that reflects it, and an enemy has 32): a
                             higher number is not used at the cast. Give such
                             a spell `special = -reflectable`, or a lower one.
                             For party members only (an enemy's attacks have
                             `script` in the enemies files). Not for limits:
                             the limits file has its own `script` (bytes).
                             Refused, with a line in the log and the spell
                             kept without it: 0-0x1b (idles, reactions,
                             Attack and the Cut turns), 0x22 0x24 0x26 0x28
                             0x2a 0x2c (the game plays the next number when
                             the cast has several targets), 0x2e-0x3b (the
                             game's own scripts for every model) and 0x3c up
                             (limits).
  script_bytes         -     the CASTER's own script for this spell, as
                             bytes in hexadecimal (as a limit's `script`),
                             so a new gesture needs no edit of the model's
                             script file:
                               script_bytes = e8 fc ea 06 07 ec 09 e5 ee
                             3 to 255 bytes, or none (the default). It plays
                             in place of the command's own script (Magic
                             0x1d, Summon 0x1f) for that one cast; the
                             model's own is back for the next.
                             Any command of the battle model scripts may be
                             used, under these rules (a refusal names it):
                             - one e8 (the preload), before one effect step:
                               ec, or d6 NN (the effect step NN frames
                               later; what plays after it must last NN + 2
                               frames). The last byte is ee (or ff), once.
                             - a command that moves the caster (ed e4 b0 b1
                               d1 d0 cc cf d5 e9 99 c4 c8 d4 9a fb bd fd a8
                               ab) needs an fa after the last of them: fa
                               puts the caster home (ab puts the caster on
                               the target's spot; its a6 moves only the
                               target back). a8 NN MM walks it home over
                               MM frames after NN, but not on a cast at the
                               caster itself: put it before the fa. A move
                               over frames (d1 d0 cc cf d5 e9 99 c4 c8 d4 a8)
                               must be over before that fa: what plays
                               between them must last its frames (and
                               delay) and one more. Their frame counts are
                               not 0, d0's NN is 0-7, and at most three of
                               them start with no animation or wait between.
                             - what lasts needs its undo after it: b6 NN ..
                               aa (the camera held), e7 00 or b8 .. e7 01 or
                               e1 (hidden), e2 .. e1 (faded; both need a
                               c6 NN before them: the fade's frames), a0/af
                               NN .. ae (the target held at bone NN), ab ..
                               a6 (the target moved), 8e .. 8f.
                             - c6 NN is 01-7f, and the last c6 is c6 0e:
                               the value stays for the rest of the battle
                               and every fade (the game's own too) divides
                               by it; 0e is the battle's own.
                             - e2 .. e1: wait the fade out between them, as
                               the game does (c5 f3 waits the c6's frames):
                               what plays between must last the largest c6
                               NN from the one before the e2 to the e1, and
                               two more (three before an e7 01), else the
                               caster stays hidden for the battle (a c6 just
                               after the e2 sets the fade's frames: put the
                               c6 0e after the e1).
                             - a hold c9 .. ca needs something that waits a
                               frame between the two (an animation, a7, a9,
                               b6, or f4 01 f3) and no effect step inside.
                               b3 (skip to the next b2 while the caster is
                               small) needs that b2, and may not skip the
                               preload, the effect step, the end, a hold, fa,
                               a8, an undo or a c6.
                             - b9 NN (one of the game's built-in cameras) is
                               00-66; ad's first byte is 00-0f; d7's second
                               (the hit mark) is 00-47.
                             - f7 be c2 a1 show the results and are allowed,
                               with a line in the log: the spell's effect
                               shows its hits too, so each number may show
                               twice. Place the ec (or d6) at the hit instead.
                             Refused: 9e f1 fe c1 (never finish, or end the
                             cast early), a2 ac (reload the model), eb (the
                             Item / Throw step), da (changes the effect), 9d
                             (a limit's effect), bf dc f5 f8 90 (write or read
                             past a table), 92 93 bc e3 (stop the clock, white
                             out, change the resting camera or the home for
                             the battle), b7 c3 f6 97 (deaths), c7 (another
                             actor's script), ce (an enemy's), 98 a3 (not
                             known yet), and bb c0 cd d2 d3 d9 ef, which are
                             not commands: the game plays them as animation
                             numbers (write a7 bb to play animation bb).
                             The animation numbers are the CASTER's: 00-2b
                             and 34-8d as a byte, any number as a7 NN (it
                             starts as many frames in as the animation
                             before it has run: after a one-frame one such
                             as 06, at its frame 1), a9 xx NN (0-15 frames
                             in) or b6 NN. 2c-33 are a limit pack's and are
                             refused: a spell loads no pack. On a party
                             model 34-67 are weapon tracks, not animations;
                             animations added with anim_tool's slots get
                             68-9b or d0-ff, and 68-8d play from their first
                             frame as a plain byte.
                             Refused at reading, with a line in the log and
                             the spell kept without that line (its other
                             lines stay).
                             Not used at the cast (the command's own script
                             plays, and the log says why, once): an enemy
                             caster, a frog, a model without an animation
                             the script plays (or with a weapon track
                             there), a0/af with a bone the model lacks, d6
                             with too few frames after it, a move not over
                             before the last fa, an e2 whose fade is not
                             over before its e1, a slot a state lends, a
                             caster no line is for. The
                             frames are counted from the caster's model:
                             an animation's frames less one, f4 NN .. f3 as
                             NN, c5 .. f3 as the last c6's NN, a7 a9 b6 as
                             none, nothing a b3 may skip.
                             One line per model: start a line with the
                             model's code and a colon, the two letters of
                             its script file (as the log names it, any
                             case) or the whole name; several codes apart
                             by spaces or commas:
                               script_bytes = zo: e8 fc ea ... e5 ee
                               script_bytes = zp zq, zr: e8 fc ... e5 ee
                               script_bytes = e8 fc ea 06 07 ec 09 e5 ee
                             A line without codes is for every other
                             model. At the cast the caster plays the
                             first line naming its model, else the line
                             for every model, else the command's own
                             script (and the log says which line played,
                             or why none). Mime plays the mimic's line.
                             Each line is checked on its own: a refused
                             line is not used, the others are. Up to 8
                             lines a spell and 16 codes a line; a later
                             line for every model replaces the earlier;
                             a code a line names again is not used there;
                             none drops the lines given before it. All
                             the spells' lines together: 128.
                             With script and script_bytes both, script is
                             not used (a line in the log). Up to 64 spells
                             may carry it. For party members only; not for
                             limits (a limit has its own `script`).
  script_bytes_model   -     the older way to write one model's line:
                               script_bytes_model = zo
                             makes the spell's line without codes the
                             line for zo (as `zo:` on it would). Any other
                             caster then plays the spell's other lines, or
                             the plain way. Without a line with no codes
                             it is not used (a line in the log). A caster
                             with no line is named in the log ("the
                             caster's script file is XY..AB"): those are
                             the letters to write.
  damage_formula       0x0e  damage calculation (see below)
  strength             0x0f  power used by the damage formula
  condition            0x10  hp, mp, status, none, or a number
  status_mode/_chance  0x11  see Status
  additional_effect    0x12  additional effect ID
  additional_modifier  0x13  its modifier
  status               0x14  status flags (list, 4 bytes)
  element              0x18  element flags (list, 2 bytes)
  special              0x1a  special attack flags (list, 2 bytes)

Any field can also be set by its hex offset:
  byte_10  = 0xff          one byte at offset 0x10
  word_06  = 0xffff        two bytes
  dword_14 = 0xffffffff    four bytes
  bytes    = 64 ff 00 ...  all 28 bytes as hex pairs

Status
------
  status        = sleep poison     which statuses; none = no status effect
  status_mode   = inflict          inflict (default), cure, or toggle
  status_chance = 72               percent in steps of 4, or always (default)

Names: death near_death sleep poison sadness fury confusion silence haste
slow stop frog small slow_numb petrify regen barrier mbarrier reflect dual
shield death_sentence manipulate berserk peerless paralysis darkness
dual_drain death_force resist lucky_girl imprisoned

- A damage spell can carry a status as well, as Bio does.
- The game's own values: Sleepel 72, Silence 80, Confu and Stop 60, Slow 100,
  Death 44, Bio 48, Bio3 72; Haste, Barrier, Regen, Poisona, Esuna: always;
  Mini and Toad: toggle, 72.
- The community wiki warns that inflicting dual_drain without dual crashes
  the game.

Element
-------
Names: fire ice lightning (or bolt) earth poison gravity water wind holy
restorative cut hit punch shoot shout hidden; or none.

Target
------
  selectable   0x01  a target can be chosen
  enemy        0x02  cursor starts on the enemy row
  multiple     0x04  all targets in a row by default
  toggle       0x08  can switch between one target and all
  one_row      0x10  cursor cannot leave its row
  short_range  0x20  half damage unless both are in the front row (physical)
  all_rows     0x40  all rows
  random       0x80  one of the selected targets at random
Examples from the game: Fire 0x0f (selectable enemy multiple toggle),
Cure 0x0d, summons 0x17.

Special
-------
`special` sets the whole field: the flags listed are on, the rest off.
So `special = drain_hp` on a copy of Fire also turns OFF Fire's own flag
(reflectable). To change flags and keep the rest of what the base has, give
every name a sign:
    special = +drain_hp            add drain, keep the base's other flags
    special = -reflectable         remove one flag
    special = +drain_hp -reflectable
The same works for `element`, `target` and `status`. A line is either all
signed names or none; mixing the two is reported as an error. The log shows
the resulting fields for any spell that uses signs.
  damage_mp              damage MP instead of HP
  darkness_affects       treated as a physical attack: darkness halves its
                         accuracy, it can be covered, and it is reduced by
                         physical defence instead of magic defence
  drain_hp               caster drains some of the damage
  drain_hp_mp            caster drains HP and MP
  ignore_status_defense  ignore status defence when inflicting
  miss_unless_dead       miss if the target is not dead
  reflectable            can be reflected
  ignore_defense         ignore defence
  no_retarget            do not re-target if the target has died
  always_critical        always a critical hit
  flag_0002, flag_0040   nothing in the game's code reads these; flag_0002 is
                         on for Fire3, Ice3, Bolt3 and the summons
Examples from the game: Fire is `reflectable`; Fire3 is `reflectable flag_0002`.

Do not combine `reflectable` with several hits (`additional_effect = 0`).
No spell in the game does (Comet2 is not reflectable), and the game does not
cope: when the hits are split between bouncing and landing, a target killed
by a hit that landed is dead for the battle's purposes but its death is not
shown. A copy of Fire given several hits should also get
`special = -reflectable`.

Damage formula
--------------
One byte: the upper digit chooses how the hit is checked, the lower digit
the formula.
  Upper: 0 physical, always hits        1 physical, uses accuracy, can crit
         2 magical, uses accuracy       3 physical, always hits
         4 magical, always hits         5 magical, always hits
  Lower: 0 no damage                    1 physical formula
         2 magical formula              3 current HP x strength / 32
         4 max HP x strength / 32       5 (strength x 22) + (level + stat) x 6
         6 strength x 20                7 strength / 32
The game's own values: 0x22 damage spells and most status spells, 0x25 Cure,
0x24 Life and FullCure, 0x23 Demi, 0x50 Barrier, Haste, Slow and Stop.

Where this comes from
---------------------
- mp, target, animation, strength, element and the status fields were
  confirmed in the engine and in the game.
- The other field names, the special flags, the target flags and the damage
  formulas are from the community wiki
  (ff7-mods.github.io/ff7-flat-wiki/FF7/Attack_data.html) and have not been
  tested in game with this DLL.

Kernel magic IDs (for base and animation)
-----------------------------------------
00 Cure       01 Cure2      02 Cure3      03 Regen      04 Poisona
05 Esuna      06 Resist     07 Life       08 Life2      09 Mini
0a Toad       0b Sleepel    0c Confu      0d Silence    0e Berserk
0f Barrier    10 MBarrier   11 Reflect    12 Wall       13 Haste
14 Slow       15 Stop       16 DeBarrier  17 DeSpell    18 Death
19 Escape     1a Remove     1b Fire       1c Fire2      1d Fire3
1e Ice        1f Ice2       20 Ice3       21 Bolt       22 Bolt2
23 Bolt3      24 Quake      25 Quake2     26 Quake3     27 Bio
28 Bio2       29 Bio3       2a Demi       2b Demi2      2c Demi3
2d Comet      2e Comet2     2f Freeze     30 Break      31 Tornado
32 Flare      33 FullCure   34 Ultima     35 Shield

Example
-------
  [3100]
  name          = Chill Touch
  description   = Ice damage that may slow the target
  base          = 0x1f
  mp            = 12
  status        = slow
  status_chance = 60
  materia       = 0x32:2
