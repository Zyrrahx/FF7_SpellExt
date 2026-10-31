// FF7_SpellExt_Game.ini: port of sxcfg/rules/game.py. load_game_settings (spellext.c 37832) and its helpers
// box_key_line (6910), fields_key_line (19172) with fields_parse_signed (19145), bl_key_line (37673), test_battle_value
// (37763), wide_items_key (5201), wide_rows_key (5215), parse_yes_no (35278).
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, is_space } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind } from '../py.js';

export const FILE = 'FF7_SpellExt_Game.ini';

export const WIDE_ITEM_FIRST = 1024;
export const WIDE_ITEM_LAST = 9999;
export const WIDE_GEAR_FIRST = 10000;
export const WIDE_GEAR_LAST = 27999;
export const GEAR_WIDE_BAND = 6000;
export const ITEMS_ON_LOAD_MAX = 16;
export const TEST_DROP_MAX = 4;
export const TEST_STEAL_MAX = 8;
export const TEST_STITM_MAX = 8;
export const SHOP_COUNT = 80;
export const SHOP_BIG = 32;
export const SHOP_ADD_MAX = SHOP_COUNT * SHOP_BIG;
export const WIDE_V2_ROWS = 510, WIDE_ROWS_MAX = 3350;   // (stage 4b) the key's 510; the most rows wide_rows may ask for (spellext.c WIDE_ROWS_MAX; stage 4a: 2040)
export const DAMAGE_LIMIT_MAX = 9999999;
export const MP_DAMAGE_LIMIT_MAX = 65532;
export const BOX_BACKUP_MOST = 50;
export const FIELD_INFOS_GAME = 1200;
export const FIELDS_TABLE_MOST = 32767;
export const FIELD_BUFFER_LEAST = 4000000;
export const FIELD_BUFFER_MOST = 0x04000000;
export const FIELDS_FILE_NAME_MAX = 64;
export const FIELDS_FALLBACK_LOW = 65;
export const FIELDS_FALLBACK_HIGH = 786;
export const TEST_BATTLE_LAST = 1023;

export function wide_item_number(n) {
  return WIDE_ITEM_FIRST <= n && n <= WIDE_ITEM_LAST;
}

export function gear_wide_kind(n) {
  return (n < WIDE_GEAR_FIRST || n > WIDE_GEAR_LAST) ? -1 : Math.floor((n - WIDE_GEAR_FIRST) / GEAR_WIDE_BAND);
}

export const BOX_KEYS = Object.freeze([
  ['box', 'off', 'on', 'box must be off, on or auto'],
  ['box_access', 'save', 'always', 'box_access must be save or always'],
  ['box_backup', null, null, 'box_backup takes one number, 0 to 50 (the replaced companions with a box kept per save slot; 0: deleted as before)'],
  ['box_throwables', 'list', 'box', 'box_throwables must be list or box'],
  ['box_selftest', 'off', 'on', 'box_selftest must be off or on'],
]);

// Returns [answer, fault]: 0 not a box key, 1 taken, -1 a mistake.
export function box_key_line(s, key, key_end, value, stop) {
  let k = -1;
  for (let i = 0; i < BOX_KEYS.length; i++) {
    if (word_is(s, key, key_end, BOX_KEYS[i][0])) {
      k = i;
      break;
    }
  }
  if (k < 0) return [0, null];
  const [, no, yes, fault] = BOX_KEYS[k];
  if (k === 2) {
    const first = value;
    let n = 0;
    while (value < stop && s[value] >= '0' && s[value] <= '9' && n <= BOX_BACKUP_MOST) {
      n = n * 10 + s.charCodeAt(value) - 48;
      value += 1;
    }
    if (value === first || value !== stop || n > BOX_BACKUP_MOST) return [-1, fault];
    return [1, fault];
  }
  if (k === 0 && word_is(s, value, stop, 'auto')) return [1, fault];
  if (word_is(s, value, stop, no) || word_is(s, value, stop, yes)) return [1, fault];
  return [-1, fault];
}

// Returns [ok, new_p, value].
export function fields_parse_signed(s, p, stop) {
  let c = p;
  let minus = false;
  while (c < stop && is_space(s[c])) c += 1;
  if (c < stop && (s[c] === '-' || s[c] === '+')) {
    minus = s[c] === '-';
    c += 1;
  }
  const digits = c + ((stop - c > 2 && s[c] === '0' && (s.charCodeAt(c + 1) | 0x20) === 0x78) ? 2 : 0);
  let ok;
  let n;
  [ok, c, n] = parse_number(s, c, stop);
  if (!ok) return [false, p, 0];
  let count = 0;
  let significant = 0;
  while (digits + count < c) {
    significant += (significant || s[digits + count] !== '0') ? 1 : 0;
    count += 1;
  }
  if (count > 10 || significant > 5 || n > 0x10000) return [false, p, 0];
  while (c < stop && is_space(s[c])) c += 1;
  return [true, c, minus ? -n : n];
}

export const FAULT_FIELDS_FILE = 'fields_file takes the name of a file in the SpellExtConfig folder (like FF7_SpellExt_Fields.ini; no drive, no .., at most 64 characters), or none: the feature stays off';
export const FAULT_TABLE = 'fields_table_size takes auto, or a number of field ids from 1200 to 32767: auto is used';
export const FAULT_BUFFER = 'field_buffer_bytes takes a number of bytes from 4000000 to 67108864 (it can only raise the size): 4000000 is used';
export const FAULT_FALLBACK = 'fields_fallback takes none, or five numbers: a field of the game\'s own (an id from 65 to 786), x, y (-32768 to 32767), a walkmesh triangle (0 to 65535) and a direction (0 to 255), as 576, -57, -132, 31, 124: none is used (a save in a registered field is saved as it is, and a field id the game cannot read is not sent anywhere)';

export function fields_key_line(s, start, key_end, value, stop) {
  let p = value;
  if (word_is(s, start, key_end, 'fields_file')) {
    const length = stop - value;
    if (length === 0 || word_is(s, value, stop, 'none') || word_is(s, value, stop, 'off')) return [1, null];
    let i = 0;
    while (i < length) {
      const ch = s[value + i];
      if (ch === ':' || (ch === '.' && i + 1 < length && s[value + i + 1] === '.') || ch.charCodeAt(0) < 0x20) break;
      i += 1;
    }
    if (length > FIELDS_FILE_NAME_MAX || i < length || s[value] === '\\' || s[value] === '/') {
      return [-1, FAULT_FIELDS_FILE];
    }
    return [1, null];
  }
  if (word_is(s, start, key_end, 'fields_table_size')) {
    if (word_is(s, value, stop, 'auto')) return [1, null];
    let ok;
    let n;
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < FIELD_INFOS_GAME || n > FIELDS_TABLE_MOST) return [-1, FAULT_TABLE];
    return [1, null];
  }
  if (word_is(s, start, key_end, 'field_buffer_bytes')) {
    let ok;
    let n;
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < FIELD_BUFFER_LEAST || n > FIELD_BUFFER_MOST) return [-1, FAULT_BUFFER];
    return [1, null];
  }
  if (word_is(s, start, key_end, 'fields_fallback')) {
    if (value === stop || word_is(s, value, stop, 'none') || word_is(s, value, stop, 'off')) return [1, null];
    const v = [];
    let k = 0;
    while (k < 5) {
      if (k) {
        if (p >= stop || s[p] !== ',') break;
        p += 1;
      }
      let ok;
      let x;
      [ok, p, x] = fields_parse_signed(s, p, stop);
      if (!ok) break;
      v.push(x);
      k += 1;
    }
    if (k < 5 || p !== stop || v[0] < FIELDS_FALLBACK_LOW || v[0] > FIELDS_FALLBACK_HIGH ||
        !(-32768 <= v[1] && v[1] <= 32767) || !(-32768 <= v[2] && v[2] <= 32767) ||
        !(0 <= v[3] && v[3] <= 65535) || !(0 <= v[4] && v[4] <= 255)) {
      return [-1, FAULT_FALLBACK];
    }
    return [1, null];
  }
  return [0, null];
}

export function bl_key_line(s, start, key_end, value, stop) {
  if (word_is(s, start, key_end, 'breaking_limits')) {
    if (['on', 'yes', 'off', 'no'].some(w => word_is(s, value, stop, w))) return [1, null];
    return [-1, 'breaking_limits must be on or off: off is used'];
  }
  if (word_is(s, start, key_end, 'wide_skeletons')) {
    if (['on', 'yes', 'off', 'no', 'all'].some(w => word_is(s, value, stop, w))) return [1, null];
    return [-1, 'wide_skeletons must be on, off or all (all: a testing aid, every battle model through the wide path): off is used'];
  }
  return [0, null];
}

// Returns the battle (-1 off) or null on a mistake.
export function test_battle_value(s, value, stop) {
  if (word_is(s, value, stop, 'off') || word_is(s, value, stop, 'no')) return -1;
  let [ok, p, first] = parse_number(s, value, stop);
  if (!ok) return null;
  if (p === stop) {
    if (first > TEST_BATTLE_LAST) return null;
    return first ? first : -1;
  }
  if (s[p] !== ':') return null;
  p += 1;
  let formation;
  [ok, p, formation] = parse_number(s, p, stop);
  if (!ok || p !== stop || first > 255 || formation > 3) return null;
  return first * 4 + formation;
}

export function check(r) {
  const s = r.text;
  let shop_add_total = 0;
  for (const ln of lines(s)) {
    let start = ln.start;
    let stop = ln.stop;
    const n = ln.number;
    if (start === stop || s[start] === '[') continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    let key_end = equals;
    let value = equals < stop ? equals + 1 : stop;
    [start, key_end] = trim(s, start, key_end);
    [value, stop] = trim(s, value, stop);
    const target = word_is(s, start, key_end, 'enemy_damage_limit') ? 'hp' :
      word_is(s, start, key_end, 'enemy_mp_damage_limit') ? 'mp' : null;
    let p = value;
    let ok;
    if (word_is(s, start, key_end, 'items_on_load')) {
      let count_entries = 0;
      p = value;
      while (true) {
        const w = next_word(s, p, stop);
        if (w === null) break;
        let word_end;
        [p, word_end] = w;
        let ident;
        [ok, p, ident] = parse_number(s, p, word_end);
        let count = 1;
        let bad = !ok || (ident > 319 && !wide_item_number(ident));
        if (!bad && p < word_end) {
          if (s[p] !== ':') {
            bad = true;
          } else {
            p += 1;
            [ok, p, count] = parse_number(s, p, word_end);
            bad = !ok || count < 1 || count > 99;
          }
        }
        if (bad || p !== word_end || count_entries === ITEMS_ON_LOAD_MAX) {
          r.log(n, 'game file line %d: items_on_load takes up to 16 entries like 71:50 (item ID 0 to 319, or a wide item\'s number 1024 to 9999; count 1 to 99)', n);
          break;
        }
        count_entries += 1;
        p = word_end;
      }
    } else if (word_is(s, start, key_end, 'test_drop') || word_is(s, start, key_end, 'test_steal') ||
               word_is(s, start, key_end, 'test_stitm')) {
      const drop = word_is(s, start, key_end, 'test_drop');
      const stitm = word_is(s, start, key_end, 'test_stitm');
      const most = drop ? TEST_DROP_MAX : stitm ? TEST_STITM_MAX : TEST_STEAL_MAX;
      let got = 0;
      p = value;
      while (true) {
        const w = next_word(s, p, stop);
        if (w === null) break;
        let word_end;
        [p, word_end] = w;
        let ident;
        [ok, p, ident] = parse_number(s, p, word_end);
        let bad = !ok || (ident > 511 && !wide_item_number(ident) && gear_wide_kind(ident) < 0);
        if (!bad && (drop || stitm) && p < word_end) {
          if (s[p] !== ':') {
            bad = true;
          } else {
            p += 1;
            let count;
            [ok, p, count] = parse_number(s, p, word_end);
            bad = !ok || count < 1 || count > 99;
          }
        }
        if (bad || p !== word_end || got === most) {
          if (drop) {
            r.log(n, 'game file line %d: test_drop takes up to 4 entries like 448 or 448:2 (an item ID 0 to 511, a wide item\'s number 1024 to 9999 or wide gear\'s 10000 to 27999, count 1 to 99): the line gives nothing', n);
          } else if (stitm) {
            r.log(n, 'game file line %d: test_stitm takes up to 8 entries like 10000 or 1024:3 (an item ID 0 to 511, a wide item\'s number 1024 to 9999 or wide gear\'s 10000 to 27999; count 1 to 99, else the script\'s own): the line gives nothing', n);
          } else {
            r.log(n, 'game file line %d: test_steal takes up to 8 item IDs like 320 448 (item ID 0 to 511, a wide item\'s number 1024 to 9999 or wide gear\'s 10000 to 27999): the line gives nothing', n);
          }
          break;
        }
        got += 1;
        p = word_end;
      }
    } else if (word_is(s, start, key_end, 'shop_add')) {
      let count_entries = shop_add_total;
      p = value;
      while (true) {
        const w = next_word(s, p, stop);
        if (w === null) break;
        let word_end;
        [p, word_end] = w;
        let shop;
        [ok, p, shop] = parse_number(s, p, word_end);
        let bad = !ok || shop >= SHOP_COUNT || p >= word_end || s[p] !== ':';
        let materia = false;
        if (!bad) {
          p += 1;
          if (p < word_end && (s[p] === 'm' || s[p] === 'M')) {
            materia = true;
            p += 1;
          }
          let ident;
          [ok, p, ident] = parse_number(s, p, word_end);
          bad = !ok || (ident > (materia ? 254 : 511) && (materia || !wide_item_number(ident))) || p !== word_end;
        }
        if (bad || count_entries === SHOP_ADD_MAX) {
          r.log(n, 'game file line %d: shop_add takes entries like 37:243 (shop 0 to 79, item ID 0 to 511 or a wide item\'s number 1024 to 9999) or 37:m49 (a materia ID)', n);
          break;
        }
        count_entries += 1;
        p = word_end;
      }
      shop_add_total = count_entries;
    } else if (word_is(s, start, key_end, 'test_battle')) {
      if (test_battle_value(s, value, stop) === null) {
        r.log(n, 'game file line %d: test_battle takes a battle number 1 to 1023 (like 16), or scene:formation (like 4:0; scene 0 to 255, formation 0 to 3), or off: the line gives nothing', n);
      }
    } else if (word_is(s, start, key_end, 'seats')) {
      let v;
      [ok, p, v] = parse_number(s, value, stop);
      if (!ok || p !== stop || !(v === 2 || v === 4)) r.log(n, 'game file line %d: seats must be 2 or 4', n);
    } else if (word_is(s, start, key_end, 'field_entities')) {
      if (!['off', 'no', 'party', 'seats'].some(w => word_is(s, value, stop, w))) {
        r.log(n, 'game file line %d: field_entities must be off, party or seats', n);
      }
    } else if (word_is(s, start, key_end, 'field_model_check')) {
      if (parse_yes_no(s, value, stop) === null) r.log(n, 'game file line %d: field_model_check must be yes or no', n);
    } else if (word_is(s, start, key_end, 'wide_items')) {
      if (!['off', 'shadow', 'on'].some(w => word_is(s, value, stop, w))) {
        r.log(n, 'game file line %d: wide_items must be off, shadow or on', n);
      }
    } else if (word_is(s, start, key_end, 'wide_rows')) {
      // (stage 4a) wide_rows_key: 320, or an even number from 510 to WIDE_ROWS_MAX; at most 6 characters
      let rows;
      [ok, p, rows] = parse_number(s, value, stop);
      if (stop - value > 6 || !ok || p !== stop || !(rows === 320 || (rows >= WIDE_V2_ROWS && rows <= WIDE_ROWS_MAX && !(rows & 1)))) {
        r.log(n, 'game file line %d: wide_rows must be 320 or an even number from 510 to %d: 510 is used', n, WIDE_ROWS_MAX);
      }
    } else if (word_is(s, start, key_end, 'test_fill_rows')) {
      let rows;
      [ok, p, rows] = parse_number(s, value, stop);
      if (!ok || p !== stop || rows < 1 || rows > WIDE_ROWS_MAX) {
        r.log(n, 'game file line %d: test_fill_rows takes one number, 1 to %d (a testing aid: the rows of the item list to fill at every load)', n, WIDE_ROWS_MAX);
      }
    } else if (word_is(s, start, key_end, 'atb_follows_dexterity')) {
      if (parse_yes_no(s, value, stop) === null) r.log(n, 'game file line %d: atb_follows_dexterity must be yes or no', n);
    } else if (word_is(s, start, key_end, 'achievement_materia_view')) {
      if (parse_yes_no(s, value, stop) === null) r.log(n, 'game file line %d: achievement_materia_view must be yes or no', n);
    } else {
      let handled = false;
      for (const helper of [box_key_line, fields_key_line, bl_key_line]) {
        const [answer, fault] = helper(s, start, key_end, value, stop);
        if (answer !== 0) {
          if (answer < 0) r.log(n, 'game file line %d: %s', n, fault);
          handled = true;
          break;
        }
      }
      if (handled) continue;
      if (word_is(s, start, key_end, 'debug')) {
        if (!['true', 'yes', 'false', 'no'].some(w => word_is(s, value, stop, w))) {
          r.log(n, 'game file line %d: debug must be true or false', n);
        }
      } else if (!target) {
        r.log(n, 'game file line %d: unknown key', n);
      } else {
        let v;
        [ok, p, v] = parse_number(s, value, stop);
        if (!ok || p !== stop || v < 1) {
          r.log(n, 'game file line %d: a limit must be a number from 1 to %d', n, DAMAGE_LIMIT_MAX);
        } else {
          const most = target === 'mp' ? MP_DAMAGE_LIMIT_MAX : DAMAGE_LIMIT_MAX;
          if (v > most) r.log(n, 'game file line %d: %lu is above the most allowed; using %lu', n, v, most);
        }
      }
    }
  }
}

register(FILE, check, 20, () => 'flat');
