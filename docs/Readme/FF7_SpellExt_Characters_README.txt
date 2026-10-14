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
portrait        File name, without extension, of the character's portrait.
                Put <name>.png anywhere under SpellExtConfig\files. Any size:
                it is scaled to fill the portrait frame (7 : 8, slightly
                taller than wide; a square picture loses a little from each
                side). <name>_l.png, a smaller version, is optional.
                Game-format <name>.tex and <name>_l.tex work too and are used
                as they are. Default: the base's portrait.
portrait_fit    yes (default) or no. no = the PNG is already laid out as the
                game's texture and must not be scaled (see files\README.txt).
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
                the skeleton, ac ad ... the textures, am onward the body
                parts, ck-cz the weapon models, da the animations (for
                Vincent's model: sfaa -> snaa, sfac -> snac, and so on).
                Any part you do not supply is taken from the `battle_like`
                model, so you can start with just the textures.
                The character then has its own model, separate from the
                original character's, who keeps theirs.
equip_like      One of the nine (name or 0-8): the character may equip
                whatever they can. Default: the base, or the battle_like
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
                are the simplest to start with.
                Limit breaks of the character's own are not possible yet.


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
                for one from the weapon file. Default without a base: the
                equip_like character's first weapon.
armour          Armour item ID, 256-287.
accessory       Accessory item ID, 288-319, or none.
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
