// The Live tables reader's worker thread (design 1.9). It holds one LiveApi (core/liveapi.js, the port of
// sxcfg/liveapi.py) for the app's life, so its few caches (the log text, the kernel2.bin texts, the marker scan, whether
// the game ran last time) last as in the Python server; every request reads the game anew, here, never on the window's
// thread. Read only, by construction: core/live.js opens /proc/<pid>/mem with 'r', the Windows helper with
// PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION.
//
// workerData: { mode: 'proc' | 'helper', sab, env? }
//   proc    Linux: /proc/<pid>/maps and mem (env: {proc, pid, scope, log_path} for the tests' fake /proc)
//   helper  Windows: sxlive_helper.exe, spoken to by the main thread (livehost.js); this thread asks through
//           postMessage and waits on the shared buffer `sab` for the answer, so the reader stays synchronous as the
//           reference is. Never seen working on Windows (it cannot be run here): marked so on the page.
// Messages in: {id, route, body, ctx: {game_dir, kernel_id, kernel, kernel_label}}; out: {id, answer}, and in helper mode
// {type: 'helper', seq, req}.
// Node 22 language level.
import { parentPort, workerData } from 'node:worker_threads';
import * as live from '../core/live.js';
import { LiveApi, Env } from '../core/liveapi.js';

export const SAB_HEAD = 12;                   // [unused, length, seq] as Int32, then the answer's bytes
export const SAB_DATA = 4 * 1024 * 1024;
export const HELPER_WAIT_MS = 15000;

// ---- the helper bridge (Windows) ------------------------------------------------------------------------------------
// The main thread's side (livehost.js): an answer's bytes and length first, its request's number last, then the
// wake-up on that number's word. The number is the only signal, so an answer cannot be missed: the worker waits only
// while the word still holds the value it has just read.
export function put_answer(sab, seq, data) {
  const i32 = new Int32Array(sab, 0, 3);
  new Uint8Array(sab, SAB_HEAD).set(data);
  Atomics.store(i32, 1, data.length);
  Atomics.store(i32, 2, seq);
  Atomics.notify(i32, 2);
}

// The worker's side. `wait_ms` is for the tests (HELPER_WAIT_MS otherwise).
export function helper_bridge(sab, post, wait_ms) {
  const i32 = new Int32Array(sab, 0, 3);
  const bytes = new Uint8Array(sab, SAB_HEAD);
  const limit = wait_ms || HELPER_WAIT_MS;
  let seq = 0;
  return function call(req) {
    seq += 1;
    post({ type: 'helper', seq, req });
    const until = Date.now() + limit;
    for (;;) {
      const s = Atomics.load(i32, 2);
      if (s === seq) break;                  // else nothing yet, or an answer to an earlier request that timed out
      const left = until - Date.now();
      if (left <= 0) {
        throw new live.LiveError('the Live tables helper (sxlive_helper.exe) did not answer in ' + limit / 1000 + ' s');
      }
      Atomics.wait(i32, 2, s, left);
    }
    const n = Atomics.load(i32, 1);
    const ans = JSON.parse(Buffer.from(bytes.subarray(0, n)).toString('utf8'));
    if (ans.error === 'missing') {
      throw new live.LiveError('Live tables needs sxlive_helper.exe beside the app (not found / refused: ' + ans.text + ')');
    }
    return ans;
  };
}

// What the helper's error words mean for a read
const HELPER_CODES = { unmapped: 'EFAULT', eio: 'EIO', gone: 'ESRCH', refused: 'EACCES' };

// A Process whose bytes come from the helper (ReadProcessMemory): live.Process's checks and messages otherwise
export class HelperProcess extends live.Process {
  _open() { return 0; }

  _pread(address, size) {
    const r = this.call({ op: 'read', pid: this.pid, addr: address.toString(16).padStart(8, '0'), len: size });
    if (typeof r.data === 'string') return Buffer.from(r.data, 'hex');
    throw Object.assign(new Error(r.text || r.error || 'the helper gave no data'), { code: HELPER_CODES[r.error] || 'EIO' });
  }

  _refused() {
    return new live.LiveRefused("Windows refused to let sxlive_helper.exe read the game's memory (it asks for reading only: " +
                                'PROCESS_VM_READ). Run the editor as the same user as the game. Nothing was changed.');
  }

  close() {}
}

export function helper_env(call) {
  return new Env({
    find_pid: () => {
      const r = call({ op: 'find' });
      return typeof r.pid === 'number' ? r.pid : null;
    },
    scope: () => null,
    read_maps: (pid) => {
      const r = call({ op: 'maps', pid });
      if (r.error === 'gone') throw new live.LiveNotRunning('the game is not running (pid ' + pid + ' is gone)');
      if (r.error) throw new live.LiveRefused("cannot list the game's memory: " + (r.text || r.error));
      return (r.maps || []).map(m => new live.Mapping(parseInt(m.start, 16), parseInt(m.end, 16), String(m.perms), String(m.name || '')));
    },
    process: (pid, maps, proc, scope, budget) => {
      const p = new HelperProcess(pid, maps, proc, scope, budget);
      p.call = call;
      return p;
    },
  });
}

// the Env of a run: the helper's, the tests' fake /proc, or the real one
export function make_env(data, post) {
  if (data.mode === 'helper') return helper_env(helper_bridge(data.sab, post));
  const e = data.env || {};
  return new Env({
    proc: e.proc,
    find_pid: e.pid !== undefined ? () => e.pid : undefined,
    scope: e.scope !== undefined ? () => e.scope : undefined,
    log_path: e.log_path,
  });
}

// the editor's state of the request, as LiveApi reads it
export function app_of(ctx) {
  const k = ctx && ctx.kernel ? Buffer.from(ctx.kernel.buffer, ctx.kernel.byteOffset, ctx.kernel.byteLength) : null;
  return {
    game_dir: () => (ctx && ctx.game_dir) || null,
    kernel_id: () => (ctx && ctx.kernel_id) || null,
    kernel: () => (k ? [k, ctx.kernel_label || null] : [null, null]),
  };
}

// one route's answer: {ok} | {refused} | {bug}, as the Python server's 200 / 409 / 404 / 500
export function answer(api, route, body, ctx) {
  api.app = app_of(ctx);
  try {
    return { ok: api.handle(route, body || {}) };
  } catch (e) {
    if (e instanceof live.LiveError) return { refused: e.message, live: e.name };
    if (e && e.name === 'KeyError') return { refused: 'missing: ' + e.message };
    if (e && e.name === 'ValueError') return { refused: e.message };
    return { bug: (e && e.name) + ': ' + (e && e.message), stack: e && e.stack ? String(e.stack) : '' };
  }
}

if (parentPort && workerData && workerData.live_worker) {
  const post = m => parentPort.postMessage(m);
  const api = new LiveApi(app_of(null), make_env(workerData, post));
  parentPort.on('message', (m) => {
    if (!m || typeof m.id !== 'number') return;
    post({ id: m.id, answer: answer(api, m.route, m.body, m.ctx) });
  });
}
