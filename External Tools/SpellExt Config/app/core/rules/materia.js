// FF7_SpellExt_Materia.ini: port of sxcfg/rules/materia.py. load_materia (spellext.c 36534), apply_materia_key (36225),
// start_materia_draft, finish_materia (36434), materia_has_level_values (1390), and the [test] section's give_materia.
//
// Shared state read: 'spells_defined' (a Set of the extended spell IDs the spell file loaded), when the spell port
// provides it: then "materia file: materia %d lists spell %d, which is not in the spell file" is forecast. Shared state
// written: 'materia_defined' = Set of the materia IDs this reading loaded.
// Not forecast (the game decides): what comes from a `base` kernel materia's record (its type byte, which decides
// "already used" and the "magic or command materia" line when no kind/type/byte_0d is given); a spell granted by more
// than 4 materia (needs the spell file's own `materia =` links); the per-materia record lines.
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, hex_digit } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind, pyIn } from '../py.js';
import * as gc from './gearcommon.js';

export const FILE = 'FF7_SpellExt_Materia.ini';
export const MATERIA_COUNT_ORIGINAL = 96;
export const MATERIA_COUNT_EXTENDED = 256;
export const NEW_MATERIA_FIRST = 96;
export const MATERIA_RECORD_SIZE = 20;
export const MATERIA_GAME_LEVELS = 5;
export const MATERIA_MAX_LEVELS = 20;
export const MATERIA_MORE_LEVELS = MATERIA_MAX_LEVELS - MATERIA_GAME_LEVELS;
export const MATERIA_ATTRIBUTE_COUNT = 6;
export const MATERIA_TYPE = 0x0d;
export const MAX_MATERIA_SPELLS = 24;
export const MAX_TEST_MATERIA = 16;
export const EXT_FIRST_ID = 3000;
export const EXT_LAST_ID = 65534;
export const KINDS = Object.freeze([['magic', 0x19], ['summon', 0x3b], ['command', 0x16], ['support', 0x25],
                                    ['independent', 0x20]]);

export class Draft {
  constructor(ident, line) {
    this.id = ident;
    this.line = line;
    this.base = -1;
    this.type = null;            // the type byte when a key set it
    this.spells = [];
    this.more_values = 0;
  }
}

export function has_level_values(type_byte) {
  return ![0x02, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0c].includes(type_byte & 0x0f);
}

export function apply_materia_key(d, s, key, key_end, value, end) {
  let p = value;
  let ok;
  let n;
  if (word_is(s, key, key_end, 'name') || word_is(s, key, key_end, 'description')) {
    // nothing
  } else if (word_is(s, key, key_end, 'base')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n >= MATERIA_COUNT_ORIGINAL) return 'base must be a kernel materia ID, 0 to 95';
    d.base = n;
  } else if (word_is(s, key, key_end, 'ap')) {
    let count = 0;
    let last = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      if (word_is(s, p, we, 'none') && !count) {
        p = we;
        continue;
      }
      [ok, p, n] = count === MATERIA_MAX_LEVELS - 1 ? [false, p, 0] : parse_number(s, p, we);
      if (count === MATERIA_MAX_LEVELS - 1 || !ok || p !== we || n % 100 || Math.floor(n / 100) > 0xfffe) {
        return 'ap must be up to 19 AP totals, each a multiple of 100 up to 6553400 (or none)';
      }
      if (count && n <= last) return 'ap totals must rise from one level to the next';
      last = n;
      count += 1;
      p = we;
    }
  } else if (word_is(s, key, key_end, 'equip_effect')) {
    if (!word_is(s, value, end, 'none')) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 16) return 'equip_effect must be 0 to 16, or none';
    }
  } else if (word_is(s, key, key_end, 'status')) {
    n = gc.parse_flags(s, value, end, gc.STATUS_FLAGS, 0xffffff);
    if (n === null || n > 0xffffff) return 'status must be status names from the first 24 (death to berserk), or none';
  } else if (word_is(s, key, key_end, 'element')) {
    if (!word_is(s, value, end, 'none') && gc.table_value(s, value, end, gc.ELEMENT_FLAGS) === null) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 15) return 'element must be one element name, a number 0 to 15, or none';
    }
  } else if (word_is(s, key, key_end, 'type')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > 0xff) return 'type must be a number from 0 to 255';
    d.type = n;
  } else if (word_is(s, key, key_end, 'kind')) {
    const t = gc.table_value(s, value, end, KINDS);
    if (t === null) return 'kind must be magic, summon, command, support or independent';
    d.type = t;
  } else if (word_is(s, key, key_end, 'uses')) {
    let count = 0;
    d.more_values = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      [ok, p, n] = count === MATERIA_MAX_LEVELS ? [false, p, 0] : parse_number(s, p, we);
      if (count === MATERIA_MAX_LEVELS || !ok || p !== we || n < 1 || n > 0xfe) {
        return 'uses must be up to 20 numbers from 1 to 254, one per materia level';
      }
      if (count >= MATERIA_GAME_LEVELS) d.more_values += 1;
      count += 1;
      p = we;
    }
  } else if (word_is(s, key, key_end, 'attributes')) {
    let count = 0;
    d.more_values = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      if (word_is(s, p, we, 'none') && count < MATERIA_ATTRIBUTE_COUNT) {
        p = we;
        count += 1;
        continue;
      }
      const limit = count === MATERIA_ATTRIBUTE_COUNT + MATERIA_MORE_LEVELS;
      [ok, p, n] = limit ? [false, p, 0] : parse_number(s, p, we);
      if (limit || !ok || p !== we || n > 0xff) {
        return 'attributes must be up to six numbers from 0 to 255 (or none for an unused one), then up to 15 more: the value at levels 6 to 20';
      }
      if (count >= MATERIA_ATTRIBUTE_COUNT) d.more_values += 1;
      count += 1;
      p = we;
    }
  } else if (word_is(s, key, key_end, 'kernel_spells')) {
    let count = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      if (word_is(s, p, we, 'none')) {
        p = we;
        count += 1;
        continue;
      }
      [ok, p, n] = count === 5 ? [false, p, 0] : parse_number(s, p, we);
      if (count === 5 || !ok || p !== we || n > 0xfe) {
        return 'kernel_spells must be up to five kernel spell IDs (0 to 254) or none, one per level';
      }
      count += 1;
      p = we;
    }
  } else if (word_is(s, key, key_end, 'spells')) {
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let we;
      [p, we] = w;
      let level = 1;
      if (word_is(s, p, we, 'none')) {
        p = we;
        continue;
      }
      [ok, p, n] = parse_number(s, p, we);
      if (!ok || n < EXT_FIRST_ID || n > EXT_LAST_ID) {
        return 'spells must be extended spell IDs (3000 to 65534), each optionally followed by :level';
      }
      if (p < we && s[p] === ':') {
        p += 1;
        [ok, p, level] = parse_number(s, p, we);
        if (!ok || level < 1 || level > MATERIA_MAX_LEVELS) return 'a materia level must be from 1 to 20';
      }
      if (p !== we) return 'spells must be extended spell IDs (3000 to 65534), each optionally followed by :level';
      if (d.spells.length === MAX_MATERIA_SPELLS) {
        return 'too many spells for one materia on this line; link the rest from the spell file';
      }
      d.spells.push(n);
      p = we;
    }
  } else if (word_is(s, key, key_end, 'price')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > 0x7fffffff) return 'price must be a number (1 means it cannot be sold)';
  } else if (word_is(s, key, key_end, 'give_on_load')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (key_end - key === 7 && word_is(s, key, key + 5, 'byte_')) {
    if (hex_digit(s[key + 5]) < 0 || hex_digit(s[key + 6]) < 0) return 'raw keys look like byte_0d (two hex digits)';
    const offset = hex_digit(s[key + 5]) * 16 + hex_digit(s[key + 6]);
    if (offset >= MATERIA_RECORD_SIZE) return 'that offset is past the end of the 20-byte materia record';
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n > 0xff) return 'the value does not fit in a byte';
    if (offset === MATERIA_TYPE) d.type = n;
  } else {
    return 'unknown key';
  }
  return null;
}

export function finish_materia(r, d, used) {
  if (d === null) return 0;
  if (d.base < 0 && d.type === null) {
    r.log(d.line, 'materia file line %d: materia %d has neither kind (or type) nor base; skipped', d.line, d.id);
    return 0;
  }
  if (d.type !== null) {
    if (d.more_values && !has_level_values(d.type)) {
      r.log(d.line, 'materia file line %d: materia %d is a magic or command materia, which has a spell or command per level, not a value: the entries past the game\'s own are ignored (use spells = ID:level for levels past 5)', d.line, d.id);
    }
    if (d.type !== 0xff) used.add(d.id);
  } else {
    used.add(d.id);      // the game decides: the base's type byte (no kernel materia has ff there)
  }
  let spells = r.shared.has('spells_defined') ? r.shared.get('spells_defined') : null;
  if (spells === null && r.shared.has('spells_loaded')) {     // the spells port's list of the IDs it loaded
    spells = new Set(r.shared.get('spells_loaded'));
  }
  if (spells !== null) {
    for (const sp of d.spells) {
      if (!pyIn(sp, spells)) r.log(d.line, 'materia file: materia %d lists spell %d, which is not in the spell file', d.id, sp);
    }
  }
  if (!r.shared.has('_materia_loaded')) r.shared.set('_materia_loaded', new Set());
  r.shared.get('_materia_loaded').add(d.id);
  return 1;
}

export function section_kind(header) {
  const s = header;
  if (s.length >= 2 && word_is(s, 1, s.length - 1, 'test') && s[s.length - 1] === ']') return 'test';
  const ident = gc.section_number(s, 0, s.length);
  if (ident === null || ident < NEW_MATERIA_FIRST || ident > MATERIA_COUNT_EXTENDED - 2) return null;
  return 'materia';
}

export function check(r) {
  const s = r.text;
  r.shared.set('_materia_loaded', new Set());
  const used = new Set();
  let d = null;
  let in_test = false;
  let test_count = 0;
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    let problem = null;
    if (start === stop) continue;
    if (s[start] === '[') {
      finish_materia(r, d, used);
      d = null;
      in_test = word_is(s, start + 1, stop - 1, 'test') && s[stop - 1] === ']';
      if (!in_test) {
        const ident = gc.section_number(s, start, stop);
        if (ident === null) problem = 'a section must be a materia ID in brackets, like [96], or [test]';
        else if (ident < NEW_MATERIA_FIRST || ident > MATERIA_COUNT_EXTENDED - 2) problem = 'new materia IDs must be from 96 to 254';
        else if (used.has(ident)) problem = 'this materia ID is already used';
        else d = new Draft(ident, n);
      }
    } else if (in_test) {
      let equals = pyFind(s, '=', start, stop);
      if (equals < 0) equals = stop;
      const [ks, ke] = trim(s, start, equals);
      let value = equals + 1;
      if (equals === stop || !word_is(s, ks, ke, 'give_materia')) {
        problem = 'the [test] section takes: give_materia = ID, ID:AP, ID:master ...';
      } else {
        while (!problem) {
          const w = next_word(s, value, stop);
          if (w === null) break;
          let we;
          [value, we] = w;
          let ok;
          let ident;
          [ok, value, ident] = parse_number(s, value, we);
          if (!ok || ident > 0xfe) {
            problem = 'give_materia takes materia IDs from 0 to 254';
          } else if (value < we && s[value] === ':') {
            value += 1;
            if (word_is(s, value, we, 'master')) {
              value = we;
            } else {
              let ap;
              [ok, value, ap] = parse_number(s, value, we);
              if (!ok || ap > 0xfffffe) problem = 'after the colon give an AP total, or master';
            }
          }
          if (!problem && value !== we) problem = 'give_materia entries look like 31, 31:5000 or 31:master';
          else if (!problem && test_count === MAX_TEST_MATERIA) problem = 'too many give_materia entries';
          else if (!problem) test_count += 1;
          value = we;
        }
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
        problem = apply_materia_key(d, s, ks, ke, vs, ve);
      }
    }
    if (problem) r.log(n, 'materia file line %d: %s', n, problem);
  }
  finish_materia(r, d, used);
  const loaded = r.shared.get('_materia_loaded');
  r.shared.delete('_materia_loaded');
  r.shared.set('materia_defined', loaded);
}

register(FILE, check, 50, section_kind);
