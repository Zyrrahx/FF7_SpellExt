FF7 SpellExt - armour file
==========================

File: FF7_SpellExt_Armour.ini, in the SpellExtConfig folder next to ff7_en.exe.

Each new armour is a section whose name is its ITEM ID, from 384 to 415
(32 in all). That is the number to use when giving it from a field script.
For more armour, number it from 16000: WIDE ARMOUR, [16000] to [21999] (box = on
or auto and wide_items = on in the game file; see FF7_SpellExt_Box_README.txt,
"WIDE GEAR"). Do NOT add 10000 to an armour number: 10000-15999 are weapons.
A section numbered for another kind (a weapon's 320-383, an accessory's
416-447, an item's, 512-1023, 28000 and up) is NOT read, and the log says whose
number it is (the table of numbers is in FF7_SpellExt_Weapons_README.txt).
A section numbered for one of the game's own armour, [256] to [287], CHANGES
that armour: see "The game's own armour" below.

    [384]
    name = Test Bangle
    base = 0

A comment starts with ; or # at the start of a line or after a space.
Problems are reported in FF7_SpellExt.log with the line number. The file is
read every time the game loads its kernel data (at start-up).


The game's own armour: [256] to [287]
-------------------------------------
A section numbered for one of the game's own armour (its item ID, 256 to
287: the armour number + 256) changes THAT armour as the kernel the game
loaded has it. Each key the section gives replaces that one thing;
everything it does not give stays the kernel's. No base is needed.

    [256]               ; the Bronze Bangle (armour 0)
    defense = 20
    equip = everyone 12

equip REPLACES the list of who may equip it: name everyone who is to keep
it.
- Every key of this readme can be used, except base and give_on_load: a
  line with either is not read (the log says so) and the rest of the
  section is. Where a key says "Default: the base's" or "as the base", for
  the game's own armour read "the kernel's".
- name and description change the texts the game shows for it.
- Each of the game's armour can have one section; a second is not read.
- base of a new armour (and of a wide one) always copies the KERNEL's
  armour, never the changed one.
- Takes effect at start-up and at "Re-init .ini files". Take the section
  out and the kernel's values are back at the next of either.
- The log says after the file's own line how many of the game's armour
  were changed and which ("armour file: 1 of the game's own armour changed
  by their sections ([256] to [287]): 256; 0 line(s) of those sections with
  problems (each said above)").
- Changing the slots of an armour a character wears with materia in it is
  not tested: take the materia off first.


Required (for a new armour)
---------------------------
base            The game's armour to copy everything from: its number (0-31)
                or its item ID (256-287). 0 is the Bronze Bangle. Every key
                below overrides one thing from that copy. Not used in a
                section of one of the game's own armour.


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
                whatever the character named in its `equip_like` can
                (equip_like = none: whatever all nine can).
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
                New armour only.


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
