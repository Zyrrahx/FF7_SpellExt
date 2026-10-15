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
                             (0x100 and up: an effect copy from
                             FF7_SpellExt_Effects.ini, a game effect with
                             files of your own; see its readme)
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
