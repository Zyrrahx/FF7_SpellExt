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
   So new body animations of a party model go in 0x68-0x9b and 0xd0-0xff, each with its weapon track 0x34 on.
   - A model whose header gives N bodies + M weapon tracks (dword 7 = N, dword 10 = M, not a party model: every vanilla
     one is an enemy with a weapon, 16 + 16, e.g. the final-duel Sephiroth mu) keeps body i's weapon track at N + i.
     KimeraCS pairs them so (dword 7 + i); the game draws an enemy's weapon from body + 0x10 (0043076b, hard-coded),
     the same number for every such vanilla model. */
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

  /* why a model of N bodies + M weapon tracks (kind 'other') is not extended: a new body's weapon track would have to
     sit 16 further on (the game's 0043076b), where other bodies would go, and KimeraCS, which takes every record after
     the first dword-7 ones as a weapon track, would read the added bodies as weapon tracks */
  function otherText(model) {
    return 'this model has ' + model.header[7] + ' bodies + ' + model.header[10] + ' weapon tracks (an enemy with a weapon: body n\'s weapon track is ' + model.header[7] + ' + n): adding animations to it is not handled. Its animations can be added to another model (load its xxda in step 2) or retargeted';
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

  /* additions: [{ number, body: Uint8Array, weapon: Uint8Array|null, label }] (a party model's added animation without a
     weapon gets the game's placeholder: the page makes a track by its rule first, see index.html withWeapons)
     -> { aa: Uint8Array, da: Uint8Array, count, notes: [..], problems: [..] } */
  function build(model, additions) {
    const problems = [], notes = [];
    if (model.kind === 'other') return { problems: [otherText(model)], notes };
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
      if (hb.bones === 1 && model.bodyBones !== 1) problems.push(a.label + ' is a weapon track (1 bone), not a body animation: choose it as the weapon track of an added animation');
      else if (hb.bones !== model.bodyBones) problems.push(a.label + ': ' + hb.bones + ' bones, this model\'s animations have ' + model.bodyBones + ' (it was made for another skeleton)');
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
        // KimeraCS lists a party model's first 52 animations and draws each one's weapon from its track frame by frame
        // with no bound check: a body it lists (below 34) with a shorter track (the placeholder has no frames) fails there
        const kimera = a.number < WEAPON_OFFSET;
        if (!a.weapon) notes.push(hex(a.number) + ' (' + a.label + '): no weapon track (the game\'s placeholder): the weapon is not drawn while it plays' + (kimera ? '. KimeraCS fails showing this animation (its weapon track has no frames there): give it a weapon track made at the feet or held as in the idle' : ''));
        else if (fw < fb) notes.push(hex(a.number) + ' (' + a.label + '): the weapon track has ' + fw + ' frames for ' + fb + ': the weapon disappears for the last frames' + (kimera ? '. KimeraCS fails showing this animation past frame ' + (fw - 1) : ''));
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

  /* ---------- a .zip of animations (what the Retarget tab's Download gives: NAME.anim + NAME_weapon.anim) ----------
     Stored (uncompressed) entries only, which is what this page writes; Python's zipfile and every unzip tool read it. */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function put16(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function dosTime(d) {
    if (!d) return { time: 0, date: (1 << 5) | 1 };                         // 1980-01-01 00:00
    return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  // files: [{name, bytes}] -> the bytes of a .zip holding them as they are
  function writeZip(files, when) {
    const enc = new TextEncoder(), t = dosTime(when), parts = [], central = []; let o = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
      const lh = new Uint8Array(30 + name.length);
      put32(lh, 0, 0x04034b50); put16(lh, 4, 20); put16(lh, 6, 0x0800); put16(lh, 8, 0); put16(lh, 10, t.time); put16(lh, 12, t.date);
      put32(lh, 14, crc); put32(lh, 18, data.length); put32(lh, 22, data.length); put16(lh, 26, name.length); put16(lh, 28, 0); lh.set(name, 30);
      const ch = new Uint8Array(46 + name.length);
      put32(ch, 0, 0x02014b50); put16(ch, 4, 20); put16(ch, 6, 20); put16(ch, 8, 0x0800); put16(ch, 10, 0); put16(ch, 12, t.time); put16(ch, 14, t.date);
      put32(ch, 16, crc); put32(ch, 20, data.length); put32(ch, 24, data.length); put16(ch, 28, name.length); put32(ch, 42, o); ch.set(name, 46);
      parts.push(lh, data); central.push(ch); o += lh.length + data.length;
    }
    let clen = 0; central.forEach(c => { clen += c.length; });
    const end = new Uint8Array(22); put32(end, 0, 0x06054b50); put16(end, 8, files.length); put16(end, 10, files.length); put32(end, 12, clen); put32(end, 16, o);
    const out = new Uint8Array(o + clen + 22); let p = 0;
    for (const x of parts.concat(central, [end])) { out.set(x, p); p += x.length; }
    return out;
  }
  // a .zip -> [{name, bytes}] (folders left out); a compressed entry is refused in plain words
  function readZip(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let e = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) if (u32(bytes, i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('not a .zip file');
    const n = u16(bytes, e + 10), dec = new TextDecoder(), out = []; let c = u32(bytes, e + 16);
    for (let k = 0; k < n; k++) {
      if (c + 46 > bytes.length || u32(bytes, c) !== 0x02014b50) throw new Error('the .zip is damaged');
      const method = u16(bytes, c + 10), size = u32(bytes, c + 20), nl = u16(bytes, c + 28), xl = u16(bytes, c + 30), cl = u16(bytes, c + 32), lo = u32(bytes, c + 42);
      const name = dec.decode(bytes.subarray(c + 46, c + 46 + nl)); c += 46 + nl + xl + cl;
      if (/\/$/.test(name)) continue;
      if (method !== 0) throw new Error(name + ' is compressed in the .zip: unzip it and choose the .anim files themselves (the page reads only the .zip it wrote)');
      if (u32(bytes, lo) !== 0x04034b50) throw new Error('the .zip is damaged');
      const d = lo + 30 + u16(bytes, lo + 26) + u16(bytes, lo + 28);
      if (d + size > bytes.length) throw new Error('the .zip is damaged');
      out.push({ name, bytes: bytes.slice(d, d + size) });
    }
    return out;
  }

  /* ---------- which single .anim is the weapon track of which ----------
     The Retarget tab saves a body as NAME.anim and its weapon track as NAME_weapon.anim. A browser that already has
     a file of that name adds a copy number (NAME(1).anim, NAME (1).anim), but it numbers each name on its own: once a
     body was saved without its weapon file, NAME(3).anim goes with NAME_weapon(2).anim. So the copy number is NOT
     used to pair; the stem is, and, when one stem has several files, the time each was saved (File.lastModified:
     the old page saved the weapon 0.4 s after the body; the two files out of one .zip carry the same time). */
  function animKey(fileName) {
    const b = String(fileName).split(/[\\/]/).pop().toLowerCase();
    const m = /^(.*?)(?:\s?\((\d+)\))?\.anim$/.exec(b);
    if (!m) return null;
    const w = /^(.*)_weapon$/.exec(m[1]);
    return { stem: w ? w[1] : m[1], copy: m[2] || '', weapon: !!w };
  }
  const PAIR_MS = 2000;           // with several files of a name: a body and a weapon saved within this belong together
  const PAIR_ONE_MS = 60000;      // one body and one weapon file of a name: they pair unless saved further apart than this
  const timeOf = x => (typeof x.time === 'number' && x.time > 0 ? x.time : null);
  function apart(a, b) {          // null: a time is not known; else the gap in ms
    const ta = timeOf(a), tb = timeOf(b);
    return ta === null || tb === null ? null : Math.abs(ta - tb);
  }
  /* items: sourceList items (bodies, and weapon-only .anim files marked weaponTrack), each with .time when known.
     Per stem: one body that has no weapon yet and one NAME_weapon file pair, unless both times are known and more
     than PAIR_ONE_MS apart (the Retarget tab's two "only" buttons are two clicks, seconds apart). With several of either, a weapon pairs with the one body saved within PAIR_MS of it (and that
     body with no other weapon in that time). Everything else is left unpaired and reported in `unsure`.
     -> { items: what is left to list, pairs: [{ body, weapon }], unsure: [{ stem, bodies, weapons, gap? }] }
     (the body items are changed in place) */
  function pairByName(items) {
    const pairs = [], unsure = [], groups = new Map();
    const group = stem => { if (!groups.has(stem)) groups.set(stem, { bodies: [], weapons: [] }); return groups.get(stem); };
    for (const x of items) {
      if (!x.single) continue;
      const k = animKey(x.name); if (!k) continue;
      if (x.weaponTrack) { if (k.weapon) group(k.stem).weapons.push(x); }
      else if (!k.weapon && !x.weapon) group(k.stem).bodies.push(x);
    }
    const pair = (b, w) => { b.weapon = w.body; b.weaponLabel = w.label; pairs.push({ body: b, weapon: w }); };
    groups.forEach((g, stem) => {
      if (!g.bodies.length || !g.weapons.length) return;
      if (g.bodies.length === 1 && g.weapons.length === 1) {
        const gap = apart(g.bodies[0], g.weapons[0]);
        if (gap === null || gap <= PAIR_ONE_MS) pair(g.bodies[0], g.weapons[0]);
        else unsure.push({ stem, bodies: g.bodies.slice(), weapons: g.weapons.slice(), gap });
        return;
      }
      const near = (b, w) => { const d = apart(b, w); return d !== null && d <= PAIR_MS; };
      const done = new Set();
      for (const w of g.weapons) {
        const bs = g.bodies.filter(b => !done.has(b) && near(b, w));
        if (bs.length !== 1 || g.weapons.filter(v => v !== w && !done.has(v) && near(bs[0], v)).length) continue;
        pair(bs[0], w); done.add(bs[0]); done.add(w);
      }
      const bodies = g.bodies.filter(b => !done.has(b)), weapons = g.weapons.filter(w => !done.has(w));
      if (bodies.length && weapons.length) unsure.push({ stem, bodies, weapons });
    });
    const used = new Set(pairs.map(p => p.weapon));
    return { items: items.filter(x => !used.has(x)), pairs, unsure };
  }

  /* Sources: what animations a loaded file offers, with the weapon track that goes with each.
     -> { kind, items: [{ index, body, weapon, label, file, name, single?, weaponTrack? }], weapons: [{ index, rec, label, file }] }
     items are the body animations (a single .anim of 1 bone is listed with weaponTrack: true: it is a weapon track);
     weapons are every weapon track (1 bone) the file holds, for choosing one by hand. */
  function singleItem(fileName, rec, label) {
    const one = headOf(rec).bones === 1;
    return { index: 0, body: rec, weapon: null, label: label || fileName, file: label || fileName, name: fileName, single: true, weaponTrack: one || undefined };
  }
  /* Which layout an animation file has, so each body can be given its weapon track (the same rule as ui_logic
     weaponRefIndex, retarget_core targetWeaponReference and anim_retarget.weapon_layout):
     - a limit pack (16 records, 8 on of 1 bone): body n (0-7) with n + 8;
     - a party xxda (records 52-55 of 1 bone): body n with n + 0x34 (0-33, and the bands 68-9b and d0-ff);
     - N bodies + M weapon tracks: body i with N + i (i < M). N and M are the skeleton header's dword 7 and dword 10
       when `counts` ({body, weapon}, from the model's xxaa) is given and fits the file (N + M records); otherwise they
       are read from the file itself: its bodies first (more than 1 bone each), then only 1-bone records (for every
       vanilla battle model these are the header's counts).
     -> { kind: 'pack' | 'party model' | 'bodies + weapons' | 'animations', bodies, weapons, from: 'header' | 'file' } */
  function layoutOf(recs, counts) {
    const bodyBones = recs.length ? headOf(recs[0]).bones : 0;
    if (recs.length === 16 && recs.slice(8).every(r => headOf(r).bones === 1)) return { kind: 'pack', bodies: 8, weapons: 8, from: 'file' };
    if (recs.length > PARTY_BODY && recs.slice(PARTY_BODY, PARTY_BODY + 4).every(r => headOf(r).bones === 1)) return { kind: 'party model', bodies: PARTY_BODY, weapons: recs.length - PARTY_BODY, from: 'file' };
    const plain = { kind: 'animations', bodies: recs.length, weapons: 0, from: 'file' };
    if (bodyBones === 1) return plain;
    let nb, from;
    if (counts && counts.body + counts.weapon === recs.length) { nb = counts.body; from = 'header'; }
    else { nb = 0; while (nb < recs.length && headOf(recs[nb]).bones !== 1) nb++; from = 'file'; if (!recs.slice(nb).every(r => headOf(r).bones === 1)) return plain; }
    const nw = recs.length - nb;
    return nb > 0 && nw > 0 ? { kind: 'bodies + weapons', bodies: nb, weapons: nw, from } : Object.assign(plain, { from });
  }
  /* counts ({body, weapon}: the source model's xxaa dword 7 and 10, or left out) decide the layout, see layoutOf */
  function sourceList(fileName, bytes, counts) {
    const lower = (fileName || '').toLowerCase();
    if (lower.endsWith('.anim')) {
      const it = singleItem(fileName, readSingle(bytes));
      return { kind: 'single', items: [it], weapons: it.weaponTrack ? [{ index: 0, rec: it.body, label: fileName, file: fileName }] : [] };
    }
    if (lower.endsWith('.zip')) {
      const entries = readZip(bytes), all = [], skipped = [];
      for (const e of entries) {
        if (!/\.anim$/i.test(e.name)) { skipped.push(e.name); continue; }
        all.push(singleItem(e.name.split('/').pop(), readSingle(e.bytes), fileName + ': ' + e.name.split('/').pop()));
      }
      if (!all.length) throw new Error('the .zip holds no .anim file');
      const weapons = all.filter(x => x.weaponTrack).map(x => ({ index: 0, rec: x.body, label: x.label, file: x.label }));
      return { kind: 'zip', items: pairByName(all).items, weapons, skipped };
    }
    const f = readAnimFile(bytes), recs = f.records, items = [], weapons = [], lay = layoutOf(recs, counts);
    const bodyBones = recs.length ? headOf(recs[0]).bones : 0;
    const bodyOfParty = i => i < PARTY_BODY || PARTY_BANDS.some(([lo, hi]) => i >= lo && i <= hi);
    const track = j => j < recs.length && !isDummy(recs[j]) && headOf(recs[j]).bones === 1;
    recs.forEach((r, i) => {
      if (isDummy(r)) return;
      if (headOf(r).bones === 1 && bodyBones !== 1) { weapons.push({ index: i, rec: r, label: fileName + ' ' + hex(i), file: fileName }); return; }   // a weapon track itself
      let wi = -1;
      if (lay.kind === 'pack') { if (i < 8) wi = i + 8; }
      else if (lay.kind === 'party model') { if (bodyOfParty(i) && track(i + WEAPON_OFFSET)) wi = i + WEAPON_OFFSET; }
      else if (lay.kind === 'bodies + weapons') { if (i < lay.bodies && i < lay.weapons && track(lay.bodies + i)) wi = lay.bodies + i; }
      const it = { index: i, body: r, weapon: wi < 0 ? null : recs[wi], label: fileName + ' ' + hex(i), file: fileName, name: fileName };
      if (wi >= 0) it.weaponIndex = wi;
      items.push(it);
    });
    return { kind: lay.kind, items, weapons, layout: lay };
  }

  const api = { PARTY_BODY, WEAPON_OFFSET, PARTY_BANDS, MAX_INDEX, hex, headOf, isDummy, dummy, readAnimFile, writeAnimFile, readSingle,
    readHeader, openModel, otherText, isWeaponSlot, freeNumbers, placeholderNumbers, scriptBytes, build, layoutOf, sourceList, crc32, writeZip, readZip, animKey, pairByName, PAIR_MS, PAIR_ONE_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKELETON_MASTER = api;
})(typeof self !== 'undefined' ? self : this);
