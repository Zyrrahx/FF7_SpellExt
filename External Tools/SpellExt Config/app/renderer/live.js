/* The Live tables page: the running game's tables, read through the server's /api/live/* (GET only; the server
   reads /proc/<pid>/mem and never writes). The game's own tables on the left first, then the SpellExt DLL's from
   its directory record. The host gives: api(path) (a GET when called with one argument) and toast(msg, bad). */
"use strict";
window.SpellExtLive = (function () {
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
      e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    return e;
  };
  const q = (o) => "?" + new URLSearchParams(o).toString();
  const hex8 = (n) => (n === null || n === undefined) ? "-" : Number(n).toString(16).padStart(8, "0");
  const AUTO_MS = 2000;

  const L = { host: null, root: null, status: null, list: null, pick: null, view: null, from: 0, rows: 64,
              raw: false, empty: false, auto: false, timer: null, section: 9, tab: "rows", shown: false, busy: false };

  function get(path) { return L.host.api(path); }

  // ---- the status strip ------------------------------------------------------------------------------------
  function drawStatus() {
    const el = L.root.querySelector("#livestatus");
    el.innerHTML = "";
    const st = L.status;
    if (!st) return;
    const line = (cls, text) => el.appendChild(h("div", { class: "livebar " + cls, text }));
    if (st.stopped) line("warn", "The game stopped since the last look.");
    if (!st.running) {
      line("info", "FF7 is not running. Start it as you always do; this page only reads its memory (it never starts or changes it).");
      return;
    }
    line(st.mem === "ok" ? "ok" : "bad", "FF7 running (pid " + st.pid + "); memory: " +
      (st.mem === "ok" ? "readable" : st.mem) + (st.ptrace_scope !== null && st.ptrace_scope !== undefined ? "; ptrace_scope " + st.ptrace_scope : ""));
    if (st.mem !== "ok") {
      line("bad", st.mem_text || "the memory could not be read");
      return;
    }
    const dll = st.dll || {};
    if (dll.directory) {
      const d = dll.directory;
      line("ok", "SpellExt DLL at " + hex8(dll.base) + " (from " + (dll.base_from || "?") + "), directory at " + hex8(d.address) +
        " found by " + ({ exports: "the export table", log: "the log line", scan: "the marker scan" }[dll.found_by] || dll.found_by) + ", version " + d.version + ", " +
        d.entries + " entries, generation " + d.generation + " (refreshed at tick " + d.refreshed + "), config " + d.config);
    } else if (dll.rebuilding) {
      line("warn", "The DLL is rebuilding its tables (a Re-init or a kernel load): refresh again.");
    } else {
      line("warn", "No SpellExt directory: the installed DLL is older than this page (built before 2026-10-27), or it " +
        "is not loaded. The game's own tables still show. " + (dll.why || []).join("; "));
      el.appendChild(h("button", { text: "Scan the DLL's image for its directory", title: "Slow: reads the whole image (up to 5 s)",
        onclick: async () => {
          try { const f = await get("/api/live/find" + q({ what: "directory" })); L.host.toast(f.message, f.found === null); if (f.found !== null) refresh(); }
          catch (e) { L.host.toast(e.message, true); }
        } }));
    }
    const chips = h("div", { class: "livechips" });
    for (const k of st.kernel_pointers || [])
      chips.appendChild(h("span", { class: "chip " + (k.owner || "bad"), title: k.error || hex8(k.address),
        text: k.title + ": " + (k.owner === "dll" ? "DLL" : k.owner || "?") }));
    const tx = st.texts_loaded ? "loaded" : st.texts_ffnx ? "held by FFNx" : "not loaded";
    chips.appendChild(h("span", { class: "chip " + (st.texts_loaded ? "exe" : "other"), title: st.texts_text || "",
      text: "texts: " + tx + (!st.texts_loaded && st.texts_from ? ", names from " + st.texts_from : "") }));
    if (st.mode) chips.appendChild(h("span", { class: "chip", text: "mode " + st.mode.savemap_mode + (st.mode.paused ? ", paused / timer held" : "") }));
    if (st.exe_base_ok === false) chips.appendChild(h("span", { class: "chip other", text: "no MZ at 00400000" }));
    el.appendChild(chips);
  }

  // ---- the list --------------------------------------------------------------------------------------------
  function drawList() {
    const el = L.root.querySelector("#livelist");
    el.innerHTML = "";
    if (!L.list) {
      el.appendChild(h("p", { class: "muted pad", text: "Nothing to list: " + (L.status && L.status.running ? "the memory is not readable." : "the game is not running.") }));
      return;
    }
    const all = L.list.vanilla.concat(L.list.spellext);
    for (const g of L.list.groups) {
      const items = all.filter((t) => t.group === g);
      el.appendChild(h("h4", { text: g }));
      if (!items.length && g.startsWith("SpellExt"))
        el.appendChild(h("div", { class: "muted pad", text: L.list.rebuilding ? "being rebuilt: refresh again" : "no directory: none listed" }));
      for (const t of items) {
        const use = t.in_use_live !== null && t.in_use_live !== undefined ? t.in_use_live : t.in_use;
        const dot = t.live === true ? "on" : t.live === false ? "off" : "";
        el.appendChild(h("div", { class: "item" + (L.pick === t.id ? " on" : ""), "data-id": t.id, title: (t.note || "") + (t.error ? " " + t.error : ""),
          onclick: () => pick(t.id) },
          dot ? h("span", { class: "dot " + dot, title: dot === "on" ? "the game reads this table" : "the game does not read it" }) : null,
          t.title,
          t.kind === "table" && t.count !== null && t.count !== undefined ? h("span", { class: "tag", text: (use !== null && use !== undefined ? use + " / " : "") + t.count }) : null,
          t.valid === "battle" ? h("span", { class: "tag warn", text: "battle only" }) : t.valid === "game" ? h("span", { class: "tag", text: "in a game" }) : null));
      }
    }
  }

  // ---- one table -------------------------------------------------------------------------------------------
  function pick(id) {
    if (L.pick !== id) { L.pick = id; L.from = 0; L.tab = "rows"; }
    drawList();
    loadTable();
  }

  async function loadTable() {
    if (!L.pick) return;
    const p = { id: L.pick, from: L.from, count: L.rows, raw: L.raw ? 1 : 0 };
    if (L.pick === "kernel2_texts") p.section = L.section;
    try {
      L.view = await get("/api/live/table" + q(p));
      if (L.view.rebuilt) L.host.toast(L.view.message, true);
      if (L.view.stopped) L.host.toast(L.view.stopped, true);
      drawTable();
    } catch (e) { stopAuto(); L.host.toast(e.message, true); }
  }

  function head(v) {
    const parts = [];
    if (v.address !== undefined && v.address !== null) parts.push("address " + hex8(v.address));
    if (v.record_size) parts.push("record " + v.record_size + " bytes" + (v.record_size_shown ? " (shown as rows of " + v.record_size_shown + ")" : ""));
    if (v.count !== undefined) parts.push(v.count + " records");
    if (v.in_use_live !== undefined && v.in_use_live !== null) parts.push(v.in_use_live + " in use (read live)");
    else if (v.in_use !== undefined && v.in_use !== null) parts.push(v.in_use + " in use");
    if (v.live === true) parts.push("the game reads it"); else if (v.live === false) parts.push("the game does not read it");
    return parts.join(", ");
  }

  function drawTable() {
    const el = L.root.querySelector("#liveview");
    el.innerHTML = "";
    const v = L.view;
    if (!v) { el.appendChild(h("p", { class: "muted pad", text: "Pick a table on the left." })); return; }
    const bar = h("div", { class: "filebar" }, h("span", { class: "filetitle", text: v.title }), h("span", { class: "muted", text: head(v) }));
    el.appendChild(bar);
    el.appendChild(h("div", { class: "livenote" }, h("span", { class: "badge", text: "valid " + (v.valid_text || v.valid) }),
      v.moved ? h("span", { class: "badge", text: v.moved }) : null, v.note ? " " + v.note : null,
      v.layout_message ? h("div", { class: "warntext", text: v.layout_message }) : null,
      v.message ? h("div", { class: "warntext", text: v.message }) : null));
    if (v.kind === "values") return drawValues(el, v);
    const comparable = (L.list && L.list.vanilla.find((t) => t.id === v.id) || {}).comparable;
    const tabs = h("div", { class: "tabs" });
    for (const [k, t] of [["rows", "Rows"]].concat(comparable ? [["compare", "Compare"]] : []))
      tabs.appendChild(h("button", { class: L.tab === k ? "on" : "", text: t, onclick: () => { L.tab = k; drawTable(); } }));
    const nav = h("div", { class: "livenav" }, tabs);
    if (L.tab === "rows") {
      const total = v.count_shown !== undefined ? v.count_shown : v.count || 0;
      const go = (f) => { L.from = Math.max(0, Math.min(f, Math.max(total - 1, 0))); loadTable(); };
      const fromBox = h("input", { type: "number", min: 0, value: v.from || 0, class: "num" });
      fromBox.addEventListener("change", () => go(parseInt(fromBox.value, 10) || 0));
      const rowsBox = h("select", {}, ...[16, 32, 64, 128, 256].map((n) => h("option", { value: n, text: n + " rows", selected: n === L.rows })));
      rowsBox.addEventListener("change", () => { L.rows = parseInt(rowsBox.value, 10); loadTable(); });
      nav.append(h("button", { text: "First", onclick: () => go(0) }), h("button", { text: "Previous", onclick: () => go((v.from || 0) - L.rows) }),
        h("span", { class: "muted", text: "from" }), fromBox, rowsBox,
        h("button", { text: "Next", onclick: () => go((v.from || 0) + L.rows) }), h("button", { text: "Last", onclick: () => go(total - L.rows) }));
      if (v.kind === "texts") {
        const sec = h("select", {}, ...(v.sections || []).map((t, i) => h("option", { value: i, text: i + ": " + t, selected: i === v.section })));
        sec.addEventListener("change", () => { L.section = parseInt(sec.value, 10); L.from = 0; loadTable(); });
        nav.append(sec);
      } else {
        const rawBox = h("input", { type: "checkbox", checked: L.raw });
        rawBox.addEventListener("change", () => { L.raw = rawBox.checked; loadTable(); });
        const emptyBox = h("input", { type: "checkbox", checked: L.empty });
        emptyBox.addEventListener("change", () => { L.empty = emptyBox.checked; drawTable(); });
        nav.append(h("label", {}, rawBox, " Raw hex"), h("label", {}, emptyBox, " Show empty"));
      }
    }
    el.appendChild(nav);
    const body = h("div", { class: "livebody" });
    el.appendChild(body);
    if (L.tab === "compare") return drawCompare(body, v);
    if (v.kind === "texts") return drawTexts(body, v);
    drawRows(body, v);
  }

  function drawValues(el, v) {
    const t = h("table", { class: "livetable" }, h("tr", {}, h("th", { text: "what" }), h("th", { text: "address" }), h("th", { text: "value" })));
    for (const r of v.values) t.appendChild(h("tr", {}, h("td", { text: r.label }), h("td", { class: "mono", text: hex8(r.address) }),
      h("td", { class: "mono" + (r.error ? " bad" : ""), text: r.error || r.value })));
    el.appendChild(h("div", { class: "livebody" }, t));
  }

  function drawTexts(body, v) {
    if (!v.texts_loaded) return;
    const t = h("table", { class: "livetable" }, h("tr", {}, h("th", { text: "#" }), h("th", { text: "text" })));
    for (const r of v.rows) t.appendChild(h("tr", {}, h("td", { class: "mono", text: String(r.index) }), h("td", { text: r.text === null ? "" : r.text })));
    body.appendChild(t);
  }

  function drawRows(body, v) {
    const rows = v.rows || [];
    if (!rows.length) { body.appendChild(h("p", { class: "muted", text: "No rows." })); return; }
    const fields = rows[0].fields.map((f) => f.name);
    const t = h("table", { class: "livetable" });
    t.appendChild(h("tr", {}, h("th", { text: "#" }), h("th", { text: "id" }), h("th", { text: "name" }), ...fields.map((f) => h("th", { text: f })),
      fields.length ? null : h("th", { text: "bytes" })));
    const span = 3 + Math.max(fields.length, 1);
    let i = 0;
    while (i < rows.length) {
      const r = rows[i];
      if (r.empty && !L.empty) {
        let j = i;
        while (j + 1 < rows.length && rows[j + 1].empty) j++;
        t.appendChild(h("tr", { class: "folded" }, h("td", { colspan: span, text: j > i ? "rows " + rows[i].index + ".." + rows[j].index + " empty (all ff)" : "row " + r.index + " empty (all ff)" })));
        i = j + 1;
        continue;
      }
      t.appendChild(h("tr", {}, h("td", { class: "mono", text: String(r.index) }), h("td", { class: "mono", text: r.id === null || r.id === undefined ? "" : String(r.id) }),
        h("td", { text: r.name || "" }), ...r.fields.map((f) => h("td", { class: "mono", title: f.raw === null || f.raw === undefined ? null : String(f.raw), text: f.value })),
        fields.length ? null : h("td", { class: "mono hex", text: r.hex || "" })));
      if (r.hex && fields.length) t.appendChild(h("tr", { class: "hexrow" }, h("td", {}), h("td", { colspan: span - 1, class: "mono hex", text: r.hex })));
      i++;
    }
    body.appendChild(t);
  }

  async function drawCompare(body, v) {
    body.appendChild(h("p", { class: "muted", text: "Comparing (the live table is the truth; the other side is what was loaded or chosen)..." }));
    try {
      const c = await get("/api/live/compare" + q({ id: v.id }));
      body.innerHTML = "";
      for (const k of c.comparisons) {
        body.appendChild(h("h3", { text: k.with }));
        if (k.message) { body.appendChild(h("p", { class: "muted", text: k.message })); continue; }
        body.appendChild(h("p", { text: k.agree + " agree, " + k.differ + " differ" }));
        for (const l of k.lines) body.appendChild(h("div", { class: "mono" }, "record " + l.record + (l.name ? " (" + l.name + ")" : "") + ": " + l.text));
      }
      if (!c.comparisons.length) body.appendChild(h("p", { class: "muted", text: c.message || "nothing to compare" }));
      else if (c.message) body.appendChild(h("div", { class: "warntext", text: c.message }));
    } catch (e) { body.innerHTML = ""; body.appendChild(h("p", { class: "bad", text: e.message })); }
  }

  // ---- refresh ---------------------------------------------------------------------------------------------
  async function refresh() {
    if (L.busy) return;
    L.busy = true;
    try {
      L.status = await get("/api/live/status");
      drawStatus();
      if (L.status.running && L.status.mem === "ok") {
        L.list = await get("/api/live/tables");
        drawList();
        if (L.pick) await loadTable();
      } else {
        L.list = null;
        drawList();
        if (!L.status.running) stopAuto();
      }
    } catch (e) {
      // a refusal (the reader's own words: no game, the kernel refused, the helper missing on Windows) is shown in
      // the status strip, not only in a toast
      stopAuto();
      L.status = null;
      L.list = null;
      const st = L.root.querySelector("#livestatus");
      st.innerHTML = "";
      st.appendChild(h("div", { class: "livebar bad", text: e.message }));
      const li = L.root.querySelector("#livelist");
      li.innerHTML = "";
      li.appendChild(h("p", { class: "muted pad", text: "Nothing to list." }));
    } finally { L.busy = false; }
  }

  function stopAuto() {
    L.auto = false;
    if (L.timer) clearInterval(L.timer);
    L.timer = null;
    const b = L.root && L.root.querySelector("#liveauto");
    if (b) b.checked = false;
  }

  function startAuto() {
    stopAuto();
    L.auto = true;
    L.root.querySelector("#liveauto").checked = true;
    L.timer = setInterval(async () => {
      if (document.hidden || !L.shown || L.busy) return;     // never while the tab is hidden
      try {
        L.status = await get("/api/live/status");
        drawStatus();
        if (!L.status.running || L.status.mem !== "ok") { stopAuto(); return; }
        await loadTable();                                    // only the shown window is read again
      } catch (e) { stopAuto(); L.host.toast(e.message, true); }
    }, AUTO_MS);
  }

  function mount(root, host) {
    L.root = root;
    L.host = host;
    root.querySelector("#liverefresh").addEventListener("click", refresh);
    root.querySelector("#liveauto").addEventListener("change", (e) => (e.target.checked ? startAuto() : stopAuto()));
    drawTable();
  }

  function show() { L.shown = true; refresh(); }
  function hide() { L.shown = false; stopAuto(); }

  return { mount, show, hide };
})();
