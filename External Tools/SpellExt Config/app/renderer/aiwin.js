/* The focused editor for one AI section: the script on the left, what it does in plain English on the right
   (decompiled by the server's sxcfg/aiexplain.py as you type). It edits the main page's text through
   window.opener.spellextAI, so the card and the Whole file view follow; it is read-only for the game's AI. */
"use strict";
(function () {
  const $ = (s) => document.querySelector(s);
  const P = new URLSearchParams(location.search);
  const EI = parseInt(P.get("e"), 10), SEC = parseInt(P.get("s"), 10);
  const W = { body: "", readonly: true, lines: [], timer: null, sendTimer: null, sent: null, src: {} };
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
      e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    return e;
  };
  function toast(msg, bad) {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast on" + (bad ? " bad" : "");
    setTimeout(() => (t.className = "toast"), bad ? 6000 : 3000);
  }
  const main = () => { try { return window.opener && !window.opener.closed ? window.opener.spellextAI : null; } catch (e) { return null; } };
  const norm = (s) => (s || "").replace(/\s+$/, "");

  function banner(text) { $("#wbanner").innerHTML = ""; if (text) $("#wbanner").appendChild(h("div", { class: "banner warn", text })); }

  function pull(force) {
    const m = main();
    if (!m) { W.readonly = true; $("#wtext").readOnly = true; banner("The main page is closed or reloaded: this window can only show the text it has."); return; }
    const c = m.get(EI, SEC);
    if (!c) { banner("This section has no script now (it was removed, or another file was opened)."); W.readonly = true; $("#wtext").readOnly = true; return; }
    if (W.file && c.file !== W.file) { banner("The main page now shows another file (" + c.file + "): this window stays on what it had, read only."); W.readonly = true; $("#wtext").readOnly = true; return; }
    W.file = c.file;
    banner(c.shared_with && c.shared_with.length ? "This script is shared with: " + c.shared_with.join(", ") + ". An edit here changes it for all of them." : "");
    document.title = c.title + " - " + c.file;
    $("#wtitle").textContent = c.title + "  (" + c.name + ", " + c.section + ")";
    $("#wsub").textContent = c.file + " · entry " + c.entry + " · " + c.note;
    W.readonly = !!c.readonly;
    $("#wtext").readOnly = W.readonly;
    $("#wstate").textContent = W.readonly ? "read only (the game's AI: use New file from this on the main page)" : "edits go to the main page; Save there";
    if (force || (norm(c.body) !== norm($("#wtext").value) && norm(c.body) !== norm(W.sent))) {
      $("#wtext").value = c.body;
      W.body = c.body;
      W.name = c.name;
      W.kernel = c.kernel_id;
      paintCode();
      explain();
    }
  }

  async function explain() {
    try {
      const j = await api("/api/ai/explain", { body: $("#wtext").value, section: W.name, kernel_id: W.kernel });
      showExplain(j);
    } catch (e) { toast(e.message || String(e), true); }
  }

  function showExplain(j) {
    $("#wlegend").textContent = j.legend || "";
    const el = $("#wlines");
    el.innerHTML = "";
    W.lines = j.lines || [];
    W.src = {};
    if (!j.ok) {
      el.appendChild(h("div", { class: "wline bad", text: "The text does not assemble" + (j.error_line > 0 ? " (line " + j.error_line + ")" : "") + ": " + j.error }));
      paintCode([], j.error_line > 0 ? [j.error_line] : []);
      return;
    }
    W.lines.forEach((l, k) => {
      for (const s of l.src) (W.src[s] = W.src[s] || []).push(k);
      el.appendChild(h("div", { class: "wline k-" + l.kind, "data-k": k, style: "padding-left:" + (0.4 + l.indent * 1.6) + "em",
        onmouseenter: () => highlight(k), onclick: () => { highlight(k); jumpCode(l.src); } }, l.text));
    });
    paintCode();
  }

  function paintCode(hl, bad) {
    const ta = $("#wtext");
    const lines = ta.value.split("\n");
    const g = $("#wgutter"), b = $("#wback");
    g.textContent = lines.map((_, i) => i + 1).join("\n") + "\n";
    b.innerHTML = "";
    const hs = new Set(hl || []), bs = new Set(bad || []);
    lines.forEach((t, i) => b.appendChild(h("div", { class: "bl" + (hs.has(i + 1) ? " hl" : "") + (bs.has(i + 1) ? " bad" : "") }, t || " ")));
    syncScroll();
  }
  function syncScroll() {
    const ta = $("#wtext");
    $("#wgutter").scrollTop = ta.scrollTop;
    $("#wback").scrollTop = ta.scrollTop;
    $("#wback").scrollLeft = ta.scrollLeft;
  }
  function highlight(k) {
    document.querySelectorAll(".wline.hl").forEach((e) => e.classList.remove("hl"));
    const ks = Array.isArray(k) ? k : [k];
    let src = [];
    for (const x of ks) {
      const e = document.querySelector('.wline[data-k="' + x + '"]');
      if (e) e.classList.add("hl");
      if (W.lines[x]) src = src.concat(W.lines[x].src);
    }
    document.querySelectorAll("#wback .bl").forEach((e, i) => e.classList.toggle("hl", src.includes(i + 1)));
  }
  function jumpCode(src) {
    if (!src || !src.length) return;
    const ta = $("#wtext");
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 18;
    ta.scrollTop = Math.max(0, (src[0] - 4) * lh);
    syncScroll();
  }
  function caretLine() {
    const ta = $("#wtext");
    return ta.value.slice(0, ta.selectionStart).split("\n").length;
  }
  function fromCode() {
    const ln = caretLine();
    const ks = W.src[ln] || [];
    highlight(ks);
    const first = document.querySelector('.wline[data-k="' + ks[0] + '"]');
    if (first) first.scrollIntoView({ block: "nearest" });
  }

  function onInput() {
    paintCode();
    clearTimeout(W.timer);
    W.timer = setTimeout(explain, 350);
    if (W.readonly) return;
    clearTimeout(W.sendTimer);
    W.sendTimer = setTimeout(async () => {
      const m = main();
      if (!m) return pull();
      W.sent = $("#wtext").value;
      try { await m.set(EI, SEC, W.sent); $("#wstate").textContent = "sent to the main page (not saved yet)"; }
      catch (e) { toast(e.message || String(e), true); }
    }, 700);
  }

  // the library panel: Insert puts the recipe at this window's cursor (start of its line)
  let library = null;
  // the page's URL paths -> the IPC routes (the preload's one channel); only the routes this window uses
  async function api(path, body) {     // a declaration: explain() above may run before this line
    const route = { "/api/ai/library": "ai.library", "/api/ai/recipe": "ai.recipe", "/api/ai/explain": "ai.explain" }[path.split("?")[0]];
    if (!route) throw new Error("tool bug: this window has no route for " + path);
    const r = await window.spellext.invoke(route, body);
    if (r.refused !== undefined) throw new Error(r.refused);
    if (r.bug !== undefined) throw new Error("tool bug: " + r.bug);
    return r.ok;
  }
  $("#wlibbtn").addEventListener("click", () => {
    const p = $("#wlib");
    p.hidden = !p.hidden;
    if (!p.hidden && !library) library = SpellExtLibrary.mount(p, { api, toast, insert: (text) => {
      if (W.readonly) throw new Error("this section is read only here");
      const ta = $("#wtext");
      const pos = ta.selectionStart || 0;
      const at = ta.value.lastIndexOf("\n", pos - 1) + 1;
      ta.value = ta.value.slice(0, at) + text + ta.value.slice(at);
      ta.setSelectionRange(at + text.length, at + text.length);
      onInput();
      toast("Inserted (it goes to the main page; Save there)");
    } });
  });

  window.addEventListener("message", (ev) => {
    if (ev.origin !== location.origin || !ev.data || ev.data.type !== "spellext-ai-changed") return;
    pull(false);
  });
  const ta = $("#wtext");
  ta.addEventListener("input", onInput);
  ta.addEventListener("scroll", syncScroll);
  ta.addEventListener("click", fromCode);
  ta.addEventListener("keyup", (e) => { if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") fromCode(); });
  pull(true);
  window.spellextWindow = { ready: true };
})();
