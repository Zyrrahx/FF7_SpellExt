/* SpellExt Config: the scene and enemy files' form (stage C2). One file, the same bytes in the Python tool's page
   (sxcfg/static) and the desktop app's (app/renderer): each page hands it a host (H) with its own h(), edit(), api(),
   openFile(), toast() and widgets. What it shows comes from the file view's `en` (sxcfg/enform.py, app/core/enform.js):
   the user's file over the converter's generated one, key by key with the file each value comes from; an override
   written into the user's file; a formation's surrounded triangle; Check this scene and Check all scenes; (formation
   diagrams, stage 1) every formation's layout and the Game formations page; (model preview, stage 4) the Model block of
   an enemy file's form, drawn by modelview.js (read only: nothing in it writes). */
"use strict";
(function (root) {
  const EN = {};
  const low = (s) => String(s).toLowerCase();
  const norm = new WeakMap();

  // the schema's en_files entry of a kind, with each key's `values` as the main files' groups ([[w], ...])
  EN.entry = function (schema, kind) {
    const e = schema && schema.en_files ? schema.en_files[kind] : null;
    if (!e) return null;
    if (norm.has(e)) return norm.get(e);
    const c = JSON.parse(JSON.stringify(e));
    for (const s of c.sections || []) for (const k of s.keys || []) {
      if (Array.isArray(k.values)) k.values = k.values.map((w) => (Array.isArray(w) ? w : [w]));
    }
    norm.set(e, c);
    return c;
  };
  EN.isEn = (v) => !!(v && v.en_kind && v.en);
  const effSec = (v, name) => (v.en.sections || []).find((x) => x.name === name) || null;
  const effKey = (sec, key) => (sec ? sec.keys.find((x) => x.key === low(key)) : null) || null;
  const mine = (v) => v.en.role === "user";
  const partnerName = (v) => v.en.partner.path.replace(/\//g, "\\");

  // the sections of the other file that this one has not (listed after the file's own, greyed)
  EN.partnerSections = function (v) {
    const have = new Set(v.outline.filter((s) => s.header !== null && !s.commented).map((s) => s.name));
    return (v.en.sections || []).filter((s) => !have.has(s.name) && (mine(v) ? s.generated_line : s.user_line));
  };
  // the keys of a section given by the other file (the form counts them as present)
  EN.present = function (v, s) {
    const out = new Set();
    const sec = s && s.name ? effSec(v, s.name) : null;
    if (sec) for (const k of sec.keys) if ((k.from === "user") !== mine(v)) out.add(k.key);
    return out;
  };

  // above the rows: which file this is, the other one, en_parse's refusals, the check buttons
  EN.head = function (H, v) {
    const h = H.h;
    const box = h("div", { class: "enhead" });
    const p = v.en.partner;
    if (mine(v)) {
      box.appendChild(h("div", { class: "enrole user" }, h("b", { text: "Your file. " }),
        p.exists ? "Each key here wins over the converter's " : "The converter has no generated file for it (",
        p.exists ? h("button", { class: "link", text: partnerName(v), title: "open the generated file", onclick: () => H.openFile(p.path) }) : partnerName(v) + ")",
        p.exists ? "; a key you delete takes the generated value again; a section only here is added after the generated ones." : "."));
    } else {
      box.appendChild(h("div", { class: "enrole generated" }, h("b", { text: "The converter's file: " }),
        "running the converter again overwrites it (an edit here is lost then). A key of your file ",
        p.exists ? h("button", { class: "link", text: partnerName(v), onclick: () => H.openFile(p.path) }) : h("span", { text: partnerName(v) + " (not made yet)" }),
        " wins over it and is kept: \"override in your file\" on a row writes the key there."));
    }
    for (const x of v.en.problems || []) box.appendChild(h("div", { class: "err", text: "The DLL refuses " + x.file + ": " + x.text }));
    // (stage D1) a file with a CR not followed by LF: the form does not read it as the DLL does
    for (const x of v.en.lone_cr || []) box.appendChild(h("div", { class: "err lonecr", text: x.text.charAt(0).toUpperCase() + x.text.slice(1) + "." }));
    box.appendChild(EN.checkBar(H, v));
    return box;
  };

  // the note under a row of this file: where its value stands in the overlay
  EN.rowNote = function (H, v, s, k) {
    const h = H.h;
    if (k.kind !== "key" || !s.name) return null;
    const e = effKey(effSec(v, s.name), k.key);
    if (!e) return null;
    const ro = !H.writable();
    if (mine(v)) {
      if (e.from !== "user" || e.line !== k.line) return h("div", { class: "ennote bad", text: "a second " + low(k.key) + " line in this section: the DLL refuses the file" });
      if (!e.over) return h("div", { class: "ennote", text: "only in your file" });
      return h("div", { class: "ennote" }, "wins over the generated line " + e.over.line + ": ", h("code", { text: e.over.value }), " ",
        h("button", { class: "link", text: "see it", onclick: () => H.openFile(v.en.partner.path, e.over.line) }), " ",
        ro ? null : h("button", { class: "link", text: "use the generated value", title: "removes this line from your file (and its section when nothing else is left in it): the generated " + e.over.value + " is used again",
          onclick: () => H.edit({ op: "en_use_generated", line: k.line }) }));
    }
    if (e.from === "user") {
      return h("div", { class: "ennote shadowed" }, "NOT USED: your file's line " + e.line + " gives ", h("code", { text: e.value }), " ",
        h("button", { class: "link", text: "see it", onclick: () => H.openFile(v.en.partner.path, e.line) }));
    }
    return h("div", { class: "ennote" }, "used (your file does not give it) ",
      ro ? null : h("button", { class: "link", text: "override in your file", title: "writes " + low(k.key) + " = " + k.value + " into " + partnerName(v) + " (made if needed; nothing is saved until Save)",
        onclick: () => H.edit({ op: "en_override", header: "[" + s.name + "]", key: low(k.key), value: k.value }) }));
  };

  // after the rows: the keys of this section that the other file gives
  EN.inherited = function (H, v, s, spec) {
    const h = H.h;
    const sec = s && s.name ? effSec(v, s.name) : null;
    if (!sec) return null;
    const from = sec.keys.filter((k) => (k.from === "user") !== mine(v));
    if (!from.length) return null;
    const ro = !H.writable();
    const box = h("div", { class: "eninherit" }, h("h4", { text: mine(v) ? "From the generated file (" + partnerName(v) + "), not in yours: used as they are"
      : "Added by your file (" + partnerName(v) + "), not in this one" }));
    for (const k of from) box.appendChild(EN.otherRow(H, v, s.name, k, spec, ro));
    return box;
  };
  EN.otherRow = function (H, v, name, k, spec, ro) {
    const h = H.h;
    const sp = spec ? H.keySpec(spec, k.key) : null;
    const row = h("div", { class: "row other" }, h("div", { class: "k" }, k.key, h("span", { class: "ln", text: "line " + k.line }), H.restartBadge(sp)),
      h("div", { class: "v" }, h("code", { text: k.value })),
      h("div", { class: "acts" },
        h("button", { text: "?", title: "help", onclick: () => row.classList.toggle("showhelp") }),
        h("button", { text: "open", title: "the line in " + partnerName(v), onclick: () => H.openFile(v.en.partner.path, k.line) }),
        mine(v) && !ro ? h("button", { text: "override here", title: "adds " + k.key + " = " + k.value + " to this section of your file, to change it here",
          onclick: () => H.edit({ op: "en_override", header: "[" + name + "]", key: k.key, value: k.value }) }) : null),
      h("div", { class: "help", text: H.helpText(sp) }));
    return row;
  };
  // a section only the other file has: its keys, read from there
  EN.partnerForm = function (H, el, v, name, spec) {
    const h = H.h;
    const sec = effSec(v, name);
    if (!sec) { el.appendChild(h("p", { class: "muted", text: "Pick a section on the left." })); return; }
    el.appendChild(EN.head(H, v));
    el.appendChild(h("h3", { text: "[" + name + "]" }));
    el.appendChild(h("p", { class: "muted", text: (mine(v) ? "Only in the generated file (" + partnerName(v) + ", line " + sec.generated_line + "): your file has no [" + name + "], so these are used as they are."
      : "Only in your file (" + partnerName(v) + ", line " + sec.user_line + "): added after the generated sections.") + (spec && spec.title ? " " + spec.title : "") }));
    el.appendChild(h("div", {}, h("button", { text: "open " + partnerName(v), onclick: () => H.openFile(v.en.partner.path, mine(v) ? sec.generated_line : sec.user_line) })));
    const ro = !H.writable();
    for (const k of sec.keys) el.appendChild(EN.otherRow(H, v, name, k, spec, ro));
    const sur = sec.kind === "formation" ? EN.formation(H, v, { name }) : null;
    if (sur) el.appendChild(sur);
    if (v.en_kind === "enemy" && name === "enemy") el.appendChild(EN.model(H, v));
  };

  // ---- kind = surrounded: the triangle the DLL places the party in, and which enemy stands before which place ----
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs, text) => {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, x] of Object.entries(attrs || {})) e.setAttribute(k, x);
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const PLACE_COLOURS = ["#2f5fd0", "#1f7a3a", "#b0650b"];

  // ---- (formation diagrams, stage 1) where everyone stands at the start, for every kind -----------------------------------
  // The layout is the file view's `formations[f]` (sxcfg/formation.py, app/core/formation.js) or a game formation's
  // (/api/game/formation). Drawn seen from ABOVE, the front (-z) at the top and +x to the LEFT, so the picture is not a
  // mirror of the game's: its camera (FUN_005c68b7, up = (0, -4096, 0)) has right = forward x up, which is -x when it
  // looks toward -z, so to a camera behind the party a member at x -1600 is on the right. Facing f looks along
  // (-sin f, -cos f) in 4096ths of a turn: on the picture, clockwise from the top.
  const PARTY_SIZES = [["three", 0, "3 members"], ["two", 0, "2: slots 0 and 1"], ["two", 1, "2: slots 0 and 2"],
    ["two", 2, "2: slots 1 and 2"], ["one", 0, "1: slot 0"], ["one", 1, "1: slot 1"], ["one", 2, "1: slot 2"]];
  let partySize = 0;          // the switch's choice, kept between formations
  const membersOf = (L, i) => {
    const [k, j] = PARTY_SIZES[i];
    return k === "three" ? L.party.three : k === "two" ? L.party.two[j].members : [L.party.one[j]];
  };
  const hex3 = (f) => "0x" + ("00" + f.toString(16)).slice(-3);
  EN.facingText = (f) => hex3(f) + (f === 0 ? " (toward -z, the front)" : f === 0x800 ? " (toward +z)" : f === 0x400 ? " (toward -x)" :
    f === 0xc00 ? " (toward +x)" : " (of 0x1000 a turn, clockwise from -z as drawn)");
  const turnText = (o) => "facing " + EN.facingText(o.facing) + (o.home !== o.facing ? ", home direction " + EN.facingText(o.home) : "");
  const ROWS_TEXT = {
    "as set": "rows as set in the menu: a member set to the back row stands on its back-row spot (dashed ring), 0x204 (516) behind its place",
    "swapped": "rows swapped (a back attack): a member set to the FRONT row stands on the back-row spot (dashed ring), 0x204 behind its place; one set to the back row on its place",
    "front": "rows off: everyone stands on its place, whatever its row setting",
  };

  EN.layoutSvg = function (L, size) {
    const ms = membersOf(L, size);
    const pts = [];
    for (const m of ms) { pts.push(m); if (m.shift) pts.push(m.shift); }
    for (const e of L.enemies) pts.push(e);
    if (L.places) for (const p of L.places) pts.push(p);
    let r = L.surrounded ? L.radius : 1800;
    for (const p of pts) r = Math.max(r, Math.abs(p.x), Math.abs(p.z));
    r = r * 1.15 + 50;
    const svg = sv("svg", { viewBox: [-r, -r, 2 * r, 2 * r].join(" "), class: "ensvg enfmsvg", role: "img",
      "aria-label": "party places, enemy rows and the formation's camera record 0 (the view at the start), seen from above (front at the top, +x to the left)" });
    const tick = (x, y, f, colour, dashed) => {
      const a = f * Math.PI / 2048;
      const len = r / 11;
      const at = { x1: x, y1: y, x2: x + Math.sin(a) * len, y2: y - Math.cos(a) * len, stroke: colour, "stroke-width": r / (dashed ? 160 : 90), "stroke-linecap": "round" };
      if (dashed) at["stroke-dasharray"] = r / 80 + " " + r / 80;
      return sv("line", at);
    };
    if (L.surrounded) svg.appendChild(sv("circle", { cx: 0, cy: 0, r: L.radius, fill: "none", stroke: "currentColor", "stroke-opacity": 0.25, "stroke-dasharray": r / 60 + " " + r / 60, "stroke-width": r / 250 }));
    svg.appendChild(sv("text", { x: 0, y: -r * 0.93, "text-anchor": "middle", "font-size": r / 14, fill: "currentColor", "fill-opacity": 0.6 }, "front (-z)"));
    svg.appendChild(sv("text", { x: -r * 0.97, y: r * 0.96, "text-anchor": "start", "font-size": r / 18, fill: "currentColor", "fill-opacity": 0.5 }, "+x"));
    svg.appendChild(sv("text", { x: r * 0.97, y: r * 0.96, "text-anchor": "end", "font-size": r / 18, fill: "currentColor", "fill-opacity": 0.5 }, "-x"));
    let clamped = false;
    if (L.camera) {
      const c = L.camera;
      const lim = r * 0.88;
      const clamp = (x, y) => { const m = Math.max(Math.abs(x), Math.abs(y)); return m > lim ? [x * lim / m, y * lim / m, true] : [x, y, false]; };
      const [px, py, out] = clamp(-c.x, c.z);
      const [qx, qy] = clamp(-c.fx, c.fz);
      clamped = out;
      const g = sv("g", { class: "encam" + (out ? " clamped" : "") });
      g.appendChild(sv("line", { x1: px, y1: py, x2: qx, y2: qy, stroke: "#7a3fb0", "stroke-opacity": 0.6, "stroke-width": r / 200, "stroke-dasharray": r / 50 + " " + r / 70 }));
      const d = Math.hypot(qx - px, qy - py) || 1;
      const ux = (qx - px) / d, uy = (qy - py) / d, k = r / 22;
      g.appendChild(sv("polygon", { points: [px + ux * k, py + uy * k, px - ux * k * 0.6 - uy * k * 0.7, py - uy * k * 0.6 + ux * k * 0.7,
        px - ux * k * 0.6 + uy * k * 0.7, py - uy * k * 0.6 - ux * k * 0.7].join(" "), fill: "#7a3fb0", "fill-opacity": out ? 0.35 : 0.85, stroke: "#7a3fb0", "stroke-width": r / 250 }));
      g.appendChild(sv("title", {}, "the formation's camera record 0 (the view at the start): at x " + c.x + ", y " + c.y + ", z " + c.z + ", looking at x " + c.fx + ", y " + c.fy + ", z " + c.fz +
        (out ? " (drawn at the edge: it stands outside the drawing)" : "")));
      svg.appendChild(g);
    }
    if (L.surrounded) {
      for (const w of L.enemies) {
        const p = L.places[w.place];
        svg.appendChild(sv("line", { x1: -w.x, y1: w.z, x2: -p.x, y2: p.z, stroke: PLACE_COLOURS[w.place], "stroke-opacity": 0.35, "stroke-width": r / 200 }));
      }
    }
    for (const m of ms) {
      const col = PLACE_COLOURS[m.slot];
      if (m.shift) {
        const g = sv("g", { class: "enback" });
        g.appendChild(sv("circle", { cx: -m.shift.x, cy: m.shift.z, r: r / 22, fill: "none", stroke: col, "stroke-width": r / 160, "stroke-dasharray": r / 70 + " " + r / 90 }));
        g.appendChild(sv("title", {}, "slot " + m.slot + "'s back-row spot: x " + m.shift.x + ", z " + m.shift.z));
        svg.appendChild(g);
      }
      if (m.home !== m.facing) svg.appendChild(tick(-m.x, m.z, m.home, col, true));
      svg.appendChild(tick(-m.x, m.z, m.facing, col, false));
      const over = L.surrounded && L.places[m.slot].over;
      const g = sv("g", { class: "enmember" });
      g.appendChild(sv("circle", { cx: -m.x, cy: m.z, r: r / 22, fill: col, stroke: over ? "#b42318" : "none", "stroke-width": r / 80 }));
      g.appendChild(sv("text", { x: -m.x, y: m.z + r / 50, "text-anchor": "middle", "font-size": r / 18, fill: "#fff" }, String(m.slot)));
      g.appendChild(sv("title", {}, (L.surrounded ? "place " : "slot ") + m.slot + (m.slot === 0 ? " (the leader)" : "") + ": x " + m.x + ", z " + m.z + ", " + turnText(m)));
      svg.appendChild(g);
    }
    L.enemies.forEach((w, i) => {
      const col = L.surrounded ? PLACE_COLOURS[w.place] : "currentColor";
      if (w.home !== w.facing) svg.appendChild(tick(-w.x, w.z, w.home, col, true));
      svg.appendChild(tick(-w.x, w.z, w.facing, col, false));
      const g = sv("g", { class: "enenemy" });
      g.appendChild(sv("rect", { x: -w.x - r / 34, y: w.z - r / 34, width: r / 17, height: r / 17, fill: "none", stroke: col, "stroke-width": r / 120 }));
      g.appendChild(sv("text", { x: -w.x + r / 26, y: w.z - r / 30, "text-anchor": "start", "font-size": r / 22, fill: "currentColor" }, String(i + 1)));
      g.appendChild(sv("title", {}, "row " + (i + 1) + ": " + w.who + (L.surrounded ? " (place " + w.place + ")" : "") + ", x " + w.x + ", y " + w.y + ", z " + w.z + ", " + turnText(w)));
      svg.appendChild(g);
    });
    return { svg, clamped };
  };

  // ---- (3D formation view, stage 3) the 3D block beside the diagram ----------------------------------------------------------
  // Drawn by modelview.js (MV.compose, MV.prepare, MV.attachScene) from the scene's models, which ONE call of the route
  // (/api/formation/models, the app's formation.models) gives per scene: the scene memo below holds the request's promise from
  // the moment it is sent, so the four formation sections of a scene form (drawn in one synchronous pass) share one call.
  // The block is a <details> (open by default, the fold remembered until the page closes); closed it does nothing, open its route
  // call is made at once, and the first frame waits until the canvas is on screen. The scene memo is capped in bytes and never
  // shared with the Model panel's `memo` / `widget`. Reload forgets it (EN.modelForget).
  const SCENE_MEMO_BYTES = 64 * 1024 * 1024;        // the decoded pixels + 64 a vertex + 32 a triangle of each model of each entry
  const SCENE_MEMO_ENTRIES = 4;
  const GAME_LAST = 369;                            // the route takes model numbers 0-369 (370 and over are location models or a mod's)
  const sceneMemo = new Map();                      // canonical refs -> {key, promise, answer, bytes}; insertion order = least recently used first
  const sceneBlocks = new Set();                    // the live blocks {el, canvas, entry, w, ...}
  const sceneStats = { calls: 0, builds: 0, detached: 0 };
  let sceneOpen = true;                             // the fold, kept between formations (Q4: open by default)
  const refKey = (r) => (r.folder !== undefined ? "f:" + low(r.folder) + ":" + (r.slot | 0) + ":" + (r.dll ? 1 : 0) : "n:" + r.number);
  const refBody = (r) => (r.folder !== undefined ? { folder: r.folder, slot: r.slot | 0, dll: !!r.dll } : { number: r.number });
  const answerBytes = (a) => {
    let n = 0;
    for (const m of a.models || []) {
      if (!m.model) continue;
      for (const p of m.model.parts || []) n += 64 * Math.floor((p.xyz ? p.xyz.length : 0) / 3) + 32 * (p.tris ? p.tris.length : 0);
      for (const t of m.model.textures || []) if (t._rgba) n += t._rgba.length;
    }
    return n;
  };
  // A block whose element has left the page is let go: its widget detached and its mesh dropped. One that was never attached yet is
  // left a moment (a form is made whole before it is attached: the four sections of a scene are made in one pass).
  const ORPHAN_MS = 2000;
  const nowMs = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  EN.sceneSweep = function () {
    const t = nowMs();
    for (const b of [...sceneBlocks]) {
      if (b.el.isConnected) { b.seen = true; continue; }
      if (b.seen || t - b.born > ORPHAN_MS) { b.stop(); sceneBlocks.delete(b); sceneStats.detached++; }
    }
  };
  const sceneTrim = () => {
    const used = new Set();
    for (const b of sceneBlocks) if (b.entry) used.add(b.entry);
    const total = () => { let n = 0; for (const e of sceneMemo.values()) n += e.bytes; return n; };
    for (const [k, e] of [...sceneMemo]) {
      if (sceneMemo.size <= SCENE_MEMO_ENTRIES && total() <= SCENE_MEMO_BYTES) break;
      if (!e.answer || used.has(e)) continue;
      sceneMemo.delete(k);
    }
  };
  // The entry of a scene's refs: made (and its call sent) the first time, the same one for every later look
  const sceneEntry = function (H, refs) {
    const key = refs.map(refKey).join("|");
    let e = sceneMemo.get(key);
    if (e) { sceneMemo.delete(key); sceneMemo.set(key, e); return e; }
    e = { key, answer: null, bytes: 0, promise: null };
    const MV = root.SpellExtModelView;
    sceneStats.calls++;
    e.promise = H.api("/api/formation/models", { refs: refs.map(refBody) }).then((a) => {
      for (const m of a.models || []) if (m.model && MV) MV.decodeTextures(m.model);
      e.answer = a;
      e.bytes = answerBytes(a);
      sceneTrim();
      return a;
    }, (err) => { if (sceneMemo.get(key) === e) sceneMemo.delete(key); throw err; });
    e.promise.catch(() => {});
    sceneMemo.set(key, e);
    sceneTrim();
    return e;
  };
  EN.sceneModels = (H, refs) => sceneEntry(H, refs).promise;
  // (for the smoke tests: the counters, the live blocks, the memo, and the fold's state, which setOpen sets without a click)
  EN.sceneTest = { stats: sceneStats, blocks: () => [...sceneBlocks], memo: () => [...sceneMemo.values()], open: () => sceneOpen, setOpen: (b) => { sceneOpen = !!b; } };

  const CAMERA_WORDS = "The game's start view is the formation's camera record 0 as the battle's own camera shows it (field of view 2 atan(240/1024), about 26.4 degrees on the picture's height, " +
    "near plane 250), here as the game's picture at 4:3 (FFNx aspect_ratio 0); a wide mode shows more at the sides.";
  const FRAME_WORDS = "Each enemy is drawn in frame 0 of its idle only, where the formation puts it (x, y, z and the starting facing); the party as markers in the diagram's slot colours " +
    "(a post 1,000 tall with a pointer on top showing the way it faces); a floor grid at y 0, one tile 1,000 units, and a dark disc on the floor under each fighter; no battle stage. " +
    "Every row is drawn, including rows the battle may hide at the start (not traced). A dashed line and the y words mark an enemy 50 or more above or below the floor.";
  const GAME_WORDS = "This is the start view of the scene.bin read here: a DLL scene numbered 0-254 in your config, or an active mod's own scene.bin, replaces it in the game.";

  const scene3d = function (H, L, refs, getSize) {
    const h = H.h;
    const MV = root.SpellExtModelView;
    const game = !!(refs && refs.game);
    const given = Array.isArray(refs) ? refs : [];
    const send = given.filter((r) => r.folder !== undefined || (r.number >= 0 && r.number <= GAME_LAST));
    const det = h("details", { class: "enfm3d" }, h("summary", { text: "3D view" }));
    if (sceneOpen) det.setAttribute("open", "");
    const body = h("div", { class: "enfm3dbody" });
    det.appendChild(body);
    const block = { el: det, entry: null, w: null, mesh: null, meta: null, born: nowMs(), seen: false, observer: null, timer: null, noFrames: false, visible: false, asked: false, answer: null, error: null,
                    size: getSize, stop: () => {}, redrawNow: null, canvas: null };
    const stop = () => {
      if (block.w) { block.w.detach(); block.w = null; }
      if (block.observer) { block.observer.disconnect(); block.observer = null; }
      if (block.timer) { clearTimeout(block.timer); block.timer = null; }
      block.mesh = null; block.meta = null; block.redrawNow = null; block.visible = false;
    };
    block.stop = stop;
    if (!MV || !MV.attachScene) {
      body.appendChild(h("div", { class: "muted", text: "The 3D view needs modelview.js, which this page did not load." }));
      return { el: det, resize() {}, block };
    }
    const canvas = h("canvas", { class: "enfm3dcanvas", width: String(MV.ASPECT[0]), height: String(MV.ASPECT[1]), tabindex: "0",
      "aria-label": "the formation in 3D, frame 0 of each enemy's idle: drag to turn, shift-drag or right-drag to pan, click then the wheel to zoom" });
    block.canvas = canvas;
    const bGame = h("button", { text: "Game's start view", title: "the formation's camera record 0 (what the player sees as the battle opens)" });
    const b34 = h("button", { text: "3/4 view", title: "from a little above and to the side, round the fighters" });
    const reset = h("button", { text: "Reset view", title: "back to the game's start view (a double click on the picture does the same)" });
    const hint = h("span", { class: "muted", text: " Drag: turn. Shift-drag or right-drag: pan. Click the view, then the wheel zooms. Arrow keys, + - and 0 when it has the focus." });
    const drawn = h("div", { class: "muted enfm3ddrawn" });
    const notes = h("div", { class: "enfm3dnotes" });
    const frameNotes = h("div", { class: "enfm3dframe" });
    const info = h("div", { class: "enfm3dinfo" });
    const status = h("div", { class: "muted enfm3dstatus", text: sceneOpen && send.length ? "reading the models..." : "" });
    body.appendChild(canvas);
    body.appendChild(h("div", { class: "enfm3dbar" }, bGame, b34, reset));
    body.appendChild(h("div", { class: "enfm3dhint" }, hint));
    body.appendChild(drawn);
    body.appendChild(status);
    body.appendChild(notes);
    body.appendChild(frameNotes);
    body.appendChild(info);
    const mine = (s) => s.charAt(0).toUpperCase() + s.slice(1) + (/[.:)]$/.test(s) ? "" : ".");

    // the spec MV.compose takes, from the layout, the answer (or its failure) and the party's size
    const specOf = (size) => {
      const a = block.answer;
      const ms = a ? a.models || [] : [];
      const rows = L.enemies.map((e, k) => {
        const label = String(k + 1);
        const r = { model: -1, x: e.x, y: e.y, z: e.z, facing: e.facing, label, why: null };
        if (game && e.model === 0xffff) { r.why = "an empty row inside the first rows (a gap)"; return r; }
        if (game && e.model > GAME_LAST) { r.why = "model " + e.model + " is a location model or a mod's (" + (GAME_LAST + 1) + " or more): not drawn"; return r; }
        if (!send.length) { r.why = refs && refs.why ? refs.why : given.length ? "the scene's models were not asked for" : "no models given"; return r; }
        if (block.error) { r.why = "the scene's models could not be read: " + block.error; return r; }
        if (!a) { r.why = "the scene's models are not read yet"; return r; }
        const i = ms.findIndex((m) => (game ? m.ref && m.ref.number === e.model : m.ref && m.ref.folder !== undefined && low(m.ref.folder) === low(e.who)));
        if (i < 0) { r.why = game ? "model " + e.model + " is not one of the scene's models" : "enemy " + e.who + " is not one of the scene's enemies"; return r; }
        const m = ms[i];
        if (!(m.model && m.model.parts && m.model.parts.length)) {
          r.why = "model " + (m.number_text || (game ? e.model : e.who)) + " cannot be drawn" + (m.problems && m.problems.length ? ": " + m.problems[0] : m.lines && m.lines.length ? ": " + m.lines[0] : "") ;
          return r;
        }
        r.model = i;
        return r;
      });
      const party = (function () {
        const m = L.party ? membersOf(L, size).filter((q) => q) : [];
        return m.map((q) => ({ x: q.x, y: q.y, z: q.z, facing: q.facing, slot: q.slot, colour: PLACE_COLOURS[q.slot],
                               ring: q.shift ? { x: q.shift.x, y: q.shift.y, z: q.shift.z } : null }));
      })();
      return { models: ms.map((m) => m.model || null), rows, party, camera: L.camera || null, floor: true };
    };
    const words = (meta) => {
      notes.innerHTML = "";
      const lines = [];
      if (block.answer) for (const n of block.answer.notes || []) lines.push(n);
      if (block.answer) for (const m of block.answer.models || []) if (!(m.model && m.model.parts && m.model.parts.length)) lines.push((m.number_text || "a model") + ": " + ((m.problems && m.problems[0]) || (m.lines && m.lines[0]) || "nothing to draw"));
      if (block.error) lines.push("the scene's models could not be read: " + block.error + " (the next redraw of the page asks again)");
      if (!send.length && refs && refs.why) lines.push(refs.why);
      for (const n of meta.notes) lines.push(n);
      for (const n of lines) notes.appendChild(h("div", { class: "ennote", text: "3D view: " + mine(n) }));
      info.innerHTML = "";
      info.appendChild(h("div", { class: "muted", text: FRAME_WORDS }));
      info.appendChild(h("div", { class: "muted", text: CAMERA_WORDS }));
      if (game) info.appendChild(h("div", { class: "muted enfm3dgame", text: GAME_WORDS }));
    };
    // a window that is never painted (the smoke tests' hidden window) gets no animation frames and no intersection report: the first
    // frame is then drawn at once (block.noFrames), as the Model block's is
    const syncDraw = () => block.noFrames || typeof requestAnimationFrame !== "function";
    const put = (r, cam, meta) => {
      const ctx = canvas.getContext("2d");
      if (canvas.width !== r.width) canvas.width = r.width;
      if (canvas.height !== r.height) canvas.height = r.height;
      const img = ctx.createImageData(r.width, r.height);
      img.data.set(r.rgba);
      ctx.putImageData(img, 0, 0);
      MV.drawOverlay(ctx, cam, r.width, r.height, meta);
    };
    const compose = () => {
      const spec = specOf(block.size());
      const c = MV.compose(spec);
      return { mesh: MV.prepare(c), meta: c.meta };
    };
    const buttons = (meta) => {
      bGame.disabled = !meta.camera;
      bGame.title = meta.camera ? "the formation's camera record 0 (what the player sees as the battle opens)" : "No game view: " + (L.camera_why || "the camera record cannot be used");
    };
    const build = () => {
      if (block.w || !det.open || !det.isConnected || !block.visible || !(block.answer || block.error || !send.length)) return;
      const c = compose();
      block.mesh = c.mesh; block.meta = c.meta;
      buttons(c.meta);
      status.textContent = "";
      const said = (r, ms) => {
        drawn.textContent = r.drawn + " of " + block.mesh.triangles + " triangle(s) drawn" + (ms !== null ? " in " + Math.round(ms) + " ms" : "") + ".";
        frameNotes.innerHTML = "";
        for (const n of r.notes) frameNotes.appendChild(h("div", { class: "ennote", text: "3D view: " + mine(n) }));
      };
      block.w = MV.attachScene(canvas, block.mesh, block.meta, { preset: "game", reset, onDraw: said });
      const sync = syncDraw();
      block.redrawNow = () => {
        const cam = block.w.camera();
        const r = MV.renderCamera(block.mesh, cam, canvas.width, canvas.height);
        put(r, cam, block.meta);
        said(r, null);
      };
      bGame.onclick = () => { block.w.preset("game"); if (sync) block.redrawNow(); };
      b34.onclick = () => { block.w.preset("three"); if (sync) block.redrawNow(); };
      if (sync) block.redrawNow();
      sceneStats.builds++;
      words(c.meta);
    };
    const visible = () => {
      if (block.visible || block.observer || !det.open) return;
      if (typeof IntersectionObserver !== "function" || (typeof document !== "undefined" && document.visibilityState === "hidden")) { block.visible = true; block.noFrames = true; build(); return; }
      let reported = false;
      const o = new IntersectionObserver((list) => {
        reported = true;
        if (!list.some((x) => x.isIntersecting)) return;
        o.disconnect();
        if (block.timer) { clearTimeout(block.timer); block.timer = null; }
        if (block.observer === o) block.observer = null;
        block.visible = true;
        build();
      });
      block.observer = o;
      o.observe(canvas);
      // an observer that reports nothing at all (not even "not on screen") belongs to a window that is never painted
      block.timer = setTimeout(() => {
        block.timer = null;
        if (reported || block.observer !== o) return;
        o.disconnect();
        block.observer = null;
        block.visible = true;
        block.noFrames = true;
        build();
      }, 600);
    };
    const ask = () => {
      if (block.asked) return;
      block.asked = true;
      if (!send.length) { visible(); return; }
      const e = sceneEntry(H, send);
      block.entry = e;
      e.promise.then((a) => { if (block.entry === e) { block.answer = a; block.error = null; } }, (err) => { block.error = (err && err.message) || String(err); })
        .then(() => { status.textContent = ""; if (det.isConnected) block.seen = true; if (det.isConnected || block.error) visible(); });
    };
    det.addEventListener("toggle", () => {
      sceneOpen = det.open;
      if (det.open) { if (!block.asked) ask(); } else { stop(); block.asked = false; status.textContent = ""; }
    });
    sceneBlocks.add(block);
    if (sceneOpen) ask();
    else { buttons({ camera: L.camera }); }
    return {
      el: det,
      block,
      // the party's size changed: compose again (no route call), keep the view
      resize() {
        if (!block.w || !block.meta) return;
        const c = compose();
        block.mesh = c.mesh; block.meta = c.meta;
        block.w.setMesh(c.mesh, c.meta);
        buttons(c.meta);
        words(c.meta);
        if (syncDraw()) block.redrawNow();
      },
    };
  };

  // the drawing with its party-size switch, the 3D block beside it, and the words under them; `refs` are the models the 3D block
  // asks for: a scene file's [{folder, slot, dll}] (with `.why`, the words when there are none) or a game battle's [{number}]
  // (with `.game = true`); without them every row of the 3D block is a placeholder
  EN.layoutView = function (H, L, refs) {
    const h = H.h;
    const box = h("div", { class: "enfmview" });
    if (!L.drawn) { box.appendChild(h("div", { class: "err", text: "Not drawn: " + L.problem })); return box; }
    const sel = h("select", { class: "enfmsize", title: "the party's size: the game places 3, 2 and 1 members differently" });
    PARTY_SIZES.forEach(([, , label], i) => sel.appendChild(h("option", { value: String(i), text: label })));
    sel.value = String(partySize);
    const pic = h("div", { class: "enfmpic" });
    const list = h("div", { class: "enfmlist" });
    EN.sceneSweep();
    const three = scene3d(H, L, refs, () => Number(sel.value));
    const draw = () => {
      const i = Number(sel.value);
      pic.innerHTML = "";
      list.innerHTML = "";
      const { svg, clamped } = EN.layoutSvg(L, i);
      pic.appendChild(svg);
      for (const m of membersOf(L, i)) {
        list.appendChild(h("div", {}, h("span", { class: "dotc", style: "background:" + PLACE_COLOURS[m.slot] }),
          (L.surrounded ? "place " : "slot ") + m.slot + (m.slot === 0 ? " (leader)" : "") + ": x " + m.x + ", y " + m.y + ", z " + m.z + ", " + turnText(m) +
          (m.shift ? "; back-row spot z " + m.shift.z : "")));
      }
      L.enemies.forEach((w, k) => list.appendChild(h("div", { class: "enfmfoe" }, "row " + (k + 1) + " " + w.who + (w.model !== 0 ? " (model " + w.model + ")" : "") +
        ": x " + w.x + ", y " + w.y + ", z " + w.z + ", row " + w.line + (w.cover ? ", cover " + w.cover : "") + ", " + turnText(w))));
      if (L.camera) {
        const c = L.camera;
        list.appendChild(h("div", { class: "enfmcam" + (clamped ? " clamped" : "") }, "The formation's camera record 0 (the view at the start" + (L.camera_from ? "; of " + L.camera_from : "") + "): at x " + c.x + ", y " + c.y + ", z " + c.z +
          ", looking at x " + c.fx + ", y " + c.fy + ", z " + c.fz + (clamped ? " - it stands outside the drawing, which shows it at its edge" : "") + "."));
      } else list.appendChild(h("div", { class: "enfmcam muted", text: "No camera drawn (the formation's camera record 0, the view at the start): " + L.camera_why + "." }));
      list.appendChild(h("div", { class: "muted", text: ROWS_TEXT[L.rows] + "." }));
      for (const n of L.notes) list.appendChild(h("div", { class: "ennote enfmnote", text: n.charAt(0).toUpperCase() + n.slice(1) + "." }));
    };
    sel.addEventListener("change", () => { partySize = Number(sel.value); draw(); three.resize(); });
    box.appendChild(h("div", { class: "enfmbar" }, "Party: ", sel, h("span", { class: "muted", text: " Seen from above: the front (-z) at the top, +x to the LEFT (as the game shows it). A solid tick is the facing at the start, a dashed one the home direction." })));
    box.appendChild(pic);
    box.appendChild(three.el);
    box.appendChild(list);
    draw();
    return box;
  };

  // the scene's whole enemy list for the 3D block (the core gives it: scene_refs, and scene_refs_why when there is none)
  const sceneRefs = (v) => {
    const r = Array.isArray(v.en.scene_refs) ? v.en.scene_refs.slice() : [];
    r.why = v.en.scene_refs_why || null;
    return r;
  };

  // A formation of a scene file's form: its layout for every kind; for kind = surrounded the triangle's own words too
  EN.formation = function (H, v, s) {
    const h = H.h;
    const m = /^formation ([0-3])$/.exec(s.name || "");
    if (!m || !v.en.surrounded || !v.en.surrounded.length) return null;
    const f = Number(m[1]);
    const x = v.en.surrounded[f];
    const L = (v.en.formations || [])[f] || null;
    const own = effSec(v, s.name);
    const copy = f && !(own && effKey(own, "kind")) ? " (formation " + f + " has no kind of its own: formation 0's)" : "";
    if (!x.surrounded) {
      const box = h("details", { class: "enfm", open: "" }, h("summary", { text: "Where everyone stands at the start: " + (L && L.name ? L.name : x.kind) + copy }));
      if (x.keys_given.length) box.appendChild(h("div", { class: "ennote", text: "kind is " + x.kind + copy + ": " + x.keys_given.join(" and ") +
        " are read and checked for every kind, and used only with kind = surrounded." }));
      if (L) box.appendChild(EN.layoutView(H, L, sceneRefs(v)));
      return box;
    }
    const t = x.triangle;
    const box = h("div", { class: "ensur enfm" });
    box.appendChild(h("h4", { text: "kind = surrounded" + copy }));
    box.appendChild(h("p", { class: "muted", text: "The game plays it as a normal battle; the DLL then turns the actors: party place k (0 the leader, 1 and 2 the others) stands at " +
      "party_radius " + t.radius + " from the arena's origin in the direction party_front + 120 k (" + t.front + ", " + ((t.front + 120) % 360) + ", " + ((t.front + 240) % 360) +
      " degrees; 0 is the stage's front, -z), facing out. Each enemy belongs to the place nearest its bearing (a tie: the lower place) and faces it; " +
      "a place takes at most 2 (the DLL refuses the scene otherwise)." }));
    if (t.problem) { box.appendChild(h("div", { class: "err", text: "Not drawn: " + t.problem + " (see the problems)" })); return box; }
    if (L) box.appendChild(EN.layoutView(H, L, sceneRefs(v)));
    const list = h("div", { class: "ensurlist" });
    for (const p of t.places) {
      const names = p.rows.map((i) => "row " + (i + 1) + " " + t.rows[i].enemy).join(", ");
      list.appendChild(h("div", { class: p.over ? "err" : "" }, h("span", { class: "dotc", style: "background:" + PLACE_COLOURS[p.place] }),
        "place " + p.place + (p.place === 0 ? " (leader)" : "") + " at " + p.angle + " degrees (x " + p.x + ", z " + p.z + "): " +
        p.count + " enem" + (p.count === 1 ? "y" : "ies") + (names ? ": " + names : "") + (p.over ? " - more than 2: the DLL refuses the scene" : "")));
    }
    box.appendChild(list);
    return box;
  };
  EN.surround = EN.formation;     // (the name of stage C2)

  // ---- (formation diagrams) the Game formations page: every battle of the scene.bin read, read only ---------------------
  EN.gamePage = async function (H, el) {
    const h = H.h;
    el.innerHTML = "";
    el.appendChild(h("div", { class: "muted", text: "reading the scene.bin..." }));
    let G;
    try { G = await H.api("/api/game/formations"); } catch (e) { el.innerHTML = ""; el.appendChild(h("div", { class: "err", text: e.message || String(e) })); return; }
    el.innerHTML = "";
    const head = h("div", { class: "gfhead" });
    head.appendChild(h("div", { class: "gfline" + (G.problem ? " err" : ""), text: "Read from " + G.line + "." }));
    head.appendChild(h("div", { class: "muted", text: G.set ? "This scene.bin was chosen in Settings in place of the game folder's (Settings can clear it)."
      : "The game folder's scene.bin (Settings can name another one)." }));
    for (const [name, where] of G.mods || []) {
      head.appendChild(h("div", { class: "ennote gfmod", text: "An active 7th Heaven mod carries its own battle\\scene.bin: " + name + " (" + where + "). When the game is given that file " +
        "(its option folders were not judged here), it plays that file's formations, not the ones read here." }));
    }
    if (G.mods_why) head.appendChild(h("div", { class: "muted gfmod", text: G.mods_why + "." }));
    el.appendChild(head);
    if (G.problem) return;
    const kind = h("select", { class: "gfkind" }, h("option", { value: "", text: "every kind" }));
    G.kinds.forEach((n, k) => kind.appendChild(h("option", { value: String(k), text: k + " " + n })));
    const filled = h("input", { type: "checkbox", class: "gffilled", checked: "" });
    const find = h("input", { type: "search", class: "gffind", placeholder: "enemy name or battle number" });
    const listEl = h("div", { class: "gflist" });
    const view = h("div", { class: "gfview" }, h("p", { class: "muted", text: "Pick a battle on the left." }));
    const show = async (b) => {
      [...listEl.children].forEach((x) => x.classList.toggle("on", x.dataset.battle === String(b)));
      view.innerHTML = "";
      let x;
      try { x = await H.api("/api/game/formation?" + new URLSearchParams({ battle: String(b) }).toString()); } catch (e) { view.appendChild(h("div", { class: "err", text: e.message || String(e) })); return; }
      if (x.problem) { view.appendChild(h("div", { class: "err", text: x.problem })); return; }
      const L = x.layout;
      view.appendChild(h("h3", { text: "Battle " + x.battle + " (scene " + x.scene + ", formation " + x.formation + ")" }));
      view.appendChild(h("p", { class: "muted", text: "Kind " + L.kind + " (" + (L.name || "?") + "), stage " + x.stage + ", next battle " + (x.next === 0xffff ? "none" : x.next) +
        ", escape counter " + x.escape + ", set-up flags " + ("000" + x.flags.toString(16)).slice(-4) + ". Read only: the game's own data, shown, never written." }));
      const refs = Array.isArray(x.refs) ? x.refs.slice() : [];
      refs.game = true;
      view.appendChild(EN.layoutView(H, L, refs));
    };
    const fill = () => {
      listEl.innerHTML = "";
      const k = kind.value;
      const q = find.value.trim().toLowerCase();
      for (const b of G.battles) {
        const [battle, sc, f, kd, stage, n, names] = b;
        if (filled.checked && !n) continue;
        if (k !== "" && String(kd) !== k) continue;
        if (q && !(String(battle) === q || names.toLowerCase().includes(q))) continue;
        listEl.appendChild(h("div", { class: "gfrow", "data-battle": String(battle), title: "scene " + sc + ", formation " + f + ", stage " + stage, onclick: () => show(battle) },
          h("span", { class: "gfnum", text: String(battle) }), h("span", { class: "gfkindname", text: kd < G.kinds.length ? G.kinds[kd] : "kind " + kd }),
          h("span", { class: "gfnames", text: n ? names : "(no enemy)" })));
      }
      if (!listEl.children.length) listEl.appendChild(h("div", { class: "muted", text: "No battle matches." }));
    };
    kind.addEventListener("change", fill);
    filled.addEventListener("change", fill);
    find.addEventListener("input", fill);
    el.appendChild(h("div", { class: "gfbar" }, kind, h("label", {}, filled, " with enemies only"), find,
      h("span", { class: "muted", text: " " + G.battles.length + " battles" })));
    el.appendChild(h("div", { class: "gfsplit" }, listEl, view));
    fill();
    EN.gameShow = show;
  };

  // ---- (model preview, stage 4) the Model block of an enemy file's form: READ ONLY ------------------------------------
  // The route (/api/enemy/model, the app's enemy.model) describes the model the enemy's effective model key names, file
  // by file, with the tool's words for anything missing; modelview.js draws it. The canvas is CANVAS x CANVAS pixels,
  // scaled by CSS (never by the screen's pixel ratio: every bound of the renderer is per canvas pixel). The last model
  // shown is kept (memo) while the route says it is the same (its digest); Reload forgets it (EN.modelForget).
  const CANVAS = 400;
  let memo = null;           // {name, digest, answer, mesh}
  let widget = null;         // the canvas widget shown (detached when another takes its place)
  EN.modelForget = function () { memo = null; sceneMemo.clear(); EN.sceneSweep(); };
  EN.model = function (H, v) {
    const h = H.h;
    const name = v.en.name;
    const box = h("details", { class: "enmodel", open: "" }, h("summary", { text: "Model" }));
    const body = h("div", { class: "enmodelbody" }, h("div", { class: "muted", text: "reading the model's files..." }));
    box.appendChild(body);
    const ask = (have) => H.api("/api/enemy/model?" + new URLSearchParams(have ? { name, have } : { name }).toString());
    const kept = memo && memo.name === name ? memo : null;
    // (review F4, minor 2) the memo an answer of `same` stands for is taken when that answer comes, and passed on: another
    // block's answer that replaces `memo` in between cannot slip in
    ask(kept ? kept.digest : null).then((a) => {
      const m = memo;
      if (!a.same) return [a, null];
      return m && m.digest === a.digest ? [a, m] : ask(null).then((b) => [b, null]);
    }).then(([a, m]) => {
      if (!box.isConnected) return;          // the form was drawn again meanwhile: a newer block shows it
      let mesh = null;
      if (a.same && m) {
        a = m.answer;
        mesh = m.mesh;
      } else {
        const MV = root.SpellExtModelView;
        mesh = a.model && MV ? MV.prepare(a.model) : null;
        memo = { name, digest: a.digest, answer: a, mesh };
      }
      EN.modelShow(H, box, a, mesh);
    }).catch((e) => {
      body.innerHTML = "";
      body.appendChild(h("div", { class: "err", text: "The model could not be described: " + (e.message || String(e)) }));
    });
    return box;
  };
  const upper = (t) => t.charAt(0).toUpperCase() + t.slice(1) + (/[.:)]$/.test(t) ? "" : ".");
  EN.modelShow = function (H, box, a, mesh) {
    const h = H.h;
    const MV = root.SpellExtModelView;
    if (widget) { widget.detach(); widget = null; }
    box.querySelector("summary").textContent = "Model: " + (a.number_text || "none");
    const body = box.querySelector(".enmodelbody");
    body.innerHTML = "";
    const pic = h("div", { class: "enmodelpic" });
    const info = h("div", { class: "enmodelinfo" });
    body.appendChild(pic);
    body.appendChild(info);
    const drawn = h("div", { class: "muted enmodeldrawn" });
    const mvNotes = h("div", { class: "enmodelmv" });
    if (mesh && MV && mesh.triangles) {
      const canvas = h("canvas", { class: "enmodelcanvas", width: String(CANVAS), height: String(CANVAS), tabindex: "0",
        "aria-label": "the model " + (a.number_text || "") + " drawn in frame 0 of its first animation: drag to turn it, the wheel zooms" });
      const reset = h("button", { text: "Reset view", title: "back to the first view (a double click on the picture does the same)" });
      pic.appendChild(canvas);
      pic.appendChild(h("div", { class: "enmodelbar" }, reset, h("span", { class: "muted", text: " Drag: turn. Wheel: zoom. Arrow keys, + - and 0 when it has the focus." })));
      pic.appendChild(drawn);
      const said = (r, ms) => {
        drawn.textContent = r.drawn + " of " + mesh.triangles + " triangle(s) drawn" + (ms !== null ? " in " + Math.round(ms) + " ms" : "") + ".";
        mvNotes.innerHTML = "";
        for (const n of mesh.notes.concat(r.notes)) mvNotes.appendChild(h("div", { class: "ennote", text: "Preview: " + upper(n) }));
      };
      // the first frame at once (a window that is not shown has no animation frames), then the widget
      const r = MV.render(mesh, MV.DEFAULT_VIEW, CANVAS, CANVAS);
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(r.width, r.height);
      img.data.set(r.rgba);
      ctx.putImageData(img, 0, 0);
      said(r, null);
      widget = MV.attach(canvas, mesh, { reset, onDraw: said });
    } else {
      const skel = a.skeleton !== null;
      pic.appendChild(h("div", { class: "enmodelnone muted", text: skel && mesh ? "Nothing to draw: the files read hold no part to draw (see the lines beside)." :
        "Not drawn: " + (skel ? "the model could not be prepared." : a.number_text ? "no skeleton (aa) was read: see the lines beside." : "the enemy names no model.") }));
      if (mesh) for (const n of mesh.notes) mvNotes.appendChild(h("div", { class: "ennote", text: "Preview: " + upper(n) }));
    }
    info.appendChild(h("div", { class: "enmodelnum" }, h("b", { text: a.number_text || "No model" }),
      a.counts ? " - " + a.counts.bones + " bone(s), " + a.counts.parts + " part(s), " + a.counts.triangles + " triangle(s), " + a.counts.textures + " texture(s)" : ""));
    for (const t of a.lines) info.appendChild(h("div", { class: "ennote enmodelline", text: upper(t) }));
    for (const t of a.problems) info.appendChild(h("div", { class: "err enmodelprob", text: upper(t) }));
    for (const t of a.notes) info.appendChild(h("div", { class: "ennote enmodelnote", text: upper(t) }));
    info.appendChild(mvNotes);
    if (a.files.length) {
      info.appendChild(h("h4", { text: "Where each file comes from" }));
      const tbl = h("table", { class: "enmodelfiles" }, h("tr", {}, h("th", { text: "file" }), h("th", { text: "from" }), h("th", { text: "over" })));
      for (const f of a.files) {
        tbl.appendChild(h("tr", { class: f.from === null || f.problem ? "bad" : "" }, h("td", {}, h("code", { text: f.file })),
          h("td", {}, f.from === null ? h("span", { class: "err", text: "none" }) : f.from, f.mark ? h("span", { class: "muted", text: " [" + f.mark + "]" }) : null,
            f.problem ? h("div", { class: "err", text: "could not be read: " + f.problem }) : null),
          h("td", { class: "muted", text: f.over.length ? f.over.join(", ") : "-" })));
      }
      info.appendChild(tbl);
    }
    info.appendChild(h("h4", { text: "Where the files are looked for" }));
    for (const t of a.sources) info.appendChild(h("div", { class: "muted enmodelsrc", text: upper(t) }));
    info.appendChild(h("h4", { text: "Not shown" }));
    for (const t of a.not_shown) info.appendChild(h("div", { class: "muted enmodelnot", text: upper(t) }));
    info.appendChild(h("div", { class: "muted", text: "Read only: this panel reads the model's files and writes nothing. Reload reads them again." }));
  };

  // ---- Check this scene, Check all scenes (the scene builds of the check, stage C1) ----------------------------------
  function lineList(H, files) {
    const h = H.h;
    const box = h("div", { class: "encheckres" });
    const rows = [];
    for (const [f, ps] of Object.entries(files || {})) for (const p of ps) rows.push(p);
    if (!rows.length) box.appendChild(h("div", { class: "muted", text: "Nothing to say: no registered scene names it (the start-up scan does not read it, or no scene's enemies key names this enemy)." }));
    for (const p of rows) {
      box.appendChild(h("div", { class: "prob" + (p.kind !== "problem" ? " tool" : "") + (/ builds \(forecast\)/.test(p.text) ? " okline" : ""),
        title: p.file + (p.line ? " line " + p.line : "") + ": click to open", onclick: () => H.openFile(p.file, p.line || null) },
        (p.kind === "problem" ? "" : p.kind === "tool" ? "(tool) " : "(" + p.kind + ") ") + p.text));
    }
    return box;
  }
  EN.checkBar = function (H, v) {
    const h = H.h;
    const out = h("div", { class: "enresult" });
    const scene = v.en.kind === "scene";
    const one = h("button", { text: scene ? "Check this scene" : "Check the scenes that use this enemy",
      title: "builds it as the DLL does when one of its battles is handed over (the files as they stand here, unsaved edits included)",
      onclick: async () => {
        out.textContent = "checking...";
        try {
          const r = await H.api("/api/scene/check" + "?" + new URLSearchParams(scene ? { name: v.en.name } : { enemy: v.en.name }).toString());
          out.innerHTML = "";
          if (r.result === null) out.appendChild(h("div", { class: "muted", text: "enemies = off in the game file: the DLL reads no scene." }));
          else out.appendChild(lineList(H, r.result));
        } catch (e) { out.textContent = ""; H.fail(e); }
      } });
    const all = h("button", { text: "Check all scenes", title: "builds every registered scene, with a count", onclick: () => EN.checkAll(H, out) });
    return h("div", { class: "encheck" }, h("div", { class: "addkey" }, one, all), out);
  };
  EN.checkAll = async function (H, out) {
    const h = H.h;
    out.innerHTML = "";
    const bar = h("div", { class: "muted", text: "checking..." });
    out.appendChild(bar);
    let start = 0, total = null;
    const counts = { built: 0, refused: 0, "not forecast": 0 };
    const bad = [];
    try {
      while (total === null || start < total) {
        const r = await H.api("/api/scene/range" + "?" + new URLSearchParams({ start: String(start), count: "50" }).toString());
        if (r === null) { bar.textContent = "enemies = off in the game file: the DLL reads no scene."; return; }
        total = r.total;
        for (const x of r.results) {
          counts[x.verdict]++;
          if (x.verdict !== "built") bad.push(x);
        }
        start += 50;
        bar.textContent = "checked " + Math.min(start, total) + " of " + total + " scene(s)";
        await new Promise((res) => setTimeout(res, 0));
      }
    } catch (e) { bar.textContent = ""; H.fail(e); return; }
    bar.textContent = "Check all scenes: " + total + " registered scene(s): " + counts.built + " build, " + counts.refused + " refused, " +
      counts["not forecast"] + " not forecast (each as any of its battles would log it).";
    const files = {};
    for (const x of bad) for (const l of x.lines) (files[l.file] = files[l.file] || []).push(l);
    if (bad.length) out.appendChild(lineList(H, files));
  };

  root.SpellExtEnPage = EN;
})(typeof window !== "undefined" ? window : globalThis);
