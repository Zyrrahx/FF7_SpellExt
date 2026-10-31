// The path rules of design 1.4: the single gate for every route that takes a path. Plain functions (no Electron), so
// they run under /usr/bin/node for the tests. The Windows name rules are applied on both platforms, so a folder made
// on Linux still opens on Windows.
//
//   rule 1  a body path is relative to the open SpellExtConfig folder: / or \, no drive letter, no leading slash, no
//           NUL, no empty, '.' or '..' segment
//   rule 2  it names a file the workspace knows (list_files), FF7_SpellExt_Templates.txt, one of the schema's fixed
//           .ini names, or ai\<name>.txt / .ai by the AI name rule
//   rule 3  no ':' in a name, no name ending in '.' or ' ', no device stem, no '~' followed by a digit
//   rule 4  resolved with realpath (the parent's when the file does not exist yet) and inside the config root
//   rule 5  writes: never the never-touch names (safety.js), never under Backups\ but by the backup step
import fs from 'node:fs';
import nodePath from 'node:path';
import { NEVER_NAMES, NEVER_PARTS, BACKUP_DIR_NAME } from '../core/safety.js';

export const TEMPLATES_NAME = 'FF7_SpellExt_Templates.txt';
export const AI_NAME = /^[A-Za-z0-9_-]{1,31}$/;
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const CONFIG_FILE = /^ff7_spellext_.*\.ini$/i;

// A path a route will not use (shown as a refusal: the message says why).
export class PathRefused extends Error {
  constructor(message) { super(message); this.name = 'PathRefused'; }
}

function lower(s) { return s.replace(/[A-Z]/g, c => c.toLowerCase()); }

// Rule 3 for one name: null when it is fine, else why not.
export function windows_name_problem(name) {
  if (name.indexOf(':') >= 0) return 'a name with ":" in it (an alternate data stream on Windows)';
  if (name.endsWith('.') || name.endsWith(' ')) return 'a name that ends in a dot or a space (Windows drops it)';
  const stem = name.split('.')[0].replace(/ +$/, '');
  if (DEVICE.test(stem)) return 'a device name on Windows (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9)';
  if (/~[0-9]/.test(name)) return 'a short 8.3 name on Windows ("~" followed by a digit reaches another file)';
  return null;
}

// Rules 1 and 3: the body path as 'a/b' (forward slashes), or PathRefused.
export function split_rel(p) {
  if (typeof p !== 'string' || p === '') throw new PathRefused('outside the config folder: no path given');
  const shown = JSON.stringify(p);
  if (p.indexOf('\0') >= 0) throw new PathRefused('outside the config folder: ' + shown + ' holds a NUL');
  if (/^[A-Za-z]:/.test(p)) throw new PathRefused('outside the config folder: ' + shown + ' starts with a drive letter');
  if (p[0] === '/' || p[0] === '\\') throw new PathRefused('outside the config folder: ' + shown + ' starts with a slash');
  const parts = p.split(/[\\/]/);
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') {
      throw new PathRefused('outside the config folder: ' + shown + ' has an empty, "." or ".." part');
    }
    const why = windows_name_problem(part);
    if (why) throw new PathRefused('refused: ' + shown + ' is ' + why);
  }
  return parts.join('/');
}

// The fixed names a route may name although the folder may lack the file: the schema's .ini names (a template may
// create one) and the templates file.
function fixed_names(schema) {
  const out = [TEMPLATES_NAME];
  for (const [, [name]] of schema.files) out.push(name);
  return out;
}

// Rule 2: the workspace's own spelling of `rel` (already through split_rel), or PathRefused. `listed` is the
// list_files() paths. An exact match wins; else a match that differs only in case (Windows names are not
// case-sensitive), when it is the only one.
export function known_rel(rel, listed, schema) {
  if (listed.indexOf(rel) >= 0) return rel;
  const low = lower(rel);
  const ci = listed.filter(x => lower(x) === low);
  if (ci.length === 1) return ci[0];
  if (ci.length > 1) throw new PathRefused(rel + ' matches ' + ci.length + ' files that differ only in case: refused');
  if (rel.indexOf('/') < 0) {
    for (const n of fixed_names(schema)) if (lower(n) === low) return n;
  }
  const m = /^ai\/([^/]+)\.(txt|ai)$/i.exec(rel);
  if (m && AI_NAME.test(m[1])) return 'ai/' + m[1] + '.' + lower(m[2]);
  throw new PathRefused('not a file of this config folder: ' + rel);
}

// Rule 4: whether `candidate` (a real path) is inside `root` (a real path), by path.relative.
export function inside(root, candidate, pathmod) {
  const P = pathmod || nodePath;
  const r = P.relative(root, candidate);
  return r !== '' && r !== '..' && !r.startsWith('..' + P.sep) && !P.isAbsolute(r);
}

function realpath(p) { return fs.realpathSync.native(p); }

// Rule 4: the real path of `rel` under `root` (root itself a real path): the file's own real path when it exists,
// else its parent's plus the name. PathRefused when it lands outside the root (a link out of the folder).
export function resolve_in(root, rel) {
  const joined = nodePath.join(root, ...rel.split('/'));
  let cand;
  if (fs.existsSync(joined)) cand = realpath(joined);
  else {
    const parent = nodePath.dirname(joined);
    if (!fs.existsSync(parent)) throw new PathRefused('no folder ' + nodePath.relative(root, parent) + ' in the config folder');
    cand = nodePath.join(realpath(parent), nodePath.basename(joined));
  }
  if (!inside(root, cand)) throw new PathRefused('outside the config folder: ' + rel + ' leads to ' + cand);
  return cand;
}

// Rule 5: refuses a write to `abs` (a resolved path under `root`).
export function check_write(root, abs) {
  const base = lower(nodePath.basename(abs));
  if (NEVER_NAMES.has(base) || base.endsWith('.dll') || base.endsWith('.exe')) {
    throw new PathRefused('this tool never writes ' + nodePath.basename(abs));
  }
  for (const part of abs.split(/[\\/]/)) {
    if (NEVER_PARTS.has(lower(part))) throw new PathRefused("this tool never writes inside 7th Heaven's own folders: " + abs);
  }
  const rel = nodePath.relative(root, abs).split(/[\\/]/);
  if (rel.length > 1 && lower(rel[0]) === lower(BACKUP_DIR_NAME)) {
    throw new PathRefused('the Backups folder is written only by the backup step');
  }
}

// Rule 4 for Backups\: the folder the backup step may write, checked before every backup and before
// app.show_backup. A Backups that is itself a link out of the config folder is refused.
export function backups_dir(root) {
  const p = nodePath.join(root, BACKUP_DIR_NAME);
  if (!fs.existsSync(p)) return p;
  const real = realpath(p);
  if (!inside(root, real) || nodePath.relative(root, real).split(/[\\/]/).length !== 1) {
    throw new PathRefused('the Backups folder leads out of the config folder (' + real + '): refused');
  }
  return p;
}

// app.show_backup: `p` (absolute, from a save's answer) must be inside <root>/Backups.
export function backup_path(root, p) {
  if (typeof p !== 'string' || !nodePath.isAbsolute(p)) throw new PathRefused('not a backup folder: ' + p);
  const b = backups_dir(root);
  if (!fs.existsSync(p)) throw new PathRefused('no such backup folder: ' + p);
  const real = realpath(p);
  if (!inside(realpath(b), real)) throw new PathRefused('not inside ' + b + ': ' + p);
  return real;
}

// The whole gate for a route's `path`: [workspace key, real path]. `write` adds rule 5.
export function gate(ws, p, opts) {
  const rel = known_rel(split_rel(p), ws.list_files().map(f => f.path), ws.schema);
  const root = realpath(ws.config_dir);
  const abs = resolve_in(root, rel);
  if (opts && opts.write) check_write(root, abs);
  return [rel, abs];
}

// app.open_folder: the SpellExtConfig folder a picked folder means (itself, or SpellExtConfig under it), or
// PathRefused with what was looked for.
export function config_dir_of(dir) {
  const has = d => {
    try {
      return fs.readdirSync(d).some(n => CONFIG_FILE.test(n) && fs.statSync(nodePath.join(d, n)).isFile());
    } catch (e) {
      return false;
    }
  };
  let st = null;
  try { st = fs.statSync(dir); } catch (e) { st = null; }
  if (!st || !st.isDirectory()) throw new PathRefused('no such folder: ' + dir);
  if (has(dir)) return realpath(dir);
  let sub = null;
  try {
    sub = fs.readdirSync(dir).find(n => lower(n) === 'spellextconfig' && fs.statSync(nodePath.join(dir, n)).isDirectory());
  } catch (e) {
    sub = null;
  }
  if (sub && has(nodePath.join(dir, sub))) return realpath(nodePath.join(dir, sub));
  throw new PathRefused('this folder holds no SpellExt config files (looked for FF7_SpellExt_*.ini in it and in ' +
                        'SpellExtConfig' + nodePath.sep + ' under it): ' + dir);
}

// ---- the app:// protocol (design 1.2): only files under renderer/, path normalised, '..' refused, 404 otherwise ----
export const ORIGIN = 'app://spellext/';
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
                   "connect-src 'none'";
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

// {status, type, body (a Buffer or a text)} for one app:// request of the page
export function serve_path(renderer_dir, url_string) {
  const nf = { status: 404, type: 'text/plain; charset=utf-8', body: 'not found' };
  let u;
  try { u = new URL(url_string); } catch (e) { return nf; }
  if (u.protocol !== 'app:' || u.host !== 'spellext') return nf;
  let p;
  try { p = decodeURIComponent(u.pathname); } catch (e) { return nf; }
  if (p === '/' || p === '') p = '/index.html';
  if (p.indexOf('\0') >= 0 || p.indexOf('\\') >= 0 || p.split('/').some(x => x === '..' || x === '.')) return nf;
  const ext = nodePath.extname(p).toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(TYPES, ext)) return nf;
  const root = nodePath.resolve(renderer_dir);
  const file = nodePath.resolve(root, '.' + p);
  if (!file.startsWith(root + nodePath.sep)) return nf;
  let st;
  try { st = fs.statSync(file); } catch (e) { return nf; }
  if (!st.isFile()) return nf;
  return { status: 200, type: TYPES[ext], body: fs.readFileSync(file) };
}

// The command line (the one place a path arrives): --config DIR, --game DIR, --mods DIR, --log FILE, each as
// "--x DIR" or "--x=DIR"; anything else (Electron's and Chromium's own switches, the app path) is left alone.
export function parse_argv(args) {
  const out = { config: null, game: null, mods: null, log: null, settings: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const m = /^--(config|game|mods|log|settings)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    if (m[2] !== undefined) out[m[1]] = m[2];
    else if (i + 1 < args.length) out[m[1]] = args[++i];
  }
  return out;
}
