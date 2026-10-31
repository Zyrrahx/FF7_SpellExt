/* SpellExt Config: the first screen, "Open the SpellExt folder" (design 3.1, 1.5). Browse (the main process's
   folder dialog), a folder dropped here (the preload turns it into a token: this page never sees the path), the recent
   folders (five, newest first) and the game folder. The page sends tokens only; the main process knows the paths. */
"use strict";
(function () {
  const O = { el: null, host: null, recent: [], pick: 0, game: null, busy: false };
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

  function say(text, bad) {
    const m = O.el.querySelector(".openmsg");
    m.textContent = text || "";
    m.className = "openmsg" + (bad ? " bad" : "");
  }

  async function opened(p) {
    if (O.busy) return;
    O.busy = true;
    say("Opening...");
    try {
      const st = await p;
      if (st && st.cancelled) { say(""); return; }
      say("");
      window.removeEventListener("keydown", onKey);
      O.host.opened(st);
    } catch (e) {
      say(e.message || String(e), true);
    } finally {
      O.busy = false;
    }
  }
  const body = (token) => (O.game ? { token, game: O.game.token } : { token });
  const browse = () => opened(O.host.invoke("app.pick_folder", {}).then((r) => r));
  const openToken = (token) => opened(O.host.invoke("app.open_folder", body(token)));

  async function pickGame() {
    try {
      const r = await O.host.invoke("app.pick_game_folder", {});
      if (r.cancelled) return;
      O.game = r;
      draw();
    } catch (e) { say(e.message || String(e), true); }
  }

  function onKey(e) {
    if (O.el.classList.contains("on") && e.key === "Enter" && O.recent[O.pick] && !O.busy &&
        !(e.target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName))) {
      e.preventDefault();
      openToken(O.recent[O.pick].token);
    }
  }

  function draw() {
    const el = O.el;
    el.innerHTML = "";
    const drop = h("div", { class: "dropzone", text: "or drop the folder here" });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", async (e) => {
      e.preventDefault();
      drop.classList.remove("over");
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f) return;
      const r = await window.spellext.dropToken(f);
      if (r.refused !== undefined) return say(r.refused, true);
      openToken(r.token);
    });
    const list = h("div", { class: "recent" });
    if (!O.recent.length) list.appendChild(h("p", { class: "muted", text: "No folder opened yet." }));
    O.recent.forEach((r, i) => {
      const note = !r.exists ? "(not found)" : !r.config_found ? "(no SpellExt config files in it)" :
        r.dll_beside ? "FF7_SpellExt.dll beside it" : "no FF7_SpellExt.dll beside its SpellExtConfig";
      const when = r.last_opened ? new Date(r.last_opened).toLocaleString() : "";
      list.appendChild(h("div", { class: "ritem" + (i === O.pick ? " on" : "") + (r.exists && r.config_found ? "" : " gone"),
        title: r.path, onclick: () => { O.pick = i; draw(); }, ondblclick: () => openToken(r.token) },
        h("span", { class: "rpath", text: r.path }), h("span", { class: "muted", text: " " + when + " · " + note }),
        i === O.pick ? h("button", { class: "primary", text: "Open", onclick: (e) => { e.stopPropagation(); openToken(r.token); } }) : null));
    });
    el.appendChild(h("div", { class: "openscreen" },
      h("img", { class: "openicon", src: "icon.svg", alt: "" }),
      h("h2", { text: "Open the SpellExt folder" }),
      h("p", { class: "muted", text: "The mod folder (the one with FF7_SpellExt.dll and SpellExtConfig) or its SpellExtConfig folder." }),
      h("div", { class: "openrow" }, h("button", { class: "primary", text: "Browse...", onclick: browse }), drop),
      h("h3", { text: "Recent" }), list,
      h("p", { class: "gamefolder" }, "Game folder: ",
        O.game ? h("span", { class: "rpath", text: O.game.path }) : h("span", { class: "muted", text: "found when the folder opens (7th Heaven's settings.xml, or beside SpellExtConfig)" }),
        " ", h("button", { text: "change...", onclick: pickGame })),
      h("div", { class: "openmsg" }),
      h("p", { class: "muted small", text: "Nothing is written until you Save; every Save first copies the file to SpellExtConfig's Backups folder." })));
  }

  async function show() {
    try {
      O.recent = (await O.host.invoke("app.recent", {})) || [];
    } catch (e) { O.recent = []; }
    O.pick = 0;
    draw();
    window.removeEventListener("keydown", onKey);
    window.addEventListener("keydown", onKey);
    try {
      const st = await O.host.invoke("app.state", {});
      if (st.start_problem) say(st.start_problem, true);
    } catch (e) { /* shown elsewhere */ }
  }

  window.SpellExtOpen = {
    mount(el, host) { O.el = el; O.host = host; },
    show,
  };
})();
