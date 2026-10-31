// The SpellExtConfig folder as one workspace: its files, the open documents with their unsaved edits, checks of the
// whole folder in the DLL's order, and saves through safety.js (port of sxcfg/workspace.py).
import fs from 'node:fs';
import * as discover from './discover.js';
import * as safety from './safety.js';
import * as validate from './validate.js';
import './rules/index.js';
import { Document } from './document.js';
import { Schema } from './schema.js';
import { pyJoin, pyRealpath, pyCommonpath, pyIsdir, pyIsfile, pyExists, pyListdir, pyLower, pyCmp } from './py.js';

export const TEXT_DIRS = ['cameras', 'effects', 'ai'];     // text the DLL reads (ai: the .txt are this tool's sources)
export const VIEW_DIRS = ['Readme'];                        // shown, never written by the form
export const SKIP_DIRS = ['Backups', 'cache', 'files'];

// sorted(names, key=str.lower): stable, by code point
function sortedLower(names) {
  return names.map((n, i) => [pyLower(n), i, n]).sort((a, b) => pyCmp(a[0], b[0]) || (a[1] - b[1])).map(x => x[2]);
}

export class Workspace {
  constructor(config_dir, game_dir) {
    this.config_dir = pyRealpath(config_dir);
    if (!pyIsdir(this.config_dir)) {
      const e = new Error('no such folder: ' + config_dir);
      e.name = 'FileNotFoundError';
      throw e;
    }
    this.schema = Schema.load(this.config_dir);
    this.game_dir = discover.game_dir(this.config_dir, game_dir);
    this.docs = new Map();      // relative path -> {doc: Document, stamp: [mtime, size], dirty: bool, saved_bytes}
    this.writable = accessW(this.config_dir);
  }

  // ---- files -------------------------------------------------------------------------------------------------------
  path(rel) {
    const p = pyRealpath(pyJoin(this.config_dir, rel));
    if (pyCommonpath([this.config_dir, p]) !== this.config_dir) {
      const e = new Error('outside the config folder: ' + rel);
      e.name = 'ValueError';
      throw e;
    }
    return p;
  }

  fields_file() {
    try {
      return discover.fields_file_name(this.text('FF7_SpellExt_Game.ini'));
    } catch (e) {
      if (e.code) return null;      // OSError
      throw e;
    }
  }

  list_files() {
    const out = [];
    const ff = this.fields_file();
    for (const name of sortedLower(pyListdir(this.config_dir))) {
      const p = pyJoin(this.config_dir, name);
      if (!pyIsfile(p)) continue;
      let entry = this.schema.file(name, ff);
      let read_by_dll = entry !== null && (pyLower(name) !== 'ff7_spellext_fields.ini' ||
                                           pyLower(ff || '') === pyLower(name));
      if (pyLower(name) === 'ff7_spellext_spells_test.ini') {
        read_by_dll = true;
        entry = this.schema.file('FF7_SpellExt_Spells.ini');
      }
      out.push({ path: name, group: 'config', read_by_dll, title: truthy(entry) && entry.title !== undefined ? entry.title : null,
                 size: fs.statSync(p).size, dirty: this.docs.has(name) ? this.docs.get(name).dirty : false });
    }
    for (const d of TEXT_DIRS.concat(VIEW_DIRS)) {
      const folder = pyJoin(this.config_dir, d);
      if (!pyIsdir(folder)) continue;
      for (const name of sortedLower(pyListdir(folder))) {
        const p = pyJoin(folder, name);
        if (!pyIsfile(p)) continue;
        const rel = d + '/' + name;
        const low = pyLower(name);
        if (d === 'ai' && !(low.endsWith('.txt') || low.endsWith('.ai'))) continue;
        if (d !== 'ai' && !low.endsWith('.txt') && !low.endsWith('.json')) continue;
        out.push({ path: rel, group: d, read_by_dll: d === 'cameras' || d === 'effects' || low.endsWith('.ai'),
                   title: null, size: fs.statSync(p).size, readonly: VIEW_DIRS.indexOf(d) >= 0 || low.endsWith('.ai'),
                   dirty: this.docs.has(rel) ? this.docs.get(rel).dirty : false });
      }
    }
    return out;
  }

  open(rel, reload) {
    if (this.docs.has(rel) && !reload) return this.docs.get(rel);
    const p = this.path(rel);
    const data = fs.readFileSync(p);
    const st = safety.stamp(p);
    this.docs.set(rel, { doc: new Document(data), stamp: st, dirty: false, saved_bytes: data });
    return this.docs.get(rel);
  }

  // An empty document for a file the folder does not have yet (a template's .ini, the templates file): written by its
  // first save. Until then changed_on_disk says whether a file appeared there meanwhile.
  create(rel) {
    const p = this.path(rel);
    if (pyExists(p) || this.docs.has(rel)) return this.open(rel);
    this.docs.set(rel, { doc: new Document(Buffer.alloc(0)), stamp: null, dirty: false, saved_bytes: Buffer.alloc(0) });
    return this.docs.get(rel);
  }

  // The file's text as it stands in the workspace (unsaved edits included).
  text(rel) {
    if (this.docs.has(rel)) return this.docs.get(rel).doc.text();
    return fs.readFileSync(this.path(rel)).toString('latin1');
  }

  mark(rel) {
    const e = this.docs.get(rel);
    e.dirty = !e.doc.serialize().equals(e.saved_bytes);
  }

  changed_on_disk(rel) {
    const e = this.docs.get(rel);
    if (!e) return false;
    const p = this.path(rel);
    if (e.stamp === null) return pyExists(p);      // made by create(): nothing was on disk
    return !pyExists(p) || !safety.same_stamp(safety.stamp(p), e.stamp);
  }

  // ---- checks ------------------------------------------------------------------------------------------------------
  // Every file a reader reads, by the name the DLL reads it under, as it stands in the workspace (a Map, in the
  // folder's own order, as Python's dict).
  texts() {
    const out = new Map();
    const ff = this.fields_file();
    for (const name of pyListdir(this.config_dir)) {
      const p = pyJoin(this.config_dir, name);
      if (pyIsfile(p) && (truthy(this.schema.file(name)) || pyLower(name) === 'ff7_spellext_spells_test.ini' ||
                          (ff && pyLower(name) === pyLower(ff)))) {
        out.set(name, this.text(name));
      }
    }
    // a file made by create() and not saved yet (the readers read it as it stands)
    for (const [rel, e] of this.docs) {
      if (e.stamp === null && rel.indexOf('/') < 0 && !out.has(rel) && truthy(this.schema.file(rel))) out.set(rel, e.doc.text());
    }
    // the fields reader is registered under the default name: hand it the file the game file names
    if (ff && pyLower(ff) !== 'ff7_spellext_fields.ini') {
      const low = lowerMap(out);
      if (low.has(pyLower(ff))) out.set('FF7_SpellExt_Fields.ini', out.get(low.get(pyLower(ff))));
      else if (low.has('ff7_spellext_fields.ini')) out.delete(low.get('ff7_spellext_fields.ini'));
    } else if (!ff) {
      const low = lowerMap(out);
      if (low.has('ff7_spellext_fields.ini')) out.delete(low.get('ff7_spellext_fields.ini'));
    }
    return out;
  }

  check() {
    const res = validate.check_folder(this.texts());
    const out = new Map();
    for (const [f, probs] of res) out.set(f, probs.map(p => p.as_dict()));
    return out;
  }

  // ---- saving ------------------------------------------------------------------------------------------------------
  save(rel) {
    const e = this.docs.get(rel);
    if (!this.writable) throw new safety.WriteRefused('the config folder is not writable: read-only mode');
    const data = e.doc.serialize();
    const [backup, st] = safety.atomic_write(this.config_dir, this.path(rel), data, e.stamp);
    e.stamp = st;
    e.saved_bytes = data;
    e.dirty = false;
    return backup;
  }
}

function lowerMap(m) {
  const low = new Map();
  for (const k of m.keys()) low.set(pyLower(k), k);
  return low;
}

// Python's truth of a schema entry (a dict: empty is false)
function truthy(x) {
  return x !== null && x !== undefined && !(typeof x === 'object' && Object.keys(x).length === 0);
}

function accessW(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}
