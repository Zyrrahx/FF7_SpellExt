/* Skeleton Master, the Scripts tab (browser only): a battle model's action scripts (xxab). Reading, explaining,
   checking and changing a file is ab_core.js (tested under node); this file shows the slots, edits one, previews what
   it plays on the model (the Retarget tab's stick view) and saves. Wrapped in a function: the Add slots script owns
   the global names A, $, esc and msg. Load after retarget_ui.js (it shares that tab's 3D view, SM_STICKVIEW). */
(function () {
  'use strict';
  const B = window.SKELETON_MASTER_AB, A = window.SKELETON_MASTER, R = window.SKELETON_MASTER_RETARGET;
  const $ = id => document.getElementById(id);
  const hx = B.hex;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function say(box, text, kind) {
    const lines = Array.isArray(text) ? text : (text ? [text] : []);
    $(box).innerHTML = lines.length ? '<div class="msg ' + (kind || 'ok') + '">' + lines.map(esc).join('<br>') + '</div>' : '';
  }
  function readFile(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(r.error); r.readAsArrayBuffer(f); }); }
  function download(name, bytes) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const stem = name => name.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');

  /* ================================================================== state */
  let doc = null, abName = '', abBytes = null;
  let model = null;                     // { aaName, daName, sk, records, count, cache: Map }
  let other = null;                     // { name, doc } another xxab to copy from
  let sel = 0;
  let savedCur = null;                  // the bytes last downloaded: changes saved there are not "unsaved"
  const same = (a, b) => a && b && a.length === b.length && a.every((x, k) => x === b[k]);
  const unsaved = () => doc && B.changes(doc).length && !same(savedCur, doc.cur);

  /* ================================================================== 1: the files */
  function openAb(name, bytes, kind) {
    doc = B.readAb(bytes, kind ? { kind } : undefined); abName = name; abBytes = bytes; sel = 0; savedCur = null;
  }
  function setModel(aaName, aa, daName, da) {
    const sk = R.readSkeleton(aa), records = A.readAnimFile(da).records;
    if (!records.length) throw new Error(daName + ' holds no animations');
    const first = records.find(r => !A.isDummy(r)), fb = first ? A.headOf(first).bones : 0;
    // a model of one bone (ed, fi, if, ig, iy, jv, jw, lo): its animations hold one rotation, not bones + 1. Its numbers
    // are checked; the stick view has nothing to draw.
    const single = sk.count === 1 && fb === 1;
    if (first && fb !== sk.count + 1 && !single) throw new Error(daName + '\'s animations have ' + (fb - 1) + ' bones and ' + aaName + ' has ' + sk.count + ': they are not the same model');
    model = { aaName, daName, sk, records, count: records.length, cache: new Map(), noPose: single };
  }
  $('ab-files').onchange = async e => {
    const files = Array.from(e.target.files), end = re => files.find(f => re.test(stem(f.name)));
    const ab = end(/ab$/i), aa = end(/aa$/i), da = end(/da$/i), notes = [], info = [];
    if (ab && unsaved()) {
      say('ab-msg', abName + ' has changes: save them or undo them all (step 5) before opening another xxab.', 'bad');
      e.target.value = ''; return;
    }
    try {
      if (!ab && !(aa && da)) throw new Error('Choose the model\'s xxab (name ending in ab, e.g. rtab), and with it its xxaa and xxda to preview.');
      if (ab) openAb(ab.name, await readFile(ab), $('ab-kind').value || undefined);
      // a model already here is kept only when Add slots handed it over or it has this file's prefix (rtaa for rtab)
      if (ab && model && !(aa && da) && !model.handed && stem(model.aaName).slice(0, 2).toLowerCase() !== stem(ab.name).slice(0, 2).toLowerCase()) model = null;
      if (aa && da) setModel(aa.name, await readFile(aa), da.name, await readFile(da));
      else if (aa || da) notes.push('For the preview choose both the skeleton (xxaa) and the animations (xxda).');
      else if (ab && !model) notes.push('No xxaa and xxda chosen: the slots can be edited, but animation numbers are not checked against the model and there is no preview.');
      else if (ab) notes.push('The model already here (' + model.aaName + ' + ' + model.daName + ') is kept for the checks and the preview; if it is not this file\'s model, choose the right xxaa and xxda.');
      say('ab-msg', ['Loaded.'].concat(info, notes), notes.length ? 'warn' : 'ok');
    } catch (err) { say('ab-msg', cap(err.message), 'bad'); }
    e.target.value = ''; loadSlot(); refresh();
  };
  $('ab-kind').onchange = () => {
    if (!doc) return;
    if (unsaved()) { say('ab-msg', 'The file has changes: save them or undo them all (step 5) before reading it again as another kind.', 'bad'); $('ab-kind').value = ''; return; }
    try { openAb(abName, abBytes, $('ab-kind').value || undefined); say('ab-msg', 'Read again as ' + (doc.kind === 'party' ? 'a party model (74 slots).' : 'an enemy (32 slots).'), 'ok'); }
    catch (err) { say('ab-msg', cap(err.message), 'bad'); $('ab-kind').value = ''; }
    loadSlot(); refresh();
  };
  function renderSummary() {
    const box = $('ab-summary');
    if (!doc) { box.innerHTML = ''; return; }
    const hd = B.header(doc), broken = [], unused = [], ch = B.changes(doc);
    for (let i = 0; i < doc.slots; i++) { const s = B.stateOf(doc, i); if (s !== 'ok') broken.push(i); else if (B.slotInfo(doc, i).empty) unused.push(i); }
    const rows = [['Script file', esc(abName) + ' (' + doc.cur.length + ' bytes' + (doc.cur.length !== doc.orig.length ? ', was ' + doc.orig.length : '') + ')'],
      ['Kind', doc.kind === 'party' ? 'a party model: 74 slots' : 'an enemy: 32 slots' + (doc.realSlots < doc.slots ? ' (only ' + doc.realSlots + ' real entries)' : '')],
      ['Model for the preview', model ? esc(model.aaName) + ' + ' + esc(model.daName) + ': ' + model.count + ' animations, ' + model.sk.count + ' bones' : '<span class="help">none (load its xxaa and xxda)</span>'],
      ['Unused slots', unused.length ? String(unused.length) + ' (zeros)' : 'none'],
      ['Broken offsets', broken.length ? broken.join(', ') : 'none'],
      ['Changed slots', ch.length ? ch.join(', ') : 'none'],
      ['Header (kept as it is)', 'height ' + hd.height + '; effect bones ' + hd.bones.map(hx).join(' ') + '; effect offsets ' + hd.fx.map(x => x.toString(16)).join(' ')]];
    box.innerHTML = rows.map(([k, v]) => '<span>' + k + '</span><span>' + v + '</span>').join('');
  }

  /* ================================================================== 2: the slots */
  const ctx = () => ({ kind: doc.kind, count: model ? model.count : undefined });
  function shortBytes(b) { const t = B.hexBytes(b.slice(0, 14)); return b.length > 14 ? t + ' …' : t; }
  function renderSlots() {
    const tb = $('ab-slots').tBodies[0]; tb.innerHTML = '';
    if (!doc) { tb.innerHTML = '<tr><td colspan="4" class="help">Load an xxab first.</td></tr>'; return; }
    const ch = new Set(B.changes(doc));
    for (let i = 0; i < doc.slots; i++) {
      const s = B.slotInfo(doc, i), tags = [];
      if (ch.has(i)) tags.push('<span class="tag new">changed</span>');
      if (s.use.exe) tags.push('<span class="tag ph">exe\'s own</span>');
      if (s.state !== 'ok') tags.push('<span class="tag bad">broken offset</span>');
      else if (s.empty) tags.push('<span class="tag ph">unused</span>');
      if (s.shared.length) tags.push('<span class="tag" title="These slots use the very same bytes">same as ' + s.shared.join(', ') + '</span>');
      const script = s.state !== 'ok' ? '<span class="help">' + esc(B.STATE_TEXT[s.state]) + '</span>' : s.empty ? '<span class="help">zeros</span>' : esc(shortBytes(s.bytes));
      const ends = s.state === 'ok' && !s.empty ? esc(B.END_TEXT[s.decoded.end.kind]) : '';
      const tr = document.createElement('tr'); tr.className = 'pick' + (i === sel ? ' sel' : '');
      tr.innerHTML = '<td class="mono">' + i + ' <span class="help">' + hx(i) + '</span></td><td>' + esc(s.use.name) + ' ' + tags.join(' ') + '</td><td class="mono">' + script + '</td><td class="help">' + ends + '</td>';
      tr.title = s.use.when;
      tr.onclick = () => {
        if (i !== sel && boxDiffers() && typeof window.confirm === 'function' && !window.confirm('The box holds bytes not applied to slot ' + sel + '. Open slot ' + i + ' and lose them?')) return;
        sel = i; loadSlot(); refresh();
      };
      tb.appendChild(tr);
    }
  }

  /* ================================================================== 3: one slot */
  function loadSlot() {
    if (!doc) { $('ab-text').value = ''; return; }
    const s = B.slotInfo(doc, sel);
    $('ab-text').value = s.state === 'ok' && !s.empty ? B.formatScript(s.bytes) : '';
    say('ab-apply-msg', '');
  }
  function boxBytes() { return B.parseHex($('ab-text').value); }
  // the box differs from what the slot holds (typed, not applied)
  function boxDiffers() {
    if (!doc) return false;
    const s = B.slotInfo(doc, sel), p = boxBytes(), cur = s.state === 'ok' && !s.empty ? B.hexBytes(s.bytes) : '';
    return p.error ? true : B.hexBytes(p.bytes) !== cur;
  }
  function renderEditor() {
    const tb = $('ab-decoded').tBodies[0]; tb.innerHTML = '';
    if (!doc) { $('ab-slot-title').textContent = 'Load an xxab in step 1.'; $('ab-when').textContent = ''; say('ab-check', ''); $('ab-apply').disabled = $('ab-apply-all').disabled = $('ab-revert').disabled = true; $('ab-apply-all').hidden = true; return; }
    const s = B.slotInfo(doc, sel);
    $('ab-slot-title').textContent = 'Slot ' + sel + ' (' + hx(sel) + '): ' + s.use.name;
    const where = s.state === 'ok' ? 'Stored at offset ' + s.ptr.toString(16) + ', room for ' + s.room + ' bytes before the next script.'
      : s.state === 'none' ? 'This slot is ' + B.STATE_TEXT.none + '. It cannot be given a script.'
      : 'Its offset ' + B.STATE_TEXT[s.state] + '. Applying a script gives it one of its own at the end of the file.';
    $('ab-when').textContent = 'Played: ' + s.use.when + '. ' + where + (s.shared.length ? ' The same bytes are used by slot' + (s.shared.length > 1 ? 's ' : ' ') + s.shared.join(', ') + '.' : '');
    $('ab-apply-all').hidden = !s.shared.length;
    $('ab-apply-all').textContent = 'Apply to slot ' + sel + ' and ' + s.shared.join(', ');
    $('ab-revert').disabled = false;
    const p = boxBytes();
    if (p.error) { say('ab-check', cap(p.error), 'bad'); $('ab-apply').disabled = $('ab-apply-all').disabled = true; return; }
    const v = B.validate(p.bytes, Object.assign(ctx(), { slot: sel }));
    if (v.decoded) v.decoded.items.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="mono">' + it.at + '</td><td class="mono">' + esc(B.hexBytes(it.bytes)) + '</td><td>' + esc(B.describe(it, ctx())) + (it.late ? ' <span class="tag">after b3/ce skip</span>' : '') + '</td>';
      tr.title = B.opNote(it.op);
      tb.appendChild(tr);
    });
    const lines = [];
    if (v.decoded && !v.problems.length) lines.push(cap(B.END_TEXT[v.decoded.end.kind]) + ' ' + p.bytes.length + ' bytes.');
    $('ab-check').innerHTML = '';
    if (v.problems.length) $('ab-check').insertAdjacentHTML('beforeend', '<div class="msg bad">Not applied until fixed:<br>' + v.problems.map(esc).join('<br>') + '</div>');
    if (v.warnings.length) $('ab-check').insertAdjacentHTML('beforeend', '<div class="msg warn">' + v.warnings.map(esc).join('<br>') + '</div>');
    if (lines.length && !v.warnings.length) $('ab-check').insertAdjacentHTML('beforeend', '<div class="msg ok">' + lines.map(esc).join('<br>') + '</div>');
    else if (lines.length) $('ab-check').insertAdjacentHTML('beforeend', '<div class="help">' + lines.map(esc).join('<br>') + '</div>');
    $('ab-apply').disabled = $('ab-apply-all').disabled = !!v.problems.length || s.state === 'none';
  }
  $('ab-text').oninput = () => { renderEditor(); renderPreview(); };
  $('ab-revert').onclick = () => { loadSlot(); refresh(); };
  function apply(all) {
    if (!doc) return;
    const p = boxBytes(); if (p.error) return;
    const v = B.validate(p.bytes, Object.assign(ctx(), { slot: sel }));
    if (v.problems.length) { say('ab-apply-msg', 'Not applied: ' + v.problems.join(' '), 'bad'); return; }
    const shared = B.slotInfo(doc, sel).shared, slots = all ? [sel].concat(shared) : [sel], kept = all ? [] : shared;
    // the other slots that take these bytes are checked as themselves (an idle slot, a limit, the exe's own)
    const bad = [], warn = [];
    if (all) shared.forEach(j => { const w = B.validate(p.bytes, Object.assign(ctx(), { slot: j })); w.problems.forEach(x => bad.push('Slot ' + j + ': ' + x)); w.warnings.filter(x => !v.warnings.includes(x)).forEach(x => warn.push('Slot ' + j + ': ' + x)); });
    if (bad.length) { say('ab-apply-msg', ['Not applied:'].concat(bad), 'bad'); return; }
    try {
      const r = B.setScript(doc, slots, p.bytes);
      const who = slots.length > 1 ? 'Slots ' + slots.join(', ') : 'Slot ' + sel;
      const text = r.how === 'same' ? 'No change: ' + who.toLowerCase() + ' already hold' + (slots.length > 1 ? '' : 's') + ' these bytes.'
        : r.how === 'in place' ? who + ' changed in place (offset ' + r.at.toString(16) + '). Save in step 5.'
        : who + ': the script was added at the end of the file (offset ' + r.at.toString(16) + ')' + (kept.length ? '; slot' + (kept.length > 1 ? 's ' : ' ') + kept.join(', ') + ' keep the old bytes' : '') + '. Save in step 5.';
      const extra = r.how === 'same' ? [] : r.notes.concat(warn);
      say('ab-apply-msg', [text].concat(extra), extra.length ? 'warn' : 'ok');
    } catch (err) { say('ab-apply-msg', cap(err.message), 'bad'); }
    refresh();
  }
  $('ab-apply').onclick = () => apply(false);
  $('ab-apply-all').onclick = () => apply(true);

  /* copy a slot from another xxab */
  $('ab-from-file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { other = { name: f.name, doc: B.readAb(await readFile(f)) }; say('ab-from-msg', 'Opened ' + f.name + ' (' + (other.doc.kind === 'party' ? 'a party model' : 'an enemy') + '). Pick a slot and put its script in the box.', 'ok'); }
    catch (err) { other = null; say('ab-from-msg', cap(err.message), 'bad'); }
    e.target.value = ''; $('ab-from-slot').innerHTML = ''; renderFrom();
  };
  function renderFrom() {
    const s = $('ab-from-slot'), keep = s.value; s.innerHTML = '';
    if (!other) { s.appendChild(new Option('(open another xxab first)', '')); $('ab-from-copy').disabled = true; return; }
    for (let i = 0; i < other.doc.slots; i++) {
      const info = B.slotInfo(other.doc, i);
      if (info.state !== 'ok' || info.empty) continue;
      s.appendChild(new Option(i + ': ' + info.use.name + '  —  ' + shortBytes(info.bytes), i));
    }
    if (keep !== '' && Array.from(s.options).some(o => o.value === keep)) s.value = keep;     // a refresh keeps the choice
    $('ab-from-copy').disabled = !doc;
  }
  $('ab-from-copy').onclick = () => {
    if (!other || !doc) return;
    const i = Number($('ab-from-slot').value), b = B.scriptOf(other.doc, i);
    if (!b) return;
    $('ab-text').value = B.formatScript(b);
    say('ab-from-msg', 'Slot ' + i + ' of ' + other.name + ' is in the box for slot ' + sel + '. Its animation numbers are this model\'s now: check them below, then apply.', 'ok');
    renderEditor(); renderPreview();
  };

  /* ================================================================== 4: the preview */
  const View = window.SM_STICKVIEW;
  const view = View ? new View($('ab-view'), {}) : null;
  if (view && !view.ok) { view.failText = 'The 3D view needs three.js, loaded from the internet (cdn.jsdelivr.net) the first time. Without it the rest of this tab works: the list below says what the script plays.'; view.message(''); }
  if (!view) $('ab-view').textContent = 'The 3D view did not start (the Retarget tab\'s script is missing).';
  window.addEventListener('sm-tab', () => { if (view) view.resize(); });
  function animOf(n) {
    if (!model || n >= model.count) return null;
    if (!model.cache.has(n)) {
      let body = null, weapon = null;
      try { body = R.decode(model.records[n]); } catch (e) { body = null; }
      // the game plays body n's weapon at n + 0x34 (Add slots puts new numbers' weapons there too); 0x34-0x67 are those tracks
      if (body && doc && doc.kind === 'party' && (n < 0x2c || n >= 0x68) && n + A.WEAPON_OFFSET < model.count) { try { weapon = R.decode(model.records[n + A.WEAPON_OFFSET]); } catch (e) { weapon = null; } }
      model.cache.set(n, body ? { body, weapon } : null);
    }
    return model.cache.get(n);
  }
  let tl = [], loopAt = null, frame = 0, playing = false, lastT = 0, fitFor = '';
  function renderPreview() {
    tl = []; loopAt = null;
    const seq = $('ab-seq');
    if (!doc) { seq.textContent = ''; if (view) view.message('Load an xxab in step 1.'); setFrames(); return; }
    const p = boxBytes();
    if (p.error || !p.bytes.length) { seq.textContent = 'Nothing to play: the box is empty or not hex.'; if (view) view.message('Nothing to play.'); setFrames(); return; }
    const sim = B.simulate(p.bytes, { kind: doc.kind }), parts = [], party = doc.kind === 'party';
    sim.steps.forEach((s, k) => {
      if (sim.end.kind === 'loop' && sim.end.loopTo === k) { loopAt = tl.length; parts.push('[loop from here]'); }
      if (s.wait !== undefined) {
        parts.push('wait ' + s.wait + ' frames');
        const last = tl[tl.length - 1]; if (last) for (let i = 0; i < s.wait; i++) tl.push(last);
        return;
      }
      const n = s.anim;
      if (party && n >= 0x2c && n <= 0x33) { parts.push(hx(n) + ' (limit pack ' + (n - 0x2c) + ': not in this model\'s files)'); return; }
      if (!model) { parts.push(hx(n)); return; }
      if (n >= model.count) { parts.push(hx(n) + ' (not in the model)'); return; }
      const a = animOf(n);
      if (!a) { parts.push(hx(n) + ' (empty placeholder)'); return; }
      parts.push(hx(n) + ' (' + a.body.frames.length + ' frames)');
      a.body.frames.forEach((f, i) => tl.push({ n, i, a }));
    });
    const endText = { finish: 'then back to the idle', hold: 'then holds the last frame', wait: 'then waits for the target and goes back to the idle', idle: B.isIdleSlot(doc.kind, sel) ? 'then starts again (an idle loop)' : 'then loops back to the idle and never finishes', loop: 'and loops for ever', reload: 'then changes model (a2)', off: 'and has no end', cut: 'and is cut short', long: 'and has no end', freeze: 'then searches for a mark that is not there (a freeze)' }[sim.end.kind];
    if (sim.end.kind === 'idle' && B.isIdleSlot(doc.kind, sel)) loopAt = 0;
    seq.textContent = 'Plays: ' + (parts.length ? parts.join(' → ') : 'no animation') + ', ' + endText + '.' + (sim.notes.length ? ' ' + sim.notes.join(' ') : '');
    if (!view) { setFrames(); return; }
    if (!model) { view.message('Load the model\'s xxaa and xxda in step 1 to see it play.'); setFrames(); return; }
    if (model.noPose) { tl = []; view.message('This model has a single bone: the stick view has nothing to draw. The list says what plays.'); setFrames(); return; }
    if (!tl.length) { view.message('No animation of this model to show.'); setFrames(); return; }
    view.message('');
    view.setSkeleton(model.sk.bones.map(b => [b.parent, b.length]));
    view.caption(abName + ' slot ' + sel + ': ' + B.slotUse(doc.kind, sel).name);
    setFrames();
    const id = model.aaName + '|' + sel;
    if (frame >= tl.length || id !== fitFor) frame = 0;
    showFrame(frame);
    if (id !== fitFor) { fitFor = id; view.fit(); }
  }
  function setFrames() { const s = $('ab-scrub'); s.max = Math.max(0, tl.length - 1); if (frame > tl.length - 1) frame = 0; s.value = frame; $('ab-frame').textContent = tl.length ? frame + ' / ' + (tl.length - 1) : '0 / 0'; if (!tl.length) setPlaying(false); }
  function showFrame(f) {
    const t = tl[f]; if (!t || !view) return;
    frame = f; $('ab-scrub').value = f; $('ab-frame').textContent = f + ' / ' + (tl.length - 1) + '  (animation ' + hx(t.n) + ', frame ' + t.i + ')';
    view.setPose(R.pose(model.sk, t.a.body.frames[t.i]));
    const w = t.a.weapon; view.weapon(w && w.frames.length ? w.frames[Math.min(t.i, w.frames.length - 1)] : null);
  }
  function setPlaying(on) { playing = on && tl.length > 0; $('ab-play').textContent = playing ? 'Pause' : 'Play'; if (playing) { lastT = performance.now(); requestAnimationFrame(tick); } }
  function tick(t) {
    if (!playing || !tl.length) return;
    const step = 1000 / Number($('ab-fps').value);
    if (t - lastT >= step) {
      let f = frame + Math.floor((t - lastT) / step);
      if (f >= tl.length && loopAt === null) { showFrame(tl.length - 1); setPlaying(false); return; }     // no loop: stays on the last frame
      if (f >= tl.length) f = loopAt + (f - tl.length) % Math.max(1, tl.length - loopAt);
      showFrame(f); lastT = t;
    }
    requestAnimationFrame(tick);
  }
  $('ab-play').onclick = () => { if (!playing && loopAt === null && frame >= tl.length - 1) showFrame(0); setPlaying(!playing); };
  $('ab-scrub').oninput = () => { setPlaying(false); showFrame(Number($('ab-scrub').value)); };

  /* ================================================================== 5: save */
  function renderChanges() {
    const box = $('ab-changes');
    if (!doc) { box.innerHTML = ''; $('ab-save').disabled = $('ab-undo').disabled = $('ab-reset').disabled = true; return; }
    const ch = B.changes(doc), was = B.asLoaded(doc);
    box.innerHTML = ch.length ? '<table><thead><tr><th>Slot</th><th>Was</th><th>Now</th></tr></thead><tbody>' + ch.map(i => {
      const a = B.scriptOf(was, i), b = B.scriptOf(doc, i);
      return '<tr><td>' + i + ' ' + esc(B.slotUse(doc.kind, i).name) + '</td><td class="mono">' + (a ? esc(B.hexBytes(a)) : '<span class="help">broken offset</span>') + '</td><td class="mono">' + (b ? esc(B.hexBytes(b)) : '') + '</td></tr>';
    }).join('') + '</tbody></table>' : '<p class="help">No changes yet: saving now gives the file back byte for byte.</p>';
    $('ab-save').disabled = false; $('ab-undo').disabled = !doc.undo.length; $('ab-reset').disabled = !doc.undo.length;
  }
  $('ab-save').onclick = () => {
    if (!doc) return;
    const bad = [];
    B.changes(doc).forEach(i => { const b = B.scriptOf(doc, i); const v = b ? B.validate(b, Object.assign(ctx(), { slot: i })) : { problems: ['its offset is broken'] }; v.problems.forEach(p => bad.push('Slot ' + i + ': ' + p)); });
    if (bad.length) { say('ab-save-msg', ['Not saved:'].concat(bad), 'bad'); return; }
    const out = B.write(doc), ch = B.changes(doc);
    download(abName, out); savedCur = doc.cur.slice();
    say('ab-save-msg', ch.length ? 'Downloaded ' + abName + ' (' + out.length + ' bytes) with ' + ch.length + ' changed slot(s): ' + ch.join(', ') + '. Every other byte is as it was. Keep the original; test in the game.' : 'Downloaded ' + abName + ': nothing changed, so it is the loaded file byte for byte.', 'ok');
  };
  $('ab-undo').onclick = () => { if (doc && B.undo(doc)) { say('ab-save-msg', 'The last change was undone.', 'ok'); loadSlot(); refresh(); } };
  $('ab-reset').onclick = () => { if (doc) { B.reset(doc); say('ab-save-msg', 'Every change was undone: the file is as loaded.', 'ok'); loadSlot(); refresh(); } };

  /* ================================================================== everything after a change */
  function refresh() {
    try { renderSummary(); renderSlots(); renderEditor(); renderPreview(); renderChanges(); renderFrom(); }
    catch (e) { say('ab-msg', 'Something went wrong in the page: ' + cap(String(e && e.message || e)), 'bad'); if (window.console) console.error(e); }
  }
  refresh();

  /* the Add slots tab hands its built files over here: the new animations can be checked and previewed */
  window.SM_SCRIPTS = {
    useModel(aaName, aa, daName, da) {
      try { setModel(aaName, aa, daName, da); model.handed = true; say('ab-msg', 'Received from Add slots: ' + aaName + ' and ' + daName + ' (' + model.count + ' animations) are the model for checks and the preview. Load the model\'s xxab here if it is not loaded.', 'ok'); }
      catch (err) { say('ab-msg', cap(err.message), 'bad'); }
      refresh();
    }
  };
})();
