// The port of sxcfg/liveapi.py: the Live tables page's routes (read only): live.status, live.tables, live.table,
// live.compare, live.find.
//
// They run in a worker thread (main/liveworker.js), never on the editor's thread: every request finds the game, reads
// its maps, opens /proc/<pid>/mem read-only for the request and closes it after, with a reading budget of 0.5 s.
// The editor's own state (the game folder, the kernel chosen on the AI page) comes with each request as `app`:
//   app.game_dir()   the game folder or null
//   app.kernel()     [KERNEL.BIN bytes, its label] of the chosen kernel, or [null, null]
//   app.kernel_id()  the chosen kernel's id or null
// Nothing is cached across requests but the log text and the kernel2.bin texts (each by its size and time) and
// whether the game ran last time.
// Node 22 language level.
import fs from 'node:fs';
import * as live from './live.js';
import * as livetables from './livetables.js';
import { MAX_KERNEL } from './kernels.js';
import { LOG_NAME } from './gamelog.js';
import { pyJoin, pyBasename, pyDirname, pyIsdir, pyIsfile, pyLower, pyCmp, pyInt, pyScandir, PyValueError } from './py.js';

// Python's KeyError: str() of it is the repr of its argument
export class LiveKeyError extends Error {
  constructor(key) {
    super("'" + key + "'");
    this.name = 'KeyError';
    this.key = key;
  }
}

// Where the reader looks: replaced by the tests with a fake /proc and a fake pgrep, and on Windows by the helper
export class Env {
  constructor(o) {
    o = o || {};
    this.proc = o.proc || '/proc';
    this.find_pid = o.find_pid || (() => live.find_pid());
    this.scope = o.scope || (() => live.ptrace_scope());
    this.log_path = o.log_path || null;
    this.read_maps = o.read_maps || ((pid, proc) => live.read_maps(pid, proc));
    this.process = o.process || ((pid, maps, proc, scope, budget) => new live.Process(pid, maps, proc, scope, budget));
  }
}

function stat_key(p) {
  const st = fs.statSync(p, { bigint: true });
  return [p, st.size, st.mtimeNs].map(String).join('\0');
}

// glob.glob(DIR/*): the entries of DIR not starting with '.', in the directory's own order
function glob_star(dir) {
  try {
    return pyScandir(dir).filter(e => !e.name.startsWith('.')).map(e => pyJoin(dir, e.name));
  } catch (e) {
    return [];
  }
}

export class LiveApi {
  constructor(app, env) {
    this.app = app;
    this.env = env || new Env();
    this._log = [null, ''];
    this._was_running = false;
    this._scanned = [null, null];     // [pid, address] the marker scan found: used for that game only
    this._texts = [null, null];       // [key, texts_file] of the last kernel2.bin read
  }

  // ---- the editor's state ------------------------------------------------------------------------------------------
  _game_dir() { return this.app.game_dir(); }

  _kernel() { return this.app.kernel(); }

  _kernel_id() { return this.app.kernel_id(); }

  // {sections, label}: the kernel texts from a file, for when the game's are not at 009a13c8 (under FFNx, always).
  // A kernel2.bin beside the KERNEL.BIN chosen on the AI page, else the game folder's; else that KERNEL.BIN's own
  // text sections. null when there is none. Only read; kept while the file is unchanged.
  _texts_file() {
    let paths = [];
    const kid = this._kernel_id();
    const gd = this._game_dir();
    if (kid && kid.startsWith('file:')) {
      const d = pyDirname(kid.slice(5));
      const names = pyIsdir(d) ? pyScandir(d).map(e => e.name) : [];
      paths = paths.concat(names.filter(f => pyLower(f) === 'kernel2.bin').map(f => pyJoin(d, f)).sort(pyCmp));
    }
    if (gd) {
      const langs = glob_star(pyJoin(gd, 'data')).filter(p => pyBasename(p).startsWith('lang-'));
      let found = [];
      for (const l of langs) found = found.concat(glob_star(pyJoin(l, 'kernel')));
      found = found.filter(p => pyLower(pyBasename(p)) === 'kernel2.bin');
      found.sort((a, b) => {
        const x = pyLower(a).indexOf('lang-en') < 0 ? 1 : 0;
        const y = pyLower(b).indexOf('lang-en') < 0 ? 1 : 0;
        return x - y || pyCmp(a, b);
      });
      paths = paths.concat(found);
      paths = paths.concat(glob_star(pyJoin(gd, 'data', 'kernel')).filter(p => pyLower(pyBasename(p)) === 'kernel2.bin'));
    }
    for (const p of paths) {
      try {
        const st = fs.statSync(p);
        const key = stat_key(p);
        if (this._texts[0] === key) return this._texts[1];
        if (st.size > MAX_KERNEL) continue;
        const tf = { sections: livetables.kernel2_bin_sections(fs.readFileSync(p)), label: p };
        this._texts = [key, tf];
        return tf;
      } catch (e) {
        if (e.code || e.name === 'ValueError' || e.name === 'IndexError') continue;
        throw e;
      }
    }
    const [kernel, label] = this._kernel();
    if (kernel && kernel.length) {
      try {
        return { sections: livetables.kernel_bin_text_sections(kernel),
                 label: 'the text sections of the KERNEL.BIN chosen on the AI page (' + (label || 'no label') + ')' };
      } catch (e) {          // a kernel ai_tool cannot read
        return null;
      }
    }
    return null;
  }

  // The request's Names, with the file texts attached when the game's are not readable live
  _names(proc, d) {
    const names = new livetables.Names(proc, d);
    if (!names.loaded()) names.texts_file = this._texts_file();
    return names;
  }

  log_text() {
    const gd = this._game_dir();
    const p = this.env.log_path || (gd ? pyJoin(gd, LOG_NAME) : null);
    if (!p || !pyIsfile(p)) return '';
    const key = stat_key(p);
    if (this._log[0] === key) return this._log[1];
    const text = fs.readFileSync(p).toString('latin1');
    this._log = [key, text];
    return text;
  }

  // ---- a request ---------------------------------------------------------------------------------------------------
  _open(budget) {
    const pid = this.env.find_pid();
    if (pid === null || pid === undefined) throw new live.LiveNotRunning('FF7 is not running');
    const maps = this.env.read_maps(pid, this.env.proc);
    return this.env.process(pid, maps, this.env.proc, this.env.scope(), budget === undefined ? live.BUDGET : budget);
  }

  // [locate result, directory or null]; a rebuild in progress is reported, not thrown
  _directory(proc) {
    let loc;
    try {
      loc = live.locate_directory(proc, this.log_text());
    } catch (e) {
      if (e instanceof live.LiveRebuilt) {
        return [{ found_by: 'none', rebuilding: true, why: [e.message], base: null, base_from: null, directory: null }, null];
      }
      throw e;
    }
    const [pid, a] = this._scanned;
    if (loc.directory === null && a !== null && pid === proc.pid) {
      try {
        loc.directory = live.directory(proc, a);
        loc.found_by = 'scan';
      } catch (e) {
        if (!(e instanceof live.LiveError)) throw e;
        loc.why.push('the scan found ' + live.x08(a) + ': ' + e.message);
      }
    }
    return [loc, loc.directory];
  }

  handle(route, q) {
    q = q || {};
    if (route === 'live.status') return this.status();
    if (route === 'live.tables') return this.tables();
    if (route === 'live.table') return this.table(q);
    if (route === 'live.compare') return this.compare(q);
    if (route === 'live.find') return this.find(q);
    throw new LiveKeyError('/api/live/' + String(route).slice(5));
  }

  status() {
    const scope = this.env.scope();
    const pid = this.env.find_pid();
    const st = { running: pid !== null && pid !== undefined, pid: pid === undefined ? null : pid, ptrace_scope: scope, stopped: false };
    st.stopped = this._was_running && !st.running;
    this._was_running = st.running;
    if (!st.running) {
      Object.assign(st, { mem: 'none', message: 'FF7 is not running' });
      return st;
    }
    let maps;
    try {
      maps = this.env.read_maps(pid, this.env.proc);
    } catch (e) {
      if (e instanceof live.LiveNotRunning) {
        Object.assign(st, { running: false, mem: 'none', message: e.message });
        return st;
      }
      if (e instanceof live.LiveRefused) {
        Object.assign(st, { mem: 'refused', mem_text: e.message });
        return st;
      }
      throw e;
    }
    const proc = this.env.process(pid, maps, this.env.proc, scope, live.BUDGET);
    try {
      try {
        const b = proc.read(live.EXE_BASE, 2);
        st.exe_base_ok = b[0] === 0x4d && b[1] === 0x5a;
        st.mem = 'ok';
      } catch (e) {
        if (e instanceof live.LiveRefused) {
          Object.assign(st, { mem: 'refused', mem_text: e.message });
          return st;
        }
        if (e instanceof live.LiveUnmapped) {
          Object.assign(st, { mem: 'unmapped', mem_text: e.message });
          return st;
        }
        if (e instanceof live.LiveError) {
          Object.assign(st, { mem: 'unreadable', mem_text: e.message });
          return st;
        }
        throw e;
      }
      const [loc, d] = this._directory(proc);
      const dll = { found_by: loc.found_by, base: loc.base, base_from: loc.base_from, why: loc.why,
                    rebuilding: loc.rebuilding || false, directory: null };
      if (d) {
        dll.directory = { address: d.address, version: d.version, entries: d.entry_count, generation: d.generation,
                          refreshed: d.refreshed, config: d.config, dll_base: d.dll_base, exe_base: d.exe_base };
      }
      st.dll = dll;
      let rng = null;
      if (loc.base !== null) {
        try {
          rng = [loc.base, loc.base + live.pe_image_size(proc, loc.base)];
        } catch (e) {
          if (!(e instanceof live.LiveError)) throw e;
          rng = null;
        }
      }
      const ptrs = [];
      for (let i = 0; i < 9; i++) {
        try {
          const a = livetables.kernel_pointer(proc, i + 1);
          ptrs.push({ section: i + 1, title: livetables.KERNEL_TITLES[i], address: a,
                      owner: livetables.owner_of(a, livetables.KERNEL_EXE[i], d, rng) });
        } catch (e) {
          if (!(e instanceof live.LiveError)) throw e;
          ptrs.push({ section: i + 1, title: livetables.KERNEL_TITLES[i], error: e.message });
        }
      }
      st.kernel_pointers = ptrs;
      const names = this._names(proc, d);
      st.texts_loaded = names.loaded();
      st.texts_ffnx = Boolean(!st.texts_loaded && names.replaced());
      st.texts_text = names.why_not_loaded();
      st.texts_from = names.texts_file && !st.texts_loaded ? names.texts_file.label : null;
      try {
        st.mode = { savemap_mode: proc.u16(livetables.SAVE_MODE), paused: proc.u32(livetables.PAUSE) };
      } catch (e) {
        if (!(e instanceof live.LiveError)) throw e;
        st.mode = null;
      }
    } finally {
      proc.close();
    }
    return st;
  }

  tables() {
    const proc = this._open();
    try {
      const [loc, d] = this._directory(proc);
      return { vanilla: livetables.vanilla_list(proc, d), spellext: d ? livetables.dll_list(proc, d) : [],
               found_by: loc.found_by, why: loc.why, rebuilding: loc.rebuilding || false, groups: livetables.GROUPS };
    } finally {
      proc.close();
    }
  }

  static _ints(q, key, dflt, lo, hi) {
    const x = Object.prototype.hasOwnProperty.call(q, key) && q[key] !== undefined ? q[key] : dflt;
    let v;
    try {
      if (typeof x === 'number' && Number.isInteger(x)) v = x;
      else if (typeof x === 'string') v = pyInt(x, 10);
      else throw new TypeError('not a number');
    } catch (e) {
      throw new PyValueError(key + ' must be a number');
    }
    return Number(v < lo ? lo : v > hi ? hi : v);
  }

  table(q) {
    const tid = q.id || '';
    const first = LiveApi._ints(q, 'from', 0, 0, 2 ** 31);
    const want = LiveApi._ints(q, 'count', 64, 0, livetables.ROW_CAP);
    const raw = ['1', 'true', 'yes'].indexOf(q.raw) >= 0;
    const proc = this._open();
    try {
      const [loc, d] = this._directory(proc);
      const names = this._names(proc, d);
      try {
        if (tid.startsWith('sx:')) {
          if (d === null && loc.rebuilding) {
            const n = tid.slice(3);
            return { id: tid, name: n, title: Object.prototype.hasOwnProperty.call(livetables.DLL_TITLES, n) ? livetables.DLL_TITLES[n] : n,
                     kind: 'table', valid: 'always', valid_text: livetables.VALID_TEXT.always,
                     rows: [], rebuilt: true, message: 'the DLL is rebuilding its tables: refresh again' };
          }
          const e = livetables.dll_entry_by_name(d, tid.slice(3));
          if (e === null) throw new LiveKeyError('/api/live table ' + tid);
          return livetables.read_dll(proc, d, e, names, first, want, raw);
        }
        const tb = livetables.VANILLA_BY_ID.get(tid);
        if (tb === undefined) throw new LiveKeyError('/api/live table ' + tid);
        if (tb.kind === 'texts') {
          const out = livetables.read_texts(proc, names, LiveApi._ints(q, 'section', 9, 0, 17), first, want);
          Object.assign(out, { id: tid, title: tb.title, group: tb.group, kind: 'texts', valid: tb.valid,
                               valid_text: livetables.VALID_TEXT[tb.valid],
                               address: out.source === 'game' ? livetables.TEXT_BUFFER : null });
          return out;
        }
        return livetables.read_vanilla(proc, tb, names, first, want, raw, d);
      } catch (e) {
        if (e instanceof live.LiveBudget) return { id: tid, rows: [], stopped: e.message };
        throw e;
      }
    } finally {
      proc.close();
    }
  }

  compare(q) {
    const tb = livetables.VANILLA_BY_ID.get(q.id || '');
    if (tb === undefined) throw new LiveKeyError('/api/live compare ' + (q.id === undefined || q.id === null ? 'None' : q.id));
    const [kernel, label] = this._kernel();
    const proc = this._open(2.0);
    try {
      const [, d] = this._directory(proc);
      return livetables.compare(proc, tb, this._names(proc, d), d, kernel, label);
    } finally {
      proc.close();
    }
  }

  find(q) {
    if (q.what !== 'directory') throw new PyValueError('find what=directory');
    const proc = this._open(5.0);
    try {
      let base = live.find_module(proc.maps);
      if (!base) base = live.module_base_from_log(this.log_text());
      if (base === null || base === undefined) {
        return { found: null, message: 'no base for the DLL: not in maps and no start-up line in the log' };
      }
      const a = live.scan_for_marker(proc, base);
      if (a !== null) this._scanned = [proc.pid, a];
      return { found: a, base, message: a !== null ? 'directory at ' + live.x08(a) : 'no directory marker in the DLL\'s image' };
    } finally {
      proc.close();
    }
  }
}
