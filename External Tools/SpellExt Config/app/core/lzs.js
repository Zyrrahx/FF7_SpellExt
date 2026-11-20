// FF7's LZS (sxcfg/kernels.py _lzs): a flag byte, then eight items, each a literal byte (flag bit 1) or a two-byte
// reference into a 4 KB ring that starts filled with zeros at 0xfee. Byte for byte the reference's loop, including its
// IndexError when a reference is cut in half at the end of the data.
// Node 22 language level.
import { PyIndexError } from './py.js';

// (review F2, minor 1) limit: refuse (an Error with code ELZSLIMIT) once the output passes that many bytes, at the
// reference's own check points; the output grows in a Buffer, not an array of numbers
export function lzs(d, limit) {
  const lim = limit === undefined || limit === null ? null : limit;
  let out = Buffer.alloc(Math.max(64, Math.min(d.length * 4, 1 << 20)));
  let n = 0;
  const put = (c) => {
    if (n >= out.length) {
      const bigger = Buffer.alloc(out.length * 2);
      out.copy(bigger, 0, 0, n);
      out = bigger;
    }
    out[n++] = c;
  };
  const over = () => Object.assign(new Error('an LZS stream past ' + lim + ' bytes'), { code: 'ELZSLIMIT' });
  const buf = new Uint8Array(4096);
  let bp = 0xfee;
  let i = 0;
  while (i < d.length) {
    if (lim !== null && n > lim) throw over();
    const flags = d[i];
    i += 1;
    for (let bit = 0; bit < 8; bit++) {
      if (i >= d.length) break;
      if ((flags >> bit) & 1) {
        const c = d[i];
        i += 1;
        put(c);
        buf[bp] = c;
        bp = (bp + 1) & 0xfff;
      } else {
        if (i + 1 >= d.length) throw new PyIndexError('index out of range');
        const a = d[i];
        const b = d[i + 1];
        i += 2;
        const off = a | ((b & 0xf0) << 4);
        for (let k = 0; k < (b & 0xf) + 3; k++) {
          const c = buf[(off + k) & 0xfff];
          put(c);
          buf[bp] = c;
          bp = (bp + 1) & 0xfff;
        }
      }
    }
  }
  if (lim !== null && n > lim) throw over();
  return Buffer.from(out.subarray(0, n));
}
