/* Skeleton Master core: add animations to a FF7 battle model (its xxaa skeleton header and xxda animation file).
   No display code: runs in a browser and under node alike. Animations are copied as whole records, byte for byte;
   nothing is decoded or re-encoded.

   What the game does (read from ff7_en.exe; see FF7_SpellExt/tools/work/anims_extra):
   - xxda: a u32 count, then per animation a 12-byte head (u32 bones, u32 frames, u32 size) and `size` bytes.
   - xxaa: 13 dwords; dword 7 = body animations (52 for a party model), dword 10 = the rest. The game allocates
     dword 7 + dword 10 pointers (005e14ec) and fills them from the xxda's OWN count with no bound (005e8379):
     the two must agree.
   - A party model plays the weapon track of body animation n at table index n + 0x34 (004306df).
   - A party actor's script bytes 0x2c-0x33 play the limit pack; 0x34-0x67 would play weapon tracks as bodies.
   - Script bytes 0x00-0x8d play that animation; `a7 NN` (and a9 xx NN, b6 NN) play any NN up to 0xff.
   So new body animations of a party model go in 0x68-0x9b and 0xd0-0xff, each with its weapon track 0x34 on. */
(function (root) {
  'use strict';

  const PARTY_BODY = 52, WEAPON_OFFSET = 0x34;
  const PARTY_BANDS = [[0x68, 0x9b], [0xd0, 0xff]];
  const MAX_INDEX = 0xff;                          // the highest number a script can play (a7 NN)
  const DUMMY_DATA = [0x30, 0x1a, 0x00, 0x00];     // the game's own placeholder data

  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function put32(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff; }
  function hex(n) { return n.toString(16).padStart(2, '0'); }

  /* one record: {bones, frames, size, bytes} */
  function headOf(rec) { return { bones: u32(rec, 0), frames: u32(rec, 4), size: u32(rec, 8) }; }
  function isDummy(rec) { const h = headOf(rec); return h.frames <= 1 && h.size <= 4; }
  function dummy(bones) { const r = new Uint8Array(16); put32(r, 0, bones); put32(r, 4, 1); put32(r, 8, 4); r.set(DUMMY_DATA, 12); return r; }

  /* xxda or a limit pack (.a00): -> { records: [Uint8Array], tail: Uint8Array } */
  function readAnimFile(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (bytes.length < 4) throw new Error('too short for an animation file');
    const n = u32(bytes, 0);
    if (n > 4096) throw new Error('this does not look like an animation file (it says ' + n + ' animations)');
    const records = []; let o = 4;
    for (let i = 0; i < n; i++) {
      if (o + 12 > bytes.length) throw new Error('the file ends inside animation ' + hex(i));
      const size = u32(bytes, o + 8);
      if (o + 12 + size > bytes.length) throw new Error('animation ' + hex(i) + ' runs past the end of the file');
      records.push(bytes.slice(o, o + 12 + size)); o += 12 + size;
    }
    return { records, tail: bytes.slice(o) };
  }
  function writeAnimFile(records, tail) {
    let len = 4; records.forEach(r => { len += r.length; }); len += tail ? tail.length : 0;
    const out = new Uint8Array(len); put32(out, 0, records.length); let o = 4;
    records.forEach(r => { out.set(r, o); o += r.length; });
    if (tail && tail.length) out.set(tail, o);
    return out;
  }

  /* a single animation saved by anim_tool.py extract (NN.anim): one record */
  function readSingle(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (bytes.length < 12 || bytes.length !== 12 + u32(bytes, 8)) throw new Error('not a single animation (.anim)');
    return bytes.slice();
  }

  /* xxaa header */
  function readHeader(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (bytes.length < 52) throw new Error('too short for a battle skeleton (xxaa)');
    const h = []; for (let i = 0; i < 13; i++) h.push(u32(bytes, i * 4));
    return h;
  }

  /* The model: what kind it is, and which numbers are free. */
  function openModel(aaBytes, daBytes) {
    const aa = new Uint8Array(aaBytes), h = readHeader(aa), da = readAnimFile(daBytes);
    const count = da.records.length, bones = h[3];
    if (h[7] + h[10] !== count) throw new Error('the skeleton says ' + h[7] + ' + ' + h[10] + ' = ' + (h[7] + h[10]) + ' animations, the animation file holds ' + count + ': are these two files of the same model?');
    const bodyBones = headOf(da.records[0]).bones;
    let kind;
    if (h[7] === PARTY_BODY && h[10] > 0) kind = 'party';
    else if (h[10] === 0) kind = 'enemy';
    else kind = 'other';
    return { aa, header: h, records: da.records, tail: da.tail, kind, bones, bodyBones, count };
  }

  function isWeaponSlot(model, i) {
    if (model.kind !== 'party') return false;
    if (i < PARTY_BODY) return false;
    return !PARTY_BANDS.some(([lo, hi]) => i >= lo && i <= hi);
  }

  /* Numbers a new body animation may take, in order: placeholders below 0x2c first (the old stopgap) are offered
     separately; these are the NEW numbers. */
  function freeNumbers(model, taken) {
    const out = [];
    if (model.kind === 'party') {
      for (const [lo, hi] of PARTY_BANDS) for (let n = lo; n <= hi; n++) {
        if (taken.has(n)) continue;
        if (n < model.count && !isDummy(model.records[n])) continue;          // already used by an earlier addition saved in the file
        out.push(n);
      }
    } else {
      for (let n = model.count; n <= MAX_INDEX; n++) if (!taken.has(n)) out.push(n);
    }
    return out;
  }
  /* placeholder slots of the model's own range a script can reach (the old stopgap: overwrite one) */
  function placeholderNumbers(model) {
    const out = [], limit = model.kind === 'party' ? 0x2c : model.count;
    for (let n = 0; n < Math.min(limit, model.count); n++) if (isDummy(model.records[n])) out.push(n);
    return out;
  }
  function scriptBytes(n) { return n <= 0x8d ? hex(n) : 'a7 ' + hex(n); }

  /* additions: [{ number, body: Uint8Array, weapon: Uint8Array|null, label }]
     -> { aa: Uint8Array, da: Uint8Array, count, notes: [..], problems: [..] } */
  function build(model, additions) {
    const problems = [], notes = [];
    if (model.kind === 'other') return { problems: ['this model has ' + model.header[7] + ' body + ' + model.header[10] + ' other animations: a layout this tool does not handle yet (party models have 52 + N, most enemies N + 0)'], notes };
    const table = model.records.map(r => r);
    const party = model.kind === 'party';
    const numbers = new Set();
    for (const a of additions) {
      if (numbers.has(a.number)) problems.push('number ' + hex(a.number) + ' is used twice');
      numbers.add(a.number);
      if (a.number > MAX_INDEX) problems.push(hex(a.number) + ': a script can play numbers up to ff only');
      if (party && a.number >= 0x2c && a.number <= 0x67) problems.push(hex(a.number) + ': 2c-33 are the limit pack and 34-67 the weapon tracks of a party model');
      if (party && a.number >= PARTY_BODY && !PARTY_BANDS.some(([lo, hi]) => a.number >= lo && a.number <= hi)) problems.push(hex(a.number) + ' is a weapon track number: use 68-9b or d0-ff');
      const hb = headOf(a.body);
      if (hb.bones !== model.bodyBones) problems.push(a.label + ': ' + hb.bones + ' bones, this model\'s animations have ' + model.bodyBones + ' (it was made for another skeleton)');
      if (a.weapon && headOf(a.weapon).bones !== 1) problems.push(a.label + ': its weapon track has ' + headOf(a.weapon).bones + ' bones, a weapon track has 1');
      if (a.number < model.count && !isDummy(model.records[a.number])) problems.push(hex(a.number) + ' already holds an animation of the model');
    }
    if (problems.length) return { problems, notes };
    let count = model.count;
    for (const a of additions) count = Math.max(count, a.number + 1, party ? a.number + WEAPON_OFFSET + 1 : 0);
    if (count > 0x134) { problems.push('the file would need ' + count + ' entries'); return { problems, notes }; }
    // every slot gets a placeholder of its kind first
    while (table.length < count) {
      const i = table.length;
      table.push(dummy(isWeaponSlot(model, i) ? 1 : model.bodyBones));
    }
    for (const a of additions) {
      table[a.number] = a.body;
      if (party) {
        const w = a.weapon || dummy(1);
        table[a.number + WEAPON_OFFSET] = w;
        const fb = headOf(a.body).frames, fw = headOf(w).frames;
        if (!a.weapon) notes.push(hex(a.number) + ' (' + a.label + '): no weapon track: the weapon is not drawn while it plays');
        else if (fw < fb) notes.push(hex(a.number) + ' (' + a.label + '): the weapon track has ' + fw + ' frames for ' + fb + ': the weapon disappears for the last frames');
      }
    }
    // every slot of the right kind
    table.forEach((r, i) => {
      const want = isWeaponSlot(model, i) ? 1 : model.bodyBones, got = headOf(r).bones;
      if (got !== want && !(model.kind !== 'party')) problems.push('slot ' + hex(i) + ' has ' + got + ' bones, it wants ' + want);
    });
    if (problems.length) return { problems, notes };
    const aa = model.aa.slice();
    const body = model.header[7];
    put32(aa, 7 * 4, party ? body : count);
    put32(aa, 10 * 4, party ? count - body : 0);
    return { aa, da: writeAnimFile(table, model.tail), count, notes, problems };
  }

  /* Sources: what animations a loaded file offers, with the weapon track that goes with each. */
  function sourceList(fileName, bytes) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.anim')) {
      const r = readSingle(bytes);
      return { kind: 'single', items: [{ index: 0, body: r, weapon: null, label: fileName }] };
    }
    const f = readAnimFile(bytes), recs = f.records, items = [];
    // a party xxda: body n with its weapon at n + 0x34; a limit pack of 16: body n (0-7) with weapon n + 8
    const bodyBones = recs.length ? headOf(recs[0]).bones : 0;
    const pack = recs.length === 16 && recs.slice(8).every(r => headOf(r).bones === 1);
    const partyDa = !pack && recs.length > PARTY_BODY && recs.slice(PARTY_BODY, PARTY_BODY + 4).every(r => headOf(r).bones === 1);
    recs.forEach((r, i) => {
      if (isDummy(r)) return;
      if (headOf(r).bones === 1 && bodyBones !== 1) return;                   // a weapon track itself
      let w = null;
      if (pack && i < 8) w = recs[i + 8];
      else if (partyDa && i < PARTY_BODY && i + WEAPON_OFFSET < recs.length && !isDummy(recs[i + WEAPON_OFFSET])) w = recs[i + WEAPON_OFFSET];
      items.push({ index: i, body: r, weapon: w, label: fileName + ' ' + hex(i) });
    });
    return { kind: pack ? 'pack' : partyDa ? 'party model' : 'animations', items };
  }

  const api = { PARTY_BODY, WEAPON_OFFSET, PARTY_BANDS, MAX_INDEX, hex, headOf, isDummy, dummy, readAnimFile, writeAnimFile, readSingle,
    readHeader, openModel, isWeaponSlot, freeNumbers, placeholderNumbers, scriptBytes, build, sourceList };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKELETON_MASTER = api;
})(typeof self !== 'undefined' ? self : this);
