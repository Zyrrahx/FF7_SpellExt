// Key-level edits used by the CLI and the page: find a key in a section (or anywhere, in the flat game file), set
// it, add it, remove or comment it out, always as the smallest line change of document.js (port of sxcfg/edit.py).
import { Document, EditRefused, _split_raw, latin1 } from './document.js';
import { unified_diff } from './difflib.js';
import { pyLower, pyStrip } from './py.js';

export { Document, EditRefused };

// header: '[3000]' (compared trimmed and case-insensitively) or '-' / '' / null for the lines before the first
// header. Returns the Section or null.
export function find_section(doc, header) {
  for (const s of doc.sections()) {
    if (header === null || header === undefined || header === '' || header === '-') {
      if (s.header_index === null) return s;
      continue;
    }
    if (s.header_index !== null && pyLower(doc.lines[s.header_index].header_text()) === pyLower(pyStrip(header))) {
      return s;
    }
  }
  return null;
}

export function key_lines(doc, header, key, flat) {
  if (flat) {
    const k = pyLower(key);
    return doc.lines.filter(l => l.kind === 'key' && pyLower(l.key_text()) === k);
  }
  const s = find_section(doc, header);
  return s ? doc.find_key(s, key) : [];
}

// The value the DLL reads: the last line in the flat game file (a later line wins); otherwise every line, in file
// order (what a reader does with a repeat is its own: the validator says).
export function get(doc, header, key, flat) {
  const ls = key_lines(doc, header, key, flat);
  if (!ls.length) return null;
  return ls.map(l => l.value_text());
}

// Set an existing key (its last line when repeated) or add it. Returns the 0-based index of the line.
export function set_key(doc, header, key, value, flat) {
  const ls = key_lines(doc, header, key, flat);
  if (ls.length) {
    const last = ls[ls.length - 1];
    doc.set_value(last.index, value);
    return last.index;
  }
  let s;
  if (flat) {
    const secs = doc.sections();
    // after the last key line of the file (the game file is flat: any place is read the same)
    let target = null;
    for (const x of secs) {
      if (doc.key_lines(x).length) target = x;
    }
    s = target || secs[0];
  } else {
    s = find_section(doc, header);
    if (s === null) throw new EditRefused('no section ' + header + ' in the file');
  }
  return doc.add_key(s, key, value);
}

export function remove_key(doc, header, key, flat, comment) {
  const ls = key_lines(doc, header, key, flat);
  if (!ls.length) throw new EditRefused('no key ' + key + ' there');
  for (const l of ls.slice().reverse()) {
    if (comment) doc.comment_out(l.index);
    else doc.remove_line(l.index);
  }
  return ls.length;
}

// A unified diff of two versions, lines shown with their line endings visible (\r as <CR>).
export function line_diff(old_bytes, new_bytes) {
  const a = _split_raw(latin1(old_bytes));
  const b = _split_raw(latin1(new_bytes));
  const vis = ls => ls.map(l => (l.endsWith('\r\n') ? l.replace('\r\n', '<CR>\n')
    : (l.endsWith('\n') ? l : l + '<no newline>\n')));
  return unified_diff(vis(a), vis(b), 'before', 'after', '', '', 1).join('');
}
