/* Skeleton Master retarget core: move a FF7 battle animation from one skeleton to another.
   A faithful port of FF7_SpellExt/tools/anim_codec.py and anim_retarget.py (read those for the why). No display code:
   runs in a browser (global SKELETON_MASTER_RETARGET) and under node (module.exports). Uint8Array in, Uint8Array out.

   Exactness. The Python tools run on CPython 3.14 with glibc's maths library; this port reproduces their arithmetic
   so the angles written are the same:
   - Python's sum() of floats is compensated (Neumaier, CPython 3.12+): every sum here goes through the same steps.
   - Python rounds halves to even (round()), and its % on floats takes the sign of the divisor: both copied.
   - sin, cos, asin, acos and atan2: a browser's Math.* differ from glibc's in the last bit for 3-18% of arguments
     (and from one browser to another). Here they are computed with double-double arithmetic and rounded once
     (correctly rounded), which agrees with glibc for about 99.85% of arguments and is the same in every browser.
     glibc itself is not correctly rounded in the rest. Such a last-bit difference changes a stored angle only if it
     lands on a rounding edge: none did in the 358 test cases (tests/retarget_tests.js, "maths" and "retarget").

   How the game poses a model (anim_retarget.py's header): each bone has three angles (x, y, z) in steps of 1/4096 of
   a turn; its rotation is Ry(y) * Rx(x) * Rz(z); a bone starts where its parent ends and runs along its own Z axis
   for its length; entry 0 of an animation turns the whole model; up is negative Y. */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ Python-exact arithmetic */

  // sum() of three values as CPython 3.14 does it for floats (compensated; the compensation added at the end)
  function s3(a, b, c) {
    let hi = 0, lo = 0, t;
    t = hi + a; lo += (Math.abs(hi) >= Math.abs(a)) ? (hi - t) + a : (a - t) + hi; hi = t;
    t = hi + b; lo += (Math.abs(hi) >= Math.abs(b)) ? (hi - t) + b : (b - t) + hi; hi = t;
    t = hi + c; lo += (Math.abs(hi) >= Math.abs(c)) ? (hi - t) + c : (c - t) + hi; hi = t;
    return (lo && isFinite(lo)) ? hi + lo : hi;
  }
  function psum(arr) {
    let hi = 0, lo = 0;
    for (const x of arr) { const t = hi + x; lo += (Math.abs(hi) >= Math.abs(x)) ? (hi - t) + x : (x - t) + hi; hi = t; }
    return (lo && isFinite(lo)) ? hi + lo : hi;
  }
  // round(x) of a float: C's round (halves away from zero), then halves to even
  function cround(x) {
    const r = Math.trunc(x), d = x - r;
    return Math.abs(d) >= 0.5 ? r + Math.sign(x) : r;
  }
  function pyRound(x) {
    let r = cround(x);
    if (Math.abs(x - r) === 0.5) r = 2.0 * cround(x / 2.0);
    return r === 0 ? 0 : r;                           // an int has no sign of zero
  }
  function pyFmod(v, w) {                             // float % float
    let m = v % w;
    if (m) { if ((w < 0) !== (m < 0)) m += w; } else m = w < 0 ? -0 : 0;
    return m;
  }
  function imod(a, n) { return ((a % n) + n) % n; }   // int % positive int
  const pmin = (a, b) => (b < a ? b : a);             // min(a, b): the first when equal
  const pmax = (a, b) => (b > a ? b : a);

  /* double-double arithmetic for correctly rounded sin, cos, asin, acos, atan2 */
  const SPLIT = 134217729;
  function twoProd(a, b) {
    const p = a * b;
    let c = SPLIT * a; const ah = c - (c - a), al = a - ah;
    c = SPLIT * b; const bh = c - (c - b), bl = b - bh;
    return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
  }
  function twoSum(a, b) { const s = a + b, bb = s - a; return [s, (a - (s - bb)) + (b - bb)]; }
  function qts(a, b) { const s = a + b; return [s, b - (s - a)]; }
  function ddAdd(a, b) { const [s, e] = twoSum(a[0], b[0]); return qts(s, e + a[1] + b[1]); }
  function ddMul(a, b) { const [p, e] = twoProd(a[0], b[0]); return qts(p, e + a[0] * b[1] + a[1] * b[0]); }
  function ddDivD(a, b) { const q = a[0] / b, [p, pe] = twoProd(q, b); return qts(q, ((a[0] - p) - pe + a[1]) / b); }
  const PIO2 = [1.5707963267948966, 6.123233995736766e-17, -1.4973849048591698e-33];
  // sin and cos of x as double-doubles
  function ddSinCos(x) {
    const k = Math.round(x / PIO2[0]);
    const p1 = twoProd(k, PIO2[0]), p2 = twoProd(k, PIO2[1]);
    let [s, e] = twoSum(x, -p1[0]); let r = qts(s, e - p1[1]);
    r = ddAdd(r, [-p2[0], -p2[1]]); r = ddAdd(r, [-k * PIO2[2], 0]);
    const r2 = ddMul(r, r);
    let ts = [1, 0], tc = [1, 0];
    for (let i = 15; i >= 1; i--) {
      ts = ddAdd([1, 0], ddDivD(ddMul(r2, ts), -(2 * i) * (2 * i + 1)));
      tc = ddAdd([1, 0], ddDivD(ddMul(r2, tc), -(2 * i - 1) * (2 * i)));
    }
    const sn = ddMul(r, ts), cs = tc, q = imod(k, 4);
    const neg = a => [-a[0], -a[1]];
    if (q === 0) return [sn, cs];
    if (q === 1) return [cs, neg(sn)];
    if (q === 2) return [neg(sn), neg(cs)];
    return [neg(cs), sn];
  }
  function sin(x) { if (!isFinite(x) || x === 0) return Math.sin(x); const v = ddSinCos(x)[0]; return v[0] + v[1]; }
  function cos(x) { if (!isFinite(x)) return Math.cos(x); if (x === 0) return 1; const v = ddSinCos(x)[1]; return v[0] + v[1]; }
  function asin(x) {
    const t = Math.asin(x);
    if (!isFinite(t) || x === 0 || Math.abs(x) === 1) return t;
    const [s, c] = ddSinCos(t), [d, de] = twoSum(x, -s[0]);
    return t + (d + (de - s[1])) / (c[0] + c[1]);
  }
  function acos(x) {
    const t = Math.acos(x);
    if (!isFinite(t) || Math.abs(x) === 1) return t;
    const [s, c] = ddSinCos(t), [d, de] = twoSum(c[0], -x);
    return t + (d + (de + c[1])) / (s[0] + s[1]);
  }
  function atan2(y, x) {
    const t = Math.atan2(y, x);
    if (y === 0 || x === 0 || !isFinite(x) || !isFinite(y) || !isFinite(t)) return t;
    const [s, c] = ddSinCos(t);
    const a = twoProd(y, c[0]), b = twoProd(x, s[0]), [d, de] = twoSum(a[0], -b[0]);
    const num = d + (de + (a[1] + y * c[1]) - (b[1] + x * s[1]));
    return t + num / (x * c[0] + y * s[0]);
  }
  const PYMATH = { sin, cos, asin, acos, atan2, psum, pyRound, pyFmod };

  /* ------------------------------------------------------------------ the codec (anim_codec.py) */

  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function i32(b, o) { return b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); }
  function f32(b, o) { return new DataView(b.buffer, b.byteOffset + o, 4).getFloat32(0, true); }
  function put32(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff; }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  const asBytes = b => (b instanceof Uint8Array ? b : new Uint8Array(b));

  function isPlaceholder(record) { return u32(asBytes(record), 8) < 11; }

  /* record -> {bones, key, frames: [[pos[3], angles[bones*3]]], declared_frames, used_bits, stream_size} | null */
  function decodeRaw(record) {
    record = asBytes(record);
    const bones = u32(record, 0), declared = u32(record, 4), size = u32(record, 8);
    if (size < 11) return null;
    const body = record.subarray(12, 12 + size);
    const nFrames = u16(body, 0), streamSize = u16(body, 2), key = body[4];
    const d = body.subarray(5, 5 + streamSize); let bit = 0;
    const get = n => {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const byte = (bit >> 3) < d.length ? d[bit >> 3] : 0;
        v = v * 2 + ((byte >> (7 - (bit & 7))) & 1); bit++;
      }
      return v;
    };
    const signed = n => { const v = get(n); return n && (v >= 2 ** (n - 1)) ? v - 2 ** n : v; };
    const width = 12 - key, out = [];
    const pos = [signed(16), signed(16), signed(16)];
    const ang = []; for (let i = 0; i < bones * 3; i++) ang.push(get(width) << key);
    out.push([pos.slice(), ang.slice()]);
    for (let f = 1; f < nFrames; f++) {
      for (let i = 0; i < 3; i++) pos[i] += get(1) ? signed(16) : signed(7);
      for (let i = 0; i < bones * 3; i++) {
        if (get(1)) {
          const n = get(3); let dv;
          if (n === 0) dv = -1;
          else if (n === 7) dv = signed(width);
          else { const t = signed(n); dv = t < 0 ? t - (1 << (n - 1)) : t + (1 << (n - 1)); }
          ang[i] += dv * (1 << key);
        }
      }
      out.push([pos.slice(), ang.slice()]);
    }
    return { bones, key, frames: out, declared_frames: declared, used_bits: bit, stream_size: streamSize };
  }

  function BitWriter() {
    let buf = new Uint8Array(256), bit = 0;
    return {
      put(v, n) {
        v &= (2 ** n) - 1;                             // n <= 16 here
        for (let i = n - 1; i >= 0; i--) {
          if ((bit >> 3) >= buf.length) { const nb = new Uint8Array(buf.length * 2); nb.set(buf); buf = nb; }
          if ((v >> i) & 1) buf[bit >> 3] |= 0x80 >> (bit & 7);
          bit++;
        }
      },
      bytes() { return buf.slice(0, (bit + 7) >> 3); }
    };
  }

  /* {bones, key, frames: [[pos, angles]], declared_frames?} -> record bytes */
  function encodeRaw(anim) {
    const bones = anim.bones, key = anim.key, frames = anim.frames, width = 12 - key, w = BitWriter(), step = 1 << key;
    let [pos, ang] = frames[0];
    for (const v of pos) w.put(v, 16);
    for (const v of ang) w.put(v >> key, width);
    const prevPos = pos.slice(), prevAng = ang.map(v => (v >> key) << key);
    for (let f = 1; f < frames.length; f++) {
      [pos, ang] = frames[f];
      for (let i = 0; i < 3; i++) {
        const d = pos[i] - prevPos[i];
        if (d >= -64 && d <= 63) { w.put(0, 1); w.put(d, 7); } else { w.put(1, 1); w.put(d, 16); }
        prevPos[i] = pos[i];
      }
      for (let i = 0; i < bones * 3; i++) {
        let d = (ang[i] - prevAng[i]) >= 0 ? (ang[i] - prevAng[i]) >> key : -((prevAng[i] - ang[i]) >> key);
        prevAng[i] += d * step;
        if (d === 0) { w.put(0, 1); continue; }
        w.put(1, 1);
        if (d === -1) { w.put(0, 3); continue; }
        let done = false;
        for (let n = 1; n < 7; n++) {
          const half = 1 << (n - 1);
          if (half <= d && d <= 2 * half - 1) { w.put(n, 3); w.put(d - half, n); done = true; break; }
          if (-2 * half <= d && d <= -half - 1) { w.put(n, 3); w.put(d + half, n); done = true; break; }
        }
        if (!done) {
          const lim = 1 << (width - 1);
          if (!(-lim <= d && d < lim)) d = imod(d + lim, 1 << width) - lim;   // the short way round the circle
          w.put(7, 3); w.put(d, width);
        }
      }
    }
    const stream = w.bytes();
    let bodyLen = 5 + stream.length; bodyLen += (4 - bodyLen % 4) % 4;
    const out = new Uint8Array(12 + bodyLen);
    put32(out, 0, bones); put32(out, 4, anim.declared_frames !== undefined ? anim.declared_frames : frames.length); put32(out, 8, bodyLen);
    out[12] = frames.length & 0xff; out[13] = (frames.length >> 8) & 0xff;
    out[14] = stream.length & 0xff; out[15] = (stream.length >> 8) & 0xff; out[16] = key;
    out.set(stream, 17);
    return out;
  }

  // public form: {bones, key, declaredFrames, frames: [{pos: [x, y, z], rot: [[x, y, z] for entry 0 (the model) and each bone]}]}
  function toPublic(raw) {
    if (!raw) return null;
    const frames = raw.frames.map(([pos, ang]) => {
      const rot = []; for (let i = 0; i < ang.length; i += 3) rot.push([ang[i], ang[i + 1], ang[i + 2]]);
      return { pos: pos.slice(), rot };
    });
    const out = { bones: raw.bones, key: raw.key, frames };
    if (raw.declared_frames !== undefined) out.declaredFrames = raw.declared_frames;
    return out;
  }
  function frameToRaw(fr) {
    if (Array.isArray(fr)) return fr;                  // already [pos, flat angles]
    const ang = []; for (const r of fr.rot) ang.push(r[0], r[1], r[2]);
    return [fr.pos.slice(), ang];
  }
  function toRaw(anim) {
    const raw = { bones: anim.bones, key: anim.key, frames: anim.frames.map(frameToRaw) };
    if (anim.declaredFrames !== undefined) raw.declared_frames = anim.declaredFrames;
    else if (anim.declared_frames !== undefined) raw.declared_frames = anim.declared_frames;
    return raw;
  }
  function decode(record) { return toPublic(decodeRaw(record)); }
  function encode(anim) { return encodeRaw(toRaw(anim)); }

  /* an xxda or a limit pack: the records (anim_retarget.records; whatever follows them is ignored) */
  function readRecords(bytes) {
    bytes = asBytes(bytes); const n = u32(bytes, 0), out = []; let o = 4;
    if (n > 4096) throw new Error('this does not look like an animation file (it says ' + n + ' animations)');
    for (let i = 0; i < n; i++) {
      if (o + 12 > bytes.length) throw new Error('the file ends inside animation ' + i.toString(16));
      const s = u32(bytes, o + 8); out.push(bytes.slice(o, o + 12 + s)); o += 12 + s;
    }
    return out;
  }

  /* ------------------------------------------------------------------ skeleton and pose */

  /* xxaa -> {bones: [{parent, length}], count, header: [13 dwords]} */
  function readSkeleton(bytes) {
    bytes = asBytes(bytes);
    if (bytes.length < 52) throw new Error('too short for a battle skeleton (xxaa)');
    const header = []; for (let i = 0; i < 13; i++) header.push(u32(bytes, i * 4));
    const n = header[3];
    if (52 + n * 12 > bytes.length) throw new Error('the skeleton says ' + n + ' bones but the file is too short for them');
    const bones = [];
    for (let i = 0; i < n; i++) bones.push({ parent: i32(bytes, 52 + i * 12), length: f32(bytes, 56 + i * 12) });
    return { bones, count: n, header };
  }
  const skelPairs = s => (Array.isArray(s) ? s : s.bones.map(b => [b.parent, b.length]));

  const U = 2 * Math.PI / 4096;
  const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  function mul(a, b) {
    const o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = s3(a[i][0] * b[0][j], a[i][1] * b[1][j], a[i][2] * b[2][j]);
    return o;
  }
  function tr(a) { return [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]]; }
  function app(m, v) { return [s3(m[0][0] * v[0], m[0][1] * v[1], m[0][2] * v[2]), s3(m[1][0] * v[0], m[1][1] * v[1], m[1][2] * v[2]), s3(m[2][0] * v[0], m[2][1] * v[1], m[2][2] * v[2])]; }
  function rot(axis, t) {
    const c = cos(t), s = sin(t);
    if (axis === 'x') return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 'y') return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function fromAngles(x, y, z) { return mul(mul(rot('y', y * U), rot('x', x * U)), rot('z', z * U)); }
  /* matrix -> (x, y, z) in game units, the equivalent set closest to `near` */
  function toAngles(m, near) {
    const sx = pmax(-1.0, pmin(1.0, -m[1][2]));
    const x = asin(sx); let y, z;
    if (Math.abs(sx) > 1 - 1e-12) { y = atan2(-m[2][0], m[0][0]); z = 0.0; }
    else { y = atan2(m[0][2], m[2][2]); z = atan2(m[1][0], m[1][1]); }
    const cands = [[x, y, z], [Math.PI - x, y + Math.PI, z + Math.PI]];
    let best = null;
    for (const c of cands) {
      let v = c.map(a => a / U), cost;
      if (near != null) {
        v = v.map((a, i) => a + 4096 * pyRound((near[i] - a) / 4096));
        cost = s3(Math.abs(v[0] - near[0]), Math.abs(v[1] - near[1]), Math.abs(v[2] - near[2]));
      } else {
        v = v.map(a => pyFmod(a + 2048, 4096) - 2048); cost = s3(Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]));
      }
      if (best === null || cost < best[0]) best = [cost, v];
    }
    return best[1];
  }
  function norm(v) { const l = Math.sqrt(s3(v[0] * v[0], v[1] * v[1], v[2] * v[2])); return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0.0, 0.0, 0.0]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function axisMatrix(x, y, z, c, s) {
    const t = 1 - c;
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
  }
  /* smallest rotation taking direction a to direction b */
  function align(a, b) {
    a = norm(a); b = norm(b);
    let d = pmax(-1.0, pmin(1.0, s3(a[0] * b[0], a[1] * b[1], a[2] * b[2]))); let ax = cross(a, b); let s = Math.sqrt(s3(ax[0] * ax[0], ax[1] * ax[1], ax[2] * ax[2]));
    if (s < 1e-7) {
      if (d > 0) return I3;
      const p = Math.abs(a[0]) < 0.9 ? norm(cross(a, [1, 0, 0])) : norm(cross(a, [0, 1, 0]));
      ax = p; s = 0.0; d = -1.0;
    } else ax = [ax[0] / s, ax[1] / s, ax[2] / s];
    return axisMatrix(ax[0], ax[1], ax[2], d, s);
  }
  /* rotation taking direction a toward direction b, by at most `limit` radians */
  function swing(a, b, limit) {
    a = norm(a); b = norm(b);
    const d = pmax(-1.0, pmin(1.0, s3(a[0] * b[0], a[1] * b[1], a[2] * b[2]))); let ang = acos(d);
    if (ang < 1e-7) return I3;
    let ax = cross(a, b); const l = Math.sqrt(s3(ax[0] * ax[0], ax[1] * ax[1], ax[2] * ax[2]));
    if (l < 1e-7) ax = Math.abs(a[0]) < 0.9 ? norm(cross(a, [1, 0, 0])) : norm(cross(a, [0, 1, 0]));
    else ax = [ax[0] / l, ax[1] / l, ax[2] / l];
    ang = pmin(ang, limit);
    return axisMatrix(ax[0], ax[1], ax[2], cos(ang), sin(ang));
  }
  /* move a point out of every collider it is inside (an elliptical tube round a bone, in that bone's frame) */
  function pushOut(p, colliders, world, skeleton, rootPos) {
    for (const c of colliders) {
      const b = c.bone;
      if (b >= world.length) continue;
      const Rb = world[b][0], [parent, length] = skeleton[b], start = parent < 0 ? rootPos : world[parent][1];
      let l = app(tr(Rb), [p[0] - start[0], p[1] - start[1], p[2] - start[2]]);
      if (l[2] > c.below || l[2] < length - c.above) continue;
      let x = l[0] / c.rx, y = (l[1] - c.yo) / c.ry, d = x * x + y * y;
      if (d >= 1.0) continue;
      if (d < 1e-6) { x = 0.0; y = -1.0; d = 1.0; }
      const f = 1.0 / Math.sqrt(d); l = [x * f * c.rx, y * f * c.ry + c.yo, l[2]];
      const w = app(Rb, l); p = [start[0] + w[0], start[1] + w[1], start[2] + w[2]];
    }
    return p;
  }
  /* world rotation and end point of every bone, plus the model's own rotation (skeleton as [[parent, length]]) */
  function poseRaw(skeleton, frame) {
    const [pos, ang] = frame, R0 = fromAngles(ang[0], ang[1], ang[2]), world = [];
    for (let i = 0; i < skeleton.length; i++) {
      const [parent, length] = skeleton[i];
      const [Rp, Pp] = parent < 0 ? [R0, [pos[0], pos[1], pos[2]]] : world[parent];
      const R = mul(Rp, fromAngles(ang[(i + 1) * 3], ang[(i + 1) * 3 + 1], ang[(i + 1) * 3 + 2])), e = app(R, [0, 0, length]);
      world.push([R, [Pp[0] + e[0], Pp[1] + e[1], Pp[2] + e[2]]]);
    }
    return [R0, world];
  }
  /* public: pose(skeleton from readSkeleton, frame {pos, rot}) -> {model: 3x3, bones: [{rot: 3x3, start, end}]}
     rot is the bone's turning in the model's space (columns: its X, Y, Z axes; it runs along Z); up is -Y. */
  function pose(skeleton, frame) {
    const sk = skelPairs(skeleton), raw = frameToRaw(frame), [R0, world] = poseRaw(sk, raw);
    return {
      model: R0,
      bones: world.map(([R, end], i) => ({ rot: R, end, start: sk[i][0] < 0 ? raw[0].map(Number) : world[sk[i][0]][1] }))
    };
  }

  /* ------------------------------------------------------------------ the map (anim_retarget.load_map) */

  const LOOSE_DEFAULTS = { stiffness: 0.3, damping: 0.6, gravity: 4.0, limit: 40.0, hang: 0.0 };
  const LOOSE_KEYS = ['stiffness', 'damping', 'gravity', 'limit', 'hang'];
  function pyInt(s, what) {
    const t = String(s).trim().replace(/_/g, '');
    if (!/^[+-]?\d+$/.test(t)) throw new Error('not a whole number: "' + s + '"' + (what ? ' (' + what + ')' : ''));
    return parseInt(t, 10);
  }
  function pyFloat(s, what) {
    const t = String(s).trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?(inf|infinity|nan)$/i.test(t)) throw new Error('not a number: "' + s + '"' + (what ? ' (' + what + ')' : ''));
    return /inf/i.test(t) ? (t[0] === '-' ? -Infinity : Infinity) : /nan/i.test(t) ? NaN : Number(t);
  }
  const POSE_COPY_KEYS = ['mirror', 'source_sides', 'keep', 'head', 'weapon_bone', 'weapon_reference'];

  /* text of a .map -> mapping. File references stay as written (names); `resolver(name) -> bytes` (or an object
     {name: bytes}) is kept with the mapping for retarget to load them. A reference is "NAME:NN frame F" (animation
     NN, hex, of the file NAME) or "NAME frame F" (a single .anim). */
  function parseMap(text, resolver) {
    const m = { pairs: {}, feet: [], source_feet: [], loose: {}, looseGroups: [], colliders: [] };
    const lines = String(text).split(/\r?\n/);
    lines.forEach((raw, no) => {
      const line = raw.split('#')[0].split(';')[0].trim();
      if (!line || line.indexOf('=') < 0) return;
      const eq = line.indexOf('='), k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
      const where = 'line ' + (no + 1);
      if (k === 'source_skeleton' || k === 'target_skeleton') m[k] = v;
      else if (k === 'source_reference' || k === 'target_reference' || k === 'source_weapon_reference' || k === 'target_weapon_reference') {
        const w = v.split(/\s+/);
        m[k] = { file: w[0], frame: (w.length > 2 && w[1] === 'frame') ? pyInt(w[2], where) : 0 };
      }
      else if (k === 'target_feet') m.feet = v.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(x => pyInt(x, where));
      else if (k === 'source_feet') m.source_feet = v.replace(/,/g, ' ').split(/\s+/).filter(Boolean).map(x => pyInt(x, where));
      else if (k === 'scale') m.scale = pyFloat(v, where);
      else if (k === 'source_weapon_bone' || k === 'target_weapon_bone') m[k] = pyInt(v, where);
      else if (k === 'loose') {
        const w = v.split(/\s+/).filter(Boolean), par = Object.assign({}, LOOSE_DEFAULTS), bones = [];
        for (let i = 0; i < w.length;) {
          if (LOOSE_KEYS.includes(w[i])) { par[w[i]] = pyFloat(w[i + 1], where); i += 2; continue; }
          const dash = w[i].indexOf('-'), lo = pyInt(dash < 0 ? w[i] : w[i].slice(0, dash), where);
          const hi = dash < 0 || w[i].slice(dash + 1) === '' ? lo : pyInt(w[i].slice(dash + 1), where);
          for (let b = lo; b <= hi; b++) bones.push(b);
          i++;
        }
        m.looseGroups.push({ bones, params: par });
        for (const b of bones) m.loose[b] = par;
      }
      else if (k === 'collide') {
        const w = v.split(/\s+/).filter(Boolean).map(x => pyFloat(x, where));
        m.colliders.push({ bone: w[0], rx: w[1], ry: w[2], yo: w.length > 3 ? w[3] : 0.0, below: w.length > 4 ? w[4] : 0.0, above: w.length > 5 ? w[5] : 0.0 });
      }
      else {
        if (POSE_COPY_KEYS.includes(k)) throw new Error(where + ': "' + k + '" belongs to a pose-copy map (anim_pose_copy.py: a model wearing the source model\'s own parts), not to a retarget map');
        let t;
        try { t = pyInt(k); } catch (e) { throw new Error(where + ': unknown setting "' + k + '"'); }
        const w = v.split(/\s+/).filter(Boolean);
        m.pairs[t] = [pyInt(w[0], where), w.length > 1 ? w[1] : 'offset'];
      }
    });
    if (resolver) Object.defineProperty(m, 'resolver', { value: resolver, enumerable: false, writable: true });
    return m;
  }

  function fmtNum(x) { return String(x); }
  function nameOk(n, what) {
    if (typeof n !== 'string' || !n.length || /\s|#|;/.test(n)) throw new Error(what + ': a file name may not be empty or contain spaces, # or ; ("' + n + '")');
    return n;
  }
  /* mapping -> text in the .map format (comments are not kept; the help lines are written fresh) */
  function writeMap(m) {
    const L = ['# Retarget map (anim_retarget.py format), written by Skeleton Master.',
      '#   target bone = source bone [aim | reach]',
      '#     (nothing)  follow the source bone\'s turning, starting from the target\'s own reference pose',
      '#     aim        ... and then point exactly where the source bone points',
      '#     reach      ... and then point from the model\'s origin to where the source bone ends',
      '# Bones not listed keep their reference pose and follow their parent.', ''];
    for (const k of ['source_skeleton', 'target_skeleton']) if (m[k] !== undefined) L.push(k + ' = ' + nameOk(m[k], k));
    for (const k of ['source_reference', 'target_reference']) if (m[k]) L.push(k + ' = ' + nameOk(m[k].file, k) + ' frame ' + m[k].frame);
    if (m.source_feet && m.source_feet.length) L.push('source_feet = ' + m.source_feet.join(' '));
    if (m.feet && m.feet.length) L.push('target_feet = ' + m.feet.join(' '));
    if (m.scale !== undefined) L.push('scale = ' + fmtNum(m.scale));
    for (const k of ['source_weapon_reference', 'target_weapon_reference']) if (m[k]) L.push(k + ' = ' + nameOk(m[k].file, k) + ' frame ' + m[k].frame);
    for (const k of ['source_weapon_bone', 'target_weapon_bone']) if (m[k] !== undefined) L.push(k + ' = ' + m[k]);
    L.push('');
    Object.keys(m.pairs).map(Number).sort((a, b) => a - b).forEach(t => {
      const [s, how] = m.pairs[t];
      L.push(t + ' = ' + s + (how && how !== 'offset' ? ' ' + how : ''));
    });
    // loose: as the groups were given; a mapping built by hand with only `loose` gets one line per set of settings
    let groups = m.looseGroups;
    if (!groups || !groups.length) {
      groups = []; const seen = new Map();
      Object.keys(m.loose || {}).map(Number).sort((a, b) => a - b).forEach(b => {
        const p = m.loose[b]; if (!seen.has(p)) { seen.set(p, { bones: [], params: p }); groups.push(seen.get(p)); }
        seen.get(p).bones.push(b);
      });
    }
    if (groups.length) L.push('');
    for (const g of groups) {
      const runs = []; let i = 0; const bs = g.bones;
      while (i < bs.length) { let j = i; while (j + 1 < bs.length && bs[j + 1] === bs[j] + 1) j++; runs.push(i === j ? String(bs[i]) : bs[i] + '-' + bs[j]); i = j + 1; }
      L.push('loose = ' + runs.join(' ') + ' ' + LOOSE_KEYS.map(k => k + ' ' + fmtNum(g.params[k])).join(' '));
    }
    for (const c of m.colliders || []) L.push('collide = ' + [c.bone, c.rx, c.ry, c.yo, c.below, c.above].map(fmtNum).join(' '));
    return L.join('\n') + '\n';
  }

  /* ------------------------------------------------------------------ retargeting (anim_retarget.retarget) */

  function getFile(resolver, name) {
    if (!resolver) throw new Error('no files given: pass options.files (a function name -> bytes, or an object)');
    const b = typeof resolver === 'function' ? resolver(name) : resolver[name];
    if (!b) throw new Error('the file "' + name + '" was not supplied');
    return asBytes(b);
  }
  /* "NAME:NN" (hex) or a single .anim -> record bytes (anim_retarget.item) */
  function itemOf(resolver, spec) {
    const c = spec.lastIndexOf(':');
    if (c > 0 && /^[0-9a-fA-F]+$/.test(spec.slice(c + 1))) {
      const recs = readRecords(getFile(resolver, spec.slice(0, c))), n = parseInt(spec.slice(c + 1), 16);
      if (n >= recs.length) throw new Error(spec + ': the file has only ' + recs.length + ' animations');
      return recs[n];
    }
    return getFile(resolver, spec);
  }
  function refFrame(resolver, ref, what) {
    if (!ref) throw new Error('the map has no ' + what);
    const a = decodeRaw(itemOf(resolver, ref.file));
    if (!a) throw new Error(what + ' (' + ref.file + ') is a placeholder');
    if (ref.frame >= a.frames.length) throw new Error(what + ' (' + ref.file + ') has ' + a.frames.length + ' frames, not ' + (ref.frame + 1));
    return a.frames[ref.frame];
  }
  function loadSkel(resolver, name, what) {
    if (!name) throw new Error('the map has no ' + what);
    return skelPairs(readSkeleton(getFile(resolver, name)));
  }
  function opts(mapping, o) {
    o = o || {};
    return { key: o.key === undefined || o.key === null ? null : o.key, style: o.style || 'pose', follow: o.follow === undefined ? true : !!o.follow, files: o.files || mapping.resolver };
  }

  function retargetRaw(mapping, sourceRecord, o) {
    const src = decodeRaw(sourceRecord);
    if (src === null) throw new Error('the source animation is a placeholder');
    const R = o.files, ss = loadSkel(R, mapping.source_skeleton, 'source_skeleton'), ts = loadSkel(R, mapping.target_skeleton, 'target_skeleton');
    if (src.bones !== ss.length + 1) throw new Error('the source animation has ' + src.bones + ' bones; the source skeleton needs ' + (ss.length + 1));
    const sref = refFrame(R, mapping.source_reference, 'source_reference'), tref = refFrame(R, mapping.target_reference, 'target_reference');
    const [, swRef] = poseRaw(ss, sref), [tR0, twRef] = poseRaw(ts, tref);
    const scale = mapping.scale || (sref[0][1] ? tref[0][1] / sref[0][1] : 1.0);
    const Z = [0, 0, -1], out = []; let prev = null;
    const loose = o.follow ? mapping.loose : {}, pairs = mapping.pairs, feet = mapping.feet || [], sfeet = mapping.source_feet || [], colliders = mapping.colliders || [];
    const maxOf = (arr, f) => { let b; arr.forEach((x, i) => { const v = f(x); if (i === 0 || v > b) b = v; }); return b; };
    const refLowS = sfeet.length ? maxOf(sfeet, b => swRef[b][1][1]) : 0.0;
    const refLowT = feet.length ? maxOf(feet, b => twRef[b][1][1]) : 0.0;
    const tip = {}, speed = {}, last = src.frames.length - 1;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    for (let fno = 0; fno < src.frames.length; fno++) {
      const [pos, ang] = src.frames[fno];
      const ease = pmin(1.0, (last - fno) / 4.0);
      const [, sw] = poseRaw(ss, [pos, ang]);
      const tpos = o.style === 'pose' ? [pos[0] * scale, pos[1] * scale, pos[2] * scale] : [0, 1, 2].map(k => tref[0][k] + (pos[k] - sref[0][k]) * scale);
      const tang = ang.slice(0, 3).concat(new Array(ts.length * 3).fill(0)), world = [];
      const TR0 = fromAngles(ang[0], ang[1], ang[2]);
      for (let j = 0; j < ts.length; j++) {
        const [parent, length] = ts[j];
        const [Rp, Pp] = parent < 0 ? [TR0, tpos] : world[parent];
        let W, L;
        if (pairs[j] !== undefined) {
          const [i, how] = pairs[j];
          W = mul(mul(sw[i][0], tr(swRef[i][0])), twRef[j][0]);
          if (o.style === 'pose' && how === 'aim') W = mul(align(app(W, Z), app(sw[i][0], Z)), W);
          else if (o.style === 'pose' && how === 'reach') W = mul(align(app(W, Z), sub(sw[i][1], pos)), W);
          L = mul(tr(Rp), W);
        } else {
          L = fromAngles(tref[1][(j + 1) * 3], tref[1][(j + 1) * 3 + 1], tref[1][(j + 1) * 3 + 2]); W = mul(Rp, L);
          if (loose[j] !== undefined && Math.abs(length) > 1e-6) {
            const par = loose[j];
            if (par.hang > 0) {
              const held = app(W, [0, 0, length]), free = app(mul(TR0, mul(tr(tR0), twRef[j][0])), [0, 0, length]);
              const mix = [0, 1, 2].map(k => held[k] * (1 - par.hang) + free[k] * par.hang);
              if (s3(mix[0] * mix[0], mix[1] * mix[1], mix[2] * mix[2]) > 1e-6) W = mul(align(held, mix), W);
            }
            let rigid = app(W, [0, 0, length]), want = add(Pp, rigid), S;
            if (colliders.length) {
              for (let it = 0; it < 2; it++) {
                want = pushOut(want, colliders, world, ts, tpos); const d0 = norm(sub(want, Pp));
                want = [0, 1, 2].map(k => Pp[k] + d0[k] * Math.abs(length));
              }
              W = mul(align(rigid, sub(want, Pp)), W); rigid = sub(want, Pp);
            }
            if (tip[j] === undefined) { tip[j] = want; speed[j] = [0.0, 0.0, 0.0]; }
            else {
              let p = [0, 1, 2].map(k => tip[j][k] + speed[j][k] * par.damping);
              p[1] += par.gravity;
              p = [0, 1, 2].map(k => p[k] + (want[k] - p[k]) * par.stiffness);
              let d = norm(sub(p, Pp));
              if (d[0] === 0 && d[1] === 0 && d[2] === 0) d = norm(rigid);
              S = swing(rigid, d, (par.limit * (Math.PI / 180)) * ease);
              const e2 = app(S, rigid); p = add(Pp, e2);
              if (colliders.length) {
                let q = pushOut(p, colliders, world, ts, tpos);
                if (q[0] !== p[0] || q[1] !== p[1] || q[2] !== p[2]) {
                  const d2 = norm(sub(q, Pp)); q = [0, 1, 2].map(k => Pp[k] + d2[k] * Math.abs(length));
                  S = align(rigid, sub(q, Pp)); p = q;
                }
              }
              speed[j] = [0, 1, 2].map(k => pmax(-Math.abs(length), pmin(Math.abs(length), p[k] - tip[j][k]))); tip[j] = p;
              W = mul(S, W);
            }
            L = mul(tr(Rp), W);
          }
        }
        const near = prev ? prev.slice((j + 1) * 3, (j + 1) * 3 + 3) : tref[1].slice((j + 1) * 3, (j + 1) * 3 + 3);
        const a = toAngles(L, near); tang[(j + 1) * 3] = a[0]; tang[(j + 1) * 3 + 1] = a[1]; tang[(j + 1) * 3 + 2] = a[2];
        const e = app(W, [0, 0, length]); world.push([W, add(Pp, e)]);
      }
      if (feet.length && sfeet.length) {
        const lowT = maxOf(feet, b => world[b][1][1]), lowS = maxOf(sfeet, b => sw[b][1][1]);
        tpos[1] += (refLowT + (lowS - refLowS) * scale) - lowT;
      }
      prev = tang;
      out.push([tpos.map(pyRound), tang.map(pyRound)]);
    }
    const k = o.key === null ? src.key : o.key, step = 1 << k;
    return { bones: ts.length + 1, key: k, frames: out.map(([p, a]) => [p, a.map(v => pyRound(v / step) * step)]) };
  }

  function retargetWeaponRaw(mapping, weaponRecord, targetBody, o) {
    const src = decodeRaw(weaponRecord);
    if (src === null) return null;
    const R = o.files, ts = loadSkel(R, mapping.target_skeleton, 'target_skeleton'), hand = mapping.target_weapon_bone;
    if (hand === undefined) throw new Error('the map has no target_weapon_bone');
    const sref = refFrame(R, mapping.source_weapon_reference, 'source_weapon_reference');
    const wref = refFrame(R, mapping.target_weapon_reference, 'target_weapon_reference');
    const tref = refFrame(R, mapping.target_reference, 'target_reference');
    const [, twRef] = poseRaw(ts, tref);
    const RsRef = fromAngles(sref[1][0], sref[1][1], sref[1][2]), RtRef = fromAngles(wref[1][0], wref[1][1], wref[1][2]);
    const grip = app(tr(RtRef), [0, 1, 2].map(k => wref[0][k] - twRef[hand][1][k]));
    const out = []; let prev = null; const n = Math.min(src.frames.length, targetBody.frames.length);
    for (let f = 0; f < n; f++) {
      const [, tw] = poseRaw(ts, targetBody.frames[f]);
      const sa = src.frames[f][1], W = mul(mul(fromAngles(sa[0], sa[1], sa[2]), tr(RsRef)), RtRef);
      const g = app(W, grip), a = toAngles(W, prev ? prev : wref[1].slice(0, 3)); prev = a;
      out.push([[0, 1, 2].map(k => pyRound(tw[hand][1][k] + g[k])), a.map(pyRound)]);
    }
    const k = o.key === null ? src.key : o.key, step = 1 << k;
    return { bones: 1, key: k, frames: out.map(([p, a]) => [p, a.map(v => pyRound(v / step) * step)]) };
  }

  /* public:
     retarget(mapping, sourceRecord, options) -> decoded animation for the target skeleton (encode() it for the record)
     options: {files, style: 'pose' | 'offset', follow: true | false, key: null | 0 | 2 | 4} */
  function retarget(mapping, sourceRecord, options) { return toPublic(retargetRaw(mapping, asBytes(sourceRecord), opts(mapping, options))); }
  /* retargetWeapon(mapping, sourceWeaponRecord, targetBody (what retarget returned), options) -> decoded weapon track or null */
  function retargetWeapon(mapping, weaponRecord, targetBody, options) {
    return toPublic(retargetWeaponRaw(mapping, asBytes(weaponRecord), toRaw(targetBody), opts(mapping, options)));
  }
  /* retargetPack(mapping, packBytes, options) -> {bytes: the new pack, report: [lines]}:
     body animations in the first half, the weapon track for each in the second */
  function retargetPack(mapping, packBytes, options) {
    const o = opts(mapping, options), recs = readRecords(asBytes(packBytes)), half = Math.floor(recs.length / 2);
    const ts = loadSkel(o.files, mapping.target_skeleton, 'target_skeleton');
    const dummy = bones => { const r = new Uint8Array(16); put32(r, 0, bones); put32(r, 4, 1); put32(r, 8, 4); r.set([0x30, 0x1a, 0x00, 0x00], 12); return r; };
    const out = new Array(recs.length), bodies = {}, report = [];
    for (let i = 0; i < half; i++) {
      if (isPlaceholder(recs[i])) { out[i] = dummy(ts.length + 1); continue; }
      bodies[i] = retargetRaw(mapping, recs[i], o); out[i] = encodeRaw(bodies[i]);
      report.push(i.toString(16) + ': ' + bodies[i].frames.length + ' frames');
    }
    for (let i = half; i < recs.length; i++) {
      const w = (bodies[i - half] !== undefined && mapping.target_weapon_bone !== undefined) ? retargetWeaponRaw(mapping, recs[i], bodies[i - half], o) : null;
      out[i] = w ? encodeRaw(w) : dummy(1);
    }
    let len = 4; out.forEach(r => { len += r.length; });
    const bytes = new Uint8Array(len); put32(bytes, 0, out.length); let p = 4;
    out.forEach(r => { bytes.set(r, p); p += r.length; });
    return { bytes, report };
  }

  /* ------------------------------------------------------------------ help for the page */

  const HELP = {
    pair: 'A line "TARGET = SOURCE" gives a target bone the movement of a source bone. The target bone starts from its own reference pose and turns as the source bone turns away from the source\'s reference pose; this carries twist and small motions faithfully, but a bone that is shaped or placed differently on the two models keeps that difference.',
    aim: '"aim": after turning, the target bone is swung so it points exactly where the source bone points. The target takes up the source\'s actual stance (arms, legs, spine). The usual choice for limbs.',
    reach: '"reach": the target bone is swung to point from the model\'s origin toward where the source bone ENDS. For a bone that only places a shoulder or a hip, when the two skeletons hang their arms from different places.',
    unmapped: 'Bones not listed keep the angles they have in the target\'s reference pose and are carried rigidly by their parent (capes, hair), unless a "loose" line frees them.',
    reference: 'Reference poses (source_reference, target_reference): one frame of each model in which both stand the SAME way (usually frame 0 of each one\'s idle). Every movement is measured from these, so choose two that mean the same pose; the target\'s reference also supplies the angles of every unmapped bone and the scale (the ratio of the two root heights).',
    feet: 'Feet (source_feet, target_feet): the foot and toe bones of each skeleton. Each frame the target is moved up or down so its lowest foot is as high above its reference as the source\'s lowest foot is above the source\'s reference. Leave both empty to keep the scaled root height only (feet may float or sink).',
    scale: 'scale: the factor on the model\'s position (root movement). Left out, it is the target\'s root height over the source\'s in the reference poses.',
    weapon: 'Weapon (source_weapon_reference, target_weapon_reference, target_weapon_bone): the weapon track of each body animation. The target\'s weapon turns as the source\'s turns, starting from how the target holds its own weapon in its reference (its weapon track of the idle, frame 0), and stays gripped at the end of target_weapon_bone (the hand). Without target_weapon_bone, a pack gets empty weapon tracks (the weapon is hidden).',
    loose: 'loose = BONES [hang H] [stiffness S] [damping D] [gravity G] [limit DEG] (advanced): follow-through for unmapped bones (hair, cape). hang 0-1: how far a bone ignores its parent\'s turning and keeps hanging as in the reference pose (0 = carried rigidly). stiffness 0-1: how strongly it is pulled back to the rigid pose each frame (1 = rigid; default 0.3). damping 0-1: how much of its speed it keeps (default 0.6). gravity: how far its tip sinks per frame in model units (default 4). limit: the most it may bend away from the rigid pose, in degrees (default 40). Loose bones settle back to rigid over the last four frames so the animation ends as the next begins.',
    collide: 'collide = BONE RX RY [Y_OFFSET] [BELOW] [ABOVE] (advanced): an elliptical tube round a target bone (the torso) that loose bones are kept out of: RX across, RY front to back, its centre moved Y_OFFSET forward, running BELOW past the bone\'s start and ABOVE past its end.',
    style: 'Option style (advanced): "pose" (the default) uses aim and reach and places the model at the source\'s position times the scale. "offset" ignores aim and reach (every pair only follows the source\'s turning) and moves the model by the source\'s movement from its reference, scaled, starting from the target\'s reference position.',
    follow: 'Option follow: on (default) uses the "loose" lines; off holds every unmapped bone rigid (the tools\' --rigid).',
    key: 'Option key (advanced): the precision the angles are stored with: 0 = full (1/4096 of a turn), 2 = steps of 4, 4 = steps of 16. Left out, the source animation\'s own key is kept. A smaller key makes a bigger file.'
  };

  const api = {
    // codec
    decode, encode, isPlaceholder, readRecords, decodeRaw, encodeRaw,
    // skeleton
    readSkeleton, pose, fromAngles, toAngles,
    // map
    parseMap, writeMap, LOOSE_DEFAULTS,
    // retarget
    retarget, retargetWeapon, retargetPack,
    HELP, _internal: { PYMATH, poseRaw, retargetRaw, retargetWeaponRaw, toPublic, toRaw }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKELETON_MASTER_RETARGET = api;
})(typeof self !== 'undefined' ? self : this);
