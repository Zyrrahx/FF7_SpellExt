// FF7_SpellExt.log (beside ff7_en.exe): the DLL's own verdict on the config files (port of sxcfg/gamelog.py).
// Every "<what> file line N: ..." line is mapped back to its file; the "... line(s) with problems" summaries are kept, and
// the forms' summary of the limits file ("forms: N section(s), N limit(s) name one, N problem(s)", finish_forms).
// The enemies registry's lines ("enemies: FF7_SpellExt_Enemies.ini line N: ...", en_registry_parse) are mapped to that
// file and its summary kept; the start-up scan's lines about the scene files ("enemies: scene NAME skipped: ...",
// enemies_scan) are mapped to the scene file they name, and its count line ("enemies: registered (...): N enemies ...")
// is kept as a summary and in 'scans'. A battle of a DLL scene that did not build (enemies_hand_over, enemies_load_scene,
// the battle menu's page) is mapped to the file and line its problem names (the scene's own file when it names none), and
// its problem text kept as 'match' (see gamelog.py). A bare scene name is resolved against the folder's listing when one
// is given: the user's scenes\NAME.ini when it is there, else scenes\generated\NAME.ini.
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
const _FORMS = /^forms: [0-9]+ section\(s\), [0-9]+ limit\(s\) name one, ([0-9]+) problem\(s\)/;
export const ENEMIES_FILE = 'FF7_SpellExt_Enemies.ini';
const _EN_LINE = /^enemies: FF7_SpellExt_Enemies\.ini line ([0-9]+): ([^\n]*)$/;
const _EN_SUMMARY = /^enemies: FF7_SpellExt_Enemies\.ini: enemies [^\n]*, ([0-9]+) problem line\(s\)$/;
const _EN_SCAN = /^enemies: registered \(([^)]*)\): ([0-9]+) enemies \([^\n]*?\), ([0-9]+) scenes \([^\n]*?\), ([0-9]+) file\(s\) skipped/;
const _EN_SCENE = /^enemies: (?:scene ([A-Za-z0-9_-]{1,31}) (?:skipped: ([^\n]*)|says number [^\n]*)|(scenes\\(?:generated\\)?[^\\]+) skipped: [^\n]*)$/;
const _EN_LABEL = /^((?:generated|scenes)\/[A-Za-z0-9_-]{1,31}\.ini) line ([0-9]+): /;
export const SCAN_FILES = 'scenes and enemies';       // the summaries' name for the scan's count line
// a battle of a DLL scene that did not build: its four lines (enemies_hand_over twice, enemies_load_scene, the battle menu)
const _EN_BATTLE = /^enemies: battle ([0-9]+) \(DLL scene ([0-9]+) '([^']*)', formation [0-9]+; [^\n]*?\) (?:refused|cannot be built): ([^\n]*?); (?:the game's own battle [0-9]+ \(scene [0-9]+, formation [0-9]+\) plays|its load plays the stand-in battle 0 \(scene 0:0\))$/;
const _EN_LOAD = /^enemies: battle ([0-9]+): ([^\n]*); the stand-in battle 0 \(scene 0:0\) plays$/;
const _BM_REFUSED = /^battle menu: battle ([0-9]+) \(DLL scene ([0-9]+), formation [0-9]+\) REFUSED: it does not build: ([^\n]*)$/;
// (minor 2 of review C1) a build problem with no file label that names its enemy: "enemy NAME: ...", an AI or model file
// "enemies\NAME\...", the AI's attack IDs "NAME/FILE: the AI uses ..."
const _EN_ENEMY = /^(?:enemy ([A-Za-z0-9_-]{1,31}): |enemies\\([A-Za-z0-9_-]{1,31})\\|([A-Za-z0-9_-]{1,31})\/[^ ]{1,63}: the AI uses )/;
const _EN_WHERE = /^((?:generated|scenes)\/[A-Za-z0-9_-]{1,31}\.ini|[A-Za-z0-9_-]{1,31}\/(?:enemy|generated)\.ini) line ([0-9]+): /;

export function find_log(game_dir) {
  if (!game_dir) return null;
  const p = pyJoin(game_dir, LOG_NAME);
  return pyIsfile(p) ? p : null;
}

// Returns {runs, entries: [{tick, file, line, message, text, log_line}], summaries: [...], lines, first_line, texts}.
// Only the last run of the game (the lines after the last start-up line) is reported as current. `listing`: the
// folder's relative paths ('/' between folders), to resolve a bare scene name (scene_file).
export function parse(text, fields_file, listing) {
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
  const scans = [];
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
      continue;
    }
    const fm2 = _FORMS.exec(t);
    if (fm2) {
      summaries.push({ tick: parseInt(m[1], 10), file: PREFIX_FILES.get('limits'), problems: parseInt(fm2[1], 10), text: t,
                       log_line: i + 1 });
      continue;
    }
    const bm = _BM_REFUSED.exec(t);
    if (bm) {
      const [f, n] = build_file(bm[3], null, listing);
      entries.push({ tick: parseInt(m[1], 10), file: f, line: n, message: t, text: t, log_line: i + 1, match: bm[3] });
      texts.push(bm[3]);
      continue;
    }
    if (!t.startsWith('enemies: ')) continue;
    const eb = _EN_BATTLE.exec(t);
    const el = eb ? null : _EN_LOAD.exec(t);
    if (eb || el) {
      const msg = eb ? eb[4] : el[2];
      // (minor 4 of review C1) '-' is the DLL's word for a scene it has no name for
      const [f, n] = build_file(msg, eb && eb[3] !== '-' ? eb[3] : null, listing);
      entries.push({ tick: parseInt(m[1], 10), file: f, line: n, message: t.slice('enemies: '.length), text: t, log_line: i + 1,
                     match: msg });
      texts.push(msg);
      continue;
    }
    let em = _EN_LINE.exec(t);
    if (em) {
      entries.push({ tick: parseInt(m[1], 10), file: ENEMIES_FILE, line: parseInt(em[1], 10), message: em[2], text: t,
                     log_line: i + 1 });
      continue;
    }
    em = _EN_SUMMARY.exec(t);
    if (em) {
      summaries.push({ tick: parseInt(m[1], 10), file: ENEMIES_FILE, problems: parseInt(em[1], 10), text: t, log_line: i + 1 });
      continue;
    }
    em = _EN_SCAN.exec(t);
    if (em) {
      summaries.push({ tick: parseInt(m[1], 10), file: SCAN_FILES, problems: parseInt(em[4], 10), text: t, log_line: i + 1 });
      scans.push({ why: em[1], enemies: parseInt(em[2], 10), scenes: parseInt(em[3], 10), skipped: parseInt(em[4], 10),
                   log_line: i + 1 });
      continue;
    }
    em = _EN_SCENE.exec(t);
    if (em) {
      const [f, n] = scene_file(em, listing);
      entries.push({ tick: parseInt(m[1], 10), file: f, line: n, message: t.slice('enemies: '.length), text: t,
                     log_line: i + 1 });
    }
  }
  return { runs: Math.max(runs, lines.length ? 1 : 0), entries, summaries, lines: lines.length, first_line: start + 1,
           texts, scans };
}

// The scene file (relative, '/' between folders) and line a scan line names: the label and line of its problem
// ("generated/NAME.ini line 4: ..."), else the scene's own file (line 0): resolve_scene's.
export function scene_file(em, listing) {
  if (em[3] !== undefined) return [em[3].replace(/\\/g, '/'), 0];
  const lm = _EN_LABEL.exec(em[2] !== undefined ? em[2] : '');
  if (lm) {
    const label = lm[1];
    return [label.startsWith('generated/') ? 'scenes/' + label : label, parseInt(lm[2], 10)];
  }
  return [resolve_scene(em[1], listing), 0];
}

function lowMap(listing) {
  const low = new Map();
  for (const p of listing) low.set(pyLower(p), p);
  return low;
}

// A bare scene name as a file of the listing: scenes/NAME.ini when it is there (without case), else
// scenes/generated/NAME.ini when that is; scenes/NAME.ini with no listing or neither.
export function resolve_scene(name, listing) {
  const user = 'scenes/' + name + '.ini';
  const gen = 'scenes/generated/' + name + '.ini';
  if (listing && listing.length) {
    const low = lowMap(listing);
    if (low.has(pyLower(user))) return low.get(pyLower(user));
    if (low.has(pyLower(gen))) return low.get(pyLower(gen));
  }
  return user;
}

// The file and line a build's problem names (its label: a scene file's or an enemy file's), else the scene's own file
// (line 0), else (no scene name: the battle menu's line) the Enemies file.
export function build_file(msg, name, listing) {
  const lm = _EN_WHERE.exec(msg);
  if (lm) {
    const label = lm[1];
    let f = label.startsWith('generated/') ? 'scenes/' + label : label.startsWith('scenes/') ? label : 'enemies/' + label;
    if (listing && listing.length) {
      const low = lowMap(listing);
      if (low.has(pyLower(f))) f = low.get(pyLower(f));
    }
    return [f, parseInt(lm[2], 10)];
  }
  const em = _EN_ENEMY.exec(msg);
  if (em && listing && listing.length) {
    const folder = em[1] || em[2] || em[3];
    const low = lowMap(listing);
    for (const f of ['enemy.ini', 'generated.ini']) {
      const k = pyLower('enemies/' + folder + '/' + f);
      if (low.has(k)) return [low.get(k), 0];
    }
  }
  if (name) return [resolve_scene(name, listing), 0];
  return [ENEMIES_FILE, 0];
}

// (minor 2 of review C1) A battle line whose problem the check forecasts too is filed where the check files it (the same
// file and line). `problems`: the check's lines.
export function refile(log, problems) {
  const by = new Map();
  for (const p of problems) if (p.match && p.kind === 'problem' && !by.has(p.match)) by.set(p.match, p);
  for (const e of log.entries) {
    const p = e.match ? by.get(e.match) : undefined;
    if (p !== undefined) {
      e.file = p.file;
      e.line = p.line;
    }
  }
  return log;
}

// Python's os.path.getmtime: seconds + nanoseconds * 1e-9, as a double
function getmtime(p) {
  const ns = fs.statSync(p, { bigint: true }).mtimeNs;
  return Number(ns / 1000000000n) + Number(ns % 1000000000n) * 1e-9;
}

export function read(game_dir, fields_file, listing) {
  const p = find_log(game_dir);
  if (!p) return null;
  const text = fs.readFileSync(p).toString('latin1');
  const out = parse(text, fields_file, listing);
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
  const tool = uniq(validator_problems.filter(p => p.kind !== 'tool').map(p => [pyLower(p.file), p.line, p.match || p.text]));
  const logset = uniq(log.entries.map(e => [pyLower(e.file), e.line, e.match || e.text]));
  const tool_texts = new Set(tool.map(t => t[2]));
  const agree = tool.filter(t => said.has(t[2])).sort(tupleCmp);
  const only_tool = tool.filter(t => !said.has(t[2])).sort(tupleCmp);
  const only_log = logset.filter(t => !tool_texts.has(t[2])).sort(tupleCmp);
  return [agree, only_tool, only_log];
}
