// FF7_SpellExt_Weapons.ini: port of sxcfg/rules/weapons.py. load_weapons (spellext.c 35579), apply_weapon_key (35289),
// start_weapon_draft, finish_weapon (35461), finish_wide_weapon, section_refusal (35514) and the shared helpers in
// gearcommon.js.
//
// Shared state written: 'weapons_defined' = Set of the section IDs this reading loaded (320-383, and 10000-15999 wide
// weapons).
// (Kernel overrides) a section [128] to [255] changes that game weapon: read with the keys of a new one (base and
// give_on_load refused), not put in weapons_defined; the game decides "the weapon table was not moved" (not forecast).
// Not forecast (the game decides): a wide weapon refused for want of memory; a kernel base's own record (its equip
// mask, which with no name, no roster and no `equip` decides "already used": taken as non-zero).
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, hex_digit } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind } from '../py.js';
import * as gc from './gearcommon.js';

export const FILE = 'FF7_SpellExt_Weapons.ini';
export const WEAPON_RECORD_SIZE = 0x2c;
export const WEAPON_COUNT_ORIGINAL = 128;
export const NEW_WEAPON_FIRST_ITEM = 320;
export const NEW_WEAPON_COUNT = 64;
export const WEAPON_EQUIP_MASK = 0x0e;

export const FIELDS = Object.freeze(['target', 'damage_formula', 'power', 'status', 'growth', 'critical', 'accuracy',
                                     'model']);
export const ICON_NAMES = Object.freeze(['sword', 'glove', 'gunarm', 'headdress', 'staff', 'spear', 'shuriken',
                                         'megaphone', 'gun', 'armour', 'armor', 'accessory', 'item']);

export class Draft {
  constructor(ident, line) {
    this.id = ident;
    this.line = line;
    this.base = -1;
    this.throwable = -1;
    this.roster = 0;
    this.name_set = false;
    this.mask_set = new Map();      // offset -> byte written by `equip` or a raw key, for the equip mask's two bytes
  }
}

function _set(d, offset, size, value) {
  for (let i = 0; i < size; i++) {
    if (offset + i === WEAPON_EQUIP_MASK || offset + i === WEAPON_EQUIP_MASK + 1) {
      d.mask_set.set(offset + i, (value >>> (8 * i)) & 0xff);
    }
  }
}

export function apply_weapon_key(d, s, key, key_end, value, end, shared) {
  let p = value;
  let ok;
  let n;
  if (gc.is_kernel_gear_item(0, d.id)) {
    // (kernel overrides) a section of one of the game's own weapons: two keys of a new weapon do not apply
    if (word_is(s, key, key_end, 'base')) return "base is not used in a section of one of the game's own weapons ([128] to [255]): the section changes that weapon itself, and every key it does not give keeps the kernel's value. The line is not read";
    if (word_is(s, key, key_end, 'give_on_load')) return "give_on_load is for the weapon file's new weapons; one of the game's own weapons ([128] to [255]) is not given by it. The line is not read";
  }
  for (const name of FIELDS) {
    if (word_is(s, key, key_end, name)) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 0xff) return 'expected a number from 0 to 255';
      return null;
    }
  }
  if (word_is(s, key, key_end, 'name')) {
    d.name_set = end > value;        // encode_text_range: an empty name leaves the first byte ff
  } else if (word_is(s, key, key_end, 'description')) {
    // nothing
  } else if (word_is(s, key, key_end, 'base')) {
    const b = gc.parse_kernel_weapon(s, value, end);
    if (b === null || b >= WEAPON_COUNT_ORIGINAL) return 'base must be a kernel weapon: 0 to 127, or its item ID 128 to 255';
    d.base = b;
  } else if (word_is(s, key, key_end, 'throw_like')) {
    const b = gc.parse_kernel_weapon(s, value, end);
    if (b === null || b >= WEAPON_COUNT_ORIGINAL) return 'throw_like must be a kernel weapon: 0 to 127, or its item ID 128 to 255';
  } else if (word_is(s, key, key_end, 'icon')) {
    if (!ICON_NAMES.some(w => word_is(s, value, end, w))) {
      const b = gc.parse_kernel_weapon(s, value, end);
      if (b === null || b >= WEAPON_COUNT_ORIGINAL) {
        return 'icon must be sword, glove, gunarm, headdress, staff, spear, shuriken, megaphone, gun, armour, accessory, item, or a kernel weapon';
      }
    }
  } else if (word_is(s, key, key_end, 'price')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > 0x7fffffff) return 'price must be a number';
  } else if (word_is(s, key, key_end, 'sell')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (word_is(s, key, key_end, 'throw')) {
    const t = parse_yes_no(s, value, end);
    if (t === null) return 'expected yes or no';
    d.throwable = t;
  } else if (word_is(s, key, key_end, 'give_on_load')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (word_is(s, key, key_end, 'equip')) {
    const e = gc.parse_equip(s, value, end, shared);
    if (e === null) {
      return 'equip must be a list of character names or IDs (0 to 11, and 12 to 43 for the character file\'s), or everyone, none, or a mask as 0x....';
    }
    d.roster = e[1];
    _set(d, WEAPON_EQUIP_MASK, 2, e[0]);
  } else if (word_is(s, key, key_end, 'element')) {
    if (gc.parse_flags(s, value, end, gc.ELEMENT_FLAGS, 0xffff) === null) return 'unknown element name';
  } else if (word_is(s, key, key_end, 'slots')) {
    return gc.slots_check(s, value, end, 'a weapon has at most 8 slots');
  } else if (word_is(s, key, key_end, 'bonus')) {
    let count = 0;
    while (true) {
      let w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      if (word_is(s, p, we, 'none') && !count) {
        p = we;
        continue;
      }
      if (gc.table_value(s, p, we, gc.BONUS_NAMES) === null || count === 4) {
        return 'bonus must be up to four pairs like: strength 10, magic 5';
      }
      p = we;
      w = next_word(s, p, end);
      if (w === null) return 'each bonus needs an amount from 0 to 255';
      [p, we] = w;
      [ok, p, n] = parse_number(s, p, we);
      if (!ok || p !== we || n > 255) return 'each bonus needs an amount from 0 to 255';
      count += 1;
      p = we;
    }
  } else if (gc.raw_key(s, key, key_end)) {
    const size = gc.raw_key(s, key, key_end);
    const digits = key + 5;
    if (key_end - digits !== 2 || hex_digit(s[digits]) < 0 || hex_digit(s[digits + 1]) < 0) {
      return 'raw keys look like byte_04 or word_0e (two hex digits)';
    }
    const offset = hex_digit(s[digits]) * 16 + hex_digit(s[digits + 1]);
    if (offset + size > WEAPON_RECORD_SIZE) return 'that offset is past the end of the 44-byte weapon record';
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > (size === 1 ? 0xff : 0xffff)) return 'the value does not fit';
    _set(d, offset, size, n);
  } else {
    return 'unknown key';
  }
  return null;
}

// Returns 1 when the section is loaded.
export function finish_weapon(r, d, used) {
  if (d === null) return 0;
  if (gc.is_kernel_gear_item(0, d.id)) {
    used.kernel.add(d.id);        // (kernel overrides) finish_kernel_weapon: that game weapon's own entry
    return 1;
  }
  if (d.base < 0) {
    r.log(d.line, 'weapon file line %d: weapon %d has no base; skipped', d.line, d.id);
    return 0;
  }
  if (d.id >= gc.WIDE_GEAR_FIRST) {
    // the game decides: "*** wide weapon %d is NOT defined: no memory ..." (not forecast)
    if (d.throwable === 1) {
      r.log(d.line, 'weapon file line %d: wide weapon %d: throw = yes is not possible for a weapon numbered from 10000 in this version: it cannot be thrown', d.line, d.id);
    }
    used.wide.add(d.id);
    return 1;
  }
  // weapon_names[w][0] != 0xff || weapon_roster_equip[w] || the record's equip mask: what the next section of the
  // same ID is refused by. The mask comes from the base unless a key wrote it.
  const m0 = d.mask_set.has(WEAPON_EQUIP_MASK) ? d.mask_set.get(WEAPON_EQUIP_MASK) : null;
  const m1 = d.mask_set.has(WEAPON_EQUIP_MASK + 1) ? d.mask_set.get(WEAPON_EQUIP_MASK + 1) : null;
  const mask_nonzero = (m0 === null || m1 === null) ? true : (m0 | m1) !== 0;
  if (d.name_set || d.roster || mask_nonzero) used.fixed.add(d.id);
  used.fixed_loaded.add(d.id);
  return 1;
}

export function section_kind(header) {
  const s = header;
  const ident = gc.section_number(s, 0, s.length);
  if (ident === null) return null;
  if (NEW_WEAPON_FIRST_ITEM <= ident && ident < NEW_WEAPON_FIRST_ITEM + NEW_WEAPON_COUNT) return 'weapon';
  if (gc.is_kernel_gear_item(0, ident)) return 'game_weapon';
  if (gc.gear_wide_kind(ident) === 0) return 'wide_weapon';
  return null;
}

export function check(r) {
  const s = r.text;
  const used = { fixed: new Set(), fixed_loaded: new Set(), wide: new Set(), kernel: new Set() };
  let d = null;
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    let problem = null;
    if (start === stop) continue;
    if (s[start] === '[') {
      finish_weapon(r, d, used);
      d = null;
      const ident = gc.section_number(s, start, stop);
      if (ident === null) {
        problem = 'a section must be an item ID in brackets, like [320]. The section is not read';
      } else if (gc.is_kernel_gear_item(0, ident)) {
        // (kernel overrides) the game decides "the weapon table was not moved" (not forecast)
        if (used.kernel.has(ident)) problem = gc.SECTION_USED;
        else d = new Draft(ident, n);
      } else if (gc.gear_wide_sections(r.shared) && gc.WIDE_GEAR_FIRST <= ident && ident <= gc.WIDE_GEAR_LAST) {
        if (gc.gear_wide_kind(ident) !== 0) problem = gc.section_refusal(0, ident, used.fixed.size, r.shared);
        else if (used.wide.has(ident)) problem = gc.SECTION_USED;
        else d = new Draft(ident, n);
      } else if (!(NEW_WEAPON_FIRST_ITEM <= ident && ident < NEW_WEAPON_FIRST_ITEM + NEW_WEAPON_COUNT)) {
        problem = gc.section_refusal(0, ident, used.fixed.size, r.shared);
      } else if (used.fixed.has(ident)) {
        problem = gc.SECTION_USED;
      } else {
        d = new Draft(ident, n);
      }
    } else if (d === null) {
      continue;
    } else {
      const equals = pyFind(s, '=', start, stop);
      if (equals < 0) {
        problem = 'expected key = value';
      } else {
        const [ks, ke] = trim(s, start, equals);
        const [vs, ve] = trim(s, equals + 1, stop);
        problem = apply_weapon_key(d, s, ks, ke, vs, ve, r.shared);
      }
    }
    if (problem) r.log(n, 'weapon file line %d: %s', n, problem);
  }
  finish_weapon(r, d, used);
  r.shared.set('weapons_defined', new Set([...used.fixed_loaded, ...used.wide]));
}

check.wants_absent = false;
register(FILE, check, 60, section_kind);
