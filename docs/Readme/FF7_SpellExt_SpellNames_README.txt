FF7 SpellExt - new names for the game's own spells
===================================================

FF7_SpellExt_SpellNames.ini gives new names to entries of the kernel's spell
(attack) name table: magic, summons, enemy skills, limits. The kernel file is
not changed; the DLL hands the game the new name whenever it asks for one.

One line per spell:

    0x1C  Fire2                = Fira                 ; Fire element attack

    0x1C    the spell's ID. This is what decides which spell is renamed.
    Fire2   the game's own name. Leave it: it is used to find the places where
            other text quotes the name (see below).
    Fira    the name to show. Up to 24 characters; the menus were laid out for
            about 9, so longer names may run into the next column.
    ; ...   a comment (here the game's description of the spell).

A line whose two names are the same changes nothing. Lines in [brackets] are
headings. Delete the file to go back to the game's names.

Where the new name shows
- Everywhere the game looks a spell's name up by its ID: the Magic menu, the
  battle menu, the name shown when it is cast - by the party or by an enemy
  using one of these spells.
- Inside other text that quotes the name in quotation marks, such as item
  descriptions ("Uses "Fire2" on all opponents") and the two materia
  descriptions that do ("Equips "Ice" magic").

Where it does not
- Names of things that merely contain the word: the Ice materia, Bolt Ring,
  Ice Crystal, "Ice element attack". These are other names, not quotations.
- Spells of your own in FF7_SpellExt_Spells.ini, which have their names there.

The log (FF7_SpellExt.log) says how many spells were renamed and reports any
line it could not read.
