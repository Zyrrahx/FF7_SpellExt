FF7 SpellExt - item file
========================

File: FF7_SpellExt_Items.ini, in the SpellExtConfig folder next to ff7_en.exe.

Each new item is a section whose name is its ITEM ID: 105 to 127 (the 23
item numbers the game leaves unused) or 448 to 511, 87 in all. (An ID of
105 to 127 can be an item of this file or a character's limit item in the
limits file, not both: this file comes first, and the limits file's
limit_item is refused with a line in the log.) Both ranges behave the
same. With these the game's item numbers are used up: 0-511 is all a stock
entry of the game can hold.

WIDE ITEMS: with the wide item list on (wide_items = on in the game file,
and "THE SWITCH IS ON" in the log) a section may also be a number from 1024
to 9999: 8,976 more items. A wide item takes exactly the keys below and
behaves as a [448] item does. What is different about it:
  - it lives in the save's COMPANION file (FF7_SpellExt_Saves), not in the
    save itself, which holds an empty row in its place;
  - without the switch it is defined but cannot enter the bag (one line in
    the log says so), and wide items a save already holds wait unseen;
  - it is never throwable;
  - [512] to [1023] are never used; [10000] to [27999] are the numbers of
    WIDE GEAR (weapons 10000-15999, armour 16000-21999, accessories
    22000-27999, in their own files) and are not read here; 28000 and up
    are not given to anything.
Read FF7_SpellExt_WideItems_README.txt before using one.

A section numbered for another kind (a weapon's 320-383, an armour's 384-415,
an accessory's 416-447, the game's own 0-104 or its gear 128-319, a wide gear
number) is NOT read, and the log says whose number it is and where items are
numbered, e.g.
    item file line 4: [420] is a new accessory number (416 to 447 are accessory
    numbers), not an item's: new items are [105] to [127] and [448] to [511]; for
    more items, number them from 1024 ([1024] to [9999], with wide_items = on in
    the game file). The section is not read
(The table of numbers is in FF7_SpellExt_Weapons_README.txt.)

    [1024]
    name = Mega Tonic
    base = 0
    menu_hp = 2000

    [106]
    name = Test Tonic
    base = 0

A comment starts with ; or # at the start of a line or after a space.
Problems are reported in FF7_SpellExt.log with the line number. The file is
read every time the game loads its kernel data (at start-up).


Required
--------
base            The game's item to copy everything from, 0 to 104 (0 is the
                Potion; never another new or wide item). In battle the new item is used as the base is: the
                same animation and the same kind of effect, with whatever
                the keys below change.


Text
----
name            Up to 31 characters.
description     Up to 95 characters.


In battle
---------
battle          yes or no: whether it can be used in battle. Default: as
                the base.
strength        0-255. The base's formula decides what it means: a Potion's
                strength 5 restores 100 HP (20 each), so 25 restores 500.
damage_formula  0-255, as in the spell file.
target          List of: selectable enemy multiple toggle one_row
                short_range all_rows random.
element         List of element names (restorative for healing items).
status          Statuses it deals with, by name.
status_chance   The record's status byte (0-255), as the base's unless given.
animation       0-255: which of the game's item effects is shown.


In the Item menu
----------------
menu_hp         HP restored when used on a character from the Item menu:
                a number up to 9999, or all.
menu_mp         MP restored likewise.
                With neither key the item cannot be used from the menu. It
                works as a Potion or Ether does: one living character who
                is not already full. Other menu effects of the game's items
                (reviving, curing, stat sources, tents) belong to their item
                numbers and are not available to a new item yet.

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

Record layout, for the raw keys (28 bytes): 08 camera, 0a restrictions,
0c target, 0d animation, 0e formula, 0f strength, 10 condition,
11 status chance, 12 additional effect, 13 its modifier, 14 statuses
(4 bytes), 18 elements, 1a special flags.


Drops, steals and sorting of new IDs (items, weapons, armour, accessories)
--------------------------------------------------------------------------
- An enemy may DROP, and Steal or Morph may give, a WIDE ITEM (1024-9999) that the file defines, once wide items
  are admitted: it goes into the bag as that item. A number from 1024 up that is NOT a defined wide item is given
  to nobody, and the log says so with *** (it is never read as a materia or turned into another item).
- An enemy may DROP a new armour (384-415), accessory (416-447) or item (448-511): it goes into the stock as
  that thing. (The game by itself reads every dropped ID from 384 up as "materia number ID - 384"; an ID in that
  range that no file defines is still read that way, for mods that count on it.) New weapons (320-383) and items
  105-127 were already dropped correctly by the game's own code.
- A new weapon, armour, accessory or item may be STOLEN or MORPHED: it arrives in the battle's Item list with the
  target and use flags of its record (what the Item list and Throw read), as the game's own things do.
- "Arrange > Name" in the Item menu: the game's own things keep the game's order exactly (the game has ONE list
  by name for items, weapons, armour and accessories together). A thing these files define (weapons 320-383,
  armour 384-415, accessories 416-447, items 105-127 and 448-511, wide items 1024-9999, a character's limit item) takes its
  alphabetical place AMONG them, by the name it has now: capitals and small letters alike, after a game thing
  of the same name, two new things of the same name by ID. One with no name comes after everything named.
  The places are worked out again at "Re-init .ini files". (The game's own list is out of alphabetical order
  in three spots, such as "HP Shout" before "Hairpin": a new name goes where the fewest of the game's names
  are on the wrong side of it, and of equal places the latest.) An item 105-127 that nothing defines keeps its
  place at the end.


Testing aids for drops and steals (keys of FF7_SpellExt_Game.ini)
-----------------------------------------------------------------
; test_drop               TESTING AID: the next battle won adds these to what
;                         it drops, as if dropped and taken: item IDs (0 to
;                         511, or a wide item's number 1024 to 9999, which is
;                         left out with a line unless it is defined and wide
;                         items are admitted), each with an optional count (ID:count, 1 to
;                         99), up to 4 entries. They are added when the win
;                         screen closes: the win screen itself does NOT list
;                         them. Look in the Item menu (and the Materia menu)
;                         afterwards. An ID from 384 up that the armour,
;                         accessory or item file defines arrives as that thing.
;                         An ID from 384 up that no file defines arrives as
;                         the game reads it, as materia "ID - 384": name one
;                         only if that materia exists (384-474 = the game's
;                         0-90, 433 = Fire; from 480 up only what the materia
;                         file defines), on a save you do not keep. A battle
;                         has four places for spoils: an entry that finds none
;                         free is left out (the log says so), and if none of
;                         them finds a place they all wait for the next battle
;                         won. Given once after the game starts and once after
;                         each "Re-init .ini files". A line with a mistake
;                         gives nothing at all (the log names the line). The
;                         log says when it was used. Remove the line when done.
;
; test_steal              TESTING AID: the next items gained in the middle of a
;                         battle (Steal, Morph, and an item handed back when an
;                         Item, Throw or W-Item command is cancelled) are
;                         replaced by these item IDs (0 to 511, or a wide item's
;                         number 1024 to 9999, skipped with a line unless it is
;                         defined and wide items are admitted), one each, in
;                         order: up to 8. Do not let a character die with an
;                         item command waiting while testing: the item handed
;                         back would be replaced and one ID spent. A line with
;                         a mistake gives nothing at all. The battle's message
;                         still names what was really stolen; the battle's Item
;                         list and, after the battle, the Item menu hold the
;                         item named here. Starts again from the first after
;                         each "Re-init .ini files". The log says each time it
;                         was used. Remove the line when done.

; examples (off unless the lines are there):
; test_drop  = 448:2 384 416 433
; test_steal = 448 320 384

Both keys are OFF unless the line is in the file. With either set the log says at every reading of the file:
  TESTING AIDS on: test_drop (N entries: ...) and test_steal (N IDs: ...); remove the lines when done
and, at a re-read ("Re-init .ini files") when the hook the key needs was refused at start-up:
  test_drop: the spoils hook is not installed: nothing will be given
  test_steal: the battle gain hook is not installed: nothing will be replaced
(at start-up the file is read before the hooks go in: there the sign is the hook's own "NOT hooked" line).
