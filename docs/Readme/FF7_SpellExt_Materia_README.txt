FF7 SpellExt - materia file
===========================

File: FF7_SpellExt_Materia.ini, in the SpellExtConfig folder next to ff7_en.exe. Read every time the game
loads its kernel data (at start-up), after the spell file. Problems are
reported in FF7_SpellExt.log with the line number.

Each new materia is a section whose name is its materia ID, from 96 to 254.
(The kernel's own materia are 0 to 95. 255 means "no materia".)

    [96]
    name = Test Magic
    kind = magic
    kernel_spells = 0x1b, 0x1c, 0x1d

A comment starts with ; or # at the start of a line or after a space.
Numbers can be decimal or 0x-prefixed hex.

A materia is defined entirely by its own section. Nothing is taken from the
game's own materia unless you ask for it with  base  (see Advanced).


Required
--------
kind            magic, summon, command, support or independent.
                This decides the colour and how the game treats it.
                (Or give the exact  type  byte instead; see Advanced.)

Anything else you leave out gets a plain default: no growth, no spells or
attributes, no stat change, no element, no status, cannot be sold.


Text
----
name            Up to 31 characters.
description     Up to 95 characters.


Growth
------
ap              Up to 19 AP totals, one for each level after the first,
                each a multiple of 100 and higher than the one before:
                    ap = 2000, 18000, 35000      (four levels)
                    ap = none                    (never grows)
                Default: none.
                The game's own materia stop at five levels (four totals).
                Give more totals and the materia has up to twenty:
                    ap = 2000, 6000, 12000, 20000, 30000, 45000, 60000
                                                 (eight levels)
                See "More than five levels" below for what the levels past
                the fifth can do.


Spells (magic materia)
----------------------
kernel_spells   The kernel spell each level teaches, up to five, in level
                order. Use none for a level that teaches no kernel spell,
                or  kernel_spells = none  for no kernel spells at all.
                Default: none.
spells          Extended spells (IDs 3000 and up, from the spell file) this
                materia grants, each optionally with the level that grants it:
                    spells = 3001:1, 3100:2
                The level can be anything from 1 to 20.
                This is the same link as  materia = 96:2  in the spell file;
                use either side, or both. If both name the same pair, the
                lower level wins. Up to 24 per line here; a spell can be
                granted by at most 4 materia in total.


Summons (summon materia)
------------------------
A materia of kind summon can hold extended summons: spells from the spell
file that have  list = summon.  Link them with  spells =  here or
materia =  in the spell file, as for magic.

    [101]
    name   = Nova
    kind   = summon
    ap     = 20000, 50000, 80000, 120000
    spells = 3014
    uses   = 1, 2, 3, 4, 5

uses            Uses per battle at each materia level, up to 20 numbers
                from 1 to 254. Default: the game's rule, one for each level
                reached.

To hold one of the game's own summons instead, give its kernel ID as the
first attribute (see the list at the end), e.g.  attributes = 0x3a.

Support materia linked to the summon materia act on its extended summons as
they do on the game's: Quadra Magic, MP Turbo, HP Absorb, MP Absorb, Added
Cut, Steal as well, and the counter kinds (Magic Counter, Sneak Attack,
Final Attack, Counter). All does nothing with a summon, as in the game.


Effects when equipped
---------------------
equip_effect    0-16: one of the game's fixed stat changes. Default: 0.
                  Str Vit Mag Spr Dex Luck  MaxHP%  MaxMP%
                 0  -   -   -   -   -   -     -       -
                 1 -2  -1  +2  +1   -   -    -5      +5
                 2 -4  -2  +4  +2   -   -   -10     +10
                 3  -   -   -   -  +2  -2     -       -
                 4 -1  -1  +1  +1   -   -     -       -
                 5 +1  +1  -1  -1   -   -     -       -
                 6  -  +1   -   -   -   -     -       -
                 7  -   -   -   -   -  +1     -       -
                 8  -   -   -   -   -  -1     -       -
                 9  -   -   -   -  -2   -     -       -
                10  -   -   -   -  +2   -     -       -
                11 -1   -  +1   -   -   -    -2      +2
                12  -   -  +1   -   -   -    -2      +2
                13  -   -  +1  +1   -   -    -5      +5
                14  -   -  +2  +2   -   -   -10     +10
                15  -   -  +4  +4   -   -   -10     +15
                16  -   -  +8  +8   -   -   -10     +20
element         One element (for Elemental pairing): fire ice lightning
                earth poison gravity water wind holy ... or none.
                Default: none.
status          Status names (for Added Effect pairing), from the first 24
                of the spell file's list (death ... berserk), or none.
                Default: none.


Shops and testing
-----------------
price           Shop price. 1 means it cannot be sold. Default: 1.
give_on_load    yes puts one in the materia stock whenever a save is loaded
                that does not already have it (in stock or equipped).


Testing: the [test] section
---------------------------
A section named [test] gives materia of ANY ID, kernel ones included, the
same way give_on_load does: one is put in the materia stock whenever a save
is loaded that does not already have that materia in stock or equipped.

    [test]
    give_materia = 0x1f:master      ; Sneak Attack, mastered
    give_materia = 0x0c, 0x31:5000  ; Mega All with no AP, Fire with 5000 AP

Each entry is ID, ID:AP or ID:master. Up to 16 entries. Remove the section
when you are done testing.


Attributes (every kind except magic)
------------------------------------
attributes      The six attribute bytes, in order; none for an unused one.
                What they mean depends on the kind. For a magic materia use
                kernel_spells instead (it sets the same six bytes).
                The game's own materia use them like this:

                summon        the summon's kernel spell ID, then the number
                              of uses at each of the five levels
                                  attributes = 0x3a, 1, 2, 3, 4, 5   (Ifrit)
                command       the command ID each level adds
                                  attributes = 0x05, 0x11       (Steal, Mug)
                support       the support effect, then its strength at each
                              level
                                  attributes = 0x54, 30, 40, 60, 80, 100
                                                                 (Counter)
                independent   the stat or effect, then its amount at each
                              level
                                  attributes = 0x08, 10, 20, 30, 40, 50
                                                                 (HP Plus)

                The game's materia and their attribute bytes are listed at
                the end of this file to copy from.

                For a summon, support or independent materia with more than
                five levels, carry on after the six with the value at levels
                6, 7 ... up to 20:
                    attributes = 0x08, 10, 20, 30, 40, 50, 60, 70, 80
                                              (an HP Plus with eight levels)


More than five levels
---------------------
A materia can have up to twenty levels: give  ap  more than four totals.
In the Materia menu a materia of six to ten levels still has a star for
each level, closer together so they fit where five were. With more than ten
levels the materia's own panel shows two rows of up to ten stars, and the
one-line bar with its name shows one star and figures, for example 12/15. The
menu also shows the AP still needed, and MASTER at the last; a new materia is
born when the last level is reached, as usual.

What a level past the fifth does depends on the kind:

  magic         Teaches the spells that name that level:  spells = 3001:7
                here, or  materia = 96:7  in the spell file. The game's own
                (kernel) spells can only be taught at levels 1 to 5.
  summon        Uses per battle: the  uses  line takes up to 20 numbers.
                Extended summons can also name a level, as for magic.
  support       The value at that level, from the entries after the sixth
  independent   on the  attributes  line (see above). With none given, the
                materia goes on gaining levels but works as it does at
                level 5.
  command       The commands are those of levels 1 to 5; further levels
                add nothing by themselves.

Limits to know about:
- A few of the game's materia use the level NUMBER itself, not a value from
  the list, and that number stops at 5 for them: Mega All (All uses for every
  spell) and the level-dependent part of some menu texts.
- If a list is shorter than the materia's levels, the last value is used for
  the levels after it.
- This file defines new materia (96 to 254). To give one of the game's own
  materia more levels, make a new materia from it with  base.

    [102]
    name       = HP Plus II
    base       = 0x01                    ; HP Plus
    ap         = 10000, 20000, 30000, 50000, 80000, 120000, 160000
    attributes = 0x08, 10, 20, 30, 40, 50, 60, 70, 80
    price      = 8000


Advanced
--------
type            The exact type byte (record offset 0x0d), instead of kind.
                The low digit picks the game's handler and the colour, the
                high digit a sub-type.  kind  writes the commonest one:
                    magic 0x19, summon 0x3b, command 0x16, support 0x25,
                    independent 0x20
                Others the game uses (see the list at the end):
                    0x12 command that replaces Attack (Slash-All, Double Cut)
                    0x57 Enemy Skill
                    0x35 support counted in uses (All, Final Attack, Quadra)
                    0x40, 0x41, 0x21, 0x30, 0x33, 0x34, 0x00 the other
                         independent materia
byte_XX         Set one byte of the 20-byte record; XX is the offset in hex.
base            Optional. A kernel materia (0-95) to start from instead of
                the plain defaults: every key you leave out is then taken
                from that materia, its price included.


Known limits
------------
- 159 new materia (IDs 96-254).
- New materia can be of any existing kind; new KINDS of behaviour are not
  possible from this file.
- Stat changes are limited to the 17 fixed equip effects above.
- A save that contains a new materia needs the DLL and this file to load
  correctly.


The game's own materia, for reference
-------------------------------------
ID   Name            type  equip  attributes
0x00 MP Plus         0x20  0      0x09, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x01 HP Plus         0x20  0      0x08, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x02 Speed Plus      0x20  0      0x04, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x03 Magic Plus      0x20  0      0x02, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x04 Luck Plus       0x20  0      0x05, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x05 EXP Plus        0x40  7      0x0a, 0x18, 0x20, none, none, none
0x06 Gil Plus        0x41  7      0x00, 0x18, 0x20, none, none, none
0x07 Enemy Away      0x41  7      0x01, 0x07, 0x0e, none, none, none
0x08 Enemy Lure      0x41  8      0x01, 0x07, 0x0e, none, none, none
0x09 Chocobo Lure    0x41  7      0x02, 0x08, 0x0c, 0x10, none, none
0x0a Pre-Emptive     0x21  10     0x03, 0x10, 0x16, 0x1c, 0x22, 0x30
0x0b Long Range      0x30  0      0x50, none, none, none, none, none
0x0c Mega All        0x34  0      0x51, 0x01, 0x02, 0x03, 0x04, 0x05
0x0d Counter Attack  0x20  0      0x53, 0x1e, 0x28, 0x3c, 0x50, 0x64
0x0e Slash-All       0x12  0      0x18, 0x1a, none, none, none, none
0x0f Double Cut      0x12  10     0x19, 0x1b, none, none, none, none
0x10 Cover           0x20  6      0x0b, 0x14, 0x28, 0x3c, 0x50, 0x64
0x11 Underwater      0x00  0      0x0c, none, none, none, none, none
0x12 HP<->MP         0x00  0      0x62, none, none, none, none, none
0x13 W-Magic         0x33  0      0x15, none, none, none, none, none
0x14 W-Summon        0x33  0      0x16, none, none, none, none, none
0x15 W-Item          0x33  0      0x17, none, none, none, none, none
0x17 All             0x35  0      0x51, 0x01, 0x02, 0x03, 0x04, 0x05
0x18 Counter         0x25  0      0x54, 0x1e, 0x28, 0x3c, 0x50, 0x64
0x19 Magic Counter   0x25  0      0x55, 0x1e, 0x28, 0x3c, 0x50, 0x64
0x1a MP Turbo        0x25  0      0x58, 0x0a, 0x14, 0x1e, 0x28, 0x32
0x1b MP Absorb       0x25  0      0x59, 0x01, none, none, none, none
0x1c HP Absorb       0x25  0      0x5a, 0x01, none, none, none, none
0x1d Elemental       0x25  0      0x5e, 0x00, 0x01, 0x02, none, none
0x1e Added Effect    0x25  0      0x5f, 0x01, none, none, none, none
0x1f Sneak Attack    0x25  0      0x56, 0x14, 0x23, 0x32, 0x41, 0x50
0x20 Final Attack    0x35  0      0x57, 0x01, 0x02, 0x03, 0x04, 0x05
0x21 Added Cut       0x25  0      0x5c, 0x01, none, none, none, none
0x22 Steal as well   0x25  0      0x5d, 0x01, none, none, none, none
0x23 Quadra Magic    0x35  0      0x63, 0x01, 0x02, 0x03, 0x04, 0x05
0x24 Steal           0x16  10     0x05, 0x11, none, none, none, none
0x25 Sense           0x16  0      0x06, none, none, none, none, none
0x27 Throw           0x16  6      0x08, 0x07, none, none, none, none
0x28 Morph           0x16  0      0x09, none, none, none, none, none
0x29 Deathblow       0x16  7      0x0a, none, none, none, none, none
0x2a Manipulate      0x16  0      0x0b, none, none, none, none, none
0x2b Mime            0x16  0      0x0c, none, none, none, none, none
0x2c Enemy Skill     0x57  0      0x0d, none, none, none, none, none
0x30 Master Command  0x08  0      none, none, none, none, none, none
0x31 Fire            0x19  11     0x1b, 0x1c, 0x1d, none, none, none
0x32 Ice             0x19  11     0x1e, 0x1f, 0x20, none, none, none
0x33 Earth           0x19  11     0x24, 0x25, 0x26, none, none, none
0x34 Lightning       0x19  11     0x21, 0x22, 0x23, none, none, none
0x35 Restore         0x19  11     0x00, 0x01, 0x03, 0x02, none, none
0x36 Heal            0x19  11     0x04, 0x05, 0x06, none, none, none
0x37 Revive          0x19  1      0x07, 0x08, none, none, none, none
0x38 Seal            0x19  11     0x0b, 0x0d, none, none, none, none
0x39 Mystify         0x19  11     0x0c, 0x0e, none, none, none, none
0x3a Transform       0x19  11     0x09, 0x0a, none, none, none, none
0x3b Exit            0x19  11     0x19, 0x1a, none, none, none, none
0x3c Poison          0x19  11     0x27, 0x28, 0x29, none, none, none
0x3d Gravity         0x19  11     0x2a, 0x2b, 0x2c, none, none, none
0x3e Barrier         0x19  1      0x0f, 0x10, 0x11, 0x12, none, none
0x40 Comet           0x19  1      0x2d, 0x2e, none, none, none, none
0x41 Time            0x19  1      0x13, 0x14, 0x15, none, none, none
0x44 Destruct        0x19  1      0x16, 0x17, 0x18, none, none, none
0x45 Contain         0x19  2      0x2f, 0x30, 0x31, 0x32, none, none
0x46 Full Cure       0x19  2      none, 0x33, none, none, none, none
0x47 Shield          0x19  2      none, 0x35, none, none, none, none
0x48 Ultima          0x19  2      none, 0x34, none, none, none, none
0x49 Master Magic    0x0a  0      none, none, none, none, none, none
0x4a Choco/Mog       0x3b  12     0x38, 0x01, 0x02, 0x03, 0x04, 0x05
0x4b Shiva           0x3b  12     0x39, 0x01, 0x02, 0x03, 0x04, 0x05
0x4c Ifrit           0x3b  12     0x3a, 0x01, 0x02, 0x03, 0x04, 0x05
0x4d Ramuh           0x3b  12     0x3b, 0x01, 0x02, 0x03, 0x04, 0x05
0x4e Titan           0x3b  12     0x3c, 0x01, 0x02, 0x03, 0x04, 0x05
0x4f Odin            0x3b  13     0x3d, 0x01, 0x02, 0x03, 0x04, 0x05
0x50 Leviathan       0x3b  13     0x3e, 0x01, 0x02, 0x03, 0x04, 0x05
0x51 Bahamut         0x3b  13     0x3f, 0x01, 0x02, 0x03, 0x04, 0x05
0x52 Kjata           0x3b  13     0x40, 0x01, 0x02, 0x03, 0x04, 0x05
0x53 Alexander       0x3b  13     0x41, 0x01, 0x02, 0x03, 0x04, 0x05
0x54 Phoenix         0x3b  14     0x42, 0x01, 0x02, 0x03, 0x04, 0x05
0x55 Neo Bahamut     0x3b  14     0x43, 0x01, 0x02, 0x03, 0x04, 0x05
0x56 Hades           0x3b  15     0x44, 0x01, 0x02, 0x03, 0x04, 0x05
0x57 Typoon          0x3b  15     0x45, 0x01, 0x02, 0x03, 0x04, 0x05
0x58 Bahamut ZERO    0x3b  15     0x46, 0x01, 0x02, 0x03, 0x04, 0x05
0x59 Knights of Roun 0x3b  16     0x47, 0x01, 0x02, 0x03, 0x04, 0x05
0x5a Master Summon   0x0c  0      none, none, none, none, none, none


A full stock, and stolen materia
--------------------------------
- When the materia stock is full (200) and a materia is born, the game overwrites the least valuable piece in
  the stock by a fixed order of its own. A new materia (96-254) now ranks above every one of the game's in that
  order: it is the last to be overwritten.
- When all materia are stolen (the Wutai theft) the game takes 48 pieces, the most valuable by the same fixed
  order, holds them in the save and gives them back later; with more than 48 the rest stay with the player. A
  new materia (96-254) counts as more valuable than any of the game's there: new materia are among the first
  taken, and come back with the rest. (Before, which new materia were taken was a matter of chance.)
- FFNx's Steam achievements and new materia. On the Steam edition FFNx 1.24.3 switches its Steam achievements ON
  by itself, whatever enable_steam_achievements in FFNx.toml says: you cannot turn them off there. FFNx counts
  mastered materia in a list sized for the game's 91 kinds and, for a MASTERED materia with an ID of 91 to 254,
  writes outside that list: at every load of a save that holds one (in the stock, stolen, or equipped on one of
  the original nine), and at the results of the battle in which one equipped on the original nine is mastered.
  What that damages depends on the ID; it can end the game at a later movie, load or exit. That is in FFNx's
  code, and this mod does not change FFNx. Instead it shows FFNx's two routines a VIEW:
    - while FFNx reads a save at a load, such a materia is shown one AP short of mastered, then put back;
    - while FFNx notes the party at a battle's start, every equipped materia of ID 91-254 is shown as mastered
      already (FFNx then never looks it up at the results), then put back.
  Nothing in your save or in the game changes: the save, the materia and their AP are byte for byte what they are
  without the view. FFNx counts the game's own 91 materia exactly as before; it never counts a new one (the Steam
  achievement knows 91 kinds).
  The log says at start-up "materia view: ... the view is in" for both moments. A line
  "*** materia view: NOT fully at work" means it is not: until it is, do not master a new materia and do not keep
  a mastered one in a save.
  Key in FF7_SpellExt_Game.ini (leave it out for yes):
      achievement_materia_view = yes        ; yes | no
  If the game crashes while a battle is loading, do not continue from crash.ff7: new materia equipped on the
  original nine may show as mastered in it.
  New materia on a NEW character (a seat) are not looked at by FFNx at all.
