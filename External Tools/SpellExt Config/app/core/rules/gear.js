// FF7_SpellExt_Armour.ini, FF7_SpellExt_Accessories.ini, FF7_SpellExt_Items.ini: port of sxcfg/rules/gear.py.
// load_gear_file (spellext.c 36045, called by load_gear_files 36183 for the three in that order), apply_gear_key
// (35772), parse_named, parse_gear_bonus, finish_gear (35987), finish_wide_item (35920), finish_wide_gear (35957).
//
// Shared state written: 'armour_defined', 'accessories_defined', 'items_defined': the section IDs each reading loaded
// (items: 105-127, 448-511 and wide items 1024-9999). The limits reader refuses a limit_item that is in 'items_defined'.
// (Kernel overrides) a section [256] to [287] (armour) or [288] to [319] (accessories) changes that game piece: read
// with the keys of a new one (base and give_on_load refused), not put in the *_defined sets.
// Not forecast (the game decides): "<kind> file not read: the <kind> table could not be moved" and the item table not
// moved (then 448-511 are refused); a wide definition refused for want of memory.
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, hex_digit } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind } from '../py.js';
import * as gc from './gearcommon.js';

export const ARMOUR = 0;
export const ACCESSORY = 1;
export const ITEM = 2;
export const FILES = Object.freeze(['FF7_SpellExt_Armour.ini', 'FF7_SpellExt_Accessories.ini', 'FF7_SpellExt_Items.ini']);
export const KINDS = Object.freeze([   // what, first_id, count, record_size, base_id, base_count
  ['armour', 384, 32, 0x24, 0x100, 32],
  ['accessory', 416, 32, 0x10, 0x120, 32],
  ['item', 105, 23, 0x1c, 0, 105],
]);
export const SHARED_KEY = Object.freeze(['armour_defined', 'accessories_defined', 'items_defined']);

export const NUMBERS = Object.freeze([
  [ARMOUR, 'defense'], [ARMOUR, 'defence'], [ARMOUR, 'magic_defense'], [ARMOUR, 'magic_defence'],
  [ARMOUR, 'evade'], [ARMOUR, 'magic_evade'], [ITEM, 'animation'], [ITEM, 'damage_formula'],
  [ITEM, 'strength'], [ITEM, 'status_chance']]);
export const ELEMENT_EFFECT_NAMES = Object.freeze([['absorb', 0], ['nullify', 1], ['halve', 2], ['none', 0xff]]);
export const ACCESSORY_SPECIAL_NAMES = Object.freeze([['haste', 0], ['berserk', 1], ['curse', 2], ['reflect', 3],
                                                      ['steal', 4], ['manipulate', 5], ['wall', 6], ['none', 0xff]]);
export const GROWTH_NAMES = Object.freeze([['none', 0], ['normal', 1], ['double', 2], ['triple', 3]]);

// new_item_slot, with the item table taken as moved (item_table_live).
export function new_item_slot(ident) {
  if (105 <= ident && ident < 128) return ident - 105;
  if (448 <= ident && ident < 512) return ident - 448 + 23;
  return -1;
}

export function parse_named(s, p, end, names, limit) {
  if (gc.table_value(s, p, end, names) !== null) return true;
  const [ok, q, n] = parse_number(s, p, end);
  return ok && q === end && n <= limit;
}

export function parse_gear_bonus(s, p, end, count) {
  let used = 0;
  while (true) {
    let w = next_word(s, p, end);
    if (w === null) return null;
    let we;
    [p, we] = w;
    if (word_is(s, p, we, 'none') && !used) {
      p = we;
      continue;
    }
    if (gc.table_value(s, p, we, gc.BONUS_NAMES) === null || used === count) {
      return count === 4 ? 'bonus must be up to four pairs like: strength 10 magic 5'
        : 'bonus must be up to two pairs like: strength 10 magic 5';
    }
    p = we;
    w = next_word(s, p, end);
    if (w === null) return 'each bonus needs an amount from 0 to 255';
    [p, we] = w;
    let ok;
    let n;
    [ok, p, n] = parse_number(s, p, we);
    if (!ok || p !== we || n > 255) return 'each bonus needs an amount from 0 to 255';
    used += 1;
    p = we;
  }
}

export class Draft {
  constructor(ident, line) {
    this.id = ident;
    this.line = line;
    this.base = -1;
  }
}

export function apply_gear_key(d, kind, s, key, key_end, value, end, shared) {
  let p = value;
  let ok;
  let n;
  if (kind !== ITEM && gc.is_kernel_gear_item(kind + 1, d.id)) {
    // (kernel overrides) a section of one of the game's own pieces: two keys of a new one do not apply
    if (word_is(s, key, key_end, 'base')) {
      return kind === ARMOUR ? "base is not used in a section of one of the game's own armour ([256] to [287]): the section changes that armour itself, and every key it does not give keeps the kernel's value. The line is not read"
        : "base is not used in a section of one of the game's own accessories ([288] to [319]): the section changes that accessory itself, and every key it does not give keeps the kernel's value. The line is not read";
    }
    if (word_is(s, key, key_end, 'give_on_load')) {
      return kind === ARMOUR ? "give_on_load is for the armour file's new armour; one of the game's own ([256] to [287]) is not given by it. The line is not read"
        : "give_on_load is for the accessory file's new accessories; one of the game's own ([288] to [319]) is not given by it. The line is not read";
    }
  }
  for (const [k, name] of NUMBERS) {
    if (k === kind && word_is(s, key, key_end, name)) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 255) return 'expected a number from 0 to 255';
      return null;
    }
  }
  const base_id = KINDS[kind][4];
  const base_count = KINDS[kind][5];
  if (word_is(s, key, key_end, 'name')) {
    if (end - value > 31) return 'a name has at most 31 characters';
  } else if (word_is(s, key, key_end, 'description')) {
    // nothing
  } else if (word_is(s, key, key_end, 'base')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end) return 'base must be a number';
    if (n >= base_id && base_id) n -= base_id;
    if (n >= base_count) {
      return kind === ARMOUR ? 'base must be one of the game\'s armour: 0 to 31, or its item ID 256 to 287'
        : kind === ACCESSORY ? 'base must be one of the game\'s accessories: 0 to 31, or its item ID 288 to 319'
          : 'base must be one of the game\'s items: 0 to 104';
    }
    d.base = n;
  } else if (word_is(s, key, key_end, 'price')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > 0x7fffffff) return 'price must be a number';
  } else if (word_is(s, key, key_end, 'sell') || word_is(s, key, key_end, 'give_on_load')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (kind !== ITEM && word_is(s, key, key_end, 'equip')) {
    if (gc.parse_equip(s, value, end, shared) === null) {
      return 'equip must be a list of character names or IDs (0 to 11, and 12 to 43 for the character file\'s), or everyone, none, or a mask as 0x....';
    }
  } else if (word_is(s, key, key_end, 'element')) {
    if (gc.parse_flags(s, value, end, gc.ELEMENT_FLAGS, 0xffff) === null) return 'unknown element name';
  } else if (kind !== ITEM && word_is(s, key, key_end, 'element_effect')) {
    if (!parse_named(s, value, end, ELEMENT_EFFECT_NAMES, 2)) return 'element_effect must be absorb, nullify, halve or none';
  } else if (kind !== ITEM && word_is(s, key, key_end, 'bonus')) {
    return parse_gear_bonus(s, p, end, kind === ARMOUR ? 4 : 2);
  } else if (kind === ARMOUR && word_is(s, key, key_end, 'growth')) {
    if (!parse_named(s, value, end, GROWTH_NAMES, 3)) return 'growth must be none, normal, double or triple';
  } else if (kind === ARMOUR && word_is(s, key, key_end, 'slots')) {
    return gc.slots_check(s, value, end, 'armour has at most 8 slots');
  } else if (kind === ARMOUR && word_is(s, key, key_end, 'status_defense')) {
    if (!word_is(s, value, end, 'none')) {
      n = gc.parse_flags(s, value, end, gc.STATUS_FLAGS, 0xffffffff);
      if (n === null || !n || (n & (n - 1))) return 'armour protects against one status: its name, or none';
    }
  } else if (kind === ACCESSORY && word_is(s, key, key_end, 'status_defense')) {
    if (gc.parse_flags(s, value, end, gc.STATUS_FLAGS, 0xffffffff) === null) return 'unknown status name';
  } else if (kind === ACCESSORY && word_is(s, key, key_end, 'special')) {
    if (!parse_named(s, value, end, ACCESSORY_SPECIAL_NAMES, 255)) {
      return 'special must be haste, berserk, curse, reflect, steal, manipulate, wall or none';
    }
  } else if (kind === ITEM && word_is(s, key, key_end, 'target')) {
    if (gc.parse_flags(s, value, end, gc.TARGET_FLAGS, 0xff) === null) return 'unknown target word';
  } else if (kind === ITEM && word_is(s, key, key_end, 'status')) {
    if (gc.parse_flags(s, value, end, gc.STATUS_FLAGS, 0xffffffff) === null) return 'unknown status name';
  } else if (kind === ITEM && word_is(s, key, key_end, 'battle')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (kind === ITEM && (word_is(s, key, key_end, 'menu_hp') || word_is(s, key, key_end, 'menu_mp'))) {
    if (!word_is(s, value, end, 'all')) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 10000) return 'expected an amount from 0 to 9999, or all';
    }
  } else if (gc.raw_key(s, key, key_end)) {
    const size = gc.raw_key(s, key, key_end);
    const digits = key + 5;
    if (key_end - digits !== 2 || hex_digit(s[digits]) < 0 || hex_digit(s[digits + 1]) < 0) {
      return 'raw keys look like byte_04 or word_0e (two hex digits)';
    }
    const offset = hex_digit(s[digits]) * 16 + hex_digit(s[digits + 1]);
    if (offset + size > KINDS[kind][3]) return 'that offset is past the end of the record';
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > (size === 1 ? 0xff : 0xffff)) return 'the value does not fit';
  } else {
    return 'unknown key';
  }
  return null;
}

export function finish_gear(r, kind, d, used) {
  if (d === null) return 0;
  const what = KINDS[kind][0];
  if (kind !== ITEM && gc.is_kernel_gear_item(kind + 1, d.id)) {
    used.kernel.add(d.id);        // (kernel overrides) finish_kernel_gear: that game piece's own entry
    return 1;
  }
  if (d.base < 0) {
    r.log(d.line, '%s file line %d: %s %d has no base; skipped', what, d.line, what, d.id);
    return 0;
  }
  // the game decides: the wide definitions' "*** wide ... is NOT defined: no memory ..." lines
  if (kind !== ITEM && d.id >= gc.WIDE_GEAR_FIRST) used.wide.add(d.id);
  else if (kind === ITEM && d.id >= gc.ITEM_COUNT_EXTENDED) used.wide.add(d.id);
  else used.fixed.add(d.id);     // the draft's name is "?" at least: names[n][0] != 0xff from now on
  return 1;
}

export function section_kind_for(kind) {
  const first = KINDS[kind][1];
  const count = KINDS[kind][2];
  return function section_kind(header) {
    const ident = gc.section_number(header, 0, header.length);
    if (ident === null) return null;
    if (kind === ITEM) {
      if (new_item_slot(ident) >= 0) return 'item';
      if (gc.WIDE_ITEM_FIRST <= ident && ident <= gc.WIDE_ITEM_LAST) return 'wide_item';
      return null;
    }
    if (first <= ident && ident < first + count) return KINDS[kind][0];
    if (gc.is_kernel_gear_item(kind + 1, ident)) return 'game_' + KINDS[kind][0];
    if (gc.gear_wide_kind(ident) === kind + 1) return 'wide_' + KINDS[kind][0];
    return null;
  };
}

export function make_check(kind) {
  const what = KINDS[kind][0];
  const first = KINDS[kind][1];
  const count = KINDS[kind][2];
  const bad_header = [
    'a section must be a new armour\'s item ID in brackets: [384] to [415]. The section is not read',
    'a section must be a new accessory\'s item ID in brackets: [416] to [447]. The section is not read',
    'a section must be a new item\'s ID in brackets: [105] to [127] or [448] to [511], or a wide item\'s: [1024] to [9999]. The section is not read',
  ][kind];

  return function check(r) {
    const s = r.text;
    const used = { fixed: new Set(), wide: new Set(), kernel: new Set() };
    let d = null;
    for (const ln of lines(s)) {
      const start = ln.start;
      const stop = ln.stop;
      const n = ln.number;
      let problem = null;
      if (start === stop) continue;
      if (s[start] === '[') {
        finish_gear(r, kind, d, used);
        d = null;
        const ident = gc.section_number(s, start, stop);
        if (kind === ITEM && ident !== null && ident >= gc.ITEM_COUNT_EXTENDED) {
          if (ident < gc.WIDE_ITEM_FIRST || ident > gc.WIDE_ITEM_LAST) {
            problem = gc.section_refusal(3, ident, used.fixed.size, r.shared);
          } else if (used.wide.has(ident)) {
            problem = gc.SECTION_USED;
          } else {
            d = new Draft(ident, n);
          }
        } else if (kind !== ITEM && gc.gear_wide_sections(r.shared) && ident !== null &&
                   gc.WIDE_GEAR_FIRST <= ident && ident <= gc.WIDE_GEAR_LAST) {
          if (gc.gear_wide_kind(ident) !== kind + 1) {
            problem = gc.section_refusal(kind + 1, ident, used.fixed.size, r.shared);
          } else if (used.wide.has(ident)) {
            problem = gc.SECTION_USED;
          } else {
            d = new Draft(ident, n);
          }
        } else if (kind !== ITEM && gc.is_kernel_gear_item(kind + 1, ident)) {
          // (kernel overrides) that game piece's own entry (the file is read only with its table moved)
          if (used.kernel.has(ident)) problem = gc.SECTION_USED;
          else d = new Draft(ident, n);
        } else if (ident === null || (kind === ITEM ? new_item_slot(ident) < 0 : !(first <= ident && ident < first + count))) {
          problem = ident !== null ? gc.section_refusal(kind + 1, ident, used.fixed.size, r.shared) : bad_header;
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
          problem = apply_gear_key(d, kind, s, ks, ke, vs, ve, r.shared);
        }
      }
      if (problem) r.log(n, '%s file line %d: %s', what, n, problem);
    }
    finish_gear(r, kind, d, used);
    r.shared.set(SHARED_KEY[kind], new Set([...used.fixed, ...used.wide]));
  };
}

for (const k of [ARMOUR, ACCESSORY, ITEM]) register(FILES[k], make_check(k), 70 + k, section_kind_for(k));
