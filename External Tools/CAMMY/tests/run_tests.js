// CAMMY core tests: node tests/run_tests.js [path to the game's battle folder]
// 1. every script of the game's three camera files reads to its end, and assembles back to the same bytes;
// 2. the cameras the Python tool (cam_tool.py, checked against all 2,764 game scripts) exported read the same here;
// 3. SpellExt's seven real camera files parse, write back as text and parse again to the same commands;
// 4. playback of every camera gives finite points, and ends.
'use strict';
const fs = require('fs'), path = require('path');
const C = require('../cammy_core.js');
const BATTLE = process.argv[2] || '/run/media/binah/Data/SteamLibrary/steamapps/common/FINAL FANTASY VII/data/lang-en/battle';
let checks = 0, failed = 0;
function ok(cond, what) { checks++; if (!cond) { failed++; if (failed <= 30) console.log('FAILED: ' + what); } }
const same = (a, b) => C.sameScript(a, b);
const noRaw = s => s && s.filter(c => !c.raw);         // stray bytes: cam_tool.py writes them as comments, as CAMMY's text form now does

const world = { actors: [{ x: -700, y: 0, z: 1300, side: 'party' }, { x: 0, y: 0, z: 1300, side: 'party' }, { x: 700, y: 0, z: 1300, side: 'party' },
  { x: 0, y: 0, z: 0, side: 'none' }, { x: 0, y: 0, z: -3000, side: 'enemy' }], attacker: 2, target: 4, groupSide: 'enemy',
  presetPos: { x: 2500, y: -2400, z: 5600 }, presetFocus: { x: 0, y: -500, z: -1000 }, bones: {} };
function playable(cam, label) {
  for (let v = 0; v < 3; v++) {
    const r = C.simulate(cam, v, world, 2000);
    ok(r.frames.length > 0, label + ' v' + v + ': plays');
    ok(r.frames.every(f => ['pos', 'focus'].every(k => ['x', 'y', 'z'].every(a => Number.isFinite(f[k][a])))), label + ' v' + v + ': finite points');
    ok(r.frames.length < 2000 || label.includes('loop'), label + ' v' + v + ': ends (' + r.frames.length + ' frames)');
  }
}

// 1 and 4: the game's files
const files = {};
for (const n of [0, 1, 2]) {
  const p = path.join(BATTLE, 'camdat' + n + '.bin');
  if (!fs.existsSync(p)) { console.log('(no ' + p + ': part 1 skipped for it)'); continue; }
  const buf = fs.readFileSync(p), bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
  const file = C.readCamdat(bytes); files[n] = file;
  let scripts = 0, loops = 0;
  for (let id = 0; id < file.count; id++) {
    const cam = file.camera(id);
    for (let v = 0; v < 3; v++) for (const k of C.KINDS) {
      const s = cam.variants[v][k]; if (!s) { ok(false, 'camdat' + n + ' camera ' + id.toString(16) + ' v' + v + ' ' + k + ': no script'); continue; }
      scripts++;
      const last = s[s.length - 1].op;
      if (last === 0xc0) loops++;
      ok(last === 0xff || last === 0xc0, 'camdat' + n + ' camera ' + id.toString(16) + ' v' + v + ' ' + k + ': reads to ff (last ' + C.hex2(last) + ')');
      const back = C.assemble(s, k), again = C.disassemble(back, k);
      ok(same(s, again), 'camdat' + n + ' camera ' + id.toString(16) + ' v' + v + ' ' + k + ': assembles back to the same commands');
    }
    if (id % 7 === 0) playable(cam, 'camdat' + n + ' camera ' + id.toString(16) + (cam.variants.some(v => C.KINDS.some(k => v[k] && v[k].some(c => c.op === 0xc0))) ? ' (loop)' : ''));
  }
  console.log('camdat' + n + '.bin: ' + file.count + ' cameras, ' + scripts + ' scripts read (' + loops + ' end in a loop)');
}

// 2: against cam_tool.py's exports
const exp = path.join(__dirname, 'expected');
for (const name of fs.existsSync(exp) ? fs.readdirSync(exp) : (console.log('(no tests/expected: part 2 skipped; make it with cam_tool.py export)'), [])) {
  const m = name.match(/^camdat(\d)_([0-9a-f]+)\.txt$/); if (!m || !files[m[1]]) continue;
  const fromPy = C.parseText(fs.readFileSync(path.join(exp, name), 'utf8'));
  const here = files[m[1]].camera(parseInt(m[2], 16));
  for (let v = 0; v < 3; v++) for (const k of C.KINDS) ok(same(fromPy.variants[v][k], noRaw(here.variants[v][k])), name + ' v' + v + ' ' + k + ': the same as cam_tool.py');
}

// 3: SpellExt's own camera files
for (const name of fs.readdirSync(__dirname).filter(f => f.endsWith('.txt'))) {
  const cam = C.parseText(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  ok(cam.number >= C.FIRST_FREE, name + ': numbered from 190 (' + (cam.number || 0).toString(16) + ')');
  ok(C.check(cam).length === 0, name + ': no problems (' + C.check(cam).join('; ') + ')');
  const again = C.parseText(C.toText(cam));
  ok(again.number === cam.number, name + ': the number survives writing');
  for (let v = 0; v < 3; v++) for (const k of C.KINDS) ok(same(cam.variants[v][k], again.variants[v][k]), name + ' v' + v + ' ' + k + ': text round trip');
  playable(cam, name);
}

// a camera with stray bytes writes as text SpellExt can read, and reads back without them
if (files[1]) { const c16 = files[1].camera(0x16); c16.number = 0x1ff; const txt = C.toText(c16); let back = null;
  try { back = C.parseText(txt); } catch (e) { ok(false, 'camera 16 with stray bytes: its text reads back (' + e.message + ')'); }
  if (back) ok(same(back.variants[1].position, noRaw(c16.variants[1].position)), 'camera 16 with stray bytes: text round trip without them'); }

// a few hand cases of the playback
const t = C.parseText('camera = 1a0\n[variant 0 1 2 position]\nf9 0 -1000 4000\nf5 10\nf4\ne6 1000 -1000 4000 10\nf5 10\nf4\nff\n[variant 0 1 2 focus]\nfa 0 0 0\nff\n');
const r = C.simulate(t, 0, world, 100);
ok(r.frames[0].pos.x === 0 && r.frames[0].pos.z === 4000, 'jump to a point: there at frame 0');
ok(r.frames[9].pos.x === 0, 'wait 10: still there at frame 9 (' + r.frames[9].pos.x + ')');
ok(Math.abs(r.frames[15].pos.x - 500) <= 100, 'glide over 10 frames: about half way 5 frames in (' + r.frames[15].pos.x + ')');
ok(r.frames[25].pos.x === 1000, 'glide: arrived (' + r.frames[25].pos.x + ')');
ok(C.check({ number: 0x50, variants: t.variants }).some(p => p.includes('game')), 'a game number is reported');
let threw = false; try { C.parseText('camera = 190\n[variant 0 position]\nf0 1 2\n'); } catch (e) { threw = /takes 4/.test(e.message); }
ok(threw, 'a command with the wrong count of numbers is reported with its line');

console.log(checks + ' checks, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
