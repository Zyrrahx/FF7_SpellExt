// The port of sxcfg/formation.py (formation diagrams, stage 1): where everyone stands at a battle's start, one layout
// for a DLL scene (its keys, or scenebuild's image) and for a formation of the game's scene.bin. Pure functions; every
// answer here is the same as there, field for field (see formation.py for what the game does, read from the code).
import * as sb from './scenebuild.js';

// ---- the game's tables (ff7_en.exe, Steam 2013; formation.py's, checked against the exe by its test) --------------
export const PLACES3 = [       // 007c21f0: per kind, 3 places x, y, z
  [-1600, 0, 1700, 0, 0, 1700, 1600, 0, 1700], [-1600, 0, 1700, 0, 0, 1700, 1600, 0, 1700],
  [-1600, 0, -1700, 0, 0, -1700, 1600, 0, -1700], [-1000, 0, 2500, 0, 0, -2500, 1000, 0, 2500],
  [-1600, 0, -200, 0, 0, 200, 1600, 0, -200], [-1000, 0, 3500, 0, 0, -3500, 1000, 0, 3500],
  [-1000, 0, 4500, 0, 0, -4500, 1000, 0, 4500], [-1000, 0, -2500, 0, 0, 2500, 1000, 0, -2500],
  [-1600, 0, 1700, 0, 0, 1700, 1600, 0, 1700]];
export const PLACES2 = [       // 007c2340: per kind, 2 places x, y, z
  [-1000, 0, 1700, 1000, 0, 1700], [-1000, 0, 1700, 1000, 0, 1700], [-1000, 0, -1700, 1000, 0, -1700],
  [0, 0, 2500, 0, 0, -2500], [-1000, 0, -200, 1000, 0, 200], [0, 0, 3500, 0, 0, -3500], [0, 0, 4500, 0, 0, -4500],
  [0, 0, 2500, 0, 0, -2500], [-1000, 0, 1700, 1000, 0, 1700]];
export const FACING3 = [       // 007c2420: per kind, 3 facings
  [0, 0, 0], [0, 0, 0], [2048, 2048, 2048], [0, 2048, 0], [0, 2048, 0], [0, 2048, 0], [0, 2048, 0],
  [2048, 0, 2048], [0, 0, 0]];
export const FACING2 = [       // 007c2490: per kind, 2 facings
  [0, 0], [0, 0], [2048, 2048], [0, 2048], [0, 2048], [0, 2048], [0, 2048], [0, 2048], [0, 0]];
export const KIND_WORD = [0, 1, 2, 3, 4, 3, 3, 3, 5];      // 007b76f0
export const BACK_ROW_STEP = 0x204;
export const BATTLE_982 = 0x3d6;
export const KINDS = 9;
export const KIND_NAMES = ['normal', 'pre-emptive', 'back attack', 'side attack', 'pincer', 'side attack (wider)',
  'side attack (widest)', 'side attack (mirrored)', 'normal, rows locked'];
export const SURROUNDED_NAME = 'surrounded (a DLL scene)';
const PAIRS = [[0, 1], [0, 2], [1, 2]];
export const AS_SET = 'as set';
export const SWAPPED = 'swapped';
export const FRONT = 'front';

export const N_PREEMPT = 'may start pre-emptive: the set-up\'s flags have 0x10, so when the field\'s battle flags have 4 the game ' +
  'makes it kind 1 (every enemy starts turned away)';
export const N_KIND1 = 'pre-emptive: every enemy starts turned away (facing 0) with its home direction 0x800';
export const N_KIND2 = 'back attack: the party starts turned away from the enemies (facing 0, home 0x800); the rows are swapped: a ' +
  'member set to the front row stands on the back-row spot, a member set to the back row on its place';
export const N_FRONT = 'everyone in the front row: the game clears the row setting for kind %d and refuses the row change in battle';
export const N_982 = 'battle 982: the game turns the party to face 0 (-z), home direction 0, with 3 members or 1 (FUN_0042b579)';
export const N_GAP = 'row %d is empty and a later row is not: the game places its k-th enemy at row k, so the enemies stand at ' +
  'rows 1-%d (not seen in the game\'s own scenes)';
export const N_NONE = 'no enemy rows';
export const N_SUR = 'surrounded: the DLL places each present member on its triangle facing out and turns each enemy to its place; ' +
  'rows are off (everyone front row)';
export const P_KIND = 'kind %d is not one of the game\'s kinds 0-8: not drawn';

const fmt = (t, ...a) => { let i = 0; return t.replace(/%d/g, () => String(a[i++])); };
export const s16 = v => ((v & 0xffff) ^ 0x8000) - 0x8000;
export const u16 = (b, o) => b[o] | (b[o + 1] << 8);
export const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// ---- the DLL's surrounded geometry ----------------------------------------------------------------------------------
export function div4096(v) {
  return v >= 0 ? (v + 2048) >> 12 : -((-v + 2048) >> 12);
}
export function en_sur_place(radius, front, k) {
  const a = (front + 120 * k) % 360;
  return [div4096(-radius * sb.en_sur_sin(a)), div4096(-radius * sb.en_sur_sin(a + 90)),
    Math.floor((a * 4096 + 180) / 360) & 0xfff];
}
export function en_sur_sin4096(a) {
  const t = (a & 0xfff) * 360;
  const d = t >> 12;
  const f = t & 0xfff;
  const s0 = sb.en_sur_sin(d);
  return s0 + div4096((sb.en_sur_sin(d + 1) - s0) * f);
}
let SIN = null;
export function en_sur_facing(dx, dz) {
  if (SIN === null) {
    SIN = [];
    for (let f = 0; f < 4096 + 1024; f++) SIN.push(en_sur_sin4096(f));
  }
  if (!dx && !dz) return 0;
  let best_cross = -1;
  let best = 0;
  for (let f = 0; f < 4096; f++) {
    const s = SIN[f];
    const c = SIN[f + 1024];
    const ahead = -(dx * s + dz * c);
    if (ahead <= 0) continue;
    const cross = Math.abs(dx * c - dz * s);
    if (best_cross < 0 || cross < best_cross) {
      best_cross = cross;
      best = f;
    }
  }
  return best;
}

// ---- the layout -----------------------------------------------------------------------------------------------------
function member(slot, x, y, z, facing, home, shift) {
  return { slot, x, y, z, facing, home, shift: shift === null ? null : { x, y, z: s16(z + shift) } };
}

export function party(kind, battle, rule) {
  const p3 = PLACES3[kind];
  const f3 = FACING3[kind];
  const p2 = PLACES2[kind];
  const f2 = FACING2[kind];
  const step = face => (rule === FRONT ? null : face === 0 ? BACK_ROW_STEP : -BACK_ROW_STEP);
  const turn3 = slot => {
    const home = f3[slot];
    if (kind === 2) return [0, home];
    if (battle === BATTLE_982) return [0, 0];
    return [home, home];
  };
  const three = [];
  for (let s = 0; s < 3; s++) {
    const [facing, home] = turn3(s);
    three.push(member(s, p3[3 * s], p3[3 * s + 1], p3[3 * s + 2], facing, home, step(f3[s])));
  }
  const two = [];
  for (const pair of PAIRS) {
    const ms = [];
    pair.forEach((s, n) => {
      const home = f2[n];
      ms.push(member(s, p2[3 * n], p2[3 * n + 1], p2[3 * n + 2], kind === 2 ? 0 : home, home, step(home)));
    });
    two.push({ slots: pair.slice(), members: ms });
  }
  const one = [];
  for (let s = 0; s < 3; s++) {
    const [facing, home] = turn3(s);
    one.push(member(s, 0, p3[3 * s + 1], p3[3 * s + 2], facing, home, step(f3[s])));
  }
  return { three, two, one };
}

function surround_party(base, radius, front) {
  const on = m => {
    const [x, z, facing] = en_sur_place(radius, front, m.slot);
    return { slot: m.slot, x, y: m.y, z, facing, home: facing, shift: null };
  };
  return { three: base.three.map(on), two: base.two.map(t => ({ slots: t.slots, members: t.members.map(on) })),
           one: base.one.map(on) };
}

export function enemy_turn(kind, z) {
  if (kind === 1) return [0, 0x800];
  if ([3, 5, 6, 7].includes(kind)) return z < 0 ? [0, 0] : [0x800, 0x800];
  return z < 0 ? [0x800, 0x800] : [0, 0];
}

export function layout(fm) {
  const kind = fm.kind;
  const sur = Boolean(fm.surrounded);
  const known = kind >= 0 && kind < KINDS;
  const out = { kind, name: sur ? SURROUNDED_NAME : known ? KIND_NAMES[kind] : null, word: known ? KIND_WORD[kind] : null,
                surrounded: sur, radius: sur ? fm.radius : null, front: sur ? fm.front : null, battle: fm.battle, drawn: false, problem: fm.problem, rows: null, party: null, places: null,
                enemies: [], count: 0, camera: null, camera_from: fm.camera_from, camera_why: fm.camera_why, notes: [] };
  if (out.problem === null && !known) out.problem = fmt(P_KIND, kind);
  if (out.problem !== null) return out;
  const word = KIND_WORD[kind];
  const rule = sur || word > 2 ? FRONT : word === 2 ? SWAPPED : AS_SET;
  out.rows = rule;
  const base = party(kind, fm.battle, rule);
  const rows = fm.rows;
  const n = rows.filter(r => r.model !== 0xffff).length;
  out.count = n;
  const xs = [0, 0, 0, 0, 0, 0];
  const zs = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    xs[k] = rows[k].x;
    zs[k] = rows[k].z;
  }
  let place = null;
  let side = null;
  if (sur) {
    let counts;
    [place, side, counts] = sb.en_sur_assign(n, xs, zs, fm.front);
    out.party = surround_party(base, fm.radius, fm.front);
    out.places = [];
    for (let k = 0; k < 3; k++) {
      const [x, z, facing] = en_sur_place(fm.radius, fm.front, k);
      const pr = [];
      for (let i = 0; i < n; i++) if (place[i] === k) pr.push(i);
      out.places.push({ place: k, angle: (fm.front + 120 * k) % 360, x, z, facing, rows: pr, count: counts[k],
                        over: counts[k] > sb.EN_SUR_PER_PLACE });
    }
  } else out.party = base;
  for (let k = 0; k < n; k++) {
    const r = rows[k];
    const e = { row: k, who: r.who, model: r.model, x: r.x, y: r.y, z: r.z, line: r.row, cover: r.cover, flags: r.flags,
                facing: 0, home: 0, place: null, side: null };
    if (sur) {
      const p = out.places[place[k]];
      e.place = place[k];
      e.side = side[k];
      e.facing = e.home = en_sur_facing(p.x - r.x, p.z - r.z);
    } else [e.facing, e.home] = enemy_turn(kind, r.z);
    out.enemies.push(e);
  }
  const cam = fm.camera;
  if (cam !== null) out.camera = { x: cam[0], y: cam[1], z: cam[2], fx: cam[3], fy: cam[4], fz: cam[5] };
  const notes = out.notes;
  if (sur) notes.push(N_SUR);
  else if (kind === 0 && fm.flags !== null && (fm.flags & 0x10)) notes.push(N_PREEMPT);
  if (kind === 1 && !sur) notes.push(N_KIND1);
  if (kind === 2 && !sur) notes.push(N_KIND2);
  if (word > 2 && !sur) notes.push(fmt(N_FRONT, kind));
  if (fm.battle === BATTLE_982 && kind !== 2 && !sur) notes.push(N_982);
  let gap = null;
  for (let i = 0; i < n; i++) if (rows[i].model === 0xffff) { gap = i; break; }
  if (gap !== null) notes.push(fmt(N_GAP, gap + 1, n));
  if (!n) notes.push(N_NONE);
  out.drawn = true;
  return out;
}

// ---- the inputs -----------------------------------------------------------------------------------------------------
export const O_IDS = 0x0000;
export const O_SETUP = 0x0008;
export const O_CAMERA = 0x0058;
export const O_ROWS = 0x0118;
export const HEAD = 0x298;

// (3D formation view, stage 2) The scene.bin scene's three enemy ids as the models' route takes them: [{number}], an id of
// 0xffff (no enemy) left out. An id of 370 or more stays (a mod's scene.bin; the route refuses it in words). (formation.py)
export function scene_refs(head) {
  return [0, 1, 2].map(i => u16(head, O_IDS + 2 * i)).filter(n => n !== 0xffff).map(number => ({ number }));
}

export function camera_of(block) {
  const rec = [];
  for (let i = 0; i < 6; i++) rec.push(s16(u16(block, 2 * i)));
  return rec.every(v => v === -1) ? null : rec;
}

export function from_image(image, f, battle = null, names = null, surrounded = 0, radius = sb.EN_SUR_RADIUS_DEFAULT, front = 0,
  camera_from = null, camera_why = null) {
  const so = O_SETUP + 0x14 * f;
  const co = O_CAMERA + 0x30 * f;
  const ro = O_ROWS + 0x60 * f;
  const ids = [0, 1, 2].map(i => u16(image, O_IDS + 2 * i));
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const o = ro + 16 * i;
    const model = u16(image, o);
    let who = null;
    if (model !== 0xffff) {
      const hit = ids.indexOf(model);
      who = hit >= 0 && names && names.length ? names[hit] : 'model ' + model;
    }
    rows.push({ who, model, x: s16(u16(image, o + 2)), y: s16(u16(image, o + 4)), z: s16(u16(image, o + 6)),
                row: u16(image, o + 8), cover: u16(image, o + 10), flags: u32(image, o + 12) });
  }
  const cam = camera_of(image.subarray(co, co + 0x30));
  return { kind: image[so + 0x12], surrounded: surrounded ? 1 : 0, radius, front, battle, flags: u16(image, so + 0x10), rows,
           camera: cam, camera_from: cam !== null ? camera_from : null,
           camera_why: cam !== null ? null : (camera_why || 'the camera block\'s record 0 is empty (ffff)'), problem: null };
}

export function of_result(r, f, camera_why = null) {
  const names = [0, 1, 2].map(i => (i < r.enemies ? r.folder[i] : null));
  return layout(from_image(r.image, f, r.scene * 4 + f, names, r.surrounded[f], r.party_radius[f], r.party_front[f], null,
    camera_why));
}
