// (portrait panel, stage 2) A DDS file's header, and the part of its first picture the panel draws, decoded: sxcfg/dds.py, line for line (read its
// header for the forms read and the order of the refusals). Uncompressed RGB with or without alpha (32 and 24 bits) and BC7, decoded as stored.
// READ ONLY. Node 22 language level.
export const MAX_SIDE = 4096;
export const PIXELS = 16 << 20;              // 16 MB of RGBA, as the .tex budget
export const HEAD = 148;                     // the most of a header that is read (the DX10 extension included)
const DXGI_RGBA = [28, 29], DXGI_BGRA = [87, 91], DXGI_BGRX = [88, 93], DXGI_BC7 = [98, 99];
export const WHAT = 'a DDS form the preview does not read';

// A DDS the preview does not read: the reason, without the file's name
export class Bad extends Error {
  constructor(message) { super(message); this.name = 'Bad'; }
}

// A DDS whose picture is over the budget: size = [width, height]
export class Budget extends Bad {
  constructor(w, h) { super(w + ' x ' + h); this.name = 'Budget'; this.size = [w, h]; }
}

// ---- the header ----
const MASK_BYTE = new Map([[0xFF, 0], [0xFF00, 1], [0xFF0000, 2], [0xFF000000, 3]]);
const maskByte = m => (MASK_BYTE.has(m) ? MASK_BYTE.get(m) : null);

// The facts of a DDS from its first bytes `head` (at most HEAD are used) and the file's size: {width, height, kind ('bc7' or 'rgb'), bpp, order,
// offset, length, label}; throws Bad or Budget
export function header(head, size) {
  if (head.length < 128) throw new Bad('shorter than a DDS header');
  if (head.toString('latin1', 0, 4) !== 'DDS ') throw new Bad('not a DDS file');
  const u = off => head.readUInt32LE(off);
  const dw_size = u(4), flags = u(8), height = u(12), width = u(16), pitch = u(20), depth = u(24);
  const pf_size = u(76), pf_flags = u(80), fourcc = head.subarray(84, 88), bits = u(88), rm = u(92), gm = u(96), bm = u(100), am = u(104);
  const caps2 = u(112);
  if (dw_size !== 124) throw new Bad('its header size is ' + dw_size + ', not 124');
  if (pf_size !== 32) throw new Bad('its pixel format size is ' + pf_size + ', not 32');
  if (width === 0 || height === 0) throw new Bad('a side of 0');
  if (width > MAX_SIDE || height > MAX_SIDE) throw new Bad('a side over ' + MAX_SIDE + ' (' + width + ' x ' + height + ')');
  if (caps2 & 0x200) throw new Bad('a cube map');
  if ((caps2 & 0x200000) || ((flags & 0x800000) && depth > 1)) throw new Bad('a volume texture');
  let offset = 128, kind, bpp, order, label;
  if (pf_flags & 0x4) {
    if (fourcc.toString('latin1') === 'DX10') {
      if (head.length < HEAD) throw new Bad('its DX10 header is cut short');
      const dxgi = u(128), dim = u(132), misc = u(136), array = u(140);
      offset = HEAD;
      if (array !== 1) throw new Bad('an array of ' + array + ' textures');
      if (dim !== 3) throw new Bad('not a 2-D texture');
      if (misc & 0x4) throw new Bad('a cube map');
      if (DXGI_BC7.includes(dxgi)) { kind = 'bc7'; bpp = 0; order = null; label = 'BC7'; }
      else if (DXGI_RGBA.includes(dxgi)) { kind = 'rgb'; bpp = 4; order = [0, 1, 2, 3]; label = '32-bit with alpha'; }
      else if (DXGI_BGRA.includes(dxgi)) { kind = 'rgb'; bpp = 4; order = [2, 1, 0, 3]; label = '32-bit with alpha'; }
      else if (DXGI_BGRX.includes(dxgi)) { kind = 'rgb'; bpp = 4; order = [2, 1, 0, -1]; label = '32-bit, no alpha'; }
      else throw new Bad('DXGI format ' + dxgi);
    } else {
      throw new Bad('the form ' + [...fourcc].map(c => (c >= 32 && c < 127 ? String.fromCharCode(c) : '?')).join(''));
    }
  } else if (pf_flags & 0x40) {
    if (bits !== 24 && bits !== 32) throw new Bad(bits + ' bits a pixel');
    const r = maskByte(rm), g = maskByte(gm), b = maskByte(bm);
    const a = ((pf_flags & 0x1) && am) ? maskByte(am) : null;
    if (r === null || g === null || b === null || new Set([r, g, b]).size !== 3 || (am && (pf_flags & 0x1) && a === null)) {
      throw new Bad('colour masks that are not whole bytes');
    }
    if (bits === 24) {
      if (Math.max(r, g, b) > 2 || a !== null) throw new Bad('colour masks that do not fit 24 bits');
      kind = 'rgb'; bpp = 3; order = [r, g, b, -1]; label = '24-bit';
    } else {
      if (a !== null && (a === r || a === g || a === b)) throw new Bad('colour masks that overlap');
      kind = 'rgb'; bpp = 4; order = [r, g, b, a === null ? -1 : a]; label = a !== null ? '32-bit with alpha' : '32-bit, no alpha';
    }
  } else {
    throw new Bad('a pixel format that is not RGB or BC7');
  }
  if (4 * width * height > PIXELS) throw new Budget(width, height);
  let length;
  if (kind === 'bc7') {
    length = Math.ceil(width / 4) * Math.ceil(height / 4) * 16;
    if ((flags & 0x80000) && pitch && pitch !== length) throw new Bad('its stored size (' + pitch + ') is not the ' + length + ' its format needs');
  } else {
    length = width * height * bpp;
    if ((flags & 0x8) && pitch && pitch !== width * bpp) throw new Bad('its stored pitch (' + pitch + ') is not the ' + (width * bpp) + ' its format needs');
    if ((flags & 0x80000) && pitch && pitch !== length) throw new Bad('its stored size (' + pitch + ') is not the ' + length + ' its format needs');
  }
  if (offset + length > size) throw new Bad('cut short: its first level needs ' + (offset + length) + ' bytes, the file has ' + size);
  return { width, height, kind, bpp, order, offset, length, label };
}

// ---- BC7 ---------------------------------------------------------------------------------------------------------------------
// tables, read from ImageMagick's decoder with probe blocks (a one-off probe, not shipped): the subset of each of the 16 pixels of each partition, and the
// anchor pixel of subsets 1 (and 2) (subset 0's anchor is pixel 0)
const P2 = [
    '0011001100110011', '0001000100010001', '0111011101110111', '0001001100110111',
    '0000000100010011', '0011011101111111', '0001001101111111', '0000000100110111',
    '0000000000010011', '0011011111111111', '0000000101111111', '0000000000010111',
    '0001011111111111', '0000000011111111', '0000111111111111', '0000000000001111',
    '0000100011101111', '0111000100000000', '0000000010001110', '0111001100010000',
    '0011000100000000', '0000100011001110', '0000000010001100', '0111001100110001',
    '0011000100010000', '0000100010001100', '0110011001100110', '0011011001101100',
    '0001011111101000', '0000111111110000', '0111000110001110', '0011100110011100',
    '0101010101010101', '0000111100001111', '0101101001011010', '0011001111001100',
    '0011110000111100', '0101010110101010', '0110100101101001', '0101101010100101',
    '0111001111001110', '0001001111001000', '0011001001001100', '0011101111011100',
    '0110100110010110', '0011110011000011', '0110011010011001', '0000011001100000',
    '0100111001000000', '0010011100100000', '0000001001110010', '0000010011100100',
    '0110110010010011', '0011011011001001', '0110001110011100', '0011100111000110',
    '0110110011001001', '0110001100111001', '0111111010000001', '0001100011100111',
    '0000111100110011', '0011001111110000', '0010001011101110', '0100010001110111',
];
const P3 = [
    '0011001102212222', '0001001122112221', '0000200122112211', '0222002200110111',
    '0000000011221122', '0011001100220022', '0022002211111111', '0011001122112211',
    '0000000011112222', '0000111111112222', '0000111122222222', '0012001200120012',
    '0112011201120112', '0122012201220122', '0011011211221222', '0011200122002220',
    '0001001101121122', '0111001120012200', '0000112211221122', '0022002200221111',
    '0111011102220222', '0001000122212221', '0000001101220122', '0000110022102210',
    '0122012200110000', '0012001211222222', '0110122112210110', '0000011012211221',
    '0022110211020022', '0110011020022222', '0011012201220011', '0000200022112221',
    '0000000211221222', '0222002200120011', '0011001200220222', '0120012001200120',
    '0000111122220000', '0120120120120120', '0120201212010120', '0011220011220011',
    '0011112222000011', '0101010122222222', '0000000021212121', '0022112200221122',
    '0022001100220011', '0220122102201221', '0101222222220101', '0000212121212121',
    '0101010101012222', '0222011102220111', '0002111200021112', '0000211221122112',
    '0222011101110222', '0002111211120002', '0110011001102222', '0000000021122112',
    '0110011022222222', '0022001100110022', '0022112211220022', '0000000000002112',
    '0002000100020001', '0222122202221222', '0101222222222222', '0111201122012220',
];
const A2 = [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2, 15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15];
const A3 = [[3, 15], [3, 8], [15, 8], [15, 3], [8, 15], [3, 15], [15, 3], [15, 8], [8, 15], [8, 15], [6, 15], [6, 15], [6, 15], [5, 15], [3, 15], [3, 8], [3, 15], [3, 8], [8, 15], [15, 3], [3, 15], [3, 8], [6, 15], [10, 8], [5, 3], [8, 15], [8, 6], [6, 10], [8, 15], [5, 15], [15, 10], [15, 8], [8, 15], [15, 3], [3, 15], [5, 10], [6, 10], [10, 8], [8, 9], [15, 10], [15, 6], [3, 15], [15, 8], [5, 15], [15, 3], [15, 6], [15, 6], [15, 8], [3, 15], [15, 3], [5, 15], [5, 15], [5, 15], [8, 15], [5, 15], [10, 15], [5, 15], [10, 15], [8, 15], [13, 15], [15, 3], [12, 15], [3, 15], [3, 8]];

// [subsets, partition bits, rotation bits, index-selection bits, colour bits, alpha bits, p-bit kind (0 none, 1 per endpoint, 2 per subset),
//  index bits, second index bits]
export const TABLES = { P2, P3, A2, A3 };       // (tests: the tables as ImageMagick's decoder gave them)
const MODES = [[3, 4, 0, 0, 4, 0, 1, 3, 0], [2, 6, 0, 0, 6, 0, 2, 3, 0], [3, 6, 0, 0, 5, 0, 0, 2, 0], [2, 6, 0, 0, 7, 0, 1, 2, 0],
               [1, 0, 2, 1, 5, 6, 0, 2, 3], [1, 0, 2, 0, 7, 8, 0, 2, 2], [1, 0, 0, 0, 7, 7, 1, 4, 0], [2, 6, 0, 0, 5, 5, 1, 2, 0]];
const WEIGHTS = { 2: [0, 21, 43, 64], 3: [0, 9, 18, 27, 37, 46, 55, 64], 4: [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64] };
const INVALID = new Uint8Array(64);

const expand = (v, n) => ((v << (8 - n)) | (v >> (2 * n - 8))) & 0xFF;

// n bits of a block at bit position pos (little-endian bit order)
function getbits(b, pos, n) {
  let v = 0;
  for (let i = 0; i < n; i++) {
    const p = pos + i;
    v |= (((b[p >> 3] || 0) >> (p & 7)) & 1) << i;
  }
  return v;
}

// 16 bytes of a BC7 block -> 64 bytes: its 4 x 4 pixels as RGBA, row by row, as stored (no sRGB conversion)
export function decode_block(blk) {
  let mode = 0;
  while (mode < 8 && !((blk[0] >> mode) & 1)) mode += 1;
  if (mode >= 8) return INVALID;
  const [ns, pbits, rbits, sbits, cb, ab, pk, n1, n2] = MODES[mode];
  let pos = mode + 1;
  const part = getbits(blk, pos, pbits); pos += pbits;
  const rot = getbits(blk, pos, rbits); pos += rbits;
  const isel = sbits ? getbits(blk, pos, 1) : 0; pos += sbits;
  const ne = ns * 2;
  const ep = [];
  for (let e = 0; e < ne; e++) ep.push([0, 0, 0, 255]);
  for (let ch = 0; ch < 3; ch++) for (let e = 0; e < ne; e++) { ep[e][ch] = getbits(blk, pos, cb); pos += cb; }
  if (ab) for (let e = 0; e < ne; e++) { ep[e][3] = getbits(blk, pos, ab); pos += ab; }
  if (pk === 1) {
    for (let e = 0; e < ne; e++) {
      const p = getbits(blk, pos, 1); pos += 1;
      for (let ch = 0; ch < 3; ch++) ep[e][ch] = (ep[e][ch] << 1) | p;
      if (ab) ep[e][3] = (ep[e][3] << 1) | p;
    }
  } else if (pk === 2) {
    for (let s = 0; s < ns; s++) {
      const p = getbits(blk, pos, 1); pos += 1;
      for (const e of [2 * s, 2 * s + 1]) for (let ch = 0; ch < 3; ch++) ep[e][ch] = (ep[e][ch] << 1) | p;
    }
  }
  const pc = cb + (pk ? 1 : 0);
  const pa = ab + (pk && ab ? 1 : 0);
  for (let e = 0; e < ne; e++) {
    for (let ch = 0; ch < 3; ch++) ep[e][ch] = expand(ep[e][ch], pc);
    if (ab) ep[e][3] = expand(ep[e][3], pa);
  }
  let subset, anchors;
  if (ns === 1) { subset = '0000000000000000'; anchors = [0]; }
  else if (ns === 2) { subset = P2[part]; anchors = [0, A2[part]]; }
  else { subset = P3[part]; anchors = [0, A3[part][0], A3[part][1]]; }
  const idx1 = new Array(16).fill(0);
  for (let i = 0; i < 16; i++) {
    const s = subset.charCodeAt(i) - 48;
    const nb = i === anchors[s] ? n1 - 1 : n1;
    idx1[i] = getbits(blk, pos, nb);
    pos += nb;
  }
  let idx2 = null;
  if (n2) {
    idx2 = new Array(16).fill(0);
    for (let i = 0; i < 16; i++) {
      const nb = i === 0 ? n2 - 1 : n2;
      idx2[i] = getbits(blk, pos, nb);
      pos += nb;
    }
  }
  const out = new Uint8Array(64);
  const wc = WEIGHTS[!idx2 ? n1 : (isel ? n2 : n1)];
  const wa = !idx2 ? wc : WEIGHTS[isel ? n1 : n2];
  const ci = !idx2 ? idx1 : (isel ? idx2 : idx1);
  const ai = !idx2 ? idx1 : (isel ? idx1 : idx2);
  for (let i = 0; i < 16; i++) {
    const s = subset.charCodeAt(i) - 48;
    const e0 = ep[2 * s], e1 = ep[2 * s + 1];
    let w = wc[ci[i]];
    const x = [0, 0, 0, 0];
    for (let ch = 0; ch < 3; ch++) x[ch] = ((64 - w) * e0[ch] + w * e1[ch] + 32) >> 6;
    w = wa[ai[i]];
    x[3] = ((64 - w) * e0[3] + w * e1[3] + 32) >> 6;
    if (rot) { const t = x[rot - 1]; x[rot - 1] = x[3]; x[3] = t; }
    out[i * 4] = x[0]; out[i * 4 + 1] = x[1]; out[i * 4 + 2] = x[2]; out[i * 4 + 3] = x[3];
  }
  return out;
}

// ---- the pixels ----
// The top-left rw x rh pixels of the first level as RGBA bytes (rw x rh x 4). `fetch(offset, n)` returns n bytes of the file at `offset` (fewer when the
// file is shorter than it was: Bad). Only the rows, and for BC7 only the blocks, that cover the part are read.
export function decode(info, fetch, rw, rh) {
  const w = info.width, h = info.height;
  rw = Math.max(1, Math.min(rw, w));
  rh = Math.max(1, Math.min(rh, h));
  const base = info.offset;
  const out = Buffer.alloc(rw * rh * 4);
  if (info.kind === 'bc7') {
    const bpr = Math.ceil(w / 4);
    const cols = Math.ceil(rw / 4), rows = Math.ceil(rh / 4);
    for (let by = 0; by < rows; by++) {
      const data = fetch(base + by * bpr * 16, cols * 16);
      if (data.length !== cols * 16) throw new Bad('could not be read');
      for (let bx = 0; bx < cols; bx++) {
        const px = decode_block(data.subarray(bx * 16, bx * 16 + 16));
        const n = Math.min(4, rw - bx * 4);
        for (let py = 0; py < Math.min(4, rh - by * 4); py++) {
          const y = by * 4 + py;
          out.set(px.subarray(py * 16, py * 16 + n * 4), (y * rw + bx * 4) * 4);
        }
      }
    }
    return out;
  }
  const bpp = info.bpp, order = info.order;
  for (let y = 0; y < rh; y++) {
    const row = fetch(base + y * w * bpp, rw * bpp);
    if (row.length !== rw * bpp) throw new Bad('could not be read');
    let o = y * rw * 4;
    for (let x = 0; x < rw; x++) {
      for (let ch = 0; ch < 4; ch++) out[o + ch] = order[ch] >= 0 ? row[x * bpp + order[ch]] : 255;
      o += 4;
    }
  }
  return out;
}
