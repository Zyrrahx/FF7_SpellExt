// The port of sxcfg/live.py: reading the running game's memory for the Live tables page. READ ONLY, by construction.
//
// Linux: the game (ff7_en.exe under Wine/Proton) is found with pgrep, its mappings read from /proc/<pid>/maps and its
// bytes from /proc/<pid>/mem, opened 'r' and read with positioned reads. Nothing opens anything for writing, attaches
// to the game or writes to it (a unit test greps this file). Windows: the same reads through sxlive_helper.exe
// (main/livehost.js; a Process whose _open/_pread/maps come from the helper), never seen working here.
//
// The kernel allows the read of `mem` only to a process it lets "attach" (Yama's ptrace_scope); a refusal is
// answered with words built from the value read (refusal_text), never hidden. The DLL's tables are found through
// one record it exports, `spellext_live_directory`; every read of the record, and of a table it names, is bracketed
// by two reads of its generation counter and retried (a seqlock).
//
// Called synchronously, as the reference: it runs in a worker thread of the main process (main/liveworker.js), so a
// read never holds up the window.
// Node 22 language level.
import fs from 'node:fs';
import child_process from 'node:child_process';
import { pyJoin, pySplit, pySplitlines, pyStrip, pyInt, pyLower, pyIsdigit } from './py.js';
import { bytes_repr } from './aitool.js';

export const PGREP = ['pgrep', '-i', '-x', 'ff7_en(\\.exe)?'];
export const SCOPE_PATH = '/proc/sys/kernel/yama/ptrace_scope';
export const MAX_READ = 1024 * 1024;          // one read: at most 1 MB
export const CHUNK = 64 * 1024;               // read in pieces of 64 KB
export const BUDGET = 0.5;                    // seconds of reading per request
export const DLL_NAME = 'ff7_spellext.dll';
export const EXPORT_NAME = 'spellext_live_directory';
export const EXE_BASE = 0x00400000;

// ---- the directory record (THE CONTRACT with the DLL) ---------------------------------------------------------------
export const DIR_MARKER = Buffer.from('SXLIVE01', 'latin1');
export const DIR_VERSION = 1;
export const DIR_ENTRIES = 64;
export const DIR_NAME = 24;
export const DIR_CONFIG = 260 + 32;
export const DIR_HEADER_SIZE = 8 + 4 * 8 + DIR_CONFIG;          // 332
export const ENTRY_SIZE = DIR_NAME + 4 * 8 + 8;                  // 64
export const DIR_SIZE = DIR_HEADER_SIZE + DIR_ENTRIES * ENTRY_SIZE;   // 4,428
export const GENERATION_AT = 24;
export const KIND_STATIC = 1;
export const KIND_HEAP = 2;
export const NONE = 0xffffffff;
export const ENTRY_NAMES = ['spells', 'spell_support', 'spell_by_id', 'spell_list0', 'spell_list1', 'spell_list2', 'wide_items',
  'wide_gears', 'fields_entries', 'fields_infos', 'fields_scales', 'loose_files', 'materia',
  'materia_names', 'materia_descriptions', 'limits', 'spell_renames', 'weapons', 'weapon_mirror',
  'weapon_names', 'weapon_descriptions', 'armour', 'armour_mirror', 'armour_names', 'armour_descriptions',
  'accessories', 'accessory_mirror', 'accessory_names', 'accessory_descriptions', 'items', 'item_names',
  'item_descriptions', 'prices', 'throw_effects', 'item_ranks', 'wide_list', 'wide_battle',
  'wide_carried', 'shops', 'shop_open', 'shops_original', 'shop_adds', 'growth_curves', 'characters', 'seats', 'char_ai', 'effects',
  'effect_bases', 'nfx_scripts', 'nfx_pool', 'sounds', 'cameras', 'camera_pool', 'camera_ff8',
  'kernel_kept'];
export const RETRIES = 3;

if (DIR_HEADER_SIZE !== 332 || ENTRY_SIZE !== 64 || DIR_SIZE !== 4428 || ENTRY_NAMES.length !== 55) throw new Error('the directory contract');

export class LiveError extends Error {
  constructor(message) { super(message); this.name = 'LiveError'; }
}
export class LiveNotRunning extends LiveError {
  constructor(message) { super(message); this.name = 'LiveNotRunning'; }
}
// The kernel refused the read (or a header the reader will not follow).
export class LiveRefused extends LiveError {
  constructor(message) { super(message); this.name = 'LiveRefused'; }
}
// The range is mapped but the read failed (EIO: a page that is gone, a guard page).
export class LiveUnreadable extends LiveError {
  constructor(message) { super(message); this.name = 'LiveUnreadable'; }
}
export class LiveUnmapped extends LiveError {
  constructor(message) { super(message); this.name = 'LiveUnmapped'; }
}
// The DLL's generation changed (or stayed odd) through every retry.
export class LiveRebuilt extends LiveError {
  constructor(message) { super(message); this.name = 'LiveRebuilt'; }
}
// The request's reading time ran out.
export class LiveBudget extends LiveError {
  constructor(message) { super(message); this.name = 'LiveBudget'; }
}
export class LiveNoDirectory extends LiveError {
  constructor(message) { super(message); this.name = 'LiveNoDirectory'; }
}

// '%08x' (Python's: a minus sign counts in the width)
export function x08(n) {
  const s = Math.abs(n).toString(16);
  return n < 0 ? '-' + s.padStart(7, '0') : s.padStart(8, '0');
}
const hx = n => (n < 0 ? '-' + (-n).toString(16) : n.toString(16));

export function monotonic() {
  return performance.now() / 1000;
}

// time.sleep(seconds), synchronously (the reader runs in a worker thread, or a test)
export function sleep(seconds) {
  if (seconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

// ---- the process ----------------------------------------------------------------------------------------------------
// The first pid pgrep gives for ff7_en(.exe), or null.
export function find_pid(cmd) {
  cmd = cmd || PGREP;
  let r;
  try {
    r = child_process.spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', timeout: 5000, windowsHide: true });
  } catch (e) {
    return null;
  }
  if (r.error) return null;
  const pids = pySplit(r.stdout || '').filter(x => pyIsdigit(x)).map(x => Number(pyInt(x, 10)));
  return r.status === 0 && pids.length ? pids[0] : null;
}

// The integer in kernel.yama.ptrace_scope, or null (not Linux, or no Yama).
export function ptrace_scope(path) {
  path = path || SCOPE_PATH;
  try {
    const t = pyStrip(fs.readFileSync(path).toString('latin1'), ' \t\n\r\x0b\x0c');     // bytes.strip()
    const v = pyInt(t || '-1', 10);
    return Number(v);
  } catch (e) {
    return null;
  }
}

// Why the kernel refused to read the game's memory, from the value of ptrace_scope read just now.
export function refusal_text(scope) {
  const head = "the kernel refused to read the game's memory: ";
  if (scope === 1) {
    return head + "kernel.yama.ptrace_scope is 1, which allows a process to read only its descendants' memory " +
      '(and Wine names only its own wineserver as a reader). To allow it: start the game from a shell this ' +
      'editor is an ancestor of, or, with root, `sysctl kernel.yama.ptrace_scope=0` for this session. ' +
      'Nothing was changed.';
  }
  if (scope === 2) {
    return head + "kernel.yama.ptrace_scope is 2: only a process with CAP_SYS_PTRACE may read another's memory. " +
      'To allow it, with root: `sysctl kernel.yama.ptrace_scope=0` for this session. Nothing was changed.';
  }
  if (scope === 3) {
    return head + "kernel.yama.ptrace_scope is 3: no process may read another's memory until the machine is " +
      'restarted (the value cannot be lowered before that). Nothing was changed.';
  }
  if (scope === 0) {
    return head + 'kernel.yama.ptrace_scope is 0, so Yama allows it: the game runs as another user, or a ' +
      'security module refuses it. Nothing was changed.';
  }
  return head + 'Yama is absent (no kernel.yama.ptrace_scope): the game runs as another user, or a security ' +
    'module refuses it. Nothing was changed.';
}

export class Mapping {
  constructor(start, end, perms, path) {
    this.start = start;
    this.end = end;
    this.perms = perms;
    this.path = path;
  }
}

// a hex address of the maps text as a Number (exact below 2**53; above it order is kept, which is all the reader
// needs of addresses past the game's 32-bit space)
function addr_of(s) {
  return Number(pyInt(s, 16));
}

// [Mapping] from a /proc/<pid>/maps text: 'start-end perms offset dev inode [path with spaces]'
export function parse_maps(text) {
  const out = [];
  for (const line of pySplitlines(text)) {
    const p = pySplit(line, null, 5);
    if (p.length < 5 || p[0].indexOf('-') < 0) continue;
    const k = p[0].indexOf('-');
    try {
      out.push(new Mapping(addr_of(p[0].slice(0, k)), addr_of(p[0].slice(k + 1)), p[1], p.length > 5 ? pyStrip(p[5]) : ''));
    } catch (e) {
      if (e.name !== 'ValueError') throw e;
    }
  }
  return out;
}

// Python's OSError text: "[Errno N] Words: 'path'"
const ERRNO = { EACCES: [13, 'Permission denied'], EPERM: [1, 'Operation not permitted'], ENOENT: [2, 'No such file or directory'],
                ESRCH: [3, 'No such process'], EIO: [5, 'Input/output error'], EFAULT: [14, 'Bad address'] };
function os_error_text(e, path) {
  const x = ERRNO[e.code];
  return x ? '[Errno ' + x[0] + '] ' + x[1] + ": '" + path + "'" : e.message;
}

export function read_maps(pid, proc) {
  proc = proc || '/proc';
  const p = pyJoin(proc, String(pid), 'maps');
  try {
    return parse_maps(fs.readFileSync(p).toString('utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ESRCH') throw new LiveNotRunning('the game is not running (pid ' + pid + ' is gone)');
    if (e.code === 'EACCES' || e.code === 'EPERM') throw new LiveRefused("cannot list the game's memory: " + os_error_text(e, p));
    throw e;
  }
}

// The lowest start of the mappings whose path's basename is `name` (any case), or null.
export function find_module(maps, name) {
  name = name || DLL_NAME;
  let best = null;
  for (const m of maps) {
    if (!m.path) continue;
    const parts = m.path.split(/[\\/]/);
    if (pyLower(parts[parts.length - 1]) === pyLower(name) && (best === null || m.start < best)) best = m.start;
  }
  return best;
}

const LOADED = /FF7 SpellExt loaded (?:as a mod's DLL )?at ([0-9a-fA-F]{8})/g;
const DIRLINE = /live tables: directory at ([0-9a-fA-F]{8})/g;

// The log's lines from the last start-up line on (the running game's, when it is running).
export function last_run(log_text) {
  if (!log_text) return '';
  const i = log_text.lastIndexOf('FF7 SpellExt loaded');
  return i >= 0 ? log_text.slice(i) : log_text;
}

function last_match(re, text) {
  let m;
  let last = null;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last === null ? null : parseInt(last, 16);
}

export function module_base_from_log(log_text) {
  return last_match(LOADED, last_run(log_text));
}

export function directory_from_log(log_text) {
  return last_match(DIRLINE, last_run(log_text));
}

export const READ_SCOPE = { read_scope: true };     // Process(scope=READ_SCOPE): read ptrace_scope when a refusal needs it

// One request's view of the game: the mappings, and /proc/<pid>/mem opened read-only (closed with close()).
// `scope` is the ptrace_scope value the refusal text names (null: Yama is absent).
export class Process {
  constructor(pid, maps, proc, scope, budget) {
    this.pid = pid;
    this.proc = proc || '/proc';
    this.maps = maps !== undefined && maps !== null ? maps : read_maps(pid, this.proc);
    this.maps.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    this.scope = scope === undefined ? READ_SCOPE : scope;
    this.budget = budget === undefined ? BUDGET : budget;
    this.deadline = this.budget ? monotonic() + this.budget : null;
    this._fd = null;
  }

  close() {
    if (this._fd !== null) {
      fs.closeSync(this._fd);
      this._fd = null;
    }
  }

  _refused() {
    return new LiveRefused(refusal_text(this.scope === READ_SCOPE ? ptrace_scope() : this.scope));
  }

  _open() {
    if (this._fd === null) {
      try {
        this._fd = fs.openSync(pyJoin(this.proc, String(this.pid), 'mem'), 'r');
      } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'ESRCH') throw new LiveNotRunning('the game is not running (pid ' + this.pid + ' is gone)');
        if (e.code === 'EACCES' || e.code === 'EPERM') throw this._refused();
        throw e;
      }
    }
    return this._fd;
  }

  // os.pread: the bytes read (fewer at the end of the file); a failure carries its code (EIO, EACCES...)
  _pread(address, size) {
    const fd = this._open();
    const buf = Buffer.alloc(size);
    const n = fs.readSync(fd, buf, 0, size, address);
    return buf.subarray(0, n);
  }

  // Whether [address, address+size) lies wholly in readable mappings (adjacent ones joined).
  covered(address, size) {
    let at = address;
    const end = address + size;
    for (const m of this.maps) {
      if (m.end <= at) continue;
      if (m.start > at || m.perms.indexOf('r') < 0) return false;
      at = m.end;
      if (at >= end) return true;
    }
    return false;
  }

  read(address, size) {
    if (size < 0 || size > MAX_READ) throw new LiveError('a read of ' + size + ' bytes: at most ' + MAX_READ);
    if (size === 0) return Buffer.alloc(0);
    if (address < 0 || address + size > 2 ** 32) throw new LiveUnmapped(x08(address) + ' is outside the game\'s 32-bit space');
    if (!this.covered(address, size)) throw new LiveUnmapped(x08(address) + '-' + x08(address + size) + ' is not mapped readable in the game');
    if (this.deadline !== null && monotonic() > this.deadline) throw new LiveBudget('stopped after ' + this.budget.toFixed(1) + ' s of reading');
    const parts = [];
    let got_n = 0;
    while (got_n < size) {
      const n = Math.min(CHUNK, size - got_n);
      let got;
      try {
        got = this._pread(address + got_n, n);
      } catch (e) {
        if (e instanceof LiveError) throw e;
        if (e.code === 'EACCES' || e.code === 'EPERM') throw this._refused();
        if (e.code === 'ESRCH' || e.code === 'ENOENT') throw new LiveNotRunning('the game is not running (pid ' + this.pid + ' is gone)');
        if (e.code === 'EIO' || e.code === 'EFAULT') {
          throw new LiveUnreadable(x08(address + got_n) + ': the read failed (' + ERRNO[e.code][1] + ')');
        }
        throw e;
      }
      if (!got.length) throw new LiveUnreadable(x08(address + got_n) + ': the read returned nothing');
      parts.push(got);
      got_n += got.length;
    }
    return Buffer.concat(parts);
  }

  u8(a) { return this.read(a, 1)[0]; }

  u16(a) { return this.read(a, 2).readUInt16LE(0); }

  u32(a) { return this.read(a, 4).readUInt32LE(0); }

  i32(a) { return this.read(a, 4).readInt32LE(0); }

  uint(a, width) {
    if (width !== 1 && width !== 2 && width !== 4) throw new LiveError('a counter of ' + width + ' bytes');
    return this.read(a, width).readUIntLE(0, width);
  }
}

// ---- the PE export table, read from memory --------------------------------------------------------------------------
export const MAX_NAMES = 4096;

// SizeOfImage from the PE headers at `base` (LiveRefused when they are not a PE32 image's)
export function pe_image_size(proc, base) {
  return _pe_headers(proc, base)[0];
}

function _pe_headers(proc, base) {
  const no = why => new LiveRefused('not a PE image at ' + x08(base) + ': ' + why);
  let dos;
  try {
    dos = proc.read(base, 0x40);
  } catch (e) {
    if (e instanceof LiveUnmapped) throw no('nothing mapped there');
    throw e;
  }
  if (dos[0] !== 0x4d || dos[1] !== 0x5a) throw no('no MZ');
  const lfanew = dos.readUInt32LE(0x3c);
  if (lfanew < 0x40 || lfanew > 0x1000) throw no('e_lfanew ' + hx(lfanew));
  const nt = proc.read(base + lfanew, 24);
  if (!(nt[0] === 0x50 && nt[1] === 0x45 && nt[2] === 0 && nt[3] === 0)) throw no('no PE signature');
  const opt_size = nt.readUInt16LE(20);
  if (opt_size < 96 + 8 || opt_size > 0x400) throw no('optional header of ' + opt_size + ' bytes');
  const opt = proc.read(base + lfanew + 24, opt_size);
  if (opt.readUInt16LE(0) !== 0x10b) throw no('not PE32');
  const size_of_image = opt.readUInt32LE(56);
  const ndirs = opt.readUInt32LE(92);
  if (size_of_image < 0x1000 || size_of_image > 0x10000000) throw no('SizeOfImage ' + hx(size_of_image));
  const [exp_rva, exp_size] = ndirs >= 1 ? [opt.readUInt32LE(96), opt.readUInt32LE(100)] : [0, 0];
  return [size_of_image, exp_rva, exp_size];
}

// Map(name -> absolute address) of the image at `base`. Every count and RVA is bounded by the image's size.
export function pe_exports(proc, base) {
  const [size, rva] = _pe_headers(proc, base);
  const inside = (r, n) => {
    if (r < 0 || n < 0 || r + n > size) {
      throw new LiveRefused('the export table at ' + x08(base) + ' points outside the image (rva ' + hx(r) + ', ' + n + ' bytes)');
    }
    return base + r;
  };
  if (!rva) throw new LiveRefused('the image at ' + x08(base) + ' has no export table');
  const d = proc.read(inside(rva, 40), 40);
  const nfuncs = d.readUInt32LE(20);
  const nnames = d.readUInt32LE(24);
  const a_funcs = d.readUInt32LE(28);
  const a_names = d.readUInt32LE(32);
  const a_ords = d.readUInt32LE(36);
  if (nfuncs > MAX_NAMES || nnames > MAX_NAMES) {
    throw new LiveRefused('the export table at ' + x08(base) + ' has ' + nnames + ' names, ' + nfuncs + ' functions: more than ' + MAX_NAMES);
  }
  const u32s = (b, n) => { const o = []; for (let i = 0; i < n; i++) o.push(b.readUInt32LE(4 * i)); return o; };
  const u16s = (b, n) => { const o = []; for (let i = 0; i < n; i++) o.push(b.readUInt16LE(2 * i)); return o; };
  const funcs = nfuncs ? u32s(proc.read(inside(a_funcs, 4 * nfuncs), 4 * nfuncs), nfuncs) : [];
  const names = nnames ? u32s(proc.read(inside(a_names, 4 * nnames), 4 * nnames), nnames) : [];
  const ords = nnames ? u16s(proc.read(inside(a_ords, 2 * nnames), 2 * nnames), nnames) : [];
  const out = new Map();
  for (let k = 0; k < Math.min(names.length, ords.length); k++) {
    const nr = names[k];
    const o = ords[k];
    if (!(nr >= 0 && nr < size)) throw new LiveRefused('an export name at rva ' + hx(nr) + ' is outside the image (' + hx(size) + ' bytes)');
    const n = Math.min(64, size - nr);
    const raw = proc.read(inside(nr, n), n);
    const z = raw.indexOf(0);
    const name = Array.from(z < 0 ? raw : raw.subarray(0, z), c => (c < 0x80 ? String.fromCharCode(c) : '�')).join('');
    if (o >= nfuncs) throw new LiveRefused('the export ' + name + ' has ordinal ' + o + ' of ' + nfuncs);
    if (!(funcs[o] >= 0 && funcs[o] < size)) throw new LiveRefused('the export ' + name + ' at rva ' + hx(funcs[o]) + ' is outside the image (' + hx(size) + ' bytes)');
    out.set(name, base + funcs[o]);
  }
  return out;
}

// ---- the directory --------------------------------------------------------------------------------------------------
function _cstr(b) {
  const z = b.indexOf(0);
  return (z < 0 ? b : b.subarray(0, z)).toString('latin1');
}

// The directory's fields from its DIR_SIZE bytes; LiveNoDirectory when they are not a version 1 record.
export function parse_directory(blob, address) {
  address = address || 0;
  if (blob.length < DIR_HEADER_SIZE) throw new LiveNoDirectory('no directory at ' + x08(address) + ': ' + blob.length + ' bytes');
  const marker = blob.subarray(0, 8);
  const version = blob.readUInt32LE(8);
  const size = blob.readUInt32LE(12);
  const esize = blob.readUInt32LE(16);
  const count = blob.readUInt32LE(20);
  const gen = blob.readInt32LE(24);
  const refreshed = blob.readUInt32LE(28);
  const exe_base = blob.readUInt32LE(32);
  const dll_base = blob.readUInt32LE(36);
  const config = blob.subarray(40, 40 + DIR_CONFIG);
  if (!marker.equals(DIR_MARKER)) {
    throw new LiveNoDirectory('no directory at ' + x08(address) + ': the marker is ' + bytes_repr(marker) + ', not ' + bytes_repr(DIR_MARKER));
  }
  if (version !== DIR_VERSION) throw new LiveNoDirectory('directory version ' + version + ': this editor knows version ' + DIR_VERSION + '; raw hex only');
  if (size !== DIR_SIZE || esize !== ENTRY_SIZE) {
    throw new LiveNoDirectory('the directory at ' + x08(address) + ' gives size ' + size + ' and entry size ' + esize +
                              '; this editor knows ' + DIR_SIZE + ' and ' + ENTRY_SIZE);
  }
  if (count > DIR_ENTRIES || blob.length < DIR_SIZE) {
    throw new LiveNoDirectory('the directory at ' + x08(address) + ' gives ' + count + ' entries (at most ' + DIR_ENTRIES + ')');
  }
  const entries = [];
  for (let i = 0; i < count; i++) {
    const o = DIR_HEADER_SIZE + i * ENTRY_SIZE;
    const name = blob.subarray(o, o + DIR_NAME);
    const u = k => blob.readUInt32LE(o + DIR_NAME + 4 * k);
    const [kind, addr, rs, n, in_use, in_use_at, width, live] = [u(0), u(1), u(2), u(3), u(4), u(5), u(6), u(7)];
    entries.push({ name: _cstr(name), kind, address: addr, record_size: rs, count: n,
                   in_use: in_use === NONE ? null : in_use, in_use_at, in_use_width: in_use_at ? width : 0,
                   live: live === NONE ? null : Boolean(live), index: i });
  }
  return { address, version, size, entry_count: count, generation: gen, refreshed, exe_base, dll_base,
           config: _cstr(config), entries };
}

export function generation(proc, address) {
  return proc.read(address + GENERATION_AT, 4).readInt32LE(0);
}

// The directory at `address`, read under its seqlock: LiveRebuilt('being rebuilt') after RETRIES tries.
export function directory(proc, address, pause) {
  pause = pause === undefined ? 0.02 : pause;
  for (let k = 0; k < RETRIES; k++) {
    const g1 = generation(proc, address);
    if (!(g1 & 1)) {
      const blob = proc.read(address, DIR_SIZE);
      const g2 = generation(proc, address);
      if (g1 === g2) {
        const d = parse_directory(blob, address);
        if (d.generation === g1) return d;
      }
    }
    if (k + 1 < RETRIES) sleep(pause);
  }
  throw new LiveRebuilt('the DLL is rebuilding its tables: refresh again');
}

// [bytes of records first..first+count-1, the live in-use count or null] of a directory entry, read between two reads
// of the generation; LiveRebuilt after RETRIES tries. `dir` is the record as directory() gave it (both reads must
// also equal its generation, or LiveRebuilt at once); a bare address is accepted for the tests of the seqlock alone.
export function read_table_window(proc, dir, entry, first, count, pause) {
  pause = pause === undefined ? 0.02 : pause;
  let dir_address;
  let expect;
  if (dir !== null && typeof dir === 'object') {
    dir_address = dir.address;
    expect = dir.generation;
  } else {
    dir_address = dir;
    expect = null;
  }
  const rs = entry.record_size;
  for (let k = 0; k < RETRIES; k++) {
    const g1 = generation(proc, dir_address);
    if (expect !== null && g1 !== expect && !(g1 & 1)) {
      throw new LiveRebuilt('the DLL rebuilt its tables since the directory was read: refresh again');
    }
    if (!(g1 & 1)) {
      const data = count ? proc.read(entry.address + first * rs, count * rs) : Buffer.alloc(0);
      const live = entry.in_use_at ? proc.uint(entry.in_use_at, entry.in_use_width) : (entry.in_use === undefined ? null : entry.in_use);
      const g2 = generation(proc, dir_address);
      if (g1 === g2) return [data, live];
    }
    if (k + 1 < RETRIES) sleep(pause);
  }
  throw new LiveRebuilt('rebuilt while reading: refresh again');
}

// The in-use count read live (in_use_at), under the seqlock; the copied in_use when there is no counter.
export function live_count(proc, dir, entry) {
  if (!entry.in_use_at) return entry.in_use === undefined ? null : entry.in_use;
  return read_table_window(proc, dir, entry, 0, 0)[1];
}

// The directory by the export table (the DLL's base from maps, else from the log's start-up line), then by the
// directory's own log line: {directory, found_by: 'exports'|'log'|'none', base, base_from: 'maps'|'log'|null, why}
export function locate_directory(proc, log_text) {
  const why = [];
  let base = find_module(proc.maps);
  let base_from = 'maps';
  if (base === null) {
    base = module_base_from_log(log_text);
    base_from = 'log';
    if (base === null) {
      base_from = null;
      why.push("the DLL's image is not in the game's maps and the log has no start-up line");
    }
  }
  const out = { directory: null, found_by: 'none', base, base_from, why };
  if (base !== null) {
    try {
      const ex = pe_exports(proc, base);
      if (ex.has(EXPORT_NAME)) {
        out.directory = directory(proc, ex.get(EXPORT_NAME));
        out.found_by = 'exports';
        return out;
      }
      why.push('the DLL at ' + x08(base) + ' exports no ' + EXPORT_NAME + ': it is older than this page (built before 2026-10-27)');
    } catch (e) {
      if (e instanceof LiveRebuilt) throw e;
      if (!(e instanceof LiveError)) throw e;
      why.push(e.message);
    }
  }
  const a = directory_from_log(log_text);
  if (a === null) {
    why.push('the log has no "live tables: directory at" line');
  } else {
    try {
      out.directory = directory(proc, a);
      out.found_by = 'log';
      return out;
    } catch (e) {
      if (e instanceof LiveRebuilt) throw e;
      if (!(e instanceof LiveError)) throw e;
      why.push('the log names ' + x08(a) + ': ' + e.message);
    }
  }
  return out;
}

// The marker scan (on request only): the DLL's image [base, base + SizeOfImage), readable parts, at a 16-byte
// alignment. The address of the first record that parses, or null.
export function scan_for_marker(proc, base, limit_bytes) {
  limit_bytes = limit_bytes === undefined ? 64 * 1024 * 1024 : limit_bytes;
  const size = Math.min(pe_image_size(proc, base), limit_bytes);
  const end = base + size;
  for (const m of proc.maps) {
    if (m.end <= base || m.start >= end || m.perms.indexOf('r') < 0) continue;
    let a = Math.max(m.start, base);
    while (a < Math.min(m.end, end)) {
      const n = Math.min(MAX_READ, Math.min(m.end, end) - a);
      let blob;
      try {
        blob = proc.read(a, n);
      } catch (e) {
        if (e instanceof LiveUnreadable || e instanceof LiveUnmapped) {
          a += n;
          continue;
        }
        throw e;
      }
      let i = blob.indexOf(DIR_MARKER);
      while (i >= 0) {
        if ((a + i) % 16 === 0) {
          try {
            directory(proc, a + i);
            return a + i;
          } catch (e) {
            if (!(e instanceof LiveError)) throw e;
          }
        }
        i = blob.indexOf(DIR_MARKER, i + 1);
      }
      a += n;
    }
  }
  return null;
}
