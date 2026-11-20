// The Portrait block's worker, seen from the main thread (portrait panel, stage 1): ONE worker thread, started on the first
// request, ONE job at a time. A newer request for the same character replaces a queued one (the older caller is answered
// {superseded: true}, which the page treats as "ask again"), so clicking through characters never piles decodes up.
//
//   new PortraitHost({slow_ms?})     slow_ms: a test hook (the worker waits this long inside every decode)
//   request(body) -> Promise of {ok} | {refused} | {bug}      body: {ident, have, chosen, text, config_dir, game_dir}
//   clear()                          drop the worker's answers (the page's Reload)
//   close()
// Node 22 language level.
import { Worker } from 'node:worker_threads';
import nodePath from 'node:path';

const WORKER = nodePath.join(import.meta.dirname, 'portraitworker.js');

export class PortraitHost {
  constructor(o) {
    this.o = o || {};
    this.worker = null;
    this.next = 1;
    this.busy = null;              // the job the worker has: {id, body, res}
    this.queue = [];               // jobs waiting: {id, body, res}
    this.max_queue = 0;            // the longest the queue got (tests)
  }

  _start() {
    this.worker = new Worker(WORKER, { workerData: { portrait_worker: true, slow_ms: this.o.slow_ms || 0 } });
    this.worker.on('message', m => this._message(m));
    const fail = (why) => {
      const jobs = (this.busy ? [this.busy] : []).concat(this.queue);
      this.busy = null;
      this.queue = [];
      this.worker = null;
      for (const j of jobs) j.res({ bug: 'the portrait worker stopped: ' + why, stack: '' });
    };
    this.worker.on('error', e => fail(String(e && e.stack || e)));
    this.worker.on('exit', code => { if (this.worker) fail('exit ' + code); });
  }

  request(body) {
    if (!this.worker) this._start();
    return new Promise((res) => {
      const job = { id: this.next++, body, res };
      // a newer request for the same character replaces a queued one
      const at = this.queue.findIndex(j => j.body.ident === body.ident);
      if (at >= 0) {
        this.queue[at].res({ superseded: true });
        this.queue.splice(at, 1);
      }
      this.queue.push(job);
      this.max_queue = Math.max(this.max_queue, this.queue.length);
      this._pump();
    });
  }

  _pump() {
    if (this.busy || !this.queue.length || !this.worker) return;
    this.busy = this.queue.shift();
    this.worker.postMessage(Object.assign({ id: this.busy.id }, this.busy.body));
  }

  _message(m) {
    const job = this.busy;
    if (!job || job.id !== m.id) return;
    this.busy = null;
    if (m.answer !== undefined) job.res({ ok: m.answer });
    else if (m.refused !== undefined) job.res({ refused: m.refused });
    else job.res({ bug: m.bug, stack: m.stack });
    this._pump();
  }

  clear() { if (this.worker) this.worker.postMessage({ clear: true }); }

  close() {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      return w.terminate();
    }
    return Promise.resolve();
  }
}
