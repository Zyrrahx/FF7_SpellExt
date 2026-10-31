// Writing safely: a backup before every save, an atomic write read back, a refusal to write over a file changed on
// disk, and a list of paths the tool never writes (whatever it is asked). Port of sxcfg/safety.py.
//
// Differences the platform forces, and nothing else: the backup copy's times are set through fs.utimesSync, which
// keeps microseconds where Python kept nanoseconds (the bytes are the same); an OSError's text is Node's.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  SEP, pyJoin, pyBasename, pyDirname, pyRealpath, pyCommonpath, pyRelpath, pyIsfile, pyIsdir, pyExists, pyListdir,
  pyWalk, pyLower, pyStrip, pyCmp,
} from './py.js';

export const BACKUP_DIR_NAME = 'Backups';
export const BACKUPS_KEPT = 20;
export const BACKUP_MARK = '.spellext_config_backup';      // in each backup folder this tool made (never delete another's)

// never written, wherever they are: the DLL, 7th Heaven's own files, the mod's manifest, FFNx's config
export const NEVER_NAMES = new Set(['ff7_spellext.dll', 'mod.xml', 'ffnx.toml', 'settings.xml', 'library.xml', 'af3dn.p',
                                    'ff7_en.exe']);
export const NEVER_PARTS = new Set(['7thworkshop']);

export class WriteRefused extends Error {
  constructor(message) { super(message); this.name = 'WriteRefused'; }
}

// Throws WriteRefused unless `path` is inside the config folder and on no never-touch list.
export function check_writable_path(config_dir, path) {
  const real_cfg = pyRealpath(config_dir);
  const real = pyRealpath(path);
  if (pyCommonpath([real_cfg, real]) !== real_cfg) {
    throw new WriteRefused('not inside the SpellExtConfig folder: ' + path);
  }
  const base = pyLower(pyBasename(real));
  if (NEVER_NAMES.has(base) || base.endsWith('.dll') || base.endsWith('.exe')) {
    throw new WriteRefused('this tool never writes ' + pyBasename(real));
  }
  for (const p of real.split(SEP)) {
    if (NEVER_PARTS.has(pyLower(p))) {
      throw new WriteRefused("this tool never writes inside 7th Heaven's own folders: " + path);
    }
  }
  const rel = pyRelpath(real, real_cfg).split(SEP);
  if (rel.length && pyLower(rel[0]) === pyLower(BACKUP_DIR_NAME) && rel.length > 1) {
    throw new WriteRefused('the Backups folder is written only by the backup step');
  }
}

// Whether ff7_en(.exe) is running: pgrep on Linux (the primer's command), tasklist on Windows.
export function game_running() {
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq ff7_en.exe', '/NH'], { encoding: 'utf8', timeout: 5000 });
      if (r.error) return false;
      return pyLower(r.stdout || '').indexOf('ff7_en.exe') >= 0;
    }
    const r = spawnSync('pgrep', ['-i', '-x', 'ff7_en(\\.exe)?'], { encoding: 'utf8', timeout: 5000 });
    if (r.error) return false;
    return r.status === 0 && Boolean(pyStrip(r.stdout || ''));
  } catch (e) {
    return false;
  }
}

// [mtime in ns (BigInt), size (BigInt)]: Python's (st_mtime_ns, st_size)
export function stamp(path) {
  const st = fs.statSync(path, { bigint: true });
  return [st.mtimeNs, st.size];
}

export function same_stamp(a, b) {
  return BigInt(a[0]) === BigInt(b[0]) && BigInt(a[1]) === BigInt(b[1]);
}

function strftime_now() {
  const d = new Date();
  const p = (n, w) => String(n).padStart(w || 2, '0');
  return p(d.getFullYear(), 4) + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) +
    p(d.getSeconds());
}

// Copies each existing file of `paths` into SpellExtConfig/Backups/<YYYYMMDD_HHMMSS>/<relative path>.
// Returns the backup folder (null when nothing existed to back up).
export function make_backup(config_dir, paths, label) {
  const existing = paths.filter(p => pyIsfile(p));
  if (!existing.length) return null;
  const root = pyJoin(config_dir, BACKUP_DIR_NAME);
  const name = strftime_now();
  let folder = pyJoin(root, name);
  let k = 1;
  while (pyExists(folder)) {
    k += 1;
    folder = pyJoin(root, name + '_' + k);
  }
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(folder);
  fs.writeFileSync(pyJoin(folder, BACKUP_MARK), 'made by spellext_config' + (label ? ': ' + label : '') + '\n', 'utf8');
  for (const p of existing) {
    const rel = pyRelpath(p, config_dir);
    const dst = pyJoin(folder, rel);
    fs.mkdirSync(pyDirname(dst), { recursive: true });
    fs.writeFileSync(dst, fs.readFileSync(p));
    const st = fs.statSync(p, { bigint: true });
    fs.utimesSync(dst, nsToSeconds(st.atimeNs), nsToSeconds(st.mtimeNs));
  }
  prune_backups(config_dir);
  return folder;
}

function nsToSeconds(ns) {
  return Number(ns / 1000000000n) + Number(ns % 1000000000n) / 1e9;
}

// Keeps the last `keep` backups this tool made; never touches a folder without its mark.
export function prune_backups(config_dir, keep) {
  if (keep === undefined) keep = BACKUPS_KEPT;
  const root = pyJoin(config_dir, BACKUP_DIR_NAME);
  if (!pyIsdir(root)) return;
  const ours = pyListdir(root).filter(d => pyIsfile(pyJoin(root, d, BACKUP_MARK))).sort(pyCmp);
  const drop = ours.length > keep ? ours.slice(0, ours.length - keep) : [];
  for (const d of drop) {
    const folder = pyJoin(root, d);
    for (const [dp, , fn] of pyWalk(folder, false)) {
      for (const f of fn) fs.unlinkSync(pyJoin(dp, f));
      fs.rmdirSync(dp);
    }
  }
}

// Writes `data` (a Buffer) to `path`: refuses when the file changed on disk since `expect_stamp`, backs up the file
// first, writes a .tmp beside it, fsyncs, replaces, reads back. Returns [backup folder, new stamp].
export function atomic_write(config_dir, path, data, expect_stamp) {
  check_writable_path(config_dir, path);
  if (expect_stamp !== undefined && expect_stamp !== null && pyExists(path) && !same_stamp(stamp(path), expect_stamp)) {
    throw new WriteRefused(pyBasename(path) + ' changed on disk since it was opened: reload it first (nothing was written)');
  }
  const tmp = path + '.tmp';
  try {
    fs.unlinkSync(tmp);        // a .tmp left from before, or planted as a link: removed, never written through
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw new WriteRefused(tmp + ' is in the way and cannot be removed (' + oserror_text(e, tmp) + '); nothing was written');
    }
  }
  const backup = make_backup(config_dir, [path], pyBasename(path));
  const fd = fs.openSync(tmp, 'wx');          // created here, or refused if anything appeared there since
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, path);
  const back = fs.readFileSync(path);
  if (!back.equals(data)) {
    throw new WriteRefused(path + ' did not read back as written; the backup is in ' + backup);
  }
  return [backup, stamp(path)];
}

// Python's str(OSError): "[Errno N] <text>: '<path>'" (the text here is Node's error code)
function oserror_text(e, path) {
  return '[Errno ' + Math.abs(e.errno || 0) + '] ' + (e.code || 'error') + ": '" + path + "'";
}
