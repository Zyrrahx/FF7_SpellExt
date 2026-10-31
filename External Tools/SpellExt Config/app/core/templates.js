// The template library (design 4.1-4.7), port of sxcfg/templates.py, function for function and under the same names:
// the plain-text template format with its own small parser, the placeholder types, the filling of a template (repeat,
// segments, derived values), ID allocation by the readers' own rules, the proof at insert (the whole-folder check, run
// before on the texts padded with blank lines where the template will insert, and after: any message of "after" not
// in "before" refuses the insert) and the tool's own warnings, and the capture of a section as a template of the
// user's. Nothing here writes a file: ipc.js applies the plan to the workspace's documents and saves through save.js.
//
// The texts are a Map {name: text} (Workspace.texts()); a template is a plain object whose keys are in Python's order.
//
// S6a: gated lines (<?NAME> / <?!NAME>, NAME a switch placeholder: closed, the line is written commented out with its
// placeholders at their defaults, or dropped when it names the ID of a part not emitted), `exclusive`, `when` on a
// part, conditional warns (`warn = S !T: text`), the character, limit and AI types, the kernel readers (start records,
// weapon equip masks, attack names), the character checks, the prerequisites, the reference panel and the AI cards.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as grammar from './grammar.js';
import * as validate from './validate.js';
import * as slots from './slots.js';
import { cfmt } from './cfmt.js';
import { Document, EditRefused, LineView, _split_raw } from './document.js';
import * as gear_rules from './rules/gear.js';
import * as gc from './rules/gearcommon.js';
import * as char_rules from './rules/characters.js';
import * as aitool from './aitool.js';
import * as ailibrary from './ailibrary.js';
import { pyLower, pyInt, pyStrip, PyValueError, pyJoin } from './py.js';
import './rules/index.js';

export const BUILTIN = pyJoin(import.meta.dirname, 'data', 'builtin_templates.txt');
export const CHARACTER_REFERENCE = pyJoin(import.meta.dirname, 'data', 'character_reference.json');
export const VANILLA_LIMITS = pyJoin(import.meta.dirname, 'data', 'vanilla_limits.json');
export const USER_FILE = 'FF7_SpellExt_Templates.txt';

const NAME = '[A-Z][A-Z0-9_]*';
const TEMPLATE_HEAD = /^\[template ([A-Za-z0-9_-]+)\]$/;
const PH_NAME = new RegExp('^(' + NAME + ')(#?)$');
const BODY_TOKEN_SRC = '<(' + NAME + ')(#?)>|<(' + NAME + ')#([^<>{}]*)\\{([^<>{}]*)\\}>';
const bodyToken = () => new RegExp(BODY_TOKEN_SRC, 'g');
const GATE_RE = new RegExp('^<\\?(!?)(' + NAME + ')>');
const WARN_IF = new RegExp('^((?:!?' + NAME + ' +)*!?' + NAME + '):[ \\t]');
export const TEMPLATE_KEYS = Object.freeze(['title', 'kind', 'file', 'note', 'placeholder', 'derived', 'position',
                                            'repeat', 'warn', 'source', 'exclusive', 'when', 'lines', 'part']);

// the section kinds a template part may make, per file (the readers' section kinds)
export const FILE_KINDS = Object.freeze([
  ['FF7_SpellExt_Items.ini', ['item', 'wide_item']],
  ['FF7_SpellExt_Weapons.ini', ['weapon', 'wide_weapon']],
  ['FF7_SpellExt_Armour.ini', ['armour', 'wide_armour']],
  ['FF7_SpellExt_Accessories.ini', ['accessory', 'wide_accessory']],
  ['FF7_SpellExt_Materia.ini', ['materia', 'test']],
  ['FF7_SpellExt_Spells.ini', ['spell']],
  ['FF7_SpellExt_Shops.ini', ['shop']],
  ['FF7_SpellExt_Characters.ini', ['character']],
  ['FF7_SpellExt_Limits.ini', ['character', 'limit']],
]);
// ID allocation (design 4.3): the preferred ranges in order, the wide range and what turns it on
export const ID_RANGES = Object.freeze([
  ['item', [[448, 511], [105, 127]], [1024, 9999]],
  ['weapon', [[320, 383]], [10000, 15999]],
  ['armour', [[384, 415]], [16000, 21999]],
  ['accessory', [[416, 447]], [22000, 27999]],
  ['materia', [[96, 254]], null],
  ['spell', [[3000, 65534]], null],
  ['shop', [[0, 79]], null],
  ['character', [[12, 15], [16, 43]], null],
]);
const GEAR_INDEX = { weapon: 0, armour: 1, accessory: 2, item: 3 };
const SPELL_TEST_FILE = 'FF7_SpellExt_Spells_Test.ini';
export const KERNEL_COUNTS = Object.freeze([['weapon', 128], ['armour', 32], ['accessory', 32], ['item', 105],
                                            ['attack', 128], ['materia', 96]]);
// KERNEL.BIN's name sections (0-based, of the 27): attack 18, item 19, weapon 20, armour 21, accessory 22, materia 23
export const KERNEL_NAME_SECTION = Object.freeze([['attack', 18], ['item', 19], ['weapon', 20], ['armour', 21],
                                                  ['accessory', 22], ['materia', 23]]);
export const KERNEL_MATERIA_SECTION = 8;
const MATERIA_RECORD = 20;
const MATERIA_ATTRIBUTES = 0x0e;
// the first attribute byte of the game's materia (the Materia readme's end table), used when no KERNEL.BIN is read
export const README_MATERIA_ATTR = Object.freeze([[0x00, 0x09], [0x01, 0x08], [0x02, 0x04], [0x03, 0x02], [0x04, 0x05],
  [0x0c, 0x51], [0x0d, 0x53], [0x17, 0x51], [0x18, 0x54], [0x19, 0x55], [0x1a, 0x58], [0x1b, 0x59], [0x1c, 0x5a],
  [0x1d, 0x5e], [0x1e, 0x5f], [0x1f, 0x56], [0x20, 0x57], [0x21, 0x5c], [0x22, 0x5d], [0x23, 0x63]]);
// spell animations past 0x35 the Spells readme lists as seen working from a party member
const ANIMATIONS_SEEN = [0x4e, 0x68, 0x9d, 0xaa, 0xb2, 0xb5, 0xba, 0xe9, 0xdd];
// weapon bases with no throw effect (the Weapons readme)
const NO_THROW_BASES = [[0, 0], [16, 31], [48, 61], [127, 127]];
const SHOP_ROOM = 32;
const COUNT_LIMIT = 20;
const CHARACTERS_FILE = 'FF7_SpellExt_Characters.ini';
const LIMITS_FILE = 'FF7_SpellExt_Limits.ini';
const GEAR_FILES = ['FF7_SpellExt_Weapons.ini', 'FF7_SpellExt_Armour.ini', 'FF7_SpellExt_Accessories.ini'];
// the kernel characters 0-10 by the words the characters port takes (ai_tool.KERNEL_CHARS)
export const KERNEL_CHARACTERS = Object.freeze(['cloud', 'barret', 'tifa', 'aeris', 'red', 'yuffie', 'caitsith',
                                                'vincent', 'cid', 'youngcloud', 'sephiroth']);
// KERNEL.BIN section 3 (0-based): the start records (0x84 bytes each), the first byte the character's number
export const KERNEL_RECORDS_SECTION = 3;
export const RECORD_SIZE = 0x84;
const RECORD_FIELDS = [['level', 0x01, 1], ['str', 0x02, 1], ['vit', 0x03, 1], ['mag', 0x04, 1], ['spr', 0x05, 1],
                       ['dex', 0x06, 1], ['lck', 0x07, 1], ['hp', 0x2e, 2], ['mp', 0x32, 2]];
const STAT_KEYS = [['level', 'level'], ['str', 'strength'], ['vit', 'vitality'], ['mag', 'magic'], ['spr', 'spirit'],
                   ['dex', 'dexterity'], ['lck', 'luck'], ['hp', 'hp'], ['mp', 'mp']];
// KERNEL.BIN section 5 (0-based): the weapon records (44 bytes), the equip mask word at 0x0e (bit k: character k)
const KERNEL_WEAPON_SECTION = 5;
const WEAPON_RECORD = 44;
const WEAPON_EQUIP = 0x0e;
// the attack names and descriptions (sections 18 and 10), for kernel_name / kernel_desc
export const KERNEL_ATTACK_NAMES = 18;
export const KERNEL_ATTACK_DESCS = 10;
// FF7 text characters (as ff7_name renders them: byte + 0x20) that have a plain form in the .ini files (the DLL reads
// 0x20-0x7e): the ellipsis, the double and the single quotes
const FF7_PLAIN = [['\xc9', '...'], ['\xd2', '"'], ['\xd3', '"'], ['\xd4', "'"], ['\xd5', "'"]];
const LIMIT_ITEMS = [105, 127];
const AI_NAME_RE = /^[A-Za-z0-9_-]{1,31}$/;

// The folder a template is filled against: `texts` Map {name: text} as Workspace.texts() gives it (the readers'
// names), `kernel` the bytes of KERNEL.BIN or null, `ai_texts` Map {name: text} of the ai\*.txt files.
// S6a: `ai_names` the names of the ai folder's assembled files (NAME of NAME.ai: the DLL reads only that one; by
// default the names of `ai_texts`), `ai_pending` the names of the AI files staged and not saved yet, `backups` Map {path: text} of the characters files under Backups\.
export class Folder {
  constructor(texts, kernel, ai_texts, ai_names, ai_pending, backups) {
    this.texts = texts;
    this.kernel = kernel === undefined ? null : kernel;
    this.ai_texts = ai_texts === undefined || ai_texts === null ? new Map() : ai_texts;
    if (ai_names === undefined || ai_names === null) {
      ai_names = [...this.ai_texts.keys()].map(n => {
        const base = n.replace(/\\/g, '/').split('/').pop();
        const dot = base.lastIndexOf('.');
        return dot > 0 ? base.slice(0, dot) : base;
      });
    }
    this.ai_names = [...ai_names];
    this.ai_pending = [...(ai_pending || [])];
    this.backups = backups === undefined || backups === null ? new Map() : backups;
    this._checked = null;
    this._kernel_secs = false;
  }

  // the same folder (kernel, AI files, backups) with other texts
  with_texts(texts) {
    return new Folder(texts, this.kernel, this.ai_texts, this.ai_names, this.ai_pending, this.backups);
  }

  name_of(file) {
    for (const k of this.texts.keys()) if (pyLower(k) === pyLower(file)) return k;
    return null;
  }

  text(file) {
    const k = this.name_of(file);
    return k !== null ? this.texts.get(k) : null;
  }

  // [problems, shared] of the whole folder as it stands
  check() {
    if (this._checked === null) {
      const shared = new Map();
      const probs = validate.check_folder(this.texts, null, shared);
      this._checked = [probs, shared];
    }
    return this._checked;
  }

  kernel_sections() {
    if (this._kernel_secs === false) {
      this._kernel_secs = null;
      if (this.kernel !== null) {
        try {
          if (slots.is_kernel(this.kernel)) this._kernel_secs = slots.kernel_sections(this.kernel);
        } catch (e) {
          this._kernel_secs = null;
        }
      }
    }
    return this._kernel_secs;
  }
}

// A template that cannot be filled or placed as asked (the message says why).
export class TemplateProblem extends Error {
  constructor(message) { super(message); this.name = 'TemplateProblem'; }
}

// ---- small helpers ---------------------------------------------------------------------------------------------------
export function trimmed(s) {
  const [a, b] = grammar.trim(s, 0, s.length);
  return s.slice(a, b);
}

// The value of a whole number as the readers parse it (decimal or 0x hex, 32-bit wrap), or null.
export function number_of(s) {
  const [ok, p, n] = grammar.parse_number(s, 0, s.length);
  return ok && p === s.length && s.length > 0 ? n : null;
}

export function words_of(s) {
  const out = [];
  let p = 0;
  for (;;) {
    const w = grammar.next_word(s, p, s.length);
    if (w === null) return out;
    out.push(s.slice(w[0], w[1]));
    p = w[1];
  }
}

function word_in(word, table) {
  for (const name of table) if (grammar.word_is(word, 0, word.length, name)) return true;
  return false;
}

function word_is_all(w, name) { return grammar.word_is(w, 0, w.length, name); }

export function ascii_lower(s) { return s.replace(/[A-Z]/g, c => c.toLowerCase()); }

function header_number(header) { return gc.section_number(header, 0, header.length); }

// Two header texts name the same section: the same text, the same number, or the same word in another case.
export function same_header(a, b) {
  if (a === b) return true;
  const na = header_number(a);
  const nb = header_number(b);
  if (na !== null && nb !== null) return na === nb;
  return ascii_lower(a) === ascii_lower(b);
}

function kinds_of_file(file) {
  for (const [f, kinds] of FILE_KINDS) if (pyLower(f) === pyLower(file)) return kinds;
  return null;
}

function id_rules(kind) {
  for (const [k, ranges, wide] of ID_RANGES) if (k === kind || 'wide_' + k === kind) return [k, ranges, wide];
  return [null, null, null];
}

function partition(s, sep) {
  const i = s.indexOf(sep);
  return i < 0 ? [s, '', ''] : [s.slice(0, i), sep, s.slice(i + sep.length)];
}

// A placeholder line's fields: split at commas outside ( ) and outside a field in double quotes; at most `most`
// fields (the last takes the rest). A field in double quotes is unquoted; inside it `""` is one literal `"`.
export function split_fields(text, most) {
  const fields = [];
  let cur = '';
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      cur += c;
      if (c === '"' && text.slice(i + 1, i + 2) === '"') i += 1;
      else if (c === '"') quoted = false;
    } else if (c === '"' && trimmed(cur) === '') {
      cur = c;
      quoted = true;
    } else if (c === '(') {
      depth += 1;
      cur += c;
    } else if (c === ')') {
      depth = Math.max(0, depth - 1);
      cur += c;
    } else if (c === ',' && depth === 0 && fields.length < most - 1) {
      fields.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map(f0 => {
    let f = trimmed(f0);
    if (f.length >= 2 && f[0] === '"' && f[f.length - 1] === '"') f = f.slice(1, -1);
    return f;
  });
}

function quote_field(v) {
  if (v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v !== trimmed(v) || v.indexOf('(') >= 0 || v.indexOf(')') >= 0) {
    return '"' + v.split('"').join('""') + '"';
  }
  return v;
}

// ---- types (design 4.2) ----------------------------------------------------------------------------------------------
const TYPE_RE = /^([a-z_0-9]+)(?:\(([^()]*)\))?((?:\|[A-Za-z_][A-Za-z0-9_]*)*)$/;
const SIMPLE_TYPES = ['id', 'text11', 'text24', 'text31', 'text95', 'element', 'elements', 'status', 'statuses',
  'status24', 'target', 'equip', 'slots', 'animation', 'materia_ref', 'spell_ref', 'shop_ref', 'shop_entry', 'ap',
  'uses', 'attributes', 'commands', 'materia_grant', 'kernel_spells', 'materia_list', 'value',
  'level', 'portrait', 'battle_prefix', 'ai_ref', 'limit_item_id'];
const ARG_TYPES = ['int', 'count', 'enum', 'bonus', 'kernel', 'materia_attr', 'gear_id', 'ai_word', 'kernel_name',
  'kernel_desc', 'kernel_stat'];
// switch: on or off; switch(NAME): may be on only while the switch NAME is on (S6a)

function parse_range(arg) {
  const m = /^(0x[0-9a-fA-F]+|[0-9]+)\.\.(0x[0-9a-fA-F]+|[0-9]+)$/.exec(arg);
  if (!m) return null;
  let lo;
  let hi;
  try {
    lo = Number(pyInt(m[1], 0));
    hi = Number(pyInt(m[2], 0));
  } catch (e) {
    if (e instanceof PyValueError) return null;     // 08: Python's int( , 0) refuses a leading zero
    throw e;
  }
  return lo <= hi ? [lo, hi] : null;
}

// A type's text -> {base, lo, hi, words, args}, or a problem (a string).
export function parse_type(text) {
  const m = TYPE_RE.exec(text);
  if (!m) return 'unknown type ' + text;
  const base = m[1];
  const arg = m[2] === undefined ? null : m[2];
  const t = { base, lo: null, hi: null, words: m[3].split('|').filter(w => w), args: [] };
  if (base === 'switch') {
    if (t.words.length) return 'the type switch takes no |words';
    if (arg !== null) {
      if (!new RegExp('^' + NAME + '$').test(arg)) return 'switch( ) names the switch it needs on';
      t.args = [arg];
    }
    return t;
  }
  if (SIMPLE_TYPES.indexOf(base) >= 0) {
    if (arg !== null || t.words.length) return 'the type ' + base + ' takes no ( ) and no |words';
    return t;
  }
  if (ARG_TYPES.indexOf(base) < 0) return 'unknown type ' + text;
  if (arg === null) return 'the type ' + base + ' needs ( )';
  if (t.words.length && base !== 'int' && base !== 'gear_id') return 'only int and gear_id take |words';
  if (base === 'int' || base === 'count') {
    const r = parse_range(arg);
    if (r === null) return base + ' needs a range like (0..255)';
    [t.lo, t.hi] = r;
    if (base === 'count' && (r[0] < 1 || r[1] > COUNT_LIMIT)) return 'a count is from 1 to ' + COUNT_LIMIT + ' at most';
  } else if (base === 'enum') {
    t.args = arg.split(',').map(a => trimmed(a));
    if (!t.args.length || t.args.some(a => !a || a.indexOf(' ') >= 0)) return 'enum needs words, like enum(none,normal)';
  } else if (base === 'bonus') {
    if (arg !== '2' && arg !== '4') return 'bonus is bonus(2) or bonus(4)';
    t.args = [Number(arg)];
  } else if (base === 'kernel') {
    if (!KERNEL_COUNTS.some(([k]) => k === arg)) return 'kernel( ) takes weapon, armour, accessory, item, attack or materia';
    t.args = [arg];
  } else if (base === 'materia_attr') {
    if (!new RegExp('^' + NAME + '$').test(arg)) return 'materia_attr( ) names the placeholder of the base';
    t.args = [arg];
  } else if (base === 'gear_id') {
    const a = arg.split(',').map(x => trimmed(x));
    if (a[0] === 'weapon' && a.length === 2 && KERNEL_CHARACTERS.indexOf(a[1]) >= 0) t.args = a;
    else if ((a[0] === 'armour' || a[0] === 'accessory') && a.length === 1) t.args = a;
    else return 'gear_id( ) takes weapon, OWNER (a kernel character: ' + KERNEL_CHARACTERS.join(' ') + '), armour or accessory';
    if ((t.words.length && !(t.words.length === 1 && t.words[0] === 'none')) || (t.words.length && a[0] !== 'accessory')) {
      return 'only gear_id(accessory) takes |none';
    }
  } else if (base === 'ai_word') {
    t.args = arg.split(',').map(x => trimmed(x));
    for (const w of t.args) {
      if (char_rules.AI_NAMES.indexOf(w) < 0 && w !== 'aerith') {
        return 'ai_word( ) takes words of ai_like: ' + char_rules.AI_NAMES.join(' ') + ', aerith';
      }
    }
  } else if (base === 'kernel_name' || base === 'kernel_desc') {
    if (!/^[0-9]+$/.test(arg) || Number(arg) > 255) return base + '( ) takes an attack number 0 to 255';
    t.args = [Number(arg)];
  } else if (base === 'kernel_stat') {
    const a = arg.split(',').map(x => trimmed(x));
    if (a.length !== 2 || !/^[0-9]+$/.test(a[0]) || Number(a[0]) > 10 || !STAT_KEYS.some(([f]) => f === a[1])) {
      return 'kernel_stat( ) takes a kernel character 0 to 10 and one of ' + STAT_KEYS.map(([f]) => f).join(' ');
    }
    t.args = [Number(a[0]), a[1]];
  }
  return t;
}

function kernel_count(what) {
  for (const [k, n] of KERNEL_COUNTS) if (k === what) return n;
  return 0;
}

// Values of a type to fill a template with in the tests: its edges (each must pass the proof). The types whose
// values come from the folder (S6a: a weapon's owner's range, the AI files, the free limit items) have edges only
// with a folder.
export function type_edges(t, folder) {
  const b = t.base;
  const f = folder === undefined ? null : folder;
  if (b === 'switch') return ['on', 'off'];
  if (b === 'level') return ['1', '99', 'party', 'cloud+5'];
  if (b === 'gear_id') {
    if (t.args[0] === 'armour') return ['256', '287'];
    if (t.args[0] === 'accessory') return ['288', '319'].concat(t.words);
    const got = f !== null ? weapon_range(f, t.args[1]) : [];
    return got.length ? [String(got[0]), String(got[got.length - 1])] : [];
  }
  if (b === 'portrait') return ['a', 'Abcdefghij_1'];
  if (b === 'battle_prefix') return ['xq', 'ZY'];
  if (b === 'ai_word') return t.args.slice();
  if (b === 'ai_ref') return f !== null ? sorted_lower([...new Set(f.ai_names.concat(f.ai_pending))]).slice(0, 1) : [];
  if (b === 'kernel_name') return ['A', 'Abcdefghij'.repeat(3) + 'A'];
  if (b === 'kernel_desc') return ['A', 'Abcdefghij'.repeat(10).slice(0, 95)];
  if (b === 'kernel_stat') {
    const [lo, hi] = stat_range(t.args[1]);
    return [String(lo), String(hi)];
  }
  if (b === 'limit_item_id') {
    if (f === null) return [String(LIMIT_ITEMS[0]), String(LIMIT_ITEMS[1])];
    const free = free_limit_items(f);
    return free.length ? [String(free[0]), String(free[free.length - 1])] : [];
  }
  if (b === 'int' || b === 'count') return [String(t.lo), String(t.hi)].concat(t.words);
  if (b === 'enum') return t.args.slice();
  if (b === 'text11' || b === 'text24' || b === 'text31' || b === 'text95') {
    const n = Number(b.slice(4));
    return ['A', 'Abcdefghij'.repeat(10).slice(0, n)];
  }
  if (b === 'elements') return ['none', 'fire', 'hidden', 'fire ice lightning earth poison gravity water wind holy'];
  if (b === 'element') return ['none', 'fire', 'hidden'];
  if (b === 'statuses') return ['none', 'death', 'imprisoned', 'poison sleep silence'];
  if (b === 'status') return ['none', 'death', 'imprisoned'];
  if (b === 'status24') return ['none', 'death', 'berserk', 'poison silence'];
  if (b === 'target') return ['selectable enemy multiple', '0', '255'];
  if (b === 'equip') return ['everyone', 'none', 'cloud', 'cloud tifa', '0', '11'];
  if (b === 'bonus') {
    return ['none', 'strength 0', 'luck 255'].concat(t.args[0] === 4 ? ['strength 1 vitality 2 magic 3 spirit 4']
                                                                     : ['dexterity 1 luck 2']);
  }
  if (b === 'slots') return ['none', 'single', 'chain8', 'pair pair pair pair'];
  if (b === 'kernel') return ['0', String(kernel_count(t.args[0]) - 1)];
  if (b === 'animation') return ['0', '0xff'];
  if (b === 'materia_ref') return ['0', '95'];
  if (b === 'shop_ref') return ['0', '79'];
  if (b === 'shop_entry') return ['0', '104', 'm0', 'm95'];
  if (b === 'ap') {
    return ['none', '100', '100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, ' +
            '1600, 1700, 1800, 6553400'];
  }
  if (b === 'uses') return ['1', '254', '1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20'];
  if (b === 'attributes') return ['none', '0', '255, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20'];
  if (b === 'commands') return ['none', '0', '255, 1, 2, 3, 4, 5'];
  if (b === 'materia_attr') return ['0', '255', '1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19'];
  if (b === 'materia_grant') return ['', ':0', ':master', ':16777214'];
  if (b === 'kernel_spells') return ['none', '0', '0x1b, 0x1c, 0x1d, none, 0xfe'];
  if (b === 'materia_list') return ['none', 'any', '0x31', '0x31:1 0x32:20 0 95'];
  return [];
}

function _list_of_numbers(v, most, lo, hi, none_ok) {
  const ws = words_of(v);
  if (none_ok && ws.length === 1 && word_is_all(ws[0], 'none')) return null;
  if (!ws.length) return 'give at least one number';
  if (ws.length > most) return 'at most ' + most + ' numbers';
  for (const w of ws) {
    const n = number_of(w);
    if (n === null || n < lo || n > hi) return w + ' is not a number from ' + lo + ' to ' + hi;
  }
  return null;
}

function has_char(v, test) {
  for (let i = 0; i < v.length; i++) if (test(v.charCodeAt(i))) return true;
  return false;
}

// Whether `v` (already trimmed) is a value of type `t`: [problem or null, warning or null].
export function check_value(t, v, folder, values) {
  const b = t.base;
  if (b === 'text11' || b === 'text24' || b === 'text31' || b === 'text95' || b === 'value') {
    const n = b !== 'value' ? Number(b.slice(4)) : null;
    if (has_char(v, c => c > 0xff)) return ['a character the .ini files cannot hold (one byte per character)', null];
    if (n !== null && v.length > n) return ['at most ' + n + ' characters (this has ' + v.length + ')', null];
    try {
      Document._check_value(v);
    } catch (e) {
      if (e instanceof EditRefused) return [e.message, null];
      throw e;
    }
    if (b !== 'value' && v.slice(0, 1) === '[') return ['a text cannot start with [ (the DLL reads a section header)', null];
    if (has_char(v, c => c < 0x20 || c > 0x7e)) return [null, 'characters outside 0x20-0x7e become ? in the game'];
    return [null, null];
  }
  if (b === 'int' || b === 'count') {
    for (const w of t.words) if (grammar.word_is(v, 0, v.length, w)) return [null, null];
    const n = number_of(v);
    if (n === null || n < t.lo || n > t.hi) {
      const more = t.words.length ? ', or ' + t.words.join(' or ') : '';
      return ['expected a number from ' + t.lo + ' to ' + t.hi + more, null];
    }
    return [null, null];
  }
  if (b === 'enum') {
    if (word_in(v, t.args) && words_of(v).length === 1) return [null, null];
    return ['expected one of: ' + t.args.join(', '), null];
  }
  if (b === 'element' || b === 'elements' || b === 'status' || b === 'statuses' || b === 'status24') {
    let table = b.startsWith('element') ? gc.ELEMENT_FLAGS : gc.STATUS_FLAGS;
    if (b === 'status24') table = gc.STATUS_FLAGS.slice(0, 26);   // death ... berserk: the first 24 (confu, confuse are aliases)
    const names = table.map(([n]) => n);
    const ws = words_of(v);
    if (!ws.length) return ['give a name, or none', null];
    if ((b === 'element' || b === 'status') && ws.length !== 1) return ['one name, or none', null];
    for (const w of ws) {
      if (!(word_in(w, names) || word_is_all(w, 'none'))) return ['unknown name ' + w, null];
    }
    return [null, null];
  }
  if (b === 'target') {
    if (gc.parse_flags(v, 0, v.length, gc.TARGET_FLAGS, 0xff) === null || !words_of(v).length) {
      return ['target takes the words ' + gc.TARGET_FLAGS.map(([n]) => n).join(' ') + ' or a number 0 to 255', null];
    }
    return [null, null];
  }
  if (b === 'equip') {
    const shared = folder.check()[1];
    if (!words_of(v).length || gc.parse_equip(v, 0, v.length, shared) === null) {
      return ["equip must be a list of character names or IDs (0 to 11, and 12 to 43 for the character file's), " +
              'or everyone, none', null];
    }
    return [null, null];
  }
  if (b === 'bonus') {
    if (!words_of(v).length) return ['give pairs like strength 10, or none', null];
    return [gear_rules.parse_gear_bonus(v, 0, v.length, t.args[0]), null];
  }
  if (b === 'slots') {
    if (!words_of(v).length) return ['give slots, or none', null];
    return [gc.slots_check(v, 0, v.length, 'at most 8 slots'), null];
  }
  if (b === 'kernel') {
    const n = number_of(v);
    const top = kernel_count(t.args[0]) - 1;
    if (n === null || n > top) return ['expected a game ' + t.args[0] + ' number from 0 to ' + top, null];
    return [null, null];
  }
  if (b === 'animation') {
    const n = number_of(v);
    if (n === null) return ['expected an animation number', null];
    if (n > 0xff) {
      const shared = folder.check()[1];
      const copies = shared.has('effect_copies') ? shared.get('effect_copies') : new Map();
      if (!copies.get(n)) return ['no usable effect copy ' + n + ' in the effects file', null];
    }
    return [null, null];
  }
  if (b === 'materia_ref' || b === 'shop_ref' || b === 'spell_ref') {
    const n = number_of(v);
    const top = { materia_ref: 254, shop_ref: 79, spell_ref: 65534 }[b];
    if (n === null || n > top) return ['expected a number from 0 to ' + top, null];
    return [null, null];
  }
  if (b === 'shop_entry') {
    const m = v.slice(0, 1) === 'm' || v.slice(0, 1) === 'M';
    const n = number_of(m ? v.slice(1) : v);
    if (n === null || (m && n > 254) || (!m && n > 511 && !(n >= 1024 && n <= 9999))) {
      return ['expected an item ID (0 to 511, or a wide item 1024 to 9999) or m and a materia ID (m49)', null];
    }
    return [null, null];
  }
  if (b === 'ap') {
    const ws = words_of(v);
    if (ws.length === 1 && word_is_all(ws[0], 'none')) return [null, null];
    let last = 0;
    if (!ws.length || ws.length > 19) return ['ap must be up to 19 AP totals, each a multiple of 100 up to 6553400 (or none)', null];
    for (const w of ws) {
      const n = number_of(w);
      if (n === null || n % 100 || n > 6553400 || n <= last) {
        return ['ap must be up to 19 rising AP totals, each a multiple of 100 up to 6553400 (or none)', null];
      }
      last = n;
    }
    return [null, null];
  }
  if (b === 'uses') return [_list_of_numbers(v, 20, 1, 254, false), null];
  if (b === 'attributes' || b === 'commands') {
    const ws = words_of(v);
    if (b === 'commands' && (!ws.length || ws.length > 6)) {
      return ['up to 6 command IDs 0 to 255 (or none for an unused one): one per level', null];
    }
    if (!ws.length || ws.length > 21) return ['up to 6 numbers 0 to 255 (or none for an unused one), then up to 15 more', null];
    for (const w of ws) {
      if (!word_is_all(w, 'none')) {
        const n = number_of(w);
        if (n === null || n > 255) return [w + ' is not a number from 0 to 255', null];
      }
    }
    return [null, null];
  }
  if (b === 'materia_attr') return [_list_of_numbers(v, 19, 0, 255, false), null];
  if (b === 'materia_grant') {
    if (v === '' || ascii_lower(v) === ':master') return [null, null];
    const n = v.slice(0, 1) === ':' ? number_of(v.slice(1)) : null;
    if (n === null || n > 0xfffffe) return ['leave it empty, or :AP (an AP total), or :master', null];
    return [null, null];
  }
  if (b === 'kernel_spells') {
    const ws = words_of(v);
    if (!ws.length || ws.length > 5) return ['up to five kernel spell IDs (0 to 254) or none', null];
    for (const w of ws) {
      if (!word_is_all(w, 'none')) {
        const n = number_of(w);
        if (n === null || n > 0xfe) return [w + ' is not a kernel spell ID (0 to 254)', null];
      }
    }
    return [null, null];
  }
  if (b === 'materia_list') {
    const ws = words_of(v);
    if (!ws.length) return ['give materia IDs, any or none', null];
    let grants = 0;
    for (const w of ws) {
      if (word_is_all(w, 'any') || word_is_all(w, 'none')) continue;
      const [m, , lv] = partition(w, ':');
      const n = number_of(m);
      if (n === null || n > 0xfe || (w.indexOf(':') >= 0 && (number_of(lv) === null || !(number_of(lv) >= 1 && number_of(lv) <= 20)))) {
        return ['materia must be any, none, or materia IDs from 0 to 254, each optionally :level (1 to 20)', null];
      }
      grants += 1;
    }
    if (grants > 4) return ['at most 4 materia', null];
    return [null, null];
  }
  if (b === 'id') {
    const n = number_of(v);
    return n !== null ? [null, null] : ['expected an ID number', null];
  }
  return check_value_s6a(t, v, folder, values);
}

// ---- S6a: the character, limit and AI types (design 4.2) ---------------------------------------------------------------
// Python's sorted(xs, key=lambda x: (x.lower(), x)) on names (ASCII: pyLower is Python's lower on Latin-1)
function cmp_str(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
export function sorted_lower(xs) {
  return xs.slice().sort((a, b) => cmp_str(pyLower(a), pyLower(b)) || cmp_str(a, b));
}

// The characters port's own words for `key = v` in a character section, or null.
export function port_problem(key, v) {
  const text = '[12]\n' + key + ' = ' + v + '\n';
  for (const p of validate.check_text(CHARACTERS_FILE, text) || []) {
    if (p.line === 2 && p.kind === 'problem') {
      const head = 'character file line 2: ';
      return p.text.startsWith(head) ? p.text.slice(head.length) : p.text;
    }
  }
  return null;
}

export function stat_range(field) {
  if (field === 'level') return [1, 99];
  if (field === 'hp') return [1, 9999];
  if (field === 'mp') return [1, 999];
  return [0, 255];
}

function stat_key(field) {
  for (const [f, k] of STAT_KEYS) if (f === field) return k;
  return null;
}

// The start record of kernel character `n` (0-10) in KERNEL.BIN section 3, or null.
export function kernel_character(folder, n) {
  const secs = folder !== null && folder !== undefined ? folder.kernel_sections() : null;
  if (secs === null || secs.length <= KERNEL_RECORDS_SECTION) return null;
  const sec = secs[KERNEL_RECORDS_SECTION];
  for (let i = 0; i < Math.floor(sec.length / RECORD_SIZE); i++) {
    const r = sec.subarray(i * RECORD_SIZE, (i + 1) * RECORD_SIZE);
    if (r[0] !== n) continue;
    const out = {};
    for (const [f, at, size] of RECORD_FIELDS) out[f] = r[at] | (size === 2 ? r[at + 1] << 8 : 0);
    out.weapon = r[0x1c] < 128 ? 128 + r[0x1c] : null;
    out.armour = r[0x1d] < 32 ? 256 + r[0x1d] : null;
    out.accessory = r[0x1e] < 32 ? 288 + r[0x1e] : null;
    let name = '';
    for (const c of r.subarray(0x10, 0x1c)) if (c < 0xe0) name += String.fromCharCode(c + 0x20);
    out.name = name;
    out.record = i;
    return out;
  }
  return null;
}

// The equip mask of game weapon `item` (128-255) in KERNEL.BIN, or null.
export function weapon_owners(folder, item) {
  const secs = folder !== null && folder !== undefined ? folder.kernel_sections() : null;
  if (secs === null || secs.length <= KERNEL_WEAPON_SECTION || item < 128 || item > 255) return null;
  const sec = secs[KERNEL_WEAPON_SECTION];
  const at = (item - 128) * WEAPON_RECORD + WEAPON_EQUIP;
  if (at + 2 > sec.length) return null;
  return sec[at] | sec[at + 1] << 8;
}

// The game weapons (128-255) whose kernel equip mask has kernel character `owner`'s bit: [] when no kernel is read.
export function weapon_range(folder, owner) {
  const k = KERNEL_CHARACTERS.indexOf(owner === 'aerith' ? 'aeris' : owner);
  const out = [];
  for (let item = 128; item < 256; item++) {
    const m = weapon_owners(folder, item);
    if (m !== null && (m >> k & 1)) out.push(item);
  }
  return out;
}

// [128, 129, 130, 140] -> '128-130, 140'
export function ranges_text(ids) {
  const out = [];
  for (const n of ids) {
    if (out.length && out[out.length - 1][1] === n - 1) out[out.length - 1][1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? String(a) : a + '-' + b)).join(', ');
}

// Name or description `n` of a KERNEL.BIN text section in the form the .ini files hold, or null (no kernel).
export function kernel_text(folder, section, n) {
  const secs = folder !== null && folder !== undefined ? folder.kernel_sections() : null;
  if (secs === null || secs.length <= section) return null;
  let t = ff7_name(secs[section], n);
  if (t === null) return null;
  for (const [a, b] of FF7_PLAIN) t = t.split(a).join(b);
  return t;
}

let REFERENCE = null;
export function reference_data() {
  if (REFERENCE === null) REFERENCE = JSON.parse(fs.readFileSync(CHARACTER_REFERENCE).toString('utf8'));
  return REFERENCE;
}

export const GAME_PREFIX_LAST = 'sm';   // battle.lgp's own prefixes run aa to sm (481 of them; the Characters readme)

// The battle_files values of the characters file's live sections (lower case).
function battle_prefixes_used(folder) {
  const out = [];
  const text = folder.text(CHARACTERS_FILE);
  if (text === null) return out;
  for (const l of new Document(text).lines) {
    if (l.kind === 'key' && ascii_lower(l.key_text()) === 'battle_files') out.push(ascii_lower(l.value_text()));
  }
  return out;
}

// The item IDs of 105-127 that no character's limit_item names and the items file does not define.
export function free_limit_items(folder) {
  const shared = folder.check()[1];
  const taken = new Set();
  if (shared.has('limit_items')) for (const [, v] of shared.get('limit_items')) taken.add(v);
  if (shared.has('items_defined')) for (const v of shared.get('items_defined')) taken.add(v);
  const out = [];
  for (let n = LIMIT_ITEMS[0]; n <= LIMIT_ITEMS[1]; n++) if (!taken.has(n)) out.push(n);
  return out;
}

export function free_limit_item(folder) {
  const free = free_limit_items(folder);
  return free.length ? free[0] : null;
}

// [mask, roster] of the equip line of the weapons file's live section [n], or null when it has none.
function weapon_section_equip(folder, n) {
  const text = folder.text('FF7_SpellExt_Weapons.ini');
  if (text === null) return null;
  const doc = new Document(text);
  const s = find_section(doc, '[' + n + ']');
  if (s === null) return null;
  const keys = section_keys(doc, s.header_index);
  if (!keys.has('equip')) return null;
  const v = keys.get('equip');
  return gc.parse_equip(v, 0, v.length, folder.check()[1]);
}

function shared_has(shared, key, n) { return shared.has(key) && shared.get(key).has(n); }

function check_value_s6a(t, v, folder, values) {
  const b = t.base;
  if (has_char(v, c => c > 0xff)) return ['a character the .ini files cannot hold (one byte per character)', null];
  try {
    Document._check_value(v);            // a line break, a comment: the insert would refuse the value
  } catch (e) {
    if (e instanceof EditRefused) return [e.message, null];
    throw e;
  }
  if (b === 'switch') return ascii_lower(v) === 'on' || ascii_lower(v) === 'off' ? [null, null] : ['expected on or off', null];
  if (b === 'level') return [port_problem('level', v), null];
  if (b === 'gear_id') {
    const what = t.args[0];
    if (words_of(v).length === 1 && word_is_all(v, 'none')) {
      if (t.words.indexOf('none') >= 0) return [null, null];
      return [what !== 'weapon' ? 'expected an ' + what + ' ID' : 'expected a weapon ID', null];
    }
    const prob = port_problem(what, v);
    if (prob) return [prob, null];
    const n = number_of(v);
    if (n === null) return ['expected ' + (what !== 'weapon' ? 'an ' + what : 'a weapon') + ' ID number', null];
    const shared = folder.check()[1];
    if (what === 'weapon') {
      const owner = t.args[1];
      if (n <= 255) {
        if (folder.kernel_sections() === null) {
          return [null, 'no KERNEL.BIN read: whether ' + owner + ' may hold weapon ' + n + ' is not checked'];
        }
        const rng = weapon_range(folder, owner);
        if (rng.indexOf(n) < 0) {
          return ['weapon ' + n + " is not one that " + owner + " may hold (the kernel's equip mask allows " +
                  (ranges_text(rng) || 'none') + ')', null];
        }
        return [null, null];
      }
      if (!shared_has(shared, 'weapons_defined', n)) return ['weapon ' + n + ' is not a section of the weapons file', null];
      const eq = weapon_section_equip(folder, n);
      const me = number_of((values && values.ID) || '');
      const k = KERNEL_CHARACTERS.indexOf(owner === 'aerith' ? 'aeris' : owner);
      if (eq !== null && !(eq[0] >> k & 1) && !(me !== null && me >= 12 && me <= 43 && (eq[1] >> (me - 12) & 1))) {
        return ['weapon ' + n + "'s equip names neither " + owner + ' nor this character', null];
      }
      return [null, null];
    }
    if (what === 'armour' && n >= 384 && !shared_has(shared, 'armour_defined', n)) {
      return ['armour ' + n + ' is not a section of the armour file', null];
    }
    if (what === 'accessory' && n >= 416 && !shared_has(shared, 'accessories_defined', n)) {
      return ['accessory ' + n + ' is not a section of the accessories file', null];
    }
    return [null, null];
  }
  if (b === 'portrait') return [port_problem('portrait', v), null];
  if (b === 'battle_prefix') {
    const prob = port_problem('battle_files', v);
    if (prob) return [prob, null];
    const low = ascii_lower(v);
    if (reference_data().game_prefixes.indexOf(low) >= 0) {
      return [v + " is the prefix of a game model's battle files: choose two other letters", null];
    }
    if (low <= GAME_PREFIX_LAST) {
      return [v + " is one of the game's own battle model prefixes (aa to " + GAME_PREFIX_LAST + ', the Characters readme): ' +
              'choose two other letters, from the end of the alphabet (z..)', null];
    }
    if (battle_prefixes_used(folder).indexOf(low) >= 0) return [v + ' is the battle_files of another character section', null];
    return [null, null];
  }
  if (b === 'ai_word') {
    if (words_of(v).length === 1 && word_in(v, t.args)) return [null, null];
    return ['expected one of: ' + t.args.join(', '), null];
  }
  if (b === 'ai_ref') {
    if (v === '') return ['give the name of an AI file of the ai folder (or one staged on the AI page)', null];
    const prob = port_problem('ai', v);
    if (prob) return [prob, null];
    if (folder.ai_names.concat(folder.ai_pending).some(x => ascii_lower(x) === ascii_lower(v))) return [null, null];
    return ['no AI file ' + v + ' in the ai folder (ai\\' + v + '.ai, the file the DLL reads), and none is staged', null];
  }
  if (b === 'kernel_name' || b === 'kernel_desc') {
    return check_value({ base: b === 'kernel_name' ? 'text31' : 'text95' }, v, folder);
  }
  if (b === 'kernel_stat') return [port_problem(stat_key(t.args[1]), v), null];
  if (b === 'limit_item_id') {
    const n = number_of(v);
    if (n === null || n < LIMIT_ITEMS[0] || n > LIMIT_ITEMS[1]) {
      return ["limit_item must be one of the kernel's unused item IDs, 105 to 127", null];
    }
    const shared = folder.check()[1];
    if (shared.has('limit_items')) {
      for (const [k, item] of [...shared.get('limit_items')].sort((x, y) => x[0] - y[0])) {
        if (item === n) {
          return ['limit_item ' + n + ' is already character ' + k + "'s limit item: each character needs an item ID of " +
                  'its own (105 to 127)', null];
        }
      }
    }
    if (shared_has(shared, 'items_defined', n)) {
      return ['limit_item ' + n + ' is a new item of the items file ([' + n + '] there): use another item ID of 105 to ' +
              '127, or take that section out', null];
    }
    return [null, null];
  }
  return ['no rule for the type ' + b, null];
}

// ---- the parser ------------------------------------------------------------------------------------------------------
// The body text of an indented line, or null when the line is not indented. A line of spaces only is ''.
function _body_line(raw) {
  if (raw.startsWith('    ')) return raw.slice(4);
  if (raw.startsWith('\t')) return raw.slice(1);
  if (raw && pyStrip(raw, ' \t') === '') return '';
  return null;
}

// Where a metadata line's comment starts: a ';' after a space or a tab, outside double quotes (a '#' is not a comment
// there: NAME# and 'Spell #' need it).
export function comment_cut(text) {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') quoted = !quoted;
    else if (c === ';' && !quoted && i > 0 && (text[i - 1] === ' ' || text[i - 1] === '\t')) return i;
  }
  return text.length;
}

// A metadata line -> [key, value] (value with its comment cut and trimmed), or null for a line without '='.
function _meta(body) {
  const text = body.slice(0, comment_cut(body));
  if (text.indexOf('=') < 0) return null;
  const [k, , v] = partition(text, '=');
  return [pyLower(trimmed(k)), trimmed(v)];
}

function new_template(ident, line) {
  return { id: ident, title: '', kind: '', file: '', notes: [], placeholders: [], derived: [], warns: [],
           source: null, exclusive: [], parts: [new_part('', line)], line };
}

function new_part(file, line) {
  return { file, kind: '', position: 'end', repeat: null, when: null, lines: null, line };
}

// The template file's text -> {templates, problems: [[line, text, template id]], blocks: [[first line, last line,
// template id or null]]} (lines 1-based). A template with a problem is not in `templates`; the others are.
export function parse(text, schema_kinds) {
  const raw_lines = _split_raw(text);
  const bodies = raw_lines.map(r => (r.endsWith('\r\n') ? r.slice(0, -2) : r.endsWith('\n') ? r.slice(0, -1) : r));
  const templates = [];
  const problems = [];
  const blocks = [];
  let cur = null;
  let cur_problems = [];
  let body = null;          // the list being filled, while in a body
  let block_first = 1;

  const close = (last_line) => {
    if (cur !== null) {
      for (const p of check_template(cur, schema_kinds)) cur_problems.push(p);
      for (const p of cur_problems) problems.push([p[0], p[1], cur.id]);
      if (!cur_problems.length) templates.push(cur);
    }
    blocks.push([block_first, last_line, cur !== null ? cur.id : null]);
    cur = null;
    cur_problems = [];
  };

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    const n = i + 1;
    if (body !== null) {
      const got = _body_line(b);
      if (got !== null) {
        if (got.indexOf('\r') >= 0) cur_problems.push([n, 'a body line holds a carriage return without its line feed']);
        body.push(got);
        continue;
      }
      body = null;
    }
    const stripped = trimmed(b);
    if (stripped.slice(0, 1) === '[') {
      const head = stripped.slice(0, comment_cut(stripped));
      const m = TEMPLATE_HEAD.exec(trimmed(head));
      if (m) {
        if (cur !== null || n > 1) close(n - 1);
        block_first = n;
        cur = new_template(m[1], n);
        if (templates.some(t => t.id === cur.id)) cur_problems.push([n, 'a second template with the id ' + cur.id]);
        continue;
      }
    }
    if (stripped === '' || stripped.slice(0, 1) === ';' || stripped.slice(0, 1) === '#') continue;
    if (_body_line(b) !== null) {
      const why = 'an indented line outside a body (a blank line ends a body: write a blank body line as four spaces)';
      if (cur === null) problems.push([n, why, null]);
      else cur_problems.push([n, why]);
      continue;
    }
    if (cur === null) {
      problems.push([n, 'a line before the first [template ...]', null]);
      continue;
    }
    if (stripped === 'lines' || ascii_lower(stripped) === 'lines') {
      const part = cur.parts[cur.parts.length - 1];
      if (part.lines !== null) cur_problems.push([n, 'a second lines for one part']);
      part.lines = [];
      body = part.lines;
      continue;
    }
    const kv = _meta(b);
    if (kv === null) {
      cur_problems.push([n, 'expected key = value, lines, or a body indented by four spaces']);
      continue;
    }
    const [k, v] = kv;
    const part = cur.parts[cur.parts.length - 1];
    const first = cur.parts.length === 1;
    if (k === 'title') cur.title = v;
    else if (k === 'kind') {
      part.kind = v;
      if (first) cur.kind = v;
    } else if (k === 'file') {
      if (!first) cur_problems.push([n, "file is the first part's: a part names its file on its part line"]);
      part.file = v;
      cur.file = v;
    } else if (k === 'note') cur.notes.push(v);
    else if (k === 'warn') cur.warns.push(v);
    else if (k === 'source') cur.source = v;
    else if (k === 'position') part.position = v;
    else if (k === 'repeat') part.repeat = v;
    else if (k === 'when') {
      if (first) cur_problems.push([n, 'when is for a part after the first (the first part is always emitted)']);
      part.when = v;
    } else if (k === 'exclusive') cur.exclusive.push(v.split(',').map(x => trimmed(x)));
    else if (k === 'part') {
      if (!v) cur_problems.push([n, 'part = names the file of the part']);
      cur.parts.push(new_part(v, n));
    } else if (k === 'placeholder') {
      const f = split_fields(v, 4);
      while (f.length < 4) f.push(null);
      const [name, typ, default0, label] = f;
      const deflt = default0 === null ? '' : default0;
      if (!name || !PH_NAME.test(name)) {
        cur_problems.push([n, 'a placeholder name is capitals, digits and _ (NAME, or NAME# in a repeated part)']);
        continue;
      }
      if (cur.placeholders.some(p => p.name === name) || cur.derived.some(d => d.name === name)) {
        cur_problems.push([n, 'a second placeholder ' + name]);
        continue;
      }
      const pt = parse_type(typ || '');
      if (typeof pt === 'string') {
        cur_problems.push([n, pt]);
        continue;
      }
      cur.placeholders.push({ name, type: typ, default: deflt, label, part: cur.parts.length - 1, line: n });
    } else if (k === 'derived') {
      const [name0, , rest] = partition(v, '=');
      const name = trimmed(name0);
      const pieces = rest.split(';');
      const expr = trimmed(pieces[0]);
      const words = [];
      let bad = !PH_NAME.test(name) || name.endsWith('#') || !expr;
      for (const piece of pieces.slice(1)) {
        const [w0, , val0] = partition(piece, '=');
        const w = trimmed(w0);
        const val = trimmed(val0);
        if (!w || number_of(val) === null) bad = true;
        words.push([w, val]);
      }
      if (bad) {
        cur_problems.push([n, 'derived = NAME = expression[; word = number]...']);
        continue;
      }
      if (cur.placeholders.some(p => p.name === name) || cur.derived.some(d => d.name === name)) {
        cur_problems.push([n, 'a second placeholder ' + name]);
        continue;
      }
      cur.derived.push({ name, expr, words, line: n });
    } else {
      cur_problems.push([n, 'unknown key ' + k + ' (the keys: ' + TEMPLATE_KEYS.join(', ') + ')']);
    }
  }
  if (cur !== null || bodies.length) close(bodies.length);
  return { templates, problems, blocks };
}

// The placeholders of a body line: [[name, '#' or '', segment rest or null, segment sep or null]].
function _tokens(line) {
  const out = [];
  for (const m of line.matchAll(bodyToken())) {
    if (m[1] !== undefined) out.push([m[1], m[2], null, null]);
    else out.push([m[3], '#', m[4], m[5]]);
  }
  return out;
}

function _expr_names(expr) {
  return [...expr.matchAll(new RegExp(NAME, 'g'))].map(m => m[0]);
}

// A gated body line -> [negated, switch name, the line without its gate]; null for a line without a gate.
export function gate_of(line) {
  const m = GATE_RE.exec(line);
  if (!m) return null;
  return [m[1] === '!', m[2], line.slice(m[0].length)];
}

function is_switch(t, name) {
  const p = t.placeholders.find(x => x.name === name);
  return p !== undefined && parse_type(p.type).base === 'switch';
}

// A warn line -> [[[negated, switch]], text]: the switches it is shown under ([] when it names none).
export function warn_condition(t, text) {
  const m = WARN_IF.exec(text);
  if (m) {
    const conds = m[1].split(/ +/).filter(w => w).map(w => [w[0] === '!', w.replace(/^!+/, '')]);
    if (conds.every(([, n]) => is_switch(t, n))) return [conds, text.slice(m[0].length)];
  }
  return [[], text];
}

// The problems of a parsed template: [[line, text]].
export function check_template(t, schema_kinds) {
  const out = [];
  const n = t.line;
  if (!t.title) out.push([n, 'a template needs a title']);
  const names = new Map(t.placeholders.map(p => [p.name, p]));
  const derived = new Map(t.derived.map(d => [d.name, d]));
  const used = new Set();
  t.parts.forEach((part, k) => {
    if (!part.file) {
      out.push([part.line, k === 0 ? 'the first part needs file =' : 'part = names the file']);
      return;
    }
    const kinds = kinds_of_file(part.file);
    if (kinds === null) out.push([part.line, 'templates make sections of ' + FILE_KINDS.map(([f]) => f).join(', ') + ' only']);
    else if (kinds.indexOf(part.kind) < 0) out.push([part.line, 'kind must be one of ' + kinds.join(', ') + ' for ' + part.file]);
    if (part.lines === null) {
      out.push([part.line, 'a part needs lines']);
      return;
    }
    const pos = position_parts(part.position);
    if (pos === null) {
      out.push([part.line, 'position must be end, after:[header], before:[header], into:[header] or into:[header] create']);
    } else {
      for (const [name] of _tokens(pos[1] || '')) {
        used.add(name);
        if (!names.has(name)) out.push([part.line, 'the position names <' + name + '>, which is not declared']);
      }
    }
    if (part.repeat !== null) {
      const p = names.get(part.repeat);
      if (p === undefined || parse_type(p.type).base !== 'count') out.push([part.line, 'repeat names a count placeholder']);
      used.add(part.repeat);
    }
    if (part.when !== null && part.when !== undefined) {
      used.add(part.when);
      if (!is_switch(t, part.when)) out.push([part.line, 'when names a switch placeholder']);
    }
    for (const line of part.lines) {
      let segs = 0;
      const g = gate_of(line);
      if (g !== null) {
        used.add(g[1]);
        if (!is_switch(t, g[1])) out.push([part.line, 'the gate <?' + (g[0] ? '!' : '') + g[1] + '> names no switch placeholder']);
        if (part.repeat !== null) out.push([part.line, 'a gated line in a repeated part']);
        if (new LineView(0, g[2]).kind === 'section') {
          out.push([part.line, 'a gated line cannot be a section header (closed, the lines after it would join the section above)']);
        }
      }
      const toks = _tokens(line);
      for (const [name, hashed, rest] of toks) {
        const key = rest === null ? name + hashed : name + '#';
        used.add(key);
        if (!names.has(key) && !derived.has(key)) {
          out.push([part.line, 'the body names <' + key + '>, which is not declared']);
          continue;
        }
        const p = names.get(key);
        if (rest !== null) {
          segs += 1;
          if (part.repeat !== null) out.push([part.line, 'a repeat segment is for a part that is not repeated']);
        } else if (hashed && part.repeat === null) {
          out.push([part.line, '<' + key + '> is for a repeated part']);
        } else if (hashed && p !== undefined && repeat_of(t, p) && repeat_of(t, p) !== part.repeat) {
          out.push([part.line, '<' + key + '> is repeated by ' + repeat_of(t, p) + ', this part by ' + part.repeat]);
        }
        if (p !== undefined && hashed && !repeat_of(t, p)) out.push([p.line, key + ' is declared in a part without repeat']);
      }
      if (segs > 1) out.push([part.line, 'one repeat segment per line']);
    }
  });
  for (const d of t.derived) {
    for (const name of _expr_names(d.expr)) {
      if (name === 'min' || name === 'max') continue;
      used.add(name);
      const p = names.get(name);
      if (p === undefined && !derived.has(name)) {
        out.push([d.line, 'derived names ' + name + ', which is not declared']);
        continue;
      }
      if (p !== undefined) {
        const pt = parse_type(p.type);
        if (pt.base !== 'int' && pt.base !== 'count') out.push([d.line, 'derived uses ' + name + ', which is not a number']);
        for (const w of pt.words) {
          if (!d.words.some(x => ascii_lower(x[0]) === ascii_lower(w))) {
            out.push([d.line, name + ' may be the word ' + w + ': give a clause "; ' + w + ' = number"']);
          }
        }
      }
    }
    try {
      const env = new Map(_expr_names(d.expr).map(x => [x, 1]));
      _eval(d.expr, env);
    } catch (e) {
      if (!(e instanceof TemplateProblem)) throw e;
      out.push([d.line, e.message]);
    }
  }
  for (const x of t.exclusive || []) {
    for (const name of x) {
      used.add(name);
      if (!is_switch(t, name)) out.push([n, 'exclusive names ' + name + ', which is not a switch placeholder']);
    }
    if (x.length < 2) out.push([n, 'exclusive names two switches at least']);
  }
  for (const p of t.placeholders) {
    const pt = parse_type(p.type);
    if (pt.base === 'materia_attr') {
      used.add(pt.args[0]);
      if (!names.has(pt.args[0])) out.push([p.line, 'materia_attr names ' + pt.args[0] + ', which is not declared']);
    }
    if (pt.base === 'switch' && pt.args.length) {
      used.add(pt.args[0]);
      if (!is_switch(t, pt.args[0]) || pt.args[0] === p.name) {
        out.push([p.line, 'switch(' + pt.args[0] + ') names no other switch placeholder']);
      }
    }
    if (!used.has(p.name)) out.push([p.line, 'the placeholder ' + p.name + ' is not used']);
    if (p.default !== '' && pt.base !== 'id') {
      if (p.name.endsWith('#')) continue;
      const prob = pt.base !== 'equip' && pt.base !== 'animation' ? check_value(pt, p.default, new Folder(new Map()))[0] : null;
      if (prob) out.push([p.line, 'the default of ' + p.name + ': ' + prob]);
    }
  }
  for (const d of t.derived) if (!used.has(d.name)) out.push([d.line, 'the derived ' + d.name + ' is not used']);
  return out;
}

// The count placeholder that repeats a NAME# placeholder: its part's repeat.
export function repeat_of(t, p) { return t.parts[p.part].repeat; }

// 'end' | 'after:[h]' | 'before:[h]' | 'into:[h]' | 'into:[h] create' -> [what, header, create] or null.
export function position_parts(position) {
  const p = trimmed(position || '');
  if (p === 'end') return ['end', null, false];
  const m = /^(after|before|into):(\[[^\]]*\])( create)?$/.exec(p);
  if (!m || (m[3] && m[1] !== 'into')) return null;
  return [m[1], m[2], Boolean(m[3])];
}

// ---- emit (parse -> emit -> parse is the identity) --------------------------------------------------------------------
// One template as lines of text (no line endings), in the canonical form.
export function emit(t) {
  const out = ['[template ' + t.id + ']', 'title = ' + t.title];
  const first = t.parts[0];
  out.push('kind = ' + first.kind);
  out.push('file = ' + first.file);
  for (const n of t.notes) out.push('note = ' + n);
  for (const w of t.warns) out.push('warn = ' + w);
  if (t.source !== null) out.push('source = ' + t.source);
  const placeholders = (k) => {
    for (const p of t.placeholders) {
      if (p.part !== k) continue;
      const f = [p.name, p.type];
      if (p.default !== '' || p.label !== null) f.push(quote_field(p.default));
      if (p.label !== null) f.push(p.label);
      out.push('placeholder = ' + f.join(', '));
    }
  };
  placeholders(0);
  for (const d of t.derived) out.push('derived = ' + d.name + ' = ' + d.expr + d.words.map(([w, v]) => '; ' + w + ' = ' + v).join(''));
  for (const x of t.exclusive || []) out.push('exclusive = ' + x.join(', '));
  t.parts.forEach((part, k) => {
    if (k) {
      out.push('part = ' + part.file);
      out.push('kind = ' + part.kind);
      if (part.when !== null && part.when !== undefined) out.push('when = ' + part.when);
      placeholders(k);
    }
    if (part.position !== 'end' || k) out.push('position = ' + part.position);
    if (part.repeat !== null) out.push('repeat = ' + part.repeat);
    out.push('lines');
    for (const line of part.lines || []) out.push('    ' + line);
  });
  return out;
}

// A template without its line numbers (what parse -> emit -> parse keeps).
export function comparable(t) {
  const c = Object.assign({}, t);
  delete c.line;
  const strip = x => { const o = Object.assign({}, x); delete o.line; return o; };
  c.placeholders = t.placeholders.map(strip);
  c.derived = t.derived.map(strip);
  c.parts = t.parts.map(strip);
  return c;
}

// ---- derived values --------------------------------------------------------------------------------------------------
// Integer arithmetic: + - * / (floor division), min(a, b, ...), max(...), ( ), numbers and names. Every value stays
// within 2^53 - 1 (Python's ints would go on; doubles would not): past it is a TemplateProblem on both sides.
function _eval(expr, env) {
  const re = new RegExp('[ \\t]*(?:([0-9]+)|(' + NAME + '|min|max)|([^\\n]))', 'y');
  const toks = [];
  let pos = 0;
  while (pos < expr.length) {
    re.lastIndex = pos;
    const m = re.exec(expr);
    if (!m || re.lastIndex === pos) break;
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push(['n', Number(m[1])]);
    else if (m[2] !== undefined) toks.push(['w', m[2]]);
    else if (m[3] !== undefined) {
      if ('+-*/(),'.indexOf(m[3]) < 0) throw new TemplateProblem('derived: unexpected ' + m[3] + ' in ' + expr);
      toks.push(['o', m[3]]);
    }
  }
  let k = 0;
  const safe = v => {
    if (Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new TemplateProblem('derived: a value past ' + Number.MAX_SAFE_INTEGER + ' in ' + expr);
    return v;
  };
  // floor division done exactly (a double quotient can round up to the next integer near 2^53)
  const fdiv = (a, b) => {
    const A = BigInt(a), B = BigInt(b);
    let q = A / B;
    if (A % B !== 0n && ((A < 0n) !== (B < 0n))) q -= 1n;
    return Number(q);
  };
  const peek = () => (k < toks.length ? toks[k] : ['e', null]);
  const take = () => { const t = peek(); k += 1; return t; };
  const is = (t, kind, v) => t[0] === kind && t[1] === v;
  const atom = () => {
    const t = take();
    if (t[0] === 'n') return safe(t[1]);
    if (is(t, 'o', '-')) return -atom();
    if (is(t, 'o', '(')) {
      const v = sum_();
      if (!is(take(), 'o', ')')) throw new TemplateProblem('derived: a ( without its ) in ' + expr);
      return v;
    }
    if (t[0] === 'w' && (t[1] === 'min' || t[1] === 'max')) {
      if (!is(take(), 'o', '(')) throw new TemplateProblem('derived: ' + t[1] + '( ... ) in ' + expr);
      const args = [sum_()];
      while (is(peek(), 'o', ',')) {
        take();
        args.push(sum_());
      }
      if (!is(take(), 'o', ')')) throw new TemplateProblem('derived: a ( without its ) in ' + expr);
      return t[1] === 'min' ? Math.min(...args) : Math.max(...args);
    }
    if (t[0] === 'w') {
      if (!env.has(t[1])) throw new TemplateProblem('derived: ' + t[1] + ' has no value');
      return safe(env.get(t[1]));
    }
    throw new TemplateProblem('derived: cannot read ' + expr);
  };
  const product = () => {
    let v = atom();
    while (is(peek(), 'o', '*') || is(peek(), 'o', '/')) {
      const op = take()[1];
      const r = atom();
      if (op === '*') v = v * r;
      else {
        if (r === 0) throw new TemplateProblem('derived: a division by 0 in ' + expr);
        v = fdiv(v, r);
      }
      safe(v);
    }
    return v;
  };
  const sum_ = () => {
    let v = product();
    while (is(peek(), 'o', '+') || is(peek(), 'o', '-')) {
      const op = take()[1];
      const r = product();
      v = safe(op === '+' ? v + r : v - r);
    }
    return v;
  };
  const v = sum_();
  if (k !== toks.length) throw new TemplateProblem('derived: cannot read ' + expr);
  return v;
}

// ---- the kernel's names and materia bytes --------------------------------------------------------------------------
// One name of a KERNEL.BIN text section: the FF7 text up to 0xff (0xf8 and its byte: a colour; other codes from 0xe0
// skipped).
export function ff7_name(sec, index) {
  if (sec.length < 2) return null;
  const count = Math.floor((sec[0] | (sec[1] << 8)) / 2);
  if (index >= count || 2 * index + 1 >= sec.length) return null;
  let o = sec[2 * index] | (sec[2 * index + 1] << 8);
  let out = '';
  while (o < sec.length && sec[o] !== 0xff) {
    const c = sec[o];
    o += 1;
    if (c < 0xe0) out += String.fromCharCode(c + 0x20);
    else if (c === 0xf8) o += 1;
  }
  return out;
}

// [[number, name]] of a kind of the game's records, from KERNEL.BIN; [] when no kernel is read.
export function kernel_names(folder, what) {
  const secs = folder.kernel_sections();
  if (secs === null) return [];
  const hit = KERNEL_NAME_SECTION.find(([k]) => k === what);
  const idx = hit ? hit[1] : undefined;
  if (idx === undefined || idx >= secs.length) return [];
  const out = [];
  for (let i = 0; i < kernel_count(what); i++) {
    const nm = ff7_name(secs[idx], i);
    if (nm === null) break;
    out.push([i, nm]);
  }
  return out;
}

// The first attribute byte of the game's materia `base`: from KERNEL.BIN when read, else the readme's table;
// [byte, where from] or [null, null].
export function materia_attr_byte(folder, base) {
  const secs = folder.kernel_sections();
  if (secs !== null && secs.length > KERNEL_MATERIA_SECTION) {
    const sec = secs[KERNEL_MATERIA_SECTION];
    const at = base * MATERIA_RECORD + MATERIA_ATTRIBUTES;
    if (base >= 0 && at < sec.length) return [sec[at], 'KERNEL.BIN'];
  }
  for (const [b, v] of README_MATERIA_ATTR) if (b === base) return [v, 'the Materia readme'];
  return [null, null];
}

// ---- IDs (design 4.3) ------------------------------------------------------------------------------------------------
function section_kind_fn(file) { return h => validate.section_kind(file, h); }

// The numbers of the live headers of `file` its reader takes ([[number, line]]).
export function live_ids(folder, file) {
  const out = [];
  const names = [file].concat(pyLower(file) === 'ff7_spellext_spells.ini' ? [SPELL_TEST_FILE] : []);
  for (const f of names) {
    const text = folder.text(f);
    if (text === null) continue;
    for (const l of new Document(text).lines) {
      if (l.kind === 'section') {
        const h = l.header_text();
        const n = header_number(h);
        if (n !== null && validate.section_kind(file, h)) out.push([n, l.index + 1]);
      }
    }
  }
  return out;
}

export function commented_ids(folder, file, used) {
  const text = folder.text(file);
  if (text === null) return [];
  const out = [];
  for (const [a, , h] of new Document(text).commented_blocks(section_kind_fn(file))) {
    const n = header_number(h);
    if (n !== null && !used.has(n) && out.every(x => x.id !== n)) out.push({ id: n, line: a + 1, ai_mentions: ai_mentions(folder, n) });
  }
  return out;
}

// The ai\*.txt files whose text names `n` as a whole token, in decimal or hex (best effort: the .ai files are not
// disassembled here).
export function ai_mentions(folder, n) {
  const pat = new RegExp('(?<![0-9A-Za-z_])(?:' + n + '|0[xX]0*' + n.toString(16) + ')(?![0-9A-Za-z_])', 'i');
  const out = [];
  for (const [name, text] of folder.ai_texts) if (pat.test(text)) out.push(name);
  return out;
}

// Whether the wide range of a gear or item kind is read: items with wide_items = on, gear with box on or auto.
function wide_on(folder, kind) {
  const shared = folder.check()[1];
  if (kind === 'item') return game_key(folder, 'wide_items') === 'on';
  return gc.gear_wide_sections(shared);
}

// The last value of a key of the game file, lower case, or null.
export function game_key(folder, key) {
  const text = folder.text('FF7_SpellExt_Game.ini');
  if (text === null) return null;
  let v = null;
  for (const l of new Document(text).lines) if (l.kind === 'key' && pyLower(l.key_text()) === key) v = pyLower(l.value_text());
  return v;
}

function limit_item_values(folder) {
  const shared = folder.check()[1];
  return shared.has('limit_items') ? [...shared.get('limit_items').values()] : [];
}

export function used_ids(folder, kind, file) {
  let used = live_ids(folder, file).map(([n]) => n);
  if (kind === 'item') used = used.concat(limit_item_values(folder));
  return used;
}

export function full_text(kind, folder) {
  const [k, ranges] = id_rules(kind);
  if (Object.prototype.hasOwnProperty.call(GEAR_INDEX, k)) {
    const kk = gc._K[GEAR_INDEX[k]];
    const room = gc.ROOM[GEAR_INDEX[k]];
    const shared = folder.check()[1];
    return 'no free ID: ' + cfmt(gc.FMT_MORE, kk[2], kk[3], kk[5], cfmt(gc.FMT_FULL, room), kk[2], kk[4], kk[8], kk[8],
                                 kk[9], k === 'item' ? 'wide_items = on' : 'box = on or auto and wide_items = on',
                                 k !== 'item' && !gc.gear_wide_sections(shared) ? '; box is off now' : '');
  }
  const [lo, hi] = ranges[0];
  return 'no free ID: ' + k + ' IDs are ' + lo + ' to ' + hi + ' (all ' + (hi - lo + 1) + ' are used)';
}

// The next free ID of a kind in its file (null when the ranges are full), and the commented IDs.
export function next_free(folder, kind, file, avoid, skip_commented) {
  avoid = avoid || [];
  if (skip_commented === undefined) skip_commented = true;
  const [k, ranges, wide] = id_rules(kind);
  const used = new Set(used_ids(folder, k, file));
  const commented = commented_ids(folder, file, used);
  const skip = new Set([...used, ...avoid].concat(skip_commented ? commented.map(c => c.id) : []));
  const spans = ranges.slice();
  if (wide !== null && wide_on(folder, k)) spans.push(wide);
  if (k === 'spell') {
    const top = Math.max(...[...used].filter(n => ranges[0][0] <= n && n <= ranges[0][1]), ...avoid, ranges[0][0] - 1);
    for (let n = top + 1; n <= ranges[0][1]; n++) if (!skip.has(n)) return [n, commented];
  }
  for (const [lo, hi] of spans) {
    for (let n = lo; n <= hi; n++) if (!skip.has(n)) return [n, commented];
  }
  return [null, commented];
}

export function range_text(kind, folder) {
  const [k, ranges, wide] = id_rules(kind);
  let t = ranges.map(([a, b]) => a + '-' + b).join(', then ');
  if (wide !== null) t += '; wide ' + wide[0] + '-' + wide[1] + ' (' + (wide_on(folder, k) ? 'read' : 'off') + ')';
  return t;
}

// The id placeholders of a template, expanded for the copies: [[name, part]] in order.
export function id_placeholders(t, values, with_placeholder) {
  const out = [];
  for (const p of t.placeholders) {
    if (parse_type(p.type).base !== 'id') continue;
    if (p.name.endsWith('#')) {
      const n = count_value(t, repeat_of(t, p), values);
      for (let k = 1; k <= n; k++) out.push([p.name.slice(0, -1) + k, t.parts[p.part]].concat(with_placeholder ? [p] : []));
    } else {
      out.push([p.name, t.parts[p.part]].concat(with_placeholder ? [p] : []));
    }
  }
  return out;
}

function value_of(values, name, fallback) {
  const v = values instanceof Map ? values.get(name) : values[name];
  return v === undefined || v === null ? fallback : v;
}

export function count_value(t, name, values) {
  const p = t.placeholders.filter(x => x.name === name)[0];
  const v = trimmed(value_of(values, name, p.default));
  const n = number_of(v);
  const pt = parse_type(p.type);
  if (n === null || n < pt.lo || n > pt.hi) throw new TemplateProblem(name + ': expected a number from ' + pt.lo + ' to ' + pt.hi);
  return n;
}

// The next free ID for each id placeholder (the copies of a bundle allocated together, distinct); only for the parts
// the switches emit. A character ID also carries the three checks of design 4.3 for `next` and the leftover groups.
export function suggest(t, values, folder) {
  const out = {};
  const taken = new Map();
  const sw = switch_values(t, values)[0];
  const emitted = emitted_parts(t, sw);
  const live = live_names(t, sw, emitted);
  for (const [name, part, p] of id_placeholders(t, values, true)) {
    if (emitted.indexOf(p.part) < 0 || !live.has(p.name)) continue;
    const kind = part.kind;
    const key = pyLower(part.file);
    if (!taken.has(key)) taken.set(key, []);
    const avoid = taken.get(key);
    const [n, commented] = next_free(folder, kind, part.file, avoid);
    out[name] = { next: n, commented, range: range_text(kind, folder), refused: n !== null ? null : full_text(kind, folder) };
    if (kind === 'character' && pyLower(part.file) === pyLower(CHARACTERS_FILE)) {
      out[name].checks = n !== null ? character_checks(folder, n) : null;
      out[name].leftovers = leftover_groups(folder);
    }
    if (n !== null) avoid.push(n);
  }
  return out;
}

// ---- S6a: the character checks (design 4.3), the leftover groups, the prerequisites ------------------------------------
// Map {character ID: [{header, line}]} of the limits file's live sections ([N], [N L-P], [N state ...]).
export function limit_groups(folder) {
  const out = new Map();
  const text = folder.text(LIMITS_FILE);
  if (text === null) return out;
  for (const l of new Document(text).lines) {
    if (l.kind !== 'section') continue;
    const h = l.header_text();
    const sk = validate.section_kind(LIMITS_FILE, h);
    if (sk === 'character' || sk === 'limit' || sk === 'set_limit' || sk === 'state') {
      const n = grammar.parse_number(h, 1, h.length)[2];
      if (!out.has(n)) out.set(n, []);
      out.get(n).push({ header: h, line: l.index + 1 });
    }
  }
  return out;
}

function character_ids(folder) { return new Set(live_ids(folder, CHARACTERS_FILE).map(([n]) => n)); }

// The limits file's groups whose character the characters file does not define: [{id, sections}].
export function leftover_groups(folder) {
  const defined = character_ids(folder);
  return [...limit_groups(folder)].sort((a, b) => a[0] - b[0]).filter(([n]) => !defined.has(n))
    .map(([n, secs]) => ({ id: n, sections: secs }));
}

// What the folder says of character ID `n` (design 4.3): the limits sections it would adopt, the gear whose equip
// names it, and where it was used before. Each is a warning, never a refusal.
export function character_checks(folder, n) {
  const limits = limit_groups(folder).get(n) || [];
  const equip = [];
  const shared = folder.check()[1];
  for (const f of GEAR_FILES) {
    const text = folder.text(f);
    if (text === null) continue;
    const doc = new Document(text);
    for (const sec of doc.sections()) {
      if (sec.header_index === null) continue;
      for (const l of doc.key_lines(sec)) {
        if (ascii_lower(l.key_text()) !== 'equip') continue;
        const v = l.value_text();
        const got = gc.parse_equip(v, 0, v.length, shared);
        if (got !== null && n >= 12 && n <= 43 && (got[1] >> (n - 12) & 1)) {
          equip.push({ file: f, header: doc.lines[sec.header_index].header_text(), line: l.index + 1, value: v });
        }
      }
    }
  }
  const used = [];
  const text = folder.text(CHARACTERS_FILE);
  if (text !== null) {
    for (const [a, , h] of new Document(text).commented_blocks(section_kind_fn(CHARACTERS_FILE))) {
      if (header_number(h) === n) used.push({ where: 'commented', file: CHARACTERS_FILE, line: a + 1 });
    }
  }
  for (const path of sorted_lower([...folder.backups.keys()])) {
    for (const l of new Document(folder.backups.get(path)).lines) {
      if (l.kind === 'section' && validate.section_kind(CHARACTERS_FILE, l.header_text()) && header_number(l.header_text()) === n) {
        used.push({ where: 'backup', file: path, line: l.index + 1 });
        break;
      }
    }
  }
  return { limits_sections: limits, equip_lines: equip, used_before: used };
}

// The three checks as the tool's warnings.
export function check_lines(n, checks) {
  const out = [];
  if (checks.limits_sections.length) {
    out.push('the limits file has ' + checks.limits_sections.map(x => x.header).join(', ') + ': character ' + n + ' would adopt them');
  }
  for (const e of checks.equip_lines) {
    out.push(e.file + ' ' + e.header + ' line ' + e.line + ' has equip = ' + e.value + ': that gear would become character ' + n + "'s");
  }
  for (const u of checks.used_before) {
    if (u.where === 'commented') {
      out.push(u.file + ' line ' + u.line + ' holds a commented-out [' + n + "]: a save's companion .sxc may still carry a record for " +
               n + ' (the folder shows it was used before; the saves are not read)');
    } else {
      out.push(u.file + ' has a [' + n + '] (line ' + u.line + "): a save's companion .sxc may still carry a record for " + n +
               ' (the folder shows it was used before; the saves are not read)');
    }
  }
  return out;
}

// For each new character section: the game file's keys it needs, shown and never edited (design 4.8.6).
export function prerequisites(steps, after) {
  const out = [];
  for (const [file, header, n, keys] of new_sections(steps, after)) {
    if (pyLower(file) !== pyLower(CHARACTERS_FILE) || n === null || validate.section_kind(file, header) !== 'character') continue;
    const fm = keys.has('field_model') ? keys.get('field_model') : null;
    if (fm !== null && ascii_lower(fm) !== 'none') {
      const fe = game_key(after, 'field_entities');
      const ok = fe === 'party' || fe === 'seats';
      out.push({ what: 'field_entities', ok,
                 text: ok ? 'field_entities = ' + fe + ': the field model is used'
                   : 'needs field_entities = party or seats in the game file (it is ' + (fe || 'off, the default') +
                     '): without it the field model is not used' });
    }
    if (n <= 15) {
      const sv = number_of(game_key(after, 'seats') || '4');
      const seats = sv === 2 || sv === 4 ? sv : 4;
      const ok = n <= 11 + seats;
      out.push({ what: 'seats', ok,
                 text: ok ? 'seats = ' + seats + ': ' + n + ' is one of the IDs a field script can name (12-' + (11 + seats) + ')'
                   : 'needs seats = 4 in the game file (it is ' + seats + '): with ' + seats + ' seats a field script names 12-' +
                     (11 + seats) + ' only' });
    } else {
      const dv = game_key(after, 'debug');
      const ok = dv === 'true' || dv === 'yes';
      out.push({ what: 'debug', ok,
                 text: ok ? 'debug = ' + dv + ': the External Characters screen can bring ' + n + ' in'
                   : 'needs debug = true in the game file: an ID above 15 joins only through the External Characters ' +
                     'screen (or by taking a seat)' });
    }
  }
  return out;
}

// Whether ID `n` may be given to a new section of the part's kind: a problem or null.
export function check_id(folder, part, n, taken) {
  const kind = part.kind;
  const h = '[' + n + ']';
  const sk = validate.section_kind(part.file, h);
  const [k] = id_rules(kind);
  if (sk === null || sk === undefined || (sk !== k && sk !== 'wide_' + k)) {
    return '[' + n + '] is not a number for a new ' + k + ' (' + range_text(kind, folder) + ')';
  }
  if (used_ids(folder, k, part.file).indexOf(n) >= 0 || taken.indexOf(n) >= 0) {
    if (k === 'item' && limit_item_values(folder).indexOf(n) >= 0) {
      return "item " + n + " is a character's limit_item in the limits file";
    }
    return '[' + n + '] is already used in ' + part.file;
  }
  return null;
}

// ---- filling ---------------------------------------------------------------------------------------------------------
// The placeholders with their copies: [[name, placeholder, copy]] (NAME# -> NAME1..NAMEn).
export function expanded(t, values) {
  const out = [];
  for (const p of t.placeholders) {
    if (p.name.endsWith('#')) {
      const n = count_value(t, repeat_of(t, p), values);
      for (let k = 1; k <= n; k++) out.push([p.name.slice(0, -1) + k, p, k]);
    } else {
      out.push([p.name, p, 0]);
    }
  }
  return out;
}

function default_of(p, k) {
  const d = p.default || '';
  return k ? d.split('#').join(String(k)) : d;
}

// {switch: on (true) or off} from the values given, else the defaults; and the problems of a value neither on nor off.
export function switch_values(t, values) {
  const out = {};
  const probs = [];
  for (const p of t.placeholders) {
    if (parse_type(p.type).base !== 'switch') continue;
    const given = value_of(values, p.name, null);
    const v = ascii_lower(trimmed(given !== null ? given : p.default));
    if (v !== 'on' && v !== 'off') probs.push(p.name + ': expected on or off');
    out[p.name] = v === 'on';
  }
  return [out, probs];
}

// The parts emitted under the switches: the first always, another unless its `when` switch is off.
export function emitted_parts(t, sw) {
  const out = [];
  t.parts.forEach((part, k) => {
    if (k === 0 || part.when === null || part.when === undefined || sw[part.when]) out.push(k);
  });
  return out;
}

function gate_open(g, sw) { return g === null || Boolean(sw[g[1]]) !== g[0]; }

function token_key(name, hashed, rest) { return rest === null ? name + hashed : name + '#'; }

// The placeholders written for real: on the open lines and in the positions and repeats of the emitted parts, and
// what the derived ones and a materia_attr of those need.
export function live_names(t, sw, emitted) {
  const live = new Set();
  for (const k of emitted) {
    const part = t.parts[k];
    const pos = position_parts(part.position);
    for (const [name, hashed, rest] of _tokens(pos ? (pos[1] || '') : '')) live.add(token_key(name, hashed, rest));
    if (part.repeat !== null) live.add(part.repeat);
    for (const line of part.lines || []) {
      const g = gate_of(line);
      if (!gate_open(g, sw)) continue;
      for (const [name, hashed, rest] of _tokens(g ? g[2] : line)) live.add(token_key(name, hashed, rest));
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const d of t.derived) {
      if (!live.has(d.name)) continue;
      for (const nm of _expr_names(d.expr)) {
        if (nm !== 'min' && nm !== 'max' && !live.has(nm)) {
          live.add(nm);
          changed = true;
        }
      }
    }
    for (const p of t.placeholders) {
      const pt = parse_type(p.type);
      if (pt.base === 'materia_attr' && live.has(p.name) && !live.has(pt.args[0])) {
        live.add(pt.args[0]);
        changed = true;
      }
    }
  }
  return live;
}

// A placeholder's default as the form offers it: the template's, else read at run time; null when it has to be read
// and cannot be (no KERNEL.BIN, no free limit item).
export function run_default(p, k, folder) {
  const d = default_of(p, k);
  if (d !== '') return d;
  const pt = parse_type(p.type);
  const b = pt.base;
  if (b === 'kernel_name') return kernel_text(folder, KERNEL_ATTACK_NAMES, pt.args[0]);
  if (b === 'kernel_desc') return kernel_text(folder, KERNEL_ATTACK_DESCS, pt.args[0]);
  if (b === 'kernel_stat') {
    const kc = kernel_character(folder, pt.args[0]);
    return kc !== null ? String(kc[pt.args[1]]) : null;
  }
  if (b === 'limit_item_id') {
    const n = free_limit_item(folder);
    return n !== null ? String(n) : null;
  }
  return d;
}

// The switches that must be on for placeholder `name` to be written: the gates of its lines and the parts' `when`.
export function gates_of(t, name) {
  const out = [];
  for (const part of t.parts) {
    for (const line of part.lines || []) {
      const g = gate_of(line);
      const names = _tokens(g ? g[2] : line).map(([nm, h, r]) => token_key(nm, h, r));
      if (names.indexOf(name) < 0) continue;
      if (g !== null && !g[0] && out.indexOf(g[1]) < 0) out.push(g[1]);
      if (part.when !== null && part.when !== undefined && out.indexOf(part.when) < 0) out.push(part.when);
    }
  }
  return out;
}

// {switch: why it cannot be on}: a kernel name, description or stat it writes has no value (no KERNEL.BIN).
export function switch_blocks(t, folder) {
  const out = {};
  for (const p of t.placeholders) {
    const b = parse_type(p.type).base;
    if (b !== 'kernel_name' && b !== 'kernel_desc' && b !== 'kernel_stat') continue;
    if (run_default(p, 0, folder) !== null) continue;
    for (const sw of gates_of(t, p.name)) {
      if (!(sw in out)) out[sw] = (p.label || p.name) + ' is read from KERNEL.BIN, and no KERNEL.BIN was read';
    }
  }
  return out;
}

// The part an id placeholder (or a copy of one) belongs to, or null.
function id_of_part(t, name) {
  for (const p of t.placeholders) {
    const base = p.name.endsWith('#') ? p.name.slice(0, -1) : p.name;
    const copy = p.name.endsWith('#') && new RegExp('^' + base.replace(/[^A-Za-z0-9_]/g, '\\$&') + '[0-9]+$').test(name);
    if ((p.name === name || copy) && parse_type(p.type).base === 'id') return p.part;
  }
  return null;
}

// The template filled: {values: {NAME: value}, parts: [{part, file, kind, position, lines}], warnings, switches};
// throws TemplateProblem when a value is wrong (the message names the placeholder). S6a: the switches decide the parts
// emitted and the lines open; a placeholder only on closed lines is not checked.
export function fill(t, values, folder) {
  const vals = {};
  const warnings = [];
  const [sw, problems] = switch_values(t, values);
  for (const x of t.exclusive || []) {
    const on = x.filter(n => sw[n]);
    if (on.length > 1) problems.push(on.join(', ') + ': at most one of ' + x.join(', ') + ' may be on');
  }
  for (const p of t.placeholders) {
    const pt = parse_type(p.type);
    if (pt.base === 'switch' && pt.args.length && sw[p.name] && !sw[pt.args[0]]) problems.push(p.name + ': needs ' + pt.args[0] + ' on');
  }
  for (const [name, why] of Object.entries(switch_blocks(t, folder))) {
    if (sw[name]) problems.push(name + ' cannot be on: ' + why);
  }
  const emitted = emitted_parts(t, sw);
  const live = live_names(t, sw, emitted);
  const exp = expanded(t, values);
  const defaults = {};
  const taken = new Map();
  for (const [name, p, k] of exp) {
    const pt = parse_type(p.type);
    const given = value_of(values, name, null);
    const d = run_default(p, k, folder);
    defaults[name] = d !== null ? d : '';
    if (pt.base === 'switch') {
      vals[name] = sw[p.name] ? 'on' : 'off';
      continue;
    }
    if (!live.has(p.name)) continue;
    let v = trimmed(given !== null ? given : defaults[name]);
    if (pt.base === 'id') {
      const part = t.parts[p.part];
      const key = pyLower(part.file);
      if (!taken.has(key)) taken.set(key, []);
      const avoid = taken.get(key);
      if (v === '') {
        const [n] = next_free(folder, part.kind, part.file, avoid);
        if (n === null) {
          problems.push(name + ': ' + full_text(part.kind, folder));
          continue;
        }
        v = String(n);
      }
      const n = number_of(v);
      if (n === null) {
        problems.push(name + ': expected an ID number');
        continue;
      }
      const why = check_id(folder, part, n, avoid);
      if (why) {
        problems.push(name + ': ' + why);
        continue;
      }
      avoid.push(n);
      vals[name] = String(n);
      continue;
    }
    if (pt.base === 'materia_attr') {
      vals[name] = v;
      continue;
    }
    const [prob, warn] = check_value(pt, v, folder, vals);
    if (prob) problems.push(name + ': ' + prob);
    if (warn) warnings.push(name + ': ' + warn);
    if (!prob && pt.base === 'kernel_stat' && pt.args[1] === 'level' && d !== null && number_of(v) !== number_of(d)) {
      warnings.push(name + ': level ' + v + " is not the guest record's (" + d + "): its stats are the record's at level " + d);
    }
    vals[name] = v;
  }
  for (const [name, p] of exp) {
    const pt = parse_type(p.type);
    if (pt.base !== 'materia_attr' || !(name in vals)) continue;
    const prob = check_value(pt, vals[name], folder)[0];
    const base = number_of(vals[pt.args[0]] === undefined ? '' : vals[pt.args[0]]);
    const [byte] = base !== null ? materia_attr_byte(folder, base) : [null, null];
    if (prob) problems.push(name + ': ' + prob);
    else if (byte === null) {
      problems.push(name + ': the first attribute byte of base ' + vals[pt.args[0]] + " is not known (no KERNEL.BIN and not in " +
                    "the Materia readme's table)");
    } else {
      vals[name] = '0x' + byte.toString(16).padStart(2, '0') + ', ' + vals[name];
    }
  }
  if (problems.length) throw new TemplateProblem(problems.join('; '));
  for (const d of t.derived) {
    if (!live.has(d.name)) continue;
    const env = new Map();
    let word = null;
    for (const nm of _expr_names(d.expr)) {
      if (nm === 'min' || nm === 'max') continue;
      const n = number_of(vals[nm] === undefined ? '' : vals[nm]);
      if (n === null) word = vals[nm] === undefined ? '' : vals[nm];
      env.set(nm, n !== null ? n : 0);
    }
    if (word !== null) {
      const hit = d.words.filter(([w]) => ascii_lower(w) === ascii_lower(word)).map(([, v]) => v);
      if (!hit.length) throw new TemplateProblem(d.name + ': no value for the word ' + word);
      vals[d.name] = String(number_of(hit[0]));
    } else {
      vals[d.name] = String(_eval(d.expr, env));
    }
  }
  const parts = [];
  t.parts.forEach((part, k) => {
    if (emitted.indexOf(k) < 0) return;
    const copies = part.repeat !== null ? count_value(t, part.repeat, vals) : 0;
    const lines = [];
    for (let c = 1; c <= (copies || 1); c++) {
      if (copies && c > 1) lines.push('');
      for (const line of part.lines) {
        const g = gate_of(line);
        if (g === null) lines.push(substitute(line, vals, copies ? c : 0, t, folder));
        else if (gate_open(g, sw)) lines.push(substitute(g[2], vals, copies ? c : 0, t, folder));
        else {
          const names = _tokens(g[2]).filter(([, , r]) => r === null).map(([nm, h]) => nm + h);
          // names an ID that was never allocated: noise
          if (names.some(nm => id_of_part(t, nm) !== null && emitted.indexOf(id_of_part(t, nm)) < 0)) continue;
          const rv = Object.assign({}, vals);
          for (const nm of names) if (!live.has(nm)) rv[nm] = defaults[nm] !== undefined ? defaults[nm] : '';
          lines.push(';' + substitute(g[2], rv, copies ? c : 0, t, folder));
        }
      }
    }
    const pos = position_parts(part.position);
    const header = pos[1] ? substitute(pos[1], vals, 0, t, folder) : null;
    parts.push({ part: k, file: part.file, kind: part.kind,
                 position: pos[0] + (header ? ':' + header : '') + (pos[2] ? ' create' : ''), lines });
  });
  return { values: vals, parts, warnings, switches: sw };
}

// A body line with its placeholders and segment filled; a comment after the value keeps its column when there is room
// (one space before it at least).
export function substitute(line, vals, copy, t, folder) {
  let out = line.replace(bodyToken(), (...m) => _one(m, vals, copy, t));
  if (out === line) return out;
  const old = new LineView(0, line);
  const nw = new LineView(0, out);
  if (old.comment && nw.comment && old.stop < old.comment && nw.stop < nw.comment) {
    const pad = Math.max(1, old.comment - nw.stop);
    out = out.slice(0, nw.stop) + ' '.repeat(pad) + out.slice(nw.comment);
  }
  return out;
}

function _one(m, vals, copy, t) {
  if (m[1] !== undefined) {
    const name = m[1] + (m[2] ? String(copy) : '');
    if (m[2] && !copy) throw new TemplateProblem('<' + m[1] + '#> outside a repeated part');
    return _value(vals, name);
  }
  const [base, rest, sep] = [m[3], m[4], m[5]];
  const p = t.placeholders.filter(x => x.name === base + '#')[0];
  const n = count_value(t, repeat_of(t, p), vals);
  const pieces = [];
  for (let k = 1; k <= n; k++) pieces.push(_value(vals, base + k) + rest.split('#').join(String(k)));
  return pieces.join(sep);
}

function _value(vals, name) {
  if (vals[name] === undefined) throw new TemplateProblem('<' + name + '> has no value here');
  return vals[name];
}

// ---- placing ---------------------------------------------------------------------------------------------------------
export function find_section(doc, header) {
  for (const s of doc.sections()) {
    if (s.header_index !== null && same_header(doc.lines[s.header_index].header_text(), header)) return s;
  }
  return null;
}

// Where a filled part goes in `doc` and the lines that go there: [index, lines], the blank lines around a new section
// included (a blank line before it when the line above is not blank, after it when the line below is not blank).
export function place(doc, part, position) {
  const pos = position_parts(position);
  if (pos === null) throw new TemplateProblem('position must be end, after:[header], before:[header] or into:[header]');
  const [what, header, create] = pos;
  let lines = part.lines.slice();
  const n = doc.lines.length;
  let at;
  if (what === 'into') {
    const s = find_section(doc, header);
    if (s === null) {
      if (!create) throw new TemplateProblem(part.file + ' has no section ' + header);
      lines = [header].concat(lines);
      at = n;
    } else {
      at = s.header_index + 1;
      for (let i = s.first; i <= s.last; i++) if (doc.lines[i].kind !== 'blank') at = i + 1;
      return [at, lines];
    }
  } else if (what === 'end') {
    at = n;
  } else {
    const s = find_section(doc, header);
    if (s === null) throw new TemplateProblem(part.file + ' has no section ' + header);
    at = what === 'after' ? s.last + 1 : s.header_index;
  }
  if (at > 0 && doc.lines[at - 1].kind !== 'blank') lines = [''].concat(lines);
  if (at < n && doc.lines[at].kind !== 'blank') lines = lines.concat(['']);
  return [at, lines];
}

// The inserts of a filled template, in order: [{part, file, name, at, lines, final}] (`at` 0-based in the document as
// the earlier inserts left it; `final` 0-based in the finished document, after the later inserts of the same file
// above it), and the new texts Map {name: text} of the touched files.
export function plan(filled, positions, folder) {
  const docs = new Map();
  const out = [];
  filled.parts.forEach(part => {
    const k = part.part;       // the part's number in the template (a part a switch left out keeps its number)
    const position = positions && k < positions.length && positions[k] ? positions[k] : part.position;
    if (position_parts(part.position)[0] === 'into' && position !== part.position) {
      throw new TemplateProblem('part ' + (k + 1) + ' goes ' + part.position + ': its place is fixed');
    }
    const name = folder.name_of(part.file) || part.file;
    if (!docs.has(name)) docs.set(name, new Document(folder.text(part.file) || ''));
    const doc = docs.get(name);
    const [at, lines] = place(doc, part, position);
    doc.insert_block(at, lines);
    out.push({ part: k, file: part.file, name, at, lines });
  });
  out.forEach((st, i) => {
    let at = st.at;
    for (const later of out.slice(i + 1)) if (later.name === st.name && later.at <= at) at += later.lines.length;
    st.final = at;
  });
  const texts = new Map();
  for (const [name, d] of docs) texts.set(name, d.text());
  return [out, texts];
}

// The folder's texts with blank lines where the plan inserts its lines (as many as it inserts there): every line that
// does not move has the line number it will have after the insert.
export function padded(folder, steps) {
  const docs = new Map();
  for (const st of steps) {
    if (!docs.has(st.name)) docs.set(st.name, new Document(folder.text(st.file) || ''));
    docs.get(st.name).insert_block(st.at, st.lines.map(() => ''));
  }
  const texts = new Map(folder.texts);
  for (const [name, d] of docs) texts.set(name, d.text());
  return texts;
}

function message_key(p) { return JSON.stringify([p.file, p.kind, p.text]); }

// The messages of `after` that `before` does not have (multiplicity kept), in after's order.
export function new_messages(before, after) {
  const count = new Map();
  for (const probs of before.values()) for (const p of probs) count.set(message_key(p), (count.get(message_key(p)) || 0) + 1);
  const out = [];
  for (const probs of after.values()) {
    for (const p of probs) {
      const k = message_key(p);
      if (count.get(k)) count.set(k, count.get(k) - 1);
      else out.push(p);
    }
  }
  return out;
}

// {values, parts: [{file, at, lines}], new_messages, warnings, ok, texts} (texts: the new texts of the touched files);
// TemplateProblem for a value or a position that cannot be used. `cache`: a Map that keeps the "before" check of one
// folder by where the inserts go (the tests fill one template many times).
export function preview(t, values, positions, folder, cache) {
  const filled = fill(t, values, folder);
  const [steps, new_texts] = plan(filled, positions, folder);
  const key = steps.map(st => st.name + ':' + st.at + ':' + st.lines.length).join('|');
  let before;
  if (cache && cache.has(key)) before = cache.get(key);
  else {
    before = validate.check_folder(padded(folder, steps));
    if (cache) cache.set(key, before);
  }
  const after_texts = new Map(folder.texts);
  for (const [name, text] of new_texts) after_texts.set(name, text);
  const shared = new Map();
  const after = validate.check_folder(after_texts, null, shared);
  const fresh = new_messages(before, after);
  const nw = fresh.filter(p => p.kind !== 'note');
  const notes = fresh.filter(p => p.kind === 'note');
  const after_folder = folder.with_texts(after_texts);
  after_folder._checked = [after, shared];
  const sw = filled.switches;
  const own = [];
  for (const w of t.warns) {
    const [conds, text] = warn_condition(t, w);
    if (conds.every(([neg, name]) => Boolean(sw[name]) !== neg)) own.push(text);
  }
  const warns = filled.warnings.concat(own, tool_warnings(t, filled, steps, after_folder, folder));
  return { values: filled.values, parts: steps.map(s => ({ file: s.file, at: s.final + 1, lines: s.lines })),
           new_messages: nw.map(p => p.as_dict()), notes: notes.map(p => p.as_dict()), warnings: warns,
           prerequisites: prerequisites(steps, after_folder), ok: !nw.length, texts: new_texts };
}

// ---- the tool's own warnings (design 4.4, item 3) ----------------------------------------------------------------------
// {key (lower case): value} of a live section (the last line of a key wins).
function section_keys(doc, header_index) {
  const out = new Map();
  for (const l of doc.key_lines(doc.section_at(header_index))) out.set(pyLower(l.key_text()), l.value_text());
  return out;
}

// The live sections the plan made: [[file, header text, number, keys, line]].
function new_sections(steps, after_folder) {
  const out = [];
  for (const st of steps) {
    const doc = new Document(after_folder.text(st.file) || '');
    for (let i = st.final; i < st.final + st.lines.length; i++) {
      const l = doc.lines[i];
      if (l.kind === 'section') out.push([st.file, l.header_text(), header_number(l.header_text()), section_keys(doc, i), i + 1]);
    }
  }
  return out;
}

// The key lines the plan added into an existing section: [[file, header, key, value, line]].
function into_lines(steps, after_folder) {
  const out = [];
  for (const st of steps) {
    const doc = new Document(after_folder.text(st.file) || '');
    let header = null;
    for (const s of doc.sections()) {
      if (s.header_index !== null && s.first <= st.final && st.final <= s.last + 1) header = doc.lines[s.header_index].header_text();
    }
    for (let i = st.final; i < st.final + st.lines.length; i++) {
      const l = doc.lines[i];
      if (l.kind === 'section') header = l.header_text();
      else if (l.kind === 'key') out.push([st.file, header, pyLower(l.key_text()), l.value_text(), i + 1]);
    }
  }
  return out;
}

function kv(keys, k) { return keys.has(k) ? keys.get(k) : null; }

// [mats, links]: mats Map {materia ID: {levels, spells: [[spell, level]]}} of the live materia sections (the last
// line of a key wins), links Map {spell: [[materia, level]]} of the spell file's own materia = links.
function materia_table(folder) {
  const mats = new Map();
  const text = folder.text('FF7_SpellExt_Materia.ini');
  if (text !== null) {
    const doc = new Document(text);
    for (const s of doc.sections()) {
      if (s.header_index === null) continue;
      const n = header_number(doc.lines[s.header_index].header_text());
      if (n === null || !(n >= 96 && n <= 254)) continue;
      const keys = section_keys(doc, s.header_index);
      const ap = words_of(kv(keys, 'ap') || 'none');
      const levels = (!ap.length || word_is_all(ap[0], 'none')) ? 1 : ap.length + 1;
      const spells = [];
      for (const w of words_of(kv(keys, 'spells') || '')) {
        const [sp, , lv] = partition(w, ':');
        if (number_of(sp) !== null && !(lv && number_of(lv) === null)) spells.push([number_of(sp), lv ? number_of(lv) : 1]);
      }
      mats.set(n, { levels, spells });
    }
  }
  const links = new Map();
  for (const f of ['FF7_SpellExt_Spells.ini', SPELL_TEST_FILE]) {
    const t = folder.text(f);
    if (t === null) continue;
    const doc = new Document(t);
    for (const s of doc.sections()) {
      if (s.header_index === null) continue;
      const n = header_number(doc.lines[s.header_index].header_text());
      if (n === null || n < 3000) continue;
      for (const w of words_of(kv(section_keys(doc, s.header_index), 'materia') || '')) {
        const [m, , lv] = partition(w, ':');
        if (number_of(m) !== null && !(lv && number_of(lv) === null)) {
          if (!links.has(n)) links.set(n, []);
          links.get(n).push([number_of(m), lv ? number_of(lv) : 1]);
        }
      }
    }
  }
  return [mats, links];
}

function shared_set(shared, key) { return shared.has(key) ? shared.get(key) : new Set(); }

// Whether a shop's add entry names something that exists: a game ID, or a section a gear file loaded.
function defined_item(shared, n, materia) {
  if (materia) return n < 96 || shared_set(shared, 'materia_defined').has(n);
  if (n <= 104 || (n >= 128 && n <= 319)) return true;
  if ((n >= 105 && n <= 127) || (n >= 448 && n <= 511) || (n >= 1024 && n <= 9999)) return shared_set(shared, 'items_defined').has(n);
  if (n >= 320 && n <= 383) return shared_set(shared, 'weapons_defined').has(n);
  if (n >= 384 && n <= 415) return shared_set(shared, 'armour_defined').has(n);
  if (n >= 416 && n <= 447) return shared_set(shared, 'accessories_defined').has(n);
  return false;
}

// Map {shop: entries the game itself has} from the shops file's own comment table ("  12  Kalm ...  7/10").
function game_shop_counts(folder) {
  const out = new Map();
  const text = folder.text('FF7_SpellExt_Shops.ini');
  if (text === null) return out;
  for (const l of new Document(text).lines) {
    const m = /^[;#][ \t]+([0-9]+)[ \t]+[^\n]*[ \t]([0-9]+)\/10[ \t]*$/.exec(l.body);
    if (m) out.set(Number(m[1]), Number(m[2]));
  }
  return out;
}

// Map {shop: number of entries the shops file adds}.
function shop_adds(folder) {
  const out = new Map();
  const text = folder.text('FF7_SpellExt_Shops.ini');
  if (text === null) return out;
  const doc = new Document(text);
  for (const s of doc.sections()) {
    if (s.header_index === null) continue;
    const n = header_number(doc.lines[s.header_index].header_text());
    if (n === null) continue;
    for (const l of doc.key_lines(s)) {
      if (pyLower(l.key_text()) === 'add') out.set(n, (out.get(n) || 0) + words_of(l.value_text()).length);
    }
  }
  return out;
}

function in_spans(n, spans) { return spans.some(([a, b]) => a <= n && n <= b); }

function grant_count(mats, links, sp) {
  const grants = new Set((links.get(sp) || []).map(([x]) => x));
  for (const [k, v] of mats) if (v.spells.some(([s]) => s === sp)) grants.add(k);
  return grants.size;
}

// The tool's own warnings about what the template adds (never the DLL's: the DLL logs none of these).
export function tool_warnings(t, filled, steps, after, before) {
  const out = [];
  const shared = after.check()[1];
  const news = new_sections(steps, after);
  const adds = into_lines(steps, after);
  const [mats, links] = materia_table(after);
  const wide_items = game_key(after, 'wide_items') === 'on';
  for (const [file, header, n, keys, line] of news) {
    const kinds = validate.section_kind(file, header);
    const where = file + ' line ' + line;
    if (['armour', 'wide_armour', 'accessory', 'wide_accessory'].indexOf(kinds) >= 0) {
      if (keys.has('element') !== keys.has('element_effect')) {
        out.push(where + ': ' + header + ' has ' + (keys.has('element') ? 'element' : 'element_effect') + ' without ' +
                 (keys.has('element') ? 'element_effect' : 'element') + ' (the readme: give both)');
      }
    }
    const throw_ = kv(keys, 'throw') || '';
    if ((kinds === 'weapon' || kinds === 'wide_weapon') && grammar.parse_yes_no(throw_, 0, throw_.length) === 1) {
      const b = kv(keys, 'base') || '';
      const base = gc.parse_kernel_weapon(b, 0, b.length);
      if (base !== null && in_spans(base, NO_THROW_BASES) && !keys.has('throw_like')) {
        out.push(where + ': ' + header + ' is thrown (throw = yes) but its base ' + base + ' has no throw effect: add throw_like');
      }
    }
    if (n !== null && ['wide_weapon', 'wide_armour', 'wide_accessory', 'wide_item'].indexOf(kinds) >= 0 && !wide_items) {
      out.push(where + ': ' + header + ' is a wide number: read, but the readme says wide gear and items need wide_items = on ' +
               'in the game file to be used');
    }
    if (kinds === 'materia') {
      if (!keys.has('ap')) out.push(where + ': materia ' + n + ' has no ap: it never grows');
      if (!keys.has('price') && !keys.has('base')) out.push(where + ': materia ' + n + ' has no price: it cannot be sold');
      const m = mats.get(n);
      if (m) {
        for (const [sp, lv] of m.spells) {
          if (lv > m.levels) {
            out.push(where + ': materia ' + n + ' grants spell ' + sp + ' at level ' + lv + ', but it has ' + m.levels +
                     ' level(s): never learned');
          }
          const g = grant_count(mats, links, sp);
          if (g > 4) out.push(where + ': spell ' + sp + ' is granted by ' + g + ' materia: the DLL takes 4 at most');
        }
      }
    }
    if (kinds === 'spell') {
      const mv = kv(keys, 'materia') || '';
      for (const w of words_of(mv)) {
        const [m, , lv] = partition(w, ':');
        const mid = number_of(m);
        if (mid === null || mid < 96) continue;
        if (!shared_set(shared, 'materia_defined').has(mid)) {
          out.push(where + ': spell ' + n + ' names materia ' + mid + ', which no section defines (the spell file is read ' +
                   'before the materia file: the DLL does not say)');
        } else if (lv && number_of(lv) !== null && number_of(lv) > (mats.has(mid) ? mats.get(mid).levels : 99)) {
          out.push(where + ': spell ' + n + ' is granted at level ' + lv + ' of materia ' + mid + ', which has ' +
                   mats.get(mid).levels + ' level(s): never learned');
        }
      }
      const g = grant_count(mats, links, n);
      if (g > 4) out.push(where + ': spell ' + n + ' is granted by ' + g + ' materia: the DLL takes 4 at most');
      const an = number_of(kv(keys, 'animation') || '');
      if (an !== null && an > 0x35 && an <= 0xff && ANIMATIONS_SEEN.indexOf(an) < 0) {
        out.push(where + ': animation 0x' + an.toString(16).padStart(2, '0') + ' is a kernel effect past 0x35 that the ' +
                 'Spells readme does not list as seen working from a party member');
      }
    }
  }
  let game_counts = null;
  for (const [file, header, key, value, line] of adds) {
    const where = file + ' line ' + line;
    if (pyLower(file) === 'ff7_spellext_shops.ini' && key === 'add') {
      for (const w of words_of(value)) {
        const m = w.slice(0, 1) === 'm' || w.slice(0, 1) === 'M';
        const n = number_of(m ? w.slice(1) : w);
        if (n === null) continue;
        if (!defined_item(shared, n, m)) {
          out.push(where + ': ' + header + ' names ' + w + ', which no file defines (the DLL puts it on sale unchecked)');
        }
        if (!m && n >= 1024 && n <= 9999) out.push(where + ': ' + w + ' is a wide item: sold only once the shops are enlarged');
      }
      const shop = header_number(header || '');
      if (shop !== null) {
        if (game_counts === null) game_counts = game_shop_counts(after);
        const total = (game_counts.get(shop) || 0) + (shop_adds(after).get(shop) || 0);
        if (total > SHOP_ROOM) out.push(where + ': shop ' + shop + ' would hold ' + total + ' entries; a shop holds ' + SHOP_ROOM);
      }
    }
  }
  for (const x of character_warnings(news, after, before)) out.push(x);
  for (const [name, p] of expanded(t, filled.values)) {
    if (parse_type(p.type).base !== 'id' || !(name in filled.values)) continue;
    const part = t.parts[p.part];
    const n = number_of(filled.values[name]);
    const used = new Set(used_ids(before, part.kind, part.file));
    for (const c of commented_ids(before, part.file, used)) {
      if (c.id === n && c.ai_mentions.length) {
        out.push(name + ' = ' + n + ' is a commented-out ID that ' + c.ai_mentions.join(', ') + ' names');
      }
    }
  }
  return out;
}

// ---- the library ------------------------------------------------------------------------------------------------------
export function load_builtin(schema_kinds) {
  return parse(fs.readFileSync(BUILTIN).toString('latin1'), schema_kinds);
}

// What the Library shows of a template (lib.list).
export function card(t, builtin, folder) {
  const blocks = switch_blocks(t, folder);
  const phs = t.placeholders.map(p => {
    const pt = parse_type(p.type);
    const ph = { name: p.name, type: p.type, base: pt.base, default: p.default, label: p.label || p.name, part: p.part,
                 lo: pt.lo, hi: pt.hi, words: pt.base === 'enum' || pt.base === 'ai_word' ? pt.args : pt.words,
                 choices: pt.base === 'kernel' ? kernel_names(folder, pt.args[0]) : pt.base === 'gear_id' ? gear_choices(pt, folder)
                   : pt.base === 'ai_ref' ? ai_choices(folder) : [],
                 repeat: p.name.endsWith('#') ? repeat_of(t, p) : null };
    if (['kernel_name', 'kernel_desc', 'kernel_stat', 'limit_item_id'].indexOf(pt.base) >= 0) ph.run_default = run_default(p, 0, folder);
    if (pt.base === 'switch') {
      ph.needs = pt.args.length ? pt.args[0] : null;
      ph.blocked = blocks[p.name] !== undefined ? blocks[p.name] : null;
    }
    if ((t.exclusive && t.exclusive.length) || t.parts.some(part => (part.lines || []).some(l => gate_of(l) !== null)) ||
        t.parts.some(part => part.when)) {
      ph.gates = gates_of(t, p.name);
    }
    return ph;
  });
  const c = template_character(t);
  return { id: t.id, title: t.title, kind: t.kind, file: t.file, notes: t.notes, placeholders: phs,
           parts: t.parts.map(p => ({ file: p.file, kind: p.kind, position: p.position, repeat: p.repeat,
                                      when: p.when === undefined ? null : p.when })),
           exclusive: t.exclusive || [],
           character: c !== null ? { kernel: c.kernel, prefix: c.prefix, limits: c.limits, title: c.title } : null,
           warns: t.warns, builtin, bundle: t.parts.length > 1, source: t.source };
}

// [[item ID, name]] a gear_id type offers: the owner's weapons by the kernel's equip mask, or the game's armour or
// accessories (names from KERNEL.BIN; [] without one).
export function gear_choices(pt, folder) {
  const what = pt.args[0];
  const base = { weapon: 128, armour: 256, accessory: 288 }[what];
  const names = kernel_names(folder, what);
  if (what === 'weapon') {
    const rng = new Set(weapon_range(folder, pt.args[1]));
    return names.filter(([i]) => rng.has(base + i)).map(([i, nm]) => [base + i, nm]);
  }
  return names.map(([i, nm]) => [base + i, nm]);
}

// [[name, what]] of the ai folder's files and the staged ones, for an ai_ref.
export function ai_choices(folder) {
  const out = [];
  for (const n of sorted_lower([...new Set(folder.ai_names)])) out.push([n, 'in the ai folder']);
  for (const n of sorted_lower([...new Set(folder.ai_pending)])) {
    if (folder.ai_names.indexOf(n) < 0) out.push([n, 'staged, not saved yet']);
  }
  return out;
}

// The tool's warnings about the character and limits sections a template adds (design 4.4, 4.9).
function character_warnings(news, after, before) {
  const out = [];
  const added = new Set(news.map(([f, h]) => pyLower(f) + '\u0000' + h));
  for (const [file, header, n, keys, line] of news) {
    const where = file + ' line ' + line;
    const kind = validate.section_kind(file, header);
    if (pyLower(file) === pyLower(CHARACTERS_FILE) && kind === 'character') {
      const checks = character_checks(before, n);
      checks.limits_sections = checks.limits_sections.filter(x => !added.has(pyLower(LIMITS_FILE) + '\u0000' + x.header));
      for (const x of check_lines(n, checks)) out.push(where + ': ' + x);
      const ai = keys.has('ai') ? keys.get('ai') : null;
      if (ai !== null && ascii_lower(ai) !== 'none') {
        if (!before.ai_names.some(x => ascii_lower(x) === ascii_lower(ai)) &&
            before.ai_pending.some(x => ascii_lower(x) === ascii_lower(ai))) {
          out.push(where + ': ai = ' + ai + ' names an AI file that is staged, not on disk yet: Save writes it (a new .ai ' +
                   'file is seen by the game only after a restart)');
        }
      }
      const fm = keys.has('field_model') ? keys.get('field_model') : null;
      const fe = game_key(after, 'field_entities');
      if (fm !== null && ascii_lower(fm) !== 'none' && fe !== 'party' && fe !== 'seats') {
        out.push(where + ': field_model = ' + fm + ', but the game file has no field_entities = party or seats: the field ' +
                 'model is not used');
      }
      const dv = game_key(after, 'debug');
      if (n !== null && n > 15 && dv !== 'true' && dv !== 'yes') {
        out.push(where + ': character ' + n + ' is above 15 and the game file lacks debug = true: only the External ' +
                 'Characters screen or a seat can bring it in');
      }
      if (keys.has('battle_files')) {
        out.push(where + ': battle_files = ' + keys.get('battle_files') + ': FFNx reads the textures, body parts and weapons ' +
                 "itself, so the FULL renamed set must ship in a 7th Heaven mod's battle folder (and 7th Heaven and the game " +
                 'restarted); the tool cannot check the files');
      }
    }
    if (pyLower(file) === pyLower(LIMITS_FILE) && kind === 'character' && keys.has('limit_item') && !keys.has('learn_all_on_load')) {
      out.push(where + ': limit_item = ' + keys.get('limit_item') + ' and no learn_all_on_load: the level-4 limit is taught only ' +
               'by the item (as the game does)');
    }
  }
  return out;
}

// ---- user templates: capture, save, remove (design 4.6) ----------------------------------------------------------------
// The placeholder type of a schema key (design 4.2), `value` when the schema says nothing more.
export function schema_type(spec, kind) {
  if (spec === null || spec === undefined) return 'value';
  const name = spec.name;
  const typ = spec.type;
  const rng = spec.range;
  const words = spec.words && spec.words.length ? spec.words : spec.values && spec.values.length ? spec.values : [];
  const w0 = w => (Array.isArray(w) ? w[0] : w);
  if (name === 'name') return 'text31';
  if (name === 'description') return 'text95';
  if (typ === 'bool') return 'enum(yes,no)';
  if (typ === 'enum') return 'enum(' + words.map(w0).join(',') + ')';
  if (name === 'element') return kind !== 'materia' ? 'elements' : 'element';
  if (name === 'status' || name === 'status_defense') {
    return kind === 'materia' ? 'status24' : (kind === 'armour' || kind === 'wide_armour' ? 'status' : 'statuses');
  }
  if (['target', 'equip', 'slots', 'ap', 'uses', 'attributes', 'kernel_spells'].indexOf(name) >= 0) return name;
  if (name === 'bonus') return kind === 'armour' || kind === 'wide_armour' ? 'bonus(4)' : 'bonus(2)';
  if (name === 'materia' && kind === 'spell') return 'materia_list';
  if ((typ === 'int' || typ === 'int_or_word') && Array.isArray(rng) && rng.length === 2) {
    let t = 'int(' + rng[0] + '..' + rng[1] + ')';
    if (typ === 'int_or_word') t += words.map(w => '|' + w0(w)).join('');
    return t;
  }
  return 'value';
}

function ph_name(key, taken) {
  let base = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'KEY';
  if (!(base[0] >= 'A' && base[0] <= 'Z')) base = 'K_' + base;
  let name = base;
  let k = 2;
  while (taken.has(name)) {
    name = base + '_' + k;
    k += 1;
  }
  taken.add(name);
  return name;
}

// The key lines of a live section, for the Save as template dialog: [hit, kind, rows [{line, key, value, type, on}]].
export function capture_rows(folder, file, header_line, schema) {
  const text = folder.text(file);
  if (text === null) throw new TemplateProblem('no file ' + file);
  const doc = new Document(text);
  const kinds = section_kind_fn(file);
  const rows = [];
  let hit = null;
  for (const s of doc.outline(kinds)) if (s.line === header_line && !s.commented) hit = s;
  if (hit === null || hit.header === null) throw new TemplateProblem('line ' + header_line + ' of ' + file + ' is not a live section header');
  const kind = validate.section_kind(file, hit.header);
  if (header_number(hit.header) === null || id_rules(kind || '')[0] === null) {
    throw new TemplateProblem(hit.header + ' is not a section numbered by its ID: only such a section can be saved as a template');
  }
  const entry = schema ? schema.file(file) : null;
  const sk = entry ? (schema.kind(entry, kind) || schema.kind(entry, kind.replace('wide_', ''))) : null;
  for (const k of hit.keys) {
    if (k.kind !== 'key') continue;
    const spec = sk ? schema.constructor.key(sk, k.key) : null;
    rows.push({ line: k.line, key: k.key, value: k.value, type: schema_type(spec, kind),
                on: ['name', 'description'].indexOf(pyLower(k.key)) >= 0 });
  }
  return [hit, kind, rows];
}

// The sections linked to a captured one (design 4.6): a materia's spells, the shop lines that name the ID:
// [{what, file, header, line, id}].
export function linked(folder, file, hit, kind) {
  const out = [];
  const n = header_number(hit.header);
  const keys = new Map();
  for (const k of hit.keys) if (k.kind === 'key') keys.set(pyLower(k.key), k.value);
  if (kind === 'materia') {
    const sdoc = new Document(folder.text('FF7_SpellExt_Spells.ini') || '');
    for (const w of words_of(kv(keys, 'spells') || '')) {
      const sp = number_of(partition(w, ':')[0]);
      const s = sp !== null ? find_section(sdoc, '[' + sp + ']') : null;
      if (s !== null) out.push({ what: 'spell', file: 'FF7_SpellExt_Spells.ini', header: '[' + sp + ']', line: s.header_index + 1, id: sp });
    }
  }
  if (n !== null && ['item', 'weapon', 'armour', 'accessory', 'materia'].indexOf(kind) >= 0) {
    const text = folder.text('FF7_SpellExt_Shops.ini');
    if (text !== null) {
      const doc = new Document(text);
      const want = kind === 'materia' ? 'm' + n : String(n);
      for (const s of doc.sections()) {
        if (s.header_index === null) continue;
        for (const l of doc.key_lines(s)) {
          if (pyLower(l.key_text()) !== 'add') continue;
          for (const w of words_of(l.value_text())) {
            const ok = (kind === 'materia' && (w[0] === 'm' || w[0] === 'M') && number_of(w.slice(1)) === n) ||
                       (kind !== 'materia' && number_of(w) === n);
            if (ok) out.push({ what: 'shop', file: 'FF7_SpellExt_Shops.ini', header: doc.lines[s.header_index].header_text(), line: l.index + 1, id: want });
          }
        }
      }
    }
  }
  return out;
}

// The section's lines from its header to its last line, trailing blank lines trimmed.
function _section_body(doc, hit) {
  const first = hit.line - 1;
  let last = hit.last - 1;
  while (last > first && doc.lines[last].kind === 'blank') last -= 1;
  const out = [];
  for (let i = first; i <= last; i++) out.push(doc.lines[i].body);
  return out;
}

function _replace_value(body, ph) {
  const lv = new LineView(0, body);
  const [vs, ve] = lv.value;
  if (vs === ve && vs > 0 && body[vs - 1] === '=') return body.slice(0, vs) + ' <' + ph + '>' + body.slice(vs);
  return body.slice(0, vs) + '<' + ph + '>' + body.slice(ve);
}

// A captured spell's `materia =` line with each whole number naming the captured materia `n` (decimal or hex, its
// `:level` kept) made `<ID>`: the copy is then taught by the new materia, never by the one it was copied from.
function _materia_to_id(body, n) {
  const lv = new LineView(0, body);
  if (lv.kind !== 'key' || pyLower(lv.key_text()) !== 'materia') return body;
  const [vs, ve] = lv.value;
  return body.slice(0, vs) + body.slice(vs, ve).replace(/(?<![0-9A-Za-z_:<])(?:0[xX][0-9A-Fa-f]+|[0-9]+)(?![0-9A-Za-z_>])/g,
    w => (number_of(w) === n ? '<ID>' : w)) + body.slice(ve);
}

// A template draft of a live section (design 4.6): {text, rows, links, kind, header}. `on_lines`: the key lines
// (1-based) made placeholders (default: name and description); `include`: the linked lines (1-based) to add as parts.
export function capture(folder, file, header_line, schema, on_lines, include, ident, title) {
  const [hit, kind, rows] = capture_rows(folder, file, header_line, schema);
  const links = linked(folder, file, hit, kind);
  const doc = new Document(folder.text(file));
  if (on_lines !== undefined && on_lines !== null) for (const r of rows) r.on = on_lines.indexOf(r.line) >= 0;
  const taken = new Set(['ID']);
  const body = _section_body(doc, hit);
  const first = hit.line;
  const phs = [{ name: 'ID', type: 'id', default: '', label: null, part: 0 }];
  const lines = ['[<ID>]'];
  const by_line = new Map(rows.map(r => [r.line, r]));
  const chosen = links.filter(l => include && include.indexOf(l.line) >= 0);
  const spell_parts = chosen.filter(l => l.what === 'spell');
  body.slice(1).forEach((b, i) => {
    const ln = first + 1 + i;
    const r = by_line.get(ln);
    if (r && pyLower(r.key) === 'spells' && spell_parts.length && kind === 'materia') {
      let nv = r.value;
      spell_parts.forEach((l, k) => {
        nv = nv.replace(new RegExp('(?<![0-9A-Za-z_])' + l.id + '(?![0-9A-Za-z_])'), '<S' + (k + 1) + '>');
      });
      const lv = new LineView(0, b);
      lines.push(b.slice(0, lv.value[0]) + nv + b.slice(lv.value[1]));
      return;
    }
    if (r && r.on) {
      const name = ph_name(r.key, taken);
      phs.push({ name, type: r.type, default: r.value, label: r.key, part: 0 });
      lines.push(_replace_value(b, name));
    } else {
      lines.push(b);
    }
  });
  const parts = [{ file, kind, position: 'end', repeat: null, lines }];
  const hit_id = header_number(hit.header);
  spell_parts.forEach((l, k) => {
    const sdoc = new Document(folder.text(l.file));
    const shit = sdoc.outline(section_kind_fn(l.file)).filter(s => s.line === l.line && !s.commented)[0];
    const sbody = _section_body(sdoc, shit);
    const name = 'S' + (k + 1);
    taken.add(name);
    phs.push({ name, type: 'id', default: '', label: null, part: parts.length });
    parts.push({ file: l.file, kind: 'spell', position: 'end', repeat: null, lines: ['[<' + name + '>]'].concat(sbody.slice(1).map(b => _materia_to_id(b, hit_id))) });
  });
  for (const l of chosen) {
    if (l.what !== 'shop') continue;
    parts.push({ file: l.file, kind: 'shop', position: 'into:' + l.header + ' create', repeat: null,
                 lines: ['add = ' + (kind === 'materia' ? 'm<ID>' : '<ID>')] });
  }
  const sec_text = body.join('\n');
  const name_row = rows.filter(r => pyLower(r.key) === 'name');
  const nm = name_row.length ? name_row[0].value : hit.header;
  const auto = pyStrip((kind + '_' + nm).replace(/[^A-Za-z0-9_-]+/g, '_'), '_');
  const t = { id: ident || ascii_lower_all(auto).slice(0, 40) || kind, title: title || 'Copy of ' + nm, kind, file, notes: [], warns: [],
              source: file + ', ' + hit.header + ', ' + crypto.createHash('sha1').update(Buffer.from(sec_text, 'latin1')).digest('hex'),
              placeholders: [], derived: [], parts: [], line: 1 };
  for (const p of phs) t.placeholders.push(Object.assign({}, p, { line: 1 }));
  for (const p of parts) t.parts.push(Object.assign({}, p, { line: 1 }));
  return { text: emit(t).join('\n') + '\n', rows, links, kind, header: hit.header };
}

function ascii_lower_all(s) { return pyLower(s); }

// The first line (0-based) of a block's trailing comments and blank lines (they stay when the template is replaced:
// a note after a template is the user's).
function _trailing_from(bodies, first, last) {
  let end = last;
  while (end > first) {
    const b = bodies[end - 1];
    const t = trimmed(b);
    if (t === '' || (b.slice(0, 1) !== ' ' && b.slice(0, 1) !== '\t' && (t[0] === ';' || t[0] === '#'))) end -= 1;
    else break;
  }
  return end;
}

// The user's templates file with the template of `new_text` added at the end (with a blank line after it), or put in
// place of the one with its id (that block's trailing comments kept): every other block written back byte for byte.
// TemplateProblem when the draft does not parse to one template.
export function user_file_with(old_text, new_text, builtin_ids, schema_kinds) {
  const got = parse(new_text, schema_kinds);
  if (got.problems.length) {
    const p = got.problems[0];
    throw new TemplateProblem('line ' + p[0] + ': ' + p[1]);
  }
  if (got.templates.length !== 1) throw new TemplateProblem('the text holds ' + got.templates.length + ' templates: give one');
  const t = got.templates[0];
  if (builtin_ids.has(t.id)) throw new TemplateProblem(t.id + " is a built-in template's id: choose another");
  const old = old_text || '';
  const doc = new Document(old);
  const nl = doc.majority_newline();
  const raw = _split_raw(old);
  const bodies = doc.lines.map(l => l.body);
  const blocks = old ? parse(old, schema_kinds).blocks : [];
  const new_lines = emit(t).map(l => l + nl);
  const out = [];
  let replaced = false;
  for (const [first, last, ident] of blocks) {
    if (ident === t.id && !replaced) {
      const end = _trailing_from(bodies, first - 1, last);
      out.push(...new_lines);
      out.push(...raw.slice(end, last));
      replaced = true;
    } else {
      out.push(...raw.slice(first - 1, last));
    }
  }
  if (!replaced) {
    if (!old) {
      out.push("; FF7 SpellExt Config - your templates. This file is the config tool's; the DLL does not read it." + nl);
      out.push(nl);
    } else if (!old.endsWith('\n')) out.push(nl);
    out.push(...new_lines);
    out.push(nl);
  }
  return out.join('');
}

// The user's templates file without the template `ident`: the other blocks byte for byte.
export function user_file_without(old_text, ident, schema_kinds) {
  const raw = _split_raw(old_text || '');
  const out = [];
  let found = false;
  for (const [first, last, i] of parse(old_text || '', schema_kinds).blocks) {
    if (i === ident && !found) {
      found = true;
      continue;
    }
    out.push(...raw.slice(first - 1, last));
  }
  if (!found) throw new TemplateProblem('no template ' + ident + ' in ' + USER_FILE);
  return out.join('');
}

// ---- S6a: the reference panel of a character template (design 4.8.4) -------------------------------------------------
const VANILLA_SOURCE = 'vanilla table (read from the exe and the archives on %s)';

// The kernel character a character template builds on (its entry of character_reference.json), from the literal
// battle_like line of its first part; null for another template.
export function template_character(t) {
  if (t.parts[0].kind !== 'character' || pyLower(t.parts[0].file) !== pyLower(CHARACTERS_FILE)) return null;
  for (const line of t.parts[0].lines || []) {
    const g = gate_of(line);
    const lv = new LineView(0, g ? g[2] : line);
    if (lv.kind === 'key' && ascii_lower(lv.key_text()) === 'battle_like') {
      const word = ascii_lower(lv.value_text());
      for (const c of reference_data().characters) if (c.battle_like === word) return c;
    }
  }
  return null;
}

// The size of entry `e`'s block in the kernel's character AI, 0 when empty, null when no kernel is read.
export function ai_entry_size(folder, e) {
  if (folder === null || folder === undefined || folder.kernel_sections() === null) return null;
  try {
    return aitool.single_entry(aitool.kernel_ai_block(folder.kernel)[0], e)[0].length;
  } catch (ex) {
    if (ex instanceof aitool.AIError) return 0;
    throw ex;
  }
}

function name_of_index(list, i) {
  for (const [n, nm] of list) if (n === i) return nm;
  return '';
}

// The reference panel: {rows: [{label, value, source}], kernel_label, character}.
export function reference(t, folder, kernel_label) {
  const c = template_character(t);
  if (c === null) return { rows: [], kernel_label, character: null };
  const data = reference_data();
  const K = 'kernel: ' + kernel_label;
  const V = VANILLA_SOURCE.replace('%s', data.vanilla_read);
  const rows = [];
  if (folder.kernel_sections() === null) {
    rows.push({ label: 'kernel', value: 'no KERNEL.BIN readable: the kernel rows are left out', source: K });
  } else {
    const kc = kernel_character(folder, c.kernel);
    rows.push({ label: 'name in the kernel', value: kc !== null ? (kc.name || '(none)') : '(no start record)', source: K });
    const names = kernel_names(folder, 'weapon');
    const rng = weapon_range(folder, c.equip_like);
    rows.push({ label: 'weapons (equip mask of kernel character ' + KERNEL_CHARACTERS.indexOf(c.equip_like) + ')',
                value: rng.length ? ranges_text(rng) + '; the first: ' + rng[0] + ' ' + name_of_index(names, rng[0] - 128) : 'none',
                source: K });
    if ((c.kernel === 9 || c.kernel === 10) && kc !== null) {
      const gear = [];
      for (const what of ['weapon', 'armour', 'accessory']) {
        const n = kc[what];
        const base = { weapon: 128, armour: 256, accessory: 288 }[what];
        const nm = n !== null ? name_of_index(kernel_names(folder, what), n - base) : '';
        gear.push(n !== null ? n + ' ' + nm : 'none');
      }
      rows.push({ label: 'guest record', value: 'level ' + kc.level + '; strength ' + kc.str + ', vitality ' + kc.vit + ', magic ' +
                  kc.mag + ', spirit ' + kc.spr + ', dexterity ' + kc.dex + ', luck ' + kc.lck + '; HP ' + kc.hp + ', MP ' + kc.mp +
                  '; ' + gear.join(', '), source: K });
    }
    const size = ai_entry_size(folder, c.kernel);
    const van = c.ai_vanilla_bytes || 0;
    rows.push({ label: 'AI entry ' + c.kernel,
                value: (!size ? 'empty' : size + ' bytes') + (size === van ? '' : ' (differs from vanilla: ' + (!van ? 'empty' : van + ' bytes') + ')'),
                source: K });
  }
  rows.push({ label: 'battle model', value: c.model + ', files ' + c.prefix + ' (' + c.files + ' files, ' + c.bones + ' bones)' +
              (c.variants ? '; ' + c.variants : ''), source: V });
  rows.push({ label: 'portrait', value: c.portrait + ' (menu_us.lgp, with ' + c.portrait + '_l)', source: V });
  rows.push({ label: 'field skeleton', value: [c.field].concat(c.field_also || []).join('/') + ' (' + c.field_bones + ' bones: ' +
              (c.field_usable ? 'usable' : 'not usable') + ')', source: V });
  if (c.field === 'AAAA') {
    rows.push({ label: 'other Cloud skeletons', value: data.field_other.join(', ') + ' (' + data.field_other_note + ')', source: V });
  }
  rows.push({ label: 'limits', value: c.limits, source: V });
  rows.push({ label: 'AI entry ' + c.kernel + ' in vanilla', value: c.ai_note, source: V });
  rows.push({ label: 'field model rule', value: data.field_rule, source: V });
  rows.push({ label: 'portrait rule', value: data.portrait_rule, source: V });
  return { rows, kernel_label, character: c.id };
}

// ---- S6a: the AI library section (design 4.10) --------------------------------------------------------------------------
export const AI_EXPORTS = Object.freeze([[0, 'date scores only'], [3, 'date scores only'],
  [1, 'date scores only (it links to entry 3, which comes along)'], [2, 'date scores only (it links to entry 3, which comes along)'],
  [5, 'date scores only (it links to entry 3, which comes along)'], [7, "the beast forms' attacks"],
  [10, 'AI-controlled: invulnerable to physical and magic damage, takes every turn itself']]);
export const AI_EMPTY = Object.freeze([4, 6, 8, 9, 11]);
export const AI_RECIPES = Object.freeze([
  ['auto-battler', 'Auto-battler', [['init', 'ai_on'], ['main', 'attack_random']],
   'Fights by itself from the start of each battle: attacks a random enemy on its turns.'],
  ['healer', 'Healer', [['init', 'ai_on'], ['main', 'heal_weakest']],
   'Fights by itself: on its turns casts a healing spell on the ally with the lowest HP.'],
  ['counter-attacker', 'Counter-attacker', [['physical', 'counter_physical'], ['magical', 'counter_magic']],
   'Player-controlled; strikes back when hit by a physical attack (some of the time) and when hit by magic.'],
  ['battle-cry', 'Battle cry', [['init', 'say_start']], 'Says a line when the battle starts.'],
  ['guarded', 'Guarded', [['init', 'immune']], 'Immune to physical and/or magic damage from the start of the battle.'],
]);
const AI_KERNEL_NOTE = "The DLL's ai_like copies the AI of whichever kernel the GAME loads; an export is fixed text from " +
                       'the kernel chosen here.';

export function ai_param_name(rid, name) { return (rid + '_' + name).toUpperCase().replace(/[^A-Z0-9_]/g, '_'); }

// The AI cards with the kernel in use (its bytes, or null): an empty vanilla entry is offered only when that kernel
// fills it.
export function ai_cards(kernel) {
  let blk = null;
  if (kernel !== null && kernel !== undefined && aitool.is_kernel(kernel)) blk = aitool.kernel_ai_block(kernel)[0];
  const has = e => {
    if (blk === null) return false;
    try {
      aitool.single_entry(blk, e);
      return true;
    } catch (ex) {
      if (ex instanceof aitool.AIError) return false;
      throw ex;
    }
  };
  const out = [];
  const name_ph = { name: 'NAME', type: 'ai_name', base: 'ai_name', default: '', label: 'File name (ai\\NAME)', part: 0,
                    lo: null, hi: null, words: [], choices: [], repeat: null };
  const exports = AI_EXPORTS.map(([e, w]) => [e, w, false])
    .concat(AI_EMPTY.filter(e => has(e)).map(e => [e, 'empty in vanilla; this kernel fills it', true]));
  for (const [e, warn, differs] of exports) {
    const who = e < aitool.KERNEL_CHARS.length ? aitool.KERNEL_CHARS[e] : 'entry' + e;
    const ph = Object.assign({}, name_ph, { default: who + '_ai' });
    out.push({ id: 'ai_' + who, title: 'Kernel AI: ' + who + ' (entry ' + e + ')', kind: 'ai', file: 'ai\\',
               source: 'kernel:' + e,
               notes: ["The kernel's character AI entry " + e + ', exported as text' +
                       ([1, 2, 5].indexOf(e) >= 0 ? ' with the entries it links to' : '') + '.', AI_KERNEL_NOTE],
               warns: [warn].concat(differs ? ['differs from vanilla'] : []), placeholders: [ph], parts: [], builtin: true,
               bundle: false });
  }
  for (const [rid, title, recipes, note] of AI_RECIPES) {
    const phs = [Object.assign({}, name_ph, { default: rid.replace(/-/g, '_') })];
    for (const [, r] of recipes) {
      const rec = ailibrary.recipe(r);
      for (const p of rec.params) {
        const d = p.default;
        phs.push({ name: ai_param_name(r, p.name), type: 'ai_param', base: 'ai_param',
                   default: typeof d !== 'string' ? (p.hex ? '0x' + d.toString(16) : String(d)) : d,
                   label: rec.title + ': ' + p.label, part: 0, lo: p.min === undefined ? null : p.min,
                   hi: p.max === undefined ? null : p.max,
                   words: p.type === 'choice' ? p.choices.map(c => c[0]) : p.type === 'target' ? ailibrary.TARGET_CHOICES.map(([k]) => k) : [],
                   choices: [], repeat: null, param: p.type });
      }
    }
    out.push({ id: 'ai_recipe_' + rid.replace(/-/g, '_'), title: 'AI recipe: ' + title, kind: 'ai', file: 'ai\\',
               source: 'recipe:' + rid,
               notes: [note, "Made of the recipes " + recipes.map(([sec, r]) => r + ' in ' + sec).join(', ') + " (the AI page's library)."],
               warns: ['untested in the game'], placeholders: phs, parts: [], builtin: true, bundle: false });
  }
  return out;
}

// The text of an AI card with `values`: {name, text, warning}; TemplateProblem for a value the recipe refuses.
export function ai_card_text(card, values, kernel, label, sha1) {
  const name = trimmed(value_of(values, 'NAME', card.placeholders[0].default));
  if (!AI_NAME_RE.test(name)) throw new TemplateProblem('NAME: an AI name is 1 to 31 letters, digits, _ or -');
  const [kind, , what] = partition(card.source, ':');
  if (kind === 'kernel') {
    if (kernel === null || kernel === undefined) throw new TemplateProblem('no kernel to export from (choose one on the AI page)');
    let r;
    try {
      r = aitool.from_kernel_bytes(kernel, what, label, sha1 || null, true);
    } catch (e) {
      if (e instanceof aitool.AIError || e instanceof PyValueError) throw new TemplateProblem(e.message);
      throw e;
    }
    return { name, text: r.text, warning: r.warning };
  }
  const recipes = AI_RECIPES.find(x => x[0] === what);
  const out = ['; ' + recipes[1] + ': a recipe card of SpellExt Config (' + recipes[2].map(([, r]) => r).join(', ') +
               '). Untested in the game.', '', 'table 1', '', 'entry 0', ''];
  recipes[2].forEach(([sec, r], k) => {
    const rec = ailibrary.recipe(r);
    const given = {};
    for (const p of rec.params) {
      const v = value_of(values, ai_param_name(r, p.name), null);
      if (v !== null) given[p.name] = v;
    }
    let body;
    try {
      body = ailibrary.fill(r, given, 'c' + k, true);
    } catch (e) {
      if (e instanceof ailibrary.RecipeError) throw new TemplateProblem(e.message);
      throw e;
    }
    out.push('script ' + sec);
    out.push(body.replace(/\n+$/, ''));
    out.push('');
  });
  return { name, text: out.join('\n'), warning: null };
}

// What the Library's AI preview shows: the text, the assembler's check, the size, whether the name is taken.
export function ai_card_preview(card, values, kernel, label, sha1, ai_names, ai_pending) {
  const r = ai_card_text(card, values, kernel, label, sha1);
  const chk = aitool.assemble_check(r.text);
  const taken = [...ai_names].concat([...ai_pending]).some(x => ascii_lower(x) === ascii_lower(r.name));
  return { kind: 'ai', name: r.name, text: r.text, warning: r.warning, ok: chk.ok, problems: chk.problems,
           size: chk.size === undefined ? null : chk.size, taken, warnings: card.warns.slice() };
}
