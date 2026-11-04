// FF7_SpellExt_Characters.ini: port of sxcfg/rules/characters.py. load_characters (spellext.c 17498),
// apply_character_key (17276), curve_from_targets (17169), character_ai_key (18144), character_portrait_key (17657 of the
// source with the game portrait); and new_character_by_name (35141), the scan of this file's names that the weapon and
// gear readers make (they read before the characters are set up).
//
// Shared state written (r.shared, a Map):
//   'characters'   Map {id: {name, base (-1 none), copy_of (number or null), line, ai_like, ai_file}} for every
//                  section the reader takes ([12]..[43], first of each ID), for the limits port (order 90).
// Exported for other ports:
//   character_names(text)            Map {id: name} as new_character_by_name reads them
//   new_character_by_name(text, w)   the ID a one-word name stands for, or -1
import { lines, trim, parse_number, word_is, next_word, parse_yes_no } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind } from '../py.js';
import { gear_wide_kind } from './gearcommon.js';

export const FILE = 'FF7_SpellExt_Characters.ini';
export const NEW_CHARACTER_FIRST_ID = 12;
export const ROSTER_MAX = 32;
export const AI_NAME_MAX = 31;
export const NEW_WEAPON_FIRST_ITEM = 192 + 0x80;
export const NEW_WEAPON_COUNT = 64;
export const BAND_FIRST_LEVEL = Object.freeze([1, 11, 21, 31, 41, 51, 61, 81, 99]);

export const MODELS = Object.freeze([
  ['cloud', 0], ['barret', 1], ['tifa', 2], ['aeris', 3], ['aerith', 3], ['red', 4],
  ['yuffie', 5], ['caitsith', 6], ['vincent', 7], ['cid', 8], ['youngcloud', 9], ['sephiroth', 10]]);
export const STATS = Object.freeze([
  ['level', 0x01], ['strength', 0x02], ['vitality', 0x03], ['magic', 0x04], ['spirit', 0x05],
  ['dexterity', 0x06], ['luck', 0x07]]);
export const GROWTH_NAMES = Object.freeze(['strength', 'vitality', 'magic', 'spirit', 'dexterity', 'luck', 'hp', 'mp']);
export const AI_NAMES = Object.freeze(['cloud', 'barret', 'tifa', 'aeris', 'red', 'yuffie', 'caitsith', 'vincent', 'cid',
                                       'youngcloud', 'sephiroth']);
export const UNKNOWN = 'unknown key';     // unknown_character_key (17259): compared by pointer in the C
// `portrait = game:NAME`: the game's own portraits, by the names battle_like takes (MODELS: the character IDs are the
// portrait numbers), by the menu archive's file names (the exe's table of twelve at 00919c18, which the DLL reads
// there and never types; checked by tools/work/game_portrait/check_portrait_tables.py), or by number 0-11
export const PORTRAIT_FILES = Object.freeze(['cloud', 'barre', 'tifa', 'earith', 'red', 'yufi', 'ketc', 'bins', 'cido', 'pcloud',
                                             'pcefi', 'choco']);
export const GAME_PORTRAITS = 12;
export const PORTRAIT_LENGTH = 'portrait must be a file name of 1 to 12 characters, without extension';
export const PORTRAIT_LETTERS = 'portrait may only use letters, digits and _';
export const PORTRAIT_GAME = 'portrait = game:NAME must name a character as battle_like does (cloud ... cid, youngcloud, sephiroth), ' +
                             "one of the menu archive's own portrait files, or a number 0 to 11";
export const WIDE_KEYS = Object.freeze(['weapon', 'armour', 'accessory']);
export const WIDE_INSTEAD = Object.freeze(["the stand-in, the first of the game's weapons its equip_like character can wear",
                                           'the stand-in, armour 256', 'the stand-in, no accessory']);
export const WIDE_INSTEAD_NONE = 'the stand-in, the first weapon it may equip (equip_like = none)';   // a weapon's, with equip_like = none so far
const WIDE_DEFINED = Object.freeze(['weapons_defined', 'armour_defined', 'accessories_defined']);   // what the gear ports (order 60, 70, 71) loaded
export const WIDE_FORECAST = 'character file line %d: %s %d is a wide %s that no gear file defines now (with box = off their sections ' +
                             'are not read): until it is defined the character is created wearing %s';

// character_wide_key: a wide number on a sheet is a wish; the line below is logged by check().
function _wide_key(c, kind, n) {
  c.wide_key = [kind, n];
}

// The wide numbers of a kind the gear files define now; null when this file is read alone (not known).
function _wide_defined(r, kind) {
  if (r.shared.has(WIDE_DEFINED[kind])) return r.shared.get(WIDE_DEFINED[kind]);
  return r.shared.has('texts') ? new Set() : null;
}

// models[i == 4 ? 5 : i > 4 ? i + 1 : i].name: the nine, without the second spelling of Aeris.
function _nine(i) {
  return MODELS[i === 4 ? 5 : i > 4 ? i + 1 : i][0];
}

// C integer division (truncates toward zero).
function _cdiv(a, b) {
  const q = Math.floor(Math.abs(a) / Math.abs(b));
  return (a >= 0) === (b > 0) ? q : -q;
}

export function curve_from_targets(k, value) {
  for (let band = 0; band < 8; band++) {
    const frm = BAND_FIRST_LEVEL[band];
    const span = BAND_FIRST_LEVEL[band + 1] - frm;
    const rise = value[band + 1] - value[band];
    if (rise < 0) return 'the nine values must not go down';
    let gradient;
    let base;
    if (k < 6) {
      gradient = _cdiv(rise * 100 + _cdiv(span, 2), span);
      base = value[band] - _cdiv(gradient * frm, 100);
    } else if (k === 6) {
      gradient = _cdiv(rise + _cdiv(span, 2), span);
      const t = value[band] - gradient * frm;
      base = _cdiv(t + (t < 0 ? -20 : 20), 40);
    } else {
      gradient = _cdiv(rise * 10 + _cdiv(span, 2), span);
      const t = value[band] - _cdiv(gradient * frm, 10);
      base = _cdiv(t + (t < 0 ? -1 : 1), 2);
    }
    if (gradient > 255) return 'the values rise too fast between two of the levels for the game\'s format';
    if (base < -128 || base > 127) {
      const scale = k < 6 ? 1 : k === 6 ? 40 : 2;
      base = base < 0 ? -128 : 127;
      const left = value[band] - base * scale;
      gradient = k < 6 ? _cdiv(left * 100, frm) : k === 6 ? _cdiv(left, frm) : _cdiv(left * 10, frm);
      if (gradient < 0 || gradient > 255) {
        return 'the values cannot be expressed in the game\'s format (try a gentler change between levels)';
      }
    }
  }
  return null;
}

function _is_alpha(ch) {
  const o = ch.charCodeAt(0) | 0x20;
  return o >= 97 && o <= 122;
}

const isAlnum_ = ch => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_';

export function apply_character_key(c, s, key, key_end, value, end) {
  let p = value;
  let ok;
  let n;
  for (let i = 0; i < GROWTH_NAMES.length; i++) {
    if (!word_is(s, key, key_end, GROWTH_NAMES[i])) continue;
    const target = [];
    let q = value;
    let words = 0;
    while (true) {
      const w = next_word(s, q, end);
      if (w === null) break;
      let word_end;
      [q, word_end] = w;
      if (words < 9) {
        let v;
        [ok, q, v] = parse_number(s, q, word_end);
        if (!ok || q !== word_end || v > (i === 6 ? 9999 : i === 7 ? 999 : 255)) {
          return 'expected numbers (stats up to 255, hp up to 9999, mp up to 999)';
        }
        target.push(v);
      }
      words += 1;
      q = word_end;
    }
    if (words === 9) {
      const problem = curve_from_targets(i, target);
      c.own_curve_set[i] = !problem;
      return problem;
    }
    if (words !== 1) {
      return 'give one value (the starting value) or nine (at levels 1, 11, 21, 31, 41, 51, 61, 81, 99)';
    }
    break;
  }
  if (word_is(s, key, key_end, 'exp_rate')) {
    let i = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      [ok, p, n] = i !== 8 ? parse_number(s, p, word_end) : [false, p, 0];
      if (i === 8 || !ok || p !== word_end || n > 255) return 'exp_rate takes eight numbers from 0 to 255, one per level band';
      i += 1;
      p = word_end;
    }
    if (i !== 8) return 'exp_rate takes eight numbers from 0 to 255, one per level band';
    c.own_curve_set[8] = true;
    return null;
  }
  if (word_is(s, key, key_end, 'limits')) {
    if (word_is(s, value, end, 'none')) return null;
    let i = 0;
    while (i < 9 && !word_is(s, value, end, _nine(i))) i += 1;
    if (i === 9) {
      const [ok2, p2, n2] = parse_number(s, p, end);
      if (!ok2 || p2 !== end || n2 > 8) {
        return 'limits must be none, or one of the nine: cloud barret tifa aeris red yuffie caitsith vincent cid, or 0 to 8';
      }
    }
    return null;
  }
  if (word_is(s, key, key_end, 'equip_like')) {
    if (word_is(s, value, end, 'none')) {
      c.equip_like_none = true;
      return null;
    }
    let i = 0;
    while (i < 9 && !word_is(s, value, end, _nine(i))) i += 1;
    if (i === 9) {
      const [ok2, p2, n2] = parse_number(s, p, end);
      if (!ok2 || p2 !== end || n2 > 8) {
        return 'equip_like must be none, or one of the nine: cloud barret tifa aeris red yuffie caitsith vincent cid, or 0 to 8';
      }
    }
    c.equip_like_none = false;
    return null;
  }
  p = value;
  if (word_is(s, key, key_end, 'level') && p < end && _is_alpha(s[p])) {
    const problem = 'level must be 1 to 99, or one of the nine (cloud barret tifa aeris red yuffie caitsith vincent cid) or party, optionally + or - a number';
    let name_end = p;
    while (name_end < end && _is_alpha(s[name_end])) name_end += 1;
    let i = 0;
    while (i < 9 && !word_is(s, p, name_end, _nine(i))) i += 1;
    if (i === 9 && word_is(s, p, name_end, 'aerith')) i = 3;
    if (i === 9 && !word_is(s, p, name_end, 'party')) return problem;
    p = name_end;
    while (p < end && (s[p] === ' ' || s[p] === '\t')) p += 1;
    if (p < end) {
      if (!(s[p] === '+' || s[p] === '-')) return problem;
      p += 1;
      while (p < end && (s[p] === ' ' || s[p] === '\t')) p += 1;
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 98) return problem;
    }
    return null;
  }
  for (const [name, offset] of STATS) {
    if (word_is(s, key, key_end, name)) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 255 || (offset === 1 && (n < 1 || n > 99))) {
        return offset === 1 ? 'level must be from 1 to 99' : 'expected a number from 0 to 255';
      }
      return null;
    }
  }
  if (word_is(s, key, key_end, 'battle_files')) {
    const lowA = v => { const o = s.charCodeAt(v) | 0x20; return o >= 97 && o <= 122; };
    if (end - value !== 2 || !lowA(value) || !lowA(value + 1)) {
      return 'battle_files must be two letters, the prefix of the model\'s files (for example sn for snaa, snab ...)';
    }
    return null;
  }
  if (word_is(s, key, key_end, 'body_blend')) {
    return parse_yes_no(s, value, end) === null ? 'expected yes or no' : null;
  }
  if (word_is(s, key, key_end, 'battle_like') || word_is(s, key, key_end, 'battle_model')) {
    let found = false;
    for (const [name, v] of MODELS) {
      if (word_is(s, value, end, name)) {
        n = v;
        found = true;
        break;
      }
    }
    if (!found) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n > 16) {
        return 'battle_like must be a character name (cloud ... cid, youngcloud, sephiroth) or a model number 0 to 16';
      }
    }
    c.battle_model = n;
  } else if (word_is(s, key, key_end, 'curves')) {
    let i = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      if (i === 9) return 'curves takes nine entries';
      if (!(word_end - p === 1 && s[p] === '-')) {
        [ok, p, n] = parse_number(s, p, word_end);
        if (!ok || p !== word_end || n > 63) {
          return 'each curve must be a number from 0 to 63, or - to keep the base character\'s';
        }
        c.curve_set[i] = true;
      }
      i += 1;
      p = word_end;
    }
    if (i !== 9) return 'curves takes nine entries';
  } else if (word_is(s, key, key_end, 'hp') || word_is(s, key, key_end, 'mp')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n < 1 || n > 9999) return 'expected a number from 1 to 9999';
  } else if (word_is(s, key, key_end, 'exp')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end) return 'exp must be a number';
  } else if (word_is(s, key, key_end, 'weapon')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n < 128 ||
        (n > 255 && !(NEW_WEAPON_FIRST_ITEM <= n && n < NEW_WEAPON_FIRST_ITEM + NEW_WEAPON_COUNT) && gear_wide_kind(n) !== 0)) {
      return 'weapon must be a weapon\'s item ID: 128 to 255, 320 to 383 for a new weapon, or 10000 to 15999 for a wide weapon';
    }
    if (gear_wide_kind(n) === 0) _wide_key(c, 0, n);
  } else if (word_is(s, key, key_end, 'armour') || word_is(s, key, key_end, 'armor')) {
    [ok, p, n] = parse_number(s, p, end);
    if (!ok || p !== end || n < 256 || (n > 287 && (n < 384 || n > 415) && gear_wide_kind(n) !== 1)) {
      return 'armour must be an armour item ID: 256 to 287, 384 to 415 for a new armour, or 16000 to 21999 for a wide armour';
    }
    if (gear_wide_kind(n) === 1) _wide_key(c, 1, n);
  } else if (word_is(s, key, key_end, 'weapon_materia') || word_is(s, key, key_end, 'armour_materia') ||
             word_is(s, key, key_end, 'armor_materia')) {
    let slot = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      if (slot === 8) return 'a weapon or armour has at most 8 materia slots';
      if (word_is(s, p, word_end, 'none') || word_is(s, p, word_end, '-')) {
        p = word_end;
        slot += 1;
        continue;
      }
      let ident;
      [ok, p, ident] = parse_number(s, p, word_end);
      if (!ok || ident > 0xfe) return 'materia are given by ID, 0 to 254 (or none for an empty slot)';
      if (p < word_end && s[p] === ':') {
        p += 1;
        if (word_is(s, p, word_end, 'master')) {
          p = word_end;
        } else {
          let ap;
          [ok, p, ap] = parse_number(s, p, word_end);
          if (!ok || ap > 0xfffffe) return 'after the colon give an AP total, or master';
        }
      }
      if (p !== word_end) return 'materia entries look like 49, 49:5000, 49:master or none';
      slot += 1;
      p = word_end;
    }
  } else if (word_is(s, key, key_end, 'remake_on_load')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
  } else if (word_is(s, key, key_end, 'accessory')) {
    if (!word_is(s, value, end, 'none')) {
      [ok, p, n] = parse_number(s, p, end);
      if (!ok || p !== end || n < 288 || (n > 319 && (n < 416 || n > 447) && gear_wide_kind(n) !== 2)) {
        return 'accessory must be an accessory item ID: 288 to 319, 416 to 447 for a new accessory, 22000 to 27999 for a wide accessory, or none';
      }
      if (gear_wide_kind(n) === 2) _wide_key(c, 2, n);
    }
  } else {
    return UNKNOWN;
  }
  return null;
}

export function character_ai_key(c, like, s, value, end) {
  if (c.ai_keys_here & (like ? 2 : 1)) {
    return like ? 'ai_like and ai in one section: this ai_like is ignored (the ai line before it stays)'
      : 'ai_like and ai in one section: this ai is ignored (the ai_like line before it stays)';
  }
  if (like) {
    let n = 0;
    if (!word_is(s, value, end, 'none')) {
      let i = 0;
      while (i < 11 && !word_is(s, value, end, AI_NAMES[i])) i += 1;
      if (i < 11 || word_is(s, value, end, 'aerith')) {
        n = i < 11 ? i + 1 : 4;
      } else {
        let ok;
        let p;
        [ok, p, n] = parse_number(s, value, end);
        if (!(ok && p === end && n <= 11)) {
          return 'ai_like must be cloud barret tifa aeris red yuffie caitsith vincent cid youngcloud sephiroth, an entry 0 to 11, or none';
        }
        n += 1;
      }
    }
    c.ai_like = n;            // the kernel entry + 1, 0 none (as the DLL keeps it)
    c.ai_file = '';
  } else {
    const length = end - value;
    if (!word_is(s, value, end, 'none')) {
      if (length < 1 || length > AI_NAME_MAX) {
        return 'ai must be a file name of 1 to 31 characters, without .ai (the file is SpellExtConfig\\ai\\NAME.ai), or none';
      }
      for (let i = 0; i < length; i++) {
        const ch = s[value + i];
        if (!((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '-')) {
          return 'ai may only use letters, digits, _ and -';
        }
      }
      c.ai_file = s.slice(value, end);
    } else {
      c.ai_file = '';
    }
    c.ai_like = 0;
  }
  c.ai_keys_here |= like ? 1 : 2;
  return null;
}

// game_portrait_number: the number of the game's portrait that s[start..end) names, or -1.
export function game_portrait_number(s, start, end) {
  for (const [name, v] of MODELS) {
    if (word_is(s, start, end, name)) return v;
  }
  for (let i = 0; i < PORTRAIT_FILES.length; i++) {
    if (word_is(s, start, end, PORTRAIT_FILES[i])) return i;
  }
  // at most four characters (11, 010, 0x0b): parse_number wraps at 32 bits in the C, and 4294967296 is not 0
  const [ok, p, n] = end - start <= 4 ? parse_number(s, start, end) : [false, start, 0];
  if (ok && p === end && n < GAME_PORTRAITS) return n;
  return -1;
}

// character_portrait_key: `portrait = NAME`, `game:NAME` or `file:NAME`; the problem or null. (Whether a file NAME.tex /
// NAME.png exists, which decides between a file and the game's portrait for the plain form, is the DLL's to see at
// start-up: its log says which.)
export function character_portrait_key(s, value, stop) {
  let form = 0;
  if (stop - value >= 5 && (word_is(s, value, value + 5, 'game:') || word_is(s, value, value + 5, 'file:'))) {
    form = s[value] === 'g' || s[value] === 'G' ? 1 : 2;
    value += 5;
  }
  const length = stop - value;
  if (length < 1 || length > 12) return PORTRAIT_LENGTH;
  for (let k = 0; k < length; k++) {
    if (!isAlnum_(s[value + k])) return PORTRAIT_LETTERS;
  }
  if (form === 1 && game_portrait_number(s, value, stop) < 0) return PORTRAIT_GAME;
  return null;
}

function _new_character(ident, line) {
  return { id: ident, line, base: -1, battle_model: -1, name: 'New', copy_of: null,
           own_curve_set: new Array(9).fill(false), curve_set: new Array(9).fill(false), ai_keys_here: 0, ai_file: '',
           ai_like: 0 };
}

function _copy(c) {
  const d = Object.assign({}, c);
  d.own_curve_set = c.own_curve_set.slice();
  d.curve_set = c.curve_set.slice();
  return d;
}

export function check(r) {
  const s = r.text;
  const chars = new Map();
  let current = null;
  for (const ln of lines(s)) {
    const start = ln.start;
    let stop = ln.stop;
    const n = ln.number;
    let problem = null;
    if (start === stop) continue;
    if (s[start] === '[') {
      current = null;
      const [ok, p, ident] = parse_number(s, start + 1, stop);
      if (!ok || p + 1 !== stop || s[p] !== ']' || ident < NEW_CHARACTER_FIRST_ID ||
          ident >= NEW_CHARACTER_FIRST_ID + ROSTER_MAX) {
        problem = 'a section must be a character ID in brackets: [12] to [43]';
      } else if (chars.has(ident)) {
        problem = 'this character ID is already defined';
      } else {
        current = _new_character(ident, n);
        chars.set(ident, current);
      }
    } else if (current !== null) {
      const equals = pyFind(s, '=', start, stop);
      if (equals < 0) {
        problem = 'expected key = value';
      } else {
        const [key, key_end] = trim(s, start, equals);
        let value;
        [value, stop] = trim(s, equals + 1, stop);
        let p = value;
        let ok;
        let v;
        if (word_is(s, key, key_end, 'name')) {
          current.name = s.slice(value, stop);
        } else if (word_is(s, key, key_end, 'base')) {
          [ok, p, v] = parse_number(s, p, stop);
          if (!ok || p !== stop || v > 8) problem = 'base must be one of the nine characters, 0 to 8';
          else current.base = v;
        } else if (word_is(s, key, key_end, 'party_slot')) {
          [ok, p, v] = parse_number(s, p, stop);
          if (!ok || p !== stop || v > 3) problem = 'party_slot must be 1, 2 or 3 (or 0 for none)';
        } else if (word_is(s, key, key_end, 'keep_seat')) {
          if (parse_yes_no(s, value, stop) === null) problem = 'expected yes or no';
        } else if (word_is(s, key, key_end, 'copy_of')) {
          [ok, p, v] = parse_number(s, p, stop);
          const frm = ok && p === stop && chars.has(v) ? chars.get(v) : null;
          if (frm === null || frm === current) {
            problem = 'copy_of must be the ID of a character defined earlier in this file';
          } else {
            const own_id = current.id;
            const own_line = current.line;
            const d = _copy(frm);
            d.id = own_id;
            d.line = own_line;
            d.copy_of = v;
            d.ai_keys_here = 0;
            for (const k of Object.keys(current)) delete current[k];
            Object.assign(current, d);
          }
        } else {
          problem = apply_character_key(current, s, key, key_end, value, stop);
          const wide = current.wide_key;
          delete current.wide_key;
          if (problem === null && wide !== undefined) {
            const defined = _wide_defined(r, wide[0]);
            if (defined !== null && !defined.has(wide[1])) {
              const instead = wide[0] === 0 && current.equip_like_none === true ? WIDE_INSTEAD_NONE : WIDE_INSTEAD[wide[0]];
              r.log_with({ kind: 'note' }, n, WIDE_FORECAST, n, WIDE_KEYS[wide[0]], wide[1], WIDE_KEYS[wide[0]], instead);
            }
          }
          if (problem !== UNKNOWN) {
            // the key was one of apply_character_key's
          } else if (word_is(s, key, key_end, 'portrait')) {
            problem = character_portrait_key(s, value, stop);
          } else if (word_is(s, key, key_end, 'field_model')) {
            problem = null;
            const length = stop - value;
            if (word_is(s, value, stop, 'none')) {
              // nothing
            } else if (length !== 4) {
              problem = 'field_model must be the four characters of a field skeleton\'s name (ABCD for ABCD.HRC), or none';
            } else {
              for (let k = 0; k < 4; k++) {
                let ch = s[value + k];
                if (ch >= 'a' && ch <= 'z') ch = ch.toUpperCase();
                if (!((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9'))) {
                  problem = 'field_model may only use letters and digits';
                  break;
                }
              }
            }
          } else if (word_is(s, key, key_end, 'ai_like') || word_is(s, key, key_end, 'ai')) {
            problem = character_ai_key(current, word_is(s, key, key_end, 'ai_like'), s, value, stop);
          } else if (word_is(s, key, key_end, 'portrait_fit')) {
            problem = null;
            if (!(word_is(s, value, stop, 'yes') || word_is(s, value, stop, 'no'))) problem = 'expected yes or no';
          } else if (word_is(s, key, key_end, 'join')) {
            problem = null;
            if (!(word_is(s, value, stop, 'load') || word_is(s, value, stop, 'script'))) {
              problem = 'join must be script (joins when a field script adds the character) or load';
            }
          } else {
            problem = 'unknown key';
          }
        }
      }
    }
    if (problem) r.log(n, 'character file line %d: %s', n, problem);
  }
  // After the file: a character without base is built from its own sheet (the DLL logs it as a note).
  for (const ident of [...chars.keys()].sort((a, b) => a - b)) {
    const c = chars.get(ident);
    if (c.base < 0) {
      const base = c.battle_model >= 0 && c.battle_model <= 8 ? c.battle_model : 0;
      let borrowed = 0;
      for (let k = 0; k < 9; k++) if (!c.own_curve_set[k] && !c.curve_set[k]) borrowed += 1;
      r.log_with({ kind: 'note' }, c.line, 'character %d has no base: built from its own sheet; %d of its 9 growth curves, and anything ' +
                 'else left out, come from character %d', ident, borrowed, base);
    }
  }
  const out = new Map();
  for (const [i, c] of chars) {
    out.set(i, { name: c.name, base: c.base, copy_of: c.copy_of, line: c.line, ai_like: c.ai_like, ai_file: c.ai_file });
  }
  r.shared.set('characters', out);
}

export function section_kind(header) {
  const s = header;
  const [ok, p, n] = parse_number(s, 1, s.length);
  if (s.startsWith('[') && ok && p + 1 === s.length && s[p] === ']' && NEW_CHARACTER_FIRST_ID <= n &&
      n < NEW_CHARACTER_FIRST_ID + ROSTER_MAX) return 'character';
  return null;
}

// new_character_by_name's scan: Map {id: name (up to 31 characters)} from the first section of each ID.
export function character_names(text) {
  const names = new Map();
  const seen = new Set();
  let ident = -1;
  if (!text) return names;
  for (const ln of lines(text)) {
    const start = ln.start;
    let stop = ln.stop;
    if (start === stop) continue;
    if (text[start] === '[') {
      ident = -1;
      const [ok, q, n] = parse_number(text, start + 1, stop);
      if (ok && q + 1 === stop && text[q] === ']' && NEW_CHARACTER_FIRST_ID <= n &&
          n < NEW_CHARACTER_FIRST_ID + ROSTER_MAX && !seen.has(n)) {
        seen.add(n);
        ident = n;
      }
      continue;
    }
    const equals = pyFind(text, '=', start, stop);
    if (ident < 0 || equals < 0) continue;
    const [key, key_end] = trim(text, start, equals);
    let value;
    [value, stop] = trim(text, equals + 1, stop);
    if (word_is(text, key, key_end, 'name')) names.set(ident, text.slice(value, stop).slice(0, 31));
  }
  return names;
}

// The ID whose name is `word` (case ignored, the whole name), or -1. `text`: the character file.
export function new_character_by_name(text, word) {
  const names = character_names(text);
  for (let ident = 0; ident < NEW_CHARACTER_FIRST_ID + ROSTER_MAX; ident++) {
    const name = names.has(ident) ? names.get(ident) : '';
    if (name && word.length === name.length) {
      let same = true;
      for (let i = 0; i < word.length; i++) {
        if ((word.charCodeAt(i) | 0x20) !== (name.charCodeAt(i) | 0x20)) {
          same = false;
          break;
        }
      }
      if (same) return ident;
    }
  }
  return -1;
}

register(FILE, check, 80, section_kind);
