// The Live tables reader, seen from the main thread (design 1.9): the worker thread that reads the game
// (liveworker.js), started on the first request, and on Windows the helper exe it reads through.
//
//   new LiveHost({mode, helper, env})
//     mode    'proc' (Linux: /proc) or 'helper' (Windows: sxlive_helper.exe); by default from the platform
//     helper  the helper's command line [exe, ...args] (the tests give a node script that speaks the same protocol)
//     env     for the tests: {proc, pid, scope, log_path} (a fake /proc)
//   request(route, body, ctx) -> Promise of {ok} | {refused} | {bug}
//   close()
//
// The helper protocol: one JSON object per line on its stdin, one answer per line on its stdout (design 1.9):
//   {"op":"find"}                                  {"pid":1234} | {"pid":null}
//   {"op":"maps","pid":1234}                       {"maps":[{"start":"00400000","end":"...","perms":"r-x","name":"..."}]}
//   {"op":"read","pid":1234,"addr":"00dbfd38","len":65536}
//                                                  {"data":"<hex>"} | {"error":"unmapped"|"eio"|"gone"|"refused","text"}
// Node 22 language level.
import { Worker } from 'node:worker_threads';
import child_process from 'node:child_process';
import nodePath from 'node:path';
import { SAB_HEAD, SAB_DATA, put_answer } from './liveworker.js';

const WORKER = nodePath.join(import.meta.dirname, 'liveworker.js');
export const HELPER_EXE = nodePath.join(nodePath.dirname(import.meta.dirname), 'helper', 'sxlive_helper.exe');

export class LiveHost {
  constructor(o) {
    this.o = o || {};
    this.mode = this.o.mode || (process.platform === 'win32' ? 'helper' : 'proc');
    this.worker = null;
    this.next = 1;
    this.waiting = new Map();          // id -> resolve
    this.child = null;
    this.out = '';
    this.queue = [];                   // helper requests sent and not answered: [seq]
  }

  _start() {
    this.sab = new SharedArrayBuffer(SAB_HEAD + SAB_DATA);
    this.worker = new Worker(WORKER, { workerData: { live_worker: true, mode: this.mode, sab: this.sab, env: this.o.env || null } });
    this.worker.on('message', m => this._message(m));
    const fail = (why) => {
      for (const [, res] of this.waiting) res({ bug: 'the Live tables worker stopped: ' + why, stack: '' });
      this.waiting.clear();
      this.worker = null;
    };
    this.worker.on('error', e => fail(String(e && e.stack || e)));
    this.worker.on('exit', code => fail('exit ' + code));
  }

  request(route, body, ctx) {
    if (!this.worker) this._start();
    const id = this.next++;
    return new Promise((res) => {
      this.waiting.set(id, res);
      this.worker.postMessage({ id, route, body, ctx });
    });
  }

  _message(m) {
    if (m && m.type === 'helper') {
      this._helper(m.seq, m.req);
      return;
    }
    const res = this.waiting.get(m.id);
    if (res) {
      this.waiting.delete(m.id);
      res(m.answer);
    }
  }

  // ---- the helper (Windows) ---------------------------------------------------------------------------------------------
  _answer(seq, obj) {
    let data = Buffer.from(JSON.stringify(obj), 'utf8');
    if (data.length > SAB_DATA) data = Buffer.from(JSON.stringify({ error: 'eio', text: 'the helper\'s answer is too large' }), 'utf8');
    put_answer(this.sab, seq, data);
  }

  _helper(seq, req) {
    if (!this.child) {
      const cmd = this.o.helper || [HELPER_EXE];
      let child;
      try {
        child = child_process.spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
      } catch (e) {
        this._answer(seq, { error: 'missing', text: e.message });
        return;
      }
      this.child = child;
      this.out = '';
      this.queue = [];
      child.on('error', (e) => {
        const q = this.queue;
        this.queue = [];
        this.child = null;
        for (const s of q) this._answer(s, { error: 'missing', text: e.code === 'ENOENT' ? 'not found: ' + cmd[0] : e.message });
      });
      child.on('exit', () => {
        const q = this.queue;
        this.queue = [];
        if (this.child === child) this.child = null;
        for (const s of q) this._answer(s, { error: 'missing', text: 'the helper stopped' });
      });
      child.stdin.on('error', () => {});      // a helper that did not start: its 'error' answers the queue
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        this.out += chunk;
        let k;
        while ((k = this.out.indexOf('\n')) >= 0) {
          const line = this.out.slice(0, k);
          this.out = this.out.slice(k + 1);
          const s = this.queue.shift();
          if (s === undefined) continue;
          let obj;
          try {
            obj = JSON.parse(line);
          } catch (e) {
            obj = { error: 'eio', text: 'the helper answered something that is not JSON' };
          }
          this._answer(s, obj);
        }
      });
    }
    this.queue.push(seq);
    this.child.stdin.write(JSON.stringify(req) + '\n');
  }

  close() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    if (this.child) this.child.kill();
    this.child = null;
  }
}
