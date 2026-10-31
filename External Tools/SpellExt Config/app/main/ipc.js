// The one IPC channel 'sx' (design 1.2, 1.3): the route table, the body validators, the error mapping, and the
// routes themselves, ported from sxcfg/server.py (App.state, reader_of, file_view, problems_for, the edit ops, the
// ai/ai_like refusal). Plain functions and one class (no Electron import): main.js wires it to ipcMain and hands in
// the dialogs, so the whole table runs under /usr/bin/node for the tests.
//
// Every answer is one of {ok: result} | {refused: message} | {bug: message, stack}. The page never sends a path to a
// folder: it sends a token the main process made (a dialog's answer, a drop, a recent entry).
import fs from 'node:fs';
import nodePath from 'node:path';
import crypto from 'node:crypto';
import * as discover from '../core/discover.js';
import * as edit from '../core/edit.js';
import * as grammar from '../core/grammar.js';
import * as gamelog from '../core/gamelog.js';
import * as safety from '../core/safety.js';
import * as slots from '../core/slots.js';
import * as T from '../core/templates.js';
import * as validate from '../core/validate.js';
import * as aitool from '../core/aitool.js';
import * as aicards from '../core/aicards.js';
import * as aiexplain from '../core/aiexplain.js';
import * as ailibrary from '../core/ailibrary.js';
import * as kernels from '../core/kernels.js';
import * as chars from '../core/rules/characters.js';
import { EditRefused, Document } from '../core/document.js';
import { Schema, RESTART_TEXT } from '../core/schema.js';
import { Workspace } from '../core/workspace.js';
import { pyStrip, pyLstrip, pyLower } from '../core/py.js';
import { gate, split_rel, resolve_in, check_write, backups_dir, config_dir_of, backup_path, inside, PathRefused, ORIGIN } from './paths.js';
export { ORIGIN };
import { save_files, write_file } from './save.js';

export const MAX_TEXT = 32 * 1024 * 1024;     // the raw tab
const MAX_SMALL = 65536;                      // every other string
const MAX_LINE = 100000000;

// ---- validation ----------------------------------------------------------------------------------------------------
export class BadRequest extends Error {
  constructor(message) { super(message); this.name = 'BadRequest'; }
}

const str = (max, req) => ({ t: 'str', max: max || MAX_SMALL, req: !!req });
const int = (min, max, req) => ({ t: 'int', min, max, req: !!req });
const bool = () => ({ t: 'bool' });
const token = (req) => ({ t: 'token', req: !!req });
const LINE = int(1, MAX_LINE, true);          // a 1-based line number: below 1 refused (Python counts -1 from the end)
const LINE_OPT = int(1, MAX_LINE, false);

function plain_object(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function check_field(name, spec, v) {
  switch (spec.t) {
    case 'str':
      if (typeof v !== 'string') throw new BadRequest(name + ' must be text');
      if (v.length > spec.max) throw new BadRequest(name + ' longer than ' + spec.max + ' characters');
      return;
    case 'int':
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new BadRequest(name + ' must be a whole number');
      if (v < spec.min || v > spec.max) throw new BadRequest(name + ' must be ' + spec.min + ' to ' + spec.max + ' (got ' + v + ')');
      return;
    case 'bool':
      if (typeof v !== 'boolean') throw new BadRequest(name + ' must be true or false');
      return;
    case 'token':
      if (typeof v !== 'string' || !/^[0-9a-f]{32}$/.test(v)) throw new BadRequest(name + ' is not a folder token');
      return;
    case 'enum':
      if (spec.of.indexOf(v) < 0) throw new BadRequest(name + ' must be one of ' + spec.of.join(', '));
      return;
    case 'bytes8':
      if (!Array.isArray(v) || v.length !== 8 || v.some(x => !Number.isInteger(x) || x < 0 || x > 255)) {
        throw new BadRequest(name + ' must be eight whole numbers 0 to 255');
      }
      return;
    case 'pairs':
      if (!Array.isArray(v) || v.length > 1000 ||
          v.some(p => !Array.isArray(p) || p.length !== 2 || p.some(x => typeof x !== 'string' || x.length > MAX_SMALL))) {
        throw new BadRequest(name + ' must be a list of [key, value] texts');
      }
      return;
    case 'strs':
      if (!Array.isArray(v) || v.length > 10000 || v.some(x => typeof x !== 'string' || x.length > MAX_SMALL)) {
        throw new BadRequest(name + ' must be a list of texts');
      }
      return;
    case 'obj':
      check_shape(spec.shape, v, name + '.');
      return;
    case 'values':          // a template's values: {NAME: text}
      if (!plain_object(v) || Object.keys(v).length > 1000 ||
          Object.entries(v).some(([k, x]) => !/^[A-Z][A-Z0-9_]*$/.test(k) || k.length > 64 || typeof x !== 'string' || x.length > MAX_SMALL)) {
        throw new BadRequest(name + ' must be {NAME: text} (capitals, digits and _)');
      }
      return;
    case 'positions':       // where each part of a template goes: text or null per part
      if (!Array.isArray(v) || v.length > 100 || v.some(x => x !== null && (typeof x !== 'string' || x.length > 4096))) {
        throw new BadRequest(name + ' must be a list of positions (text or null)');
      }
      return;
    case 'lines':           // 1-based line numbers
      if (!Array.isArray(v) || v.length > 200000 || v.some(x => !Number.isInteger(x) || x < 1 || x > MAX_LINE)) {
        throw new BadRequest(name + ' must be a list of line numbers');
      }
      return;
    case 'rvalues':         // a recipe's values: {name: text, number, true/false or null}
      if (!plain_object(v) || Object.keys(v).length > 100 ||
          Object.entries(v).some(([k, x]) => !/^[a-z0-9_]{1,32}$/.test(k) ||
            !(x === null || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x)) ||
              (typeof x === 'string' && x.length <= MAX_SMALL)))) {
        throw new BadRequest(name + ' must be {name: text, number, true/false or null}');
      }
      return;
    case 'rect':
      if (!plain_object(v)) throw new BadRequest(name + ' must be {x, y, width, height}');
      for (const k of Object.keys(v)) {
        if (['x', 'y', 'width', 'height'].indexOf(k) < 0) throw new BadRequest('unknown field ' + name + '.' + k);
        if (!Number.isInteger(v[k]) || v[k] < -100000 || v[k] > 100000) throw new BadRequest(name + '.' + k + ' must be a whole number');
      }
      return;
    default:
      throw new BadRequest('no rule for ' + name);
  }
}

// Throws BadRequest unless `body` is an object holding only the shape's fields, each of its type; required fields
// present. `undefined` stands for no body and is an empty object.
export function check_shape(shape, body, prefix) {
  const p = prefix || '';
  if (body === undefined || body === null) body = {};
  if (!plain_object(body)) throw new BadRequest('the body must be an object');
  for (const k of Object.keys(body)) {
    if (!Object.prototype.hasOwnProperty.call(shape, k)) throw new BadRequest('unknown field ' + p + k);
  }
  for (const [k, spec] of Object.entries(shape)) {
    if (body[k] === undefined) {
      if (spec.req) throw new BadRequest('missing field ' + p + k);
      continue;
    }
    if (body[k] === null && !spec.req && spec.t !== 'obj') continue;
    check_field(p + k, spec, body[k]);
  }
  return body;
}

// file.edit: the fields each op takes (design 1.3), on top of path and op
const OPS = {
  set: { line: LINE, value: str(MAX_SMALL, true) },
  remove: { line: LINE },
  comment: { line: LINE },
  uncomment: { line: LINE },
  add_key: { section_line: LINE_OPT, key: str(1024, true), value: str(MAX_SMALL, true) },
  set_key: { header: str(4096), key: str(1024, true), value: str(MAX_SMALL, true) },
  remove_key: { header: str(4096), key: str(1024, true), comment: bool() },
  set_slots: { section_line: LINE, slots: { t: 'bytes8', req: true } },
  add_section: { header: str(4096, true), keys: { t: 'pairs' } },
  remove_section: { section_line: LINE, with_limits: bool() },
  comment_block: { section_line: LINE },
  uncomment_block: { section_line: LINE },
};
export const EDIT_OPS = Object.freeze(Object.keys(OPS));

function check_edit(body) {
  if (!plain_object(body)) throw new BadRequest('the body must be an object');
  if (EDIT_OPS.indexOf(body.op) < 0) throw new BadRequest('op must be one of ' + EDIT_OPS.join(', '));
  return check_shape(Object.assign({ path: str(1024, true), op: str(32, true) }, OPS[body.op]), body);
}

const PATH = { path: str(1024, true) };
const SETTINGS_SET = { confirm_save: bool(), live_auto: bool(), open_last: bool(), window: { t: 'rect' } };

// The routes of design 1.3 that this build answers, and the ones that come with a later stage (refused with the
// stage's name). The preload's allowlist is this list.
const LATER = {};
const AI_NAME = str(64, true);                // the core refuses what is not [A-Za-z0-9_-]{1,32}
// a staged AI file's name (design 1.4 rule 2, 4.10): the characters port's `ai` rule, 1 to 31
const STAGE_NAME = /^[A-Za-z0-9_-]{1,31}$/;
const KID = str(4096);
const CARD_OPS = ['set_body', 'add', 'remove', 'apply_text'];
const SMALL_INT = int(-100000, 100000, false);
const TPL_ID = str(64, true);
const TPL_RUN = { id: TPL_ID, values: { t: 'values' }, positions: { t: 'positions' } };

export const SHAPES = {
  'app.state': {},
  'app.pick_folder': { discard: bool() },
  'app.pick_game_folder': {},
  'app.open_folder': { token: token(true), game: token(), mods: token(), discard: bool() },
  'app.close_folder': { discard: bool() },
  'app.recent': {},
  'app.settings': { set: { t: 'obj', shape: SETTINGS_SET } },
  'app.show_backup': { path: str(4096, true) },
  'schema.get': {},
  'file.open': PATH,
  'file.diff': PATH,
  'file.raw': { path: str(1024, true), text: str(MAX_TEXT, true) },
  'file.edit': null,                                   // per op: check_edit
  'file.apply_text': { path: str(1024, true), first: LINE, last: int(0, MAX_LINE, true), text: str(MAX_TEXT, true) },
  'file.save': { path: str(1024, true), overwrite: bool() },
  'file.save_all': { overwrite: { t: 'strs' } },
  'file.reload': PATH,
  'check.run': {},
  'log.read': {},
  'lib.list': {},
  'lib.suggest': { id: TPL_ID, values: { t: 'values' } },
  'lib.preview': TPL_RUN,
  'lib.insert': Object.assign({ allow_warnings: bool() }, TPL_RUN),
  'lib.capture': { path: str(1024, true), section_line: LINE, keys: { t: 'lines' }, include: { t: 'lines' },
                   id: str(64), title: str(1024) },
  'lib.save_user': { text: str(1024 * 1024, true), replace: bool() },
  'lib.remove_user': { id: TPL_ID },
  'lib.import': {},
  'lib.export': { id: TPL_ID },
  // the AI page (stage S6; sxcfg/server.py's /api/ai/*)
  'ai.list': {},
  'ai.open': { name: AI_NAME },
  'ai.overview': {},
  'ai.library': {},
  'ai.check': { text: str(MAX_TEXT, true) },
  'ai.save': { name: AI_NAME, text: str(MAX_TEXT, true), force: bool() },
  'ai.from_kernel': { kernel_id: KID, character: str(64, true) },
  'ai.kernel_choose': { id: KID, path: str(4096) },
  'ai.kernel_pick': {},
  'ai.cards': { text: str(MAX_TEXT, true) },
  'ai.card_edit': { text: str(MAX_TEXT, true), op: { t: 'enum', of: CARD_OPS, req: true }, entry: SMALL_INT, item: SMALL_INT,
                    section: SMALL_INT, body: str(MAX_TEXT) },
  'ai.recipe': { id: str(64, true), values: { t: 'rvalues' }, uid: str(64), as_section: bool() },
  'ai.explain': { body: str(MAX_TEXT), section: str(64), kernel_id: KID },
  'ai.set_character': { section_line: LINE, key: { t: 'enum', of: ['ai', 'ai_like'] }, value: str(1024) },
  // the Live tables page (stage S6; sxcfg/liveapi.py): answered by the reader's worker thread (livehost.js)
  'live.status': {},
  'live.tables': {},
  'live.table': { id: str(256), from: str(64), count: str(64), raw: str(16), section: str(64) },
  'live.compare': { id: str(256) },
  'live.find': { what: str(64) },
  // stage S6a: the AI files staged by the Library and kept for Save, the AI page's Rename and Delete, the reference
  // panel of a character template (design 1.3, 4.8.4, 4.10)
  'ai.stage': { name: AI_NAME, text: str(MAX_TEXT, true), overwrite: bool() },
  'ai.unstage': { name: AI_NAME },
  'ai.rename': { name: AI_NAME, new: AI_NAME, update_refs: bool() },
  'ai.delete': { name: AI_NAME, force: bool() },
  'lib.reference': { id: TPL_ID },
};

export const ROUTES = Object.freeze(Object.keys(SHAPES).concat(Object.keys(LATER)));

export function check_body(route, body) {
  if (route === 'file.edit') return check_edit(body);
  return check_shape(SHAPES[route], body);
}

// ---- JSON for the page ---------------------------------------------------------------------------------------------
// Python's json of the answer: a Map is an object in its own order, a BigInt a number (a string when a number
// cannot hold it exactly: the nanosecond stamps), a Set a list.
export function to_plain(v) {
  if (v instanceof Map) {
    const o = {};
    for (const [k, x] of v) o[String(k)] = to_plain(x);
    return o;
  }
  if (v instanceof Set) return [...v].map(to_plain);
  if (typeof v === 'bigint') {
    return (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= -BigInt(Number.MAX_SAFE_INTEGER)) ? Number(v) : String(v);
  }
  if (Buffer.isBuffer(v)) return v.toString('latin1');
  if (Array.isArray(v)) return v.map(to_plain);
  if (v !== null && typeof v === 'object') {
    if (typeof v.as_dict === 'function') return to_plain(v.as_dict());
    const o = {};
    for (const k of Object.keys(v)) o[k] = to_plain(v[k]);
    return o;
  }
  return v;
}

// ---- the host --------------------------------------------------------------------------------------------------------
const CHARACTERS = 'FF7_SpellExt_Characters.ini';
const BOTH = {
  ai_like: 'ai_like and ai in one section: this ai_like is ignored (the ai line before it stays)',
  ai: 'ai_like and ai in one section: this ai is ignored (the ai_like line before it stays)',
};

// why settings.json was not written, for settings.problem
function unwritten(e, what) {
  return 'settings.json could not be written (' + (e.code || e.name) + '): ' + what;
}

function is_dir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

function has_dll_beside(config_dir) {
  try {
    return fs.readdirSync(nodePath.dirname(config_dir)).some(n => n.toLowerCase() === 'ff7_spellext.dll');
  } catch (e) {
    return false;
  }
}

// One window's main-process side: the open workspace, the folder tokens, the settings, the dialogs.
//   opts.store       a Store (store.js)
//   opts.dialogs     { pick_folder(title) -> path|null, show_item(path) }   (Electron's, or a test's)
//   opts.argv        { config, game, mods } from the command line (the one place a path arrives)
//   opts.versions    { node, electron, chrome } shown on the page
//   opts.save        options handed to save_files (the tests' rename and platform)
export class Host {
  constructor(opts) {
    this.o = opts || {};
    this.store = this.o.store || null;
    this.dialogs = this.o.dialogs || {};
    this.ws = null;
    this.folder = null;            // the folder the user picked (the mod folder or SpellExtConfig)
    this.mods_dir = null;
    this.tokens = new Map();       // token -> path
    this.by_path = new Map();      // path -> token
    this._kernel = null;
    this._running = [0, false];
    this.start_problem = null;     // why the folder of the command line (or the last folder) did not open
    this.pending_ai = new Map();   // S6a: AI files staged for Save: name -> {name, text, bytes, overwrite}
  }

  // a path the main process knows (a dialog's, a drop's, a recent entry's, the command line's) -> its token
  token_for(p) {
    if (this.by_path.has(p)) return this.by_path.get(p);
    const t = crypto.randomBytes(16).toString('hex');
    this.tokens.set(t, p);
    this.by_path.set(p, t);
    return t;
  }

  path_of(t) {
    if (!this.tokens.has(t)) throw new PathRefused('unknown folder token (pick the folder again)');
    return this.tokens.get(t);
  }

  // ---- the answer to one invoke --------------------------------------------------------------------------------------
  handle(route, body, sender_url) {
    try {
      if (typeof sender_url !== 'string' || !sender_url.startsWith(ORIGIN)) {
        return { refused: 'refused: the call did not come from the app\'s own page' };
      }
      if (typeof route !== 'string' || ROUTES.indexOf(route) < 0) return { refused: 'bad request: no route ' + String(route) };
      if (LATER[route]) {
        return { refused: route + ': coming in ' + LATER[route] + ' (stage ' + LATER[route] + ' of the desktop app; not in this build yet)' };
      }
      try {
        body = check_body(route, body);
      } catch (e) {
        if (e instanceof BadRequest) return { refused: 'bad request to ' + route + ': ' + e.message };
        throw e;
      }
      // the Live tables: a promise of the worker's answer (the reads never hold up this thread)
      if (route.startsWith('live.')) return this.live_answer(route, body);
      return { ok: to_plain(this.route(route, body)) };
    } catch (e) {
      return error_answer(e);
    }
  }

  need_ws() {
    if (!this.ws) throw new PathRefused('no SpellExt folder is open');
    return this.ws;
  }

  route(route, b) {
    switch (route) {
      case 'app.state': return this.state();
      case 'app.pick_folder': {
        const p = this.dialogs.pick_folder ? this.dialogs.pick_folder('Open the SpellExt folder') : null;
        if (!p) return { cancelled: true };
        return this.open_folder({ token: this.token_for(p), discard: b.discard });
      }
      case 'app.pick_game_folder': {
        const p = this.dialogs.pick_folder ? this.dialogs.pick_folder('The game folder (the one with ff7_en.exe)') : null;
        if (!p) return { cancelled: true };
        return { token: this.token_for(p), path: p };
      }
      case 'app.open_folder': return this.open_folder(b);
      case 'app.close_folder': {
        this.refuse_dirty(b.discard);
        this.ws = null;
        this.folder = null;
        this._kernel = null;
        this._kernels = null;
        this.pending_ai = new Map();
        return this.state();
      }
      case 'app.recent': return this.recent();
      case 'app.settings': {
        if (!this.store) throw new PathRefused('no settings file in this run');
        if (b.set) {
          try {
            this.store.set(b.set);
          } catch (e) {
            if (!e.code) throw e;          // not a setting: a bug of the page
            this.store.problem = unwritten(e, 'the change holds until the app closes');
          }
        }
        return this.settings();
      }
      case 'app.show_backup': {
        const ws = this.need_ws();
        const real = backup_path(fs.realpathSync.native(ws.config_dir), b.path);
        if (this.dialogs.show_item) this.dialogs.show_item(real);
        return { ok: true };
      }
      case 'schema.get': return (this.ws ? this.ws.schema : Schema.load(null)).data;
      case 'file.open': return this.file_view(this.rel(b.path));
      case 'file.diff': {
        const rel = this.rel(b.path);
        const pa = this.pending_of(rel);
        if (pa) {
          let old = Buffer.alloc(0);
          try { old = fs.readFileSync(this.ws.path(rel)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
          return { diff: edit.line_diff(old, Buffer.from(pa.text, 'latin1')) };
        }
        const e = this.ws.open(rel);
        return { diff: edit.line_diff(e.saved_bytes, e.doc.serialize()) };
      }
      case 'file.raw': return this.raw(b);
      case 'file.edit': return this.edit(b);
      case 'file.apply_text': return this.apply_text(b);
      case 'file.save': {
        const rel = this.rel(b.path);
        const pa = this.pending_of(rel);
        if (pa) {
          const r = save_files(this.ws, [], Object.assign({}, this.o.save, { overwrite: [], ai: [pa] }));
          const why = Object.values(r.refused);
          if (why.length) throw new safety.WriteRefused(why[0]);
          this.pending_ai.delete(pa.name);
          return { path: rel, saved: r.saved, backup: r.saved.length ? r.saved[0].backup : null, pending: false };
        }
        this.refuse_readonly(rel);
        const r = save_files(this.ws, [rel], Object.assign({}, this.o.save, { overwrite: b.overwrite ? [rel] : [] }));
        if (r.refused[rel]) throw new safety.WriteRefused(r.refused[rel]);
        const v = this.file_view(rel);
        v.backup = r.saved[0].backup;
        return v;
      }
      case 'file.save_all': {
        const ws = this.need_ws();
        const over = (b.overwrite || []).map(p => this.rel(p));
        const dirty = [...ws.docs.entries()].filter(([, e]) => e.dirty).map(([k]) => k);
        const r = save_files(ws, dirty, Object.assign({}, this.o.save, { overwrite: over, ai: [...this.pending_ai.values()] }));
        for (const w of r.written) {
          const m = /^ai\/(.+)\.ai$/.exec(w);
          if (m) this.pending_ai.delete(m[1]);
        }
        return { saved: r.saved, refused: r.refused, written: r.written, not_written: r.not_written };
      }
      case 'file.reload': {
        const rel = this.rel(b.path);
        const e = this.ws.docs.get(rel);
        if (e && e.stamp === null && !fs.existsSync(this.ws.path(rel))) {
          // made by an Add and never saved: Revert drops it, and the folder is again without the file
          e.doc = new Document(Buffer.alloc(0));
          this.ws.mark(rel);
          const v = this.file_view(rel);
          this.ws.docs.delete(rel);
          return v;
        }
        this.ws.open(rel, true);
        return this.file_view(rel);
      }
      case 'check.run': return { problems: this.need_ws().check() };
      case 'log.read': return this.log();
      case 'lib.list': return this.lib_list();
      case 'lib.suggest': {
        const t = this.template(b.id);
        return T.suggest(t, b.values || {}, this.tpl_folder());
      }
      case 'lib.reference': {
        const t = this.template(b.id);
        const f = this.tpl_folder();
        return T.reference(t, f, this._kernel_label || 'none');
      }
      case 'lib.preview': return this.lib_preview(b);
      case 'lib.insert': return this.lib_insert(b);
      case 'lib.capture': {
        const rel = this.rel(b.path);
        if (rel.indexOf('/') >= 0) throw new T.TemplateProblem(rel + ' is not a file of sections a template makes');
        const f = this.tpl_folder();
        const name = f.name_of(rel);
        if (name === null) throw new T.TemplateProblem(rel + ' is not a file the readers read');
        const c = T.capture(f, name, b.section_line, this.ws.schema, b.keys === undefined ? null : b.keys,
                            b.include === undefined ? null : b.include, b.id || null, b.title || null);
        c.problems = T.parse(c.text).problems;
        return c;
      }
      case 'lib.save_user': {
        refuse_wide_chars(b.text);
        const [rel, old] = this.user_templates_clean();
        const got = T.parse(b.text);
        const id = got.templates.length === 1 && !got.problems.length ? got.templates[0].id : null;
        if (id !== null && !b.replace && user_ids(old).has(id)) {
          throw new T.TemplateProblem('your templates already have ' + id + ': replace it, or choose another id');
        }
        this.write_user(rel, T.user_file_with(old, b.text, new Set(builtin().templates.map(t => t.id))));
        return this.lib_list();
      }
      case 'lib.remove_user': {
        const [rel, old] = this.user_templates_clean();
        this.write_user(rel, T.user_file_without(old, b.id));
        return this.lib_list();
      }
      case 'lib.import': return this.lib_import();
      case 'lib.export': return this.lib_export(b.id);
      case 'ai.list': {
        const ws = this.need_ws();
        return { ai: aitool.list_ai(ws.config_dir), kernels: aitool.kernel_candidates(ws.game_dir, ws.config_dir) };
      }
      case 'ai.open': {
        this.need_ws();
        if (this.pending_ai.has(b.name)) {
          const pa = this.pending_ai.get(b.name);
          return { name: b.name, has_txt: false, has_ai: false, text: pa.text, source: 'pending', pending: true,
                   block_size: pa.bytes.length, block_problems: [] };
        }
        this.ai_gate(b.name, false);
        return aitool.open_ai(this.need_ws().config_dir, b.name);
      }
      case 'ai.overview': return this.ai_overview();
      case 'ai.library': {
        this.need_ws();
        if (!this._lib_static) this._lib_static = { instructions: ailibrary.instructions(), variables: ailibrary.variables() };
        return Object.assign({}, this._lib_static,
                             { recipes: ailibrary.public_recipes(new aiexplain.Names(this.active_kernel_bytes())) });
      }
      case 'ai.check': {
        refuse_wide_chars(b.text);
        const r = aitool.assemble_check(b.text);
        delete r.bytes;
        return r;
      }
      case 'ai.save': return this.ai_save(b);
      case 'ai.from_kernel': {
        this.need_ws();
        const kid = b.kernel_id || this.kernels().active_id();
        let d;
        let info;
        try {
          if (b.kernel_id) this.known_kernel(b.kernel_id);
          d = this.kernels().get(kid);
          info = this.kernels().describe(kid);
        } catch (e) {
          if (e instanceof kernels.KernelRefused) throw new EditRefused(e.message);
          throw e;
        }
        return aitool.from_kernel_bytes(d, b.character, info.label, info.sha1);
      }
      case 'ai.kernel_choose': {
        this.need_ws();
        if (!b.id && !b.path) throw new EditRefused('give a kernel from the list, or the full path of a KERNEL.BIN');
        try {
          if (!b.path) this.known_kernel(b.id);
          this.kernels().choose(b.path ? null : b.id, b.path || null);
        } catch (e) {
          if (e instanceof kernels.KernelRefused) throw new EditRefused(e.message);
          throw e;
        }
        return this.ai_overview();
      }
      case 'ai.kernel_pick': return this.ai_kernel_pick();
      case 'ai.cards': {
        refuse_wide_chars(b.text);
        return this.ai_cards(b.text);
      }
      case 'ai.card_edit': return this.ai_card_edit(b);
      case 'ai.recipe': {
        let text;
        try {
          text = ailibrary.fill(b.id, b.values || {}, b.uid || 'a', Boolean(b.as_section));
        } catch (e) {
          if (e instanceof ailibrary.RecipeError) throw new EditRefused(e.message);
          throw e;
        }
        const r = ailibrary.recipe(b.id);
        const sec = (r.sections.length ? r.sections : ['init'])[0];
        const ex = aiexplain.explain_text(b.as_section ? text : text + '        end\n', this.active_kernel_bytes(), sec);
        return { text, english: ex };
      }
      case 'ai.explain': {
        refuse_wide_chars(b.body || '');
        let kd = null;
        try {
          if (b.kernel_id) this.known_kernel(b.kernel_id);
          const kid = b.kernel_id || this.kernels().active_id();
          kd = kid ? this.kernels().get(kid) : null;
        } catch (e) {
          if (!(e instanceof kernels.KernelRefused)) throw e;
          kd = null;
        }
        let sec = b.section || 'init';
        if (!aiexplain.SECTION_INDEX.has(sec)) sec = 'init';
        return aiexplain.explain_text(b.body || '', kd, sec);
      }
      case 'ai.set_character': return this.set_character_ai(b);
      case 'ai.stage': return this.ai_stage(b);
      case 'ai.unstage': {
        this.need_ws();
        if (!this.pending_ai.has(b.name)) throw new EditRefused('no staged AI file ' + b.name);
        this.pending_ai.delete(b.name);
        return this.ai_listing();
      }
      case 'ai.rename': return this.ai_rename(b);
      case 'ai.delete': return this.ai_delete(b);
      default: throw new Error('route without a handler: ' + route);
    }
  }

  // ---- the template library (design 3.5, 4) --------------------------------------------------------------------------
  // The folder the templates are filled against: the texts as they stand in the editor (unsaved edits included), the
  // game folder's KERNEL.BIN (names, materia bytes), the ai\*.txt texts (the commented IDs they name).
  // S6a: the AI files' names (on disk and staged), the characters files under Backups\ (the "used before" check), and
  // the kernel: the game folder's KERNEL.BIN, else the AI page's chosen one (design 4.2, 4.8.4).
  tpl_folder() {
    const ws = this.need_ws();
    if (this._kernel_bytes === undefined) {
      const p = slots.kernel_path(ws.game_dir);
      let d = null;
      try { d = p ? fs.readFileSync(p) : null; } catch (e) { d = null; }
      this._kernel_bytes = d && d.length <= 1024 * 1024 ? d : null;
      this._kernel_label = this._kernel_bytes ? "the game folder's KERNEL.BIN" : null;
    }
    let kernel = this._kernel_bytes;
    if (kernel === null) {
      kernel = this.active_kernel_bytes();
      try {
        const kid = this.kernels().active_id();
        this._kernel_label = kernel !== null && kid ? this.kernels().describe(kid).label + ' (the AI page\'s choice)' : null;
      } catch (e) {
        if (!(e instanceof kernels.KernelRefused)) throw e;
        this._kernel_label = null;
      }
    }
    const ai = new Map();
    for (const f of ws.list_files()) {
      if (f.group === 'ai' && pyLower(f.path).endsWith('.txt')) ai.set(f.path, ws.text(f.path));
    }
    return new T.Folder(ws.texts(), kernel, ai, this.ai_names(true), [...this.pending_ai.keys()], this.backup_characters());
  }

  // the names of the ai folder's files (NAME of NAME.ai / NAME.txt), without assembling them as list_ai does; with
  // only_ai the names of the .ai files alone (the DLL reads only ai\NAME.ai: a source alone gives a character no AI)
  ai_names(only_ai) {
    const d = aitool.ai_dir(this.ws.config_dir);
    let fs_names = [];
    try { fs_names = fs.readdirSync(d); } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e; }
    const out = [];
    for (const f of fs_names.sort()) {
      const m = (only_ai ? /^(.*)\.(ai)$/i : /^(.*)\.(ai|txt)$/i).exec(f);
      if (m && out.indexOf(m[1]) < 0) out.push(m[1]);
    }
    return out;
  }

  // Map {path: text} of the characters files in the backup folders (Backups\<stamp>\FF7_SpellExt_Characters.ini)
  backup_characters() {
    const out = new Map();
    const ws = this.ws;
    let root;
    try {
      root = backups_dir(fs.realpathSync.native(ws.config_dir));
    } catch (e) {
      if (e instanceof PathRefused) return out;
      throw e;
    }
    if (!is_dir(root)) return out;
    let stamps = [];
    try { stamps = fs.readdirSync(root).sort(); } catch (e) { return out; }     // unreadable: no evidence
    for (const d of stamps) {
      const dir = nodePath.join(root, d);
      let names;
      try {
        if (!fs.lstatSync(dir).isDirectory()) continue;     // a link (followed, it may lead out: rule 6) or a file
        names = fs.readdirSync(dir);
      } catch (e) {
        continue;                                            // unreadable: no evidence
      }
      for (const f of names) {
        if (pyLower(f) !== pyLower(CHARACTERS)) continue;
        const p = nodePath.join(dir, f);
        try {
          const st = fs.lstatSync(p);
          if (st.isFile() && st.size <= 4 * 1024 * 1024) out.set('Backups/' + d + '/' + f, fs.readFileSync(p).toString('latin1'));
        } catch (e) { /* unreadable: no evidence */ }
      }
    }
    return out;
  }

  // [rel, text] of FF7_SpellExt_Templates.txt as it stands ('' when the folder has none)
  user_templates_text() {
    const ws = this.need_ws();
    const rel = known_name(ws, T.USER_FILE);
    if (ws.docs.has(rel)) return [rel, ws.docs.get(rel).doc.text()];
    try { return [rel, fs.readFileSync(ws.path(rel)).toString('latin1')]; } catch (e) { if (e.code === 'ENOENT') return [rel, '']; throw e; }
  }

  // the same, refused while the file has unsaved edits of its own (the Raw tab): a write would carry them along
  user_templates_clean() {
    const [rel, text] = this.user_templates_text();
    const e = this.ws.docs.get(rel);
    if (e && e.dirty) throw new safety.WriteRefused(rel + ' has unsaved edits: save or reload it first');
    return [rel, text];
  }

  user_templates() {
    const [rel, text] = this.user_templates_text();
    return [rel, text ? T.parse(text) : { templates: [], problems: [], blocks: [] }];
  }

  template(id) {
    const b = builtin().templates.find(t => t.id === id);
    if (b) return b;
    const u = this.user_templates()[1].templates.find(t => t.id === id);
    if (u) return u;
    throw new T.TemplateProblem('no template ' + id);
  }

  // the ids of the built-in and the user's templates (an AI card of the same id is not offered: the template wins)
  template_ids() {
    return new Set(builtin().templates.concat(this.user_templates()[1].templates).map(t => t.id));
  }

  lib_list() {
    const f = this.tpl_folder();
    const [rel, user] = this.user_templates();
    const ids = this.template_ids();
    const cards = builtin().templates.map(t => T.card(t, true, f)).concat(user.templates.map(t => T.card(t, false, f)))
      .concat(T.ai_cards(this.active_kernel_bytes()).filter(c => !ids.has(c.id)));
    return { templates: cards, problems: user.problems.map(([line, text, id]) => ({ line, text, id })),
             builtin_problems: builtin().problems.map(([line, text, id]) => ({ line, text, id })),
             user_file: rel, user_exists: this.user_templates_text()[1] !== '', kernel: f.kernel !== null };
  }

  lib_preview(b) {
    const card = this.ai_card(b.id);
    if (card !== null) return this.ai_card_preview(card, b.values || {});
    const t = this.template(b.id);
    const f = this.tpl_folder();
    const r = T.preview(t, b.values || {}, b.positions || null, f);
    return { values: r.values, parts: r.parts, new_messages: r.new_messages, notes: r.notes, warnings: r.warnings,
             prerequisites: r.prerequisites, ok: r.ok };
  }

  // ---- the AI section of the Library (design 4.10) --------------------------------------------------------------------
  ai_card(id) {
    if (!/^ai_/.test(id) || this.template_ids().has(id)) return null;
    const c = T.ai_cards(this.active_kernel_bytes()).find(x => x.id === id);
    return c === undefined ? null : c;
  }

  // the text, the assembler's check, the size, the English of each script, whether the name is taken
  ai_card_preview(card, values) {
    const ws = this.need_ws();
    let label = 'KERNEL.BIN';
    let sha = null;
    const kd = this.active_kernel_bytes();
    try {
      const kid = this.kernels().active_id();
      if (kid) {
        const info = this.kernels().describe(kid);
        label = info.label;
        sha = info.sha1;
      }
    } catch (e) {
      if (!(e instanceof kernels.KernelRefused)) throw e;
    }
    void ws;
    const r = T.ai_card_preview(card, values, kd, label, sha, this.ai_names(), [...this.pending_ai.keys()]);
    const english = [];
    for (const e of aicards.parse(r.text).entries) {
      for (const it of e.items) {
        if (it.type !== 'script' || !it.sections.length) continue;
        const ex = aiexplain.explain_text(it.body.join('\n') + '\n', kd, it.sections[0]);
        english.push({ entry: e.indices.length ? e.indices[0] : null, section: it.sections[0],
                       lines: ex.ok ? ex.lines.map(l => '  '.repeat(l.indent || 0) + l.text) : [ex.error || 'not explained'] });
      }
    }
    r.english = english;
    r.kernel = label;
    return r;
  }

  // ai.stage: assembled and checked as ai.save does, then held for Save (written by file.save_all, into the save's one
  // backup folder, through the same writes as save_ai)
  ai_stage(b) {
    const ws = this.need_ws();
    refuse_wide_chars(b.text);
    if (!STAGE_NAME.test(b.name)) throw new EditRefused('an AI name is 1 to 31 letters, digits, _ or - (the ai key of a character takes 31)');
    this.ai_gate(b.name, true);
    const exists = this.ai_names().some(x => pyLower(x) === pyLower(b.name));
    const staged = [...this.pending_ai.keys()].some(x => pyLower(x) === pyLower(b.name) && x !== b.name);
    if ((exists || staged) && !b.overwrite) {
      throw new EditRefused('ai\\' + b.name + ' exists' + (staged ? ' (staged)' : '') + ': choose another name, or overwrite');
    }
    const edited = this.dirty_ai_source(b.name);
    if (edited) throw new EditRefused(edited + ' has unsaved edits: save or reload it first (staging over it would lose them)');
    const r = aitool.assemble_check(b.text);
    if (r.bytes === null || r.bytes === undefined || !r.ok) {
      throw new EditRefused('not staged: ' + r.problems.map(p => p.text).join('; '));
    }
    // staged over a staged file of the same name in another case: the new one replaces it (two entries would both be
    // written by Save all, and on Windows to one file)
    for (const k of [...this.pending_ai.keys()]) if (pyLower(k) === pyLower(b.name)) this.pending_ai.delete(k);
    this.pending_ai.set(b.name, { name: b.name, text: b.text, bytes: r.bytes, overwrite: Boolean(b.overwrite) && exists });
    return this.ai_listing();
  }

  // the AI page's list: the files on disk with their users, and the staged ones marked
  ai_listing() {
    const o = this.ai_overview();
    return { ai: o.files, pending: [...this.pending_ai.keys()], kernels: aitool.kernel_candidates(this.ws.game_dir, this.ws.config_dir) };
  }

  // the staged AI file a path names (ai/NAME.txt or ai/NAME.ai), or null
  pending_of(rel) {
    const m = /^ai\/(.+)\.(txt|ai)$/.exec(rel);
    return m && this.pending_ai.has(m[1]) ? this.pending_ai.get(m[1]) : null;
  }

  // the workspace key of ai/NAME.txt (any case) while it has unsaved edits, else null
  dirty_ai_source(name) {
    for (const [k, e] of this.ws.docs) {
      if (e.dirty && pyLower(k) === pyLower('ai/' + name + '.txt')) return k;
    }
    return null;
  }

  // ai/NAME.ext under the real config root for Rename and Delete: null when there is no such entry, refused when the
  // entry is not a plain file (a link is never followed: its target, an .ini file say, is not the AI's to move or
  // remove). The path returned is the entry's own (only the folders above it resolved), checked inside the root.
  ai_entry(root, name, ext) {
    const rel = split_rel('ai/' + name + ext);
    let st;
    try {
      st = fs.lstatSync(nodePath.join(root, 'ai', name + ext));
    } catch (e) {
      if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
      throw e;
    }
    if (!st.isFile()) throw new EditRefused(rel + ' is not a plain file (a link or a folder): refused, change it by hand');
    const abs = resolve_in(root, rel);
    check_write(root, abs);
    return abs;
  }

  // the characters whose effective key is ai = name (the characters file as it stands in the editor)
  ai_users(name) {
    const cs = aicards.character_ai(this.ai_texts(), []);
    return cs.filter(c => c.effective && c.effective.key === 'ai' && pyLower(c.effective.value) === pyLower(name));
  }

  // ai.rename: both files renamed through the writer (one backup folder first, then the new files written, then the old
  // ones removed); with update_refs every live `ai = name` line of the characters file becomes an unsaved edit
  ai_rename(b) {
    const ws = this.need_ws();
    if (!STAGE_NAME.test(b.new)) throw new EditRefused('an AI name is 1 to 31 letters, digits, _ or - (the ai key of a character takes 31)');
    if (b.new === b.name) throw new EditRefused('the new name is the old one');
    if (pyLower(b.new) === pyLower(b.name)) {
      // on Windows (and macOS) the two names are one file: the new files would be written over the old, then removed
      throw new EditRefused('the names differ only in case, and are the same file on Windows: rename to another name first');
    }
    const files = aitool.list_ai(ws.config_dir);
    const old = files.find(x => x.name === b.name);
    const staged = this.pending_ai.get(b.name);
    if (!old && !staged) throw new EditRefused('no AI file ' + b.name);
    if (files.some(x => pyLower(x.name) === pyLower(b.new) && x.name !== b.name) ||
        [...this.pending_ai.keys()].some(x => pyLower(x) === pyLower(b.new) && x !== b.name)) {
      throw new EditRefused('ai\\' + b.new + ' exists: choose another name');
    }
    for (const ext of ['.txt']) {
      const e = ws.docs.get('ai/' + b.name + ext);
      if (e && e.dirty) throw new EditRefused('ai/' + b.name + ext + ' has unsaved edits: save or reload it first');
    }
    let backup = null;
    if (old) {
      if (!ws.writable) throw new safety.WriteRefused('the config folder is not writable: read-only mode');
      this.ai_gate(b.name, true);
      this.ai_gate(b.new, true);
      const root = fs.realpathSync.native(ws.config_dir);
      const moves = [];
      for (const ext of ['.txt', '.ai']) {
        const from = this.ai_entry(root, b.name, ext);
        if (from === null) continue;
        let taken = true;
        try { fs.lstatSync(nodePath.join(root, 'ai', b.new + ext)); } catch (e) { taken = false; }
        if (taken) throw new EditRefused('ai\\' + b.new + ext + ' exists: choose another name');
        const to = resolve_in(root, split_rel('ai/' + b.new + ext));
        check_write(root, to);
        moves.push([from, to]);
      }
      backups_dir(root);
      backup = safety.make_backup(ws.config_dir, moves.map(([from]) => from), 'ai/' + b.name + ' renamed to ' + b.new);
      for (const [from, to] of moves) write_file(ws.config_dir, to, fs.readFileSync(from), backup, this.o.save);
      for (const [from] of moves) fs.unlinkSync(from);
      ws.docs.delete('ai/' + b.name + '.txt');
    }
    // the staged entry follows only once nothing above refused (a refused Rename leaves it under its old name); one
    // staged over the files on disk still writes over them, now under the new name
    if (staged) {
      this.pending_ai.delete(b.name);
      this.pending_ai.set(b.new, Object.assign({}, staged, { name: b.new, overwrite: Boolean(old) && Boolean(staged.overwrite) }));
    }
    const used = this.ai_users(b.name);
    const updated = [];
    if (b.update_refs && used.length) {
      const e = ws.open(CHARACTERS);
      for (const c of used) {
        for (const l of c.own) {
          if (l.key === 'ai' && pyLower(pyStrip(l.value)) === pyLower(b.name)) {
            e.doc.set_value(l.line - 1, b.new);
            updated.push(c.id);
          }
        }
      }
      ws.mark(CHARACTERS);
    }
    return { renamed: b.new, backup, refs_updated: updated, used_by: b.update_refs ? [] : used.map(c => c.id),
             listing: this.ai_listing() };
  }

  // ai.delete: refused while a character's live ai = line names the file, unless force; both files backed up, removed
  ai_delete(b) {
    const ws = this.need_ws();
    const used = this.ai_users(b.name).map(c => c.id);
    if (used.length && !b.force) {
      throw new EditRefused('ai\\' + b.name + ' is used by character' + (used.length > 1 ? 's ' : ' ') + used.join(', ') +
                            ' (ai = ' + b.name + '): delete anyway leaves them naming a missing file');
    }
    if (this.pending_ai.has(b.name)) {
      this.pending_ai.delete(b.name);
      return { deleted: b.name, used_by: used, backup: null, listing: this.ai_listing() };
    }
    const files = aitool.list_ai(ws.config_dir);
    if (!files.some(x => x.name === b.name)) throw new EditRefused('no AI file ' + b.name);
    if (!ws.writable) throw new safety.WriteRefused('the config folder is not writable: read-only mode');
    const e = ws.docs.get('ai/' + b.name + '.txt');
    if (e && e.dirty) throw new EditRefused('ai/' + b.name + '.txt has unsaved edits: save or reload it first');
    this.ai_gate(b.name, true);
    const root = fs.realpathSync.native(ws.config_dir);
    const paths = [];
    for (const ext of ['.txt', '.ai']) {
      const p = this.ai_entry(root, b.name, ext);
      if (p !== null) paths.push(p);
    }
    backups_dir(root);
    const backup = safety.make_backup(ws.config_dir, paths, 'ai/' + b.name + ' deleted');
    for (const p of paths) fs.unlinkSync(p);
    ws.docs.delete('ai/' + b.name + '.txt');
    return { deleted: b.name, used_by: used, backup, listing: this.ai_listing() };
  }

  // Every part's lines as ONE change (design 1.3 lib.insert): the new texts are worked out on copies first (the proof
  // included); only when every part took and the DLL would report nothing new do the documents take them.
  lib_insert(b) {
    const ws = this.need_ws();
    if (this.ai_card(b.id) !== null) throw new T.TemplateProblem('an AI card is added with ai.stage (Add on its preview)');
    const t = this.template(b.id);
    const f = this.tpl_folder();
    const r = T.preview(t, b.values || {}, b.positions || null, f);
    if (!r.ok) {
      throw new T.TemplateProblem('not added: the DLL would report ' + r.new_messages.length + ' new message(s): ' +
                                  r.new_messages.map(p => p.text).join(' | '));
    }
    const touched = [];
    for (const [name] of r.texts) {
      const rel = this.rel(name);
      this.refuse_readonly(rel);
      touched.push(rel);
    }
    const docs = [];
    for (const [name, text] of r.texts) {
      const rel = this.rel(name);
      const e = ws.docs.has(rel) ? ws.docs.get(rel) : (fs.existsSync(ws.path(rel)) ? ws.open(rel) : ws.create(rel));
      if (e.doc.text() !== (f.text(name) || '')) throw new Error('the folder changed while the template was added: ' + rel);
      docs.push([rel, e, new Document(Buffer.from(text, 'latin1'))]);
    }
    for (const [rel, e, doc] of docs) {
      e.doc = doc;
      ws.mark(rel);
    }
    const added = r.parts.map(p => {
      const k = p.lines.findIndex(l => /^\s*\[/.test(l));
      return { file: this.rel(f.name_of(p.file) || p.file), line: p.at + (k >= 0 ? k : 0), header: k >= 0 ? p.lines[k].trim() : null };
    });
    return { files: touched, added, warnings: r.warnings, state: this.state() };
  }

  // FF7_SpellExt_Templates.txt written through the same writer as a Save (backup first, atomic); it must have no
  // unsaved edits of its own (the Raw tab), which this would write too
  write_user(rel, text) {
    const ws = this.need_ws();
    const e = ws.docs.has(rel) ? ws.docs.get(rel) : (fs.existsSync(ws.path(rel)) ? ws.open(rel) : ws.create(rel));
    if (e.dirty) throw new safety.WriteRefused(rel + ' has unsaved edits: save or reload it first');
    const before = e.doc;
    e.doc = new Document(Buffer.from(text, 'latin1'));
    ws.mark(rel);
    if (!e.dirty) return;
    const r = save_files(ws, [rel], Object.assign({}, this.o.save, { overwrite: [] }));
    if (r.refused[rel]) {
      e.doc = before;
      ws.mark(rel);
      throw new safety.WriteRefused(r.refused[rel]);
    }
  }

  lib_import() {
    const p = this.dialogs.open_file ? this.dialogs.open_file('Import templates (a text file of [template ...] blocks)') : null;
    if (!p) return { cancelled: true };
    const st = fs.statSync(p);
    if (!st.isFile() || st.size > 1024 * 1024) throw new T.TemplateProblem('import takes a text file of at most 1 MB');
    const got = T.parse(fs.readFileSync(p).toString('latin1'));
    if (got.problems.length) {
      const q = got.problems[0];
      throw new T.TemplateProblem('not imported: line ' + q[0] + ': ' + q[1] + (got.problems.length > 1 ? ' (and ' + (got.problems.length - 1) + ' more)' : ''));
    }
    if (!got.templates.length) throw new T.TemplateProblem('not imported: the file holds no [template ...]');
    let [rel, text] = this.user_templates_clean();
    const have = user_ids(text);
    const clash = got.templates.filter(t => have.has(t.id)).map(t => t.id);
    if (clash.length) throw new T.TemplateProblem('not imported: your templates already have ' + clash.join(', ') + ' (remove them first, or change the ids in the file)');
    const ids = new Set(builtin().templates.map(t => t.id));
    for (const t of got.templates) text = T.user_file_with(text, T.emit(t).join('\n') + '\n', ids);
    this.write_user(rel, text);
    const out = this.lib_list();
    out.imported = got.templates.map(t => t.id);
    return out;
  }

  // the one write outside the config folder: one template, to the path of a Save dialog
  lib_export(id) {
    const t = this.template(id);
    const p = this.dialogs.save_file ? this.dialogs.save_file('Export the template ' + id, id + '.txt') : null;
    if (!p) return { cancelled: true };
    const base = pyLower(nodePath.basename(p));
    if (safety.NEVER_NAMES.has(base) || base.endsWith('.dll') || base.endsWith('.exe') || base.endsWith('.ini')) {
      throw new safety.WriteRefused('this tool never writes ' + nodePath.basename(p) + ' (export to a .txt file)');
    }
    // the real place it would land: never in the open config folder (its files are written only through a Save, with
    // a backup) and never in 7th Heaven's own folders
    let real;
    try {
      real = fs.existsSync(p) ? fs.realpathSync.native(p)
                              : nodePath.join(fs.realpathSync.native(nodePath.dirname(p)), nodePath.basename(p));
    } catch (e) { throw new safety.WriteRefused('no folder ' + nodePath.dirname(p)); }
    const cfg = fs.realpathSync.native(this.need_ws().config_dir);
    if (real === cfg || inside(cfg, real)) {
      throw new safety.WriteRefused('export outside the config folder; Import adds templates here');
    }
    for (const part of real.split(/[\\/]/).concat(p.split(/[\\/]/))) {
      if (safety.NEVER_PARTS.has(pyLower(part))) throw new safety.WriteRefused("this tool never writes inside 7th Heaven's own folders: " + p);
    }
    const text = '; FF7 SpellExt Config - a template, exported. Import it on the Library page.\r\n\r\n' +
                 T.emit(t).join('\r\n') + '\r\n';
    fs.writeFileSync(p, Buffer.from(text, 'latin1'));
    return { ok: true, path: p };
  }

  // ---- the AI page (sxcfg/server.py: ai_overview, ai_cards, set_character_ai and the /api/ai/* routes) -------------------
  // The kernels of the AI page's chooser: the game folder's, the mods folder's (loose and in .iro archives), a path
  // typed, a file picked. The choice is kept in settings.json (`kernel`); the Python tool's choice is taken over once
  // from the file --settings names (its spellext_config_settings.json) while settings.json has none.
  kernels() {
    const ws = this.need_ws();
    if (!this._kernels) {
      const store = this.store;
      if (store && !store.get('kernel') && this.o.argv && this.o.argv.settings) {
        try {
          const old = JSON.parse(fs.readFileSync(this.o.argv.settings, 'utf8'));
          if (old && typeof old.kernel === 'string') store.set({ kernel: old.kernel });
        } catch (e) { /* nothing to take over */ }
      }
      const adapter = {
        load: () => ({ kernel: store ? store.get('kernel') : null }),
        save: (data) => { if (store) store.set({ kernel: data.kernel }); },
      };
      this._kernels = new kernels.Kernels(ws.game_dir, this.mods_dir, store ? adapter : null);
      this._kernels.upload_where = 'picked from this computer (kept until the app closes)';
    }
    return this._kernels;
  }

  // A kernel id from a route's body: one of the chooser's list (found, or picked this session), or the choice in use
  // (a typed path kept in settings.json). Anything else is refused before a file is opened: an id names a path, and
  // the page only ever sends ids from the list (design 1.4 rule 6).
  known_kernel(kid) {
    const k = this.kernels();
    if (kid === k.active || k.listing().some(x => x.id === kid)) return kid;
    throw new kernels.KernelRefused('unknown kernel ' + kid + ' (choose one from the list)');
  }

  active_kernel_bytes() {
    try {
      const kid = this.kernels().active_id();
      return kid ? this.kernels().get(kid) : null;
    } catch (e) {
      if (e instanceof kernels.KernelRefused) return null;
      throw e;
    }
  }

  ai_texts() {
    try {
      return this.ws.text(CHARACTERS);
    } catch (e) {
      if (e.code) return '';
      throw e;
    }
  }

  ai_overview() {
    const ws = this.need_ws();
    const files = aitool.list_ai(ws.config_dir);
    const cs = aicards.character_ai(this.ai_texts(), files.filter(f => f.ai).map(f => f.name));
    for (const [name] of this.pending_ai) {
      const hit = files.find(f => f.name === name);
      if (hit) hit.pending = true;
      else files.push({ name, ai: false, txt: false, in_sync: null, pending: true });
    }
    for (const f of files) {
      f.used_by = cs.filter(c => c.effective && c.effective.key === 'ai' && pyLower(c.effective.value) === pyLower(f.name)).map(c => c.id);
      if (f.pending === undefined) f.pending = false;
    }
    let game = [];
    const k = this.kernels();
    const kid = k.active_id();
    let active = null;
    if (kid) {
      try {
        active = k.describe(kid);
        const blk = aitool.kernel_ai_block(k.get(kid))[0];
        for (let e = 0; e < 12; e++) {
          let has;
          try {
            aitool.single_entry(blk, e);
            has = true;
          } catch (ex) {
            has = false;
          }
          game.push({ entry: e, name: e < 11 ? aicards.GAME_NAMES[e] : '(empty entry)', has_ai: has,
                      used_by: cs.filter(c => c.effective && c.effective.key === 'ai_like' && c.effective.entry === e).map(c => c.id) });
        }
      } catch (ex) {
        game = [];
      }
    }
    const cd = ws.docs.get(CHARACTERS);
    return { characters: cs, files, game, kernel: active, kernel_id: kid, kernels: k.listing(),
             kernel_note: "The DLL's ai_like copies the AI of whichever kernel the GAME loads (a mod's, such as New Threat's, " +
                          'when that mod is active), not the one chosen here.',
             characters_dirty: cd ? cd.dirty : false,
             ai_like_words: ['cloud', 'barret', 'tifa', 'aeris', 'red', 'yuffie', 'caitsith', 'vincent', 'cid',
                             'youngcloud', 'sephiroth', 'aerith', 'none'] };
  }

  ai_cards(text) {
    const model = aicards.parse(text);
    const chk = aicards.check(text);
    return { text, entries: aicards.cards(model, chk.problems), check: chk, preamble: model.preamble };
  }

  // set_body, add, remove as the Python page; and apply_text (the app's): the text of a script's lines (the item of
  // an entry) or of the whole text put back through apply_edited_text, so a line not touched keeps its own ending
  ai_card_edit(b) {
    refuse_wide_chars(b.text);
    if (b.body !== undefined && b.body !== null) refuse_wide_chars(b.body);
    const model = aicards.parse(b.text);
    const need = k => {
      if (b[k] === undefined || b[k] === null) throw new EditRefused("'" + k + "'");
      return b[k];
    };
    try {
      if (b.op === 'set_body') aicards.set_body(model, need('entry'), need('item'), need('body'));
      else if (b.op === 'add') aicards.add_section(model, need('entry'), need('section'));
      else if (b.op === 'remove') aicards.remove_section(model, need('entry'), need('section'));
      else {
        let body = need('body');
        const doc = new Document(Buffer.from(b.text, 'latin1'));
        let first = null;
        let last = null;
        if (b.entry !== undefined && b.entry !== null) {
          const hit = aicards.line_map(model).find(([ei, ii]) => ei === b.entry && ii === need('item'));
          const it = hit ? model.entries[hit[0]].items[hit[1]] : null;
          if (!it || it.type !== 'script') throw new EditRefused('not a script');
          const why = aicards.body_refusal(body);
          if (why) throw new EditRefused(why);
          first = hit[2];                  // the line after the script's own line (0-based: a), through its last line
          last = hit[3] - 1;
          // the page sends a card's lines each followed by LF; the file's last line without a newline keeps none
          const ls = doc.lines;
          if (last === ls.length - 1 && last >= 0 && !ls[last].newline && body.endsWith('\n')) body = body.slice(0, -1);
        }
        doc.apply_edited_text(body, first, last);
        return this.ai_cards(doc.text());
      }
    } catch (e) {
      if (e instanceof aicards.CardRefused || e.name === 'IndexError' || e.name === 'KeyError') throw new EditRefused(e.message);
      throw e;
    }
    return this.ai_cards(aicards.serialize(model));
  }

  // The path rules of design 1.4 for ai\NAME.txt and ai\NAME.ai, before the core reads or writes either: the
  // Windows name rules (rule 3: a name such as CON passes the AI name rule), a file or an ai folder that is a link out
  // of the config folder (rule 4), the never-written names (rule 5) and, for a write, a Backups folder that is a link
  // out of it (save_ai backs up and prunes there). A name the AI name rule refuses is left to the core, whose message
  // is the reference's (rule 2's list is not asked: the core's name rule is the reference's, 32 characters).
  ai_gate(name, write) {
    const ws = this.need_ws();
    if (typeof name !== 'string' || !aitool.NAME_RE.test(name)) return;
    const root = fs.realpathSync.native(ws.config_dir);
    const has_dir = fs.existsSync(aitool.ai_dir(ws.config_dir));
    for (const ext of ['.txt', '.ai']) {
      const rel = split_rel('ai/' + name + ext);
      if (!has_dir) continue;              // save_ai makes the folder; nothing to resolve yet
      const abs = resolve_in(root, rel);
      if (write) check_write(root, abs);
    }
    if (write) backups_dir(root);
  }

  ai_save(b) {
    const ws = this.need_ws();
    if (!ws.writable) throw new safety.WriteRefused('the config folder is not writable: read-only mode');
    refuse_wide_chars(b.text);
    this.ai_gate(b.name, true);
    const r = aitool.save_ai(ws.config_dir, b.name, b.text, Boolean(b.force));
    // a file staged under that name (the AI page opened it, and this Save wrote its edit): Save all would write the
    // staged text over the saved one, so the staged one goes
    for (const k of [...this.pending_ai.keys()]) if (pyLower(k) === pyLower(b.name)) this.pending_ai.delete(k);
    // a source the kind page holds, not changed there: it follows the file
    const rel = 'ai/' + b.name + '.txt';
    const e = ws.docs.get(rel);
    if (e && !e.dirty) ws.open(rel, true);
    return r;
  }

  // the kernel "upload" (design 1.3 ai.kernel_pick): a file dialog; the main process reads the file (at most 1 MB)
  ai_kernel_pick() {
    this.need_ws();
    const p = this.dialogs.open_file ? this.dialogs.open_file('A KERNEL.BIN (kept until the app closes)', 'kernel') : null;
    if (!p) return { cancelled: true };
    let st;
    try {
      st = fs.statSync(p);
    } catch (e) {
      throw new EditRefused('cannot read ' + p + ': ' + kernels.strerror(e));
    }
    if (!st.isFile()) throw new EditRefused(p + ' is not a file');
    if (st.size > kernels.MAX_KERNEL) throw new EditRefused('larger than 1 MB: not a KERNEL.BIN');
    try {
      this.kernels().upload(nodePath.basename(p), fs.readFileSync(p));
    } catch (e) {
      if (e instanceof kernels.KernelRefused) throw new EditRefused(e.message);
      throw e;
    }
    return this.ai_overview();
  }

  // Set, switch or clear one character's AI line: always one line changed (or added, or removed).
  set_character_ai(b) {
    const ws = this.need_ws();
    const e = ws.open(CHARACTERS);
    const doc = e.doc;
    const hi = b.section_line - 1;
    if (hi >= doc.lines.length || doc.lines[hi].kind !== 'section') throw new EditRefused('line ' + b.section_line + ' is not a section header');
    const key = b.key === undefined ? null : b.key;
    const value = pyStrip(b.value || '');
    const own = doc.key_lines(doc.section_at(hi)).filter(l => ['ai_like', 'ai'].indexOf(pyLower(l.key_text() || '')) >= 0);
    if (own.length > 1 && key !== null) {
      throw new EditRefused(BOTH[pyLower(own[1].key_text())] + ' (line ' + (own[1].index + 1) + '): remove one of the two lines first');
    }
    if (key === null) {                 // clear: the section's own lines go (copy_of's value, or none, then)
      for (const l of own.slice().reverse()) doc.remove_line(l.index);
    } else {
      const c = { ai_keys_here: 0, ai_file: '', ai_like: 0 };
      const problem = chars.character_ai_key(c, key === 'ai_like', value, 0, value.length);
      if (problem) throw new EditRefused(problem);
      if (!own.length) doc.add_key(doc.section_at(hi), key, value);
      else if (pyLower(own[0].key_text()) === key) doc.set_value(own[0].index, value);
      else doc.replace_key(own[0].index, key, value);
    }
    ws.mark(CHARACTERS);
    const out = this.ai_overview();
    out.problems = this.problems_for(CHARACTERS);
    return out;
  }

  // ---- the Live tables (design 1.9): the worker's answer, with the editor's state of the moment ---------------------
  live_ctx() {
    const ctx = { game_dir: this.ws ? this.ws.game_dir : null, kernel_id: null, kernel: null, kernel_label: null };
    if (!this.ws) return ctx;
    try {
      const k = this.kernels();
      const kid = k.active_id();
      ctx.kernel_id = kid || null;
      if (kid) {
        ctx.kernel = k.get(kid);
        ctx.kernel_label = k.describe(kid).label;
      }
    } catch (e) {
      if (!(e instanceof kernels.KernelRefused)) throw e;
      ctx.kernel = null;
      ctx.kernel_label = null;
    }
    return ctx;
  }

  live_answer(route, body) {
    if (!this.o.live) return { refused: 'Live tables: there is no reader in this run' };
    let ctx;
    try {
      ctx = this.live_ctx();
    } catch (e) {
      return error_answer(e);
    }
    return this.o.live.request(route, body, ctx).then(r => (r && r.ok !== undefined ? { ok: to_plain(r.ok) } : r),
                                                       e => error_answer(e));
  }

  // ---- folders -------------------------------------------------------------------------------------------------------
  refuse_dirty(discard) {
    if (!this.ws || discard) return;
    const dirty = [...this.ws.docs.entries()].filter(([, e]) => e.dirty).map(([k]) => k)
      .concat([...this.pending_ai.keys()].map(n => 'ai/' + n + ' (staged)'));
    if (dirty.length) throw new PathRefused('unsaved changes in ' + dirty.join(', ') + ': save them, or discard them first');
  }

  open_folder(b) {
    this.refuse_dirty(b.discard);
    const picked = this.path_of(b.token);
    const config = config_dir_of(picked);
    const game = b.game ? this.path_of(b.game) : (this.o.argv && this.o.argv.game) || null;
    const ws = new Workspace(config, game);
    let mods = b.mods ? this.path_of(b.mods) : (this.o.argv && this.o.argv.mods) || null;
    if (!mods) {
      const sh = discover.seventh_heaven(ws.config_dir);
      mods = sh ? nodePath.join(sh, 'mods') : null;
    }
    this.ws = ws;
    this.folder = picked;
    this.mods_dir = mods;
    this._kernel = null;
    this._kernels = null;
    this._kernel_bytes = undefined;
    this.pending_ai = new Map();
    if (this.store) {
      // the folder is open: a settings file that cannot be written does not refuse it (portable mode in a read-only
      // folder); the page shows the reason through settings.problem
      try { this.store.remember(picked); } catch (e) { this.store.problem = unwritten(e, 'the folder is open but not remembered'); }
    }
    return this.state();
  }

  // a folder dropped on the first screen (the preload read its path): only from the app's own page, only a folder
  drop_token(p, sender_url) {
    if (typeof sender_url !== 'string' || !sender_url.startsWith(ORIGIN)) {
      return { refused: 'refused: the call did not come from the app\'s own page' };
    }
    let dir = false;
    try { dir = typeof p === 'string' && p.length < 4096 && fs.statSync(p).isDirectory(); } catch (e) { dir = false; }
    if (!dir) return { refused: 'drop a folder (the mod folder or its SpellExtConfig)' };
    return { token: this.token_for(p) };
  }

  recent() {
    const list = this.store ? this.store.get('recent') : [];
    return list.filter(r => r && typeof r.path === 'string').map(r => {
      let config = null;
      try { config = config_dir_of(r.path); } catch (e) { config = null; }
      return { token: this.token_for(r.path), path: r.path, last_opened: r.last_opened || null, exists: is_dir(r.path),
               config_found: config !== null, dll_beside: config !== null && has_dll_beside(config) };
    });
  }

  settings() {
    const d = this.store.data;
    return { confirm_save: d.confirm_save !== false, live_auto: !!d.live_auto, open_last: !!d.open_last,
             last_folder: d.last_folder || null, window: d.window || null, problem: this.store.problem };
  }

  game_running() {
    const [t, v] = this._running;
    if (Date.now() - t > 4000) {
      const now = safety.game_running();
      this._running = [Date.now(), now];
      return now;
    }
    return v;
  }

  state() {
    const versions = this.o.versions || { node: process.versions.node };
    const base = { folder: this.folder, versions, start_problem: this.start_problem,
                   argv_config: !!(this.o.argv && this.o.argv.config),
                   settings: this.store ? this.settings() : null };
    if (!this.ws) return Object.assign(base, { config_dir: null, files: [], dirty: [], banners: [] });
    const ws = this.ws;
    const sch = ws.schema;
    const running = this.game_running();
    const banners = [];
    if (running) banners.push('game_running');
    if (!ws.writable) banners.push('read_only');
    if (sch.is_bundled) banners.push('schema_bundled');
    const changed = [...ws.docs.keys()].filter(k => ws.changed_on_disk(k));
    if (changed.length) banners.push('changed_on_disk');
    return Object.assign(base, {
      config_dir: ws.config_dir, game_dir: ws.game_dir, mods_dir: this.mods_dir, writable: ws.writable,
      game_running: running, schema_bundled: sch.is_bundled,
      schema: { path: sch.path, bundled: sch.is_bundled, dll_source_sha1: sch.data.dll_source_sha1 },
      files: this.files_listed(ws), fields_file: ws.fields_file(), restart_text: RESTART_TEXT,
      dirty: [...ws.docs.entries()].filter(([, e]) => e.dirty).map(([k]) => k)
        .concat([...this.pending_ai.keys()].map(n => 'ai/' + n + '.txt').filter(k => !(ws.docs.has(k) && ws.docs.get(k).dirty))),
      pending_ai: [...this.pending_ai.keys()],
      changed_on_disk: changed, banners,
    });
  }

  // ws.list_files() and the documents made by create() and not on disk yet (an Add into a file the folder lacked): the
  // sidebar reaches them, so their Revert can be asked for
  files_listed(ws) {
    const files = ws.list_files();
    const have = new Set(files.map(f => f.path));
    for (const [rel, e] of ws.docs) {
      if (e.stamp !== null || have.has(rel) || fs.existsSync(ws.path(rel))) continue;
      const top = rel.indexOf('/') < 0;
      const entry = top ? ws.schema.file(rel, ws.fields_file()) : null;
      files.push({ path: rel, group: top ? 'config' : rel.split('/')[0], read_by_dll: !!entry,
                   title: entry && entry.title !== undefined ? entry.title : null, size: 0, dirty: e.dirty, created: true });
    }
    return files;
  }

  // ---- files (server.py) ---------------------------------------------------------------------------------------------
  rel(p) {
    return gate(this.need_ws(), p)[0];
  }

  refuse_readonly(rel) {
    const low = rel.toLowerCase();
    if (low.startsWith('readme/') || low.endsWith('.ai') || low.split('/').indexOf('..') >= 0) {
      throw new safety.WriteRefused(rel + ' is shown, not edited, here');
    }
  }

  kernel() {
    if (this._kernel === null) {
      const p = slots.kernel_path(this.ws.game_dir);
      const recs = p ? slots.read_kernel_records(p) : null;
      this._kernel = [recs, p];
    }
    return this._kernel;
  }

  reader_of(rel) {
    const ws = this.ws;
    const name = nodePath.posix.basename(rel);
    const ff = ws.fields_file();
    let entry = ws.schema.file(name, ff);
    if (pyLower(name) === 'ff7_spellext_spells_test.ini') entry = ws.schema.file('FF7_SpellExt_Spells.ini');
    let reader_name = name;
    if (ff && pyLower(name) === pyLower(ff)) reader_name = 'FF7_SpellExt_Fields.ini';
    if (pyLower(name) === 'ff7_spellext_spells_test.ini') reader_name = 'FF7_SpellExt_Spells.ini';
    let kinds = null;
    if (entry !== null && entry.grammar !== 'flat') kinds = header => validate.section_kind(reader_name, header);
    return [entry, reader_name, kinds];
  }

  file_view(rel, problems) {
    const ws = this.ws;
    const e = ws.open(rel);
    const doc = e.doc;
    const name = nodePath.posix.basename(rel);
    const [entry, reader_name, kinds] = this.reader_of(rel);
    const outline = doc.outline(kinds);
    for (const s of outline) {
      if (entry === null) s.kind = null;
      else if (entry.grammar === 'flat') s.kind = 'flat';
      else if (s.header === null) s.kind = null;
      else s.kind = validate.section_kind(reader_name, s.header);
      if (s.kind && Object.prototype.hasOwnProperty.call(slots.KINDS, s.kind) && !s.commented) {
        const [recs, kp] = this.kernel();
        s.slots = slots.model(slots.KINDS[s.kind], s.keys, recs, kp);
      }
    }
    if (problems === undefined) problems = this.problems_for(rel);
    if (same_name(rel, CHARACTERS) || same_name(rel, LIMITS)) this.link_outline(rel, outline);
    const lone = doc.lone_cr_line();
    return {
      path: rel, text: doc.text(), outline, dirty: e.dirty,
      schema_file: entry !== null ? name : null, grammar: entry ? (entry.grammar === undefined ? null : entry.grammar) : null,
      schema_name: entry !== null ? reader_name : null,
      readonly: pyLower(rel).startsWith('readme/') || pyLower(rel).endsWith('.ai'),
      read_by_dll: entry !== null,
      changed_on_disk: ws.changed_on_disk(rel), stamp: e.stamp, problems,
      raw_refused: lone ? 'line ' + lone + ' holds a CR not followed by LF: a text box cannot give it back' : null,
      newline: doc.majority_newline().replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
    };
  }

  // S6a (design 3.2, 4.9, 4.10): the Characters page's Linked strip (each character's limits group, AI and gear) and
  // the Limits page's leftover mark (a group whose character the characters file does not define)
  link_outline(rel, outline) {
    const f = this.tpl_folder();
    const groups = T.limit_groups(f);
    if (same_name(rel, LIMITS)) {
      const defined = new Set(T.live_ids(f, CHARACTERS).map(([n]) => n));
      for (const s of outline) {
        if (s.header === null || s.commented || !s.kind) continue;
        const n = gc_number(s.header);
        s.group = n;
        s.leftover = n !== null && !defined.has(n);
      }
      return;
    }
    const names = new Set(this.ai_names(true).map(x => pyLower(x)));
    const users = new Map(aicards.character_ai(this.ai_texts(), [...names]).map(c => [c.id, c]));
    for (const s of outline) {
      if (s.header === null || s.commented || s.kind !== 'character') continue;
      const n = gc_number(s.header);
      const c = users.get(n);
      const eff = c ? c.effective : null;
      const gear = [];
      for (const g of T.character_checks(f, n).equip_lines) gear.push({ file: g.file, header: g.header, line: g.line });
      s.linked = {
        limits: groups.get(n) || [],
        ai: eff === null ? null : { key: eff.key, value: eff.value,
                                    exists: eff.key === 'ai' ? names.has(pyLower(eff.value)) : null,
                                    pending: eff.key === 'ai' ? [...this.pending_ai.keys()].some(x => pyLower(x) === pyLower(eff.value)) : null },
        gear,
      };
    }
  }

  // the tool's own warnings on a file's page (never the DLL's: they are not in the Forecast): a characters file whose
  // ai = names a file the ai folder lacks; a limits group whose character is not defined
  tool_problems(rel) {
    const out = [];
    if (same_name(rel, CHARACTERS)) {
      const names = new Set(this.ai_names(true).map(x => pyLower(x)));
      for (const k of this.pending_ai.keys()) names.add(pyLower(k));
      for (const c of aicards.character_ai(this.ai_texts(), [...names])) {
        const e = c.effective;
        if (e && e.key === 'ai' && e.missing) {
          const l = c.own.find(x => x.key === 'ai');
          out.push({ file: rel, line: l ? l.line : c.header_line, kind: 'tool', fmt: null,
                     text: 'character [' + c.id + '] names ai = ' + e.value + ', which does not exist (ai\\' + e.value + '.ai)' });
        }
      }
    }
    if (same_name(rel, LIMITS)) {
      const f = this.tpl_folder();
      for (const g of T.leftover_groups(f)) {
        out.push({ file: rel, line: g.sections[0].line, kind: 'tool', fmt: null,
                   text: 'limits group ' + g.id + ' has no character [' + g.id + '] in the characters file (a character made at ' +
                         g.id + ' would adopt it)' });
      }
    }
    return out;
  }

  problems_for(rel) {
    const name = nodePath.posix.basename(rel);
    if (rel.indexOf('/') >= 0) return [];
    if (same_name(rel, CHARACTERS) || same_name(rel, LIMITS)) return this.problems_for_dll(rel).concat(this.tool_problems(rel));
    return this.problems_for_dll(rel);
  }

  problems_for_dll(rel) {
    const name = nodePath.posix.basename(rel);
    if (rel.indexOf('/') >= 0) return [];
    const allp = this.ws.check();
    const ff = this.ws.fields_file();
    const out = [];
    for (const [, probs] of allp) {
      for (const p of probs) {
        const pf = p.file;
        if (pyLower(pf) === pyLower(name) ||
            (ff && pyLower(name) === pyLower(ff) && pyLower(pf) === 'ff7_spellext_fields.ini')) out.push(p);
      }
    }
    return out;
  }

  raw(b) {
    const rel = this.rel(b.path);
    const e = this.ws.open(rel);
    this.refuse_readonly(rel);
    refuse_wide_chars(b.text);
    e.doc.apply_edited_text(b.text);     // a text box gives LF only: unchanged lines keep CRLF
    this.ws.mark(rel);
    return this.file_view(rel);
  }

  apply_text(b) {
    const rel = this.rel(b.path);
    const e = this.ws.open(rel);
    this.refuse_readonly(rel);
    if (b.last < b.first - 1) throw new EditRefused('lines ' + b.first + ' to ' + b.last + ' are not a range');
    if (b.last > e.doc.lines.length) {
      throw new EditRefused('lines ' + b.first + ' to ' + b.last + ' are not in the file (it has ' + e.doc.lines.length + ')');
    }
    refuse_wide_chars(b.text);
    e.doc.apply_edited_text(b.text, b.first - 1, b.last - 1);
    this.ws.mark(rel);
    return this.file_view(rel);
  }

  edit(body) {
    const ws = this.ws;
    const rel = this.rel(body.path);
    const e = ws.open(rel);
    this.refuse_readonly(rel);
    const doc = e.doc;
    const op = body.op;
    const n = doc.lines.length;
    for (const k of ['line', 'section_line']) {
      if (typeof body[k] === 'number' && body[k] > n) {
        throw new EditRefused(k.replace('_', ' ') + ' ' + body[k] + ' is not in the file (it has ' + n + ' lines)');
      }
    }
    const idx = typeof body.line === 'number' ? body.line - 1 : null;
    const entry = ws.schema.file(nodePath.posix.basename(rel), ws.fields_file());
    const flat = Boolean(entry) && entry.grammar === 'flat';
    if (pyLower(nodePath.posix.basename(rel)) === 'ff7_spellext_characters.ini') refuse_both_ai_keys(doc, body);
    const val = k => (body[k] === undefined ? null : body[k]);
    if (op === 'set') doc.set_value(idx, body.value);
    else if (op === 'remove') doc.remove_line(idx);
    else if (op === 'comment') doc.comment_out(idx);
    else if (op === 'uncomment') doc.uncomment(idx);
    else if (op === 'add_key') {
      const hdr = val('section_line');
      if (flat && !hdr) edit.set_key(doc, null, body.key, body.value, true);
      else doc.add_key(doc.section_at(hdr ? hdr - 1 : null), body.key, body.value);
    } else if (op === 'set_key') edit.set_key(doc, val('header'), body.key, body.value, flat);
    else if (op === 'remove_key') edit.remove_key(doc, val('header'), body.key, flat, Boolean(body.comment));
    else if (op === 'set_slots') {
      const sl = body.section_line;
      const hdr = doc.lines[sl - 1].header_text();
      if (hdr === null) throw new EditRefused('line ' + sl + ' is not a section header');
      const sk = validate.section_kind(nodePath.posix.basename(rel), hdr) || '';
      const kind = Object.prototype.hasOwnProperty.call(slots.KINDS, sk) ? slots.KINDS[sk] : undefined;
      if (kind === undefined) throw new EditRefused(hdr + ' is not a weapon or armour section');
      const bytes = body.slots.slice();
      const [line, why] = slots.encode(bytes);
      if (line === null) throw new EditRefused('no slots line gives that: ' + why);
      const [got, problem] = slots.apply_slots_line(line, [0, 0, 0, 0, 0, 0, 0, 0], slots.LAYOUT[kind].too_many);
      if (problem) throw new EditRefused(problem);
      if (got.join(',') !== bytes.join(',')) throw new Error('slots encode did not round-trip: ' + got + ' / ' + bytes);
      edit.set_key(doc, hdr, 'slots', line);
    } else if (op === 'add_section') doc.add_section(body.header, (body.keys || []).map(([k, v]) => [k, v]));
    else if (op === 'remove_section' && body.with_limits && same_name(rel, CHARACTERS)) this.remove_with_limits(doc, body.section_line - 1);
    else if (op === 'remove_section') doc.remove_section(body.section_line - 1, this.reader_of(rel)[2]);
    else if (op === 'comment_block' || op === 'uncomment_block') {
      const kinds = this.reader_of(rel)[2];
      if (kinds === null) throw new EditRefused('this file has no sections the DLL reads');
      if (op === 'comment_block') doc.comment_out_block(body.section_line - 1, kinds);
      else doc.uncomment_block(body.section_line - 1, kinds);
    }
    ws.mark(rel);
    return this.file_view(rel);
  }

  // remove-together (design 4.9): the character section and its limits group as one change across both files (both
  // worked out on copies first, then taken together)
  remove_with_limits(doc, hi) {
    const ws = this.ws;
    if (hi >= doc.lines.length || doc.lines[hi].kind !== 'section') throw new EditRefused('line ' + (hi + 1) + ' is not a section header');
    const n = gc_number(doc.lines[hi].header_text());
    if (n === null) throw new EditRefused(doc.lines[hi].header_text() + ' is not a character section');
    const ce = [...ws.docs.entries()].find(([k]) => same_name(k, CHARACTERS))[1];
    const cdoc = new Document(doc.serialize());
    cdoc.remove_section(hi, this.reader_of(CHARACTERS)[2]);
    let le = null;
    let ldoc = null;
    const lrel = known_name(ws, LIMITS);
    if (fs.existsSync(ws.path(lrel)) || ws.docs.has(lrel)) {
      le = ws.open(lrel);
      ldoc = new Document(le.doc.serialize());
      const kinds = this.reader_of(LIMITS)[2];
      const heads = [];
      for (const l of ldoc.lines) {
        if (l.kind !== 'section') continue;
        const sk = validate.section_kind(LIMITS, l.header_text());
        if (['character', 'limit', 'set_limit', 'state'].indexOf(sk) >= 0 && gc_number(l.header_text()) === n) heads.push(l.index);
      }
      for (const i of heads.reverse()) ldoc.remove_section(i, kinds);
      if (!heads.length) le = null;
    }
    ce.doc = cdoc;
    if (le !== null) {
      le.doc = ldoc;
      ws.mark(lrel);
    }
  }

  log() {
    const ws = this.need_ws();
    const ff = ws.fields_file();
    const log = gamelog.read(ws.game_dir, ff);
    if (log === null) return { log: null, game_dir: ws.game_dir };
    const probs = [];
    for (const [, ps] of ws.check()) for (const p of ps) probs.push(p);
    const [agree, only_tool, only_log] = gamelog.compare(probs, log);
    const newer = [];
    for (const f of ws.list_files()) {
      if (f.group === 'config' && f.read_by_dll) {
        const st = fs.statSync(ws.path(f.path), { bigint: true });
        const mt = Number(st.mtimeNs / 1000000000n) + Number(st.mtimeNs % 1000000000n) * 1e-9;
        if (mt > log.mtime) newer.push(f.path);
      }
    }
    return { log, agree, only_tool, only_log, files_newer_than_log: newer };
  }
}

const LIMITS = 'FF7_SpellExt_Limits.ini';
const same_name = (rel, name) => pyLower(rel) === pyLower(name);

// the character number of a header [N ...] (the readers' parse_number after the bracket), or null
function gc_number(header) {
  const [ok, , n] = grammar.parse_number(header, 1, header.length);
  return ok ? n : null;
}

// The built-in templates (core/data/builtin_templates.txt), parsed once
let BUILTIN_LIB = null;
export function builtin() {
  if (BUILTIN_LIB === null) BUILTIN_LIB = T.load_builtin();
  return BUILTIN_LIB;
}

// The template ids of a templates file's text, a template with a parse problem included
function user_ids(text) {
  return new Set((text ? T.parse(text).blocks : []).map(b => b[2]).filter(i => i !== null));
}

// The workspace's spelling of a top-level file name (the on-disk name when it differs in case only)
function known_name(ws, name) {
  for (const f of ws.list_files()) if (f.path.indexOf('/') < 0 && pyLower(f.path) === pyLower(name)) return f.path;
  return name;
}

// file.raw / file.apply_text: a char above 255 cannot be a byte of the file (Python failed here with a 500; the port
// refuses with the line it is on: design 2.6)
export function refuse_wide_chars(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text.codePointAt(i);
    if (c > 0xff) {
      let line = 1;
      for (let j = 0; j < i; j++) if (text.charCodeAt(j) === 10) line++;
      const u = 'U+' + c.toString(16).toUpperCase().padStart(4, '0');
      throw new EditRefused('the file cannot hold ' + u + ' at line ' + line + ': the DLL reads bytes');
    }
  }
}

// server.py _refuse_both_ai_keys: a generic form edit that would put ai_like and ai in one section is refused with
// the DLL's words.
export function refuse_both_ai_keys(doc, body) {
  const op = body.op;
  let key = null;
  let hdr_index = null;
  if (op === 'add_key' || op === 'set_key') {
    key = pyLower(body.key || '');
    hdr_index = body.section_line ? body.section_line - 1 : null;
    if (op === 'set_key' && body.header) {
      const s = edit.find_section(doc, body.header);
      hdr_index = s ? s.header_index : null;
    }
  } else if (op === 'uncomment') {
    const probe = pyLstrip(doc.lines[body.line - 1].body, ' \t').slice(1);
    key = probe.indexOf('=') >= 0 ? pyLower(pyStrip(probe.split('=')[0])) : null;
    hdr_index = null;
    for (const s of doc.sections()) {
      if (s.first <= body.line - 1 && body.line - 1 <= s.last) hdr_index = s.header_index;
    }
  }
  if ((key !== 'ai_like' && key !== 'ai') || hdr_index === null) return;
  const other = key === 'ai_like' ? 'ai' : 'ai_like';
  const own = doc.key_lines(doc.section_at(hdr_index)).filter(l => {
    const k = pyLower(l.key_text() || '');
    return k === 'ai_like' || k === 'ai';
  });
  if (own.some(l => pyLower(l.key_text()) === other)) throw new EditRefused(BOTH[key]);
}

// The error mapping of design 1.3: a refusal is the tool's or the DLL's own words; anything else is a tool bug.
export function error_answer(e) {
  const name = e && e.name;
  if (e instanceof BadRequest) return { refused: e.message };
  if (e instanceof EditRefused || e instanceof safety.WriteRefused || e instanceof PathRefused ||
      e instanceof T.TemplateProblem ||
      name === 'ValueError' || name === 'FileNotFoundError' || name === 'UnicodeEncodeError' ||
      name === 'KernelRefused' || name === 'AIError' || name === 'CardRefused' || name === 'RecipeError' ||
      name === 'LZMAError' ||
      (e && (e.code === 'ENOENT' || e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'EISDIR'))) {
    return { refused: e.message };
  }
  return { bug: (name || 'Error') + ': ' + (e && e.message), stack: e && e.stack ? String(e.stack) : '' };
}

export { CHARACTERS };
