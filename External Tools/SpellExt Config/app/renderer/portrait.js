/* (portrait panel, stages 1 and 2) The Portrait block of a character's page in the Characters file: which picture the game uses
   for the character's portrait (FFNx's replacement texture where one is served, else the texture the DLL makes or the game's own),
   drawn with the part of it the game shows marked, and the lines that say where it comes from. READ ONLY: nothing in it writes. The SAME FILE, byte for byte, in the Python page (sxcfg/static/) and in the app
   (app/renderer/); it talks only through H.api (the route character.portrait / GET /api/character/portrait) and draws
   with putImageData (a .tex or a .dds, decoded and cut down by the core) or createImageBitmap of a Blob (a PNG, decoded by the
   browser itself: the core only judges its header). One answer per character is kept (memo) while the route says it is
   the same (its digest); Reload forgets them (PT.forget). */
(function (root) {
  "use strict";
  const PT = {};
  root.SpellExtPortrait = PT;
  const MEMO_MAX = 16;
  const memo = new Map();          // id -> {digest, answer}, oldest first, at most MEMO_MAX
  PT.forget = function () { memo.clear(); };
  PT.memoSize = function () { return memo.size; };
  const keep = (id, digest, answer) => {
    memo.delete(id);
    memo.set(id, { digest, answer });
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
  };
  const upper = (t) => t.charAt(0).toUpperCase() + t.slice(1) + (/[.:)]$/.test(t) ? "" : ".");
  const b64bytes = (b) => {
    const bin = atob(b);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  // The ID of a character's section header ("[12]"), or -1
  PT.idOf = function (header) {
    const m = /^\[\s*(\d+)\s*\]/.exec(header || "");
    return m ? parseInt(m[1], 10) : -1;
  };

  // The Portrait block of the section whose header is s.header; null when it is not a character's section
  PT.block = function (H, s) {
    const h = H.h;
    const id = PT.idOf(s.header);
    if (id < 12 || id > 43) return null;
    const idText = String(id).padStart(2, "0");
    const box = h("details", { class: "ptblock", open: "", "data-pt-id": idText }, h("summary", { text: "Portrait" }));
    const body = h("div", { class: "ptbody" }, h("div", { class: "muted", text: "reading the portrait's files..." }));
    box.appendChild(body);
    const ask = (have) => H.api("/api/character/portrait?" + new URLSearchParams(have ? { id: idText, have } : { id: idText }).toString());
    const kept = memo.get(id) || null;
    // the memo an answer of `same` stands for is taken when that answer comes, and passed on (as the Model block does)
    ask(kept ? kept.digest : null).then((a) => {
      if (a.superseded) return null;          // a newer request for this character took this one's place (the app's worker)
      if (!a.same) return a;
      const m = memo.get(id);
      return m && m.digest === a.digest ? m.answer : ask(null);
    }).then((a) => {
      if (!a || !box.isConnected) return null;      // the form was drawn again meanwhile: a newer block shows it
      keep(id, a.digest, a);
      return PT.show(H, body, a).then(() => { box.setAttribute("data-pt-state", "done"); });
    }).catch((e) => {
      body.innerHTML = "";
      body.appendChild(h("div", { class: "err", text: "The portrait could not be described: " + (e.message || String(e)) }));
      box.setAttribute("data-pt-state", "error");
    });
    return box;
  };

  const ZOOM_TO = 192;           // a picture is shown at a whole zoom, to about this many CSS pixels on its longer side
  function frame(h, pic, w, hgt) {
    const img = pic.image;
    const z = Math.max(1, Math.floor(ZOOM_TO / Math.max(w, hgt)));
    const canvas = h("canvas", { class: "ptcanvas", width: String(w), height: String(hgt), "data-pt-size": pic.size,
      "aria-label": "the " + pic.size + " portrait: " + (pic.label || "none") });
    canvas.style.width = (w * z) + "px";
    canvas.style.height = (hgt * z) + "px";
    const wrap = h("div", { class: "ptwrap" }, canvas);
    // the dashed line: where the main menu stops (it draws menu_w of the region's region[0]; the PHS, save, name entry
    // and the shop draw all of it)
    if (img && img.menu_w < img.region[0]) {
      const line = h("div", { class: "ptmenu", title: "the main menu draws up to this line (" + img.menu_w + " of " + img.region[0] +
        " pixels of the texture); the PHS, save preview, name entry and shop draw all of it" });
      line.style.left = (img.menu_w / img.region[0] * 100) + "%";
      wrap.appendChild(line);
    }
    return { wrap, canvas };
  }

  function drawRgba(canvas, img) {
    const ctx = canvas.getContext("2d");
    const data = b64bytes(img.rgba);
    ctx.putImageData(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), img.width, img.height), 0, 0);
  }

  // `bytes`: the file's base64 (the picture's own, or the one that carries it when both pictures are made from one file)
  async function drawPng(canvas, img, bytes) {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!bytes) return false;
    const blob = new Blob([b64bytes(bytes)], { type: "image/png" });
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, img.src[0], img.src[1], img.src[2], img.src[3], 0, 0, img.dst[0], img.dst[1]);
    if (bmp.close) bmp.close();
    return true;
  }

  PT.show = async function (H, body, a) {
    const h = H.h;
    body.innerHTML = "";
    const row = h("div", { class: "ptpics" });
    for (const pic of a.pictures) {
      const img = pic.image;
      const fig = h("div", { class: "ptfig", "data-pt-size": pic.size });
      fig.setAttribute("data-pt-served", pic.served || "none");
      const kindText = pic.shown === "own" ? "its own picture: " + pic.label : pic.shown === "game" ? "the game's portrait " + pic.label :
        pic.shown === "base" ? pic.label : "nothing to draw";
      fig.appendChild(h("div", { class: "ptcap" }, h("b", { text: pic.title }), " ",
        h("span", { class: "muted", text: pic.served === "replacement" ? "(FFNx's replacement: " + pic.replacement.file.split(/[\\/]/).pop() + ")" :
          "(" + kindText + ")" })));
      if (img) {
        const w = img.kind === "rgba" ? img.width : (img.canvas || img.region)[0];       // (a replacement PNG is drawn scaled down: its own canvas)
        const hg = img.kind === "rgba" ? img.height : (img.canvas || img.region)[1];
        const f = frame(h, pic, w, hg);
        fig.appendChild(f.wrap);
        try {
          if (img.kind === "rgba") drawRgba(f.canvas, img);
          else if (!(await drawPng(f.canvas, img, img.png || (img.png_from ? (a.pictures.find((p) => p.size === img.png_from).image.png) : null)))) fig.appendChild(h("div", { class: "muted", text: "(the file is too large to send to the page: only the area is marked)" }));
          f.canvas.setAttribute("data-pt-drawn", "1");
        } catch (e) {
          fig.appendChild(h("div", { class: "err", text: "Could not draw it: " + (e.message || String(e)) }));
        }
        fig.appendChild(h("div", { class: "muted ptarea", text: "drawn area " + img.region[0] + " x " + img.region[1] + " of the texture" +
          (img.menu_w < img.region[0] ? "; dashed line: the main menu draws " + img.menu_w + " wide" : "") }));
      } else {
        fig.appendChild(h("div", { class: "ptnone muted", text: "No picture: see the lines below." }));
      }
      for (const t of pic.lines) fig.appendChild(h("div", { class: "ennote ptline", text: upper(t) }));
      row.appendChild(fig);
    }
    body.appendChild(row);
    for (const t of a.lines) body.appendChild(h("div", { class: "ennote ptline", text: upper(t) }));
    body.appendChild(h("div", { class: "muted ptline", text: upper(a.menu_archive) }));
    body.appendChild(h("div", { class: "muted", text: "Read only: this panel reads the portrait's files and writes nothing. Reload reads them again." }));
  };
})(typeof window !== "undefined" ? window : globalThis);
