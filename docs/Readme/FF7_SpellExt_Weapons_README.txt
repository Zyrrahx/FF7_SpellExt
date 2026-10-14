FF7 SpellExt - weapon file
==========================

File: FF7_SpellExt_Weapons.ini, in the SpellExtConfig folder next to ff7_en.exe. Read every time the game
loads its kernel data (at start-up). Problems are reported in FF7_SpellExt.log
with the line number.

Each new weapon is a section whose name is its ITEM ID, from 320 to 383 (64 in all).
That is the number to use when giving the item from a field script.
(Inside the game the weapon's own number is the item ID minus 128.)

For more weapons, number them from 10000: WIDE WEAPONS, [10000] to [15999]. They
need box = on or auto and wide_items = on in the game file, and live in the box
or on a character (read FF7_SpellExt_Box_README.txt, "WIDE GEAR").

The numbers belong to one kind each, and a section numbered for another kind is
NOT read: the log says whose number it is and where weapons are numbered, e.g.
    weapon file line 12: [400] is a new armour number (384 to 415 are armour
    numbers), not a weapon's: new weapons are [320] to [383]; for more weapons,
    number them from 10000 ([10000] to [15999], with box = on or auto and
    wide_items = on in the game file). The section is not read
    0-104 the game's items          105-127 new items
    128-255 the game's weapons      256-287 the game's armour
    288-319 the game's accessories  320-383 new weapons
    384-415 new armour              416-447 new accessories
    448-511 new items               512-1023 never used (the game's own
                                    arithmetic makes values there)
    1024-9999 wide items            10000-15999 wide weapons
    16000-21999 wide armour         22000-27999 wide accessories
    28000 and up: not given to anything.
The game's own weapons (128-255) cannot be changed from this file; a new weapon
can copy one with base.

    [320]
    name = Test Blade
    base = 0

A comment starts with ; or # at the start of a line or after a space.


Required
--------
base            The kernel weapon to copy everything from: its weapon number
                (0-127) or its item ID (128-255). Every key below overrides
                one thing from that copy. Choose a base that belongs to the
                character who will use the weapon: the battle model and
                attack animation come from the base.


Text
----
name            Up to 31 characters.
description     Up to 95 characters.


Stats
-----
power           0-255. Attack power.
accuracy        0-255. Hit chance.
critical        0-255. Critical hit chance.
growth          Materia growth rate: 0 none, 1 normal, 2 double, 3 triple.
element         List of: fire ice lightning earth poison gravity water wind
                holy restorative cut hit punch shoot shout hidden, or none.
status          The weapon's status-attack byte (255 = none).
bonus           Up to four stat bonuses, e.g.  bonus = strength 10, magic 5
                Stats: strength vitality magic spirit dexterity luck.
                bonus = none removes the base weapon's bonuses.
slots           Materia slots, left to right, up to 8 in total:
                  pair              two linked slots
                  single            one unlinked slot
                  pair_nogrowth     two linked slots that give no AP
                  single_nogrowth   one unlinked slot that gives no AP
                  chain3 ... chain8 three to eight slots linked in a row
                  chain3_nogrowth   (and so on) a chain that gives no AP
                  none              no slots
                e.g.  slots = pair pair single
                      slots = chain5 single
                In a chain every materia works with the one on either side
                of it, so a support materia in the middle serves both its
                neighbours:
                  Fire - All - Ice - MP Turbo - Lightning
                gives All to Fire and Ice, and MP Turbo to Ice and Lightning.
                Two support materia either side of one magic materia both
                apply to it (All - Fire - MP Turbo). Materia two places
                apart do not affect each other.


Who and where
-------------
equip           Who can equip it: cloud barret tifa aeris red yuffie
                caitsith vincent cid youngcloud sephiroth, or everyone,
                or none. Default: as the base.
                A character can also be given by its ID number: 0 Cloud,
                1 Barret, 2 Tifa, 3 Aeris, 4 Red XIII, 5 Yuffie, 6 Cait Sith,
                7 Vincent, 8 Cid; and 12 to 43 for the characters of the
                character file, by the ID of their section. Names and IDs
                can be mixed:  equip = vincent 12
                A character of the character file is allowed wherever it is
                seated; one made with copy_of can equip what its original is
                named for.
                A number written as 0x.... is the raw mask instead (one bit
                per ID up to 15; 0x1000 is the same as 12).
                A new character can be given by the name its section of the
                character file has, too:  equip = newcomer   (one word; capital
                letters do not matter).
sell            yes or no. Default: as the base.
throw           yes or no. Default: as the base.
price           Buying price in gil; selling pays half. Default: as the base.
icon            Item icon: sword glove gunarm headdress staff spear shuriken
                megaphone gun, or a kernel weapon number. Default: as the base.
throw_like      Kernel weapon whose thrown model and effect to use.
                Default: the base. Kernel weapons 0, 16-31, 48-61 and 127
                have no throw effect; name another one here if the weapon
                is to be throwable.


Advanced
--------
target          Target flags byte.
damage_formula  Damage formula byte.
model           Model byte: selects the weapon model within the character's
                battle model (see the wiki's weapon data page).
byte_XX         Set one byte of the 44-byte record; XX is the offset in hex.
word_XX         Set two bytes.
                e.g.  byte_04 = 99   is the same as  power = 99


Testing aid
-----------
give_on_load    yes puts one of the weapon in the stock whenever a save is
                loaded that does not already have it (in stock or equipped).
                Remove it once the weapon is handed out by a field script.


Known limits
------------
- 64 new weapons (item IDs 320-383).
- Shops show a new weapon as a plain item when buying: no comparison panel.
- The equip menu's Optimize-style search ignores new weapons.
- A save that contains a new weapon needs the DLL and the weapon file to
  load correctly.
