// Skeleton Master core tests: node tests/run_tests.js [folder with the party models' xxaa/xxda]
'use strict';
const fs = require('fs'), path = require('path');
const A = require('../anim_core.js');
const DIR = process.argv[2] || '/run/media/binah/Data/FF7_Decompile/FF7_SpellExt/tools/work/anims_extra';   // the party models' xxaa/xxda (from battle.lgp) and cmp_rt_aa/da (make_extra_candidate.py)
let checks = 0, failed = 0;
function ok(c, what) { checks++; if (!c) { failed++; console.log('FAILED: ' + what); } }
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const rd = f => new Uint8Array(fs.readFileSync(path.join(DIR, f)));

// every party model reads, writes back byte for byte, and opens as a party model
for (const m of ['rt', 'ru', 'rv', 'rw', 'rx', 'ry', 'rz', 'sa', 'sb', 'sf']) {
  const da = rd(m + 'da'), aa = rd(m + 'aa');
  const f = A.readAnimFile(da);
  ok(eq(A.writeAnimFile(f.records, f.tail), da), m + 'da: reads and writes back byte for byte');
  const model = A.openModel(aa, da);
  ok(model.kind === 'party', m + ': a party model (' + model.kind + ')');
  ok(A.freeNumbers(model, new Set()).length === 0x34 + 0x30, m + ': 100 free numbers (' + A.freeNumbers(model, new Set()).length + ')');
}

// the same result as the Python prototype (make_extra_candidate.py rt cmp_rt_ 68=1e 90=02)
const model = A.openModel(rd('rtaa'), rd('rtda'));
const src = model.records;
const adds = [{ number: 0x68, body: src[0x1e], weapon: src[0x1e + 0x34], label: 'rtda 1e' }, { number: 0x90, body: src[0x02], weapon: src[0x02 + 0x34], label: 'rtda 02' }];
const out = A.build(model, adds);
ok(!out.problems.length, 'Cloud + 2: no problems (' + out.problems.join('; ') + ')');
ok(eq(out.aa, rd('cmp_rt_aa')), 'Cloud + 2: xxaa byte for byte as the Python prototype');
ok(eq(out.da, rd('cmp_rt_da')), 'Cloud + 2: xxda byte for byte as the Python prototype');
ok(out.count === 197, 'Cloud + 2: 197 animations (' + out.count + ')');
const back = A.openModel(out.aa, out.da);
ok(back.count === 197 && back.header[7] + back.header[10] === 197, 'the result opens again with a matching header');
ok(eq(back.records[0x68], src[0x1e]) && eq(back.records[0x68 + 0x34], src[0x52]), '0x68 and its weapon track at 0x9c are the sources');
ok(back.records.slice(0, 94).every((r, i) => eq(r, src[i])), 'the first 94 animations are unchanged');

// refusals
const bad = (n, w) => A.build(model, [{ number: n, body: src[0x1e], weapon: w === undefined ? src[0x52] : w, label: 't' }]).problems.length > 0;
ok(bad(0x2c), '2c (limit pack) refused'); ok(bad(0x40), '40 (a weapon track) refused'); ok(bad(0x9c), '9c (a weapon track) refused');
ok(bad(0x100), '100 refused'); ok(!bad(0xd0), 'd0 accepted'); ok(!bad(0x9b), '9b accepted');
ok(A.build(model, [{ number: 0x68, body: src[0x52], weapon: null, label: 'w' }]).problems.length > 0, 'a weapon track as a body is refused (bone count)');
const other = A.openModel(rd('ruaa'), rd('ruda'));
ok(A.build(model, [{ number: 0x68, body: other.records[0x1e], weapon: null, label: 'Barret' }]).problems.length > 0 || other.bodyBones === model.bodyBones, 'another skeleton\'s animation is refused');
ok(A.build(model, [{ number: 0x68, body: src[0x1e], weapon: null, label: 'x' }]).notes.length === 1, 'no weapon track: a note');
ok(A.scriptBytes(0x68) === '68' && A.scriptBytes(0x90) === 'a7 90', 'script bytes');

// sources
const s = A.sourceList('rtda', rd('rtda'));
ok(s.kind === 'party model' && s.items.every(it => A.headOf(it.body).bones !== 1), 'a party xxda offers body animations only');
ok(s.items.find(it => it.index === 0x1e).weapon && eq(s.items.find(it => it.index === 0x1e).weapon, src[0x52]), 'its weapon track comes along');
console.log(checks + ' checks, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
