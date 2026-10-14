wide_items (FF7_SpellExt_Game.ini)                         text for the Game file's readme; stages 0 and 1, beside FFNx's achievements
=========================================================================================================================

    wide_items = off        ; off | shadow | on        (default: off)

Read ONCE, when the game starts. A change needs a restart of the game; "Re-init .ini files" does not change it (the log
says "... STAYS ..." if the file now says something else). Everything below about the game is READ FROM THE CODE and from
a native test on copies of your saves; nothing of this stage has been seen in the game yet.

off      Nothing of the wide item list acts. Companion files are written exactly as before (the SXC2 format, byte for
         byte). A companion written earlier in the new format is still read.

shadow   Stage 0, a rehearsal. NO byte of the game's code is changed and the item list stays the game's own 320 rows:
         nothing you can see in the game changes. What happens:
           - every save's companion file (FF7_SpellExt_Saves\<key>.sxc) is written in the NEW FORMAT ("SXC3"): the same
             file as before plus a picture of the item list as the wide list will hold it (510 rows);
           - at every load that picture is turned back into the game's 320 rows and compared with the save's:
             the log says "wide list shadow: AGREE", or lists the rows that differ. Nothing is taken from it;
           - the moments at which the game writes its whole save block (a kernel load, a new game, a load) are watched:
             a line with "*** wide list watch" means the stock changed wholesale at a moment the design does not know.
         Needs new characters on (without them there is no companion file; only the watch runs).

on       Stage 1, THE SWITCH. Everything shadow does, and: the item list itself moves out of the game's 320 words into a
         list of the DLL's own with WIDE rows (the number of an item no longer shares 16 bits with its quantity). This is
         the foundation for item numbers above 511. From stage 2 such numbers EXIST: WIDE ITEMS, sections [1024] to [9999] of
         the items file (see WIDE ITEMS below). With no such section and no such row in a save, nothing you can see changes
         and every save is still today's save (your save files are written byte for byte as with off).
         It is decided ONCE, when the game starts. The DLL compares the places of the game's code it must change with
         what the game's exe holds there, and writes ALL of them or NONE. The log then says one of:
             wide item list: THE SWITCH IS ON (stage 1): 273 sites of the game's code written ... THE FED FORM ...
             wide item list: THE SWITCH IS ON (stage 1): 271 sites of the game's code written ...
             *** wide item list: THE SWITCH IS REFUSED at <address>: <why> ***
         WHICH OF THE TWO "ON" LINES, AND FFNx's STEAM ACHIEVEMENTS. On the Steam edition FFNx 1.24.3 switches its
         Steam achievements ON by itself, whatever enable_steam_achievements in FFNx.toml says (it looks for
         "steamapps" in the game's path). You cannot turn them off there, and you do not have to. With them on, FFNx
         holds one routine of the item list, the one that takes an item out (at 006cbe5f), to see which item was used.
             - 273 sites, "THE FED FORM" (every Steam install): the DLL leaves FFNx's hold on that routine exactly as
               it is. Each time an item leaves the list, the DLL first lets FFNx's routine do the removal on the game's
               old 320 words (so FFNx sees every item used, once, as before), then removes from its own list and paints
               the 320 words from it. The next line of the log names where FFNx's routine is.
             - 271 sites (a copy of the game that is not Steam's, or FFNx's macOS launcher): FFNx does not hold the
               routine, and the DLL replaces it as planned.
         REFUSED means TODAY: nothing was written into the game's code, the item list is the game's own, exactly as with
         off (the companion file and the watch go on as with shadow). It is refused when
             - the routine at 006cbe5f is held in a way the DLL does not know: neither the game's own bytes nor a jump
               out of the game's exe (the line shows the bytes found);
             - Enhanced Stock UI or another mod has changed one of the places (after an update of that mod, say);
             - one of the DLL's own hooks could not be put in (the lines "skipped" earlier in the log say which).
         Right after it: "the look after a battle's end (the call at 00431834): in". ("NOT in" = another mod holds that
         call: the switch still works; only the picture of the list in the game's old 320 words is later after a battle.)
         With the switch on, the log also says, each with *** and each meaning STOP AND KEEP THE LOG:
             *** wide list: at "..." N of the game's 320 words ... are NOT what this DLL painted there ...
                   (something still writes the old list: another mod, a trainer, a place nobody found)
             *** wide list: at "..." N row(s) held what NO row can hold in this build ...
                   (a row was put back to what the game's own masks made of it until now)
             *** wide list: add REFUSED: number N ...
                   (a field script, a scene or another mod gave an item number above 511; nothing was added)
             *** wide list: at "..." the site at <address> no longer holds what the switch wrote there ...
             *** wide list: remove of N of item M ...: the routine behind 006cbe5f, FED ..., did not leave them as the
                   game's own routine does ...        (the fed form: FFNx's routine, or whatever stands there, did
                   something else than take the item out. The DLL's list is right all the same.)
             *** wide list: ... the routine behind 006cbe5f, fed, WROTE THE WORD AFTER THE LIST ... It is put back.
             *** wide list: at "..." the entry of the remove routine at 006cbe5f no longer holds the jump the switch saw
             *** wide list: at "a save" | "a load": since the start: N word(s) of the old list taken ..., M row(s) put back ...
                   (16 lines of each kind above are written in a run; past that they are COUNTED, and this line says
                    the totals at every save and load: nothing that changes the list goes unsaid)
         In the fed form every save and load also says, WITHOUT ***, how often FFNx's routine was fed:
             wide list: at "a save": since the start: N removal(s) FED to the routine behind 006cbe5f ...; K time(s) its
             known fault with item 511 was painted over; 0 disagreement(s)
         ANY line with *** in the log is a stop sign: a healthy run has none.
         To go back: wide_items = off (or shadow) and restart the game. Nothing has to be converted: with the switch on
         the save files are the same files as with off, and the companion files are the same files as with shadow.
         GO BACK BY THE KEY, NOT BY THE DLL. If an older DLL is ever put back, restore save\ and FF7_SpellExt_Saves\ from
         the backup TOGETHER with it, or run "sxc2.py --strip" on every companion written meanwhile (see below).
         Known differences with the switch on, for a game with no item number above 511:
             - Arrange "by Type": item 511 (if you hold it) now sorts in front of the empty rows; before, an empty row
               counted as number 511 and they were mixed;
             - a memory trainer that edits the item list at 00dc0234 still works, but each edit is said with *** in the
               log (the DLL takes the edit into its list);
             - the game's old 320 words at 00dc0234 are a PICTURE of the list, painted at each look: twice a second in
               menus and battles, at each add and remove through the game's routines, at a battle's start and end,
               around the spoils, at a save and a load. Between two looks in the field (a chest opened, a script that
               gives an item do paint) it is as old as the last look. FFNx's crash save (crash.ff7) is written from
               those words: after a crash it holds the list as of the last look;
             - FFNx's own copy of the "take an item out" routine has two faults (in FFNx's code, with or without this
               mod, on every Steam install): it takes an EMPTY row for item 511, and for an item you do not hold it
               reads one word past the list, the first materia of your materia stock, and can change it. With the
               switch on in the fed form neither can touch your list or your materia: the DLL feeds FFNx's routine only
               for an item the list holds, and paints the list over whatever it did for item 511. With wide_items = off
               or shadow FFNx's routine IS the game's routine and both faults are as they are without this mod: do not
               define or hand out item number 511 there;
             - items used INSIDE a battle never pass FFNx's routine (the battle keeps its own copy of the list and
               writes it back): that is the game's and FFNx's behaviour without this mod too;
             - a field script that gives or takes an item number above 511: before, the game cut the number to 9 bits and
               gave or took another item; now nothing is given or taken, with a line in the log.

BEFORE YOU SWITCH SHADOW ON: WHAT AN OLDER BUILD DOES WITH THE NEW FORMAT
-------------------------------------------------------------------------
An older build of the DLL (any build before this one, the one installed today included) cannot read a companion of the
new format. If you go back to one after saving with shadow on:
  - it REFUSES the file ("REFUSED: not an SXC2 file") and says "*** THE COMPANION FILE OF THIS SAVE IS MISSING OR DAMAGED";
  - you see every new character MADE AFRESH from its sheet (the level and equipment the character file gives, not what
    you played), each seat with its own character. The original nine, your items, materia and gil are untouched;
  - nothing is deleted: the file stays on disk. But if you SAVE in that state, the save goes on with the fresh
    characters.
Three ways to avoid that, any one is enough:
  1. Do not go back to an older build while saves made with shadow are in use. (This build with wide_items = off reads
     them, and its next save of each writes the old format again.)
  2. Keep the backup of save\ and FF7_SpellExt_Saves\ made before switching shadow on, and restore both together.
  3. Convert a file back by hand, game closed:
        python3 -I sxc2.py --strip FF7_SpellExt_Saves\<key>.sxc out.sxc     then put out.sxc in its place under the same name
     (the result is byte for byte the file the old format would have had).

A file damaged after its characters' part (in the item list) still gives every character; the log then says
"*** ... its SECTIONS are REFUSED ...; its characters' part is whole and IS read". sxc2.py --strip converts such a
file too (it says the sections were damaged and left out).


WIDE ITEMS (stage 2): usable items numbered from 1024                    read from the code and shown by native tests; NOT yet seen in the game
==========================================================================================================================================

What they are
    A wide item is an item of FF7_SpellExt_Items.ini whose section is a number from 1024 to 9999 (8,976 numbers). It takes
    exactly the keys of a [448] section and behaves as one: its base's use in battle with the changed fields, menu_hp /
    menu_mp in the Item menu, a price, sell, give_on_load. See FF7_SpellExt_Items_README.txt.
    Numbers 512-1023 are never given to anything. 10000-27999 are kept for weapons, armour and accessories of a later build:
    a section there is REFUSED with a line. Today's [105]-[127] and [448]-[511] are unchanged.

What they need
    wide_items = on in FF7_SpellExt_Game.ini AND the line "THE SWITCH IS ON" at start-up. Then, the first time the items file
    defines a wide item (or a loaded save holds one), the log says:
        wide items: ADMITTED (...): 2 places written, each compared first and read back: the text bounds word at 007b7492 ... and
        the item record bound at 0041940b ...
        wide items: N defined in the items file ...; wide items are ADMITTED in this run: ...
    Admitting also needs what a wide item lives on: the save work fully on (a wide row is kept in the companion file of a save; from C0 new characters are not
    needed: without them a save gets a companion file whenever it holds a wide row, and none otherwise), the DLL's tables and hooks in, and the Item menu's use step hooked (the line "Item menu: use
    of item IDs above 94 hooked" earlier in the log). If one is missing the log says "*** wide items: NOT ADMITTED (...):
    <what is missing>" once, and the wide rows of saves are carried unseen.
    With wide_items = off or shadow, or the switch refused, the sections are read and ONE line says that none can enter:
        wide items: N defined in the items file ..., but NONE of them can enter the item list in this run: <why>. ...
    With no [1024+] section and no wide row in any save, neither of the two places is written and nothing differs from
    the build before.

WITHOUT NEW CHARACTERS. Everything above works with an empty character file too. A save then gets a companion
file (FF7_SpellExt_Saves\<key>.sxc) ONLY when it holds something the save itself cannot: a wide item, a row past
the game's 320, the box, a worn piece of wide gear. A save with none of these is the game's save alone and no file
is written; if the index of the companion folder is already there it gets one line "sxc2=none" for that save. An
install that never had any of these never gets the folder at all. Back up save\ and FF7_SpellExt_Saves\ together,
as always: the companion of a save with wide items is the only place they are.

Where a wide item lives
    In the item list of the game (the DLL's list) like any item, and in the COMPANION FILE of each save
    (FF7_SpellExt_Saves\<key>.sxc, section ITEM). The save file itself holds an EMPTY row in its place. So:
      - the unmodified game, or a build from before this one, loads the save and shows the bag WITHOUT the wide items
        (holes where they were); nothing else of the save is different;
      - a save loaded WITHOUT its companion file has no wide items in that game, and the log says so with ***. A load writes
        nothing: put the file back and load again BEFORE saving over the slot;
      - SAVING such a save WITHOUT this DLL CUTS IT FROM ITS COMPANION. The unmodified game (or a build from before the
        item list, or FFNx's crash save crash.ff7) writes a save with another key: no companion file has that key's name.
        The wide items are still in the companion of the save BEFORE it. When this DLL then loads the new save, the log says
            load: *** wide items: this save has NO companion file of its key, and the nearest companion before it,
            <name>.sxc, holds N row(s) of the item list that this save's 320 words do not hold (rows of a list of 510 and
            wide items): ... give the save that file (sxc2.py --relink) and load again BEFORE saving ...
        Do what it says, game closed:   python3 -I sxc2.py --relink save\saveNN.ff7 SLOT FF7_SpellExt_Saves\<name>.sxc
        (it makes a COPY of that file under the save's key; the old file stays), then load the save: the game's kinds are
        the save's, the wide rows are the file's (one *** line says the two differed). If you save over the slot first, the
        new save has no wide items; the old companion file is not removed and can still be given to a save by hand.
        The line is written only when the nearest companion before the save holds wide rows; if another save without wide
        items lies between, look for the file yourself (sxc2.py --survey lists every companion and what it holds);
      - back up the save folder and FF7_SpellExt_Saves TOGETHER.

Turning the switch off does not lose them
    With wide_items = off or shadow, or the switch refused, the wide rows of a loaded save are CARRIED UNSEEN: they are not in
    the bag, the log says how many at every load
        load: wide items: N row(s) of the item list of <key>.sxc ... are CARRIED UNSEEN in this run: wide_items = off. ...
    and every save writes them again in its companion file (which is then in the new format with wide_items = off too).
    Set wide_items = on again, restart, load: they are back, with their quantities. If the game put something in a row a wide
    item had, the wide item comes back in another free row.

A definition taken out of the items file
    The row stays in the bag as "Missing item 1024": it cannot be used, sold or gained; it is kept in every save. Put the
    section back (and "Re-init .ini files" or restart): the same row is the item again.
    A row is its NUMBER and its quantity, nothing else: the companion file stores no name. If you change what [1024] is,
    or give the number to another item, every save that holds 1024 holds the new thing. Nothing can notice.

What works (read from the code; the first test is to see it)
    give_on_load and items_on_load (a wide number is given after the save's own list was read; the aids for numbers 0-511,
    weapons, gear and materia run BEFORE it, as they always did: if one of them puts an item into the empty row a wide item
    had in the save, that wide item comes back in another free row, and the load line says "1 at another free row": nothing
    is lost, the row has moved); test_drop and test_steal (the win screen does not list test_drop's items, and with
    test_steal the steal message names the enemy's own item: the aids put their numbers in after the game made those texts);
    an enemy's drop, steal or morph of a wide number; a field script's give / take / check of a wide number; a shop line
    (the shop offers a wide item only if it is defined and admitted when the shop opens; the log says when it leaves one
    out); buying, the owned count, selling at half the price; the Item menu (name, description, use, the quantity reaching
    0); the battle's Item list and W-Item; Arrange (all modes; by name the wide items take their places as new items do);
    Customize; the bag after a battle.

What does not, yet
    - rows: still 320. A wide item uses a row like any item; the longer list is a later stage.
    - quantity: 99, as for every item.
    - Throw: a wide item is never throwable.
    - weapons, armour, accessories, materia with wide numbers: later stages.
    - "use on all", reviving, curing, sources, tents from the Item menu: not for a new item (as for [448]).
    - an enemy script that asks "which item was used last" sees one byte of the number: a wide item N also answers for
      N - 256, N - 512 ... (the game already cuts there above 255).
    - the field's SPECIAL give-all / take-all walks numbers 0-511 only.
    - the debug menu's item page lists [105]-[127] and [448]-[511] only.
    - numbering: do not give a wide item the number of an extended spell of the spell file (those start at 3000). The one
      place known to mix them up (fixed damage) is fixed, but the game's own lookup of an attack by number during an Item
      action was not traced. Numbers 1024-2999 are free of this.

Loud lines (a line with *** is a stop sign unless listed as expected in the test you are following)
    *** wide items: NOT ADMITTED (...): <why> ...                 wide items cannot be held in this run; rows of saves are carried
    *** wide items: NOT ADMITTED (...): the two places did not read back as written (...) ... What this DLL wrote is put back ...
                                                                    another program writes at 007b7492 or 0041940b: STOP, keep the log
    *** wide list: add REFUSED: number N ...: <why> ...           something tried to give a number that is not a defined wide item
    *** spoils: N of number M NOT given: ... / *** battle gain: number M NOT gained: ...
    *** wide list: at "..." N row(s) held a number above 511 that this run CANNOT SHOW ... CARRIED UNSEEN ...
    load: *** wide items: the save's 320 words are NOT the picture of the item list of <key>.sxc ...
                                                                    the save was changed without this DLL or by an older build: the
                                                                    game's kinds are the save's, the wide rows the file's
    load: *** wide items: this load has NO item list from a companion file ...
    load: *** wide items: this save has NO companion file of its key, and the nearest companion before it, <name>, holds N row(s) of the item list that this save's 320 words do not hold ...
                                                                    the save was made without this DLL (see "Where a wide item lives")
    save: *** wide items: N row(s) of this game that the save's 320 words do not hold are AT STAKE ...
    save: *** wide items: N row(s) of this game that the save's 320 words do not hold are NOT in this save (no companion file could be written) ...
                                                                    neither the companion folder nor the save folder could be written and
                                                                    the save was made at the second attempt: the wide items are in this run
                                                                    only (and in earlier saves' companions): free the folder and save again
    load: *** wide items: if that item list held wide items ..., they are LOST FOR THIS LOAD ...
    save: *** wide items: N row(s) found NO free row in the item list ...
    *** wide items: at "..." the two places written when wide items were admitted no longer hold what was written ...
Plain lines worth knowing
    wide items: at "...": N row(s) of the item list hold a wide item that the items file does NOT define now ...
    load: wide items: the item list of <key>.sxc holds N row(s) the save's 320 words do not hold ...: A are back at their own rows, B at another free row, C are CARRIED UNSEEN
    save: wide items: the item list of <key>.sxc holds N row(s) the slot's 320 words do not hold ...
    wide list dump: WIDE ITEMS: N row(s) of the list hold a number above 511 ...; M row(s) are CARRIED UNSEEN ...
    load: wide items: <key>.sxc is in the SXC2 format: it holds NO item list, so no wide item ...
                                                                    a companion written with wide_items = off and nothing carried, or by a
                                                                    build from before the item list. Expected for saves made before wide items

Companion files that stay
    A companion file is removed when its save is replaced only if the new file holds everything it held. A file whose list
    holds a wide item the new one does not hold (you used the last one, then saved over the slot) is KEPT: files of that
    kind collect in FF7_SpellExt_Saves. They are small; nothing removes them by itself.
    While a game was loaded WITHOUT its item list (no companion file, a companion in the SXC2 format, or its list refused), every replaced companion that
    holds wide items is kept, whatever the bag holds by then: the bag of such a game proves nothing about that file.

Going back to an older build
    An older build reads the characters of an SXC3 file only after "sxc2.py --strip", which refuses a file with wide items
    unless --force: the wide items of that save are then in no file the older build writes. Keep the backup.

================================================================================================================================
THE 510-ROW LIST (stage 3)                                                        key: wide_rows = 510 (default) | 320   (FF7_SpellExt_Game.ini)
================================================================================================================================
    wide_rows = 320     the item list has the game's 320 rows. Nothing below applies.
    wide_rows = 510     (the default from 2026-10-14, when the line is absent) the item list has 510 rows: the Item menu, Arrange, Customize, the shop's sell list, the Equip menu's
                        source and the battle's Item / W-Item / Throw list. Needs wide_items = on. Read at start-up only.

    At start-up the log says one of:
        wide item list: THE LIST HAS 510 ROWS (stage 3, wide_rows = 510): 52 more sites of the game's code written ...
        *** wide item list: 510 ROWS REFUSED at <address>: ... THE ITEM LIST HAS 320 ROWS in this run ...
    REFUSED is not dangerous: one of the 52 places did not hold the game's own bytes (another mod wrote there), none of them
    was written, and the game runs with 320 rows exactly as with wide_rows = 320. Send the line. (The same line, with the
    words "did not read back as written", if one of the 52 could not be written: all 52 are then put back as they were.)

    What you see with 510: the Item menu, Customize and the sell list scroll 190 rows further (empty until they are used).
    A 321st kind of thing is taken where the list said "full" before. The list is only ever full at 510 kinds; a kind
    refused then is said loudly:   *** wide list: add of N of item M ...: THE LIST IS FULL (510 rows): NOTHING is added ***

    THE SAVE. A save file itself has room for 320 rows, and that cannot change. So:
      - while you use no row past the 320th, saves and companion files are exactly what they were;
      - from the moment a row past the 320th is in use, the save file holds, in your list's order, EVERY thing of the game's own
        kinds (items 0-104, weapons, armour, accessories of the unmodified game) and then as many of the mod's things with
        numbers 0-511 as still fit; THE COMPANION FILE holds your whole list, row for row, in your order (and the wide items).
        The log says at the save:  save: item list: <key>.sxc holds THE WHOLE LIST in its order (version 2: ...) ... AGREE.
      - so such a save NEEDS ITS COMPANION FILE for the rows the save could not hold. Without it the load says
            load: *** item list: this load has NO item list from a companion file ..., and the index says the companion of this
            save held N row(s) of the item list that the save's own 320 words do NOT hold ...
        The game's own kinds are all there; N things of the mod are not. Nothing is written by a load: put the file back and
        load again before saving over the slot.
      - an OLDER BUILD of this DLL (or this one with 320 rows) shows such a save with the game's kinds and what fitted; it
        carries the whole list in its companion, and when you come back with 510 rows the two are merged by number (one ***
        line). The UNMODIFIED GAME writes no companion: after a save made there, the rows the save could not hold are NOT in
        the bag; the load names the companion that holds them (*** lines); BEFORE saving again, close the game and run
        sxc2.py --relink SAVE.ff7 SLOT <that file>; the next load then merges the two by number.
      - with wide_rows = 320 again (or 510 refused) a save that used rows past the 320th shows its first 320 things as the save
        holds them; the whole list stays in the companion file, untouched, until you start with wide_rows = 510 again
        (two *** lines say so). Wide items gained meanwhile are NOT written in that state (the log says so): do not play on
        such a save with 320 rows. Such a save's bag is FULL there when the list holds 320 or more kinds of numbers 0 to 511 (all 320 words are then in use): no new kind of thing can be
        picked up, bought or won until you are back with 510 rows (each refusal is a *** line: THE LIST IS FULL (320 rows):
        NOTHING is added); the same holds in the unmodified game.

    What stays as it was: the quantity (99); random Throw (the "Throw" a confused character or an enemy skill makes) picks only
    among the first 320 rows; more than 510 rows; the Equip menu offers at most 320 pieces of one kind (it can only matter if
    one piece lies in hundreds of rows).

    A TESTING AID:   test_fill_rows = N     (FF7_SpellExt_Game.ini; 1 to 510; take the line out after the test)
        at every load one of each thing the list does not hold is added until N rows are in use: the game's kinds first, then
        the mod's defined things, then the defined wide items. The log says how many were added and whether N was reached.
        USE IT ON A SPARE SLOT ONLY: it fills the bag with about 300 things.
        While the line is in the file EVERY load fills again, so a load never shows what the save itself holds: take the
        line out and choose "Re-init .ini files" in the debug menu (the key is read again at every reading of the file),
        or restart, before you check a save or load one without its companion file.
