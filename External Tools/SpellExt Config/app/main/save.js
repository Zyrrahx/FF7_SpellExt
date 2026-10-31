// Save and Save all (design 1.6): safety.atomic_write's steps, with the checks of every file of a save made before
// the first write, one backup folder for the whole save, and the rename retried on Windows. Plain functions (no
// Electron); the rename, the pause and the platform can be handed in, so the tests drive the retry and the refusals.
//
// The bytes written are the document's serialize(): every line keeps its own ending, every untouched byte is the byte
// read (the same bytes the Python tool's Save writes).
import fs from 'node:fs';
import nodePath from 'node:path';
import * as safety from '../core/safety.js';
import { gate, backups_dir, check_write, resolve_in, PathRefused } from './paths.js';

export const RENAME_TRIES = 10;
export const RENAME_PAUSE_MS = 100;
const RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function sleep_ms(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readonly_rel(rel) {
  const low = rel.toLowerCase();
  return low.startsWith('readme/') || low.endsWith('.ai');
}

function can_write(p) {
  try {
    fs.accessSync(p, fs.constants.W_OK);
    return true;
  } catch (e) {
    return false;
  }
}

// Every check a file of a save must pass before anything is written: null when it passes, else the refusal text.
// `overwrite`: the stamp check is skipped (the user chose to write over the file on disk).
export function precheck(ws, rel, overwrite) {
  try {
    if (readonly_rel(rel)) return rel + ' is shown, not edited, here';
    if (!ws.docs.has(rel)) return rel + ' is not open';
    if (!ws.writable) return 'the config folder is not writable: read-only mode';
    const [, abs] = gate(ws, rel, { write: true });
    safety.check_writable_path(ws.config_dir, abs);
    if (!overwrite && ws.changed_on_disk(rel)) {
      return rel + ' changed on disk since it was opened: reload it (your edits would be lost) or save with overwrite';
    }
    if (fs.existsSync(abs) && !can_write(abs)) return rel + ' is read-only on disk (no write permission)';
    if (!can_write(nodePath.dirname(abs))) return 'no write permission in the folder of ' + rel;
    backups_dir(fs.realpathSync.native(ws.config_dir));
    return null;
  } catch (e) {
    if (e instanceof PathRefused || e instanceof safety.WriteRefused) return e.message;
    throw e;
  }
}

// Step 4 and 5 for one file: the .tmp unlinked, opened 'wx', written, fsynced, renamed over the file (retried on
// Windows), read back. `backup` is only named in the refusals.
export function write_file(config_dir, abs, data, backup, opts) {
  const o = opts || {};
  const rename = o.rename || fs.renameSync;
  const pause = o.sleep || sleep_ms;
  const platform = o.platform || process.platform;
  const tmp = abs + '.tmp';
  check_write(fs.realpathSync.native(config_dir), abs);
  try {
    fs.unlinkSync(tmp);        // a .tmp left from before, or planted as a link: removed, never written through
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw new safety.WriteRefused(tmp + ' is in the way and cannot be removed (' + e.code + '); nothing was written');
    }
  }
  const fd = fs.openSync(tmp, 'wx');          // created here, or refused if anything appeared there since
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  for (let attempt = 1; ; attempt++) {
    try {
      rename(tmp, abs);
      break;
    } catch (e) {
      if (platform === 'win32' && RETRY_CODES.has(e.code) && attempt < RENAME_TRIES) {
        pause(RENAME_PAUSE_MS);
        continue;
      }
      try { fs.unlinkSync(tmp); } catch (e2) { /* already gone */ }
      if (platform === 'win32' && RETRY_CODES.has(e.code)) {
        throw new safety.WriteRefused('could not replace ' + nodePath.basename(abs) + ' (held open by another program?); ' +
                                      'the backup is in ' + backup);
      }
      throw e;
    }
  }
  const back = fs.readFileSync(abs);
  if (!back.equals(data)) {
    throw new safety.WriteRefused(abs + ' did not read back as written; the backup is in ' + backup);
  }
}

// The checks of a staged AI file (design 4.10, S6a) before anything is written: null, or the refusal text. Its two
// files are ai/NAME.txt and ai/NAME.ai, written as save_ai writes them (the text as Latin-1, the assembled bytes).
export function precheck_ai(ws, a) {
  try {
    if (!ws.writable) return 'the config folder is not writable: read-only mode';
    if (!/^[A-Za-z0-9_-]{1,31}$/.test(a.name)) return 'an AI name is 1 to 31 letters, digits, _ or -';
    const root = fs.realpathSync.native(ws.config_dir);
    const dir = nodePath.join(root, 'ai');
    if (!fs.existsSync(dir)) return can_write(root) ? null : 'no write permission in the config folder (for its ai folder)';
    for (const ext of ['.txt', '.ai']) {
      const abs = resolve_in(root, 'ai/' + a.name + ext);
      check_write(root, abs);
      if (fs.existsSync(abs) && !a.overwrite) {
        return 'ai/' + a.name + ext + ' exists now (made since the AI was staged): stage it again with overwrite, or rename it';
      }
      if (fs.existsSync(abs) && !can_write(abs)) return 'ai/' + a.name + ext + ' is read-only on disk (no write permission)';
    }
    if (!can_write(dir)) return 'no write permission in the ai folder';
    backups_dir(root);
    return null;
  } catch (e) {
    if (e instanceof PathRefused || e instanceof safety.WriteRefused) return e.message;
    throw e;
  }
}

// Save of the files `rels` (workspace keys), and of the staged AI files `opts.ai` ([{name, text, bytes, overwrite}]):
// every check of every file first, then the one backup folder holding every original, then the writes in order. Returns
// {saved: [{path, backup}], refused: {path: message}, written, not_written}. When a check fails nothing is written
// (every file of the save is named in `refused` or `not_written`). A failure while writing leaves the files written
// before it written (and marked clean) and the rest as they were, still dirty: the backup folder holds every original.
export function save_files(ws, rels, opts) {
  const o = opts || {};
  const overwrite = new Set(o.overwrite || []);
  const ais = o.ai || [];
  const refused = {};
  for (const rel of rels) {
    const why = precheck(ws, rel, overwrite.has(rel));
    if (why) refused[rel] = why;
  }
  const saving = new Set(rels.map(r => r.toLowerCase()));
  for (const a of ais) {
    let why = precheck_ai(ws, a);
    // the same source both edited and staged: the second write would lose the first
    if (!why && saving.has(('ai/' + a.name + '.txt').toLowerCase())) {
      why = 'ai/' + a.name + '.txt is staged and has unsaved edits of its own: save or reload the file, or drop the staged one';
    }
    if (why) refused['ai/' + a.name + '.txt'] = why;
  }
  const all = rels.concat(...ais.map(a => ['ai/' + a.name + '.txt', 'ai/' + a.name + '.ai']));
  if (Object.keys(refused).length) {
    return { saved: [], refused, written: [], not_written: all.filter(r => !(r in refused)) };
  }
  const root = fs.realpathSync.native(ws.config_dir);
  const items = rels.map(rel => {
    const [, abs] = gate(ws, rel, { write: true });
    return { rel, abs, data: ws.docs.get(rel).doc.serialize() };
  });
  for (const a of ais) {
    for (const [ext, data] of [['.txt', Buffer.from(a.text, 'latin1')], ['.ai', Buffer.from(a.bytes)]]) {
      items.push({ rel: 'ai/' + a.name + ext, abs: nodePath.join(root, 'ai', a.name + ext), data, ai: true });
    }
  }
  backups_dir(root);
  const label = items.length === 1 ? nodePath.basename(items[0].abs) : items.length + ' files';
  const backup = safety.make_backup(ws.config_dir, items.map(it => it.abs), label);
  if (ais.length) fs.mkdirSync(nodePath.join(root, 'ai'), { recursive: true });
  const saved = [];
  const written = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      write_file(ws.config_dir, it.abs, it.data, backup, o);
    } catch (e) {
      const msg = (e instanceof safety.WriteRefused || e instanceof PathRefused) ? e.message
        : nodePath.basename(it.abs) + ': ' + (e.code || e.name) + ': ' + e.message;
      refused[it.rel] = msg + (written.length ? ' (written before it: ' + written.join(', ') + ')' : '');
      return { saved, refused, written, not_written: items.slice(i).map(x => x.rel) };
    }
    const e = ws.docs.get(it.rel);
    if (e && !it.ai) {
      e.stamp = safety.stamp(it.abs);
      e.saved_bytes = it.data;
      e.dirty = false;
    } else if (e && it.ai && !e.dirty) {
      ws.open(it.rel, true);       // a source the kind page holds, not changed there: it follows the file
    }
    saved.push({ path: it.rel, backup });
    written.push(it.rel);
  }
  return { saved, refused, written, not_written: [] };
}
