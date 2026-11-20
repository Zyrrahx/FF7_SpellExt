// Skeleton Master, the Scripts tab's core (ab_core.js): node tests/ab_tests.js [folder with the game's battle files]
// The folder holds battle.lgp's files as extracted (aaab..smab, their xxda). Every xxab in it is read and written back
// byte for byte, every script is decoded and checked, and edits are tested on real files.
'use strict';
const fs = require('fs'), path = require('path');
const B = require('../ab_core.js');
const DIR = process.argv[2];
if (!DIR) { console.log('usage: node tests/ab_tests.js <folder with battle.lgp\'s files as extracted>'); process.exit(2); }
let checks = 0, failed = 0;
function ok(c, what) { checks++; if (!c) { failed++; console.log('FAILED: ' + what); } }
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const rd = f => new Uint8Array(fs.readFileSync(path.join(DIR, f)));
const H = s => new Uint8Array(s.split(/\s+/).filter(Boolean).map(x => parseInt(x, 16)));
const countOf = stem => { try { const d = rd(stem + 'da'); return d[0] | (d[1] << 8) | (d[2] << 16); } catch (e) { return undefined; } };
const GOOD_ENDS = ['finish', 'hold', 'wait', 'idle', 'loop', 'reload'];

/* ------------------------------------------------------------------ every file of the game */
const files = fs.readdirSync(DIR).filter(f => /^[a-z]{2}ab$/.test(f)).sort();
ok(files.length === 481, '481 xxab files in ' + DIR + ' (' + files.length + ')');
let read = 0, stubs = 0, scripts = 0, party = 0, enemy = 0, notGood = [], probs = [], hexBad = [], past = [];
const seenOps = new Set();
for (const f of files) {
  const bytes = rd(f);
  let doc;
  try { doc = B.readAb(bytes); } catch (e) {
    if (bytes.length === 8 && /holds no scripts/.test(e.message)) { stubs++; continue; }
    ok(false, f + ': read (' + e.message + ')'); continue;
  }
  read++; if (doc.kind === 'party') party++; else enemy++;
  ok(eq(B.write(doc), bytes), f + ': unedited, written back byte for byte');
  ok(!B.changes(doc).length, f + ': no changes after reading');
  const count = countOf(f.slice(0, 2));
  // the region of each pointer as the old Python tool (ab_tool.py) cuts it: from the offset to the next one
  const ptrs = Array.from({ length: doc.realSlots }, (_, i) => B.ptrOf(doc, i));
  const cuts = Array.from(new Set(ptrs.concat(B.fxOffsets(doc), [bytes.length]))).sort((a, b) => a - b);
  for (let i = 0; i < doc.realSlots; i++) {
    const s = B.slotInfo(doc, i);
    if (s.state !== 'ok' || s.empty) continue;
    scripts++;
    const k = s.decoded.end.kind;
    if (!GOOD_ENDS.includes(k)) notGood.push(f + ':' + i + ' ' + k);
    s.decoded.items.forEach(it => seenOps.add(it.op));
    const v = B.validate(s.bytes, { kind: doc.kind, slot: i, count });
    if (v.problems.length) probs.push(f + ':' + i + ' ' + v.problems.join(' '));
    const p = B.parseHex(B.formatScript(s.bytes));
    if (!p.bytes || !eq(p.bytes, s.bytes)) hexBad.push(f + ':' + i);
    const next = cuts.find(x => x > s.ptr);
    if (s.ptr + s.bytes.length > next) past.push(f + ':' + i);
  }
}
ok(stubs === 90, '90 battle-scene stubs (8 bytes) refused plainly (' + stubs + ')');
ok(read === 391 && party === 21 && enemy === 370, '391 files read: 21 party models, 370 enemies (' + read + ', ' + party + ', ' + enemy + ')');
ok(scripts > 4400, 'over 4400 scripts decoded (' + scripts + ')');
ok(!notGood.length, 'every script reaches a proper end (' + notGood.slice(0, 5).join(', ') + ')');
ok(!probs.length, 'no vanilla script is refused by the checks (' + probs.slice(0, 3).join(' | ') + ')');
ok(!hexBad.length, 'the text box form of every script reads back to the same bytes (' + hexBad.slice(0, 5).join(', ') + ')');
ok(!past.length, 'no script runs past the next offset (' + past.slice(0, 5).join(', ') + ')');

/* ------------------------------------------------------------------ the opcode table */
const ops = Object.keys(B.OPS).map(Number);
ok(ops.length === 107, '107 commands (' + ops.length + ')');
ok(ops.every(o => o >= 0x8e && !B.ANIM_LIKE.has(o)) && ops.length + B.ANIM_LIKE.size + 0x8e === 256, 'animations 00-8d + 7 animation-like bytes + 107 commands = all 256 bytes');
ok(seenOps.size > 100, 'the game\'s files use ' + seenOps.size + ' different bytes, all decoded');
// argument lengths read from the code, checked on scripts known to the project (each must decode exactly to its end)
const known = [
  ['ce c2 00 f4 01 f3 ee cd c2 00 f6 f4 01 f3 ee', 'finish'],      // the exe's own script (007c10e0..)
  ['e8 c9 f4 01 f3 ca ec ee', 'finish'],                          // the exe's own script
  ['e8 fc 00 e0 ea f4 19 f3 ec 2c 2d 2d 2e fa e5 ee', 'finish'],  // a limit line of SpellExt's config
  ['e8 fc 00 e0 ea f4 19 f3 ec f0 2c d8 00 1a 00 fb 40 06 00 00 f0 2d d8 19 30 00 a8 26 08 2e fa f0 e5 ee', 'finish'],
  ['ab 90 01 00 00 08 f4 0f f3 fa e5 a6 ee', 'finish'],            // Cloud's Cover
  ['e5 c4 90 01 06 12 e7 00 f1', 'hold'],                          // Cloud's blown away
  ['c4 90 01 06 07 fe c0', 'idle'],                                // escaping
  ['a9 c9 00 c1', 'loop'],                                         // an enemy idle
  ['90 01 ff 7f ee', 'finish'],                                    // 90 = a byte and a word (the table the project had lacked it)
];
known.forEach(([s, k]) => { const b = H(s), d = B.decode(b); ok(d.end.kind === k && d.length === b.length, 'decodes exactly: ' + s + ' (' + d.end.kind + ', ' + d.length + '/' + b.length + ')'); });
ok(B.decode(H('fe 00 ee')).end.kind === 'finish' && B.decode(H('fe 00 ee')).items.length === 3, 'fe without c0 runs on (the next byte is played)');
ok(B.decode(H('e5 06 f1')).items.map(i => i.kind).join() === 'op,anim,op', 'e5 06 f1: a command, an animation, a command');

/* ------------------------------------------------------------------ party model: Cloud */
const rtab = rd('rtab'), rt = B.readAb(rtab), rtCount = countOf('rt');
ok(rt.kind === 'party' && rt.slots === 74 && rt.realSlots === 74, 'rtab: a party model, 74 slots');
ok(B.hexBytes(B.scriptOf(rt, 0)) === '00 fe c0' && B.slotInfo(rt, 0).decoded.end.kind === 'idle', 'rtab 0: 00 fe c0, the idle loop');
ok(B.hexBytes(B.scriptOf(rt, 2)) === 'e5 06 f1' && B.slotInfo(rt, 2).decoded.end.kind === 'hold', 'rtab 2: e5 06 f1, KO held');
ok(B.slotUse('party', 2).name === 'KO' && B.slotUse('party', 60).name === 'Limit 1-1' && B.slotUse('party', 0x30).exe, 'slot names: 2 KO, 60 limit 1-1, 0x30 the exe\'s');
const s3 = B.slotInfo(rt, 3);
ok(B.hexBytes(s3.bytes) === 'b3 f9 03 ed e3 ee b2 f9 03 b1 03 b1 e3 ee' && s3.decoded.items.filter(i => i.late).length === 8, 'rtab 3: the bytes after the first ee, reached through b3 ... b2, belong to the script');
const d20 = B.slotInfo(rt, 20).decoded;
ok(B.describe(d20.items.find(i => i.op === 0xd8), { kind: 'party' }) === 'After 0 frames plays sound 1a', 'd8 00 1a 00 in plain words (' + B.describe(d20.items.find(i => i.op === 0xd8), { kind: 'party' }) + ')');
ok(B.describe({ kind: 'anim', op: 0x2d }, { kind: 'party' }) === 'Plays limit pack animation 1 (2d)', 'a party 2d is the limit pack\'s second');
ok(/not in the model/.test(B.describe({ kind: 'anim', op: 0x80 }, { kind: 'enemy', count: 10 })), 'an animation past the model is said to be missing');

/* edits: in place */
{
  const doc = B.readAb(rtab), p = B.ptrOf(doc, 5), before = B.scriptOf(doc, 5);       // 0f f2 e5 ee, its own
  ok(B.hexBytes(before) === '0f f2 e5 ee' && B.sharers(doc, 5).length === 1, 'rtab 5: 0f f2 e5 ee, not shared');
  const r = B.setScript(doc, [5], H('10 e5 ee'));
  ok(r.how === 'in place' && r.at === p, 'a shorter script goes in place (' + r.how + ')');
  const out = B.write(doc);
  ok(out.length === rtab.length && out.every((x, i) => x === rtab[i] || (i >= p && i < p + 4)), 'only its own 4 bytes changed');
  ok(B.hexBytes(out.slice(p, p + 4)) === '10 e5 ee 00', 'the old tail is zeroed');
  ok(B.changes(doc).join() === '5', 'changes(): slot 5');
  B.setScript(doc, [5], before);
  ok(eq(B.write(doc), rtab), 'putting the old bytes back gives the file back byte for byte');
  ok(B.setScript(doc, [5], before).how === 'same', 'the same bytes again: no change');
  B.undo(doc); ok(B.hexBytes(B.scriptOf(doc, 5)) === '10 e5 ee', 'undo goes back one change');
  B.reset(doc); ok(eq(B.write(doc), rtab) && !doc.undo.length, 'reset: the file as loaded');
}
/* edits: too long for its room -> added at the end; the party file's effect offsets point at its end */
{
  const doc = B.readAb(rtab), long = H('fc 03 ed f7 01 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 04 fa e5 ee');
  ok(B.fxOffsets(doc).every(x => x === rtab.length), 'rtab: its 8 effect offsets point at the end of the file');
  const others = Array.from({ length: 74 }, (_, i) => i === 5 ? null : B.hexBytes(B.scriptOf(doc, i)));
  const r = B.setScript(doc, [5], long), out = B.write(doc);
  ok(r.how === 'added' && r.at === rtab.length + 32 && r.notes.length === 1, 'a longer script is added after 32 zero bytes for the effect offsets (' + r.how + ' at ' + r.at + ')');
  ok(out.length % 4 === 0 && eq(out.slice(r.at, r.at + long.length), long), 'added 4-aligned');
  ok(out[rtab.length] === 0xee && out.slice(rtab.length + 1, r.at).every(x => x === 0), 'the 32 bytes before it are ee and zeros');
  ok(out.slice(0, rtab.length).every((x, i) => x === rtab[i] || (i >= 0x68 + 20 && i < 0x68 + 24)), 'nothing of the old file changed but slot 5\'s offset');
  const back = B.readAb(out);
  ok(B.hexBytes(B.scriptOf(back, 5)) === B.hexBytes(long) && Array.from({ length: 74 }, (_, i) => i === 5 || B.hexBytes(B.scriptOf(back, i)) === others[i]).every(Boolean), 'read back: slot 5 is new, every other slot as it was');
  const len1 = out.length;
  const r2 = B.setScript(doc, [5], H('fc 03 ed f7 01 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 0f 04 fa e5 ee'));
  ok(r2.how === 'added' && r2.at === r.at && B.write(doc).length === len1 + 8, 'changing an added script again rewrites it where it is (the file does not grow twice)');
}
/* edits: a shared script */
{
  const doc = B.readAb(rtab), sh = B.sharers(doc, 20);
  ok(sh.length > 1, 'rtab 20 (Attack) is shared by ' + sh.join(', '));
  const old = B.hexBytes(B.scriptOf(doc, 20)), mine = H(old.replace(/ 1d e5 ee$/, ' 1d 1d e5 ee'));
  const r = B.setScript(doc, [20], mine);
  ok(r.how === 'added' && B.sharers(doc, 20).length === 1 && sh.filter(i => i !== 20).every(i => B.hexBytes(B.scriptOf(doc, i)) === old), 'this slot only: it gets its own copy, the others keep the old bytes');
  const doc2 = B.readAb(rtab), p = B.ptrOf(doc2, 20), shorter = H(old.replace(/ 1d e5 ee$/, ' e5 ee'));
  const r2 = B.setScript(doc2, sh, shorter);
  ok(r2.how === 'in place' && r2.at === p && sh.every(i => B.ptrOf(doc2, i) === p && B.hexBytes(B.scriptOf(doc2, i)) === B.hexBytes(shorter)), 'every slot that shares it, shorter: in place, all still share it');
  let threw = false; try { B.setScript(doc2, [20, 5], shorter); } catch (e) { threw = /do not share/.test(e.message); }
  ok(threw, 'slots that do not share one script are refused');
}

/* ------------------------------------------------------------------ broken offsets (saab), short tables (obab), enemies */
{
  const saab = rd('saab'), doc = B.readAb(saab);
  ok([51, 52, 61, 62].every(i => B.stateOf(doc, i) === 'end') && [64, 65, 73].every(i => B.stateOf(doc, i) === 'header'), 'saab: 51, 52, 61, 62 point at the end of the file, 64-73 into the header');
  ok(eq(B.write(doc), saab), 'saab: written back byte for byte');
  const r = B.setScript(doc, [64], H('ec e5 ee'));
  ok(r.how === 'added' && r.notes.length === 1 && /51, 52, 61, 62/.test(r.notes[0]), 'saab 64 repaired: added, and the slots that pointed at the end get zeros (' + r.notes.join(' ') + ')');
  const back = B.readAb(B.write(doc));
  ok(B.hexBytes(B.scriptOf(back, 64)) === 'ec e5 ee' && B.stateOf(back, 51) === 'ok' && B.hexBytes(B.scriptOf(back, 51)) === 'ee' && B.stateOf(back, 65) === 'header', 'read back: 64 = ec e5 ee, 51 now points at the pad (ee), 65 still into the header');
  ok(B.changes(doc).join() === '64', 'saab: only slot 64 is a change (51, 52, 61, 62 kept their offsets): ' + B.changes(doc).join());
  ok(B.changes(doc).every(i => !B.validate(B.scriptOf(doc, i), { kind: 'party', slot: i }).problems.length), 'saab: the save check passes after an edit added at the end');
  const d2 = B.readAb(saab); B.setScript(d2, [5], H('00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 e5 ee'));
  ok(B.changes(d2).join() === '5', 'saab: a long slot 5 is the only change (' + B.changes(d2).join() + ')');
}
{
  const obab = rd('obab'), doc = B.readAb(obab);
  ok(doc.kind === 'enemy' && doc.realSlots === 24 && B.stateOf(doc, 24) === 'none' && B.stateOf(doc, 0) === 'ok', 'obab: an enemy with 24 real entries; 24-31 are not entries');
  let threw = false; try { B.setScript(doc, [25], H('ee')); } catch (e) { threw = /not a real entry/.test(e.message); }
  ok(threw, 'obab: a slot past its real entries cannot be given a script');
  const p0 = B.ptrOf(doc, 0), sh = B.sharers(doc, 0), r = B.setScript(doc, sh, H('00 fe c0'));
  ok(p0 < doc.tableEnd && r.how === 'added', 'obab: a script that lies inside the 32 entries the game reads is never written in place (' + r.how + ')');
}
{
  const byab = rd('byab'), doc = B.readAb(byab), fx = B.fxOffsets(doc), fxData = byab.slice(fx[0], byab.length);
  ok(fx[0] < byab.length && fxData.some(x => x), 'byab: holds effect data at its header\'s offsets');
  const r = B.setScript(doc, [0], H('a9 c9 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10 11 12 13 14 15 16 17 c1'));
  const out = B.write(doc);
  ok(r.how === 'added' && eq(out.slice(fx[0], byab.length), fxData) && eq(B.fxOffsets(B.readAb(out)), fx), 'byab: a longer idle is added; the effect data and its offsets stay as they were');
  const hb = B.readAb(rd('hbab'));
  ok(hb.kind === 'enemy' && Array.from({ length: 32 }, (_, i) => B.stateOf(hb, i)).every(s => s === 'header'), 'hbab: every offset 0 (into the header), read as an enemy');
  const aa = B.readAb(rd('aaab'));
  ok(B.hexBytes(B.scriptOf(aa, 0)) === 'a9 c9 00 c1' && B.slotInfo(aa, 31).empty, 'aaab: idle a9 c9 00 c1; an unused slot is zeros');
  ok(B.slotUse('enemy', 2).name === 'Dead' && /attack data/.test(B.slotUse('enemy', 7).when), 'enemy slot names: 2 dead, the rest by its attack data');
}
let threw = false; try { B.readAb(rd('ogab')); } catch (e) { threw = /no scripts/.test(e.message); } ok(threw, 'a battle scene\'s 8-byte stub is refused');
threw = false; try { B.readAb(rd('rtab'), { kind: 'enemy' }); } catch (e) { threw = /cannot be read as an enemy/.test(e.message); } ok(threw, 'a party file forced to enemy kind is refused');
{ const buf = fs.readFileSync(path.join(DIR, 'rtab')), d = B.readAb(buf); d.cur[0x200] ^= 0xff; ok(d.orig[0x200] === buf[0x200] && d.orig[0x200] !== d.cur[0x200], 'a node Buffer is copied: the loaded and edited copies do not share memory'); }
threw = false; try { B.readAb(rd('aaab').slice(0, 0x100), { kind: 'party' }); } catch (e) { threw = /too short/.test(e.message); } ok(threw, 'an enemy file forced to party kind is refused as too short');

/* ------------------------------------------------------------------ the checks */
const V = (s, ctx) => B.validate(H(s), Object.assign({ kind: 'party', slot: 20, count: 94 }, ctx || {}));
const has = (list, re) => list.some(x => re.test(x));
ok(has(B.validate(new Uint8Array(0), {}).problems, /empty/), 'an empty script is refused');
ok(has(V('00 01 02').problems, /no end/), 'a script with no end is refused');
ok(has(V('d8 00 1a').problems, /needs more bytes/), 'a command cut short is refused');
ok(has(V('00 c1').problems, /no(ne| c9)|there is none/), 'c1 with no c9 is refused (a freeze)');
ok(has(V('b3 00 ee').problems, /b2/), 'b3 with no b2 after it is refused');
ok(has(V('ce 00 ee', { kind: 'enemy', slot: 5 }).problems, /cd/) && !V('ce 00 ee').problems.length, 'ce with no cd: refused for an enemy, a warning for the party');
ok(has(V('d4 10 00 00 ee').problems, /divides by zero/) && has(V('a8 05 00 ee').problems, /divides by zero/) && has(V('94 00 00 10 00 00 ee').problems, /divides by zero/), 'd4, 94 and a8 over 0 frames are refused (a crash)');
ok(['99 00 00 10 00 00 00 ee', 'cc 00 ee', 'cf 00 00 00 00 00 00 00 00 ee', 'd5 00 00 00 00 00 00 00 00 ee', 'd1 00 10 00 00 00 ee', 'e9 00 10 00 ee'].every(t => has(V(t).problems, /divides by zero/)) && !V('d1 00 10 00 00 04 ee').problems.length, '99, cc, cf, d5, d1 and e9 over 0 frames are refused (a crash); with frames they pass');
ok(has(V('d0 00 10 08 ee').warnings, /only 0-7/) && !V('d0 00 10 07 ee').warnings.length, 'd0 with a value over 7 is a warning');
ok(has(V('ee', { slot: 0 }).problems, /freeze/) && has(V('f2 ff', { slot: 0 }).problems, /freeze/) && has(V('e5 fe c0', { slot: 0 }).problems, /freeze/), 'an idle that starts again with nothing played is refused (a freeze)');
ok(has(V('c9 e5 c1', { kind: 'enemy', slot: 0 }).problems, /freeze/) && has(V('c9 c1', { kind: 'enemy', slot: 5 }).problems, /freeze/) && has(V('00 c9 c1', { kind: 'enemy', slot: 0 }).problems, /freeze/), 'a c9 .. c1 loop with nothing played is refused (a freeze), also after a first animation');
ok(!V('00 fe c0', { slot: 0 }).problems.length && !V('a9 c9 00 c1', { kind: 'enemy', slot: 0 }).problems.length && !V('e5 ee', { kind: 'enemy', slot: 2 }).problems.length && !V('ee', { slot: 20 }).problems.length && !V('f4 05 f3 fe c0', { slot: 0 }).problems.length, 'idles that play, an enemy Dead e5 ee and an action ee pass');
ok(has(V('c9 e8 ca ec 00 ee').warnings, /loading/) && !V('c9 e8 ca ec 00 ee').problems.length && !V('c9 00 ca ec 00 ee').warnings.some(w => /loading/.test(w)), 'c9 .. ca with nothing played is a warning (spins while loading), not a refusal');
ok(has(V('40 ee', { count: 0x5e }).warnings, /weapon track/) && has(V('60 ee', { count: 0x5e }).warnings, /not in the model/) && !has(V('60 ee', { count: 0x5e }).warnings, /weapon track/), 'a number past the model is "not in the model" before "weapon track"');
ok(has(V('f5 01 ee').problems, /enemies/) && !V('f5 01 ee', { kind: 'enemy', slot: 5 }).problems.length, 'f5 is refused on a party model only');
ok(has(V(Array(257).fill('00').join(' ') + ' ee').problems, /256/), 'a script over 256 bytes is refused');
ok(has(V('70 ee').warnings, /not in the model/), 'an animation past the model\'s count is a warning');
ok(has(V('a7 c8 ee').warnings, /not in the model/), 'a7 NN is checked too');
ok(has(V('40 ee').warnings, /weapon track/), 'a weapon track number as a body is a warning');
ok(has(V('2c ee').warnings, /limit pack/) && !has(V('2c ee', { slot: 60 }).warnings, /limit pack/), 'the limit pack outside a limit slot is a warning');
ok(has(V('fe 00 ee').warnings, /without c0/), 'fe without c0 is a warning');
ok(has(V('1a 1b fe c0').warnings, /for ever/) && !V('00 fe c0', { slot: 0 }).warnings.length, 'a loop in Attack is a warning, in the idle it is not');
ok(has(V('00 ee', { slot: 0x30 }).warnings, /never reads this slot/), 'an exe-owned slot is a warning');
ok(has(V('05 e5 ee 00 00 07').warnings, /never played/), 'bytes after the end are a warning');
ok(has(V('bb ee').warnings, /not a command/), 'an animation-like byte is a warning');
ok(!V('fc f0 d8 00 1a 00 1a d1 b0 04 00 00 04 f0 1b f7 01 1e 1c fa f0 1d e5 ee').problems.length, 'Cloud\'s Attack passes');
ok(B.parseHex('e5 06 # the KO pose\nf1').bytes.length === 3 && /not a byte/.test(B.parseHex('e5 6 f1').error) && B.parseHex('e506f1').bytes.length === 3, 'the text box: comments and spaces free, a one-digit byte refused');

/* ------------------------------------------------------------------ what the preview plays */
const sim = s => B.simulate(H(s), { kind: 'party' });
const a20 = sim('fc f0 d8 00 1a 00 1a d1 b0 04 00 00 04 f0 1b f7 01 1e 1c fa f0 1d e5 ee');
ok(a20.steps.map(s => B.hex(s.anim)).join(' ') === '1a 1b 1e 1c 1d' && a20.end.kind === 'finish', 'Attack plays 1a 1b 1e 1c 1d, then back to the idle');
const lim = sim('e8 fc 00 e0 ea f4 19 f3 ec 2c 2d 2d 2e fa e5 ee');
ok(lim.steps.length === 6 && lim.steps[1].wait === 25 && lim.steps[0].anim === 0, 'f4 19 f3 is a wait of 25 frames');
const idle = B.simulate(H('a9 c9 00 c1'), { kind: 'enemy' });
ok(idle.end.kind === 'loop' && idle.end.loopTo === 1 && idle.steps.length === 2, 'a9 c9 00 c1 loops on its 00');
const ex = 'ce c2 00 f4 01 f3 ee cd c2 00 f6 f4 01 f3 ee';
ok(sim(ex).steps.length === 1 && B.simulate(H(ex), { kind: 'enemy' }).steps.length === 1 && B.simulate(H(ex), { kind: 'enemy' }).steps[0].at > 7, 'ce: the party runs on, an enemy skips to after cd');
ok(sim('e5 06 f1').end.kind === 'hold' && sim('00 fe c0').end.kind === 'idle' && sim('1e 9e').end.kind === 'wait', 'hold, idle loop and wait ends');
ok(sim('00 c1').end.kind === 'freeze', 'c1 with no c9: the preview says it would freeze');

// the second review's fixes
{
  const pairs = []; for (let i = 0; i < 30; i++) pairs.push('b3 b2');
  const t0 = Date.now(), v = B.validate(H(pairs.join(' ') + ' 00 ee'), { kind: 'party', slot: 20 });
  ok(Date.now() - t0 < 2000 && v.problems.length === 0 && v.warnings.some(w => /branches too often/.test(w)), '30 b3 b2 pairs: the freeze check stops on its budget with a warning (' + (Date.now() - t0) + ' ms)');
  const aa = new Uint8Array(fs.readFileSync(path.join(DIR, 'aaab'))), d = B.readAb(aa), len = d.cur.length;
  d.cur.set([len & 255, len >> 8 & 255, 0, 0], 0x68 + 20); d.orig = d.cur.slice();
  const r = B.setScript(d, [5], H('00 ee'));
  ok(r.at === len + 32 && B.changes(d).length === 1 && B.changes(d)[0] === 5, 'a slot pointing at the end of the file: its new script goes after the pad, and shows as a change');
}

console.log((failed ? failed + ' of ' : 'all ') + checks + ' checks ' + (failed ? 'FAILED' : 'passed'));
process.exit(failed ? 1 : 0);
