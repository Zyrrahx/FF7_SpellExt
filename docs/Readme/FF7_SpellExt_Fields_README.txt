FF7 SpellExt - more fields than the game ships (field capacity, stage 1)
=========================================================================

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
;
; All three are read at start-up only: a change needs a restart of the game
; (Re-init .ini files says so in the log and changes nothing).

fields_file           = FF7_SpellExt_Fields.ini
fields_table_size     = auto
field_buffer_bytes    = 4000000


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
  - A jump (a door, or a script's MAPJUMP) to an id nobody registered (an sx_none),
    to an id past the tables, or to a registered field whose file is not served, is
    not read: the log says "field N is not registered", "field N is past the field
    tables" or "field N ...: no file", and the game goes on as it does for a missing
    field file. That path of the game very likely CRASHES it (read from the code: the
    field's section pointers are left pointing into the freed file buffer). Never
    ship a door or a jump to an unregistered or missing field.
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

Saves
  A save made inside a registered field keeps its id. Loaded with SpellExt and the
  same registry, it goes back there. Loaded WITHOUT them (the plain game, the mod
  off, a registry without that id) the game cannot name the field: do not save in a
  registered field yet. (A guard for this is the next stage of the work.)

The log (FF7_SpellExt.log, beside the game's exe)
  fields: the block the game reads its maplist into at start-up ... is now 0x00200000 bytes ...
  fields: the game read 788 field names from its maplist at start-up ...
  fields: ON: 1 field(s) registered in FF7_SpellExt_Fields.ini (ids 1300 to 1300; ...) ...
  fields: the field reader's call at 0060ba9f goes through this DLL (chained) ...
  field 1300 = xtest001 (registered): read; its file buffer is 4000000 bytes ...
  field 1300 xtest001: no file (...)                       the whole file is not served
  field 1299 is not registered (its name is the placeholder sx_none): not read ...
  field 1301 is past the field tables (1301 ids): not read ...  (both: never ship such a door)
  fields file line N: ...: skipped                          a registry line that cannot be used
  fields: off (no fields_file in the game file) ...        the feature is off
