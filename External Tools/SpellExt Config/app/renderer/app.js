/* SpellExt Config: the page. All logic is in the main process's library (app/core); this shows it and sends edits
   through window.spellext.invoke (the preload's one channel). No framework. Adapted from the Python tool's page
   (sxcfg/static/app.js): the URL paths are mapped to the IPC routes in one table (ROUTE_OF), the first screen and the
   Save preview are new (design 3.1, 1.6). */
"use strict";
(function () {
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") e.className = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false)
      e.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    return e;
  };

  // the Python page's URL paths -> the IPC routes (design 1.3); a query string becomes body fields
  const ROUTE_OF = {
    "/api/state": "app.state", "/api/schema": "schema.get", "/api/file": "file.open", "/api/diff": "file.diff",
    "/api/check": "check.run", "/api/log": "log.read", "/api/file/raw": "file.raw", "/api/file/edit": "file.edit",
    "/api/file/save": "file.save", "/api/file/save_all": "file.save_all", "/api/file/reload": "file.reload",
    "/api/file/apply_text": "file.apply_text",
    "/api/ai/list": "ai.list", "/api/ai/open": "ai.open", "/api/ai/overview": "ai.overview", "/api/ai/library": "ai.library",
    "/api/ai/check": "ai.check", "/api/ai/save": "ai.save", "/api/ai/from_kernel": "ai.from_kernel",
    "/api/ai/kernel_choose": "ai.kernel_choose", "/api/ai/kernel_pick": "ai.kernel_pick", "/api/ai/cards": "ai.cards",
    "/api/ai/card_edit": "ai.card_edit", "/api/ai/recipe": "ai.recipe", "/api/ai/explain": "ai.explain",
    "/api/ai/set_character": "ai.set_character",
    "/api/live/status": "live.status", "/api/live/tables": "live.tables", "/api/live/table": "live.table",
    "/api/live/compare": "live.compare", "/api/live/find": "live.find",
  };
  async function invoke(route, body) {
    const r = await window.spellext.invoke(route, body);
    if (r && r.refused !== undefined) throw new Error(r.refused);
    if (r && r.bug !== undefined) { const e = new Error("tool bug: " + r.bug); e.bugStack = r.stack; throw e; }
    return r.ok;
  }
  async function api(path, body) {
    const [p, qs] = path.split("?");
    const route = ROUTE_OF[p] || (p.startsWith("app.") ? p : null);
    if (!route) throw new Error("tool bug: the page has no route for " + p);
    let b = body;
    if (qs) b = Object.assign(Object.fromEntries(new URLSearchParams(qs)), body || {});
    return invoke(route, b);
  }
  window.SpellExtInvoke = invoke;
  const q = (o) => "?" + new URLSearchParams(o).toString();

  let toastTimer = null;
  let toastBackup = null;        // a Save's backup folder: a click on the toast shows it (app.show_backup)
  function toast(msg, bad, backup) {
    const t = $("#toast");
    toastBackup = backup || null;
    t.textContent = msg + (backup ? "\n(click: show the backup folder)" : "");
    t.className = "toast on" + (bad ? " bad" : "") + (backup ? " link" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = "toast"), bad ? 7000 : 3500);
  }
  const fail = (e) => toast(e.message || String(e), true);
  // what the DLL logs as a problem is red; its notes and warnings, and the tool's own remarks, are amber
  const kindPrefix = (p) => (p.kind === "problem" ? "" : p.kind === "tool" ? "(tool) " : "(" + p.kind + ") ");

  // ---- state -----------------------------------------------------------------------------------------
  const S = { state: null, schema: null, file: null, view: null, section: null, tab: "form", page: "files",
              rawDirty: false, ai: null, aiDirty: false, allProblems: {}, timer: null,
              entry: null, expanded: new Set(), secTextOpen: false, advOpen: false,
              secDirty: null };          // Section text typed in and not applied: {path, first, last, label}
  const K = window.SpellExtKinds;
  const confirmSave = () => !S.state || !S.state.settings || S.state.settings.confirm_save !== false;

  function schemaFile(name) {
    if (!S.schema || !name) return null;
    for (const [k, v] of Object.entries(S.schema.files)) if (k.toLowerCase() === name.toLowerCase()) return v;
    return null;
  }
  function kindSpec(entry, kind) {
    if (!entry || !kind) return null;
    return (entry.sections || []).find((s) => s.kind === kind) || null;
  }
  function keySpec(kind, key) {
    if (!kind || !key) return null;
    const k = key.toLowerCase();
    for (const s of kind.keys || []) if (s.name === k || (s.aliases || []).includes(k)) return s;
    for (const s of kind.keys || []) if (s.prefix && k.startsWith(s.name)) return s;
    return null;
  }
  function restartBadge(spec) {
    if (!spec) return null;
    const out = [];
    if (spec.restart) out.push(h("span", { class: "badge " + spec.restart, title: (S.state.restart_text || {})[spec.restart] || "",
      text: { hot: "Re-init", first_reading: "start-up", restart: "restart", on_load: "at load", next_battle: "next battle" }[spec.restart] || spec.restart }));
    if (spec.testing_aid) out.push(h("span", { class: "badge aid", text: "testing aid" }));
    if (spec.undocumented) out.push(h("span", { class: "badge", text: "undocumented" }));
    return out;
  }

  // ---- banners, state ----------------------------------------------------------------------------------
  function banners() {
    const b = $("#banners");
    b.innerHTML = "";
    const st = S.state;
    if (!st) return;
    if (st.game_running) b.appendChild(h("div", { class: "banner warn",
      text: "FF7 is running. The DLL reads these files again on \"Re-init .ini files\" in its menu; keys marked start-up or restart keep the value the game started with. A NEW file (an .ai, a camera) is seen only after a restart." }));
    if (!st.writable) b.appendChild(h("div", { class: "banner bad", text: "The config folder is not writable: read-only mode (nothing can be saved)." }));
    if (st.schema && st.schema.bundled) b.appendChild(h("div", { class: "banner info",
      text: "Schema: the copy beside this tool (made for DLL source " + String(st.schema.dll_source_sha1 || "?").slice(0, 8) + "). If your DLL is newer, its rules may differ: the Game log page shows the DLL's own verdict." }));
    if ((st.changed_on_disk || []).length) b.appendChild(h("div", { class: "banner warn",
      text: "Changed on disk since it was opened here: " + st.changed_on_disk.join(", ") + ". Reload it, or Save to write your version over it (the file on disk is backed up first)." }));
    const dirty = st.dirty || [];
    document.title = (dirty.length ? "* " : "") + "SpellExt Config";
    $("#foldername").textContent = st.folder || "";
    $("#foldername").title = (st.config_dir || "") + "\nclick: open another folder";
  }
  async function refreshState() {
    S.state = await api("/api/state");
    banners();
    renderSidebar();
  }

  // ---- the sidebar (design 3.2): one entry per kind, a dirty dot and a red count of problems on each ----------
  // the DLL's problems (kind "problem") about a file; the fields reader's are filed under the default name
  function problemCount(path, fields) {
    const name = path.includes("/") ? path.split("/").pop() : path;
    let n = 0;
    for (const [f, ps] of Object.entries(S.allProblems || {})) {
      const mine = f.toLowerCase() === name.toLowerCase() ||
        (fields && f.toLowerCase() === K.FIELDS.toLowerCase() && name.toLowerCase() !== K.FIELDS.toLowerCase());
      if (mine) n += ps.filter((p) => p.kind === "problem").length;
    }
    return n;
  }
  function sidebarEntries() {
    return S.state && S.state.folder ? K.sidebar(S.state.files, S.state.fields_file) : [];
  }
  function renderSidebar() {
    const nav = $("#nav");
    nav.innerHTML = "";
    if (!S.state || !S.state.folder) return;
    let total = 0;
    for (const ps of Object.values(S.allProblems || {})) total += ps.filter((p) => p.kind === "problem").length;
    for (const e of sidebarEntries()) {
      let probs = 0, dirty = false;
      for (const f of e.files) { probs += problemCount(f.path, e.id === "fields"); if (f.dirty) dirty = true; }
      if (e.id === "problems") probs = total;
      const open = S.expanded.has(e.id);
      const on = S.entry === e.id && (e.page ? S.page === e.page : S.page === "files");
      nav.appendChild(h("div", { class: "entry" + (on ? " on" : "") + (e.missing ? " missing" : ""), "data-entry": e.id,
        title: e.missing ? e.missing + " is not in this folder" : e.files.length === 1 ? e.files[0].path : "",
        onclick: () => pickEntry(e) },
        h("span", { class: "twist", text: e.multi ? (open ? "▾" : "▸") : "" }),
        h("span", { class: "elabel", text: e.label }),
        dirty ? h("span", { class: "dot", title: "unsaved changes" }) : null,
        probs ? h("span", { class: "count", title: probs + " line(s) the DLL would complain about", text: String(probs) }) : null,
        e.multi ? h("span", { class: "ecount", text: String(e.files.length) }) : null,
        e.missing ? h("span", { class: "ecount", text: "none" }) : null));
      // a kind with two files (Spells and Spells_Test), and the files of a group when it is open
      const subs = e.multi ? (open ? e.files : []) : (e.files.length > 1 ? e.files : []);
      for (const f of subs) {
        const name = f.path.includes("/") ? f.path.split("/").pop() : f.path;
        const fp = problemCount(f.path, false);
        nav.appendChild(h("div", { class: "sub" + (S.page === "files" && S.file === f.path ? " on" : ""), "data-path": f.path,
          title: f.path + (f.read_by_dll ? "" : " (not read by the DLL)"), onclick: () => openFile(f.path) },
          h("span", { class: "elabel", text: name }),
          f.dirty ? h("span", { class: "dot", title: "unsaved changes" }) : null,
          fp ? h("span", { class: "count", text: String(fp) }) : null,
          e.id === "other" && !f.read_by_dll ? h("span", { class: "ecount", text: "not read" }) : null,
          f.readonly ? h("span", { class: "ecount", text: "view" }) : null));
      }
    }
  }
  function pickEntry(e) {
    if (e.multi) {
      if (S.expanded.has(e.id)) S.expanded.delete(e.id); else S.expanded.add(e.id);
    }
    if (e.page) { S.entry = e.id; showPage(e.page); return; }
    if (e.multi) { renderSidebar(); return; }
    if (e.missing) { toast(e.missing + " is not in this folder."); return; }
    openFile(e.files[0].path).catch(fail);
  }
  window.SpellExtPick = (id) => { const e = sidebarEntries().find((x) => x.id === id); if (e) pickEntry(e); };

  async function openFile(path, line) {
    const sec = await applySecText();
    if (!sec) return;
    if (sec === "moved" && path === S.file && line) {        // the problem's line is from before the apply
      line = null;
      toast("The Section text was applied first, and the lines moved: click again.");
    }
    if (S.rawDirty && !(await applyRaw())) return;
    try {
      S.view = await api("/api/file" + q({ path }));
      if (S.file !== path) { S.secTextOpen = false; S.advOpen = false; }
      S.file = path;
      S.section = null;
      if (line) S.section = sectionOfLine(line);
      const ent = K.entryOf(sidebarEntries(), path);
      if (ent) {
        S.entry = ent;
        const def = K.ENTRIES.find((x) => x.id === ent);
        if (def && def.group) S.expanded.add(ent);
      }
      showPage("files");
      renderFile();
      renderSidebar();
      if (line) setTimeout(() => jumpTo(line), 0);
    } catch (e) { fail(e); }
  }
  function sectionOfLine(line) {
    let pick = null;
    for (const s of S.view.outline) if (line >= (s.line || s.first) && line <= s.last) pick = s.line;
    return pick;
  }

  function setView(v) {
    S.view = v;
    S.rawDirty = false;
    S.secDirty = null;             // the Section text box is drawn again from the new text
    renderFile();
    // the sidebar's red counts follow the edit (the Forecast is of the files as they stand here)
    refreshState().then(refreshProblems).catch(fail);
  }

  function renderFile() {
    const v = S.view;
    if (!v) return;
    $("#filetitle").textContent = v.path + (v.dirty ? " *" : "");
    const entry = schemaFile(v.schema_name);
    $("#fileinfo").textContent = (entry ? entry.title + " · " : "") + (v.read_by_dll ? "" : "not read by the DLL · ") +
      (v.newline === "\\r\\n" ? "CRLF" : "LF") + (v.changed_on_disk ? " · CHANGED ON DISK" : "") + (v.readonly ? " · view only" : "") +
      (v.raw_refused && !v.readonly ? " · Raw is view only (" + v.raw_refused + ")" : "");
    $("#save").disabled = v.readonly || !S.state.writable;
    // the Form tab: the Game options for the game file, none for a file without a form (Raw and Changes only)
    const isGame = v.path.toLowerCase() === K.GAME.toLowerCase();
    const formBtn = $('#filetabs button[data-tab="form"]');
    formBtn.textContent = isGame ? "Options" : "Form";
    formBtn.hidden = !v.schema_name;
    if (!v.schema_name && S.tab === "form") setTab("raw");
    $("#formsplit").hidden = isGame;
    $("#gamepage").hidden = !isGame;
    if (isGame) renderGame(v);
    else { renderSections(); renderForm(); }
    $("#raw").value = v.text;
    $("#raw").readOnly = v.readonly || !!v.raw_refused;
    renderGutter($("#raw"), $("#gutter"), v.problems);
    renderProbs($("#fileprobs"), v.problems, (p) => afterSecText(() => jumpTo(p.line)));
    if (S.tab === "diff") loadDiff();
  }

  function sectionLabel(s, places) {
    const k = s.keys.find((x) => x.key && x.key.toLowerCase() === "name" && x.kind === (s.commented ? "commented" : "key"));
    if (k) return k.value;
    if (places && s.kind === "shop") {               // the shops file's own table of the game's shops
      const m = /^\[\s*(\d+)\s*\]$/.exec(s.header || "");
      if (m && places.has(Number(m[1]))) return places.get(Number(m[1]));
    }
    return "";
  }

  function renderSections() {
    const el = $("#sections");
    el.innerHTML = "";
    const v = S.view;
    const flat = v.grammar === "flat";
    const probsByLine = {};
    for (const p of v.problems) if (p.kind === "problem") probsByLine[p.line] = true;
    const places = v.schema_name && v.schema_name.toLowerCase() === "ff7_spellext_shops.ini" ? K.shopPlaces(v.text) : null;
    const ro = v.readonly || !S.state.writable;
    for (const s of K.listedSections(v)) {
      const isHead = s.header !== null;
      if (flat && isHead) continue;
      if (!isHead && !flat && !s.keys.length) continue;     // only comments before the first header
      const label = isHead ? (s.commented ? ";" : "") + s.header : (flat ? "(the whole file)" : "(before the first section)");
      const bad = isHead && !s.kind && v.schema_name && !flat;
      let hasProb = false;
      for (let i = s.first - (isHead ? 1 : 0); i <= s.last; i++) if (probsByLine[i]) hasProb = true;
      if (S.section === null && (isHead || flat || s.keys.length)) S.section = s.line;
      const badge = s.commented ? "commented" : K.kindBadge(s.kind);
      el.appendChild(h("div", { class: "sec" + (S.section === s.line ? " on" : "") + (bad || hasProb ? " refused" : "") +
          (s.commented ? " commented" : "") + (s.kind === "test" ? " testsec" : ""), "data-line": s.line,
        title: s.commented ? "commented out: the DLL skips these lines" : bad ? "the DLL refuses this header" : (hasProb ? "a line here has a problem" : ""),
        onclick: () => afterSecText(() => { S.section = s.line; renderSections(); renderForm(); }) },
        h("span", { class: "hdr", text: label }),
        badge ? h("span", { class: "kbadge " + badge, text: badge }) : null,
        s.leftover ? h("span", { class: "kbadge leftover", text: "leftover", title: "the characters file has no [" + s.group +
          "]: a character made at " + s.group + " would adopt this group (S6a, design 4.9)" }) : null,
        h("span", { class: "lbl", text: sectionLabel(s, places) }),
        s.commented && !ro ? h("button", { class: "uncom", text: "uncomment", title: "take the ; off each of its lines",
          onclick: async (ev) => {
            ev.stopPropagation();
            // asked first: the section chosen stays the one being edited when the box is applied, or kept
            if (!(await askSecText())) return;
            S.section = s.line;
            edit({ op: "uncomment_block", section_line: s.line }).catch(() => {});
          } }) : null));
    }
    if (!ro && v.grammar === "sections") {
      const inp = h("input", { type: "text", placeholder: "[3100]", title: "the new section's header, as the DLL reads it" });
      const cur = v.outline.find((x) => x.line === S.section && x.header !== null);
      const where = h("select", { title: "where the new section goes" }, h("option", { value: "end", text: "at the end" }),
        cur ? h("option", { value: "after", text: "after " + (cur.commented ? ";" : "") + cur.header }) : null);
      el.appendChild(h("div", { class: "addsec" }, inp, where, h("button", { text: "Add section", onclick: () => addSection(inp.value.trim(), where.value === "after" ? cur : null) })));
      const lk = window.SpellExtTemplates.kindOfFile(v.schema_name);
      if (lk) el.appendChild(h("div", { class: "addsec" }, h("button", { id: "addtemplate", text: "+ Add from template",
        title: "the Library's templates for this kind: a short form, a preview, then the lines added here", onclick: () => addFromTemplate(lk) })));
    }
  }

  // Add section: at the end (add_section, as the Python page), or after the chosen section through file.apply_text
  // (an insert: the new lines take the line endings of the line above them, design 1.6a), with a blank line before
  // the header when the line above is not blank and one after it, as the gap before the next section.
  async function addSection(header, after) {
    if (!(header.startsWith("[") && header.endsWith("]"))) return toast("a section header is [ ... ]", true);
    try {
      if (!after) {
        if (!(await edit({ op: "add_section", header }))) return;
        S.section = S.view.outline[S.view.outline.length - 1].line;
      } else {
        if (!(await askSecText())) return;
        const lines = K.splitRaw(S.view.text);
        const at = K.addAfterLine(after, S.view.outline);     // the new lines go after this line (1-based)
        const above = (lines[at - 1] || "").replace(/\r?\n$/, "");
        const text = (above.trim() === "" ? "" : "\n") + header + "\n" + (at < lines.length ? "\n" : "");
        try { setView(await invoke("file.apply_text", { path: S.file, first: at + 1, last: at, text })); } catch (e) { fail(e); return; }
        S.section = at + 1 + (above.trim() === "" ? 0 : 1);
      }
      renderSections();
      renderForm();
    } catch (e) { /* edit() has told it */ }
  }

  function widgetFor(spec, value, onset, disabled) {
    if (spec && spec.type === "bool") {
      const tw = (spec.true || []).map((w) => w.toLowerCase()), fw = (spec.false || []).map((w) => w.toLowerCase());
      const cur = (value || "").toLowerCase();
      const ti = tw.indexOf(cur), fi = fw.indexOf(cur);
      if (ti >= 0 || fi >= 0 || value === null) {
        const box = h("input", { type: "checkbox", disabled });
        box.checked = ti >= 0 || (value === null && tw.includes((spec.default || "").toLowerCase()));
        box.addEventListener("change", () => {
          // write the word the file already uses: true[i] <-> false[i]; the readme's first word for a new line
          const i = Math.max(ti, fi, 0);
          const pair = box.checked ? spec.true : spec.false;
          let w = pair[Math.min(i, pair.length - 1)];
          if (value && value === value.toUpperCase()) w = w.toUpperCase();
          onset(w);
        });
        return h("label", {}, box, " ", h("span", { class: "muted", text: value === null ? "not in the file (default " + (spec.default || "none") + ")" : value }));
      }
    }
    if (spec && spec.type === "enum" && spec.values) {
      const sel = h("select", { disabled });
      const cur = value === null ? null : value.toLowerCase();
      let found = false;
      if (value === null) sel.appendChild(h("option", { value: "", text: "(not in the file: " + (spec.default || "none") + ")" }));
      for (const group of spec.values) {
        for (const w of group) {
          const isCur = cur === w.toLowerCase();
          if (w !== group[0] && !isCur) continue;
          const o = h("option", { value: w, text: w + (w !== group[0] ? " (= " + group[0] + ")" : "") });
          if (isCur) { o.selected = true; found = true; }
          sel.appendChild(o);
        }
      }
      if (value !== null && !found) {
        const o = h("option", { value: value, text: value + " (not a value the DLL takes)" });
        o.selected = true;
        sel.insertBefore(o, sel.firstChild);
      }
      sel.addEventListener("change", () => { if (sel.value !== "") onset(sel.value); });
      return sel;
    }
    const inp = h("input", { type: "text", disabled, placeholder: value === null ? "not in the file" + (spec && spec.default ? " (default " + spec.default + ")" : "") : "" });
    inp.value = value === null ? "" : value;
    const commit = () => { if (inp.value !== (value === null ? "" : value)) onset(inp.value); };
    inp.addEventListener("change", commit);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    if (spec && spec.maxlen) inp.maxLength = 4096;
    return inp;
  }

  function helpText(spec) {
    if (!spec) return "No schema entry for this key: the DLL will say \"unknown key\" if it is not one of its own.";
    const bits = [];
    if (spec.help) bits.push(spec.help);
    const r = [];
    if (spec.type) r.push("type: " + spec.type);
    if (spec.min !== undefined && spec.max !== undefined) r.push("range " + spec.min + " to " + spec.max);
    if (spec.maxlen) r.push("at most " + spec.maxlen + " characters");
    if (spec.default !== undefined && spec.default !== "") r.push("absent = " + spec.default);
    if (spec.restart) r.push((S.state.restart_text || {})[spec.restart] || spec.restart);
    if (r.length) bits.push(r.join(" · "));
    if (spec.messages && spec.messages.length) bits.push("The DLL says when wrong: " + spec.messages.join(" | "));
    return bits.join("\n\n");
  }

  function renderForm() {
    const el = $("#form");
    el.innerHTML = "";
    const v = S.view;
    if (!v) return;
    if (!v.schema_name) {
      el.appendChild(h("p", { class: "muted", text: v.read_by_dll ? "This file has no form: edit it in the Raw tab." :
        "This file is not one of the DLL's config files (or is not read by it): edit it in the Raw tab." }));
      return;
    }
    const entry = schemaFile(v.schema_name);
    const flat = v.grammar === "flat";
    const s = v.outline.find((x) => x.line === S.section) || (flat ? v.outline[0] : null);
    if (!s) { el.appendChild(h("p", { class: "muted", text: "Pick a section on the left." })); return; }
    let kind = flat ? kindSpec(entry, "flat") : kindSpec(entry, s.kind);
    if (!kind && entry.grammar === "spell_names") kind = entry.sections[0];      // every line is read, headers or not
    const freeForm = !!kind && (!!kind.free_keys || !(kind.keys || []).length);
    const freeHelp = freeForm ? ((kind.free_keys && kind.free_keys.help) || entry.help || "") : "";
    const head = h("div", {}, h("h3", { text: (s.commented ? ";" : "") + (s.header || (flat ? entry.title : "(before the first section)")) }));
    if (s.commented) {
      head.appendChild(h("p", { class: "muted", text: "Commented out: the DLL skips these lines. Uncomment takes one ; off each of them " +
        "(a note, \"; text\", stays a comment)." }));
      if (!v.readonly) head.appendChild(h("button", { text: "Uncomment this section", onclick: () => edit({ op: "uncomment_block", section_line: s.line }) }));
    } else if (s.header && !kind) head.appendChild(h("p", { class: "err", text: "The DLL refuses this header: its lines are skipped. See the problem below." }));
    else if (kind && (kind.title !== (s.header || entry.title) || kind.id_range))
      head.appendChild(h("p", { class: "muted", text: (kind.title || "") + (kind.id_range ? " · IDs " + kind.id_range[0] + " to " + kind.id_range[1] : "") }));
    if (entry.help && flat) head.appendChild(h("p", { class: "muted", text: entry.help }));
    el.appendChild(head);
    if (s.linked) el.appendChild(linkedStrip(s));
    if (s.slots) el.appendChild(slotPanel(s, v.readonly));
    const probs = {};
    for (const p of v.problems) (probs[p.line] = probs[p.line] || []).push(p);
    const keys = flat ? v.outline.flatMap((x) => x.keys) : s.keys;
    const present = new Set();
    for (const k of keys) {
      const spec = keySpec(kind, k.key);
      // a key the section has under another spelling the DLL also reads (defence for defense) is present too
      if (k.kind !== "commented" && k.key) present.add(spec && !spec.prefix ? spec.name : k.key.toLowerCase());
      const lp = probs[k.line] || [];
      const row = h("div", { class: "row" + (lp.some((p) => p.kind === "problem") ? " bad" : "") + (k.kind === "commented" ? " commented" : "") +
        (spec && spec.testing_aid ? " aid" : "") + (!spec && !freeForm && k.kind === "key" ? " unknown" : ""), "data-line": k.line });
      const disabled = v.readonly || k.kind !== "key";
      row.appendChild(h("div", { class: "k" }, k.key || "(no =)", h("span", { class: "ln", text: "line " + k.line }), restartBadge(spec)));
      row.appendChild(h("div", { class: "v" }, k.kind === "nokey" ? h("span", { class: "err", text: "expected key = value" }) :
        widgetFor(spec, k.value, (val) => edit({ op: "set", line: k.line, value: val }), disabled),
        k.comment ? h("div", { class: "muted", text: k.comment }) : null));
      const acts = h("div", { class: "acts" },
        h("button", { text: "?", title: "help", onclick: () => row.classList.toggle("showhelp") }));
      if (!v.readonly) {
        if (s.commented) { /* the whole section is uncommented at once, above */ }
        else if (k.kind === "commented") acts.appendChild(h("button", { text: "uncomment", onclick: () => edit({ op: "uncomment", line: k.line }) }));
        else {
          acts.appendChild(h("button", { text: ";", title: "comment the line out (the DLL then skips it)", onclick: () => edit({ op: "comment", line: k.line }) }));
          acts.appendChild(h("button", { text: "remove", title: "remove the line", onclick: () => edit({ op: "remove", line: k.line }) }));
        }
      }
      row.appendChild(acts);
      row.appendChild(h("div", { class: "help", text: freeForm ? freeHelp : helpText(spec) }));
      for (const p of lp) row.appendChild(h("div", { class: "err", text: kindPrefix(p) + p.text }));
      el.appendChild(row);
    }
    if (!keys.length) el.appendChild(h("p", { class: "muted", text: "No key lines here yet." }));
    // the problems of this section's lines that have no row (its header, a line the form does not show), under the
    // header in the DLL's words; a click goes to the line in Raw
    const rowLines = new Set(keys.map((k) => k.line));
    const [r0, r1] = flat ? [1, Infinity] : K.sectionRange(s, v.outline);
    const loose = v.problems.filter((p) => p.line >= r0 && p.line <= r1 && !rowLines.has(p.line));
    if (loose.length) {
      const box = h("div", { class: "secprobs" });
      for (const p of loose) box.appendChild(h("div", { class: "err" + (p.kind !== "problem" ? " tool" : ""), title: "line " + p.line + ": click to see it in Raw",
        onclick: () => afterSecText(() => { setTab("raw"); gotoRawLine(p.line); }) }, "line " + p.line + ": " + kindPrefix(p) + p.text));
      head.after(box);
    }
    if (!s.commented) formAdders(el, v, s, kind, flat, freeForm, freeHelp, present);
    if (!flat) el.appendChild(sectionTextBox(v, s));
    if (s.commented) return;
    if (!v.readonly && s.header && !flat) {
      el.appendChild(h("div", { class: "addkey" }, h("button", { text: "Remove this section", onclick: () => removeSection(s) }), kind ? h("button", { text: "Comment this section out", title: "a ; before each of its lines: the DLL then skips the section",
        onclick: () => edit({ op: "comment_block", section_line: s.line }) }) : null,
        kind && /^\[\s*(0x[0-9a-fA-F]+|\d+)\s*\]$/.test(s.header) && window.SpellExtTemplates.kindOfFile(v.schema_name) &&
          window.SpellExtTemplates.kindOfFile(v.schema_name) !== "character" ?
          h("button", { id: "saveastemplate", text: "Save as template", title: "this section (and, if you like, the sections linked to it) as a template of your own, in " +
            "FF7_SpellExt_Templates.txt", onclick: () => afterSecText(() => window.SpellExtTemplates.saveAs(libHost(), v.path, s.line)) }) : null));
    }
  }

  // The Characters page's Linked strip (S6a, design 3.2): the character's limits group (each a link to the Limits page),
  // its AI file (a link to the AI page) or ai_like word, and the gear whose equip names it
  function linkedStrip(s) {
    const L = s.linked;
    const box = h("div", { class: "linked", id: "linked" }, h("b", { text: "Linked: " }));
    const limits = "FF7_SpellExt_Limits.ini";
    if (L.limits.length) {
      box.appendChild(h("span", { text: "limits " }));
      for (const g of L.limits) box.appendChild(h("button", { class: "link", text: g.header, title: limits + " line " + g.line,
        onclick: () => afterSecText(() => openFile(limits, g.line)) }));
    } else box.appendChild(h("span", { class: "muted", text: "no limits group of its own" }));
    if (L.ai && L.ai.key === "ai") {
      box.appendChild(h("span", { text: " · ai " }));
      box.appendChild(L.ai.exists || L.ai.pending ? h("button", { class: "link", text: L.ai.value + (L.ai.pending ? " (staged)" : ""),
        onclick: () => afterSecText(async () => { showPage("ai"); await openAI(L.ai.value); }) })
        : h("span", { class: "err", text: L.ai.value + " (no ai\\" + L.ai.value + ".ai)" }));
    } else if (L.ai) box.appendChild(h("span", { text: " · ai_like = " + L.ai.value }));
    else box.appendChild(h("span", { class: "muted", text: " · no AI" }));
    for (const g of L.gear) {
      box.appendChild(h("span", { text: " · " }));
      box.appendChild(h("button", { class: "link", text: g.file.replace(/^FF7_SpellExt_|\.ini$/g, "") + " " + g.header,
        title: g.file + " line " + g.line + ": its equip names this character", onclick: () => afterSecText(() => openFile(g.file, g.line)) }));
    }
    return box;
  }

  // Remove this section; a character with a limits group is asked whether the group goes too (design 4.9: one change
  // across both files)
  async function removeSection(s) {
    const n = (s.linked && s.linked.limits) || [];
    let with_limits = false;
    if (n.length) {
      const v = await modal("Remove " + s.header, [h("p", { text: "Remove " + s.header + " and its " + (s.last - s.line) + " line(s)? " +
        "It has " + n.length + " section(s) in FF7_SpellExt_Limits.ini (" + n.map((g) => g.header).join(", ") + "): a character " +
        "made at this ID later would adopt them. Nothing is written until Save." })],
        [["Remove both", "both", true], ["Only the character", "one"], ["Cancel", "no"]]);
      if (v === "no") return;
      with_limits = v === "both";
    } else if (!confirm("Remove " + s.header + " and its " + (s.last - s.line) + " line(s)? (Nothing is written until Save.)")) return;
    try {
      const done = await edit(Object.assign({ op: "remove_section", section_line: s.line }, with_limits ? { with_limits: true } : {}));
      if (done) { S.section = null; renderSections(); renderForm(); }
      if (done && with_limits) toast("Removed " + s.header + " and its limits group (not saved: Save all writes both files)");
    } catch (e) { /* edit() said why */ }
  }

  // Below the rows: for a free-form kind (fields, spell names) a line of any key; for the others Advanced (every key
  // of the kind the section does not have yet, with its default and help: one click adds the line with the section's
  // = column), the raw byte_/word_/dword_ keys by offset, and Add a key with any name (the DLL logs an unknown key
  // and reads on: the tool does not forbid what the DLL allows). Design 3.3.
  function formAdders(el, v, s, kind, flat, freeForm, freeHelp, present) {
    if (v.readonly || !S.state.writable || !kind) return;
    const sl = flat ? null : (s.line || null);
    if (freeForm) {
      const name = h("input", { type: "text", placeholder: (kind.free_keys && kind.free_keys.form || "key = value").split("=")[0].trim() || "key", size: 22 });
      const val = h("input", { type: "text", placeholder: "value", size: 24 });
      el.appendChild(h("div", { class: "addkey" }, name, h("span", { text: "=" }), val,
        h("button", { text: "Add line", onclick: () => {
          if (!name.value.trim()) return toast("the left side first", true);
          edit({ op: "add_key", section_line: sl, key: name.value.trim(), value: val.value.trim() });
        } }), h("span", { class: "muted", text: freeHelp.slice(0, 200) })));
      return;
    }
    const keys = kind.keys || [];
    const missing = keys.filter((x) => !x.prefix && (!present.has(x.name) || x.repeatable));
    const families = keys.filter((x) => x.prefix);
    if (!flat && (missing.length || families.length)) {
      const adv = h("details", { class: "advanced", open: S.advOpen || null });
      adv.addEventListener("toggle", () => { S.advOpen = adv.open; });
      adv.appendChild(h("summary", { text: "Advanced: " + missing.length + " key(s) this section does not have" + (families.length ? ", raw keys by offset" : "") }));
      for (const sp of missing) {
        // the default only when it is a value the key takes ("the base's" is not): K.advancedValue
        const pre = K.advancedValue(sp);
        const val = h("input", { type: "text", size: 18, placeholder: pre.placeholder });
        val.value = pre.value;
        const add = () => {
          if (!val.value.trim()) return toast("type a value" + (pre.placeholder.startsWith("absent: ") ?
            "; leaving the key out gives: " + pre.placeholder.slice(8) : "") + " (Add a key, below, writes any line, an empty value included)", true);
          edit({ op: "add_key", section_line: sl, key: sp.name, value: val.value.trim() }).catch(() => {});
        };
        val.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
        adv.appendChild(h("div", { class: "advrow", "data-key": sp.name },
          h("div", { class: "k" }, sp.name, restartBadge(sp), sp.repeatable && present.has(sp.name) ? h("span", { class: "badge", text: "again" }) : null),
          h("div", { class: "v" }, val, h("button", { text: "add", title: "add the line " + sp.name + " = <value> at the end of the section", onclick: add })),
          h("div", { class: "muted help1", text: (sp.default !== undefined && sp.default !== "" ? "default " + sp.default + ". " : "") + (sp.help || "").slice(0, 240) })));
      }
      if (families.length) {
        const fam = h("select", {}, families.map((x) => h("option", { value: x.name, text: x.name + "XX" })));
        const off = h("input", { type: "text", size: 6, placeholder: "XX (hex)" });
        const val = h("input", { type: "text", size: 14, placeholder: "value" });
        const hint = h("span", { class: "muted", text: (families[0].help || "").slice(0, 200) });
        fam.addEventListener("change", () => { const x = families.find((y) => y.name === fam.value); hint.textContent = x ? (x.help || "").slice(0, 200) : ""; });
        adv.appendChild(h("div", { class: "addkey rawkey" }, h("span", { text: "add raw key" }), fam, off, h("span", { text: "=" }), val,
          h("button", { text: "add", onclick: () => {
            const o = off.value.trim();
            if (!o || /[\s=;#]/.test(o)) return toast("the offset first: its hex digits (byte_10 is offset 0x10)", true);
            edit({ op: "add_key", section_line: sl, key: fam.value + o, value: val.value.trim() }).catch(() => {});
          } }), hint));
      }
      el.appendChild(adv);
    }
    const name = h("input", { type: "text", placeholder: "any key", size: 18 });
    const val = h("input", { type: "text", placeholder: "value", size: 24 });
    el.appendChild(h("div", { class: "addkey anykey" }, h("span", { text: "Add a key" }), name, h("span", { text: "=" }), val,
      h("button", { text: "Add", onclick: () => {
        if (!name.value.trim()) return toast("a key name first", true);
        edit({ op: "add_key", section_line: sl, key: name.value.trim(), value: val.value.trim() }).catch(() => {});
      } }), h("span", { class: "muted", text: "any name, one the schema does not know included" })));
  }

  // Section text (design 3.3, 1.6a): the section's own lines in a text box, filled with their RAW text (CRLF turned to
  // LF, each line with its own ending), and put back through file.apply_text, so a line not touched keeps its ending.
  function sectionTextBox(v, s) {
    const [first, last] = K.sectionRange(s, v.outline);
    const det = h("details", { class: "sectext", open: S.secTextOpen || null });
    det.addEventListener("toggle", () => { S.secTextOpen = det.open; });
    det.appendChild(h("summary", { text: "Section text (lines " + first + " to " + last + ", as they are in the file)" }));
    const ro = v.readonly || !!v.raw_refused || !S.state.writable;
    const ta = h("textarea", { id: "sectext", spellcheck: "false", wrap: "off" });
    ta.value = K.rangeText(v.text, first, last);
    ta.rows = Math.min(24, Math.max(4, last - first + 2));
    ta.readOnly = ro;
    // typed in and not applied: applied when the page leaves it (another section, file or tab, Save, Save all, the
    // folder closed), asked about before an edit made elsewhere in the file (afterSecText, askSecText)
    ta.addEventListener("input", () => { if (!ro) S.secDirty = { path: S.file, first, last, label: (s.commented ? ";" : "") + (s.header || "the lines before the first section") }; });
    det.appendChild(ta);
    const apply = h("button", { id: "sectapply", text: "Apply", disabled: ro || null, onclick: async () => {
      try { setView(await invoke("file.apply_text", { path: S.file, first, last, text: ta.value })); } catch (e) { fail(e); }
    } });
    det.appendChild(h("div", { class: "addkey" }, apply, h("span", { class: "muted", text: ro ?
      (v.raw_refused ? "view only: " + v.raw_refused : "view only") :
      "Apply puts these lines back in place (a line you did not change keeps its own line ending); leaving the box " +
      "for another section, file or tab, or Save, applies it too; nothing is written until Save." })));
    return det;
  }

  // The Section text typed in and not applied (S.secDirty): put back through file.apply_text as Apply does. Resolves
  // false when it was refused (the box keeps what was typed), "moved" when the apply changed the file's line count (a
  // line number taken before it is then stale), else true (nothing was pending, or the lines stayed where they were).
  async function applySecText() {
    const d = S.secDirty;
    if (!d) return true;
    const ta = $("#sectext");
    if (!ta || d.path !== S.file || !S.view) { S.secDirty = null; return true; }
    const n = K.splitRaw(S.view.text).length;
    try {
      setView(await invoke("file.apply_text", { path: d.path, first: d.first, last: d.last, text: ta.value }));
    } catch (e) { fail(e); return false; }
    return K.splitRaw(S.view.text).length === n ? true : "moved";
  }
  // a page action that leaves the box (another section, a problem's line): the box is applied first; when that moved
  // the lines, the action (made from line numbers of before) is not made and the page says to click again
  async function afterSecText(fn) {
    const r = await applySecText();
    if (r === true) return fn();
    if (r === "moved") toast("The Section text was applied first, and the lines moved: click again.");
  }
  // before an edit made elsewhere in the file (a form row, Add section): applied after it, the box's lines could be
  // stale, applied before it the edit's could; so the page asks. True: go on with the edit.
  async function askSecText() {
    if (!S.secDirty) return true;
    const how = await modal("Section text not applied", [h("p", { text: "The Section text of " + S.secDirty.label +
      " has changes that are not applied. Apply them (the change you just made is then not made: make it again), " +
      "or drop them and make the change?" })],
      [["Apply them", "apply", true], ["Drop them", "drop"], ["Keep editing", "keep"]]);
    if (how === "drop") { S.secDirty = null; return true; }
    if (how === "apply" && (await applySecText())) toast("The Section text was applied; the other change was not made: make it again.");
    return false;
  }

  // ---- materia slots, drawn as FF7's Equip menu draws them ---------------------------------------------
  // Proportions from the game's own menu art (menu_us.lgp, btl_win_h.tex): a slot is 11 pixels across, the link
  // sprite 10 wide with two bars; drawn here in vector form (no game art is copied). A link bar is drawn to the left
  // of every slot of type 3 or 7, as all six of the game's slot drawers do; type 0 is no slot.
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); return e; };
  const PITCH = 16, R = 5.5, Y = 8.5, X0 = 7;
  const cx = (i) => X0 + i * PITCH;

  function slotGroups(b) {          // [{start, len, ap}] from 8 bytes made only of 0, 1, 2, 3, 5, 6, 7
    const out = [];
    for (let i = 0; i < 8; i++) {
      const t = b[i];
      if (!t) continue;
      const right = t === 3 || t === 7;
      const last = out[out.length - 1];
      if (right && last && last.start + last.len === i) last.len++;
      else out.push({ start: i, len: 1, ap: t >= 4 });
    }
    return out;
  }
  function slotBytes(groups) {
    const b = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const g of groups) for (let k = 0; k < g.len; k++)
      b[g.start + k] = (g.ap ? 4 : 0) + (g.len === 1 ? 1 : k === 0 ? 2 : 3);
    return b;
  }

  function drawSlots(m, interactive, act) {
    const svg = sv("svg", { viewBox: "0 0 " + (X0 + 7 * PITCH + 8) + " 17", class: "slotsvg", role: "img",
      "aria-label": "materia slots" });
    const defs = sv("defs");
    defs.innerHTML =
      '<radialGradient id="rimAP" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff3c0"/><stop offset=".35" stop-color="#e8b84a"/><stop offset=".75" stop-color="#a8741c"/><stop offset="1" stop-color="#4f3208"/></radialGradient>' +
      '<radialGradient id="rimNo" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#d9d2c4"/><stop offset=".4" stop-color="#9a8d78"/><stop offset="1" stop-color="#3a342b"/></radialGradient>' +
      '<radialGradient id="hole" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#3b3226"/><stop offset=".7" stop-color="#140f09"/><stop offset="1" stop-color="#000"/></radialGradient>' +
      '<linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#d9a640"/><stop offset="1" stop-color="#6b4710"/></linearGradient>';
    svg.appendChild(defs);
    const b = m.slots;
    // the link bars first, under the slots
    for (let i = 1; i < 8; i++) {
      if (b[i] !== 3 && b[i] !== 7) continue;
      const x1 = cx(i - 1) + 2, x2 = cx(i) - 2, orphan = !b[i - 1];
      const g = sv("g", { class: "link" + (orphan ? " orphan" : "") });
      g.appendChild(sv("title")).textContent = orphan ? "a link bar to an empty place: the game draws it, but no materia is linked" : "linked";
      for (const dy of [-2.2, 1.0]) g.appendChild(sv("rect", { x: x1, y: Y + dy, width: x2 - x1, height: 1.3, fill: orphan ? "#c0392b" : "url(#bar)", rx: 0.3 }));
      for (const x of [x1 + 1.6, x2 - 2.6]) g.appendChild(sv("rect", { x: x, y: Y - 2.2, width: 1, height: 4.5, fill: orphan ? "#c0392b" : "#c99536" }));
      svg.appendChild(g);
    }
    for (let i = 0; i < 8; i++) {
      const t = b[i];
      if (t === 0) continue;
      const g = sv("g", { class: "slot" + (interactive ? " clickable" : ""), "data-i": i });
      const title = sv("title");
      if (t === null) {
        g.appendChild(sv("circle", { cx: cx(i), cy: Y, r: R, fill: "none", stroke: "#8a8fa3", "stroke-dasharray": "1.4 1", "stroke-width": 0.8 }));
        const q = sv("text", { x: cx(i), y: Y + 2.2, "text-anchor": "middle", "font-size": 6, fill: "#c9cede" });
        q.textContent = "?";
        g.appendChild(q);
        title.textContent = "slot " + (i + 1) + ": from the base (not known here)";
      } else {
        const known = [1, 2, 3, 5, 6, 7].includes(t), ap = t >= 4;
        g.appendChild(sv("circle", { cx: cx(i), cy: Y, r: R, fill: known ? (ap ? "url(#rimAP)" : "url(#rimNo)") : "#7a1d14", stroke: "#1a1206", "stroke-width": 0.5 }));
        g.appendChild(sv("circle", { cx: cx(i), cy: Y, r: 3.3, fill: "url(#hole)" }));
        g.appendChild(sv("circle", { cx: cx(i) - 1.6, cy: Y - 1.8, r: 0.7, fill: "#fffbe8", opacity: ap ? 0.9 : 0.35 }));
        title.textContent = "slot " + (i + 1) + ": type " + t + (known ? (ap ? " (gives AP)" : " (gives no AP)") : " (not one of the game's slot types)") +
          " · " + m.slot_source[i] + (interactive ? " · click: AP on or off for its linked group" : "");
      }
      g.appendChild(title);
      if (interactive && t !== null) g.addEventListener("click", () => act("ap", i));
      svg.appendChild(g);
    }
    if (interactive) {         // the gaps between two slots: click to link or unlink
      for (let i = 1; i < 8; i++) {
        if (!b[i] || !b[i - 1]) continue;
        const linked = b[i] === 3 || b[i] === 7;
        const hit = sv("rect", { x: cx(i - 1) + 3, y: 0, width: PITCH - 6, height: 17, class: "gap", fill: "transparent" });
        hit.appendChild(sv("title")).textContent = linked ? "click: unlink slots " + i + " and " + (i + 1) : "click: link slots " + i + " and " + (i + 1);
        hit.addEventListener("click", () => act("link", i));
        svg.appendChild(hit);
      }
    }
    return svg;
  }

  function slotPanel(s, readonly) {
    const m = s.slots;
    const box = h("div", { class: "ff7win" });
    const known = m.slots.every((x) => x !== null);
    const editable = !readonly && S.state.writable && known && !m.line_problem;
    const act = (what, i) => {
      let gs = slotGroups(m.slots);
      if (what === "link") {
        const gi = gs.findIndex((g) => g.start <= i && i < g.start + g.len);
        if (gi >= 0 && gs[gi].start < i) {              // linked: split before i
          const g = gs[gi];
          gs.splice(gi, 1, { start: g.start, len: i - g.start, ap: g.ap }, { start: i, len: g.start + g.len - i, ap: g.ap });
        } else {                                          // apart: join the group ending at i-1 with the one starting at i
          const a = gs.findIndex((g) => g.start + g.len === i), c = gs.findIndex((g) => g.start === i);
          if (a < 0 || c < 0) return;
          gs.splice(a, 2, { start: gs[a].start, len: gs[a].len + gs[c].len, ap: gs[a].ap });
        }
      } else if (what === "ap") {
        const g = gs.find((g) => g.start <= i && i < g.start + g.len);
        if (g) g.ap = !g.ap;
      } else if (what === "add") {
        const used = gs.length ? gs[gs.length - 1].start + gs[gs.length - 1].len : 0;
        if (used >= 8) return toast("a weapon or armour has at most 8 slots (the DLL refuses more)", true);
        gs.push({ start: used, len: 1, ap: gs.length ? gs[gs.length - 1].ap : true });
      } else if (what === "remove") {
        const g = gs[gs.length - 1];
        if (!g) return;
        if (g.len > 1) g.len--; else gs.pop();
      }
      edit({ op: "set_slots", section_line: s.line, slots: slotBytes(gs) });
    };
    const growthLabel = h("div", { class: "ff7growth" }, h("span", { class: "ff7cap", text: "Growth" }),
      h("span", { class: "ff7val", text: m.growth_name || "from the base" }));
    let growthCtl = null;
    if (!readonly && S.state.writable) {
      growthCtl = h("select", { title: "the growth line (" + (m.kind === "armour" ? "a word" : "a number 0-255; the menu names 0 to 3") + ")" },
        h("option", { value: "", text: "set growth..." }),
        ["Nothing", "Normal", "Double", "Triple"].map((n, k) => h("option", { value: m.kind === "armour" ? m.growth_words[k] : String(k), text: n })));
      growthCtl.addEventListener("change", () => { if (growthCtl.value !== "") edit({ op: "set_key", header: s.header, key: "growth", value: growthCtl.value }); });
    }
    box.append(...[
      h("div", { class: "ff7title", text: "Materia slots" }),
      h("div", { class: "ff7row" }, drawSlots(m, editable, act), growthLabel),
      h("div", { class: "ff7ctl" },
        editable ? h("button", { text: "+ slot", title: "add a slot at the right", onclick: () => act("add") }) : null,
        editable ? h("button", { text: "- slot", title: "remove the last slot", onclick: () => act("remove") }) : null,
        growthCtl,
        h("span", { class: "ff7note", text:
          (m.line ? "slots = " + m.line : (m.line_problem ? "not editable here: " + m.line_problem : "")) +
          " · growth: " + m.growth_source + (m.kernel ? " · base from " + m.kernel.split(/[\/]/).slice(-1)[0] + " in the game folder (a mod's kernel may differ)" : "") })),
      m.notes.length ? h("div", { class: "ff7note warn", text: m.notes.join(" · ") }) : null,
      editable ? h("div", { class: "ff7hint", text: "Click between two slots to link or unlink them; click a slot to switch AP growth for its linked group. Every change writes the slots line (nothing is saved until Save)." }) : null,
    ].filter((x) => x));
    return box;
  }

  // true when the edit was made, false when the page did not make it (askSecText); throws when it was refused
  async function edit(body) {
    if (!(await askSecText())) return false;
    body.path = S.file;
    try {
      setView(await api("/api/file/edit", body));
      return true;
    } catch (e) { fail(e); throw e; }
  }

  function renderGutter(ta, gutter, problems) {
    const n = ta.value.split("\n").length;
    const bad = new Set((problems || []).filter((p) => p.kind === "problem").map((p) => p.line));
    gutter.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= n; i++) {
      frag.appendChild(bad.has(i) ? h("span", { class: "bad", text: String(i) }) : document.createTextNode(String(i)));
      frag.appendChild(document.createTextNode("\n"));
    }
    gutter.appendChild(frag);
    gutter.scrollTop = ta.scrollTop;
  }
  function gotoRawLine(line) {
    const ta = $("#raw");
    const lines = ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[line - 1] || "").length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 19;
    ta.scrollTop = Math.max(0, (line - 5) * lh);
  }
  // a problem's line: in the form when it is a key row (or a Game option), else in Raw (design 3.3)
  function jumpTo(line) {
    if (!line) return;
    if (S.tab === "raw") return gotoRawLine(line);
    if (S.tab !== "form") setTab("form");
    const game = !$("#gamepage").hidden;
    if (!game) {
      S.section = sectionOfLine(line) ?? S.section;
      renderSections();
      renderForm();
    }
    $$(".row.jumped, .opt.jumped").forEach((x) => x.classList.remove("jumped"));
    const r = $((game ? "#gameopts" : "#form") + ' [data-line="' + line + '"]');
    if (r) { r.scrollIntoView({ block: "center" }); r.classList.add("showhelp", "jumped"); }
    else { setTab("raw"); gotoRawLine(line); }
  }

  function renderProbs(el, problems, onpick) {
    el.innerHTML = "";
    for (const p of problems || []) {
      el.appendChild(h("div", { class: "prob" + (p.kind !== "problem" ? " tool" : ""), title: p.kind === "tool" ? "said by this tool, not the DLL" : "what the DLL would log",
        onclick: () => onpick(p) }, kindPrefix(p) + p.text));
    }
  }

  async function applyRaw() {
    if (!S.rawDirty || !S.view) return true;
    try {
      setView(await api("/api/file/raw", { path: S.file, text: $("#raw").value }));
      return true;
    } catch (e) { fail(e); return false; }
  }

  function setTab(tab) {
    // leaving the Form tab applies the Section text, as leaving Raw applies Raw
    if (S.tab === "form" && tab !== "form" && S.secDirty) { applySecText().then((ok) => { if (ok) setTab(tab); }); return; }
    if (S.tab === "raw" && tab !== "raw" && S.rawDirty) applyRaw();
    S.tab = tab;
    $$("#filetabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    $$("#page-files .tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + tab));
    if (tab === "diff") loadDiff();
  }
  async function loadDiff() {
    if (!S.file) return;
    const d = (await api("/api/diff" + q({ path: S.file }))).diff;
    const pre = $("#diff");
    pre.innerHTML = "";
    if (!d) { pre.textContent = "No unsaved change in this file."; return; }
    for (const line of d.split("\n")) {
      const cls = line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : line.startsWith("@@") ? "hunk" : "";
      pre.appendChild(cls ? h("span", { class: cls, text: line }) : document.createTextNode(line + "\n"));
    }
  }

  // ---- Save with a preview (design 1.6 step 1) -----------------------------------------------------------
  function diffPre(d) {
    const pre = h("pre", { class: "diff" });
    for (const line of d.split("\n")) {
      const cls = line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "del" : line.startsWith("@@") ? "hunk" : "";
      pre.appendChild(cls ? h("span", { class: cls, text: line }) : document.createTextNode(line + "\n"));
    }
    return pre;
  }
  const changedLines = (d) => d.split("\n").filter((l) => (l.startsWith("+") && !l.startsWith("+++")) || (l.startsWith("-") && !l.startsWith("---"))).length;
  // the modal: resolves with the button's value (Escape: the last button's)
  function modal(title, body, buttons) {
    return new Promise((resolve) => {
      const m = $("#modal");
      $("#modaltitle").textContent = title;
      const mb = $("#modalbody");
      mb.innerHTML = "";
      mb.append(...[].concat(body));
      const bb = $("#modalbtns");
      bb.innerHTML = "";
      const done = (v) => { m.hidden = true; document.removeEventListener("keydown", key, true); resolve(v); };
      const key = (e) => { if (e.key === "Escape") { e.preventDefault(); done(buttons[buttons.length - 1][1]); } };
      for (const [label, value, primary] of buttons) bb.appendChild(h("button", { class: primary ? "primary" : null, text: label, onclick: () => done(value) }));
      document.addEventListener("keydown", key, true);
      m.hidden = false;
      const p = bb.querySelector("button.primary");
      if (p) p.focus();
    });
  }
  async function previewSave(paths) {
    const parts = [];
    let total = 0;
    for (const p of paths) {
      const d = (await api("/api/diff" + q({ path: p }))).diff;
      const n = changedLines(d);
      total += n;
      const det = h("details", { class: "pfile", open: paths.length === 1 ? true : null },
        h("summary", {}, p + " ", h("span", { class: "muted", text: n + " changed line(s)" })), d ? diffPre(d) : h("p", { class: "muted", text: "no change" }));
      parts.push(det);
    }
    parts.push(h("p", { class: "muted", text: "First a copy of " + (paths.length === 1 ? "the file" : "each file") + " as it is on disk now goes to " +
      "SpellExtConfig" + (navigator.platform.startsWith("Win") ? "\\" : "/") + "Backups" + (navigator.platform.startsWith("Win") ? "\\" : "/") +
      "<date_time of this save>" + (paths.length > 1 ? " (one folder for all of them)" : "") + "; then the new text replaces it." }));
    return modal(paths.length === 1 ? "Save " + paths[0] + "?" : "Save " + paths.length + " files (" + total + " changed lines)?", parts,
      [["Save", true, true], ["Cancel", false]]);
  }
  async function showBackup(path) {
    try { await invoke("app.show_backup", { path }); } catch (e) { fail(e); }
  }

  async function saveFile(path, overwrite) {
    path = path || S.file;
    if (!path) return;
    if (!(await applySecText())) return;
    if (path === S.file && S.rawDirty && !(await applyRaw())) return;
    await refreshState();          // the dirty list as the main process has it now
    const dirty = (S.state.dirty || []).includes(path);
    if (!dirty && !overwrite) { toast("No unsaved change in " + path + "."); return; }
    if (!overwrite && confirmSave() && !(await previewSave([path]))) return;
    try {
      const v = await api("/api/file/save", { path, overwrite: !!overwrite });
      if (path === S.file) setView(v);
      await refreshState();
      toast("Saved " + path + (v.backup ? "\nbackup: " + v.backup : ""), false, v.backup);
      await refreshProblems();
    } catch (e) {
      if (/changed on disk/.test(e.message)) {
        if (confirm(e.message + "\n\nOK: write your version over it (the file on disk is backed up first). Cancel: keep it, and use Reload to see it.")) return saveFile(path, true);
        return;
      }
      fail(e);
    }
  }
  // Save all (design 1.6 step 7): one preview, then file.save_all, which checks every file before it writes any.
  // The answer: true when every dirty file was saved (or none was dirty), false when anything was not.
  async function saveAll(overwrite) {
    if (!(await applySecText())) return false;
    if (!(await applyRaw())) return false;
    await refreshState();
    const dirty = S.state.dirty || [];
    if (!dirty.length) { toast("Nothing to save."); return true; }
    if (!overwrite && !(await previewSave(dirty))) return false;
    const r = await api("/api/file/save_all", overwrite ? { overwrite } : {});
    await refreshState();
    if (S.file) { try { setView(await api("/api/file" + q({ path: S.file }))); } catch (e) { /* the page shows the state */ } }
    await refreshProblems();
    const refused = Object.entries(r.refused || {});
    if (!refused.length) {
      const b = r.saved.length ? r.saved[0].backup : null;
      toast("Saved " + r.saved.map((x) => x.path).join(", ") + (b ? "\nbackup: " + b : ""), false, b);
      return true;
    }
    const text = refused.map(([p, m]) => p + ": " + m).join("\n") +
      (r.written.length ? "\n\nWritten: " + r.written.join(", ") : "\n\nNothing was written.") +
      (r.not_written.length ? "\nNot written: " + r.not_written.join(", ") : "");
    const onDisk = refused.filter(([, m]) => /changed on disk/.test(m)).map(([p]) => p);
    if (!r.written.length && onDisk.length === refused.length &&
        confirm(text + "\n\nOK: write your versions over them (the files on disk are backed up first). Cancel: keep them, and use Reload to see them.")) {
      return saveAll(onDisk);
    }
    toast(text, true);
    return false;
  }
  // the unsaved guard's "Save all first" (main.js): Save all as the button does it; true only when nothing is left
  // unsaved, and then the main process closes the window
  async function saveAllForClose() {
    try {
      if (!(await saveAll())) return false;
      await refreshState();
      if (S.rawDirty || S.secDirty || (S.state.dirty || []).length) return false;
      if (AI.dirty) {
        toast("The AI page has unsaved changes (Save all covers the .ini files only): save them there. The window stays open.", true);
        return false;
      }
      return true;
    } catch (e) { fail(e); return false; }
  }

  // ---- game options page -----------------------------------------------------------------------------
  // The Game options page (design 3.2): the game file's Form tab, beside its Raw and Changes tabs. Each option's edit
  // is the kind page's own (edit()), so the dirty mark, the problems and Save are the file's.
  const GAME = K.GAME;
  function renderGame(v) {
    const el = $("#gameopts");
    el.innerHTML = "";
    const entry = schemaFile(GAME);
    const kind = kindSpec(entry, "flat");
    const lines = {};
    for (const s of v.outline) for (const k of s.keys) if (k.kind === "key" && k.key) (lines[k.key.toLowerCase()] = lines[k.key.toLowerCase()] || []).push(k);
    const probs = {};
    for (const p of v.problems) (probs[p.line] = probs[p.line] || []).push(p);
    const groups = {};
    for (const spec of kind.keys) {
      const g = spec.testing_aid && spec.group === "Testing aids" ? "Testing aids" : (spec.group || "Other");
      (groups[g] = groups[g] || []).push(spec);
    }
    const order = Object.keys(groups).sort((a, b) => (a === "Testing aids") - (b === "Testing aids"));
    const running = S.state.game_running;
    for (const g of order) {
      const box = h("div", { class: "group" + (g === "Testing aids" ? " aids" : "") }, h("h3", { text: g + (g === "Testing aids" ? " (remove the lines when done)" : "") }));
      for (const spec of groups[g]) {
        const all = lines[spec.name] || [];
        const k = all.length ? all[all.length - 1] : null;
        const set = (val) => editGame(k ? { op: "set", line: k.line, value: val } : { op: "set_key", key: spec.name, value: val });
        const where = k ? "line " + k.line + (all.length > 1 ? " (also line " + all.slice(0, -1).map((x) => x.line).join(", ") + ": the later line is used)" : "") :
          "not in the file: default " + (spec.default || "none");
        const opt = h("div", { class: "opt", "data-line": k ? k.line : null, "data-key": spec.name },
          h("div", {}, h("div", { class: "name", text: spec.name }), h("div", { class: "where", text: where }), restartBadge(spec)),
          h("div", {}, widgetFor(spec, k ? k.value : null, set, !S.state.writable),
            k ? h("div", {}, h("button", { text: "remove line", title: "the DLL then uses its default", onclick: () => editGame({ op: "remove", line: k.line }) })) : null),
          h("div", { class: "text", text: spec.help || "" }));
        if (k) for (const p of probs[k.line] || []) opt.appendChild(h("div", { class: "err", text: p.text }));
        if (running && (spec.restart === "first_reading" || spec.restart === "restart"))
          opt.appendChild(h("div", { class: "note", text: "The game is running: a change here is read at the next start (the log will say it STAYS until then)." }));
        box.appendChild(opt);
      }
      el.appendChild(box);
    }
    const known = new Set(kind.keys.map((x) => x.name));
    const other = Object.keys(lines).filter((x) => !known.has(x));
    if (other.length) el.appendChild(h("div", { class: "group" }, h("h3", { text: "Lines the DLL does not know" }),
      other.map((x) => h("div", { class: "opt" }, h("div", { class: "name", text: x }), h("div", { text: lines[x][0].value }),
        h("div", { class: "err", text: (probs[lines[x][0].line] || []).map((p) => p.text).join(" ") || "unknown key" })))));
  }
  function editGame(body) {
    return edit(body).catch(() => {});
  }

  // ---- problems page ---------------------------------------------------------------------------------
  async function refreshProblems() {
    const r = await api("/api/check");
    S.allProblems = r.problems;
    renderSidebar();
    if (S.page === "problems") renderForecast();
  }
  function renderForecast() {
    const el = $("#forecast");
    el.innerHTML = "";
    el.appendChild(h("p", { class: "muted", text: "What the DLL would log about the files as they stand here (unsaved edits included), in its own words. It does not forecast what depends on the game's data (a kernel base's content, a model's bones): the Game log tab has the DLL's verdict after a run." }));
    const files = Object.keys(S.allProblems).sort();
    let any = false;
    for (const f of files) {
      const ps = S.allProblems[f];
      const box = h("div", { class: "filegroup" }, h("h3", {}, f + " ", h("span", { class: "muted", text: ps.length ? ps.length + " line(s)" : "no problems" })));
      for (const p of ps) box.appendChild(h("div", { class: "prob" + (p.kind !== "problem" ? " tool" : ""), onclick: () => openFile(p.file, p.line) }, kindPrefix(p) + p.text));
      if (ps.length) any = true;
      el.appendChild(box);
    }
    if (!any) el.appendChild(h("div", { class: "prob ok", text: "No file has a line the DLL would complain about." }));
  }
  async function renderLog() {
    const el = $("#gamelog");
    el.innerHTML = "";
    let r;
    try { r = await api("/api/log"); } catch (e) { el.textContent = e.message; return; }
    if (!r.log) { el.appendChild(h("p", { text: "No FF7_SpellExt.log found (game folder: " + (r.game_dir || "not found") + "). Start the tool with --game \"<folder of ff7_en.exe>\"." })); return; }
    const L = r.log;
    el.appendChild(h("p", { class: "muted", text: L.path + " · " + L.lines + " lines · the last run of the game starts at line " + L.first_line + " · written " + new Date(L.mtime * 1000).toLocaleString() }));
    if (r.files_newer_than_log.length) el.appendChild(h("div", { class: "banner warn", text: "Changed since this log was written: " + r.files_newer_than_log.join(", ") + ". The log shows how the DLL read the files THEN." }));
    const sum = h("table", { class: "log" }, h("tr", {}, h("th", { text: "file" }), h("th", { text: "the DLL's summary" })));
    for (const s of L.summaries) sum.appendChild(h("tr", {}, h("td", { text: s.file }), h("td", { class: "m", text: s.text })));
    el.append(h("h3", { text: "Summaries" }), sum);
    const ent = h("table", { class: "log" }, h("tr", {}, h("th", { text: "file:line" }), h("th", { text: "the DLL said" }), h("th", { text: "forecast" })));
    const agree = new Set(r.agree.map((x) => x.join("\u0001")));
    for (const e of L.entries) {
      const key = [e.file.toLowerCase(), e.line, e.text].join("\u0001");
      ent.appendChild(h("tr", { onclick: () => openFile(e.file, e.line), style: "cursor:pointer" },
        h("td", { class: "m", text: e.file + ":" + e.line }), h("td", { class: "m", text: e.message }),
        h("td", { text: agree.has(key) ? "same" : "not forecast" })));
    }
    el.append(h("h3", { text: "Lines about the config files (" + L.entries.length + ")" }), L.entries.length ? ent : h("p", { class: "muted", text: "None: the DLL had nothing to say about any line." }));
    if (r.only_tool.length) {
      el.appendChild(h("h3", { text: "Forecast but not in the log (" + r.only_tool.length + ")" }));
      el.appendChild(h("p", { class: "muted", text: "Expected when a file changed since the run. Otherwise a disagreement between this tool and the DLL: the DLL is right, and the tool has a bug to report." }));
      for (const t of r.only_tool) el.appendChild(h("div", { class: "prob tool", text: t[2] }));
    }
  }

  // ---- AI page ---------------------------------------------------------------------------------------
  // Left: the characters (their ai_like / ai lines), the files in ai\, the game's own AI. Right: the open AI as
  // its entries and their 16 sections (cards), or the whole text; the text is the truth and both views follow it.
  const AI = { text: "", view: null, name: null, readonly: false, tab: "cards", rawDirty: false, dirty: false, over: null, windows: [] };

  // the focused section windows (aiwin.html) read and write the open AI text through this
  window.spellextAI = {
    get(ei, sec) {
      const e = AI.view && AI.view.entries[ei];
      const c = e && e.cards[sec];
      if (!c || c.item === null) return null;
      return { body: c.body, title: c.title, name: c.name, section: c.section, note: c.note, shared_with: c.shared_with,
               readonly: AI.readonly, file: AI.readonly ? $("#aititle").textContent : "ai\\" + AI.name,
               entry: e.indices.join(", "), kernel_id: AI.over ? AI.over.kernel_id : null };
    },
    set(ei, sec, body) {
      if (AI.readonly) return Promise.reject(new Error("read only"));
      const c = AI.view.entries[ei].cards[sec];
      if (!c || c.item === null) return Promise.reject(new Error("this section has no script now"));
      // the script's lines put back through apply_edited_text (design 1.6a): each line of the text box is followed by
      // an LF, so a blank last line stays, and a line not touched keeps its own ending
      return cardEdit({ op: "apply_text", entry: ei, item: c.item, body: body + "\n" });
    },
  };
  function notifyWindows() {
    AI.windows = AI.windows.filter((w) => w && !w.closed);
    for (const w of AI.windows) { try { w.postMessage({ type: "spellext-ai-changed" }, location.origin); } catch (e) { /* closed */ } }
  }
  // the library drawer: Insert puts a recipe at the cursor of the card last typed in
  let library = null;
  function toggleLibrary() {
    const d = $("#libdrawer");
    d.hidden = !d.hidden;
    if (!d.hidden && !library) library = SpellExtLibrary.mount(d, { api, toast, insert: insertAtCursor, newSection: newSectionFrom });
  }
  async function insertAtCursor(text) {
    if (AI.readonly || !AI.view) throw new Error("open or make an AI file you can edit first (the game's AI is read only)");
    const f = AI.lastFocus;
    if (!f) throw new Error("click into a section's script first: the recipe goes where the cursor is");
    const c = AI.view.entries[f.ei] && AI.view.entries[f.ei].cards[f.sec];
    if (!c || c.item === null) throw new Error("that section has no script now");
    const body = c.body;
    let at = Math.min(f.pos, body.length);
    const nl = body.lastIndexOf("\n", at - 1);
    at = nl + 1;                               // at the start of the cursor's line
    await cardEdit({ op: "apply_text", entry: f.ei, item: c.item, body: body.slice(0, at) + text + body.slice(at) + "\n" });
    toast("Inserted in " + c.title + " (not saved yet)");
  }
  async function newSectionFrom(text, sections) {
    if (AI.readonly || !AI.view) throw new Error("open or make an AI file you can edit first (the game's AI is read only)");
    const ei = AI.lastFocus ? AI.lastFocus.ei : 0;
    const e = AI.view.entries[ei];
    const empty = e.cards.filter((c) => c.item === null);
    if (!empty.length) throw new Error("every section of this entry has a script");
    const pick = empty.find((c) => sections.includes(c.name)) || empty[0];
    // the page's own dialog (Electron has no prompt()): the empty sections of the entry, the recipe's first offered
    const sel = h("select", {});
    for (const c of empty) {
      const op = h("option", { value: c.name, text: c.title + " (" + c.name + ")" + (sections.includes(c.name) ? "  - fits this recipe" : "") });
      if (c === pick) op.selected = true;
      sel.appendChild(op);
    }
    const v = await modal("New section for the recipe", [h("p", { text: "The empty sections of entry " + e.indices.join(", ") + ":" }), sel],
                          [["Add", "add", true], ["Cancel", "cancel"]]);
    if (v !== "add") return;
    const target = empty.find((c) => c.name === sel.value);
    if (!target) throw new Error(sel.value + " is not an empty section of this entry");
    await cardEdit({ op: "add", entry: ei, section: target.section });
    const c = AI.view.entries[ei].cards[target.section];
    await cardEdit({ op: "set_body", entry: ei, item: c.item, body: text });
    toast("New " + target.title + " section from the recipe (not saved yet)");
  }

  function openSectionWindow(ei, sec) {
    const url = "aiwin.html?e=" + ei + "&s=" + sec;
    const w = window.open(url, "spellext_ai_" + ei + "_" + sec, "width=1300,height=850");
    if (!w) return toast("The browser blocked the new window: allow pop-ups for this page.", true);
    AI.windows.push(w);
    w.focus();
  }

  async function renderAIList() {
    const el = $("#ailist");
    el.innerHTML = "";
    let o;
    try { o = AI.over = await api("/api/ai/overview"); } catch (e) {
      // a refusal (no folder open, say): the page says so where its list and cards would be
      el.appendChild(h("div", { class: "banner info stage", text: e.message }));
      if (!AI.view) {
        $("#aicards").innerHTML = "";
        $("#aicards").appendChild(h("p", { class: "muted stage", text: "The AI page: " + e.message +
          ". The ai\\ sources can be opened as text under AI in the sidebar meanwhile." }));
      }
      return;
    }
    // (a) characters
    const ch = h("div", { class: "aigroup" }, h("h4", { text: "Characters" }));
    if (o.characters_dirty) ch.appendChild(h("div", { class: "aidirty" }, h("span", { text: "Characters file changed " }),
      h("button", { class: "primary", text: "Save it", onclick: () => saveFile("FF7_SpellExt_Characters.ini").then(renderAIList) })));
    for (const c of o.characters) {
      const eff = c.effective;
      const effText = !eff ? "no AI line: none" : eff.key === "ai_like" ? "ai_like = " + eff.value + " (" + eff.game_name + "'s game AI)" :
        "ai = " + eff.value + (eff.missing ? " (no ai\\" + eff.value + ".ai)" : "");
      const sel = h("select", { title: "this character's AI line in FF7_SpellExt_Characters.ini" });
      const cur = c.own.length ? c.own[0].key + "=" + c.own[0].value.toLowerCase() : "";
      sel.appendChild(h("option", { value: "", text: c.copy_of !== null ? "(no line of its own: as [" + c.copy_of + "])" : "(no line: none)" }));
      const g1 = h("optgroup", { label: "ai_like: a game character's AI" });
      for (const w of o.ai_like_words) g1.appendChild(h("option", { value: "ai_like=" + w, text: "ai_like = " + w }));
      const g2 = h("optgroup", { label: "ai: a file in ai\\" });
      for (const f of o.files.filter((f) => f.ai)) g2.appendChild(h("option", { value: "ai=" + f.name.toLowerCase(), text: "ai = " + f.name, "data-name": f.name }));
      sel.append(g1, g2);
      let found = false;
      for (const op of sel.querySelectorAll("option")) if (op.value === cur) { op.selected = true; found = true; }
      if (cur && !found) { const op = h("option", { value: cur, text: c.own[0].key + " = " + c.own[0].value + " (as written)" }); op.selected = true; sel.insertBefore(op, sel.children[1]); }
      sel.addEventListener("change", async () => {
        const v = sel.value;
        const opt = sel.selectedOptions[0];
        const body = { section_line: c.header_line, key: null, value: "" };
        if (v) { body.key = v.split("=")[0]; body.value = opt.dataset.name || v.split("=").slice(1).join("="); }
        try {
          const r = await api("/api/ai/set_character", body);
          await refreshState();
          if (S.file === "FF7_SpellExt_Characters.ini") setView(await api("/api/file" + q({ path: S.file })));
          renderAIList();
          const p = (r.problems || []).filter((x) => x.kind === "problem");
          toast(p.length ? p.map((x) => x.text).join("\n") : "Characters file changed (not saved yet)", p.length > 0);
        } catch (e) { fail(e); renderAIList(); }
      });
      ch.appendChild(h("div", { class: "aichar" },
        h("div", {}, h("b", { text: "[" + c.id + "] " }), c.name || ""),
        h("div", { class: "aieff" + (eff && eff.missing ? " bad" : "") }, effText,
          c.inherited ? h("span", { class: "tag", text: " inherited from [" + c.copy_of + "] (copy_of)" }) : null,
          c.own.length > 1 ? h("span", { class: "bad", text: " both ai_like and ai: the DLL takes the first" }) : null),
        S.state.writable ? sel : null,
        eff && eff.key === "ai" && !eff.missing ? h("button", { class: "link", text: "open " + eff.value, onclick: () => openAI(o.files.find((f) => f.name.toLowerCase() === eff.value.toLowerCase()).name) }) : null));
    }
    if (!o.characters.length) ch.appendChild(h("p", { class: "muted", text: "The Characters file defines no character." }));
    el.appendChild(ch);
    // (b) AI files
    const fg = h("div", { class: "aigroup" }, h("h4", { text: "AI files (ai\\)" }));
    for (const f of o.files) fg.appendChild(h("div", { class: "item" + (AI.name === f.name && !AI.readonly ? " on" : ""), "data-ai": f.name, onclick: () => openAI(f.name) },
      f.pending ? h("span", { class: "dot", title: "staged: Save or Save all writes it" }) : null,
      f.name, h("span", { class: "tag", text: " " + (f.ai ? ".ai " : "") + (f.txt ? ".txt" : "") + (f.pending ? "staged, not saved yet" : "") +
        (f.in_sync === false ? " · out of step" : "") }),
      f.used_by.length ? h("div", { class: "tag", text: "used by " + f.used_by.map((i) => "[" + i + "]").join(" ") }) : h("div", { class: "tag", text: "used by no character" }),
      S.state.writable ? h("div", { class: "aiacts" },
        h("button", { class: "link", text: "Rename", onclick: (ev) => { ev.stopPropagation(); renameAI(f); } }),
        h("button", { class: "link", text: f.pending ? "Drop" : "Delete", onclick: (ev) => { ev.stopPropagation(); deleteAI(f); } })) : null));
    if (!o.files.length) fg.appendChild(h("p", { class: "muted", text: "None yet: make one from the game's AI below." }));
    fg.appendChild(h("div", { class: "addsec" }, h("button", { id: "aiaddtemplate", text: "+ Add from template", title: "the Library's AI section: " +
      "the game's character AI exported, or a recipe card", onclick: () => addFromTemplate("ai") })));
    el.appendChild(fg);
    // (c) the game's AI, from the chosen kernel
    const gg = h("div", { class: "aigroup" }, h("h4", { text: "Game AI (read only)" }));
    gg.appendChild(kernelChooser(o));
    if (!o.game.length) gg.appendChild(h("p", { class: "muted", style: "padding:0 12px", text: o.kernel ? "This kernel's character AI could not be read." : "No kernel chosen or found." }));
    for (const g of o.game) gg.appendChild(h("div", { class: "item" + (g.has_ai ? "" : " none") + (AI.readonly && AI.name === "entry" + g.entry ? " on" : ""),
      onclick: g.has_ai ? () => viewGame(g) : null },
      g.name, h("span", { class: "tag", text: " entry " + g.entry }),
      g.has_ai ? (g.used_by.length ? h("div", { class: "tag", text: "ai_like of " + g.used_by.map((i) => "[" + i + "]").join(" ") }) : null)
               : h("div", { class: "tag", text: "no AI of its own" })));
    el.appendChild(gg);
  }

  // Rename (design 3.4, 4.10): the characters that use the file, and "update their ai = lines" (unsaved edits)
  async function renameAI(f) {
    const inp = h("input", { type: "text", value: f.name, size: 32, maxlength: 31, id: "airenamein" });
    const upd = h("input", { type: "checkbox", checked: f.used_by.length ? true : null, id: "airenameupd" });
    const v = await modal("Rename ai\\" + f.name, [h("p", { text: "The new name (1 to 31 letters, digits, _ or -):" }), inp,
      f.used_by.length ? h("label", { class: "trowcheck" }, upd, " update the ai = lines of " + f.used_by.map((i) => "[" + i + "]").join(" ") +
        " (unsaved edits in the characters file: see them in Changes, then Save)") : h("p", { class: "muted", text: "No character uses it." })],
      [["Rename", true, true], ["Cancel", false]]);
    if (!v) return;
    try {
      const r = await invoke("ai.rename", { name: f.name, new: inp.value.trim(), update_refs: upd.checked });
      await refreshState();
      if (S.file === "FF7_SpellExt_Characters.ini") setView(await api("/api/file" + q({ path: S.file })));
      toast("Renamed to ai\\" + r.renamed + (r.refs_updated.length ? "; the ai = lines of " + r.refs_updated.map((i) => "[" + i + "]").join(" ") +
        " changed (not saved)" : "") + (r.used_by.length ? "\n" + r.used_by.map((i) => "[" + i + "]").join(" ") + " now name a missing file" : "") +
        (r.backup ? "\nbackup: " + r.backup : ""), r.used_by.length > 0, r.backup);
      if (AI.name === f.name) AI.name = r.renamed;
      renderAIList();
    } catch (e) { fail(e); }
  }

  // Delete: refused while a character uses the file; "delete anyway" leaves them naming a missing file
  async function deleteAI(f) {
    const msg = f.pending ? "Drop the staged ai\\" + f.name + "? (Nothing was written.)" :
      "Delete ai\\" + f.name + ".txt and .ai? (A backup is made first.)";
    let force = false;
    if (f.used_by.length) {
      const v = await modal("Delete ai\\" + f.name, [h("p", { text: "Used by " + f.used_by.map((i) => "[" + i + "]").join(" ") +
        ": deleting it leaves them naming a missing file (the DLL logs it, and they have no AI)." })],
        [["Delete anyway", true], ["Cancel", false, true]]);
      if (!v) return;
      force = true;
    } else if (!confirm(msg)) return;
    try {
      const r = await invoke("ai.delete", { name: f.name, force });
      await refreshState();
      if (AI.name === f.name) { AI.name = null; AI.dirty = false; }
      toast((f.pending ? "Dropped " : "Deleted ") + "ai\\" + r.deleted + (r.backup ? "\nbackup: " + r.backup : ""), false, r.backup);
      renderAIList();
    } catch (e) { fail(e); }
  }

  function kernelChooser(o) {
    const box = h("div", { class: "kchooser" });
    const k = o.kernel;
    box.appendChild(h("div", { class: "kactive" }, h("div", { class: "klabel", text: k ? k.label : "no kernel" }),
      k ? h("div", { class: "tag", text: k.where }) : null,
      k ? h("div", { class: "tag", text: k.size + " bytes · sha1 " + k.sha1 }) : null));
    const sel = h("select", { title: "the kernel whose character AI is shown here" });
    for (const x of o.kernels) {
      const op = h("option", { value: x.id, text: x.label });
      if (x.id === o.kernel_id) op.selected = true;
      sel.appendChild(op);
    }
    sel.appendChild(h("option", { value: "__other", text: "Other file..." }));
    const other = h("div", { class: "kother", style: "display:none" });
    const path = h("input", { type: "text", placeholder: "full path of a KERNEL.BIN" });
    // the file dialog is the main process's (ai.kernel_pick): the page never reads the file itself
    const file = h("button", { text: "Pick a file...", title: "a KERNEL.BIN from this computer (read for this session; at most 1 MB)",
      onclick: async () => { try { await api("/api/ai/kernel_pick", {}); kernelChanged(); } catch (e) { fail(e); } } });
    other.append(path, h("button", { text: "Use", onclick: () => chooseKernel({ path: path.value.trim() }) }), h("span", { class: "tag", text: "or:" }), file);
    sel.addEventListener("change", () => {
      if (sel.value === "__other") { other.style.display = ""; return; }
      chooseKernel({ id: sel.value });
    });
    box.append(sel, other, h("div", { class: "knote", text: o.kernel_note }));
    return box;
  }
  async function chooseKernel(body) {
    try { await api("/api/ai/kernel_choose", body); kernelChanged(); } catch (e) { fail(e); }
  }
  function kernelChanged() {
    if (library) library.reload();
    if (AI.readonly) {          // a game AI on show came from the kernel before: clear it
      AI.name = null; AI.view = null; AI.text = "";
      $("#aicards").innerHTML = ""; $("#aitext").value = ""; $("#ainame").innerHTML = ""; $("#aiprobs").innerHTML = "";
      aiTitle("Battle AI", "the kernel changed: pick a character under Game AI");
    }
    renderAIList();
  }

  function aiTitle(t, info) { $("#aititle").textContent = t; $("#aiinfo").textContent = info || ""; }

  async function loadAIText(text, opts) {
    AI.text = text;
    AI.rawDirty = false;
    $("#aitext").value = text;
    AI.view = boxBodies(await api("/api/ai/cards", { text }));
    renderAICards();
  }

  async function openAI(name) {
    if (AI.dirty && !confirm("Drop the unsaved AI text?")) return;
    try {
      const r = await api("/api/ai/open" + q({ name }));
      AI.name = name; AI.readonly = false; AI.dirty = false;
      $("#ainame").innerHTML = "";
      aiTitle("ai\\" + name + (r.source === "txt" ? ".txt" : ".ai (disassembled)"),
        (r.has_ai ? r.block_size + " bytes" : "no .ai yet") + (r.in_sync === false ? " · the .txt and the .ai differ: Save writes the .ai from the text" : ""));
      await loadAIText(r.text);
      renderAIList();
    } catch (e) { fail(e); }
  }

  async function viewGame(g) {
    if (AI.dirty && !confirm("Drop the unsaved AI text?")) return;
    try {
      const r = await api("/api/ai/from_kernel", { kernel_id: AI.over.kernel_id, character: String(g.entry) });
      AI.name = "entry" + g.entry; AI.readonly = true; AI.dirty = false;
      aiTitle(g.name + "'s game AI", "entry " + g.entry + " of " + AI.over.kernel.label + " (sha1 " + AI.over.kernel.sha1 + "), as entry 0 of a block · read only" + (r.warning ? " · " + r.warning : ""));
      const nm = h("input", { type: "text", placeholder: "NAME", size: 12, title: "the file name: ai\\NAME.ai (then ai = NAME in the Characters file)" });
      $("#ainame").innerHTML = "";
      $("#ainame").append(nm, h("button", { text: "New file from this", onclick: async () => {
        const n = nm.value.trim();
        if (!/^[A-Za-z0-9_-]{1,31}$/.test(n)) return toast("ai must be a file name of 1 to 31 characters: letters, digits, _ and -", true);
        if (AI.over.files.some((f) => f.name.toLowerCase() === n.toLowerCase()) && !confirm("ai\\" + n + " exists. Replace it when you Save?")) return;
        AI.name = n; AI.readonly = false; AI.dirty = true;
        $("#ainame").innerHTML = "";
        aiTitle("ai\\" + n + ".txt (new, not saved)", "from " + g.name + "'s AI in " + AI.over.kernel.label);
        renderAICards();
      } }));
      await loadAIText(r.text);
      renderAIList();
    } catch (e) { fail(e); }
  }

  function renderAICards() {
    const el = $("#aicards");
    el.innerHTML = "";
    const v = AI.view;
    if (!v) return;
    const ro = AI.readonly;
    v.entries.forEach((e, ei) => {
      const head = e.head.split(";");
      el.appendChild(h("h3", { class: "aientry" }, "Entry " + e.indices.join(", "),
        head[1] ? h("span", { class: "muted", text: "  " + head.slice(1).join(";").trim() }) : null,
        e.indices.length > 1 ? h("span", { class: "tag", text: "  (entries " + e.indices.join(", ") + " share these sections)" }) : null,
        e.raw_items ? h("span", { class: "tag", text: "  · raw bytes in this entry: see Whole file" }) : null));
      const grid = h("div", { class: "cardgrid" });
      for (const c of e.cards) {
        const card = h("div", { class: "aicard" + (c.item === null ? " empty" : "") + (c.problems && c.problems.length ? " bad" : ""), "data-section": c.name });
        const openIt = c.item !== null ? () => openSectionWindow(ei, c.section) : null;
        card.appendChild(h("div", { class: "cardhead", title: c.item !== null ? "double-click: open this section in its own window, with what it does in plain English" : "" },
          h("b", { text: c.title }), h("span", { class: "tag", text: " " + c.name + " (" + c.section + ")" }),
          openIt ? h("button", { class: "link open", text: "open \u2197", onclick: openIt }) : null));
        if (openIt) card.addEventListener("dblclick", (ev) => { if (ev.target.tagName !== "TEXTAREA") openIt(); });
        card.appendChild(h("div", { class: "cardnote", text: c.note }));
        if (c.item === null) {
          if (!ro) card.appendChild(h("button", { text: "add", title: "a new script for this section (it ends at once until you write it)", onclick: () => cardEdit({ op: "add", entry: ei, section: c.section }) }));
          else card.appendChild(h("div", { class: "muted", text: "no script" }));
        } else {
          if (c.shared_with.length) card.appendChild(h("div", { class: "shared", text: "one script shared with: " + c.shared_with.join(", ") + " (an edit here changes it for all of them)" }));
          const ta = h("textarea", { spellcheck: "false", wrap: "off", rows: Math.min(18, Math.max(4, c.body.split("\n").length)) });
          ta.value = c.body;
          ta.readOnly = ro;
          ta.addEventListener("input", () => { AI.dirty = true; });
          const remember = () => { AI.lastFocus = { ei, sec: c.section, pos: ta.selectionStart }; };
          for (const ev of ["focus", "click", "keyup", "select"]) ta.addEventListener(ev, remember);
          ta.addEventListener("change", () => cardEdit({ op: "apply_text", entry: ei, item: c.item, body: ta.value + "\n" }));
          card.appendChild(ta);
          const pr = h("div", { class: "cardcheck" + (c.problems.length ? " bad" : "") },
            c.problems.length ? c.problems.map((p) => p.text).join("\n") : (v.check.ok ? "ok" : ""));
          card.appendChild(pr);
          if (!ro) card.appendChild(h("button", { text: "remove", title: c.shared_with.length ? "this section leaves the shared script" : "remove this section's script",
            onclick: () => { if (confirm("Remove the " + c.title + " (" + c.name + ") script?")) cardEdit({ op: "remove", entry: ei, section: c.section }); } }));
        }
        grid.appendChild(card);
      }
      el.appendChild(grid);
    });
    showAIProblems();
    notifyWindows();
  }

  function showAIProblems() {
    const v = AI.view;
    if (!v) return;
    const probs = v.check.problems || [];
    renderProbs($("#aiprobs"), probs, (p) => { if (p.line) { setAITab("raw"); gotoLine($("#aitext"), p.line); } });
    if (!probs.length) $("#aiprobs").appendChild(h("div", { class: "prob ok", text: "ok: " + v.check.size + " bytes; the DLL's block rules pass" }));
    renderGutter($("#aitext"), $("#aigutter"), probs);
  }

  // A card's body as its text boxes hold it (the section window's, the card's): a text box turns CRLF into LF and a
  // lone CR into a line break, so the body is given to it that way, and the CR of the script's last line (its LF is
  // the card's end) is dropped; else the box showed one more line, and an edit sent it back as a new blank line. Put
  // back through apply_text, every line not changed keeps its own ending on disk.
  function boxBodies(v) {
    for (const e of (v && v.entries) || []) {
      for (const c of e.cards || []) if (typeof c.body === "string") c.body = c.body.replace(/\r\n/g, "\n").replace(/\r$/, "");
    }
    return v;
  }

  async function cardEdit(body) {
    body.text = AI.text;
    try {
      const r = await api("/api/ai/card_edit", body);
      AI.dirty = true;
      AI.text = r.text;
      $("#aitext").value = r.text;
      AI.view = boxBodies(r);
      renderAICards();
    } catch (e) { fail(e); renderAICards(); }
  }

  // the Whole file text box put back through apply_edited_text: a line not touched keeps its own ending
  async function applyRawAI() {
    const r = await api("/api/ai/card_edit", { op: "apply_text", text: AI.text, body: $("#aitext").value });
    AI.text = r.text;
    AI.rawDirty = false;
    AI.view = boxBodies(r);
    renderAICards();
  }
  async function setAITab(tab) {
    if (AI.tab === "raw" && tab !== "raw" && AI.rawDirty) {
      try { await applyRawAI(); AI.dirty = true; } catch (e) { fail(e); }
    }
    AI.tab = tab;
    $$("#aitabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    $$("#page-ai .tab").forEach((t) => t.classList.toggle("on", t.id === "aitab-" + tab));
  }

  function gotoLine(ta, line) {
    const lines = ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    ta.focus();
    ta.setSelectionRange(pos, pos + (lines[line - 1] || "").length);
  }
  async function aiCheck() {
    if (AI.tab === "raw" && AI.rawDirty) await applyRawAI();
    AI.view = boxBodies(await api("/api/ai/cards", { text: AI.text }));
    renderAICards();
    return AI.view.check;
  }
  async function aiSave() {
    if (!AI.name || AI.readonly) return toast("open an AI file, or make one with \"New file from this\"", true);
    try {
      const chk = await aiCheck();
      let force = false;
      if (!chk.ok) {
        if (chk.size === undefined) return toast("not saved: the text does not assemble (see the problems)", true);
        if (!confirm("The block has problems the DLL would refuse. Save anyway?")) return;
        force = true;
      }
      const r = await api("/api/ai/save", { name: AI.name, text: AI.text, force });
      AI.dirty = false;
      toast("Saved ai\\" + AI.name + ".ai (" + r.size + " bytes) and its .txt" + (r.backup ? "\nbackup: " + r.backup : "") +
        "\nA new .ai file is seen by the game after a restart.");
      await openAI(AI.name);
    } catch (e) { fail(e); }
  }

  // ---- pages, keys -----------------------------------------------------------------------------------
  // the pages of the sidebar: "files" is the kind page (every .ini kind, Game options, the text files); "game" opens
  // the game file there
  function showPage(p) {
    if (p === "game") { openFile(GAME).catch(fail); return; }
    S.page = p;
    $$(".page").forEach((x) => x.classList.toggle("on", x.id === "page-" + p));
    if (p !== "files") { const e = K.ENTRIES.find((x) => x.page === p); if (e) S.entry = e.id; }
    renderSidebar();
    if (p === "problems") { refreshProblems().catch(fail); renderLog(); }
    if (p === "ai") renderAIList();
    if (p === "library") renderLibrary();
    if (p === "live") window.SpellExtLive.show(); else window.SpellExtLive.hide();
  }

  // ---- the Library (stage S5, design 3.5): templates.js draws it; the lib.* routes do the work -------------------
  function libHost() {
    return { invoke, h, modal, toast: (m, bad) => toast(m, bad), openFile: (path, line) => openFile(path, line),
             showAI: async (name) => { showPage("ai"); if (name) await openAI(name); },
             refresh: async () => { await refreshState(); renderSidebar(); refreshProblems().catch(() => {}); } };
  }
  async function renderLibrary() {
    const opts = S.libKind !== undefined ? { kind: S.libKind } : undefined;
    S.libKind = undefined;
    await window.SpellExtTemplates.show($("#librarynote"), libHost(), opts);
  }
  // "+ Add from template" on a kind page: the Library with that kind chosen
  function addFromTemplate(kind) {
    afterSecText(() => { S.libKind = kind; showPage("library"); });
  }

  function wire() {
    $$("#filetabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $$("#probtabs button").forEach((b) => b.addEventListener("click", () => {
      $$("#probtabs button").forEach((x) => x.classList.toggle("on", x === b));
      $$("#page-problems .tab").forEach((t) => t.classList.toggle("on", t.id === "ptab-" + b.dataset.tab));
    }));
    $("#probrefresh").addEventListener("click", () => { refreshProblems().catch(fail); renderLog(); });
    $("#save").addEventListener("click", () => saveFile());
    $("#saveall").addEventListener("click", () => saveAll().catch(fail));
    $("#revert").addEventListener("click", async () => {
      if (!S.file) return;
      if ((S.view.dirty || S.secDirty) && !confirm("Drop the unsaved edits of " + S.file + "?")) return;
      try { setView(await api("/api/file/reload", { path: S.file })); } catch (e) { fail(e); }
    });
    const raw = $("#raw");
    raw.addEventListener("input", () => { S.rawDirty = true; renderGutter(raw, $("#gutter"), S.view ? S.view.problems : []); });
    raw.addEventListener("scroll", () => ($("#gutter").scrollTop = raw.scrollTop));
    $("#rawapply").addEventListener("click", applyRaw);
    const at = $("#aitext");
    at.addEventListener("input", () => { AI.rawDirty = true; AI.dirty = true; renderGutter(at, $("#aigutter"), []); });
    at.addEventListener("scroll", () => ($("#aigutter").scrollTop = at.scrollTop));
    $$("#aitabs button").forEach((b) => b.addEventListener("click", () => setAITab(b.dataset.tab)));
    $("#ailib").addEventListener("click", toggleLibrary);
    $("#aicheck").addEventListener("click", () => aiCheck().catch(fail));
    $("#aisave").addEventListener("click", aiSave);
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (S.page === "ai") aiSave();
        else if (S.page === "files") saveFile();
      }
    });
    window.addEventListener("beforeunload", (e) => {
      if ((S.state && (S.state.dirty || []).length) || S.rawDirty || S.secDirty || AI.dirty) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  // ---- the first screen (open.js) and the folder ------------------------------------------------------
  function showOpen() {
    S.page = "open";
    $("#nav").hidden = true;
    $("#saveall").hidden = true;
    $("#foldername").textContent = "";
    $$(".page").forEach((x) => x.classList.toggle("on", x.id === "page-open"));
    window.SpellExtLive.hide();
    window.SpellExtOpen.show();
  }
  async function closeFolder() {
    if (!(await applySecText())) return;
    if (S.rawDirty && !(await applyRaw())) return;
    await refreshState();
    const dirty = S.state.dirty || [];
    if (dirty.length) {
      const v = await modal("Unsaved changes", [h("p", { text: dirty.length + " file(s) have unsaved changes: " + dirty.join(", ") + "." })],
        [["Save all first", "save", true], ["Drop them", "drop"], ["Keep editing", "keep"]]);
      if (v === "keep") return;
      if (v === "save" && !(await saveAll())) return;
    }
    S.state = await invoke("app.close_folder", { discard: true });
    S.file = null; S.view = null; S.section = null; S.allProblems = {}; S.entry = null; S.expanded.clear();
    banners();
    showOpen();
  }
  // a folder is open: the page as the Python tool showed it
  async function afterOpen(st) {
    S.state = st;
    $("#nav").hidden = false;
    $("#saveall").hidden = false;
    S.schema = await api("/api/schema");
    S.file = null; S.view = null; S.section = null;
    await refreshState();
    await refreshProblems();
    const first = S.state.files.find((f) => f.path === GAME) || S.state.files[0];
    if (first) await openFile(first.path);
    // opening lands on Problems when the folder has any, else Game options (design 3.1)
    const n = Object.values(S.allProblems).reduce((a, ps) => a + ps.filter((p) => p.kind === "problem").length, 0);
    if (n) showPage("problems");
    if (!S.timer) S.timer = setInterval(() => { if (S.page !== "open") api("/api/state").then((x) => { S.state = x; banners(); }).catch(() => {}); }, 5000);
  }
  function wireTop() {
    $("#foldername").addEventListener("click", () => closeFolder().catch(fail));
    $("#toast").addEventListener("click", () => { if (toastBackup) showBackup(toastBackup); });
    const menu = $("#settingsmenu");
    menu.addEventListener("toggle", async () => {
      if (!menu.open) return;
      try {
        const st = await invoke("app.settings", {});
        $("#set_confirm").checked = st.confirm_save;
        $("#set_openlast").checked = st.open_last;
        $("#set_versions").textContent = "Electron " + (S.state.versions.electron || "?") + ", Node " + S.state.versions.node;
      } catch (e) { fail(e); }
    });
    const set = async (k, v) => {
      try { const st = await invoke("app.settings", { set: { [k]: v } }); if (S.state) S.state.settings = st; } catch (e) { fail(e); }
    };
    $("#set_confirm").addEventListener("change", (e) => set("confirm_save", e.target.checked));
    $("#set_openlast").addEventListener("change", (e) => set("open_last", e.target.checked));
  }

  async function start() {
    wire();
    wireTop();
    window.SpellExtLive.mount($("#page-live"), { api: (path) => api(path), toast });
    window.SpellExtOpen.mount($("#page-open"), { invoke, toast, opened: (st) => afterOpen(st).catch(fail) });
    try {
      const st = await invoke("app.state");
      S.state = st;
      if (!st.folder) { showOpen(); return; }
      await afterOpen(st);
    } catch (e) { fail(e); }
  }
  // for the headless smoke test (tests/smoke) and the console: what the buttons call
  window.SpellExtPage = { saveAll, saveAllForClose, closeFolder, openFile, refreshState, state: () => S.state,
                          view: () => S.view, tab: () => S.tab, page: () => S.page, secDirty: () => S.secDirty };
  start();
})();
