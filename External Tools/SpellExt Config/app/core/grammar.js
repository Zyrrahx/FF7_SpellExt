// The DLL's line grammar, ported one function at a time from FF7_SpellExt/src/spellext.c (port of sxcfg/grammar.py).
//
// Every function works on a string `s` that holds the file's bytes decoded as Latin-1 (one char per byte), with
// integer positions standing in for the C pointers. Names and behaviour follow the C:
//   is_space        spellext.c 9790   (space, tab, CR)
//   trim            spellext.c 9796
//   hex_digit       spellext.c 9804
//   parse_number    spellext.c 9813   (decimal, or 0x hex only when at least 3 chars remain)
//   word_is         spellext.c 9834   (case-insensitive on the text side; `word` is lower case)
//   next_word       spellext.c 9844   (space- or comma-separated lists)
//   parse_yes_no    spellext.c 35278
// The line loop every reader shares (e.g. spellext.c 13368-13376) is `lines()`.

export const DWORD_MASK = 0xFFFFFFFF;

export function is_space(c) {
  return c === ' ' || c === '\t' || c === '\r';
}

// trim(&start, &end): returns the new [start, end]
export function trim(s, a, b) {
  while (a < b && is_space(s[a])) a += 1;
  while (b > a && is_space(s[b - 1])) b -= 1;
  return [a, b];
}

export function hex_digit(c) {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  const o = c.charCodeAt(0) | 0x20;
  return (o >= 97 && o <= 102) ? o - 97 + 10 : -1;
}

// parse_number(&p, end, &out): returns [ok, new_p, value]. On failure p is unchanged.
// The value wraps as a 32-bit DWORD, as in the C (u32 after each step: the products stay below 2**53).
export function parse_number(s, p, end) {
  let c = p;
  let value = 0;
  let digits = 0;
  if (end - c > 2 && s[c] === '0' && (s.charCodeAt(c + 1) | 0x20) === 'x'.charCodeAt(0)) {
    c += 2;
    while (c < end && hex_digit(s[c]) >= 0) {
      value = (value * 16 + hex_digit(s[c])) % 0x100000000;
      c += 1;
      digits += 1;
    }
  } else {
    while (c < end && s[c] >= '0' && s[c] <= '9') {
      value = (value * 10 + (s.charCodeAt(c) - 48)) % 0x100000000;
      c += 1;
      digits += 1;
    }
  }
  if (!digits) return [false, p, 0];
  return [true, c, value];
}

// Whether s[a:b] is exactly `word` (lower case), ignoring the case of s.
export function word_is(s, a, b, word) {
  let i = 0;
  const n = word.length;
  while (a < b && i < n) {
    let ch = s[a];
    if (ch >= 'A' && ch <= 'Z') ch = String.fromCharCode(ch.charCodeAt(0) + 0x20);
    if (ch !== word[i]) return false;
    a += 1;
    i += 1;
  }
  return a === b && i === n;
}

// next_word(&p, end): returns [word_start, word_end] or null at the end of the list.
export function next_word(s, p, end) {
  let c = p;
  while (c < end && (is_space(s[c]) || s[c] === ',')) c += 1;
  if (c === end) return null;
  let we = c;
  while (we < end && !is_space(s[we]) && s[we] !== ',') we += 1;
  return [c, we];
}

// parse_yes_no: returns 1, 0, or null when the value is neither yes nor no.
export function parse_yes_no(s, a, b) {
  if (word_is(s, a, b, 'yes')) return 1;
  if (word_is(s, a, b, 'no')) return 0;
  return null;
}

// The comment rule: ; or # at the start of the line or after a space, tab or CR.
export function comment_stop(s, start, end) {
  let stop = start;
  while (stop < end) {
    if ((s[stop] === ';' || s[stop] === '#') && (stop === start || is_space(s[stop - 1]))) break;
    stop += 1;
  }
  return stop;
}

// One line as every reader sees it: number (1-based), the raw [line, end) range without the newline, and the
// trimmed [start, stop) range before any comment.
export class Line {
  constructor(number, line, end, start, stop) {
    this.number = number;
    this.line = line;
    this.end = end;
    this.start = start;
    this.stop = stop;
  }
}

// for (line = text; line < file_end; line = end + 1) { ... } : one Line per \n-ended line.
// A file that ends with \n has no extra empty line after it.
export function* lines(s) {
  let n = 0;
  let line = 0;
  const file_end = s.length;
  while (line < file_end) {
    let end = s.indexOf('\n', line);
    if (end < 0) end = file_end;
    n += 1;
    const stop0 = comment_stop(s, line, end);
    const [start, stop] = trim(s, line, stop0);
    yield new Line(n, line, end, start, stop);
    line = end + 1;
  }
}

// The reader's split at the first '=': returns [key_start, key_end, value_start, value_end, has_equals] with both
// sides trimmed.
export function split_key(s, start, stop) {
  let equals = s.indexOf('=', start);
  if (equals < 0 || equals >= stop) equals = stop;
  const key_end = equals;
  const value = equals < stop ? equals + 1 : stop;
  const [ks, ke] = trim(s, start, key_end);
  const [vs, ve] = trim(s, value, stop);
  return [ks, ke, vs, ve, equals < stop];
}

// encode_text_range: characters outside 0x20-0x7e become '?'. Returns the characters that would, sorted.
export function encode_check(text) {
  const seen = new Set();
  for (const ch of text) {
    const o = ch.codePointAt(0);
    if (!(o >= 0x20 && o < 0x7f)) seen.add(ch);
  }
  return [...seen].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}
