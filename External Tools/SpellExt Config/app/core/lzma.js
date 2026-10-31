// A raw LZMA1 decoder, written from the LZMA specification (Igor Pavlov's lzma-specification.txt: the range
// decoder, the literal / match / rep states, the length and distance coders), for the .iro archives 7th Heaven
// writes: an entry with flag 2 holds [u32 decompressed size][u32 properties size][properties][raw LZMA1 stream].
//
// It answers as Python's lzma module does for kernels.iro_read:
//   decode_props(props)            lzma._decode_filter_properties(FILTER_LZMA1, props): 5 bytes, lc/lp/pb in the first
//                                  (lc + lp at most 4, as liblzma's raw LZMA1 decoder wants), the dictionary size after
//   decompress(props, data, limit) LZMADecompressor(FORMAT_RAW, [filter]).decompress(data, limit): at most `limit`
//                                  bytes; the output so far when the data ends early (never an error then); an end
//                                  marker ends it (the range coder must then be at 0); "Corrupt input data" for a
//                                  first byte that is not 0 or a distance beyond what is decoded (and beyond the
//                                  dictionary, liblzma's size: at least 4096, a multiple of 16)
// Proved by tests/run_diff.js against Python's lzma on every entry of the New Threat .iro, packed with LZMA by the
// oracle (no archive on this machine holds an LZMA entry of its own), and on cut and corrupted streams.
// Node 22 language level.

export class LZMAError extends Error {
  constructor(message) { super(message); this.name = 'LZMAError'; }
}
const OPTIONS = 'Invalid or unsupported options';
const CORRUPT = 'Corrupt input data';

export function decode_props(props) {
  if (props.length !== 5) throw new LZMAError(OPTIONS);
  let d = props[0];
  if (d > (4 * 5 + 4) * 9 + 8) throw new LZMAError(OPTIONS);
  const lc = d % 9;
  d = Math.floor(d / 9);
  const lp = d % 5;
  const pb = Math.floor(d / 5);
  const dict_size = (props[1] | (props[2] << 8) | (props[3] << 16) | (props[4] << 24)) >>> 0;
  return { lc, lp, pb, dict_size };
}

// thrown inside when the input runs out: the output so far is the answer
const MORE = { more: true };

const K_TOP = 1 << 24;
const PROB_INIT = 1024;

class RangeDecoder {
  constructor(data) {
    this.data = data;
    this.pos = 0;
    this.range = 0xffffffff;
    this.code = 0;
    // the five bytes of the start: the first must be 0
    for (let k = 0; k < 5; k++) {
      if (this.pos >= data.length) throw MORE;
      const b = data[this.pos++];
      if (k === 0 && b !== 0) throw new LZMAError(CORRUPT);
      this.code = ((this.code << 8) | b) >>> 0;
    }
  }

  normalize() {
    if (this.range < K_TOP) {
      if (this.pos >= this.data.length) throw MORE;
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.data[this.pos++]) >>> 0;
    }
  }

  bit(probs, i) {
    this.normalize();
    const p = probs[i];
    const bound = (this.range >>> 11) * p;
    if (this.code < bound) {
      this.range = bound;
      probs[i] = p + ((2048 - p) >>> 5);
      return 0;
    }
    this.range = (this.range - bound) >>> 0;
    this.code = (this.code - bound) >>> 0;
    probs[i] = p - (p >>> 5);
    return 1;
  }

  direct(n) {
    let r = 0;
    for (let k = 0; k < n; k++) {
      this.normalize();
      this.range = this.range >>> 1;
      let b = 0;
      if (this.code >= this.range) {
        this.code = (this.code - this.range) >>> 0;
        b = 1;
      }
      r = ((r << 1) | b) >>> 0;
    }
    return r;
  }

  tree(probs, base, bits) {
    let m = 1;
    for (let k = 0; k < bits; k++) m = (m << 1) | this.bit(probs, base + m);
    return m - (1 << bits);
  }

  reverse(probs, base, bits) {
    let m = 1;
    let r = 0;
    for (let k = 0; k < bits; k++) {
      const b = this.bit(probs, base + m);
      m = (m << 1) | b;
      r |= b << k;
    }
    return r;
  }
}

const probs = n => new Uint16Array(n).fill(PROB_INIT);

class LenDecoder {
  constructor() {
    this.choice = probs(2);
    this.low = probs(16 * 8);
    this.mid = probs(16 * 8);
    this.high = probs(256);
  }

  decode(rc, ps) {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, ps * 8, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, ps * 8, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

// [lc, lp, pb, dict_size] from decode_props; `data` the stream; at most `limit` bytes out
export function decompress(props, data, limit) {
  const { lc, lp, pb, dict_size } = typeof props.lc === 'number' ? props : decode_props(props);
  if (lc + lp > 4) throw new LZMAError(OPTIONS);
  if (limit === undefined || limit === null || limit < 0) limit = Infinity;
  let dict_eff = dict_size < 4096 ? 4096 : dict_size;
  dict_eff = Math.floor((dict_eff + 15) / 16) * 16;
  let out = Buffer.alloc(Math.min(limit === Infinity ? 1 << 16 : limit, 1 << 24));
  let n = 0;
  const put = (c) => {
    if (n >= out.length) {
      const bigger = Buffer.alloc(Math.min(out.length * 2, limit === Infinity ? out.length * 2 : Math.max(limit, out.length + 1)));
      out.copy(bigger, 0, 0, n);
      out = bigger;
    }
    out[n++] = c;
  };
  const lit = probs(0x300 << (lc + lp));
  const is_match = probs(12 << 4);
  const is_rep = probs(12);
  const is_rep0 = probs(12);
  const is_rep1 = probs(12);
  const is_rep2 = probs(12);
  const is_rep0_long = probs(12 << 4);
  const pos_slot = probs(4 << 6);
  const pos_special = probs(1 + 114);
  const align = probs(16);
  const len_dec = new LenDecoder();
  const rep_len_dec = new LenDecoder();
  const pb_mask = (1 << pb) - 1;
  const lp_mask = (1 << lp) - 1;
  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;
  const full = () => Math.min(n, dict_eff);
  const back = (dist) => out[n - dist - 1];
  let rc;
  try {
    rc = new RangeDecoder(data);
    for (;;) {
      // when the output is full at a symbol's start, liblzma (the stream's size not known) still decodes that symbol,
      // to find an end marker, with every check; it stops where the symbol would write
      const full_out = n >= limit;
      const ps = n & pb_mask;
      if (rc.bit(is_match, (state << 4) + ps) === 0) {
        // a literal
        const prev = n ? out[n - 1] : 0;
        const base = 0x300 * (((n & lp_mask) << lc) + (prev >> (8 - lc)));
        let sym = 1;
        if (state >= 7) {
          let mb = back(rep0);
          do {
            const m = (mb >> 7) & 1;
            mb = (mb << 1) & 0xff;
            const b = rc.bit(lit, base + ((1 + m) << 8) + sym);
            sym = (sym << 1) | b;
            if (m !== b) break;
          } while (sym < 0x100);
        }
        while (sym < 0x100) sym = (sym << 1) | rc.bit(lit, base + sym);
        if (full_out) break;
        put(sym & 0xff);
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
        continue;
      }
      let len;
      if (rc.bit(is_rep, state) === 1) {
        if (full() === 0) throw new LZMAError(CORRUPT);
        if (rc.bit(is_rep0, state) === 0) {
          if (rc.bit(is_rep0_long, (state << 4) + ps) === 0) {
            // a short rep: one byte from rep0
            state = state < 7 ? 9 : 11;
            if (full_out) break;
            put(back(rep0));
            continue;
          }
        } else {
          let dist;
          if (rc.bit(is_rep1, state) === 0) {
            dist = rep1;
          } else {
            if (rc.bit(is_rep2, state) === 0) {
              dist = rep2;
            } else {
              dist = rep3;
              rep3 = rep2;
            }
            rep2 = rep1;
          }
          rep1 = rep0;
          rep0 = dist;
        }
        len = rep_len_dec.decode(rc, ps);
        state = state < 7 ? 8 : 11;
      } else {
        rep3 = rep2;
        rep2 = rep1;
        rep1 = rep0;
        len = len_dec.decode(rc, ps);
        state = state < 7 ? 7 : 10;
        const slot = rc.tree(pos_slot, (len < 4 ? len : 3) << 6, 6);
        let dist;
        if (slot < 4) {
          dist = slot;
        } else {
          const nd = (slot >> 1) - 1;
          dist = ((2 | (slot & 1)) << nd) >>> 0;
          if (slot < 14) {
            dist = (dist + rc.reverse(pos_special, dist - slot, nd)) >>> 0;
          } else {
            dist = (dist + ((rc.direct(nd - 4) << 4) >>> 0)) >>> 0;
            dist = (dist + rc.reverse(align, 0, 4)) >>> 0;
          }
        }
        rep0 = dist;
        if (rep0 === 0xffffffff) {
          // the end marker: the range coder must end at 0
          rc.normalize();
          if (rc.code !== 0) throw new LZMAError(CORRUPT);
          break;
        }
        if (rep0 >= full()) throw new LZMAError(CORRUPT);
      }
      if (full_out) break;
      len += 2;
      while (len > 0 && n < limit) {
        put(back(rep0));
        len--;
      }
      if (len > 0) break;                // the output is full inside a match: the rest stays pending
    }
  } catch (e) {
    if (e !== MORE) throw e;
  }
  return Buffer.from(out.subarray(0, n));
}
