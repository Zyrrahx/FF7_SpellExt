// A DLL scene's build, forecast (Stage C1 of the editor): port of sxcfg/scenebuild.py, function for function (see there
// for the C functions each ports: en_build, spellext.c 47560, and its helpers, in the C's order; the AI check
// ai_script_check / ai_block_check; the surrounded geometry). The file reading is enemyscan.js's (the scan's port).
// Fail-fast as the DLL: the first problem refuses every battle of the scene. Where the game data this needs is not
// known here, the build stops there with NotForecast (the tool's words, never a pass).
// Node 22 language level.
import fs from 'node:fs';
import * as es from './enemyscan.js';
import { EnFail, Doc, en_space, en_lower, ascii_lower, cstr } from './enemyscan.js';
import { cfmt } from './cfmt.js';
import { pyJoin, pyCmp } from './py.js';

export const EN_IMAGE_SIZE = 0x1e80;
const EN_O_IDS = 0x0000;
const EN_O_SETUP = 0x0008;
const EN_O_CAMERA = 0x0058;
const EN_O_ROWS = 0x0118;
const EN_O_ENEMY = 0x0298;
const EN_O_ATTACK = 0x04c0;
const EN_O_ATTACK_ID = 0x0840;
const EN_O_ATTACK_NAME = 0x0880;
const EN_O_ENEMY_AI = 0x0e80;
export const EN_SCENE_FIRST = 256;
export const EN_SCENE_LAST = 4095;
export const EN_BATTLE_LAST = EN_SCENE_LAST * 4 + 3;
export const EN_SECTIONS_MAX = 64;
export const EN_NAME_MAX = 31;
export const EN_ITEM_NAMES = 128;
export const EN_TABLE_MAX = 3 * EN_SECTIONS_MAX;
export const EN_NATIVE_BASE = 0x94;
export const ENEMIES_POOL_FIRST = 365;
export const AI_FILE_MAX = 0xffff;
export const AI_SECTIONS = 16;

export const EN_ELEMENTS = ['fire', 'ice', 'bolt', 'earth', 'poison', 'gravity', 'water', 'wind', 'holy', 'restorative', 'cut', 'hit',
  'punch', 'shoot', 'shout', 'hidden'];
export const EN_STATUSES = ['death', 'near_death', 'sleep', 'poison', 'sadness', 'fury', 'confusion', 'silence', 'haste', 'slow',
  'stop', 'frog', 'small', 'slow_numb', 'petrify', 'regen', 'barrier', 'mbarrier', 'reflect', 'dual', 'shield', 'death_sentence',
  'manipulate', 'berserk', 'peerless', 'paralysis', 'darkness', 'dual_drain', 'death_force', 'resist', 'lucky_girl', 'imprisoned'];
export const EN_RATE_NAMES = ['death', 'double', 'weak', 'half', 'nullify', 'immune', 'absorb', 'fullcure'];
export const EN_RATE_VALUES = [0, 2, 2, 4, 5, 5, 6, 7];
export const EN_KINDS = ['normal', 'preemptive', 'back', 'side', 'pincer', 'surrounded'];
export const EN_ENEMY_KEYS = ['name', 'model', 'level', 'hp', 'mp', 'str', 'def', 'mag', 'mdef', 'spd', 'eva', 'luck', 'exp', 'ap',
  'gil', 'elements', 'immune', 'drops', 'steals', 'manipulate', 'back_multiplier', 'morph', 'ai'];
export const EN_SCENE_ATTACK_KEYS = ['id', 'name', 'base', 'power', 'script', 'camera', 'accuracy', 'element', 'status',
  'status_chance', 'target', 'mp', 'formula', 'effect', 'impact', 'sound', 'effect_all', 'camera_multi'];
export const EN_KERNEL_ATTACK_KEYS = ['id', 'script', 'camera', 'effect', 'effect_all', 'camera_multi'];
export const EN_FORMATION_KEYS = ['stage', 'camera', 'rows', 'kind', 'escape_counter', 'flags', 'next', 'party_radius',
  'party_front'];
const sortedJoin = (a) => a.slice().sort(pyCmp).join(' ');
export const EN_JOINED_ELEMENTS = EN_ELEMENTS.join(' ');
export const EN_JOINED_STATUSES = EN_STATUSES.join(' ');
export const EN_JOINED_RATES = EN_RATE_NAMES.join(' ');
export const EN_JOINED_KINDS = EN_KINDS.join(' ');
export const EN_SORTED_ENEMY_KEYS = sortedJoin(EN_ENEMY_KEYS);
export const EN_SORTED_ATTACK_KEYS = sortedJoin(EN_SCENE_ATTACK_KEYS);
export const EN_SORTED_KERNEL_KEYS = sortedJoin(EN_KERNEL_ATTACK_KEYS);
export const EN_SORTED_FORMATION_KEYS = sortedJoin(EN_FORMATION_KEYS);
export const EN_SUR_KIND = 5;
export const EN_SUR_RADIUS_DEFAULT = 600;
export const EN_SUR_RADIUS_MIN = 200;
export const EN_SUR_RADIUS_MAX = 3000;
export const EN_SUR_PER_PLACE = 2;

// the build's problems (en_fail formats), its notes and the AI check's words: the same strings as scenebuild.py's
export const F_NAME = "scene \"%.320s\": a scene file's name is 1 to %d letters, digits, _ or -";
export const F_NO_SCENE = "scene %.320s: no [scene] section";
export const F_SCENE_KEY = "%.320s: unknown key \"%.320s\" (keys: number enemies)";
export const F_NO_NUMBER = "scene %.320s [scene]: key \"number\" missing";
export const F_255 = "%.320s: scene 255 is never reached by the game's lookup (0-254 scene.bin, 256-4095 DLL scenes)";
export const F_MISMATCH = "%.320s: the scene's number is %d now, not %d";
export const F_NO_ENEMIES = "scene %.320s [scene]: key \"enemies\" missing";
export const F_ENEMY_COUNT = "%.320s: 1 to 3 enemies";
export const F_FOLDER_NAME = "enemy \"%.320s\": a folder name of enemies\\ is 1 to %d letters, digits, _ or -";
export const F_POOL = "%.320s: \"model = pool\" works in a DLL scene (number 256 and up) only: scene %d is a scene.bin scene";
export const F_MODEL_TWICE = "enemy %.320s: model %d is already enemy slot %d";
export const F_TWO_RECORDS = "attack ID %04x is given two different records in this scene (%.320s)";
export const F_TABLE_MAX = "the scene has more than %d attack records: FF7 holds 32";
export const F_TABLE_32 = "the scene has %d attack records: FF7 holds 32";
export const F_NO_FORMATION = "scene %.320s: no [formation 0]";
export const F_FORM_KEY = "%.320s: unknown key \"%.320s\" (keys: %.320s)";
export const F_FORM_MISSING = "scene %.320s [formation %d]: key \"%.320s\" missing";
export const F_CAMERA_FORM = "%.320s: camera is scene:formation (like 79:2)";
export const F_CAMERA_RANGE = "%.320s: camera %d:%d is no scene:formation of the game's scene.bin (scene 0-%d, formation 0-3)";
export const F_KIND = "%.320s: kind is one of %.320s";
export const F_NEXT = "%.320s: next is none, a battle 0-1019 (the game's scenes 0-254) or 1024-16383 (a DLL scene's)";
export const F_ROWS = "%.320s: 1 to 6 rows";
export const F_ROW_ENEMY = "%.320s: \"%.320s\" is not one of the scene's enemies (%.320s)";
export const F_ROW_XYZ = "%.320s: \"%.320s\" needs x,y,z";
export const F_SURROUNDED = "scene %.320s [formation %d]: kind = surrounded: party place %d has %d enemies in front of it (at most %d)";
export const F_AI_FIT = "the AI does not fit in the scene's 4090 bytes";
export const F_AI_AREA = "the scene's AI area fails the AI check: %.320s (entry %d, section %d, at %04lx)";
export const F_NOT_KNOWN = "enemy %.320s is not registered: no enemy.ini or generated.ini in enemies\\%.320s, or [enemies] load of FF7_SpellExt_Enemies.ini leaves it out";
export const F_NO_FILES = "enemy %.320s: no generated.ini or enemy.ini in enemies\\%.320s";
export const F_NO_ENEMY = "enemy %.320s: no [enemy] section";
export const F_ENEMY_KEY = "%.320s: unknown key \"%.320s\" (keys: %.320s)";
export const F_ENEMY_MISSING = "enemy %.320s: key \"%.320s\" missing";
export const F_ATTACK_NAME = "enemy %.320s: an attack section's name is at most %d characters (one has %d)";
export const F_NO_ID = "[attack %.320s]: no id";
export const F_ID_RANGE = "%.320s: an attack ID is 00-7f (the kernel's) or 0100-7fff (the game reads an AI's attack ID as signed)";
export const F_SCRIPT = "%.320s: script is a model script, 3 to 0x3f (0 and 1 are idle loops, 2 the death)";
export const F_KERNEL_KEY = "%.320s: [attack %.320s] is kernel attack %02x: the game uses the kernel's own record, so \"%.320s\" cannot change it (keys here: %.320s)";
export const F_KERNEL_ID = "%.320s: kernel IDs are 00-7f";
export const F_ATTACK_KEY = "%.320s: unknown key \"%.320s\" (keys: %.320s)";
export const F_BASE_NAME = "[attack %.320s]: a scene attack needs base and name";
export const F_NO_BASE = "%.320s: no scene of the game's scene.bin has attack %04x";
export const F_KERNEL_EFFECT = "%.320s: kernel attack %02x is no magic (00-37): the game plays an enemy's summon, enemy skill or limit as one, so effect = is for kernel magic and scene attacks only";
export const F_EFFECT_ALL = "%.320s: effect_all needs effect, a SpellExt effect (0x100 and up), in [attack %.320s]";
export const F_CAMERA_MULTI = "%.320s: camera_multi needs camera, a camera number (the camera on one target), in [attack %.320s]";
export const F_ENCODE = "%.320s: name \"%.320s\": printable ASCII only, at most %d characters";
export const F_BITS = "%.320s: \"%.320s\" is no %.320s (%.320s)";
export const F_ELEMENTS_8 = "%.320s: at most 8 element entries";
export const F_ELEMENT_RATE = "%.320s: \"%.320s\" is not element:rate";
export const F_NO_ELEMENT = "%.320s: \"%.320s\" is no element (%.320s)";
export const F_NO_RATE = "%.320s: \"%.320s\" is no rate (%.320s)";
export const F_ACTIONS_16 = "enemy %.320s: %d attacks, an enemy record holds 16";
export const F_ITEMS_4 = "enemy %.320s: drops and steals together hold 4 items";
export const F_MANIPULATE_3 = "%.320s: at most 3";
export const F_MANIPULATE = "%.320s: \"%.320s\" is not one of its attacks (%.320s)";
export const F_AI_NONE = "%.320s: ai = none needs at least one attack (the template uses the first)";
export const F_AI_NAME = "%.320s: the AI file is a name beside enemy.ini (ai.ai.txt, or an .ai block)";
export const F_AI_ASSEMBLE = "%.320s: enemies\\%.320s\\%.320s not found: assemble %.320s (tools/ai_tool.py asm)";
export const F_AI_MISSING = "%.320s: enemies\\%.320s\\%.320s not found";
export const F_AI_CHECK = "enemies\\%.320s\\%.320s fails the AI check: %.320s (entry %d, section %d, at %04lx)";
export const F_AI_ENTRY = "enemies\\%.320s\\%.320s: an enemy's AI is one entry (table 1, entry 0)";
export const F_AI_ATTACKS = "%.320s/%.63s: the AI uses attack(s) %.320s that %.320s does not have";
export const F_AA_SHORT = "enemies\\%.320s\\model\\aa: %d bytes, not a battle skeleton (its header is 52)";
export const F_AA_BAD = "enemies\\%.320s\\model\\aa: not a battle skeleton the game can read (%lu bones, %lu textures, %lu weapons, %d bytes)";
export const F_AA_FIXED = "enemies\\%.320s\\model\\ has aa but not %.320s (%.320s): the archive's file of the same name would be taken with it; the scene is refused";
export const F_AA_LISTS = "enemies\\%.320s\\model\\aa lists %c%c (%.320s %lu) and the folder has no such file: the archive's file of the same name would be taken with it; the scene is refused";
export const F_NOT_NUMBER = "%.320s: \"%.320s\" is not a number";
export const F_OUTSIDE = "%.320s: %.320s is outside %.320s..%.320s";
export const N_SCRIPT3 = "enemies: %.95s: [attack %.31s] has effect %04x and script 3: a converted monster's script 3 shows its result with f7 and has no effect step, so the effect is never played (script 4 is the cast)";
export const N_OLDER = "enemies: %.31s: %.63s is older than %.63s: assemble it (tools/ai_tool.py asm); the block is used as it is";
export const A_PAST = "runs past the end of the block (no end, 73)";
export const A_OPERAND = "an operand runs past the end of the block";
export const A_TEXT = "a text (93) has no ff before the end of the block";
export const A_DEBUG_PAST = "a debug text (a0) runs past the end of the block";
export const A_DEBUG_END = "a debug text (a0) has no 00 before the end of the block";
export const A_OPCODE = "an opcode the interpreter does not have";
export const A_JUMP = "a jump does not land on an instruction of its script";
export const A_SMALL = "too small to hold a table";
export const A_LARGE = "larger than 65535 bytes";
export const A_NO_ENTRY = "its table has no entry";
export const A_TABLE_END = "the lowest entry offset is not the end of the table";
export const A_ODD = "the entry starts at an odd offset";
export const A_SECTIONS = "the entry's 16 section offsets run past the end of the block";
export const A_SCRIPT_PAST = "the script starts past the end of the block";

export const BUILD_FORMATS = [F_255, F_AA_BAD, F_AA_FIXED, F_AA_LISTS, F_AA_SHORT, F_ACTIONS_16, F_AI_AREA, F_AI_ASSEMBLE, F_AI_ATTACKS, F_AI_CHECK, F_AI_ENTRY, F_AI_FIT, F_AI_MISSING, F_AI_NAME, F_AI_NONE, F_ATTACK_KEY, F_ATTACK_NAME, F_BASE_NAME, F_BITS, F_CAMERA_FORM, F_CAMERA_MULTI, F_CAMERA_RANGE, F_EFFECT_ALL, F_ELEMENTS_8, F_ELEMENT_RATE, F_ENCODE, F_ENEMY_COUNT, F_ENEMY_KEY, F_ENEMY_MISSING, F_FOLDER_NAME, F_FORM_KEY, F_FORM_MISSING, F_ID_RANGE, F_ITEMS_4, F_KERNEL_EFFECT, F_KERNEL_ID, F_KERNEL_KEY, F_KIND, F_MANIPULATE, F_MANIPULATE_3, F_MISMATCH, F_MODEL_TWICE, F_NAME, F_NEXT, F_NOT_KNOWN, F_NOT_NUMBER, F_NO_BASE, F_NO_ELEMENT, F_NO_ENEMIES, F_NO_ENEMY, F_NO_FILES, F_NO_FORMATION, F_NO_ID, F_NO_NUMBER, F_NO_RATE, F_NO_SCENE, F_OUTSIDE, F_POOL, F_ROWS, F_ROW_ENEMY, F_ROW_XYZ, F_SCENE_KEY, F_SCRIPT, F_SURROUNDED, F_TABLE_32, F_TABLE_MAX, F_TWO_RECORDS];
export const NOTE_FORMATS = [N_SCRIPT3, N_OLDER];
export const AI_WORDS = [A_DEBUG_END, A_DEBUG_PAST, A_JUMP, A_LARGE, A_NO_ENTRY, A_ODD, A_OPCODE, A_OPERAND, A_PAST, A_SCRIPT_PAST, A_SECTIONS, A_SMALL, A_TABLE_END, A_TEXT];
export const NF_BASE = "%s: base %04x is looked up in the game's scene.bin: %s";
export const NF_ITEM = "%s: \"%s\" may be one of the kernel's item names, which are not known here: %s";

// The build reached a question this tool cannot answer (game data it does not have): the tool's words
export class NotForecast extends Error {
  constructor(text, label, line) {
    super(text);
    this.name = 'NotForecast';
    this.text = text;
    this.label = label === undefined ? null : label;
    this.line = line === undefined ? 0 : line;
  }
}

function fail(where, fmt, ...args) {
  throw new EnFail(cfmt(fmt, ...args).slice(0, 1024), where ? where.label : null, where ? where.line : 0);
}

// en_at: "label line N" of a key
export function at(k) {
  return k[2] + ' line ' + k[3];
}

function where_of(k) {
  return { label: k[2], line: k[3] };
}

export function en_lower_is(s, word) {
  s = cstr(s);
  return s.length === word.length ? ascii_lower(s) === word : false;
}

// The words of v (at white space, and at commas when `commas`): [count, [[start, length]] of the first mx]
export function en_split(v, commas, mx) {
  v = cstr(v);
  const out = [];
  let count = 0;
  let i = 0;
  const n = v.length;
  for (;;) {
    while (i < n && (en_space(v[i]) || (commas && v[i] === ','))) i += 1;
    if (i >= n) return [count, out];
    let w = i;
    while (w < n && !en_space(v[w]) && !(commas && v[w] === ',')) w += 1;
    if (count < mx) out.push([i, w - i]);
    count += 1;
    i = w;
  }
}

export function words_of(v, commas, mx) {
  const [count, spans] = en_split(v, commas, mx);
  v = cstr(v);
  return [count, spans.map(([a, n]) => v.slice(a, a + n))];
}

export function en_words_none(v) {
  const [count, w] = words_of(v, true, 2);
  return count === 1 && w[0] === 'none';
}

export function en_copy(s, capacity) {
  return cstr(s).slice(0, capacity - 1);
}

export function number(v, where, lo, hi, k) {
  return es.en_number(cstr(v), where, lo, hi, k ? k[2] : null, k ? k[3] : 0);
}

function number_at(v, where, lo, hi, w) {
  return es.en_number(cstr(v), where, lo, hi, w.label, w.line);
}

export function en_encode(text, where, length, k) {
  text = cstr(text);
  const n = text.length;
  let bad = false;
  for (const c of text) if (c.charCodeAt(0) < 0x20 || c.charCodeAt(0) >= 0x80) bad = true;
  if (bad || n >= length) fail(where_of(k), F_ENCODE, where, text, length - 1);
  const out = Buffer.alloc(length, 0xff);
  for (let i = 0; i < n; i++) out[i] = text.charCodeAt(i) - 0x20;
  return out;
}

export function en_bits(v, table, joined, where, what, k) {
  const [count, w] = words_of(v, true, 64);
  let out = 0;
  for (let i = 0; i < Math.min(count, 64); i++) {
    const word = en_copy(w[i], 48);
    const lower = ascii_lower(word);
    let j = 0;
    while (j < table.length && (w[i].length >= 48 || lower !== table[j])) j += 1;
    if (j === table.length) fail(where_of(k), F_BITS, where, word, what, joined);
    out = (out | (1 << j)) >>> 0;
  }
  return out;
}

// ---- the surrounded geometry (stage 1) -------------------------------------------------------------------------------
const QUARTER = [
  0, 71, 143, 214, 286, 357, 428, 499, 570, 641, 711, 782, 852, 921, 991, 1060, 1129, 1198, 1266, 1334,
  1401, 1468, 1534, 1600, 1666, 1731, 1796, 1860, 1923, 1986, 2048, 2110, 2171, 2231, 2290, 2349, 2408, 2465,
  2522, 2578, 2633, 2687, 2741, 2793, 2845, 2896, 2946, 2996, 3044, 3091, 3138, 3183, 3228, 3271, 3314, 3355,
  3396, 3435, 3474, 3511, 3547, 3582, 3617, 3650, 3681, 3712, 3742, 3770, 3798, 3824, 3849, 3873, 3896, 3917,
  3937, 3956, 3974, 3991, 4006, 4021, 4034, 4046, 4056, 4065, 4074, 4080, 4086, 4090, 4094, 4095, 4096];

export function en_sur_sin(degrees) {
  let d = degrees % 360;              // (JS's % takes the dividend's sign, as C's)
  if (d < 0) d += 360;
  return d <= 90 ? QUARTER[d] : d <= 180 ? QUARTER[180 - d] : d <= 270 ? -QUARTER[d - 180] : -QUARTER[360 - d];
}

export function en_sur_sector(x, z, front) {
  let best = 0;
  let best_along = 0;
  let best_across = 0;
  for (let k = 0; k < 3; k++) {
    const a = (front + 120 * k) % 360;
    const s = en_sur_sin(a);
    const c = en_sur_sin(a + 90);
    const d = (-x * s - z * c) | 0;
    if (!k || d > best_along) {
      best = k;
      best_along = d;
      best_across = (-x * c + z * s) | 0;
    }
  }
  return [best, best_along, best_across];
}

export function en_sur_assign(n, xs, zs, front) {
  const place = [0, 0, 0, 0, 0, 0];
  const side = [0, 0, 0, 0, 0, 0];
  const along = [0, 0, 0, 0, 0, 0];
  const across = [0, 0, 0, 0, 0, 0];
  const count = [0, 0, 0];
  const m = Math.min(n, 6);
  for (let i = 0; i < m; i++) {
    [place[i], along[i], across[i]] = en_sur_sector(xs[i], zs[i], front);
    count[place[i]] += 1;
  }
  for (let i = 0; i < m; i++) {
    let rank = 0;
    const k = place[i];
    for (let j = 0; j < m; j++) {
      if (j !== i && place[j] === k) {
        const ij = BigInt(across[j]) * BigInt(along[i]);
        const ji = BigInt(across[i]) * BigInt(along[j]);
        if (ij < ji || (ij === ji && j < i)) rank += 1;
      }
    }
    if (count[k] === 1) side[i] = across[i] > 0 ? 1 : across[i] < 0 ? 0 : 2;
    else side[i] = rank === 0 ? 0 : rank === count[k] - 1 ? 1 : 2;
  }
  return [place, side, count];
}

// ---- the AI check (ai_script_check, ai_block_check) ------------------------------------------------------------------
function ai_word(b, a) {
  return b[a] | (b[a + 1] << 8);
}

// null, or [problem, where]
export function ai_script_check(b, size, start) {
  const limit = size - start;
  let pc = 0;
  let furthest = 0;
  const jumps = [];
  let any_jump = false;
  const seen = new Set();
  let where = 0;
  for (;;) {
    where = start + pc;
    if (pc >= limit) return [A_PAST, where];
    seen.add(pc);
    const op = b[start + pc];
    pc += 1;
    if (op <= 0x03 || (op >= 0x10 && op <= 0x13) || (op >= 0x70 && op <= 0x72)) {
      if (pc + 2 > limit) return [A_OPERAND, where];
      const operand = ai_word(b, start + pc);
      pc += 2;
      if (op >= 0x70) {
        jumps.push(operand);
        if (!any_jump || operand > furthest) furthest = operand;
        any_jump = true;
      }
    } else if (op >= 0x60 && op <= 0x62) {
      if (pc + (op - 0x5f) > limit) return [A_OPERAND, where];
      pc += op - 0x5f;
    } else if (op === 0x73) {
      if (!any_jump || furthest < pc) break;
    } else if (op === 0x93) {
      for (;;) {
        if (pc >= limit) return [A_TEXT, where];
        const c = b[start + pc];
        pc += 1;
        if (c === 0xff) break;
        if (c >= 0xea && c <= 0xf1) pc += 2;
      }
    } else if (op === 0xa0) {
      if (pc + 1 > limit) return [A_DEBUG_PAST, where];
      pc += 1;
      for (;;) {
        if (pc >= limit) return [A_DEBUG_END, where];
        if (!b[start + pc]) break;
        pc += 1;
      }
      pc += 1;
    } else if (!((op >= 0x30 && op <= 0x37) || (op >= 0x40 && op <= 0x45) || (op >= 0x50 && op <= 0x52) || op === 0x74 ||
                 op === 0x75 || (op >= 0x80 && op <= 0x87) || (op >= 0x90 && op <= 0x96) || op === 0xa1)) {
      return [A_OPCODE, start + pc - 1];
    }
  }
  for (const j of jumps) if (j >= pc || !seen.has(j)) return [A_JUMP, start + j];
  return null;
}

// [null, entries, -1, -1, where] or [problem, 0, bad_entry, bad_section, where]
export function ai_block_check(b, size) {
  let bad_entry = -1;
  let bad_section = -1;
  let where = 0;
  if (size < 2 || size > AI_FILE_MAX) return [size < 2 ? A_SMALL : A_LARGE, 0, bad_entry, bad_section, where];
  let first = 0xffff;
  let i = 0;
  while (2 * i + 2 <= size && 2 * i < first) {
    const w = ai_word(b, 2 * i);
    if (w !== 0xffff && w < first) first = w;
    i += 1;
  }
  if (first === 0xffff || first >= size) return [A_NO_ENTRY, 0, bad_entry, bad_section, where];
  if ((first & 1) || 2 * i !== first) return [A_TABLE_END, 0, bad_entry, bad_section, where];
  for (let e = 0; e < Math.floor(first / 2); e++) {
    const entry = ai_word(b, 2 * e);
    if (entry === 0xffff) continue;
    bad_entry = e;
    where = entry;
    if (entry & 1) return [A_ODD, 0, bad_entry, bad_section, where];
    if (entry + 2 * AI_SECTIONS > size) return [A_SECTIONS, 0, bad_entry, bad_section, where];
    for (let s = 0; s < AI_SECTIONS; s++) {
      const section = ai_word(b, entry + 2 * s);
      if (section === 0xffff) continue;
      bad_section = s;
      where = entry + section;
      if (entry + section >= size) return [A_SCRIPT_PAST, 0, bad_entry, bad_section, where];
      const r = ai_script_check(b, size, entry + section);
      if (r !== null) return [r[0], 0, bad_entry, bad_section, r[1]];
    }
    bad_section = -1;
  }
  return [null, Math.floor(first / 2), -1, -1, where];
}

// ---- the world -------------------------------------------------------------------------------------------------------
// A name the config gives, as enemies_env_item reads it back (scenebuild.py env_text_name)
export function env_text_name(value) {
  let out = '';
  for (const c of value) {
    if (c === '"') out += '?';
    else if (c >= ' ' && c < '\x7f') out += c === ' ' ? '_' : en_lower(c);
    else out += '?';
  }
  return out;
}

function sget(shared, key) {
  if (!shared) return null;
  return shared instanceof Map ? (shared.has(key) ? shared.get(key) : null) : (shared[key] === undefined ? null : shared[key]);
}

function mget(m, k) {
  if (!m) return undefined;
  return m instanceof Map ? m.get(k) : m[k];
}

function mhas(m, k) {
  if (!m) return false;
  return m instanceof Map ? m.has(k) : Object.prototype.hasOwnProperty.call(m, k);
}

// Items 0-127 as the DLL's text hook names them: [[128 names], why not or null] (scenebuild.py item_names)
export function item_names(game, shared) {
  const kernel = game ? game.item_names : null;
  const limit = sget(shared, 'limit_item_names');
  const nw = sget(shared, 'item_names');
  const out = [];
  for (let i = 0; i < EN_ITEM_NAMES; i++) {
    if (mhas(limit, i)) out.push(env_text_name(mget(limit, i)));
    else if (i >= 105 && i < 128 && mhas(nw, i)) out.push(env_text_name(mget(nw, i)));
    else if (kernel) out.push(kernel[i]);
    else out.push(null);
  }
  if (!kernel) return [out, game ? game.kernel_problem : 'the game folder is not known'];
  return [out, null];
}

// en_env: the config folder (enemyscan.Folder), the registered enemy folders, the game data and the item names
export class Env {
  constructor(folder, known, game, items, items_why) {
    this.folder = folder;
    this.known = new Set(known.map(x => ascii_lower(x)));
    this.game = game || null;
    this.items = items === undefined ? null : items;
    this.items_why = items_why === undefined ? null : items_why;
    this.scene_count = this.game ? this.game.scenes : 0;
    this.pool_first = ENEMIES_POOL_FIRST;
  }

  exists(rel) { return this.folder.is_file(rel); }

  older(rel, than) {
    const a = this.folder.mtime(rel);
    const b = this.folder.mtime(than);
    return a !== null && b !== null && a < b;
  }

  enemy_known(folder) { return this.known.has(ascii_lower(folder)); }

  kernel_attack(aid) {
    const g = this.game;
    const rec = g && g.attack_records ? g.attack_records[aid] : Buffer.alloc(28, 0xff);
    const name = g && g.attack_names ? g.attack_names[aid] : Buffer.alloc(32, 0xff);
    return [rec, name];
  }

  item_name(i) {
    if (this.items === null) return null;
    return this.items[i] === undefined ? null : this.items[i];
  }

  base_record(aid, k) {
    const g = this.game;
    if (g === null || (g.scene_problem !== null && !g.bases.size)) {
      throw new NotForecast(cfmt(NF_BASE, at(k), aid, g ? g.scene_problem : 'the game folder is not known'), k[2], k[3]);
    }
    const hit = g.bases.has(aid) ? g.bases.get(aid) : null;
    if (hit === null && g.scene_problem !== null) throw new NotForecast(cfmt(NF_BASE, at(k), aid, g.scene_problem), k[2], k[3]);
    return hit;
  }

  stand_in(scene, formation) {
    const g = this.game;
    if (g === null || scene < 0 || !g.stand.has(scene) || formation < 0 || formation > 3) return null;
    return g.stand.get(scene)[formation];
  }
}

// ---- the build -------------------------------------------------------------------------------------------------------
export class Action {
  constructor(key, section) {
    this.key = key;
    this.section = section;
    this.id = section;
    this.script = 0;
    this.camera = 0;
    this.effect = 0;
    this.effect_all = 0;
    this.camera_multi = 0xffff;
  }
}

export class Enemy {
  constructor() {
    this.folder = '';
    this.doc = null;
    this.enemy = null;
    this.actions = [];
    this.label = null;
  }
}

// en_result, and the build's notes
export class Result {
  constructor() {
    this.ok = false;
    this.problem = null;
    this.notes = [];
    this.battle = 0;
    this.scene = 0;
    this.formation = 0;
    this.dll = 0;
    this.scene_name = '';
    this.enemies = 0;
    this.folder = ['', '', ''];
    this.name = ['', '', ''];
    this.served = [0, 0, 0];
    this.no_model = [0, 0, 0];
    this.stand_in = 0;
    this.stand_bytes = 0;
    this.ai_bytes = 0;
    this.attacks = 0;
    this.kernel_attacks = 0;
    this.fx = [[], [], []];
    this.surrounded = [0, 0, 0, 0];
    this.party_radius = [0, 0, 0, 0];
    this.party_front = [0, 0, 0, 0];
    this.image = Buffer.alloc(EN_IMAGE_SIZE, 0xff);
    this.paths = new Map();
    this.mismatch = false;
  }
}

function is_number(word) {
  try {
    es.en_number(word, '', -(2 ** 62), 2 ** 62);
    return true;
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    return !ex.text.endsWith('is not a number');
  }
}

function u32le(h, o) {
  return (h[o] | (h[o + 1] << 8) | (h[o + 2] << 16) | (h[o + 3] << 24)) >>> 0;
}

function put16(img, o, v) {
  img[o] = v & 0xff;
  img[o + 1] = (v >> 8) & 0xff;
}

function text_bytes(t) {
  return Buffer.from(t, 'latin1');
}

export class Builder {
  constructor(env) {
    this.env = env;
    this.b = null;
    this.r = null;
    this.enemy_label = null;
  }

  load(relative, label) { return this.b.en_load(relative, label); }

  note(line, label, ln) { this.r.notes.push([line, label === undefined ? null : label, ln || 0]); }

  // en_item: an item by name (items 0-127, lower case, '_' for a space) or by number 0-0x13f
  item(token, where, k) {
    const word = en_copy(token, 64);
    const lower = ascii_lower(word);
    if (token.length < 64) {
      for (let i = 0; i < EN_ITEM_NAMES; i++) {
        const name = this.env.item_name(i);
        if (name !== null && name === lower) return i;
      }
      if (this.env.items_why && !is_number(word)) throw new NotForecast(cfmt(NF_ITEM, where, word, this.env.items_why), k[2], k[3]);
    }
    return number(word, where, 0, 0x13f, k);
  }

  attack_extras(d, s, key, a) {
    let k = Doc.get(s, 'effect');
    if (a.id < 0x100 && k !== null) {
      const n = number(k[1], at(k), 0x100, 0xffff, k);
      if (a.id >= 0x38) fail(where_of(k), F_KERNEL_EFFECT, at(k), a.id);
      a.effect = n;
    }
    k = Doc.get(s, 'effect_all');
    if (k !== null) {
      if (!a.effect) fail(where_of(k), F_EFFECT_ALL, at(k), key);
      a.effect_all = number(k[1], at(k), 0x100, 0xffff, k);
    }
    k = Doc.get(s, 'camera_multi');
    if (k !== null) {
      if (a.camera === 0xffff) fail(where_of(k), F_CAMERA_MULTI, at(k), key);
      a.camera_multi = number(k[1], at(k), 0, 0xfffe, k);
    }
    if (a.effect && a.script === 3) {
      const ke = Doc.get(s, 'effect');
      this.note(cfmt(N_SCRIPT3, at(ke), key, a.effect).slice(0, 399), ke[2], ke[3]);
    }
  }

  // en_attack: [id, record, name] of one [attack KEY] section; fills the action
  attack(d, s, key, a) {
    const k_id = Doc.get(s, 'id');
    const k_script = Doc.get(s, 'script');
    const k_camera = Doc.get(s, 'camera');
    const absent = 'attack ' + key.slice(0, 31);
    const hdr = { label: this.enemy_label, line: 0 };
    const W = (k) => (k !== null ? at(k) : absent);
    const WL = (k) => (k !== null ? where_of(k) : hdr);
    if (k_id === null) fail(hdr, F_NO_ID, key);
    let n = number(k_id[1], at(k_id), 0, 0xfffe, k_id);
    if (n >= 0x8000) fail(where_of(k_id), F_ID_RANGE, at(k_id));
    a.key = key;
    a.id = n;
    a.effect = 0;
    a.effect_all = 0;
    a.camera_multi = 0xffff;
    const sv = k_script !== null && cstr(k_script[1]) ? k_script[1] : '3';
    n = number_at(sv, W(k_script), 0, 0x3f, WL(k_script));
    if (n < 3) fail(WL(k_script), F_SCRIPT, W(k_script));
    a.script = n;
    const camera = k_camera !== null && cstr(k_camera[1]) ? k_camera[1] : 'default';
    if (en_lower_is(camera, 'default')) a.camera = 0xffff;
    else a.camera = number(k_camera[1], at(k_camera), 0, 0xfffe, k_camera);
    if (a.id < 0x100) {
      for (const k of s[1]) {
        if (!EN_KERNEL_ATTACK_KEYS.includes(k[0])) fail(where_of(k), F_KERNEL_KEY, at(k), key, a.id, k[0], EN_SORTED_KERNEL_KEYS);
      }
      if (a.id >= 0x80) fail(WL(k_id), F_KERNEL_ID, W(k_id));
      const [rec, name] = this.env.kernel_attack(a.id);
      this.attack_extras(d, s, key, a);
      return [a.id, Buffer.from(rec), Buffer.from(name)];
    }
    for (const k of s[1]) {
      if (!EN_SCENE_ATTACK_KEYS.includes(k[0])) fail(where_of(k), F_ATTACK_KEY, at(k), k[0], EN_SORTED_ATTACK_KEYS);
    }
    if (Doc.get(s, 'base') === null || Doc.get(s, 'name') === null) fail(hdr, F_BASE_NAME, key);
    let k = Doc.get(s, 'base');
    n = number(k[1], at(k), 0x100, 0xfffe, k);
    const hit = this.env.base_record(n, k);
    if (hit === null) fail(where_of(k), F_NO_BASE, at(k), n);
    const r = Buffer.from(hit[0]);
    const byte_key = (name, pos, high) => {
      const kk = Doc.get(s, name);
      if (kk !== null) r[pos] = number(kk[1], at(kk), 0, high, kk) & 0xff;
    };
    byte_key('power', 15, 255);
    byte_key('accuracy', 0, 255);
    byte_key('target', 12, 255);
    k = Doc.get(s, 'mp');
    if (k !== null) put16(r, 4, number(k[1], at(k), 0, 999, k));
    k = Doc.get(s, 'impact');
    if (k !== null) r[1] = en_lower_is(k[1], 'none') ? 0xff : number(k[1], at(k), 0, 255, k);
    k = Doc.get(s, 'effect');
    if (k !== null) {
      if (en_lower_is(k[1], 'none')) r[13] = 0xff;
      else {
        n = number(k[1], at(k), 0, 0xffff, k);
        if (n >= 0x100) {
          r[13] = EN_NATIVE_BASE;
          a.effect = n;
        } else r[13] = n;
      }
    }
    k = Doc.get(s, 'sound');
    if (k !== null) put16(r, 6, en_lower_is(k[1], 'none') ? 0xffff : number(k[1], at(k), 0, 0xfffe, k));
    k = Doc.get(s, 'formula');
    if (k !== null) {
      const lower = ascii_lower(cstr(k[1]).slice(0, 63));
      if (lower === 'physical') r[14] = 0x11;
      else if (lower === 'magical') r[14] = 0x22;
      else r[14] = number(lower, at(k), 0, 255, k);
    }
    k = Doc.get(s, 'element');
    if (k !== null) {
      const bits = en_words_none(k[1]) ? 0 : en_bits(k[1], EN_ELEMENTS, EN_JOINED_ELEMENTS, at(k), 'element', k);
      put16(r, 24, bits);
    }
    k = Doc.get(s, 'status');
    if (k !== null) {
      const chance = Doc.get(s, 'status_chance');
      let bits;
      if (en_words_none(k[1])) {
        r[17] = 0xff;
        bits = 0xffffffff;
      } else {
        bits = en_bits(k[1], EN_STATUSES, EN_JOINED_STATUSES, at(k), 'status', k);
        const cv = chance !== null && cstr(chance[1]) ? chance[1] : '63';
        r[17] = number_at(cv, chance !== null ? at(chance) : absent, 0, 63, chance !== null ? where_of(chance) : hdr);
      }
      for (let i = 0; i < 4; i++) r[20 + i] = Math.floor(bits / 2 ** (8 * i)) & 0xff;
    } else {
      k = Doc.get(s, 'status_chance');
      if (k !== null) r[17] = number(k[1], at(k), 0, 63, k);
    }
    this.attack_extras(d, s, key, a);
    k = Doc.get(s, 'name');
    return [a.id, r, en_encode(k[1], at(k), 32, k)];
  }

  load_enemy(folder, E) {
    if (!es.en_name_ok(folder)) fail(null, F_FOLDER_NAME, folder, EN_NAME_MAX);
    if (!this.env.enemy_known(folder)) fail(null, F_NOT_KNOWN, folder, folder);
    const d = new Doc();
    const gl = folder + '/generated.ini';
    const ul = folder + '/enemy.ini';
    const found = this.b.en_read_pair('enemies/' + folder + '/generated.ini', gl, 'enemies/' + folder + '/enemy.ini', ul, d);
    this.enemy_label = this.b.paths.has(ul) ? ul : gl;
    if (!found) fail(null, F_NO_FILES, folder, folder);
    E.folder = folder.slice(0, EN_NAME_MAX);
    E.doc = d;
    E.label = this.enemy_label;
    E.enemy = d.sec('enemy');
    const here = { label: this.enemy_label, line: 0 };
    if (E.enemy === null) fail(here, F_NO_ENEMY, folder);
    for (const k of E.enemy[1]) if (!EN_ENEMY_KEYS.includes(k[0])) fail(where_of(k), F_ENEMY_KEY, at(k), k[0], EN_SORTED_ENEMY_KEYS);
    for (const req of ['name', 'model', 'level', 'hp', 'ai']) if (Doc.get(E.enemy, req) === null) fail(here, F_ENEMY_MISSING, folder, req);
    E.actions = [];
    d.sections.forEach(([name], i) => {
      if (name.slice(0, 7) === 'attack ') {
        let key = name.slice(7);
        let j = 0;
        while (j < key.length && en_space(key[j])) j += 1;
        key = key.slice(j);
        if (key.length > EN_NAME_MAX) fail(here, F_ATTACK_NAME, folder, EN_NAME_MAX, key.length);
        E.actions.push(new Action(key, i));
      }
    });
  }

  // en_enemy_record: the 0xb8 bytes of an enemy
  enemy_record(E) {
    const s = E.enemy;
    const r = Buffer.alloc(0x98, 0xff);
    this.enemy_label = E.label;
    const here = { label: E.label, line: 0 };
    const stat = (name, pos, low, high, fallback) => {
      const k = Doc.get(s, name);
      const n = k !== null ? number(k[1], at(k), low, high, k) : fallback;
      r[pos] = n & 0xff;
    };
    stat('level', 0, 1, 99, 0);
    stat('spd', 1, 0, 255, 0);
    stat('luck', 2, 0, 255, 0);
    stat('eva', 3, 0, 255, 0);
    stat('str', 4, 0, 255, 0);
    stat('def', 5, 0, 255, 0);
    stat('mag', 6, 0, 255, 0);
    stat('mdef', 7, 0, 255, 0);
    let k = Doc.get(s, 'elements');
    if (k !== null && !en_words_none(k[1])) {
      const [count, w] = words_of(k[1], true, 16);
      if (count > 8) fail(where_of(k), F_ELEMENTS_8, at(k));
      for (let i = 0; i < count; i++) {
        const word = ascii_lower(en_copy(w[i], 64));
        const ci = word.indexOf(':');
        if (ci < 0) fail(where_of(k), F_ELEMENT_RATE, at(k), en_copy(w[i], 64));
        const name = word.slice(0, ci);
        const rate = word.slice(ci + 1);
        if (!EN_ELEMENTS.includes(name)) fail(where_of(k), F_NO_ELEMENT, at(k), name, EN_JOINED_ELEMENTS);
        r[8 + i] = EN_ELEMENTS.indexOf(name);
        if (!EN_RATE_NAMES.includes(rate)) fail(where_of(k), F_NO_RATE, at(k), rate, EN_JOINED_RATES);
        r[16 + i] = EN_RATE_VALUES[EN_RATE_NAMES.indexOf(rate)];
      }
    }
    if (E.actions.length > 16) fail(here, F_ACTIONS_16, E.folder, E.actions.length);
    E.actions.forEach((a, i) => {
      r[24 + i] = a.script & 0xff;
      put16(r, 40 + 2 * i, a.id);
      put16(r, 72 + 2 * i, a.camera);
    });
    const items = [];
    ['drops', 'steals'].forEach((lst, l) => {
      const kk = Doc.get(s, lst);
      if (kk === null || en_words_none(kk[1])) return;
      const [count, w] = words_of(kk[1], true, 8);
      for (let i = 0; i < count; i++) {
        if (i >= 8 || items.length >= 8) fail(here, F_ITEMS_4, E.folder);
        const tok = w[i];
        const ci = tok.indexOf(':');
        const item_tok = ci < 0 ? tok : tok.slice(0, ci);
        const rate = ci < 0 ? '' : en_copy(tok.slice(ci + 1), 64);
        const n = number(rate || '8', at(kk), 0, 63, kk);
        const rate_byte = (l ? 0x80 : 0) | n;
        items.push([rate_byte, this.item(item_tok, at(kk), kk)]);
      }
    });
    if (items.length > 4) fail(here, F_ITEMS_4, E.folder);
    items.forEach(([rate, ident], i) => {
      r[104 + i] = rate;
      put16(r, 108 + 2 * i, ident);
    });
    k = Doc.get(s, 'manipulate');
    if (k !== null && !en_words_none(k[1])) {
      const [count, w] = words_of(k[1], true, 8);
      if (count > 3) fail(where_of(k), F_MANIPULATE_3, at(k));
      for (let i = 0; i < count; i++) {
        const word = en_copy(w[i], 64);
        let j = 0;
        while (j < E.actions.length && (w[i].length >= 64 || word !== E.actions[j].key)) j += 1;
        if (j === E.actions.length) {
          let keys = '';
          E.actions.forEach((a, jj) => {      // the compiler's dict of keys: first appearance, in order
            for (let m = 0; m < jj; m++) if (E.actions[m].key === a.key) return;
            if (keys.length + a.key.length + 2 >= 512) return;
            keys += (keys ? ' ' : '') + a.key;
          });
          fail(where_of(k), F_MANIPULATE, at(k), word, keys);
        }
        put16(r, 116 + 2 * i, E.actions[j].id);
      }
    }
    let morph = 0xffff;
    k = Doc.get(s, 'morph');
    if (k !== null && !en_lower_is(k[1], 'none')) morph = this.item(cstr(k[1]), at(k), k);
    r[122] = 0xff;
    r[123] = 0xff;
    k = Doc.get(s, 'mp');
    put16(r, 124, k !== null ? number(k[1], at(k), 0, 0xffff, k) : 0);
    k = Doc.get(s, 'ap');
    put16(r, 126, k !== null ? number(k[1], at(k), 0, 0xffff, k) : 0);
    put16(r, 128, morph);
    k = Doc.get(s, 'back_multiplier');
    r[130] = (k !== null ? number(k[1], at(k), 0, 255, k) : 16) & 0xff;
    r[131] = 0xff;
    let bits = 0;
    k = Doc.get(s, 'immune');
    if (k !== null && !en_words_none(k[1])) bits = en_bits(k[1], EN_STATUSES, EN_JOINED_STATUSES, at(k), 'status', k);
    const values = [];
    ['hp', 'exp', 'gil'].forEach((w4, i) => {
      const kk = Doc.get(s, w4);
      values.push(kk !== null ? number(kk[1], at(kk), i ? 0 : 1, 0xffffffff, kk) : 0);
    });
    values.push((~bits) >>> 0, 0xffffffff);
    for (let i = 0; i < 20; i++) r[132 + i] = Math.floor(values[Math.floor(i / 4)] / 2 ** (8 * (i & 3))) & 0xff;
    k = Doc.get(s, 'name');
    const v = cstr(k[1]);
    const name = v.length > EN_NAME_MAX ? en_encode(v, at(k), 32, k) : en_encode(v + ' ', at(k), 32, k);
    return Buffer.concat([name, r]);
  }

  // the entry bytes of enemy E's AI
  enemy_ai(E) {
    const k = Doc.get(E.enemy, 'ai');
    const value = cstr(k[1]);
    const length = value.length;
    if (en_lower_is(value, 'none')) {
      if (!E.actions.length) fail(where_of(k), F_AI_NONE, at(k));
      const first = E.actions[0].id;
      const t = Buffer.concat([Buffer.alloc(32, 0xff),
        Buffer.from([0x12, 0x70, 0x20, 0x02, 0xa0, 0x20, 0x82, 0x90, 0x60, 0x20, 0x61, 0, 0, 0x92, 0x73, 0xff])]);
      t[2] = 0x20;
      t[3] = 0x00;
      t[32 + 11] = first & 0xff;
      t[32 + 12] = (first >> 8) & 0xff;
      return t;
    }
    if ([...value].some(c => '\\/:'.includes(c)) || length >= 64 || value === '..') fail(where_of(k), F_AI_NAME, at(k));
    let file = value;
    if (length > 4 && ascii_lower(file.slice(-4)) === '.txt') file = file.slice(0, -4);
    const relative = 'enemies/' + E.folder.slice(0, 31) + '/' + file.slice(0, 63);
    const label = E.folder.slice(0, 31) + '/' + file.slice(0, 63);
    let text;
    try {
      text = this.load(relative, label);
    } catch (ex) {
      if (ex instanceof EnFail) throw new EnFail(ex.text, k[2], k[3]);
      throw ex;
    }
    if (text === null) {
      if (file !== value) fail(where_of(k), F_AI_ASSEMBLE, at(k), E.folder, file, value);
      fail(where_of(k), F_AI_MISSING, at(k), E.folder, file);
    }
    if (file !== value) {
      if (this.env.older(relative, 'enemies/' + E.folder.slice(0, 31) + '/' + value.slice(0, 63))) {
        this.note(cfmt(N_OLDER, E.folder, file, value).slice(0, 299), k[2], k[3]);
      }
    }
    const data = text_bytes(text);
    const [problem, entries, be, bs, wh] = ai_block_check(data, data.length);
    if (problem) fail(where_of(k), F_AI_CHECK, E.folder, file, problem, be, bs, wh);
    if (entries !== 1 || data.length < 2 || data[0] !== 2 || data[1] !== 0) fail(where_of(k), F_AI_ENTRY, E.folder, file);
    return data.subarray(2);
  }

  ai_attacks(E, entry) {
    const size = entry.length;
    const missing = [];
    const have = new Set(E.actions.map(a => a.id));
    for (let i = 0; i < size - 4; i++) {
      let aid = -1;
      if (entry[i] !== 0x60 || entry[i + 1] !== 0x20) continue;
      if (entry[i + 2] === 0x60 && i + 4 < size && entry[i + 4] === 0x92) aid = entry[i + 3];
      else if (entry[i + 2] === 0x61 && i + 5 < size && entry[i + 5] === 0x92) aid = entry[i + 3] | (entry[i + 4] << 8);
      if (aid < 0 || have.has(aid)) continue;
      if (!missing.includes(aid) && missing.length < 64) {
        missing.push(aid);
        missing.sort((x, y) => x - y);
      }
    }
    if (missing.length) {
      const k = Doc.get(E.enemy, 'ai');
      const ids = missing.map(x => x.toString(16).padStart(4, '0')).join(' ');
      fail(where_of(k), F_AI_ATTACKS, E.folder, cstr(k[1]), ids, E.folder);
    }
  }

  // en_model_check: whether the folder's model\aa is served (false: no aa at all)
  model_check(folder, label) {
    const here = { label, line: 0 };
    let text;
    try {
      text = this.load('enemies/' + folder + '/model/aa', folder + '/model/aa');
    } catch (ex) {
      if (ex instanceof EnFail) throw new EnFail(ex.text, label, 0);
      throw ex;
    }
    if (text === null) return false;
    const h = text_bytes(text);
    const size = h.length;
    if (size < 0x34) fail(here, F_AA_SHORT, folder, size);
    const bones = u32le(h, 0x0c);
    const textures = u32le(h, 0x18);
    const weapons = u32le(h, 0x24);
    if (bones > 600 || textures > 10 || weapons > 16 || size < 0x34 + 12 * bones) fail(here, F_AA_BAD, folder, bones, textures, weapons, size);
    for (const [fx, what] of [['ab', 'its second file'], ['da', 'its animations']]) {
      if (!this.env.exists('enemies/' + folder + '/model/' + fx)) fail(here, F_AA_FIXED, folder, fx, what);
    }
    for (let i = 0; i < textures + bones + weapons; i++) {
      const n = i < textures ? 2 + i : i < textures + bones ? 12 + (i - textures) : 2 * 26 + 10 + (i - textures - bones);
      if (i >= textures && i < textures + bones && !u32le(h, 0x34 + 12 * (i - textures) + 8)) continue;
      const a = String.fromCharCode(97 + Math.floor(n / 26));
      const b = String.fromCharCode(97 + n % 26);
      if (!this.env.exists('enemies/' + folder + '/model/' + a + b)) {
        const what = i < textures ? 'texture' : i < textures + bones ? 'the part of bone' : 'weapon';
        const idx = i < textures ? i : i < textures + bones ? i - textures : i - textures - bones;
        fail(here, F_AA_LISTS, folder, a, b, what, idx);
      }
    }
    return true;
  }

  // en_build. A Result: ok, or the problem (EnFail with the label and line to file it under; NotForecast)
  build(name, want, battle) {
    if (want === undefined) want = -1;
    if (battle === undefined) battle = 0;
    const r = this.r = new Result();
    this.b = new es.Build(this.env.folder);
    r.paths = this.b.paths;
    this.enemy_label = null;
    try {
      this._build(name, want, battle);
      r.ok = true;
    } catch (ex) {
      if (!(ex instanceof EnFail) && !(ex instanceof NotForecast)) throw ex;
      r.problem = ex;
    }
    return r;
  }

  _build(name, want, battle) {
    const r = this.r;
    const env = this.env;
    if (!es.en_name_ok(name)) fail(null, F_NAME, name, EN_NAME_MAX);
    const gl = 'generated/' + name + '.ini';
    const ul = 'scenes/' + name + '.ini';
    const doc = new Doc();
    this.b.en_read_pair('scenes/generated/' + name + '.ini', gl, 'scenes/' + name + '.ini', ul, doc);
    const scene_label = this.b.paths.has(ul) ? ul : gl;
    const here = { label: scene_label, line: 0 };
    const sc = doc.sec('scene');
    if (sc === null) fail(here, F_NO_SCENE, name);
    for (const k of sc[1]) if (k[0] !== 'number' && k[0] !== 'enemies') fail(where_of(k), F_SCENE_KEY, at(k), k[0]);
    let k = Doc.get(sc, 'number');
    if (k === null) fail(here, F_NO_NUMBER, name);
    const number_ = number(k[1], at(k), 0, 4095, k);
    if (number_ === 255) fail(where_of(k), F_255, at(k));
    if (want >= 0 && number_ !== want) {
      r.mismatch = true;
      fail(where_of(k), F_MISMATCH, at(k), number_, want);
    }
    const dll = number_ >= EN_SCENE_FIRST;
    r.battle = want >= 0 ? battle : number_ * 4;
    r.scene = number_;
    r.formation = r.battle & 3;
    r.dll = dll ? 1 : 0;
    r.scene_name = name.slice(0, EN_NAME_MAX);
    k = Doc.get(sc, 'enemies');
    if (k === null) fail(here, F_NO_ENEMIES, name);
    const [count, w] = words_of(k[1], true, 8);
    if (count < 1 || count > 3) fail(where_of(k), F_ENEMY_COUNT, at(k));
    const enemies_key = k;
    r.enemies = count;
    const E = [];
    for (let i = 0; i < count; i++) E.push(new Enemy());
    for (let i = 0; i < count; i++) {
      r.folder[i] = en_copy(w[i], EN_NAME_MAX + 1);
      if (w[i].length > EN_NAME_MAX) fail(where_of(enemies_key), F_FOLDER_NAME, r.folder[i], EN_NAME_MAX);
      try {
        this.load_enemy(r.folder[i], E[i]);
      } catch (ex) {
        if (ex instanceof EnFail && ex.label === null) throw new EnFail(ex.text, enemies_key[2], enemies_key[3]);
        throw ex;
      }
    }
    const img = r.image;
    const models = [];
    for (let i = 0; i < count; i++) {
      const e = E[i];
      k = Doc.get(e.enemy, 'model');
      let model;
      if (dll) model = env.pool_first + i;
      else {
        if (en_lower_is(k[1], 'pool')) fail(where_of(k), F_POOL, at(k), number_);
        model = number(k[1], at(k), 0, 369, k);
      }
      for (let j = 0; j < i; j++) if (models[j] === model) fail({ label: e.label, line: 0 }, F_MODEL_TWICE, e.folder, model, j);
      models.push(model);
      put16(img, EN_O_IDS + 2 * i, model);
    }
    const table = [];
    for (let i = 0; i < count; i++) {
      const e = E[i];
      this.enemy_label = e.label;
      for (const a of e.actions) {
        const [rid, rec, nm] = this.attack(e.doc, e.doc.sections[a.section], a.key, a);
        const hit = table.find(t => t[0] === rid);
        if (hit !== undefined) {
          if (!hit[1].equals(rec) || !hit[2].equals(nm)) fail({ label: e.label, line: 0 }, F_TWO_RECORDS, rid, a.key);
          continue;
        }
        if (table.length === EN_TABLE_MAX) fail({ label: e.label, line: 0 }, F_TABLE_MAX, EN_TABLE_MAX);
        table.push([rid, rec, nm]);
      }
    }
    if (table.length > 32) fail(here, F_TABLE_32, table.length);
    table.sort((x, y) => x[0] - y[0]);
    r.attacks = table.length;
    r.kernel_attacks = 0;
    table.forEach(([rid, rec, nm], i) => {
      rec.copy(img, EN_O_ATTACK + 28 * i, 0, 28);
      put16(img, EN_O_ATTACK_ID + 2 * i, rid);
      nm.copy(img, EN_O_ATTACK_NAME + 32 * i, 0, 32);
      if (rid < 0x100) r.kernel_attacks += 1;
    });
    for (let i = 0; i < count; i++) {
      const rec = this.enemy_record(E[i]);
      rec.copy(img, EN_O_ENEMY + 0xb8 * i, 0, 0xb8);
      r.fx[i] = E[i].actions.slice(0, 16).map(a => [a.id, a.effect, a.effect_all, a.camera_multi]);
      let j = 0;
      let nm = '';
      while (j < 32 && rec[j] !== 0xff) {
        nm += String.fromCharCode((rec[j] + 0x20) & 0xff);
        j += 1;
      }
      r.name[i] = nm.replace(/ +$/, '');
    }
    const forms = [];
    for (let f = 0; f < 4; f++) {
      forms.push(doc.sec('formation ' + f));
      if (!f && forms[0] === null) fail(here, F_NO_FORMATION, name);
    }
    const lists = [];
    for (let f = 0; f < 4; f++) {
      const lst = forms[0][1].slice();
      if (f && forms[f] !== null) {
        for (const kk of forms[f][1]) {
          let j = null;
          for (let jj = 0; jj < forms[0][1].length; jj++) if (lst[jj][0] === kk[0]) { j = jj; break; }
          if (j !== null) lst[j] = kk;
          else lst.push(kk);
        }
      }
      lists.push(lst);
    }
    for (let f = 0; f < 4; f++) {
      const keyed = [null, null, null, null, null, null, null, null, null];
      for (const kk of lists[f]) {
        if (!EN_FORMATION_KEYS.includes(kk[0])) fail(where_of(kk), F_FORM_KEY, at(kk), kk[0], EN_SORTED_FORMATION_KEYS);
        keyed[EN_FORMATION_KEYS.indexOf(kk[0])] = kk;
      }
      const fhere = { label: forms[f] !== null && forms[f][1].length ? forms[f][1][0][2] : scene_label, line: 0 };
      for (let i = 0; i < 3; i++) if (keyed[i] === null) fail(fhere, F_FORM_MISSING, name, f, EN_FORMATION_KEYS[i]);
      const so = EN_O_SETUP + 0x14 * f;
      const co = EN_O_CAMERA + 0x30 * f;
      let n = number(keyed[0][1], at(keyed[0]), 0, 89, keyed[0]);
      put16(img, so, n);
      const kc = keyed[1];
      const parts = [];
      const pieces = cstr(kc[1]).split(':');
      pieces.forEach((piece, pi) => {
        if (pi < 3) parts.push(number(en_copy(piece, 64), at(kc), 0, 255, kc));
      });
      if (pieces.length !== 2) fail(where_of(kc), F_CAMERA_FORM, at(kc));
      const cs = parts[0];
      const cf = parts[1];
      const sct = env.scene_count;
      if (cs > 254 || (sct && cs >= sct) || cf > 3) {
        fail(where_of(kc), F_CAMERA_RANGE, at(kc), cs, cf, sct ? (sct < 255 ? sct : 255) - 1 : 254);
      }
      if (f === r.formation) r.stand_in = cs * 4 + cf;
      let kind = 0;
      if (keyed[3] !== null) {
        while (kind < 6 && !en_lower_is(keyed[3][1], EN_KINDS[kind])) kind += 1;
        if (kind === 6) fail(where_of(keyed[3]), F_KIND, at(keyed[3]), EN_JOINED_KINDS);
      }
      r.surrounded[f] = kind === EN_SUR_KIND ? 1 : 0;
      if (kind === EN_SUR_KIND) kind = 0;
      k = keyed[7];
      r.party_radius[f] = k !== null ? number(k[1], at(k), EN_SUR_RADIUS_MIN, EN_SUR_RADIUS_MAX, k) : EN_SUR_RADIUS_DEFAULT;
      k = keyed[8];
      r.party_front[f] = k !== null ? number(k[1], at(k), 0, 359, k) : 0;
      k = keyed[6];
      if (k === null || en_lower_is(k[1], 'none')) n = 0xffff;
      else {
        n = number(k[1], at(k), 0, 0xfffe, k);
        if ((n >= 1020 && n <= 1023) || n > EN_BATTLE_LAST) fail(where_of(k), F_NEXT, at(k));
      }
      put16(img, so + 2, n);
      k = keyed[4];
      put16(img, so + 4, k !== null ? number(k[1], at(k), 0, 0xffff, k) : 1);
      img[so + 6] = 0xff;
      img[so + 7] = 0xff;
      k = keyed[5];
      put16(img, so + 0x10, k !== null ? number(k[1], at(k), 0, 0xffff, k) : 0xfffd);
      img[so + 0x12] = kind;
      if (f === r.formation) r.stand_bytes = 0;
      const st = env.stand_in(cs, cf);
      if (st !== null) {
        const [setup, camera] = st;
        setup.copy(img, so + 8, 8, 0x10);
        img[so + 0x13] = setup[0x13];
        camera.copy(img, co, 0, 0x30);
        if (f === r.formation) r.stand_bytes = 1;
      }
      const kr = keyed[2];
      const [rows, rw] = words_of(kr[1], false, 8);
      if (rows < 1 || rows > 6) fail(where_of(kr), F_ROWS, at(kr));
      const row_x = [0, 0, 0, 0, 0, 0];
      const row_z = [0, 0, 0, 0, 0, 0];
      for (let i = 0; i < rows; i++) {
        const token = en_copy(rw[i], 128);
        const piece = token.split(':');
        let slot = 0;
        while (slot < count && piece[0] !== r.folder[slot]) slot += 1;
        if (slot === count || rw[i].length >= 128) fail(where_of(kr), F_ROW_ENEMY, at(kr), piece[0], r.folder.slice(0, count).join(', '));
        const xyz = [];
        if (piece.length > 1) for (const part of piece[1].split(',')) xyz.push(number(en_copy(part, 64), at(kr), -32768, 32767, kr));
        if (xyz.length !== 3) fail(where_of(kr), F_ROW_XYZ, at(kr), en_copy(rw[i], 128));
        const row_number = piece.length > 2 ? number(piece[2], at(kr), 0, 0xffff, kr) : 1;
        const cover = piece.length > 3 ? number(piece[3], at(kr), 0, 0xffff, kr) : 0;
        const ro = EN_O_ROWS + 0x60 * f + 16 * i;
        put16(img, ro, models[slot]);
        for (let j = 0; j < 3; j++) put16(img, ro + 2 + 2 * j, xyz[j]);
        put16(img, ro + 8, row_number);
        put16(img, ro + 10, cover);
        img[ro + 12] = img[ro + 13] = img[ro + 14] = img[ro + 15] = 0xff;
        row_x[i] = xyz[0];
        row_z[i] = xyz[2];
      }
      if (r.surrounded[f]) {
        const [, , count_at] = en_sur_assign(rows, row_x, row_z, r.party_front[f]);
        for (let i = 0; i < 3; i++) if (count_at[i] > EN_SUR_PER_PLACE) fail(where_of(kr), F_SURROUNDED, name, f, i, count_at[i], EN_SUR_PER_PLACE);
      }
    }
    let pos = 6;
    for (let i = 0; i < count; i++) {
      const e = E[i];
      this.enemy_label = e.label;
      const entry = this.enemy_ai(e);
      this.ai_attacks(e, entry);
      if (pos + entry.length > 0x1000) fail(where_of(Doc.get(e.enemy, 'ai')), F_AI_FIT);
      put16(img, EN_O_ENEMY_AI + 2 * i, pos);
      Buffer.from(entry).copy(img, EN_O_ENEMY_AI + pos);
      pos = (pos + entry.length + 1) & ~1;
    }
    const area = Buffer.from(img.subarray(EN_O_ENEMY_AI, EN_O_ENEMY_AI + 0x1000));
    const [bad, , be, bs, wh] = ai_block_check(area, 0x1000);
    if (bad) fail(here, F_AI_AREA, bad, be, bs, wh);
    r.ai_bytes = pos;
    if (dll) {
      for (let i = 0; i < count; i++) {
        let j = null;
        for (let jj = 0; jj < i; jj++) if (r.folder[jj] === r.folder[i]) { j = jj; break; }
        if (j !== null) {
          r.served[i] = r.served[j];
          r.no_model[i] = r.no_model[j];
          continue;
        }
        const served = this.model_check(r.folder[i], E[i].label);
        r.served[i] = served ? 1 : 0;
        r.no_model[i] = served ? 0 : 1;
      }
    }
  }
}

// ---- the editor's side: the check's lines, and a cache of builds ----------------------------------------------------
export const BUILD_REFUSED = "enemies: battles %d-%d (DLL scene %d '%.31s', forecast) refused: %s";
export const BUILD_NOT_FORECAST = "DLL scene %d '%.31s': not forecast: %s";
export const BUILD_QUIET = '; the %d scene(s) not forecast are not listed one by one: without the game\'s data each stops at its first ' +
  'base or item name (Check this scene, or the scene command, says where)';
export const BUILD_SUMMARY = 'the scene builds (forecast): %d of %d registered scene(s) build, %d refused, %d not forecast; ' +
  '%d registered enemy folder(s) no scene names (not built); %s';

// The folder as a build sees it, keeping what the build asked of it (scenebuild.py Recorder)
export class Recorder {
  constructor(folder) {
    this.f = folder;
    this.root = folder.root;
    this.texts = folder.texts;
    this.asked = [];
  }

  resolve(rel) { return this.f.resolve(rel); }

  listdir(rel) { return this.f.listdir(rel); }

  read(rel, capacity) {
    this.asked.push(rel);
    return this.f.read(rel, capacity);
  }

  is_file(rel) {
    this.asked.push(rel);
    return this.f.is_file(rel);
  }

  mtime(rel) {
    this.asked.push(rel);
    return this.f.mtime(rel);
  }

  signature() {
    return [...new Set(this.asked)].map(rel => [rel, stamp_of(this.f, rel)]);
  }
}

// What a path answers now: its real path and size and time (or the editor's text), or null when absent
export function stamp_of(folder, rel) {
  const real = folder.resolve(rel);
  if (real === null) return null;
  if (folder.texts.has(real)) return JSON.stringify([real, 'text', folder.texts.get(real)]);
  let st;
  try {
    st = fs.statSync(pyJoin(folder.root, real), { bigint: true });
  } catch (e) {
    return JSON.stringify([real, null]);
  }
  return JSON.stringify([real, String(st.size), String(st.mtimeNs), String(st.mode >> 12n)]);
}

// The scene's own file (relative, as listed): the user's when it was read, else the generated one
export function scene_file_of(r, name) {
  return r.paths.get('scenes/' + name + '.ini') || r.paths.get('generated/' + name + '.ini') || ('scenes/' + name + '.ini');
}

function file_of(r, label, name) {
  return (label ? r.paths.get(label) : null) || scene_file_of(r, name);
}

// The check's lines of one scene's build: [{file, line, text, kind, fmt, match}]
export function lines_of(number, name, r) {
  const out = [];
  for (const [text, label, line] of r.notes) {
    out.push({ file: file_of(r, label, name), line: r.paths.get(label) ? line : 0, text, kind: 'note', fmt: null, match: text });
  }
  if (r.problem === null) return out;
  const p = r.problem;
  const f = file_of(r, p.label, name);
  const line = p.label && r.paths.get(p.label) ? p.line : 0;
  if (p instanceof NotForecast) {
    out.push({ file: f, line, text: cfmt(BUILD_NOT_FORECAST, number, name, p.text), kind: 'tool', fmt: BUILD_NOT_FORECAST, match: null });
  } else {
    out.push({ file: f, line, text: cfmt(BUILD_REFUSED, number * 4, number * 4 + 3, number, name, p.text), kind: 'problem',
      fmt: BUILD_REFUSED, match: p.text });
  }
  return out;
}

// The builds of the registered scenes, each kept until something it read answers otherwise
export class Cache {
  constructor() { this.kept = new Map(); }

  builds(folder, scan, game, shared, only) {
    const [items, why] = item_names(game, shared);
    const known = scan.enemies;
    const world = JSON.stringify([known.map(k => ascii_lower(k)), game ? game.stamp() : null, items, why]);
    const out = [];
    for (const [number, name] of scan.scenes) {
      if (only && !only.has(name)) continue;
      const hit = this.kept.get(name);
      if (hit !== undefined && hit[0] === number + '\n' + world && hit[1].every(([rel, st]) => stamp_of(folder, rel) === st)) {
        out.push([number, name, hit[2]]);
        continue;
      }
      const rec = new Recorder(folder);
      const r = new Builder(new Env(rec, known, game, items, why)).build(name, number, number * 4);
      this.kept.set(name, [number + '\n' + world, rec.signature(), r]);
      out.push([number, name, r]);
    }
    return out;
  }
}

// (minor 5 of review C1) Whether the build has none of the game's data (no game folder, or one with neither a
// scene.bin nor a kernel2.bin it can read): every scene that needs it is then "not forecast", which the check says once,
// in its summary line, and not on each scene's file
export function no_game_data(game) {
  return game === null || game === undefined ||
    (game.scene_problem !== null && game.bases.size === 0 && game.item_names === null);
}

// The tool's line about the builds
export function summary(results, known, game) {
  let built = 0;
  let refused = 0;
  let nf = 0;
  const named = new Set();
  for (const [, , r] of results) {
    if (r.ok) built += 1;
    else if (r.problem instanceof NotForecast) nf += 1;
    else refused += 1;
    for (const x of r.folder.slice(0, r.enemies)) if (x) named.add(ascii_lower(x));
  }
  const unused = known.filter(k => !named.has(ascii_lower(k))).length;
  let text = cfmt(BUILD_SUMMARY, built, results.length, refused, nf, unused, game ? game.summary() : 'the game folder is not known');
  if (nf && no_game_data(game)) text += cfmt(BUILD_QUIET, nf);
  return text;
}

// What a built scene's hand-over line would say of it (enemies_hand_over's middle part)
export function built_text(r) {
  const parts = [];
  for (let i = 0; i < r.enemies; i++) {
    parts.push(cfmt("%d '%.31s' (%.31s%s)", r.dll ? ENEMIES_POOL_FIRST + i : -1, r.name[i], r.folder[i],
      r.no_model[i] ? ": no model\\aa, the archive's own model of the number is drawn" : ''));
  }
  return cfmt('enemies %s; stand-in battle %d (scene %d:%d); AI %d of 4096 bytes; %d attacks (%d of the kernel)',
    parts.join(', '), r.stand_in, r.stand_in >> 2, r.stand_in & 3, r.ai_bytes, r.attacks, r.kernel_attacks);
}
