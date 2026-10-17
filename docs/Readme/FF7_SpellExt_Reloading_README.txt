The SpellExt screen, and reading the config files again
=======================================================

With  debug = true  in FF7_SpellExt_Game.ini, the main menu has a twelfth
entry, SpellExt, under Quit. (false, or no debug line: the menu is the
game's own. Setting it to false and running "Re-init .ini files" removes the
entry at once; setting it to true needs the game restarted.)
 It opens a screen
of debug functions. OK runs the entry under the cursor, Cancel goes back.

Re-init .ini files
  Reads the .ini files in SpellExtConfig again and rebuilds the mod's tables,
  as at start-up, without restarting the game. FF7_SpellExt.log (beside
  ff7_en.exe) then shows

    ---- SpellExt menu: reading the config files again ----

  followed by the same lines as at start-up (how many spells, materia,
  weapons and so on were loaded, and any line with a problem), and

    ---- config files read again ----

  What is read again
    spells and spell names, materia, weapons, armour, accessories, items,
    the game file (damage limits), the character file, the limits file,
    the effects file (effect copies; new files in the mod's magic folder
    still need a restart).
    The camera texts in SpellExtConfig\cameras are read again at the next
    battle. Animation packs are read by the game for every battle anyway.

  What still needs a restart
    - going from no new characters at all to some (the game is only patched
      for them if the character file defines someone when it starts).
      Characters can otherwise be added, changed and removed; the one
      condition is that a character sitting in a seat is still defined, or
      the log says so and keeps the characters as they were
    - the number of seats (`seats` in the game file)
    - a character's portrait, once it has been shown
    - files added to or removed from SpellExtConfig\files
    - give_on_load and the other "on load" keys act when a save is loaded

Check External Spells
  A table of every spell in the spell file (and the test spell file):

    Name | ID | Damage | MP | Element | Materia

  Damage is the spell's strength figure. Element shows the first element and
  "+n" if there are more. Materia is the first materia that grants the spell;
  "(everyone)" for a spell every character has, "-" for none.
  Fourteen spells to a page: Up and Down move one line, the page buttons a
  whole page, Cancel returns to the list.

Check External Materia
  A table of the materia of the materia file (IDs 96 and up):

    Name | ID | Type | Max Lv | Spells | Element

  Type shows the materia's icon and its kind (Magic, Summon, Command,
  Support, Independent). Max Lv shows one star per level it has, in the materia's colour (more
  than ten levels: two rows of ten), then the number of levels. Spells lists
  the spells it teaches (the game's own for a magic materia, then those of
  the spell file): the first on the materia's line, each further one on a
  line of its own beneath it. Scrolls like the spell table, line by line;
  when a page starts part-way through a materia its name is repeated in grey.

Check External Weapons / Armour / Accessories
  The equipment of the weapon, armour and accessory files:

    weapons       Name | ID | Atk | Hit | Slots / AP Rate | Element | Bonus
    armour        Name | ID | Def | MDef | Slots / AP Rate | Element | Bonus
    accessories   Name | ID | Special | Element | Bonus

  ID is the item ID, as in the file's section heading. Slots / AP Rate shows the
  materia slots as the Equip menu draws them, at half size, with the links
  between pairs, then the AP rate (x0 none, x1 normal, x2 double, x3 triple).
  Element is the first element and "+n" if there are more; for armour and
  accessories it starts with Abs (absorb), Nul (nullify) or Hlf (halve).
  Bonus is a stat bonus (Str +10); a piece with several has a further line
  for each. Scrolls like the other tables.
  The table lists the pieces of the fixed range first ([320]-[383] weapons,
  [384]-[415] armour, [416]-[447] accessories), then every WIDE piece the
  file defines (weapons [10000]-[15999], armour [16000]-[21999], accessories
  [22000]-[27999]: see FF7_SpellExt_Box_README.txt), in number order, with
  the same columns. A wide piece is listed whenever its section was read
  (box = on or auto), whether or not wide gear is at work in this run (the
  log's "wide gear:" lines say that). The table holds 4,096 lines; with
  more pieces than fit, the pieces from there on are left out, the last
  line says "... N more (the table holds 4096 lines)" and the bottom line
  says "(X pieces, N more)". (300 pieces with three bonus lines each use
  under a third of it.)

Check External Items
  The items of the item file, and the limit items of the limits file:

    Name | ID | Pow | Element | Status | Restores | Price

  Pow is the item's strength figure. Element and Status show the first one
  and "+n" if there are more. Restores is what it restores when used from
  the Item menu (HP 500, MP all, HP + MP). Scrolls like the other tables.
  The items of the fixed range ([105]-[127], [448]-[511]) come first, then
  every WIDE item the item file defines ([1024]-[9999]: see
  FF7_SpellExt_WideItems_README.txt), in number order, read from its
  definition. A wide item is listed whether or not wide items are admitted
  in this run (with wide_items = off the sections are still read; the log's
  "wide items:" line says whether they can enter the item list). The table
  has room for every number, so nothing is ever left out.

Check External Characters
  Lists EVERY character of the character file, eleven to a page:
      Name | ID | Seat Index
  Seat Index is the seat (12 to 15) the character is in, with "(party slot
  N)" after it, in yellow, if it is in the party; "-" for a character
  without a seat, which the game does not know at the moment.
  (See "Seats" in the characters readme.) OK on one opens its page, Cancel
  goes back.

  [SWITCH] on one chooses what to do with it: Left/Right pick 1, 2, 3, out,
  seat or unseat, OK does it, Cancel leaves things as they are.
    - 1, 2, 3: the character is put in that slot in place of whoever is
      there. If it has no seat it is given one: an empty one, else that of a
      character who is not in the party and has no record yet, else that of
      any character who is not in the party (the line at the bottom says who
      gave its seat up; that one keeps its record and gets it back when it
      is seated again). A character already in the party changes places with
      the one in that slot.
    - out: taken out of the party (not the last member). It keeps its seat.
    - seat: given a seat without going into the party (found the same way),
      and made to join, so the PHS shows it.
    - unseat: its seat is taken away and left empty; it keeps its record.
      Not while it is in the party: take it out first.
    - Refused, with the buzzer and the reason: the character in the slot is
      one the game has locked in the party; or every seat's character is in
      the party.
  This is a debug function: it changes the party whether or not the game
  would let the PHS do so at that moment.

  A character's page shows what the character file (and the limits file)
  say about it:
    - its portrait, top left (only a portrait of its own; one that uses its
      base's shows "(the base's)")
    - name and ID; its base, or that it is built from its own sheet; its
      starting level, or whose level it follows; its battle model and model
      files; whose equipment it can use; party slot; how it joins; remake on
      load; portrait file; its limits (own set, like one of the nine, none).
      The bottom line says which seat and party slot it is in now.
    - a line per stat (Str Vit Mag Spr Dex Lck HP MP Exp): the starting value
      ("-" = not given), then its growth: the nine values of the file's
      growth line under the levels L1 L11 ... L99, or "the game's curve N",
      or "as <base>"
    - on the right: starting weapon, armour, accessory, and the materia in
      the weapon's and the armour's slots, with AP or "master"

  OK on a character's page turns to its limits page, and back:
    - limit set, gauge divisors of the four levels, learn all on load, full
      gauge, and its limit item
    - a line for each of the twelve places (1-1 to 4-3): name, Pow (strength),
      Element ("n per hit" when hit_elements gives one for each hit), how it
      is Learned (at start, N kills, N uses, the item), its animation pack
      (Anim), and More: "chain N" follow-ups in a row, "N fx" spell effects,
      "file" an effect file, "script" a script of its own
    A character that borrows one of the nine's limits just says whose.

Check Current Seats
  Every character in a grid of three columns: name, ID, and where it
  stands. The colour says how it stands:
      gold     in the party
      green    available: the PHS shows it
      grey     not available (not joined, or hidden from the PHS)
  The text says where:
      Seat N   it has seat N. The game's own always show the seat of their
               own number, grey when they are not about (young Cloud and
               Sephiroth borrow Cait Sith's and Vincent's records, so only
               one of each pair is about at a time).
      PHS      a new character with no seat that has joined: the PHS shows
               it as a stand-in
      hidden   a new character with no seat, joined, not shown by the PHS
      off      not joined: it has no record yet
  The top four rows are the game's own, IDs 0 to 10, to be read only (the
  cursor does not go there); 11 is no character, only the number of the
  chocobo's portrait. The new characters follow from a new row.
  The direction buttons move the cursor among the new characters.
    - OK switches the character on or off for the PHS. On: it joins if it
      had not (a record made from its sheet) and the PHS shows it. Off: the
      PHS no longer shows it; it keeps its record. Not for a character in
      the party.
    - [SWITCH] gives it a seat, or takes its seat away (as "seat" and
      "unseat" of the External Characters screen).
  The PHS makes its list when it opens, so it shows the change next time.

Check Shops
  One shop at a time: each entry's name, ID and kind. The game's own stock
  is white; what FF7_SpellExt_Shops.ini adds is green. Left and right
  change the shop (0 to 79, named as in the shop file's list); up and down
  scroll a long list. Use "Re-init .ini files" after changing the shop
  file, then look here.

The entry is not shown in the tutorial's menu. If another mod has changed
the three places of the main menu's code this needs, the log says
"SpellExt menu off" and the menu is left exactly as that mod made it.
