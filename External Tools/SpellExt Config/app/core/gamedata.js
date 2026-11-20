// The game's own data a DLL scene's build reads, from the game folder, READ ONLY: port of sxcfg/gamedata.py (see there):
// the game's scene.bin as enemies_index_scene_bin (spellext.c 48924) opens and indexes it (en_scene_bin_walk 48079,
// enemies_index_one 48880), the kernel's item names 0-127 as enemies_env_item (48810) words them, and the kernel's
// attack records and names (for the image only).
// Node 22 language level.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { raw_inflate } from './aitool.js';
import { pyJoin, pyLower, pyCmp, pyIsdir, pyIsfile, pyExists } from './py.js';

export const EN_IMAGE_SIZE = 0x1e80;
const EN_O_SETUP = 0x0008;
const EN_O_CAMERA = 0x0058;
const EN_O_ATTACK = 0x04c0;
const EN_O_ATTACK_ID = 0x0840;
export const ENEMIES_BASES_MAX = 1024;
const SCENE_TAILS = [['data', 'lang-en', 'battle', 'scene.bin'], ['data', 'battle', 'scene.bin']];
const KERNEL_DIR = ['data', 'lang-en', 'kernel'];
export const GAME_SCENE_SIZE = 270336;
export const EN_ITEM_NAMES = 128;
export const EN_HEAD = 0x298;                 // (stage 1) a scene image up to its enemy records
const EN_O_NAMES = 0x298;
const EN_ENEMY_SIZE = 0xb8;
export const SCENE_BIN_SIZE = [0x2000, 0x200000];
export const S_SET = 'the scene.bin chosen in place of the game folder\'s, %s,';
// the game files the settings may name in place of the game folder's [key, label]
export const GAME_FILES = [['scene_bin', 'scene.bin'], ['battle_lgp', 'battle.lgp'], ['menu_lgp', 'menu_us.lgp']];
// (review F1, minor 1) FF7's characters 0x60-0xdf, for an enemy's name as it reads (gamedata.py HIGH)
export const HIGH =
  '\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8' +
  '\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc' +
  '\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8' +
  '\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8' +
  '\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153' +
  '\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02' +
  '\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4' +
  '?\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7';
const set_of = p => S_SET.replace('%s', () => p);

// (stage 1) An enemy's name (32 bytes of the game's text) as it reads (gamedata.py display_name)
export function display_name(text) {
  let out = '';
  let i = 0;
  while (i < text.length && text[i] !== 0xff) {
    const c = text[i];
    if (c === 0xf8 || c === 0xf9) {
      i += 2;
      continue;
    }
    out += c < 0x60 ? String.fromCharCode(c + 0x20) : c < 0xe0 ? HIGH[c - 0x60] : '?';
    i += 1;
  }
  return out.replace(/ +$/, '');
}

function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

// The real path of root/parts..., each part found without case (an exact name first), as Windows opens it; or null
export function find_nocase(root, parts) {
  let p = root;
  for (const part of parts) {
    let names;
    try {
      names = fs.readdirSync(p);
    } catch (e) {
      return null;
    }
    let hit = names.includes(part) ? part : null;
    if (hit === null) {
      const sorted = names.slice().sort(pyCmp);
      hit = sorted.find(n => pyLower(n) === pyLower(part));
      if (hit === undefined) return null;
    }
    p = pyJoin(p, hit);
  }
  return p;
}

// A raw deflate stream: the bytes it gives, or null (zlib's error)
export function inflate(raw) {
  try {
    return raw_inflate(raw).out;
  } catch (e) {
    return null;
  }
}

// en_scene_bin_walk: each(n, image) for the n-th scene of the file. Returns [scenes, null] or [-1, problem]
export function scene_bin_walk(data, each) {
  let scenes = 0;
  const size = data.length;
  for (let block = 0; block + 0x2000 <= size; block += 0x2000) {
    const b = data.subarray(block, block + 0x2000);
    for (let i = 0; i < 16; i++) {
      const offset = u32(b, 4 * i);
      if (offset === 0xffffffff) continue;
      let at = (offset * 4) % 0x100000000;
      if (at < 0x40 || at + 18 > 0x2000 || b[at] !== 0x1f || b[at + 1] !== 0x8b || b[at + 2] !== 8) {
        return [-1, 'block ' + (block / 0x2000) + ' member ' + i + ': no gzip member at ' + at.toString(16).padStart(4, '0')];
      }
      const flags = b[at + 3];
      at += 10;
      if (flags & 4) at += 2 + (b[at] | (b[at + 1] << 8));
      if (flags & 8) {
        while (at < 0x2000) {
          at += 1;
          if (!b[at - 1]) break;
        }
      }
      if (flags & 16) {
        while (at < 0x2000) {
          at += 1;
          if (!b[at - 1]) break;
        }
      }
      if (flags & 2) at += 2;
      const image = at < 0x2000 ? inflate(b.subarray(at, 0x2000)) : null;
      if (image === null || image.length !== EN_IMAGE_SIZE) {
        return [-1, 'block ' + (block / 0x2000) + ' member ' + i + ' (scene ' + scenes + ') does not inflate to ' + EN_IMAGE_SIZE + ' bytes'];
      }
      each(scenes, image);
      scenes += 1;
    }
  }
  return [scenes, null];
}

// KERNEL2.BIN's LZS (as gamedata.py's: a reference cut in half at the end stops it)
export function lzs(d) {
  const out = [];
  const buf = new Uint8Array(4096);
  let bp = 0xfee;
  let i = 0;
  while (i < d.length) {
    const flags = d[i];
    i += 1;
    for (let bit = 0; bit < 8; bit++) {
      if (i >= d.length) break;
      if ((flags >> bit) & 1) {
        const c = d[i];
        i += 1;
        out.push(c);
        buf[bp] = c;
        bp = (bp + 1) & 0xfff;
      } else {
        if (i + 1 >= d.length) {
          i = d.length;
          break;
        }
        const a = d[i];
        const b = d[i + 1];
        i += 2;
        const off = a | ((b & 0xf0) << 4);
        for (let k = 0; k < (b & 0xf) + 3; k++) {
          const c = buf[(off + k) & 0xfff];
          out.push(c);
          buf[bp] = c;
          bp = (bp + 1) & 0xfff;
        }
      }
    }
  }
  return Buffer.from(out);
}

export function kernel2_sections(data) {
  const raw = lzs(data.subarray(4));
  const out = [];
  let at = 0;
  while (at + 4 <= raw.length) {
    const n = u32(raw, at);
    out.push(raw.subarray(at + 4, at + 4 + n));
    at += 4 + n;
  }
  return out;
}

export function kernel_sections(data) {
  const out = [];
  let i = 0;
  while (i + 6 <= data.length) {
    const clen = data[i] | (data[i + 1] << 8);
    i += 6;
    if (clen === 0) break;
    try {
      out.push(zlib.gunzipSync(data.subarray(i, i + clen)));
    } catch (e) {
      break;
    }
    i += clen;
  }
  return out;
}

// The first `count` texts of a kernel2 text section: raw bytes from each entry's offset (null past the table)
export function text_entries(sec, count) {
  const out = [];
  if (sec.length < 2) {
    for (let k = 0; k < count; k++) out.push(null);
    return out;
  }
  const first = sec[0] | (sec[1] << 8);
  for (let k = 0; k < count; k++) {
    if (2 * k + 2 > sec.length || 2 * k >= first) {
      out.push(null);
      continue;
    }
    const at = sec[2 * k] | (sec[2 * k + 1] << 8);
    out.push(at < sec.length ? sec.subarray(at, at + 64) : Buffer.alloc(0));
  }
  return out;
}

// enemies_env_item: the game's item text as the word a name is compared with
export function env_item_name(text) {
  let out = '';
  let i = 0;
  while (i < 64 && i < text.length && text[i] !== 0xff && out.length < 63) {
    const c = text[i];
    if (c === 0xf8 || c === 0xf9) {
      i += 2;
      continue;
    }
    if (c < 0x60) {
      const ch = String.fromCharCode(c + 0x20);
      out += ch === ' ' ? '_' : (ch >= 'A' && ch <= 'Z') ? String.fromCharCode(ch.charCodeAt(0) + 0x20) : ch;
    } else {
      out += '?';
    }
    i += 1;
  }
  return out;
}

function st(p) {
  try {
    const s = fs.statSync(p, { bigint: true });
    return [p, Number(s.size), String(s.mtimeNs)];
  } catch (e) {
    return [p, null, null];
  }
}

// The game folder's scene.bin and kernel, read once (and again when a file's time or size changes)
// two item-name sources alike (the label, the reason and the bytes)
function same_source(a, b) {
  if (!a || !b) return !a && !b;
  const eq = (x, y) => (x === undefined ? null : x) === (y === undefined ? null : y);
  const da = a.data || null;
  const db = b.data || null;
  return eq(a.label, b.label) && eq(a.why, b.why) && (da === db || (da !== null && db !== null && Buffer.compare(da, db) === 0));
}

export class GameData {
  constructor(game_dir, scene_bin = null) {
    this.game_dir = game_dir && pyIsdir(game_dir) ? game_dir : null;
    this.scene_bin = scene_bin || null;         // (stage 1) the scene.bin set in the settings, or null
    this._stamp = null;
    this.items_source = null;     // (stage C2) the chosen kernel's kernel2.bin: {label, data, why} (set_items_kernel)
    this._load();
  }

  // (minor 1 of review C1) Take the item names from `source`, the kernel2.bin beside the KERNEL.BIN the editor is set to
  // ({label, data}; {label: null, data: null, why} when that kernel has none), or from the game folder's (null). Read
  // again at the next fresh() when it changed.
  set_items_kernel(source) {
    if (!same_source(source, this.items_source)) {
      this.items_source = source;
      this._stamp = null;
    }
  }

  _paths() {
    if (!this.game_dir) return [this.scene_bin, null, null];
    let scene = this.scene_bin;
    for (const tail of scene ? [] : SCENE_TAILS) {
      scene = find_nocase(this.game_dir, tail);
      if (scene && pyIsfile(scene)) break;
      scene = null;
    }
    const k1 = find_nocase(this.game_dir, KERNEL_DIR.concat(['KERNEL.BIN']));
    const k2 = find_nocase(this.game_dir, KERNEL_DIR.concat(['kernel2.bin']));
    return [scene, k1 && pyIsfile(k1) ? k1 : null, k2 && pyIsfile(k2) ? k2 : null];
  }

  stamp() {
    const src = this.items_source;
    return JSON.stringify(this._paths().map(p => (p === null ? [null, null, null] : st(p)))
      .concat([src ? [src.label === undefined ? null : src.label, src.why === undefined ? null : src.why] : [null, null]]));
  }

  // Read again when a file changed since
  fresh() {
    if (this.stamp() !== this._stamp) this._load();
    return this;
  }

  _load() {
    this._stamp = this.stamp();
    const [scene, k1, k2] = this._paths();
    this.scene_path = scene;
    this.kernel_path = k1;
    this.kernel2_path = k2;
    this.scenes = 0;
    this.bases = new Map();
    this.stand = new Map();
    this.scene_problem = null;
    this.scene_size = null;
    this.heads = new Map();       // (stage 1) scene -> its first EN_HEAD bytes
    this.names = new Map();       // (stage 1) scene -> its three enemy names
    if (this.scene_bin) this._read_chosen(scene);
    else if (!this.game_dir) this.scene_problem = 'the game folder is not known (give the game folder)';
    else if (!scene) {
      this.scene_problem = 'the game folder has no data\\lang-en\\battle\\scene.bin or data\\battle\\scene.bin: ' +
        'what the mod manager serves the DLL there is not known here';
    } else this._read_scene(scene);
    this.item_names = null;
    this.attack_records = null;
    this.attack_names = null;
    this.kernel_problem = null;
    this.items_from = null;       // where the item names came from, when not the game folder's kernel2.bin
    this.items_note = null;       // why the chosen kernel's kernel2.bin was not used (the game folder's then)
    if (!this.game_dir) this.kernel_problem = 'the game folder is not known (give the game folder)';
    else if (!k2) this.kernel_problem = 'the game folder has no data\\lang-en\\kernel\\kernel2.bin';
    else {
      try {
        const data = fs.readFileSync(k2).subarray(0, 1 << 20);
        const secs = kernel2_sections(data);
        if (secs.length < 11) throw new Error('not a KERNEL2.BIN');
        this.item_names = text_entries(secs[10], EN_ITEM_NAMES).map(t => (t === null ? null : env_item_name(t)));
        const names = [];
        for (let t of text_entries(secs[9], 128)) {
          t = t || Buffer.alloc(0);
          let end = 0;
          while (end < 31 && end < t.length && t[end] !== 0xff) end += 1;
          names.push(Buffer.concat([t.subarray(0, end), Buffer.alloc(32 - end, 0xff)]));
        }
        this.attack_names = names;
      } catch (ex) {
        this.item_names = null;
        this.kernel_problem = k2 + ' could not be read (' + ex.message + ')';
      }
    }
    const src = this.items_source;
    if (src !== null) {
      let names = null;
      let why = src.why === undefined ? null : src.why;
      if (src.data !== null && src.data !== undefined) {
        try {
          const secs = kernel2_sections(src.data.subarray(0, 1 << 20));
          if (secs.length < 11) throw new Error('not a KERNEL2.BIN');
          names = text_entries(secs[10], EN_ITEM_NAMES).map(t => (t === null ? null : env_item_name(t)));
        } catch (ex) {
          why = src.label + ' could not be read (' + ex.message + ')';
        }
      }
      if (names !== null) {
        this.item_names = names;
        this.items_from = src.label;
        this.kernel_problem = null;
      } else this.items_note = why;
    }
    if (k1) {
      try {
        const secs = kernel_sections(fs.readFileSync(k1).subarray(0, 1 << 20));
        if (secs.length > 1 && secs[1].length >= 128 * 28) {
          this.attack_records = [];
          for (let i = 0; i < 128; i++) this.attack_records.push(secs[1].subarray(28 * i, 28 * i + 28));
        }
      } catch (e) {
        // (the image's kernel records only)
      }
    }
  }

  // (stage 1) The scene.bin the settings name: read as the game folder's is, every refusal naming it
  _read_chosen(p) {
    let size;
    try {
      if (!pyIsfile(p)) throw new Error(!pyExists(p) ? 'no such file' : 'not a file');
      size = fs.statSync(p).size;
    } catch (e) {
      const why = e.code === undefined && (e.message === 'no such file' || e.message === 'not a file') ? e.message : 'cannot be read';
      this.scene_problem = set_of(p) + ' could not be read (' + why + ')';
      return;
    }
    if (size < SCENE_BIN_SIZE[0] || size > SCENE_BIN_SIZE[1]) {
      this.scene_size = size;
      this.scene_problem = set_of(p) + ' is ' + size + ' bytes: not a scene.bin (' + SCENE_BIN_SIZE[0] + ' to ' + SCENE_BIN_SIZE[1] + ')';
      return;
    }
    this._read_scene(p);
    if (this.scene_problem !== null && this.scene_problem.startsWith(p + ' could not be read')) {
      this.scene_problem = set_of(p) + ' could not be read (cannot be read)';
    } else if (this.scene_problem !== null) {
      let why = this.scene_problem;
      if (why.startsWith(p + ': ')) why = why.slice(p.length + 2);
      this.scene_problem = set_of(p) + ' is not a scene.bin: ' + why;
    } else if (!this.scenes) this.scene_problem = set_of(p) + ' holds no scene: not a scene.bin';
  }

  _read_scene(p) {
    let data;
    try {
      const size = fs.statSync(p).size;
      this.scene_size = size;
      if (size < 0x2000 || size > 0x200000) throw new Error('size');
      data = fs.readFileSync(p);
      if (data.length !== size) throw new Error('short');
    } catch (e) {
      this.scene_problem = p + ' could not be read (' + (this.scene_size === null ? 'None' : this.scene_size) + ' bytes)';
      return;
    }
    const bases = new Map();
    const stand = new Map();
    const heads = new Map();
    const names = new Map();
    const each = (scene, image) => {
      heads.set(scene, Buffer.from(image.subarray(0, EN_HEAD)));
      names.set(scene, [0, 1, 2].map(i => display_name(image.subarray(EN_O_NAMES + EN_ENEMY_SIZE * i, EN_O_NAMES + EN_ENEMY_SIZE * i + 32))));
      if (scene < 255) {
        const fs4 = [];
        for (let a = 0; a < 4; a++) {
          fs4.push([image.subarray(EN_O_SETUP + 0x14 * a, EN_O_SETUP + 0x14 * (a + 1)),
            image.subarray(EN_O_CAMERA + 0x30 * a, EN_O_CAMERA + 0x30 * (a + 1))]);
        }
        stand.set(scene, fs4);
      }
      for (let a = 0; a < 32; a++) {
        const i = EN_O_ATTACK_ID + 2 * a;
        const aid = image[i] | (image[i + 1] << 8);
        if (aid < 0x100 || aid === 0xffff || bases.size === ENEMIES_BASES_MAX || bases.has(aid)) continue;
        bases.set(aid, [Buffer.from(image.subarray(EN_O_ATTACK + 28 * a, EN_O_ATTACK + 28 * a + 28)), scene]);
      }
    };
    const [scenes, problem] = scene_bin_walk(data, each);
    this.bases = bases;
    if (scenes < 0) {
      this.scene_problem = p + ': ' + problem;
      return;
    }
    this.scenes = scenes;
    this.stand = stand;
    this.heads = heads;
    this.names = names;
  }

  // (stage 1) The summary's part about the scene.bin read: the file used, or why none
  scene_line() { return this.summary_parts()[0]; }

  // The tool's line about what the forecast read
  summary() { return this.summary_parts().join('; '); }

  summary_parts() {
    const parts = [];
    if (this.scene_path && this.scene_problem === null) {
      parts.push('scene.bin ' + this.scene_path + ' (' + (this.scene_bin ? 'chosen in place of the game folder\'s; ' : '') + this.scene_size + ' bytes, ' + this.scenes + ' scenes, ' + this.bases.size +
        ' records' + (this.scene_size === GAME_SCENE_SIZE ? '' : ': NOT the size of the game\'s own file (270336)') + ')');
    } else parts.push('scene.bin: ' + this.scene_problem);
    if (this.items_from !== null) parts.push('item names: ' + this.items_from + ' (the kernel the editor is set to)');
    else {
      let t = 'item names: ' + (this.item_names !== null ? this.kernel2_path : this.kernel_problem);
      if (this.items_note) t += ' (not the editor\'s kernel\'s: ' + this.items_note + ')';
      parts.push(t);
    }
    return parts;
  }
}
