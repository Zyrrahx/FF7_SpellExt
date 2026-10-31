// The port of sxcfg/kernels.py: kernels for the AI page's Game AI. The game folder's KERNEL.BIN, every KERNEL.BIN in
// 7th Heaven's mods folder (loose in a mod folder, or inside an .iro archive), a path typed in, or a file picked
// through the main process's dialog (ai.kernel_pick; the Python page's browser upload). Everything here only READS:
// an .iro is read through its directory (7th Heaven's IrosArc.cs format) and the one entry wanted is decoded in
// memory (LZMA: lzma.js; LZS: lzs.js); nothing is extracted to disk.
//
// The remembered choice: Python kept it in spellext_config_settings.json beside the tool; here `settings` is either
// such a JSON file's path (the tests, as the reference) or an object {load() -> {}, save({})} (the app: settings.json
// in userData, store.js).
// Node 22 language level.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as t from './aitool.js';
import * as lzma from './lzma.js';
import { lzs } from './lzs.js';
import { pyJoin, pyBasename, pyDirname, pyIsfile, pyIsdir, pyRealpath, pyRelpath, pyLower, pyCmp, pyScandir, pyWalk, pyStrip,
         PyValueError } from './py.js';

export const MAX_KERNEL = 1024 * 1024;          // a KERNEL.BIN is about 22 KB; anything over 1 MB is not one

export class KernelRefused extends Error {
  constructor(message) { super(message); this.name = 'KernelRefused'; }
}

// the C library's words for the errors a read can meet (Python's OSError.strerror)
const STRERROR = { ENOENT: 'No such file or directory', EACCES: 'Permission denied', EPERM: 'Operation not permitted',
                   ENOTDIR: 'Not a directory', ELOOP: 'Too many levels of symbolic links',
                   ENAMETOOLONG: 'File name too long', EIO: 'Input/output error', EISDIR: 'Is a directory',
                   EINVAL: 'Invalid argument' };
export function strerror(e) {
  return STRERROR[e.code] || e.message;
}

// The bytes as a KERNEL.BIN with the character AI area; returns the AI block or throws KernelRefused.
export function check_kernel(data) {
  if (data.length > MAX_KERNEL) throw new KernelRefused('larger than 1 MB: not a KERNEL.BIN');
  if (!t.is_kernel(data)) throw new KernelRefused('not a KERNEL.BIN (no gzip sections where the kernel has them)');
  let blk;
  try {
    const secs = t.kernel_sections(data);
    if (secs.length < 3 || secs[2].length <= 0x61c) throw new KernelRefused('this kernel has no character AI area (section 3 too short)');
    blk = t.kernel_ai_block(data)[0];
    t.parse_block(blk);
  } catch (ex) {
    if (ex instanceof KernelRefused) throw ex;
    throw new KernelRefused('the kernel\'s character AI does not read: ' + ex.message);
  }
  return blk;
}

// A typed path: absolute, an existing regular readable file, at most 1 MB, a kernel. Returns its bytes.
export function read_path(path) {
  if (!path || !(process.platform === 'win32' ? /^([A-Za-z]:)?[\\/]/.test(path) : path.startsWith('/'))) {
    throw new KernelRefused('give the full path of the file');
  }
  let real;
  let st;
  try {
    real = pyRealpath(path);
    st = fs.statSync(real);
  } catch (ex) {
    throw new KernelRefused('cannot read ' + path + ': ' + strerror(ex));
  }
  if (!st.isFile()) throw new KernelRefused(path + ' is not a file');
  if (st.size > MAX_KERNEL) throw new KernelRefused('larger than 1 MB: not a KERNEL.BIN');
  try {
    fs.accessSync(real, fs.constants.R_OK);
  } catch (ex) {
    throw new KernelRefused(path + ' cannot be read');
  }
  const fd = fs.openSync(real, 'r');
  let data;
  try {
    const buf = Buffer.alloc(MAX_KERNEL + 1);
    let n = 0;
    for (;;) {
      const k = fs.readSync(fd, buf, n, buf.length - n, null);
      if (!k) break;
      n += k;
      if (n === buf.length) break;
    }
    data = buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
  check_kernel(data);
  return Buffer.from(data);
}

// ---- .iro archives (read only) --------------------------------------------------------------------------------------
// A file read as Python's f.read(n) / f.seek(p) / f.tell() do: short reads at the end, no error past it
class Reader {
  constructor(path) {
    // a FIFO, socket or device named like an archive would block the open, or the read, for good (Python's open
    // would): refused first, as an OSError the callers already take as an archive that does not read. A folder
    // opens and fails at the read, as Python's.
    const st = fs.statSync(path);
    if (!st.isFile() && !st.isDirectory()) {
      throw Object.assign(new Error(path + ' is not a regular file'), { name: 'OSError', code: 'ENOTREG' });
    }
    this.fd = fs.openSync(path, 'r');
    this.pos = 0;
  }

  read(n) {
    const buf = Buffer.alloc(n);
    let got = 0;
    while (got < n) {
      const k = fs.readSync(this.fd, buf, got, n - got, this.pos + got);
      if (!k) break;
      got += k;
    }
    this.pos += got;
    return buf.subarray(0, got);
  }

  seek(p) {
    if (typeof p === 'bigint') {
      if (p < 0n) throw Object.assign(new Error('[Errno 22] Invalid argument'), { name: 'OSError', code: 'EINVAL' });
      p = Number(p);
    }
    if (p < 0) throw Object.assign(new Error('[Errno 22] Invalid argument'), { name: 'OSError', code: 'EINVAL' });
    this.pos = p;
  }

  tell() { return this.pos; }

  close() { fs.closeSync(this.fd); }
}

// struct.unpack('<FMT', b) where b must be exactly the format's size
function need(b, n) {
  if (b.length !== n) throw new t.StructError('unpack requires a buffer of ' + n + ' bytes');
  return b;
}

// bytes.decode('utf-16-le', 'replace')
export function utf16_replace(b) {
  let s = '';
  let i = 0;
  while (i + 1 < b.length) {
    const u = b[i] | (b[i + 1] << 8);
    if (u >= 0xd800 && u <= 0xdbff) {
      if (i + 3 < b.length) {
        const v = b[i + 2] | (b[i + 3] << 8);
        if (v >= 0xdc00 && v <= 0xdfff) {
          s += String.fromCharCode(u, v);
          i += 4;
          continue;
        }
      }
      s += '�';
      i += 2;
      continue;
    }
    if (u >= 0xdc00 && u <= 0xdfff) {
      s += '�';
      i += 2;
      continue;
    }
    s += String.fromCharCode(u);
    i += 2;
  }
  if (i < b.length) s += '�';
  return s;
}

// [[name, flags, offset, size]] of an .iro's directory ([] when it is not an .iro)
export function iro_entries(path) {
  const f = new Reader(path);
  try {
    const head = f.read(16);
    if (head.length < 16) return [];
    const sig = head.readUInt32LE(0);
    const version = head.readUInt32LE(4);
    const directory = head.readUInt32LE(12);
    if (sig !== 0x534f5249) return [];
    f.seek(directory);
    const n = need(f.read(4), 4).readUInt32LE(0);
    const out = [];
    for (let k = 0; k < n; k++) {
      const pos = f.tell();
      const lh = need(f.read(4), 4);
      const ln = lh.readUInt16LE(0);
      const flen = lh.readUInt16LE(2);
      const name = utf16_replace(f.read(flen));
      const fl = need(f.read(4), 4).readUInt32LE(0);
      const off = version >= 0x10001 ? need(f.read(8), 8).readBigInt64LE(0) : BigInt(need(f.read(4), 4).readInt32LE(0));
      const size = need(f.read(4), 4).readUInt32LE(0);
      f.seek(pos + ln);
      out.push([name, fl, off, size]);
    }
    return out;
  } finally {
    f.close();
  }
}

export function _lzs(d) {
  return lzs(d);
}

// `entries`: the archive's directory when the caller has read it already (iro_read of every entry of a big archive);
// the reference reads it again each time
export function iro_read(path, entry_name, entries) {
  for (const [name, fl, off, size] of entries || iro_entries(path)) {
    if (name === entry_name) {
      if (size > MAX_KERNEL * 2) throw new KernelRefused('the archive entry is too large for a kernel');
      const f = new Reader(path);
      let raw;
      try {
        f.seek(off);
        raw = f.read(size);
      } finally {
        f.close();
      }
      if ((fl & 0xf) === 0) return raw;
      if (fl & 2) {
        if (raw.length < 8) {
          throw new t.StructError('unpack_from requires a buffer of at least 8 bytes for unpacking 8 bytes at offset 0 (actual buffer size is ' + raw.length + ')');
        }
        const dec = raw.readUInt32LE(0);
        const props = raw.readUInt32LE(4);
        const filt = lzma.decode_props(raw.subarray(8, 8 + props));
        return lzma.decompress(filt, raw.subarray(8 + props), dec);
      }
      return lzs(raw.subarray(4));
    }
  }
  throw new KernelRefused(pyBasename(path) + ' has no entry ' + entry_name);
}

// 'efc4bc61-..._New_Threat_2_0_2.0999993.iro' -> 'New Threat 2 0 2.0999993'
export function mod_label(filename) {
  let stem = pyLower(filename).endsWith('.iro') ? filename.slice(0, -4) : filename;
  const k = stem.indexOf('_');
  if (k >= 0) {
    const first = stem.slice(0, k);
    if ([...first].length === 36 && first.split('-').length - 1 === 4) stem = stem.slice(k + 1);
  }
  return pyStrip(stem.split('__').join(' ').split('_').join(' '));
}

// ---- discovery ------------------------------------------------------------------------------------------------------
function size_of(p) {
  return fs.statSync(p).size;
}

// [{id, label, where, size}]: the game folder's kernels, then the mods folder's (loose, then .iro)
export function discover(game_dir, mods_dir) {
  const out = [];
  if (game_dir) {
    // glob(game_dir/data/lang-*/kernel/*), sorted: hidden names are not matched by *
    const data = pyJoin(game_dir, 'data');
    const found = [];
    let langs = [];
    try { langs = pyScandir(data); } catch (e) { langs = []; }
    for (const l of langs) {
      if (!l.name.startsWith('lang-')) continue;
      const kd = pyJoin(data, l.name, 'kernel');
      let files = [];
      try { files = pyScandir(kd); } catch (e) { files = []; }
      for (const f of files) {
        if (!f.name.startsWith('.')) found.push(pyJoin(kd, f.name));
      }
    }
    found.sort(pyCmp);
    for (const p of found) {
      if (pyLower(pyBasename(p)) === 'kernel.bin' && pyIsfile(p)) {
        const lang = pyBasename(pyDirname(pyDirname(p)));
        out.push({ id: 'file:' + p, label: 'Game folder (' + lang + ')', where: p, size: size_of(p) });
      }
    }
  }
  if (mods_dir && pyIsdir(mods_dir)) {
    const mods = pyScandir(mods_dir).map(e => e.name).sort((a, b) => pyCmp(pyLower(a), pyLower(b)));
    for (const mod of mods) {
      const mp = pyJoin(mods_dir, mod);
      if (pyIsdir(mp)) {
        for (const [dp, dn, fn] of pyWalk(mp)) {
          const keep = dn.filter(d => ['spellextconfig', 'backups', 'cache'].indexOf(pyLower(d)) < 0).sort(pyCmp);
          dn.splice(0, dn.length, ...keep);
          for (const f of fn.slice().sort(pyCmp)) {
            if (pyLower(f) === 'kernel.bin') {
              const p = pyJoin(dp, f);
              const rel = pyRelpath(p, mp);
              out.push({ id: 'file:' + p, label: mod_label(mod) + (pyLower(rel) === pyJoin('kernel', 'kernel.bin') ? '' : '  ' + rel),
                         where: p, size: size_of(p) });
            }
          }
        }
      } else if (pyLower(mod).endsWith('.iro')) {
        let ents;
        try {
          ents = iro_entries(mp);
        } catch (e) {
          if (e instanceof t.StructError || e.code || e.name === 'OSError') continue;
          throw e;
        }
        for (const [name] of ents) {
          const parts = name.split('/').join('\\').split('\\');
          if (pyLower(parts[parts.length - 1]) === 'kernel.bin') {
            out.push({ id: 'iro:' + mp + '::' + name, label: mod_label(mod) + ' (.iro)  ' + name, where: mp + ' : ' + name, size: null });
          }
        }
      }
    }
  }
  return out;
}

// settings: a JSON file's path, as the reference; or {load, save}
function settings_store(settings) {
  if (!settings) return null;
  if (typeof settings === 'object') return settings;
  return {
    load() {
      if (!pyIsfile(settings)) return {};
      try {
        const v = JSON.parse(fs.readFileSync(settings, 'utf8'));
        return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch (e) {
        return {};
      }
    },
    save(data) {
      fs.writeFileSync(settings, JSON.stringify(data, null, 1));
    },
  };
}

// The session's kernels: what is found, uploads kept in memory, and which one is active.
export class Kernels {
  constructor(game_dir, mods_dir, settings) {
    this.game_dir = game_dir;
    this.mods_dir = mods_dir;
    this.store = settings_store(settings);
    this.found = null;
    this.uploads = new Map();             // id -> {label, data}
    this.cache = new Map();               // id -> bytes
    this.active = null;
    const saved = this._load_settings().kernel;
    if (saved) {
      try {
        this.get(saved);
        this.active = saved;
      } catch (e) {
        this.active = null;
      }
    }
  }

  _load_settings() {
    if (!this.store) return {};
    try {
      return this.store.load() || {};
    } catch (e) {
      return {};
    }
  }

  _save_settings() {
    if (!this.store || (this.active || '').startsWith('upload:')) return;
    try {
      const data = this._load_settings();
      data.kernel = this.active;
      this.store.save(data);
    } catch (e) {
      if (!e.code) throw e;
    }
  }

  listing() {
    if (this.found === null) this.found = discover(this.game_dir, this.mods_dir);
    const out = this.found.slice();
    for (const [kid, u] of this.uploads) {
      out.push({ id: kid, label: u.label, where: this.upload_where || 'uploaded from the browser (kept for this session)', size: u.data.length });
    }
    return out;
  }

  get(kid) {
    if (typeof kid !== 'string') throw new KernelRefused('unknown kernel ' + String(kid));
    if (this.cache.has(kid)) return this.cache.get(kid);
    let data;
    if (kid.startsWith('upload:')) {
      if (!this.uploads.has(kid)) throw new KernelRefused('that upload is gone (the tool was restarted)');
      data = this.uploads.get(kid).data;
    } else if (kid.startsWith('iro:')) {
      const rest = kid.slice(4);
      const k = rest.indexOf('::');
      if (k < 0) throw new PyValueError('not enough values to unpack (expected 2, got 1)');
      data = iro_read(rest.slice(0, k), rest.slice(k + 2));
    } else if (kid.startsWith('file:')) {
      data = read_path(kid.slice(5));
    } else {
      throw new KernelRefused('unknown kernel ' + kid);
    }
    check_kernel(data);
    this.cache.set(kid, data);
    return data;
  }

  default_id() {
    const ls = this.listing();
    return ls.length ? ls[0].id : null;
  }

  active_id() {
    return this.active || this.default_id();
  }

  choose(kid, path) {
    if (path !== null && path !== undefined) {
      read_path(path);
      kid = 'file:' + pyRealpath(path);
    }
    this.get(kid);
    this.active = kid;
    this._save_settings();
    return kid;
  }

  upload(name, data) {
    check_kernel(data);
    const kid = 'upload:' + (this.uploads.size + 1);
    this.uploads.set(kid, { label: 'Uploaded: ' + Array.from(pyBasename(name || 'KERNEL.BIN')).slice(0, 80).join(''), data });
    this.cache.set(kid, data);
    this.active = kid;
    return kid;
  }

  describe(kid) {
    const data = this.get(kid);
    const ls = this.listing();
    const hit = ls.find(k => k.id === kid);
    const label = hit ? hit.label : (kid.startsWith('file:') ? 'File: ' + kid.slice(5) : kid);
    const where = hit ? hit.where : (kid.startsWith('file:') ? kid.slice(5) : '');
    return { id: kid, label, where, size: data.length, sha1: crypto.createHash('sha1').update(data).digest('hex').slice(0, 10) };
  }
}
