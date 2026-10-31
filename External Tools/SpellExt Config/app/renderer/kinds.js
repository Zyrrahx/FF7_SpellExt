/* SpellExt Config: the sidebar's entries and the small text rules of a kind page (design 3.2, 3.3, 1.6a). Plain
   functions, no DOM and no IPC: index.html loads this before app.js, and tests/unit/kinds.test.js runs it in a vm
   context under /usr/bin/node. */
"use strict";
(function (root) {
  const low = (s) => String(s).toLowerCase();       // file names are compared without case, as the DLL opens them
  const GAME = "FF7_SpellExt_Game.ini";
  const FIELDS = "FF7_SpellExt_Fields.ini";

  // One entry per kind, in the order of design 3.2. `file` names the one file of a kind page (`also`: a second file
  // shown under it when the folder has it); `group` takes every file of list_files' group not claimed by an entry
  // above; `page` is a page of its own. The ai\ sources stay reachable as text under the AI entry (the Python page's
  // Files tree listed them).
  const ENTRIES = [
    { id: "game", label: "Game options", file: GAME },
    { id: "spells", label: "Spells", file: "FF7_SpellExt_Spells.ini", also: ["FF7_SpellExt_Spells_Test.ini"] },
    { id: "spellnames", label: "Spell names", file: "FF7_SpellExt_SpellNames.ini" },
    { id: "effects", label: "Effects", file: "FF7_SpellExt_Effects.ini" },
    { id: "materia", label: "Materia", file: "FF7_SpellExt_Materia.ini" },
    { id: "weapons", label: "Weapons", file: "FF7_SpellExt_Weapons.ini" },
    { id: "armour", label: "Armour", file: "FF7_SpellExt_Armour.ini" },
    { id: "accessories", label: "Accessories", file: "FF7_SpellExt_Accessories.ini" },
    { id: "items", label: "Items", file: "FF7_SpellExt_Items.ini" },
    { id: "characters", label: "Characters", file: "FF7_SpellExt_Characters.ini" },
    { id: "limits", label: "Limits", file: "FF7_SpellExt_Limits.ini" },
    { id: "shops", label: "Shops", file: "FF7_SpellExt_Shops.ini" },
    { id: "fields", label: "Fields", file: FIELDS, fields: true },
    { id: "other", label: "Other text", group: "config" },
    { id: "cameras", label: "Cameras", group: "cameras" },
    { id: "effscripts", label: "Effect scripts", group: "effects" },
    { id: "ai", label: "AI", page: "ai", group: "ai", only: ".txt" },
    { id: "readme", label: "Readme", group: "Readme" },
    { id: "problems", label: "Problems", page: "problems" },
    { id: "live", label: "Live tables", page: "live" },
    { id: "library", label: "Library", page: "library" },
  ];

  // The sidebar for a folder: [{id, label, page, multi, files: [file records of list_files], missing}]. `files` of
  // app.state; `fieldsFile`: the file the game file's fields_file names (null: the default name).
  function sidebar(files, fieldsFile) {
    const claimed = new Set();
    const byName = new Map();
    for (const f of files || []) if (f.group === "config") byName.set(low(f.path), f);
    const out = [];
    for (const e of ENTRIES) {
      const x = { id: e.id, label: e.label, page: e.page || null, multi: false, files: [], missing: null };
      if (e.file) {
        const want = e.fields && fieldsFile ? fieldsFile : e.file;
        for (const name of [want].concat(e.also || [])) {
          const f = byName.get(low(name));
          if (f) { x.files.push(f); claimed.add(f.path); }
        }
        if (!x.files.length) x.missing = want;
      }
      out.push(x);
    }
    for (const x of out) {
      const e = ENTRIES.find((y) => y.id === x.id);
      if (!e.group) continue;
      x.multi = true;
      x.files = (files || []).filter((f) => f.group === e.group && !claimed.has(f.path) &&
        (!e.only || low(f.path).endsWith(e.only)));
    }
    return out;
  }

  // the entry a file belongs to (null when none: a file list_files does not give)
  function entryOf(entries, path) {
    for (const e of entries) if (e.files.some((f) => f.path === path)) return e.id;
    return null;
  }

  // document.py _split_raw: the lines with their own endings; a CR not followed by LF stays inside its line
  function splitRaw(text) {
    const out = [];
    let pos = 0;
    const n = text.length;
    while (pos < n) {
      const e = text.indexOf("\n", pos);
      if (e < 0) { out.push(text.slice(pos)); break; }
      out.push(text.slice(pos, e + 1));
      pos = e + 1;
    }
    return out;
  }

  // What the Section text box is filled with (design 1.6a): the RAW text of lines first..last (1-based, inclusive),
  // each line with its own ending and CRLF turned to LF; never the bodies joined by LF, which would lose a blank last
  // line of the range. file.apply_text takes it back.
  function rangeText(text, first, last) {
    return splitRaw(text).slice(first - 1, last).join("").replace(/\r\n/g, "\n");
  }

  // The shops file's own table of the game's shops: ";  12  Kalm - Item Store      7/10" -> 12: "Kalm - Item Store"
  function shopPlaces(text) {
    const out = new Map();
    for (const line of splitRaw(text)) {
      const m = /^[;#]\s*(\d{1,3})\s+(\S.*?)\s+\d+\/\d+\s*$/.exec(line.replace(/\r?\n$/, ""));
      if (m && !out.has(Number(m[1]))) out.set(Number(m[1]), m[2]);
    }
    return out;
  }

  // the badge beside a section in the list (design 3.3): wide, test, state, set
  function kindBadge(kind) {
    if (!kind) return null;
    if (kind.startsWith("wide_")) return "wide";
    if (kind === "test") return "test";
    if (kind === "state") return "state";
    if (kind === "set_limit") return "set";
    return null;
  }

  // The lines of a section that its Section text shows: a live section from its header (the lines before the first
  // header from the first line) to its last line. A commented-out section inside that range (the usual place: after
  // the section's keys and a blank line, before the next header) is an entry of its own, so the range stops before
  // it, unless a live key line of the section follows it (the DLL reads such a line as the section's): then the
  // range keeps every line, the block's included. `outline` is the file view's outline.
  function sectionRange(s, outline) {
    const first = s.header !== null ? s.line : s.first;
    let last = s.last;
    if (!s.commented && outline) {
      let block = null;
      for (const b of outline) if (b.commented && b.line > first && b.line <= s.last && (block === null || b.line < block)) block = b.line;
      if (block !== null && !s.keys.some((k) => k.line > block)) last = block - 1;
    }
    return [first, last];
  }

  // The section list of a file view in file order; the Materia file's [test] section last (design 3.2)
  function listedSections(v) {
    const out = v.outline.slice();
    if (low(v.schema_name || "") === "ff7_spellext_materia.ini") {
      return out.filter((s) => s.kind !== "test").concat(out.filter((s) => s.kind === "test"));
    }
    return out;
  }

  // "Add section" after a chosen section: the line (1-based) the new lines go after. Normally the chosen section's
  // last line. A commented-out block that sits inside a live section, with live lines of that section after it (the
  // DLL reads them as the section's), is no place to cut: a header there would take those lines into the new section,
  // so the new section goes after the whole live section instead.
  function addAfterLine(after, outline) {
    if (after.commented && outline) {
      const owner = outline.filter((x) => !x.commented && x.line < after.line && x.last >= after.last).pop();
      if (owner && owner.keys.some((k) => k.kind !== "commented" && k.line > after.last)) return owner.last;
    }
    return after.last;
  }

  // What Advanced puts in a key's value box: its default only when the key takes the default as written (a word of a
  // yes/no key, one of an enum's values, a number or a word of a number key, a word of a text key); a default that
  // describes what the DLL does without the line ("the base's", "Spell ID") is no value, so the box stays empty and
  // its placeholder says what leaving the key out gives. {value, placeholder}
  const NUMBER = /^-?(0x[0-9a-f]+|[0-9]+)$/i;
  function advancedValue(spec) {
    const d = spec.default === undefined || spec.default === null ? "" : String(spec.default).trim();
    if (d === "") return { value: "", placeholder: "value" };
    const w = low(d);
    const words = (spec.words || []).map(low);
    let ok;
    if (spec.type === "bool") ok = (spec.true || []).concat(spec.false || []).map(low).includes(w);
    else if (spec.type === "enum") ok = (spec.values || []).some((g) => g.map(low).includes(w));
    else if (spec.type === "int") ok = NUMBER.test(d);
    else if (spec.type === "int_or_word") ok = NUMBER.test(d) || words.includes(w);
    else ok = words.includes(w);
    return ok ? { value: d, placeholder: "" } : { value: "", placeholder: "absent: " + d };
  }

  root.SpellExtKinds = Object.freeze({ ENTRIES, GAME, FIELDS, sidebar, entryOf, splitRaw, rangeText, shopPlaces, kindBadge,
                                       listedSections, sectionRange, addAfterLine, advancedValue });
})(typeof window !== "undefined" ? window : globalThis);
