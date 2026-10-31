/* The AI Library (sxcfg/ailibrary.py): recipes with parameters, every instruction, every named address. Shared by
   the AI page (a drawer) and the section window (a panel). The host gives: api(path, body), insert(text) and,
   on the AI page, newSection(text, sections). */
"use strict";
window.SpellExtLibrary = (function () {
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
  const uid = () => Math.random().toString(16).slice(2, 6);

  function mount(el, host) {
    const L = { data: null, tab: "recipes", q: "" };
    el.innerHTML = "";
    el.classList.add("library");
    const search = h("input", { type: "search", placeholder: "search the library", class: "libsearch" });
    const tabs = h("div", { class: "tabs libtabs" });
    const list = h("div", { class: "liblist" });
    for (const [k, t] of [["recipes", "Recipes"], ["instructions", "Instructions"], ["variables", "Variables"]])
      tabs.appendChild(h("button", { "data-tab": k, class: k === L.tab ? "on" : "", text: t, onclick: () => { L.tab = k; draw(); } }));
    search.addEventListener("input", () => { L.q = search.value.trim().toLowerCase(); draw(); });
    el.append(h("div", { class: "libhead" }, h("b", { text: "AI Library" }), search), tabs,
      h("div", { class: "libnote", text: "Read from the game's code by the project's study (ai_tool_README.md), not seen in the game. Every recipe is untested in game: try it, then read FF7_SpellExt.log." }),
      list);

    function matches(...texts) {
      if (!L.q) return true;
      const all = texts.join(" ").toLowerCase();
      return L.q.split(/\s+/).every((w) => all.includes(w));
    }

    function draw() {
      for (const b of tabs.querySelectorAll("button")) b.classList.toggle("on", b.dataset.tab === L.tab);
      list.innerHTML = "";
      if (!L.data) { list.appendChild(h("p", { class: "muted", text: "Loading..." })); return; }
      if (L.tab === "recipes") {
        for (const r of L.data.recipes) {
          if (!matches(r.title, r.description, r.sections.join(" "), r.id)) continue;
          list.appendChild(recipeCard(r));
        }
      } else if (L.tab === "instructions") {
        for (const i of L.data.instructions) {
          if (!matches(i.name, i.aliases.join(" "), i.does, i.op, i.stack)) continue;
          list.appendChild(h("div", { class: "libitem" },
            h("div", {}, h("code", { class: "libname", text: i.name }), h("span", { class: "tag", text: "  byte " + i.op + (i.aliases.length ? " · also: " + i.aliases.join(", ") : "") })),
            h("div", {}, i.does),
            h("div", { class: "tag", text: "operand: " + i.operand + " · stack: " + i.stack + " · " + i.source }),
            h("details", {}, h("summary", { text: "example" }), h("pre", { class: "libpre", text: i.example }),
              h("div", { class: "libeng" }, i.english.map((t) => h("div", { text: t }))))));
        }
      } else {
        for (const v of L.data.variables) {
          if (!matches(v.name, v.address, v.meaning, v.plain || "", v.use, v.scope)) continue;
          list.appendChild(h("div", { class: "libitem" + (v.uncertain ? " uncertain" : "") },
            h("div", {}, h("code", { class: "libname", text: v.name }), h("span", { class: "tag", text: "  " + v.address + " · " + v.scope + " · " + v.rw })),
            h("div", {}, v.meaning),
            v.use ? h("div", { class: "tag", text: "use: " + v.use }) : null,
            h("div", { class: "tag" + (v.uncertain ? " warnt" : ""), text: (v.uncertain ? "uncertain: " : "confirmed: ") + v.confirmed })));
        }
      }
      if (!list.children.length) list.appendChild(h("p", { class: "muted", text: "Nothing matches." }));
    }

    function recipeCard(r) {
      const card = h("div", { class: "libitem recipe", "data-recipe": r.id });
      const values = {};
      const preview = h("pre", { class: "libpre" });
      const eng = h("div", { class: "libeng" });
      const form = h("div", { class: "libform" });
      let timer = null, current = null;
      for (const p of r.params) {
        values[p.name] = p.default;
        let input;
        if (p.choices) {
          input = h("select", {});
          for (const [v, label] of p.choices) {
            const o = h("option", { value: String(v), text: label });
            if (String(v) === String(p.default)) o.selected = true;
            input.appendChild(o);
          }
        } else if (p.type === "text") {
          input = h("input", { type: "text", maxlength: p.maxlen || 60 });
          input.value = p.default;
        } else {
          input = h("input", { type: "number", min: p.min, max: p.max, step: p.step || 1 });
          input.value = p.default;
        }
        input.addEventListener("input", () => { values[p.name] = input.value; refresh(); });
        input.addEventListener("change", () => { values[p.name] = input.value; refresh(); });
        form.appendChild(h("label", { class: "libparam" }, h("span", { text: p.label + (p.hex ? " (number; 0x for hex)" : "") }), input));
      }
      async function refresh() {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const r2 = await host.api("/api/ai/recipe", { id: r.id, values, uid: "x" });
            current = r2;
            preview.textContent = r2.text;
            eng.innerHTML = "";
            for (const l of (r2.english.lines || [])) eng.appendChild(h("div", { style: "padding-left:" + l.indent * 1.2 + "em", text: l.text }));
            preview.classList.remove("bad");
          } catch (e) { current = null; preview.textContent = e.message; preview.classList.add("bad"); eng.innerHTML = ""; }
        }, 200);
      }
      async function filled(asSection) {
        return (await host.api("/api/ai/recipe", { id: r.id, values, uid: uid(), as_section: asSection })).text;
      }
      const buttons = h("div", { class: "libbtns" },
        h("button", { class: "primary", text: "Insert at cursor", onclick: async () => {
          try { await host.insert(await filled(false)); } catch (e) { host.toast(e.message || String(e), true); }
        } }),
        host.newSection ? h("button", { text: "New section from recipe", onclick: async () => {
          try { await host.newSection(await filled(true), r.sections); } catch (e) { host.toast(e.message || String(e), true); }
        } }) : null);
      const body = h("div", { class: "recipebody", hidden: true }, form, h("div", { class: "tag", text: "the text:" }), preview,
        h("div", { class: "tag", text: "what it does:" }), eng, buttons);
      card.append(h("div", { class: "recipehead", onclick: () => { body.hidden = !body.hidden; if (!body.hidden && !current) refresh(); } },
        h("b", { text: r.title }), h("span", { class: "tag", text: "  for: " + r.sections.join(", ") }),
        h("span", { class: "badge aid", text: "untested in game" })),
        h("div", { class: "muted", text: r.description }), body);
      return card;
    }

    draw();
    host.api("/api/ai/library").then((d) => { L.data = d; draw(); }).catch((e) => host.toast(e.message || String(e), true));
    return { reload: () => host.api("/api/ai/library").then((d) => { L.data = d; draw(); }) };
  }
  return { mount };
})();
