FF7 SpellExt - armour file
==========================

File: FF7_SpellExt_Armour.ini, in the SpellExtConfig folder next to ff7_en.exe.

Each new armour is a section whose name is its ITEM ID, from 384 to 415
(32 in all). That is the number to use when giving it from a field script.
For more armour, number it from 16000: WIDE ARMOUR, [16000] to [21999] (box = on
or auto and wide_items = on in the game file; see FF7_SpellExt_Box_README.txt,
"WIDE GEAR"). Do NOT add 10000 to an armour number: 10000-15999 are weapons.
A section numbered for another kind (a weapon's 320-383, an accessory's
416-447, an item's, the game's own 256-287, 512-1023, 28000 and up) is NOT read,
and the log says whose number it is (the table of numbers is in
FF7_SpellExt_Weapons_README.txt).

    [384]
    name = Test Bangle
    base = 0

A comment starts with ; or # at the start of a line or after a space.
Problems are reported in FF7_SpellExt.log with the line number. The file is
read every time the game loads its kernel data (at start-up).


Required
--------
base            The game's armour to copy everything from: its number (0-31)
                or its item ID (256-287). 0 is the Bronze Bangle. Every key
                below overrides one thing from that copy.


Text
----
name            Up to 31 characters.
description     Up to 95 characters.


Stats
-----
defense         0-255.            (defence is accepted too)
magic_defense   0-255.
evade           0-255. Defense %.
magic_evade     0-255. Magic defense %.
growth          Materia growth: none, normal, double or triple.
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
bonus           Up to four stat bonuses, e.g.  bonus = vitality 10, spirit 5
                Stats: strength vitality magic spirit dexterity luck.
                bonus = none removes the base's bonuses.
element         Elements it acts on: fire ice lightning earth poison gravity
                water wind holy restorative cut hit punch shoot shout hidden.
element_effect  What it does with them: absorb, nullify, halve or none.
                Give both keys together.
status_defense  One status it protects against (as Ribbon-like armour in the
                game do), by name, or none. Names as in the spell file:
                death sleep poison sadness fury confusion silence slow stop
                frog small slow_numb petrify berserk paralysis darkness ...


Who
---
equip           Who can equip it: cloud barret tifa aeris red yuffie
                caitsith vincent cid youngcloud sephiroth, or everyone,
                or none. Default: as the base. A new character can equip
                whatever the character named in its `equip_like` can.
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

Shops and selling
-----------------
price           Shop price. Selling pays half. Default: the base's.
sell            yes or no: whether it can be sold. Default: as the base.


Testing aid
-----------
give_on_load    yes = whenever a save is loaded, one is put in the stock
                unless the save already has one (in stock or equipped).
                Remove the line once the item is handed out another way.


Raw record bytes
----------------
byte_XX         One byte of the record, XX = its offset in hex (two digits).
word_XX         Two bytes.
                For anything the keys above do not cover.

Record layout, for the raw keys (36 bytes): 01 element effect, 02 defense,
03 magic defense, 04 evade, 05 magic evade, 06 status, 09-10 slots,
11 growth, 12 equip mask, 14 elements, 18-1b bonus stats, 1c-1f amounts,
20 restrictions.


What is not covered
-------------------
- The game's shops only sell what their own lists hold; a new armour reaches
  the player through give_on_load or a field script.
- The equip menu's "optimum" search and the shop's comparison panel ignore
  new armour.
