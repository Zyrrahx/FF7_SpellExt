// FF7_SpellExt_Enemies.ini (the registry of enemy folders and scene files): port of sxcfg/rules/enemies.py.
// en_registry_parse (spellext.c 48261) with en_map_entry (48168), en_reg_attack_section (48218), en_reg_attack_key
// (48230), enemies_models_entry (10980), en_whole (48151), en_word (48142), en_space (46501), en_name_ok (46856),
// enemies_folder_name_ok (10937), enemies_part_is (10906); called by enemies_read_registry (49149) at start-up
// (enemies_start) and at "Re-init .ini files" (enemies_reread), and only when the game file said enemies = on at
// start-up (enemies_keys_settle).
//
// This file has its OWN line rule, not the main files' (grammar.js): the comment starts at ; or # at the start of the
// line or after any of en_space's characters (space, tab, CR, LF, VT, FF, 0x1c-0x1f), not only space, tab and CR; the
// line is trimmed by the same set; a UTF-8 byte-order mark at the start is skipped. Lines end at LF only (a CR is a
// space), so the line numbers are the main files'. The scene and enemy files (scenes\, enemies\<folder>\) follow a
// third rule again (en_parse): enemyscan.js.
//
// Reads r.shared 'texts' for FF7_SpellExt_Game.ini: whether enemies = on (the last enemies line; a mistake is off, as
// enemies_key_line leaves it). With enemies off the DLL does not read this file: the port says so in the tool's words.
// Shared state written: 'enemies_registry' Map {enemies_all, enemies_load, scenes_all, scenes_load} (what the start-up
// scan, enemyscan.js, registers by), only when the file is read.
//
// Not forecast (runtime_only): the [models] lines of enemies_read_registry (the folder's model\aa served or MISSING, a
// path too long) and the summary line (its count is the problems this port reports).
import { lines, trim } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind, pyLower } from '../py.js';
import * as game_rules from './game.js';

export const FILE = 'FF7_SpellExt_Enemies.ini';
export const GAME_FILE = 'FF7_SpellExt_Game.ini';
export const EN_NAME_MAX = 31;
export const EN_LOAD_MAX = 512;
export const EN_MAP_MAX = 256;
export const EN_REG_ATTACKS_MAX = 256;
export const EN_BATTLE_FIRST = 256 * 4;
export const EN_BATTLE_LAST = 4095 * 4 + 3;
export const ENEMIES_POOL_FIRST = 365;
export const ENEMIES_POOL_COUNT = 5;
export const ENEMIES_NAME_MAX = 31;
export const NO_FILE = 'enemies: no %s: every enemy folder and scene file is registered, no battle of the game is mapped, no pool ' +
  'model is assigned for the run';
export const NOT_READ = 'not read by the DLL: the game file does not say enemies = on, and this file is read only then (the switch ' +
  'is read at start-up)';

// Python's str.strip() and split(), for ASCII (the C's char is signed: a byte of 0x80 and up is no space)
export function en_space(c) {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\x0b' || c === '\x0c' || (c >= '\x1c' && c <= '\x1f');
}

export function en_lower(c) {
  return c >= 'A' && c <= 'Z' ? String.fromCharCode(c.charCodeAt(0) + 0x20) : c;
}

// [start, end) is `word`, any case
export function en_word(s, start, end, word) {
  let i = 0;
  const n = word.length;
  while (start < end && i < n) {
    if (en_lower(s[start]) !== word[i]) return false;
    start += 1;
    i += 1;
  }
  return start === end && i === n;
}

export function en_hex(c) {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  c = en_lower(c);
  return c >= 'a' && c <= 'f' ? c.charCodeAt(0) - 97 + 10 : -1;
}

// A whole number (decimal or 0x) of [start, end): [ok, value]. 8 hex digits or 9 decimal ones at most.
export function en_whole(s, start, end) {
  let v = 0;
  let digits = 0;
  if (end - start > 2 && s[start] === '0' && (s.charCodeAt(start + 1) | 0x20) === 0x78) {
    start += 2;
    while (start < end && en_hex(s[start]) >= 0 && digits < 8) {
      v = v * 16 + en_hex(s[start]);
      start += 1;
      digits += 1;
    }
  } else {
    while (start < end && s[start] >= '0' && s[start] <= '9' && digits < 9) {
      v = v * 10 + (s.charCodeAt(start) - 48);
      start += 1;
      digits += 1;
    }
  }
  return [digits > 0 && start === end, v];
}

// A folder or scene file name: 1-31 letters, digits, _ and -
export function en_name_ok(s, start, end) {
  if (end - start < 1 || end - start > EN_NAME_MAX) return false;
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-')) return false;
  }
  return true;
}

// en_copy(out, capacity, start, length): at most capacity - 1 characters; %s of it stops at a NUL
export function en_copy(s, start, length, capacity) {
  return s.slice(start, start + Math.min(length, capacity - 1)).split('\0')[0];
}

export function enemies_part_is(s, start, end, word) {
  let i = 0;
  const n = word.length;
  while (start < end && i < n) {
    const c = s[start];
    if (((c >= 'A' && c <= 'Z') ? String.fromCharCode(c.charCodeAt(0) + 0x20) : c) !== word[i]) return false;
    start += 1;
    i += 1;
  }
  return start === end && i === n;
}

export function enemies_folder_name_ok(s, start, end) {
  if (end <= start || end - start > ENEMIES_NAME_MAX) return false;
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '-')) return false;
  }
  return true;
}

// One [battle_map] line "where : the game's battle = the DLL battle": [fault or null, [where, field, from, to]]
export function en_map_entry(s, key, key_end, value, stop) {
  let colon = key;
  while (colon < key_end && s[colon] !== ':') colon += 1;
  if (colon === key_end) {
    return ['a map line is WHERE : BATTLE = DLL BATTLE (field 123 : 268 = 1200, world : 140 = 1204, any : 16 = 1004)', null];
  }
  let w = key;
  while (w < colon && en_space(s[w])) w += 1;
  let we = w;
  while (we < colon && !en_space(s[we])) we += 1;
  let n = we;
  while (n < colon && en_space(s[n])) n += 1;
  let ne = colon;
  while (ne > n && en_space(s[ne - 1])) ne -= 1;
  let where;
  let field;
  if (en_word(s, w, we, 'field')) {
    const [ok, number] = en_whole(s, n, ne);
    if (!ok || number > 0xffff) return ['field takes the field\'s number (field 123 : ...)', null];
    where = 1;
    field = number;
  } else if (en_word(s, w, we, 'world') || en_word(s, w, we, 'any')) {
    if (n !== ne) return ['world and any take no number', null];
    where = en_word(s, w, we, 'world') ? 2 : 0;
    field = 0;
  } else {
    return ['where is field N, world or any', null];
  }
  n = colon + 1;
  while (n < key_end && en_space(s[n])) n += 1;
  let [ok, number] = en_whole(s, n, key_end);
  if (!ok || number > 0xffff) return ['the game\'s battle number (before =) is a number 0 to 65535', null];
  const battle_from = number;
  [ok, number] = en_whole(s, value, stop);
  if (!ok || number < EN_BATTLE_FIRST || number > EN_BATTLE_LAST) {
    return ['the DLL battle (after =) is a number 1024 to 16383 (scene x 4 + formation)', null];
  }
  return [null, [where, field, battle_from, number]];
}

// One line of [models]: [1, index, folder] ("" for none), or [-1, fault, null]
export function enemies_models_entry(s, key, key_end, value, stop) {
  let c = key;
  let number = 0;
  let digits = 0;
  if (key_end - c > 2 && s[c] === '0' && (s.charCodeAt(c + 1) | 0x20) === 0x78) {
    c += 2;
    while (c < key_end && digits < 8) {
      const ch = s[c];
      const o = s.charCodeAt(c) | 0x20;
      const d = (ch >= '0' && ch <= '9') ? s.charCodeAt(c) - 48
        : (o >= 97 && o <= 102 && s.charCodeAt(c) < 0x80 ? o - 97 + 10 : -1);
      if (d < 0) break;
      number = number * 16 + d;
      c += 1;
      digits += 1;
    }
  } else {
    while (c < key_end && s[c] >= '0' && s[c] <= '9' && digits < 9) {
      number = number * 10 + (s.charCodeAt(c) - 48);
      c += 1;
      digits += 1;
    }
  }
  if (!digits || c !== key_end || number < ENEMIES_POOL_FIRST || number >= ENEMIES_POOL_FIRST + ENEMIES_POOL_COUNT) {
    return [-1, 'the key must be a model number of the pool, 365 to 369', null];
  }
  if (enemies_part_is(s, value, stop, 'none') || enemies_part_is(s, value, stop, 'off')) {
    return [1, number - ENEMIES_POOL_FIRST, ''];
  }
  if (!enemies_folder_name_ok(s, value, stop)) {
    return [-1, 'the value must be a folder name of SpellExtConfig\\enemies (1 to 31 letters, digits, _ or -), ' +
      'or none', null];
  }
  return [1, number - ENEMIES_POOL_FIRST, s.slice(value, stop)];
}

// A section's name [inner, inner_end): [1, id] "attack N" with N an attack ID (00-7f, 0100-7fff); [-1, id] "attack"
// and something else; [0, 0] not an attack section
export function en_reg_attack_section(s, inner, inner_end) {
  let n = inner + 6;
  if (inner_end - inner < 7 || !en_word(s, inner, n, 'attack') || !en_space(s[n])) return [0, 0];
  while (n < inner_end && en_space(s[n])) n += 1;
  const [ok, ident] = en_whole(s, n, inner_end);
  return [ok && (ident <= 0x7f || (ident >= 0x100 && ident <= 0x7fff)) ? 1 : -1, ident];
}

export const ATTACK_KEYS = ['effect', 'effect_all', 'camera', 'camera_multi', 'script'];
const ATTACK_LOW = [0x100, 0x100, 0, 0, 3];
const ATTACK_HIGH = [0xffff, 0xffff, 0xfffe, 0xfffe, 0x3f];

// One key of an [attack N] section into A (a Map): null, or what is wrong (the line is skipped)
export function en_reg_attack_key(s, key, key_end, value, stop, A) {
  let i = 0;
  while (i < 5 && !en_word(s, key, key_end, ATTACK_KEYS[i])) i += 1;
  if (i === 5) return 'an [attack N] section\'s keys are effect, effect_all, camera, camera_multi and script';
  if (A.get('given') & (1 << i)) return 'the key is given twice in the section (the first is kept)';
  const [ok, n] = en_whole(s, value, stop);
  if (!ok || n < ATTACK_LOW[i] || n > ATTACK_HIGH[i]) {
    return i < 2 ? 'effect and effect_all are SpellExt effects, 0x100 to 0xffff'
      : i < 4 ? 'a camera is a number, 0 to 0xfffe'
        : 'script is a model script, 3 to 0x3f (0 and 1 are idle loops, 2 the death)';
  }
  A.set('given', A.get('given') | (1 << i));
  A.set(ATTACK_KEYS[i], n);
  return null;
}

export function comment_stop(s, start, end) {
  let stop = start;
  while (stop < end) {
    if ((s[stop] === ';' || s[stop] === '#') && (stop === start || en_space(s[stop - 1]))) break;
    stop += 1;
  }
  return stop;
}

// The whole file; each problem logged as the DLL says it. Returns the registry (a Map).
export function en_registry_parse(r, text) {
  const s = text;
  const g = new Map([['enemies_all', true], ['scenes_all', true], ['enemies_load', []], ['scenes_load', []],
    ['maps', []], ['models', ['', '', '', '', '']], ['models_given', 0], ['problems', 0], ['lines', 0], ['attacks', []]]);
  const given = [0, 0, 0, 0, 0];
  const bump = (k) => g.set(k, g.get(k) + 1);
  let section = 0;      // 0 none, 1 enemies, 2 scenes, 3 battle_map, 4 models, 5 another, 6 attack N, 7 attack N skipped
  let line = s.startsWith('\xef\xbb\xbf') ? 3 : 0;         // a UTF-8 byte-order mark
  const file_end = s.length;
  let line_number = 0;
  while (line < file_end) {
    let end = s.indexOf('\n', line);
    if (end < 0) end = file_end;
    line_number += 1;
    const n = line_number;
    let start = line;
    let stop = comment_stop(s, start, end);
    while (start < stop && en_space(s[start])) start += 1;
    while (stop > start && en_space(s[stop - 1])) stop -= 1;
    line = end + 1;
    if (start === stop) continue;
    if (s[start] === '[') {
      let inner = start + 1;
      let close = inner;
      while (close < stop && s[close] !== ']') close += 1;
      let inner_end = close;
      while (inner < inner_end && en_space(s[inner])) inner += 1;
      while (inner_end > inner && en_space(s[inner_end - 1])) inner_end -= 1;
      section = close === stop ? 5 : en_word(s, inner, inner_end, 'enemies') ? 1 : en_word(s, inner, inner_end, 'scenes') ? 2
        : en_word(s, inner, inner_end, 'battle_map') ? 3 : en_word(s, inner, inner_end, 'models') ? 4 : 5;
      if (section === 5 && close < stop) {
        const [attack, ident] = en_reg_attack_section(s, inner, inner_end);
        const twice = attack > 0 && g.get('attacks').some(a => a.get('id') === ident);
        if (attack < 0) {
          r.log(n, "enemies: %s line %d: [attack N]: N is an attack ID, 0x00-0x7f (the kernel's) or 0x100-0x7fff (a scene's): the section is skipped", FILE, n);
          bump('problems');
          section = 7;
        } else if (twice) {
          r.log(n, 'enemies: %s line %d: [attack %04lx] is given twice: the first is kept, this one is skipped', FILE, n, ident);
          bump('problems');
          section = 7;
        } else if (attack > 0 && g.get('attacks').length === EN_REG_ATTACKS_MAX) {
          r.log(n, 'enemies: %s line %d: more than %d [attack N] sections: this one is skipped', FILE, n, EN_REG_ATTACKS_MAX);
          bump('problems');
          section = 7;
        } else if (attack > 0) {
          g.get('attacks').push(new Map([['id', ident & 0xffff], ['effect', 0], ['effect_all', 0], ['camera', 0xffff],
            ['camera_multi', 0xffff], ['script', -1], ['line', n], ['given', 0], ['bad', 0]]));
          section = 6;
        }
      }
      if (section === 5) {
        // (logged, but not counted as a problem line)
        r.log_with({ kind: 'note' }, n, "enemies: %s line %d: section %s is not one of this DLL's ([enemies] [scenes] [battle_map] [models] [attack N]): skipped", FILE, n,
          en_copy(s, start, stop - start, 64));
      }
      continue;
    }
    if (section === 0 || section === 5 || section === 7) continue;
    let equals = start;
    while (equals < stop && s[equals] !== '=') equals += 1;
    if (equals === stop) {
      r.log(n, 'enemies: %s line %d: a line here is KEY = VALUE: skipped', FILE, n);
      bump('problems');
      continue;
    }
    let key_end = equals;
    let value = equals + 1;
    while (key_end > start && en_space(s[key_end - 1])) key_end -= 1;
    while (value < stop && en_space(s[value])) value += 1;
    bump('lines');
    if (section === 1 || section === 2) {
      const which = section === 1 ? 'enemies' : 'scenes';
      if (!en_word(s, start, key_end, 'load')) {
        r.log(n, 'enemies: %s line %d: [%s] has one key, load = all, or names: skipped', FILE, n, which);
        bump('problems');
        continue;
      }
      if (en_word(s, value, stop, 'all')) {
        g.set(which + '_all', true);
        continue;
      }
      g.set(which + '_all', false);
      let w = value;
      while (w < stop) {
        while (w < stop && (en_space(s[w]) || s[w] === ',')) w += 1;
        if (w === stop) break;
        let we = w;
        while (we < stop && !en_space(s[we]) && s[we] !== ',') we += 1;
        if (!en_name_ok(s, w, we)) {
          r.log(n, 'enemies: %s line %d: "%s" is no folder or scene name (1 to 31 letters, digits, _ or -): skipped', FILE, n,
            en_copy(s, w, we - w, 48));
          bump('problems');
        } else if (g.get(which + '_load').length >= EN_LOAD_MAX) {
          r.log(n, 'enemies: %s line %d: more than %d names in load: the rest are skipped', FILE, n, EN_LOAD_MAX);
          bump('problems');
          break;
        } else {
          g.get(which + '_load').push(s.slice(w, we));
        }
        w = we;
      }
      continue;
    }
    if (section === 6) {
      const attacks = g.get('attacks');
      const A = attacks[attacks.length - 1];
      const fault = en_reg_attack_key(s, start, key_end, value, stop, A);
      if (fault) {
        r.log(n, 'enemies: %s line %d: [attack %04x]: %s: skipped', FILE, n, A.get('id'), fault);
        bump('problems');
      }
      continue;
    }
    if (section === 3) {
      const [fault, m] = en_map_entry(s, start, key_end, value, stop);
      if (fault) {
        r.log(n, 'enemies: %s line %d: %s: skipped', FILE, n, fault);
        bump('problems');
      } else if (g.get('maps').length === EN_MAP_MAX) {
        r.log(n, 'enemies: %s line %d: more than %d map lines: this one is dropped', FILE, n, EN_MAP_MAX);
        bump('problems');
      } else {
        g.get('maps').push(m);
      }
      continue;
    }
    // [models] (stage 2a's testing aid)
    const [got, a, folder] = enemies_models_entry(s, start, key_end, value, stop);
    if (got < 0) {
      r.log(n, 'enemies: %s line %d: %s: skipped', FILE, n, a);
      bump('problems');
    } else if (given[a]) {
      r.log(n, 'enemies: %s line %d: model %d is given twice: the first line is kept', FILE, n, ENEMIES_POOL_FIRST + a);
      bump('problems');
    } else {
      given[a] = 1;
      g.get('models')[a] = folder;
      if (folder) bump('models_given');
    }
  }
  for (const A of g.get('attacks')) {       // [attack N]: what needs another key
    const gv = A.get('given');
    const fault = !gv ? 'no key: nothing to do'
      : (gv & 2) && !(gv & 1) ? 'effect_all needs effect'
        : (gv & 8) && !(gv & 4) ? 'camera_multi needs camera (the camera on one target)' : null;
    if (fault) {
      A.set('bad', 1);
      r.log(A.get('line'), 'enemies: %s line %d: [attack %04x]: %s: the section is skipped', FILE, A.get('line'), A.get('id'), fault);
      bump('problems');
    }
  }
  return g;
}

// Whether the game file's reading leaves enemies on (enemies_key_line, the last line of the key; a mistake: off)
export function enemies_on(text) {
  if (text === null || text === undefined) return false;
  let on = 0;
  for (const ln of lines(text)) {
    const s = text;
    const start = ln.start;
    const stop = ln.stop;
    if (start === stop || s[start] === '[') continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    const [key, key_end] = trim(s, start, equals);
    const [value, vstop] = trim(s, equals < stop ? equals + 1 : stop, stop);
    const [answer, , asked] = game_rules.enemies_key_line(s, key, key_end, value, vstop);
    if (answer) on = asked;
  }
  return Boolean(on);
}

function registry_map(g) {
  return new Map([['enemies_all', g.get('enemies_all')], ['enemies_load', g.get('enemies_load').slice()],
    ['scenes_all', g.get('scenes_all')], ['scenes_load', g.get('scenes_load').slice()]]);
}

export function check(r) {
  const texts = r.shared.has('texts') ? r.shared.get('texts') : null;
  let game = null;
  if (texts !== null && texts !== undefined) {
    for (const [k, t] of texts) {
      if (pyLower(k) === pyLower(GAME_FILE)) { game = t; break; }
    }
  }
  if (!enemies_on(game)) {
    if (r.text !== null && r.text !== undefined) r.note(0, NOT_READ);
    return;
  }
  let g;
  if (r.text === null || r.text === undefined) {
    r.log_with({ kind: 'note' }, 0, NO_FILE, FILE);
    g = en_registry_parse(r, '');
  } else {
    g = en_registry_parse(r, r.text);
  }
  r.shared.set('enemies_registry', registry_map(g));
}

check.wants_absent = true;     // absent with enemies on: every folder and scene registered (the DLL's line)

// The kind of a section header (as en_registry_parse takes it), or null: a header without ']', another section
// (skipped with a line), an [attack N] the DLL refuses.
export function section_kind(header) {
  const s = header;
  if (!s.startsWith('[')) return null;
  const stop = s.length;
  let inner = 1;
  let close = inner;
  while (close < stop && s[close] !== ']') close += 1;
  if (close === stop) return null;
  let inner_end = close;
  while (inner < inner_end && en_space(s[inner])) inner += 1;
  while (inner_end > inner && en_space(s[inner_end - 1])) inner_end -= 1;
  for (const word of ['enemies', 'scenes', 'battle_map', 'models']) {
    if (en_word(s, inner, inner_end, word)) return word;
  }
  const [attack] = en_reg_attack_section(s, inner, inner_end);
  return attack > 0 ? 'attack' : null;
}

register(FILE, check, 26, section_kind);

// A Reading that keeps nothing (registry_of reads the lists only)
export const QUIET = { shared: new Map(), log() {}, log_with() {}, note() {} };

// What the start-up scan registers by: the load lists of the Enemies file as the DLL reads them, every folder and scene
// when the file is absent; null when the game file does not say enemies = on.
export function registry_of(game_text, enemies_text) {
  if (!enemies_on(game_text)) return null;
  return registry_map(en_registry_parse(QUIET, enemies_text !== null && enemies_text !== undefined ? enemies_text : ''));
}
