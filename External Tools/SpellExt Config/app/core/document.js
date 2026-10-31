// A byte-preserving .ini document: the file as the DLL reads it (grammar.js), editable as minimal line changes
// (port of sxcfg/document.py).
//
// The file is held as raw lines (bytes decoded as Latin-1, one char per byte, each line with its own '\n' or '\r\n'
// or none on the last line). serialize() of an untouched document is the same bytes. An edit replaces only what it
// must: a value's span, one inserted line, one removed line. Nothing is ever normalised.
import * as grammar from './grammar.js';
import { SequenceMatcher } from './difflib.js';
import { pyRepr, pyStrip, pyLstrip, pyLower, PyIndexError, PyTypeError } from './py.js';

// An edit the document will not make (the message says why, in the DLL's terms).
export class EditRefused extends Error {
  constructor(message) { super(message); this.name = 'EditRefused'; }
}

// Python's UnicodeEncodeError: a char above 255 cannot be a byte of the file
export class UnicodeEncodeError extends Error {
  constructor(message) { super(message); this.name = 'UnicodeEncodeError'; }
}

export function latin1(data) {
  if (typeof data === 'string') return data;
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('latin1');
}

// str.encode('latin-1'), its refusal worded as Python's: positions count code points, a character is shown escaped
// ('\u0101', '\U0001f600'), and a run of such characters is one range ('characters in position 5-6')
export function encodeLatin1(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0xff) {
      const pos = i;                 // every char before it is below 256: one code unit, one code point
      const first = text.codePointAt(i);
      let n = 0;
      for (let j = i; j < text.length && text.codePointAt(j) > 0xff; j += text.codePointAt(j) > 0xffff ? 2 : 1) n++;
      const what = n === 1
        ? "character '" + (first > 0xffff ? '\\U' + hex8(first) : '\\u' + hex8(first).slice(4)) + "' in position " + pos
        : 'characters in position ' + pos + '-' + (pos + n - 1);
      throw new UnicodeEncodeError("'latin-1' codec can't encode " + what + ': ordinal not in range(256)');
    }
  }
  return Buffer.from(text, 'latin1');
}

function hex8(n) { return n.toString(16).padStart(8, '0'); }

// A line classified by the DLL's rule. Spans are positions inside `body` (the line without its newline).
// kind: 'blank' | 'comment' | 'section' | 'key' | 'nokey' (text without '=').
export class LineView {
  constructor(index, raw) {
    this.index = index;
    if (raw.endsWith('\r\n')) {
      this.body = raw.slice(0, -2);
      this.newline = '\r\n';
    } else if (raw.endsWith('\n')) {
      this.body = raw.slice(0, -1);
      this.newline = '\n';
    } else {
      this.body = raw;
      this.newline = '';
    }
    const b = this.body;
    // the reader's view: '\r' is a space, so a lone '\r' before '\n' is part of the body already
    const stop0 = grammar.comment_stop(b, 0, b.length);
    this.comment = stop0 < b.length ? stop0 : null;
    const [start, stop] = grammar.trim(b, 0, stop0);
    this.start = start;
    this.stop = stop;
    this.key = this.value = null;
    if (start === stop) {
      this.kind = this.comment !== null ? 'comment' : 'blank';
    } else if (b[start] === '[') {
      this.kind = 'section';
    } else {
      const [ks, ke, vs, ve, has_eq] = grammar.split_key(b, start, stop);
      this.key = [ks, ke];
      if (has_eq) {
        this.kind = 'key';
        // an empty value sits right after '=' (and its spaces): keep where it would go
        this.value = [vs, ve];
      } else {
        this.kind = 'nokey';
      }
    }
  }

  get raw() { return this.body + this.newline; }

  key_text() { return this.key ? this.body.slice(this.key[0], this.key[1]) : null; }

  value_text() { return this.value ? this.body.slice(this.value[0], this.value[1]) : null; }

  header_text() { return this.kind === 'section' ? this.body.slice(this.start, this.stop) : null; }

  comment_text() { return this.comment !== null ? this.body.slice(this.comment) : ''; }
}

// A run of lines: the header line (null for the lines before the first header) and the lines after it.
export class Section {
  constructor(header_index, first, last) {
    this.header_index = header_index;
    this.first = first;           // [first, last] inclusive
    this.last = last;
  }
}

export function _split_raw(text) {
  const out = [];
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    const e = text.indexOf('\n', pos);
    if (e < 0) {
      out.push(text.slice(pos));
      break;
    }
    out.push(text.slice(pos, e + 1));
    pos = e + 1;
  }
  return out;
}

function inSet(ch, set) { return ch !== undefined && ch !== '' && set.indexOf(ch) >= 0; }

export class Document {
  constructor(data) {
    if (data === undefined) data = '';
    data = latin1(data);
    this._lines = _split_raw(data).map((raw, i) => new LineView(i, raw));
  }

  // ---- reading -----------------------------------------------------------------------------------------------------
  text() { return this._lines.map(l => l.raw).join(''); }

  serialize() { return encodeLatin1(this.text()); }

  get lines() { return this._lines; }

  majority_newline() {
    let crlf = 0;
    let lf = 0;
    for (const l of this._lines) {
      if (l.newline === '\r\n') crlf++;
      else if (l.newline === '\n') lf++;
    }
    if (!crlf && !lf) return '\r\n';          // an empty file: the files are for a Windows program
    return crlf >= lf ? '\r\n' : '\n';
  }

  // Sections in file order; the first is the lines before any header (header_index null), possibly empty.
  sections() {
    const out = [];
    let cur_header = null;
    let cur_first = 0;
    for (const l of this._lines) {
      if (l.kind === 'section') {
        out.push(new Section(cur_header, cur_first, l.index - 1));
        cur_header = l.index;
        cur_first = l.index + 1;
      }
    }
    out.push(new Section(cur_header, cur_first, this._lines.length - 1));
    return out;
  }

  section_at(header_index) {
    for (const s of this.sections()) {
      if (s.header_index === header_index) return s;
    }
    throw new Error('KeyError: ' + header_index);
  }

  key_lines(section) {
    const out = [];
    for (let i = section.first; i <= section.last; i++) {
      if (this._lines[i].kind === 'key') out.push(this._lines[i]);
    }
    return out;
  }

  // The key lines of `key` (case-insensitive, as word_is) in a section, in file order.
  find_key(section, key) {
    const k = pyLower(key);
    return this.key_lines(section).filter(l => pyLower(l.key_text()) === k);
  }

  // ---- editing -----------------------------------------------------------------------------------------------------
  _reclassify() {
    this._lines.forEach((l, i) => { l.index = i; });
  }

  // self._lines[index] for an index a caller gives: past the end is Python's IndexError. Python counts a negative
  // index from the end; the port refuses it the same way (its callers pass 0-based line indices only).
  _at(index) {
    if (!(Number.isInteger(index) && index >= 0 && index < this._lines.length)) {
      throw new PyIndexError('list index out of range');
    }
    return this._lines[index];
  }

  _replace_line(index, body, newline) {
    const old = this._lines[index];
    this._lines[index] = new LineView(index, body + (newline === undefined || newline === null ? old.newline : newline));
  }

  static _check_value(value) {
    if (value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0) throw new EditRefused('a value is one line');
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if ((ch === ';' || ch === '#') && i > 0 && grammar.is_space(value[i - 1])) {
        throw new EditRefused('a value cannot hold ' + ch + ' after a space: the DLL reads a comment from there ' +
                              '(a comment starts at ; or # at the start of the line or after a space)');
      }
    }
    if (value.slice(0, 1) === ';' || value.slice(0, 1) === '#') {
      throw new EditRefused('a value cannot start with ' + value[0] + ': the DLL reads a comment from there');
    }
    if (value !== pyStrip(value, ' \t')) throw new EditRefused('a value cannot start or end with a space (the DLL trims it)');
  }

  // Replace the value of the key line at `index`; key, padding, comment and line ending stay.
  set_value(index, value) {
    const l = this._at(index);
    if (l.kind !== 'key') throw new EditRefused('line ' + (index + 1) + ' is not a key = value line');
    Document._check_value(value);
    const [vs, ve] = l.value;
    const b = l.body;
    let nw;
    if (vs === ve && value && vs > 0 && b[vs - 1] === '=') {
      nw = b.slice(0, vs) + ' ' + value + b.slice(vs);     // `key =` given a value: `key = value`
    } else {
      nw = b.slice(0, vs) + value + b.slice(ve);
    }
    const check = new LineView(index, nw);
    if (check.kind !== 'key' || check.key_text() !== l.key_text() || check.value_text() !== value) {
      throw new EditRefused('the line would not read back as ' + l.key_text() + ' = ' + value);
    }
    this._replace_line(index, nw);
  }

  // A key line becomes `key` = `value`: the padding, the comment and the line ending stay.
  replace_key(index, key, value) {
    const l = this._at(index);
    if (l.kind !== 'key') throw new EditRefused('line ' + (index + 1) + ' is not a key = value line');
    Document._check_value(value);
    const [ks, ke] = l.key;
    const [vs, ve] = l.value;
    const b = l.body;
    if (vs === ve && value && vs > 0 && b[vs - 1] === '=') value = ' ' + value;
    const nw = b.slice(0, ks) + key + b.slice(ke, vs) + value + b.slice(ve);
    const check = new LineView(index, nw);
    if (check.kind !== 'key' || check.key_text() !== key || check.value_text() !== pyStrip(value)) {
      throw new EditRefused('the line would not read back as ' + key + ' = ' + value);
    }
    this._replace_line(index, nw);
  }

  // The newline of the line above `at` (the file's majority when it has none).
  _newline_for_insert(at) {
    if (at > 0) {
      const nl = this._lines[at - 1].newline;
      if (nl) return nl;
    }
    return this.majority_newline();
  }

  insert_line(at, body) {
    Document._check_body(body);
    let nl = null;
    if (at > 0 && at === this._lines.length && !this._lines[at - 1].newline) {
      // after a last line without a newline: it takes one, and the new last line has none (the file still ends the
      // way it did)
      const prev = this._lines[at - 1];
      const above = at >= 2 ? this._lines[at - 2].newline : '';
      this._replace_line(at - 1, prev.body, above || this.majority_newline());
      nl = '';
    }
    if (nl === null) nl = this._newline_for_insert(at);
    this._lines.splice(at, 0, new LineView(at, body + nl));
    this._reclassify();
    return at;
  }

  // Lines inserted verbatim before line `at` (0-based; lines.length appends), each by insert_line's rule (the ending
  // of the line above; after a last line without a newline, the block ends the file the same way). Every line is
  // checked before any is inserted, so a refusal changes nothing. Returns `at`.
  insert_block(at, lines) {
    lines = lines.map(l => latin1(l));
    if (!(at >= 0 && at <= this._lines.length)) throw new EditRefused('line ' + (at + 1) + ' is not in the file');
    for (const l of lines) {
      if (l.indexOf('\n') >= 0 || l.indexOf('\r') >= 0) throw new EditRefused('a line holds no line break: ' + pyRepr(l));
      for (let i = 0; i < l.length; i++) {
        if (l.charCodeAt(i) > 0xff) {
          throw new EditRefused(pyRepr(l) + ' holds a character the .ini files cannot (one byte per character)');
        }
      }
    }
    lines.forEach((l, k) => { this.insert_line(at + k, l); });
    return at;
  }

  static _check_body(body) {
    if (body.indexOf('\n') >= 0) throw new EditRefused('a line holds no line break');
  }

  // How the section's key lines are laid out: [column of '=', spaces after '='] or null.
  _key_layout(section, key) {
    const lines = this.key_lines(section);
    if (!lines.length) return null;
    const cols = new Map();
    const after = new Map();
    for (const l of lines) {
      const eq = l.body.indexOf('=', l.start);
      if (l.key[0] !== 0) continue;
      cols.set(eq, (cols.get(eq) || 0) + 1);
      const rest = l.body.slice(eq + 1);
      const sp = rest.length - pyLstrip(rest, ' ').length;
      after.set(sp, (after.get(sp) || 0) + 1);
    }
    if (!cols.size) return null;
    return [firstMax(cols), firstMax(after)];
  }

  format_key_line(section, key, value) {
    const lay = section !== null && section !== undefined ? this._key_layout(section, key) : null;
    if (lay === null) return key + ' = ' + value;
    const [col, sp] = lay;
    let head;
    if (key.length < col && (col - key.length) >= 1) head = key + ' '.repeat(col - key.length);
    else head = key + ' ';
    return head + '=' + ' '.repeat(sp) + value;
  }

  // Insert `key = value` after the last key line of the section (else after its header). Returns the index.
  add_key(section, key, value) {
    Document._check_value(value);
    let bad = !key || key.indexOf('=') >= 0 || inSet(key[0], '[;#') || key !== pyStrip(key, ' \t') ||
      key.indexOf('\n') >= 0 || key.indexOf('\r') >= 0;
    for (let i = 1; !bad && i < key.length; i++) {
      if (inSet(key[i], ';#') && grammar.is_space(key[i - 1])) bad = true;
    }
    if (bad) throw new EditRefused('not a key the DLL would read: ' + pyRepr(key));
    let last = null;
    for (let i = section.first; i <= section.last; i++) {
      const k = this._lines[i].kind;
      if (k === 'key' || k === 'nokey') last = i;
    }
    let at;
    if (last === null) {
      at = section.header_index !== null ? section.header_index + 1 : section.first;
      if (section.header_index === null) {
        // the lines before the first header: after the leading comment block
        at = section.first;
        for (let i = section.first; i <= section.last; i++) {
          const k = this._lines[i].kind;
          if (k === 'comment' || k === 'blank') at = i + 1;
          else break;
        }
      }
    } else {
      at = last + 1;
    }
    const body = this.format_key_line(section, key, value);
    return this.insert_line(at, body);
  }

  remove_line(index) {
    const l = this._at(index);
    if (index === this._lines.length - 1 && !l.newline && index > 0) {
      // the last line had no newline: the line above loses its own, so the file still ends the same way
      const prev = this._lines[index - 1];
      this._replace_line(index - 1, prev.body, '');
    }
    this._lines.splice(index, 1);
    this._reclassify();
  }

  comment_out(index) {
    const l = this._at(index);
    if (!(l.kind === 'key' || l.kind === 'nokey' || l.kind === 'section')) {
      throw new EditRefused('line ' + (index + 1) + ' is not a key line');
    }
    this._replace_line(index, ';' + l.body);
  }

  uncomment(index) {
    const l = this._at(index);
    const b = l.body;
    const s = b.length - pyLstrip(b, ' \t').length;
    const c = b.slice(s, s + 1);
    if (l.kind !== 'comment' || !(c === ';' || c === '#')) {
      throw new EditRefused('line ' + (index + 1) + ' is not a commented line');
    }
    this._replace_line(index, b.slice(0, s) + b.slice(s + 1));
  }

  // Append a section at the end of the file: a blank line, the header, its key lines. Returns the header index.
  add_section(header, keys) {
    if (keys === undefined) keys = [];
    Document._check_body(header);
    if (!(header.startsWith('[') && header.endsWith(']'))) throw new EditRefused('a section header is [ ... ]');
    if (this._lines.length && this._lines[this._lines.length - 1].kind !== 'blank') {
      this.insert_line(this._lines.length, '');
    }
    const at = this.insert_line(this._lines.length, header);
    for (const [k, v] of keys) {
      Document._check_value(v);
      this.insert_line(this._lines.length, k + ' = ' + v);
    }
    return at;
  }

  // The header and its lines; with `section_kind`, a commented-out section inside it stays (it is its own).
  remove_section(header_index, section_kind) {
    const s = this.section_at(header_index);
    if (s.header_index === null) throw new PyTypeError('remove_section needs a header line (Python: TypeError)');
    const keep = this._block_lines(section_kind || null);
    for (let i = s.last; i > s.header_index - 1; i--) {
      if (!keep.has(i)) this.remove_line(i);
    }
  }

  // ---- commented-out sections --------------------------------------------------------------------------------------
  // A commented-out section (a block) is a comment line `;[3001]` or `#[3001]` (no space after the `;`) whose
  // header, uncommented, the file's reader accepts (`section_kind`: header text -> kind, or null when the DLL refuses
  // it), and the comment lines after it, down to the first line that is not a comment (a blank line, a live key or
  // header: the DLL reads a live key there as one of the section above) or the next such header. Its lines are the
  // block's, not the live section's above it.
  _commented_header(index, section_kind) {
    const l = this._lines[index];
    if (!section_kind || l.kind !== 'comment') return null;
    const b = l.body;
    const s = l.comment;
    const rest = b.slice(s + 1);
    if (!rest || grammar.is_space(rest[0])) return null;
    const probe = new LineView(index, b.slice(0, s) + rest);
    if (probe.kind !== 'section') return null;
    const h = probe.header_text();
    return section_kind(h) ? h : null;
  }

  // The commented-out sections: [[header index, last index, header text]] in file order.
  commented_blocks(section_kind) {
    const out = [];
    const n = this._lines.length;
    let i = 0;
    while (i < n) {
      const h = this._commented_header(i, section_kind);
      if (h === null) {
        i += 1;
        continue;
      }
      let j = i;
      while (j + 1 < n && this._lines[j + 1].kind === 'comment' && this._commented_header(j + 1, section_kind) === null) {
        j += 1;
      }
      out.push([i, j, h]);
      i = j + 1;
    }
    return out;
  }

  _block_lines(section_kind) {
    const out = new Set();
    if (section_kind) {
      for (const [a, b] of this.commented_blocks(section_kind)) {
        for (let i = a; i <= b; i++) out.add(i);
      }
    }
    return out;
  }

  // A comment that is a note (`; text`: a space after the `;`), which uncomment_block leaves as it is.
  static _is_note(l) {
    if (l.kind !== 'comment') return false;
    const rest = l.body.slice(l.comment + 1);
    return Boolean(rest) && grammar.is_space(rest[0]);
  }

  // A comment of nothing but ';' and '#' (`;`, `;;`). After a section's last key both comment_out_block and
  // uncomment_block leave it as it is: uncommented, a lone ';' there would become a blank line, which commenting the
  // section back does not take (a blank line after the last key is the gap before the next section).
  static _is_bare(l) {
    if (l.kind !== 'comment') return false;
    const [a, b] = grammar.trim(l.body, l.comment, l.body.length);
    for (let i = a; i < b; i++) {
      if (!(l.body[i] === ';' || l.body[i] === '#')) return false;
    }
    return true;
  }

  // A live section put out of use whole: a ';' before the first character of each line from its header to its last
  // key line, and of the comment lines straight after it (down to a blank line or the next header), so the lines read
  // back as one commented-out section and uncomment_block gives them back byte for byte. A blank line inside becomes
  // ';', a comment ';;...'; a note (`; text`), and a comment of only ';' and '#' after the last key, are left as they
  // are. A commented-out section after it stays its own. Refused when a line of it is not `key = value`
  // (uncomment_block would leave it a comment). Returns the lines changed.
  comment_out_block(header_index, section_kind) {
    const l = (header_index >= 0 && header_index < this._lines.length) ? this._lines[header_index] : null;
    if (l === null || l.kind !== 'section') {
      throw new EditRefused('line ' + (header_index + 1) + ' is not a section header');
    }
    if (!section_kind(l.header_text())) {
      throw new EditRefused('the DLL does not take ' + l.header_text() + ' as a section, so it would not read back as ' +
                            'a commented-out one: comment its lines out one by one');
    }
    const s = this.section_at(header_index);
    let last = header_index;
    for (let i = s.first; i <= s.last; i++) {
      const k = this._lines[i].kind;
      if (k === 'key' || k === 'nokey') last = i;
    }
    const last_key = last;
    while (last + 1 <= s.last && this._lines[last + 1].kind === 'comment' &&
           this._commented_header(last + 1, section_kind) === null) {
      last += 1;
    }
    for (let i = header_index; i <= last; i++) {
      if (this._lines[i].kind === 'nokey') {
        throw new EditRefused('line ' + (i + 1) + ' is not key = value: fix or remove it first; nothing was changed');
      }
    }
    const old = this._lines.slice(header_index, last + 1);
    let n = 0;
    for (let i = header_index; i <= last; i++) {
      const li = this._lines[i];
      if (Document._is_note(li) || (i > last_key && Document._is_bare(li)) || (
          li.kind === 'comment' &&
          new LineView(i, li.body.slice(0, li.comment) + li.body.slice(li.comment + 1)).kind === 'nokey')) {
        continue;                   // left a comment by uncomment_block too, so the two stay exact
      }
      const b = li.body;
      const p = grammar.trim(b, 0, b.length)[0];
      this._replace_line(i, b.slice(0, p) + ';' + b.slice(p));
      n += 1;
    }
    const h = l.header_text();
    if (!this.commented_blocks(section_kind).some(x => x[0] === header_index && x[1] === last && x[2] === h)) {
      this._lines.splice(header_index, last + 1 - header_index, ...old);
      throw new EditRefused(h + ' would not read back as one commented-out section; nothing was changed');
    }
    return n;
  }

  // A commented-out section back in use: one ';' or '#' taken off each of its lines, except a note ('; text', a
  // space after the ';'), a line that uncommented would not be `key = value` (';----------', ';TODO check': the DLL
  // would log it as a bad line), and a comment of only ';' and '#' after the last line that becomes a key
  // (comment_out_block leaves it so too), which stay comments. Returns the lines changed.
  uncomment_block(header_index, section_kind) {
    const found = this.commented_blocks(section_kind).filter(blk => blk[0] === header_index);
    if (!found.length) {
      throw new EditRefused('line ' + (header_index + 1) + ' is not the header of a commented-out section');
    }
    const [a, b] = found[0];
    let last_key = a;
    for (let i = a + 1; i <= b; i++) {
      const l = this._lines[i];
      if (!Document._is_note(l) &&
          new LineView(i, l.body.slice(0, l.comment) + l.body.slice(l.comment + 1)).kind === 'key') {
        last_key = i;
      }
    }
    let n = 0;
    for (let i = a; i <= b; i++) {
      const l = this._lines[i];
      const body = l.body.slice(0, l.comment) + l.body.slice(l.comment + 1);
      if (Document._is_note(l) || (i > last_key && Document._is_bare(l)) || new LineView(i, body).kind === 'nokey') {
        continue;
      }
      this._replace_line(i, body);
      n += 1;
    }
    return n;
  }

  // The whole file replaced, byte for byte as given (line endings included).
  set_text(data) {
    data = latin1(data);
    this._lines = _split_raw(data).map((raw, i) => new LineView(i, raw));
  }

  // The line number (1-based) of the first line that holds a CR not followed by LF, or 0. The DLL reads such a CR as
  // a space; a browser's text box turns it into a line break, so the raw views cannot give it back.
  lone_cr_line() {
    for (const l of this._lines) {
      if (l.body.indexOf('\r') >= 0) return l.index + 1;
    }
    return 0;
  }

  // The lines first..last (0-based, inclusive; the whole file by default) replaced by `text` as a browser's text box
  // hands it back: every line break an LF, whatever the file had. `text` is the range's lines, each followed by an LF
  // (a missing LF after the last one is tolerated), so a range that ends with a blank line is given ending in two
  // LFs; a caller fills its text box with the range's raw text (CRLF turned to LF), never with the bodies joined by
  // LF, which would drop that blank line.
  //
  // Old and new lines are matched on their bodies (difflib, no autojunk). A matched line keeps its own ending; a
  // changed or new line takes the ending of the line above it (the file's majority when there is none). At the end of
  // the file, the last line has a newline when `text` ends with one, and none when it does not. So an unchanged text
  // gives the same bytes, and a CRLF file stays CRLF in every line the user did not touch. A trailing CR on a new line
  // is dropped (a text box never gives one back that was not typed).
  apply_edited_text(text, first, last) {
    if (first === undefined || first === null) first = 0;
    if (typeof text !== 'string') text = latin1(text);
    const n = this.lone_cr_line();
    if (n) {
      throw new EditRefused('line ' + n + ' holds a CR that is not followed by LF (the DLL reads it as a space); a ' +
                            'text box cannot give it back, so the raw text of this file is view only: edit it with ' +
                            'the form');
    }
    for (const ch of text) {
      if (ch.codePointAt(0) > 0xff) {
        throw new EditRefused(pyRepr(ch) + ' is not a character the .ini files can hold (one byte per character)');
      }
    }
    if (last === undefined || last === null) last = this._lines.length - 1;
    if (!(first >= 0 && first <= last + 1 && last + 1 <= this._lines.length)) {
      throw new EditRefused('lines ' + (first + 1) + ' to ' + (last + 1) + ' are not in the file');
    }
    const majority = this.majority_newline();
    const at_end = last === this._lines.length - 1;
    const typed_nl = text.endsWith('\n');
    let nw = text ? (typed_nl ? text.slice(0, -1) : text).split('\n') : [];
    nw = nw.map(b => (b.endsWith('\r') ? b.slice(0, -1) : b));
    const old = this._lines.slice(first, last + 1);
    const out = [];                 // [body, the old line's ending, or null for a changed or new line]
    const sm = new SequenceMatcher(null, old.map(l => l.body), nw, false);
    for (const [op, i1, i2, j1, j2] of sm.get_opcodes()) {
      if (op === 'equal') {
        for (const l of old.slice(i1, i2)) out.push([l.body, l.newline]);
      } else {
        for (const b of nw.slice(j1, j2)) out.push([b, null]);
      }
    }
    if (out.length && first > 0 && !this._lines[first - 1].newline) {
      // lines added after a last line that had no newline: it takes one
      const above = first >= 2 ? this._lines[first - 2].newline : '';
      this._replace_line(first - 1, this._lines[first - 1].body, above || majority);
    }
    let above = first > 0 ? this._lines[first - 1].newline : '';
    const lines = [];
    out.forEach(([body, nl0], k) => {
      let nl = nl0;
      if (at_end && k === out.length - 1) nl = typed_nl ? (nl || above || majority) : '';
      else if (!nl) nl = above || majority;
      lines.push(new LineView(first + k, body + nl));
      above = nl;
    });
    this._lines.splice(first, last + 1 - first, ...lines);
    this._reclassify();
  }

  // ---- the form's view ---------------------------------------------------------------------------------------------
  // The outline row of a key line put out of use (`;test_battle = 16`), or null for prose or an example in a comment
  // block. Inside a commented-out section the `;` may follow spaces (comment_out_block puts it there).
  _commented_key(i, in_block) {
    const l = this._lines[i];
    const b = l.body;
    const s = in_block ? l.comment : 0;
    if (b.length <= s + 1 || !inSet(b[s], ';#') || grammar.is_space(b[s + 1]) || inSet(b[s + 1], ';#')) return null;
    const probe = new LineView(i, b.slice(0, s) + b.slice(s + 1));
    if (probe.kind === 'key' && probe.key_text() && probe.key_text().indexOf(' ') < 0) {
      return { line: i + 1, key: probe.key_text(), value: probe.value_text(), kind: 'commented', comment: '' };
    }
    return null;
  }

  // Sections with their key lines, for the form and the API. With `section_kind` (the file's reader: header text ->
  // kind or null), each commented-out section is an entry of its own (commented: true, header its header
  // uncommented), right after the live section it sits in, and its lines are not that section's.
  outline(section_kind) {
    const blocks = section_kind ? this.commented_blocks(section_kind) : [];
    const owner = new Set();
    for (const [a, b] of blocks) {
      for (let i = a; i <= b; i++) owner.add(i);
    }
    const out = [];
    for (const s of this.sections()) {
      const h = s.header_index !== null ? this._lines[s.header_index] : null;
      if (h === null && s.last < s.first) continue;
      let keys = [];
      let last = h ? s.header_index : s.first - 1;
      for (let i = s.first; i <= s.last; i++) {
        if (owner.has(i)) continue;
        last = i;
        const l = this._lines[i];
        if (l.kind === 'key' || l.kind === 'nokey') {
          keys.push({ line: i + 1, key: l.key_text(), value: l.value_text(), kind: l.kind, comment: l.comment_text() });
        } else if (l.kind === 'comment') {
          const k = this._commented_key(i, false);
          if (k) keys.push(k);
        }
      }
      out.push({ header: h ? h.header_text() : null, line: h ? s.header_index + 1 : 0, first: s.first + 1,
                 last: last + 1, keys, commented: false });
      for (const [a, b, text] of blocks) {
        if (s.first <= a && a <= s.last) {
          keys = [];
          for (let i = a + 1; i <= b; i++) {
            const k = this._commented_key(i, true);
            if (k) keys.push(k);
          }
          out.push({ header: text, line: a + 1, first: a + 2, last: b + 1, keys, commented: true });
        }
      }
    }
    return out;
  }
}

// the first key with the highest count, in insertion order (Python's max over a dict)
function firstMax(m) {
  let best = null;
  let bestCount = -1;
  for (const [k, c] of m) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}
