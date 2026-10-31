// The port of tools/ai_tool.py (read and write FINAL FANTASY VII battle AI blocks as text) and of sxcfg/aipage.py
// (the AI page's files: ai\NAME.ai and its source ai\NAME.txt). Function for function, with Python's messages.
//
// A block is the kernel's own layout (KERNEL.BIN section 3 from offset 0x61c, and each scene's AI at scene+0xe80):
// a table of 16-bit ENTRY offsets (count = lowest used offset / 2), each entry 16 16-bit SECTION offsets relative to
// the entry (ffff = no script), then the scripts. Jump operands are offsets from the script's start. Opcodes and
// operand sizes are those of the game's interpreter FUN_005d7fe4 (ff7_en.exe).
//
// Bytes are Buffers. Text is Latin-1 (one char per byte); the routes refuse a char above U+00FF before it reaches
// here, so Python's Unicode \d and int() of other digits never differ from these.
// Node 22 language level.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { pyRepr, pyInt, pyLower, pySplit, pySplitlines, pyRstrip, pyIsdigit, pyJoin, pyIsfile, pyIsdir, pyCmp, PyValueError,
         PyIndexError, PyTypeError } from './py.js';
import * as safety from './safety.js';

// ---- Python's own errors where the port must raise them as Python does ----------------------------------------------
export class AIError extends Error {
  constructor(message) { super(message); this.name = 'AIError'; }
}
// struct.error (its __name__ is 'error')
export class StructError extends Error {
  constructor(message) { super(message); this.name = 'error'; }
}
export class PyMemoryError extends Error {
  constructor(message) { super(message || ''); this.name = 'MemoryError'; }
}
export class PyOverflowError extends Error {
  constructor(message) { super(message); this.name = 'OverflowError'; }
}
// zlib.error, EOFError, gzip.BadGzipFile
export class ZlibError extends Error {
  constructor(message) { super(message); this.name = 'error'; }
}
export class PyEOFError extends Error {
  constructor(message) { super(message); this.name = 'EOFError'; }
}
export class BadGzipFile extends Error {
  constructor(message) { super(message); this.name = 'BadGzipFile'; }
}

// The block as the assembler builds it. Python holds every byte; a block past 65535 bytes is refused at the end
// whatever it holds, so the port keeps the first KEEP bytes (every byte a fixup can reach in a block that is
// returned) and only counts the rest: `length` is Python's len(out). A length past HOLD_MAX is one no machine could
// allocate (the x86-64 user address space is 2**47 bytes), where Python raises MemoryError; that is the one place
// the port still answers MemoryError.
const KEEP = 0x10000;
const HOLD_MAX = 2 ** 47;
class Held {
  constructor() { this.bytes = []; this.length = 0; }
  push(...vs) {
    for (const v of vs) {
      if (this.length < KEEP) this.bytes.push(v);
      this.length++;
    }
  }
  // n copies of v (n > 0, already passed by hold)
  fill(v, n) {
    const k = Math.min(n, KEEP - this.bytes.length);
    for (let i = 0; i < k; i++) this.bytes.push(v);
    this.length += n;
  }
}

// struct.unpack_from('<H', b, at)
export function u16(b, at) {
  if (at < 0 || at + 2 > b.length) {
    throw new StructError('unpack_from requires a buffer of at least ' + (at + 2) + ' bytes for unpacking 2 bytes at offset ' +
                          at + ' (actual buffer size is ' + b.length + ')');
  }
  return b[at] | (b[at + 1] << 8);
}

// struct.pack_into('<H', out, offset, v) on an Array of byte values (Python's order: the offset, then the value)
function pack_u16_into(out, offset, v) {
  let off = BigInt(offset);
  if (off > 9223372036854775807n || off < -9223372036854775808n) throw new PyIndexError("cannot fit 'int' into an index-sized integer");
  const n = BigInt(out.length);
  if (off < 0n) {
    if (off + 2n > 0n) throw new StructError('no space to pack 2 bytes at offset ' + off);
    if (off + n < 0n) throw new StructError('offset ' + off + ' out of range for ' + n + '-byte buffer');
    off += n;
  }
  if (n - off < 2n) {
    throw new StructError('pack_into requires a buffer of at least ' + (off + 2n) + ' bytes for packing 2 bytes at offset ' +
                          off + ' (actual buffer size is ' + n + ')');
  }
  if (typeof v === 'bigint' || v < 0 || v > 0xffff) throw new StructError("'H' format requires 0 <= number <= 65535");
  // a Held block keeps its first KEEP bytes only: a write past them lands in a block refused for its size anyway
  const store = out instanceof Held ? out.bytes : out;
  const at = Number(off);
  if (at < store.length) store[at] = v & 0xff;
  if (at + 1 < store.length) store[at + 1] = v >> 8;
}

function hex(n, w) {
  const s = (typeof n === 'bigint' ? (n < 0n ? -n : n) : Math.abs(n)).toString(16);
  return (n < 0 ? '-' : '') + s.padStart(w || 0, '0');
}
const h2 = n => hex(n, 2);
const h4 = n => hex(n, 4);
const ljust = (s, w) => (s.length >= w ? s : s + ' '.repeat(w - s.length));

// ---- opcodes (read from FUN_005d7fe4: the high nibble picks the group, the low nibble the operation) ---------------
// kind: A = 16-bit AI address, J = 16-bit script-relative jump, I1/I2/I3 = 1/2/3-byte constant,
//       S = text ended by ff (ea-f1 carry 2 more bytes), D = debug: count byte + zero-ended string, null = none
export const OPS = new Map([
  [0x00, ['load.bit', 'A']], [0x01, ['load.byte', 'A']], [0x02, ['load.word', 'A']], [0x03, ['load.dword', 'A']],
  [0x10, ['addr.bit', 'A']], [0x11, ['addr.byte', 'A']], [0x12, ['addr.word', 'A']], [0x13, ['addr.dword', 'A']],
  [0x30, ['add', null]], [0x31, ['sub', null]], [0x32, ['mul', null]], [0x33, ['div', null]], [0x34, ['mod', null]],
  [0x35, ['band', null]], [0x36, ['bor', null]], [0x37, ['bnot', null]],
  [0x40, ['eq', null]], [0x41, ['ne', null]], [0x42, ['ge', null]], [0x43, ['le', null]], [0x44, ['gt', null]],
  [0x45, ['lt', null]],
  [0x50, ['and', null]], [0x51, ['or', null]], [0x52, ['not', null]],
  [0x60, ['push.b', 'I1']], [0x61, ['push.w', 'I2']], [0x62, ['push.3', 'I3']],
  [0x70, ['jz', 'J']], [0x71, ['jne', 'J']], [0x72, ['jmp', 'J']], [0x73, ['end', null]], [0x74, ['pop', null]],
  [0x75, ['link', null]],
  [0x80, ['mask', null]], [0x81, ['rand', null]], [0x82, ['randbit', null]], [0x83, ['count', null]],
  [0x84, ['maxof', null]], [0x85, ['minof', null]], [0x86, ['mpcost', null]], [0x87, ['tobit', null]],
  [0x90, ['store', null]], [0x91, ['drop', null]], [0x92, ['attack', null]], [0x93, ['say', 'S']],
  [0x94, ['copystats', null]], [0x95, ['globalvar', null]], [0x96, ['elemtarget', null]],
  [0xa0, ['debug', 'D']], [0xa1, ['drop2', null]],
]);
export const MNEM = new Map([...OPS].map(([k, v]) => [v[0], k]));
// a few spellings people are used to, accepted by the assembler only (disasm always writes the names above)
export const ALIASES = new Map([['jmpz', 'jz'], ['jump', 'jmp'], ['jneq', 'jne'], ['push', 'push.b'], ['show', 'say'],
  ['msg', 'say'], ['pop2', 'drop2'], ['popd', 'drop'], ['land', 'and'], ['lor', 'or'], ['lnot', 'not']]);

export const SECTIONS = ['init', 'main', 'counter', 'death', 'physical', 'magical', 'battle_end', 'pre_action',
  'custom1', 'custom2', 'custom3', 'custom4', 'custom5', 'custom6', 'custom7', 'custom8'];
export const SEC_ALIASES = new Map([['general_counter', 2], ['death_counter', 3], ['physical_counter', 4],
  ['magical_counter', 5], ['battleend', 6], ['end_of_battle', 6], ['preaction', 7], ['pre-action', 7]]);

export const KERNEL_CHARS = ['cloud', 'barret', 'tifa', 'aeris', 'red', 'yuffie', 'caitsith', 'vincent', 'cid',
  'youngcloud', 'sephiroth'];   // kernel entry indices 0-10 (11 is empty in both known kernels)

// ---- AI address names (FFNx 1.24.3's battle_ai_context / battle_actor_vars field names) ----------------------------
export const ADDR_NAMES = new Map([
  [0x2000, 'last_command'], [0x2008, 'last_action'], [0x2010, 'bank_value'], [0x2020, 'battle_type'],
  [0x2030, 'color_mask'], [0x2038, 'form'], [0x2050, 'active_actors'], [0x2060, 'self_mask'], [0x2070, 'target_mask'],
  [0x2080, 'allies_mask'], [0x2090, 'dead_allies_mask'], [0x20a0, 'enemies_mask'], [0x20b0, 'dead_enemies_mask'],
  [0x20c0, 'party_mask'], [0x20d0, 'enemy_actors_mask'], [0x20e0, 'all_actors_mask'], [0x2110, 'end_battle_flags'],
  [0x2120, 'last_elements'], [0x2140, 'formation'], [0x2150, 'last_attack_id'], [0x2160, 'battle_flags'],
  [0x2170, 'special_attack_flags'], [0x2180, 'limit_divisor'], [0x21c0, 'gil'],
  // the actor's record (009ab0dc + actor*0x68)
  [0x4000, 'statuses'], [0x4020, 'state_flags'], [0x4024, 'ai_controlled'], [0x4026, 'back_row'],
  [0x4028, 'immune_physical'], [0x4029, 'immune_magic'],
  [0x4040, 'index'], [0x4048, 'level'], [0x4058, 'element_response'], [0x4060, 'character_id'],
  [0x4068, 'strength'], [0x4070, 'magic'], [0x4078, 'evade'], [0x4080, 'idle_anim'], [0x4088, 'damage_anim'],
  [0x4090, 'back_damage'], [0x4098, 'size'], [0x40a0, 'dexterity'], [0x40a8, 'luck'], [0x40b0, 'idle_holder'],
  [0x40b8, 'last_covered'], [0x40c0, 'last_targets'], [0x40d0, 'last_attacker'], [0x40e0, 'last_physical_attacker'],
  [0x40f0, 'last_magical_attacker'], [0x4100, 'defense'], [0x4110, 'mdefense'], [0x4120, 'formation_id'],
  [0x4130, 'absorbed_elements'], [0x4140, 'mp'], [0x4150, 'max_mp'], [0x4160, 'hp'], [0x4180, 'max_hp'],
  [0x4220, 'initial_statuses'], [0x4268, 'mevade'], [0x4270, 'row'], [0x4278, 'camera_data'], [0x4280, 'gil_stolen'],
  [0x4290, 'item_stolen'], [0x42b0, 'miss_anim'], [0x42b8, 'ap'], [0x42c0, 'gil_value'], [0x42e0, 'exp_value'],
]);
// the status word at 4000 (bit n = address 4000+n): the game's status order
['death', 'near_death', 'sleep', 'poison', 'sadness', 'fury', 'confusion', 'silence', 'haste', 'slow', 'stop', 'frog',
 'small', 'slow_numb', 'petrify', 'regen', 'barrier', 'mbarrier', 'reflect', 'dual', 'shield', 'death_sentence',
 'manipulate', 'berserk', 'peerless', 'paralysis', 'darkness', 'dual_drain', 'death_force', 'resist', 'lucky_girl',
 'imprisoned'].forEach((s, n) => {
  if (n) ADDR_NAMES.set(0x4000 + n, 'st_' + s);    // bit 0 is the same address as the whole word: keep 'statuses'
});
export const NAME_ADDR = new Map([...ADDR_NAMES].map(([k, v]) => [v, k]));
const NAME_ADDR_LOWER = new Set([...NAME_ADDR.keys()].map(k => pyLower(k)));

export const COMMANDS = new Map([[0x00, 'Left'], [0x01, 'Attack'], [0x02, 'Magic'], [0x03, 'Summon'], [0x04, 'Item'],
  [0x05, 'Steal'], [0x06, 'Sense'], [0x07, 'Coin'], [0x08, 'Throw'], [0x09, 'Morph'], [0x0a, 'D.blow'],
  [0x0b, 'Manip.'], [0x0c, 'Mime'], [0x0d, 'E.Skill'], [0x0e, 'All:'], [0x0f, '4x:'], [0x11, 'Mug'], [0x12, 'Change'],
  [0x13, 'Defend'], [0x14, 'Limit'], [0x15, 'W-Magic'], [0x16, 'W-Sum.'], [0x17, 'W-Item'], [0x18, 'Slash-All'],
  [0x19, '2x-Cut'], [0x1a, 'Flash'], [0x1b, '4x-Cut'], [0x20, 'enemy attack'], [0x21, 'show text'],
  [0x22, 'custom event']]);

export const STATS = { raw_jumps: 0 };

// ---- decoding -------------------------------------------------------------------------------------------------------
// Decode one instruction at pc: [op, length, operand]
export function insn_at(b, pc, limit) {
  if (pc >= limit) throw new AIError('runs past the end of the block at ' + h4(pc));
  const op = b[pc];
  if (!OPS.has(op)) throw new AIError('unknown opcode ' + h2(op) + ' at ' + h4(pc));
  const kind = OPS.get(op)[1];
  if (kind === 'A' || kind === 'J') {
    if (pc + 3 > limit) throw new AIError('operand runs past the end at ' + h4(pc));
    return [op, 3, u16(b, pc + 1)];
  }
  if (kind === 'I1' || kind === 'I2' || kind === 'I3') {
    const n = Number(kind[1]);
    if (pc + 1 + n > limit) throw new AIError('operand runs past the end at ' + h4(pc));
    let v = 0;
    for (let k = n - 1; k >= 0; k--) v = v * 256 + b[pc + 1 + k];
    return [op, 1 + n, v];
  }
  if (kind === 'S') {
    let p = pc + 1;
    for (;;) {
      if (p >= limit) throw new AIError('text at ' + h4(pc) + ' has no ff before the end');
      const c = b[p];
      p += 1;
      if (c === 0xff) break;
      if (c >= 0xea && c <= 0xf1) p += 2;
    }
    if (p > limit) throw new AIError('text at ' + h4(pc) + ' runs past the end');
    return [op, p - pc, Buffer.from(b.subarray(pc + 1, p - 1))];
  }
  if (kind === 'D') {
    if (pc + 2 > limit) throw new AIError('debug at ' + h4(pc) + ' runs past the end');
    let p = pc + 2;
    for (;;) {
      if (p >= limit) throw new AIError('debug text at ' + h4(pc) + ' has no 00 before the end');
      if (b[p] === 0) break;
      p += 1;
    }
    return [op, p + 1 - pc, [b[pc + 1], Buffer.from(b.subarray(pc + 2, p))]];
  }
  return [op, 1, null];
}

// Walk one script from start the way the interpreter can run it: instructions in order to an 'end' (73); past an
// 'end' only while a jump seen so far points further on. Returns [end_offset, [[offset, op, length, operand]]].
export function walk_script(b, start, limit) {
  let pc = start;
  let far = -1;
  const out = [];
  for (;;) {
    const [op, n, v] = insn_at(b, pc, limit);
    out.push([pc, op, n, v]);
    if (OPS.get(op)[1] === 'J') far = Math.max(far, start + v);
    pc += n;
    if (op === 0x73 && far < pc) return [pc, out];
  }
}

export function table_count(b, fixed) {
  if (fixed !== undefined && fixed !== null) {
    if (2 * fixed > b.length) throw new AIError('block shorter than its ' + fixed + '-entry table');
    return fixed;
  }
  let i = 0;
  let low = b.length;
  while (2 * i + 2 <= b.length && 2 * i < low) {
    const w = u16(b, 2 * i);
    if (w !== 0xffff) low = Math.min(low, w);
    i += 1;
  }
  if (low === b.length) throw new AIError('no entry in the table');
  if (low % 2 || 2 * i !== low) throw new AIError('lowest entry offset ' + h4(low) + ' is not the end of the table');
  return i;
}

// {count, entries: Map(idx -> off), scripts: Map(start -> {start, end, ins, refs})}
export function parse_block(b, fixed) {
  const n = table_count(b, fixed);
  const entries = new Map();
  const scripts = new Map();
  for (let e = 0; e < n; e++) {
    const o = u16(b, 2 * e);
    if (o === 0xffff) continue;
    if (o + 32 > b.length) throw new AIError('entry ' + e + ' at ' + h4(o) + ': its 16 section offsets run past the end');
    entries.set(e, o);
    for (let s = 0; s < 16; s++) {
      const so = u16(b, o + 2 * s);
      if (so === 0xffff) continue;
      const a = o + so;
      if (a >= b.length) throw new AIError('entry ' + e + ' ' + SECTIONS[s] + ': offset ' + h4(so) + ' is outside the block');
      if (!scripts.has(a)) {
        let end;
        let ins;
        try {
          [end, ins] = walk_script(b, a, b.length);
        } catch (ex) {
          if (ex instanceof AIError) throw new AIError('entry ' + e + ' ' + SECTIONS[s] + ': ' + ex.message);
          throw ex;
        }
        scripts.set(a, { start: a, end, ins, refs: [] });
      }
      scripts.get(a).refs.push([e, s]);
    }
  }
  return { count: n, entries, scripts };
}

// ---- text helpers -----------------------------------------------------------------------------------------------------
// Game text bytes -> the quoted form: printable as characters (byte+0x20), the rest as {xx} groups.
export function ff7_text(raw) {
  const s = [];
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c >= 0xea && c <= 0xf1) {
      if (i + 3 > raw.length) throw new PyTypeError('not enough arguments for format string');
      s.push('{' + h2(raw[i]) + ' ' + h2(raw[i + 1]) + ' ' + h2(raw[i + 2]) + '}');
      i += 3;
      continue;
    }
    const ch = c < 0x5f ? String.fromCharCode(c + 0x20) : null;
    if (ch === null || '{}"\\'.indexOf(ch) >= 0) s.push('{' + h2(c) + '}');
    else s.push(ch);
    i += 1;
  }
  return '"' + s.join('') + '"';
}

export function ascii_text(raw) {
  const s = [];
  for (const c of raw) {
    const ch = String.fromCharCode(c);
    if (c >= 0x20 && c < 0x7f && '{}"\\'.indexOf(ch) < 0) s.push(ch);
    else s.push('{' + h2(c) + '}');
  }
  return '"' + s.join('') + '"';
}

export function parse_quoted(tok, game, where) {
  if (tok.length < 2 || tok[0] !== '"' || tok[tok.length - 1] !== '"') throw new AIError(where + ': expected a quoted string');
  const body = tok.slice(1, -1);
  const out = [];
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '{') {
      const j = body.indexOf('}', i);
      if (j < 0) throw new AIError(where + ': { without }');
      for (const hx of pySplit(body.slice(i + 1, j))) {
        const v = pyInt(hx, 16);
        if (typeof v === 'bigint' || v < 0 || v > 255) throw new PyValueError('byte must be in range(0, 256)');
        out.push(v);
      }
      i = j + 1;
      continue;
    }
    const o = ch.charCodeAt(0);
    if (game) {
      if (!(o >= 0x20 && o < 0x7f)) throw new AIError(where + ': character ' + pyRepr(ch) + ' has no game text byte; write it as {xx}');
      out.push(o - 0x20);
    } else {
      if (o > 255) throw new PyValueError('byte must be in range(0, 256)');
      out.push(o);
    }
    i += 1;
  }
  return out;
}

export function addr_text(a) {
  return ADDR_NAMES.has(a) ? ADDR_NAMES.get(a) : h4(a);
}

function sec_name(e, s, cur) {
  return e === cur ? SECTIONS[s] : e + ':' + SECTIONS[s];
}

// ---- disassembler -----------------------------------------------------------------------------------------------------
export function disasm(b, source, fixed, names) {
  source = source || '';
  const blk = parse_block(b, fixed);
  let lines = ['; FF7 battle AI block, ' + b.length + ' bytes' + (source ? ', from ' + source : ''),
               '; written by ai_tool.py disasm; numbers are hex; "python3 -I ai_tool.py asm" turns it back into bytes',
               '', 'table ' + blk.count];
  // entries that share one header
  const by_off = new Map();
  for (const [e, o] of [...blk.entries].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (!by_off.has(o)) by_off.set(o, []);
    by_off.get(o).push(e);
  }
  const items = [[0, 2 * blk.count, 'table', null]];
  for (const [o, es] of by_off) items.push([o, o + 32, 'entry', es]);
  for (const [a, sc] of blk.scripts) items.push([a, sc.end, 'script', sc]);
  const rank = { table: 0, entry: 1, script: 2 };
  items.sort((x, y) => x[0] - y[0] || rank[x[2]] - rank[y[2]]);
  // overlapping regions cannot be written as text: refuse (never met in the known files)
  let pe = 0;
  for (const [a, e, k] of items) {
    if (a < pe) throw new AIError('regions overlap at ' + h4(a) + ' (' + k + '): not expressible as text');
    pe = e;
  }
  let pos = 0;
  let cur = null;
  for (const [a, e, k, x] of items) {
    if (a > pos) lines = lines.concat(raw_lines(b.subarray(pos, a), pos));
    if (k === 'entry') {
      cur = x[0];
      let nm = '';
      if (names && names.length) nm = '  ; ' + x.map(i => (i < names.length ? names[i] : '?')).join(', ');
      lines.push('', 'entry ' + x.join(', ') + nm);
    } else if (k === 'script') {
      lines.push('');
      lines.push('script ' + x.refs.map(r => sec_name(r[0], r[1], cur)).join(' ') + '    ; @' + h4(a) + ', ' + (e - a) + ' bytes');
      lines = lines.concat(script_lines(b, x));
    }
    pos = e;
  }
  if (pos < b.length) lines = lines.concat(raw_lines(b.subarray(pos), pos));
  return lines.join('\n') + '\n';
}

export function raw_lines(raw, pos) {
  const out = ['', '; ' + raw.length + ' bytes no script reaches, @' + h4(pos)];
  let i = 0;
  while (i < raw.length) {
    let j = i;
    while (j < raw.length && raw[j] === raw[i]) j++;
    if (j - i >= 8) {
      out.push('fill ' + hex(j - i) + ' ' + h2(raw[i]));
      i = j;
      continue;
    }
    let k = i;
    while (k < raw.length && k - i < 16) {
      let m = k;
      while (m < raw.length && raw[m] === raw[k]) m++;
      if (m - k >= 8) break;
      k++;
    }
    out.push('bytes ' + Array.from(raw.subarray(i, k), c => h2(c)).join(' '));
    i = k;
  }
  return out;
}

export function script_lines(b, sc) {
  const start = sc.start;
  const offs = new Set(sc.ins.map(t => t[0] - start));
  const targets = new Set();
  for (const [, op, , v] of sc.ins) {
    if (OPS.get(op)[1] === 'J' && offs.has(v)) targets.add(v);
  }
  const out = [];
  const hist = [];
  for (const [o, op, , v] of sc.ins) {
    const rel = o - start;
    const [name, kind] = OPS.get(op);
    const lab = targets.has(rel) ? 'L' + h4(rel) + ':' : '';
    let arg;
    if (kind === 'A') arg = addr_text(v);
    else if (kind === 'J') {
      if (offs.has(v)) arg = 'L' + h4(v);
      else {                         // 0x form: a target that is no instruction start of this script
        arg = '0x' + h4(v);
        STATS.raw_jumps += 1;
      }
    } else if (kind === 'I1' || kind === 'I2' || kind === 'I3') arg = hex(v, 2 * Number(kind[1]));
    else if (kind === 'S') arg = ff7_text(v);
    else if (kind === 'D') arg = hex(v[0]) + ' ' + ascii_text(v[1]);
    else arg = '';
    let txt = ljust(lab, 8) + ljust(name, 10) + ' ' + arg;
    const com = comment_for(op, v, hist);
    if (com) txt = ljust(pyRstrip(txt), 44) + ' ; ' + com;
    out.push(pyRstrip(txt));
    hist.push([op, v]);
  }
  return out;
}

function is_imm(op) {
  const k = OPS.get(op)[1];
  return k === 'I1' || k === 'I2' || k === 'I3';
}

export function comment_for(op, v, hist) {
  if (op === 0x92 && hist.length >= 2) {
    const [o1, v1] = hist[hist.length - 2];
    const [o2, v2] = hist[hist.length - 1];
    if (is_imm(o1) && is_imm(o2)) {
      return 'command ' + h2(v1) + ' (' + (COMMANDS.has(v1) ? COMMANDS.get(v1) : '?') + '), attack ' + h4(v2);
    }
  }
  if (op === 0x75 && hist.length && is_imm(hist[hist.length - 1][0])) return 'run entry ' + hist[hist.length - 1][1] + ' from now on';
  return '';
}

// ---- assembler --------------------------------------------------------------------------------------------------------
// Split a line into tokens, keeping quoted strings whole; strip a ; comment outside quotes.
export function tokenize(line) {
  const toks = [];
  let i = 0;
  let cur = '';
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== '"') j++;
      if (j >= line.length) throw new AIError('unterminated string');
      cur += line.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === ';') break;
    if (ch === ' ' || ch === '\t' || ch === ',') {
      if (cur) {
        toks.push(cur);
        cur = '';
      }
    } else {
      cur += ch;
    }
    i += 1;
  }
  if (cur) toks.push(cur);
  return toks;
}

export function parse_num(tok, where) {
  let t = pyLower(tok);
  if (t.startsWith('0x')) t = t.slice(2);
  if (!/^[0-9a-f]+$/.test(t)) throw new AIError(where + ': ' + pyRepr(tok) + ' is not a hex number');
  return pyInt(t, 16);
}

// a token's [entry, section]
export function parse_sec(tok, cur, where) {
  let e;
  let s;
  if (tok.indexOf(':') >= 0) {
    const k = tok.indexOf(':');
    e = pyInt(tok.slice(0, k), 0);
    s = tok.slice(k + 1);
  } else {
    e = cur;
    s = tok;
  }
  if (e === null || e === undefined) throw new AIError(where + ': script before any entry needs ENTRY:SECTION');
  const sl = pyLower(s);
  if (SECTIONS.indexOf(sl) >= 0) return [e, SECTIONS.indexOf(sl)];
  if (SEC_ALIASES.has(sl)) return [e, SEC_ALIASES.get(sl)];
  if (/^(s|section)?[0-9]+$/.test(sl)) {
    const n = pyInt(sl.replace(/[^0-9]/g, ''), 10);
    if (n < 16) return [e, Number(n)];
  }
  throw new AIError(where + ': unknown section ' + pyRepr(s));
}

const key_es = (e, s) => String(e) + ':' + s;
const NEED = { null: 0, A: 1, J: 1, I1: 1, I2: 1, I3: 1, S: 1, D: 2 };

function hold(out, n) {
  if (out.length + n > HOLD_MAX) throw new PyMemoryError('');
}

// a repeat count as Python's bytes * n takes it (each byte `width` long): too large for an index, too long, or more
// than the port holds
function repeat_count(v, width) {
  if (typeof v === 'bigint') {
    if (v > 9223372036854775807n || v < -9223372036854775808n) throw new PyOverflowError("cannot fit 'int' into an index-sized integer");
    if (v * BigInt(width) > 9223372036854775807n) throw new PyOverflowError('repeated bytes are too long');
    throw new PyMemoryError('');
  }
  return v;
}

export function assemble(text) {
  const out = new Held();
  let count = null;
  const entries = new Map();          // index -> header position
  const sections = new Map();         // 'e:s' -> [e, s, script position]
  let script = null;                  // {start, labels: Map, fixups: []}
  const scripts = [];
  let cur = null;

  const close = () => {
    if (script !== null) {
      scripts.push(script);
      script = null;
    }
  };

  const lines = pySplitlines(text);
  for (let ln = 1; ln <= lines.length; ln++) {
    const line = lines[ln - 1];
    const where = 'line ' + ln;
    let toks;
    try {
      toks = tokenize(line);
    } catch (ex) {
      if (ex instanceof AIError) throw new AIError(where + ': ' + ex.message);
      throw ex;
    }
    if (!toks.length) continue;
    // labels (one or more, then maybe an instruction)
    while (toks.length && toks[0].endsWith(':') && !toks[0].startsWith('"') && toks[0].slice(0, -1).indexOf(':') < 0) {
      const lab = toks.shift().slice(0, -1);
      if (script === null) throw new AIError(where + ': label ' + lab + ' outside a script');
      if (script.labels.has(lab)) throw new AIError(where + ': label ' + lab + ' defined twice in one script');
      script.labels.set(lab, out.length - script.start);
    }
    if (!toks.length) continue;
    const kw = pyLower(toks[0]);
    if (kw === 'table') {
      if (count !== null || out.length) throw new AIError(where + ': table must come first and once');
      if (toks.length < 2) throw new PyIndexError('list index out of range');
      count = pyLower(toks[1]).startsWith('0x') ? parse_num(toks[1], where) : pyInt(toks[1], 10);
      const n = repeat_count(count, 2);
      if (n > 0) {
        hold(out, 2 * n);
        out.fill(0xff, 2 * n);
      }
      continue;
    }
    if (count === null) throw new AIError(where + ': the text must start with "table N"');
    if (kw === 'entry') {
      close();
      const idx = toks.slice(1).map(t => pyInt(t, 10));
      if (!idx.length) throw new AIError(where + ': entry without a number');
      for (const i of idx) {
        if (i >= count) throw new AIError(where + ': entry ' + i + ' but the table has ' + count);
        if (entries.has(String(i))) throw new AIError(where + ': entry ' + i + ' twice');
        entries.set(String(i), [i, out.length]);
      }
      cur = idx[0];
      hold(out, 32);
      out.fill(0xff, 32);
      continue;
    }
    if (kw === 'script') {
      close();
      script = { start: out.length, labels: new Map(), fixups: [], line: ln };
      if (toks.length < 2) throw new AIError(where + ': script without a section name');
      for (const t of toks.slice(1)) {
        const es = parse_sec(t, cur, where);
        const k = key_es(es[0], es[1]);
        if (sections.has(k)) throw new AIError(where + ': section ' + t + ' given two scripts');
        sections.set(k, [es[0], es[1], out.length]);
      }
      continue;
    }
    if (kw === 'bytes') {
      close();
      const vals = [];
      for (const t of toks.slice(1)) {
        const v = parse_num(t, where);
        if (typeof v === 'bigint' || v > 255) throw new PyValueError('bytes must be in range(0, 256)');
        vals.push(v);
      }
      hold(out, vals.length);
      for (const v of vals) out.push(v);
      continue;
    }
    if (kw === 'fill') {
      close();
      if (toks.length < 3) throw new PyIndexError('list index out of range');
      const v = parse_num(toks[2], where);
      if (typeof v === 'bigint' || v > 255) throw new PyValueError('bytes must be in range(0, 256)');
      const n = repeat_count(parse_num(toks[1], where), 1);
      if (n > 0) {
        hold(out, n);
        out.fill(v, n);
      }
      continue;
    }
    // an instruction
    if (script === null) throw new AIError(where + ': instruction ' + pyRepr(toks[0]) + ' outside a script');
    const name = ALIASES.has(kw) ? ALIASES.get(kw) : kw;
    if (!MNEM.has(name)) throw new AIError(where + ': unknown instruction ' + pyRepr(toks[0]));
    const op = MNEM.get(name);
    const kind = OPS.get(op)[1];
    const args = toks.slice(1);
    const need = NEED[kind];
    if (args.length !== need) throw new AIError(where + ': ' + name + ' takes ' + need + ' operand(s)');
    out.push(op);
    if (kind === 'A') {
      let a = NAME_ADDR.has(args[0]) ? NAME_ADDR.get(args[0]) : null;
      if (a === null) {
        if (NAME_ADDR_LOWER.has(pyLower(args[0]))) throw new AIError(where + ': address names are lower case: ' + pyRepr(args[0]));
        a = parse_num(args[0], where);
      }
      if (typeof a === 'bigint' || a > 0xffff) throw new AIError(where + ': address ' + hex(a) + ' too large');
      out.push(a & 0xff, a >> 8);
    } else if (kind === 'J') {
      const t = args[0];
      if (pyLower(t).startsWith('0x')) {
        const v = parse_num(t, where);
        if (typeof v === 'bigint' || v > 0xffff) throw new StructError("'H' format requires 0 <= number <= 65535");
        out.push(v & 0xff, v >> 8);
      } else {
        script.fixups.push([out.length, t, ln]);
        out.push(0, 0);
      }
    } else if (kind === 'I1' || kind === 'I2' || kind === 'I3') {
      const n = Number(kind[1]);
      const v = parse_num(args[0], where);
      if (typeof v === 'bigint' || v >= 2 ** (8 * n)) throw new AIError(where + ': ' + hex(v) + ' does not fit in ' + n + ' byte(s)');
      for (let k = 0; k < n; k++) out.push(Math.floor(v / 2 ** (8 * k)) & 0xff);
    } else if (kind === 'S') {
      const s = parse_quoted(args[0], true, where);
      for (const c of s) out.push(c);
      out.push(0xff);
    } else if (kind === 'D') {
      const cnt = parse_num(args[0], where);
      const s = parse_quoted(args[1], false, where);
      if (s.indexOf(0) >= 0) throw new AIError(where + ': debug text may not hold 00');
      if (typeof cnt === 'bigint' || cnt > 255) throw new PyValueError('bytes must be in range(0, 256)');
      out.push(cnt);
      for (const c of s) out.push(c);
      out.push(0);
    }
  }
  close();
  if (count === null) throw new AIError('empty text');
  for (const sc of scripts) {
    for (const [pos, lab, ln] of sc.fixups) {
      if (!sc.labels.has(lab)) throw new AIError('line ' + ln + ': label ' + lab + ' is not in this script');
      pack_u16_into(out, pos, sc.labels.get(lab));
    }
  }
  for (const [i, p] of entries.values()) {
    pack_u16_into(out, typeof i === 'bigint' ? 2n * i : 2 * i, p);
  }
  for (const [e, s, p] of sections.values()) {
    if (!entries.has(String(e))) throw new AIError('section ' + e + ':' + SECTIONS[s] + ': no entry ' + e + ' in the text');
    const ep = entries.get(String(e))[1];
    const rel = p - ep;
    if (rel < 0 || rel > 0xfffe) throw new AIError('section ' + e + ':' + SECTIONS[s] + ': script must come after its entry, within 64 KB');
    pack_u16_into(out, ep + 2 * s, rel);
  }
  if (out.length > 0xffff) throw new AIError('block is ' + out.length + ' bytes: offsets are 16-bit, at most 65535');
  return Buffer.from(out.bytes);
}

// ---- the DLL's validation rules (Character_AI_Design.md 3.4) -----------------------------------------------------------
// a list of problems (empty = valid)
export function check(b, fixed) {
  const probs = [];
  if (b.length < 2) return ['block shorter than 2 bytes'];
  if (b.length > 0xffff) probs.push('block is larger than 65535 bytes');
  let n;
  try {
    n = table_count(b, fixed);
  } catch (ex) {
    if (ex instanceof AIError) return [ex.message];
    throw ex;
  }
  for (let e = 0; e < n; e++) {
    const o = u16(b, 2 * e);
    if (o === 0xffff) continue;
    if (o % 2) probs.push('entry ' + e + ': offset ' + h4(o) + ' is odd');
    if (o < 2 * n || o + 32 > b.length) {
      probs.push('entry ' + e + ': offset ' + h4(o) + ' leaves no room for its 16 section offsets');
      continue;
    }
    for (let s = 0; s < 16; s++) {
      const so = u16(b, o + 2 * s);
      if (so === 0xffff) continue;
      const a = o + so;
      const w = 'entry ' + e + ' ' + SECTIONS[s] + ' (@' + h4(a) + ')';
      if (a >= b.length) {
        probs.push(w + ': outside the block');
        continue;
      }
      let ins;
      try {
        ins = walk_script(b, a, b.length)[1];
      } catch (ex) {
        if (ex instanceof AIError) {
          probs.push(w + ': ' + ex.message);
          continue;
        }
        throw ex;
      }
      const starts = new Set(ins.map(t => t[0] - a));
      for (const [pc, op, , v] of ins) {
        if (OPS.get(op)[1] === 'J' && !starts.has(v)) {
          probs.push(w + ': jump at ' + h4(pc - a) + ' to ' + h4(v) + ' is not an instruction of this script');
        }
      }
    }
  }
  return probs;
}

// ---- gzip, as Python reads it ---------------------------------------------------------------------------------------
// A raw deflate stream from the start of `buf`: {out, eof, used} as zlib.decompressobj(-15).decompress gives it (the
// output so far when the stream is cut short, never an error then; the bytes after the stream's end are not used).
export function raw_inflate(buf) {
  try {
    const r = zlib.inflateRawSync(buf, { info: true });
    return { out: r.buffer, eof: true, used: r.engine.bytesWritten };
  } catch (e) {
    if (e.code === 'Z_BUF_ERROR') {
      if (!buf.length) return { out: Buffer.alloc(0), eof: false, used: 0 };
      const r = zlib.inflateRawSync(buf, { info: true, finishFlush: zlib.constants.Z_SYNC_FLUSH });
      return { out: r.buffer, eof: false, used: buf.length };
    }
    if (e.code && typeof e.errno === 'number') throw new ZlibError('Error ' + e.errno + ' while decompressing data: ' + e.message);
    throw e;
  }
}

const FTEXT = 1;
const FHCRC = 2;
const FEXTRA = 4;
const FNAME = 8;
const FCOMMENT = 16;
void FTEXT;

// repr(bytes)
export function bytes_repr(b) {
  let has1 = false;
  let has2 = false;
  for (const c of b) {
    if (c === 0x27) has1 = true;
    if (c === 0x22) has2 = true;
  }
  const q = has1 && !has2 ? '"' : "'";
  let s = 'b' + q;
  for (const c of b) {
    if (c === 0x5c) s += '\\\\';
    else if (c === q.charCodeAt(0)) s += '\\' + q;
    else if (c === 9) s += '\\t';
    else if (c === 10) s += '\\n';
    else if (c === 13) s += '\\r';
    else if (c >= 0x20 && c < 0x7f) s += String.fromCharCode(c);
    else s += '\\x' + h2(c);
  }
  return s + q;
}

const GZ_EOF = 'Compressed file ended before the end-of-stream marker was reached';

// gzip.decompress (Python 3.14): every member, the zero bytes between them skipped
export function gzip_decompress(data) {
  const members = [];
  for (;;) {
    let p = 0;
    const need = (n) => {
      if (p + n > data.length) throw new PyEOFError(GZ_EOF);
      p += n;
    };
    const magic = data.subarray(0, 2);
    if (!magic.length) return Buffer.concat(members);
    if (magic.length < 2 || magic[0] !== 0x1f || magic[1] !== 0x8b) throw new BadGzipFile('Not a gzipped file (' + bytes_repr(magic) + ')');
    p = 2;
    need(8);
    const method = data[2];
    const flag = data[3];
    if (method !== 8) throw new BadGzipFile('Unknown compression method');
    if (flag & FEXTRA) {
      need(2);
      const n = data[p - 2] | (data[p - 1] << 8);
      need(n);
    }
    if (flag & FNAME) {
      while (p < data.length) { const c = data[p++]; if (c === 0) break; }
    }
    if (flag & FCOMMENT) {
      while (p < data.length) { const c = data[p++]; if (c === 0) break; }
    }
    if (flag & FHCRC) need(2);
    const rest = data.subarray(p);
    const r = raw_inflate(rest);
    const unused = r.eof ? rest.subarray(r.used) : Buffer.alloc(0);
    if (!r.eof || unused.length < 8) throw new PyEOFError(GZ_EOF);
    const crc = unused.readUInt32LE(0);
    const length = unused.readUInt32LE(4);
    if (crc !== zlib.crc32(r.out) >>> 0) throw new BadGzipFile('CRC check failed');
    if (length !== r.out.length % 4294967296) throw new BadGzipFile('Incorrect length of data produced');
    members.push(r.out);
    let k = 8;
    while (k < unused.length && unused[k] === 0) k++;
    data = unused.subarray(k);
  }
}

// zlib.decompressobj(16 + zlib.MAX_WBITS).decompress(d): one gzip member through zlib's own gzip wrapper (what
// scene_list uses): the output so far when the data ends early, the bytes after the member ignored, an error
// (ZlibError) for a bad header, a bad stream or a trailer that disagrees.
export function gzip_member(d) {
  const err = (m, n) => new ZlibError('Error ' + (n || -3) + ' while decompressing data: ' + m);
  if (d.length < 2) return Buffer.alloc(0);
  if (d[0] !== 0x1f || d[1] !== 0x8b) throw err('incorrect header check');
  if (d.length < 3) return Buffer.alloc(0);
  if (d[2] !== 8) throw err('unknown compression method');
  if (d.length < 4) return Buffer.alloc(0);
  const flag = d[3];
  if (flag & 0xe0) throw err('unknown header flags set');
  let p = 10;
  if (d.length < p) return Buffer.alloc(0);
  if (flag & FEXTRA) {
    if (d.length < p + 2) return Buffer.alloc(0);
    p += 2 + (d[p] | (d[p + 1] << 8));
    if (d.length < p) return Buffer.alloc(0);
  }
  if (flag & FNAME) {
    while (p < d.length && d[p] !== 0) p++;
    if (p >= d.length) return Buffer.alloc(0);
    p++;
  }
  if (flag & FCOMMENT) {
    while (p < d.length && d[p] !== 0) p++;
    if (p >= d.length) return Buffer.alloc(0);
    p++;
  }
  if (flag & FHCRC) {
    if (d.length < p + 2) return Buffer.alloc(0);
    const want = d[p] | (d[p + 1] << 8);
    if (want !== (zlib.crc32(d.subarray(0, p)) & 0xffff)) throw err('header crc mismatch');
    p += 2;
  }
  const rest = d.subarray(p);
  const r = raw_inflate(rest);
  if (r.eof) {
    const t = rest.subarray(r.used);
    if (t.length >= 4 && t.readUInt32LE(0) !== zlib.crc32(r.out) >>> 0) throw err('incorrect data check');
    if (t.length >= 8 && t.readUInt32LE(4) !== r.out.length % 4294967296) throw err('incorrect length check');
  }
  return r.out;
}

// ---- containers ---------------------------------------------------------------------------------------------------------
export function kernel_sections(d) {
  let i = 0;
  const out = [];
  while (i + 6 <= d.length) {
    const clen = d.readUInt16LE(i);
    i += 6;
    if (clen === 0) break;
    out.push(gzip_decompress(d.subarray(i, i + clen)));
    i += clen;
  }
  return out;
}

export function is_kernel(d) {
  return d.length > 8 && d[6] === 0x1f && d[7] === 0x8b;
}

// The character-AI area: KERNEL.BIN section 3 from 0x61c to the end of the section
export function kernel_ai(d) {
  const secs = kernel_sections(d);
  if (secs.length < 3) throw new PyIndexError('list index out of range');
  return secs[2].subarray(0x61c);
}

// The AI block proper: [the table, the entries and their scripts up to the last byte any script uses, the rest]
export function kernel_ai_block(d) {
  const area = kernel_ai(d);
  const blk = parse_block(area);
  let used = 2 * blk.count;
  for (const o of blk.entries.values()) used = Math.max(used, o + 32);
  for (const s of blk.scripts.values()) used = Math.max(used, s.end);
  return [area.subarray(0, used), area.subarray(used)];
}

// Every scene of a scene.bin: decompressed scenes (null where one cannot be decoded), in game order
export function scene_list(d) {
  const out = [];
  for (let base = 0; base <= d.length - 0x40; base += 0x2000) {
    const ptrs = [];
    for (let j = 0; j < 16; j++) ptrs.push(d.readUInt32LE(base + 4 * j));
    ptrs.forEach((p, j) => {
      if (p === 0xffffffff) return;
      const s = base + p * 4;
      const nxt = j + 1 < 16 ? ptrs[j + 1] : 0xffffffff;
      const e = base + (nxt !== 0xffffffff ? nxt * 4 : 0x2000);
      try {
        out.push(gzip_member(d.subarray(s, e)));
      } catch (ex) {
        out.push(null);
      }
    });
  }
  return out;
}

export function is_scene(d) {
  if (d.length < 0x2000 || d.length % 0x2000) return false;
  const p = d.readUInt32LE(0);
  return p !== 0xffffffff && p * 4 + 2 <= 0x2000 && d[p * 4] === 0x1f && d[p * 4 + 1] === 0x8b;
}

export const SCENE_AI = [0xe80, 0x1e80];

export function char_index(c) {
  c = pyLower(c).split(' ').join('').split('_').join('');
  if (pyIsdigit(c)) return pyInt(c, 10);
  if (KERNEL_CHARS.indexOf(c) >= 0) return KERNEL_CHARS.indexOf(c);
  if (c === 'aerith') return 3;
  if (c === 'redxiii' || c === 'red13' || c === 'nanaki') return 4;
  throw new AIError('unknown character ' + pyRepr(c) + ' (one of ' + KERNEL_CHARS.join(' ') + ', or 0-11)');
}

// A new block with entry e of block b as its only entry (entry 0); scripts copied as they are. [bytes, links]
export function single_entry(b, e, fixed) {
  const blk = parse_block(b, fixed);
  if (!blk.entries.has(e)) throw new AIError('entry ' + e + ' has no AI in this block');
  const o = blk.entries.get(e);
  const hdr = [];
  for (let s = 0; s < 16; s++) hdr.push(u16(b, o + 2 * s));
  const order = [];
  for (let s = 0; s < 16; s++) {
    if (hdr[s] !== 0xffff && order.indexOf(o + hdr[s]) < 0) order.push(o + hdr[s]);
  }
  order.sort((x, y) => x - y);
  const out = [2, 0];
  for (let k = 0; k < 32; k++) out.push(0xff);
  const place = new Map();
  for (const a of order) {
    const sc = blk.scripts.get(a);
    place.set(a, out.length - 2);
    for (const c of b.subarray(a, sc.end)) out.push(c);
  }
  for (let s = 0; s < 16; s++) {
    if (hdr[s] !== 0xffff) pack_u16_into(out, 2 + 2 * s, place.get(o + hdr[s]));
  }
  const links = order.filter(a => blk.scripts.get(a).ins.some(t => t[1] === 0x75));
  return [Buffer.from(out), links];
}

// ======================================================================================================================
// The AI page (sxcfg/aipage.py): SpellExtConfig/ai/NAME.ai (the block the DLL's `ai = NAME` key reads) edited as
// text. ai/NAME.txt beside it is the editable source: the DLL reads only the .ai.
export const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function ai_dir(config_dir) {
  return pyJoin(config_dir, 'ai');
}

function splitext(f) {
  // os.path.splitext: the last dot not at the start of the name (leading dots are part of the stem)
  let i = f.lastIndexOf('.');
  let k = 0;
  while (k < f.length && f[k] === '.') k++;
  if (i < k) i = -1;
  return i < 0 ? [f, ''] : [f.slice(0, i), f.slice(i)];
}

export function list_ai(config_dir) {
  const d = ai_dir(config_dir);
  const names = new Map();
  if (pyIsdir(d)) {
    const dir = fs.opendirSync(d);
    try {
      let ent;
      while ((ent = dir.readSync()) !== null) {
        const [stem, ext] = splitext(ent.name);
        const e = pyLower(ext);
        if (e === '.ai' || e === '.txt') {
          if (!names.has(stem)) names.set(stem, { name: stem, ai: false, txt: false });
          names.get(stem)[e.slice(1)] = true;
        }
      }
    } finally {
      dir.closeSync();
    }
  }
  const keys = [...names.keys()].sort((a, b) => pyCmp(pyLower(a), pyLower(b)));
  const out = [];
  for (const n of keys) {
    const e = names.get(n);
    e.in_sync = null;
    if (e.ai && e.txt) {
      try {
        const r = assemble_check(read_text(config_dir, n));
        e.in_sync = r.bytes !== null && Buffer.compare(r.bytes, read_block(config_dir, n)) === 0;
      } catch (ex) {
        e.in_sync = false;
      }
    }
    out.push(e);
  }
  return out;
}

export function _path(config_dir, name, ext) {
  if (!NAME_RE.test(name)) throw new PyValueError('an AI name is 1 to 32 letters, digits, _ or -');
  return pyJoin(ai_dir(config_dir), name + ext);
}

export function read_block(config_dir, name) {
  return fs.readFileSync(_path(config_dir, name, '.ai'));
}

export function read_text(config_dir, name) {
  return fs.readFileSync(_path(config_dir, name, '.txt')).toString('latin1');
}

export class FileNotFound extends Error {
  constructor(message) { super(message); this.name = 'FileNotFoundError'; }
}

// The text to edit: NAME.txt when it exists, else disasm(NAME.ai). Says which, and the block's own check.
export function open_ai(config_dir, name) {
  const txt = _path(config_dir, name, '.txt');
  const ai = _path(config_dir, name, '.ai');
  const out = { name, has_txt: pyIsfile(txt), has_ai: pyIsfile(ai) };
  if (out.has_ai) {
    const b = read_block(config_dir, name);
    out.block_problems = check(b);
    out.block_size = b.length;
  }
  if (out.has_txt) {
    out.text = read_text(config_dir, name);
    out.source = 'txt';
    if (out.has_ai) {
      try {
        const r = assemble_check(out.text);
        out.in_sync = r.bytes !== null && Buffer.compare(r.bytes, read_block(config_dir, name)) === 0;
      } catch (ex) {
        out.in_sync = false;
      }
    }
  } else if (out.has_ai) {
    out.text = disasm(read_block(config_dir, name), name + '.ai');
    out.source = 'disasm';
  } else {
    throw new FileNotFound('no ai/' + name + '.ai or ai/' + name + '.txt');
  }
  return out;
}

// asm into memory, then the DLL's rules: {ok, bytes, size?, problems: [{line, text}]}
export function assemble_check(text) {
  let b;
  try {
    b = assemble(text);
  } catch (ex) {
    if (!(ex instanceof AIError)) throw ex;
    const msg = ex.message;
    const m = /^line ([0-9]+): /.exec(msg);
    return { ok: false, bytes: null, problems: [{ line: m ? Number(m[1]) : 0, text: msg }] };
  }
  const probs = check(b);
  return { ok: !probs.length, bytes: b, size: b.length, problems: probs.map(p => ({ line: 0, text: p })) };
}

// Assembles and checks; refuses on a problem (unless force); backs up both files; writes NAME.txt, NAME.ai.
export function save_ai(config_dir, name, text, force) {
  const r = assemble_check(text);
  if (r.bytes === null || (!r.ok && !force)) {
    throw new safety.WriteRefused('not saved: ' + r.problems.map(p => p.text).join('; '));
  }
  const d = ai_dir(config_dir);
  fs.mkdirSync(d, { recursive: true });
  const txt = _path(config_dir, name, '.txt');
  const ai = _path(config_dir, name, '.ai');
  const backup = safety.make_backup(config_dir, [txt, ai], 'ai/' + name);
  for (const [p, data] of [[txt, Buffer.from(text, 'latin1')], [ai, r.bytes]]) {
    safety.check_writable_path(config_dir, p);
    const tmp = p + '.tmp';
    try { fs.unlinkSync(tmp); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const fd = fs.openSync(tmp, 'wx');
    try {
      fs.writeSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, p);
  }
  return { backup, size: r.bytes.length, problems: r.problems };
}

export function kernel_candidates(game_dir) {
  const out = [];
  if (game_dir) {
    for (const p of [pyJoin(game_dir, 'data', 'lang-en', 'kernel', 'KERNEL.BIN'), pyJoin(game_dir, 'data', 'kernel', 'KERNEL.BIN')]) {
      if (pyIsfile(p)) out.push(p);
    }
  }
  return out;
}

// One kernel character's AI as entry 0 of a new block, as text (not saved); the text's first line names the kernel
// The entries entry `x` of a parsed block switches to: the number a `push` just before `link` gives, null for a
// link whose number is not such a constant (sxcfg/aipage.py entry_links).
export function entry_links(b, blk, x) {
  const out = [];
  const o = blk.entries.get(x);
  for (let s = 0; s < 16; s++) {
    const w = b[o + 2 * s] | b[o + 2 * s + 1] << 8;
    if (w === 0xffff) continue;
    const ins = blk.scripts.get(o + w).ins;
    ins.forEach((t, i) => {
      if (t[1] !== 0x75) return;
      const prev = i ? ins[i - 1] : null;
      out.push(prev !== null && (prev[1] === 0x60 || prev[1] === 0x61 || prev[1] === 0x62) ? prev[3] : null);
    });
  }
  return out;
}

// A new block of entry `e` as entry 0, with every entry its scripts (and theirs) switch to by a constant at that same
// number, so that the file stands alone (design 4.10). Returns [bytes, the links that could not come along].
export function export_block(b, e) {
  const blk = parse_block(b);
  if (!blk.entries.has(e)) throw new AIError('entry ' + e + ' has no AI in this block');
  const place = new Map([[0, e]]);
  const loose = [];
  const todo = [e];
  const done = new Set();
  while (todo.length) {
    const x = todo.shift();
    if (done.has(x)) continue;
    done.add(x);
    for (const n of entry_links(b, blk, x)) {
      if (n === null || !blk.entries.has(n) || (n === 0 && e !== 0)) {
        if (loose.indexOf(n) < 0) loose.push(n);
        continue;
      }
      if (n === e && e !== 0) continue;
      if (!place.has(n)) {
        place.set(n, n);
        todo.push(n);
      }
    }
  }
  const count = Math.max(...place.keys()) + 1;
  const out = [];
  for (let k = 0; k < 2 * count; k++) out.push(0xff);
  for (const nw of [...place.keys()].sort((x, y) => x - y)) {
    const old = place.get(nw);
    const o = blk.entries.get(old);
    const hdr = [];
    for (let s = 0; s < 16; s++) hdr.push(u16(b, o + 2 * s));
    const start = out.length;
    pack_u16_into(out, 2 * nw, start);
    for (let k = 0; k < 32; k++) out.push(0xff);
    const order = [];
    for (let s = 0; s < 16; s++) if (hdr[s] !== 0xffff && order.indexOf(o + hdr[s]) < 0) order.push(o + hdr[s]);
    order.sort((x, y) => x - y);
    const at = new Map();
    for (const a of order) {
      at.set(a, out.length - start);
      for (const c of b.subarray(a, blk.scripts.get(a).end)) out.push(c);
    }
    for (let s = 0; s < 16; s++) if (hdr[s] !== 0xffff) pack_u16_into(out, start + 2 * s, at.get(o + hdr[s]));
  }
  return [Buffer.from(out), loose];
}

// `bring_links` (the Library's export, design 4.10): the entries its scripts link to come along at their numbers.
export function from_kernel_bytes(d, character, label, sha1, bring_links) {
  if (!is_kernel(d)) throw new PyValueError(label + ' is not a KERNEL.BIN');
  const e = char_index(character);
  const [blk, links] = bring_links ? export_block(kernel_ai_block(d)[0], e) : single_entry(kernel_ai_block(d)[0], e);
  let text = disasm(blk, label + ' entry ' + e);
  if (sha1) text = '; kernel: ' + label + ', sha1 ' + sha1 + ', character entry ' + e + '\n' + text;
  const warn = links.length ? 'a script uses link: the entry number is a value on the stack and now means an entry of the new file' : null;
  return { text, warning: warn, characters: KERNEL_CHARS.slice() };
}
