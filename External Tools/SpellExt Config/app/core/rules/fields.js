// FF7_SpellExt_Fields.ini (the registry the game file's fields_file names): port of sxcfg/rules/fields.py.
// fields_read_registry (spellext.c 19278), fields_name_fault (19081), called once at start-up by fields_install (19573).
//
// Reads r.shared 'texts' for FF7_SpellExt_Game.ini: whether fields_file names this file at all, and fields_table_size
// (the DLL takes both from the game file's first reading).
// Assumes the plain game's maplist: 788 names (ids 0-787; FF7_SpellExt_Fields_README.txt). Another mod's maplist can be
// longer, and a name may already be one of the game's fields: the game decides those (override the count with
// r.shared 'maplist_count').
// Shared state written: 'fields_registered' Map {id: name}.
// Only the default file name is registered with the framework: a fields_file of another name is noted, not read.
import { lines, trim, parse_number, word_is } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind, pyLower } from '../py.js';
import * as game_rules from './game.js';

export const FILE = 'FF7_SpellExt_Fields.ini';
export const FIELDS_ID_MOST = 32766;
export const MAPLIST_COUNT_PLAIN = 788;
export const PLACEHOLDER = 'sx_none';

function ascii_lower(name) {
  let out = '';
  for (const c of name) out += (c >= 'A' && c <= 'Z') ? String.fromCharCode(c.charCodeAt(0) + 32) : c;
  return out;
}

export function fields_name_fault(name) {
  const length = name.length;
  if (length < 2 || length > 15) {
    return 'a field name is 2 to 15 characters (FFNx\'s table of the files in flevel.lgp keeps a name in 16 bytes)';
  }
  for (const c of name) {
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-')) {
      return 'a field name has only letters, digits, _ and - (FFNx\'s look-up in flevel.lgp reads no other character)';
    }
  }
  const low = ascii_lower(name);
  if (length === 7 && low === PLACEHOLDER) {
    return 'sx_none is the placeholder of the ids nobody registered: it cannot be registered';
  }
  if (length === 7 && low === 'maplist') {
    return 'maplist is flevel.lgp\'s list of the field names, not a field: it cannot be registered';
  }
  return null;
}

// [fields_file asked or '', fields_table_size asked (0 = auto)] as the game file's reading leaves them.
export function game_file_fields(text) {
  let asked_file = '';
  let table = 0;
  for (const ln of lines(text)) {
    const s = text;
    const start = ln.start;
    const stop = ln.stop;
    if (start === stop || s[start] === '[') continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    const [key, key_end] = trim(s, start, equals);
    const [value, vstop] = trim(s, equals < stop ? equals + 1 : stop, stop);
    if (word_is(s, key, key_end, 'fields_file')) {
      const [answer] = game_rules.fields_key_line(s, key, key_end, value, vstop);
      if (answer > 0 && !(value === vstop || word_is(s, value, vstop, 'none') || word_is(s, value, vstop, 'off'))) {
        asked_file = s.slice(value, vstop);
      } else {
        asked_file = '';
      }
    } else if (word_is(s, key, key_end, 'fields_table_size')) {
      const [answer] = game_rules.fields_key_line(s, key, key_end, value, vstop);
      const [ok, p, n] = parse_number(s, value, vstop);
      table = answer > 0 && ok && p === vstop ? n : 0;
    }
  }
  return [asked_file, table];
}

export function check(r) {
  const s = r.text;
  const texts = r.shared.has('texts') ? r.shared.get('texts') : null;
  let taken_name = FILE;
  let table_asked = 0;
  if (texts !== null && texts !== undefined) {
    let game = null;
    for (const [k, t] of texts) {
      if (pyLower(k) === 'ff7_spellext_game.ini') {
        game = t;
        break;
      }
    }
    let asked = '';
    if (game !== null && game !== undefined) [asked, table_asked] = game_file_fields(game);
    if (!asked) {
      r.note(0, 'not read by the DLL: the game file names no fields_file (the field registry is off)');
      return;
    }
    if (pyLower(asked) !== pyLower(FILE)) {
      r.note(0, 'not read by the DLL: the game file\'s fields_file names ' + asked);
      return;
    }
    taken_name = asked;
  }
  const game_count = r.shared.has('maplist_count') ? r.shared.get('maplist_count') : MAPLIST_COUNT_PLAIN;
  let in_fields = true;
  let problems = 0;
  const registered = new Map();     // id -> [line, name]
  const names = new Map();          // lower name -> [line, id]
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    if (start === stop) continue;
    if (s[start] === '[') {
      in_fields = word_is(s, start, stop, '[fields]');
      if (!in_fields) {
        r.log(n, 'fields file line %d: only the section [fields] is read: the lines of %s are skipped', n,
              s.slice(start, Math.min(stop, start + 39)));
      }
      continue;
    }
    if (!in_fields) continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    const [key, key_end] = trim(s, start, equals);
    const [value, vstop] = trim(s, equals < stop ? equals + 1 : stop, stop);
    const [ok, p0, ident] = parse_number(s, key, key_end);
    if (equals === stop || !ok || p0 !== key_end) {
      const p = pyFind(s, '-', key, key_end);
      if (p >= 0 && value < vstop && s[value] === '@') {
        r.log(n, 'fields file line %d: the range form (FIRST-LAST = @file) is not read by this build: one `id = name` line per field; skipped', n);
      } else {
        r.log(n, 'fields file line %d: not `id = name` (a field id, then the field\'s name): skipped', n);
      }
      problems += 1;
      continue;
    }
    if (ident < game_count) {
      r.log(n, 'fields file line %d: id %lu is one of the game\'s own (its maplist has %lu names, ids 0 to %lu): skipped',
            n, ident, game_count, game_count - 1);
      problems += 1;
      continue;
    }
    if (ident > FIELDS_ID_MOST) {
      r.log(n, 'fields file line %d: id %lu is above 32766, the highest a field id can be (the game reads ids as signed numbers, and 32767 marks an unused exit): skipped', n, ident);
      problems += 1;
      continue;
    }
    if (table_asked && ident >= table_asked) {
      r.log(n, 'fields file line %d: id %lu is not below fields_table_size = %lu: skipped', n, ident, table_asked);
      problems += 1;
      continue;
    }
    if (registered.has(ident)) {
      r.log(n, 'fields file line %d: id %lu is already registered (line %d, %s): skipped', n, ident,
            registered.get(ident)[0], registered.get(ident)[1]);
      problems += 1;
      continue;
    }
    const name = s.slice(value, vstop);
    const why = fields_name_fault(name);
    if (why) {
      r.log(n, 'fields file line %d: %s: skipped', n, why);
      problems += 1;
      continue;
    }
    const name32 = name.slice(0, 32);
    const low = ascii_lower(name32);
    // the game decides: "%s is already the name of the game's field %lu" (the maplist's names are the game's)
    if (names.has(low)) {
      const [first_line, first_id] = names.get(low);
      r.log(n, 'fields file line %d: %s is already registered (line %d, id %u; names are the same whatever their case): skipped',
            n, name32, first_line, first_id);
      problems += 1;
      continue;
    }
    registered.set(ident, [Math.min(n, 0xffff), name32]);
    names.set(low, [Math.min(n, 0xffff), ident]);
  }
  if (!registered.size) {
    r.log(0, 'fields: off: %s registers no field (%d line(s) with problems)', taken_name, problems);
  }
  const out = new Map();
  for (const [i, v] of registered) out.set(i, v[1]);
  r.shared.set('fields_registered', out);
}

export function section_kind(header) {
  return word_is(header, 0, header.length, '[fields]') ? 'fields' : null;
}

register(FILE, check, 25, section_kind);
