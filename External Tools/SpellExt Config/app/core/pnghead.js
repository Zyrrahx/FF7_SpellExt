// (portrait panel, stage 1) A PNG's HEADER-LEVEL verdict, in the DLL's own words, without decoding anything (sxcfg/pnghead.py,
// line for line; see it for the DLL's rules). Reads only the 8 bytes that begin each chunk and the 13 of IHDR; a file of
// 64 MiB or more is not read at all (convert_png's rule: "could not be read"). READ ONLY. Node 22 language level.
import fs from 'node:fs';

export const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const DLL_FILE_LIMIT = 64 << 20;
export const MAX_SIDE = 2048;
export const MAX_CHUNKS = 20000;

export const WHY_READ = 'could not be read';
export const WHY_NOT_PNG = 'not a PNG file';
export const WHY_DAMAGED = 'damaged PNG file';
export const WHY_INTERLACED = 'interlaced PNG files are not supported; save it without interlacing';
export const WHY_16BIT = '16-bit PNG files are not supported; save it as 8 bits per channel';
export const WHY_SIZE = 'the image is too large (or empty)';
export const WHY_KIND = 'this kind of PNG is not supported';
export const WHY_NOT_REGULAR = 'not a regular file: not read';      // a FIFO, a device, a socket: never opened (an open of a FIFO blocks for ever)

// open without waiting: a backstop for a file swapped for a FIFO after the check (O_NONBLOCK is undefined on Windows: `| undefined` is 0)
export const openNonblocking = path => fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);

function result(size, why, kw) {
  return Object.assign({ size, ok: why === null, why, width: 0, height: 0, depth: 0, type: 0, alpha: false, partial: false,
                         checked: why === null ? 'header' : 'none' }, kw || {});
}

export function inspect(path) {
  let size;
  try {
    const st = fs.statSync(path);
    if (!st.isFile()) return result(0, WHY_NOT_REGULAR);
    size = st.size;
  } catch (e) {
    return result(0, WHY_READ);
  }
  if (size >= DLL_FILE_LIMIT) return result(size, WHY_READ);
  let fd;
  try {
    fd = openNonblocking(path);
    return walk(fd, size);
  } catch (e) {
    return result(size, WHY_READ);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readAt(fd, pos, n) {
  const buf = Buffer.alloc(n);
  let got = 0;
  while (got < n) {
    const k = fs.readSync(fd, buf, got, n - got, pos + got);
    if (!k) break;
    got += k;
  }
  return buf.subarray(0, got);
}

export function walk(fd, size) {
  if (size < 8) return result(size, WHY_NOT_PNG);
  if (!readAt(fd, 0, 8).equals(SIGNATURE)) return result(size, WHY_NOT_PNG);
  let w = 0, h = 0, depth = 0, typ = 0, haveHeader = false, packed = 0, alphaTrns = false, pos = 8, chunks = 0, partial = false;
  while (pos + 12 <= size) {
    if (chunks >= MAX_CHUNKS) { partial = true; break; }
    chunks += 1;
    const head = readAt(fd, pos, 8);
    if (head.length < 8) return result(size, WHY_DAMAGED);
    const csize = head.readUInt32BE(0);
    const tag = head.readUInt32BE(4);
    if (csize > size - pos - 12) return result(size, WHY_DAMAGED);
    if (tag === 0x49484452 && csize >= 13) {
      const body = readAt(fd, pos + 8, 13);
      w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; typ = body[9];
      haveHeader = true;
      if (body[12]) return result(size, WHY_INTERLACED);
      if (depth === 16) return result(size, WHY_16BIT);
      if (!w || !h || w > MAX_SIDE || h > MAX_SIDE) return result(size, WHY_SIZE);
    } else if (tag === 0x74524e53) {
      alphaTrns = alphaTrns || (typ === 3 && csize > 0) || (typ === 0 && csize >= 2);
    } else if (tag === 0x49444154) {
      packed += csize;
    } else if (tag === 0x49454e44) {
      break;
    }
    pos += csize + 12;
  }
  if (!haveHeader || (packed < 3 && !partial)) return result(size, WHY_DAMAGED);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[typ] || 0;
  if (!channels || (depth !== 8 && !(depth < 8 && (typ === 0 || typ === 3))) || ![1, 2, 4, 8].includes(depth)) return result(size, WHY_KIND);
  const alpha = typ === 4 || typ === 6 || alphaTrns;
  return result(size, null, { width: w, height: h, depth, type: typ, alpha, partial });
}

// ---- (stage 2) an FFNx replacement .png: FFNx reads any PNG its loader takes (16-bit, interlaced, any size), so none of the DLL's words
// apply; only what the preview can draw is judged, from the first 33 bytes and the file's size (sxcfg/pnghead.py `dims`) ----
export const REPL_FILE_LIMIT = 16 << 20;
export const REPL_PIXELS = 16 << 20;

export function dims(path) {
  const res = (size, why, w = 0, h = 0) => ({ size, ok: why === null, why, width: w, height: h });
  let size;
  try {
    const st = fs.statSync(path);
    if (!st.isFile()) return res(0, WHY_NOT_REGULAR);
    size = st.size;
  } catch (e) {
    return res(0, WHY_READ);
  }
  if (size >= REPL_FILE_LIMIT) return res(size, size + ' bytes, more than the preview draws (16 MiB)');
  let fd, head;
  try {
    fd = openNonblocking(path);
    head = readAt(fd, 0, 33);
  } catch (e) {
    return res(size, WHY_READ);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (head.length < 33 || !head.subarray(0, 8).equals(SIGNATURE)) return res(size, WHY_NOT_PNG);
  if (head.readUInt32BE(8) < 13 || head.readUInt32BE(12) !== 0x49484452) return res(size, 'its first chunk is not an IHDR');
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  if (!w || !h) return res(size, 'a side of 0');
  if (4 * w * h > REPL_PIXELS) return res(size, w + ' x ' + h + ' is more than the preview draws (16 MB of pixels)', w, h);
  return res(size, null, w, h);
}
