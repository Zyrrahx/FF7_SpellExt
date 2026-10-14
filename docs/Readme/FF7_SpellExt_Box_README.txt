FF7 SpellExt - THE BOX (stages B1 to B6: the store, its save path, the Box screen, routing, the Equip menu, wide gear, the window;
                        and box = auto: THE BOX ON DEMAND)
=====================================================================================================================

THE BOX ON DEMAND: box = auto
-----------------------------
With box = auto the box is not there until a game needs it:

  * A save that never had a box: the box SLEEPS. There is no Box row in the main menu (with
    debug = true the row is the SpellExt menu, as with box = off) and everything works exactly
    as with box = off: everything you receive goes to the item list as the game does it.
  * It WAKES for that save the moment something arrives that the item list has NO ROW for (it
    would be lost: a chest, an event, a shop, the spoils of a battle, a testing aid at a load, a
    piece taken off in the Equip menu), or a piece of WIDE gear (numbers from 10000) arrives or
    is given (it can live nowhere else). The thing goes into the box instead of being lost.
  * You are told: the log says "box: WAKES (box = auto): ..." at once; on the screen, the next
    time you open the main menu the row "Box new" is there, in yellow, under Quit, and it stays
    "Box new" until you open the Box screen (in that save, also after saving and loading). The
    first time you open it, its bottom line says "The box woke: what the item list has no row
    for goes here" and the window says what woke it. (The mod cannot write on the field, battle
    or shop screens: the main menu is the first place it can show it.) "Box new" is yellow also
    away from a save point; it opens only where Save does.
  * Under ESUI's Left Menu option there is no Box row (see below): the main menu shows no
    "Box new", and the only notice of a wake is the log line "box: WAKES (box = auto)". Press
    [SWITCH] on the main menu's list to open the box.
  * Once awake it takes only the OVERFLOW: what the item list has no row for, and wide gear.
    Gear you receive goes on arriving in the item list as before (no gear is sent to the box by
    itself); you can still move anything by hand in the Box screen (Store gear, Put in, Take
    out). The Equip menu offers pieces from both stores (taking from the item list first);
    field scripts and the shop's "owned" count both, as with box = on.
  * A save that has a box (its companion file is marked) loads AWAKE, also one made with
    box = on: switching from on to auto keeps every box. A save whose list has room again
    stays awake.
  * One exception: a save with no companion file of its own (saved without this mod), whose
    nearest companion file at or before its play time holds a box, loads AWAKE with a RED Box
    row, as with box = on, and the log line "box: NOTE: no companion file decided this load".
    If that save continues the other one, give it that file (tools\sxc2.py --relink) and load
    again before putting anything in the box. Nothing is marked unless the box is used.
  * A held kind at 99 is not a wake: a 100th potion is dropped as the game drops it (box = on
    does the same). Things stolen or morphed IN a battle with no row are lost by the game inside
    the battle, as with box = on.
  * With give_on_load = yes on any wide piece (gear files), every save that does not own it wakes
    at its load: "new gear wakes it".

What it is
----------
A second store beside the item list, reached from its own row "Box" of the main menu (under
Quit). It holds the GEAR you receive (it goes there by itself: see "What arrives where") and
whatever you put away by hand: gear, items, wide items. The Box screen's commands:

  Take out       the box's things, ten to a page, by kind then number: icon, name, how many, and
                 (small) how many the item list holds. Left / Right: the filter (All, Items,
                 Weapons, Armour, Accessories). Up / Down: the cursor (hold to repeat). The page
                 buttons: a page. OK: "How many?" (Up / Down 1, Left / Right 10; it starts at 1
                 and never offers more than fits), OK again: they go to the item list. Cancel:
                 back. A row of the item list holds 99; a kind the list does not hold needs a
                 free row ("The item list is full" otherwise).
  Put in         the same page for the item list's rows: OK, how many, OK: they go to the box
                 (65,535 of a kind; 12,000 kinds). A row put in whole leaves the list.
  Store gear     every armour, every accessory and every weapon that cannot be thrown leaves the
                 item list and goes to the box. Throwable weapons, items and wide items stay.
  Take all out   everything in the box goes back to the item list, as far as it fits (99 a row).
                 What does not fit stays in the box, and the line at the bottom says how much.
                 (Wide gear, numbers from 10000, always stays: it lives in the box.)

A grey row cannot move now (the list holds 99 of it, the list is full, nothing defines the
thing any more, or this run cannot save it in the item list: see the known limits). The bottom
window shows the last message, or the highlighted thing's description.

WHAT ARRIVES WHERE (stage B3). The rules decide only where a thing goes when you RECEIVE it;
by hand anything may lie in either store.
  * GEAR goes to the BOX: every armour, every accessory, every weapon that cannot be thrown
    (with box_throwables = box: every weapon). From a chest or an event (a field script), a
    shop, the spoils of a battle, a testing aid of a load.
  * A THROWABLE WEAPON and a CONSUMABLE (an item, a wide item) go to the ITEM LIST, as before:
    99 in a row; what a row of 99 cannot take is dropped, as the game drops it.
  * When the item list has NO ROW for such a thing (every row in use and the kind not held) it
    goes to the BOX instead of being lost. The log says so ("THE ITEM LIST HAS NO ROW FOR IT").
    This also saves what you BUY with a full list: the game takes the gil and gives nothing.
  * If the box cannot take a piece of gear (it holds all the kinds it can, or it would hold
    more than 65,535 of the kind) the piece goes to the item list, as before the box.
  * A BATTLE sees the item list only: Item, W-Item, Throw, Steal, Morph and an enemy that takes
    an item work on what is CARRIED. Gear you steal or morph is in the item list when the battle
    ends; after a battle that is WON (the one with the win screen) what the list then holds MORE
    of a kind of gear than at the battle's start moves to the box. Gear you carried into the
    battle on purpose stays carried. After a battle you fled, and in the Battle Square, nothing
    moves: such gear stays in the item list until you press Store gear.
  * SHOPS: what you buy arrives by the rules above. The "owned" figure of a piece of gear counts
    the item list AND the box (at most 99); of an item the item list only. You SELL what you
    carry: boxed things are not in the sell list (take them out first).
  * While the box is LOCKED (below) everything arrives in the item list, exactly as with
    box = off.
  * Take a thing out before you want to USE or SELL it. To EQUIP it you need not: see below.
Every arrival in the box has a line in FF7_SpellExt.log ("box: arriving: ...", "spoils: ... went
to the BOX", "box: after the battle: ...", 200 such lines at most in a run).

THE EQUIP MENU SEES THE BOX (stage B4), anywhere the Equip menu opens:
  * The list of what a character can wear holds the pieces you CARRY and the pieces in the BOX
    together, each kind once: the item list's first, in its own order, then the box's by
    number. It is no longer cut at 48 pieces.
  * The piece you choose is worn; it is taken from the box if the box holds it (a weapon that
    can be thrown: from the item list if you carry one, else from the box).
  * The piece that comes OFF goes where arriving gear goes: armour, accessories and weapons
    that cannot be thrown to the BOX; a weapon that can be thrown to the item list (to the box
    when the list has no room for it). The same for the accessory you take off with the menu's
    own button ([MENU] with the cursor on Accessory, before OK), and for what the game takes
    off a character who leaves the party.
  * A piece that comes off is never dropped while either store can take it. (The game adds the
    old piece to the item list before it removes the new one and does not look whether that
    worked: with a full item list the old piece was lost.) The box takes such a piece even when
    it holds all the kinds it can, for 64 kinds more.
  * Materia in slots the new piece does not have return to the materia list, as always (the
    game's own code; untouched).
  * A thing in the box that nothing defines any more is not offered.
  * While the box is LOCKED (below) the Equip menu is the game's again: it offers what you
    carry, and a piece that comes off goes to the item list, exactly as with box = off.
Each list, each piece that comes off and each piece chosen has a line in FF7_SpellExt.log ("box:
the Equip menu's list: ...", "box: a piece comes off: ...", "box: the Equip menu takes ...", 200
such lines at most in a run). Outside the game, tools\sxc2.py --owned SAVE.ff7 SLOT SXC_DIR
lists every number with its count in the item list, in the box and WORN by the characters.

WIDE GEAR (stage B5): WEAPONS, ARMOUR AND ACCESSORIES NUMBERED FROM 10000
  The game has room for 128 weapons, 32 armours and 32 accessories, and the mod's own sections
  ([320]-[383], [384]-[415], [416]-[447]) add 64, 32 and 32. With the box at work there is room
  for 6,000 more of each kind:
      weapons      [10000] to [15999]   in FF7_SpellExt_Weapons.ini
      armour       [16000] to [21999]   in FF7_SpellExt_Armour.ini
      accessories  [22000] to [27999]   in FF7_SpellExt_Accessories.ini
  each with exactly the keys of a [320] / [384] / [416] section (name, description, base, the
  figures, slots, growth, bonus, element, equip, price, sell, give_on_load ...). The sections
  are read only with box = on; a number is one piece for ever (do not give a number to another
  piece later: saves name it).
  * A wide piece lives IN THE BOX or ON A CHARACTER. It is never in the item list: it cannot be
    taken out ("Wide gear stays in the box: put it on in the Equip menu"), "Take all out"
    leaves it, a battle never sees it. A WIDE WEAPON CANNOT BE THROWN in this version (throw =
    yes is ignored, with a line). It cannot be sold or bought in a shop in this version; hand
    it out with give_on_load = yes (one goes into the box at a load unless you own one).
  * THE EQUIP MENU offers the box's wide pieces a character may wear after the others, and
    wearing one works as with any piece: the old piece goes to the box (or the item list), the
    new one leaves the box. Names, descriptions, slots, growth and the figures are the piece's
    own on the Equip, Status, Materia and PHS screens; in battle the weapon's model and figures
    are its base's with your changes.
  * A wide piece borrows a number the game can hold in one byte (a "lent slot": 64 for weapons,
    96 for armour, 96 for accessories) while it is WORN, or while its row is ON SCREEN in the
    Equip menu's list. THE WINDOW (stage B6): when a character can wear more wide pieces of a
    kind than there are free slots, the list still holds them ALL, and only the rows on screen
    (and one or two beside them) hold a slot; as you scroll, slots are handed on, before the
    game draws the rows. You see nothing of it: every row has its own name, the highlighted
    row its own figures, slots and description, and OK puts on the row you are on. Leaving
    the list gives every such slot back; a worn piece always keeps its own.
    So what one character can CHOOSE among is not limited by the 64 / 96 / 96 any more: the
    limit is the game's list itself, 320 entries of one kind for one character, counting the
    game's own pieces and the mod's older ones (numbers below 512) that the character can wear
    and you own, which come first. With more, the last ones are not offered, with a line in
    the log ("*** box: the Equip menu's list: character N can wear M more weapons than the
    game's list has room for (320) ..."); they stay in the box.
    What can be WORN at one moment by everybody together stays 64 wide weapons, 96 wide
    armours, 96 wide accessories (different pieces; far more than there are characters).
    With no more wearable wide pieces than free slots the list is built as before the window.
    If another mod has changed the one call the window needs (the log says "*** box: the
    window (stage B6): REFUSED"), the list is as before the window too: what the free slots
    allow is offered, the rest is not ("... are NOT offered: every lent slot of the kind is
    in use"), and nothing happens to it.
  * IN THE SAVE a worn wide piece is NOT written as itself. The save holds a STAND-IN the
    unmodified game can read: the character's first weapon (Buster Sword for Cloud, ...),
    Bronze Bangle (armour 0), no accessory. The real piece is in the companion file, in its
    list of worn pieces (WORN). When you load with the mod and the companion file, the pieces
    are worn again. The materia in the piece's slots stay where they are in the save.
  * WITHOUT THE COMPANION FILE (it was lost, or the save was copied alone) the characters wear
    the stand-ins and the box is MISSING (below): the worn wide pieces are in that file, with
    the box. Put the file back and load again. This holds also when the box itself was empty
    and every wide piece was worn: the save's line in sxc2_index.txt counts the worn pieces
    with the box's kinds (box=N), so such a save is never taken for one that had no box.
  * "Take the box of <file>.sxc" (below) takes that file's box AND the wide pieces its list of
    worn pieces names: they go INTO THE BOX, not onto the characters (the file is another
    state of the game), each with a "*** WORN: ... is NOT put on: the file is not this save's
    own" line. Put them on again in the Equip menu.
  * A wide piece that comes off while the box cannot take it (65,535 of it already, or the box
    64 kinds past its cap) is not dropped: it is kept in the companion file's list of worn
    pieces under the character's record (a "*** box: ... it is KEPT ..." line) and is boxed
    at a later load, when the box has room for it. It is never put on over the piece the
    character wears then; an accessory taken off is put on again if the place is still empty.
  * If the save was played WITHOUT the mod, or with an older build, or with box = off, and the
    equipment of a character was changed there, the wide piece that character wore is put IN
    THE BOX at the next load with wide gear ("*** WORN: ... is NOT put on ... The piece goes to
    the BOX"). A stand-in swapped away there leaves a piece you never owned in the item list
    (a Buster Sword, a Bronze Bangle): the price of keeping the save readable without the mod.
  * A wide piece whose section you take out of its file stays where it is (worn or boxed),
    shown as "Missing weapon 10000"; worn, it acts as the game's first piece of the kind until
    the section is back. Do not reuse its number.
  * The two accessory effects the game ties to an accessory's own number (the +15 to all
    figures of Tough Ring's place 25... and the walk-heal of place 27) cannot be given to a
    wide accessory; every effect that is in the record (bonus, special, status_defense,
    element) can.
  * Wide gear is decided ONCE, when the game starts: the box must be at work and a gear file
    must define at least one wide piece; the log then says "box: wide gear: 36 of 36 sites
    written ...; wide gear: FFNx tables ours". If it says "*** box: wide gear: REFUSED: ..."
    nothing of wide gear acts in that run (the line says why) and the box works for everything
    else. A wide section added while the game runs needs a restart. With box = off, or with no
    such section, the DLL behaves exactly as the build before this stage.
  * The DLL checks all the time that what the characters wear is what it wrote down (at every
    frame of the main menu, at every save and load). A line beginning "*** box: worn pieces"
    says that a character's equipment changed behind the Equip menu's back (the game's name
    screen copying a record, an event, another mod): the piece is then put in the box, never
    dropped.

FIELD SCRIPTS see the box (so that an event does not think you own nothing of what you put
away):
  * a script that COUNTS an item (the chocobo stable's greens, a key event's item) is told the
    item list's count plus the box's, at most 99;
  * a script that TAKES an item away takes from the item list first and the rest from the box.
The log says so each time ("box: a field script counts ..." / "... removes ...", 24 lines of each
at most in a run). While the box is LOCKED (below) scripts see the item list only.

Putting a thing in the box never counts as USING it: the row is changed by the DLL itself and
the game's "remove an item" routine (FFNx's, with its Steam achievements) is not called. A limit
manual put in the box unlocks nothing.

Turning it on
-------------
In SpellExtConfig\FF7_SpellExt_Game.ini (read when the game STARTS; keep the line endings):

  box = on             off (the default) | on | auto (the box on demand: see the top of this file)
  box_access = save    save (the default): the row is grey where Save is grey: it opens at save
                       points and on the world map.  always: it opens anywhere.
  box_backup = 20      how many replaced companion files that hold a box are kept, per save slot,
                       in FF7_SpellExt_Saves\box_backup (0-50). 0 = they are deleted once the new
                       file is verified, as companions were before the box.
  box_throwables = list    list (the default): throwable weapons arrive in the item list and
                           Store gear leaves them there (95 of the game's 128 weapons can be
                           thrown). box: every weapon arrives in the box and Store gear takes
                           every weapon; Throw then offers only what you take out.
  box_selftest = off   on: a self-test for unattended testing (see README_changes.txt).

The box needs wide_items = on with the switch ON (the log says "THE SWITCH IS ON"). New characters
are NOT needed: without them a save gets a companion file whenever the box (or anything else) has
something to keep, and none otherwise. If the save and load hooks are not all in, the log says
"*** box: REFUSED: ..." and nothing of the box acts. With box = off the DLL behaves exactly as
the build before the box.

WHERE THE BOX LIVES: READ THIS
------------------------------
The box is saved in the save's COMPANION FILE, FF7_SpellExt_Saves\<key>.sxc, and NOWHERE ELSE.
The save file itself holds only the item list. So:

  * Back up  save\  and  FF7_SpellExt_Saves\  TOGETHER (with sxc2_index.txt and box_backup).
  * A save carried to another machine needs its companion file.
  * A save made WITHOUT this mod (or with another build that writes no companion) has another
    key: the next load with the mod finds the box MISSING.

The box is never silently empty. Its state is on the Box screen and in FF7_SpellExt.log:

  KNOWN     the box of this save, read whole (or a save that never had one).
  TAKEN     the box came from a file that is not this save's own (you copied a companion to the
            save's key, or the fallback search took one). The log has a *** line: compare the
            Item menu and the Box before you save; what moved between the two in between may be
            doubled or missing. The row is red until the next save.
  MISSING   this save had a box and no file gives it. The box is LOCKED: nothing goes in or out
            and no box is written (the save stays marked, so the lock holds). The Box screen and
            the log name the file that holds it and the way back:
            * The save has NO companion file of its own (it was saved without this mod): copy
              the named file to the save's key, e.g.
                copy 1795279a.sxc to 5f1284d6.sxc in FF7_SpellExt_Saves
              (tools\sxc2.py --relink SAVE.ff7 SLOT FILE.sxc does it), then load again.
            * The save HAS a companion file of its own (it was saved again while the box was
              locked, or with box = off): do NOT copy over that file, it holds the characters as
              last saved. The Box screen offers "Take the box of <file>.sxc" (asked twice): the
              box alone is read from the named file (TAKEN); no file is written until you save.
              If the command is not offered, the named file cannot be read or holds no box this
              build reads: restore that file from a backup, or use the build that wrote it.
            * The save is another game than the one whose box that slot last held: choose
              "Start an empty box".
  REFUSED   the companion holds a box, or a list of worn wide pieces, this build cannot read.
            LOCKED; both are carried untouched; the characters wear the stand-ins.
  CARRIED   box = off (or refused at start-up): a box in a loaded save is carried untouched in
            every file the game writes, and is back when the box is on again.
  DORMANT   box = auto, a save that never needed the box: it sleeps (no row; as box = off) until
            it wakes (see the top of this file).

LOCKED means: no command of the Box screen moves anything (the bottom line says why), and field
scripts count and take from the item list only.

"Start an empty box" (offered while MISSING or REFUSED, asked twice) gives the box up for this
line of saves: it is empty from then on. The file that held the old box is not removed.

While a box holds something, or a character wears a wide piece, a save whose companion file
cannot be written is REFUSED every time (the game shows its own "could not save"): free the folder and save again. (Without a box
the second attempt is made without a companion, as before.)

A save whose companion could not be given its name (the log says so at that save: "NOT in place
under its key's name") leaves the file as sxc2_*.tmp in FF7_SpellExt_Saves. The next load reads
such a save the old way and takes the BOX from that file (TAKEN, with the *** line); save again
and it is the save's own. If the file is gone the box is MISSING and the screen says so.

A replaced companion that holds a box is not deleted: it is MOVED to
FF7_SpellExt_Saves\box_backup. THIS GOES AGAINST THE EARLIER ORDER "remove the old one once
everything looks ok": it was chosen because after Store gear that file may be the only copy of
most of the gear. box_backup = 0 follows the order (deleted). A save file put back from a backup
finds its companion in box_backup by itself. Beyond the newest box_backup files of a save slot
the oldest are deleted, but never one whose key a save file in save\ still has (an older copy of
a save kept under another file name): the log says "kept" for it at each save.

Not yet in this stage / known limits
------------------------------------
  * Wide gear (numbers from 10000): at most 64 wide weapons, 96 wide armours and 96 wide
    accessories WORN at one moment; the Equip menu's list holds 320 entries of a kind for a
    character (above); a wide weapon cannot be thrown; a wide piece is not sold in a shop and
    cannot be sold; the shop's panels do not show it. No selling from the box, no sorting by
    name. The window was not seen in the game under Enhanced Stock UI's other layouts than the
    owner's (it reads the rows on screen from the game's code: 8, or the 12 that mod writes).
  * A save made INSIDE the Nibelheim flashback (the game puts Cloud's weapon and armour away
    there) while he wore a wide armour: when the flashback ends he wears armour 0 and the wide
    armour is in the box (a "*** box: worn pieces" line). His wide weapon is kept through it.
  * CHANGING Cloud's armour INSIDE that flashback, when he wore a wide armour as it began:
    the wide armour goes to the box as always, but when the flashback ends the game writes
    the old byte back. Until you open the main menu or save he has no armour (defence 0, no
    armour slots shown); then he wears armour 0, with a "*** box: worn pieces ... nothing
    says which wide piece" line. Nothing is lost: the wide armour is in the box. Open the
    main menu after the flashback and put it on again.
  * The two bytes of the save where the game puts Cloud's weapon and armour away in that
    flashback are the SAME bytes as the second materia Yuffie steals (its ID and the low byte
    of its AP). The DLL takes them for equipment only while the bytes beside them say so (the
    two after them are ff ff, as the flashback leaves them, and the second is not ff); at any
    other time it neither reads them as equipment nor writes them. NOT COVERED: a materia that
    a mod lets pass 16,776,960 AP (0xffff00) without being mastered, when it is the SECOND
    stolen materia: a save made during the theft then writes 0 into the save file for an ID
    of 128-191 or a low AP byte of 32-127 of that one materia.
  * FFNx's crash save (save\crash.ff7) is written without the mod's save hook: a character who
    wore a wide piece then holds a byte that names nothing. Loaded with the mod it is set to the
    stand-in with a "*** box: worn pieces" line; the piece itself is in the companion file of
    the last ordinary save (give the crash save that file with tools\sxc2.py --relink: its box
    and its worn pieces then arrive in the box).
  * The Equip menu's list is in the item list's own order of rows; before the box (and with
    box = off) the game's pieces came first and the mod's after them.
  * This game's Equip menu has no "Optimize" and no "Remove all": the accessory's own take-off
    button and a character leaving the party are the only other ways a piece comes off.
  * If another mod holds the Equip menu's call that takes the chosen piece (the log's "box: the
    Equip menu (stage B4)" line at start-up says so), the Equip menu offers what you carry only.
  * A shop offers at most 99 minus what you own: with 99 or more of a piece of gear in the box
    the shop sells you no more of it.
  * In a battle a thing you steal or morph needs a row of the battle's item list: with every row
    in use it is lost, as in the game (the box is not reached from inside a battle).
  * Gear gained in a battle you fled, or in the Battle Square, stays in the item list.
  * A thing nothing defines (a number no file gives a meaning) is never put in the box when it
    arrives: it goes to the item list as before.
  * If another mod calls the game's "add an item" routine itself, its gear goes to the box too
    (the log says so once: "box: the game's add (006cbffa) was called from ...").
  * A script is told at most 99 of a thing, whatever the box holds (the game's own limit).
  * A script that takes 99 of a thing (in the game: all there can be) takes 99 from the item
    list and the box together; if the two held more, what is above 99 stays in the box. This
    holds for both of the game's removals (DLITM, and CLITM, "clear the items"). Shipped fields
    ask for 99 only in debug rooms.
  * A run that CARRIES the loaded save's item list instead of reading it (wide_rows = 320, or a
    refused wide_rows, loading a save whose list uses a row past 320; the log says so at the
    load) cannot save a wide item (a number from 1024) or a thing of the mod's own numbers (105-127, 320-511) in the item list. Such a thing stays in
    the box: Take out says "It stays in the box: this run cannot save it in the list" and Take
    all out leaves it. Start the game with wide_rows = 510 to take it out. (If the carried list
    is of a version this build does not know, nothing can be taken out in that run.)
  * The testing aids (items_on_load, give_on_load, limit_item_on_load) count what the box holds:
    a thing you put in the box is not given again at the next load. What they give arrives by
    the rules above: gear in the box ("box: items_on_load: ... put in the BOX").
  * A script that takes a limit manual out of the BOX does not reach FFNx's achievement check
    (only what leaves the item list does). No shipped field does that.
  * If another mod holds one of the field's three item calls (the log's "box: scripts:" line at
    start-up says so), that script sees the item list only.
  * Things nothing defines any more (a section removed from a file) stay in the box, are counted
    as "not defined now" and cannot be taken out until they are defined again.
  * Under an ESUI layout other than the stock one and 00-Main the row's place is read from the
    game's code (not seen in the game); under ESUI's Left Menu no row is drawn and [SWITCH] on
    the main menu's list opens the box (not seen in the game).
  * With debug = true the Box screen has a last command "SpellExt": the debug list.
  * An older build of this DLL carries the box untouched, but does not show it.

Turning it off
--------------
Take all out, save, set box = off, restart. What stayed in the box is carried, unseen.

DEFAULT (from 2026-10-14): a game file with no box line runs with box = auto. Write  box = off  to have no box
at all. When auto is only the default and the box cannot work (the wide item list is not on, or a save or load hook is not in), the log says so in one plain line, not as a warning.
