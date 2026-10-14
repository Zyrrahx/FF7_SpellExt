FF7 SpellExt - new characters in the field
==========================================

The keys below are described as they would stand in the two files' own notes.


--- for FF7_SpellExt_Game.ini (the comment block at its top) -------------------------

; field_entities          off (default), party or seats. Gives a new character a
;                         body in the field. No field of the game has an entity
;                         for a new character, so one that leads the party is
;                         invisible and one that follows is in no line-up. With
;                         this on, a plain entity and a model are added to each
;                         field as it is read, in memory only (no file is
;                         changed, and whatever another mod did to the field
;                         stays): the leader can be walked, and the party's
;                         split, join and "party member" commands move it like
;                         the others.
;                           party  for each new character that is in the party
;                                  when the field is read. One who joins the
;                                  party later (PHS, a script) has no body until
;                                  the next field.
;                           seats  for every seated new character that has
;                                  joined, in the party or not. Uses up to four
;                                  of a field's 16 models.
;                         Only for a character whose section has field_model
;                         (see the character file's README). A field with no
;                         room (16 models or 48 entities already) gets as many
;                         as fit, the party's leader first; the log says so.
;                         A field in which no character has an entity of its own
;                         (38 of the game's: the subway tunnels, some flashback
;                         and black-screen scenes ...) is left as it is: there
;                         the player is the field's first model whoever leads,
;                         and its scenes are written for that model.
;                         The entity only stands, walks and runs: scenes that
;                         give the nine something to do or say know nothing of
;                         it. Where a field gives the player other stand, walk
;                         and run animations by number (CCANM, some 15 fields),
;                         a number of 3 or more is not among the entity's three:
;                         it then keeps the animation it was in (it may stand
;                         in its walking pose). FF7_SpellExt.log has one line
;                         per field read (a field that is left alone says why
;                         the first time only).
; field_model_check       yes (default) or no. Before a field is given a
;                         character's model the skeleton file is looked for
;                         (with FFNx: the mod folders it reads through 7th
;                         Heaven, then char.lgp; without FFNx:
;                         SpellExtConfig\files, then char.lgp), and the
;                         character gets no entity if it is not found. no = take field_model on
;                         trust. ONLY if the log says a file was not found that
;                         you know is there: A FIELD THAT NAMES A SKELETON WHICH
;                         DOES NOT EXIST DOES NOT LOAD.

field_entities        = off


--- for FF7_SpellExt_Characters_README.txt, section "Looks", after equip_like ---------

field_model     Four characters: the name of the character's FIELD skeleton,
                without .HRC (YUAA for YUAA.HRC). Default: none, and then the
                character has no body in the field whatever field_entities
                says. Used only when field_entities in FF7_SpellExt_Game.ini
                is party or seats.
                The model's files (the .HRC, its .RSD and .P parts, its .TEX
                textures) go where a field model's files go: in your mod's
                char folder under 7th Heaven, or anywhere under
                SpellExtConfig\files without FFNx. With FFNx a skeleton that
                is only under SpellExtConfig\files is NOT taken (FFNx does
                not read the model's parts from there); the log says so. A
                skeleton of the game's own works too (EVFE is the field
                Elena).
                THE SKELETON MUST HAVE CLOUD'S 21 BONES, IN HIS ORDER. The
                entity is given the stand, walk and run animations that the
                field uses for Cloud (ACFE or AAFE, AAFF, AAGA), with his
                size and lights in that field. Barret's, Cid's and Elena's
                skeletons are built that way; Tifa's, Aeris's, Vincent's and
                the others are not. Nothing checks the bones: a skeleton
                with another count is your promise broken, and what the game
                does then is not known.
                The file is looked for once, before the first field that
                needs it, and the log says where it was found; if it is not
                found the character gets no entity (a field naming a missing
                skeleton does not load). A character made with copy_of has
                the field_model of the one it copies unless it gives its own;
                `field_model = none` takes it away.
                A character seated from the menu while a field is shown gets
                its body at the next field.

    [12]
    name         = Newcomer
    field_model  = YUAA
README additions, round 2 (for the mod's README; written for people who edit fields)
====================================================================================

1. Writing a new character's name in a field text
-------------------------------------------------
With FF7_SpellExt and its character file in place, a field's dialogue texts have two more name
codes. They behave as the game's own {CLOUD} ... {CID}: typed letter by letter at the message
speed, at most nine letters, always the CURRENT name.

- Byte E5: the name of the character in SEAT 12 (character ID 12, the one a field script calls
  `PC 12`). Before that character has joined (no record yet) it is the name the character file
  gives. If nobody sits in seat 12, nothing is printed.

- E5 follows the seat, exactly as `PC 12` does. Seat 12 is the character of the file's section
  [12] unless another character was given that seat: that can happen when the file defines more
  characters than there are seats, or by hand in the SpellExt menu. Every E5 then shows THAT
  character's name. Give the character your lines are written for `keep_seat = yes` in the
  character file and its seat is never given away. To name a file character wherever it sits,
  use `E6 20` (section 12), `E6 21` (section 13) and so on.

- Bytes E6 NN: NN 00-08 the nine (as EA-F2); 0C-0F the character in seat 12-15; 20-3F the
  character of section [12 + NN - 0x20] of the character file, wherever it sits. An E6 before
  any other byte is left as the game has it.
  (NN 09 and 0A are also taken, because the game's own routine takes them, but they are NOT
  "young Cloud" and "Sephiroth": they print the names in Cait Sith's and Vincent's records,
  which hold those two only during the Nibelheim flashback. Do not write texts with them.)

- Makou Reactor 1.8.5 has no name for these bytes: it shows {xe5} and {xe6}, and you type them
  the same way: {xe5} for the one-byte code; for the second form {xe6} followed by the character
  Makou shows for byte NN (it is ordinary text to the editor: {xe6} + `,` is E6 0C, {xe6} + `@`
  is E6 20, {xe6} + `A` is E6 21; NN + 0x20 is the ASCII letter). Its preview and its automatic
  window size do not know the code: size the window as for {CLOUD} (117 pixels for the name) or
  with text_window.py. (How Makou shows an unnamed byte is read from its program's strings, not
  seen running.)

- Where the code does nothing: without the mod, or if the mod's log says `name code: NOT on`,
  E5 is an empty character one pixel wide (the name is missing from the line) and of E6 NN the
  NN is shown as a letter: ship E6 texts only with the mod. Do not use either code in a map
  name, in a text given to SPCNM, or in a world-map message: those have decoders of their own.

2. A scene that lets the player NAME a new character: the order matters
-----------------------------------------------------------------------
The naming screen (MENU type 6 with the character's ID) keeps what the player types only if the
seat already has its record when the screen OPENS. The record is made when the character joins:
when a script puts the ID in the party (PRTYP / PRTYE) or the character is taken from the PHS.
So in the scene's script:

    first   the join (PRTYP 12, or the PRTYE that names 12)
    then    the naming screen (MENU, type 6, for ID 12)
    then    the texts that use E5

If the naming screen comes first, the typed name is dropped without any message on screen, the
join then copies the character file's name into the new record, and E5 shows that name whatever
was typed. The mod's log tells which happened:

    name screen: opened for character 12 (ID 12)                          the name will be kept
    name screen: opened for ID 12, which is nobody: the name will not be kept        wrong order

(Making a character available in the PHS only, without putting it in the party, does not make
the record until a party slot is rebuilt or the PHS is opened: use the party command. That the
record is there by the very next script command is how the code reads; the log line above is
the check on the first test in the game.)

3. JOIN and a new character your field does not place
-----------------------------------------------------
The game's JOIN command shows each of the two companions where its body is, walks it to the
leader and hides it, and waits until both have arrived, with the player's control off and no
time limit. In a field that has no scripts for a new character the mod gives her a bare entity
(CHAR, PC, nothing else), so nothing has put her body anywhere: it is hidden at the map's origin
(0, 0) on walkmesh triangle 0, where the field's start left it. JOIN would show her there and try
to walk from there, and in most fields the walkmesh takes no step from that spot: the scene would
never go on. (Unguarded, this locks eight fields of the story in ordinary play - cosmin6,
uttmpin1, kuro_82, yougan3, las0_8, las2_1, las4_0, las4_2 - and shows her popping up at the
origin in three more: rcktin5, tower5, yougan. Computed from the field files, not seen.)

The mod therefore guards JOIN. A companion that is one of the mod's seats (ID 12 up to the last
seat in use) AND was never placed is taken as already joined: she is not shown, not moved, and
the other companion walks in as always. "Never placed" means all four of:

    her x is 0, her y is 0, her triangle is 0, and she is hidden.

What this means for you:

- You need do nothing in a field you have not worked on: scenes with JOIN play, without her.
- To have her walk in like the others, place her before the JOIN, as the game's scenes place
  the nine: give her entity the member scripts the scene requests (PREQ / PRQSW / PRQEW by party
  slot run the same script number in whichever member is in that slot) with an XYZI in them, or
  let a SPLIT walk her out first. A seat that a SPLIT walked out, or that an XYZI put anywhere
  but the exact origin, is walked in by the game's own routine, unchanged.
- Do not park her, hidden, on exactly (0, 0) on triangle 0 if you want JOIN to walk her: that is
  the one placed position the guard cannot tell from "never placed".
- Do not SHOW her (VISI 1) without placing her and then run a JOIN with her as a companion: a
  shown body is left to the game, and it walks from the origin as described above.
- Her own scripts are NOT suspended during a JOIN she is skipped in. The game freezes the scripts
  of a companion that has arrived until the JOIN ends; she is only taken as arrived inside the
  command itself, so between its frames her entity's scripts go on running while the other
  companion walks in. For the bare entity that is nothing. If you give her entity a main script
  but no placement before the JOIN, that script runs during it; if it then places or shows her,
  the game's routine walks her in from there. (The one entity the game never freezes is the one
  whose script holds the command; that is the same with and without the mod.)
- Never put a companion on exactly the leader's position before a JOIN (true of the nine too):
  the game divides by the distance.
- The guard never touches the nine, young Cloud or Sephiroth, nor a leader; SPLIT has its own
  guard (it is finished at once when the LEADER has no entity).

The mod's log has one line when the guard is installed (`field command JOIN: a seat's companion
that no script has placed ...`) and then one line per seat for each JOIN in which it acted
(`field command JOIN in <field>: the companion with character ID 12 was never placed ...`), at
most four such lines in a field: a JOIN with two unplaced seats takes two of them. The count
starts again when the guard acts in a different field, so one test run through several fields
shows a line for each; in a field with many JOINs (tower5 has 11) only the first four lines
appear, and silence after them does not mean the guard stopped acting.

If the log says `field command JOIN: not guarded: ...`, the game's code was not what the mod
expects. The mod then does not add its bare entities either (`field entities for the seats: NOT
on, as the field command JOIN is not guarded ...`): a seat without an entity is taken as joined
by the game itself, so unedited fields do not lock. A new character is then not seen in fields
that have no entity of their own for her, and a field you edited to carry her entity must still
place her before any JOIN: there the lock described above is possible again.
