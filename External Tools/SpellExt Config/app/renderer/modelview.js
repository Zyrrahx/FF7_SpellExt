/* SpellExt Config: the battle model preview's renderer (model preview, stage 3). One file, the same bytes in the Python
   tool's page (sxcfg/static) and the desktop app's (app/renderer), as enpage.js. A small software rasteriser on a 2D
   canvas: no library, no WebGL, nothing the page's Content-Security-Policy does not already allow.

   Its input is the description sxcfg/battlemodel.py and app/core/battlemodel.js make of a model (the parts ALREADY
   POSED in frame 0 of the first animation: `xyz` as float32 bit patterns in hex; `uv` likewise; `vcol` and `pcol` as
   hex RGBA; `tris` as [a, b, c, ua, ub, uc, texture, polygon, group]; `textures` with width, height and the RGBA
   pixels, `_rgba` as bytes or `rgba_base64` as text). MV.prepare checks and decodes it once; MV.render draws it into an
   RGBA buffer (a pure function: the same numbers give the same bytes in Node, Firefox and Electron, since it uses no
   sine, cosine, exponent or logarithm of the engine's, only + - * /, Math.sqrt, Math.floor, Math.ceil, Math.abs,
   Math.min and Math.max, all exact in every engine, and a quarter-wave sine table made with + - * / as battlemodel's); MV.attach puts it on a canvas (drag turns, the wheel zooms, a
   double click or the reset button goes back to the first view; the arrow keys, + and - and 0 when it has the focus).

   How it looks at the model, and why (stage 3's CHANGES.md):
   - the game's own view: the camera matrix of the game's look-at (FUN_005c68b7 with its up vector at 008fe110,
     (0, -4096, 0)): forward f = the focus minus the eye, X = f x up, Y = f x X, rows X, Y, f: a proper rotation, so
     nothing is mirrored; on the screen x grows with X and y (down) with Y, as the PlayStation's projection;
   - up is -y (every model of the game stands on y = 0 and reaches up into -y); the model's front is -z (a party
     member at facing 0 looks toward -z, at the enemies);
   - the first view is about the angle at which the opening camera of a normal battle sees an enemy (scene 0
     formation 1: about 37 degrees off its front, 15 degrees above);
   - textures: v = 0 is the first row of the texture; nearest texel, wrapped past 0..1, a texel of alpha 0 not drawn,
     the colour the texel times the vertex colour (FFNx's shader for a game texture: point sampling, the sampler's
     default wrap, `texture.a == 0` discarded, `color *= texture`); untextured groups their vertex colours; both
     sides of every triangle drawn (no culling); a mild light from the eye so that shapes read.

   The scene view (3D formation view, stage 1: MV.lookAt, MV.renderCamera, MV.project, MV.compose, MV.decodeTextures, the
   MV.scene* camera functions and MV.attachScene, at the end of the file): several posed models placed by position and facing in
   one mesh with party markers, shadow discs and a floor grid; the game's own camera (eye and focus of the formation's record 0,
   a vertical field of view of 2 atan(240/1024), near plane 250) or an orbit; drawn by the same rasteriser and budget, so the same
   bytes in every engine. The model preview's own calls and pixels are unchanged.

   Bounded work, whatever the input: the canvas side is at most 1024; the zoom at most 2.5 (the eye stays outside the
   model's bounding sphere); a model of more than 200,000 triangles or 600,000 vertices is drawn in part; a coordinate
   that is not a finite number or lies beyond 1,000,000 leaves its triangles out; triangles are clipped at the near
   plane and their pixels to the canvas; each triangle is filled row by row over the pixels it can cover (each row's
   span from its three edges, one pixel wider each side; the same per-pixel test as before, so the same pixels); a
   frame stops after 14 visits per pixel of the canvas, a visit being a pixel of a span or a row examined (review
   F3). Each limit met is said in the result's `notes`. */
"use strict";
(function (root) {
  const MV = {};
  MV.MAX_SIDE = 1024;
  MV.MAX_TRIANGLES = 200000;
  MV.MAX_VERTICES = 600000;
  MV.MAX_TEXTURES = 64;
  MV.MAX_TEXTURE_SIDE = 4096;
  MV.MAX_COORD = 1000000;
  MV.BUDGET = 14;                      // pixels and rows visited per pixel of the canvas (review F3: real models at most 11.0)
  MV.DEFAULT_VIEW = Object.freeze({ yaw: -416, pitch: 168, zoom: 1 });
  MV.BACKGROUND = Object.freeze([38, 43, 51, 255]);
  const PITCH_LIMIT = 960;             // a little short of straight above or below (1024): the look-at needs a side
  const ZOOM_MIN = 0.25;
  MV.ZOOM_MAX = 2.5;                   // the eye at 1.1 times the bounding radius: outside every real model (review F3)
  const ZOOM_MAX = MV.ZOOM_MAX;
  const TAN_HALF = 0.4;                // the view's half width: tan of about 22 degrees
  const FAR_PIXELS = 1e8;              // a projected corner past this is not drawn (only near the eye's plane)

  // ---- sines without the engine's transcendental functions (battlemodel's table, bit for bit) ----
  const PI = 3.141592653589793;
  const QUARTER = (function () {
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
  })();
  MV.QUARTER = QUARTER;
  const sin4096 = function (a) {
    a = a & 4095;
    const q = a >> 10;
    const r = a & 1023;
    if (q === 0) return QUARTER[r];
    if (q === 1) return QUARTER[1024 - r];
    if (q === 2) return -QUARTER[r];
    return -QUARTER[1024 - r];
  };
  const cos4096 = (a) => sin4096(a + 1024);
  MV.sin4096 = sin4096;
  MV.cos4096 = cos4096;

  // ---- decoding the description ----
  const F32 = new DataView(new ArrayBuffer(4));
  const HEX8 = /^[0-9a-f]{8}$/;
  // a float32 bit pattern in hex (battlemodel's f32), or a plain number; anything else is NaN
  const num = function (x) {
    if (typeof x === "number") return x;
    if (typeof x !== "string" || !HEX8.test(x)) return NaN;
    F32.setUint32(0, parseInt(x, 16), true);
    return F32.getFloat32(0, true);
  };
  MV.num = num;
  const HEXBYTES = /^(?:[0-9a-f]{2})*$/;
  // RGBA bytes given as hex text, a Uint8Array (a Buffer) or an array of numbers, at most `limit` of them; null when
  // unreadable
  const bytes = function (x, limit) {
    if (typeof x === "string") {
      if (x.length > 2 * limit) x = x.substr(0, 2 * limit);
      if (!HEXBYTES.test(x)) return null;
      const out = new Uint8Array(x.length / 2);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(x.substr(2 * i, 2), 16);
      return out;
    }
    if (x instanceof Uint8Array || x instanceof Uint8ClampedArray) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (Array.isArray(x)) {
      const out = new Uint8Array(Math.min(x.length, limit));
      for (let i = 0; i < out.length; i++) out[i] = x[i] & 255;
      return out;
    }
    return null;
  };
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const B64_INDEX = (function () {
    const t = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i;
    return t;
  })();
  // standard base64 (with or without its = padding), at most `limit` bytes of it; null when it is not
  const base64 = function (s, limit) {
    if (typeof s !== "string") return null;
    if (limit !== undefined && s.length > 4 * Math.ceil(limit / 3) + 4) s = s.substr(0, 4 * Math.ceil(limit / 3));
    let n = s.length;
    while (n > 0 && s.charCodeAt(n - 1) === 61) n--;
    if (s.length - n > 2 || n % 4 === 1) return null;
    const out = new Uint8Array(Math.floor(n * 3 / 4));
    let acc = 0, bits = 0, o = 0;
    for (let i = 0; i < n; i++) {
      const c = s.charCodeAt(i);
      const v = c < 128 ? B64_INDEX[c] : -1;
      if (v < 0) return null;
      acc = ((acc << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (acc >> bits) & 255;
      }
    }
    return out;
  };
  MV.base64 = base64;
  const isIndex = (v, n) => typeof v === "number" && v >= 0 && v < n && Math.floor(v) === v;

  // The description checked and decoded once: flat arrays the renderer reads. Never throws on a description, however
  // wrong; what it leaves out is said in `notes`.
  MV.prepare = function (desc) {
    const notes = [];
    const d = desc !== null && typeof desc === "object" ? desc : {};
    // textures by their index in the skeleton
    const textures = new Map();
    const tlist = Array.isArray(d.textures) ? d.textures : [];
    if (tlist.length > MV.MAX_TEXTURES) notes.push("the model lists " + tlist.length + " textures: the first " + MV.MAX_TEXTURES + " are used");
    for (const t of tlist.slice(0, MV.MAX_TEXTURES)) {
      if (t === null || typeof t !== "object") continue;
      const w = t.width, h = t.height;
      if (!isIndex(t.index, 1 << 16) || !isIndex(w - 1, MV.MAX_TEXTURE_SIDE) || !isIndex(h - 1, MV.MAX_TEXTURE_SIDE)) {
        notes.push("a texture of " + w + " x " + h + " (index " + t.index + ") is not one the preview draws: its groups are drawn untextured");
        continue;
      }
      const px = t._rgba !== undefined ? bytes(t._rgba, 4 * w * h) : base64(t.rgba_base64, 4 * w * h);
      if (px === null || px.length < 4 * w * h) {
        notes.push("texture " + t.index + ": its pixels were not given whole: its groups are drawn untextured");
        continue;
      }
      if (!textures.has(t.index)) textures.set(t.index, { w, h, px });
    }
    // the parts, one after the other into flat arrays
    const parts = Array.isArray(d.parts) ? d.parts : [];
    let nv = 0, nuv = 0, nt = 0;
    const plan = [];
    for (const p of parts) {
      if (p === null || typeof p !== "object" || !Array.isArray(p.xyz) || !Array.isArray(p.tris)) continue;
      let v = Math.floor(p.xyz.length / 3);
      let u = Array.isArray(p.uv) ? Math.floor(p.uv.length / 2) : 0;
      let t = p.tris.length;
      if (nv + v > MV.MAX_VERTICES || nt + t > MV.MAX_TRIANGLES || nuv + u > MV.MAX_VERTICES) {
        notes.push("the model is larger than the preview draws (" + MV.MAX_TRIANGLES + " triangles, " + MV.MAX_VERTICES +
                   " vertices): drawn in part");
        break;
      }
      plan.push([p, nv, nuv, v, u, t]);
      nv += v; nuv += u; nt += t;
    }
    const pos = new Float64Array(3 * nv);
    const good = new Uint8Array(nv);
    const uv = new Float64Array(2 * nuv);
    const col = new Uint8Array(4 * nv);
    const tri = new Int32Array(7 * nt);
    let count = 0, far = 0, wrong = 0, untex = 0;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [p, v0, u0, v, u, t] of plan) {
      for (let i = 0; i < v; i++) {
        const x = num(p.xyz[3 * i]), y = num(p.xyz[3 * i + 1]), z = num(p.xyz[3 * i + 2]);
        const ok = x === x && y === y && z === z && Math.abs(x) <= MV.MAX_COORD && Math.abs(y) <= MV.MAX_COORD &&
                   Math.abs(z) <= MV.MAX_COORD;
        const k = v0 + i;
        pos[3 * k] = x; pos[3 * k + 1] = y; pos[3 * k + 2] = z;
        good[k] = ok ? 1 : 0;
        if (ok) {
          if (x < lo[0]) lo[0] = x; if (x > hi[0]) hi[0] = x;
          if (y < lo[1]) lo[1] = y; if (y > hi[1]) hi[1] = y;
          if (z < lo[2]) lo[2] = z; if (z > hi[2]) hi[2] = z;
        }
      }
      for (let i = 0; i < u; i++) {
        const a = num(p.uv[2 * i]), b = num(p.uv[2 * i + 1]);
        uv[2 * (u0 + i)] = a === a && Math.abs(a) <= MV.MAX_COORD ? a : 0;
        uv[2 * (u0 + i) + 1] = b === b && Math.abs(b) <= MV.MAX_COORD ? b : 0;
      }
      const vc = bytes(p.vcol, 4 * v) || new Uint8Array(0);
      const pc = bytes(p.pcol, 4 * MV.MAX_TRIANGLES) || new Uint8Array(0);
      for (const r of p.tris) {
        if (!Array.isArray(r) || r.length < 7 || !isIndex(r[0], v) || !isIndex(r[1], v) || !isIndex(r[2], v)) {
          wrong++;
          continue;
        }
        if (!good[v0 + r[0]] || !good[v0 + r[1]] || !good[v0 + r[2]]) {
          far++;
          continue;
        }
        let tex = -1;
        if (typeof r[6] === "number" && r[6] >= 0) {
          if (textures.has(r[6]) && isIndex(r[3], u) && isIndex(r[4], u) && isIndex(r[5], u)) tex = r[6];
          else untex++;
        }
        const o = 7 * count;
        tri[o] = v0 + r[0]; tri[o + 1] = v0 + r[1]; tri[o + 2] = v0 + r[2];
        tri[o + 3] = tex < 0 ? -1 : u0 + r[3]; tri[o + 4] = tex < 0 ? -1 : u0 + r[4]; tri[o + 5] = tex < 0 ? -1 : u0 + r[5];
        tri[o + 6] = tex;
        // the colour of each corner: its vertex colour, else the polygon's, else grey
        for (let c = 0; c < 3; c++) {
          const k = v0 + r[c];
          const src = 4 * r[c] + 3 < vc.length ? [vc, 4 * r[c]] : isIndex(r[7], pc.length / 4) ? [pc, 4 * r[7]] : null;
          col[4 * k] = src ? src[0][src[1]] : 128;
          col[4 * k + 1] = src ? src[0][src[1] + 1] : 128;
          col[4 * k + 2] = src ? src[0][src[1] + 2] : 128;
          col[4 * k + 3] = 255;
        }
        count++;
      }
    }
    if (far) notes.push(far + " triangle(s) have a corner that is not a number or lies beyond " + MV.MAX_COORD + ": left out");
    if (wrong) notes.push(wrong + " triangle(s) name corners the part does not have: left out");
    if (untex) notes.push(untex + " textured triangle(s) have no texture to draw with: drawn untextured");
    let centre = [0, 0, 0], radius = 1;
    if (lo[0] <= hi[0]) {
      centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
      const dx = hi[0] - lo[0], dy = hi[1] - lo[1], dz = hi[2] - lo[2];
      radius = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2);
    }
    if (!count) notes.push("nothing to draw");
    return { pos, good, uv, col, tri: tri.subarray(0, 7 * count), triangles: count, vertices: nv, textures, centre, radius,
             notes };
  };

  // Decodes each texture's `rgba_base64` ONCE into `_rgba` (a Uint8Array) and drops the string, in place (the same checks
  // as prepare's; a texture whose pixels cannot be read gets `_rgba = null`, which prepare then says in its notes).
  // prepare takes a Uint8Array `_rgba` as it is, without a copy, so every widget that prepares this model shares one copy of
  // its pixels (the scene view's page memory, D5). Returns the same object.
  MV.decodeTextures = function (portable) {
    if (portable === null || typeof portable !== "object" || !Array.isArray(portable.textures)) return portable;
    portable.textures.forEach((t, k) => {
      if (t === null || typeof t !== "object") return;
      if (k >= MV.MAX_TEXTURES) {
        delete t.rgba_base64;
        return;
      }
      if (t._rgba !== undefined || typeof t.rgba_base64 !== "string") return;
      const w = t.width, h = t.height;
      if (isIndex(t.index, 1 << 16) && isIndex(w - 1, MV.MAX_TEXTURE_SIDE) && isIndex(h - 1, MV.MAX_TEXTURE_SIDE)) {
        t._rgba = base64(t.rgba_base64, 4 * w * h);
      }
      delete t.rgba_base64;
    });
    return portable;
  };

  // ---- the view ----
  const clampInt = (v, lo, hi, dflt) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt);
  MV.side = (v) => clampInt(v, 1, MV.MAX_SIDE, 400);
  MV.clampView = function (view) {
    const v = view !== null && typeof view === "object" ? view : {};
    let yaw = ((clampInt(v.yaw, -1e9, 1e9, MV.DEFAULT_VIEW.yaw) % 4096) + 4096) % 4096;
    if (yaw > 2047) yaw -= 4096;
    const zoom = typeof v.zoom === "number" && isFinite(v.zoom) ? Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom)) : 1;
    return { yaw, pitch: clampInt(v.pitch, -PITCH_LIMIT, PITCH_LIMIT, MV.DEFAULT_VIEW.pitch), zoom };
  };

  // The camera: the eye on a sphere round the model's centre (yaw 0 = straight in front, the model's -z side; a
  // positive yaw toward +x; a positive pitch above, toward -y), looking at the centre through the game's look-at.
  const unit = (a) => {
    const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // The game's look-at (FUN_005c68b7) from an eye to a target: a camera {eye, X, Y, f, near, tanHalf}. `tanHalf` is the
  // tangent of the half field of view, on the shorter side of the canvas, or on its height when `vertical` is set (the
  // game's fov is vertical: the plan's D3). An eye on the target, or a look straight along the up vector, has no side to
  // build from: the side is then +x (a camera is always given, never NaN).
  const basis = function (eye, f, tanHalf, near, vertical) {
    let X = unit(cross(f, [0, -1, 0]));
    if (!(X[0] === X[0] && X[1] === X[1] && X[2] === X[2])) X = [1, 0, 0];
    let Y = unit(cross(f, X));
    if (!(Y[0] === Y[0] && Y[1] === Y[1] && Y[2] === Y[2])) Y = [0, 1, 0];
    return { eye, X, Y, f, near, tanHalf, vertical: vertical === true };
  };
  MV.lookAt = (eye, target, tanHalf, near, vertical) =>
    basis(eye, unit([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]), tanHalf, near, vertical);
  MV.camera = function (mesh, view) {
    const v = MV.clampView(view);
    const cp = cos4096(v.pitch), sp = sin4096(v.pitch);
    const dir = [sin4096(v.yaw) * cp, -sp, -cos4096(v.yaw) * cp];
    const dist = mesh.radius * (Math.sqrt(1 + 1 / (TAN_HALF * TAN_HALF)) * 1.02) / v.zoom;
    const eye = [mesh.centre[0] + dir[0] * dist, mesh.centre[1] + dir[1] * dist, mesh.centre[2] + dir[2] * dist];
    const c = basis(eye, unit([-dir[0], -dir[1], -dir[2]]), TAN_HALF, dist / 100, false);
    return { view: v, eye, X: c.X, Y: c.Y, f: c.f, dist, near: dist / 100, tanHalf: TAN_HALF, vertical: false };
  };
  // the focal length in canvas pixels of a camera on a canvas of w x h (the shorter side, or the height for a vertical fov)
  const focal = (cam, w, h) => (cam.vertical ? h : Math.min(w, h)) / 2 / cam.tanHalf;
  // a world point on the canvas: [x, y, depth] in canvas pixels, or null at or behind the near plane
  MV.project = function (cam, w, h, p) {
    const dx = p[0] - cam.eye[0], dy = p[1] - cam.eye[1], dz = p[2] - cam.eye[2];
    const z = cam.f[0] * dx + cam.f[1] * dy + cam.f[2] * dz;
    if (!(z >= cam.near) || !(z > 0)) return null;
    const F = focal(cam, w, h);
    return [w / 2 + F * (cam.X[0] * dx + cam.X[1] * dy + cam.X[2] * dz) / z, h / 2 + F * (cam.Y[0] * dx + cam.Y[1] * dy + cam.Y[2] * dz) / z, z];
  };

  // ---- the rasteriser ----
  // One frame of `mesh` (MV.prepare's) seen through `view`, into width x height RGBA. `scratch` (optional, an object
  // kept by the caller) lets a canvas reuse its buffers between frames; the bytes are the same without it.
  MV.render = function (mesh, view, width, height, scratch) {
    return MV.renderCamera(mesh, mesh && mesh.triangles ? MV.camera(mesh, view) : null, width, height, scratch);
  };
  // The same frame through a camera given (MV.lookAt's or MV.camera's), whatever the mesh's centre.
  MV.renderCamera = function (mesh, cam, width, height, scratch) {
    const w = MV.side(width), h = MV.side(height);
    const n = w * h;
    const s = scratch !== null && typeof scratch === "object" ? scratch : {};
    if (!s.rgba || s.rgba.length !== 4 * n) {
      s.rgba = new Uint8ClampedArray(4 * n);
      s.z = new Float64Array(n);
    }
    const rgba = s.rgba, zb = s.z;
    const bg = MV.BACKGROUND;
    for (let k = 0; k < n; k++) {
      rgba[4 * k] = bg[0]; rgba[4 * k + 1] = bg[1]; rgba[4 * k + 2] = bg[2]; rgba[4 * k + 3] = bg[3];
    }
    zb.fill(0);
    const out = { width: w, height: h, rgba, drawn: 0, near: 0, outside: 0, visited: 0, stopped: false, notes: [] };
    if (!mesh || !mesh.triangles || !cam) return out;
    const X = cam.X, Y = cam.Y, f = cam.f, eye = cam.eye, near = cam.near;
    // every vertex in the camera's frame, once
    const nv = mesh.vertices;
    if (!s.cam || s.cam.length < 3 * nv) s.cam = new Float64Array(3 * nv);
    const c = s.cam, pos = mesh.pos;
    for (let i = 0; i < nv; i++) {
      const dx = pos[3 * i] - eye[0], dy = pos[3 * i + 1] - eye[1], dz = pos[3 * i + 2] - eye[2];
      c[3 * i] = X[0] * dx + X[1] * dy + X[2] * dz;
      c[3 * i + 1] = Y[0] * dx + Y[1] * dy + Y[2] * dz;
      c[3 * i + 2] = f[0] * dx + f[1] * dy + f[2] * dz;
    }
    const F = focal(cam, w, h);
    const cx = w / 2, cy = h / 2;
    const budget = MV.BUDGET * n;
    let tests = 0;
    const tri = mesh.tri, uvs = mesh.uv, col = mesh.col;
    // a corner: camera x, y, z, then u, v, r, g, b
    const A = new Float64Array(8), B = new Float64Array(8), C = new Float64Array(8);
    const poly = [new Float64Array(8), new Float64Array(8), new Float64Array(8), new Float64Array(8)];
    const load = (dst, vi, ui) => {
      dst[0] = c[3 * vi]; dst[1] = c[3 * vi + 1]; dst[2] = c[3 * vi + 2];
      dst[3] = ui >= 0 ? uvs[2 * ui] : 0; dst[4] = ui >= 0 ? uvs[2 * ui + 1] : 0;
      dst[5] = col[4 * vi]; dst[6] = col[4 * vi + 1]; dst[7] = col[4 * vi + 2];
    };
    const cut = (dst, p, q) => {
      const t = (near - p[2]) / (q[2] - p[2]);
      for (let k = 0; k < 8; k++) dst[k] = p[k] + (q[k] - p[k]) * t;
      dst[2] = near;
    };
    // screen corners of the triangle being filled: x, y, 1/z, u/z, v/z, r/z, g/z, b/z
    const S0 = new Float64Array(8), S1 = new Float64Array(8), S2 = new Float64Array(8);
    const project = (dst, p) => {
      const iz = 1 / p[2];
      dst[0] = cx + F * p[0] * iz; dst[1] = cy + F * p[1] * iz; dst[2] = iz;
      for (let k = 3; k < 8; k++) dst[k] = p[k] * iz;
      return dst[0] === dst[0] && dst[1] === dst[1] && Math.abs(dst[0]) < FAR_PIXELS && Math.abs(dst[1]) < FAR_PIXELS;
    };
    const fill = (p0, p1, p2, shade, T) => {
      if (!project(S0, p0) || !project(S1, p1) || !project(S2, p2)) {
        out.outside++;
        return true;
      }
      let a = S0, b = S1, d = S2;
      let area = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
      if (!(area !== 0)) return true;
      if (area < 0) {
        const t = b; b = d; d = t;
        area = -area;
      }
      const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], d[0]))), maxx = Math.min(w - 1, Math.floor(Math.max(a[0], b[0], d[0])));
      const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], d[1]))), maxy = Math.min(h - 1, Math.floor(Math.max(a[1], b[1], d[1])));
      if (minx > maxx || miny > maxy) return true;
      // (review F3) row by row: the span of x where each edge's value can be 0 or more, one pixel wider each side,
      // inside the box; the per-pixel test below decides, so the pixels are those of the whole box
      const E = [[b, d], [d, a], [a, b]];
      for (let y = miny; y <= maxy; y++) {
        tests++;                                // (review F3, round 2) every row examined counts, even an empty one
        if (tests > budget) return false;
        const py = y + 0.5;
        let lo = minx, hi = maxx;
        for (let k = 0; k < 3 && lo <= hi; k++) {
          const p = E[k][0], q = E[k][1];
          const sl = q[1] - p[1], c = (q[0] - p[0]) * (py - p[1]);   // the edge's value is c - sl * (px - p[0])
          if (sl > 0) {
            const xi = Math.floor(p[0] + c / sl - 0.5) + 1;
            if (xi < hi) hi = xi;
          } else if (sl < 0) {
            const xi = Math.ceil(p[0] + c / sl - 0.5) - 1;
            if (xi > lo) lo = xi;
          } else if (c < 0) {
            hi = lo - 1;
          }
        }
        if (lo > hi) continue;
        tests += hi - lo + 1;
        if (tests > budget) return false;
        for (let x = lo; x <= hi; x++) {
          const px = x + 0.5;
          const e0 = (d[0] - b[0]) * (py - b[1]) - (d[1] - b[1]) * (px - b[0]);
          if (e0 < 0) continue;
          const e1 = (a[0] - d[0]) * (py - d[1]) - (a[1] - d[1]) * (px - d[0]);
          if (e1 < 0) continue;
          const e2 = (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]);
          if (e2 < 0) continue;
          const w0 = e0 / area, w1 = e1 / area, w2 = e2 / area;
          const iz = w0 * a[2] + w1 * b[2] + w2 * d[2];
          const k = y * w + x;
          if (!(iz >= zb[k])) continue;           // a tie goes to the later triangle, as FFNx's depth test (LEQUAL)
          let r = (w0 * a[5] + w1 * b[5] + w2 * d[5]) / iz;
          let g = (w0 * a[6] + w1 * b[6] + w2 * d[6]) / iz;
          let bl = (w0 * a[7] + w1 * b[7] + w2 * d[7]) / iz;
          if (T !== null) {
            const u = (w0 * a[3] + w1 * b[3] + w2 * d[3]) / iz;
            const v = (w0 * a[4] + w1 * b[4] + w2 * d[4]) / iz;
            let tx = Math.floor((u - Math.floor(u)) * T.w), ty = Math.floor((v - Math.floor(v)) * T.h);
            if (!(tx >= 0)) tx = 0; else if (tx >= T.w) tx = T.w - 1;
            if (!(ty >= 0)) ty = 0; else if (ty >= T.h) ty = T.h - 1;
            const o = 4 * (ty * T.w + tx);
            if (T.px[o + 3] === 0) continue;
            r = r * T.px[o] / 255; g = g * T.px[o + 1] / 255; bl = bl * T.px[o + 2] / 255;
          }
          zb[k] = iz;
          rgba[4 * k] = Math.floor(r * shade + 0.5);
          rgba[4 * k + 1] = Math.floor(g * shade + 0.5);
          rgba[4 * k + 2] = Math.floor(bl * shade + 0.5);
          rgba[4 * k + 3] = 255;
        }
      }
      return true;
    };
    for (let t = 0; t < mesh.triangles; t++) {
      const o = 7 * t;
      load(A, tri[o], tri[o + 3]); load(B, tri[o + 1], tri[o + 4]); load(C, tri[o + 2], tri[o + 5]);
      // the light from the eye: 0.6 to 1 by how squarely the triangle faces it (either side)
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (!(len > 0)) continue;
      const shade = 0.6 + 0.4 * Math.abs(nz) / len;
      const T = tri[o + 6] >= 0 ? mesh.textures.get(tri[o + 6]) : null;
      const ina = A[2] >= near, inb = B[2] >= near, inc = C[2] >= near;
      let ok = true;
      if (ina && inb && inc) {
        ok = fill(A, B, C, shade, T);
      } else if (ina || inb || inc) {
        // clipped at the near plane: the corners in front, and where each edge crosses it
        out.near++;
        let m = 0;
        const ring = [A, B, C];
        for (let k = 0; k < 3; k++) {
          const p = ring[k], q = ring[(k + 1) % 3];
          const pin = p[2] >= near, qin = q[2] >= near;
          if (pin) poly[m++].set(p);
          if (pin !== qin) cut(poly[m++], p, q);
        }
        ok = fill(poly[0], poly[1], poly[2], shade, T);
        if (ok && m === 4) ok = fill(poly[0], poly[2], poly[3], shade, T);
      } else {
        out.near++;
        continue;
      }
      if (!ok) {
        out.stopped = true;
        out.notes.push("drawing stopped at triangle " + t + " of " + mesh.triangles + ": the frame asked for more than " +
                       MV.BUDGET + " visited pixels per pixel");
        break;
      }
      out.drawn++;
    }
    out.visited = tests;
    return out;
  };

  // ---- the canvas ----
  // Draws `mesh` on `canvas` and turns it with the mouse. opts: reset (a button that goes back to the first view),
  // onDraw(result, milliseconds) after each frame. Returns { redraw, reset, view, set, detach }. A canvas of no width
  // or height is not drawn (and not resized): redraw() draws it once it has a size. A canvas wider or taller than
  // MAX_SIDE is drawn at MAX_SIDE.
  MV.attach = function (canvas, mesh, opts) {
    const o = opts || {};
    const ctx = canvas.getContext("2d");
    const scratch = {};
    let view = MV.clampView(MV.DEFAULT_VIEW);
    let pending = false;
    let frame = null;
    let gone = false;
    let drag = null;
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const draw = () => {
      pending = false;
      frame = null;
      if (gone || !(canvas.width >= 1) || !(canvas.height >= 1)) return;
      const t0 = now();
      const r = MV.render(mesh, view, canvas.width, canvas.height, scratch);
      if (canvas.width !== r.width) canvas.width = r.width;
      if (canvas.height !== r.height) canvas.height = r.height;
      const img = ctx.createImageData(r.width, r.height);
      img.data.set(r.rgba);
      ctx.putImageData(img, 0, 0);
      if (o.onDraw) o.onDraw(r, now() - t0);
    };
    const redraw = () => {
      if (pending || gone) return;
      pending = true;
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(draw);
      else draw();
    };
    const set = (v) => {
      view = MV.clampView(Object.assign({}, view, v));
      redraw();
    };
    const reset = () => set(MV.DEFAULT_VIEW);
    const down = (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      set({ yaw: view.yaw - 8 * dx, pitch: view.pitch + 8 * dy });
    };
    const up = (e) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    const wheel = (e) => {
      e.preventDefault();
      set({ zoom: e.deltaY < 0 ? view.zoom * 1.125 : view.zoom / 1.125 });
    };
    const key = (e) => {
      const k = e.key;
      if (k === "ArrowLeft") set({ yaw: view.yaw + 128 });
      else if (k === "ArrowRight") set({ yaw: view.yaw - 128 });
      else if (k === "ArrowUp") set({ pitch: view.pitch + 128 });
      else if (k === "ArrowDown") set({ pitch: view.pitch - 128 });
      else if (k === "+" || k === "=") set({ zoom: view.zoom * 1.125 });
      else if (k === "-") set({ zoom: view.zoom / 1.125 });
      else if (k === "0" || k === "Home") reset();
      else return;
      e.preventDefault();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("dblclick", reset);
    canvas.addEventListener("keydown", key);
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    if (o.reset) o.reset.addEventListener("click", reset);
    redraw();
    return {
      redraw,
      reset,
      set,
      view: () => Object.assign({}, view),
      detach() {
        gone = true;
        if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        frame = null;
        pending = false;
        canvas.removeEventListener("pointerdown", down);
        canvas.removeEventListener("pointermove", move);
        canvas.removeEventListener("pointerup", up);
        canvas.removeEventListener("pointercancel", up);
        canvas.removeEventListener("wheel", wheel);
        canvas.removeEventListener("dblclick", reset);
        canvas.removeEventListener("keydown", key);
        if (o.reset) o.reset.removeEventListener("click", reset);
      },
    };
  };

  // ================= the scene view (3D formation view, stage 1) =================
  // Several posed models placed in one scene: MV.compose gives a description MV.prepare accepts; MV.scene* are the pure
  // functions of the camera and its controls; MV.attachScene is the canvas widget. The game's own numbers are the integers
  // of the formation (up is -y, 4096 to a turn, a facing f looks along (-sin f, -cos f)); nothing here names a character.
  MV.SCENE_MAX_TRIANGLES = 60000;      // the composed mesh's caps (the plan's D4): 3.3 times the worst real formation
  MV.SCENE_MAX_VERTICES = 120000;
  MV.SCENE_RESERVE = 4000;             // kept of each cap for the markers, shadows, placeholders and floor
  MV.SCENE_MAX_MODELS = 3;
  MV.GAME_TAN = 240 / 1024;            // FUN_006619ee: fov = 2 atan(240 / (2 x 512)), about 26.4 deg, on the picture's HEIGHT (review T1 M1)
  MV.GAME_NEAR = 250;                  // the game's near plane
  MV.DROP_MIN = 50;                    // a drop line and a height label from |y| of 50
  MV.MAX_POS = 65535;                  // a position beyond this is not a formation's (they are s16)
  // the nearest the orbit may come: fit / 1.5, but fit x 1.25 for a scene of more than 10,000 triangles (the sweep of every game
  // formation, tests/scene_sweep.mjs: 990 of 996 hold the 14-visit budget at fit / 1.5 from every pivot, pitch and yaw tried;
  // the six heaviest, 15,363 and 18,395 triangles (912, 916, 920, 928, 932, 936), need fit x 1.15)
  MV.SCENE_HEAVY_TRIANGLES = 10000;
  MV.ASPECT = [480, 360];              // the canvas of the page: 4:3, the game's picture
  const TEX_STRIDE = 16;               // a model's texture i is the scene's texture slot * 16 + i
  const FLOOR_TEX = 3 * TEX_STRIDE;
  const FLOOR_PIXELS = (function () {
    const px = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0;
        const o = 4 * (16 * y + x);
        px[o] = edge ? 96 : 50; px[o + 1] = edge ? 108 : 56; px[o + 2] = edge ? 126 : 66; px[o + 3] = 255;
      }
    }
    return px;
  })();
  const HEX6 = [[150, 0], [75, 130], [-75, 130], [-150, 0], [-75, -130], [75, -130]];   // a hexagon of 300 across
  const GREY = [128, 128, 128];
  const finite = (v) => typeof v === "number" && v === v && v !== Infinity && v !== -Infinity;
  const posOk = (o) => o !== null && typeof o === "object" && finite(o.x) && finite(o.y) && finite(o.z) &&
                       Math.abs(o.x) <= MV.MAX_POS && Math.abs(o.y) <= MV.MAX_POS && Math.abs(o.z) <= MV.MAX_POS;
  const colourOf = function (c) {
    if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(finite)) return c.slice(0, 3).map((v) => Math.max(0, Math.min(255, Math.floor(v))));
    if (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c)) return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
    return [160, 160, 160];
  };
  // a growing part: vertices with a colour each, triangles over them
  const builder = function () {
    const b = { xyz: [], col: [], uv: [], tris: [], n: 0 };
    b.v = (x, y, z, c, u, v) => {
      b.xyz.push(x, y, z);
      b.col.push(c[0], c[1], c[2], 255);
      if (u !== undefined) b.uv.push(u, v);
      return b.n++;
    };
    b.t = (a, c2, d, tex) => b.tris.push(tex === undefined ? [a, c2, d, -1, -1, -1, -1, 0, 0] : [a, c2, d, a, c2, d, tex, 0, 0]);
    b.part = () => ({ xyz: b.xyz, uv: b.uv, vcol: new Uint8Array(b.col), tris: b.tris });
    return b;
  };
  const disc = function (b, x, y, z, r, c) {            // a 16-gon on the floor
    const o = b.v(x, y, z, c);
    for (let k = 0; k < 16; k++) b.v(x + r * cos4096(256 * k), y, z + r * sin4096(256 * k), c);
    for (let k = 0; k < 16; k++) b.t(o, o + 1 + k, o + 1 + ((k + 1) % 16));
  };
  const ring = function (b, x, y, z, r0, r1, c) {
    const o = b.n;
    for (let k = 0; k < 16; k++) {
      b.v(x + r0 * cos4096(256 * k), y, z + r0 * sin4096(256 * k), c);
      b.v(x + r1 * cos4096(256 * k), y, z + r1 * sin4096(256 * k), c);
    }
    for (let k = 0; k < 16; k++) {
      const a = o + 2 * k, d = o + 2 * ((k + 1) % 16);
      b.t(a, a + 1, d);
      b.t(a + 1, d + 1, d);
    }
  };
  const fitDistance = (radius) => radius * (Math.sqrt(1 + 1 / (MV.GAME_TAN * MV.GAME_TAN)) * 1.02);

  // What one model of the spec costs and where it reaches: its parts' counts, the world-less coordinates decoded once, the
  // lowest and highest y and the footprint on the floor. Never throws; `why` says what keeps it from being drawn.
  const modelInfo = function (m) {
    const info = { why: null, parts: [], triangles: 0, vertices: 0, top: 0, foot: 0, textures: [] };
    if (m === null || typeof m !== "object" || !Array.isArray(m.parts)) {
      info.why = "its model was not given";
      return info;
    }
    for (const p of m.parts) {
      if (p === null || typeof p !== "object" || !Array.isArray(p.xyz) || !Array.isArray(p.tris)) continue;
      const v = Math.floor(p.xyz.length / 3);
      info.parts.push({ p, v });
      info.triangles += p.tris.length;
      info.vertices += v;
    }
    if (!info.triangles) info.why = "its model has nothing to draw";
    return info;
  };
  const decodeInfo = function (info) {      // the coordinates, once, when the model is admitted
    let loY = 0, loX = Infinity, hiX = -Infinity, loZ = Infinity, hiZ = -Infinity;
    for (const q of info.parts) {
      const c = new Float64Array(3 * q.v);
      for (let i = 0; i < 3 * q.v; i++) c[i] = num(q.p.xyz[i]);
      q.c = c;
      for (let i = 0; i < q.v; i++) {
        const x = c[3 * i], y = c[3 * i + 1], z = c[3 * i + 2];
        if (!(Math.abs(x) <= MV.MAX_COORD && Math.abs(y) <= MV.MAX_COORD && Math.abs(z) <= MV.MAX_COORD)) continue;
        if (y < loY) loY = y;
        if (x < loX) loX = x; if (x > hiX) hiX = x;
        if (z < loZ) loZ = z; if (z > hiZ) hiZ = z;
      }
    }
    info.top = Math.max(-4000, loY);
    info.foot = hiX >= loX ? Math.max(200, Math.min(750, Math.max(hiX - loX, hiZ - loZ) / 2)) : 300;
  };

  // MV.compose(spec) -> { parts, textures, meta }, pure. spec = { models: [portable], rows: [{ model, x, y, z, facing,
  // label, why }], party: [{ x, y, z, facing, slot, colour, ring }], camera: { x, y, z, fx, fy, fz } | null, floor }.
  // `model` is an index into `models` or -1 (then `why` says why the row is a placeholder). The order in the mesh is
  // enemies, placeholders, markers, shadows, floor, so a frame the budget cuts loses the floor first. Everything left out
  // or drawn in place of something is a line in meta.notes.
  MV.compose = function (spec) {
    const sp = spec !== null && typeof spec === "object" ? spec : {};
    const notes = [];
    const models = Array.isArray(sp.models) ? sp.models.slice(0, MV.SCENE_MAX_MODELS) : [];
    if (Array.isArray(sp.models) && sp.models.length > MV.SCENE_MAX_MODELS) {
      notes.push("the scene lists " + sp.models.length + " models: the first " + MV.SCENE_MAX_MODELS + " are used");
    }
    const infos = models.map(modelInfo);
    const capT = MV.SCENE_MAX_TRIANGLES - MV.SCENE_RESERVE, capV = MV.SCENE_MAX_VERTICES - MV.SCENE_RESERVE;
    let usedT = 0, usedV = 0, cut = [];
    const enemy = [], holder = builder(), marker = builder(), shadow = builder();
    const used = new Set();
    const anchors = [];
    const spots = [];                    // every position that counts for the fighters' box
    let rowsDrawn = 0, holders = 0, badTex = 0;
    const rows = Array.isArray(sp.rows) ? sp.rows : [];
    rows.forEach((r, i) => {
      const label = r !== null && typeof r === "object" && r.label !== undefined && r.label !== null ? String(r.label) : String(i + 1);
      if (r === null || typeof r !== "object" || !posOk(r) || !finite(r.facing === undefined ? 0 : r.facing)) {
        notes.push("row " + label + ": its position is not a number or lies beyond " + MV.MAX_POS + ": not drawn");
        return;
      }
      const f = Math.floor(r.facing === undefined ? 0 : r.facing) & 4095;
      spots.push([r.x, r.y, r.z]);
      let why = null, info = null;
      const mi = r.model;
      if (typeof mi === "number" && mi >= 0 && mi < infos.length && Math.floor(mi) === mi) {
        info = infos[mi];
        why = info.why;
        if (why === null && (usedT + info.triangles > capT || usedV + info.vertices > capV)) {
          why = "the scene's budget of " + MV.SCENE_MAX_TRIANGLES + " triangles and " + MV.SCENE_MAX_VERTICES + " vertices is used up";
          cut.push(label);
        }
      } else {
        why = typeof r.why === "string" && r.why ? r.why : "no model was given for it";
      }
      let top = -1000;
      if (why === null) {
        if (!info.decoded) { decodeInfo(info); info.decoded = true; }
        const s = sin4096(f), c = cos4096(f), base = TEX_STRIDE * mi;
        used.add(mi);
        usedT += info.triangles; usedV += info.vertices;
        for (const q of info.parts) {
          const xyz = new Array(3 * q.v);
          for (let k = 0; k < q.v; k++) {
            const px = q.c[3 * k], py = q.c[3 * k + 1], pz = q.c[3 * k + 2];
            xyz[3 * k] = r.x + px * c + pz * s;
            xyz[3 * k + 1] = r.y + py;
            xyz[3 * k + 2] = r.z - px * s + pz * c;
          }
          const tris = q.p.tris.map((t) => {
            if (!Array.isArray(t) || typeof t[6] !== "number" || !(t[6] >= 0)) return t;
            if (t[6] < TEX_STRIDE && Math.floor(t[6]) === t[6]) {
              const u = t.slice();
              u[6] = base + t[6];
              return u;
            }
            badTex++;
            const u = t.slice();
            u[6] = -1;
            return u;
          });
          enemy.push({ xyz, uv: q.p.uv, vcol: q.p.vcol, pcol: q.p.pcol, tris });
        }
        rowsDrawn++;
        top = info.top;
        shadow.disc = shadow.disc || [];
        shadow.disc.push([r.x, r.z, info.foot]);
      } else {
        notes.push("row " + label + ": drawn as a placeholder box: " + why);
        const x0 = r.x - 300, x1 = r.x + 300, z0 = r.z - 300, z1 = r.z + 300, y0 = r.y, y1 = r.y - 1000;
        const o = holder.n;
        for (const [x, y, z] of [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]) holder.v(x, y, z, GREY);
        for (const [a, b, c] of [[0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7], [4, 5, 6], [4, 6, 7]]) holder.t(o + a, o + b, o + c);
        holders++;
        shadow.disc = shadow.disc || [];
        shadow.disc.push([r.x, r.z, 300]);
      }
      const drop = Math.abs(r.y) >= MV.DROP_MIN;
      anchors.push({ kind: "enemy", label, x: r.x, y: r.y, z: r.z, top: r.y + top - 120, drop,
                     text: !drop ? null : r.y < 0 ? "y " + r.y + " (" + (-r.y) + " up)" : "y " + r.y + " (" + r.y + " BELOW the floor)", placeholder: why !== null });
    });
    if (cut.length) notes.push("rows " + cut.join(", ") + " were cut by the budget (the composed scene stays within " + MV.SCENE_MAX_TRIANGLES + " triangles)");
    if (badTex) notes.push(badTex + " triangle(s) name a texture of 16 or more in their model: drawn untextured");
    // the party's markers
    const party = Array.isArray(sp.party) ? sp.party : [];
    party.forEach((m, i) => {
      if (m === null || typeof m !== "object" || !posOk(m) || !finite(m.facing === undefined ? 0 : m.facing)) {
        notes.push("party member " + (i + 1) + ": its position is not a number or lies beyond " + MV.MAX_POS + ": not drawn");
        return;
      }
      const slot = finite(m.slot) ? Math.floor(m.slot) : i;
      const f = Math.floor(m.facing === undefined ? 0 : m.facing) & 4095;
      const col = colourOf(m.colour);
      spots.push([m.x, m.y, m.z]);
      const o = marker.n;
      for (const [hx, hz] of HEX6) marker.v(m.x + hx, m.y, m.z + hz, col);
      for (const [hx, hz] of HEX6) marker.v(m.x + hx, m.y - 1000, m.z + hz, col);
      for (let k = 0; k < 6; k++) {
        const k2 = (k + 1) % 6;
        marker.t(o + k, o + k2, o + 6 + k2);
        marker.t(o + k, o + 6 + k2, o + 6 + k);
      }
      for (let k = 1; k < 5; k++) marker.t(o + 6, o + 6 + k, o + 7 + k);
      // the pointer on top, pointing along the facing (-sin f, -cos f)
      const dx = -sin4096(f), dz = -cos4096(f), px = -dz, pz = dx, y = m.y - 1000;
      const w = marker.n;
      marker.v(m.x + 400 * dx, y, m.z + 400 * dz, col);
      marker.v(m.x - 100 * dx + 150 * px, y, m.z - 100 * dz + 150 * pz, col);
      marker.v(m.x - 100 * dx - 150 * px, y, m.z - 100 * dz - 150 * pz, col);
      marker.v(m.x, y - 250, m.z, col);
      marker.t(w, w + 1, w + 3); marker.t(w, w + 3, w + 2); marker.t(w + 1, w + 2, w + 3);
      if (m.ring !== null && typeof m.ring === "object" && posOk(m.ring)) ring(marker, m.ring.x, m.ring.y - 3, m.ring.z, 250, 320, col);
      shadow.disc = shadow.disc || [];
      shadow.disc.push([m.x, m.z, 300]);
      anchors.push({ kind: "party", label: String(slot), x: m.x, y: m.y, z: m.z, top: m.y - 1300, drop: false, text: null, placeholder: false });
    });
    for (const d of shadow.disc || []) disc(shadow, d[0], -4, d[1], d[2], [20, 22, 28]);
    // the fighters' box, from POSITIONS only (a model's own coordinates never grow it)
    let lo = [Infinity, 0, Infinity], hi = [-Infinity, 0, -Infinity], ymin = Infinity, ymax = 0;
    for (const s of spots) {
      if (s[0] < lo[0]) lo[0] = s[0]; if (s[0] > hi[0]) hi[0] = s[0];
      if (s[2] < lo[2]) lo[2] = s[2]; if (s[2] > hi[2]) hi[2] = s[2];
    }
    for (const a of anchors) if (a.kind === "enemy") { if (a.y < ymin) ymin = a.y; if (a.y > ymax) ymax = a.y; }
    if (!(lo[0] <= hi[0])) { lo = [-1000, 0, -1000]; hi = [1000, 0, 1000]; }
    lo[1] = (ymin === Infinity ? 0 : ymin) - 1000;
    hi[1] = ymax;
    const dxb = hi[0] - lo[0], dyb = hi[1] - lo[1], dzb = hi[2] - lo[2];
    const radius = Math.max(1, Math.sqrt(dxb * dxb + dyb * dyb + dzb * dzb) / 2);
    const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    const pivot = [centre[0], Math.min(0, centre[1]), centre[2]];
    // the floor: every fighter plus 1500, on whole tiles of 1000, within +-20000
    const parts = enemy.concat(holder.n ? [holder.part()] : [], marker.n ? [marker.part()] : [], shadow.n ? [shadow.part()] : []);
    let floor = null;
    if (sp.floor !== false) {
      const cl = (v) => Math.max(-20000, Math.min(20000, v));
      const x0 = cl(Math.floor((lo[0] - 1500) / 1000) * 1000), x1 = cl(Math.ceil((hi[0] + 1500) / 1000) * 1000);
      const z0 = cl(Math.floor((lo[2] - 1500) / 1000) * 1000), z1 = cl(Math.ceil((hi[2] + 1500) / 1000) * 1000);
      const fb = builder();
      const W = [255, 255, 255];
      fb.v(x0, 0, z0, W, x0 / 1000, z0 / 1000); fb.v(x1, 0, z0, W, x1 / 1000, z0 / 1000);
      fb.v(x1, 0, z1, W, x1 / 1000, z1 / 1000); fb.v(x0, 0, z1, W, x0 / 1000, z1 / 1000);
      fb.t(0, 1, 2, FLOOR_TEX); fb.t(0, 2, 3, FLOOR_TEX);
      parts.push(fb.part());
      floor = [x0, z0, x1, z1];
    }
    // the textures of the models drawn, their indices moved to the model's own range, the pixels shared
    const textures = [];
    for (const mi of used) {
      const list = Array.isArray(models[mi].textures) ? models[mi].textures : [];
      for (const t of list) {
        if (t === null || typeof t !== "object" || !(t.index >= 0 && t.index < TEX_STRIDE && Math.floor(t.index) === t.index)) continue;
        const e = { index: TEX_STRIDE * mi + t.index, width: t.width, height: t.height };
        if (t._rgba !== undefined) e._rgba = t._rgba; else e.rgba_base64 = t.rgba_base64;
        textures.push(e);
      }
    }
    if (floor) textures.push({ index: FLOOR_TEX, width: 16, height: 16, _rgba: FLOOR_PIXELS });
    let tc = 0, vc = 0;
    for (const p of parts) { tc += p.tris.length; vc += p.xyz.length / 3; }
    // the game's camera: record 0 as the layout gives it
    let camera = null;
    const cm = sp.camera;
    if (cm !== null && cm !== undefined && typeof cm === "object") {
      const ok = ["x", "y", "z", "fx", "fy", "fz"].every((k) => finite(cm[k]) && Math.abs(cm[k]) <= MV.MAX_POS);
      if (ok && (cm.x !== cm.fx || cm.y !== cm.fy || cm.z !== cm.fz)) camera = { eye: [cm.x, cm.y, cm.z], focus: [cm.fx, cm.fy, cm.fz] };
      else notes.push("the camera record is not usable: no game view");
    }
    const fit = fitDistance(radius);
    const heavy = tc > MV.SCENE_HEAVY_TRIANGLES;
    if (heavy) notes.push("this scene has " + tc + " triangles: the view cannot come closer than the whole group (a closer frame would be cut by the drawing budget)");
    const meta = { box: { lo, hi }, centre, radius, pivot, fit, nearest: heavy ? fit * 1.25 : fit / 1.5, floor, camera, anchors, notes,
                   pan: { lo: [lo[0] - radius, lo[1] - radius, lo[2] - radius], hi: [hi[0] + radius, 0, hi[2] + radius] },
                   counts: { triangles: tc, vertices: vc, rows: rowsDrawn, placeholders: holders, party: marker.n ? party.length : 0 } };
    return { parts, textures, meta };
  };

  // ---- the scene's camera and controls, as pure functions of a state ----
  // A state is { mode: "game" | "orbit", preset, pivot, yaw, pitch, dist, range: [near, far], clamp: { lo, hi } }. In "game" the
  // camera is the record's (eye, focus). In "orbit" the eye is pivot + dist * (the direction of yaw and pitch), looking at the
  // pivot. The floor rule: pivot.y <= 0 and eye.y <= 0 always (up is -y), kept by raising the pitch.
  const PITCH_MIN = -128, PITCH_MAX = 960;
  const minPitch = function (pivotY, dist) {      // the smallest table angle that keeps the eye at or above the floor
    for (let p = PITCH_MIN; p < PITCH_MAX; p++) if (pivotY - dist * sin4096(p) <= 0) return p;
    return PITCH_MAX;
  };
  MV.minPitch = minPitch;
  // the table angles nearest to the direction (dx, dy, dz) from the pivot to the eye (no arc tangent: a search)
  MV.nearestAngles = function (dx, dy, dz) {
    let yaw = 0, bestc = -1;
    if (dx || dz) {
      for (let a = 0; a < 4096; a++) {
        const s = sin4096(a), c = cos4096(a);
        if (!(dx * s - dz * c > 0)) continue;
        const cr = Math.abs(dx * c + dz * s);
        if (bestc < 0 || cr < bestc) { bestc = cr; yaw = a; }
      }
    }
    const hz = Math.sqrt(dx * dx + dz * dz), up = -dy;
    let pitch = 0;
    bestc = -1;
    for (let p = PITCH_MIN; p <= PITCH_MAX; p++) {
      const s = sin4096(p), c = cos4096(p);
      if (!(c * hz + s * up > 0)) continue;
      const cr = Math.abs(c * up - s * hz);
      if (bestc < 0 || cr < bestc) { bestc = cr; pitch = p; }
    }
    return { yaw, pitch };
  };
  let THREE = null;
  const threeAngles = () => THREE || (THREE = MV.nearestAngles(10000 - 0, -5000 - 400, 6000 - 300));
  const growBox = (meta, pivot) => ({ lo: meta.pan.lo.map((v, i) => Math.min(v, pivot[i])), hi: meta.pan.hi.map((v, i) => Math.max(v, pivot[i])) });
  MV.sceneFix = function (meta, st) {
    const s = Object.assign({}, st, { pivot: st.pivot.slice() });
    if (s.mode === "game") return s;
    // (a value that is not a number, from a broken event, is the safe one: level, straight in front, the nearest, the middle)
    s.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, finite(s.pitch) ? Math.floor(s.pitch) : 0));
    s.yaw = finite(s.yaw) ? ((Math.floor(s.yaw) % 4096) + 4096) % 4096 : 0;
    s.dist = Math.max(s.range[0], Math.min(s.range[1], finite(s.dist) ? s.dist : s.range[0]));
    for (let i = 0; i < 3; i++) {
      const lo = s.clamp.lo[i], hi = s.clamp.hi[i];
      s.pivot[i] = Math.max(lo, Math.min(hi, finite(s.pivot[i]) ? s.pivot[i] : (lo + hi) / 2));
    }
    if (s.pivot[1] > 0) s.pivot[1] = 0;
    s.pitch = Math.max(s.pitch, minPitch(s.pivot[1], s.dist));
    return s;
  };
  // a preset: "game" (the record 0 view, when the scene has one) or "three" (the 3/4 view round the fighters)
  MV.sceneStart = function (meta, preset) {
    if (preset === "game" && meta.camera) return { mode: "game", preset: "game" };
    const a = threeAngles();
    return MV.sceneFix(meta, { mode: "orbit", preset: "three", pivot: meta.pivot.slice(), yaw: a.yaw, pitch: a.pitch, dist: meta.fit,
                               range: [meta.nearest, meta.fit * 4], clamp: growBox(meta, meta.pivot) });
  };
  MV.sceneCamera = function (meta, st) {
    if (st.mode === "game") return MV.lookAt(meta.camera.eye, meta.camera.focus, MV.GAME_TAN, MV.GAME_NEAR, true);
    const cp = cos4096(st.pitch), sp = sin4096(st.pitch);
    const eye = [st.pivot[0] + sin4096(st.yaw) * cp * st.dist, st.pivot[1] - sp * st.dist, st.pivot[2] - cos4096(st.yaw) * cp * st.dist];
    return MV.lookAt(eye, st.pivot, MV.GAME_TAN, st.dist / 100, true);
  };
  // out of the game's view with no visible jump: the pivot slides along the line of sight to the floor when the focus is
  // under it, the distance is the record's own, the angles the nearest table angles; the zoom range takes in the record's
  MV.sceneLeave = function (meta, st) {
    if (st.mode !== "game") return st;
    const E = meta.camera.eye, T = meta.camera.focus;
    let pivot;
    if (T[1] > 0 && E[1] < 0) {
      const t = -E[1] / (T[1] - E[1]);
      pivot = [E[0] + t * (T[0] - E[0]), 0, E[2] + t * (T[2] - E[2])];
    } else pivot = [T[0], Math.min(0, T[1]), T[2]];
    const dx = E[0] - pivot[0], dy = E[1] - pivot[1], dz = E[2] - pivot[2];
    const d0 = Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const a = MV.nearestAngles(dx, dy, dz);
    return MV.sceneFix(meta, { mode: "orbit", preset: "game", pivot, yaw: a.yaw, pitch: a.pitch, dist: d0,
                               range: [Math.min(meta.nearest, d0), Math.max(meta.fit * 4, d0)], clamp: growBox(meta, pivot) });
  };
  MV.sceneTurn = (meta, st, dyaw, dpitch) => {
    const s = MV.sceneLeave(meta, st);
    return MV.sceneFix(meta, Object.assign({}, s, { yaw: s.yaw + dyaw, pitch: s.pitch + dpitch }));
  };
  MV.sceneZoom = (meta, st, factor) => {
    const s = MV.sceneLeave(meta, st);
    return MV.sceneFix(meta, Object.assign({}, s, { dist: s.dist * factor }));
  };
  // pan by (dx, dy) canvas pixels in the view plane: the scene follows the pointer
  MV.scenePan = function (meta, st, dx, dy, w, h) {
    const s = MV.sceneLeave(meta, st);
    const cam = MV.sceneCamera(meta, s);
    const k = s.dist / focal(cam, w, h);
    const p = [0, 1, 2].map((i) => s.pivot[i] - (cam.X[i] * dx + cam.Y[i] * dy) * k);
    return MV.sceneFix(meta, Object.assign({}, s, { pivot: p }));
  };

  // ---- the overlay: drop lines, row numbers and height words, drawn on the canvas AFTER the frame (not in the raster) ----
  MV.drawOverlay = function (ctx, cam, w, h, meta) {
    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "middle";
    for (const a of meta.anchors) {
      const o = MV.project(cam, w, h, [a.x, a.y, a.z]);
      const t = MV.project(cam, w, h, [a.x, a.top, a.z]);
      if (a.drop) {
        const g = MV.project(cam, w, h, [a.x, 0, a.z]);
        if (o && g) {
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          if (ctx.setLineDash) ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(g[0], g[1]); ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        }
      }
      if (t) {
        ctx.fillStyle = a.kind === "party" ? "#ffe9a8" : "#ffffff";
        ctx.fillText(a.label, t[0] - 3, t[1]);
        if (a.text) {
          ctx.fillStyle = "#ffd36b";
          ctx.fillText(a.text, t[0] + 12, t[1]);
        }
      }
    }
    ctx.restore();
  };

  // ---- the widget ----
  // Draws a composed scene on `canvas` and moves it: drag (button 0) turns about the pivot, shift-drag or right-drag pans,
  // the wheel zooms only while the canvas has the focus (so the page still scrolls over an unfocused one), double click and
  // the Reset button return to the default preset, the arrow keys, + and - and 0 as the model's, Shift+arrows pan.
  // opts: preset ("game" or "three", the default and Reset's), reset (a button), onDraw(result, ms), overlay (false, or
  // a function(ctx, cam, w, h, meta)), defer (draw the first frame when show() is called or the canvas is seen, where an
  // IntersectionObserver exists). Returns { redraw, show, reset, preset, state, camera, setMesh, detach, focused }.
  MV.attachScene = function (canvas, mesh, meta, opts) {
    const o = opts || {};
    const ctx = canvas.getContext("2d");
    const scratch = {};
    const first = o.preset === "three" ? "three" : "game";
    let st = MV.sceneStart(meta, first);
    let pending = false, frame = null, gone = false, drag = null, focused = false, started = false;
    let observer = null;
    const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
    const size = () => [MV.side(canvas.width), MV.side(canvas.height)];
    const draw = () => {
      pending = false;
      frame = null;
      if (gone || !started || !mesh || !(canvas.width >= 1) || !(canvas.height >= 1)) return;
      const t0 = now();
      const cam = MV.sceneCamera(meta, st);
      const r = MV.renderCamera(mesh, cam, canvas.width, canvas.height, scratch);
      if (canvas.width !== r.width) canvas.width = r.width;
      if (canvas.height !== r.height) canvas.height = r.height;
      const img = ctx.createImageData(r.width, r.height);
      img.data.set(r.rgba);
      ctx.putImageData(img, 0, 0);
      if (o.overlay !== false) (typeof o.overlay === "function" ? o.overlay : (c, k, w, h, m) => MV.drawOverlay(c, k, w, h, m))(ctx, cam, r.width, r.height, meta);
      if (o.onDraw) o.onDraw(r, now() - t0);
    };
    const redraw = () => {
      if (pending || gone || !started) return;
      pending = true;
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(draw);
      else draw();
    };
    const set = (s) => { st = s; redraw(); };
    const reset = () => set(MV.sceneStart(meta, first));
    const show = () => {
      if (started || gone) return;
      started = true;
      if (observer) { observer.disconnect(); observer = null; }
      redraw();
    };
    const down = (e) => {
      const pan = e.button === 2 || (e.button === 0 && e.shiftKey);
      if (e.button !== 0 && e.button !== 2) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, pan };
      if (canvas.focus) canvas.focus();
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      const [w, h] = size();
      // CSS scales the canvas: a pointer pixel is canvas.width / clientWidth canvas pixels
      const k = canvas.clientWidth > 0 ? canvas.width / canvas.clientWidth : 1;
      if (drag.pan) set(MV.scenePan(meta, st, dx * k, dy * k, w, h));
      else set(MV.sceneTurn(meta, st, -8 * dx, 8 * dy));
    };
    const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    const wheel = (e) => {
      if (!focused) return;
      e.preventDefault();
      set(MV.sceneZoom(meta, st, e.deltaY < 0 ? 1 / 1.125 : 1.125));
    };
    const key = (e) => {
      const k = e.key;
      const [w, h] = size();
      if (e.shiftKey && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
        set(MV.scenePan(meta, st, k === "ArrowLeft" ? 20 : k === "ArrowRight" ? -20 : 0, k === "ArrowUp" ? 20 : k === "ArrowDown" ? -20 : 0, w, h));
      } else if (k === "ArrowLeft") set(MV.sceneTurn(meta, st, 128, 0));
      else if (k === "ArrowRight") set(MV.sceneTurn(meta, st, -128, 0));
      else if (k === "ArrowUp") set(MV.sceneTurn(meta, st, 0, 128));
      else if (k === "ArrowDown") set(MV.sceneTurn(meta, st, 0, -128));
      else if (k === "+" || k === "=") set(MV.sceneZoom(meta, st, 1 / 1.125));
      else if (k === "-") set(MV.sceneZoom(meta, st, 1.125));
      else if (k === "0" || k === "Home") reset();
      else return;
      e.preventDefault();
    };
    const focus = () => { focused = true; };
    const blur = () => { focused = false; };
    const menu = (e) => e.preventDefault();
    const handlers = [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up], ["dblclick", reset],
                      ["keydown", key], ["focus", focus], ["blur", blur], ["contextmenu", menu]];
    for (const [n, f] of handlers) canvas.addEventListener(n, f);
    canvas.addEventListener("wheel", wheel, { passive: false });
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    if (o.reset) o.reset.addEventListener("click", reset);
    if (o.defer && typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver((list) => { if (list.some((x) => x.isIntersecting)) show(); });
      observer.observe(canvas);
    } else show();
    return {
      redraw, show, reset,
      preset: (name) => set(MV.sceneStart(meta, name)),
      state: () => Object.assign({}, st, { pivot: st.pivot ? st.pivot.slice() : null }),
      camera: () => MV.sceneCamera(meta, st),
      focused: () => focused,
      // a new mesh and meta (the party size changed), the view kept; a game view the new scene cannot give becomes the 3/4 view
      setMesh(m, mt) {
        mesh = m; meta = mt;
        if (st.mode === "game" && !meta.camera) st = MV.sceneStart(meta, "three");
        else if (st.mode === "orbit") st = MV.sceneFix(meta, Object.assign({}, st, { clamp: growBox(meta, st.pivot), range: [Math.min(st.range[0], meta.nearest), Math.max(st.range[1], meta.fit * 4)] }));
        redraw();
      },
      detach() {
        gone = true;
        if (observer) { observer.disconnect(); observer = null; }
        if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
        frame = null;
        pending = false;
        for (const [n, f] of handlers) canvas.removeEventListener(n, f);
        canvas.removeEventListener("wheel", wheel);
        if (o.reset) o.reset.removeEventListener("click", reset);
        mesh = null;
      },
    };
  };

  root.SpellExtModelView = MV;
})(typeof window !== "undefined" ? window : globalThis);
