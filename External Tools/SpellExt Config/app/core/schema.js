// spellext_schema.json: per file, its reader, sections and keys (type, values, range, default, help, takes-effect,
// the DLL's messages). The schema shipped beside the DLL (SpellExtConfig/Readme/spellext_schema.json) is preferred;
// the copy in data/ is the fallback (port of sxcfg/schema.py).
import fs from 'node:fs';
import { pyJoin, pyIsfile, pyRealpath, pyLower } from './py.js';

export const BUNDLED = pyJoin(import.meta.dirname, 'data', 'spellext_schema.json');

export const RESTART_TEXT = {
  hot: 'read again by "Re-init .ini files"',
  first_reading: 'start-up only: a change needs a restart (the log says it STAYS)',
  restart: 'read when the game starts: restart for a change',
  on_load: 'acts at every load of a save',
  next_battle: 'acts from the next battle',
};

export class Schema {
  constructor(data, path) {
    this.data = data;
    this.path = path;
    // lower-case name -> [name, entry]
    this.files = new Map(Object.entries(data.files || {}).map(([k, v]) => [pyLower(k), [k, v]]));
  }

  static load(config_dir) {
    if (config_dir) {
      const shipped = pyJoin(config_dir, 'Readme', 'spellext_schema.json');
      if (pyIsfile(shipped)) return new Schema(JSON.parse(fs.readFileSync(shipped, 'utf8')), shipped);
    }
    return new Schema(JSON.parse(fs.readFileSync(BUNDLED, 'utf8')), BUNDLED);
  }

  get is_bundled() {
    return pyRealpath(this.path) === pyRealpath(BUNDLED);
  }

  // The schema entry of a file name (case-insensitive). The fields file is whatever the game file names.
  file(name, fields_file) {
    const hit = this.files.get(pyLower(name));
    if (hit) return hit[1];
    if (fields_file && pyLower(name) === pyLower(fields_file)) {
      const f = this.files.get('ff7_spellext_fields.ini');
      return f ? f[1] : null;
    }
    return null;
  }

  kind(entry, kind_name) {
    for (const s of entry.sections || []) {
      if (s.kind === kind_name) return s;
    }
    return null;
  }

  // A key's spec in a section kind: by name, alias, or prefix family (byte_NN ...).
  static key(section_kind, key) {
    if (!section_kind) return null;
    const k = pyLower(key);
    for (const spec of section_kind.keys || []) {
      if (spec.name === k || (spec.aliases || []).indexOf(k) >= 0) return spec;
    }
    for (const spec of section_kind.keys || []) {
      if (spec.prefix && k.startsWith(spec.name)) return spec;
    }
    return null;
  }

  all_messages(name) {
    const e = this.file(name);
    return new Set(e ? (e.messages || []) : []);
  }
}
