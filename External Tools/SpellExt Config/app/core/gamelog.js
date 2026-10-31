// FF7_SpellExt.log (beside ff7_en.exe): the DLL's own verdict on the config files (port of sxcfg/gamelog.py).
// Every "<what> file line N: ..." line is mapped back to its file; the "... line(s) with problems" summaries are kept.
import fs from 'node:fs';
import { PY_SPACE_CLASS, pyJoin, pyIsfile, pySplitlines, pyLower, pyCmp } from './py.js';

export const LOG_NAME = 'FF7_SpellExt.log';

export const PREFIX_FILES = new Map([
  ['spell names', 'FF7_SpellExt_SpellNames.ini'],
  ['game', 'FF7_SpellExt_Game.ini'],
  ['shop', 'FF7_SpellExt_Shops.ini'],
  ['effects', 'FF7_SpellExt_Effects.ini'],
  ['spell', 'FF7_SpellExt_Spells.ini'],
  ['test spell', 'FF7_SpellExt_Spells_Test.ini'],
  ['fields', 'FF7_SpellExt_Fields.ini'],
  ['materia', 'FF7_SpellExt_Materia.ini'],
  ['weapon', 'FF7_SpellExt_Weapons.ini'],
  ['armour', 'FF7_SpellExt_Armour.ini'],
  ['accessory', 'FF7_SpellExt_Accessories.ini'],
  ['item', 'FF7_SpellExt_Items.ini'],
  ['character', 'FF7_SpellExt_Characters.ini'],
  ['limits', 'FF7_SpellExt_Limits.ini'],
]);

// Python's patterns: \s as Python's whitespace, . as "anything but \n" (the lines hold no \n), \d as [0-9] (no other
// decimal digit is a Latin-1 char)
const _LINE = new RegExp('^\\[' + PY_SPACE_CLASS + '*([0-9]+)\\]' + PY_SPACE_CLASS + '([^\\n]*)$');
const _FILE_LINE = /^(spell names|test spell|[a-z]+) file line ([0-9]+): ([^\n]*)$/;
const _SUMMARY = /^(spell names|[a-z]+) file: [^\n]*?([0-9]+) line\(s\) with problems/;
const _START = /^FF7 SpellExt loaded/;

export function find_log(game_dir) {
  if (!game_dir) return null;
  const p = pyJoin(game_dir, LOG_NAME);
  return pyIsfile(p) ? p : null;
}

// Returns {runs, entries: [{tick, file, line, message, text, log_line}], summaries: [...], lines, first_line, texts}.
// Only the last run of the game (the lines after the last start-up line) is reported as current.
export function parse(text, fields_file) {
  const lines = pySplitlines(text);
  let start = 0;
  let runs = 0;
  lines.forEach((l, i) => {
    const m = _LINE.exec(l);
    if (m && _START.test(m[2])) {
      start = i;
      runs += 1;
    }
  });
  const entries = [];
  const summaries = [];
  const texts = [];
  for (let i = start; i < lines.length; i++) {
    const m = _LINE.exec(lines[i]);
    if (!m) continue;
    const t = m[2];
    texts.push(t);
    const fm = _FILE_LINE.exec(t);
    if (fm && PREFIX_FILES.has(fm[1])) {
      let f = PREFIX_FILES.get(fm[1]);
      if (fm[1] === 'fields' && fields_file) f = fields_file;
      entries.push({ tick: parseInt(m[1], 10), file: f, line: parseInt(fm[2], 10), message: fm[3], text: t,
                     log_line: i + 1 });
      continue;
    }
    const sm = _SUMMARY.exec(t);
    if (sm && PREFIX_FILES.has(sm[1])) {
      summaries.push({ tick: parseInt(m[1], 10), file: PREFIX_FILES.get(sm[1]), problems: parseInt(sm[2], 10), text: t,
                       log_line: i + 1 });
    }
  }
  return { runs: Math.max(runs, lines.length ? 1 : 0), entries, summaries, lines: lines.length, first_line: start + 1,
           texts };
}

// Python's os.path.getmtime: seconds + nanoseconds * 1e-9, as a double
function getmtime(p) {
  const ns = fs.statSync(p, { bigint: true }).mtimeNs;
  return Number(ns / 1000000000n) + Number(ns % 1000000000n) * 1e-9;
}

export function read(game_dir, fields_file) {
  const p = find_log(game_dir);
  if (!p) return null;
  const text = fs.readFileSync(p).toString('latin1');
  const out = parse(text, fields_file);
  out.path = p;
  out.mtime = getmtime(p);
  return out;
}

function tupleCmp(a, b) {
  return pyCmp(a[0], b[0]) || (a[1] - b[1]) || pyCmp(a[2], b[2]);
}

function uniq(tuples) {
  const seen = new Map();
  for (const t of tuples) seen.set(JSON.stringify(t), t);
  return [...seen.values()];
}

// The validator's forecast against the log's verdict, per [file, line, text]. Returns three lists: agree, only_tool
// (the forecast says it, the log does not), only_log (the log says it, the forecast does not). The log is the truth; a
// disagreement is a tool bug or a line the tool does not forecast (runtime_only).
export function compare(validator_problems, log) {
  const said = new Set(log.texts || []);
  const tool = uniq(validator_problems.filter(p => p.kind !== 'tool').map(p => [pyLower(p.file), p.line, p.text]));
  const logset = uniq(log.entries.map(e => [pyLower(e.file), e.line, e.text]));
  const tool_texts = new Set(tool.map(t => t[2]));
  const agree = tool.filter(t => said.has(t[2])).sort(tupleCmp);
  const only_tool = tool.filter(t => !said.has(t[2])).sort(tupleCmp);
  const only_log = logset.filter(t => !tool_texts.has(t[2])).sort(tupleCmp);
  return [agree, only_tool, only_log];
}
