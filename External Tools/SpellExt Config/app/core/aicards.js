// The port of sxcfg/aicards.py: the AI page's section cards. An ai_tool text as its entries, each entry as the 16
// sections of the game's AI in plain words, with the script of each. The text is the truth: the model keeps every
// line, so cards -> text gives back the same text, and an edit changes only the script it is about.
// Node 22 language level.
import * as t from './aitool.js';
import * as validate from './validate.js';
import * as grammar from './grammar.js';
import * as ch from './rules/characters.js';
import { pyLower, pyInt, pyCmp, PyIndexError, PyTypeError } from './py.js';

export const SECTIONS = ['init', 'main', 'counter', 'death', 'physical', 'magical', 'battle_end', 'pre_action',
  'custom1', 'custom2', 'custom3', 'custom4', 'custom5', 'custom6', 'custom7', 'custom8'];
export const PLAIN = [
  ['Battle start', 'runs once, when the battle starts'],
  ['My turn', 'runs on the character\'s turn ONLY while it is AI-controlled (flag 0x10, bit 4024)'],
  ['Counter', 'runs after every action, for each target'],
  ['Death', 'runs when the character dies'],
  ['Counter to physical', 'runs when the character is hit by a physical attack'],
  ['Counter to magic', 'runs when the character is hit by magic'],
  ['Battle end', 'runs at the end of the battle, for every live actor'],
  ['Before any action', 'runs before every action in the battle, anyone\'s'],
];
for (let k = 1; k < 9; k++) PLAIN.push(['Custom ' + k, 'runs when an action with command 22 runs this section on the actors it targets']);
export const GAME_NAMES = ['Cloud', 'Barret', 'Tifa', 'Aerith', 'Red XIII', 'Yuffie', 'Cait Sith', 'Vincent', 'Cid',
  'Young Cloud', 'Sephiroth'];
export const NEW_SCRIPT_BODY = ['        end', ''];

const KEYWORDS = ['table', 'entry', 'script', 'bytes', 'fill'];

function _keyword(line) {
  let toks;
  try {
    toks = t.tokenize(line);
  } catch (e) {
    return [null, []];
  }
  while (toks.length && toks[0].endsWith(':') && !toks[0].startsWith('"') && toks[0].slice(0, -1).indexOf(':') < 0) toks.shift();
  if (!toks.length) return [null, []];
  const kw = pyLower(toks[0]);
  return [KEYWORDS.indexOf(kw) >= 0 ? kw : null, toks];
}

// [entry, section] a `script` token names, or null (ai_tool's parse_sec)
function _section_of(tok, cur) {
  try {
    return t.parse_sec(tok, cur, '');
  } catch (e) {
    return null;
  }
}

const same_es = (a, b) => a !== null && b !== null && String(a[0]) === String(b[0]) && a[1] === b[1];
const has_es = (list, es) => list.some(x => same_es(x, es));

// {lines_end, preamble: [lines], entries: [{head, indices, items: [item], lead}]}
// item: {type: 'script', head, sections: [[entry, section]], body: [lines]} or {type: 'raw', lines}
export function parse(text) {
  const ends = text.endsWith('\n');
  let lines = text.split('\n');
  if (ends) lines = lines.slice(0, -1);
  const model = { lines_end: ends, preamble: [], entries: [] };
  let cur_entry = null;
  let cur_item = null;
  for (const line of lines) {
    const [kw, toks] = _keyword(line);
    if (kw === 'entry') {
      let idx;
      try {
        idx = toks.slice(1).map(x => pyInt(x, 10));
      } catch (e) {
        if (e.name !== 'ValueError') throw e;
        idx = [];
      }
      cur_entry = { head: line, indices: idx, items: [], lead: [] };
      model.entries.push(cur_entry);
      cur_item = null;
      continue;
    }
    if (cur_entry === null) {
      model.preamble.push(line);
      continue;
    }
    if (kw === 'script') {
      const cur = cur_entry.indices.length ? cur_entry.indices[0] : null;
      const secs = toks.slice(1).map(x => _section_of(x, cur));
      cur_item = { type: 'script', head: line, sections: secs.filter(x => x), body: [] };
      cur_entry.items.push(cur_item);
      continue;
    }
    if (kw === 'bytes' || kw === 'fill') {
      cur_item = { type: 'raw', lines: [line] };
      cur_entry.items.push(cur_item);
      continue;
    }
    if (cur_item === null) cur_entry.lead.push(line);          // comments or blank lines straight after the entry line
    else if (cur_item.type === 'script') cur_item.body.push(line);
    else cur_item.lines.push(line);
  }
  return model;
}

export function serialize(model) {
  let out = model.preamble.slice();
  for (const e of model.entries) {
    out.push(e.head);
    out = out.concat(e.lead);
    for (const it of e.items) {
      if (it.type === 'script') {
        out.push(it.head);
        out = out.concat(it.body);
      } else {
        out = out.concat(it.lines);
      }
    }
  }
  return out.join('\n') + (model.lines_end ? '\n' : '');
}

// for each item, its first and last line (1-based) in the serialized text: [[entry index, item index, a, b]]
export function line_map(model) {
  let n = model.preamble.length;
  const out = [];
  model.entries.forEach((e, ei) => {
    n += 1 + e.lead.length;
    e.items.forEach((it, ii) => {
      const size = it.type === 'script' ? 1 + it.body.length : it.lines.length;
      out.push([ei, ii, n + 1, n + size]);
      n += size;
    });
  });
  return out;
}

// The page's view: per entry, 16 cards; problems ({line, text}) placed on the card whose script holds the line, or
// by the check's "entry E NAME" wording.
export function cards(model, problems) {
  problems = problems || [];
  const where = new Map();
  for (const [ei, ii, a, b] of line_map(model)) where.set(ei + ',' + ii, [a, b]);
  const out = [];
  model.entries.forEach((e, ei) => {
    const cur = e.indices.length ? e.indices[0] : null;
    const cs = [];
    for (let sec = 0; sec < 16; sec++) {
      let item_i = null;
      for (let ii = 0; ii < e.items.length; ii++) {
        const it = e.items[ii];
        if (it.type === 'script' && has_es(it.sections, [cur, sec])) {
          item_i = ii;
          break;
        }
      }
      const card = { section: sec, name: SECTIONS[sec], title: PLAIN[sec][0], note: PLAIN[sec][1], item: item_i };
      if (item_i !== null) {
        const it = e.items[item_i];
        card.body = it.body.join('\n');
        card.shared_with = it.sections.filter(([en, s]) => String(en) === String(cur) && s !== sec).map(([, s]) => SECTIONS[s]);
        const [a, b] = where.get(ei + ',' + item_i);
        card.lines = [a, b];
        card.problems = problems.filter(p => p.line && a <= p.line && p.line <= b);
        const word = 'entry ' + (cur === null ? 'None' : String(cur)) + ' ' + SECTIONS[sec] + ' ';
        card.problems = card.problems.concat(problems.filter(p => !p.line && (p.text + ' ').indexOf(word) >= 0));
      }
      cs.push(card);
    }
    out.push({ head: e.head, indices: e.indices, cards: cs,
               raw_items: e.items.filter(it => it.type === 'raw').length,
               other_entry_scripts: e.items.filter(it => it.type === 'script' && it.sections.some(([en]) => String(en) !== String(cur))).length });
  });
  return out;
}

export class CardRefused extends Error {
  constructor(message) { super(message); this.name = 'CardRefused'; }
}

// Python's list index: a negative index counts from the end; past either end, IndexError
function at(list, i) {
  if (typeof i !== 'number' || !Number.isInteger(i)) {
    throw new PyTypeError('list indices must be integers or slices, not ' + (i === null ? 'NoneType' : typeof i));
  }
  const k = i < 0 ? i + list.length : i;
  if (k < 0 || k >= list.length) throw new PyIndexError('list index out of range');
  return [list[k], k];
}

export function set_body(model, ei, ii, body) {
  const [it] = at(at(model.entries, ei)[0].items, ii);
  if (it.type !== 'script') throw new CardRefused('not a script');
  const lines = body.split('\r\n').join('\n').split('\n');
  for (const l of lines) {
    const [kw] = _keyword(l);
    if (kw) throw new CardRefused('a card holds one script: "' + kw + '" starts something else (use the Raw tab)');
  }
  if (!lines.length || lines[lines.length - 1] !== '') lines.push('');     // keep a blank line between scripts
  it.body = lines;
}

// The app's own (not in the reference): set_body's refusal for a text that starts something else, for the text box
// that puts a script back through apply_edited_text (its line endings kept)
export function body_refusal(body) {
  for (const l of body.split('\r\n').join('\n').split('\n')) {
    const [kw] = _keyword(l);
    if (kw) return 'a card holds one script: "' + kw + '" starts something else (use the Raw tab)';
  }
  return null;
}

export function add_section(model, ei, sec) {
  const [e] = at(model.entries, ei);
  const [cur] = at(e.indices, 0);
  for (const it of e.items) {
    if (it.type === 'script' && has_es(it.sections, [cur, sec])) throw new CardRefused(at(SECTIONS, sec)[0] + ' already has a script');
  }
  e.items.push({ type: 'script', head: 'script ' + at(SECTIONS, sec)[0], sections: [[cur, sec]], body: NEW_SCRIPT_BODY.slice() });
}

export function remove_section(model, ei, sec) {
  const [e] = at(model.entries, ei);
  const [cur] = at(e.indices, 0);
  for (let ii = 0; ii < e.items.length; ii++) {
    const it = e.items[ii];
    if (it.type === 'script' && has_es(it.sections, [cur, sec])) {
      if (it.sections.length === 1) {
        e.items.splice(ii, 1);
      } else {
        // a shared script: only this section's name leaves the script line
        const head = it.head;
        const cpos = head.indexOf(';');
        const [code, comment] = cpos < 0 ? [head, ''] : [head.slice(0, cpos), head.slice(cpos)];
        const toks = t.tokenize(code);
        const keep = toks.slice(1).filter(x => !same_es(_section_of(x, cur), [cur, sec]));
        it.head = [toks[0]].concat(keep).join(' ') + (comment ? '    ' + comment : '');
        it.sections = it.sections.filter(x => !same_es(x, [cur, sec]));
      }
      return;
    }
  }
  throw new CardRefused(at(SECTIONS, sec)[0] + ' has no script');
}

// asm in memory and the DLL's block rules: {ok, size, problems: [{line, text}]}
export function check(text) {
  const r = t.assemble_check(text);
  delete r.bytes;
  return r;
}

export function assemble(text) {
  return t.assemble(text);
}

// ---- the Characters file's AI keys ---------------------------------------------------------------------------------
// Every character the Characters file defines, with its AI as the DLL will take it (own line, or inherited through
// copy_of), from the characters port. `ai_names`: the names of the files in ai\ (for "missing").
export function character_ai(characters_text, ai_names) {
  const shared = new Map();
  const r = new validate.Reading('FF7_SpellExt_Characters.ini', characters_text, shared);
  ch.check(r);
  const chars = shared.has('characters') ? shared.get('characters') : new Map();
  // each section's own ai lines (in file order), with the header's line
  const s = characters_text;
  const own = new Map();
  let cur = null;
  for (const ln of grammar.lines(s)) {
    if (ln.start === ln.stop) continue;
    if (s[ln.start] === '[') {
      const [ok, p, n] = grammar.parse_number(s, ln.start + 1, ln.stop);
      cur = ok && p + 1 === ln.stop && s[p] === ']' ? n : null;
      if (cur !== null && !own.has(cur)) own.set(cur, { header_line: ln.number, lines: [] });
      else if (cur !== null) cur = null;                   // a repeated section: the DLL refuses it
      continue;
    }
    if (cur === null) continue;
    const [ks, ke, vs, ve, has] = grammar.split_key(s, ln.start, ln.stop);
    const k = pyLower(s.slice(ks, ke));
    if (has && (k === 'ai_like' || k === 'ai')) own.get(cur).lines.push({ line: ln.number, key: k, value: s.slice(vs, ve) });
  }
  const out = [];
  const names = new Set(ai_names.map(n => pyLower(n)));
  const ids = [...chars.keys()].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : pyCmp(String(a), String(b))));
  for (const ident of ids) {
    const c = chars.get(ident);
    const get = k => (c instanceof Map ? c.get(k) : c[k]);
    let eff;
    if (get('ai_like')) {
      const e = get('ai_like') - 1;
      eff = { key: 'ai_like', value: e < 11 ? ch.AI_NAMES[e] : String(e), entry: e, game_name: e < 11 ? GAME_NAMES[e] : 'entry ' + e };
    } else if (get('ai_file')) {
      eff = { key: 'ai', value: get('ai_file'), missing: !names.has(pyLower(get('ai_file'))) };
    } else {
      eff = null;
    }
    const o = own.has(ident) ? own.get(ident) : { header_line: get('line'), lines: [] };
    out.push({ id: ident, name: get('name'), header_line: o.header_line, own: o.lines, copy_of: get('copy_of'),
               inherited: Boolean(eff) && !o.lines.length && get('copy_of') !== null && get('copy_of') !== undefined,
               effective: eff });
  }
  return out;
}
