// C printf as the DLL's log shows it (port of cfmt in sxcfg/validate.py, as corrected to C in S0).
//
// C99 on a 32-bit target, for %d %i %u %o %x %X %c %s %% with the flags - + space 0 #, width, precision and the
// lengths hh h l ll z. The DLL formats its log with wvsprintfA (spellext.c log_line), which agrees with C on every
// conversion its messages use (the Python tests/test_cfmt.py guard). A missing argument prints '?' (the tool's mark:
// C would read garbage). Integer arguments are taken as the bits of their C type, with BigInt so that ll is exact.
import { pyInt, pyStr, PyTypeError } from './py.js';

// the Python pattern, with \d as [0-9]: the formats are the DLL's (ASCII); Latin-1 has no other decimal digit
const _CFMT = /%([-+ 0#]*)([0-9]*)(?:\.([0-9]*))?(hh|h|ll|l|z)?([diouxXcsp%])/g;
// the width in bits of an integer argument, by length modifier, on the DLL's 32-bit target (int and long: 32)
const _BITS = { hh: 8, h: 16, '': 32, l: 32, z: 32, ll: 64 };

function _pad(flags, width, prefix, body, zeros) {
  const n = prefix.length + body.length;
  if (width <= n) return prefix + body;
  if (flags.indexOf('-') >= 0) return prefix + body + ' '.repeat(width - n);
  if (zeros && flags.indexOf('0') >= 0) return prefix + '0'.repeat(width - n) + body;
  return ' '.repeat(width - n) + prefix + body;
}

// int(a) for an argument: an int, a bool, or a str Python's int() takes. Anything else (None, a list, a dict) is
// Python's TypeError, never a 0: a caller that passes null where Python passed None must fail as Python does.
function toBig(a) {
  if (typeof a === 'bigint') return a;
  if (typeof a === 'boolean') return a ? 1n : 0n;
  if (typeof a === 'string') return BigInt(pyInt(a));
  if (typeof a === 'number') return BigInt(Math.trunc(a));
  const name = a === null || a === undefined ? 'NoneType' : Array.isArray(a) ? 'list' : typeof a === 'object' ? 'dict' : typeof a;
  throw new PyTypeError("int() argument must be a string, a bytes-like object or a real number, not '" + name + "'");
}

// An integer conversion as C does it: the argument taken as the bits of its C type (so %d of 0xffffffff is -1 and %u
// of -1 is 4294967295), the sign or 0x prefix, the precision's zeros, then the width.
function _cint(flags, width, prec, length, conv, a) {
  const bits = BigInt(_BITS[length || '']);
  const mask = (1n << bits) - 1n;
  let v = toBig(a) & mask;
  let neg = false;
  if ((conv === 'd' || conv === 'i') && (v >> (bits - 1n))) {
    v = (1n << bits) - v;
    neg = true;
  }
  let digits;
  if (prec === 0 && v === 0n) {
    digits = '';
  } else if (conv === 'o') {
    digits = v.toString(8);
  } else if (conv === 'x') {
    digits = v.toString(16);
  } else if (conv === 'X') {
    digits = v.toString(16).toUpperCase();
  } else {
    digits = v.toString(10);
  }
  if (prec !== null && digits.length < prec) digits = '0'.repeat(prec - digits.length) + digits;
  let prefix = '';
  if (conv === 'd' || conv === 'i') {
    prefix = neg ? '-' : flags.indexOf('+') >= 0 ? '+' : flags.indexOf(' ') >= 0 ? ' ' : '';   // u, o, x: no sign
  } else if (flags.indexOf('#') >= 0) {
    if (conv === 'o' && !digits.startsWith('0')) digits = '0' + digits;
    else if ((conv === 'x' || conv === 'X') && v) prefix = '0' + conv;                       // %#x of 0 is "0"
  }
  return _pad(flags, width, prefix, digits, prec === null);
}

export function cfmt(fmt, ...args) {
  const out = [];
  let pos = 0;
  let ai = 0;
  _CFMT.lastIndex = 0;
  let m;
  while ((m = _CFMT.exec(fmt)) !== null) {
    out.push(fmt.slice(pos, m.index));
    pos = m.index + m[0].length;
    const [, flags, widthText, precText, length, conv] = m;
    if (conv === '%') {
      out.push('%');
      continue;
    }
    if (ai >= args.length) {
      out.push('?');
      continue;
    }
    const a = args[ai];
    ai += 1;
    const width = widthText ? parseInt(widthText, 10) : 0;
    const prec = precText === undefined ? null : (precText ? parseInt(precText, 10) : 0);
    if ('diouxX'.indexOf(conv) >= 0) {
      out.push(_cint(flags, width, prec, length, conv, a));
    } else if (conv === 'c') {
      const isInt = typeof a === 'number' || typeof a === 'bigint' || typeof a === 'boolean';
      out.push(_pad(flags, width, '', isInt ? String.fromCharCode(Number(toBig(a) & 0xffn)) : pyStr(a), false));
    } else if (conv === 's') {
      const s = a === null || a === undefined ? '(null)' : pyStr(a);
      out.push(_pad(flags, width, '', prec === null ? s : s.slice(0, prec), false));
    } else {
      // %p: Python's ('%' + flags + width + '.prec' + 's') % (a,), as before (no message uses it); an empty
      // precision is dropped, Python's % ignores the 0 flag on s
      const s = pyStr(a);
      const p = precText ? parseInt(precText, 10) : null;
      out.push(_pad(flags.replace(/0/g, ''), width, '', p === null ? s : s.slice(0, p), false));
    }
  }
  out.push(fmt.slice(pos));
  return out.join('');
}
