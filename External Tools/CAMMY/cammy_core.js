/* CAMMY core: FF7 battle camera scripts (the format, the game's camdat files, playback, SpellExt's text form).
   No display code here, so it runs in a browser and under node alike.

   A camera is two scripts that run side by side, POSITION (where the camera is) and FOCUS (the point it looks at),
   in three variants (0, 1, 2). A script is a list of commands: one byte, then its operands (b = a byte, w = a 16-bit
   number, low byte first). The command table was read off the game's two interpreters (FUN_005c23d1 position,
   FUN_005c3fd5 focus) and checked against all 2,764 scripts of the game's three camera files (cam_tool.py check).
   Coordinates are the battle's own: x along the party's line, y up and down (up is NEGATIVE), z forward and back
   (the enemies normally stand at negative z). */
(function (root) {
  'use strict';

  const LAYOUT = {
    position: { 0xd5: 'w', 0xd6: '', 0xd7: 'bb', 0xd8: 'bbwwwb', 0xd9: '', 0xda: '', 0xdb: '', 0xdc: '', 0xdd: 'b', 0xde: 'b',
      0xdf: '', 0xe0: 'bb', 0xe1: '', 0xe2: 'b', 0xe3: 'bbwwwb', 0xe4: 'bwwwb', 0xe5: 'bwwwb', 0xe6: 'wwwb',
      0xe7: 'bwwwb', 0xe9: 'bwwwb', 0xeb: 'bbwwwb', 0xef: 'bbwww', 0xf0: 'bwww', 0xf1: '', 0xf2: 'bww', 0xf3: 'bww',
      0xf4: '', 0xf5: 'b', 0xf7: 'bwww', 0xf8: 'wwwwww', 0xf9: 'www', 0xfe: '', 0xff: '' },
    focus: { 0xd8: 'bbwwwb', 0xd9: '', 0xdb: '', 0xdc: '', 0xdd: 'b', 0xde: 'b', 0xdf: '', 0xe0: 'bb', 0xe1: '', 0xe2: 'b',
      0xe3: 'bbwwwb', 0xe4: 'bwwwb', 0xe5: 'bwwwb', 0xe6: 'wwwb', 0xe8: 'bwwwb', 0xea: 'bwwwb', 0xec: 'bbwwwb',
      0xf0: 'bbwww', 0xf4: '', 0xf5: 'b', 0xf8: 'bwww', 0xf9: 'bwww', 0xfa: 'www', 0xfe: '', 0xff: '' }
  };

  /* name, then the operands' names in order. A name in (brackets) is a reading not confirmed in the game. */
  const NAMES = {
    position: {
      0xd5: ['sound', 'number'], 0xd6: ['flash'], 0xd7: ['(set flag)', 'which', 'value'],
      0xd8: ['glide to a hit\'s target', 'hit', 'bone', 'x', 'y', 'z', 'frames'], 0xd9: ['take the current position'],
      0xda: ['(mode off)'], 0xdb: ['(mode on)'], 0xdc: ['(lock on)'], 0xf1: ['(lock off)'],
      0xdd: ['choose preset', 'preset'], 0xde: ['(target = actor 3 if set)', 'flag'], 0xdf: ['target = whole group'],
      0xe0: ['glide to the target point', 'part', 'frames'], 0xe1: ['jump to the preset view'], 0xe2: ['glide to the preset view', 'frames'],
      0xe3: ['glide to an actor', 'actor', 'bone', 'x', 'y', 'z', 'frames'], 0xe4: ['glide to the attacker', 'bone', 'x', 'y', 'z', 'frames'],
      0xe5: ['glide to the target', 'bone', 'x', 'y', 'z', 'frames'], 0xe6: ['glide to a point', 'x', 'y', 'z', 'frames'],
      0xe7: ['ride with the attacker', 'bone', 'x', 'y', 'z', 'frames'], 0xe9: ['ride with the target', 'bone', 'x', 'y', 'z', 'frames'],
      0xeb: ['ride with an actor', 'actor', 'bone', 'x', 'y', 'z', 'frames'],
      0xef: ['jump to an actor', 'actor', 'bone', 'x', 'y', 'z'], 0xf0: ['jump to the attacker', 'bone', 'x', 'y', 'z'],
      0xf7: ['jump to the target', 'bone', 'x', 'y', 'z'], 0xf9: ['jump to a point', 'x', 'y', 'z'],
      0xf2: ['(place by the attacker\'s facing)', 'shift', 'angle', 'height'], 0xf3: ['(place by the target\'s facing)', 'shift', 'angle', 'height'],
      0xf8: ['circle the focus', 'turn per frame', 'radius', 'start angle', 'radius change', 'rise per frame', 'frames'],
      0xf5: ['set wait', 'frames'], 0xf4: ['wait'], 0xfe: ['loop (with c0)'], 0xff: ['end'] },
    focus: {
      0xd8: ['glide to a hit\'s target', 'hit', 'bone', 'x', 'y', 'z', 'frames'], 0xd9: ['take the current point'],
      0xdb: ['(mode off)'], 0xdc: ['(mode on)'], 0xdd: ['choose preset', 'preset'],
      0xde: ['(target = actor 3 if set)', 'flag'], 0xdf: ['target = whole group'],
      0xe0: ['glide to the target point', 'part', 'frames'], 0xe1: ['jump to the preset point'], 0xe2: ['glide to the preset point', 'frames'],
      0xe3: ['glide to an actor', 'actor', 'bone', 'x', 'y', 'z', 'frames'], 0xe4: ['glide to the attacker', 'bone', 'x', 'y', 'z', 'frames'],
      0xe5: ['glide to the target', 'bone', 'x', 'y', 'z', 'frames'], 0xe6: ['glide to a point', 'x', 'y', 'z', 'frames'],
      0xe8: ['follow the attacker', 'bone', 'x', 'y', 'z', 'frames'], 0xea: ['follow the target', 'bone', 'x', 'y', 'z', 'frames'],
      0xec: ['follow an actor', 'actor', 'bone', 'x', 'y', 'z', 'frames'],
      0xf0: ['jump to an actor', 'actor', 'bone', 'x', 'y', 'z'], 0xf8: ['jump to the target', 'bone', 'x', 'y', 'z'],
      0xf9: ['jump to the attacker', 'bone', 'x', 'y', 'z'], 0xfa: ['jump to a point', 'x', 'y', 'z'],
      0xf5: ['set wait', 'frames'], 0xf4: ['wait'], 0xfe: ['loop (with c0)'], 0xff: ['end'] }
  };
  const KINDS = ['position', 'focus'];
  const PS_BASE = 0x801a0000;
  const FIRST_FREE = 0x190;          // the game's files use 0 to 0x18f

  /* ---------- one command ---------- */
  function hex2(n) { return (n & 0xff).toString(16).padStart(2, '0'); }
  function cmdName(kind, op) { const n = NAMES[kind][op]; return n ? n[0] : (op === 0xc0 ? '(loop)' : 'not a command'); }
  function argNames(kind, op) { const n = NAMES[kind][op]; return n ? n.slice(1) : []; }
  function layoutOf(kind, op) { return LAYOUT[kind][op]; }
  function makeCmd(kind, op, args) {
    const lay = LAYOUT[kind][op];
    const a = (args || []).slice(0, lay ? lay.length : 0);
    while (lay && a.length < lay.length) a.push(0);
    return { op, args: a };
  }
  function describe(kind, c) {
    if (c.op === 0xc0) return '(loop)';
    if (c.raw) return 'byte ' + hex2(c.op) + ' (not a command: the game pauses one frame on it)';
    const names = argNames(kind, c.op);
    const parts = c.args.map((v, i) => (names[i] || '?') + ' ' + v);
    return cmdName(kind, c.op) + (parts.length ? '  ' + parts.join(', ') : '');
  }

  /* ---------- bytes <-> commands ---------- */
  function disassemble(bytes, kind, start, limit) {
    const lay = LAYOUT[kind], out = [];
    let o = start || 0;
    const end = limit === undefined ? bytes.length : Math.min(bytes.length, limit);
    while (o < end) {
      const op = bytes[o];
      if (op === 0xc0 && out.length && out[out.length - 1].op === 0xfe) { out.push({ op: 0xc0, args: [] }); o += 1; break; }
      const l = lay[op];
      if (l === undefined) { out.push({ op, args: [], raw: true }); o += 1; continue; }
      const args = []; let p = o + 1, ok = true;
      for (const ch of l) {
        if (ch === 'b') { if (p >= end) { ok = false; break; } let v = bytes[p]; args.push(v); p += 1; }
        else { if (p + 1 >= end) { ok = false; break; } let v = bytes[p] | (bytes[p + 1] << 8); if (v >= 0x8000) v -= 0x10000; args.push(v); p += 2; }
      }
      if (!ok) break;
      out.push({ op, args }); o = p;
      if (op === 0xff) break;
    }
    return out;
  }

  function assemble(cmds, kind) {
    const lay = LAYOUT[kind], out = [];
    for (const c of cmds) {
      if (c.op === 0xc0 || c.raw) { out.push(c.op & 0xff); continue; }
      const l = lay[c.op];
      if (l === undefined) throw new Error(hex2(c.op) + ' is not a ' + kind + ' command');
      out.push(c.op);
      l.split('').forEach((ch, i) => {
        const v = Math.round(Number(c.args[i]) || 0);
        if (ch === 'b') { if (v < -128 || v > 255) throw new Error(cmdName(kind, c.op) + ': ' + v + ' does not fit in a byte'); out.push(v & 0xff); }
        else { if (v < -32768 || v > 65535) throw new Error(cmdName(kind, c.op) + ': ' + v + ' does not fit in 16 bits'); out.push(v & 0xff, (v >> 8) & 0xff); }
      });
    }
    return out;
  }

  /* ---------- SpellExt's text form ---------- */
  /* -> { number, variants: [ {position: [...], focus: [...]}, x3 ], header: [comment lines] }  (throws Error with a line number) */
  function parseText(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const cam = { number: null, variants: [0, 1, 2].map(() => ({ position: null, focus: null })), header: [] };
    let heads = null, cmds = [];
    function flush() {
      if (!heads) return;
      for (const v of heads.variants) cam.variants[v][heads.kind] = cmds.map(c => ({ op: c.op, args: c.args.slice(), comment: c.comment, raw: c.raw }));
    }
    lines.forEach((line, i) => {
      const n = i + 1;
      const cut = line.indexOf(';');
      const body = (cut >= 0 ? line.slice(0, cut) : line).trim();
      const comment = cut >= 0 ? line.slice(cut + 1).trim() : '';
      if (!body) { if (!heads && cam.number === null && comment) cam.header.push(comment); return; }
      let m = body.match(/^camera\s*=\s*([0-9a-fA-Fx]+)$/);
      if (m) { const s = m[1].replace(/^0x/i, ''); cam.number = parseInt(s, 16); if (isNaN(cam.number)) throw new Error('line ' + n + ': camera = needs a hex number'); return; }
      m = body.match(/^\[\s*variant((?:\s+[0-2])+)\s+(position|focus)\s*\]$/i);
      if (m) { flush(); heads = { variants: m[1].trim().split(/\s+/).map(Number), kind: m[2].toLowerCase() }; cmds = []; return; }
      if (!heads) throw new Error('line ' + n + ': a command before any [variant ...] heading');
      const words = body.split(/\s+/);
      const op = parseInt(words[0], 16);
      if (isNaN(op)) throw new Error('line ' + n + ': "' + words[0] + '" is not a command number');
      if (op === 0xc0) { cmds.push({ op, args: [], comment }); return; }
      const lay = LAYOUT[heads.kind][op];
      if (lay === undefined) throw new Error('line ' + n + ': ' + hex2(op) + ' is not a ' + heads.kind + ' command');
      if (words.length - 1 !== lay.length) throw new Error('line ' + n + ': command ' + hex2(op) + ' takes ' + lay.length + ' number(s), ' + (words.length - 1) + ' given');
      cmds.push({ op, args: words.slice(1).map(w => { const v = parseInt(w, 10); if (isNaN(v)) throw new Error('line ' + n + ': "' + w + '" is not a number'); return v; }), comment });
    });
    flush();
    for (let v = 0; v < 3; v++) for (const k of KINDS) if (!cam.variants[v][k]) cam.variants[v][k] = null;
    return cam;
  }

  function sameScript(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].op !== b[i].op || a[i].args.length !== b[i].args.length) return false;
      for (let j = 0; j < a[i].args.length; j++) if (a[i].args[j] !== b[i].args[j]) return false;
    }
    return true;
  }

  /* problems that stop SpellExt from taking the camera (empty list = fine) */
  function check(cam) {
    const out = [];
    if (cam.number === null || cam.number === undefined || isNaN(cam.number)) out.push('the camera has no number');
    else if (cam.number < FIRST_FREE) out.push('camera ' + cam.number.toString(16) + ' is one of the game\'s own numbers (0 to 18f): use 190 or higher, or it replaces the game\'s');
    for (let v = 0; v < 3; v++) for (const k of KINDS) {
      const s = cam.variants[v][k];
      if (!s || !s.length) { out.push('variant ' + v + ' has no ' + k + ' script'); continue; }
      const last = s[s.length - 1].op;
      if (last !== 0xff && last !== 0xc0) out.push('variant ' + v + ' ' + k + ': the script must end with ff (or fe then c0)');
      try { assemble(s, k); } catch (e) { out.push('variant ' + v + ' ' + k + ': ' + e.message); }
    }
    return out;
  }

  function toText(cam, title) {
    const L = [];
    (cam.header || []).forEach(h => L.push('; ' + h));
    if (title) L.push('; ' + title);
    if (L.length) L.push('');
    L.push('camera = ' + (cam.number === null || cam.number === undefined ? '???' : cam.number.toString(16)));
    for (const k of KINDS) {
      const done = [false, false, false];
      for (let v = 0; v < 3; v++) {
        if (done[v]) continue;
        const group = [v];
        for (let w = v + 1; w < 3; w++) if (!done[w] && sameScript(cam.variants[v][k], cam.variants[w][k])) group.push(w);
        group.forEach(g => { done[g] = true; });
        L.push('', '[variant ' + group.join(' ') + ' ' + k + ']');
        for (const c of cam.variants[v][k] || []) {
          if (c.raw) { L.push('; (a stray byte ' + hex2(c.op) + ' was here: the game pauses one frame on it; SpellExt\'s text form has no way to write it)'); continue; }
          const code = (c.op === 0xc0 ? 'c0' : hex2(c.op)) + (c.args.length ? ' ' + c.args.join(' ') : '');
          const note = c.comment ? c.comment : describe(k, c);
          L.push(code.padEnd(28) + '; ' + note);
        }
      }
    }
    return L.join('\n') + '\n';
  }

  /* ---------- the game's camdat files ---------- */
  function readCamdat(buffer) {
    const bytes = new Uint8Array(buffer), dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 16) throw new Error('too short for a camera file');
    const tables = [0, 1, 2, 3].map(i => dv.getUint32(i * 4, true) - PS_BASE);
    if (tables.some(t => t < 16 || t >= bytes.length)) throw new Error('this does not look like camdat0/1/2.bin (the header points outside the file)');
    const count = Math.floor((tables[1] - tables[0]) / 12);
    if (count <= 0) throw new Error('no cameras found in the header');
    function scriptAt(table, entry, kind) {
      const at = table + entry * 4;
      if (at + 4 > bytes.length) return null;
      const addr = dv.getUint32(at, true) - PS_BASE;
      if (addr < 16 || addr >= bytes.length) return null;
      return disassemble(bytes, kind, addr, Math.min(bytes.length, addr + 4096));
    }
    function camera(id) {
      if (id < 0 || id >= count) throw new Error('camera ' + id.toString(16) + ' is not in this file (it has 0 to ' + (count - 1).toString(16) + ')');
      const cam = { number: id, variants: [], header: ['camera ' + id.toString(16) + ' of the game\'s file'] };
      for (let v = 0; v < 3; v++) cam.variants.push({ position: scriptAt(tables[0], id * 3 + v, 'position'), focus: scriptAt(tables[1], id * 3 + v, 'focus') });
      return cam;
    }
    return { count, camera };
  }

  /* ---------- playback ----------
     An approximation of the game's two interpreters, frame by frame:
     - commands run until one ends the frame: `wait` while the counter set by `set wait` is above 0, `end`, or a byte
       that is not a command (one frame);
     - jump = there at once; glide = a straight line over `frames`; ride / follow = stay at a bone's place + offset for
       `frames`; circle = round the focus point;
     - offsets are added in the battle's own axes (an assumption: no rotation by the actor's facing is applied);
     - a bone other than 0 is placed by `bones` (height above the root), or at the root when not known.
     world: { actors: [{x,y,z,height}], attacker, target, group: 'enemies'|'party', presetPos, presetFocus, bones }
     -> { frames: [{pos:{x,y,z}, focus:{x,y,z}}], events: [{frame, kind, text}], length } */
  function simulate(cam, variant, world, maxFrames) {
    const N = maxFrames || 600;
    const st = {};
    for (const k of KINDS) st[k] = { cmds: (cam.variants[variant] && cam.variants[variant][k]) || [], pc: 0, wait: 0, p: { x: 0, y: -1500, z: 4000 }, task: null, ended: false, target: world.target, groupTarget: false };
    st.focus.p = { x: 0, y: -400, z: -1000 };
    if (world.presetPos) st.position.p = Object.assign({}, world.presetPos);
    if (world.presetFocus) st.focus.p = Object.assign({}, world.presetFocus);
    const events = [], frames = [], starts = { position: [], focus: [] };
    let lastActive = 0;

    function actorPoint(index, bone) {
      const a = world.actors[index];
      if (!a) return { x: 0, y: 0, z: 0 };
      let y = a.y || 0;
      if (bone && world.bones && world.bones[bone] !== undefined) y -= world.bones[bone];
      return { x: a.x, y, z: a.z };
    }
    function targetPoint(s, bone) {
      if (s.groupTarget || world.target === 'group') {
        const side = world.actors.filter(a => a.side === world.groupSide);
        if (!side.length) return { x: 0, y: 0, z: 0 };
        const c = { x: 0, y: 0, z: 0 };
        side.forEach(a => { c.x += a.x; c.y += (a.y || 0); c.z += a.z; });
        return { x: c.x / side.length, y: c.y / side.length, z: c.z / side.length };
      }
      return actorPoint(world.target, bone);
    }
    function add(p, x, y, z) { return { x: p.x + x, y: p.y + y, z: p.z + z }; }
    function startGlide(s, to, n) { s.task = { kind: 'glide', from: Object.assign({}, s.p), to, n: Math.max(1, n), t: 0 }; if (n <= 0) { s.p = to; s.task = null; } }
    function startRide(s, fn, n) { s.task = { kind: 'ride', fn, n: Math.max(1, n), t: 0 }; s.p = fn(); }

    function step(kind, focusNow) {
      const s = st[kind];
      // the running movement advances one frame
      if (s.task) {
        const t = s.task; t.t++;
        if (t.kind === 'glide') { const f = Math.min(1, t.t / t.n); s.p = { x: t.from.x + (t.to.x - t.from.x) * f, y: t.from.y + (t.to.y - t.from.y) * f, z: t.from.z + (t.to.z - t.from.z) * f }; }
        else if (t.kind === 'ride') s.p = t.fn();
        else if (t.kind === 'circle') {
          t.angle += t.turn; t.radius += t.change; t.rise += t.risePer;
          const a = t.angle * 2 * Math.PI / 4096, c = focusNow || st.focus.p;
          s.p = { x: c.x + Math.cos(a) * t.radius, y: t.y0 + t.rise, z: c.z + Math.sin(a) * t.radius };
        }
        if (t.t >= t.n) s.task = null;
      }
      if (s.ended) return;
      if (s.wait > 0) { s.wait--; if (s.wait > 0) return; }
      let guard = 0;
      while (s.pc < s.cmds.length && guard++ < 256) {
        if (starts[kind][s.pc] === undefined) starts[kind][s.pc] = frames.length;     // the frame a command first runs
        const c = s.cmds[s.pc++], a = c.args;
        if (c.raw) return;                                     // one frame on a stray byte
        const op = c.op;
        if (op === 0xff) { s.ended = true; return; }
        if (op === 0xfe) { const n = s.cmds[s.pc]; if (n && n.op === 0xc0) { if (s.wait === 0) { s.pc = 0; return; } } continue; }
        if (op === 0xc0) continue;
        if (op === 0xf5) { s.wait = a[0]; continue; }
        if (op === 0xf4) { if (s.wait > 0) return; continue; }
        if (op === 0xdf) { s.groupTarget = true; continue; }
        if (op === 0xd5) { events.push({ frame: frames.length, kind, text: 'sound ' + a[0] }); continue; }
        if (op === 0xd6) { events.push({ frame: frames.length, kind, text: 'flash' }); continue; }
        if (kind === 'position') {
          switch (op) {
            case 0xf0: s.task = null; s.p = add(actorPoint(world.attacker, a[0]), a[1], a[2], a[3]); break;
            case 0xf7: s.task = null; s.p = add(targetPoint(s, a[0]), a[1], a[2], a[3]); break;
            case 0xef: s.task = null; s.p = add(actorPoint(a[0], a[1]), a[2], a[3], a[4]); break;
            case 0xf9: s.task = null; s.p = { x: a[0], y: a[1], z: a[2] }; break;
            case 0xe4: startGlide(s, add(actorPoint(world.attacker, a[0]), a[1], a[2], a[3]), a[4]); break;
            case 0xe5: startGlide(s, add(targetPoint(s, a[0]), a[1], a[2], a[3]), a[4]); break;
            case 0xe3: startGlide(s, add(actorPoint(a[0], a[1]), a[2], a[3], a[4]), a[5]); break;
            case 0xe6: startGlide(s, { x: a[0], y: a[1], z: a[2] }, a[3]); break;
            case 0xd8: startGlide(s, add(targetPoint(s, a[1]), a[2], a[3], a[4]), a[5]); break;
            case 0xe7: { const b = a[0], o = a.slice(1, 4); startRide(s, () => add(actorPoint(world.attacker, b), o[0], o[1], o[2]), a[4]); break; }
            case 0xe9: { const b = a[0], o = a.slice(1, 4), me = s; startRide(s, () => add(targetPoint(me, b), o[0], o[1], o[2]), a[4]); break; }
            case 0xeb: { const ac = a[0], b = a[1], o = a.slice(2, 5); startRide(s, () => add(actorPoint(ac, b), o[0], o[1], o[2]), a[5]); break; }
            case 0xe2: startGlide(s, Object.assign({}, world.presetPos), a[0]); break;
            case 0xe1: s.task = null; s.p = Object.assign({}, world.presetPos); break;
            case 0xf8: s.task = { kind: 'circle', turn: a[0], radius: a[1], angle: a[2], change: a[3], risePer: a[4], rise: 0, y0: s.p.y, n: Math.max(1, a[5]), t: 0 }; break;
            default: break;                                    // flags, presets, facing placements: not modelled
          }
        } else {
          switch (op) {
            case 0xf9: s.task = null; s.p = add(actorPoint(world.attacker, a[0]), a[1], a[2], a[3]); break;
            case 0xf8: s.task = null; s.p = add(targetPoint(s, a[0]), a[1], a[2], a[3]); break;
            case 0xf0: s.task = null; s.p = add(actorPoint(a[0], a[1]), a[2], a[3], a[4]); break;
            case 0xfa: s.task = null; s.p = { x: a[0], y: a[1], z: a[2] }; break;
            case 0xe4: startGlide(s, add(actorPoint(world.attacker, a[0]), a[1], a[2], a[3]), a[4]); break;
            case 0xe5: startGlide(s, add(targetPoint(s, a[0]), a[1], a[2], a[3]), a[4]); break;
            case 0xe3: startGlide(s, add(actorPoint(a[0], a[1]), a[2], a[3], a[4]), a[5]); break;
            case 0xe6: startGlide(s, { x: a[0], y: a[1], z: a[2] }, a[3]); break;
            case 0xd8: startGlide(s, add(targetPoint(s, a[1]), a[2], a[3], a[4]), a[5]); break;
            case 0xe8: { const b = a[0], o = a.slice(1, 4); startRide(s, () => add(actorPoint(world.attacker, b), o[0], o[1], o[2]), a[4]); break; }
            case 0xea: { const b = a[0], o = a.slice(1, 4), me = s; startRide(s, () => add(targetPoint(me, b), o[0], o[1], o[2]), a[4]); break; }
            case 0xec: { const ac = a[0], b = a[1], o = a.slice(2, 5); startRide(s, () => add(actorPoint(ac, b), o[0], o[1], o[2]), a[5]); break; }
            case 0xe2: startGlide(s, Object.assign({}, world.presetFocus), a[0]); break;
            case 0xe1: s.task = null; s.p = Object.assign({}, world.presetFocus); break;
            default: break;
          }
        }
      }
    }

    for (let f = 0; f < N; f++) {
      step('focus', null);
      step('position', st.focus.p);
      frames.push({ pos: Object.assign({}, st.position.p), focus: Object.assign({}, st.focus.p),
        pc: { position: Math.max(0, st.position.pc - 1), focus: Math.max(0, st.focus.pc - 1) } });
      const busy = KINDS.some(k => !st[k].ended || st[k].task || st[k].wait > 0);
      if (busy) lastActive = f;
      if (!busy && f > lastActive + 15) break;
    }
    return { frames, events, starts, length: lastActive + 1 };
  }

  /* a blank camera: all three variants the same, starting from the preset view */
  function blankCamera(number) {
    const v = () => ({
      position: [{ op: 0xdf, args: [] }, { op: 0xf0, args: [0, 700, -400, -1600] }, { op: 0xf5, args: [30] }, { op: 0xf4, args: [] }, { op: 0xe2, args: [30] }, { op: 0xf5, args: [30] }, { op: 0xf4, args: [] }, { op: 0xff, args: [] }],
      focus: [{ op: 0xdf, args: [] }, { op: 0xf9, args: [0, 0, -500, 0] }, { op: 0xf5, args: [30] }, { op: 0xf4, args: [] }, { op: 0xe2, args: [30] }, { op: 0xf5, args: [30] }, { op: 0xf4, args: [] }, { op: 0xff, args: [] }]
    });
    return { number: number === undefined ? FIRST_FREE : number, variants: [v(), v(), v()], header: [] };
  }

  const api = { LAYOUT, NAMES, KINDS, FIRST_FREE, hex2, cmdName, argNames, layoutOf, makeCmd, describe, disassemble, assemble, parseText,
    toText, check, sameScript, readCamdat, simulate, blankCamera };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CAMMY = api;
})(typeof self !== 'undefined' ? self : this);
