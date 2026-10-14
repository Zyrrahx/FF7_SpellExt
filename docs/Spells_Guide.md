# New spells in FF7 SpellExt: a guide with examples

This guide walks through every feature of new spells, from the simplest copy of a game spell to summons, custom
cameras and materia with more than five levels. The full key reference is `docs/Readme/FF7_SpellExt_Spells_README.txt`
(spells) and `docs/Readme/FF7_SpellExt_Materia_README.txt` (materia).

Spells go in `SpellExtConfig/FF7_SpellExt_Spells.ini`, materia in `FF7_SpellExt_Materia.ini`. Both files are read when
the game starts. A mistake is reported in `FF7_SpellExt.log` (beside `ff7_en.exe`) with the file and line number; the
bad line is skipped and the rest of the file still loads.

## How a new spell works

A new spell is an **attack record** of the game's own kind (28 bytes: power, accuracy, element, status, target,
animation...) with a number of its own, from **3000 to 65534**. The game's own spells are numbered 0x00 to 0x7f; a new
spell starts as a **copy of one of them** (`base`) and changes what you name. Everything you leave out comes from the
base. So the smallest useful spell is three lines:

```ini
[3000]
name = Splash
base = 0x1b            ; Fire: its animation, power, targeting and everything else
```

A spell does nothing until someone can cast it. That is decided by **materia**: either the spell names its materia,
or the materia names its spells. The two are the same link; use whichever side you like.

```ini
; in the spells file
materia = 98:2         ; materia 98 teaches it at level 2

; or, in the materia file, in materia 98's section
spells = 3000:2
```

`materia = any` gives the spell to every character with no materia at all (handy for testing).

## Example 1: a new element family (three spells and their materia)

Three water spells, taught by one new magic materia at levels 1, 2 and 3.

```ini
; FF7_SpellExt_Spells.ini
[3005]
name        = Water
description = Water element attack
base        = 0x1b          ; Fire, as the starting point
element     = water
mp          = 4
strength    = 8
animation   = 0x9d          ; the effect that plays: Bubble (an enemy attack's effect)
materia     = 98:1

[3006]
name          = Watera
description   = Water element attack
base          = 0x1b
element       = water
mp            = 22
strength      = 20
animation     = 0xb2
animation_all = 0x68        ; a different effect when cast on several targets: Big Wave
materia       = 98:2

[3007]
name        = Waterga
description = Water element attack
base        = 0x1d          ; Fire3
element     = water
mp          = 52
strength    = 64
materia     = 98:3
```

```ini
; FF7_SpellExt_Materia.ini
[98]
name          = Water
description   = Equips "Water" magic
kind          = magic
ap            = 2000, 18000, 35000      ; four levels: three AP totals
kernel_spells = none                    ; it teaches no game spell
equip_effect  = 11                      ; the same stat change the game's magic materia have
element       = water                   ; for pairing with Elemental
price         = 800
```

**animation** chooses the effect that plays. It takes the game's spell numbers (0x00-0x35, listed at the end of the
spells readme), and enemy attack and enemy skill effects too: an enemy attack's effect is its scene.bin effect number +
0x4e, an enemy skill's + 0x36. Effects seen working when a party member casts them: 0x4e Light Shell, 0x68 Big Wave,
0x9d Bubble, 0xaa Aero3, 0xb2 Blue Light, 0xb5 Tornade Wave, 0xba St. Elmo's Fire, 0xe9 Diamond Flash, 0xdd Super Nova
(SpellExt makes Blue Light safe on several targets and Super Nova safe outside Safer Sephiroth's arena). Some effects
made for one target misbehave on several; that is what `animation_all` is for.

## Example 2: a damage spell that also inflicts a status

```ini
[3100]
name          = Chill Touch
description   = Ice damage that may slow the target
base          = 0x1f        ; Ice2
mp            = 12
status        = slow
status_chance = 60          ; percent, in steps of 4; leave out for "always"
materia       = 98:2
```

A damage spell can carry a status, as Bio does. `status_mode` is `inflict` (the default), `cure` or `toggle`; the
game's Mini and Toad toggle at 72.

## Example 3: a healing or support spell

```ini
[3101]
name        = Renew
description = Restores HP and casts Regen
base        = 0x00          ; Cure
strength    = 40
status      = regen
status_mode = inflict
target      = selectable toggle      ; one ally, or all of them
materia     = 98:3
```

Targeting is a list of flags: `selectable`, `enemy` (the cursor starts on the enemies), `multiple` (all by default),
`toggle` (switch between one and all), `one_row`, `short_range`, `all_rows`, `random`. The game's Fire is
`selectable enemy multiple toggle`, Cure is `selectable multiple toggle`.

## Example 4: changing flags without losing the base's

`special`, `element`, `target` and `status` normally set the whole field: `special = drain_hp` on a copy of Fire also
turns off Fire's own `reflectable`. Put a sign on every name to add or remove flags and keep the rest:

```ini
[3102]
name    = Vampire Flame
base    = 0x1b
special = +drain_hp -reflectable     ; drains HP, and can no longer be reflected
materia = 98:3
```

A line is either all signed names or none. The log shows the resulting fields for any spell that uses signs.

Special flags: `damage_mp`, `darkness_affects` (treated as physical), `drain_hp`, `drain_hp_mp`,
`ignore_status_defense`, `miss_unless_dead`, `reflectable`, `ignore_defense`, `no_retarget`, `always_critical`.

## Example 5: MP costs above 255

```ini
[3103]
name    = Meteor Rain
base    = 0x2e          ; Comet2
mp      = 400           ; 0 to 999
materia = 98:4
```

The game keeps an MP cost in one byte. Above 255, SpellExt supplies the real cost for the charge, the can-afford check
and the number shown. MP Turbo raises it as usual, up to 999.

## Example 6: fixed damage

```ini
[3104]
name         = Gravity Spike
base         = 0x2a          ; Demi
fixed_damage = 2500          ; every hit does exactly this, whatever the formula, strength, defence and elements say
materia      = 98:4
```

Fixed damage is still held to the damage limit (`enemy_damage_limit` in the game file, up to 9,999,999), and a target
that absorbs the spell's element is healed by it.

## Example 7: a new summon

A summon is a spell with `list = summon`. It sits in the Summon list, has a number of uses per battle, and is shown as
a summon: the chime, the caster's glow, the party fading out and back. The effect is still the one `animation` names.

```ini
; FF7_SpellExt_Spells.ini
[3014]
name        = Nova
description = A star's fire on every enemy
base        = 0x34            ; Ultima
list        = summon
animation   = 0xdd            ; Super Nova's effect
strength    = 90
materia     = 101
```

```ini
; FF7_SpellExt_Materia.ini
[101]
name   = Nova
kind   = summon
ap     = 20000, 50000, 80000, 120000
uses   = 1, 2, 3, 4, 5        ; uses per battle at each level (the game's rule is one per level)
price  = 1
```

`party_vanishes = no` casts it the way magic is cast, with the party left on screen. A character has 16 summon slots
in all, the game's summons included.

## Example 8: a camera of your own

A spell can use one of your own battle cameras (`SpellExtConfig/cameras/*.txt`; see the cameras readme). Each custom
attack gets its own camera number from 0x190 up.

```ini
[3105]
name          = Torrent
base          = 0x1d
element       = water
camera_single = 0x197         ; the number in the camera file's  camera = 197  line
camera_multi  = 0x197         ; the one used when it hits several targets
materia       = 98:4
```

## Example 9: materia with more than five levels

A materia can have up to twenty levels: give `ap` more than four totals. A magic materia then teaches spells at the
levels that name them; the game's own spells can only be taught at levels 1 to 5.

```ini
[102]
name          = Deep Water
kind          = magic
ap            = 2000, 6000, 12000, 20000, 30000, 45000, 60000    ; eight levels
kernel_spells = none
spells        = 3005:1, 3006:3, 3007:5, 3103:8                   ; the last one only at level 8
```

The Materia menu shows a star for each level (two rows past ten), the AP still needed, and MASTER at the last.

## Support materia

Nothing is set in the spells file for support materia: they follow the player's links, as for the game's spells.

- **All, Quadra Magic, MP Turbo, MP Absorb, HP Absorb, Added Cut, Steal as well** apply to every spell the linked
  materia has taught, new or original.
- **Magic Counter, Sneak Attack, Final Attack** cast the last learned spell in the linked materia's list, as the
  Materia menu shows it (spells by the level that teaches them, the game's before new ones, new ones in file order).
- With a summon materia: the same, except All, which does nothing with a summon (as in the game).

## Where new spells appear

The Magic list is in three groups, restore, attack and indirect, in the order chosen under Config > Magic order. A new
spell goes straight after the game's own spells of its group, new spells in file order. `order = restore | attack |
indirect` chooses the group; left out, it is worked out (restore if it heals or removes statuses, attack if it does
damage, indirect otherwise). About 12 characters of a name fit a column of the Magic list (31 at most).

## Renaming the game's own spells

`FF7_SpellExt_SpellNames.ini` renames the game's spells: the number decides, the left name is the game's own, the right
one is shown.

```ini
[Magic]
0x01  Cure2                = Cura         ; Restores HP
0x02  Cure3                = Curaga       ; Restores HP
```

A line whose two names are the same changes nothing. Note: other mods that rename spells (New Threat, for one) are
overwritten by a line here; leave the file out to keep theirs.

## Setting raw bytes

Every field can also be set by its offset in the 28-byte record, for anything the keys do not cover:

```ini
byte_10  = 0xff                     ; one byte at offset 0x10
word_06  = 0xffff                   ; two bytes
dword_14 = 0xffffffff               ; four bytes
bytes    = 64 ff 00 ...             ; all 28 bytes as hex pairs (then base is not needed)
```

## Things to avoid

- Do not combine `reflectable` with several hits (`additional_effect = 0`): the game does not cope when hits are split
  between bouncing and landing. A copy of Fire given several hits should also get `special = -reflectable`.
- Inflicting `dual_drain` without `dual` is reported by the community to crash the game.
- `mp`, `target`, `animation`, `strength`, `element` and the status fields are confirmed in the engine and in the game;
  the other field names, the special and target flags and the damage formulas come from the community wiki and have
  not all been tested with SpellExt.
