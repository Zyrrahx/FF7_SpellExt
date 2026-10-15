# FF7 SpellExt: everything it changes, as a checklist

Every feature, change and fix in the DLL, grouped by area, with **how to see it** and **how far it has been
confirmed**. Use it to check a release, or to learn what SpellExt can do.

**Status:** **Played** = seen working in the game. **Self-tested** = checked inside the running game by the DLL's own
test, not yet by hand. **Built** = in the DLL and covered by native tests, not yet seen in the game.

Files: every `.ini` named here is in `SpellExtConfig/`; each has a readme in `SpellExtConfig/Readme/`. Problems are
reported in `FF7_SpellExt.log` beside `ff7_en.exe`, with the file and line.

---

## 1. Spells and magic
- [ ] **New spells** (`FF7_SpellExt_Spells.ini`, numbers 3000-65534): a copy of a game spell (`base`) with its own
      name, help text, MP, power, element, status, targeting and effect. See them in the Magic menu once a materia
      teaches them. *Played*
- [ ] **Enemy attack and enemy skill effects as spell effects** (`animation`, `animation_all`): e.g. Bubble, Big Wave,
      Aero3. *Played*
- [ ] **A different effect on several targets** (`animation_all`). *Played*
- [ ] **MP costs above 255** (up to 999): the real cost is charged, checked and shown; MP Turbo still applies. *Played*
- [ ] **Fixed damage** (`fixed_damage`, up to 9,999,999 per hit). *Built*
- [ ] **New summons** (`list = summon`): the summon chime, glow and party fade, uses per battle from the materia's
      `uses`. *Played*
- [ ] **Signed flag edits** (`special = +drain_hp -reflectable`): change flags and keep the base's others. *Played*
- [ ] **Raw record bytes** (`byte_XX`, `word_XX`, `dword_XX`, `bytes`) for anything the keys do not cover. *Built*
- [ ] **Magic order**: new spells sit in the Config menu's restore / attack / indirect groups (`order`). *Built*
- [ ] **Renaming the game's spells** (`FF7_SpellExt_SpellNames.ini`). Note: overwrites names other mods give. *Played*
- [ ] **A chained split beam**: a beam that splits leaves each enemy as the split before it hit. *Built*
- [ ] **A limit made of spell effects**. *Built*
- [ ] **Effect copies** (`FF7_SpellExt_Effects.ini`, numbers 0x100 and up): a spell plays its own copy of a game
      magic effect with files of your own (a recoloured Fire, say), beside the original in the same battle; 38 of the
      54 magic effects can be copied. *Played (Blue Fire, then Fire in its own colours)*
- [ ] **More Enemy Skills than the game's set**. *Played*

## 2. Materia
- [ ] **New materia** (`FF7_SpellExt_Materia.ini`, numbers 96-254): magic, summon, command, support, independent.
      *Played*
- [ ] **Up to 20 levels** (more than four `ap` totals): stars in two rows past ten, AP still needed, MASTER. *Played*
- [ ] **Spells taught at any level** (`spells = 3001:7`). *Played*
- [ ] **Support materia work on new spells**: All, Quadra Magic, MP Turbo, MP/HP Absorb, Added Cut, Steal as well,
      Magic Counter, Sneak Attack, Final Attack. *Played*
- [ ] **Support materia linked to a summon materia** act on new summons. *Played*
- [ ] **Chains of linked materia slots** (slots linked in chains, not only pairs: `chain3`, `chain5`). *Played*
- [ ] **Fix: a full materia stock** overwrites the least valuable piece correctly when new materia exist. *Played*
- [ ] **Fix: FFNx's mastered-materia count** (its list is sized for 91): a new mastered materia no longer writes
      outside it (`achievement_materia_view`). *Played*

## 3. Items, weapons, armour, accessories
- [ ] **New items** (`FF7_SpellExt_Items.ini`): battle use from a base item with its own strength, element, status,
      target; what it restores from the Item menu (`menu_hp`, `menu_mp`); price. Numbers 105-127 and 448-511. *Played*
- [ ] **New weapons** (`FF7_SpellExt_Weapons.ini`, 320-383): model, who can wear it (`equip`), materia slots, growth,
      bonuses, element, throwing (`throw`, `throw_like`). *Played*
- [ ] **New armour** (384-415) and **new accessories** (416-447), with bonuses, status defence and specials.
      *Played*
- [ ] **Weapon power and armour defence count in a party member's stats** for new gear. *Played*
- [ ] **The armour and accessory tables moved into the DLL's memory**, so they can grow. *Played*
- [ ] **Clear errors for numbers in the wrong range**: the log names whose number it is and the range to use.
      *Played*

## 4. The wide item list
- [ ] **Items numbered 1024-9999** (`wide_items = on`): given, shown, used in the menu and in battle, bought, sold,
      dropped, stolen, saved and reloaded. *Played*
- [ ] **A 510-row item list** (`wide_rows = 510`, the default): the Item menu, battle Item / W-Item / Throw lists,
      the shop's sell list and the Equip lists scroll 190 rows further. *Played, including a battle*
- [ ] **Sorting by name** places new things alphabetically among the game's. *Played*
- [ ] **Drops, steals and morphs** of the new numbers arrive as the right thing (the game turned some into materia or
      threw them away). *Played (drop)*
- [ ] **Field scripts give the new numbers** (Add / Remove / Check Item take 16 bits). *Played*
- [ ] **All or nothing at start-up**: all 273 (+52) patched places of the game's code are compared first; if another
      mod changed one, nothing is written and the log says which. *Played (beside New Threat: all on)*
- [ ] **The remove routine beside FFNx**: SpellExt feeds FFNx's own copy instead of replacing it; FFNx's two faults
      there (an empty row read as item 511, a read past the list) are made harmless. *Played*
- [ ] **The guard**: a write to the game's old list by something else is caught and taken in, with a log line.
      *Played*
- [ ] **Fix: a new character's name screen** no longer trips the guard (the name record overlaps the item list).
      *Built*
- [ ] **Shadow mode** (`wide_items = shadow`): watch and compare without changing anything. *Played*

## 5. The Box
- [ ] **A second store** (`box = on` or `auto`): 12,000 kinds, up to 65,535 of each, its own row in the main menu
      ("Box"), a screen with Take out / Put in / Store gear / Take all out, a kind filter and a quantity chooser.
      *Played*
- [ ] **The box on demand** (`box = auto`, the default): asleep in a save until something has no room in the item list
      or gear numbered 10000+ arrives; then "Box new" in yellow. *Played*
- [ ] **Arrival rules**: gear to the box, consumables and throwable weapons to the list, anything that would be lost to
      a full list to the box. *Self-tested*
- [ ] **The Equip menu sees the box**: a character's list offers pieces from both places and swaps with either.
      *Played*
- [ ] **Story scripts that check for or take an item see the box too**. *Self-tested*
- [ ] **Weapons 10000-15999, armour 16000-21999, accessories 22000-27999**: live in the box or on a character, worn
      through lent slots, saved with stand-ins. *Played (300 of each scrolled, equipped, saved and loaded)*
- [ ] **The Equip window** shows as many high-numbered pieces as fit its rows. *Played*
- [ ] **A box locked** when its file is missing or refused: nothing goes in or out, said in the log and the screen.
      *Self-tested*
- [ ] **Built-in self-test** (`box_selftest = on`, on save file 9 only). *Played*

## 6. New party members
- [ ] **New characters** (`FF7_SpellExt_Characters.ini`): up to 32 defined, four seated at once (IDs 12-15); stats and
      growth, level, equipment and materia to start, name, who they copy (`base`, `copy_of`). *Played*
- [ ] **Seats 14 and 15** made room for in the game. *Played*
- [ ] **In the menus, the PHS (grid scrolls past nine) and the save / load screens** with their own faces. *Played*
- [ ] **Their own portrait** from a PNG (converted to the game's format in `SpellExtConfig/cache`). *Played*
- [ ] **Their own battle model** (`battle_files`) beside the model they stand in for (`battle_like`). *Played*
- [ ] **Their own field model** (`field_model`) and an entity in every field, as leader or follower. *Played*
- [ ] **What they can equip** (`equip_like`, the gear files' `equip`). *Played*
- [ ] **Growth curves** of their own. *Played*
- [ ] **A name code for field dialogue** (their name in any line). *Played*
- [ ] **Enhanced Stock UI's battle avatars** for a new character. *Played*
- [ ] **Shops** treat them like the nine (who can equip what). *Built*
- [ ] **Saved in a companion file**, never in the game's save. *Played*

## 7. Limit breaks
- [ ] **Limits of their own** (`FF7_SpellExt_Limits.ini`): up to twelve per character over four levels; name,
      animation pack, camera, damage, element, hits, follow-ups, action script. *Played*
- [ ] **Limit numbers of their own**, so the game's limits keep theirs. *Played*
- [ ] **A limit item** that teaches the fourth-level limit, per character, with their own lines. *Played*
- [ ] **Props**: a model drawn in the hand for part of an animation (`prop`, `prop_bone`, `prop_frames` ...). *Played*
- [ ] **States**: a limit puts the character into a lasting state that changes stance, attack animation and hits per
      attack until the battle ends or they fall. *Played*
- [ ] **Testing aids**: `full_gauge`, `learn_all_on_load`. *Played*

## 8. Battle
- [ ] **Damage above 9,999**: up to 9,999,999 HP and 65,532 MP a hit (`enemy_damage_limit`,
      `enemy_mp_damage_limit`). *Played*
- [ ] **Battle cameras of your own** (`SpellExtConfig/cameras/*.txt`, numbers 190 and up), added in memory to whichever
      camera file the battle loads; read at every battle start. *Played*
- [ ] **Fix: Blue Light's screen fade on several targets**. *Played*
- [ ] **Fix: Super Nova outside Safer Sephiroth's arena**. *Played*
- [ ] **The battle's pause** written to the log (for testing). *Played*

## 9. Fields and shops
- [ ] **More than 256 texts in one field**. *Played*
- [ ] **Shop additions** (`FF7_SpellExt_Shops.ini`): up to 32 entries a shop, items and materia (`m98`); the buy list
      scrolls. *Played*
- [ ] **Field patches** shipped as FFNx chunk files (`field_game/flevel.lgp/`), no archive changed. *Played*
- [ ] **A New Threat 2.0 variant of the field patches** (`field_newthreat/flevel.lgp/`), chosen by the mod's "New Threat
      fields" tick instead of the plain game's. *Built (her joining scene so far)*
- [ ] **New characters' entities added to any field at load**, so they can be seated anywhere. *Played*

## 10. Saving
- [ ] **A companion file per save** (`FF7_SpellExt_Saves/<key>.sxc`) for new characters, new items, the full item list,
      the box and worn high-numbered gear; the game's save stays loadable by the plain game. *Played*
- [ ] **Every write checked**: written under a temporary name, read back, compared, and the save itself read back
      from disk; the old companion removed or backed up only after that. *Played*
- [ ] **Old saves load as before** and convert at their next save. *Played*
- [ ] **No new character needed**: with `wide_items = on`, a companion is written only when there is something to keep.
      *Played*
- [ ] **Several new characters at once** (17 records in one companion, four seated). *Played*

## 11. For mod makers
- [ ] **Everything in plain text files**, one folder, a readme each; examples in `docs/ExampleConfig/`.
- [ ] **Re-read the files without restarting**, from the SpellExt screen of the main menu. *Played*
- [ ] **The SpellExt screen**: characters, shops, materia, spells and more, checked in the game (with `debug = true`).
      *Played*
- [ ] **A log** naming the file and line of every mistake. *Played*
- [ ] **Testing aids**: `give_on_load`, `items_on_load`, `test_drop`, `test_steal`, `test_stitm`, `test_fill_rows`.
      *Played*
- [ ] **Loose files** under `SpellExtConfig/files/` (portraits, effect swaps) without touching the game's archives.
      *Played*
- [ ] **Names too wide for a box are drawn narrower**. *Built*
- [ ] **Patched community tools**: Currently direct edits to the flevel and scene.bin are required to reference items
      outside of the regular range of 511. This has been achieved already but I cannot share the tool edits without
      permission (edits were made to Scarlet and Makou Reactor as they are my favored tools for these kinds of edits).

- [ ] **External Tools** (browser pages in `External Tools/`): CAMMY, a 3D battle camera editor; Skeleton Master,
      extra animation slots for battle models. *CAMMY used; Skeleton Master built, not yet tried in the game*

## Known limits (not in SpellExt yet)
- Materia beyond 254 kinds (left as it is by choice).
- More than 510 rows in the item list.
- Throwing a weapon numbered 10000 and up.
- Combining the config files of several mods built on SpellExt.
- Only one SpellExt mod may be active at a time.
