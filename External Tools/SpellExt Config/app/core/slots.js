// Materia slots of a weapon or armour section: what the DLL will put in the record's eight slot bytes and its growth
// byte, for the drawing; and the `slots` line for a layout, in the DLL's own words (port of sxcfg/slots.py).
//
// Read from the code (spellext.c):
//   - `slots` (apply_weapon_key 35349, apply_gear_key 35839, slot_word 1804): words left to right, each writing its
//     slots as it goes: single 5, pair 6 7, chainN 6 7 7 ... (N slots), *_nogrowth the same less 4 (1; 2 3; 2 3 3 ...),
//     none nothing; then every slot not written is 0. A mistake stops the line where it is: the slots written before
//     it stay, the rest keep what they had (the base's). At most 8 ("a weapon has at most 8 slots" / "armour has at
//     most 8 slots").
//   - The slot bytes: weapon record +0x1c (WEAPON_SLOTS), armour +0x09 (ARMOUR_SLOTS); growth: weapon +0x06 (key
//     `growth`, a number 0-255), armour +0x11 (ARMOUR_GROWTH, key `growth` = none, normal, double, triple).
//   - byte_XX / word_XX write any record byte (weapon 44 bytes, armour 36); later lines win per byte; the base's record
//     supplies every byte no line sets (finish_weapon / finish_gear copy the base, then the set bytes).
//   - The menu: all six slot drawers draw a link bar to the LEFT of any slot of type 3 or 7; type 0 is no slot. The DLL
//     links every right half whose left neighbour is a slot (link_chain 1742), so a chain 6 7 7 7 joins all four.
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as grammar from './grammar.js';
import * as gc from './rules/gearcommon.js';
import { pyJoin, pyIsfile, pyLower, PyIndexError } from './py.js';

export const WEAPON = 'weapon';
export const ARMOUR = 'armour';
export const LAYOUT = {
  weapon: { slots: 0x1c, growth: 0x06, size: 0x2c, too_many: 'a weapon has at most 8 slots', kernel_index: 5,
            base_count: 128 },
  armour: { slots: 0x09, growth: 0x11, size: 0x24, too_many: 'armour has at most 8 slots', kernel_index: 6,
            base_count: 32 },
};
export const KINDS = { weapon: WEAPON, wide_weapon: WEAPON, armour: ARMOUR, wide_armour: ARMOUR };
export const GROWTH_NAMES = new Map([[0, 'Nothing'], [1, 'Normal'], [2, 'Double'], [3, 'Triple']]);   // FF7's Equip menu words
export const ARMOUR_GROWTH_WORDS = ['none', 'normal', 'double', 'triple'];                           // growth_names, 35713

// slot type -> [shape, gives AP]
export const TYPES = new Map([[1, ['single', false]], [2, ['left', false]], [3, ['right', false]],
                              [5, ['single', true]], [6, ['left', true]], [7, ['right', true]]]);

// The DLL's loop over a `slots` value, on a copy of the 8 bytes. Returns [bytes, problem or null, how many slots the
// line wrote: 8 when it ends well].
export function apply_slots_line(value, current, too_many) {
  const out = current.slice();
  const s = value;
  let p = 0;
  const end = s.length;
  let slot = 0;
  while (true) {
    const w = grammar.next_word(s, p, end);
    if (w === null) break;
    let we;
    [p, we] = w;
    const sw = gc.slot_word(s, p, we);
    if (sw === null) return [out, gc.SLOTS_PROBLEM, slot];
    const [first, count] = sw;
    if (slot + count > 8) return [out, too_many, slot];
    for (let i = 0; i < count; i++) {
      out[slot] = first + (i > 0 ? 1 : 0);
      slot += 1;
    }
    p = we;
  }
  while (slot < 8) {
    out[slot] = 0;
    slot += 1;
  }
  return [out, null, 8];
}

// The `slots` value that gives these 8 bytes, or [null, why] when no slots line can (the DLL's words make only groups
// packed from the left: a single, or a left half followed by right halves of the same growth).
export function encode(slots) {
  const words = [];
  let i = 0;
  let last = -1;
  for (let k = 0; k < 8; k++) {
    if (slots[k]) last = Math.max(last, k);
  }
  while (i <= last) {
    const t = slots[i];
    if (t === 0) return [null, 'slot ' + (i + 1) + ' is empty but a slot after it is not: a slots line fills from the left'];
    if (!TYPES.has(t)) return [null, 'slot ' + (i + 1) + ' has type ' + t + ', which no slots word writes (raw byte only)'];
    const [shape, ap] = TYPES.get(t);
    const suffix = ap ? '' : '_nogrowth';
    if (shape === 'single') {
      words.push('single' + suffix);
      i += 1;
      continue;
    }
    if (shape === 'right') return [null, 'slot ' + (i + 1) + ' is a right half with no left half before it'];
    let n = 1;
    while (i + n < 8 && slots[i + n] === t + 1) n += 1;
    if (n === 1) return [null, 'slot ' + (i + 1) + ' is a left half with no right half after it'];
    if (i + n < 8 && (slots[i + n] === 3 || slots[i + n] === 7)) {
      return [null, 'slot ' + (i + n + 1) + ': a linked group mixes slots that give AP and slots that do not'];
    }
    words.push((n === 2 ? 'pair' : 'chain' + n) + suffix);
    i += n;
  }
  return [words.length ? words.join(' ') : 'none', null];
}

// Linked groups as the DLL links them: [[positions...]] for the drawn slots.
export function groups(slots) {
  const out = [];
  slots.forEach((t, i) => {
    if (!t) return;
    if ((t === 3 || t === 7) && i > 0 && slots[i - 1] && out.length && out[out.length - 1][out[out.length - 1].length - 1] === i - 1) {
      out[out.length - 1].push(i);
    } else {
      out.push([i]);
    }
  });
  return out;
}

// KERNEL.BIN's sections: [compressed size, size, type] u16 each, then a gzip member (ai_tool.py kernel_sections)
export function kernel_sections(d) {
  let i = 0;
  const out = [];
  while (i + 6 <= d.length) {
    const clen = d.readUInt16LE(i);
    i += 6;
    if (clen === 0) break;
    out.push(zlib.gunzipSync(d.subarray(i, i + clen)));
    i += clen;
  }
  return out;
}

export function is_kernel(d) {
  return d.length > 8 && d[6] === 0x1f && d[7] === 0x8b;
}

// {weapon: [Buffer...], armour: [Buffer...]} from a KERNEL.BIN (sections 6 and 7), or null.
export function read_kernel_records(kernel_path) {
  let secs;
  try {
    const d = fs.readFileSync(kernel_path);
    if (!is_kernel(d)) return null;
    secs = kernel_sections(d);
  } catch (e) {
    return null;
  }
  const out = {};
  for (const [kind, lay] of Object.entries(LAYOUT)) {
    const sec = secs[lay.kernel_index];
    if (sec === undefined) throw new PyIndexError('list index out of range');
    const n = Math.floor(sec.length / lay.size);
    out[kind] = [];
    for (let i = 0; i < n; i++) out[kind].push(sec.subarray(i * lay.size, (i + 1) * lay.size));
  }
  return out;
}

export function kernel_path(game_dir) {
  if (!game_dir) return null;
  const p = pyJoin(game_dir, 'data', 'lang-en', 'kernel', 'KERNEL.BIN');
  return pyIsfile(p) ? p : null;
}

function _base_index(kind, value) {
  const s = value;
  if (kind === WEAPON) return gc.parse_kernel_weapon(s, 0, s.length);
  let [ok, p, n] = grammar.parse_number(s, 0, s.length);
  if (!ok || p !== s.length) return null;
  if (n >= 256) n -= 256;
  return n < 32 ? n : null;
}

// What the record's slot bytes and growth byte will be. `keys`: the section's key lines in file order
// [{line, key, value, kind}] (outline rows; commented lines are skipped as the DLL skips them). Each slot and the
// growth carry where they come from.
export function model(kind, keys, kernel, kernel_from) {
  const lay = LAYOUT[kind];
  const rec = new Array(lay.size).fill(null);          // null: from the base
  const src = new Array(lay.size).fill(null);
  let base = null;
  const notes = [];
  for (const k of keys) {
    if (k.kind !== 'key' || !k.key) continue;
    const name = pyLower(k.key);
    const v = k.value || '';
    const line = k.line;
    if (name === 'base') {
      const b = _base_index(kind, v);
      if (b !== null) base = b;
    } else if (name === 'slots') {
      const cur = [];
      for (let i = 0; i < 8; i++) cur.push(rec[lay.slots + i]);
      const [nw, problem, written] = apply_slots_line(v, cur, lay.too_many);
      for (let i = 0; i < written; i++) {
        rec[lay.slots + i] = nw[i];
        src[lay.slots + i] = line;
      }
      if (problem) notes.push('line ' + line + ': ' + problem + ' (the slots before the mistake are written, the rest stay)');
    } else if (name === 'growth') {
      if (kind === WEAPON) {
        const [ok, p, n] = grammar.parse_number(v, 0, v.length);
        if (ok && p === v.length && n <= 255) {
          rec[lay.growth] = n;
          src[lay.growth] = line;
        }
      } else {
        const low = pyLower(v);
        if (ARMOUR_GROWTH_WORDS.indexOf(low) >= 0) {
          rec[lay.growth] = ARMOUR_GROWTH_WORDS.indexOf(low);
          src[lay.growth] = line;
        }
      }
    } else if (name.length === 7 && (name.slice(0, 5) === 'byte_' || name.slice(0, 5) === 'word_') &&
               /^[0-9a-f]*$/.test(name.slice(5))) {
      const size = name[0] === 'b' ? 1 : 2;
      const off = parseInt(name.slice(5), 16);
      const [ok, p, n] = grammar.parse_number(v, 0, v.length);
      if (off + size <= lay.size && ok && p === v.length && n <= (size === 1 ? 0xff : 0xffff)) {
        for (let i = 0; i < size; i++) {
          rec[off + i] = Math.floor(n / Math.pow(256, i)) & 0xff;
          src[off + i] = line;
          if ((lay.slots <= off + i && off + i < lay.slots + 8) || off + i === lay.growth) {
            notes.push('line ' + line + ': ' + k.key + ' writes ' +
                       (off + i === lay.growth ? 'the growth byte' : 'slot ' + (off + i - lay.slots + 1)) + ' directly');
          }
        }
      }
    }
  }
  let base_rec = null;
  if (base !== null && kernel && base < (kernel[kind] || []).length) base_rec = kernel[kind][base];
  const slots = [];
  const slot_src = [];
  for (let i = 0; i < 8; i++) {
    const o = lay.slots + i;
    if (rec[o] !== null) {
      slots.push(rec[o]);
      slot_src.push('line ' + src[o]);
    } else if (base_rec !== null) {
      slots.push(base_rec[o]);
      slot_src.push('base ' + base);
    } else {
      slots.push(null);
      slot_src.push('from the base');
    }
  }
  const g = lay.growth;
  let growth;
  let growth_src;
  if (rec[g] !== null) {
    growth = rec[g];
    growth_src = 'line ' + src[g];
  } else if (base_rec !== null) {
    growth = base_rec[g];
    growth_src = 'base ' + base;
  } else {
    growth = null;
    growth_src = 'from the base';
  }
  const known = slots.every(x => x !== null);
  const enc = known ? encode(slots) : [null, 'some slots come from the base, which is not known here'];
  return {
    kind, slots, slot_source: slot_src, growth,
    growth_name: growth !== null
      ? (GROWTH_NAMES.has(growth) ? GROWTH_NAMES.get(growth) : 'value ' + growth + ' (not one the menu names)') : null,
    growth_source: growth_src, base, kernel: base_rec !== null ? (kernel_from === undefined ? null : kernel_from) : null,
    groups: known ? groups(slots.map(x => x || 0)) : null,
    line: enc[0], line_problem: enc[1], notes,
    growth_words: kind === ARMOUR ? ARMOUR_GROWTH_WORDS : null,
  };
}
