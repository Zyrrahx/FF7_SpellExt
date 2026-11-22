FF7 SpellExt - commands file (new battle commands)          stage 9b (2026-11-22): learned list entries: not yet seen in game
=========================================================

File: FF7_SpellExt_Commands.ini, in the SpellExtConfig folder next to ff7_en.exe. Optional. Read every time the
game loads its kernel data (at start-up) and on "Re-init .ini files", after the spell and materia files. Problems
are reported in FF7_SpellExt.log with the line number. A new file is only seen after 7th Heaven and the game are
restarted.

A new command is a row of the battle menu. There are four kinds:

    kind = spell      (the default) OK opens the target cursor and the character casts one spell, as with the
                      Magic command.
    kind = physical   OK opens the target cursor and the character makes a WEAPON attack, made like one of the
                      game's weapon commands (Attack, Mug, Deathblow, Morph, Slash-All, 2x-Cut, Flash, 4x-Cut), with
                      the changes its keys give: gesture, power, formula, accuracy, element, status, special flags,
                      steal / morph / no-number, turns, impact effect and sound, cameras, targeting.
    kind = item       OK opens the battle's Item list, under the command's own name, and the character uses the
                      item chosen, as with the Item command. The list can be limited to some items (the others are
                      shown dim and cannot be chosen), and each item's effect can be made stronger or weaker.
    kind = list       (stage 8) OK opens the command's OWN list of spells, in the battle's Magic list window (the
                      same look, MP costs, help line, cursor and paging), and the character casts the spell chosen,
                      as with the Magic command. The list is the same for every character.

A section is a free command number. There are 30:

    0x1c - 0x1f    four free numbers in the game's own tables. Always usable.
    0x26 - 0x3f    26 more. Usable only when the DLL has moved the game's command tables into itself, which it does
                   at start-up when the commands file has a usable section from 0x26 up (the log then says
                   "command tables moved ..."). If another mod has changed one of the places the move needs, the
                   tables are not moved, one log line says why, and only 0x1c-0x1f are used in that run.
    refused        0x00-0x1b (the game's commands), 0x20-0x25 (the game's own internal ones: enemy attack, text,
                   AI events, poison, wait, an enemy's change), 0x40 and up (a battle action keeps the command in
                   six bits: 0x3f is the last there can be).

The restart rule: the tables are moved at start-up only. The FIRST time you add a section from 0x26 up, restart
7th Heaven and the game; until then the log says "needs a restart" and the row is not given. After that, "Re-init
.ini files" works for every section as it does for 0x1c-0x1f. A command that must work even beside a mod that
changes the game's command code belongs in 0x1c-0x1f. Numbers can be given in any order and with gaps.
A command from 0x26 up plays exactly as one of 0x1c-0x1f with the same keys. Mime repeats it too, when the log says
"Mime: the call at 004365ef ... is followed"; if it says "Mime does not repeat 0x26-0x3f", Mime repeats the action
before it instead.

Each section is one number:

    [0x1c]
    name        = Leech
    description = Drains HP
    menu        = target
    spell       = 3101

    [0x1d]
    name        = Heavy Swing
    description = A slow, heavy blow
    kind        = physical
    like        = attack
    script      = 0x2a
    power       = 32

    [0x26]
    name        = Second Leech
    spell       = 3101

    [0x27]
    name        = Mix
    description = Potions only, twice as strong
    kind        = item
    items       = 0x00, 0x01, 0x02
    potency     = 200

    [0x2a]
    name        = Tech
    description = Special techniques
    kind        = list
    spells      = 3101, 0x22, 0x00, 3005

A comment starts with ; or # at the start of a line or after a space. Numbers can be decimal or 0x-prefixed hex.
A section with any problem is not used at all (the log says why); the other sections still are.


Giving the command
------------------
A command materia of the materia file gives it, like any command:

    [111]
    name       = Leech
    kind       = command
    attributes = 0x1c

The row takes the empty Magic place of the menu if there is one, then the empty Summon place, then a place after.
Only materia give it (not a character or an accessory by itself). A level ladder works as Steal -> Mug:
attributes = 0x26, 0x27 (level 1 gives 0x26, level 2 0x27).

A command materia that names a number that is not in use (not defined, refused, 0x20-0x25, 0x40 and up, or 0x26 and
up when the tables are not moved) gives NO row: the DLL leaves it out of the character's command list, and the log
names the materia. (A number 0x1c-0x1f that is not defined still gives the old empty row, whose OK does nothing.)
A materia of type 0x12 (the kind that replaces Attack, as Slash-All and Double Cut) can name a spell or physical
command: the command then takes the Attack row (see "The Attack row" below). It is read as Attack instead, with one
log line saying why, when it names an item command, a number that is not in use, or a number from 0x20 up that
cannot be a command (0x20-0x25, 0x40 and up).

Do not give a materia naming 0x26 or more to an older DLL (one before stage 4): it would put the raw number in the
menu.


Keys of every command
---------------------
name            Required. The row's name in the battle menu, the Status screen and the Materia screen. Up to 31
                characters. A long name is not squeezed to fit its column.
description     The help line. Up to 95 characters. Default: a spell command's extended spell's own description,
                else none (an empty help line).
kind            spell (default), physical, item or list.
menu            What OK does. target: the target cursor. target_uncovered: the target cursor as Attack has it.
                Default: target for a spell command; a physical command's like's own (Attack, Mug and 2x-Cut:
                target_uncovered; the others: target). Not for an item command (its OK always opens the Item
                list): an item section with a menu line is not used. Not for a list command either (its OK opens
                its list).
target          Not for an item or list command (the chosen item or spell aims, as with Item and Magic).
                The target flags, as the spell file names them (selectable enemy multiple toggle one_row
                short_range all_rows random), or a number. A spell command: 0 to 0xfe, default the spell's own
                target byte. A physical command: also weapon (= 0xff, the weapon's own, as Attack), default its
                like's own (Attack's is weapon).
                Note: on a new row the game clears "multiple" and "toggle" when the flags have toggle: such a row
                aims at ONE target (Fire's own selectable enemy multiple toggle, which Leech takes, aims at one
                enemy). Flags with multiple and no toggle (selectable enemy multiple) are kept: that row aims at
                all the enemies. With All or Mega All (see "Support materia" below) a row with toggle can switch
                to all its targets while it has uses left.
support         Optional (stage 6). Which of the support materia of "Support materia" below the command takes:
                counter, sneak_attack, final_attack, all, quadra, mega_all, mp_turbo, or none; separated by spaces
                or commas; several support lines add up. Without a support line the command takes every one that
                applies to its kind (spell: all seven; physical: counter, sneak_attack, final_attack, mega_all;
                item: none; list: all, quadra, mega_all, mp_turbo). A word that does not apply to the kind (all on
                a physical command; any on an item command; counter, sneak_attack, final_attack on a list command)
                is ignored with one log line, and so is a word that is none of these; the command is
                still used. support = none: the command takes none of them. HP / MP Absorb, Added Cut, Steal as
                well, Elemental and Added Effect are the game's own and are not covered by this line (they work
                on any command).
w_form          Optional (stage 7). yes: the command is used twice in one turn, with two picks, as W-Magic and
                W-Item (see "The W- form" below). no (the default): one pick. Any other word: the command is not used.


A spell command (kind = spell)
------------------------------
spell           Required. The spell it casts: an extended spell of the spell file (3000 and up) or a kernel magic
                ID from 0x00 to 0x35. Not a summon of the spell file (list = summon).
spell_all       Optional. Another spell, cast instead when more than one target is chosen.

Everything the cast looks like comes from the SPELL's own section: its animation and animation_all, script,
script_bytes, camera, MP, element, status and the rest. A spell command takes none of the physical keys below.

How it plays:
- It is cast as Magic is: the caster's Magic gesture (script 0x1d, or the spell's own script), the spell's effect,
  camera and banner. Mime repeats it (free of MP, as Magic under Mime).
- MP: the spell's own cost. With too little MP the cast ends with the game's "not enough MP" message.
- Silence: the row is not greyed out; the cast fails when it is used. Frog: the row is greyed out, as the game
  greys every command it does not know, and a cast that gets through fails as Magic does.
- Support materia (stage 6, see "Support materia" below): Counter, Sneak Attack, Final Attack, All, Quadra Magic,
  MP Turbo and Mega All work on it; Added Cut, Steal as well and HP/MP Absorb work on any command.
- Enemies see the command's own number, not Magic: an enemy that answers Magic (a counter to spells) does not
  answer it. Their scripts' "last action" holds the low byte of the spell's ID.


A physical command (kind = physical)
------------------------------------
It is the game's own weapon attack of its `like` command: that command's steps run, in its order, with the
character's weapon (its attack power through the Attack stat, its critical %, its sounds and camera unless
changed). The keys change one thing each; what is not given stays the like's or the weapon's. The game's own rules
apply to the values the keys give exactly as to the weapon's: Darkness halves the accuracy, a frog's attack has
the frog's sounds and no impact effect, an Elemental materia on the weapon still adds its element.

like            attack (default), mug, deathblow, morph, slash_all, 2x_cut, flash or 4x_cut (2x-cut and any case
                also do). The like gives the cursor, the target flags and the cameras (its kernel record as
                loaded, so another mod's kernel changes count), the gesture, the flags and the turns, and its own
                step after the weapon set-up still runs: Deathblow divides the accuracy by 3 and always hits
                critically; Flash halves the accuracy and kills (formula 0xb0, Death); Morph has power 2 (New
                Threat: 6) and morphs on a kill.
script          The character's model script, the gesture: a weapon or Steal-family script, 0x14-0x1c or
                0x22-0x2d (0x14 Attack, 0x16/0x17 2x-Cut, 0x18-0x1b 4x-Cut, 0x1c Flash, 0x24 Mug, 0x28 Morph,
                0x2a Deathblow). Default: the like's. At several targets the game itself turns 0x14, 0x22, 0x24,
                0x26, 0x28, 0x2a and 0x2c into the next number (Attack's into Slash-All's gesture, and so on); any
                other script plays as it is.
                Refused, because they end with the character still at the target (the 2x-Cut and 4x-Cut parts, which
                count on the next turn's part to bring it home): 0x19 and 0x1a (the middle of 4x-Cut); 0x16 unless
                the turns are 2 or more; 0x18 unless the turns are 4. The turns are the turns line's, or the like's
                own (2x-Cut 2, 4x-Cut 4, the others 1): like = 4x_cut with turns = 2 is refused, as is like = 2x_cut
                with turns = 1 (give another script then). The command is then not used, with one log line.
script_all      Optional. The script at more than one target, instead (not one of those seven). Chosen when the
                targets are chosen, so a weapon whose reach leaves only one target still plays it. The same chain
                scripts are refused as for script.
turns           1 to 4: how many times the attack is made (2x-Cut has 2, 4x-Cut 4). Default: the like's. With 2
                or more the camera keeps running between turns (as 2x-Cut's). The script plays again at each turn
                (4x-Cut's 0x18 steps on to 0x19, 0x1a, 0x1b; 2x-Cut's 0x16 to 0x17).
power           0 to 255: the formula's multiplier (16 = Attack's; 32 = twice). 0 = a hit with no damage (its status
                and flags still apply). Default: 16. Not with like = morph.
damage_formula  One byte, as the spell file's (0x11 = the physical formula). Default: the weapon's. Refused: class
                0xA, a byte the loaded game has no formula routine for, and like = flash.
accuracy        0 to 255. Default: the weapon's.
element         The spell file's element names, or none. Default: the weapon's. Keep cut, hit or punch for a sword,
                club or fist: without them the weapon-reach rule (a short-range weapon cannot reach a flying enemy
                from the back row) does not apply.
status          The spell file's status names, or none (none takes the weapon's own status off). Default: the
                weapon's. Not imprisoned; not with like = flash.
status_mode     inflict (default), cure or toggle; with status only.
status_chance   always (default) or 0-100 (%); with status only; not with like = flash.
special         The spell file's special names (the whole field, as there). Default: the weapon's.
flags           The whole set of: steal (a steal attempt on each hit that lands, as Mug), no_number (no damage
                number is shown: as Flash, such a hit also makes no flinch and no counter; a full cure still shows
                its number), morph (a kill gives the enemy's morph item, as Morph), no_reach (no weapon-reach rule),
                keep_camera (the camera keeps running between turns), or none. Default: the like's (Mug: steal;
                Flash: no_number; Morph: morph; 2x-Cut and 4x-Cut: keep_camera).
impact_effect   0 to 255. Default: the weapon's.
impact_sound    0 to 0x1ff, the hit sound (the critical and miss sounds stay the weapon's). Default: the weapon's.
camera_single   0 to 0xffff, the camera at one target (0xffff = the weapon's; your own cameras 0x190 and up as for
                spells). Default: the like's.
camera_multi    The same at several targets.

How it plays:
- Mime repeats it, with the mimic's own weapon. Berserk and Confusion use it only when it is in the Attack row (see
  "The Attack row" below): they use the first row only.
- Frog: the row is greyed out. Silence: no effect (it is not magic). Darkness: half the accuracy.
- Toad after the command was chosen (an enemy or an ally casts Toad on the character before the strike comes):
  as the game does for its own commands on a frog. Made like attack, it is played as Attack is for a frog: the
  frog's own attack (the like's script, not script or script_all), the frog's sounds, no impact effect; the
  command's other values (power, element, status, flags) still apply. Made like any other command, the game ends
  it with a step forward and back, as it does a Deathblow or a Mug chosen before Toad.
- A state of the limits file never changes it (a state's `commands` lists the game's commands only; a number from
  0x20 up cannot be listed there).
- Support materia (stage 6, see "Support materia" below): Counter, Sneak Attack, Final Attack and Mega All work on
  it (All, Quadra Magic and MP Turbo are magic's: refused with one log line); Added Cut, Steal as well and HP/MP
  Absorb work.
- Enemies see the command's own number: a rule that answers Attack does not answer it, while "physically
  attacked" does. An enemy script that counts a party action as "last command below 0x20" counts 0x1c-0x1f but not
  0x26 and up: change such a script if it should count them.
- Only party members can use it. An enemy script that gives an enemy this command does nothing (one log line).


An item command (kind = item)
-----------------------------
It is the game's own Item command under another name: OK opens the same Item list, the target cursor is the chosen
item's, the item is used exactly as Item uses it (the character's Item gesture, the item's effect, camera and name
banner; Silence does not stop it) and one of it leaves the list.
items           Optional. The items the command may use: item numbers and ranges, decimal or 0x hex, separated by
                commas or spaces: 0x00, 0x01, 0x02 or 0x00-0x02 (no space inside a range; at most six characters
                a number). Several items lines add up. The numbers are items 0-127 (the game's 0-104 and SpellExt's
                105-127), SpellExt's items 448-511 and the wide items 1024-9999. A word that names a weapon, armour
                or accessory (128-447), a number that is no item (512-1023, 10000 and up), a range that reaches one,
                a backwards range or something that is not a number is left out with one log line; the rest is
                kept. If nothing is left, the command is not used. Without an items line every item can be used.
                The other items stay in the list but are shown DIM, as the game shows a Tent or a Guide Book in
                battle: OK on a dim item buzzes. They are not hidden. A number that is listed but is not in the
                party's items is simply never there; an item the game itself does not allow in battle stays dim.
                Names (items = Potion) are not read: use the numbers (the spell file's readme and the config editor
                list them).
potency         Optional. 1 to 1000: per cent of what each item does (200 = twice; 50 = half). Default 100. It
                multiplies every amount the items do, HP or MP, healing or damage, held to the same limit the game
                applies (9999 HP, 999 MP, or the damage limits of the game file) and never below 1. It does nothing
                for an item that sets HP and MP to full without an amount (Elixir, Megalixir: they are already
                full), and a character with exactly 7777 HP still gets the game's 7777 rule.
The keys spell, spell_all, target, menu and the physical keys are refused in an item section (the command is then
not used); items and potency are refused in a spell or physical section.

How it plays (read from the code; not yet seen in game):
- Each use takes one item, as with Item. An item chosen for the command but never used (the character is KO'd, or
  the battle is won first) is given back, as with Item: the DLL reserves it when the action reaches the battle's
  queue, a moment after the choice.
- At the hit, a target's Resist, Death Force and Shield count as they do for Item (the game's W-Item differs there).
- Mime repeats it with the same item, at the same potency, without using one up (as Mime of Item).
- Frog: the row is dim, while Item is not (for a frog the game greys every command but Magic, Item, W-Magic and
  W-Item).
- The list's cursor is Item's own (one per character): with the game's cursor memory on, the list may open on a
  dim row, wherever Item last left it.
- It is a single pick: W-Item does not double it; give the command w_form = yes for two (see "The W- form" below).
  It cannot take the Attack row (a type 0x12 materia naming it is read as Attack). Counter, Sneak Attack, Final
  Attack, All, Quadra Magic and MP Turbo linked to it are refused with one log line each (no item to pick, no
  meaning for an item); Mega All does not give it uses.
- Only party members can use it. An enemy script that gives an enemy this command does nothing (one log line), and
  an item it does not allow (from a script) does nothing either.
- Enemies see the command's own number: a rule that answers Item does not answer it.
- A Re-init that changes the items line takes effect at the next opening of the list.


A list command (kind = list) (stage 8; read from the code, not yet seen in game)
--------------------------------------------------------------------------------
OK opens the command's own list of spells in the battle's Magic list window: the same window, names, MP costs, the
MP panel, the help line (a spell's description), the cursor, scrolling and paging as the Magic list (under Enhanced
Stock UI its layout too). The spell chosen is cast as the Magic command casts it: its target cursor from the spell's
own target flags, the character's Magic gesture (or the spell's own script), the spell's effect and its own MP.
spells          Required. The spells of the list, in the order shown (three to a row, left to right), as spell
                IDs, decimal or 0x hex, separated by commas or spaces; several spells lines add up. At most 54
                (one Magic window: 18 rows of 3). Each is a kernel magic ID 0x00-0x35 or a spell of the spell file
                (3000 and up) that is not a summon. An enemy skill or another enemy attack is listed as a spell of
                the spell file with its base and animation (the spell file's readme: E.Skill + 0x36). A word that
                is not an ID, an ID listed twice, a summon, an ID that is no spell, a spell whose target flags are
                0xff, and anything past 54 are left out with one log line each; the rest is kept, in its order.
                With nothing left the command is not used.
                (stage 9a) An entry may carry ONE condition, written after its ID with a colon and no spaces
                (see "Entries offered by a condition" below): 0x1e:2, 0x24:level:20.
                (stage 9b) Or it is LEARNED, per character (see "Entries learned" below): 0x13:enemy:0x126,
                0x0f:item:449, 0x10:event:1.
learned_text    (stage 9b) Optional. The message when an entry is learned (see "Entries learned").
w_form = yes    Two picks from the list in one turn, as W-Magic (see "The W- form" below).
The keys spell, spell_all, target, menu, items, potency and the physical keys are refused in a list section (the
command is then not used); spells is refused in any other section (the command is then not used).

How it plays (read from the code; not yet seen in game):
- An entry is dim, and OK on it buzzes, by the game's rule for Magic: not enough MP, Silence, or a frog (Toad
  excepted). The row itself is not dimmed when every entry is (it opens on the dim list); as a frog the row is dim.
- MP: the spell's own cost, shown and charged (a spell of the spell file above 255 MP too). MP Turbo on the row
  raises both, as for Magic.
- The Magic list is not touched: while the list is open the character's Magic slots are lent to it, and they get
  the Magic list back when the list closes (a cancel, the cast, the menu passing on), and for anything else that
  needs them while it is open (a Magic Counter, Mime of Magic, the next formation, a rebuild). With the game's
  cursor memory on, the list and the Magic list each keep their own cursor.
- Mime repeats the spell that was cast. An enemy script's 0x92 with a spell not in the list does nothing.
- (stage 9a) An entry with a condition is offered only to a character who meets it (below); every other entry is
  the same for everyone. (stage 9b) A learned entry only to a character who has learned it.
- Support materia: All, Mega All, Quadra Magic and MP Turbo work as on a spell command (All's uses show on the
  list's toggle spells, "All: n", and one is spent when such a spell is cast at several targets; a spell of innate
  "multiple" spends none). Counter, Sneak Attack and Final Attack are refused with one log line (a counter has no
  entry to choose).
- It cannot take the Attack row (a type 0x12 materia naming it is read as Attack: an automatic turn has no spell
  to choose).
- (stage 9a) The Materia screen's Check on a list command's row shows the command's own list, as that character
  would see it in battle (entries not offered are empty places). Check on Magic shows the Magic list, as before.
- Enemies see the command's own number, not Magic.
The DLL needs one entry of the game's battle menu to follow for this, the command list's input (the log says "the
list kind ... 0091e6bc ... is followed"), and the Magic list's calls to be its own; if another mod changed one, the
log says "NOT used" with the place, and the command is not given.

Entries offered by a condition (stage 9a; read from the code, not yet seen in game)
-----------------------------------------------------------------------------------
A word of a spells line is ID (always offered) or ID:CONDITION, one condition per entry:
    ID:N  or  ID:materia:N   offered while a materia that gives this command, at level N or more (1-20), is on the
                             character (the materia file's own form: spells = 3001:1 means "at level 1" there too).
                             The materia's real level counts, also past five.
    ID:level:N               offered while the character's level is N or more (1-99).
The condition words in any case, the numbers decimal or 0x hex, no spaces around the colons. Example:
    spells = 3101, 0x22, 0x00, 3005           ; always
    spells = 0x1e:2, 0x24:level:20            ; Ice with the command's materia at level 2; Quake from level 20
An entry not offered is an EMPTY PLACE in the list (as the game shows a spell the character does not have): blank,
OK on it buzzes, and the other entries keep their places; nothing moves when it is offered. The Materia screen's
Check shows the same places. Each party member is judged by its own level and its own materia, as they were at the
last rebuild (the game rebuilds at each battle, each menu opening and each equip): the materia must give the command
at that level, as the game picks a command materia's command for its level (Steal at 1, Mug at 2: a materia whose
level-2 command is another one does not count at level 2).
The cast itself still checks the list as configured (a Mime repeat, an enemy script's 0x92): a condition hides an
entry from the window, it does not forbid the spell.
A condition that cannot be read is left out with its entry, one line each (the rest of the line is kept): a word
that is not one of these, a value out of range, a second condition (0x1e:2:3). An entry whose materia level no
materia giving the command has (from the materia file and the kernel) is kept and warned about: it is never offered.
Entries learned from an enemy attack, an item or a field event (enemy:, item:, event:) are read since stage 9b:
see "Entries learned" below. An older DLL (stage 8) reading a file with conditions leaves out every ID:... word with
one line each and shows the rest, closed up.


Entries learned (stage 9b; read from the code, not yet seen in game)
--------------------------------------------------------------------
An entry may be LEARNED instead: each character learns it for itself, once, and keeps it (it is saved, below).
Until then it is an empty place in the list, as an entry not offered (the same blank, the same buzz; nothing moves
when it is learned). Three ways, written after the ID as the conditions are:
    ID:enemy:ATTACK          learned when an enemy's attack ATTACK (its attack ID, 0-0xffff, decimal or 0x hex: the
                             IDs the battle log's "hit:" lines show) is aimed at the character while a materia that
                             gives this command is on it, as the game's Enemy Skill is learned: the target after Cover
                             counts, hit or missed, a Manipulated enemy's attack too; any attack, not only an enemy
                             skill. One message for the hit, at the top of the battle screen.
    ID:item:ITEM             learned when the item ITEM is used on the character in the Item menu (a TEACHING item,
                             as the game's limit manuals: the manual's sound, the item used up, the help line says
                             what was learned; with nothing left to learn the buzzer, "Already learned.", the item
                             kept). The materia need not be on. ITEM is a new item of the items file (105-127,
                             448-511, or a wide item 1024-9999) that is no character's limit item and has no menu_hp
                             or menu_mp; give it base = 87 (a limit manual) so that the Item menu aims it at one
                             character. It is used from the Item menu only, never in battle (the DLL gives it a limit
                             manual's restrictions). An entry naming another item is never offered (one log line).
    ID:event:LESSON          learned when a field script asks for lesson LESSON (1-255) for the character (the
                             [learning] section, below). The materia need not be on. No message from the DLL: the
                             field script shows its own window, as every field event does.
Several entries may name the same attack, item or lesson: one hit, one use or one request teaches all of them, in
every list that names it. Example:
    spells = 0x13:enemy:0x126, 0x15:enemy:1826   ; Haste from attack 0x126, Stop from attack 1826
    spells = 0x0f:item:449, 0x10:event:1          ; Barrier from item 449, MBarrier from lesson 1
learned_text    The message of ways enemy: and item:, up to 60 characters: {command} is the command's name,
                {spell} the entry's (once: a second {spell} is left out), a pair of " becomes the game's own
                quotation marks. Default: Learned {command} "{spell}". (the game's "Learned Enemy-Skill" line with
                the command's own name). Too long: one line, the default is used.

[learning]      A section of its own in the commands file (not a command number):
request         The two save bytes a field script writes to ask for a lesson: request = BANK:BYTE names the
                lesson's byte, and the byte after it is the character's. none (the default) reads no request.
                BANK is 1, 3, 11 (B), 13 (D) or 15 (F), the save's banks as a field script names them; BYTE 0 to
                254. Bytes 191-255 of bank 11 and 8-11 of bank 3 are refused (a character's record, the field's copy
                of the party). NO BYTES ARE CHOSEN FOR YOU: you choose them (two bytes of your own mod's flag
                register that nothing else uses); until then request = none and event: entries are learned only
                by test_lesson.
                The script writes the lesson, then the character: 0-15 its ID as field scripts use it (12-15 the
                new characters' seats), or 255 for the three in the party. In Makou Reactor, for request = B:X
                (B and X stand for the two you choose):
                    SETBYTE  Var[B][X+1] = 255    ; the character first, or in the same frame (255: the party)
                    SETBYTE  Var[B][X]   = 1      ; then the lesson (not 0)
                The DLL takes the request and clears BOTH bytes when a field is read, when a party slot is rebuilt
                (each menu opening, each battle), at the end of a load and at the start of a save, so a request
                waiting in the bytes is in the save itself until it is taken. One at a time: write a request, then
                let the field change or open the menu before the next one. An ID that is no character (16-254),
                or a lesson no entry names, is cleared with one log line.
test_lesson     TESTING AID: test_lesson = LESSON:CHARACTER (as a request: the character 0-15 or 255). At the end
                of every load the lesson is taken as if a field script had asked for it. none or remove when done.

Saved where: the entries learned are kept per character in the save's companion file (the .sxc file beside the
save, section CMDL: up to 512 learned entries in all), written at each save, read at each load. Ways ID:N and
ID:level:N are worked out each time and need nothing saved.
- A save made before this stage (its companion has no CMDL section), or New Game: nothing learned.
- A save whose companion file is not found (a save made without the mod): the nearest older save's companion, as
  for the characters, else nothing.
- With a learned entry in the file, every save gets a companion file, also without new characters.
- An older DLL (stages 4-9a) keeps the CMDL section as it is (a section it does not know), so the learned entries
  survive a step back, but it learns nothing; stages 8 and 9a leave every enemy: / item: / event: word out with
  one line each, do not take learned_text (an unknown key: that command is then not used) and refuse the
  [learning] section with one line.
- A CMDL section this DLL cannot read (another version, damaged) is kept as it is and learning is off for that game
  (a *** line).
Learning needs the DLL's save and load hooks and its hook on New Game (it puts that one in when new characters and
the wide item list are off); way enemy: needs the battle's hit hook, way item: the Item menu's (the log says
"learned list entries: on" or why not, and an entry that cannot be learned is a blank place).


Support materia (stage 6; read from the code, not yet seen in game)
-------------------------------------------------------------------
Link the support materia to the command materia that gives the command (a linked pair of slots, as for Steal or
Magic). The game's own rules apply, as for its own commands:
Counter         When an enemy hits the character: the command at the attacker (a command whose target flags aim
                at allies: at the character itself), at Counter's rate (level 1 30% ... mastered 100%). A spell
                command casts its spell (MP is taken as for any cast); a physical command swings.
Sneak Attack    At the start of a battle, before anyone acts, at Sneak Attack's rate (mastered 80%): the command at
                a random target, as the game's Sneak Attack (at all of them while the row has an All use left,
                which it then spends, as the game does for Steal).
Final Attack    When the character is KO'd: the command, as many times in the battle as Final Attack's level.
All             A spell or (stage 8) list command only. As many uses as All's level: the row shows the arrow and the target cursor can
                switch to all its targets while uses are left; a cast at several targets takes one. Then the row aims
                at one target again until the next battle. The command's target flags must have toggle (Leech's
                and Bolt2's do); a row without toggle gets no uses.
Mega All        As All, for spell, list and physical commands (as the game gives Steal and Deathblow uses). Mega All also
                turns Attack into Slash-All, as always.
Quadra Magic    A spell or list command only. As many uses as its level; each use casts the spell four times at random
                targets (eight under New Threat, whose own Quadra does), at the MP of one cast.
MP Turbo        A spell or list command only. The spell hits harder (10% a level) and costs more MP, as MP Turbo does for
                Magic: cost + 1 + cost x level / 10 (at most 255 for a spell of 255 MP or less).
Magic Counter takes a magic materia, not a command materia: linked to a new command it does nothing (one log line);
use Counter. A support materia's uses are counted afresh at each battle (and in the menus). Mime repeats a counter,
an All cast or a Quadra cast as the game does, without spending a use. Uses of All and Mega All on a row are not
drawn as a number (the game draws none for Steal under Mega All either).
Several targets with no All use left: a spell or physical command aimed at several targets when its row has no All
use left, and whose target flags have toggle, hits ONE random target (the game's rule for Magic). This also applies
to an action a script gives it (an AI 0x92), and to the Attack row's automatic turns (Berserk, Confuse).


The Attack row (stage 7; read from the code, not yet seen in game)
------------------------------------------------------------------
A materia of type 0x12 puts a spell or physical command in the Attack row, as Slash-All and Double Cut put theirs:

    [115]
    name       = Heavy Row
    type       = 0x12
    attributes = 0x1d, 0x26     ; level 1 command 0x1d, level 2 (mastered) 0x26
    ap         = 40000          ; at least one total (two levels), as for every command materia

No key of the commands file is needed: the materia decides. What the game does to its Attack row then happens to
the command, as to Slash-All or 4x-Cut:
- The row shows the command's name on every turn (and on the Status screen). It shows Limit when the gauge is full,
  and the command again after the limit. A frog's row shows Attack, and an action of the command chosen before Toad
  becomes Attack.
- Berserk, Confuse and FFNx's auto-attack use the command, not Attack. A physical command swings at a random target
  (under Confuse: a random ally). A spell command casts its spell at a random target of the spell's side (one target;
  a spell whose flags hit all with no choice hits all) and pays its MP; with too little MP or under Silence the game
  refuses it and the turn passes (the game's own message). FFNx's auto-attack aims at the first enemy.
- The row aims at ONE target when the command's target flags have toggle (no All use: All and Mega All are not given
  to it); flags with multiple and no toggle are kept (it hits all, as Slash-All).
- Mega All turns the row into Slash-All, as it does 2x-Cut and 4x-Cut (only Flash survives Mega All in the game).
- Support materia linked to a type 0x12 materia do nothing (the game's own support routines never serve this kind);
  Elemental and Added Effect still put their element / status on the weapon.
- Mime repeats it. Enemies see the command's own number.
- An item command cannot take the Attack row: an automatic turn would use an item that was never taken from the
  list (Berserk, Confuse and FFNx's auto-attack pick no item). Such a materia is read as Attack, with one log line.
- If the same number is also given by an ordinary command materia, the character may get a second row of it.
- (stage 8) A list command cannot take the Attack row (an automatic turn has no spell to choose): read as Attack,
  with one log line.
The DLL needs one call of the game's to follow for this (the log says "the Attack row: the placement call 005cee10
... is followed"); if another mod changed it, the log says "the Attack row NOT followed" and such materia are read
as Attack.


The W- form (stage 7; read from the code, not yet seen in game)
---------------------------------------------------------------
w_form = yes makes the command a W- command: it is used twice in one turn, with two picks, as the game's W-Magic,
W-Summon and W-Item. It is its own number, as W-Magic (0x15) is not Magic (2):

    [0x28]
    name   = Twin Leech
    spell  = 3101
    w_form = yes

A materia gives it as any command; a ladder attributes = 0x1c, 0x28 gives the single command at level 1 and the
W- form at level 2.
- A spell or physical command: OK on the row opens the target cursor; after the first target the menu goes back to
  the command list (the game's own W- step); OK on the same row again and a second target: both are used, each
  paying its MP. Cancelling the second target goes back to the list; OK on the row again picks the second target.
  Picking any other command instead drops the first pick, as cancelling out of W-Magic's list does.
- An item command: as W-Item. OK opens the (filtered) Item list; an item and a target, the list again, a second item
  and a target: both are used, both taken from the list. Cancelling the second pick gives the first item back. Frog
  dims the row, as it does a single item command.
- A w_form item command has W-Item's own known duplication: cancelling the second target again and again gives the
  first item back each time, as W-Item does (cancelling the Item list itself after the first pick gives nothing back).
- A list command (stage 8): as W-Magic. OK opens its list, a spell and a target, the list again, a second spell and
  a target: both are cast, each paying its MP. Cancelling the list after the first pick drops it, as W-Magic does.
- A physical W- command is two separate swings at two chosen targets (2x-Cut is one action of two hits instead).
- Mime repeats both actions, as after W-Magic.
- A first pick that was stored and then left (the menu went to another member) is kept until that member acts: its
  next OK on the row is then the second pick.
For a spell or physical command the DLL needs the battle menu's target set-up calls (the log says "the W- form ...
006d95ba / 006d95fe are followed"); without them the command is not used (one log line).


The command list's limit (16 rows)
----------------------------------
A character's command list is built with room for 16 commands, and the game's routine that adds one does not stop
at 16. Two new commands can overflow it on a character with every command materia (under New Threat, whose Flash
materia adds one more command). The DLL keeps the list at 16:
- the game's own commands always come first. When the list is full, a game command takes Steal's place if Mug is
  listed (the game drops Steal when Mug is there anyway), else the place of the last new command;
- a new command that finds no room is left out of that character's menu, with one log line.
Under New Threat's fullest case (Master Command, Enemy Skill, Throw, Steal mastered, Flash, a magic and a summon
materia on one character) both of two new commands still fit. A third or fourth may not.
With 30 numbers there can be more new commands than one character can show: 16 rows in all, with Attack and Item
always there, so 12 to 14 new rows on one character (12 with Magic and Summon). The rest is left out, as above.
One side effect, only with a full list: a Counter, Sneak Attack or Final Attack linked to a Steal materia finds no
Steal row to counter with; so does one linked to a new command that was left out (no row, no counter).


The log
-------
At start-up, when a section from 0x26 up is there:
    command tables moved (sections 0x26-0x3f defined): kernel records -> X (9 operands, loader pointer), set-up rows -> Y (3), list offsets -> Z (2); the old tables are kept true for 0x00-0x25
    Mime: the call at 004365ef (-> 00436cf2, before the game's store) is followed: 0x26-0x3f are stored for Mime
  or, if the move is refused (then only 0x1c-0x1f are used):
    command tables NOT moved: <the reason, e.g. operand at 005cf051 holds ..., expected 00db9590>: only 0x1c-0x1f are used; sections 0x26-0x3f are not
    new command 26 (NAME): NOT used: the command tables were not moved (see the line above): only 0x1c-0x1f can be used in this run
  and a section from 0x26 up first seen at a Re-init:
    new command 26 (NAME): needs a restart (the command tables are moved at start-up only, when a section from 0x26 up is there)
A materia or a menu naming a number not in use:
    materia 113 gives command 27 (attribute 1), which is not a live new command (0x1c-0x1f, or 0x26-0x3f with the command tables moved): the build list leaves it out, no row
    build list: command 27 is not a live new command (0x1c-0x1f, or 0x26-0x3f with the command tables moved): not added: no row (the materia that names it is named at the reading)
    materia 115 (type 12, replace Attack) names command 2a (attribute 1): read as Attack (01): not a live new command
Mime of a command from 0x26 up (the first 32 lines of a reading):
    new command 26: Mime: actor 1's action stored (entry 0; entry 1 cleared)
At each kernel load and Re-init:
    build list: the 17 calls of 005cece9 are followed (no command list grows past 16)
    new command 1c (Leech): kernel record 00db9670 written over ff x8 (a kernel load): 00 0f ff ff ff ff ff ff (OK: the target cursor; target flags 0f); casts spell 3101
    new command 1d (Heavy Swing): kernel record 00db9678 written over ff x8 (a kernel load): 07 ff ff ff ff ff ff ff (OK: Attack's target cursor; target flags ff = the weapon's); physical, like attack (handler list at 1)
    commands file: 2 command(s) defined, 2 in use, 0 line(s) with problems
At the first battle after a reading:
    new command 1c (Leech): battle start: its handler list is Magic's (009ae9c8[1c] = 4: 00 0c 09); said once a reading
    new command 1d (Heavy Swing): battle start: its handler list is attack's (009ae9c8[1d] = 1); said once a reading
Each use (the first 32 of a reading):
    new command 1c (Leech): actor 0 casts spell 3101 (queued ID ...; targets 0010): command type 2, script 1d
    new command 1d (Heavy Swing): actor 0: a weapon attack like attack (targets 0010): script 2a, power 32, ...
  and as a frog the same line, with script 14 and at its end:
    (the actor is a frog: the like's own script, as the game plays Attack for a frog, with the frog's sounds)
    (the actor is a frog: the game ends an action of this type for a frog, as it does its own command's)
An item command (stage 5), at each kernel load and Re-init:
    new commands: item set-up (handler 0x02, 008fee50 -> 005c8fdf) is followed for the item commands
    new commands: the Item list's window entries (0091e64c -> 006d982c, 0091e6cc -> 006d98e3) are followed for the item filter
    new commands: the hit's call 005da663 (-> 00433887, the Resist / Death Force / Shield rule) is followed: an item command's item acts there as Item's
    new command 27 (Mix): kernel record ... written over ff x8 (a kernel load): 03 ff ff ff ff ff ff ff (OK: the Item list; ...); item: Item's handlers, item numbers allowed (the other rows dimmed): 3, potency 200%
  at the first battle, at the first opening of its list, and at each use (the first 32 lines of a reading):
    new command 27 (Mix): battle start: its handler list is Item's (009ae9c8[27] = c: 02 0d 09); said once a reading
    new command 27 (Mix): the Item list: 12 row(s) dimmed (not among its 3 items); the others as the game shows them; said once a reading
    new command 27 (Mix): actor 0's item 0 reserved at the queue (as the game does for Item; given back if the action never runs)
    new command 27 (Mix): actor 0 uses item 0 (targets 0001): command type 4, Item's handlers (script 20)
    new command 27 (Mix): potency 200%: actor 0's hit on actor 0: HP 100 -> 200 (limit 9999)
  and when something is not as expected (the command is then not used, or plays differently, as said):
    new command 27 (Mix): NOT used: handler 0x02's entry 008fee50 holds ..., not this DLL's item set-up (see the patch line above)
    new command 27 (Mix): NOT used: the Item list's window entries (...) are not this DLL's: a command with an items line would show every item
    new command 27 (Mix): NOT used: the reservation routine 004330c0 is not the game's, or the queue's call 00432878 is not this DLL's (an item chosen and never used would be lost)
    new command 27 (Mix): NOT used: the hit's call 005daae5 is not this DLL's (fixed_damage_hook): its potency could not be applied
    new commands: the hit's call 005da663 is not the game's (see the patch line above): an item command's item acts as W-Item's against a target's Resist, Death Force and Shield
    new command 27 (Mix): actor 0: item 3 is not one of the command's items: refused (script -1, ...)
    commands file line 6: items: a weapon, armour or accessory number (128-447), ...: that word is left out, the rest is kept
Support materia (stage 6), at the first reading with a command in use:
    support materia: the calls 005cba19 and 005cba33 of 005cba3f are followed for the new commands (Counter, Sneak Attack, Final Attack, All, Quadra Magic, MP Turbo)
  at a rebuild (each battle start, the menus), once a reading for each party slot, command and support:
    rebuild: party slot 0: Counter (level 5) linked to new command 1d (Test Strike): counter entry 0 (type 8, value 100); said once a reading
    rebuild: party slot 1: All (level 1) linked to new command 26 (Test Far): 1 use(s); said once a reading
    rebuild: party slot 0: Quadra Magic (level 1) linked to new command 1c (Leech): count 1, 1 use(s); said once a reading
    rebuild: party slot 0: MP Turbo (level 1) linked to new command 1c (Leech): turbo 1; said once a reading
    rebuild: party slot 2: Mega All (level 1): new command 1d (Test Strike) 1 use(s) (entry 4); said once a reading
  in battle (the first 32 lines of a reading):
    new command 26 (Test Far): actor 1 at several targets: an All use spent (0 left; entry 4)
    new command 26 (Test Far): actor 1 at several targets: no All use left: one random target (as Magic)
    new command 1c (Leech): Quadra Magic: count 1 (4 casts), 0 use(s) left
    new command 1c (Leech): MP Turbo 1: MP cost 10 -> 12
    new commands: party slot 0: battle start: the All uses of entries 0010 taken (their target flags have no toggle, as for a spell)
  and the refusals, once a reading for each command and support:
    support: Counter linked to new command 27 (Test Mix): refused: an item command cannot be used by Counter, Sneak Attack or Final Attack (no item to pick); said once a reading
    support: All linked to new command 1d (Test Strike): refused: All, Quadra Magic and MP Turbo work on spell commands only (the game pairs them with magic); said once a reading
    support: Magic Counter linked to new command 1c (Leech): nothing: Magic Counter takes a magic materia; link Counter to a command materia; said once a reading
    support: Counter linked to new command 1c (Leech): off (support line 12); said once a reading
    commands file line 12: support: all, quadra and mp_turbo apply to a spell command only (...): those words are ignored
  and when something is not as expected (those supports then do nothing on new commands; everything else as before):
    support materia: NOT followed: 005cba19 (...) or 005cba33 (...) is not the game's call of 005cba3f (e8 21 00 00 00, e8 07 00 00 00): Counter, Sneak Attack, Final Attack, All, Quadra Magic and MP Turbo do nothing on new commands
    support materia: All and Mega All are NOT given to new commands: the slot match call 00436266 or the battle-start calls 005cfb2b / 005cfdd0 are not this DLL's, or 00435139 is not the game's post: a use could not be spent
    support materia: Quadra Magic is NOT given to new commands: 005ca811 or 00435139 is not the game's, or handler 0x0c (008fee78) is not this DLL's
The Attack row and the W- form (stage 7):
    new commands: the Attack row: the placement call 005cee10 (-> 005ceef0) is followed for new commands named by a replace-Attack (type 12) materia
    new commands: party slot 0: the Attack row is new command 1d (Test Strike) (target flags 03); said once a reading
    new command 26 (Test Far): actor 1 at several targets from the Attack row: one random target (as Magic)
    materia 115 (type 12, replace Attack) names command 27 (attribute 1): read as Attack (01): an item command cannot take the Attack row (...)
  (the other reasons: "not a live new command", "0x20 and up is not a command a menu row can have", "the Attack-row hooks are not in")
    new commands: the W- form (w_form) of spell and physical commands: the target set-up calls 006d95ba / 006d95fe are followed
    new command 28 (Test Twin): W- form: actor 0: first pick (the target confirm stores it and goes back to the command list; mark f001); said once a reading
    new command 28 (Test Twin): W- form: actor 0: second pick: the target confirm issues two actions (mark f001); said once a reading
  and when something is not as expected:
    new commands: the Attack row NOT followed: ...: replace-Attack materia naming a new command read as Attack (01)
    new command 28 (Test Twin): NOT used: w_form needs the target set-up hook (006d95ba / 006d95fe) and the queue's call 00432878, which are not this DLL's
    commands file line 6: w_form is yes (the command twice in one turn, two picks, as W-Magic and W-Item) or no: the command is not used
A list command (stage 8), at each kernel load and Re-init:
    new commands: the list kind (kind = list): the command list's input entry 0091e6bc (-> 006d91fa) is followed; the Magic list's hooks are this DLL's
    new command 2a (Test Tech): kernel record ... written over ff x8 (a kernel load): 01 03 ff ff ff ff ff ff (OK: its own list of 4 spell(s) in the Magic list's window; the target flags are the chosen spell's); list: Magic's handlers
  in battle (the first 32 lines of a reading):
    new command 2a (Test Tech): battle start: its handler list is Magic's (009ae9c8[2a] = 4: 00 0c 09); said once a reading
    new command 2a (Test Tech): party slot 0: its list shown in the Magic window (4 spell(s)); said once a reading
  (stage 9a) entries by condition, at each kernel load and Re-init, and when shown:
    new command 2a (Test Tech): its list: 4 always, 1 by materia level, 2 by character level
    new command 2a (Test Tech): party slot 0: its list shown in the Magic window (5 spell(s); 2 hidden (not offered: level 30, materia level 1)); said once a reading
    materia check: party slot 0: command 2a (Test Tech): its list shown (5 of 7 entries offered, 2 hidden); said once a reading
    commands file line 74: spells: a materia level is 1 to 20 (ID:N or ID:materia:N): that entry is left out, the rest is kept
    commands file line 74: spells: one condition per entry (as 0x22:2 or 0x22:level:20, not 0x22:2:3): that entry is left out, the rest is kept
    commands file line 74: spells: spell 30 wants materia level 3, but no materia that gives command 2a has that many levels (the most: 2): it is never offered
    materia check: the command entries pointer 00dca7f8 is ..., not party slot 0's ...: Magic's list shown (said once)
  (stage 9b) learned entries, at each kernel load and Re-init:
    new command 2a (Test Tech): its learned entries: 3 by enemy attack, 1 by item, 1 by field request
    new commands: learned list entries: on (3 by enemy attack, 1 by item, 1 by field request; [learning] request none, test_lesson on (a testing aid))
    new commands: the DLL's hook on the new game (00409758) is put in for the learned list entries (new characters and the wide list are off); by itself it changes nothing but clearing them
    commands file line 85: spells: spell 16: event:1: never learned until [learning] request names two save bytes (or test_lesson names the lesson)
    commands file line 84: spells: spell 15: item 448 restores HP or MP in the menu (a teaching item does nothing else there): that entry is never offered
  in battle, in the Item menu, at a load and a save:
    learned: actor 0 (character 3) learned spell 19 of command 2a (Test Tech) from enemy actor 4's attack 294 (and 0 more)
    learned: item 449 used on character 3 (ID 3): spell 15 of command 2a (Test Tech) learned (and 0 more)
    learned: item 449 used on character 3 (ID 3): nothing left to learn: kept
    learned: request lesson 1 for character 255 (the end of a load, test_lesson): 3 entries learned
    learned: request lesson 7 for character 3 (a field is read): names no entry: cleared
    load: CMDL: 5 learned entries read (version 1, own file)
    learned: the 5 learned list entries of the game that was being played are forgotten (another load, or a new game)
  and when something is not as expected:
    new commands: *** learned list entries (enemy:, item:, event:) are OFF (a kernel load): ...; each is a blank place ***
    new commands: entries learned from an enemy attack are learned WITHOUT a message: ...
    load: *** CMDL: the section of 1234abcd.sxc (version 2, ... bytes) is not read: ...; it is carried as it is, and learning is OFF for this game ... ***
    learned: the set is full (512): 1 entr(ies) from an enemy attack NOT learned; said once a game
    queue: actor 0 list command 2a, handle 4b -> ID 3101
    new command 2a (Test Tech): actor 0 casts spell 3101 from its list (queued ID 0c1d; targets 0010): command type 2, script 1d
    new commands: party slot 0: a Magic action (command 02) while its list command's list is open: the Magic list put back for it (the list again at the menu's next frame)
  and the refusals:
    commands file line 9: spells: a spell that is neither a kernel magic ID 0x00-0x35 nor a spell of the spell file (...): that spell is left out, the rest is kept
    commands file line 9: spells: more than 54 spells (one Magic window: 18 rows of 3): the rest is left out
    commands file line 5: a list command needs spells (a spells line with at least one spell a list can hold): the command is not used
    new command 2a (Test Tech): actor 0: spell 3102 is not in its list: refused (script -1, the hit loop does nothing)
    support: Counter linked to new command 2a (Test Tech): refused: Counter, Sneak Attack and Final Attack do not apply to a list command (a counter has no entry to choose); said once a reading
    materia 118 (type 12, replace Attack) names command 2a (attribute 1): read as Attack (01): a list command cannot take the Attack row (an automatic turn has no spell to choose)
  and when something is not as expected (the command is then not used):
    new command 2a (Test Tech): NOT used: a list command needs the call 006d9b8c (it holds e8 ...) to be this DLL's: its list could not be lent to the Magic list's window and put back safely
    new command 2a (Test Tech): NOT used: a list command needs the command list's input entry 0091e6bc (it holds ...; the game's 006d91fa, starting 55 8b ec 83 ec 20, called by 006db2b8) to be this DLL's
A chain script refused (the command is not used):
    commands file line 5: script / script_all 0x19 or 0x1a is the middle of 4x-Cut's chain (0x18 0x19 0x1a 0x1b): ...
    commands file line 5: script / script_all 0x18 is 4x-Cut's first part (then 0x19, 0x1a and 0x1b, ...): it needs 4 turns ...
When a character's list is full:
    build list: the character's command list is full (16): command 0b takes Steal's place (entry 5; Mug is listed: the game drops Steal at the end)
    build list: the character's command list is full (16): new command 1e is not added (no room): not in this character's menu

"NOT used: the loaded kernel's record for it is ..., not ff x8" means another mod's kernel (or an FFNx
kernel.bin.chunk.1) already uses that number: the DLL leaves it alone. Pick another of the four.

"materia N gives command 1c ..., which the commands file does not define" means the row will have no name and OK
will do nothing: define the command, or change the materia. A save keeps such a materia after the commands file is
removed; it then gives that same harmless empty row.

"build list: NOT followed" means another mod changed the game's code there: then only the lowest-numbered command
is used ("NOT used: it needs the build-list guard").
