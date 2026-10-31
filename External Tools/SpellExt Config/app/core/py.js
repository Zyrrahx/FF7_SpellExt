// Python's built-ins where they are not their JS namesakes (design 2.1). Each copies CPython 3.14 exactly on the
// text the editor handles (Latin-1: one char per byte); where a helper goes beyond Latin-1 it says how far it is
// exact. Also the 32-bit helpers u32 / shl, and os.path / os.walk as Python does them on Linux (raw directory order,
// no normalising), so paths and orders printed by the port are the reference's.
//
// Node 22 language level: no newer syntax (the app runs under Electron's bundled Node).
import fs from 'node:fs';
import nodePath from 'node:path';

export class PyValueError extends Error {
  constructor(message) { super(message); this.name = 'ValueError'; }
}

// Python's IndexError (a RangeError, so code that tests for RangeError still sees it)
export class PyIndexError extends RangeError {
  constructor(message) { super(message); this.name = 'IndexError'; }
}

// Python's TypeError where the port raises it on purpose (a TypeError, so code that tests for TypeError still sees
// it); a TypeError thrown by JS itself (a property of undefined read) is a port bug and is never this class
export class PyTypeError extends TypeError {
  constructor(message) { super(message); this.name = 'TypeError'; }
}

// ---- 32-bit helpers ------------------------------------------------------------------------------------------------
export function u32(x) { return x >>> 0; }
export function shl(x, n) { return n >= 32 ? 0 : (x << n) >>> 0; }

// ---- whitespace, as str.isspace() (the Unicode White_Space set Python uses, plus \x1c-\x1f) ------------------------
export const PY_SPACE = '\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0        ' +
  '        　';
// for a RegExp character class: what Python's \s matches in a str pattern
export const PY_SPACE_CLASS = '[\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f' +
  '\\u205f\\u3000]';

export function pyIsspace(c) { return c.length === 1 && PY_SPACE.indexOf(c) >= 0; }

// str.strip(chars) / lstrip / rstrip; chars null or undefined: whitespace
export function pyStrip(s, chars) { return pyRstrip(pyLstrip(s, chars), chars); }

export function pyLstrip(s, chars) {
  const set = chars == null ? PY_SPACE : chars;
  let a = 0;
  while (a < s.length && set.indexOf(s[a]) >= 0) a++;
  return s.slice(a);
}

export function pyRstrip(s, chars) {
  const set = chars == null ? PY_SPACE : chars;
  let b = s.length;
  while (b > 0 && set.indexOf(s[b - 1]) >= 0) b--;
  return s.slice(0, b);
}

// str.split(sep=None, maxsplit=-1)
export function pySplit(s, sep, maxsplit) {
  if (maxsplit === undefined || maxsplit === null) maxsplit = -1;
  const out = [];
  if (sep === undefined || sep === null) {
    let i = 0;
    const n = s.length;
    while (true) {
      while (i < n && PY_SPACE.indexOf(s[i]) >= 0) i++;
      if (i >= n) break;
      if (maxsplit >= 0 && out.length === maxsplit) {
        out.push(s.slice(i));           // the rest as it is (its trailing whitespace included)
        break;
      }
      let j = i;
      while (j < n && PY_SPACE.indexOf(s[j]) < 0) j++;
      out.push(s.slice(i, j));
      i = j;
    }
    return out;
  }
  if (sep === '') throw new PyValueError('empty separator');
  let pos = 0;
  while (maxsplit < 0 || out.length < maxsplit) {
    const e = s.indexOf(sep, pos);
    if (e < 0) break;
    out.push(s.slice(pos, e));
    pos = e + sep.length;
  }
  out.push(s.slice(pos));
  return out;
}

// str.splitlines(keepends=False): breaks at \n \r \r\n \x0b \x0c \x1c \x1d \x1e \x85
const LINE_BREAKS = '\n\r\x0b\x0c\x1c\x1d\x1e\x85  ';
export function pySplitlines(s, keepends) {
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    let j = i;
    while (j < n && LINE_BREAKS.indexOf(s[j]) < 0) j++;
    let eol = j;
    if (j < n) {
      eol = (s[j] === '\r' && j + 1 < n && s[j + 1] === '\n') ? j + 2 : j + 1;
    }
    out.push(s.slice(i, keepends ? eol : j));
    i = eol;
  }
  return out;
}

// str.lower(): toLowerCase gives Python's result for every Latin-1 char (and for U+0130 and final sigma); the
// editor lowers file text (Latin-1) and file names
export function pyLower(s) { return s.toLowerCase(); }

// str.isdigit(): exact on Latin-1 (0-9 and the superscripts 2 3 1); beyond it, the decimal digits only
export function pyIsdigit(s) {
  if (!s.length) return false;
  for (const c of s) {
    if (!(/[0-9\xb2\xb3\xb9]/.test(c) || (c.charCodeAt(0) > 0xff && /\p{Nd}/u.test(c)))) return false;
  }
  return true;
}

// Strings compared as Python compares them: by code point (JS's < compares UTF-16 code units, which differs only
// above U+FFFF)
export function pyCmp(a, b) {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    let x = a.codePointAt(i);
    let y = b.codePointAt(i);
    if (x !== y) return x < y ? -1 : 1;
    if (x > 0xffff) i++;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

// str.find(sub, start, end): the first index of sub inside s[start:end], or -1 (start and end as Python's slice
// bounds: negative counts from the end, beyond the string is clamped)
export function pyFind(s, sub, start, end) {
  const n = s.length;
  let a = start === undefined || start === null ? 0 : start;
  let b = end === undefined || end === null ? n : end;
  if (a < 0) a = Math.max(0, a + n);
  if (b < 0) b = Math.max(0, b + n);
  if (b > n) b = n;
  if (a > n) return -1;
  const i = s.indexOf(sub, a);
  return i < 0 || i + sub.length > b ? -1 : i;
}

// `x in coll` for the containers the readers' shared state holds: a Set, a Map (its keys) or an Array
export function pyIn(x, coll) {
  return coll instanceof Set || coll instanceof Map ? coll.has(x) : coll.includes(x);
}

const INT_SPACE = PY_SPACE.replace('\x1c\x1d\x1e\x1f', '');
// sys.get_int_max_str_digits(): the default, which python3 -I keeps (no PYTHONINTMAXSTRDIGITS)
export const PY_INT_MAX_STR_DIGITS = 4300;

// int(s, base): a str argument. Exact for every Latin-1 string (Python maps other Unicode digits to ASCII first; this
// refuses them, which no Latin-1 text holds), refusal texts included. Returns a Number, or a BigInt beyond 2**53.
export function pyInt(s, base) {
  if (base === undefined || base === null) base = 10;
  const base0 = base;          // the message names the base as given (0 stays 0)
  // "invalid literal for int() with base %d: %.200R": the repr cut to 200 code points
  const bad = () => new PyValueError('invalid literal for int() with base ' + base0 + ': ' +
                                     Array.from(pyRepr(s)).slice(0, 200).join(''));
  if (base !== 0 && (base < 2 || base > 36)) throw new PyValueError('int() base must be >= 2 and <= 36, or 0');
  // int() strips Unicode whitespace, except \x1c-\x1f: ASCII is kept as it is and C's isspace leaves those
  let t = pyStrip(s, INT_SPACE);
  let i = 0;
  let sign = 1n;
  if (t[i] === '+') i++;
  else if (t[i] === '-') { sign = -1n; i++; }
  let errorIfNonzero = false;
  const p1 = (t[i + 1] || '').toLowerCase();
  if (base === 0) {
    if (t[i] !== '0') base = 10;
    else if (p1 === 'x') base = 16;
    else if (p1 === 'o') base = 8;
    else if (p1 === 'b') base = 2;
    else { errorIfNonzero = true; base = 10; }
  }
  if (t[i] === '0' && ((base === 16 && p1 === 'x') || (base === 8 && p1 === 'o') || (base === 2 && p1 === 'b'))) {
    i += 2;
    if (t[i] === '_') i++;          // one underscore allowed after the prefix
  }
  if (t[i] === '_') throw bad();
  // first the whole string is checked (digits and underscores), as CPython's long_from_string_base does
  const ds = [];
  let prev = '';
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === '_') {
      if (prev === '_') throw bad();
      prev = c;
      continue;
    }
    const o = c.charCodeAt(0);
    let d = -1;
    if (o >= 48 && o <= 57) d = o - 48;
    else if (o >= 97 && o <= 122) d = o - 87;
    else if (o >= 65 && o <= 90) d = o - 55;
    if (d < 0 || d >= base) throw bad();
    ds.push(d);
    prev = c;
  }
  if (!ds.length || prev === '_') throw bad();
  // then the digit limit, for a base that is not a power of two (underscores not counted), before the 0 rule
  if ((base & (base - 1)) !== 0 && ds.length > PY_INT_MAX_STR_DIGITS) {
    throw new PyValueError('Exceeds the limit (' + PY_INT_MAX_STR_DIGITS + ' digits) for integer string conversion: ' +
                           'value has ' + ds.length + ' digits; use sys.set_int_max_str_digits() to increase the limit');
  }
  let value = 0n;
  const B = BigInt(base);
  for (const d of ds) value = value * B + BigInt(d);
  if (errorIfNonzero && value !== 0n) throw bad();
  value *= sign;
  if (value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  return value;
}

// repr(str)
const NOT_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;
export function pyRepr(s) {
  if (s === null || s === undefined) return 'None';
  if (typeof s !== 'string') return pyStr(s);
  const quote = (s.indexOf("'") >= 0 && s.indexOf('"') < 0) ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const o = ch.codePointAt(0);
    if (ch === quote || ch === '\\') out += '\\' + ch;
    else if (ch === '\t') out += '\\t';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (o < 0x20 || o === 0x7f) out += '\\x' + hex(o, 2);
    else if (o < 0x7f) out += ch;
    else if (o === 0x20 || !NOT_PRINTABLE.test(ch)) out += ch;
    else if (o < 0x100) out += '\\x' + hex(o, 2);
    else if (o < 0x10000) out += '\\u' + hex(o, 4);
    else out += '\\U' + hex(o, 8);
  }
  return out + quote;
}

function hex(n, w) { return n.toString(16).padStart(w, '0'); }

// str(x) for the values the editor formats: str, int, bool, None
export function pyStr(x) {
  if (x === null || x === undefined) return 'None';
  if (x === true) return 'True';
  if (x === false) return 'False';
  return String(x);
}

// ---- os.path and os.walk (posixpath on Linux; node's win32 path functions on Windows) -----------------------------
const WIN = process.platform === 'win32';
export const SEP = WIN ? '\\' : '/';

export function pyJoin(a, ...rest) {
  if (WIN) return nodePath.join(a, ...rest);
  let path = a;
  for (const b of rest) {
    if (b.startsWith('/')) path = b;
    else if (!path || path.endsWith('/')) path += b;
    else path += '/' + b;
  }
  return path;
}

export function pyBasename(p) {
  if (WIN) return nodePath.win32.basename(p);
  return p.slice(p.lastIndexOf('/') + 1);
}

export function pyDirname(p) {
  if (WIN) return nodePath.win32.dirname(p);
  const i = p.lastIndexOf('/') + 1;
  let head = p.slice(0, i);
  if (head && head !== '/'.repeat(head.length)) head = head.replace(/\/+$/, '');
  return head;
}

export function pyNormpath(p) {
  if (WIN) return nodePath.win32.normalize(p);
  if (p === '') return '.';
  let initial = p.startsWith('/') ? 1 : 0;
  if (initial && p.startsWith('//') && !p.startsWith('///')) initial = 2;
  const comps = p.split('/');
  const out = [];
  for (const c of comps) {
    if (c === '' || c === '.') continue;
    if (c !== '..' || (!initial && !out.length) || (out.length && out[out.length - 1] === '..')) out.push(c);
    else if (out.length) out.pop();
  }
  let r = out.join('/');
  if (initial) r = '/'.repeat(initial) + r;
  return r || '.';
}

export function pyAbspath(p) {
  if (WIN) return nodePath.win32.resolve(p);
  if (!p.startsWith('/')) p = pyJoin(process.cwd(), p);
  return pyNormpath(p);
}

// os.path.realpath(p) (strict=False): symbolic links resolved as far as the path exists, the rest kept as written
export function pyRealpath(filename) {
  if (WIN) {
    try { return fs.realpathSync.native(filename); } catch (e) { return nodePath.win32.resolve(filename); }
  }
  const sep = '/';
  const rest = filename.split(sep).reverse();
  let partCount = rest.length;
  let path = filename.startsWith(sep) ? sep : process.cwd();
  const seen = new Map();
  while (partCount) {
    const name = rest.pop();
    if (name === null) {
      seen.set(rest.pop(), path);       // a resolved link's target
      continue;
    }
    partCount--;
    if (!name || name === '.') continue;
    if (name === '..') {
      path = path.slice(0, path.lastIndexOf(sep)) || sep;
      continue;
    }
    const newpath = path === sep ? path + name : path + sep + name;
    let target;
    try {
      const st = fs.lstatSync(newpath);
      if (!st.isSymbolicLink()) {
        path = newpath;
        continue;
      }
      if (seen.has(newpath)) {
        const known = seen.get(newpath);
        if (known !== null) { path = known; continue; }
        path = newpath;               // a loop: kept as it is
        continue;
      }
      target = fs.readlinkSync(newpath);
    } catch (e) {
      path = newpath;
      continue;
    }
    if (target.startsWith(sep)) path = sep;
    seen.set(newpath, null);
    rest.push(newpath);
    rest.push(null);
    const parts = target.split(sep).reverse();
    for (const x of parts) rest.push(x);
    partCount += parts.length;
  }
  return path;
}

// os.path.relpath(path, start)
export function pyRelpath(path, start) {
  if (WIN) return nodePath.win32.relative(start, path) || '.';
  const s = pyAbspath(start).split('/').filter(x => x);
  const p = pyAbspath(path).split('/').filter(x => x);
  let i = 0;
  while (i < s.length && i < p.length && s[i] === p[i]) i++;
  const rel = [];
  for (let k = i; k < s.length; k++) rel.push('..');
  for (let k = i; k < p.length; k++) rel.push(p[k]);
  return rel.length ? rel.join('/') : '.';
}

// os.path.commonpath(paths)
export function pyCommonpath(paths) {
  if (!paths.length) throw new PyValueError('commonpath() arg is an empty sequence');
  if (WIN) {
    const parts = paths.map(p => nodePath.win32.resolve(p).split('\\'));
    const out = [];
    for (let i = 0; parts.every(x => i < x.length && x[i].toLowerCase() === parts[0][i].toLowerCase()); i++) {
      out.push(parts[0][i]);
    }
    return out.join('\\');
  }
  const isabs = paths.map(p => p.startsWith('/'));
  if (isabs.some(x => x !== isabs[0])) throw new PyValueError("Can't mix absolute and relative paths");
  const split = paths.map(p => p.split('/').filter(c => c && c !== '.'));
  let s1 = split[0];
  let s2 = split[0];
  for (const x of split) {
    if (cmpList(x, s1) < 0) s1 = x;
    if (cmpList(x, s2) > 0) s2 = x;
  }
  let common = s1;
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] !== s2[i]) { common = s1.slice(0, i); break; }
  }
  return (isabs[0] ? '/' : '') + common.join('/');
}

function cmpList(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const c = pyCmp(a[i], b[i]);
    if (c) return c;
  }
  return a.length - b.length;
}

export function pyExists(p) { try { fs.statSync(p); return true; } catch (e) { return false; } }
export function pyLexists(p) { try { fs.lstatSync(p); return true; } catch (e) { return false; } }
export function pyIsfile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
export function pyIsdir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
export function pyIslink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }

// os.scandir: the entries in the order the file system gives them (readdirSync sorts; opendir does not)
export function pyScandir(top) {
  const dir = fs.opendirSync(top);
  const out = [];
  try {
    let e;
    while ((e = dir.readSync()) !== null) {
      const full = pyJoin(top, e.name);
      let isDir;
      if (e.isSymbolicLink()) {
        try { isDir = fs.statSync(full).isDirectory(); } catch (err) { isDir = false; }
      } else {
        isDir = e.isDirectory();
      }
      out.push({ name: e.name, path: full, isDir, isLink: e.isSymbolicLink() });
    }
  } finally {
    dir.closeSync();
  }
  return out;
}

export function pyListdir(top) { return pyScandir(top).map(e => e.name); }

// os.walk(top, topdown, followlinks=False): yields [dirpath, dirnames, filenames]; with topdown the caller may
// change dirnames in place, as in Python
export function* pyWalk(top, topdown) {
  if (topdown === undefined) topdown = true;
  const stack = [top];
  while (stack.length) {
    const t = stack.pop();
    if (Array.isArray(t)) {
      yield t;
      continue;
    }
    const dirs = [];
    const nondirs = [];
    const walkDirs = [];
    let entries;
    try {
      entries = pyScandir(t);
    } catch (e) {
      continue;
    }
    for (const e of entries) {
      if (e.isDir) dirs.push(e.name);
      else nondirs.push(e.name);
      if (!topdown && e.isDir && !e.isLink) walkDirs.push(e.path);
    }
    if (topdown) {
      yield [t, dirs, nondirs];
      for (let i = dirs.length - 1; i >= 0; i--) {
        const np = pyJoin(t, dirs[i]);
        if (!pyIslink(np)) stack.push(np);
      }
    } else {
      stack.push([t, dirs, nondirs]);
      for (let i = walkDirs.length - 1; i >= 0; i--) stack.push(walkDirs[i]);
    }
  }
}
