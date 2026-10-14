/* Skeleton Master: the Retarget tab's logic that has nothing to do with drawing (file names, the map being edited,
   its checks). Runs in a browser (global SKELETON_MASTER_UI) and under node (module.exports), so it can be tested:
   node tests/ui_tests.js. It does no retargeting itself: that is retarget_core.js. */
(function (root) {
  'use strict';

  const hex2 = n => n.toString(16).padStart(2, '0');
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  /* ------------------------------------------------------------------ file names */

  // "../work/model/rtda" -> "rtda"; "C:\x\ZAAA" -> "ZAAA"
  function baseName(p) { return String(p).split(/[\\/]/).pop(); }
  // a name as the map may write it: no spaces, # or ; (they would end the line or split it)
  function safeName(n) { return baseName(n).replace(/[\s#;]+/g, '_') || 'file'; }
  // files are matched to map names by base name, ignoring case
  function keyOf(name) { return safeName(name).toLowerCase(); }
  // "NAME:NN" -> "NAME" (the same rule retarget_core uses: the last ":" followed by hex digits only)
  function refFile(spec) {
    const c = spec.lastIndexOf(':');
    return c > 0 && /^[0-9a-fA-F]+$/.test(spec.slice(c + 1)) ? spec.slice(0, c) : spec;
  }
  function refIndex(spec) {
    const c = spec.lastIndexOf(':');
    return c > 0 && /^[0-9a-fA-F]+$/.test(spec.slice(c + 1)) ? parseInt(spec.slice(c + 1), 16) : null;
  }
  function refSpec(file, index) { return index === null || index === undefined ? file : file + ':' + hex2(index); }
  // when the user picks a file for a role, a name the map already has for the same file (perhaps with a path) is kept
  function keepName(old, picked) { return old && keyOf(old) === keyOf(picked) ? old : safeName(picked); }

  /* the loaded files, by base name */
  function makePool() {
    const files = new Map();
    return {
      add(name, bytes) {        // -> {name: as the map will write it, replaced: an earlier file of that name}
        const k = keyOf(name), replaced = files.has(k) && files.get(k).original !== name;
        files.set(k, { name: safeName(name), original: name, bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) });
        return { name: safeName(name), replaced };
      },
      get(name) { const f = files.get(keyOf(name)); return f ? f.bytes : null; },
      has(name) { return files.has(keyOf(name)); },
      entry(name) { return files.get(keyOf(name)) || null; },
      list() { return Array.from(files.values()); },
      resolver() { return name => { const f = files.get(keyOf(name)); return f ? f.bytes : null; }; }
    };
  }

  /* the files a map names, with what each is for */
  const ROLES = [
    ['source_skeleton', 'source skeleton'], ['target_skeleton', 'target skeleton'],
    ['source_reference', 'source reference pose'], ['target_reference', 'target reference pose'],
    ['source_weapon_reference', 'source weapon reference'], ['target_weapon_reference', 'target weapon reference']];
  function mapNames(m) {
    const out = [];
    for (const [k, what] of ROLES) {
      const v = m[k]; if (!v) continue;
      out.push({ key: k, what, name: typeof v === 'string' ? v : refFile(v.file) });
    }
    return out;
  }
  // names not loaded yet: [{name (base name), what: [roles]}]
  function missingNames(m, pool) {
    const by = new Map();
    for (const n of mapNames(m)) {
      if (pool.has(n.name)) continue;
      const b = baseName(n.name);
      if (!by.has(b.toLowerCase())) by.set(b.toLowerCase(), { name: b, what: [] });
      by.get(b.toLowerCase()).what.push(n.what);
    }
    return Array.from(by.values());
  }

  /* ------------------------------------------------------------------ animation files */

  // an xxda, a limit pack or a single .anim -> its records (strict: a file that is not one throws)
  function animRecords(name, bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (/\.anim$/i.test(name)) {
      if (bytes.length < 12 || bytes.length !== 12 + u32(bytes, 8)) throw new Error(baseName(name) + ' is not a single animation (.anim)');
      return [bytes];
    }
    if (bytes.length < 4) throw new Error(baseName(name) + ' is too short for an animation file');
    const n = u32(bytes, 0), out = []; let o = 4;
    if (n === 0 || n > 4096) throw new Error(baseName(name) + ' does not look like an animation file (it says ' + n + ' animations)');
    for (let i = 0; i < n; i++) {
      if (o + 12 > bytes.length) throw new Error(baseName(name) + ' ends inside animation ' + hex2(i) + ': not an animation file');
      const s = u32(bytes, o + 8);
      if (o + 12 + s > bytes.length) throw new Error(baseName(name) + ': animation ' + hex2(i) + ' runs past the end of the file: not an animation file');
      out.push(bytes.subarray(o, o + 12 + s)); o += 12 + s;
    }
    return out;
  }
  function recordHead(r) { return { bones: u32(r, 0), frames: u32(r, 4), size: u32(r, 8), placeholder: u32(r, 8) < 11 }; }
  // a skeleton (xxaa)? its header's bone count must fit the file
  function skeletonCheck(name, bytes) {
    if (bytes.length < 52) return baseName(name) + ' is too short for a battle skeleton (xxaa)';
    const n = u32(bytes, 12);
    if (n === 0 || n > 200 || 52 + n * 12 > bytes.length) return baseName(name) + ' does not look like a battle skeleton (xxaa): its header says ' + n + ' bones';
    return null;
  }
  // "NAME:NN" or a single .anim -> the record (as retarget_core's own lookup does)
  function itemBytes(resolver, spec) {
    const file = refFile(spec), idx = refIndex(spec), b = resolver(file);
    if (!b) throw new Error('the file "' + baseName(file) + '" is not loaded');
    if (idx === null) return animRecords(file.match(/\.anim$/i) ? file : file + '.anim', b)[0];
    const recs = animRecords(file, b);
    if (idx >= recs.length) throw new Error(baseName(spec) + ': ' + baseName(file) + ' has only ' + recs.length + ' animations');
    return recs[idx];
  }
  // a party xxda has its idle's weapon track at 0x34: the usual weapon reference
  function weaponRefIndex(records) {
    if (records.length > 0x34) { const h = recordHead(records[0x34]); if (h.bones === 1 && !h.placeholder) return 0x34; }
    return null;
  }

  /* ------------------------------------------------------------------ the map being edited */

  function emptyMap() { return { pairs: {}, feet: [], source_feet: [], loose: {}, looseGroups: [], colliders: [] }; }
  function setPair(m, target, source, how) { m.pairs[target] = [source, how === 'follow' ? 'offset' : (how || 'offset')]; }
  function removePair(m, target) { delete m.pairs[target]; }
  const howName = how => (how === 'aim' || how === 'reach') ? how : 'follow';

  // "3-5 10, 12" -> [3, 4, 5, 10, 12]; throws on anything else
  function parseBones(text) {
    const out = [];
    for (const w of String(text).replace(/,/g, ' ').split(/\s+/).filter(Boolean)) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(w);
      if (!m) throw new Error('"' + w + '" is not a bone number or a range like 3-5');
      const lo = Number(m[1]), hi = m[2] === undefined ? lo : Number(m[2]);
      if (hi < lo) throw new Error('"' + w + '": a range goes from the lower number to the higher');
      if (hi - lo > 500) throw new Error('"' + w + '": too long a range');
      for (let b = lo; b <= hi; b++) out.push(b);
    }
    return out;
  }
  function formatBones(list) {
    const runs = []; let i = 0;
    while (i < list.length) { let j = i; while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++; runs.push(i === j ? String(list[i]) : list[i] + '-' + list[j]); i = j + 1; }
    return runs.join(' ');
  }
  function toggleIn(list, b) { const s = new Set(list); if (s.has(b)) s.delete(b); else s.add(b); return Array.from(s).sort((x, y) => x - y); }
  // `loose` (what retargeting reads) rebuilt from the groups (what is edited and written)
  function syncLoose(m) {
    m.loose = {};
    for (const g of m.looseGroups) for (const b of g.bones) m.loose[b] = g.params;
    return m;
  }

  /* problems (retargeting would fail or do something unintended) and warnings, in plain words.
     info: {srcBones, tgtBones} (bone counts of the loaded skeletons, or undefined) */
  function checkMap(m, info) {
    info = info || {};
    const problems = [], warnings = [], S = info.srcBones, T = info.tgtBones;
    const outS = b => S !== undefined && (b < 0 || b >= S), outT = b => T !== undefined && (b < 0 || b >= T);
    const pairs = Object.keys(m.pairs).map(Number).sort((a, b) => a - b);
    if (!pairs.length) warnings.push('No pairs yet: the target would only stand in its reference pose. Pair bones in the map editor.');
    for (const t of pairs) {
      const [s] = m.pairs[t];
      if (outT(t)) problems.push('Pair ' + t + ' = ' + s + ': the target skeleton has bones 0-' + (T - 1) + ' only.');
      if (outS(s)) problems.push('Pair ' + t + ' = ' + s + ': the source skeleton has bones 0-' + (S - 1) + ' only.');
    }
    const sf = m.source_feet || [], tf = m.feet || [];
    sf.filter(outS).forEach(b => problems.push('Source foot ' + b + ' is not a bone of the source skeleton.'));
    tf.filter(outT).forEach(b => problems.push('Target foot ' + b + ' is not a bone of the target skeleton.'));
    if (!!sf.length !== !!tf.length) warnings.push('Feet are used only when both the source and the target feet are given: the ' + (sf.length ? 'target' : 'source') + ' feet are missing.');
    if (m.target_weapon_bone !== undefined) {
      if (outT(m.target_weapon_bone)) problems.push('The weapon bone ' + m.target_weapon_bone + ' is not a bone of the target skeleton.');
      if (!m.source_weapon_reference || !m.target_weapon_reference) problems.push('A weapon bone is set: weapon tracks then need both weapon references (source and target).');
    } else if (m.source_weapon_reference || m.target_weapon_reference) warnings.push('No target weapon bone: weapon tracks are not retargeted (a pack gets empty ones: the weapon is hidden).');
    for (const g of m.looseGroups || []) {
      g.bones.filter(outT).forEach(b => problems.push('Loose bone ' + b + ' is not a bone of the target skeleton.'));
      g.bones.filter(b => m.pairs[b] !== undefined).forEach(b => warnings.push('Loose bone ' + b + ' is also paired: a paired bone follows its source and "loose" does nothing to it.'));
      for (const k of ['stiffness', 'damping', 'hang']) if (!(g.params[k] >= 0 && g.params[k] <= 1)) problems.push('Loose ' + formatBones(g.bones) + ': ' + k + ' must be between 0 and 1.');
      if (!isFinite(g.params.gravity) || !isFinite(g.params.limit)) problems.push('Loose ' + formatBones(g.bones) + ': gravity and limit must be numbers.');
    }
    for (const c of m.colliders || []) {
      if (outT(c.bone) || c.bone !== Math.floor(c.bone)) problems.push('Collider on bone ' + c.bone + ': not a bone of the target skeleton.');
      if (!(c.rx > 0 && c.ry > 0)) problems.push('Collider on bone ' + c.bone + ': its two radii must be above 0.');
    }
    if (m.scale !== undefined && !(m.scale > 0 && isFinite(m.scale))) problems.push('Scale must be a number above 0 (or left empty).');
    if (!m.source_reference) problems.push('No source reference pose: load the source animations (xxda) in step 1 or pick one in the map editor.');
    if (!m.target_reference) problems.push('No target reference pose: load the target animations (xxda) in step 1 or pick one in the map editor.');
    return { problems, warnings };
  }

  /* names for what is downloaded */
  function stem(n) { return safeName(n).replace(/\.[^.]*$/, ''); }
  function outName(sourceFile, index, targetSkeleton, weapon) {
    return stem(sourceFile) + '_' + hex2(index) + '_on_' + stem(targetSkeleton || 'target') + (weapon ? '_weapon' : '') + '.anim';
  }
  function mapFileName(m) { return (m.source_skeleton ? stem(m.source_skeleton) : 'source') + '_to_' + (m.target_skeleton ? stem(m.target_skeleton) : 'target') + '.map'; }

  const api = { hex2, baseName, safeName, keyOf, refFile, refIndex, refSpec, keepName, makePool, mapNames, missingNames,
    animRecords, recordHead, skeletonCheck, itemBytes, weaponRefIndex, emptyMap, setPair, removePair, howName,
    parseBones, formatBones, toggleIn, syncLoose, checkMap, outName, mapFileName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKELETON_MASTER_UI = api;
})(typeof self !== 'undefined' ? self : this);
