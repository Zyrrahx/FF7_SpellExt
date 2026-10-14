/* field_merge.inc - adds bare playable-character entities to a decompressed PC field file.

   Included by spellext.c (one translation unit) and compiled natively by test/merge_test.c.
   Pure C: no game memory, no C library, no Windows. Everything is bounds-checked against
   in_len / out_cap; nothing is written to `out` unless the whole result has been proved to fit.

   THE FILE (as the engine holds it after FUN_00630734, stock or FFNx's replacement):
     u16 0, u32 9, u32 offset[9] (FILE offsets), then at each offset a u32 length word and the
     section's data. A section's data runs to the next section's offset (the length word of the
     script section is wrong in five of the game's own fields; FFNx recomputes it the same way).
   SECTION 1 (script), offsets from the section's data start:
     u16 0x0502, u8 entities, u8 models, u16 text table offset, u16 AKAO count, u16 scale,
     6 bytes, char[8] creator, char[8] field name, char[8] x entities, u32 x AKAO count,
     u16[32] x entities (script entry offsets), bytecode up to the text table, the text table,
     the AKAO blocks.
   SECTION 3 (model loader):
     u16, u16 models, u16 scale, then per model: u16 n + name, u16, char[8] HRC, char[4] scale,
     u16 animations, 30 bytes of lights, then per animation u16 n + name, u16.

   WHAT IS ADDED per extra, the "bare" form of plan/add_seat_entity.py and
   field_tool.add_pc_entity (the output is byte-identical to field_tool's for the same model):
     - a name row (8 bytes) after the existing names, a row of 32 script offsets (64 bytes)
       after the existing rows;
     - 7 bytes of code at the END of the bytecode:  CHAR m ; PC id ; RET | RET | RET
       slot 0 -> the CHAR (init runs to the first RET, main is the RET after it),
       slots 1 to 31 -> the last RET;
     - a model entry at the end of section 3's models.
   So with k extras: every existing script offset moves by 72k (the header rows), the text
   table offset and every AKAO offset by 72k + 7k (+1, see below), sections 2 and 3 by the
   same, sections 4 to 9 by that plus the new model entries. Jumps inside scripts are relative
   and the bytecode is not touched. New entities and models are LAST, so every existing entity
   number and model number keeps its meaning.
   One field of the game's (snw_w) has script slots that point at the very end of the bytecode;
   one RET is put there first so that they do not run into the new entity's code. The same RET
   is written when the bytecode's last command is neither RET nor a jump back (a mod's field;
   none of the game's): a script running off the end must not run the new entity's commands.

   The engine gives models to entities in the order their CHAR commands run (FUN_00614353 takes
   a running counter, not the operand), so the new entity only gets the new model if every
   model before it is taken by a CHAR: the number of CHAR commands in the bytecode must equal
   the model count, or the field is refused; and so must the number the entities' first scripts
   run, walked as the engine runs them (to the first RET; a CHAR after a jump is refused). The
   same sweep finds a PC command for a seat's ID: a field that already has an entity for that
   character (one built by hand, or this merge done before) is not given a second one. A field
   with no PC command at all is refused: its player is model 0 and its scripts rely on that. */

#define FM_MAX_ENTITIES 48      /* the engine's per-entity tables (00cbfb70, 00cc0830 ...) */
#define FM_MAX_MODELS   16      /* the engine's model array, 16 x 0x88 at 00cc1670 */
#define FM_MAX_EXTRAS   4

struct field_extra {
    unsigned char seat;         /* the PC command's operand: the character ID */
    char entity[8];             /* the entity's name, zero padded (e.g. "sx12") */
    char hrc[8];                /* the skeleton, 8 characters as in the file (e.g. "YUAA.HRC") */
    const char *model_name;     /* the loader's name for the model (e.g. "sx12.char"), 1 to 60 characters */
};

static const unsigned char fm_op_length[256] = {    /* 0 = no such command; 0F and 28 are special */
     1,  3,  3,  3,  3,  3,  3,  2,  2, 15,  6,  6,  0,  0,  2,  0,   /* 00 */
     2,  3,  2,  3,  6,  7,  8,  9,  8,  9,  0,  0,  0,  0,  0,  0,   /* 10 */
    11,  2,  5,  3,  3,  9,  2,  2,  0,  1,  2,  2,  5,  7,  2, 10,   /* 20 */
     4,  4,  4,  2,  2,  4,  5,  8,  6,  6,  6,  4,  1,  1,  1,  1,   /* 30 */
     3,  5,  6,  2,  0,  5,  0,  5,  7,  4,  2,  2,  0,  5,  0,  5,   /* 40 */
    10,  6,  4,  2,  2,  3,  7,  7,  5,  5,  5,  7,  8, 10,  8,  1,   /* 50 */
    10,  2,  5,  6,  6,  1,  9,  1,  9,  2,  7,  9,  1,  4,  3,  6,   /* 60 */
     4,  2,  3,  4,  4,  8,  4,  5,  4,  5,  3,  3,  3,  3,  2,  3,   /* 70 */
     4,  5,  4,  4,  4,  4,  5,  4,  5,  4,  5,  4,  5,  4,  5,  4,   /* 80 */
     5,  4,  5,  4,  5,  3,  3,  3,  3,  3,  4,  5,  6,  7,  7, 11,   /* 90 */
     2,  2,  3,  3,  2, 11,  9,  9,  6,  6,  2,  4,  1,  6,  3,  3,   /* A0 */
     5,  5,  4,  3,  6,  6,  2,  4,  5,  4,  3,  5,  5,  4,  0,  2,   /* B0 */
    11,  8, 15, 12,  1,  3,  3,  2,  2,  2,  4,  3,  3,  3,  2,  2,   /* C0 */
    13,  2,  2, 16, 10, 10,  4,  4,  3,  1, 15,  2,  4,  1,  1, 11,   /* D0 */
     4,  4,  3,  3,  3,  5,  5,  5,  7, 10, 10,  5,  5,  8,  8, 11,   /* E0 */
     2,  5, 14,  2,  2,  2,  2,  4,  2,  1,  3,  2,  2,  8,  3,  1,   /* F0 */
};
static const unsigned char fm_special_length[11] = { 3, 6, 4, 4, 2, 2, 3, 3, 4, 2, 2 };   /* 0F F5 .. 0F FF */

static unsigned fm_u16(const unsigned char *p)
{
    return (unsigned)p[0] | (unsigned)p[1] << 8;
}

static unsigned fm_u32(const unsigned char *p)
{
    return (unsigned)p[0] | (unsigned)p[1] << 8 | (unsigned)p[2] << 16 | (unsigned)p[3] << 24;
}

static void fm_put16(unsigned char *p, unsigned v)
{
    p[0] = (unsigned char)v;
    p[1] = (unsigned char)(v >> 8);
}

static void fm_put32(unsigned char *p, unsigned v)
{
    p[0] = (unsigned char)v;
    p[1] = (unsigned char)(v >> 8);
    p[2] = (unsigned char)(v >> 16);
    p[3] = (unsigned char)(v >> 24);
}

/* Appends `count` bytes at *at and moves it on. The caller has proved the room. */
static void fm_copy(unsigned char *out, unsigned *at, const unsigned char *src, unsigned count)
{
    unsigned char *volatile dst = out + *at;    /* volatile: keeps the compiler from calling memcpy, which the DLL has none of */
    unsigned i;

    for (i = 0; i < count; i++)
        dst[i] = src[i];
    *at += count;
}

static int fm_length(const char *s, int most)
{
    int n = 0;

    while (n <= most && s[n])
        n++;
    return n;
}

/* Writes the reason (always ends in a zero byte when why_cap > 0), then a number when
   number >= 0. */
static void fm_why(char *why, int why_cap, const char *text, long number)
{
    int n = 0;
    char digits[12];
    int d = 0;

    if (!why || why_cap < 1)
        return;
    while (*text && n < why_cap - 1)
        why[n++] = *text++;
    if (number >= 0) {
        do {
            digits[d++] = (char)('0' + number % 10);
            number /= 10;
        } while (number && d < 11);
        while (d && n < why_cap - 1)
            why[n++] = digits[--d];
    }
    why[n] = 0;
}

static int fm_same_name8(const unsigned char *a, const char *b)
{
    int i;

    for (i = 0; i < 8; i++) {
        if (a[i] != (unsigned char)b[i])
            return 0;
        if (!a[i])
            break;
    }
    return 1;
}

/* One model entry of section 3 at s3[p]: its end, or 0 when it runs past n3. Fills the
   offsets of its fixed part (the u16 after the name) and of its first animation. */
static unsigned fm_model_end(const unsigned char *s3, unsigned n3, unsigned p, unsigned *fixed, unsigned *anims,
                             unsigned *anim_count)
{
    unsigned n, a, count;

    if (n3 - p < 2)
        return 0;
    n = fm_u16(s3 + p);
    p += 2;
    if (n3 - p < n || n3 - p - n < 46)      /* u16, HRC 8, scale 4, u16 count, 30 bytes of lights */
        return 0;
    p += n;
    *fixed = p;
    count = fm_u16(s3 + p + 14);
    p += 46;
    *anims = p;
    *anim_count = count;
    for (a = 0; a < count; a++) {
        if (n3 - p < 2)
            return 0;
        n = fm_u16(s3 + p);
        p += 2;
        if (n3 - p < n || n3 - p - n < 2)
            return 0;
        p += n + 2;
    }
    return p;
}

/* The length of the command at s1[p], 0 when it does not decode or passes `strings`. */
static unsigned fm_command_length(const unsigned char *s1, unsigned p, unsigned strings)
{
    unsigned op = s1[p], length = fm_op_length[op];

    if (op == 0x28) {                               /* KAWAI: its second byte is its length */
        length = strings - p >= 2 ? s1[p + 1] : 0;
        if (length < 3)
            length = 0;
    } else if (op == 0x0f) {                        /* SPECIAL: by its second byte */
        length = strings - p >= 2 && s1[p + 1] >= 0xf5 ? fm_special_length[s1[p + 1] - 0xf5] : 0;
    }
    return length > strings - p ? 0 : length;
}

/* in/in_len: the decompressed field file. out/out_cap: where the result is built (must not
   overlap `in`). extra/count: what to add, most wanted first (1 to FM_MAX_EXTRAS).
   Returns the result's length, or 0 when nothing was written; `why` then says why (a short
   text, also set to what was left out when the result is partial). *added gets a bit per
   extra that was added (bit i = extra[i]); *present a bit per extra the field already had. */
static unsigned field_add_entities(const unsigned char *in, unsigned in_len, unsigned char *out, unsigned out_cap,
                                   const struct field_extra *extra, int count, unsigned *added, unsigned *present,
                                   char *why, int why_cap)
{
    static const char standard[3][9] = { "ACFE.aki", "AAFF.aki", "AAGA.aki" };   /* stand, walk, run of Cloud's skeleton */
    unsigned off[9], i, at;
    const unsigned char *s1, *s3;
    unsigned n1, n3, s3_end;
    unsigned ne, nm, strings, na, names, akao, rows, code_start, at_end = 0;
    unsigned nm3, models_end, p, pcs = 0, chars = 0, init_chars = 0, last_op = 0;
    unsigned cloud_fixed = 0, cloud_anims = 0, cloud_count = 0, cloud_three = 0, have_cloud = 0;
    unsigned first_fixed = 0;
    unsigned src_fixed, entry_tail, take[FM_MAX_EXTRAS], k = 0, grow1, grow3, total, name_len[FM_MAX_EXTRAS];
    unsigned anim_at[3], anim_len[3];
    int e, left_out = 0;

    if (added)
        *added = 0;
    if (present)
        *present = 0;
    fm_why(why, why_cap, "", -1);
    if (count < 1 || count > FM_MAX_EXTRAS || !in || !out || !extra) {
        fm_why(why, why_cap, "bad arguments", -1);
        return 0;
    }

    /* ---- the file's header and its nine sections ---- */
    if (in_len < 42 || fm_u16(in) != 0 || fm_u32(in + 2) != 9) {
        fm_why(why, why_cap, "not a field file (no header of nine sections)", -1);
        return 0;
    }
    for (i = 0; i < 9; i++) {
        off[i] = fm_u32(in + 6 + i * 4);
        if (off[i] < 42 || off[i] > in_len || in_len - off[i] < 4 || (i && (off[i] <= off[i - 1] || off[i] - off[i - 1] < 4))) {
            fm_why(why, why_cap, "the section offsets are not as expected, section ", (long)i + 1);
            return 0;
        }
    }
    s1 = in + off[0] + 4;
    n1 = off[1] - off[0] - 4;
    s3 = in + off[2] + 4;
    n3 = off[3] - off[2] - 4;

    /* ---- section 1 ---- */
    if (n1 < 32 || fm_u16(s1) != 0x0502) {
        fm_why(why, why_cap, "the script section does not start as expected", -1);
        return 0;
    }
    ne = s1[2];
    nm = s1[3];
    strings = fm_u16(s1 + 4);
    na = fm_u16(s1 + 6);
    names = 32;
    akao = names + ne * 8;
    rows = akao + na * 4;
    code_start = rows + ne * 64;        /* at most 32 + 255 * 72 + 65535 * 4: no overflow */
    if (code_start > n1 || strings < code_start || strings > n1) {
        fm_why(why, why_cap, "the script section's tables do not fit it", -1);
        return 0;
    }
    for (i = 0; i < na; i++) {
        unsigned o = fm_u32(s1 + akao + i * 4);

        if (o < strings || o > n1) {
            fm_why(why, why_cap, "a music block's offset is not after the scripts, block ", (long)i);
            return 0;
        }
    }
    for (i = 0; i < ne * 32; i++) {
        unsigned o = fm_u16(s1 + rows + i * 2);

        if (o < code_start || o > strings) {
            fm_why(why, why_cap, "a script's offset is outside the scripts, entity ", (long)(i / 32));
            return 0;
        }
        if (o == strings)
            at_end = 1;
    }
    /* every command of the bytecode, for its CHAR and PC commands */
    for (p = code_start; p < strings; ) {
        unsigned op = s1[p], length = fm_command_length(s1, p, strings);

        if (!length) {
            fm_why(why, why_cap, "the scripts do not decode, at offset ", (long)p);
            return 0;
        }
        if (op == 0xa1)
            chars++;
        else if (op == 0xa0 && s1[p + 1] < 32)
            pcs |= 1u << s1[p + 1];
        last_op = op;
        p += length;
    }
    /* A script that runs to the end of the bytecode (its last command is neither RET nor a
       jump back; none of the game's fields has one) must not run on into the code added
       there: the guard RET is written for it as for a slot that points at the end. */
    if (strings > code_start && last_op != 0x00 && last_op != 0x12 && last_op != 0x13)
        at_end = 1;
    /* The CHAR commands as the engine meets them: it gives models out in the order its CHARs
       RUN, one counter for the field (00cc0898), as it runs each entity's first script down
       to its first RET (FUN_0060c683). So each entity's first script is walked to its first
       RET. A CHAR after a jump or a test may be skipped or repeated, which cannot be told
       from here: such a field is refused (none of the game's is like that). */
    for (i = 0; i < ne; i++) {
        unsigned jumped = 0;

        for (p = fm_u16(s1 + rows + i * 64); p < strings; ) {
            unsigned op = s1[p], length = fm_command_length(s1, p, strings);

            if (!length || op == 0x00)
                break;      /* an offset into the middle of a command decodes as it will: the counts below then differ */
            if (op == 0xa1) {
                if (jumped) {
                    fm_why(why, why_cap, "a CHAR command follows a jump or a test in its script (the models' order cannot be told), entity ",
                           (long)i);
                    return 0;
                }
                init_chars++;
            } else if ((op >= 0x10 && op <= 0x19) || (op >= 0x30 && op <= 0x32) || op == 0xcb || op == 0xcc) {
                jumped = 1;
            }
            p += length;
        }
    }

    /* ---- section 3 ---- */
    if (n3 < 6) {
        fm_why(why, why_cap, "the model section is too short", -1);
        return 0;
    }
    nm3 = fm_u16(s3 + 2);
    if (nm3 != nm) {
        fm_why(why, why_cap, "the script section and the model section disagree on the number of models", -1);
        return 0;
    }
    if (chars != nm3) {
        fm_why(why, why_cap, "the scripts' CHAR commands do not match the models (a new entity would get another's model), CHARs ",
               (long)chars);
        return 0;
    }
    if (init_chars != nm3) {
        fm_why(why, why_cap, "the CHAR commands the entities' first scripts run do not match the models (a new entity would get another's model), CHARs run ",
               (long)init_chars);
        return 0;
    }
    if (!nm3) {
        fm_why(why, why_cap, "the field has no model to take lights from", -1);
        return 0;
    }
    p = 6;
    for (i = 0; i < nm3; i++) {
        unsigned fixed = 0, anims = 0, anim_count = 0, end = fm_model_end(s3, n3, p, &fixed, &anims, &anim_count);
        const unsigned char *h;

        if (!end) {
            fm_why(why, why_cap, "the model section does not parse, model ", (long)i);
            return 0;
        }
        h = s3 + fixed + 2;
        if (!i)
            first_fixed = fixed;
        if (!have_cloud && (h[0] | 0x20) == 'a' && (h[1] | 0x20) == 'a' && (h[2] | 0x20) == 'a' && (h[3] | 0x20) == 'a' &&
            h[4] == '.' && (h[5] | 0x20) == 'h' && (h[6] | 0x20) == 'r' && (h[7] | 0x20) == 'c') {
            have_cloud = 1;
            cloud_fixed = fixed;
            cloud_anims = anims;
            cloud_count = anim_count;
        }
        p = end;
    }
    models_end = p;
    s3_end = n3;

    /* ---- a field with no PC command at all ----
       Its player is model 0, which the engine sets as each field loads (FUN_0060bcfa) and only
       a PC command for the party's leader changes (FUN_0061bcd7); the field's scripts are
       written round that model (38 of the game's fields, Cloud's model in most). An entity
       with a PC command for a seat would take the player away from it whenever that seat
       leads, so nothing is added there. */
    if (!pcs) {
        fm_why(why, why_cap, "the field has no playable character's entity: its model 0 is the player", -1);
        return 0;
    }

    /* ---- which extras ---- */
    for (e = 0; e < count; e++) {
        int have = 0;
        unsigned n;

        n = (unsigned)fm_length(extra[e].model_name ? extra[e].model_name : "", 61);
        if (n < 1 || n > 60 || !extra[e].entity[0] || !extra[e].hrc[0]) {
            fm_why(why, why_cap, "bad arguments (a name)", -1);
            return 0;
        }
        if (extra[e].seat < 32 && (pcs & 1u << extra[e].seat))
            have = 1;
        for (i = 0; i < ne && !have; i++)
            if (fm_same_name8(s1 + names + i * 8, extra[e].entity))
                have = 1;
        for (i = 0; i < k && !have; i++)
            if (extra[take[i]].seat == extra[e].seat)
                have = 2;                           /* named twice by the caller: once is enough */
        if (have == 1 && present)
            *present |= 1u << e;
        if (have)
            continue;
        if (ne + k + 1 > FM_MAX_ENTITIES || nm3 + k + 1 > FM_MAX_MODELS) {
            left_out++;
            continue;
        }
        name_len[k] = n;
        take[k++] = (unsigned)e;
    }
    if (!k) {
        if (left_out && nm3 + 1 > FM_MAX_MODELS)
            fm_why(why, why_cap, "the field has all the models the engine has room for, ", (long)nm3);
        else if (left_out)
            fm_why(why, why_cap, "the field has all the entities the engine has room for, ", (long)ne);
        else
            fm_why(why, why_cap, "nothing to add: the field has an entity for each", -1);
        return 0;
    }

    /* ---- the new model entry: Cloud's of this field, else the first model's lights ---- */
    src_fixed = have_cloud ? cloud_fixed : first_fixed;
    if (have_cloud) {
        unsigned q = cloud_anims;

        for (i = 0; i < 3 && i < cloud_count; i++) {
            anim_at[i] = q;
            anim_len[i] = 2 + fm_u16(s3 + q) + 2;   /* inside n3: fm_model_end walked it */
            q += anim_len[i];
        }
        cloud_three = i;
    }
    entry_tail = 0;
    for (i = 0; i < 3; i++)
        entry_tail += i < cloud_three ? anim_len[i] : 2 + 8 + 2;
    grow1 = k * 72 + k * 7 + at_end;
    grow3 = 0;
    for (i = 0; i < k; i++)
        grow3 += 2 + name_len[i] + 46 + entry_tail;
    if (strings + grow1 > 0xffff) {
        fm_why(why, why_cap, "the scripts would pass 65535 bytes, the most an offset can say", -1);
        return 0;
    }
    if (in_len > 0x7fffffffu - grow1 - grow3) {
        fm_why(why, why_cap, "the file is too long", -1);
        return 0;
    }
    total = in_len + grow1 + grow3;
    if (total > out_cap) {
        fm_why(why, why_cap, "no room for the longer file, bytes needed ", (long)total);
        return 0;
    }
    /* `out` must not overlap `in` */
    if (!(out + out_cap <= in || in + in_len <= out)) {
        fm_why(why, why_cap, "bad arguments (the buffers overlap)", -1);
        return 0;
    }

    /* ---- write: nothing below can fail ---- */
    at = 0;
    fm_copy(out, &at, in, off[0]);                              /* the header, and whatever lies before section 1 */
    for (i = 1; i < 9; i++)
        fm_put32(out + 6 + i * 4, off[i] + grow1 + (i >= 3 ? grow3 : 0));
    /* section 1 */
    fm_put32(out + at, fm_u32(in + off[0]) + grow1);            /* its length word, wrong or not, grows with it */
    at += 4;
    fm_copy(out, &at, s1, akao);                                /* the 32 bytes and the names */
    out[off[0] + 4 + 2] = (unsigned char)(ne + k);
    out[off[0] + 4 + 3] = (unsigned char)(nm + k);
    fm_put16(out + off[0] + 4 + 4, strings + grow1);
    for (i = 0; i < k; i++)
        fm_copy(out, &at, (const unsigned char *)extra[take[i]].entity, 8);
    for (i = 0; i < na; i++) {
        fm_put32(out + at, fm_u32(s1 + akao + i * 4) + grow1);
        at += 4;
    }
    for (i = 0; i < ne * 32; i++) {
        fm_put16(out + at, fm_u16(s1 + rows + i * 2) + k * 72);
        at += 2;
    }
    for (i = 0; i < k; i++) {
        unsigned base = strings + k * 72 + at_end + i * 7, slot;

        fm_put16(out + at, base);                               /* slot 0: init, then main */
        at += 2;
        for (slot = 1; slot < 32; slot++) {
            fm_put16(out + at, base + 6);                       /* every other script: the last RET */
            at += 2;
        }
    }
    fm_copy(out, &at, s1 + code_start, strings - code_start);   /* the bytecode, untouched */
    if (at_end)
        out[at++] = 0x00;                                       /* RET for the slots that pointed at the end */
    for (i = 0; i < k; i++) {
        out[at++] = 0xa1;                                       /* CHAR */
        out[at++] = (unsigned char)(nm3 + i);
        out[at++] = 0xa0;                                       /* PC */
        out[at++] = extra[take[i]].seat;
        out[at++] = 0x00;                                       /* RET: end of init */
        out[at++] = 0x00;                                       /* RET: main */
        out[at++] = 0x00;                                       /* RET: every other script */
    }
    fm_copy(out, &at, s1 + strings, n1 - strings);              /* the texts and the music blocks */
    /* section 2 */
    fm_copy(out, &at, in + off[1], off[2] - off[1]);
    /* section 3 */
    fm_put32(out + at, fm_u32(in + off[2]) + grow3);
    at += 4;
    fm_copy(out, &at, s3, models_end);
    fm_put16(out + off[2] + grow1 + 4 + 2, nm3 + k);
    for (i = 0; i < k; i++) {
        unsigned a;

        fm_put16(out + at, name_len[i]);
        at += 2;
        fm_copy(out, &at, (const unsigned char *)extra[take[i]].model_name, name_len[i]);
        fm_copy(out, &at, s3 + src_fixed, 2);                   /* the word after the name */
        fm_copy(out, &at, (const unsigned char *)extra[take[i]].hrc, 8);
        fm_copy(out, &at, s3 + src_fixed + 10, 4);              /* the scale, as text */
        fm_put16(out + at, 3);
        at += 2;
        fm_copy(out, &at, s3 + src_fixed + 16, 30);             /* three lights and the global light */
        for (a = 0; a < 3; a++) {
            if (a < cloud_three) {
                fm_copy(out, &at, s3 + anim_at[a], anim_len[a]);
            } else {
                fm_put16(out + at, 8);
                at += 2;
                fm_copy(out, &at, (const unsigned char *)standard[a], 8);
                fm_put16(out + at, 1);
                at += 2;
            }
        }
    }
    fm_copy(out, &at, s3 + models_end, s3_end - models_end);    /* whatever followed the models */
    /* sections 4 to 9 and anything after them */
    fm_copy(out, &at, in + off[3], in_len - off[3]);

    for (i = 0; i < k; i++)
        if (added)
            *added |= 1u << take[i];
    if (left_out)
        fm_why(why, why_cap, nm3 + k >= FM_MAX_MODELS ? "left out for want of model room: " : "left out for want of entity room: ",
               (long)left_out);
    return at;      /* == total */
}
