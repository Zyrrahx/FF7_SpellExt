FF7 SpellExt - character file
=============================

File: FF7_SpellExt_Characters.ini, in the SpellExtConfig folder next to ff7_en.exe. Read once, when the
game starts. Problems are reported in FF7_SpellExt.log with the line number.
Without this file the game has its original nine characters only.

Each new character is a section named by an ID of its own, [12] to [43]: up
to 32 characters, the ROSTER. [12] is kept in the save file itself; the others
in a small companion file written with every save (see Known limits).

Seats
-----
The game itself can only know four new characters at a time: character IDs
12, 13, 14 and 15, the SEATS. (Two, 12 and 13, with `seats = 2` in
FF7_SpellExt_Game.ini, or if another mod has changed the piece of the game
that makes room for 14 and 15; the log says which.) A character of the roster
takes a seat when it is put in the party, and that seat's ID is what the game
sees: in the party, in the PHS, in a save. A character without a seat exists
only in this mod: it keeps its record (level, equipment, materia) and gets it
back when it is seated again, for as long as the game runs.

  - When the game starts, and after a load of a save that says nothing else,
    each seat holds the character whose section has the seat's own ID: [12]
    in seat 12, [13] in seat 13, and so on. A save remembers who sat where.
  - The External Characters screen of the SpellExt menu (debug = true in the
    game file) lists the whole roster and puts any of them in a party slot,
    giving it a seat: an empty one, else that of a character who is not in
    the party (who keeps its record).
  - The game's PHS only shows characters who have a seat AND have joined
    (see Joining below): a seat alone is not enough. Putting a character in
    the party from the External Characters screen makes it join.
    With more than nine characters to show, the PHS grid scrolls: Down on
    its bottom row (or Up on its top row) moves it one row, and a line under
    the grid says which rows are shown. While a character in the grid is
    chosen and waits for the second press, the grid does not scroll (the
    buzzer): choose the party member first, then scroll to the other one.
  - A field script that names character 12 to 15 means "whoever is in that
    seat"; if the seat is empty, the character whose section has that ID.

    [12]
    name = Tester
    base = 7

A comment starts with ; or # at the start of a line or after a space.
Numbers can be decimal or 0x-prefixed hex.


Two ways to define a character
------------------------------
1. From a base.  Give `base = <one of the nine>`. The character starts as a
   copy of that character's record and borrows their growth, battle model,
   portrait and equipment. Override whatever you like with the keys below.

2. From its own sheet.  Leave `base` out. The starting record is worked out
   from the level and growth you give here. Anything the sheet leaves out is
   still borrowed from one of the nine (the `battle_like` character, or
   Cloud), and the log says how much was borrowed.

A complete sheet, with no base:

    [12]
    name         = Tester
    battle_like = vincent
    equip_like   = vincent
    portrait     = tester
    level        = 20
    ;              at level:  1   11   21   31   41   51   61   81   99
    strength     =           12   22   33   45   55   62   68   78   84
    vitality     =           10   20   31   42   50   57   63   73   78
    magic        =           13   25   38   52   62   71   79   90   96
    spirit       =           11   23   35   48   60   69   77   89   95
    dexterity    =            6   14   21   29   37   43   48   52   55
    luck         =           14   16   17   18   20   22   23   24   25
    hp           =          190  390  830 1550 2450 3550 4800 7200 8900
    mp           =           20   85  165  255  355  455  600  770  910
    exp_rate     = 70 72 75 76 76 76 76 76
    weapon       = 242
    armour       = 256
    accessory    = none


Identity
--------
copy_of         The ID of a character defined EARLIER in this file: this one
                starts with everything that one's section says (and, unless
                the limits file has sections for it, that one's limit
                breaks), to be changed by the lines that follow. Put it first
                in the section. Not copied: party_slot and join. A copy can
                equip what an `equip` list names its original for.
                    [14]
                    copy_of = 12
                    name    = Newcomer 2
name            Up to 11 characters.
keep_seat       yes: the character always has a seat, and its seat is never
                given to another (not when someone is put in the party, not
                from the PHS, not by "unseat"). At a load or a new game it
                is seated if it is not: in the seat of its own ID if there is
                one (whoever is there gives it up, unless that one keeps its
                seat too), else in any seat that can be had. More keepers
                than seats cannot all be seated; the log says so. Default: no.
                Not copied by copy_of.
base            Optional. One of the original nine, by number:
                  0 Cloud   1 Barret   2 Tifa      3 Aeris    4 Red XIII
                  5 Yuffie  6 Cait Sith  7 Vincent  8 Cid


Looks
-----
portrait        The character's portrait: a picture file of your own, or one
                of the game's own portraits. Three forms (NAME is 1 to 12
                letters, digits or _, without extension):
                  portrait = NAME       a picture file NAME if there is one
                                        (below); else, if NAME is one of the
                                        game's portraits, that portrait;
                                        else the base's portrait is shown
                  portrait = game:NAME  the game's portrait, even if a file
                                        of that name exists
                  portrait = file:NAME  the picture file only, never the
                                        game's portrait
                The game's portraits, by the name battle_like takes, by the
                menu archive's own file name, or by number:
                  cloud      cloud   0     red        red     4
                  barret     barre   1     yuffie     yufi    5
                  tifa       tifa    2     caitsith   ketc    6
                  aeris      earith  3     vincent    bins    7
                  (aerith)                 cid        cido    8
                  youngcloud pcloud  9     sephiroth  pcefi  10
                             choco  11 (the chocobo)
                A game portrait needs no file: the DLL reads it from the menu
                archive (menu_us.lgp) exactly as the game reads it, so a mod
                that replaces that portrait (Enhanced Stock UI's avatars,
                Ninostyle ...) shows its picture for this character too.
                Example, a character built on Cloud with Sephiroth's face:
                  base = 0
                  portrait = game:sephiroth
                (plain "portrait = sephiroth" works too, unless a file
                named sephiroth is under SpellExtConfig\files: then the file wins)
                A picture file: put <name>.png anywhere under
                SpellExtConfig\files. Any size: it is scaled to fill the
                portrait frame (7 : 8, slightly taller than wide; a square
                picture loses a little from each side). <name>_l.png, a
                smaller version, is optional. Game-format <name>.tex and
                <name>_l.tex work too and are used as they are.
                Enhanced Stock UI's battle window shows a small avatar: a
                file <name>_b.tex if there is one; else, for a picture file,
                one made from its PNG, and for a game portrait the same
                picture as the menu, drawn small (a few columns at its right
                edge are cut, as on the PHS).
                FF7_SpellExt.log says, for each character, where its portrait
                comes from, e.g. "character 14: portrait sephiroth = the
                game's own portrait 10 (pcefi.tex or ...)" or "... = the file
                ...\sephiroth.tex (a file of that name takes precedence ...)".
                Files are found when the game starts: restart after adding
                one. Default: the base's portrait.
portrait_fit    yes (default) or no. no = the PNG is already laid out as the
                game's texture and must not be scaled (see files\README.txt).
                Not used for a game portrait.
battle_like     Whose place the character takes in battle, by character name
                  cloud barret tifa aeris red yuffie caitsith vincent cid
                  youngcloud sephiroth
                or by model number 0-16:
                  0-8 the nine in the order above, 9 young Cloud,
                  10 Sephiroth, 11-13 Barret's other weapon arms,
                  14-15 Vincent's other guns, 16 Cloud in the last battle.
                Default: the base's, including its weapon-dependent variants
                (Barret and Vincent change entry with the weapon equipped).
                The game works from a fixed list of 17 battle models and has
                no entry for a new character, so the character stands in one
                of them. This does NOT make it look like that character when
                it has files of its own (`battle_files`): it decides
                  - which entry of the list it uses (the original character
                    keeps their own model);
                  - where any model file you have not supplied is taken from;
                  - who lends anything else the sheet leaves out, when there
                    is no `base`.
                Without `battle_files` the character does use that model.
                (`battle_model` is the old name of this key and still works.)
battle_files    Two letters: the prefix of the character's own battle model
                files, in the game's naming (za -> zaaa, zaab, zaac ...).
                Put the files anywhere under SpellExtConfig\files. Prefixes
                up to sm are the game's own, but other mods add models of
                their own after that (New Threat 2.0 uses sn to vm): take a
                prefix from the end of the alphabet (z..) and check that no
                other mod you use has battle files of that prefix. Two mods
                with the same prefix show one model for both.
                The parts follow the model named in `battle_like`: aa is
                the skeleton, ab the scripts, ac ad ... the textures,
                am onward the body parts, ck-cz the weapon models, da the
                animations (for Vincent's model: sfaa -> snaa, sfac -> snac,
                and so on).
                A part you do not supply is taken from the `battle_like` model
                only for the skeleton (aa), the scripts (ab) and the animations
                (da). FFNx reads the body parts, textures and weapon models
                itself, so a missing one is not drawn (the character is
                invisible; FFNx.log shows "failed to find file"): supply the
                full set, every part renamed to your prefix.
                The character then has its own model, separate from the
                original character's, who keeps theirs.
equip_like      One of the nine (name or 0-8): the character may equip
                whatever they can. Or none: the character may equip only
                what all nine can (armour and accessories every one of the
                nine may wear; no original character's own weapons), and
                whatever an `equip` list of the weapon, armour or accessory
                file names it for (equip = 12, or its name). A piece only
                some of the nine may wear (in the game: Escort Guard, the
                men's; Minerva Band, the women's) is not for it unless a
                list names it. Default: the base, or the battle_like
                character.


Limit breaks
------------
limits          none (default), or one of the nine (name or 0-8). The
                character then has that character's limit breaks: the same
                twelve limits, learned by the same numbers of kills and
                uses, with the same gauge speed. The Limit menu, the gauge
                in battle and the Limit command all work as they do for the
                original.
                The limit ANIMATIONS belong to a battle model, so choose the
                same character as `battle_like`, or expect odd-looking
                results. Vincent's limits are transformations into other
                models and have not been tried with a new character; Cloud's
                are the simplest to start with. A transformed character acts
                by itself, so it needs a battle AI (`ai_like = vincent`,
                below), or it will stand idle.
                Limit breaks of the character's own are not possible yet.


Battle AI
---------
The original characters have small battle scripts in the kernel ("character
AI"): Sephiroth's makes him fight by himself, Vincent's picks the beast
forms' attacks, Cloud's and Aeris's keep the date scores. A new character
has none unless given one of these keys (one or the other, not both):

ai_like         One of cloud barret tifa aeris red yuffie caitsith vincent
                cid youngcloud sephiroth, or a kernel entry 0-11, or none
                (default). The character gets its OWN COPY of the kernel's
                whole character-AI block, as the game loaded it (so under a
                kernel mod such as New Threat, that mod's scripts), and runs
                that character's entry. Its scripts never touch the original
                character's: a script that switches to another entry ("link")
                switches inside the copy.
ai              A file name, without extension, of 1 to 31 letters, digits,
                _ or -: the character's block is SpellExtConfig\ai\NAME.ai,
                in the kernel's own layout (a table of entry offsets, each
                entry 16 section offsets, then the scripts; 65535 bytes at
                most). Entry 0 is the character; further entries are what
                its scripts may link to. The project's tool tools\ai_tool.py
                writes such files from text and checks them. A new file in
                the ai folder is seen only after the game restarts (like any
                new file of a mod).
                Or none (default).

Both keys in one section: the second is ignored, with a line in the log.
With copy_of, the copy has the keys of the one it copies (and a block of its
own); one line of its own replaces them.

Every block is checked before it is used: every script must stay inside the
block, use only the interpreter's instructions, end with "end" (73), and jump
only onto an instruction of its own script. A block that fails is refused
with one log line (file, entry, section, offset, why) and the character has
no AI, as without the key. The log also says, for each character with an AI,
which of its sections it has.

What runs when (as for the original characters):
  init          at the start of each battle
  main          on the character's turn, but ONLY while the game treats it
                as AI-controlled: after a transformation (Vincent's limits),
                or when its own script sets the bit 4024 (Sephiroth's init
                does). Otherwise the turn opens the menu as usual.
  counter       after every action, for each of its targets
  death         when the character dies
  physical, magical  when hit by that kind of attack
  battle_end    at the end of the battle
  pre_action    before every action in the battle (anyone's): each
                actor's own script runs, with the battle's last command
                and attack being the coming action's
  custom1-8     when an action with command 0x22 runs that section on it
So `ai_like = sephiroth` makes the character take every turn by itself, with
Sephiroth's choices of attack (and his immunities, which his init sets).

Links ("link" in a script) last until the end of the battle: each battle
starts again from the character's own entry. (The original characters keep a
link for as long as the game runs; Barret's, Tifa's and Yuffie's first battle
sends them to Aeris's entry.)

The date scores: Cloud's and Aeris's scripts (and Barret's, Tifa's and
Yuffie's, which link to Aeris's) change the save's affection values for the
date at the Gold Saucer. A character with ai_like = cloud, aeris, barret, tifa
or yuffie therefore changes those values too, as the original would.

Berserk, Confusion and Manipulate do not use these scripts and are unchanged.

Dexterity changed by a script and the time gauge: a party member's gauge
speed is worked out from its dexterity (AI variable 40a0) only at battle
start, a KO or revive, Haste/Slow/Stop and the like, and copystats. A script
that changes dexterity in battle (for example a pre_action script that does
store 40a0) changes hit rate and evasion at once, but the gauge only at the
next of those. With

    atb_follows_dexterity = yes

in FF7_SpellExt_Game.ini the DLL compares the three party slots' dexterity
at the set-up of every action (and when an action starts to play) and, on a
change, has the game work that member's gauge speed out again with its own
routine. The gauge's fill is kept; only its speed changes. Default no (the
game's behaviour). Read again with the rest of the game file. The log says
"atb_follows_dexterity: party slot N: dexterity A -> B ..." (eight lines a
battle at most). Enemies are not followed. The key works only when the
character file defines at least one new character (SpellExt's battle-start
step is then in); otherwise the log says "NOT at work: it needs the
battle-start hook" once, and the gauge behaves as the game's.


Growth
------
strength vitality magic spirit dexterity luck hp mp
                Nine values each: what the stat should be at levels
                  1, 11, 21, 31, 41, 51, 61, 81 and 99.
                The DLL turns them into a growth curve of the character's
                own. Between those levels the stat rises steadily. As with
                the original characters, each level-up has a little
                randomness, so a character tracks its curve without matching
                it exactly.
                Limits: values must not go down; stats up to 255, hp up to
                9999, mp up to 999. If two neighbouring values are too far
                apart for the game's format the log says so.
exp_rate        Eight numbers (0-255), one per level band (1-10, 11-20,
                21-30, 31-40, 41-50, 51-60, 61-80, 81-99). Higher means more
                experience needed. The nine use values around 68-77.
                Default: the base's.
curves          Alternative to the above: nine kernel curve numbers (0-63),
                in the order strength vitality magic spirit dexterity luck
                HP MP experience; - keeps the base's.


Starting record
---------------
With `base`: a copy of the base character's record as it is at that moment
(so the same level), without the materia. Without `base`: worked out from
`level` and the growth above (stats, HP, MP and experience all follow).
Either way these keys then set single values:

level           1-99. Without a base this is the level the sheet is worked
                out for (default 1). With a base it only changes the number;
                set the stats too.
                Instead of a number it can follow someone's level at the
                moment the character is created:
                  level = cloud         the same level as Cloud
                  level = cloud + 2     two above Cloud
                  level = tifa - 3      three below Tifa
                  level = party         the average of whoever is in the
                                        party (the original nine only)
                  level = party + 1
                Names: cloud barret tifa aeris red yuffie caitsith vincent
                cid, or party. The result is kept within 1-99. Stats, HP, MP
                and experience are worked out for that level, exactly as for
                a number. It is read once, when the character is created;
                after that the character levels up on its own.
strength vitality magic spirit dexterity luck
                ONE value: the starting value (0-255).
hp, mp          ONE value: starting current and maximum.
exp             Total experience.
weapon          The weapon's item ID: 128-255 for a kernel weapon, 320-383
                for a new one from the weapon file, 10000-15999 for a WIDE
                weapon (see "A piece of wide gear on a sheet" below).
                Default without a base: the equip_like character's first
                weapon. With equip_like = none: the first weapon it may
                equip (the game's weapons first, then the weapon file's
                320-383); if there is none, its base's first, which it may
                not equip (a line in the log says so). With a base: the
                base's weapon; with equip_like = none a line in the log says
                so when the character may not equip it.
armour          Armour item ID: 256-287, 384-415 for a new one from the
                armour file, 16000-21999 for a WIDE armour.
accessory       Accessory item ID: 288-319, 416-447 for a new one from the
                accessory file, 22000-27999 for a WIDE accessory, or none.
                A new piece (320-447) that no gear file defines when the
                character is created is replaced by the stand-in below, with
                a line in the log.
weapon_materia  The materia in the weapon's slots when the character is created,
armour_materia  and in the armour's: one entry per slot, in slot order, separated
                by commas. An entry is
                  49          a materia ID (0-254; 96 upward are from the
                              materia file), with no AP
                  49:2000     with that much AP
                  49:master   mastered
                  none        an empty slot
                  weapon_materia = 49:2000, 23, none, 53:master
                Up to 8 each. Materia put in a slot the weapon or armour does
                not really have still shows and works, but the game removes
                it the next time that piece of equipment is changed. Linked
                slots are a property of the weapon, not of this line.
                Like the rest of the starting record, this applies when the
                character is first created, not to one already in a save.
remake_on_load  yes = TESTING AID: the character is rebuilt from this sheet at
                every load and what the save holds for it is ignored (level,
                experience, equipment, materia, learned limits). Use it to
                try changes to the starting record; remove it afterwards, or
                progress is lost at each load. Default: no.

(A stat key appears with nine values for growth OR one value for a starting
value. To give both, write the key twice.)

A piece of wide gear on a sheet
- It needs box = on or auto and wide_items = on in the game file, and the
  piece defined in its gear file (FF7_SpellExt_Weapons.ini and the others).
  A wide number of the wrong kind (armour = 10000) is refused.
- The piece is MADE when the character is created (it is not taken from
  the item list or the box, except by a character with remake_on_load: see
  below). It is worn as any wide piece is: through a lent slot; a save holds
  a stand-in in its place and the companion file's WORN section holds the
  piece. A sleeping box (box = auto) does NOT wake for it.
- When it cannot be worn the character is created wearing the STAND-IN (the
  first of the game's weapons its equip_like character can wear, or with
  equip_like = none the first weapon it may equip, as for `weapon` above;
  armour 256; no accessory) and the log says why in one line: wide gear
  not at work in this run (box = off, wide_items off, nothing defined at
  start-up, refused) or the number not defined (nothing is made then). If
  the character may not equip it (its equip list names neither the
  character nor the one it equips like; with equip_like = none: its list
  does not name the character and it is not for all nine) or every lent
  slot of the kind is in use, the piece is made and goes into the ITEM LIST
  instead (box = on: the box; the box also when the list has no row for it)
  (with remake_on_load it is NOT made, since it would be made again at
  every load; one already in the item list or the box stays there).
- remake_on_load: the character is made anew at every load and never adds
  a piece. It wears again the piece the save holds (also when it is
  created later than the load, by a field script or the PHS), or takes one
  of that number from the item list or the box when one holds it (say after
  you swapped it off in the Equip menu: the row it was in goes); one is made
  only when there is none of it in the item list, the box or on the
  character. Change the number on the sheet and the old piece goes to the
  item list (or the box), the new one is made (or taken back). If the
  piece's equip list stops naming the character, the piece it wore goes to
  the item list or the box (a *** line) and stays there.
- give_on_load of the same piece then gives none: the save owns one.


Joining
-------
join            script (default): the character is created the first time a
                  field script adds character 12 to the party or makes it
                  visible in the PHS.
                load: created in every save you load. For testing.
party_slot      1-3: testing only. Also put the character into this party
                slot when it is created on load. Implies join = load. It is
                given a seat for that (if every seat's character is in the
                party there is none, and the log says so).

Once a save holds the character, it is loaded from the save and none of the
starting-record or joining keys apply to it any more.


Known limits
------------
- Saving. [12]'s record is inside the save file. Everyone else's (level,
  stats, equipment, materia, limits; seated or not) is written to
  FF7_SpellExt_Saves\<number>.sxc beside ff7_en.exe each time the game is
  saved, and the save remembers that number, so the save file can be copied
  or moved freely as long as that folder stays with the game. A save loaded
  without its companion file (deleted, or a save made before this) makes the
  others afresh from their sheets; the log says which happened. Overwriting a
  save deletes the companion of the save it replaces.
- Four new characters at most are known to the game at one time (the seats).
- A new character outside the party gets no experience, and the game's
  searches for "who has this materia" do not look at new characters.
- Limit breaks can only be borrowed whole from one of the nine.
- A battle model of the character's own replaces parts of an existing
  model; the skeleton and animations must suit the `battle_like` character's
  battle script.
- A save made with the new character in the party needs the DLL and this
  file to load correctly.
- Field scripts must not use variables 192-255 of banks 11 and 12: the
  character's record is stored there.
- weapon_materia fills eight slots whatever the piece has, wide or new
  pieces included (see weapon_materia above).
