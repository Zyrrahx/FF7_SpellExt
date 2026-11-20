// The Portrait block's worker thread (portrait panel, stage 1): every look at a character's portrait files and every decode
// happens here, never on the window's thread (a 2048 x 2048 texture decoded in the main process would freeze the IPC and the
// UI). One job at a time (the host queues them). It keeps the ANSWERS of the last looks (never decoded pictures), bounded
// by bytes, 32 MB, counted as the canonical text of each answer; an answer larger than the budget is never kept.
//
// workerData: { portrait_worker: true, slow_ms?: number (a test hook: wait this long inside every decode) }
// Messages in: {id, ident, have, chosen, text, config_dir, game_dir, seventh} | {clear: true}; out: {id, answer} | {id, refused} | {id, bug, stack}.
// Node 22 language level.
import { parentPort, workerData } from 'node:worker_threads';
import * as portrait from '../core/portrait.js';
import * as archives from '../core/archives.js';
import * as modelsrc from '../core/modelsrc.js';

export const CACHE_BYTES = 32 << 20;

export class Answerer {
  constructor(slow_ms = 0, budget = CACHE_BYTES) {
    this.slow_ms = slow_ms;
    this.budget = budget;
    this.cache = new Map();         // digest -> {answer, bytes}, oldest first
    this.bytes = 0;
    this.decodes = 0;
  }

  clear() {
    this.cache.clear();
    this.bytes = 0;
    archives.clear_cache();
    modelsrc.clear_caches();           // (stage 2) 7th Heaven's reads and the folder listings kept in this worker
  }

  keep(digest, answer) {
    const n = portrait.canonical(answer).length;
    if (n > this.budget) return;
    if (this.cache.has(digest)) { this.bytes -= this.cache.get(digest).bytes; this.cache.delete(digest); }
    this.cache.set(digest, { answer, bytes: n });
    this.bytes += n;
    while (this.bytes > this.budget && this.cache.size) {
      const k = this.cache.keys().next().value;
      this.bytes -= this.cache.get(k).bytes;
      this.cache.delete(k);
    }
  }

  // the answer to one request: throws portrait.Refused for a request the route refuses
  answer(m) {
    const ws = { config_dir: m.config_dir, game_dir: m.game_dir, seventh: m.seventh || null };
    const [look, digest] = portrait.prepare(ws, m.ident, m.chosen || null, m.text);
    if (m.have && m.have === digest) return { same: true, digest };
    const hit = this.cache.get(digest);
    if (hit) {
      this.cache.delete(digest);
      this.cache.set(digest, hit);
      return hit.answer;
    }
    this.decodes += 1;
    if (this.slow_ms) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, this.slow_ms);
    const ans = portrait.complete(look, digest);
    this.keep(digest, ans);
    return ans;
  }
}

if (workerData && workerData.portrait_worker) {
  const a = new Answerer(workerData.slow_ms || 0);
  parentPort.on('message', (m) => {
    if (m.clear) { a.clear(); return; }
    try {
      parentPort.postMessage({ id: m.id, answer: a.answer(m) });
    } catch (e) {
      if (e instanceof portrait.Refused) parentPort.postMessage({ id: m.id, refused: e.message });
      else parentPort.postMessage({ id: m.id, bug: String(e && e.message || e), stack: String(e && e.stack || '') });
    }
  });
}
