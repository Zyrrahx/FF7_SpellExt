// Ports of three readers of spellext.c (sha1 ffb223fe): port of sxcfg/rules/spells.py.
//
// FF7_SpellExt_SpellNames.ini   load_spell_names 13250
// FF7_SpellExt_Effects.ini      load_effect_copies 14073: sound_handles_read 13981 -> sound_file_parse 11063 (with
//                               sound_take_name 11017, nfx_int 10660, sound_say 13973), then effect_file_parse 10186
//                               (effect_take_name, effect_same_name, effect_extension; effect_problem 13596)
// FF7_SpellExt_Spells.ini       load_spells 13310 with read_spell_file 13213 (FF7_SpellExt_Spells_Test.ini appended),
//                               apply_key 12857, parse_flags 9890, finish_spell 13124, start_draft 13164,
//                               warn_reflect_with_hits 9916, apply_flag_changes 9926
//
// Shared state (Reading.shared, a Map), written by an earlier reader of the same kernel load and read by a later one:
//   'effect_copies'   Map {number: usable} for every [effect N] section the effects file defines, usable as far as the
//                     file itself decides it (the game then also checks the base's loader, the renamed names against
//                     its list and that the files exist: not forecast). The spell file's `animation = 0x100` looks
//                     the number up here (effect_copy_base).
//   'texts'           Map {file name: text} of the whole folder (set by validate.check_folder).
//
// Not forecast (the game decides; listed in the schema's runtime_only): whether an effect's loader can be copied,
// whether a renamed name is one of the base's files, whether the copy's files are found, whether a sound number's
// dword is usable in the running exe, and the summary lines (counts) each reader ends with.
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, is_space, hex_digit } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind, pyLower, PyIndexError } from '../py.js';

export const SPELL_FILE = 'FF7_SpellExt_Spells.ini';
export const SPELL_TEST_FILE = 'FF7_SpellExt_Spells_Test.ini';
export const NAMES_FILE = 'FF7_SpellExt_SpellNames.ini';
export const EFFECT_FILE = 'FF7_SpellExt_Effects.ini';

export const ATTACK_RECORD_SIZE = 28;
export const EXT_FIRST_ID = 3000;
export const EXT_LAST_ID = 65534;
export const MAX_GRANTS = 4;
export const MATERIA_MAX_LEVELS = 20;
export const MP_COST_MAX = 999;
export const EFFECT_BASE_COUNT = 0x36;
export const EFFECT_COPY_FIRST = 0x100;
export const EFFECT_COPY_LAST = 0xffff;
export const EFFECT_COPY_MAX = 256;
export const EFFECT_RENAMES_MAX = 16;
export const EFFECT_NAME_MAX = 32;
export const SOUND_HANDLE_MAX = 256;
export const SOUND_NAME_MAX = 24;
export const SOUND_GAME_LAST = 751;
export const SOUND_POOL_FIRST = 53848;
export const SOUND_POOL_LAST = 58089;

export const REC_ACCURACY = 0x00;
export const REC_IMPACT_EFFECT = 0x01;
export const REC_HURT_ACTION = 0x02;
export const REC_MP_COST = 0x04;
export const REC_IMPACT_SOUND = 0x06;
export const REC_CAMERA_SINGLE = 0x08;
export const REC_CAMERA_MULTI = 0x0a;
export const REC_TARGET_FLAGS = 0x0c;
export const REC_EFFECT = 0x0d;
export const REC_DAMAGE_FORMULA = 0x0e;
export const REC_STRENGTH = 0x0f;
export const REC_FIELD_10 = 0x10;
export const REC_STATUS_CHANGE = 0x11;
export const REC_ADDITIONAL_EFFECT = 0x12;
export const REC_ADDITIONAL_MODIFIER = 0x13;
export const REC_STATUS = 0x14;
export const REC_ELEMENT = 0x18;
export const REC_SPECIAL = 0x1a;

const isLetterDigit = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9');

// ---------------------------------------------------------------- spell names file

export function check_spell_names(r) {
  const s = r.text;
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    if (start === stop || s[start] === '[') continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    let old_start = start;
    if (equals === stop) {
      r.log(n, 'spell names file line %d: expected  ID  current name = new name', n);
      continue;
    }
    let ok;
    let ident;
    [ok, old_start, ident] = parse_number(s, old_start, equals);
    if (!ok || ident > 0xff) {
      r.log(n, 'spell names file line %d: expected  ID  current name = new name', n);
      continue;
    }
    let old_end;
    [old_start, old_end] = trim(s, old_start, equals);
    const [new_start, new_end] = trim(s, equals + 1, stop);
    if (new_start === new_end || new_end - new_start > 24 || old_end - old_start > 24) {
      r.log(n, 'spell names file line %d: a name must be 1 to 24 characters', n);
      continue;
    }
  }
}

// ---------------------------------------------------------------- effects file

// effect_take_name: the name, or null.
export function effect_take_name(s, start, end) {
  if (start >= end || end - start >= EFFECT_NAME_MAX || s[start] === '.') return null;
  for (let i = start; i < end; i++) {
    const c = s[i];
    if (!(isLetterDigit(c) || c === '_' || c === '-' || c === '.')) return null;
  }
  return s.slice(start, end);
}

// sound_take_name: [ok, what it wrote into the name]. On a bad character the C has already written the characters
// before it (with no 0 after them), so the handle's name is no longer empty: a later `name` line is then "given
// twice", and the prefix takes part in the duplicate-name check.
export function sound_take_name(s, start, end) {
  if (start >= end || end - start >= SOUND_NAME_MAX || (s[start] >= '0' && s[start] <= '9')) return [false, ''];
  for (let i = 0; i < end - start; i++) {
    const c = s[start + i];
    if (!(isLetterDigit(c) || c === '_')) return [false, s.slice(start, start + i)];
  }
  return [true, s.slice(start, end)];
}

function _lower(c) {
  return (c >= 'A' && c <= 'Z') ? String.fromCharCode(c.charCodeAt(0) + 0x20) : c;
}

export function effect_same_name(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (_lower(a[i]) !== _lower(b[i])) return false;
  }
  return true;
}

export function effect_extension(name) {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
}

// nfx_int: [ok, value].
export function nfx_int(s, p, end) {
  let negative = false;
  if (p < end && (s[p] === '-' || s[p] === '+')) {
    negative = s[p] === '-';
    p += 1;
  }
  const [ok, q, n] = parse_number(s, p, end);
  if (!ok || q !== end || n > 0x7fffff) return [false, 0];
  return [true, negative ? -n : n];
}

export function sound_file_parse(r, s) {
  const handles = [];      // objects: id, usable, line, name
  let c = null;
  const say = (n, what, kind) => {
    if (kind) r.log_with({ kind }, n, 'effects file line %d: %s%s', n, '(note) ', what);
    else r.log(n, 'effects file line %d: %s%s', n, '', what);
  };
  for (const ln of lines(s)) {
    let start = ln.start;
    let stop = ln.stop;
    const n = ln.number;
    if (start === stop) continue;
    if (s[start] === '[') {
      c = null;
      let p = start + 1;
      const w = s[stop - 1] === ']' ? next_word(s, p, stop - 1) : null;
      if (s[stop - 1] !== ']' || w === null || !word_is(s, w[0], w[1], 'sound')) continue;
      p = w[1];
      while (p < stop - 1 && is_space(s[p])) p += 1;
      let num = 0;
      let ok = false;
      let p2;
      if (stop - 1 - p <= 7) [ok, p2, num] = parse_number(s, p, stop - 1);
      if (ok) {
        p = p2;
        while (p < stop - 1 && is_space(s[p])) p += 1;
      } else {
        p = start;
      }
      if (p !== stop - 1) {
        say(n, 'a sound section is [sound NUMBER]: the number is the sound\'s file, sfx\\NUMBER.ogg, 53848 to 58089');
        continue;
      }
      if (num <= SOUND_GAME_LAST) {
        say(n, 'sounds 1-751 are the game\'s own: a script plays them by number (sound 9) without a section');
        continue;
      }
      if (num < SOUND_POOL_FIRST || num > SOUND_POOL_LAST) {
        say(n, 'a sound handle\'s number is 53848 to 58089 (where FFNx\'s one unchecked read of the game\'s sound table lands in read-only data); the log names the usable runs');
        continue;
      }
      const same = handles.filter(h => h.id === num);
      if (same.length) {
        say(n, 'this sound number is already defined above: neither section is used');
        same[0].usable = false;
        continue;
      }
      if (handles.length === SOUND_HANDLE_MAX) {
        say(n, 'too many sound handles (256 at most): the section is skipped');
        continue;
      }
      c = { id: num, usable: true, line: n, name: '' };
      handles.push(c);
      continue;
    }
    if (c === null) continue;
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    let key_end = equals;
    let value = equals < stop ? equals + 1 : stop;
    [start, key_end] = trim(s, start, key_end);
    [value, stop] = trim(s, value, stop);
    if (equals === stop) {
      say(n, 'expected key = value (a sound section has name =, channel =)');
      c.usable = false;
    } else if (word_is(s, start, key_end, 'name')) {
      if (c.name) {
        say(n, 'name is given twice');
        c.usable = false;
      } else {
        const [ok, written] = sound_take_name(s, value, stop);
        c.name = written;
        if (!ok) {
          say(n, 'a sound\'s name is 1 to 23 letters, digits and _, not starting with a digit (name = my_sound_0)');
          c.usable = false;
        }
      }
    } else if (word_is(s, start, key_end, 'channel')) {
      const [ok, v] = nfx_int(s, value, stop);
      if (!ok || v < 1 || v > 4) {
        say(n, 'channel is 1 to 4 (default 4): the channel the sound plays on, which stops what played there before');
        c.usable = false;
      }
    } else if (word_is(s, start, key_end, 'volume')) {
      say(n, 'volume is reserved for a later stage (3): ignored; the sound plays at FFNx\'s volume (the game\'s SFX slider)', 'note');
    } else {
      say(n, 'unknown key (a sound section has name = and channel =)');
      c.usable = false;
    }
  }
  for (let i = 0; i < handles.length; i++) {
    for (let k = i + 1; k < handles.length; k++) {
      const hi = handles[i];
      const hk = handles[k];
      if (hi.name && effect_same_name(hi.name, hk.name)) {
        if (hk.usable || hi.usable) {
          r.log(hk.line, 'effects file line %d: %s%s', hk.line, '', 'this sound\'s name is already the name of the one above: neither is used');
        }
        hi.usable = false;
        hk.usable = false;
      }
    }
  }
  // the game decides: "sound %u cannot be used: %s. Pick one of %s" (the number's dword in the running exe)
  return handles;
}

export function effect_file_parse(r, s) {
  const problem = (line, what) => r.log(line, 'effects file line %d: %s', line, what);
  const copies = [];
  let c = null;
  let skipping = false;
  for (const ln of lines(s)) {
    let start = ln.start;
    let stop = ln.stop;
    const n = ln.number;
    if (start === stop) continue;
    if (s[start] === '[') {
      c = null;
      skipping = false;
      let p = start + 1;
      if (s[stop - 1] === ']') {
        const w0 = next_word(s, p, stop - 1);
        if (w0 !== null && word_is(s, w0[0], w0[1], 'sound')) {
          skipping = true;
          continue;
        }
      }
      p = start + 1;
      const w = s[stop - 1] === ']' ? next_word(s, p, stop - 1) : null;
      if (s[stop - 1] !== ']' || w === null || !word_is(s, w[0], w[1], 'effect')) {
        problem(n, 'a section is [effect NUMBER], the copy\'s own number from 0x100 to 0xffff (or [sound NUMBER], a sound handle)');
        continue;
      }
      p = w[1];
      while (p < stop - 1 && is_space(s[p])) p += 1;
      let [ok, p2, num] = parse_number(s, p, stop - 1);
      if (ok) {
        p = p2;
        while (p < stop - 1 && is_space(s[p])) p += 1;
      } else {
        p = start;
        num = 0;
      }
      if (p !== stop - 1 || num < EFFECT_COPY_FIRST || num > EFFECT_COPY_LAST) {
        problem(n, 'a section is [effect NUMBER], the copy\'s own number from 0x100 to 0xffff');
        continue;
      }
      const same = copies.filter(x => x.number === num);
      if (same.length) {
        problem(n, 'this effect number is already defined above: neither section is used');
        same[0].usable = false;
        skipping = true;
        continue;
      }
      if (copies.length === EFFECT_COPY_MAX) {
        problem(n, 'too many effect sections, copies and native effects together (256 at most): the section is skipped');
        continue;
      }
      c = { number: num, base: -1, line: n, usable: true, renames: [], play: false, play_base: -1, play_base_line: 0 };
      copies.push(c);
      continue;
    }
    if (c === null) {
      if (!skipping) problem(n, 'this line is not inside an [effect NUMBER] section');
      continue;
    }
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    let key_end = equals;
    let value = equals < stop ? equals + 1 : stop;
    [start, key_end] = trim(s, start, key_end);
    [value, stop] = trim(s, value, stop);
    if (equals === stop) {
      problem(n, 'expected key = value');
      c.usable = false;
    } else if (word_is(s, start, key_end, 'copy')) {
      const [ok, p, num] = parse_number(s, value, stop);
      if (!ok || p !== stop || num >= EFFECT_BASE_COUNT) {
        problem(n, 'copy is a magic effect\'s number, 0x05 to 0x35 (enemy attacks, limits and summons are not copied yet)');
        c.usable = false;
      } else if (num <= 0x04 || num === 0x19) {
        problem(n, 'effects 0x00-0x04 and 0x19 load no files of their own: there is nothing to copy');
        c.usable = false;
      } else if (c.base >= 0 && c.base !== num) {
        problem(n, 'copy is given twice, with two different effects');
        c.usable = false;
      } else {
        c.base = num;
      }
    } else if (word_is(s, start, key_end, 'file')) {
      let colon = pyFind(s, ':', value, stop);
      if (colon < 0) colon = stop;
      if (c.renames.length === EFFECT_RENAMES_MAX) {
        problem(n, 'too many file lines in one copy (16 at most)');
        c.usable = false;
        continue;
      }
      const [fa, fe] = trim(s, value, colon);
      let to = colon + 1;
      let to_end = stop;
      if (colon < stop) [to, to_end] = trim(s, to, to_end);
      const frm = colon !== stop ? effect_take_name(s, fa, fe) : null;
      const dst = frm !== null ? effect_take_name(s, to, to_end) : null;
      if (colon === stop || frm === null || dst === null) {
        problem(n, 'file is FROM:TO, two file names of 1 to 31 characters: letters, digits, _ and - (and the dot of the extension), like FIRE00.TIM:NEWFIRE00.TIM');
        c.usable = false;
        continue;
      }
      if (!effect_same_name(effect_extension(frm), effect_extension(dst))) {
        problem(n, 'the new name must keep the extension of the one it replaces (.TIM, .SPT, .RSD): the game changes it when it asks for the file');
        c.usable = false;
        continue;
      }
      if (effect_same_name(frm, dst)) {
        problem(n, 'the new name is the old one: nothing would change');
        c.usable = false;
        continue;
      }
      if (c.renames.some(x => effect_same_name(x[0], frm))) {
        problem(n, 'this file is renamed twice in the same copy');
        c.usable = false;
        continue;
      }
      c.renames.push([frm, dst, n]);
    } else if (word_is(s, start, key_end, 'play')) {
      const dot = pyFind(s, '.', value, stop);
      if (dot >= 0 || effect_take_name(s, value, stop) === null) {
        problem(n, 'play is the name of a script in SpellExtConfig\\effects, without its .txt: 1 to 31 letters, digits, _ and - (play = stage0_test)');
        c.usable = false;
      } else {
        c.play = true;
      }
    } else if (word_is(s, start, key_end, 'base')) {
      const [ok, p, num] = parse_number(s, value, stop);
      if (!ok || p !== stop || !(num <= 0x04 || num === 0x19)) {
        problem(n, 'base is the effect the record holds while a native effect plays: one that loads no files, 0x00-0x04 or 0x19');
        c.usable = false;
      } else if (c.play_base >= 0 && c.play_base !== num) {
        problem(n, 'base is given twice, with two different effects');
        c.usable = false;
      } else {
        c.play_base = num;
        c.play_base_line = n;
      }
    } else {
      problem(n, 'unknown key (a copy has copy = and file = lines; a native effect play = and base =)');
      c.usable = false;
    }
  }
  for (const x of copies) {
    if (x.play) {
      if (x.base >= 0 || x.renames.length) {
        problem(x.line, 'a native effect (play =) takes no copy = or file = lines: it is not a copy of the game\'s');
        x.usable = false;
      }
    } else if (x.play_base >= 0) {
      problem(x.play_base_line, 'base = is for a native effect (play =); a copy names its effect with copy =');
      x.usable = false;
    } else if (x.base < 0) {
      problem(x.line, 'this copy has no copy = line (which effect it copies)');
      x.usable = false;
    } else if (!x.renames.length) {
      problem(x.line, 'this copy renames no file: it would be the effect itself (give file = FROM:TO lines)');
      x.usable = false;
    }
  }
  // the game decides: "effect %02x cannot be copied: %s" (the base's loader in the exe), "this file is not one of the
  // files of the effect copied (the log lists them above)" (the base's list), and the files being found
  // (effect_copies_check_files), and a native effect's script (effects\NAME.txt, not this file's reader)
  return copies;
}

export function check_effects(r) {
  const s = r.text;
  r.shared.set('sound_handles', sound_file_parse(r, s));       // sound_handles_read runs first
  const copies = effect_file_parse(r, s);
  const m = new Map();
  for (const x of copies) m.set(x.number, x.usable);
  r.shared.set('effect_copies', m);
}

// ---------------------------------------------------------------- spell file

export const ELEMENT_FLAGS = Object.freeze([
  ['fire', 0x0001], ['ice', 0x0002], ['lightning', 0x0004], ['bolt', 0x0004], ['earth', 0x0008],
  ['poison', 0x0010], ['gravity', 0x0020], ['water', 0x0040], ['wind', 0x0080], ['holy', 0x0100],
  ['restorative', 0x0200], ['cut', 0x0400], ['hit', 0x0800], ['punch', 0x1000], ['shoot', 0x2000],
  ['shout', 0x4000], ['hidden', 0x8000]]);
export const STATUS_FLAGS = Object.freeze([
  ['death', 0x1], ['near_death', 0x2], ['sleep', 0x4], ['poison', 0x8], ['sadness', 0x10],
  ['fury', 0x20], ['confusion', 0x40], ['confu', 0x40], ['confuse', 0x40], ['silence', 0x80],
  ['haste', 0x100], ['slow', 0x200], ['stop', 0x400], ['frog', 0x800], ['small', 0x1000],
  ['slow_numb', 0x2000], ['petrify', 0x4000], ['regen', 0x8000], ['barrier', 0x10000],
  ['mbarrier', 0x20000], ['reflect', 0x40000], ['dual', 0x80000], ['shield', 0x100000],
  ['death_sentence', 0x200000], ['manipulate', 0x400000], ['berserk', 0x800000],
  ['peerless', 0x1000000], ['paralysis', 0x2000000], ['darkness', 0x4000000],
  ['dual_drain', 0x8000000], ['death_force', 0x10000000], ['resist', 0x20000000],
  ['lucky_girl', 0x40000000], ['imprisoned', 0x80000000]]);
export const TARGET_FLAGS = Object.freeze([
  ['selectable', 0x01], ['enemy', 0x02], ['multiple', 0x04], ['toggle', 0x08], ['one_row', 0x10],
  ['short_range', 0x20], ['all_rows', 0x40], ['random', 0x80]]);
export const SPECIAL_FLAGS = Object.freeze([
  ['damage_mp', 0x0001], ['flag_0002', 0x0002], ['darkness_affects', 0x0004], ['drain_hp', 0x0010],
  ['drain_hp_mp', 0x0020], ['flag_0040', 0x0040], ['ignore_status_defense', 0x0080],
  ['miss_unless_dead', 0x0100], ['reflectable', 0x0200], ['ignore_defense', 0x0400],
  ['no_retarget', 0x0800], ['always_critical', 0x2000]]);

export const FIELDS = Object.freeze([
  ['accuracy', REC_ACCURACY, 1], ['impact_effect', REC_IMPACT_EFFECT, 1], ['hurt_action', REC_HURT_ACTION, 1],
  ['impact_sound', REC_IMPACT_SOUND, 2], ['camera_single', REC_CAMERA_SINGLE, 2],
  ['camera_multi', REC_CAMERA_MULTI, 2], ['animation', REC_EFFECT, 1], ['damage_formula', REC_DAMAGE_FORMULA, 1],
  ['strength', REC_STRENGTH, 1], ['additional_effect', REC_ADDITIONAL_EFFECT, 1],
  ['additional_modifier', REC_ADDITIONAL_MODIFIER, 1]]);
export const FLAG_FIELDS = Object.freeze([
  ['element', ELEMENT_FLAGS, REC_ELEMENT, 2], ['target', TARGET_FLAGS, REC_TARGET_FLAGS, 1],
  ['status', STATUS_FLAGS, REC_STATUS, 4], ['special', SPECIAL_FLAGS, REC_SPECIAL, 2]]);

// parse_flags: the mask, or null.
export function parse_flags(s, p, end, names, limit) {
  let mask = 0;
  while (true) {
    const w = next_word(s, p, end);
    if (w === null) return mask;
    let we;
    [p, we] = w;
    let found = false;
    for (const [name, v] of names) {
      if (word_is(s, p, we, name)) {
        mask = (mask | v) >>> 0;
        found = true;
        break;
      }
    }
    if (!found) {
      if (word_is(s, p, we, 'none')) {
        // nothing
      } else {
        const [ok, q, number] = parse_number(s, p, we);
        if (ok && q === we && number <= limit) mask = (mask | number) >>> 0;
        else return null;
      }
    }
    p = we;
  }
}

export class SpellDraft {
  constructor(ident, line) {
    this.id = ident;
    this.line = line;
    this.base = -1;
    this.value = new Array(ATTACK_RECORD_SIZE).fill(0);
    this.is_set = new Array(ATTACK_RECORD_SIZE).fill(false);
    this.status_mode = -1;
    this.status_chance = -1;
    this.flag_add = [0, 0, 0, 0];
    this.flag_remove = [0, 0, 0, 0];
  }

  // Python's list assignment: an offset past the record is an IndexError (reached by dword_ffffffff, whose offset + size
  // wraps to 3 in the DLL's DWORD test and passes it; the DLL then writes before its draft: see the S2 report)
  set_bytes(offset, size, value) {
    for (let i = 0; i < size; i++) {
      if (offset + i >= ATTACK_RECORD_SIZE) throw new PyIndexError('list assignment index out of range');
      this.value[offset + i] = (value >>> (8 * i)) & 0xff;
      this.is_set[offset + i] = true;
    }
  }
}

// apply_key: null, or what was wrong (the DLL's string). The limits file's reader calls it too (spellext.c 26989),
// with spell_file_reading false: then an effect copy number is refused.
export function apply_key(d, s, key, key_end, value, end, shared, spell_file_reading) {
  if (spell_file_reading === undefined) spell_file_reading = true;
  let p = value;
  let ok;
  let number;
  if (word_is(s, key, key_end, 'name') || word_is(s, key, key_end, 'description')) return null;
  if (word_is(s, key, key_end, 'base')) {
    [ok, p, number] = parse_number(s, p, end);
    if (!ok || p !== end || number > 0x7f) return 'base must be a kernel attack ID from 0 to 0x7f';
    d.base = number;
    return null;
  }
  if (word_is(s, key, key_end, 'animation') || word_is(s, key, key_end, 'animation_all')) {
    const is_all = word_is(s, key, key_end, 'animation_all');
    const [ok2, q, number2] = parse_number(s, p, end);
    if (ok2 && q === end && number2 >= EFFECT_COPY_FIRST) {
      if (!spell_file_reading) return 'effect copies (0x100 and up) are for spells, not yet for limits';
      const copies = shared.has('effect_copies') ? shared.get('effect_copies') : new Map();
      if (number2 > EFFECT_COPY_LAST || !copies.get(number2)) {
        return 'no usable effect copy of that number in FF7_SpellExt_Effects.ini (its problems are in the log above): the spell keeps the animation it had';
      }
      if (!is_all) d.set_bytes(REC_EFFECT, 1, 0);       // the copy's base effect (its number: the game's data)
      return null;
    }
    p = value;
  }
  if (word_is(s, key, key_end, 'mp')) {
    [ok, p, number] = parse_number(s, p, end);
    if (!ok || p !== end || number > MP_COST_MAX) return 'mp must be a number from 0 to 999';
    d.set_bytes(REC_MP_COST, 2, number);
    return null;
  }
  for (const [name, offset, size] of FIELDS) {
    if (word_is(s, key, key_end, name)) {
      [ok, p, number] = parse_number(s, p, end);
      if (!ok || p !== end || (number >>> (8 * size))) return 'the value must be a number that fits the field';
      d.set_bytes(offset, size, number);
      return null;
    }
  }
  for (let i = 0; i < FLAG_FIELDS.length; i++) {
    const [name, names, offset, size] = FLAG_FIELDS[i];
    if (!word_is(s, key, key_end, name)) continue;
    const limit = size === 4 ? 0xffffffff : (1 << (8 * size)) - 1;
    let signed_words = 0;
    let plain_words = 0;
    let q = value;
    while (true) {
      const w = next_word(s, q, end);
      if (w === null) break;
      let we;
      [q, we] = w;
      if (s[q] === '+' || s[q] === '-') signed_words += 1;
      else plain_words += 1;
      q = we;
    }
    if (signed_words && plain_words) {
      return 'give every name a + or - (change the base\'s flags), or none of them (replace the whole list)';
    }
    if (signed_words) {
      q = value;
      while (true) {
        const w = next_word(s, q, end);
        if (w === null) break;
        let we;
        [q, we] = w;
        const mask = parse_flags(s, q + 1, we, names, limit);
        if (!mask) return 'unknown name in the list';
        if (s[q] === '+') {
          d.flag_add[i] = (d.flag_add[i] | mask) >>> 0;
          d.flag_remove[i] = (d.flag_remove[i] & ~mask) >>> 0;
        } else {
          d.flag_remove[i] = (d.flag_remove[i] | mask) >>> 0;
          d.flag_add[i] = (d.flag_add[i] & ~mask) >>> 0;
        }
        q = we;
      }
      if (offset === REC_STATUS && d.flag_add[i] && d.status_mode < 0) d.status_mode = 0;
      return null;
    }
    let mask = parse_flags(s, value, end, names, limit);
    if (mask === null) return 'unknown name in the list';
    if (offset === REC_SPECIAL) mask = ~mask & 0xffff;
    if (offset === REC_STATUS && mask === 0) {
      mask = 0xffffffff;
      d.set_bytes(REC_STATUS_CHANGE, 1, 0xff);
      d.status_mode = -1;
      d.status_chance = -1;
    } else if (offset === REC_STATUS && d.status_mode < 0) {
      d.status_mode = 0;
    }
    d.set_bytes(offset, size, mask);
    return null;
  }
  if (word_is(s, key, key_end, 'status_mode')) {
    const modes = ['inflict', 'cure', 'toggle'];
    for (let i = 0; i < modes.length; i++) {
      if (word_is(s, value, end, modes[i])) {
        d.status_mode = i;
        return null;
      }
    }
    return 'status_mode must be inflict, cure or toggle';
  }
  if (word_is(s, key, key_end, 'status_chance')) {
    if (word_is(s, value, end, 'always')) {
      d.status_chance = 63;
    } else {
      [ok, p, number] = parse_number(s, p, end);
      if (!ok || p !== end || number > 100) return 'status_chance must be always or a percentage from 0 to 100';
      d.status_chance = Math.floor((number + 2) / 4);
    }
    return null;
  }
  if (word_is(s, key, key_end, 'condition')) {
    let i = 3;
    const conds = ['hp', 'mp', 'status'];
    for (let k = 0; k < conds.length; k++) {
      if (word_is(s, value, end, conds[k])) {
        i = k;
        break;
      }
    }
    if (i === 3 && word_is(s, value, end, 'none')) {
      i = 0xff;
    } else if (i === 3) {
      [ok, p, number] = parse_number(s, p, end);
      if (!ok || p !== end || number > 0xff) return 'condition must be hp, mp, status, none or a number';
      i = number;
    }
    d.set_bytes(REC_FIELD_10, 1, i);
    return null;
  }
  if (word_is(s, key, key_end, 'fixed_damage')) {
    if (word_is(s, value, end, 'none')) return null;
    [ok, p, number] = parse_number(s, p, end);
    if (!ok || p !== end || number < 1 || number > 9999999) return 'fixed_damage must be a number from 1 to 9999999, or none';
    return null;
  }
  if (word_is(s, key, key_end, 'party_vanishes')) {
    if (parse_yes_no(s, value, end) === null) return 'expected yes or no';
    return null;
  }
  if (word_is(s, key, key_end, 'order')) {
    if (!['auto', 'restore', 'attack', 'indirect'].some(g => word_is(s, value, end, g))) {
      return 'order must be restore, attack, indirect or auto';
    }
    return null;
  }
  if (word_is(s, key, key_end, 'list')) {
    if (word_is(s, value, end, 'summon') || word_is(s, value, end, 'magic')) return null;
    return 'list must be magic or summon';
  }
  if (word_is(s, key, key_end, 'animation_all')) {
    if (word_is(s, value, end, 'none')) return null;
    [ok, p, number] = parse_number(s, p, end);
    if (!ok || p !== end || number > 0xff) return 'animation_all must be an animation number from 0 to 255, or none';
    return null;
  }
  if (word_is(s, key, key_end, 'materia')) {
    let grants = 0;
    while (true) {
      const w = next_word(s, p, end);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      if (word_is(s, p, word_end, 'any')) {
        // nothing
      } else if (!word_is(s, p, word_end, 'none')) {
        [ok, p, number] = parse_number(s, p, word_end);
        if (!ok || number > 0xfe) return 'materia must be any, none, or materia IDs from 0 to 254';
        if (p < word_end && s[p] === ':') {
          p += 1;
          let level;
          [ok, p, level] = parse_number(s, p, word_end);
          if (!ok || level < 1 || level > MATERIA_MAX_LEVELS) return 'a materia level must be from 1 to 20';
        }
        if (p !== word_end) return 'materia must be any, none, or materia IDs from 0 to 254';
        if (grants === MAX_GRANTS) return 'too many materia for one spell';
        grants += 1;
      }
      p = word_end;
    }
    return null;
  }
  if (word_is(s, key, key_end, 'bytes')) {
    for (let i = 0; i < ATTACK_RECORD_SIZE; i++) {
      while (p < end && is_space(s[p])) p += 1;
      if (end - p < 2 || hex_digit(s[p]) < 0 || hex_digit(s[p + 1]) < 0) return 'bytes needs 28 two-digit hex values';
      d.set_bytes(i, 1, hex_digit(s[p]) * 16 + hex_digit(s[p + 1]));
      p += 2;
    }
    while (p < end && is_space(s[p])) p += 1;
    return p === end ? null : 'bytes needs 28 two-digit hex values';
  }
  for (const [prefix, length, size] of [['byte_', 5, 1], ['word_', 5, 2], ['dword_', 6, 4]]) {
    let digits = key + length;
    if (key_end - key <= length || !word_is(s, key, digits, prefix)) continue;
    let offset = 0;
    while (digits < key_end && hex_digit(s[digits]) >= 0) {
      offset = (offset * 16 + hex_digit(s[digits])) % 0x100000000;
      digits += 1;
    }
    if (digits !== key_end || ((offset + size) % 0x100000000) > ATTACK_RECORD_SIZE) {
      return 'the offset is not inside the 28-byte record';
    }
    [ok, p, number] = parse_number(s, p, end);
    if (!ok || p !== end || (size < 4 && (number >>> (8 * size)))) return 'the value must be a number that fits the field';
    d.set_bytes(offset, size, number);
    return null;
  }
  return 'unknown key';
}

// finish_spell: logs a skipped spell; marks the ID used when it loads. `where(line)` maps the combined text's line to
// [file, line] for the jump; the DLL's own text keeps the combined number.
export function finish_spell(r, d, used, where) {
  if (d === null || d.id < 0) return;
  if (d.status_mode >= 0 || d.status_chance >= 0) {
    d.set_bytes(REC_STATUS_CHANGE, 1, ((d.status_mode < 0 ? 0 : d.status_mode) << 6 |
                                       (d.status_chance < 0 ? 63 : d.status_chance)) & 0xff);
  }
  const unset = d.is_set.filter(x => !x).length;
  if (d.base < 0 && unset) {
    const [f, ln] = where(d.line);
    // (the DLL says "spell file line" with the combined text's number, also for a test file section)
    r.log_with({ file: f }, ln, 'spell file line %d: spell %d has no base and no full bytes line; skipped', d.line, d.id);
    return;
  }
  if ([REC_ADDITIONAL_EFFECT, REC_ADDITIONAL_MODIFIER, REC_SPECIAL, REC_SPECIAL + 1].every(k => d.is_set[k])) {
    // the bytes the reflect warning reads are all the file's: foreseeable (otherwise the base's: the game decides)
    const rec = d.value.slice();
    const spans = [[REC_ELEMENT, 2], [REC_TARGET_FLAGS, 1], [REC_STATUS, 4], [REC_SPECIAL, 2]];
    for (let i = 0; i < spans.length; i++) {
      const [offset, size] = spans[i];
      if (!d.flag_add[i] && !d.flag_remove[i]) continue;
      const full = size === 4 ? 0xffffffff : (1 << (8 * size)) - 1;
      let v = 0;
      for (let k = 0; k < size; k++) v = (v | (rec[offset + k] << (8 * k))) >>> 0;
      if (offset === REC_SPECIAL) v = (~v & full) >>> 0;
      if (offset === REC_STATUS && v === 0xffffffff) v = 0;
      v = ((v | d.flag_add[i]) & ~d.flag_remove[i] & full) >>> 0;
      if (offset === REC_SPECIAL) v = (~v & full) >>> 0;
      if (offset === REC_STATUS && v === 0) v = 0xffffffff;
      for (let k = 0; k < size; k++) rec[offset + k] = (v >>> (8 * k)) & 0xff;
    }
    const special = rec[REC_SPECIAL] | rec[REC_SPECIAL + 1] << 8;
    if (rec[REC_ADDITIONAL_EFFECT] === 0 && rec[REC_ADDITIONAL_MODIFIER] !== 0xff && rec[REC_ADDITIONAL_MODIFIER] > 1 &&
        !(special & 0x0200)) {
      const [f, ln] = where(d.line);
      r.log_with({ kind: 'warning', file: f }, ln,
                 'WARNING: %s %d (line %d) is reflectable and hits %d times: the game does not cope when some hits are ' +
                 'reflected and others land (a death may not be shown). Add `special = -reflectable` to it.',
                 'spell', d.id, d.line, rec[REC_ADDITIONAL_MODIFIER]);
    }
  }
  used.add(d.id);
  if (!r.shared.has('spells_loaded')) r.shared.set('spells_loaded', []);
  r.shared.get('spells_loaded').push(d.id);
}

export function check_spells(r) {
  const texts = r.shared.has('texts') ? r.shared.get('texts') : new Map();
  let test_text = null;
  for (const [k, v] of texts) {
    if (pyLower(k) === pyLower(SPELL_TEST_FILE)) test_text = v;
  }
  let main = r.text;
  let test_first = 0;
  if (main === null || main === undefined) {
    // (the DLL names its config folder's full path here)
    r.log_with({ kind: 'note' }, 0, 'no spell file (%s%s)', 'SpellExtConfig\\', SPELL_FILE);
    if (test_text === null || test_text === undefined) return;
    main = '';
  }
  let s;
  if (test_text !== null && test_text !== undefined) {
    test_first = 2 + main.split('\n').length - 1;
    s = main + '\n' + test_text;
  } else {
    s = main;
  }

  const where = line => (test_first && line >= test_first ? [SPELL_TEST_FILE, line - test_first + 1] : [null, line]);

  r.shared.set('spells_loaded', []);
  const used = new Set();
  let d = null;
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    if (start === stop) continue;
    let problem = null;
    if (s[start] === '[') {
      finish_spell(r, d, used, where);
      d = null;
      const [ok, p, ident] = parse_number(s, start + 1, stop);
      if (!ok || p + 1 !== stop || s[p] !== ']') problem = 'a section must be an ID in brackets, like [3000]';
      else if (ident < EXT_FIRST_ID || ident > EXT_LAST_ID) problem = 'spell IDs must be from 3000 to 65534';
      else if (used.has(ident)) problem = 'this spell ID is already used';
      else d = new SpellDraft(ident, n);
    } else if (d === null) {
      continue;
    } else {
      const equals = pyFind(s, '=', start, stop);
      if (equals < 0) {
        problem = 'expected key = value';
      } else {
        const [ks, ke] = trim(s, start, equals);
        const [vs, ve] = trim(s, equals + 1, stop);
        problem = apply_key(d, s, ks, ke, vs, ve, r.shared);
      }
    }
    if (problem) {
      if (test_first && n >= test_first) {
        r.log_with({ file: SPELL_TEST_FILE }, n - test_first + 1, 'test spell file line %d: %s', n - test_first + 1, problem);
      } else {
        r.log(n, 'spell file line %d: %s', n, problem);
      }
    }
  }
  finish_spell(r, d, used, where);
}

check_spells.wants_absent = true;     // the test file alone is read (and "no spell file" said)

export function kind_effects(header) {
  const s = header;
  if (s.length < 2 || s[s.length - 1] !== ']') return null;
  const w = next_word(s, 1, s.length - 1);
  if (w === null) return null;
  if (word_is(s, w[0], w[1], 'sound')) return 'sound';
  if (word_is(s, w[0], w[1], 'effect')) return 'effect';
  return null;
}

export function kind_spell(header) {
  const [ok, p, ident] = parse_number(header, 1, header.length);
  if (!ok || p + 1 !== header.length || header[p] !== ']' || ident < EXT_FIRST_ID || ident > EXT_LAST_ID) return null;
  return 'spell';
}

register(NAMES_FILE, check_spell_names, 10, () => 'group');
register(EFFECT_FILE, check_effects, 30, kind_effects);
register(SPELL_FILE, check_spells, 40, kind_spell);

// The limits reader's call of apply_key (spellext.c 26989): the spell keys of a limit section, read into a spell draft
// of the limit's own (one per limit section: `draft` is the limits port's fresh object), with spell_file_reading false
// (an effect copy number is then refused).
export function apply_key_for_limits(s, key, key_end, value, stop, draft) {
  let d = draft._spell_draft;
  if (d === undefined || d === null) {
    d = new SpellDraft(0, 0);
    draft._spell_draft = d;
  }
  return apply_key(d, s, key, key_end, value, stop, draft._shared || new Map(), false);
}
