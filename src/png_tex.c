/* png_tex.c - turns a PNG image into an FF7 .tex texture (8-bit, 256-colour
   palette), with no library. Included by spellext.c; also built on its own by
   tools/png_test.c so the image code can be tested outside the game.

   The includer defines:  PX_ALLOC(bytes) -> zeroed memory or NULL,  PX_FREE(pointer). */

typedef unsigned char px_u8;
typedef unsigned short px_u16;
typedef unsigned int px_u32;

#define PX_MAX_SIDE 2048

/* ---- inflate (RFC 1951), in the style of zlib's puff.c ---- */

struct px_bits {
    const px_u8 *in;
    px_u32 in_len, in_pos;
    px_u8 *out;
    px_u32 out_len, out_pos;
    px_u32 hold;
    int count, error;
};

static int px_get(struct px_bits *s, int need)
{
    px_u32 value = s->hold;

    while (s->count < need) {
        if (s->in_pos == s->in_len) {
            s->error = 1;
            return 0;
        }
        value |= (px_u32)s->in[s->in_pos++] << s->count;
        s->count += 8;
    }
    s->hold = value >> need;
    s->count -= need;
    return (int)(value & ((1u << need) - 1));
}

struct px_huffman {
    px_u16 count[16];       /* number of codes of each length */
    px_u16 symbol[288];     /* symbols ordered by code */
};

static int px_decode(struct px_bits *s, const struct px_huffman *h)
{
    int code = 0, first = 0, index = 0, length;

    for (length = 1; length <= 15; length++) {
        int count = h->count[length];

        code |= px_get(s, 1);
        if (s->error)
            return -1;
        if (code - count < first)
            return h->symbol[index + (code - first)];
        index += count;
        first += count;
        first <<= 1;
        code <<= 1;
    }
    s->error = 1;
    return -1;
}

/* Builds a decoding table from code lengths. Returns 0 if the set of lengths is usable. */
static int px_build(struct px_huffman *h, const px_u16 *lengths, int n)
{
    px_u16 offsets[16];
    int symbol, length, left = 1;

    for (length = 0; length <= 15; length++)
        h->count[length] = 0;
    for (symbol = 0; symbol < n; symbol++)
        h->count[lengths[symbol]]++;
    if (h->count[0] == n)
        return 0;
    for (length = 1; length <= 15; length++) {
        left <<= 1;
        left -= h->count[length];
        if (left < 0)
            return -1;
    }
    offsets[1] = 0;
    for (length = 1; length < 15; length++)
        offsets[length + 1] = (px_u16)(offsets[length] + h->count[length]);
    for (symbol = 0; symbol < n; symbol++)
        if (lengths[symbol])
            h->symbol[offsets[lengths[symbol]]++] = (px_u16)symbol;
    return left;    /* 0 complete, >0 incomplete */
}

static void px_codes(struct px_bits *s, const struct px_huffman *lencode, const struct px_huffman *distcode)
{
    static const px_u16 length_base[29] = { 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59,
                                            67, 83, 99, 115, 131, 163, 195, 227, 258 };
    static const px_u16 length_extra[29] = { 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4,
                                             5, 5, 5, 5, 0 };
    static const px_u16 dist_base[30] = { 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
                                          769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 };
    static const px_u16 dist_extra[30] = { 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
                                           11, 11, 12, 12, 13, 13 };

    while (!s->error) {
        int symbol = px_decode(s, lencode);

        if (symbol < 0)
            return;
        if (symbol < 256) {
            if (s->out_pos == s->out_len) {
                s->error = 1;
                return;
            }
            s->out[s->out_pos++] = (px_u8)symbol;
        } else if (symbol == 256) {
            return;
        } else {
            px_u32 length, distance;

            symbol -= 257;
            if (symbol >= 29) {
                s->error = 1;
                return;
            }
            length = length_base[symbol] + (px_u32)px_get(s, length_extra[symbol]);
            symbol = px_decode(s, distcode);
            if (symbol < 0 || symbol >= 30) {
                s->error = 1;
                return;
            }
            distance = dist_base[symbol] + (px_u32)px_get(s, dist_extra[symbol]);
            if (s->error || distance > s->out_pos || s->out_pos + length > s->out_len) {
                s->error = 1;
                return;
            }
            for (; length; length--, s->out_pos++)
                s->out[s->out_pos] = s->out[s->out_pos - distance];
        }
    }
}

/* Inflates a raw deflate stream. Returns the number of bytes produced, or -1. */
static int px_inflate(const px_u8 *in, px_u32 in_len, px_u8 *out, px_u32 out_len)
{
    static const px_u16 order[19] = { 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 };
    struct px_bits s;
    struct px_huffman *lencode, *distcode;
    px_u16 *lengths;
    int last, result = -1;

    lencode = PX_ALLOC(2 * sizeof *lencode + 320 * sizeof *lengths);
    if (!lencode)
        return -1;
    distcode = lencode + 1;
    lengths = (px_u16 *)(lencode + 2);
    s.in = in, s.in_len = in_len, s.in_pos = 0;
    s.out = out, s.out_len = out_len, s.out_pos = 0;
    s.hold = 0, s.count = 0, s.error = 0;
    do {
        int type, i;

        last = px_get(&s, 1);
        type = px_get(&s, 2);
        if (s.error)
            break;
        if (type == 0) {
            px_u32 length;

            s.hold = 0, s.count = 0;
            if (s.in_pos + 4 > s.in_len)
                break;
            length = s.in[s.in_pos] | (px_u32)s.in[s.in_pos + 1] << 8;
            if ((length ^ 0xffff) != (s.in[s.in_pos + 2] | (px_u32)s.in[s.in_pos + 3] << 8))
                break;
            s.in_pos += 4;
            if (s.in_pos + length > s.in_len || s.out_pos + length > s.out_len)
                break;
            for (; length; length--)
                s.out[s.out_pos++] = s.in[s.in_pos++];
        } else if (type == 1) {
            for (i = 0; i < 144; i++) lengths[i] = 8;
            for (; i < 256; i++) lengths[i] = 9;
            for (; i < 280; i++) lengths[i] = 7;
            for (; i < 288; i++) lengths[i] = 8;
            px_build(lencode, lengths, 288);
            for (i = 0; i < 30; i++) lengths[i] = 5;
            px_build(distcode, lengths, 30);
            px_codes(&s, lencode, distcode);
        } else if (type == 2) {
            int nlen = px_get(&s, 5) + 257, ndist = px_get(&s, 5) + 1, ncode = px_get(&s, 4) + 4, index;

            if (s.error || nlen > 286 || ndist > 30)
                break;
            for (index = 0; index < ncode; index++)
                lengths[order[index]] = (px_u16)px_get(&s, 3);
            for (; index < 19; index++)
                lengths[order[index]] = 0;
            if (px_build(lencode, lengths, 19) != 0)
                break;
            for (index = 0; index < nlen + ndist && !s.error;) {
                int symbol = px_decode(&s, lencode), repeat, value = 0;

                if (symbol < 0)
                    break;
                if (symbol < 16) {
                    lengths[index++] = (px_u16)symbol;
                    continue;
                }
                if (symbol == 16) {
                    if (!index)
                        break;
                    value = lengths[index - 1];
                    repeat = 3 + px_get(&s, 2);
                } else if (symbol == 17) {
                    repeat = 3 + px_get(&s, 3);
                } else {
                    repeat = 11 + px_get(&s, 7);
                }
                if (index + repeat > nlen + ndist)
                    break;
                while (repeat--)
                    lengths[index++] = (px_u16)value;
            }
            if (s.error || index != nlen + ndist || !lengths[256])
                break;
            if (px_build(lencode, lengths, nlen) < 0)
                break;
            if (px_build(distcode, lengths + nlen, ndist) < 0)
                break;
            px_codes(&s, lencode, distcode);
        } else {
            break;
        }
        if (s.error)
            break;
        if (last)
            result = (int)s.out_pos;
    } while (!last);
    PX_FREE(lencode);
    return result;
}

/* ---- PNG ---- */

static px_u32 px_be32(const px_u8 *p)
{
    return (px_u32)p[0] << 24 | (px_u32)p[1] << 16 | (px_u32)p[2] << 8 | p[3];
}

static int px_paeth(int a, int b, int c)
{
    int p = a + b - c, pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;

    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/* Decodes a PNG into 8-bit RGBA. Returns NULL (and a reason) for anything it
   does not handle: interlaced files and 16-bit samples. */
static px_u8 *px_decode_png(const px_u8 *data, px_u32 len, px_u32 *width, px_u32 *height, const char **why)
{
    static const px_u8 signature[8] = { 0x89, 'P', 'N', 'G', 13, 10, 26, 10 };
    static px_u8 palette[256 * 4];      /* static: keeps the stack frame small */
    px_u8 *packed = NULL, *raw = NULL, *rgba = NULL;
    px_u32 pos, packed_len = 0, w = 0, h = 0, row_bytes, x, y;
    int depth = 0, type = 0, channels, bpp, have_header = 0, i, palette_count = 0, key = -1;

    *why = "not a PNG file";
    if (len < 8)
        return NULL;
    for (i = 0; i < 8; i++)
        if (data[i] != signature[i])
            return NULL;
    for (i = 0; i < 256; i++)
        palette[i * 4] = palette[i * 4 + 1] = palette[i * 4 + 2] = 0, palette[i * 4 + 3] = 255;
    packed = PX_ALLOC(len);
    *why = "out of memory";
    if (!packed)
        return NULL;
    *why = "damaged PNG file";
    for (pos = 8; pos + 12 <= len;) {
        px_u32 size = px_be32(data + pos), tag = px_be32(data + pos + 4);
        const px_u8 *body = data + pos + 8;

        if (size > len - pos - 12)
            goto fail;
        if (tag == 0x49484452 && size >= 13) {                  /* IHDR */
            w = px_be32(body), h = px_be32(body + 4);
            depth = body[8], type = body[9];
            have_header = 1;
            if (body[12]) {
                *why = "interlaced PNG files are not supported; save it without interlacing";
                goto fail;
            }
            if (depth == 16) {
                *why = "16-bit PNG files are not supported; save it as 8 bits per channel";
                goto fail;
            }
            if (!w || !h || w > PX_MAX_SIDE || h > PX_MAX_SIDE) {
                *why = "the image is too large (or empty)";
                goto fail;
            }
        } else if (tag == 0x504c5445) {                         /* PLTE */
            palette_count = (int)(size / 3);
            for (i = 0; i < palette_count && i < 256; i++) {
                palette[i * 4] = body[i * 3];
                palette[i * 4 + 1] = body[i * 3 + 1];
                palette[i * 4 + 2] = body[i * 3 + 2];
            }
        } else if (tag == 0x74524e53) {                         /* tRNS */
            if (type == 3)
                for (i = 0; i < (int)size && i < 256; i++)
                    palette[i * 4 + 3] = body[i];
            else if (type == 0 && size >= 2)
                key = body[1];
        } else if (tag == 0x49444154) {                         /* IDAT */
            for (x = 0; x < size; x++)
                packed[packed_len++] = body[x];
        } else if (tag == 0x49454e44) {                         /* IEND */
            break;
        }
        pos += size + 12;
    }
    if (!have_header || packed_len < 3)
        goto fail;
    channels = type == 0 ? 1 : type == 2 ? 3 : type == 3 ? 1 : type == 4 ? 2 : type == 6 ? 4 : 0;
    if (!channels || (depth != 8 && !(depth < 8 && (type == 0 || type == 3))) ||
        (depth != 1 && depth != 2 && depth != 4 && depth != 8)) {
        *why = "this kind of PNG is not supported";
        goto fail;
    }
    bpp = depth == 8 ? channels : 1;
    row_bytes = (w * (px_u32)channels * (px_u32)depth + 7) / 8;
    raw = PX_ALLOC(h * (row_bytes + 1) + 8);
    rgba = PX_ALLOC(w * h * 4);
    *why = "out of memory";
    if (!raw || !rgba)
        goto fail;
    *why = "damaged PNG file";
    /* skip the 2-byte zlib header; the checksum at the end is not checked */
    if (px_inflate(packed + 2, packed_len - 2, raw, h * (row_bytes + 1)) != (int)(h * (row_bytes + 1)))
        goto fail;
    for (y = 0; y < h; y++) {
        px_u8 *line = raw + y * (row_bytes + 1) + 1, *above = y ? line - (row_bytes + 1) : NULL;
        int filter = line[-1];

        for (x = 0; x < row_bytes; x++) {
            int a = x >= (px_u32)bpp ? line[x - bpp] : 0, b = above ? above[x] : 0;
            int c = above && x >= (px_u32)bpp ? above[x - bpp] : 0;

            switch (filter) {
            case 0: break;
            case 1: line[x] = (px_u8)(line[x] + a); break;
            case 2: line[x] = (px_u8)(line[x] + b); break;
            case 3: line[x] = (px_u8)(line[x] + (a + b) / 2); break;
            case 4: line[x] = (px_u8)(line[x] + px_paeth(a, b, c)); break;
            default: goto fail;
            }
        }
        for (x = 0; x < w; x++) {
            px_u8 *out = rgba + (y * w + x) * 4;
            int v;

            if (depth < 8) {
                v = (line[x * (px_u32)depth / 8] >> (8 - depth - (int)(x * (px_u32)depth % 8))) & ((1 << depth) - 1);
                if (type == 0)
                    v = v * 255 / ((1 << depth) - 1);
            } else {
                v = line[x * (px_u32)channels];
            }
            if (type == 3) {
                out[0] = palette[v * 4], out[1] = palette[v * 4 + 1], out[2] = palette[v * 4 + 2];
                out[3] = palette[v * 4 + 3];
            } else if (type == 0 || type == 4) {
                out[0] = out[1] = out[2] = (px_u8)v;
                out[3] = type == 4 ? line[x * 2 + 1] : (px_u8)(v == key ? 0 : 255);
            } else {
                out[0] = (px_u8)v, out[1] = line[x * (px_u32)channels + 1], out[2] = line[x * (px_u32)channels + 2];
                out[3] = type == 6 ? line[x * 4 + 3] : 255;
            }
        }
    }
    PX_FREE(packed);
    PX_FREE(raw);
    *width = w, *height = h, *why = NULL;
    return rgba;
fail:
    if (packed) PX_FREE(packed);
    if (raw) PX_FREE(raw);
    if (rgba) PX_FREE(rgba);
    return NULL;
}

/* ---- Reducing to 256 colours (median cut on a 15-bit colour cube) ---- */

struct px_box { px_u8 lo[3], hi[3]; px_u32 count; };

static void px_shrink(struct px_box *box, const px_u32 *hist)
{
    int lo[3] = { 31, 31, 31 }, hi[3] = { 0, 0, 0 }, r, g, b;
    px_u32 count = 0;

    for (r = box->lo[0]; r <= box->hi[0]; r++)
        for (g = box->lo[1]; g <= box->hi[1]; g++)
            for (b = box->lo[2]; b <= box->hi[2]; b++) {
                px_u32 n = hist[r << 10 | g << 5 | b];

                if (!n)
                    continue;
                count += n;
                if (r < lo[0]) lo[0] = r;
                if (r > hi[0]) hi[0] = r;
                if (g < lo[1]) lo[1] = g;
                if (g > hi[1]) hi[1] = g;
                if (b < lo[2]) lo[2] = b;
                if (b > hi[2]) hi[2] = b;
            }
    box->count = count;
    if (count)
        for (r = 0; r < 3; r++)
            box->lo[r] = (px_u8)lo[r], box->hi[r] = (px_u8)hi[r];
}

/* Fills `palette` (256 x B,G,R,A) and `indices` (one byte per pixel).
   Returns 0, or -1 if out of memory. Alpha is ignored: every colour is opaque. */
static int px_quantize(const px_u8 *rgba, px_u32 pixels, px_u8 *palette, px_u8 *indices)
{
    struct px_box *boxes;       /* on the heap: the DLL build has no stack probe for large frames */
    px_u32 *hist, i;
    px_u8 *map;
    int count = 0, n, axis;

    /* up to 256 different colours: keep them exactly */
    for (i = 0; i < pixels; i++) {
        const px_u8 *p = rgba + i * 4;

        for (n = 0; n < count; n++)
            if (palette[n * 4] == p[2] && palette[n * 4 + 1] == p[1] && palette[n * 4 + 2] == p[0])
                break;
        if (n == count) {
            if (count == 256)
                break;
            palette[n * 4] = p[2], palette[n * 4 + 1] = p[1], palette[n * 4 + 2] = p[0], palette[n * 4 + 3] = 255;
            count++;
        }
        indices[i] = (px_u8)n;
    }
    if (i == pixels) {
        for (n = count; n < 256; n++)
            palette[n * 4] = palette[n * 4 + 1] = palette[n * 4 + 2] = 0, palette[n * 4 + 3] = 255;
        return 0;
    }

    hist = PX_ALLOC(32768 * sizeof *hist + 32768 + 256 * sizeof *boxes);
    if (!hist)
        return -1;
    map = (px_u8 *)(hist + 32768);
    boxes = (struct px_box *)(map + 32768);
    for (i = 0; i < pixels; i++)
        hist[(rgba[i * 4] >> 3) << 10 | (rgba[i * 4 + 1] >> 3) << 5 | rgba[i * 4 + 2] >> 3]++;
    for (n = 0; n < 3; n++)
        boxes[0].lo[n] = 0, boxes[0].hi[n] = 31;
    px_shrink(&boxes[0], hist);
    for (count = 1; count < 256; count++) {
        int best = -1, r, g, b;
        px_u32 best_score = 0, half, running = 0;
        struct px_box *box, *other;

        /* split the box with the most pixels that can still be split */
        for (n = 0; n < count; n++) {
            int span = 0;

            for (axis = 0; axis < 3; axis++)
                if (boxes[n].hi[axis] - boxes[n].lo[axis] > span)
                    span = boxes[n].hi[axis] - boxes[n].lo[axis];
            if (span && boxes[n].count * (px_u32)(span + 1) > best_score)
                best = n, best_score = boxes[n].count * (px_u32)(span + 1);
        }
        if (best < 0)
            break;
        box = &boxes[best], other = &boxes[count];
        axis = 0;
        for (n = 1; n < 3; n++)
            if (box->hi[n] - box->lo[n] > box->hi[axis] - box->lo[axis])
                axis = n;
        half = box->count / 2;
        *other = *box;
        /* walk along the longest axis until half the pixels are behind */
        for (n = box->lo[axis]; n < box->hi[axis]; n++) {
            int lo[3], hi[3];

            for (r = 0; r < 3; r++)
                lo[r] = box->lo[r], hi[r] = box->hi[r];
            lo[axis] = hi[axis] = n;
            for (r = lo[0]; r <= hi[0]; r++)
                for (g = lo[1]; g <= hi[1]; g++)
                    for (b = lo[2]; b <= hi[2]; b++)
                        running += hist[r << 10 | g << 5 | b];
            if (running >= half)
                break;
        }
        /* If more than half the pixels sit in the last slice, the walk ends
           without stopping; cut that slice off rather than cutting nothing. */
        if (n >= box->hi[axis])
            n = box->hi[axis] - 1;
        box->hi[axis] = (px_u8)n;
        other->lo[axis] = (px_u8)(n + 1);
        px_shrink(box, hist);
        px_shrink(other, hist);
    }
    for (n = 0; n < 256; n++) {
        px_u32 sum[3] = { 0, 0, 0 }, total = 0;
        int r, g, b;

        palette[n * 4] = palette[n * 4 + 1] = palette[n * 4 + 2] = 0, palette[n * 4 + 3] = 255;
        if (n >= count)
            continue;
        for (r = boxes[n].lo[0]; r <= boxes[n].hi[0]; r++)
            for (g = boxes[n].lo[1]; g <= boxes[n].hi[1]; g++)
                for (b = boxes[n].lo[2]; b <= boxes[n].hi[2]; b++) {
                    px_u32 c = hist[r << 10 | g << 5 | b];

                    map[r << 10 | g << 5 | b] = (px_u8)n;
                    sum[0] += c * (px_u32)(r * 8 + 4), sum[1] += c * (px_u32)(g * 8 + 4), sum[2] += c * (px_u32)(b * 8 + 4);
                    total += c;
                }
        if (total) {
            palette[n * 4] = (px_u8)(sum[2] / total);
            palette[n * 4 + 1] = (px_u8)(sum[1] / total);
            palette[n * 4 + 2] = (px_u8)(sum[0] / total);
        }
    }
    for (i = 0; i < pixels; i++)
        indices[i] = map[(rgba[i * 4] >> 3) << 10 | (rgba[i * 4 + 1] >> 3) << 5 | rgba[i * 4 + 2] >> 3];
    PX_FREE(hist);
    return 0;
}

/* ---- .tex ---- */

#define PX_TEX_HEADER 0xec

/* Builds an 8-bit paletted .tex image in fresh memory, laid out like the
   game's own portrait textures: a 0xec-byte header, 256 palette entries
   (B, G, R, A), then one byte per pixel. Returns NULL if out of memory. */
static px_u8 *px_build_tex(px_u32 width, px_u32 height, const px_u8 *palette, const px_u8 *indices, px_u32 *size)
{
    /* header fields as in cloud.tex, by dword index; all others are zero */
    static const struct { px_u8 index; px_u32 value; } fields[] = {
        { 0, 1 }, { 4, 5 }, { 5, 4 }, { 6, 8 }, { 8, 8 }, { 9, 8 }, { 10, 0x20 }, { 12, 1 }, { 13, 256 }, { 14, 8 },
        { 19, 1 }, { 20, 8 }, { 22, 256 }, { 23, 256 }, { 25, 8 }, { 26, 1 }, { 49, 0xff }, { 50, 4 },
        { 56, 480 }, { 57, 640 },
    };
    px_u32 total = PX_TEX_HEADER + 1024 + width * height, i;
    px_u8 *tex = PX_ALLOC(total);
    static px_u32 header[PX_TEX_HEADER / 4];

    if (!tex)
        return NULL;
    for (i = 0; i < PX_TEX_HEADER / 4; i++)
        header[i] = 0;
    for (i = 0; i < sizeof fields / sizeof fields[0]; i++)
        header[fields[i].index] = fields[i].value;
    header[15] = width;
    header[16] = height;
    for (i = 0; i < PX_TEX_HEADER; i++)
        tex[i] = (px_u8)(header[i / 4] >> (8 * (i % 4)));
    for (i = 0; i < 1024; i++)
        tex[PX_TEX_HEADER + i] = palette[i];
    for (i = 0; i < width * height; i++)
        tex[PX_TEX_HEADER + 1024 + i] = indices[i];
    *size = total;
    return tex;
}

/* ---- Fitting a picture into a frame ---- */

struct px_fit {
    px_u32 frame_w, frame_h;    /* the part of the texture the game draws; 0 = do not fit */
    px_u32 canvas_w, canvas_h;  /* the whole texture */
};

/* Returns a canvas-sized RGBA image with the picture scaled to fill the
   frame in its top-left corner. The picture keeps its proportions: whatever
   overhangs the frame's shape is trimmed equally from both sides (or from
   top and bottom). The rest of the canvas is white. NULL if out of memory. */
static px_u8 *px_fit_cover(const px_u8 *rgba, px_u32 w, px_u32 h, const struct px_fit *fit)
{
    px_u8 *out = PX_ALLOC(fit->canvas_w * fit->canvas_h * 4);
    px_u32 crop_w = w, crop_h = h, x0 = 0, y0 = 0, dx, dy, i;

    if (!out)
        return NULL;
    for (i = 0; i < fit->canvas_w * fit->canvas_h * 4; i++)
        out[i] = 255;
    if (w * fit->frame_h > h * fit->frame_w) {          /* wider than the frame */
        crop_w = h * fit->frame_w / fit->frame_h;
        if (!crop_w) crop_w = 1;
        x0 = (w - crop_w) / 2;
    } else {
        crop_h = w * fit->frame_h / fit->frame_w;
        if (!crop_h) crop_h = 1;
        y0 = (h - crop_h) / 2;
    }
    for (dy = 0; dy < fit->frame_h && dy < fit->canvas_h; dy++) {
        px_u32 sy0 = y0 + dy * crop_h / fit->frame_h, sy1 = y0 + (dy + 1) * crop_h / fit->frame_h;

        if (sy1 <= sy0) sy1 = sy0 + 1;
        for (dx = 0; dx < fit->frame_w && dx < fit->canvas_w; dx++) {
            px_u32 sx0 = x0 + dx * crop_w / fit->frame_w, sx1 = x0 + (dx + 1) * crop_w / fit->frame_w;
            px_u32 sum[4] = { 0, 0, 0, 0 }, n = 0, sx, sy;

            if (sx1 <= sx0) sx1 = sx0 + 1;
            for (sy = sy0; sy < sy1 && sy < h; sy++)
                for (sx = sx0; sx < sx1 && sx < w; sx++) {
                    const px_u8 *p = rgba + (sy * w + sx) * 4;

                    sum[0] += p[0], sum[1] += p[1], sum[2] += p[2], sum[3] += p[3];
                    n++;
                }
            if (n)
                for (i = 0; i < 4; i++)
                    out[(dy * fit->canvas_w + dx) * 4 + i] = (px_u8)((sum[i] + n / 2) / n);
        }
    }
    return out;
}

/* PNG file bytes in, .tex file bytes out (fresh memory), or NULL and a reason.
   With `fit`, the picture is first fitted into a frame (see px_fit_cover). */
static px_u8 *px_png_to_tex(const px_u8 *png, px_u32 png_len, px_u32 *tex_len, px_u32 *width, px_u32 *height,
                            const struct px_fit *fit, const char **why)
{
    px_u8 *rgba = px_decode_png(png, png_len, width, height, why), *indices, *palette, *tex = NULL;

    if (!rgba)
        return NULL;
    if (fit && fit->frame_w) {
        px_u8 *fitted = px_fit_cover(rgba, *width, *height, fit);

        PX_FREE(rgba);
        *why = "out of memory";
        if (!fitted)
            return NULL;
        rgba = fitted;
        *width = fit->canvas_w, *height = fit->canvas_h;
    }
    indices = PX_ALLOC(*width * *height + 1024);    /* indices, then the palette */
    palette = indices ? indices + *width * *height : NULL;
    *why = "out of memory";
    if (indices && px_quantize(rgba, *width * *height, palette, indices) == 0)
        tex = px_build_tex(*width, *height, palette, indices, tex_len);
    if (indices)
        PX_FREE(indices);
    PX_FREE(rgba);
    if (tex)
        *why = NULL;
    return tex;
}
