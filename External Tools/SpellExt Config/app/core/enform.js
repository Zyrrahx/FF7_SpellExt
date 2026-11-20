// The port of sxcfg/enform.py (stage C2): the scene and enemy files as form pages. What kind of section each header is,
// the user's file over the converter's generated file (en_overlay, spellext.c 46796) key by key with the file each value
// comes from, an override written into the user's file, the surrounded triangle of a formation (en_sur_place,
// en_sur_assign), and an enemy's AI file under the enemy's rule (en_enemy_ai, en_ai_attacks). See enform.py for the
// rules; every answer here is the same as there, field for field.
import * as es from './enemyscan.js';
import * as formation from './formation.js';
import * as sb from './scenebuild.js';
import { cfmt } from './cfmt.js';
import { EditRefused, EnDocument } from './document.js';

const { EnFail, ascii_lower, cstr, en_lower, en_space } = es;

export const SCENE = 'scene';
export const ENEMY = 'enemy';
export const USER = 'user';
export const GENERATED = 'generated';
export const FORMATIONS = ['formation 0', 'formation 1', 'formation 2', 'formation 3'];
const BOM = '\xef\xbb\xbf';

function low_parts(rel) {
  const parts = rel.replace(/\\/g, '/').split('/');
  return [parts, parts.map(p => ascii_lower(p))];
}

// 'scene' for scenes\NAME.ini and scenes\generated\NAME.ini, 'enemy' for enemies\FOLDER\enemy.ini and generated.ini
// (names without case), else null (no form)
export function file_kind(rel) {
  const [, low] = low_parts(rel);
  if (!low[low.length - 1].endsWith('.ini')) return null;
  if ((low.length === 2 && low[0] === 'scenes') || (low.length === 3 && low[0] === 'scenes' && low[1] === 'generated')) return SCENE;
  if (low.length === 3 && low[0] === 'enemies' && (low[2] === 'enemy.ini' || low[2] === 'generated.ini')) return ENEMY;
  return null;
}

// 'generated' for the converter's file (scenes\generated\, enemies\FOLDER\generated.ini), else 'user'
export function role_of(rel) {
  const [, low] = low_parts(rel);
  if (low.length === 3 && ((low[0] === 'scenes' && low[1] === 'generated') || (low[0] === 'enemies' && low[2] === 'generated.ini'))) {
    return GENERATED;
  }
  return USER;
}

// The scene's name (its file name without .ini) or the enemy's folder
export function name_of(rel) {
  const [parts] = low_parts(rel);
  if (file_kind(rel) === SCENE) return parts[parts.length - 1].slice(0, -4);
  return parts[1];
}

// The label the DLL names the file by in its lines: scenes/NAME.ini, generated/NAME.ini, FOLDER/enemy.ini, FOLDER/generated.ini
export function label_of(rel) {
  const [parts] = low_parts(rel);
  if (file_kind(rel) === SCENE) return (role_of(rel) === GENERATED ? 'generated/' : 'scenes/') + parts[parts.length - 1];
  return parts[1] + '/' + parts[2];
}

// en_parse's name of a section header [...]: the text inside, lower case, white space collapsed to one space
export function section_name(header) {
  const w = [];
  let gap = false;
  for (const ch of cstr(header.slice(1, -1))) {
    if (en_space(ch)) {
      gap = true;
      continue;
    }
    if (gap && w.length) w.push(' ');
    gap = false;
    w.push(en_lower(ch));
  }
  return w.join('');
}

// The kind of a section by its name: a scene file's 'scene', 'formation' (formation 0-3) or 'other'; an enemy file's
// 'enemy', 'attack' (attack NAME) or 'other'
export function section_kind(fkind, name) {
  if (fkind === SCENE) return name === 'scene' ? 'scene' : FORMATIONS.includes(name) ? 'formation' : 'other';
  return name === 'enemy' ? 'enemy' : name.slice(0, 7) === 'attack ' ? 'attack' : 'other';
}

// A header text -> kind function for EnDocument.outline() and the commented-out sections
export function header_kinds(fkind) {
  return header => section_kind(fkind, section_name(header));
}

// The other file of the pair: [its path as listed, or as it would be made; whether it is there; its role]
export function partner_of(folder, rel) {
  const [parts] = low_parts(rel);
  const role = role_of(rel);
  let want;
  if (file_kind(rel) === SCENE) {
    if (role === USER) {
      const sub = folder.resolve(parts[0] + '/generated') || parts[0] + '/generated';
      want = sub + '/' + parts[parts.length - 1];
    } else want = parts[0] + '/' + parts[parts.length - 1];
  } else want = parts[0] + '/' + parts[1] + '/' + (role === GENERATED ? 'enemy.ini' : 'generated.ini');
  const real = folder.resolve(want);
  const there = real !== null && folder.is_file(real);
  return [there ? real : want, there, role === USER ? GENERATED : USER];
}

// [[name, header line, [[key, value, line]]]] of a file as en_parse reads it, never refusing (enform.py)
export function lenient(text) {
  const doc = new EnDocument(text);
  const out = [];
  let cur = null;
  for (const l of doc.lines) {
    if (l.kind === 'section') {
      const name = section_name(l.header_text());
      if (out.some(s => s[0] === name)) cur = [name, 0, []];
      else {
        cur = [name, l.index + 1, []];
        out.push(cur);
      }
    } else if (l.kind === 'key' && cur !== null) {
      const k = ascii_lower(cstr(l.key_text()));
      if (!cur[2].some(x => x[0] === k)) cur[2].push([k, cstr(l.value_text()), l.index + 1]);
    }
  }
  return out;
}

// en_parse's refusal of a file (its own words), or null
export function parse_problem(text, label) {
  if (text.startsWith(BOM)) text = text.slice(3);
  try {
    es.en_parse(text, label, new es.Doc());
  } catch (ex) {
    if (ex instanceof EnFail) return ex.text;
    throw ex;
  }
  return null;
}

// The effective sections, in en_overlay's order (enform.py overlay)
export function overlay(base, user, fkind) {
  const out = [];
  for (const [name, hl, keys] of base) {
    out.push({ name, kind: section_kind(fkind, name), generated_line: hl, user_line: 0,
               keys: keys.map(([k, v, ln]) => ({ key: k, value: v, from: GENERATED, line: ln, over: null })) });
  }
  for (const [name, hl, keys] of user) {
    let s = out.find(x => x.name === name);
    if (s === undefined) {
      s = { name, kind: section_kind(fkind, name), generated_line: 0, user_line: hl, keys: [] };
      out.push(s);
    }
    s.user_line = hl;
    for (const [k, v, ln] of keys) {
      const i = s.keys.findIndex(x => x.key === k);
      if (i < 0) s.keys.push({ key: k, value: v, from: USER, line: ln, over: null });
      else {
        const old = s.keys[i];
        const over = old.from === GENERATED ? { value: old.value, line: old.line } : old.over;
        s.keys[i] = { key: k, value: v, from: USER, line: ln, over };
      }
    }
  }
  return out;
}

// What a scene or enemy file's form shows besides its own lines (enform.py view)
export function view(folder, rel, text, partner_text, game = null) {
  const fkind = file_kind(rel);
  const role = role_of(rel);
  const [prel, there, prole] = partner_of(folder, rel);
  const mine = lenient(text);
  const other = partner_text !== null && partner_text !== undefined ? lenient(partner_text) : [];
  const [base, user] = role === USER ? [other, mine] : [mine, other];
  const problems = [];
  for (const [r, t] of [[rel, text], [prel, partner_text]]) {
    if (t !== null && t !== undefined) {
      const p = parse_problem(t, label_of(r));
      if (p !== null) problems.push({ file: r, text: p });
    }
  }
  const secs = overlay(base, user, fkind);
  const lone = [];
  for (const [r, t] of [[rel, text], [prel, partner_text]]) {
    const p = t !== null && t !== undefined ? lone_cr_problem(r, t) : null;
    if (p !== null) lone.push(p);
  }
  const out = { kind: fkind, role, file: rel, name: name_of(rel), partner: { path: prel, exists: there, role: prole },
                user: role === USER ? rel : prel, generated: role === USER ? prel : rel, problems, sections: secs,
                surrounded: [], formations: [], ai: null, lone_cr: lone };
  if (fkind === SCENE) {
    out.surrounded = surround_all(secs);
    out.formations = formations_all(secs, game);
    [out.scene_refs, out.scene_refs_why] = scene_refs(secs);
  }
  else out.ai = ai_of(secs);
  return out;
}

// (3D formation view, stage 2) The scene's whole enemy list as the models' route takes it: [[{folder, slot, dll}], why].
// (Review T2, M1) `dll` is true when the scene's number is 256 or more (scenebuild's `dll = number_ >= EN_SCENE_FIRST`): there the DLL
// serves slot i as pool model 365 + i whatever the folder's `model` key says; false below 256, and when the number is missing or not
// a number (the build refuses such a scene).
// `enemies` cut into words as the build cuts it (words_of, at most 3, a folder name of at most EN_NAME_MAX letters, digits,
// _ or -); `slot` is the word's index i, the slot whose pool model is 365 + i in a DLL scene. A key the build refuses gives
// [[], the words]: the 3D view says so. (enform.py scene_refs)
export const REFS_NO_KEY = 'enemies: the [scene] section has no enemies key';
export const REFS_COUNT = n => 'enemies: 1 to 3 enemy folders (it names ' + n + ')';
export function scene_refs(secs) {
  const sec = secs.find(s => s.name === 'scene');
  const k = sec ? sec.keys.find(x => x.key === 'enemies') : undefined;
  if (k === undefined) return [[], REFS_NO_KEY];
  const [count, words] = sb.words_of(cstr(k.value), true, 8);
  if (count < 1 || count > 3) return [[], REFS_COUNT(count)];
  const out = [];
  const number = scene_number(secs);
  const dll = number !== null && number >= sb.EN_SCENE_FIRST;
  for (let i = 0; i < count; i++) {
    const folder = sb.en_copy(words[i], sb.EN_NAME_MAX + 1);
    if (words[i].length > sb.EN_NAME_MAX || !es.en_name_ok(folder)) return [[], cfmt(sb.F_FOLDER_NAME, folder, sb.EN_NAME_MAX)];
    out.push({ folder, slot: i, dll });
  }
  return [out, null];
}

// (stage D1, review C2 minor 4) {file, line, text} when the file's text holds a CR not followed by LF (enform.py
// lone_cr_problem), else null
export const LONE_CR = 'line %d of %s holds a CR not followed by LF: the DLL ends a line there, this form does not, so the form ' +
  'cannot show the file as the DLL reads it; an override is refused on it (fix the line in a text editor: the ' +
  'Raw view cannot give such a CR back)';
export function lone_cr_problem(rel, text) {
  const n = new EnDocument(typeof text === 'string' ? text : Buffer.from(text).toString('latin1')).lone_cr_line();
  if (!n) return null;
  return { file: rel, line: n, text: LONE_CR.replace('%d', () => String(n)).replace('%s', () => rel.replace(/\//g, '\\')) };
}

// ---- the surrounded triangle -----------------------------------------------------------------------------------------
export function en_sur_div4096(v) {
  return v >= 0 ? (v + 2048) >> 12 : -((-v + 2048) >> 12);
}

export function en_sur_place(radius, front, k) {
  const a = (front + 120 * k) % 360;
  return [en_sur_div4096(-radius * sb.en_sur_sin(a)), en_sur_div4096(-radius * sb.en_sur_sin(a + 90))];
}

// {key: value} of formation f as the build reads it (a Map in the keys' order), or null without [formation 0]
export function formation_keys(secs, f) {
  const by = new Map(secs.map(s => [s.name, s]));
  if (!by.has('formation 0')) return null;
  const keys = new Map();
  for (const k of by.get('formation 0').keys) keys.set(k.key, k.value);
  if (f && by.has(FORMATIONS[f])) for (const k of by.get(FORMATIONS[f]).keys) keys.set(k.key, k.value);
  return keys;
}

export function surround(keys) {
  const out = { radius: sb.EN_SUR_RADIUS_DEFAULT, front: 0, places: [], rows: [], problem: null };
  let count;
  const xs = [0, 0, 0, 0, 0, 0];
  const zs = [0, 0, 0, 0, 0, 0];
  try {
    if (keys.has('party_radius')) {
      out.radius = es.en_number(cstr(keys.get('party_radius')), 'party_radius', sb.EN_SUR_RADIUS_MIN, sb.EN_SUR_RADIUS_MAX);
    }
    if (keys.has('party_front')) out.front = es.en_number(cstr(keys.get('party_front')), 'party_front', 0, 359);
    let words;
    [count, words] = sb.words_of(keys.has('rows') ? keys.get('rows') : '', false, 8);
    if (count < 1 || count > 6) throw new EnFail('rows: 1 to 6 rows are drawn here (it has ' + count + ')');
    for (let i = 0; i < count; i++) {
      const piece = words[i].split(':');
      const xyz = piece.length > 1 ? piece[1].split(',').map(p => es.en_number(sb.en_copy(p, 64), 'rows', -32768, 32767)) : [];
      if (xyz.length !== 3) throw new EnFail('rows: "' + words[i] + '" is not enemy:x,y,z');
      xs[i] = xyz[0];
      zs[i] = xyz[2];
      out.rows.push({ token: words[i], enemy: piece[0], x: xyz[0], z: xyz[2], place: 0, side: 0 });
    }
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    out.problem = ex.text;
    out.rows = [];
    return out;
  }
  const [place, side, counts] = sb.en_sur_assign(count, xs, zs, out.front);
  out.rows.forEach((r, i) => {
    r.place = place[i];
    r.side = side[i];
  });
  for (let k = 0; k < 3; k++) {
    const [x, z] = en_sur_place(out.radius, out.front, k);
    const rows = [];
    for (let i = 0; i < count; i++) if (place[i] === k) rows.push(i);
    out.places.push({ place: k, angle: (out.front + 120 * k) % 360, x, z, rows, count: counts[k],
                      over: counts[k] > sb.EN_SUR_PER_PLACE });
  }
  return out;
}

export function surround_all(secs) {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const keys = formation_keys(secs, f);
    if (keys === null) return [];
    const kind = ascii_lower(cstr(keys.has('kind') ? keys.get('kind') : 'normal'));
    const on = kind === 'surrounded';
    out.push({ formation: f, kind, surrounded: on, keys_given: ['party_radius', 'party_front'].filter(k => keys.has(k)),
               triangle: on ? surround(keys) : null });
  }
  return out;
}

// ---- (formation diagrams, stage 1) every kind's layout, from the keys as the build reads them (enform.py) ------------
export const F_KIND_DRAWN = 'kind "%s" is not one of %s';
export const F_ROWS_DRAWN = 'rows: 1 to 6 rows are drawn here (it has %d)';
export const F_ROW_DRAWN = 'rows: "%s" is not enemy:x,y,z (:row:cover may follow)';
export const C_KEY = 'camera "%s" is not scene:formation';
export const C_NO_GAME = 'the game folder is not known (give the game folder)';
export const C_NO_SCENE = 'scene %d formation %d is not in %s';
export const C_EMPTY = 'the stand-in\'s camera block (scene %d formation %d) has no record 0';
export const C_FROM = 'the stand-in, scene %d formation %d (camera = %s)';
const put = (t, ...a) => { let i = 0; return t.replace(/%[ds]/g, () => String(a[i++])); };

export function scene_number(secs) {
  const sec = secs.find(s => s.name === 'scene');
  const k = sec ? sec.keys.find(x => x.key === 'number') : undefined;
  if (k === undefined) return null;
  try {
    return es.en_number(cstr(k.value), 'number', 0, 4095);
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    return null;
  }
}

export function stand_camera(value, game) {
  const pieces = cstr(value).split(':');
  let parts;
  try {
    parts = pieces.slice(0, 3).map(p => es.en_number(sb.en_copy(p, 64), 'camera', 0, 255));
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    parts = null;
  }
  if (parts === null || pieces.length !== 2) return [null, null, put(C_KEY, cstr(value))];
  const [cs, cf] = parts;
  if (game === null || game === undefined) return [null, null, C_NO_GAME];
  if (game.scene_problem !== null) return [null, null, game.scene_problem];
  const st = cs <= 254 && cf <= 3 && game.stand.has(cs) ? game.stand.get(cs) : null;
  if (st === null) return [null, null, put(C_NO_SCENE, cs, cf, game.scene_path)];
  const cam = formation.camera_of(st[cf][1]);
  if (cam === null) return [null, null, put(C_EMPTY, cs, cf)];
  return [cam, put(C_FROM, cs, cf, cstr(value)), null];
}

export function formation_input(keys, battle, game) {
  const kind_v = cstr(keys.has('kind') ? keys.get('kind') : 'normal');
  const sur = ascii_lower(kind_v) === 'surrounded';
  const fm = { kind: 0, surrounded: sur ? 1 : 0, radius: sb.EN_SUR_RADIUS_DEFAULT, front: 0, battle, flags: null, rows: [],
               camera: null, camera_from: null, camera_why: null, problem: null };
  try {
    if (sur) {
      const t = surround(keys);
      if (t.problem !== null) throw new EnFail(t.problem);
      fm.radius = t.radius;
      fm.front = t.front;
    } else {
      let k = 0;
      while (k < sb.EN_SUR_KIND && !sb.en_lower_is(kind_v, sb.EN_KINDS[k])) k++;
      if (k === sb.EN_SUR_KIND) throw new EnFail(put(F_KIND_DRAWN, kind_v, sb.EN_JOINED_KINDS));
      fm.kind = k;
    }
    const [count, words] = sb.words_of(keys.has('rows') ? keys.get('rows') : '', false, 8);
    if (count < 1 || count > 6) throw new EnFail(put(F_ROWS_DRAWN, count));
    for (let i = 0; i < count; i++) {
      const piece = words[i].split(':');
      const xyz = piece.length > 1 ? piece[1].split(',').map(p => es.en_number(sb.en_copy(p, 64), 'rows', -32768, 32767)) : [];
      if (xyz.length !== 3) throw new EnFail(put(F_ROW_DRAWN, words[i]));
      const row = piece.length > 2 ? es.en_number(piece[2], 'rows', 0, 0xffff) : 1;
      const cover = piece.length > 3 ? es.en_number(piece[3], 'rows', 0, 0xffff) : 0;
      fm.rows.push({ who: piece[0], model: 0, x: xyz[0], y: xyz[1], z: xyz[2], row, cover, flags: 0xffffffff });
    }
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    fm.problem = ex.text;
    fm.rows = [];
    return fm;
  }
  try {
    fm.flags = keys.has('flags') ? es.en_number(cstr(keys.get('flags')), 'flags', 0, 0xffff) : 0xfffd;
  } catch (ex) {
    if (!(ex instanceof EnFail)) throw ex;
    fm.flags = null;
  }
  if (keys.has('camera')) [fm.camera, fm.camera_from, fm.camera_why] = stand_camera(keys.get('camera'), game);
  else fm.camera_why = 'no camera key';
  return fm;
}

export function formations_all(secs, game) {
  const number = scene_number(secs);
  const out = [];
  for (let f = 0; f < 4; f++) {
    const keys = formation_keys(secs, f);
    if (keys === null) return [];
    out.push(formation.layout(formation_input(keys, number !== null ? number * 4 + f : null, game)));
  }
  return out;
}

// ---- an enemy's AI -------------------------------------------------------------------------------------------------
// [the text file, the block file] of `ai = value` as the DLL reads it, or null (none, a refused name)
export function ai_files(value) {
  const v = cstr(value);
  if (sb.en_lower_is(v, 'none') || !v) return null;
  if ([...v].some(c => '\\/:'.includes(c)) || v.length >= 64 || v === '..') return null;
  if (v.length > 4 && ascii_lower(v.slice(-4)) === '.txt') return [v, v.slice(0, -4)];
  return [v + '.txt', v];
}

export function ai_of(secs) {
  const s = secs.find(x => x.name === 'enemy');
  const k = s ? s.keys.find(x => x.key === 'ai') : undefined;
  if (k === undefined) return null;
  const f = ai_files(k.value);
  return { value: k.value, from: k.from, line: k.line, text: f ? f[0] : null, block: f ? f[1] : null,
           none: sb.en_lower_is(cstr(k.value), 'none') };
}

const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// The app's path rule 3 for one name (main/paths.js windows_name_problem; enform.py): null when fine, else why not
export function windows_name_problem(name) {
  if (name.indexOf(':') >= 0) return 'a name with ":" in it (an alternate data stream on Windows)';
  if (name.endsWith('.') || name.endsWith(' ')) return 'a name that ends in a dot or a space (Windows drops it)';
  const stem = name.split('.')[0].replace(/ +$/, '');
  if (DEVICE.test(stem)) return 'a device name on Windows (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9)';
  if (/~[0-9]/.test(name)) return 'a short 8.3 name on Windows ("~" followed by a digit reaches another file)';
  return null;
}

// (stage D1, review C2 minors 3 and 7) Why the AI page's Save will not write the files of an ai key, or null
// (enform.py ai_save_problem)
export function ai_save_problem(ai) {
  if (ai === null || ai === undefined || ai.text === null) return null;
  for (const n of [ai.text, ai.block]) {
    const why = n === '.' || n === '..' ? 'a name "." or ".."' : windows_name_problem(n);
    if (why) return 'ai = ' + ai.value + ': Save does not write ' + n + ', ' + why + ' (nothing was written)';
  }
  if (ascii_lower(ai.block).slice(-4) === '.ini') {
    return 'ai = ' + ai.value + ': Save does not write ' + ai.block + ', an .ini name (the block would replace a settings file such as ' +
           'enemy.ini or generated.ini; nothing was written)';
  }
  return null;
}

// The DLL's rules for enemy folder `enemy`'s AI with `block` (a Buffer) as its block file (enform.py ai_rule)
export function ai_rule(folder, enemy, block) {
  folder = new es.Folder(folder.root, new Map(folder.texts), folder.made);
  const rec = new sb.Builder(new sb.Env(folder, [enemy]));
  rec.r = new sb.Result();
  rec.b = new es.Build(folder);
  rec.enemy_label = null;
  const E = new sb.Enemy();
  try {
    rec.load_enemy(enemy, E);
    for (const a of E.actions) {
      const k = es.Doc.get(E.doc.sections[a.section], 'id');
      try {
        a.id = k !== null ? sb.number(k[1], sb.at(k), 0, 0x7fff, k) : -1;
      } catch (ex) {
        if (!(ex instanceof EnFail)) throw ex;
        a.id = -1;
      }
    }
    const k = es.Doc.get(E.enemy, 'ai');
    const f = ai_files(k[1]);
    if (f !== null && block !== null && block !== undefined) {
      let real = folder.resolve('enemies/' + enemy + '/' + f[1]);
      if (real === null) {
        real = (folder.resolve('enemies/' + enemy) || 'enemies/' + enemy) + '/' + f[1];
        folder.made.add(real);
      }
      folder.texts.set(real, Buffer.from(block).toString('latin1'));
      folder._lists.clear();
    }
    const entry = rec.enemy_ai(E);
    rec.ai_attacks(E, entry);
  } catch (ex) {
    if (ex instanceof EnFail) return [{ text: ex.text, file: ex.label, line: ex.line }];
    throw ex;
  }
  return [];
}

// ---- edits ---------------------------------------------------------------------------------------------------------
// `key = value` in the section `header` names (enform.py set_key). Returns the line index changed or added.
export function set_key(doc, header, key, value) {
  if (!(header.startsWith('[') && header.endsWith(']')) || new doc.constructor.LINE(0, header).kind !== 'section') {
    throw new EditRefused(header + ' is not a section header the DLL reads ([name], 3 characters at least, no ] inside)');
  }
  const name = section_name(header);
  const k = ascii_lower(key);
  for (const s of doc.sections()) {
    if (s.header_index === null || section_name(doc.lines[s.header_index].header_text()) !== name) continue;
    for (const l of doc.key_lines(s)) {
      if (ascii_lower(cstr(l.key_text())) === k) {
        doc.set_value(l.index, value);
        return l.index;
      }
    }
    return doc.add_key(s, key, value);
  }
  const hi = doc.add_section(header);
  return doc.add_key(doc.section_at(hi), key, value);
}

// (stage D1, review C2 minor 8; review D1 minor 1) "use the generated value" (enform.py use_generated): the user's key
// line `index` (0-based) removed; the section goes too only when it is one an override added (blank lines only left,
// no comment on its header, no section of its name in `before`, the text as last opened or saved), and when it ended
// the file, the blank line before it if `before` did not end with it. Returns the line index removed.
export function use_generated(doc, index, before) {
  if (!(index >= 0 && index < doc.lines.length) || doc.lines[index].kind !== 'key') {
    throw new EditRefused('line ' + (index + 1) + ' is not a key line');
  }
  const sec = doc.sections().find(s => s.first <= index && index <= s.last);
  doc.remove_line(index);
  if (sec.header_index === null) return index;
  const s = doc.section_at(sec.header_index);
  for (let i = s.first; i <= s.last; i++) if (doc.lines[i].kind !== 'blank') return index;
  const head = doc.lines[s.header_index];
  if (head.comment !== null && head.comment !== undefined) return index;
  const name = section_name(head.header_text());
  const old = new EnDocument(before || '');
  if (old.lines.some(l => l.kind === 'section' && section_name(l.header_text()) === name)) return index;
  const at_end = s.last === doc.lines.length - 1;
  for (let i = s.last; i > s.header_index - 1; i--) doc.remove_line(i);
  if (at_end && trailing_blanks(doc) > trailing_blanks(old)) doc.remove_line(doc.lines.length - 1);
  return index;
}

function trailing_blanks(doc) {
  let n = 0;
  for (let i = doc.lines.length - 1; i >= 0 && doc.lines[i].kind === 'blank'; i--) n++;
  return n;
}
