// What the weapon, armour, accessory, item and materia readers share (spellext.c): port of sxcfg/rules/gearcommon.py.
//
// the flag tables (9739-9768), parse_flags (9890), slot_word and slots_problem (1804-1830), equip_flags (35123),
// new_character_by_name (35141), parse_equip (35203), parse_kernel_weapon (35270), gear_wide_sections (28556, from
// the game file's `box` key), wide_items_on (the game file's `wide_items` key, read the same way), ci_file_problem and
// ci_take (the custom icons, 9580-9660), section_refusal (35514) and section_used.
// No module registers here: the readers are weapons.js, gear.js and materia.js.
import { lines, trim, parse_number, word_is, next_word, split_key } from '../grammar.js';
import { cfmt } from '../cfmt.js';
import { pyFind, pyLower, shl } from '../py.js';

export const NEW_CHARACTER_FIRST_ID = 12;
export const ROSTER_MAX = 32;
export const WIDE_ITEM_FIRST = 1024;
export const WIDE_ITEM_LAST = 9999;
export const WIDE_GEAR_FIRST = 10000;
export const WIDE_GEAR_LAST = 27999;
export const GEAR_WIDE_BAND = 6000;
export const ITEM_COUNT_EXTENDED = 512;

export const ELEMENT_FLAGS = Object.freeze([
  ['fire', 0x0001], ['ice', 0x0002], ['lightning', 0x0004], ['bolt', 0x0004],
  ['earth', 0x0008], ['poison', 0x0010], ['gravity', 0x0020], ['water', 0x0040],
  ['wind', 0x0080], ['holy', 0x0100], ['restorative', 0x0200], ['cut', 0x0400],
  ['hit', 0x0800], ['punch', 0x1000], ['shoot', 0x2000], ['shout', 0x4000],
  ['hidden', 0x8000],
]);
export const STATUS_FLAGS = Object.freeze([
  ['death', 0x00000001], ['near_death', 0x00000002], ['sleep', 0x00000004],
  ['poison', 0x00000008], ['sadness', 0x00000010], ['fury', 0x00000020],
  ['confusion', 0x00000040], ['confu', 0x00000040], ['confuse', 0x00000040], ['silence', 0x00000080],
  ['haste', 0x00000100], ['slow', 0x00000200], ['stop', 0x00000400],
  ['frog', 0x00000800], ['small', 0x00001000], ['slow_numb', 0x00002000],
  ['petrify', 0x00004000], ['regen', 0x00008000], ['barrier', 0x00010000],
  ['mbarrier', 0x00020000], ['reflect', 0x00040000], ['dual', 0x00080000],
  ['shield', 0x00100000], ['death_sentence', 0x00200000], ['manipulate', 0x00400000],
  ['berserk', 0x00800000], ['peerless', 0x01000000], ['paralysis', 0x02000000],
  ['darkness', 0x04000000], ['dual_drain', 0x08000000], ['death_force', 0x10000000],
  ['resist', 0x20000000], ['lucky_girl', 0x40000000], ['imprisoned', 0x80000000],
]);
export const TARGET_FLAGS = Object.freeze([
  ['selectable', 0x01], ['enemy', 0x02], ['multiple', 0x04], ['toggle', 0x08],
  ['one_row', 0x10], ['short_range', 0x20], ['all_rows', 0x40], ['random', 0x80],
]);
export const EQUIP_FLAGS = Object.freeze([
  ['cloud', 0x0001], ['barret', 0x0002], ['tifa', 0x0004], ['aeris', 0x0008], ['aerith', 0x0008],
  ['red', 0x0010], ['redxiii', 0x0010], ['yuffie', 0x0020], ['caitsith', 0x0040],
  ['vincent', 0x0080], ['cid', 0x0100], ['youngcloud', 0x0200], ['sephiroth', 0x0400],
  ['everyone', 0x01ff],
]);
export const BONUS_NAMES = Object.freeze([['strength', 0], ['vitality', 1], ['magic', 2], ['spirit', 3],
                                          ['dexterity', 4], ['luck', 5]]);

export function table_value(s, a, b, table) {
  for (const [name, value] of table) {
    if (word_is(s, a, b, name)) return value;
  }
  return null;
}

// parse_flags: returns the mask, or null on a mistake.
export function parse_flags(s, p, end, table, limit) {
  let mask = 0;
  while (true) {
    const w = next_word(s, p, end);
    if (w === null) return mask;
    let we;
    [p, we] = w;
    const v = table_value(s, p, we, table);
    if (v !== null) {
      mask = (mask | v) >>> 0;
    } else if (word_is(s, p, we, 'none')) {
      // nothing
    } else {
      const [ok, q, number] = parse_number(s, p, we);
      if (ok && q === we && number <= limit) mask = (mask | number) >>> 0;
      else return null;
    }
    p = we;
  }
}

export const SLOTS_PROBLEM = 'slots must be a list of: pair, single, chain3 to chain8, none (add _nogrowth for slots that give no AP)';

// slot_word: [first, count] or null.
export function slot_word(s, p, we) {
  if (word_is(s, p, we, 'pair')) return [6, 2];
  if (word_is(s, p, we, 'single')) return [5, 1];
  if (word_is(s, p, we, 'pair_nogrowth')) return [2, 2];
  if (word_is(s, p, we, 'single_nogrowth')) return [1, 1];
  if (word_is(s, p, we, 'none')) return [0, 0];
  for (let i = 0; i < 6; i++) {
    if (word_is(s, p, we, 'chain' + (i + 3))) return [6, i + 3];
    if (word_is(s, p, we, 'chain' + (i + 3) + '_nogrowth')) return [2, i + 3];
  }
  return null;
}

// The `slots` loop of apply_weapon_key / apply_gear_key: the problem or null.
export function slots_check(s, value, end, too_many) {
  let p = value;
  let slot = 0;
  while (true) {
    const w = next_word(s, p, end);
    if (w === null) return null;
    let we;
    [p, we] = w;
    const sw = slot_word(s, p, we);
    if (sw === null) return SLOTS_PROBLEM;
    if (slot + sw[1] > 8) return too_many;
    slot += sw[1];
    p = we;
  }
}

// new_character_by_name's scan of FF7_SpellExt_Characters.ini: Map {id: name (at most 31 chars)}.
export function character_names(shared) {
  if (shared.has('_character_names')) return shared.get('_character_names');
  const names = new Map();
  const texts = shared.get('texts') || new Map();
  let text = null;
  for (const [k, v] of texts) {
    if (pyLower(k) === 'ff7_spellext_characters.ini') text = v;
  }
  const seen = new Set();
  let ident = -1;
  if (text !== null && text !== undefined) {
    const s = text;
    for (const ln of lines(s)) {
      const start = ln.start;
      const stop = ln.stop;
      if (start === stop) continue;
      if (s[start] === '[') {
        ident = -1;
        const [ok, q, n] = parse_number(s, start + 1, stop);
        if (ok && q + 1 === stop && s[q] === ']' && NEW_CHARACTER_FIRST_ID <= n &&
            n < NEW_CHARACTER_FIRST_ID + ROSTER_MAX && !seen.has(n)) {
          seen.add(n);
          ident = n;
        }
        continue;
      }
      let equals = pyFind(s, '=', start, stop);
      if (equals < 0) equals = stop;
      if (ident < 0 || equals === stop) continue;
      const [ks, ke] = trim(s, start, equals);
      const [vs, ve] = trim(s, equals + 1, stop);
      if (word_is(s, ks, ke, 'name')) {
        // names[id][i] = value[i], names[id][i + 1] = 0 for i < 31: the later line overwrites from the start
        names.set(ident, s.slice(vs, Math.min(ve, vs + 31)));
      }
    }
  }
  shared.set('_character_names', names);
  return names;
}

export function new_character_by_name(s, p, we, shared) {
  const names = character_names(shared);
  const word = s.slice(p, we);
  for (let ident = 0; ident < NEW_CHARACTER_FIRST_ID + ROSTER_MAX; ident++) {
    const name = names.has(ident) ? names.get(ident) : '';
    let i = 0;
    while (i < word.length && i < name.length && (word.charCodeAt(i) | 0x20) === (name.charCodeAt(i) | 0x20)) i += 1;
    if (i && i === word.length && i === name.length) return ident;
  }
  return -1;
}

// parse_equip: [mask, roster] or null.
export function parse_equip(s, p, end, shared) {
  let mask = 0;
  let roster = 0;
  while (true) {
    const w = next_word(s, p, end);
    if (w === null) return [mask, roster];
    let we;
    [p, we] = w;
    const hex_ = we - p > 2 && s[p] === '0' && (s.charCodeAt(p + 1) | 0x20) === 0x78;
    const v = table_value(s, p, we, EQUIP_FLAGS);
    if (v !== null) {
      mask = (mask | v) >>> 0;
    } else if (word_is(s, p, we, 'none')) {
      // nothing
    } else {
      const i = new_character_by_name(s, p, we, shared);
      if (i >= 0) {
        if (i < NEW_CHARACTER_FIRST_ID) mask = (mask | shl(1, i)) >>> 0;
        else roster = (roster | shl(1, i - NEW_CHARACTER_FIRST_ID)) >>> 0;
      } else {
        const [ok, q, number] = parse_number(s, p, we);
        if (!ok || q !== we) return null;
        if (hex_) {
          if (number > 0xffff) return null;
          mask = (mask | (number & ((1 << NEW_CHARACTER_FIRST_ID) - 1))) >>> 0;
          roster = (roster | (number >>> NEW_CHARACTER_FIRST_ID)) >>> 0;
        } else if (number < NEW_CHARACTER_FIRST_ID) {
          mask = (mask | shl(1, number)) >>> 0;
        } else if (number < NEW_CHARACTER_FIRST_ID + ROSTER_MAX) {
          roster = (roster | shl(1, number - NEW_CHARACTER_FIRST_ID)) >>> 0;
        } else {
          return null;
        }
      }
    }
    p = we;
  }
}

export function parse_kernel_weapon(s, p, end) {
  const [ok, q, n] = parse_number(s, p, end);
  if (!ok || q !== end || n > 255) return null;
  return n >= 0x80 ? n - 0x80 : n;
}

export function gear_wide_kind(n) {
  return (n < WIDE_GEAR_FIRST || n > WIDE_GEAR_LAST) ? -1 : Math.floor((n - WIDE_GEAR_FIRST) / GEAR_WIDE_BAND);
}

// gear_wide_sections(): box_wanted[BOX_KEY_ON] != 0, i.e. box = on or auto at the game file's first reading (default
// auto: a game file with no box line, or no game file, reads the wide sections). The validator takes the game file as
// it is now: a change of `box` only counts after a restart.
export function gear_wide_sections(shared) {
  if (shared.has('_gear_wide_sections')) return shared.get('_gear_wide_sections');
  let on = true;
  const texts = shared.get('texts') || new Map();
  for (const [k, s] of texts) {
    if (pyLower(k) !== 'ff7_spellext_game.ini' || s === null || s === undefined) continue;
    for (const ln of lines(s)) {
      const start = ln.start;
      const stop = ln.stop;
      if (start === stop || s[start] === '[') continue;
      const [ks, ke, vs, ve] = split_key(s, start, stop);
      if (word_is(s, ks, ke, 'box')) {
        if (word_is(s, vs, ve, 'auto') || word_is(s, vs, ve, 'on')) on = true;
        else if (word_is(s, vs, ve, 'off')) on = false;
      }
    }
  }
  shared.set('_gear_wide_sections', on);
  return on;
}

// wide_items_mode == WIDE_ON: the game file's `wide_items` is on. No game file, no line, or a line that is not off,
// shadow or on (the DLL refuses it and keeps what it had): not on. Read as gear_wide_sections reads `box` (the last good
// line wins); the game file as it is now: a change only counts after a restart.
export function wide_items_on(shared) {
  if (shared.has('_wide_items_on')) return shared.get('_wide_items_on');
  let on = false;
  const texts = shared.get('texts') || new Map();
  for (const [k, s] of texts) {
    if (pyLower(k) !== 'ff7_spellext_game.ini' || s === null || s === undefined) continue;
    for (const ln of lines(s)) {
      const start = ln.start;
      const stop = ln.stop;
      if (start === stop || s[start] === '[') continue;
      const [ks, ke, vs, ve] = split_key(s, start, stop);
      if (word_is(s, ks, ke, 'wide_items')) {
        if (word_is(s, vs, ve, 'on')) on = true;
        else if (word_is(s, vs, ve, 'off') || word_is(s, vs, ve, 'shadow')) on = false;
      }
    }
  }
  shared.set('_wide_items_on', on);
  return on;
}

// (custom icons) `icon = file:NAME.png` or file:NAME.tex: ci_file_problem, ci_take and ci_fail of spellext.c
export const CI_FILE_ROOM = 64;
export const CI_FILES_MAX = 1024;
export const ICON_BAD_PREFIX = 'icon takes file:NAME.png or file:NAME.tex, a picture in SpellExtConfig\\files\\icons (sub-folders may be given: file:potions/blue.png). The line is not read';
export const ICON_TOO_LONG = "the icon file's name is too long: at most 63 characters with its folders. The line is not read";
export const ICON_NO_NAME = 'the icon file needs a name and the ending .png or .tex. The line is not read';
export const ICON_BAD_CHAR = "the icon file's name has a character a file name cannot have here (: * ? \" < > | ~). The line is not read";
export const ICON_BAD_FOLDER = "the icon file's folders must be inside SpellExtConfig\\files\\icons (no empty folder name, no .., no leading /). The line is not read";
export const ICON_BAD_ENDING = 'the icon file must be a .png or a .tex. The line is not read';
export const ICON_NO_STEM = 'the icon file needs a name before .png or .tex. The line is not read';
export const FMT_ICON_NOT_USED = "%s file line %d: icon = file:%s is not used: %d different icon files are named already: the game's icon is shown";
export const FMT_ICON_MISSING = "custom icon file:%s: %s: %s: the game's icon is shown";
export const ICON_WORDS = 'icon must be sword, glove, gunarm, headdress, staff, spear, shuriken, megaphone, gun, armour, accessory, item, or a kernel weapon (or file:NAME.png or file:NAME.tex, a picture of your own)';

// The weapon reader's test that an icon value is a file (the first five characters are file:, any case).
export function icon_is_file(s, value, end) {
  if (end - value < 5) return false;
  for (let i = 0; i < 4; i++) if ((s.charCodeAt(value + i) | 0x20) !== 'file'.charCodeAt(i)) return false;
  return s[value + 4] === ':';
}

// ci_file_problem(value, end, out): [null, NAME with '\' between folders], or [why the line is not read, null].
export function ci_file_problem(s, value, end) {
  let p = value;
  for (const c of 'file:') {
    if (p >= end || (s.charCodeAt(p) | 0x20) !== c.charCodeAt(0)) return [ICON_BAD_PREFIX, null];
    p += 1;
  }
  while (p < end && (s[p] === ' ' || s[p] === '\t')) p += 1;
  if (end - p >= CI_FILE_ROOM) return [ICON_TOO_LONG, null];
  if (end - p < 5) return [ICON_NO_NAME, null];
  const name = [];
  let part = 0;
  while (p < end) {
    const c = s[p] === '/' ? '\\' : s[p];
    const o = c.charCodeAt(0);
    if (o < 0x20 || o > 0x7e || ':*?"<>|~'.includes(c)) return [ICON_BAD_CHAR, null];
    if (c === '\\') {
      if (!part || (part === 2 && name[name.length - 1] === '.' && name[name.length - 2] === '.')) return [ICON_BAD_FOLDER, null];
      part = 0;
    } else {
      part += 1;
    }
    name.push(c);
    p += 1;
  }
  const full = name.join('');
  const ending = pyLower(full.slice(-4));
  if (ending !== '.png' && ending !== '.tex') return [ICON_BAD_ENDING, null];
  if (part < 5) return [ICON_NO_STEM, null];
  return [null, full];
}

// ci_take (and, for the file, the first draw's ci_fail): a finished section names `icon` ('' for none). Nothing to say
// when the file is there. When shared has 'icon_files' (the Set of the files under SpellExtConfig/files/icons, lower
// case, '\\' between folders) and 'icon_dir' (that folder's path), a file that is not in it is a WARNING with the DLL's
// own words, once per file (the DLL says it when the icon is first drawn, not when the file is read: no line number
// there; the icon line's is used). More than CI_FILES_MAX different files: the DLL's refusal.
export function ci_take(r, icon, what, line) {
  if (!icon) return;
  const shared = r.shared;
  if (!shared.has('_icon_files')) shared.set('_icon_files', []);
  if (!shared.has('_icon_told')) shared.set('_icon_told', new Set());
  const names = shared.get('_icon_files');
  const low = pyLower(icon);
  if (!names.includes(low)) {
    if (names.length >= CI_FILES_MAX) {
      r.log(line, FMT_ICON_NOT_USED, what, line, icon, CI_FILES_MAX);
      return;
    }
    names.push(low);
  }
  const have = shared.get('icon_files');
  const told = shared.get('_icon_told');
  if (have !== undefined && have !== null && !told.has(low)) {
    told.add(low);
    if (!have.has(low)) {
      const folder = shared.has('icon_dir') ? shared.get('icon_dir') : '';
      const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
      r.log_with({ kind: 'warning' }, line, FMT_ICON_MISSING, icon, folder + sep + icon.split('\\').join(sep), 'no such file');
    }
  }
}

export const SECTION_USED = 'this item ID is already used: an earlier section of this file has it. The section is not read';

// (kernel overrides) a section numbered for one of the game's own pieces changes THAT kernel entry: kind 0 weapon
// ([128] to [255]), 1 armour ([256] to [287]), 2 accessory ([288] to [319]); is_kernel_gear_item in spellext.c
export const KERNEL_GEAR_RANGE = Object.freeze([[128, 255], [256, 287], [288, 319]]);

export function is_kernel_gear_item(kind, ident) {
  return kind >= 0 && kind < 3 && ident !== null && ident !== undefined
    && KERNEL_GEAR_RANGE[kind][0] <= ident && ident <= KERNEL_GEAR_RANGE[kind][1];
}

export const _K = Object.freeze([
  ['weapon', 'a weapon', 'weapons', 'are', 'them', '[320] to [383]', 128, 255, 10000, 15999],
  ['armour', 'an armour', 'armour', 'is', 'it', '[384] to [415]', 256, 287, 16000, 21999],
  ['accessory', 'an accessory', 'accessories', 'are', 'them', '[416] to [447]', 288, 319, 22000, 27999],
  ['item', 'an item', 'items', 'are', 'them', '[105] to [127] and [448] to [511]', 0, 104, 1024, 9999],
]);
const _NEW_SPAN = ['320 to 383 are weapon numbers', '384 to 415 are armour numbers', '416 to 447 are accessory numbers',
                   '105 to 127 and 448 to 511 are item numbers'];
// the fixed new numbers of each kind (the room section_refusal counts); items: the item table is taken as moved
// (item_table_live), so 87: the game decides otherwise, and the log's start says so
export const ROOM = [64, 32, 32, 87];

// section_refusal's wsprintfA formats, verbatim (they are the `returned` strings of the schema)
export const FMT_FULL = ' (all %d are used)';
export const FMT_MORE = 'new %s %s %s%s; for more %s, number %s from %d ([%d] to [%d], with %s in the game file%s)';
export const FMT_WIDE_OFF = '[%lu] is a wide %s number: wide %s ([%d] to [%d]) %s read only with box = on or auto in the game file (with wide_items = on), and box is off. The section is not read';
export const FMT_GAME = "[%lu] is a game %s's number (the game's %s %s %d to %d): a new section cannot reuse it, and the game's own cannot be changed from this file (a new one may copy it: base = %lu); %s. The section is not read";
export const FMT_NEW_UNUSABLE = "[%lu] is a new %s's number, but it cannot be used in this run (the %s table was not moved: see the start of the log); %s. The section is not read";
export const FMT_SPAN_GAME = "%d to %d are the game's %s";
export const FMT_SPAN_WIDE = '%d to %d belong in the %s file';
export const FMT_OTHER = "[%lu] is a %s %s number (%s), not %s's: %s. The section is not read";
export const FMT_GAP = "[%lu]: numbers 512 to 1023 are never used (a gap: the game's own arithmetic makes values there); %s. The section is not read";
export const FMT_NONE = '[%lu]: numbers from 28000 are not given to anything; %s. The section is not read';

// section_refusal(kind, id): kind 0 weapon, 1 armour, 2 accessory, 3 item. `used_count`: the fixed new numbers of
// this kind the file has taken so far in this reading.
export function section_refusal(kind, ident, used_count, shared) {
  const k = _K;
  let owner = -1;
  let band = -1;
  if (ident <= 104) { owner = 3; band = 0; }
  else if (ident <= 127) { owner = 3; band = 1; }
  else if (ident <= 255) { owner = 0; band = 0; }
  else if (ident <= 287) { owner = 1; band = 0; }
  else if (ident <= 319) { owner = 2; band = 0; }
  else if (ident <= 383) { owner = 0; band = 1; }
  else if (ident <= 415) { owner = 1; band = 1; }
  else if (ident <= 447) { owner = 2; band = 1; }
  else if (ident <= 511) { owner = 3; band = 1; }
  else if (WIDE_ITEM_FIRST <= ident && ident <= WIDE_ITEM_LAST) { owner = 3; band = 2; }
  else if (WIDE_GEAR_FIRST <= ident && ident <= WIDE_GEAR_LAST) { owner = gear_wide_kind(ident); band = 2; }
  const room = ROOM[kind];
  const full = used_count >= room ? cfmt(FMT_FULL, room) : '';
  const gws = gear_wide_sections(shared);
  const kk = k[kind];
  const more = cfmt(FMT_MORE, kk[2], kk[3], kk[5], full, kk[2], kk[4], kk[8], kk[8], kk[9],
                    kind === 3 ? 'wide_items = on' : 'box = on or auto and wide_items = on',
                    kind < 3 && !gws ? '; box is off now' : '');
  if (band === 2 && owner === kind && kind < 3 && !gws) {
    return cfmt(FMT_WIDE_OFF, ident, kk[0], kk[2], kk[8], kk[9], kk[3]);
  }
  if (band === 0 && owner === kind) return cfmt(FMT_GAME, ident, kk[0], kk[2], kk[3], kk[6], kk[7], ident, more);
  if (band === 1 && owner === kind) {
    // the game decides: only when the kind's table was not moved at start-up (not forecast from the files)
    return cfmt(FMT_NEW_UNUSABLE, ident, kk[0], kk[0], more);
  }
  if (owner >= 0) {
    const ko = k[owner];
    let span;
    if (band === 0) span = cfmt(FMT_SPAN_GAME, ko[6], ko[7], ko[2]);
    else if (band === 1) span = _NEW_SPAN[owner];
    else span = cfmt(FMT_SPAN_WIDE, ko[8], ko[9], ko[0]);
    return cfmt(FMT_OTHER, ident, band === 0 ? 'game' : band === 1 ? 'new' : 'wide', ko[0], span, kk[1], more);
  }
  if (ITEM_COUNT_EXTENDED <= ident && ident < WIDE_ITEM_FIRST) return cfmt(FMT_GAP, ident, more);
  return cfmt(FMT_NONE, ident, more);
}

// The readers' header test: parse_number(&p, stop, &id) && p + 1 == stop && *p == ']'. The ID or null.
export function section_number(s, start, stop) {
  const [ok, p, ident] = parse_number(s, start + 1, stop);
  if (ok && p + 1 === stop && s[p] === ']') return ident;
  return null;
}

// The weapon/gear readers' `key_end - key > 5 && (byte_ || word_)` test: the size, or 0.
export function raw_key(s, key, key_end) {
  if (key_end - key > 5 && (word_is(s, key, key + 5, 'byte_') || word_is(s, key, key + 5, 'word_'))) {
    return (s.charCodeAt(key) | 0x20) === 0x62 ? 1 : 2;
  }
  return 0;
}
