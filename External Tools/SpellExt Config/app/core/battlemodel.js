// (model preview, stage 2a) A battle model's files parsed into one description (sxcfg/battlemodel.py, line for line;
// its docstring says where each rule comes from): the skeleton (xxaa), the parts (.p) of its bones, its textures (.tex,
// every depth, as RGBA), frame 0 of its first animation (xxda), and the parts posed in that frame. `canonical` is the
// text both ports hash (floats as their float32 bit patterns, textures as the sha256 of their RGBA). Sines come from a
// table made with + - * / only, so both ports give the same bits. Node 22 language level.
import crypto from 'node:crypto';

export const PI = 3.141592653589793;
export const AA_HEAD = 0x34;
export const P_HEAD = 0x80;
export const TEX_HEAD = 0xEC;
export const MAX_BONES = 600;
export const MAX_TEXTURES = 10;
export const MAX_WEAPONS = 16;
export const MAX_COUNT = 1 << 20;
export const MAX_SIDE = 4096;
export const MAX_RECORD_BONES = 1000;

export function letters(n) { return String.fromCharCode(97 + Math.floor(n / 26) % 26) + String.fromCharCode(97 + n % 26); }
export const texture_part = i => letters(2 + i);
export const bone_part = i => letters(12 + i);
export const weapon_part = i => letters(62 + i);

// ---- sines without transcendental functions ----
function quarter() {
  const t = [];
  const h = PI / 2048.0;
  for (let r = 0; r < 1025; r++) {
    const x = r * h;
    const x2 = x * x;
    let term = x;
    let s = x;
    for (let n = 1; n < 14; n++) {
      term = term * -x2 / ((2 * n) * (2 * n + 1));
      s = s + term;
    }
    t.push(s);
  }
  t[0] = 0.0;
  t[1024] = 1.0;
  return t;
}
export const QUARTER = quarter();

export function sin4096(a) {
  a = a & 4095;
  const q = a >> 10;
  const r = a & 1023;
  if (q === 0) return QUARTER[r];
  if (q === 1) return QUARTER[1024 - r];
  if (q === 2) return -QUARTER[r];
  return -QUARTER[1024 - r];
}
export const cos4096 = a => sin4096(a + 1024);

export function mul(a, b) {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const row = [];
    for (let j = 0; j < 3; j++) row.push(a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j]);
    out.push(row);
  }
  return out;
}

export function app(m, v) {
  return [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]);
}

export function from_angles(x, y, z) {
  const cx = cos4096(x), sx = sin4096(x), cy = cos4096(y), sy = sin4096(y), cz = cos4096(z), sz = sin4096(z);
  const ry = [[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]];
  const rx = [[1.0, 0.0, 0.0], [0.0, cx, -sx], [0.0, sx, cx]];
  const rz = [[cz, -sz, 0.0], [sz, cz, 0.0], [0.0, 0.0, 1.0]];
  return mul(mul(ry, rx), rz);
}

// ---- the canonical form ----
const F32 = new DataView(new ArrayBuffer(4));
export function f32(x) {
  if (x !== x) return 'nan';
  F32.setFloat32(0, x, true);
  return F32.getUint32(0, true).toString(16).padStart(8, '0');
}

function strip(v) {
  if (Array.isArray(v)) return v.map(strip);
  if (v !== null && typeof v === 'object' && !Buffer.isBuffer(v)) {
    const o = {};
    for (const k of Object.keys(v)) if (!k.startsWith('_')) o[k] = strip(v[k]);
    return o;
  }
  return v;
}

// json.dumps(..., separators=(',', ':'), ensure_ascii=True) of the description
export function canonical(desc) {
  return JSON.stringify(strip(desc)).replace(/[\u007f-\uffff]/g,
    c => c === '\u007f' ? c : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export const digest = desc => crypto.createHash('sha256').update(canonical(desc), 'ascii').digest('hex');

// (stage 4) the description as a route carries it to the page (modelview.js prepare): the canonical form's fields, in
// their order, and each texture's RGBA as `rgba_base64` (standard base64, with its padding)
export function portable(desc) {
  const out = strip(desc);
  out.textures = out.textures.map((t, i) => Object.assign({}, t, { rgba_base64: Buffer.from(desc.textures[i]._rgba).toString('base64') }));
  return out;
}

// ---- the files ----
export class Bad extends Error {
  constructor(message) { super(message); this.name = 'Bad'; }
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

const u32s = (b, o, n) => Array.from({ length: n }, (_, i) => b.readUInt32LE(o + 4 * i));

export function parse_skeleton(data) {
  if (data.length < AA_HEAD) throw new Bad(data.length + ' bytes, not a battle skeleton (its header is 52)');
  const h = u32s(data, 0, 13);
  const bones = h[3], textures = h[6], weapons = h[9];
  if (bones > MAX_BONES || textures > MAX_TEXTURES || weapons > MAX_WEAPONS || data.length < AA_HEAD + 12 * bones) {
    throw new Bad('not a battle skeleton the game can read (' + bones + ' bones, ' + textures + ' textures, ' + weapons +
                  ' weapons, ' + data.length + ' bytes)');
  }
  const list = [];
  for (let i = 0; i < bones; i++) {
    const o = AA_HEAD + 12 * i;
    list.push([data.readInt32LE(o), data.readFloatLE(o + 4), data.readUInt32LE(o + 8)]);
  }
  return { bones, textures, animations: h[7], weapons, weapon_animations: h[10], header: h, list };
}

class Bits {
  constructor(data) { this.d = data; this.pos = 0; }

  get(n) {
    let v = 0;
    for (let k = 0; k < n; k++) {
      const byte = (this.pos >> 3) < this.d.length ? this.d[this.pos >> 3] : 0;
      v = v * 2 + ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos += 1;
    }
    return v;
  }

  signed(n) {
    const v = this.get(n);
    return n && (v >= 2 ** (n - 1)) ? v - 2 ** n : v;
  }
}

export function parse_frame0(data, bones) {
  if (data.length < 4) throw new Bad(data.length + ' bytes: no animation count');
  const count = data.readUInt32LE(0);
  if (count === 0) throw new Bad('holds no animation');
  if (data.length < 16) throw new Bad('its first animation is cut short (' + data.length + ' bytes)');
  const [rbones, frames, size] = u32s(data, 4, 3);
  if (size < 11) throw new Bad('its first animation is empty (' + size + ' bytes)');
  if (16 + size > data.length) throw new Bad('its first animation says ' + size + ' bytes, the file has ' + (data.length - 16) + ' after its head');
  const body = data.subarray(16, 16 + size);
  let nfs = body.readUInt16LE(0);
  let ssz = body.readUInt16LE(2);
  let key;
  let stream;
  if (size - 5 === nfs) {
    ssz = nfs;
    key = body[2];
    stream = body.subarray(3, 3 + nfs);
    nfs = frames;
  } else {
    key = body[4];
    if (5 + ssz > size) throw new Bad('its first animation\'s stream says ' + ssz + ' bytes, the record holds ' + (size - 5));
    stream = body.subarray(5, 5 + ssz);
  }
  if (key > 11) throw new Bad('its first animation\'s key is ' + key + ' (0, 2 or 4)');
  const used = bones === 1 ? 1 : rbones;
  const want = bones === 1 ? 1 : bones + 1;
  if (rbones > MAX_RECORD_BONES || used < want) {
    throw new Bad('its first animation has ' + rbones + ' bones for a skeleton of ' + bones + ' (it needs ' + want + ')');
  }
  const width = 12 - key;
  if (48 + used * 3 * width > stream.length * 8) {
    throw new Bad('its first animation\'s frame 0 is cut short (' + stream.length * 8 + ' bits, it needs ' + (48 + used * 3 * width) + ')');
  }
  const r = new Bits(stream);
  const position = [r.signed(16), r.signed(16), r.signed(16)];
  const angles = [];
  for (let i = 0; i < used * 3; i++) angles.push(r.get(width) * (1 << key));
  return { animations: count, record_bones: rbones, used_bones: used, frames: nfs, key, position, angles };
}

export function parse_p(data) {
  if (data.length < P_HEAD) throw new Bad('not a .p model (' + data.length + ' bytes, its header is 128)');
  const h = u32s(data, 0, 16);
  const [nV, nN, nX, nT, nVC, nE, nP, u2, u3, nH, nG] = [h[3], h[4], h[5], h[6], h[7], h[8], h[9], h[10], h[11], h[12], h[13]];
  const most = Math.max(nV, nN, nX, nT, nVC, nE, nP, u2, u3, nH, nG);
  if (most > MAX_COUNT) throw new Bad('not a .p model (a count of ' + most + ')');
  if (nV === 0) throw new Bad('not a .p model (no vertices)');
  const o_uv = P_HEAD + 12 * (nV + nN + nX);
  const o_vc = o_uv + 8 * nT;
  const o_pc = o_vc + 4 * nVC;
  const o_poly = o_pc + 4 * nP + 4 * nE;
  const o_grp = o_poly + 24 * nP + 24 * u2 + 3 * u3 + 100 * nH;
  const need = o_grp + 56 * nG;
  if (need > data.length) throw new Bad('not a .p model (its counts need ' + need + ' bytes, the file has ' + data.length + ')');
  // (Review T2, M4) a real part has no more groups than polygons and no more vertex colours than vertices (12,667 of 12,667 real
  // parts): more is a part made to cost, since every group and colour is built and sent whatever nP and nV are
  if (nG > Math.max(nP, 1) || nVC > nV) {
    throw new Bad('not a .p model (' + plural(nG, 'group', 'groups') + ' and ' + plural(nVC, 'vertex colour', 'vertex colours') + ' for ' +
                  plural(nP, 'polygon', 'polygons') + ' and ' + plural(nV, 'vertex', 'vertices') + ')');
  }
  const verts = [];
  for (let i = 0; i < nV; i++) {
    const o = P_HEAD + 12 * i;
    verts.push([data.readFloatLE(o), data.readFloatLE(o + 4), data.readFloatLE(o + 8)]);
  }
  const uv = [];
  for (let i = 0; i < nT; i++) uv.push([data.readFloatLE(o_uv + 8 * i), data.readFloatLE(o_uv + 8 * i + 4)]);
  const vcol = Buffer.alloc(4 * nVC);
  for (let i = 0; i < nVC; i++) {
    const o = o_vc + 4 * i;
    vcol[4 * i] = data[o + 2]; vcol[4 * i + 1] = data[o + 1]; vcol[4 * i + 2] = data[o]; vcol[4 * i + 3] = data[o + 3];
  }
  const pcol = Buffer.alloc(4 * nP);
  for (let i = 0; i < nP; i++) {
    const o = o_pc + 4 * i;
    pcol[4 * i] = data[o + 2]; pcol[4 * i + 1] = data[o + 1]; pcol[4 * i + 2] = data[o]; pcol[4 * i + 3] = data[o + 3];
  }
  const groups = [];
  const tris = [];
  let dropped = 0;
  const grs = [];
  for (let g = 0; g < nG; g++) grs.push(u32s(data, o_grp + 56 * g, 14));
  // (review F2, major 1) the game's groups share the polygons out: spans past the polygon count are not a part
  let total = 0;
  for (const gr of grs) if (gr[1] < nP) total += Math.min(gr[1] + gr[2], nP) - gr[1];
  if (total > nP) throw new Bad('not a .p model (its groups name ' + plural(total, 'polygon', 'polygons') + ', the file has ' + nP + ')');
  for (let g = 0; g < nG; g++) {
    const gr = grs[g];
    groups.push([gr[1], gr[2], gr[3], gr[11], gr[12], gr[13]]);
    for (let p = gr[1]; p < gr[1] + gr[2]; p++) {
      if (p >= nP) {
        dropped += gr[1] + gr[2] - p;
        break;
      }
      const o = o_poly + 24 * p + 2;
      const a = data.readUInt16LE(o), b = data.readUInt16LE(o + 2), c = data.readUInt16LE(o + 4);
      const va = a + gr[3], vb = b + gr[3], vc = c + gr[3];
      if (va >= nV || vb >= nV || vc >= nV) {
        dropped += 1;
        continue;
      }
      let ua, ub, uc, tex;
      if (gr[12]) {
        ua = a + gr[11]; ub = b + gr[11]; uc = c + gr[11];
        if (ua >= nT || ub >= nT || uc >= nT) {
          dropped += 1;
          continue;
        }
        tex = gr[13];
      } else {
        ua = ub = uc = tex = -1;
      }
      tris.push([va, vb, vc, ua, ub, uc, tex, p, g]);
    }
  }
  return { version: h[0], vertices: nV, polygons: nP, texcoords: nT, vertex_colours: nVC, verts, uv, vcol, pcol, groups,
           tris, dropped };
}

export function parse_tex(data) {
  if (data.length < TEX_HEAD) throw new Bad('not a texture (' + data.length + ' bytes, its header is 236)');
  const h = u32s(data, 0, 59);
  const key = h[2], depth = h[14], w = h[15], ht = h[16], has_pal = h[19], pal_size = h[22], bpp = h[26];
  if (!(w >= 1 && w <= MAX_SIDE) || !(ht >= 1 && ht <= MAX_SIDE) || !(bpp >= 1 && bpp <= 4) || pal_size > 65536) {
    throw new Bad('not a texture the tool reads (' + w + ' x ' + ht + ', ' + bpp + ' bytes a pixel, palette ' + pal_size + ')');
  }
  const pix = TEX_HEAD + (has_pal ? 4 * pal_size : 0);
  const need = pix + w * ht * bpp;
  if (need > data.length) {
    throw new Bad('a ' + w + ' x ' + ht + ' texture of ' + bpp + ' bytes a pixel needs ' + need + ' bytes, the file has ' + data.length);
  }
  const n = w * ht;
  const out = Buffer.alloc(4 * n);
  let past = 0;
  if (has_pal) {
    if (bpp !== 1) throw new Bad('a paletted texture of ' + bpp + ' bytes a pixel: drawn untextured');
    for (let k = 0; k < n; k++) {
      const idx = data[pix + k];
      if (idx >= pal_size) {
        past += 1;
        out[4 * k] = 0; out[4 * k + 1] = 0; out[4 * k + 2] = 0; out[4 * k + 3] = 255;
        continue;
      }
      const e = TEX_HEAD + 4 * idx;
      out[4 * k] = data[e + 2]; out[4 * k + 1] = data[e + 1]; out[4 * k + 2] = data[e];
      out[4 * k + 3] = idx === 0 && key === 1 ? 0 : 255;
    }
  } else if (bpp === 2 && depth === 16) {
    const bits = h.slice(27, 31);
    const masks = h.slice(31, 35);
    const shifts = h.slice(35, 39);
    if (!(masks[0] && masks[1] && masks[2]) || Math.max(...shifts) > 31) throw new Bad('a 16-bit texture without colour masks: drawn untextured');
    for (let k = 0; k < n; k++) {
      const v = data[pix + 2 * k] | (data[pix + 2 * k + 1] << 8);
      const c = [];
      for (let ch = 0; ch < 4; ch++) {
        const m = bits[ch] > 0 && bits[ch] < 32 ? 2 ** bits[ch] - 1 : 0;
        if (!m) c.push(ch === 3 ? 255 : 0);
        else c.push(Math.floor((Math.floor((v & masks[ch]) / 2 ** shifts[ch]) % (m + 1)) * 255 / m));
      }
      if (key === 1 && c[0] === 0 && c[1] === 0 && c[2] === 0) c[3] = 0;
      out[4 * k] = c[0]; out[4 * k + 1] = c[1]; out[4 * k + 2] = c[2]; out[4 * k + 3] = c[3];
    }
  } else if (bpp === 3 && depth === 24) {
    for (let k = 0; k < n; k++) {
      const b = data[pix + 3 * k], g = data[pix + 3 * k + 1], r = data[pix + 3 * k + 2];
      out[4 * k] = r; out[4 * k + 1] = g; out[4 * k + 2] = b;
      out[4 * k + 3] = key === 1 && r === 0 && g === 0 && b === 0 ? 0 : 255;
    }
  } else if (bpp === 4 && depth === 32) {
    for (let k = 0; k < n; k++) {
      const o = pix + 4 * k;
      out[4 * k] = data[o + 2]; out[4 * k + 1] = data[o + 1]; out[4 * k + 2] = data[o]; out[4 * k + 3] = data[o + 3];
    }
  } else {
    throw new Bad('a ' + depth + '-bit texture of ' + bpp + ' bytes a pixel without a palette: drawn untextured');
  }
  return { width: w, height: ht, depth, bytes: bpp, palette: has_pal ? pal_size : 0, colour_key: key, rgba: out, past };
}

// ---- the pose and the description ----
export function pose(skel, frame) {
  const bones = skel.list;
  const nb = bones.length;
  let pos, ang;
  if (frame === null) {
    pos = [0, 0, 0];
    ang = new Array(3 * (nb === 1 ? 1 : nb + 1)).fill(0);
  } else {
    pos = frame.position;
    ang = frame.angles;
  }
  const origin = [pos[0], pos[1], pos[2]];
  const r0 = from_angles(ang[0], ang[1], ang[2]);
  const world = [];
  const odd = [];
  bones.forEach(([parent, length], i) => {
    let rp, pp;
    if (parent < 0 || parent >= i) {
      if (parent !== -1) odd.push(i);
      rp = r0;
      pp = origin;
    } else {
      rp = world[parent][0];
      pp = world[parent][2];
    }
    const k = nb > 1 ? i + 1 : 0;
    const r = mul(rp, from_angles(ang[3 * k], ang[3 * k + 1], ang[3 * k + 2]));
    const e = app(r, [0.0, 0.0, length]);
    world.push([r, pp, [pp[0] + e[0], pp[1] + e[1], pp[2] + e[2]]]);
  });
  return [world, odd];
}

const sha256 = b => crypto.createHash('sha256').update(b).digest('hex');

// (stage 4, review F4) `tex_budget`: the RGBA bytes the textures may decode to in all (the Model panel's; null or absent:
// no limit, the command line's); a texture past it is not decoded, and a note says so. (review F4 round 2) `geo_budget`:
// [triangles, vertices] the parts may hold in all (the panel's: what modelview draws; null or absent: no limit); a part
// whose header counts would pass it is not parsed, and a note says so
const thousands = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
export function describe(prefix, fetch, tex_budget, geo_budget) {
  const desc = { model: prefix, skeleton: null, script_bytes: null, bones: [], frame0: null, parts: [], textures: [],
                 problems: [], notes: [] };
  const P = desc.problems;
  const N = desc.notes;
  const get = part => {
    const [data, why] = fetch(part);
    if (data === null && why) P.push(why);
    return data;
  };
  const aa = get('aa');
  if (aa === null) return desc;
  let skel;
  try {
    skel = parse_skeleton(aa);
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    P.push(prefix + 'aa: ' + e.message);
    return desc;
  }
  desc.skeleton = { bones: skel.bones, textures: skel.textures, animations: skel.animations, weapons: skel.weapons,
                    weapon_animations: skel.weapon_animations, header: skel.header };
  if (skel.bones === 0) {
    N.push(prefix + 'aa has no bone: a battle location, not a model');
    return desc;
  }
  const ab = get('ab');
  desc.script_bytes = ab === null ? null : ab.length;
  let frame = null;
  const da = get('da');
  if (da === null) {
    P.push(prefix + 'da: no animation: drawn in the rest pose');
  } else {
    try {
      frame = parse_frame0(da, skel.bones);
    } catch (e) {
      if (!(e instanceof Bad)) throw e;
      P.push(prefix + 'da' + (e.message.startsWith('holds') ? '' : ':') + ' ' + e.message + ': drawn in the rest pose');
    }
  }
  if (frame !== null) {
    desc.frame0 = { animations: frame.animations, record_bones: frame.record_bones, used_bones: frame.used_bones,
                    frames: frame.frames, key: frame.key, position: frame.position, angles: frame.angles };
  }
  const [world, odd] = pose(skel, frame);
  for (const i of odd) {
    P.push(prefix + 'aa: bone ' + i + ' names bone ' + skel.list[i][0] + ' as its parent (not an earlier bone): placed at the root');
  }
  skel.list.forEach(([parent, length, has], i) => {
    const [r, start, end] = world[i];
    const rot = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) rot.push(f32(r[a][b]));
    desc.bones.push({ parent, length: f32(length), model: has ? 1 : 0, start: start.map(f32), end: end.map(f32), rot });
  });
  let used = 0;
  const over = new Set();
  for (let i = 0; i < skel.textures; i++) {
    const part = texture_part(i);
    const data = get(part);
    if (data === null) continue;
    if (tex_budget !== undefined && tex_budget !== null && data.length >= TEX_HEAD) {
      const w = data.readUInt32LE(60), ht = data.readUInt32LE(64);
      if (w >= 1 && w <= MAX_SIDE && ht >= 1 && ht <= MAX_SIDE && used + 4 * w * ht > tex_budget) {
        N.push(prefix + part + ': drawn untextured (the panel\'s texture budget of ' + Math.floor(tex_budget / 1048576) + ' MB is used)');
        over.add(i);
        continue;
      }
    }
    let t;
    try {
      t = parse_tex(data);
    } catch (e) {
      if (!(e instanceof Bad)) throw e;
      P.push(prefix + part + ': ' + e.message);
      continue;
    }
    if (t.past) P.push(prefix + part + ': ' + t.past + ' pixels name a colour past its palette of ' + t.palette + ': drawn black');
    used += t.rgba.length;
    desc.textures.push({ index: i, file: prefix + part, width: t.width, height: t.height, depth: t.depth, bytes: t.bytes,
                         palette: t.palette, colour_key: t.colour_key, rgba: sha256(t.rgba), _rgba: t.rgba });
  }
  const have_tex = new Set(desc.textures.map(t => t.index).concat([...over]));
  // (Review T2 round 2, M5) `n_tri` adds up the file's POLYGONS, not the triangles built: a part of many polygons whose
  // groups have count 0 builds no triangle yet is sent a colour and a group for each polygon (a real part has polygons =
  // triangles, so no real answer changes)
  let n_tri = 0, n_vtx = 0, n_uv = 0;
  skel.list.forEach(([parent, length, has], i) => {
    if (!has) return;
    const part = bone_part(i);
    const data = get(part);
    if (data === null) return;
    if (geo_budget !== undefined && geo_budget !== null && data.length >= P_HEAD) {
      const nV = data.readUInt32LE(12), nT = data.readUInt32LE(24), nP = data.readUInt32LE(36);
      if (Math.max(nV, nT, nP) <= MAX_COUNT) {
        if (n_tri + nP > geo_budget[0]) {
          N.push(prefix + part + ': not drawn (the panel\'s ' + thousands(geo_budget[0]) + '-triangle budget is used)');
          return;
        }
        if (n_vtx + nV > geo_budget[1] || n_uv + nT > geo_budget[1]) {
          N.push(prefix + part + ': not drawn (the panel\'s ' + thousands(geo_budget[1]) + '-vertex budget is used)');
          return;
        }
      }
    }
    let p;
    try {
      p = parse_p(data);
    } catch (e) {
      if (!(e instanceof Bad)) throw e;
      P.push(prefix + part + ': ' + e.message);
      return;
    }
    if (p.dropped) P.push(prefix + part + ': ' + plural(p.dropped, 'polygon', 'polygons') + ' name vertices, texture coordinates or polygons past the file\'s: left out');
    n_tri += p.polygons; n_vtx += p.vertices; n_uv += p.uv.length;
    const [r, start] = world[i];
    const xyz = [];
    for (const v of p.verts) {
      const w = app(r, v);
      xyz.push(f32(start[0] + w[0]), f32(start[1] + w[1]), f32(start[2] + w[2]));
    }
    const missing = [...new Set(p.tris.filter(t => t[6] >= 0 && !have_tex.has(t[6])).map(t => t[6]))].sort((x, y) => x - y);
    for (const t of missing) {
      P.push(prefix + part + ' uses texture ' + t + ', which ' + (t >= skel.textures ? 'the skeleton does not list (' + skel.textures +
             ' textures)' : 'was not read') + ': drawn untextured');
    }
    const uv = [];
    for (const [u, v] of p.uv) uv.push(f32(u), f32(v));
    desc.parts.push({ bone: i, file: prefix + part, version: p.version, vertices: p.vertices, polygons: p.polygons,
                      groups: p.groups, xyz, uv, vcol: p.vcol.toString('hex'), pcol: p.pcol.toString('hex'), tris: p.tris });
  });
  if (skel.weapons) {
    N.push('this model has ' + skel.weapons + ' weapon model' + (skel.weapons === 1 ? '' : 's') + ' (' + weapon_part(0) + '-' +
           weapon_part(skel.weapons - 1) + '): not drawn');
  }
  return desc;
}

export function summary(desc) {
  const s = desc.skeleton;
  return { bones: s ? s.bones : 0, parts: desc.parts.length, triangles: desc.parts.reduce((n, p) => n + p.tris.length, 0),
           vertices: desc.parts.reduce((n, p) => n + p.vertices, 0), textures: desc.textures.length };
}
