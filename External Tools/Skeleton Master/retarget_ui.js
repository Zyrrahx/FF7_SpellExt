/* Skeleton Master, the Retarget tab (browser only). The retargeting itself is retarget_core.js; the file names, the map
   being edited and its checks are ui_logic.js (both tested under node). This file draws the two skeletons (three.js
   0.128), lets the user pair bones by clicking, previews and exports. Wrapped in a function: the Add slots script
   already owns the global names A, $, esc and msg. */
(function () {
  'use strict';
  const R = window.SKELETON_MASTER_RETARGET, L = window.SKELETON_MASTER_UI, A = window.SKELETON_MASTER;
  const $ = id => document.getElementById(id);
  const hx = L.hex2, base = L.baseName;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // a message box: text (or a list of lines) shown escaped
  function say(box, text, kind) {
    const lines = Array.isArray(text) ? text : (text ? [text] : []);
    $(box).innerHTML = lines.length ? '<div class="msg ' + (kind || 'ok') + '">' + lines.map(esc).join('<br>') + '</div>' : '';
  }
  function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); }); }
  function readText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); }); }
  function download(name, bytes) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  // the core's messages, in the page's words
  function plain(e) {
    const t = String(e && e.message ? e.message : e);
    let m = /the file "([^"]*)" (?:was not supplied|is not loaded)/.exec(t);
    if (m) return 'The map names the file "' + base(m[1]) + '", which is not loaded: load it in step 1 (in its own box or under "Other files").';
    m = /^the map has no (\w+)/.exec(t);
    if (m) return 'The map has no ' + m[1].replace(/_/g, ' ') + ': set it in the map editor (step 3).';
    return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
  }
  // a tiny element builder: h('button', {onclick, title, key}, 'text', child, ...)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el[k] = v;
      else if (k === 'key') el.dataset.key = v;
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    return el;
  }
  const later = fn => function () { const self = this; setTimeout(() => fn.call(self), 0); };   // after the focus has moved (Tab)

  /* ================================================================== state */
  const pool = L.makePool();
  let map = L.emptyMap(), mapFile = null;
  const opt = { style: 'pose', follow: true, key: null };
  let anims = [];                               // files to retarget: [{name, key, kind, bytes, items}]
  let selSrc = null, selTgt = null, hover = { side: null, bone: null }, pickMode = 'pair', newHow = 'aim', advOpen = false;
  const addRow = { t: '', s: '', how: 'aim' };
  let skel = { src: null, tgt: null };          // {sk, error}
  let refs = { src: null, tgt: null };          // {frame, pose, error}
  let fitSig = { src: '', tgt: '' };

  function recordsOf(name) {                    // a loaded animation file's records, cached on its pool entry
    const e = pool.entry(name); if (!e) return null;
    if (e.recs === undefined) { try { e.recs = L.animRecords(e.name, e.bytes); e.recErr = null; } catch (err) { e.recs = null; e.recErr = err.message; } }
    return e.recs;
  }

  /* ================================================================== 3D: a skeleton as sticks */
  const SC = 1 / 100;                           // game units -> scene units; up is -Y in the game, and Z is turned
  const V = p => new THREE.Vector3(p[0] * SC, -p[1] * SC, -p[2] * SC);   // with it (a turn, not a mirror)
  const COL = { idle: 0x5d6573, aim: 0x5ab0ff, follow: 0x7be07b, reach: 0xc9a0ff, pick: 0xffb347, hover: 0xffffff, loose: 0x4fd1c5, foot: 0xff6b9a, weapon: 0xffe066, joint: 0x9aa4b2 };
  const HAVE3D = typeof THREE !== 'undefined' && !!THREE.OrbitControls;

  function StickView(box, opts) {
    this.opts = opts || {}; this.box = box; this.bones = []; this.sig = ''; this.pending = false;
    box.innerHTML = '';
    this.cap = h('div', { class: 'cap' }); this.over = h('div', { class: 'over' }); this.tip = h('div', { class: 'tip' }); this.tip.hidden = true;
    this.ok = HAVE3D;
    if (this.ok) {
      try { this.renderer = new THREE.WebGLRenderer({ antialias: true }); }
      catch (e) { this.ok = false; this.failed = 'This browser could not start a 3D view (WebGL): ' + e.message; }
    }
    if (!this.ok) { box.append(this.cap, this.over, this.tip); this.failText = this.failed || 'The 3D view needs three.js, loaded from the internet (cdn.jsdelivr.net) the first time. Without it the rest of the page works: pair bones by number below.'; this.message(''); return; }
    const r = this.renderer; r.setPixelRatio(window.devicePixelRatio || 1); box.appendChild(r.domElement); box.append(this.cap, this.over, this.tip);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x101216);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.0));
    this.scene.add(new THREE.GridHelper(40, 40, 0x3a4250, 0x23272f));
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 1000); this.camera.position.set(8, 8, 16);
    this.orbit = new THREE.OrbitControls(this.camera, r.domElement); this.orbit.target.set(0, 5, 0); this.orbit.update();
    this.orbit.addEventListener('change', () => this.draw());
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.labels = new THREE.Group(); this.scene.add(this.labels);
    this.geoRod = new THREE.CylinderGeometry(1, 1, 1, 8); this.geoBall = new THREE.SphereGeometry(1, 12, 8);
    this.pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    // the weapon track: a ball where it is held and a line along its own Z axis
    this.wBall = new THREE.Mesh(this.geoBall, new THREE.MeshBasicMaterial({ color: COL.weapon })); this.wBall.scale.setScalar(0.09);
    this.wLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: COL.weapon }));
    this.wBall.visible = this.wLine.visible = false; this.scene.add(this.wBall, this.wLine);
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    const el = r.domElement; let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', e => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && this.opts.onPick) { const b = this.hit(e); if (b !== null) this.opts.onPick(b); }
      down = null;
    });
    el.addEventListener('pointermove', e => { if (e.buttons) return; const b = this.hit(e); if (b !== this.hovered) { this.hovered = b; if (this.opts.onHover) this.opts.onHover(b); } });
    el.addEventListener('pointerleave', () => { if (this.hovered !== null) { this.hovered = null; if (this.opts.onHover) this.opts.onHover(null); } });
    this.hovered = null;
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(box); else window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  StickView.prototype.message = function (text) {
    if (!this.ok) text = this.failText;                  // without 3D the view only ever says why
    this.over.textContent = text || ''; this.over.hidden = !text;
    if (this.ok) { this.group.visible = this.labels.visible = !text; if (text) this.weapon(null); this.draw(); }
  };
  StickView.prototype.caption = function (text) { this.cap.textContent = text || ''; };
  StickView.prototype.tipText = function (text) { this.tip.textContent = text || ''; this.tip.hidden = !text; };
  StickView.prototype.resize = function () {
    if (!this.ok) return;
    const w = this.box.clientWidth, ht = this.box.clientHeight; if (!w || !ht) return;
    this.renderer.setSize(w, ht); this.camera.aspect = w / ht; this.camera.updateProjectionMatrix(); this.draw();
  };
  StickView.prototype.draw = function () {
    if (!this.ok || this.pending) return; this.pending = true;
    requestAnimationFrame(() => { this.pending = false; this.renderer.render(this.scene, this.camera); });
  };
  StickView.prototype.hit = function (e) {
    const rc = this.renderer.domElement.getBoundingClientRect();
    this.mouse.set(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    if (!this.group.visible) return null;
    const hits = this.ray.intersectObjects(this.bones.flatMap(b => [b.ball, b.pick]));
    return hits.length ? hits[0].object.userData.bone : null;
  };
  // skeleton as [[parent, length]]: the sticks are made again only when it changes
  StickView.prototype.setSkeleton = function (pairs) {
    if (!this.ok) return;
    const sig = JSON.stringify(pairs); if (sig === this.sig) return; this.sig = sig;
    this.group.clear(); this.labels.clear(); this.bones = [];
    pairs.forEach((p, i) => {
      const rod = new THREE.Mesh(this.geoRod, new THREE.MeshLambertMaterial({ color: COL.idle }));
      const ball = new THREE.Mesh(this.geoBall, new THREE.MeshLambertMaterial({ color: COL.joint }));
      const pick = new THREE.Mesh(this.geoRod, this.pickMat);
      ball.userData.bone = pick.userData.bone = i;
      this.group.add(rod, ball, pick);
      this.bones.push({ rod, ball, pick, label: null, end: new THREE.Vector3() });
    });
  };
  const UP = HAVE3D ? new THREE.Vector3(0, 1, 0) : null;
  StickView.prototype.setPose = function (p) {           // p: retarget_core.pose()
    if (!this.ok) return;
    p.bones.forEach((b, i) => {
      const o = this.bones[i]; if (!o) return;
      const s = V(b.start), e = V(b.end), d = e.clone().sub(s), len = d.length();
      o.end.copy(e); o.ball.position.copy(e);
      if (len > 1e-6) {
        const mid = s.clone().add(e).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
        for (const m of [o.rod, o.pick]) { m.position.copy(mid); m.quaternion.copy(q); }
        o.rod.scale.set(0.035, len, 0.035); o.pick.scale.set(0.15, len, 0.15); o.rod.visible = true;
      } else { o.rod.visible = false; o.pick.scale.set(1e-4, 1e-4, 1e-4); }
      if (o.label) o.label.position.copy(e).add(new THREE.Vector3(0, 0.22, 0));
    });
    this.draw();
  };
  StickView.prototype.weapon = function (w) {            // w: one frame of a weapon track {pos, rot: [[x, y, z]]} or null
    if (!this.ok) return;
    if (!w) { this.wBall.visible = this.wLine.visible = false; this.draw(); return; }
    const M = R.fromAngles(w.rot[0][0], w.rot[0][1], w.rot[0][2]), n = 80;
    const a = V(w.pos), b = V([w.pos[0] + M[0][2] * n, w.pos[1] + M[1][2] * n, w.pos[2] + M[2][2] * n]);
    this.wBall.position.copy(a); this.wLine.geometry.setFromPoints([a, b]);
    this.wBall.visible = this.wLine.visible = true; this.draw();
  };
  function labelSprite(text) {
    const c = document.createElement('canvas'); c.width = 96; c.height = 48;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(14, 6, 68, 36);
    g.font = 'bold 28px system-ui, sans-serif'; g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 48, 25);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sp.scale.set(0.8, 0.4, 1); sp.renderOrder = 10; return sp;
  }
  // style(i) -> {rod, ball, label, big}
  StickView.prototype.style = function (style) {
    if (!this.ok) return;
    this.bones.forEach((o, i) => {
      const s = style(i);
      o.rod.material.color.setHex(s.rod); o.ball.material.color.setHex(s.ball);
      o.ball.scale.setScalar(s.big ? 0.12 : 0.07);
      if (s.label && !o.label) { o.label = labelSprite(String(i)); o.label.position.copy(o.end).add(new THREE.Vector3(0, 0.22, 0)); this.labels.add(o.label); }
      if (o.label) o.label.visible = !!s.label;
    });
    this.draw();
  };
  StickView.prototype.fit = function () {
    if (!this.ok || !this.bones.length) return;
    const box = new THREE.Box3(); this.bones.forEach(o => box.expandByPoint(o.end));
    box.expandByPoint(new THREE.Vector3(box.min.x, 0, box.min.z));          // keep the floor in the picture
    const c = box.getCenter(new THREE.Vector3()), size = Math.max(1, box.getSize(new THREE.Vector3()).length());
    const dist = size / (2 * Math.tan(this.camera.fov * Math.PI / 360)) * 1.15;
    this.orbit.target.copy(c); this.camera.position.copy(c).add(new THREE.Vector3(0.45, 0.25, 1).normalize().multiplyScalar(dist));
    this.camera.near = dist / 100; this.camera.far = dist * 20; this.camera.updateProjectionMatrix(); this.orbit.update(); this.draw();
  };

  const vSrc = new StickView($('rt-v-src'), { onPick: b => onPick('src', b), onHover: b => onHover('src', b, vSrc) });
  const vTgt = new StickView($('rt-v-tgt'), { onPick: b => onPick('tgt', b), onHover: b => onHover('tgt', b, vTgt) });
  const pSrc = new StickView($('rt-p-src'), { onHover: b => pSrc.tipText(b === null ? '' : describe('src', b)) });
  const pTgt = new StickView($('rt-p-tgt'), { onHover: b => pTgt.tipText(b === null ? '' : describe('tgt', b)) });
  const allViews = [vSrc, vTgt, pSrc, pTgt];
  window.addEventListener('sm-tab', () => allViews.forEach(v => v.resize()));

  /* ================================================================== the skeletons and reference poses */
  function loadSkeleton(name, what) {
    if (!name) return { error: 'No ' + what + ' yet: load its xxaa in step 1.' };
    const b = pool.get(name);
    if (!b) return { error: 'The ' + what + ' "' + base(name) + '" is not loaded (step 1).' };
    const bad = L.skeletonCheck(name, b); if (bad) return { error: bad };
    try { return { sk: R.readSkeleton(b) }; } catch (e) { return { error: plain(e) }; }
  }
  function loadRef(ref, sk, what) {
    if (!sk) return { error: '' };
    if (!ref) return { error: 'No ' + what + ' yet: load the animations (xxda) in step 1, or pick one in the map editor.' };
    try {
      const rec = L.itemBytes(pool.resolver(), ref.file), a = R.decode(rec);
      if (!a) return { error: 'The ' + what + ' (' + base(ref.file) + ') is an empty placeholder: pick another animation.' };
      if (a.bones !== sk.count + 1) return { error: 'The ' + what + ' (' + base(ref.file) + ') has ' + a.bones + ' entries per frame; this skeleton needs ' + (sk.count + 1) + ': it belongs to another model.' };
      if (ref.frame >= a.frames.length) return { error: 'The ' + what + ' (' + base(ref.file) + ') has ' + a.frames.length + ' frames: there is no frame ' + ref.frame + '.' };
      const frame = a.frames[ref.frame];
      return { frame, pose: R.pose(sk, frame) };
    } catch (e) { return { error: plain(e) }; }
  }
  function updateModels() {
    skel.src = loadSkeleton(map.source_skeleton, 'source skeleton');
    skel.tgt = loadSkeleton(map.target_skeleton, 'target skeleton');
    refs.src = loadRef(map.source_reference, skel.src.sk, 'source reference pose');
    refs.tgt = loadRef(map.target_reference, skel.tgt.sk, 'target reference pose');
    for (const [side, view, what] of [['src', vSrc, 'Source'], ['tgt', vTgt, 'Target']]) {
      const s = skel[side], r = refs[side];
      if (s.error || r.error) { view.message(s.error || r.error); view.caption(''); continue; }
      view.message('');
      view.setSkeleton(s.sk.bones.map(b => [b.parent, b.length]));
      view.setPose(r.pose);
      const ref = side === 'src' ? map.source_reference : map.target_reference;
      view.caption(what + ': ' + base(side === 'src' ? map.source_skeleton : map.target_skeleton) + ' (' + s.sk.count + ' bones), ' + base(ref.file) + ' frame ' + ref.frame);
      const sig = (side === 'src' ? map.source_skeleton : map.target_skeleton) + '|' + ref.file + '|' + ref.frame;
      if (sig !== fitSig[side]) { fitSig[side] = sig; view.fit(); }
    }
    restyle();
  }
  const bonesOf = side => (skel[side] && skel[side].sk ? skel[side].sk.count : undefined);

  /* ================================================================== picking and colours */
  function pairsBySource() {
    const m = new Map();
    Object.keys(map.pairs).map(Number).sort((a, b) => a - b).forEach(t => { const [s, how] = map.pairs[t]; if (!m.has(s)) m.set(s, []); m.get(s).push([t, how]); });
    return m;
  }
  function styleFor(side, interactive) {
    const bySrc = pairsBySource(), all = $('rt-all-labels').checked;
    let linkSrc = new Set(), linkTgt = new Set();
    const hv = interactive ? hover : { side: null };
    if (hv.side === 'tgt' && map.pairs[hv.bone]) linkSrc.add(map.pairs[hv.bone][0]);
    if (hv.side === 'src' && bySrc.has(hv.bone)) bySrc.get(hv.bone).forEach(([t]) => linkTgt.add(t));
    if (interactive && selTgt !== null && map.pairs[selTgt]) linkSrc.add(map.pairs[selTgt][0]);
    const sf = new Set(map.source_feet || []), tf = new Set(map.feet || []);
    return i => {
      const s = { rod: COL.idle, ball: COL.joint, label: all, big: false };
      if (side === 'src') {
        if (bySrc.has(i)) s.rod = COL[L.howName(bySrc.get(i)[0][1])];
        if (sf.has(i)) { s.ball = COL.foot; s.big = true; }
        if (linkSrc.has(i) || (hv.side === 'src' && hv.bone === i)) { s.rod = COL.hover; s.label = true; }
        if (interactive && selSrc === i) { s.rod = COL.pick; s.label = true; s.big = true; }
      } else {
        const p = map.pairs[i];
        if (p) s.rod = COL[L.howName(p[1])]; else if (map.loose && map.loose[i]) s.rod = COL.loose;
        if (tf.has(i)) { s.ball = COL.foot; s.big = true; }
        if (map.target_weapon_bone === i) { s.ball = COL.weapon; s.big = true; }
        if (linkTgt.has(i) || (hv.side === 'tgt' && hv.bone === i)) { s.rod = COL.hover; s.label = true; }
        if (interactive && selTgt === i) { s.rod = COL.pick; s.label = true; s.big = true; }
      }
      return s;
    };
  }
  function restyle() {
    vSrc.style(styleFor('src', true)); vTgt.style(styleFor('tgt', true));
    pSrc.style(styleFor('src', false)); pTgt.style(styleFor('tgt', false));
  }
  function describe(side, b) {
    const s = skel[side] && skel[side].sk, info = s && s.bones[b] ? ' (parent ' + s.bones[b].parent + ', length ' + Math.round(Math.abs(s.bones[b].length)) + ')' : '';
    if (side === 'tgt') {
      const p = map.pairs[b];
      return 'target bone ' + b + info + (p ? ': follows source ' + p[0] + ' (' + L.howName(p[1]) + ')' : map.loose[b] ? ': loose' : ': no pair');
    }
    const uses = pairsBySource().get(b);
    return 'source bone ' + b + info + (uses ? ': drives target ' + uses.map(([t, how]) => t + ' (' + L.howName(how) + ')').join(', ') : ': not used');
  }
  function onHover(side, b, view) {
    hover = b === null ? { side: null, bone: null } : { side, bone: b };
    view.tipText(b === null ? '' : describe(side, b));
    vSrc.style(styleFor('src', true)); vTgt.style(styleFor('tgt', true));
  }
  function pickMsg(text) { $('rt-pick-msg').textContent = text || ''; }
  function onPick(side, b) {
    if (pickMode === 'sfeet' || pickMode === 'tfeet') {
      const want = pickMode === 'sfeet' ? 'src' : 'tgt';
      if (side !== want) { pickMsg('Picking ' + (want === 'src' ? 'source' : 'target') + ' feet: click bones in the ' + (want === 'src' ? 'source (left)' : 'target (right)') + ' view.'); return; }
      if (want === 'src') map.source_feet = L.toggleIn(map.source_feet || [], b); else map.feet = L.toggleIn(map.feet || [], b);
      pickMsg((want === 'src' ? 'Source' : 'Target') + ' feet: ' + (L.formatBones(want === 'src' ? map.source_feet : map.feet) || 'none'));
      return changed();
    }
    if (pickMode === 'wbone') {
      if (side !== 'tgt') { pickMsg('Picking the weapon hand: click a bone in the target (right) view.'); return; }
      map.target_weapon_bone = b; pickMode = 'pair'; pickMsg('The weapon is held at the end of target bone ' + b + '.');
      return changed();
    }
    if (pickMode.startsWith('loose:')) {
      const g = map.looseGroups[Number(pickMode.slice(6))];
      if (!g || side !== 'tgt') { pickMsg('Picking loose bones: click bones in the target (right) view.'); return; }
      g.bones = L.toggleIn(g.bones, b); L.syncLoose(map);
      pickMsg('Loose bones: ' + (L.formatBones(g.bones) || 'none'));
      return changed();
    }
    if (side === 'src') selSrc = selSrc === b ? null : b; else selTgt = selTgt === b ? null : b;
    if (selSrc !== null && selTgt !== null) {
      L.setPair(map, selTgt, selSrc, newHow);
      pickMsg('Target bone ' + selTgt + ' now follows source bone ' + selSrc + ' (' + newHow + ').');
      selSrc = selTgt = null; return changed();
    }
    if (selTgt !== null) pickMsg('Target bone ' + selTgt + ' picked' + (map.pairs[selTgt] ? ' (it follows source ' + map.pairs[selTgt][0] + ', shown in white)' : '') + ': now click its source bone in the left view.');
    else if (selSrc !== null) pickMsg('Source bone ' + selSrc + ' picked: now click the target bone that should follow it, in the right view.');
    else pickMsg('');
    renderEditor(); restyle();
  }
  function setPickMode(m) {
    pickMode = pickMode === m ? 'pair' : m; selSrc = selTgt = null;
    renderEditor(); restyle();
  }
  function renderBanner() {
    const t = { sfeet: 'Picking SOURCE feet: click foot and toe bones in the left view (again to remove).', tfeet: 'Picking TARGET feet: click foot and toe bones in the right view (again to remove).', wbone: 'Picking the target weapon hand: click it in the right view.' }[pickMode]
      || (pickMode.startsWith('loose:') ? 'Picking loose bones: click bones in the right view (again to remove).' : '');
    $('rt-banner').innerHTML = '';
    if (t) $('rt-banner').appendChild(h('div', { class: 'banner' }, t + ' ', h('button', { onclick: () => setPickMode(pickMode) }, 'Done')));
  }

  /* ================================================================== the editor's controls */
  const HELP = R.HELP;
  function intIn(v, what) { const n = Number(String(v).trim()); if (!Number.isInteger(n) || n < 0) throw new Error(what + ': "' + v + '" is not a bone number'); return n; }
  function numIn(v, what) { const n = Number(String(v).trim()); if (String(v).trim() === '' || !isFinite(n)) throw new Error(what + ': "' + v + '" is not a number'); return n; }
  function guarded(fn) { return later(function () { try { fn.call(this); pickMsg(''); } catch (e) { pickMsg(plain(e)); } changed(); }); }
  function helpLine(t) { return h('p', { class: 'help' }, t); }
  function howSelect(value, key, onchange) {
    return h('select', { key, onchange, title: HELP.aim + '\n' + HELP.reach }, ['aim', 'follow', 'reach'].map(x => h('option', { value: x, selected: x === value }, x)));
  }

  function refEditor(k, label) {
    const ref = map[k], files = pool.list().filter(e => recordsOf(e.name));
    const cur = ref ? L.refFile(ref.file) : null, curLoaded = cur && pool.has(cur);
    const fileSel = h('select', { key: 'ref-f:' + k, style: 'max-width:100%', onchange: guarded(function () {
      const v = this.value;
      if (!v) { delete map[k]; return; }
      if (v === 'missing' || (cur && L.keyOf(cur) === v)) return;
      const e = pool.entry(v), recs = recordsOf(v), single = /\.anim$/i.test(e.name);
      const wi = /weapon/.test(k) ? L.weaponRefIndex(recs) : null;
      map[k] = { file: L.refSpec(e.name, single ? null : (wi === null ? 0 : wi)), frame: 0 };
    }) }, h('option', { value: '' }, '(none)'),
      cur && !curLoaded ? h('option', { value: 'missing', selected: true }, base(cur) + ' (not loaded)') : null,
      files.map(e => h('option', { value: L.keyOf(e.name), selected: cur && L.keyOf(cur) === L.keyOf(e.name) }, e.name)));
    const row = h('div', { class: 'row' }, fileSel);
    if (ref && curLoaded) {
      const recs = recordsOf(cur) || [], idx = L.refIndex(ref.file);
      if (idx !== null) {
        row.appendChild(h('select', { key: 'ref-n:' + k, title: 'Which animation of the file', onchange: guarded(function () { map[k] = { file: L.refSpec(cur, Number(this.value)), frame: 0 }; }) },
          recs.map((r, i) => { const hd = L.recordHead(r); return h('option', { value: i, selected: i === idx }, hx(i) + (hd.placeholder ? ' (empty)' : ' (' + hd.frames + ' frames' + (hd.bones === 1 ? ', a weapon track' : '') + ')')); })));
      }
      row.appendChild(h('label', {}, 'frame ', h('input', { type: 'number', min: 0, value: ref.frame, key: 'ref-fr:' + k, onchange: guarded(function () { ref.frame = intIn(this.value, 'frame'); }) })));
    }
    return [h('span', {}, label), row];
  }

  function renderEditor() {
    const ae = document.activeElement, focused = ae && ae.dataset ? ae.dataset.key : null;
    const box = $('rt-editor'); box.innerHTML = '';
    renderBanner();
    // how new pairs are made
    box.appendChild(h('h3', {}, 'Pairs'));
    box.appendChild(h('div', { class: 'row seg' }, 'New pairs: ',
      ['aim', 'follow', 'reach'].map(x => h('button', { class: newHow === x ? 'on' : '', title: x === 'follow' ? HELP.pair : HELP[x], onclick: () => { newHow = x; renderEditor(); } }, x)),
      (selSrc !== null || selTgt !== null) ? h('button', { onclick: () => { selSrc = selTgt = null; pickMsg(''); renderEditor(); restyle(); } }, 'Cancel the pick') : null));
    box.appendChild(helpLine(newHow === 'follow' ? HELP.pair : HELP[newHow]));
    // the list
    const tb = h('tbody');
    const targets = Object.keys(map.pairs).map(Number).sort((a, b) => a - b);
    targets.forEach(t => {
      const [s, how] = map.pairs[t];
      const tr = h('tr', { class: 'pick' + (selTgt === t ? ' sel' : '') },
        h('td', { class: 'mono' }, String(t)),
        h('td', {}, h('input', { type: 'number', min: 0, value: s, key: 'pair-s:' + t, onchange: guarded(function () { L.setPair(map, t, intIn(this.value, 'source bone'), L.howName(map.pairs[t][1])); }) })),
        h('td', {}, howSelect(L.howName(how), 'pair-h:' + t, guarded(function () { L.setPair(map, t, map.pairs[t][0], this.value); }))),
        h('td', {}, h('button', { title: 'Remove this pair', onclick: () => { L.removePair(map, t); if (selTgt === t) selTgt = null; changed(); } }, 'Remove')));
      tr.onclick = e => {
        if (e.target.closest('input, select, button')) return;          // a click on a field only focuses it
        selTgt = selTgt === t ? null : t; selSrc = null;
        pickMsg(selTgt === null ? '' : 'Target bone ' + t + ' (white on the left: its source ' + s + '). Click a source bone to change it.');
        renderEditor(); restyle();
      };
      tb.appendChild(tr);
    });
    if (!targets.length) tb.appendChild(h('tr', {}, h('td', { colspan: 4, class: 'help' }, 'No pairs yet: click a source bone, then a target bone, or add them by number below.')));
    box.appendChild(h('div', { class: 'scroll', style: 'max-height:260px' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Target bone'), h('th', {}, 'Source bone'), h('th', {}, 'How'), h('th', {}, ''))), tb)));
    box.appendChild(h('div', { class: 'row' }, 'Add by number: target ',
      h('input', { type: 'number', min: 0, value: addRow.t, key: 'add-t', onchange: function () { addRow.t = this.value; } }), ' follows source ',
      h('input', { type: 'number', min: 0, value: addRow.s, key: 'add-s', onchange: function () { addRow.s = this.value; } }),
      howSelect(addRow.how, 'add-h', function () { addRow.how = this.value; }),
      h('button', { onclick: guarded(function () { L.setPair(map, intIn(addRow.t, 'target bone'), intIn(addRow.s, 'source bone'), addRow.how); addRow.t = ''; addRow.s = ''; }) }, 'Add')));

    // feet
    box.appendChild(h('h3', {}, 'Feet'));
    const g1 = h('div', { class: 'grid2' });
    for (const [k, label, mode] of [['source_feet', 'Source feet', 'sfeet'], ['feet', 'Target feet', 'tfeet']]) {
      g1.append(h('span', {}, label), h('div', { class: 'row' },
        h('input', { type: 'text', value: L.formatBones(map[k] || []), placeholder: 'e.g. 16 17 21 22', key: 'feet:' + k, size: 16, onchange: guarded(function () { map[k] = Array.from(new Set(L.parseBones(this.value))).sort((a, b) => a - b); }) }),
        h('button', { class: pickMode === mode ? 'primary' : '', onclick: () => setPickMode(mode) }, pickMode === mode ? 'Done picking' : 'Pick in the view')));
    }
    box.appendChild(g1); box.appendChild(helpLine(HELP.feet));

    // weapon
    box.appendChild(h('h3', {}, 'Weapon'));
    const g2 = h('div', { class: 'grid2' });
    g2.append(h('span', {}, 'Target weapon bone (the hand)'), h('div', { class: 'row' },
      h('input', { type: 'number', min: 0, value: map.target_weapon_bone === undefined ? '' : map.target_weapon_bone, placeholder: 'none', key: 'wbone', onchange: guarded(function () { if (String(this.value).trim() === '') delete map.target_weapon_bone; else map.target_weapon_bone = intIn(this.value, 'weapon bone'); }) }),
      h('button', { class: pickMode === 'wbone' ? 'primary' : '', onclick: () => setPickMode('wbone') }, pickMode === 'wbone' ? 'Cancel' : 'Pick in the view')));
    g2.append(...refEditor('source_weapon_reference', 'Source weapon reference'), ...refEditor('target_weapon_reference', 'Target weapon reference'));
    box.appendChild(g2); box.appendChild(helpLine(HELP.weapon));

    // reference poses
    box.appendChild(h('h3', {}, 'Reference poses'));
    const g3 = h('div', { class: 'grid2' });
    g3.append(...refEditor('source_reference', 'Source reference'), ...refEditor('target_reference', 'Target reference'));
    box.appendChild(g3); box.appendChild(helpLine(HELP.reference));

    // advanced
    const det = h('details', { open: advOpen, ontoggle: function () { advOpen = this.open; } }, h('summary', {}, 'Advanced: scale, loose bones, colliders, options'));
    let auto = '';
    if (refs.src && refs.tgt && refs.src.frame && refs.tgt.frame) auto = refs.src.frame.pos[1] ? (refs.tgt.frame.pos[1] / refs.src.frame.pos[1]).toFixed(3) : '1';
    det.appendChild(h('div', { class: 'row' }, 'Scale ', h('input', { type: 'text', size: 8, value: map.scale === undefined ? '' : String(map.scale), placeholder: auto ? 'auto: ' + auto : 'auto', key: 'scale',
      onchange: guarded(function () { const v = String(this.value).trim(); if (v === '') delete map.scale; else { const n = numIn(v, 'scale'); if (!(n > 0)) throw new Error('scale must be above 0'); map.scale = n; } }) }),
      h('span', { class: 'help' }, 'empty = automatic' + (auto ? ' (' + auto + ' here)' : ''))));
    det.appendChild(helpLine(HELP.scale));

    det.appendChild(h('h3', {}, 'Loose bones (hair, cape)'));
    map.looseGroups.forEach((g, gi) => {
      const keys = ['hang', 'stiffness', 'damping', 'gravity', 'limit'];
      const pk = 'loose:' + gi;
      det.appendChild(h('div', { class: 'row', style: 'border:1px solid var(--line);border-radius:4px;padding:4px 6px' },
        'bones ', h('input', { type: 'text', size: 14, value: L.formatBones(g.bones), placeholder: 'e.g. 3-5', key: 'lb:' + gi, onchange: guarded(function () { g.bones = Array.from(new Set(L.parseBones(this.value))).sort((a, b) => a - b); L.syncLoose(map); }) }),
        h('button', { class: pickMode === pk ? 'primary' : '', onclick: () => setPickMode(pk) }, pickMode === pk ? 'Done picking' : 'Pick'),
        keys.map(k => h('label', { title: HELP.loose }, k + ' ', h('input', { type: 'number', step: k === 'gravity' || k === 'limit' ? 1 : 0.05, value: g.params[k], key: 'lp:' + gi + ':' + k,
          onchange: guarded(function () { g.params[k] = numIn(this.value, k); L.syncLoose(map); }) }))),
        h('button', { onclick: () => { map.looseGroups.splice(gi, 1); L.syncLoose(map); if (pickMode === pk) pickMode = 'pair'; changed(); } }, 'Remove')));
    });
    det.appendChild(h('div', { class: 'row' }, h('button', { onclick: () => { map.looseGroups.push({ bones: [], params: Object.assign({}, R.LOOSE_DEFAULTS) }); pickMode = 'loose:' + (map.looseGroups.length - 1); L.syncLoose(map); changed(); } }, 'Add a loose group'),
      h('label', { title: HELP.follow }, h('input', { type: 'checkbox', checked: opt.follow, onchange: function () { opt.follow = this.checked; changed(); } }), ' use loose bones (off: every unpaired bone held rigid)')));
    det.appendChild(helpLine(HELP.loose));

    det.appendChild(h('h3', {}, 'Colliders'));
    (map.colliders || []).forEach((c, ci) => {
      det.appendChild(h('div', { class: 'row', style: 'border:1px solid var(--line);border-radius:4px;padding:4px 6px' },
        [['bone', 'bone'], ['rx', 'across'], ['ry', 'front-back'], ['yo', 'forward'], ['below', 'below'], ['above', 'above']].map(([k, lab]) =>
          h('label', { title: HELP.collide }, lab + ' ', h('input', { type: 'number', value: c[k], key: 'co:' + ci + ':' + k, onchange: guarded(function () { c[k] = k === 'bone' ? intIn(this.value, 'collider bone') : numIn(this.value, lab); }) }))),
        h('button', { onclick: () => { map.colliders.splice(ci, 1); changed(); } }, 'Remove')));
    });
    det.appendChild(h('div', { class: 'row' }, h('button', { onclick: () => { map.colliders = map.colliders || []; map.colliders.push({ bone: 0, rx: 100, ry: 80, yo: 0, below: 0, above: 0 }); changed(); } }, 'Add a collider')));
    det.appendChild(helpLine(HELP.collide));

    det.appendChild(h('h3', {}, 'Options (not saved in the map)'));
    det.appendChild(h('div', { class: 'row' },
      h('label', { title: HELP.style }, 'style ', h('select', { key: 'o-style', onchange: function () { opt.style = this.value; changed(); } }, ['pose', 'offset'].map(x => h('option', { value: x, selected: opt.style === x }, x)))),
      h('label', { title: HELP.key }, 'key ', h('select', { key: 'o-key', onchange: function () { opt.key = this.value === '' ? null : Number(this.value); changed(); } },
        [['', 'the source\'s own'], ['0', '0 (full precision)'], ['2', '2'], ['4', '4']].map(([v, t]) => h('option', { value: v, selected: String(opt.key === null ? '' : opt.key) === v }, t))))));
    det.appendChild(helpLine(HELP.style)); det.appendChild(helpLine(HELP.key));
    box.appendChild(det);

    if (focused) { const el = box.querySelector('[data-key="' + focused + '"]'); if (el) el.focus(); }
  }

  /* ================================================================== step 1: files */
  const ROLE = {
    'src-aa': { side: 'src', kind: 'aa', key: 'source_skeleton', what: 'source skeleton' },
    'tgt-aa': { side: 'tgt', kind: 'aa', key: 'target_skeleton', what: 'target skeleton' },
    'src-da': { side: 'src', kind: 'da', ref: 'source_reference', wref: 'source_weapon_reference', what: 'source animations' },
    'tgt-da': { side: 'tgt', kind: 'da', ref: 'target_reference', wref: 'target_weapon_reference', what: 'target animations' }
  };
  async function loadRole(id) {
    const input = $('rt-' + id), f = input.files[0], r = ROLE[id]; if (!f) return;
    try {
      const bytes = await readFile(f);
      if (r.kind === 'aa') {
        const bad = L.skeletonCheck(f.name, bytes); if (bad) throw new Error(bad);
        const added = pool.add(f.name, bytes); map[r.key] = L.keepName(map[r.key], f.name);
        say('rt-files-msg', 'Loaded ' + added.name + ' as the ' + r.what + ' (' + R.readSkeleton(bytes).count + ' bones).' + (added.replaced ? ' It replaces an earlier file of the same name.' : ''), 'ok');
      } else {
        const recs = L.animRecords(f.name, bytes), added = pool.add(f.name, bytes), old = map[r.ref];
        const sameAsOld = old && L.keyOf(L.refFile(old.file)) === L.keyOf(f.name);
        if (!sameAsOld) map[r.ref] = { file: L.refSpec(added.name, /\.anim$/i.test(f.name) ? null : 0), frame: 0 };
        const replacedRef = old && !sameAsOld ? ' The map\'s ' + (r.side === 'src' ? 'source' : 'target') + ' reference was ' + base(old.file) + ' frame ' + old.frame + '; it is now this file.' : '';
        const w = map[r.wref], wi = L.weaponRefIndex(recs);
        if (wi !== null && (!w || (old && L.keyOf(L.refFile(w.file)) === L.keyOf(L.refFile(old.file))))) map[r.wref] = { file: L.refSpec(added.name, wi), frame: 0 };
        say('rt-files-msg', 'Loaded ' + added.name + ' as the ' + r.what + ' (' + recs.length + ' animations); its animation ' + (L.refIndex(map[r.ref].file) === null ? '' : hx(L.refIndex(map[r.ref].file)) + ' ') + 'frame ' + map[r.ref].frame + ' is the reference pose (change it in step 3).' + replacedRef + (added.replaced ? ' It replaces an earlier file of the same name.' : ''), 'ok');
      }
      selSrc = selTgt = null;
    } catch (e) { say('rt-files-msg', plain(e), 'bad'); }
    input.value = ''; changed();
  }
  Object.keys(ROLE).forEach(id => { $('rt-' + id).onchange = () => loadRole(id); });

  $('rt-anims').onchange = async e => {
    const bad = [], good = [];
    for (const f of Array.from(e.target.files)) {
      try {
        const bytes = await readFile(f), s = A.sourceList(f.name, bytes);
        if (!/\.anim$/i.test(f.name)) L.animRecords(f.name, bytes);                    // strict check
        const added = pool.add(f.name, bytes), key = L.keyOf(f.name);
        anims = anims.filter(a => a.key !== key);
        anims.push({ name: added.name, key, kind: s.kind, bytes, items: s.items.map(it => Object.assign(it, { file: added.name, id: key + ':' + it.index })) });
        good.push(added.name + ' (' + s.items.length + ' animation' + (s.items.length === 1 ? '' : 's') + (s.kind === 'pack' ? ', a limit pack' : '') + ')');
      } catch (err) { bad.push(f.name + ': ' + plain(err)); }
    }
    e.target.value = '';
    say('rt-files-msg', bad.length ? bad.concat(good.length ? ['Loaded: ' + good.join(', ')] : []) : (good.length ? 'Loaded to retarget: ' + good.join(', ') + '. Pick one in step 4.' : ''), bad.length ? 'bad' : 'ok');
    changed();
  };
  $('rt-other').onchange = async e => {
    const names = [];
    for (const f of Array.from(e.target.files)) { const added = pool.add(f.name, await readFile(f)); names.push(added.name + (added.replaced ? ' (replaces an earlier one)' : '')); }
    e.target.value = '';
    say('rt-files-msg', names.length ? 'Loaded: ' + names.join(', ') + '.' : '', 'ok');
    changed();
  };

  function renderFiles() {
    const g = $('rt-files'); g.innerHTML = '';
    const st = (name, extra) => !name ? h('span', { class: 'help' }, 'not set') : pool.has(name) ? h('span', {}, base(name) + (extra ? ': ' + extra : '')) : h('span', { style: 'color:var(--bad)' }, base(name) + ': not loaded');
    const sk = side => (skel[side] && skel[side].sk ? skel[side].sk.count + ' bones' : '');
    const rf = k => (map[k] ? h('span', {}, st(L.refFile(map[k].file)), ' ', h('span', { class: 'help' }, (L.refIndex(map[k].file) === null ? '' : 'animation ' + hx(L.refIndex(map[k].file)) + ', ') + 'frame ' + map[k].frame)) : st(null));
    g.append(h('span', {}, 'Source skeleton'), st(map.source_skeleton, sk('src')), h('span', {}, 'Source reference'), rf('source_reference'),
      h('span', {}, 'Target skeleton'), st(map.target_skeleton, sk('tgt')), h('span', {}, 'Target reference'), rf('target_reference'),
      h('span', {}, 'To retarget'), anims.length ? h('span', {}, anims.map(a => a.name + ' (' + a.items.length + ')').join(', ')) : h('span', { class: 'help' }, 'nothing yet'),
      h('span', {}, 'All loaded files'), pool.list().length ? h('span', { class: 'help' }, pool.list().map(e => e.name).join(', ')) : h('span', { class: 'help' }, 'none'));
  }
  function renderNeeds() {
    const miss = L.missingNames(map, pool), names = L.mapNames(map);
    if (miss.length) say('rt-needs', ['The map still needs ' + (miss.length === 1 ? 'this file' : 'these files') + ' (load them in step 1, in the matching box or under "Other files"):'].concat(miss.map(m => '  ' + m.name + ' (' + m.what.join(', ') + ')')), 'warn');
    else if (names.length) say('rt-needs', 'Every file the map names is loaded.', 'ok');
    else say('rt-needs', '');
  }
  function currentCheck() { return L.checkMap(map, { srcBones: bonesOf('src'), tgtBones: bonesOf('tgt') }); }
  function renderProblems() {
    const c = currentCheck(), box = $('rt-problems'); box.innerHTML = '';
    if (c.problems.length) box.insertAdjacentHTML('beforeend', '<div class="msg bad">' + c.problems.map(esc).join('<br>') + '</div>');
    if (c.warnings.length) box.insertAdjacentHTML('beforeend', '<div class="msg warn">' + c.warnings.map(esc).join('<br>') + '</div>');
  }

  /* ================================================================== step 2: the map file */
  $('rt-open').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const m = R.parseMap(await readText(f));
      ['pairs', 'loose', 'looseGroups', 'colliders', 'feet', 'source_feet'].forEach(k => { if (!m[k]) m[k] = k === 'pairs' || k === 'loose' ? {} : []; });
      map = m; mapFile = f.name; selSrc = selTgt = null; pickMode = 'pair'; fitSig = { src: '', tgt: '' };
      say('rt-map-msg', 'Opened ' + f.name + ': ' + Object.keys(map.pairs).length + ' pairs' + (map.looseGroups.length ? ', ' + map.looseGroups.length + ' loose group(s)' : '') + '.', 'ok');
    } catch (err) { say('rt-map-msg', 'This file cannot be used as a retarget map: ' + plain(err), 'bad'); }
    changed();
  };
  function cleanMap() {           // what is written: empty loose groups left out
    const m = Object.assign({}, map, { looseGroups: map.looseGroups.filter(g => g.bones.length) });
    return L.syncLoose(m);
  }
  $('rt-save').onclick = () => {
    try {
      const text = R.writeMap(cleanMap()), name = mapFile || L.mapFileName(map);
      download(name, new TextEncoder().encode(text));
      say('rt-map-msg', 'Saved ' + name + ' (' + Object.keys(map.pairs).length + ' pairs). It names the files by the names they had when loaded.', 'ok');
    } catch (e) { say('rt-map-msg', 'Not saved: ' + plain(e), 'bad'); }
  };
  $('rt-new').onclick = () => {
    const keep = {}; ['source_skeleton', 'target_skeleton', 'source_reference', 'target_reference', 'source_weapon_reference', 'target_weapon_reference'].forEach(k => { if (map[k]) keep[k] = map[k]; });
    map = Object.assign(L.emptyMap(), keep); mapFile = null; selSrc = selTgt = null; pickMode = 'pair';
    say('rt-map-msg', 'A new empty map: no pairs, feet, weapon hand, loose bones or colliders. The loaded files and reference poses stay.', 'ok');
    changed();
  };

  /* ================================================================== steps 4 and 5: preview and export */
  function allItems() {
    const groups = anims.map(a => ({ name: a.name, items: a.items }));
    const sr = map.source_reference && L.refFile(map.source_reference.file);
    if (sr && pool.has(sr) && !anims.some(a => a.key === L.keyOf(sr))) {
      try { const e = pool.entry(sr), s = A.sourceList(e.name, e.bytes); groups.push({ name: e.name + ' (the source animations)', items: s.items.map(it => Object.assign(it, { file: e.name, id: L.keyOf(e.name) + ':' + it.index })) }); } catch (err) { /* listed in step 1 */ }
    }
    return groups;
  }
  let itemsById = new Map();
  function renderItems() {
    const sel = $('rt-item'), was = sel.value; sel.innerHTML = ''; itemsById = new Map();
    const groups = allItems();
    groups.forEach(g => {
      const og = h('optgroup', { label: g.name });
      g.items.forEach(it => {
        itemsById.set(it.id, it);
        const hd = A.headOf(it.body), fits = bonesOf('src') === undefined || hd.bones === bonesOf('src') + 1;
        og.appendChild(h('option', { value: it.id }, (it.index !== undefined ? hx(it.index) + ': ' : '') + hd.frames + ' frames' + (it.weapon ? ', weapon track' : '') + (fits ? '' : ' (another skeleton: ' + (hd.bones - 1) + ' bones)')));
      });
      if (g.items.length) sel.appendChild(og);
    });
    if (!itemsById.size) sel.appendChild(h('option', { value: '' }, '(load the source animations or animations to retarget in step 1)'));
    else if (itemsById.has(was)) sel.value = was;
  }
  function renderPacks() {
    const box = $('rt-packs'); box.innerHTML = '';
    anims.filter(a => a.kind === 'pack' || /\.a00$/i.test(a.name)).forEach(a => {
      box.appendChild(h('div', { class: 'row' }, h('button', { onclick: () => exportPack(a) }, 'Retarget the whole pack ' + a.name), h('span', { class: 'help' }, 'downloads ' + a.name + ' for the target')));
    });
  }

  const options = () => ({ files: pool.resolver(), style: opt.style, follow: opt.follow, key: opt.key });
  function compute(item) {
    const o = options(), body = R.retarget(map, item.body, o);
    let weapon = null, note = '';
    if (item.weapon) {
      if (map.target_weapon_bone === undefined) note = 'This animation has a weapon track, but the map has no target weapon bone: the weapon track is not retargeted (the weapon would be hidden).';
      else weapon = R.retargetWeapon(map, item.weapon, body, o);
    }
    return { body, weapon, note };
  }
  function ready() {             // -> null, or the reasons nothing can be retargeted yet
    const c = currentCheck(), why = c.problems.slice();
    if (skel.src.error) why.unshift(skel.src.error); if (skel.tgt.error) why.unshift(skel.tgt.error);
    if (!skel.src.error && refs.src.error) why.push(refs.src.error); if (!skel.tgt.error && refs.tgt.error) why.push(refs.tgt.error);
    const miss = L.missingNames(map, pool); if (miss.length) why.push('Files the map names are not loaded: ' + miss.map(m => m.name).join(', ') + '.');
    return why.length ? Array.from(new Set(why)) : null;
  }

  let prev = null, frame = 0, playing = false, lastT = 0, prevTimer = null, prevFitId = '';
  function schedulePreview() { clearTimeout(prevTimer); prevTimer = setTimeout(runPreview, 300); }
  function runPreview() {
    const item = itemsById.get($('rt-item').value);
    prev = null;
    const stop = (text, kind) => { say('rt-prev-msg', text, kind || 'warn'); pSrc.message('No preview: see the note below.'); pTgt.message('No preview: see the note below.'); setFrames(0); };
    if (!item) return stop('Pick an animation to preview (load one in step 1).', 'warn');
    const why = ready(); if (why) return stop(['Not retargeted yet:'].concat(why));
    const src = R.decode(item.body);
    if (!src) return stop('This animation is an empty placeholder.');
    if (src.bones !== bonesOf('src') + 1) return stop('This animation has ' + (src.bones - 1) + ' bones; the source skeleton has ' + bonesOf('src') + ': it was made for another model.', 'bad');
    let out;
    try { out = compute(item); } catch (e) { return stop(plain(e), 'bad'); }
    prev = { item, src, tgt: out.body, wsrc: item.weapon ? R.decode(item.weapon) : null, wtgt: out.weapon };
    pSrc.message(''); pTgt.message('');
    pSrc.setSkeleton(skel.src.sk.bones.map(b => [b.parent, b.length])); pTgt.setSkeleton(skel.tgt.sk.bones.map(b => [b.parent, b.length]));
    pSrc.caption('Source: ' + item.file + ' ' + hx(item.index)); pTgt.caption('Retargeted on ' + base(map.target_skeleton));
    const n = Math.max(src.frames.length, out.body.frames.length);
    setFrames(n);
    const id = item.id + '|' + map.source_skeleton + '|' + map.target_skeleton;
    if (id !== prevFitId) { prevFitId = id; frame = 0; showFrame(0); pSrc.fit(); pTgt.fit(); } else showFrame(Math.min(frame, n - 1));
    restyle();
    say('rt-prev-msg', [out.body.frames.length + ' frames retargeted' + (out.weapon ? ', with its weapon track' : '') + '. Look for hands through the body, sliding feet and snaps between frames: only your eye can judge the result.'].concat(out.note ? [out.note] : []), out.note ? 'warn' : 'ok');
  }
  function setFrames(n) { const s = $('rt-scrub'); s.max = Math.max(0, n - 1); if (frame > n - 1) frame = 0; s.value = frame; $('rt-frame').textContent = (n ? frame : 0) + ' / ' + Math.max(0, n - 1); if (!n) setPlaying(false); }
  function showFrame(f) {
    if (!prev) return;
    frame = f; $('rt-scrub').value = f; $('rt-frame').textContent = f + ' / ' + $('rt-scrub').max;
    const at = (a, i) => a.frames[Math.min(i, a.frames.length - 1)];
    pSrc.setPose(R.pose(skel.src.sk, at(prev.src, f))); pTgt.setPose(R.pose(skel.tgt.sk, at(prev.tgt, f)));
    pSrc.weapon(prev.wsrc ? at(prev.wsrc, f) : null); pTgt.weapon(prev.wtgt ? at(prev.wtgt, f) : null);
  }
  function setPlaying(on) { playing = on && !!prev; $('rt-play').textContent = playing ? 'Pause' : 'Play'; if (playing) { lastT = performance.now(); requestAnimationFrame(tick); } }
  function tick(t) {
    if (!playing || !prev) return;
    const step = 1000 / Number($('rt-fps').value);
    if (t - lastT >= step) { const n = Number($('rt-scrub').max) + 1; showFrame((frame + Math.floor((t - lastT) / step)) % n); lastT = t; }
    requestAnimationFrame(tick);
  }
  $('rt-play').onclick = () => setPlaying(!playing);
  $('rt-scrub').oninput = () => { setPlaying(false); showFrame(Number($('rt-scrub').value)); };
  $('rt-item').onchange = () => runPreview();

  function exportItem() {
    const item = itemsById.get($('rt-item').value);
    if (!item) throw new Error('Pick an animation in step 4 first.');
    const why = ready(); if (why) throw new Error(why.join(' '));
    return { item, out: compute(item) };
  }
  $('rt-dl').onclick = () => {
    try {
      const { item, out } = exportItem(), name = L.outName(item.file, item.index, map.target_skeleton);
      download(name, R.encode(out.body));
      if (out.weapon) setTimeout(() => download(L.outName(item.file, item.index, map.target_skeleton, true), R.encode(out.weapon)), 400);
      say('rt-exp-msg', ['Downloaded ' + name + ' (' + out.body.frames.length + ' frames)' + (out.weapon ? ' and its weapon track ' + L.outName(item.file, item.index, map.target_skeleton, true) : '') + '.'].concat(out.note ? [out.note] : []), out.note ? 'warn' : 'ok');
    } catch (e) { say('rt-exp-msg', plain(e), 'bad'); }
  };
  $('rt-send').onclick = () => {
    try {
      const { item, out } = exportItem();
      if (!window.SM_ADD_SLOTS) throw new Error('the Add slots tab did not start: reload the page');
      window.SM_ADD_SLOTS.addSource({ file: 'retargeted ' + item.file + ' ' + hx(item.index) + ' on ' + base(map.target_skeleton), index: item.index, body: R.encode(out.body), weapon: out.weapon ? R.encode(out.weapon) : null });
      $('rt-exp-msg').innerHTML = '';
      $('rt-exp-msg').appendChild(h('div', { class: 'msg ' + (out.note ? 'warn' : 'ok') }, 'Sent to Add slots (' + out.body.frames.length + ' frames' + (out.weapon ? ', with its weapon track' : '') + '). There, load the target model (' + base(map.target_skeleton) + ' and its xxda) in step 1 if it is not loaded, then pick a number. ', out.note ? out.note + ' ' : '', h('button', { onclick: () => window.SM_SHOW_TAB && window.SM_SHOW_TAB('add') }, 'Go to Add slots')));
    } catch (e) { say('rt-exp-msg', plain(e), 'bad'); }
  };
  function exportPack(a) {
    try {
      const why = ready(); if (why) throw new Error(why.join(' '));
      const res = R.retargetPack(map, a.bytes, options());
      download(a.name, res.bytes);
      const lines = ['Downloaded ' + a.name + ' for the target: ' + res.report.length + ' animation(s) retargeted.'].concat(res.report.map(r => '  ' + r));
      if (map.target_weapon_bone === undefined) lines.push('The map has no target weapon bone: the pack\'s weapon tracks are empty (the weapon is hidden while it plays).');
      lines.push('It goes in the magic folder under this name, replacing the pack it was made from: keep the original.');
      say('rt-exp-msg', lines, map.target_weapon_bone === undefined ? 'warn' : 'ok');
    } catch (e) { say('rt-exp-msg', 'The pack was not retargeted: ' + plain(e), 'bad'); }
  }

  /* ================================================================== everything after a change */
  function changed() {
    try {
      updateModels(); renderFiles(); renderNeeds(); renderProblems(); renderEditor(); renderItems(); renderPacks();
    } catch (e) { say('rt-pick-msg', 'Something went wrong in the page: ' + plain(e), 'bad'); if (window.console) console.error(e); }
    schedulePreview();
  }
  $('rt-all-labels').onchange = () => restyle();
  $('rt-reset-views').onclick = () => { allViews.forEach(v => v.fit()); };
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && (pickMode !== 'pair' || selSrc !== null || selTgt !== null)) { pickMode = 'pair'; selSrc = selTgt = null; pickMsg(''); renderEditor(); restyle(); } });
  if (!HAVE3D) say('rt-files-msg', 'three.js did not load (no internet?): the 3D views stay empty. Loading files, maps, pairing by number, retargeting and downloads still work.', 'warn');
  changed();
})();
