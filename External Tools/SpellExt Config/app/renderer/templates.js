/* The Library (design 3.5): Add from template (kind, template, a short form, a preview of the exact lines with the
   proof's answer, Add) and Save as template (a section of the folder as a template of the user's, kept in
   SpellExtConfig/FF7_SpellExt_Templates.txt), Import and Export. All logic is the main process's (lib.* routes): this
   page shows what they say and sends the values. Nothing is written by Add: the lines become unsaved edits, Save
   writes them.
   S6a: the Character kind (switches, the reference panel, the ID's checks and the leftover groups, the prerequisites)
   and the AI kind (the game's character AI exported, the recipe cards: a preview of the text, its check and its
   English; Add stages the file for Save, Save now writes it). "make one now" on a character's AI goes to the AI kind
   with the name filled in and comes back with the staged name. */
"use strict";
window.SpellExtTemplates = (function () {
  const KINDS = [["", "All"], ["item", "Item"], ["weapon", "Weapon"], ["armour", "Armour"], ["accessory", "Accessory"],
    ["materia", "Materia"], ["spell", "Spell"], ["shop", "Shop line"], ["test", "Test line"], ["character", "Character"], ["ai", "AI"]];
  // the file each kind lives in (the "+ Add from template" of a kind page preselects its kind)
  const KIND_OF_FILE = { "ff7_spellext_items.ini": "item", "ff7_spellext_weapons.ini": "weapon", "ff7_spellext_armour.ini": "armour",
    "ff7_spellext_accessories.ini": "accessory", "ff7_spellext_materia.ini": "materia", "ff7_spellext_spells.ini": "spell",
    "ff7_spellext_shops.ini": "shop", "ff7_spellext_characters.ini": "character" };
  const L = { host: null, el: null, list: null, kind: "", pick: null, values: {}, positions: [], suggest: {}, outlines: {},
              preview: null, busy: false, ref: null, back: null, overwrite: false };
  let h = null;

  function kindOfFile(path) { return KIND_OF_FILE[(path || "").toLowerCase()] || null; }
  const isRepeated = (p) => p.name.endsWith("#");
  const isSwitch = (p) => p.base === "switch";

  async function show(el, host, opts) {
    L.host = host; L.el = el; h = host.h;
    if (opts && opts.kind !== undefined) { L.kind = opts.kind || ""; L.pick = null; L.back = null; }
    try {
      L.list = await host.invoke("lib.list", {});
    } catch (e) {
      el.innerHTML = "";
      el.appendChild(h("div", { class: "banner bad", text: e.message }));
      return;
    }
    if (L.pick && !L.list.templates.some((t) => t.id === L.pick.id)) L.pick = null;
    else if (L.pick) L.pick = L.list.templates.find((t) => t.id === L.pick.id);
    draw();
  }

  function draw() {
    const el = L.el;
    el.innerHTML = "";
    const list = L.list;
    const bar = h("div", { class: "libbar" },
      h("div", { class: "tabs libkinds" }, KINDS.map(([k, label]) => h("button", { class: L.kind === k ? "on" : null, "data-kind": k,
        text: label, onclick: () => { L.kind = k; L.pick = null; L.back = null; draw(); } }))),
      h("div", { class: "spacer" }),
      h("button", { text: "Import...", title: "add the templates of a text file to " + list.user_file, onclick: importFile }),
      h("span", { class: "muted", text: "yours: " + list.user_file + (list.user_exists ? "" : " (not made yet)") }));
    el.appendChild(bar);
    if (!list.kernel) el.appendChild(h("div", { class: "banner info", text: "No KERNEL.BIN read from the game folder (nor chosen on the AI page): the base lists show numbers only, a materia's first attribute byte comes from the Materia readme's table, and a character's limit copy and guest stats cannot be made." }));
    for (const p of list.problems) {
      el.appendChild(h("div", { class: "banner warn", text: list.user_file + " line " + p.line + (p.id ? " (" + p.id + ")" : "") + ": " + p.text + " (that template is left out)" }));
    }
    for (const p of list.builtin_problems || []) el.appendChild(h("div", { class: "banner bad", text: "tool bug: built-in templates line " + p.line + ": " + p.text }));
    if (L.back) el.appendChild(h("div", { class: "banner info", text: "Making an AI for " + L.back.title + ": Add stages it, and the character's form comes back with it." }));
    const split = h("div", { class: "libsplit" });
    const cards = h("div", { class: "tcards" });
    const shown = list.templates.filter((t) => !L.kind || t.kind === L.kind);
    for (const t of shown) cards.appendChild(card(t));
    if (!shown.length) cards.appendChild(h("p", { class: "muted", text: "No template of this kind." }));
    split.appendChild(cards);
    const pane = h("div", { class: "tpane", id: "tpane" });
    split.appendChild(pane);
    el.appendChild(split);
    if (L.pick) drawForm(pane); else pane.appendChild(h("p", { class: "muted", text: "Pick a template on the left: a short form, then a preview of the exact lines, then Add." }));
  }

  function card(t) {
    const base = (t.notes[0] || "").split(". ")[0];
    const c = t.character;
    return h("div", { class: "tcard" + (L.pick && L.pick.id === t.id ? " on" : ""), "data-id": t.id, onclick: () => pick(t) },
      h("div", { class: "ttitle" }, t.title,
        t.bundle ? h("span", { class: "kbadge bundle", text: "bundle", title: "also adds sections to " + t.parts.slice(1).map((p) => p.file).join(", ") }) : null,
        t.kind === "ai" ? h("span", { class: "kbadge", text: t.source.split(":")[0] === "kernel" ? "game AI" : "recipe" }) : null,
        t.builtin ? null : h("span", { class: "kbadge yours", text: "yours" })),
      h("div", { class: "muted", text: c ? "kernel character " + c.kernel + " · battle files " + c.prefix + " · limits " + c.limits : base }),
      t.kind === "ai" && t.warns.length ? h("div", { class: "knote", text: t.warns.join("; ") }) : null,
      t.kind === "ai" ? null : h("div", { class: "tacts" },
        h("button", { text: "Export...", title: "write this template to a file of your choice", onclick: (e) => { e.stopPropagation(); exportOne(t.id); } }),
        t.builtin ? null : h("button", { text: "Remove", onclick: (e) => { e.stopPropagation(); removeOne(t.id); } })));
  }

  async function pick(t, values) {
    L.pick = t; L.values = Object.assign({}, values || {}); L.preview = null; L.suggest = {}; L.ref = null; L.overwrite = false;
    L.positions = t.parts.map(() => null);
    // the sections of each part's file, for "after [..]" / "before [..]"
    for (const p of t.parts) {
      if (L.outlines[p.file] === undefined) {
        try { L.outlines[p.file] = (await L.host.invoke("file.open", { path: p.file })).outline.filter((s) => s.header && !s.commented).map((s) => s.header); }
        catch (e) { L.outlines[p.file] = []; }
      }
    }
    if (t.kind === "character") {
      try { L.ref = await L.host.invoke("lib.reference", { id: t.id }); } catch (e) { L.ref = { rows: [], problem: e.message }; }
    }
    if (t.kind !== "ai") await suggest();
    draw();
  }

  async function suggest() {
    try { L.suggest = await L.host.invoke("lib.suggest", { id: L.pick.id, values: body().values }); }
    catch (e) { L.suggest = {}; L.host.toast(e.message, true); }
  }

  // the placeholders with their copies (NAME# -> NAME1..NAMEn for the count the form holds)
  function expandedPlaceholders(t) {
    const out = [];
    for (const p of t.placeholders) {
      if (!isRepeated(p)) { out.push([p.name, p, 0]); continue; }
      const cp = t.placeholders.find((x) => x.name === p.repeat);
      const n = Math.max(0, Math.min(20, Number(L.values[p.repeat] !== undefined ? L.values[p.repeat] : (cp ? cp.default : 1)) || 0));
      for (let k = 1; k <= n; k++) out.push([p.name.slice(0, -1) + k, p, k]);
    }
    return out;
  }

  // a switch's state as the form holds it (the template's default until changed)
  function switchOn(name) {
    const p = L.pick.placeholders.find((x) => x.name === name);
    const v = L.values[name] !== undefined ? L.values[name] : (p ? p.default : "off");
    return String(v).toLowerCase() === "on";
  }

  // turning a switch on turns the others of its exclusive group off; turning one off turns off the switches that need it
  function setSwitch(name, on) {
    L.values[name] = on ? "on" : "off";
    if (on) {
      for (const x of L.pick.exclusive || []) if (x.includes(name)) for (const n of x) if (n !== name) L.values[n] = "off";
    } else {
      for (const p of L.pick.placeholders) if (isSwitch(p) && p.needs === name) L.values[p.name] = "off";
    }
    L.preview = null;
  }

  // a placeholder written only while its switches are on: its row is dimmed while one is off
  function gatedOff(p) { return (p.gates || []).some((g) => !switchOn(g)); }

  function labelOf(name) {
    const p = L.pick.placeholders.find((x) => x.name === name);
    return p ? p.label : name;
  }

  function control(name, p, k) {
    const cur = L.values[name];
    const def = k ? (p.default || "").split("#").join(String(k)) : p.default;
    const set = (v) => { L.values[name] = v; L.preview = null; drawPreview(); };
    if (isSwitch(p)) {
      const needOff = p.needs && !switchOn(p.needs);
      const cb = h("input", { type: "checkbox", "data-ph": name, checked: switchOn(name) ? true : null,
        disabled: p.blocked || needOff ? true : null });
      cb.addEventListener("change", async () => { setSwitch(name, cb.checked); await suggest(); redraw(); });
      return h("span", {}, cb, " ", h("span", { class: "muted", text: p.blocked ? "cannot be on: " + p.blocked :
        needOff ? "needs \"" + labelOf(p.needs) + "\" on" : "" }));
    }
    if (p.base === "id") {
      const s = L.suggest[name] || {};
      const inp = h("input", { type: "text", size: 8, "data-ph": name, placeholder: s.next !== null && s.next !== undefined ? String(s.next) : "full" });
      inp.value = cur !== undefined ? cur : (s.next !== null && s.next !== undefined ? String(s.next) : "");
      L.values[name] = inp.value;
      inp.addEventListener("input", () => set(inp.value.trim()));
      const sel = h("select", { title: "next free, or an ID the file shows commented out" + (s.leftovers ? ", or a leftover limits group to adopt" : "") },
        h("option", { value: "", text: "next free" }),
        (s.commented || []).map((c) => h("option", { value: String(c.id), text: "commented ;[" + c.id + "] (line " + c.line + ")" + (c.ai_mentions.length ? " - named by " + c.ai_mentions.join(", ") : "") })),
        (s.leftovers || []).map((g) => h("option", { value: String(g.id), text: "adopt the leftover limits group [" + g.id + "]: " + g.sections.map((x) => x.header).join(" ") })));
      sel.addEventListener("change", () => { inp.value = sel.value || (s.next !== null && s.next !== undefined ? String(s.next) : ""); set(inp.value); });
      const out = h("span", {}, inp, " ", sel, " ", h("span", { class: "muted", text: s.refused ? s.refused : "range " + (s.range || "") }));
      if (s.checks) {
        const lines = [];
        if (s.checks.limits_sections.length) lines.push("FF7_SpellExt_Limits.ini has " + s.checks.limits_sections.map((x) => x.header).join(", ") + ": the character would adopt them");
        for (const e of s.checks.equip_lines) lines.push(e.file + " " + e.header + " has equip = " + e.value + ": that gear would become the new character's");
        for (const u of s.checks.used_before) lines.push((u.where === "commented" ? "a commented-out [" + s.next + "] is in the file (line " + u.line + ")" :
          "[" + s.next + "] is in " + u.file) + ": a save's companion .sxc may still carry a record for it (evidence, not proof: the saves are not read)");
        for (const l of lines) out.appendChild(h("div", { class: "knote", text: l }));
      }
      return out;
    }
    const choices = p.base === "enum" || p.base === "ai_word" || (p.base === "ai_param" && p.words.length) ? p.words.map((w) => [w, w]) :
      (p.base === "kernel" || p.base === "gear_id") && p.choices.length ? p.choices.map(([n, nm]) => [String(n), n + " " + nm]).concat(p.words.map((w) => [w, w])) :
      p.base === "ai_ref" ? p.choices.map(([n, what]) => [n, n + " (" + what + ")"]) : null;
    if (choices) {
      const sel = h("select", { "data-ph": name }, choices.map(([v, t]) => h("option", { value: v, text: t })));
      const v0 = cur !== undefined ? cur : def;
      if (p.base === "ai_ref" && !choices.some(([v]) => v === v0)) sel.insertBefore(h("option", { value: v0 || "", text: v0 ? v0 + " (not found)" : "(choose a file)" }), sel.firstChild);
      const hit = [...sel.options].find((o) => o.value.toLowerCase() === String(v0).toLowerCase() || (o.value !== "" && Number(o.value) === Number(v0)));
      sel.value = hit ? hit.value : sel.options.length ? sel.options[0].value : "";
      L.values[name] = sel.value;
      sel.addEventListener("change", () => { set(sel.value); if (p.base === "count") redraw(); });
      if (p.base === "ai_ref") {
        return h("span", {}, sel, " ", h("button", { text: "make one now", id: "tmakeai",
          title: "the Library's AI section, with the name filled in: Add stages it and comes back here", onclick: makeAI }));
      }
      return sel;
    }
    const runDef = p.run_default !== undefined ? p.run_default : undefined;
    const inp = h("input", { type: "text", "data-ph": name, size: p.base === "text95" || p.base === "kernel_desc" ? 60 :
      p.base.startsWith("text") || p.base === "kernel_name" ? 32 : 28 });
    inp.value = cur !== undefined ? cur : (def !== "" ? def : (runDef !== undefined && runDef !== null ? runDef : ""));
    const most = { text11: 11, text24: 24, text31: 31, text95: 95, kernel_name: 31, kernel_desc: 95, portrait: 12, battle_prefix: 2, ai_name: 31 }[p.base];
    if (most) inp.setAttribute("maxlength", String(most));
    const hint = p.base === "int" || p.base === "count" || (p.base === "ai_param" && p.lo !== null) ? p.lo + " to " + p.hi + (p.words.length ? ", or " + p.words.join(", ") : "") :
      most ? "at most " + most + " characters" + (p.base.startsWith("kernel_") ? " (read from KERNEL.BIN" + (runDef === null ? ": none read" : "") + ")" : "") :
      p.base === "kernel_stat" ? "the guest record's" + (runDef === null ? " (no KERNEL.BIN)" : "") :
      p.base === "limit_item_id" ? "105 to 127, not an item of the items file, not another character's" :
      p.base === "level" ? "1 to 99, party, or a character's name, +/- a number" : p.type;
    inp.addEventListener("input", () => set(inp.value));
    if (p.base === "count") inp.addEventListener("change", async () => { await suggest(); redraw(); });
    return h("span", {}, inp, " ", h("span", { class: "muted", text: hint }));
  }

  function redraw() { const pane = document.getElementById("tpane"); if (pane) { pane.innerHTML = ""; drawForm(pane); } }

  // "make one now" (design 4.10): the AI kind with the name filled in from the character's name; Add comes back here
  function makeAI() {
    const t = L.pick;
    const nmp = t.placeholders.find((p) => p.name === "NAME");
    const nm = String(L.values.NAME !== undefined ? L.values.NAME : (nmp ? nmp.default : ""))
      .toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 28) || "new";
    L.back = { id: t.id, title: t.title, values: Object.assign({}, L.values) };
    L.kind = "ai";
    const c = t.character;
    const exp = c ? L.list.templates.find((x) => x.kind === "ai" && x.source === "kernel:" + c.kernel) : null;
    const target = exp || L.list.templates.find((x) => x.kind === "ai");
    pick(target, { NAME: nm + "_ai" });
  }

  function drawForm(pane) {
    const t = L.pick;
    pane.appendChild(h("h3", { text: t.title }));
    for (const n of t.notes) pane.appendChild(h("p", { class: "muted", text: n }));
    if (L.ref) pane.appendChild(referencePanel(L.ref));
    const form = h("div", { class: "tform" });
    const sws = [];
    for (const [name, p, k] of expandedPlaceholders(t)) {
      // an ID of a part a switch leaves out is not allocated: no row
      if (p.base === "id" && t.parts[p.part] && t.parts[p.part].when && !switchOn(t.parts[p.part].when)) continue;
      const off = t.kind !== "ai" && gatedOff(p);
      const row = h("div", { class: "trow" + (off ? " off" : "") + (isSwitch(p) ? " tswitch" : "") },
        h("label", { text: (k ? p.label.split("#").join(String(k)) : p.label) + (off ? " (written commented out)" : "") }),
        h("div", { class: "tval" }, control(name, p, k)));
      if (isSwitch(p)) sws.push(row); else form.appendChild(row);
    }
    if (sws.length) {
      form.appendChild(h("div", { class: "muted tswitches", text: "Switches: a line a switch turns off is written commented out (the kind page shows it; uncomment it there), a part it turns off is not written." }));
      for (const r of sws) form.appendChild(r);
    }
    // Where: every part that is not a line into a fixed section (a part a switch leaves out has none)
    if (t.kind !== "ai") t.parts.forEach((part, i) => {
      if (part.when && !switchOn(part.when)) return;
      if (/^into:/.test(part.position)) {
        form.appendChild(h("div", { class: "trow" }, h("label", { text: "Where" + (t.parts.length > 1 ? " (" + part.file + ")" : "") }),
          h("div", { class: "tval muted", text: part.position.replace("into:", "into ").replace(" create", " (made when the file has none)") })));
        return;
      }
      const heads = L.outlines[part.file] || [];
      const sel = h("select", { "data-part": String(i) }, h("option", { value: "", text: "at the end of " + part.file }),
        heads.map((x) => h("option", { value: "after:" + x, text: "after " + x })),
        heads.map((x) => h("option", { value: "before:" + x, text: "before " + x })));
      sel.value = L.positions[i] || "";
      sel.addEventListener("change", () => { L.positions[i] = sel.value || null; L.preview = null; drawPreview(); });
      form.appendChild(h("div", { class: "trow" }, h("label", { text: "Where" + (t.parts.length > 1 ? " (" + part.file + ")" : "") }), h("div", { class: "tval" }, sel)));
    });
    pane.appendChild(form);
    if (t.kind === "ai") {
      pane.appendChild(h("div", { class: "tbtns" },
        h("button", { text: "Preview", onclick: doPreview }),
        h("button", { class: "primary", id: "tadd", text: "Add (keep for Save)", disabled: true, title: "Preview first: the file is staged, and Save or Save all writes it", onclick: doStage }),
        h("button", { id: "tsavenow", text: "Save now", disabled: true, title: "write ai\\NAME.txt and .ai at once (a backup first)", onclick: doSaveNow })));
    } else {
      pane.appendChild(h("div", { class: "tbtns" },
        h("button", { text: "Preview", onclick: doPreview }),
        h("button", { class: "primary", id: "tadd", text: "Add", disabled: true, title: "Preview first", onclick: doAdd })));
    }
    pane.appendChild(h("div", { id: "tpreview" }));
    drawPreview();
  }

  // the reference panel (design 4.8.4): what the kernel says now, and what the shipped vanilla table says
  function referencePanel(ref) {
    const det = h("details", { class: "tref", open: true }, h("summary", { text: "Reference (" + (ref.kernel_label || "no kernel") + ")" }));
    if (ref.problem) det.appendChild(h("p", { class: "err", text: ref.problem }));
    const tb = h("table", { class: "treftab" });
    for (const r of ref.rows) tb.appendChild(h("tr", {}, h("td", { text: r.label }), h("td", { text: r.value }), h("td", { class: "muted", text: r.source })));
    det.appendChild(tb);
    return det;
  }

  function body() {
    const values = {};
    for (const [k, v] of Object.entries(L.values)) if (v !== undefined && v !== null) values[k] = String(v);
    return { id: L.pick.id, values, positions: L.positions };
  }

  async function doPreview() {
    try { L.preview = await L.host.invoke("lib.preview", L.pick.kind === "ai" ? { id: L.pick.id, values: body().values } : body()); }
    catch (e) { L.preview = { problem: e.message }; }
    drawPreview();
  }

  function drawPreview() {
    const box = document.getElementById("tpreview");
    const add = document.getElementById("tadd");
    const now = document.getElementById("tsavenow");
    if (!box) return;
    box.innerHTML = "";
    const r = L.preview;
    if (add) add.disabled = !r || !r.ok;
    if (now) now.disabled = !r || !r.ok;
    if (!r) { box.appendChild(h("p", { class: "muted", text: L.pick.kind === "ai" ? "Preview shows the text, the assembler's check, its size and its English." :
      "Preview shows the exact lines and whether the DLL would report anything new." })); return; }
    if (r.problem) { box.appendChild(h("div", { class: "banner bad tproof", text: r.problem })); return; }
    if (r.kind === "ai") { drawAIPreview(box, r); return; }
    box.appendChild(h("div", { class: "banner tproof " + (r.ok ? "ok" : "bad"),
      text: r.ok ? "The DLL would report nothing new." : "The DLL would report " + r.new_messages.length + " new message(s): Add is off." }));
    for (const m of r.new_messages) box.appendChild(h("div", { class: "err", text: m.file + " line " + m.line + ": " + m.text }));
    for (const m of r.notes || []) box.appendChild(h("div", { class: "muted tnote", text: "The DLL will also note: " + m.text }));
    for (const w of r.warnings) box.appendChild(h("div", { class: "banner warn twarn", text: "(tool) " + w }));
    if ((r.prerequisites || []).length) {
      const pre = h("div", { class: "tprereq" }, h("b", { text: "Prerequisites (the game file; shown, never edited): " }));
      for (const p of r.prerequisites) pre.appendChild(h("div", { class: p.ok ? "ok" : "knote", text: (p.ok ? "ok: " : "needs: ") + p.text }));
      pre.appendChild(h("button", { class: "link", text: "open Game options", onclick: () => L.host.openFile("FF7_SpellExt_Game.ini") }));
      box.appendChild(pre);
    }
    for (const p of r.parts) {
      box.appendChild(h("div", { class: "muted tfile", text: p.file + ", from line " + p.at }));
      box.appendChild(h("pre", { class: "tlines", text: p.lines.join("\n") }));
    }
  }

  function drawAIPreview(box, r) {
    box.appendChild(h("div", { class: "banner tproof " + (r.ok ? "ok" : "bad"),
      text: r.ok ? "The block assembles and passes the DLL's check: " + r.size + " bytes (ai\\" + r.name + ".ai)." :
        "The assembler or the DLL's check refuses it: Add is off." }));
    for (const p of r.problems) box.appendChild(h("div", { class: "err", text: (p.line ? "line " + p.line + ": " : "") + p.text }));
    for (const w of (r.warnings || []).concat(r.warning ? [r.warning] : [])) box.appendChild(h("div", { class: "banner warn twarn", text: w }));
    if (r.taken) {
      const cb = h("input", { type: "checkbox", id: "taioverwrite", checked: L.overwrite ? true : null });
      cb.addEventListener("change", () => { L.overwrite = cb.checked; });
      box.appendChild(h("div", { class: "knote" }, "ai\\" + r.name + " exists (or is staged): ", cb, " overwrite it"));
    }
    box.appendChild(h("div", { class: "muted tfile", text: "ai\\" + r.name + ".txt (from " + r.kernel + ")" }));
    box.appendChild(h("pre", { class: "tlines", text: r.text }));
    for (const e of r.english || []) {
      box.appendChild(h("div", { class: "muted tfile", text: "entry " + e.entry + ", " + e.section + ", in plain words:" }));
      box.appendChild(h("pre", { class: "tlines", text: e.lines.join("\n") }));
    }
    box.appendChild(h("p", { class: "muted", text: "A new .ai file is seen by the game only after a restart; a changed one is rebuilt at \"Re-init .ini files\"." }));
  }

  async function doAdd() {
    if (L.busy) return;
    L.busy = true;
    try {
      const r = await L.host.invoke("lib.insert", body());
      L.host.toast("Added to " + r.files.join(", ") + " (not saved: Save writes it)" + (r.warnings.length ? "; " + r.warnings.length + " warning(s)" : ""));
      L.preview = null;
      await L.host.refresh();
      const first = r.added[0];
      if (first) await L.host.openFile(first.file, first.line);
    } catch (e) { L.host.toast(e.message, true); }
    finally { L.busy = false; }
  }

  // Add on an AI card: the file is staged (ai.stage) and written by Save or Save all, into the save's backup folder
  async function doStage() {
    const r = L.preview;
    if (!r || !r.ok || L.busy) return;
    L.busy = true;
    try {
      await L.host.invoke("ai.stage", { name: r.name, text: r.text, overwrite: !!(r.taken && L.overwrite) });
      L.host.toast("Staged ai\\" + r.name + " (not saved: Save or Save all writes the .txt and the .ai)");
      await L.host.refresh();
      await comeBack(r.name);
    } catch (e) { L.host.toast(e.message, true); }
    finally { L.busy = false; }
  }

  async function doSaveNow() {
    const r = L.preview;
    if (!r || !r.ok || L.busy) return;
    if (r.taken && !L.overwrite) { L.host.toast("ai\\" + r.name + " exists: tick overwrite, or choose another name", true); return; }
    L.busy = true;
    try {
      const s = await L.host.invoke("ai.save", { name: r.name, text: r.text });
      L.host.toast("Saved ai\\" + r.name + ".ai (" + s.size + " bytes) and its .txt" + (s.backup ? "\nbackup: " + s.backup : "") +
        "\nA new .ai file is seen by the game after a restart.");
      await L.host.refresh();
      await comeBack(r.name);
    } catch (e) { L.host.toast(e.message, true); }
    finally { L.busy = false; }
  }

  // back to the character form that asked for an AI ("make one now"), with the library AI switched on and named
  async function comeBack(name) {
    if (!L.back) return;
    const back = L.back;
    L.back = null;
    L.list = await L.host.invoke("lib.list", {});
    const t = L.list.templates.find((x) => x.id === back.id);
    if (!t) return;
    L.kind = "character";
    const values = Object.assign({}, back.values, { AI_FILE: "on", AI_NAME: name });
    if (t.placeholders.some((p) => p.name === "AI_LIKE")) values.AI_LIKE = "off";
    await pick(t, values);
  }

  async function importFile() {
    try {
      const r = await L.host.invoke("lib.import", {});
      if (r.cancelled) return;
      L.list = r;
      L.host.toast("Imported " + r.imported.join(", ") + " into " + r.user_file);
      await L.host.refresh();
      draw();
    } catch (e) { L.host.toast(e.message, true); }
  }

  async function exportOne(id) {
    try {
      const r = await L.host.invoke("lib.export", { id });
      if (!r.cancelled) L.host.toast("Exported " + id + " to " + r.path);
    } catch (e) { L.host.toast(e.message, true); }
  }

  async function removeOne(id) {
    if (!confirm("Remove the template " + id + " from your templates file? (A backup is made first.)")) return;
    try {
      L.list = await L.host.invoke("lib.remove_user", { id });
      if (L.pick && L.pick.id === id) L.pick = null;
      await L.host.refresh();
      draw();
      L.host.toast("Removed " + id);
    } catch (e) { L.host.toast(e.message, true); }
  }

  // ---- Save as template (design 3.5, 4.6): a section of a kind page, its key lines offered as placeholders, its links
  // as parts, the template text shown and editable before Save
  async function saveAs(host, path, line) {
    h = host.h;
    let cap;
    try { cap = await host.invoke("lib.capture", { path, section_line: line }); }
    catch (e) { host.toast(e.message, true); return; }
    const on = new Set(cap.rows.filter((r) => r.on).map((r) => r.line));
    const inc = new Set();
    const idIn = h("input", { type: "text", size: 30, value: (/^\[template ([^\]]+)\]/.exec(cap.text) || [])[1] || "" });
    const titleIn = h("input", { type: "text", size: 40, value: (/^title = (.*)$/m.exec(cap.text) || [])[1] || "" });
    const ta = h("textarea", { class: "tdraft", rows: 16, spellcheck: "false", wrap: "off" });
    ta.value = cap.text;
    let made = cap.text;           // the text as last made from the choices: hand edits since then are asked about
    const note = h("div", { class: "muted" });
    const again = async () => {
      if (ta.value !== made && !confirm("Make the template text again from these choices? Your edits to the text are lost.")) {
        note.textContent = "The text was not made again: your edits are kept (the choices above no longer match it).";
        return;
      }
      try {
        const c = await host.invoke("lib.capture", { path, section_line: line, keys: [...on], include: [...inc], id: idIn.value.trim() || undefined, title: titleIn.value.trim() || undefined });
        ta.value = c.text;
        made = c.text;
        note.textContent = c.problems.length ? "line " + c.problems[0][0] + ": " + c.problems[0][1] : "";
      } catch (e) { note.textContent = e.message; }
    };
    idIn.addEventListener("change", again);
    titleIn.addEventListener("change", again);
    const rows = h("div", { class: "trows" }, h("div", { class: "muted", text: "Make these lines placeholders (the ID always is):" }),
      cap.rows.map((r) => {
        const cb = h("input", { type: "checkbox", checked: r.on || null });
        cb.addEventListener("change", () => { if (cb.checked) on.add(r.line); else on.delete(r.line); again(); });
        return h("label", { class: "trowcheck" }, cb, " " + r.key + " = " + r.value + " ", h("span", { class: "muted", text: r.type }));
      }));
    const links = cap.links.length ? h("div", { class: "trows" }, h("div", { class: "muted", text: "Also take the linked sections, as parts of the template:" }),
      cap.links.map((l) => {
        const cb = h("input", { type: "checkbox" });
        cb.addEventListener("change", () => { if (cb.checked) inc.add(l.line); else inc.delete(l.line); again(); });
        return h("label", { class: "trowcheck" }, cb, " " + (l.what === "spell" ? "spell " + l.header + " (" + l.file + ")" : "the shop line in " + l.header + " (line " + l.line + ")"));
      })) : null;
    const go = await host.modal("Save " + cap.header + " as a template", [
      h("div", { class: "trow" }, h("label", { text: "id" }), idIn), h("div", { class: "trow" }, h("label", { text: "title" }), titleIn),
      rows, links, h("div", { class: "muted", text: "The template text (you may edit it; it is checked when saved):" }), ta, note],
      [["Save to my templates", true, true], ["Cancel", false]]);
    if (!go) return;
    try {
      let r;
      try { r = await host.invoke("lib.save_user", { text: ta.value }); }
      catch (e) {
        // the id is one of the user's templates already: replaced only when they say so
        if (!/^your templates already have /.test(e.message) || !confirm(e.message.replace(/: replace it, or choose another id$/, "") + ". Replace it? (A backup is made first.)")) throw e;
        r = await host.invoke("lib.save_user", { text: ta.value, replace: true });
      }
      host.toast("Saved to " + r.user_file + " (a backup of the old file is in Backups)");
    } catch (e) { host.toast(e.message, true); }
  }

  return { show, saveAs, kindOfFile };
})();
