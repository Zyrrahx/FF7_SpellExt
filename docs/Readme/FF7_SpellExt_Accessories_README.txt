FF7 SpellExt - accessory file
=============================

File: FF7_SpellExt_Accessories.ini, in the SpellExtConfig folder next to
ff7_en.exe.

Each new accessory is a section whose name is its ITEM ID, from 416 to 447
(32 in all). That is the number to use when giving it from a field script.
For more accessories, number them from 22000: WIDE ACCESSORIES, [22000] to
[27999] (box = on or auto and wide_items = on in the game file; see
FF7_SpellExt_Box_README.txt, "WIDE GEAR"). Do NOT add 10000 to an accessory
number: 10000-15999 are weapons. A section numbered for another kind (a
weapon's, an armour's 384-415, an item's 448-511, the game's own 288-319,
512-1023, 28000 and up) is NOT read, and the log says whose number it is (the
table of numbers is in FF7_SpellExt_Weapons_README.txt).

    [416]
    name = Test Charm
    base = 0

A comment starts with ; or # at the start of a line or after a space.
Problems are reported in FF7_SpellExt.log with the line number. The file is
read every time the game loads its kernel data (at start-up).


Required
--------
base            The game's accessory to copy everything from: its number
                (0-31) or its item ID (288-319). 0 is the Power Wrist. Every
                key below overrides one thing from that copy.


Text
----
name            Up to 31 characters.
description     Up to 95 characters.


Effects
-------
bonus           Up to two stat bonuses, e.g.  bonus = strength 20, magic 20
                Stats: strength vitality magic spirit dexterity luck.
                bonus = none removes the base's bonuses.
special         One of the game's built-in accessory effects:
                  haste        starts battle in Haste (Sprint Shoes)
                  berserk      always Berserk (Fury Ring)
                  curse        Death Sentence, as the Cursed Ring
                  reflect      Reflect (Reflect Ring)
                  steal        better Steal (Sneak Glove)
                  manipulate   better Manipulate (Hypno Crown)
                  wall         Barrier and MBarrier (Protect Ring)
                  none
                An accessory has one of these at most. Other built-in
                behaviours of the game's accessories belong to their item
                numbers and cannot be given to a new one.
status_defense  Statuses it protects against, by name, e.g.
                  status_defense = poison sleep silence
                Names as in the spell file: death sleep poison sadness fury
                confusion silence slow stop frog small slow_numb petrify
                berserk paralysis darkness death_sentence ...  or none.
element         Elements it acts on: fire ice lightning earth poison gravity
                water wind holy restorative cut hit punch shoot shout hidden.
element_effect  What it does with them: absorb, nullify, halve or none.
                Give both keys together.


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

Record layout, for the raw keys (16 bytes): 00-01 bonus stats, 02-03 amounts,
04 element effect, 05 special, 06 elements, 08 status protection (4 bytes),
0c equip mask, 0e restrictions.


What is not covered
-------------------
- The game's shops only sell what their own lists hold; a new accessory
  reaches the player through give_on_load or a field script.
