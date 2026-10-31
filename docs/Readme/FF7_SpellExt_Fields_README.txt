FF7 SpellExt - more fields than the game ships (field capacity, stages 1 and 2)
================================================================================

The game knows a field (a map) by a number, its field id, and finds the field's file
by the name its maplist gives that number. The game ships ids 0 to 787 and has room
for 1,200. SpellExt can make room for up to 32,767 ids: you give each new field an id
and a name in a registry file, ship the field's whole file in a mod folder, and a
script or a door (MAPJUMP, a gateway) can then take the player there.

Nothing of this is done unless the game file names a registry (fields_file). Without
it the game keeps its own tables, exactly as without SpellExt.


--- for FF7_SpellExt_Game.ini (the comment block at its top) -------------------------

; fields_file             The registry of extra fields: the name of a file in the
;                         SpellExtConfig folder, like FF7_SpellExt_Fields.ini
;                         (64 characters at most, no drive, no ..).
;                         No line, or none: off (the game's own 1,200 ids).
; fields_table_size       auto (default), or a number from 1200 to 32767: how many
;                         field ids the tables hold. auto = the highest registered
;                         id + 1, at least 1200 (and at least the maplist's count).
;                         A registered id must be below a number given here.
; field_buffer_bytes      The size of the buffer a registered field's file is read
;                         into, 4000000 to 67108864 (default 4000000, FFNx's own for
;                         ids it does not know: this key can only raise the size).
;                         It must hold the field DECODED; nothing checks it, so keep
;                         the default unless a field is bigger.
; fields_fallback         none (default), or five numbers: a field of the game's own
;                         (an id from 65 to 786), x, y, a walkmesh triangle and a
;                         direction (0-255), as 576, -57, -132, 31, 124. It is used
;                         twice (see "Saves" and "A jump the game cannot follow"
;                         below): a save made in a registered field holds this place,
;                         and a field id the game cannot read is sent here.
;                         none: a save in a registered field is made as it is, and a
;                         bad field id is not read (the game then very likely
;                         crashes or ends).
;
; All four are read at start-up only: a change needs a restart of the game
; (Re-init .ini files says so in the log and changes nothing).

fields_file           = FF7_SpellExt_Fields.ini
fields_table_size     = auto
field_buffer_bytes    = 4000000
fields_fallback       = 576, -57, -132, 31, 124


--- choosing fields_fallback ------------------------------------------------------

Pick a place the player can always stand on, and from which play goes on: the best
is the field just outside your new fields' entrance, at the spot a door into that
field puts the player. Read it from a gateway of the field next to it (Makou
Reactor, the field's exits: the destination field, x, y, triangle and direction).
One fallback serves every registered field.
  - 576, -57, -132, 31, 124 is the Wutai item shop (uta_im), where the town's door
    puts the player: the place for the test mod "SpellExt Field Capacity Test",
    whose door into field 1300 is in that shop.
  - Not 116 (md1stin, where a new game starts): its scripts play the game's opening
    by the story's progress, and x 0, y 0, triangle 0 is no spot to stand on outside
    the opening.
  - The place must lie on the field's walkmesh (the triangle must hold x, y): nothing
    can check that from the config. A wrong triangle puts the player in the wrong
    spot or off the floor.
  - It must be a field of the plain game (65 to 786): a save made in a registered
    field must load without SpellExt too.


--- the registry: FF7_SpellExt_Fields.ini ----------------------------------------

    [fields]
    1300 = xtest001
    1301 = mycave

One line per field: the id, =, the name. ; or # starts a comment. Lines in other
sections are not read. Every line that cannot be used is skipped with one line in
FF7_SpellExt.log saying why; the others still count.

The id
  - must be past the game's own: at least the number of names in the maplist the game
    reads (788 for the plain game; another mod's maplist can be longer: the FF8 Fields
    Pilot's has 789, so its first free id is 789);
  - 32766 at most (the game reads ids as signed numbers, and 32767 marks an unused
    exit);
  - below fields_table_size if a number is given there;
  - not used twice.
  Ids are kept for ever: a save remembers the id of the field it was made in. Add
  lines; do not renumber.

The name
  - 2 to 15 characters, only letters, digits, _ and - (FFNx's look-up in flevel.lgp
    reads no other character, and a one-character name would read outside its table;
    its table of the files in flevel.lgp keeps a name in 16 bytes, so a longer name
    would not be found as it is written);
  - not the name of another field, the game's or a registered one, whatever the case;
  - not sx_none (see below), and not maplist (flevel.lgp's list of the field names).

The field's file
  A registered name needs a WHOLE field file of that name, served as
  flevel.lgp\<name> by a mod folder (or an .iro): the file as it is stored in
  flevel.lgp (a 4-byte length, then the LZSS data). Chunk files (<name>.chunk.1 ..
  .chunk.9) cannot stand alone: FFNx reads the whole file first and the chunks on top
  of it. A new file name is seen only after the game is restarted.

What SpellExt does at start-up (with fields_file set)
  - The maplist is made again with a name for every id below fields_table_size: the
    game's names, the registered names, and the placeholder sx_none for every other
    id.
  - The game's three calls that open a field's file (when a field is entered after a
    load, the world map or a battle; after a door or a MAPJUMP; and the field loop's
    other change of field) go through SpellExt, all three or none (see "A jump the
    game cannot follow").
  - The table the game keeps for every field (its file buffer's size among other
    things) and a small table of default model sizes are copied into tables of that
    size; 13 places in the game's code are pointed at them, all or none: if any of
    them is not as the game has it (another mod's patch), nothing is changed and the
    log says "fields: REFUSED at <address>".
  - Whatever the config: the block the game reads its maplist into is made big
    enough for any maplist (2 MB instead of room for 1,200 names). A maplist longer
    than 1,200 names (another mod's) then no longer overruns the game's memory. With
    fields_file off, the block is put back to the game's own size afterwards; if
    SpellExt is loaded but not active (log: "NOT active"), it is put back at once.

A jump the game cannot follow (stage 2)
  A door, a script's MAPJUMP or a save that leads to
    - an id nobody registered (its name is the placeholder sx_none),
    - an id past the tables, or
    - a registered field whose whole file is not served (its mod is not active),
  is sent to fields_fallback: the game enters that field at that place instead, and
  the log says "fields: field N ...: the game goes to the fallback instead, field F
  NAME at (x,y) ...". Without fields_fallback such a field is not read, the log says
  so with ***, and the game takes its own way for a field it cannot read: read from
  the code, after a door it ends the game (it may crash on the way), after a load it
  very likely crashes. So set fields_fallback; and still never ship a door to a field
  that is not there.

Saves (stage 2)
  With fields_fallback set, a save made inside a registered field holds the FALLBACK
  as its place, and its real place (the field's NAME, x, y, triangle, direction) goes
  into the save's companion file (FF7_SpellExt_Saves\<key>.sxc, section FLDX). So:
    - loaded with SpellExt and that name in the registry, the save goes back to the
      real place, under the name's id of now (a renumbered registry still works: the
      name decides);
    - loaded with the name registered but its file not served (the field's mod is
      off), the save goes to the real id, which cannot be read, and so to the
      fallback;
    - loaded with the name no longer registered, with fields_file off, or without
      SpellExt (the plain game, the mod off), the save loads at the fallback;
    - loaded in a run where the guard on the three calls was REFUSED (another mod
      changed the code there), the save loads at the fallback too: without that
      guard a field that cannot be read would not be caught.
  The companion file is the one SpellExt already writes beside every save: keep the
  FF7_SpellExt_Saves folder with your saves. A save made on the world map, or in a
  field of the game's own, is not touched.
  Without fields_fallback a save in a registered field is made as it is (the log
  says so): loaded without SpellExt or with a registry that lacks it, it does not
  load. Do not save in a registered field without fields_fallback.

The log (FF7_SpellExt.log, beside the game's exe)
  fields: the block the game reads its maplist into at start-up ... is now 0x00200000 bytes ...
  fields: the game read 788 field names from its maplist at start-up ...
  fields: ON: 1 field(s) registered in FF7_SpellExt_Fields.ini (ids 1300 to 1300; ...) ...
  fields: the field reader's call at 0060ba9f goes through this DLL (chained) ...
  field 1300 = xtest001 (registered): read; its file buffer is 4000000 bytes ...
  field 1300 xtest001: no file (...)                       the whole file is not served
  fields: fields_fallback = field 576 uta_im at (-57,-132) triangle 31, direction 124: ...
  fields: the three calls of field_open_file (0060e2da field_enter, 0060e8e8 field_main_loop, 0060eca2 FUN_0060e96c) go through this DLL (chained ...) ...
  fields: field 1299 is not registered (...): the game goes to the fallback instead, field 576 uta_im at (-57,-132) ...
  fields: field 1300 is registered, but no whole field file of that name was served (...): the game goes to the fallback instead, ...
  fields: *** field N ...: NOT read, and no fields_fallback is set ... ***   (set fields_fallback)
  fields: a save in field 1300 = xtest001 (registered) at (x,y) ...: the save itself holds the fallback ...
  fields: this save was made in field xtest001 (id 1300 at the save, 1300 in this run's registry): its place is put back ...
  field xtest001 no longer registered: the save continues at the fallback ...
  fields: *** the callers of field_open_file are not guarded in this run (see REFUSED above): the save in xtest001 loads at the fallback ***
  fields: REFUSED at <address> ...                         another mod changed the code there: nothing of this works
  fields file line N: ...: skipped                          a registry line that cannot be used
  fields: off (no fields_file in the game file) ...        the feature is off
