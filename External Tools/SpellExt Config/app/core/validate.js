// The DLL-equivalent validator: the framework the per-file ports in rules/ plug into (port of sxcfg/validate.py).
//
// Each port mirrors one reader of spellext.c and reports what the DLL would write to FF7_SpellExt.log, with the DLL's
// own format strings (verbatim, C printf syntax) through Reading.log(). Nothing here reads the game's data: what
// depends on the kernel or the exe at run time is not forecast (the Game log page shows the DLL's verdict).
//
// Python imports sxcfg.rules lazily inside these functions; an ES module cannot, so a caller that checks files
// imports './rules/index.js' once (it registers every port here, in the DLL's order).
import { cfmt } from './cfmt.js';
import { pyCmp, pyLower, pyRepr } from './py.js';

export { cfmt };

// Python's AssertionError: a format the schema does not list, under strict_messages (the tests)
export class AssertionError extends Error {
  constructor(message) { super(message); this.name = 'AssertionError'; }
}

// One line the DLL would log. `line` is the line of `file` it is about (0: the file as a whole); `fmt` the DLL's
// format string; `text` the line as the log would show it (without the time stamp).
export class Problem {
  constructor(file, line, fmt, text, kind) {
    this.file = file;
    this.line = line;
    this.fmt = fmt;
    this.text = text;
    this.kind = kind === undefined ? 'problem' : kind;
  }

  as_dict() {
    return { file: this.file, line: this.line, text: this.text, kind: this.kind, fmt: this.fmt };
  }
}

// One reading of one file, as one reader of the DLL makes it.
// `text`: the file's content (Latin-1 string). `shared`: a Map that lives for one check of the whole folder, for what
// a reader looks up from a file read earlier in the same kernel load (the DLL's own order).
export class Reading {
  constructor(file, text, shared, strict_messages) {
    this.file = file;
    this.text = text;
    this.shared = shared !== undefined && shared !== null ? shared : new Map();
    this.problems = [];
    this.strict_messages = strict_messages === undefined ? null : strict_messages;   // a Set of allowed formats (tests)
  }

  // log_line(fmt, args...) of the DLL, about `line` of this file
  log(line, fmt, ...args) {
    this.log_with({}, line, fmt, ...args);
  }

  // Python's log(..., kind=, file=): opts {kind, file}; `file` for the spell reader's test file, which it reads as
  // one text with the spell file
  log_with(opts, line, fmt, ...args) {
    if (this.strict_messages !== null && !this.strict_messages.has(fmt)) {
      throw new AssertionError('message not in the schema: ' + pyRepr(fmt));
    }
    this.problems.push(new Problem(opts.file || this.file, line, fmt, cfmt(fmt, ...args),
                                   opts.kind === undefined ? 'problem' : opts.kind));
  }

  // Something the tool says that the DLL would not log (marked as the tool's, never as the DLL's).
  note(line, text) {
    this.problems.push(new Problem(this.file, line, null, text, 'tool'));
  }
}

// file name (lower case) -> port function; filled by rules/index.js
export const READERS = new Map();
// file name (lower case) -> section_kind(header_text) -> kind name (a kind of the schema) or null (the DLL refuses it)
export const SECTION_KINDS = new Map();
// the order the DLL reads them in at a kernel load (what a later reader may look up from an earlier one)
export const ORDER = [];

// A port registers check(reading) for a file name, and how it names a section header's kind.
export function register(file_name, check, order, section_kind) {
  if (order === undefined) order = 100;
  READERS.set(pyLower(file_name), check);
  if (section_kind !== undefined && section_kind !== null) SECTION_KINDS.set(pyLower(file_name), section_kind);
  ORDER.push([order, file_name]);
  ORDER.sort((a, b) => (a[0] - b[0]) || pyCmp(a[1], b[1]));
}

export function section_kind(file_name, header) {
  const fn = SECTION_KINDS.get(pyLower(file_name));
  return fn ? fn(header) : null;
}

export function check_text(file_name, text, shared, strict_messages) {
  const r = new Reading(file_name, text, shared, strict_messages);
  const fn = READERS.get(pyLower(file_name));
  if (fn === undefined) return null;
  fn(r);
  return r.problems;
}

// texts: Map {file name: text}. Runs every known reader in the DLL's order with one shared state.
// Returns Map {file name: [Problem]} for the files that have a reader. `shared`: a Map to hold the shared state (what
// the readers leave for each other), for a caller that reads it afterwards (templates.js).
export function check_folder(texts, strict_messages, shared) {
  if (shared === undefined || shared === null) shared = new Map();
  shared.set('texts', texts);
  const out = new Map();
  const lower = new Map();
  for (const k of texts.keys()) lower.set(pyLower(k), k);
  for (const [, name] of ORDER) {
    const real = lower.get(pyLower(name));
    const fn = READERS.get(pyLower(name));
    const r = new Reading(real !== undefined ? real : name, real !== undefined ? texts.get(real) : null, shared,
                          strict_messages);
    if (r.text === null || r.text === undefined) {
      if (fn.wants_absent) {
        r.text = null;
        fn(r);
        if (r.problems.length) out.set(name, r.problems);
      }
      continue;
    }
    fn(r);
    out.set(real, r.problems);
  }
  return out;
}
