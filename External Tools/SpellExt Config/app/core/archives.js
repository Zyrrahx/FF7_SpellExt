// (model preview, stage 2a) The archives a battle model's files come from, READ ONLY (sxcfg/archives.py, line for
// line): an LGP's table of contents only (its files read by seeking), and an .iro's directory (kernels.iro_entries) and
// the entries wanted, plain, LZS or LZMA. Every read is bounded; indexes are kept per (path, size, modification time).
// Node 22 language level.
import fs from 'node:fs';
import * as lzma from './lzma.js';
import { iro_entries, IRO_MAX_ENTRIES } from './kernels.js';
import { lzs } from './lzs.js';

export const LGP_CREATOR = Buffer.from('\x00\x00SQUARESOFT', 'latin1');
export const LGP_HEAD = 16;
export const LGP_TOC_ENTRY = 27;
export const MAX_ENTRY = 64 << 20;
export const MAX_IRO_ENTRIES = IRO_MAX_ENTRIES;

export class ArchiveError extends Error {
  constructor(message) { super(message); this.name = 'ArchiveError'; }
}

export function stamp_of(path) {
  const st = fs.statSync(path, { bigint: true });
  return [Number(st.size), st.mtimeNs];
}

// (stage 4) a file's or folder's stamp for the panel's caches: [size, modification time in ns (text), is a folder], or
// null when there is nothing at `path` (or it cannot be looked at)
export function stamp_or_none(path) {
  let st;
  try {
    st = fs.statSync(path, { bigint: true });
  } catch (e) {
    return null;
  }
  return [Number(st.size), String(st.mtimeNs), st.isDirectory()];
}
export const same_stamp = (a, b) => (a === null || b === null ? a === b : a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

export function ascii_lower(s) { return s.replace(/[A-Z]/g, c => String.fromCharCode(c.charCodeAt(0) + 32)); }

function read_at(fd, pos, n) {
  const buf = Buffer.alloc(n);
  let got = 0;
  while (got < n) {
    const k = fs.readSync(fd, buf, got, n - got, pos + got);
    if (!k) break;
    got += k;
  }
  return buf.subarray(0, got);
}

export class Lgp {
  constructor(path) {
    this.path = path;
    this.bytes_read = 0;
    [this.size, this.mtime] = stamp_of(path);
    const fd = fs.openSync(path, 'r');
    let toc;
    let n;
    try {
      const head = this._read(fd, 0, LGP_HEAD);
      if (head.length < LGP_HEAD) throw new ArchiveError('not an LGP archive (' + head.length + ' bytes)');
      if (!head.subarray(0, 12).equals(LGP_CREATOR)) throw new ArchiveError('not an LGP archive (no SQUARESOFT creator at its start)');
      n = head.readUInt32LE(12);
      if (LGP_HEAD + n * LGP_TOC_ENTRY > this.size) {
        throw new ArchiveError('not an LGP archive (its table of contents, ' + n + ' files, does not fit in ' + this.size + ' bytes)');
      }
      toc = this._read(fd, LGP_HEAD, n * LGP_TOC_ENTRY);
    } finally {
      fs.closeSync(fd);
    }
    this.count = n;
    this.toc = new Map();
    this.order = [];
    this.repeats = 0;
    for (let i = 0; i < n; i++) {
      const e = toc.subarray(i * LGP_TOC_ENTRY, (i + 1) * LGP_TOC_ENTRY);
      let end = e.indexOf(0);
      if (end < 0 || end > 20) end = 20;
      const name = e.subarray(0, end).toString('latin1');
      const off = e.readUInt32LE(20);
      const key = ascii_lower(name);
      if (this.toc.has(key)) {
        this.repeats += 1;
        continue;
      }
      this.toc.set(key, [name, off]);
      this.order.push(name);
    }
  }

  _read(fd, pos, n) {
    const b = read_at(fd, pos, n);
    this.bytes_read += b.length;
    return b;
  }

  names() { return this.order.slice(); }

  has(name) { return this.toc.has(ascii_lower(name)); }

  // (portrait panel) `cap`: the most bytes the caller takes; an entry that declares more is refused here, before it is read
  _head(fd, name, cap = null) {
    const key = ascii_lower(name);
    if (!this.toc.has(key)) throw new ArchiveError('has no file ' + name);
    const [real, off] = this.toc.get(key);
    if (off + 24 > this.size) throw new ArchiveError(real + ': its offset ' + off + ' is past the archive\'s end (' + this.size + ' bytes)');
    const h = this._read(fd, off, 24);
    const size = h.readUInt32LE(20);
    if (size > this.size - off - 24 || size > MAX_ENTRY) throw new ArchiveError(real + ': its head says ' + size + ' bytes, past the archive\'s end');
    if (cap !== null && size > cap) throw new ArchiveError(real + ': its head says ' + size + ' bytes, more than the ' + cap + ' this reader takes');
    return [off, size];
  }

  entry_size(name) {
    const fd = fs.openSync(this.path, 'r');
    try { return this._head(fd, name)[1]; } finally { fs.closeSync(fd); }
  }

  sizes() {
    const out = new Map();
    const fd = fs.openSync(this.path, 'r');
    try {
      for (const name of this.order) out.set(name, this._head(fd, name)[1]);
    } finally {
      fs.closeSync(fd);
    }
    return out;
  }

  read(name, cap = null) {
    const fd = fs.openSync(this.path, 'r');
    let data;
    let size;
    try {
      let off;
      [off, size] = this._head(fd, name, cap);
      data = this._read(fd, off + 24, size);
    } finally {
      fs.closeSync(fd);
    }
    if (data.length !== size) throw new ArchiveError(name + ': ' + data.length + ' of its ' + size + ' bytes could be read');
    return data;
  }
}

export class Iro {
  constructor(path) {
    this.path = path;
    [this.size, this.mtime] = stamp_of(path);
    let ents;
    try {
      ents = iro_entries(path);
    } catch (e) {
      if (e instanceof ArchiveError) throw e;
      throw new ArchiveError('its directory could not be read');
    }
    if (!ents.length && this.size >= 16) {
      const fd = fs.openSync(path, 'r');
      let head;
      try { head = read_at(fd, 0, 4); } finally { fs.closeSync(fd); }
      if (head.toString('latin1') !== 'IROS') throw new ArchiveError('not an .iro archive');
    }
    if (ents.length > MAX_IRO_ENTRIES) throw new ArchiveError('its directory holds ' + ents.length + ' entries');
    this.files = new Map();
    this.order = [];
    this._by_dir = null;
    for (const [name, fl, off, size] of ents) {
      const n = name.replace(/\//g, '\\');
      const key = ascii_lower(n);
      if (!this.files.has(key)) {
        this.files.set(key, [n, fl, typeof off === 'bigint' ? Number(off) : off, size]);
        this.order.push(n);
      }
    }
  }

  names() { return this.order.slice(); }

  in_folder(folder) {
    if (this._by_dir === null) {
      this._by_dir = new Map();
      for (const n of this.order) {
        const k = ascii_lower(n);
        const cut = k.lastIndexOf('\\');
        const d = cut >= 0 ? k.slice(0, cut) : '';
        if (!this._by_dir.has(d)) this._by_dir.set(d, []);
        this._by_dir.get(d).push([k.slice(cut + 1), n]);
      }
    }
    return this._by_dir.get(folder) || [];
  }

  has(name) { return this.files.has(ascii_lower(name.replace(/\//g, '\\'))); }

  // (portrait panel) `cap`: the most bytes the caller takes, of the entry as stored and of what it unpacks to; over it the
  // entry is refused before it is read or unpacked (an LZMA entry's declared size is read from its first 8 bytes only)
  read(name, cap = null) {
    const key = ascii_lower(name.replace(/\//g, '\\'));
    if (!this.files.has(key)) throw new ArchiveError('has no entry ' + name);
    const [real, fl, off, size] = this.files.get(key);
    if (off < 0 || size > MAX_ENTRY || off + size > this.size) throw new ArchiveError(real + ': its directory places it past the archive\'s end');
    const limit = cap === null ? MAX_ENTRY : Math.min(cap, MAX_ENTRY);
    if (size > limit) throw new ArchiveError(real + ': it is stored as ' + size + ' bytes, more than the ' + limit + ' this reader takes');
    const fd = fs.openSync(this.path, 'r');
    let raw;
    try {
      if ((fl & 0xf) !== 0 && cap !== null) {
        const head = read_at(fd, off, Math.min(size, 8));
        if (head.length === 8) {
          const declared = head.readUInt32LE(0);
          if (declared > limit) {
            throw new ArchiveError(real + ': it declares ' + declared + ' bytes unpacked, more than the ' + limit + ' this reader takes');
          }
        }
      }
      raw = read_at(fd, off, size);
    } finally { fs.closeSync(fd); }
    if (raw.length !== size) throw new ArchiveError(real + ': ' + raw.length + ' of its ' + size + ' bytes could be read');
    try {
      if ((fl & 0xf) === 0) return raw;
      if (fl & 2) {
        if (raw.length < 8) throw new RangeError('short');
        const dec = raw.readUInt32LE(0);
        const props = raw.readUInt32LE(4);
        if (dec > limit || props > 64) throw new ArchiveError(real + ': an LZMA entry of ' + dec + ' bytes');
        const filt = lzma.decode_props(raw.subarray(8, 8 + props));
        return lzma.decompress(filt, raw.subarray(8 + props), dec);
      }
      return lzs(raw.subarray(4), limit);
    } catch (e) {
      if (e instanceof ArchiveError) throw e;
      if (e.code === 'ELZSLIMIT') throw new ArchiveError(real + ': an LZS entry larger than ' + (limit >> 20) + ' MB');
      throw new ArchiveError(real + ': its packed bytes do not unpack');
    }
  }
}

const CACHE = new Map();

export function open_cached(kind, path) {
  const st = stamp_of(path);
  const k = kind + '\0' + path;
  const hit = CACHE.get(k);
  if (hit && hit[0][0] === st[0] && hit[0][1] === st[1]) return hit[1];
  const a = kind === 'lgp' ? new Lgp(path) : new Iro(path);
  CACHE.set(k, [st, a]);
  return a;
}

// (stage 4) every index kept is dropped (the panel's Reload)
export function clear_cache() { CACHE.clear(); }
