/* warp_menu.inc - the SpellExt menu's WARP page and GameMoment editor (a testing aid). Included by spellext.c before
   menu_entries. Nothing here names a character; nothing patches a site of the game (no new site: see below).

   WHAT IT DOES. A row of the debug list ("Warp: fields, GameMoment", with debug = true and warp_menu not off) opens a
   page with two things:
     GameMoment   the word at 00dc08dc (the save block + 0xba4: field variable bank 2, address 0, read by
                  field_get_bank_value_0060fd6c) as a five-digit number editor (0..65535); OK writes it at once.
     the fields   the maplist's fields from id 65 up that SpellExtConfig\warp\generated.txt names (the offline table of
                  tools/warp_table.py: the fields as installed, their entrances and titles), by id. OK on a field lists
                  its entrances (the gateways and MAPJUMPs that lead into it, and "the centre of triangle 0"); OK on an
                  entrance warps there. [SWITCH] on the list: a number editor "go to field id".
   THE WARP writes what a gateway writes, the six values the game's own FUN_00636233 writes (00cc0d8a field id, 00cc0d8c x,
   00cc0d8e y, 00cc0daa triangle, 00cc0dac direction, then 00cc0d89 = 1 last) and closes the menu through 00dc12f4 as the
   battle page does. The field loop then fades and loads the field as for a gateway: the init scripts and the camera run as on
   any entry; the leader is placed only while the field's control is on (the game's rule, 00633c2f); x = 7fff is "the
   centre of the triangle".
   AT ARRIVAL, in field_read_hook (the existing chained call at 0060ba9f), the entrance is checked against the field file as
   read, before the game places the player: a triangle past the walkmesh becomes triangle 0, a point outside its triangle
   becomes the triangle's centre. So a stale table gives a nearby spot, never an out-of-mesh read. With the table loaded,
   the walkmesh (section 5) and trigger (section 8) checksums of every field read are compared with the table's, once per
   field per run: "warp table differs for <field>: rebuild it".
   REFUSED, on the page, in red, one log line, nothing written: warp_menu = off, no table, the world map, a menu that is not
   a field's menu button menu (a script's MENU, TUTOR, a save point, the menu after a battle), a movie playing (009a1010),
   a target that is not a listed field (id 0-64 are the world map, past the maplist, the placeholder). The current field is
   allowed. Never run in the field: the page exists only in the menu, where no script runs.
   COST when unused: a test of zero in field_read_hook; at the start-up reading of the game file, one key. The table is
   read when the page is first opened (and again after Re-init .ini files), not at start-up. */

#define ADDR_GAME_MOMENT        0x00dc08dcu  /* WORD: GameMoment = field variable [2:0] (save block 00dbfd38 + 0xba4) */
#define ADDR_FIELD_ENTRY_X      0x00cc0d8cu  /* WORD: where a gateway or MAPJUMP puts the player: x (7fff = the triangle's centre) */
#define ADDR_FIELD_ENTRY_Y      0x00cc0d8eu  /* WORD: y */
#define ADDR_FIELD_ENTRY_TRI    0x00cc0daau  /* WORD: the walkmesh triangle */
#define ADDR_FIELD_ENTRY_DIR    0x00cc0dacu  /* WORD: the direction (a byte of the gateway, zero-extended) */
#define ADDR_MOVIE_PLAYING      0x009a1010u  /* DWORD: FFNx's movie object (009a0e14) + 0x1fc, is_playing: counted from FFNx's struct movie_obj, not seen in the game */

/* WARP MENU PURE BEGIN  (no Win32 call: tested natively, tools/work/warp_menu/tests) */
#define WP_FIELDS               1024
#define WP_ENTRANCES            4096
#define WP_NAME                 16           /* a field's name in the table: 15 characters at most */
#define WP_TITLE                32
#define WP_FIRST_ID             65           /* ids 1-64 go to the world map (field_loop_sub_0063c17f); 0 is the dummy */
#define WP_CENTRE               0x7fff       /* x: "the centre of the triangle" */
#define WP_LIST_ROWS            11
#define WP_SPECIAL_ROWS         2            /* the list page's GameMoment and Again rows, above the list */
#define WP_ENTRANCE_MAX         256          /* the entrances of one field the page lists */
#define WP_JUMP                 100
#define WP_WARN_NONE            0
#define WP_WARN_MOVIE           1
#define WP_WARN_MINIGAME        2
#define WP_WARN_BATTLE          3
#define WP_WARN_SCENE           4
#define WP_WARNS                5

struct wp_field {
    char name[WP_NAME];
    char title[WP_TITLE];
    WORD triangles;
    DWORD mesh, gates;          /* crc32 of section 5 and of section 8, as the file's header gives them */
    BYTE warn;
    short id;                   /* the maplist's id in this run; -1: not in it */
    WORD entrances;             /* how many entrance lines name it */
};

struct wp_entrance {
    short x, y;
    WORD tri;
    BYTE dir, kind, k;          /* kind 1: gateway k of the source field, 2: a MAPJUMP */
    char from[WP_NAME];
    WORD field;                 /* index in wp_table.f */
};

struct wp_table {
    int fields, entrances, lines, bad, full;
    int first_bad_line;
    const char *first_bad_why;
    struct wp_field f[WP_FIELDS];
    struct wp_entrance e[WP_ENTRANCES];
};

static const char *const wp_warn_text[WP_WARNS] = {
    "",
    "a movie plays in this field",
    "this field starts a mini-game",
    "this field starts a battle from its script",
    "no gateway leads in or out: a scene field",
};
static const char *const wp_warn_word[WP_WARNS] = { "", "movie", "minigame", "battle", "scene" };      /* (the table's words) */
static const char *const wp_warn_short[WP_WARNS] = { "", "movie", "mini", "btl", "scene" };            /* (the list's column is narrow) */

static char wp_lower(char c)
{
    return c >= 'A' && c <= 'Z' ? (char)(c + 0x20) : c;
}

/* Both NUL-ended, case ignored. */
static int wp_name_eq(const char *a, const char *b)
{
    for (; *a || *b; a++, b++)
        if (wp_lower(*a) != wp_lower(*b))
            return 0;
    return 1;
}

static const char *wp_skip(const char *p, const char *end)
{
    while (p < end && (*p == ' ' || *p == '\t' || *p == '\r'))
        p++;
    return p;
}

/* The word at p up to a comma (or the end), trimmed; *out is its end. */
static const char *wp_word_end(const char *p, const char *end)
{
    const char *q = p;

    while (q < end && *q != ',')
        q++;
    while (q > p && (q[-1] == ' ' || q[-1] == '\t' || q[-1] == '\r'))
        q--;
    return q;
}

static int wp_word_is(const char *p, const char *end, const char *word)
{
    for (; p < end && *word; p++, word++)
        if (wp_lower(*p) != *word)
            return 0;
    return p == end && !*word;
}

/* A decimal number (a minus sign allowed when `min` is below 0) in [min, max] filling [p, end) after trimming. */
static int wp_int(const char *p, const char *end, long min, long max, long *out)
{
    long v = 0;
    int neg = 0, digits = 0;

    p = wp_skip(p, end);
    if (p < end && *p == '-') {
        neg = 1;
        p++;
    }
    for (; p < end && *p >= '0' && *p <= '9'; p++, digits++) {
        v = v * 10 + (*p - '0');
        if (v > 1000000)
            return 0;
    }
    p = wp_skip(p, end);
    if (!digits || p != end)
        return 0;
    if (neg)
        v = -v;
    if (v < min || v > max)
        return 0;
    *out = v;
    return 1;
}

static int wp_hex(const char *p, const char *end, DWORD *out)
{
    DWORD v = 0;
    int digits = 0;

    p = wp_skip(p, end);
    for (; p < end; p++, digits++) {
        char c = wp_lower(*p);

        if (c >= '0' && c <= '9')
            v = v * 16 + (DWORD)(c - '0');
        else if (c >= 'a' && c <= 'f')
            v = v * 16 + (DWORD)(c - 'a' + 10);
        else
            break;
        if (digits >= 8)
            return 0;
    }
    p = wp_skip(p, end);
    if (!digits || p != end)
        return 0;
    *out = v;
    return 1;
}

static void wp_copy_text(char *out, int room, const char *p, const char *end)
{
    int n = 0;

    for (; p < end && n < room - 1; p++)
        out[n++] = (BYTE)*p >= 0x20 && (BYTE)*p < 0x7f ? *p : '?';      /* (a file's text: no byte of it may reach the font as one of the game's codes) */
    out[n] = 0;
}

static int wp_find_field(const struct wp_table *t, const char *name)
{
    int i;

    for (i = 0; i < t->fields; i++)
        if (wp_name_eq(t->f[i].name, name))
            return i;
    return -1;
}

/* Splits "key, value" pieces of the rest of a field line: "triangles N", "mesh H", "gates H", "warn W". */
static int wp_field_piece(struct wp_field *f, const char *p, const char *end, int *seen)
{
    const char *w = p, *v;
    long n;

    while (w < end && *w != ' ' && *w != '\t')
        w++;
    v = wp_skip(w, end);
    if (wp_word_is(p, w, "triangles")) {
        if (!wp_int(v, end, 1, 65535, &n))
            return 0;
        f->triangles = (WORD)n;
        *seen |= 1;
    } else if (wp_word_is(p, w, "mesh")) {
        if (!wp_hex(v, end, &f->mesh))
            return 0;
        *seen |= 2;
    } else if (wp_word_is(p, w, "gates")) {
        if (!wp_hex(v, end, &f->gates))
            return 0;
        *seen |= 4;
    } else if (wp_word_is(p, w, "warn")) {
        int k;

        for (k = 1; k < WP_WARNS && !wp_word_is(v, end, wp_warn_word[k]); k++)
            ;
        if (k == WP_WARNS)
            return 0;
        f->warn = (BYTE)k;
    } else {
        return 0;
    }
    return 1;
}

/* One line of the table. 0: blank or a comment; 1: a field added; 2: an entrance added; -1: a bad line (*why says what). */
static int wp_parse_line(struct wp_table *t, const char *p, const char *end, const char **why)
{
    const char *eq, *key_end, *q, *e;
    long n;

    p = wp_skip(p, end);
    if (p >= end || *p == '#')
        return 0;
    for (eq = p; eq < end && *eq != '='; eq++)
        ;
    if (eq == end) {
        *why = "no =";
        return -1;
    }
    key_end = eq;
    while (key_end > p && (key_end[-1] == ' ' || key_end[-1] == '\t'))
        key_end--;
    q = wp_skip(eq + 1, end);
    if (wp_word_is(p, key_end, "field")) {
        struct wp_field f;
        int seen = 0, i;

        for (i = 0; i < (int)sizeof f; i++)
            ((char *)&f)[i] = 0;
        f.id = -1;
        e = wp_word_end(q, end);
        if (e == q || e - q >= WP_NAME) {
            *why = "field name missing or longer than 15";
            return -1;
        }
        wp_copy_text(f.name, WP_NAME, q, e);
        for (i = 0; f.name[i]; i++)
            f.name[i] = wp_lower(f.name[i]);
        q = wp_skip(e, end);
        if (q >= end || *q != ',') {
            *why = "field: the title is missing";
            return -1;
        }
        q = wp_skip(q + 1, end);
        if (q >= end || *q != '"') {
            *why = "field: the title is not in quotes";
            return -1;
        }
        for (e = q + 1; e < end && *e != '"'; e++)
            ;
        if (e >= end) {
            *why = "field: the title's quote is not closed";
            return -1;
        }
        wp_copy_text(f.title, WP_TITLE, q + 1, e);
        q = e + 1;
        while ((q = wp_skip(q, end)) < end) {
            if (*q != ',') {
                *why = "field: a comma is missing";
                return -1;
            }
            q = wp_skip(q + 1, end);
            e = wp_word_end(q, end);
            if (e == q || !wp_field_piece(&f, q, e, &seen)) {
                *why = "field: a piece is not triangles N, mesh H, gates H or warn W";
                return -1;
            }
            q = e;
        }
        if (seen != 7) {
            *why = "field: triangles, mesh and gates are all needed";
            return -1;
        }
        if (wp_find_field(t, f.name) >= 0) {
            *why = "field: the name is listed twice";
            return -1;
        }
        if (t->fields >= WP_FIELDS) {
            t->full++;
            *why = "field: the table holds 1024 fields";
            return -1;
        }
        t->f[t->fields++] = f;
        return 1;
    } else if (wp_word_is(p, key_end, "entrance")) {
        struct wp_entrance en;
        char name[WP_NAME];
        long v[4];
        int i, field;

        for (i = 0; i < (int)sizeof en; i++)
            ((char *)&en)[i] = 0;
        e = wp_word_end(q, end);
        if (e == q || e - q >= WP_NAME) {
            *why = "entrance: the field name is missing or longer than 15";
            return -1;
        }
        wp_copy_text(name, WP_NAME, q, e);
        field = wp_find_field(t, name);
        if (field < 0) {
            *why = "entrance: no field line of that name before it";
            return -1;
        }
        q = e;
        for (i = 0; i < 4; i++) {
            if (q >= end || *q != ',') {
                *why = "entrance: x, y, triangle and direction are needed";
                return -1;
            }
            q = wp_skip(q + 1, end);
            e = wp_word_end(q, end);
            if (!wp_int(q, e, i < 2 ? -32768 : 0, i < 2 ? 32767 : i == 2 ? 65535 : 255, &v[i])) {
                *why = i < 2 ? "entrance: x and y are numbers -32768..32767" : i == 2 ? "entrance: the triangle is 0..65535" : "entrance: the direction is 0..255";
                return -1;
            }
            q = e;
        }
        if (q >= end || *q != ',') {
            *why = "entrance: from <field> gateway N | mapjump is needed";
            return -1;
        }
        q = wp_skip(q + 1, end);
        e = q;
        while (e < end && *e != ' ' && *e != '\t')
            e++;
        if (!wp_word_is(q, e, "from")) {
            *why = "entrance: from <field> gateway N | mapjump is needed";
            return -1;
        }
        q = wp_skip(e, end);
        for (e = q; e < end && *e != ' ' && *e != '\t'; e++)
            ;
        if (e == q || e - q >= WP_NAME) {
            *why = "entrance: the source field's name is missing or longer than 15";
            return -1;
        }
        wp_copy_text(en.from, WP_NAME, q, e);
        q = wp_skip(e, end);
        for (e = q; e < end && *e != ' ' && *e != '\t'; e++)
            ;
        if (wp_word_is(q, e, "mapjump")) {
            en.kind = 2;
            if (wp_skip(e, end) != end) {
                *why = "entrance: nothing may follow mapjump";
                return -1;
            }
        } else if (wp_word_is(q, e, "gateway")) {
            if (!wp_int(e, end, 0, 11, &n)) {
                *why = "entrance: the gateway is 0..11";
                return -1;
            }
            en.kind = 1;
            en.k = (BYTE)n;
        } else {
            *why = "entrance: from <field> gateway N | mapjump is needed";
            return -1;
        }
        if (t->entrances >= WP_ENTRANCES) {
            t->full++;
            *why = "entrance: the table holds 4096 entrances";
            return -1;
        }
        en.x = (short)v[0];
        en.y = (short)v[1];
        en.tri = (WORD)v[2];
        en.dir = (BYTE)v[3];
        en.field = (WORD)field;
        t->e[t->entrances++] = en;
        t->f[field].entrances++;
        return 2;
    }
    *why = "the key is not field or entrance";
    return -1;
}

/* The whole text [text, text + size): every line parsed, bad ones counted and the first said. */
static void wp_parse_table(struct wp_table *t, const char *text, DWORD size)
{
    const char *p = text, *end = text + size, *line_end;
    int i;

    t->fields = t->entrances = t->lines = t->bad = t->full = 0;
    t->first_bad_line = 0;
    t->first_bad_why = "";
    for (i = 0; i < WP_FIELDS; i++)
        t->f[i].id = -1;
    while (p < end) {
        const char *why = "";
        int r;

        for (line_end = p; line_end < end && *line_end != '\n'; line_end++)
            ;
        t->lines++;
        r = wp_parse_line(t, p, line_end, &why);
        if (r < 0) {
            if (!t->bad)
                t->first_bad_line = t->lines;
            if (!t->bad)
                t->first_bad_why = why;
            t->bad++;
        }
        p = line_end + 1;
    }
}

/* The fields with a maplist id of WP_FIRST_ID up, in id order: order[] gets their indexes in t->f, and f.id is set (-1 for the
   ones the maplist lacks). `block` is the maplist's names (32 bytes each, `count` of them); `skip` is the placeholder's name. */
static int wp_assign_ids(struct wp_table *t, const BYTE *block, DWORD count, const char *skip, short *order)
{
    DWORD id;
    int i, n = 0;

    for (i = 0; i < t->fields; i++)
        t->f[i].id = -1;
    if (!block)
        return 0;
    for (id = WP_FIRST_ID; id < count && id < 0x7fff; id++) {
        char name[33];
        int k;

        for (k = 0; k < 32; k++)
            name[k] = (char)block[id * 32 + k];
        name[32] = 0;
        if (!name[0] || wp_name_eq(name, skip))
            continue;
        k = wp_find_field(t, name);
        if (k < 0 || t->f[k].id >= 0)
            continue;
        t->f[k].id = (short)id;
        order[n++] = (short)k;
    }
    return n;
}

/* The field's entrances in the table's order, at most `max`: their indexes in t->e. */
static int wp_entrances_of(const struct wp_table *t, int field, short *out, int max)
{
    int i, n = 0;

    for (i = 0; i < t->entrances && n < max; i++)
        if (t->e[i].field == field)
            out[n++] = (short)i;
    return n;
}

/* The list's cursor: rows 0 .. special - 1 are the page's own, then `count` listed rows; held at both ends (no wrap), *top
   the first listed row shown (WP_LIST_ROWS rows). */
static void wp_cursor_move(int *row, int *top, int special, int count, int delta)
{
    int last = special + (count > 0 ? count : 0) - 1, most = count > WP_LIST_ROWS ? count - WP_LIST_ROWS : 0, r, k;

    r = *row + delta;
    if (r > last)
        r = last;
    if (r < 0)
        r = 0;
    *row = r;
    k = r - special;
    if (k >= 0 && k < *top)
        *top = k;
    if (k >= *top + WP_LIST_ROWS)
        *top = k - WP_LIST_ROWS + 1;
    if (*top > most)
        *top = most;
    if (*top < 0)
        *top = 0;
}

/* The number editor: five digits, the cursor on one of them. */
struct wp_num {
    long value, max;
    int digit;                  /* 0 = the leftmost (ten thousands) .. 4 = the units */
};

static const long wp_power[5] = { 10000, 1000, 100, 10, 1 };

static void wp_num_digit(struct wp_num *n, int delta)      /* Left / Right */
{
    n->digit += delta;
    if (n->digit < 0)
        n->digit = 0;
    if (n->digit > 4)
        n->digit = 4;
}

static void wp_num_step(struct wp_num *n, int delta)       /* Up (+1) / Down (-1) on the digit: the number held to 0 .. max */
{
    long v = n->value + (long)delta * wp_power[n->digit];

    if (v > n->max)
        v = n->max;
    if (v < 0)
        v = 0;
    n->value = v;
}

/* What the page asks of the game before anything is written. */
struct wp_where {
    int on;                     /* warp_menu is not off */
    int table;                  /* a table with fields is loaded */
    int mode;                   /* 00cbf9dc */
    int after_battle;           /* 00dc12f8 */
    int request, argument;      /* 00cc0d89, 00cc0d8a */
    int movie;                  /* 009a1010 */
    long id;                    /* the target's maplist id, -1: none */
    long id_count;              /* the maplist's count */
    int placeholder;            /* the target is the placeholder */
    int listed;                 /* the target is a field of the table with a maplist id */
    int triangles;              /* its walkmesh's triangles */
};

#define WP_GO                   0
#define WP_OFF                  1
#define WP_NO_TABLE             2
#define WP_WORLD_MAP            3
#define WP_NOT_FIELD            4
#define WP_SCRIPT_MENU          5
#define WP_MOVIE                6
#define WP_BAD_TARGET           7
#define WP_REFUSALS             8

static const char *const wp_refusal_text[WP_REFUSALS] = {
    "",
    "warp_menu = off in the game file",
    "no warp table: run tools/warp_table.py and put generated.txt in SpellExtConfig\\warp",
    "not from the world map: open the menu on a field",
    "only from the menu of a field",
    "opened by a script or at a save point: open it with the menu button",
    "a movie is playing",
    "that field is not listed (the world map, past the maplist, or no file)",
};

/* WP_GO, or why the page will not warp now (in this order). */
static int wp_refusal(const struct wp_where *w)
{
    if (!w->on)
        return WP_OFF;
    if (!w->table)
        return WP_NO_TABLE;
    if (w->mode == 3)
        return WP_WORLD_MAP;
    if (w->mode != 5 || w->after_battle)
        return WP_NOT_FIELD;
    if (w->request != 9 || w->argument != 0)
        return WP_SCRIPT_MENU;
    if (w->movie == 1)
        return WP_MOVIE;
    if (w->id < WP_FIRST_ID || w->id >= w->id_count || w->id > 0xffff || w->placeholder || !w->listed || w->triangles <= 0)
        return WP_BAD_TARGET;
    return WP_GO;
}

/* Point inside the triangle, edges included (the same test as warp_table.py's point_in_triangle). */
static int wp_in_triangle(const short *v, int x, int y)
{
    long long d1 = (long long)(x - v[4]) * (v[1] - v[5]) - (long long)(v[0] - v[4]) * (y - v[5]);
    long long d2 = (long long)(x - v[8]) * (v[5] - v[9]) - (long long)(v[4] - v[8]) * (y - v[9]);
    long long d3 = (long long)(x - v[0]) * (v[9] - v[1]) - (long long)(v[8] - v[0]) * (y - v[1]);
    int neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;

    return !(neg && pos);
}

/* The field file as the reader leaves it: the nine section offsets checked as flim_counts checks them; *off gets them.
   1, or 0 when it is not such a file. */
static int wp_offsets(const BYTE *file, DWORD room, DWORD *off)
{
    int i;

    if (!file || room < 42 || file[0] || file[1] || (file[2] | file[3] << 8 | (DWORD)file[4] << 16 | (DWORD)file[5] << 24) != 9)
        return 0;
    for (i = 0; i < 9; i++) {
        const BYTE *p = file + 6 + i * 4;

        off[i] = p[0] | (DWORD)p[1] << 8 | (DWORD)p[2] << 16 | (DWORD)p[3] << 24;
        if (off[i] < 42 || off[i] > room || room - off[i] < 4 || (i && (off[i] <= off[i - 1] || off[i] - off[i - 1] < 4)))
            return 0;
    }
    return 1;
}

/* Section `index` (0-based) of the file: its data, past the length word, up to the next section's offset (the last: the
   length word). 0 when the file is not readable. */
static int wp_section(const BYTE *file, DWORD room, int index, const BYTE **data, DWORD *length)
{
    DWORD off[9], end;

    if (!wp_offsets(file, room, off) || index < 0 || index > 8)
        return 0;
    if (index < 8)
        end = off[index + 1];
    else
        end = off[8] + 4 + (file[off[8]] | (DWORD)file[off[8] + 1] << 8 | (DWORD)file[off[8] + 2] << 16 | (DWORD)file[off[8] + 3] << 24);
    if (end > room || end < off[index] + 4)
        return 0;
    *data = file + off[index] + 4;
    *length = end - off[index] - 4;
    return 1;
}

#define WP_ARRIVE_KEEP          0       /* the entrance fits the walkmesh */
#define WP_ARRIVE_CENTRE        1       /* the triangle exists, the point is outside it: its centre */
#define WP_ARRIVE_TRI0          2       /* the triangle is past the mesh: the centre of triangle 0 */
#define WP_ARRIVE_NO_MESH       3       /* the walkmesh could not be read, or has no triangle: left as written */

struct wp_arrival {
    int kind;
    int x, y, tri;              /* what to write (x is the signed 16 bits) */
    DWORD triangles;
};

/* What the arrival makes of (x, y, tri) in the field file `file`. */
static void wp_arrival(const BYTE *file, DWORD room, int x, int y, int tri, struct wp_arrival *a)
{
    const BYTE *walk;
    DWORD length, count;
    short v[12];
    int i;

    a->kind = WP_ARRIVE_NO_MESH;
    a->x = x;
    a->y = y;
    a->tri = tri;
    a->triangles = 0;
    if (!wp_section(file, room, 4, &walk, &length) || length < 4)
        return;
    count = walk[0] | (DWORD)walk[1] << 8;
    if (!count || length - 4 < count * 24)
        return;
    a->triangles = count;
    if ((DWORD)tri >= count) {
        a->kind = WP_ARRIVE_TRI0;
        a->tri = 0;
        a->x = WP_CENTRE;
        a->y = 0;
        return;
    }
    if ((short)x == WP_CENTRE) {
        a->kind = WP_ARRIVE_KEEP;
        return;
    }
    for (i = 0; i < 12; i++)
        v[i] = (short)(walk[4 + tri * 24 + i * 2] | walk[4 + tri * 24 + i * 2 + 1] << 8);
    if (wp_in_triangle(v, (short)x, (short)y)) {
        a->kind = WP_ARRIVE_KEEP;
        return;
    }
    a->kind = WP_ARRIVE_CENTRE;
    a->x = WP_CENTRE;
    a->y = 0;
}
/* WARP MENU PURE END */

/* ---- the key (FF7_SpellExt_Game.ini; read at start-up and at Re-init, taken at once) ---- */
static int wp_key_menu = -1;                /* warp_menu: -1 not given (on), 0 off, 1 on */
static struct wp_table wp_table;
static short wp_order[WP_FIELDS];           /* the listed fields by id: indexes in wp_table.f */
static int wp_order_count;
static int wp_state;                        /* 0 the table is to be read (at the page's next opening), 1 read, -1 not found */
static BYTE wp_differs_told[(WP_FIELDS + 7) / 8];
static LONG warp_waiting;                   /* a warp was asked and no field has been read since (field_read_hook looks) */
static struct { int id; int x, y, tri, dir; char name[WP_NAME]; } wp_pending;
static struct { int valid; int id; int x, y, tri, dir; char name[WP_NAME]; } wp_last;      /* the page's Again row */

static void warp_menu_keys_begin(void)
{
    wp_key_menu = -1;
    wp_state = 0;                           /* (Re-init: the table is read again when the page is next opened) */
}

/* 0: not this key; 1: read; -1: a mistake (*fault says what). */
static int warp_menu_key_line(char *start, char *key_end, char *value, char *stop, const char **fault)
{
    if (!word_is(start, key_end, "warp_menu"))
        return 0;
    if (word_is(value, stop, "on") || word_is(value, stop, "yes"))
        wp_key_menu = 1;
    else if (word_is(value, stop, "off") || word_is(value, stop, "no"))
        wp_key_menu = 0;
    else {
        wp_key_menu = -1;
        *fault = "warp_menu must be on or off: on is used";
        return -1;
    }
    return 1;
}

static BOOL warp_menu_shown(void)           /* the page's row is in the debug list */
{
    return debug_menu && wp_key_menu != 0;
}

static void warp_menu_keys_settle(void)
{
    static char said[200];
    char line[200];

    if (!warp_menu_shown())
        wsprintfA(line, "warp menu: no page (%s)", wp_key_menu == 0 ? "warp_menu = off" : "debug = false: the SpellExt menu is not shown");
    else
        lstrcpyA(line, "warp menu: the SpellExt menu's \"Warp: fields, GameMoment\" is on (a testing aid: SpellExtConfig\\warp\\generated.txt is read when the page opens)");
    if (!lstrcmpA(line, said))
        return;
    lstrcpyA(said, line);
    log_line("%s", line);
}

/* ---- the table ---- */
#define WP_TABLE_FILE           "warp\\generated.txt"

static void warp_table_load(const char *why)
{
    DWORD size = 0;
    char *text = read_whole_file(WP_TABLE_FILE, &size);

    if (!text) {
        wp_table.fields = wp_table.entrances = 0;
        wp_order_count = 0;
        wp_state = -1;
        log_line("warp menu: no table (%s%s) (%s)", config_dir, WP_TABLE_FILE, why);
        return;
    }
    wp_parse_table(&wp_table, text, size);
    VirtualFree(text, 0, MEM_RELEASE);
    wp_state = 1;
    {
        int i;

        for (i = 0; i < (int)sizeof wp_differs_told; i++)
            wp_differs_told[i] = 0;
    }
    log_line("warp menu: table read (%s): %d fields, %d entrances, %d lines%s", why, wp_table.fields, wp_table.entrances, wp_table.lines,
             wp_table.bad ? "" : "; no bad line");
    if (wp_table.bad)
        log_line("warp menu: %d bad line(s) skipped; the first is line %d: %s", wp_table.bad, wp_table.first_bad_line, wp_table.first_bad_why);
    InterlockedExchange(&warp_active, 1);       /* (field_read_hook now looks at every field read) */
}

static void warp_ids_refresh(void)
{
    wp_order_count = wp_assign_ids(&wp_table, *(const BYTE *const *)ADDR_MAPLIST_BLOCK, *(const DWORD *)ADDR_MAPLIST_COUNT, FIELDS_PLACEHOLDER, wp_order);
}

/* ---- the arrival (from field_read_hook, while a warp is awaited or a table is read) ---- */
static void warp_field_read(const char *name, int result, BOOL resumed)
{
    const BYTE *file = *(const BYTE *const *)ADDR_FIELD_FILE;
    DWORD room = *(const DWORD *)ADDR_FIELD_FILE_ROOM;

    if (resumed)
        return;                             /* (back from a battle or a menu: nothing was read) */
    if (result && wp_state == 1 && file && wp_table.fields && !IsBadReadPtr(file, room)) {
        int k = wp_find_field(&wp_table, name ? fields_last_part(name) : "");   /* (the reader is given "<field>\\<field>") */
        const BYTE *walk, *gates;
        DWORD walk_length, gates_length;

        if (k >= 0 && !(wp_differs_told[k >> 3] & (1 << (k & 7))) && wp_section(file, room, 4, &walk, &walk_length) &&
            wp_section(file, room, 7, &gates, &gates_length) &&
            (crc32_of(walk, walk_length, 0) != wp_table.f[k].mesh || crc32_of(gates, gates_length, 0) != wp_table.f[k].gates)) {
            wp_differs_told[k >> 3] |= (BYTE)(1 << (k & 7));
            log_line("warp menu: warp table differs for %s: rebuild it (tools/warp_table.py)", wp_table.f[k].name);
        }
    }
    if (InterlockedExchange(&warp_waiting, 0)) {
        int id = *(const WORD *)ADDR_FIELD_MODULE_ID;
        struct wp_arrival a;
        int x = *(const short *)ADDR_FIELD_ENTRY_X, y = *(const short *)ADDR_FIELD_ENTRY_Y, tri = *(const WORD *)ADDR_FIELD_ENTRY_TRI;

        if (id != wp_pending.id) {
            log_line("warp menu: LOST: the warp to %s (field %d) was not taken: field %d (%.15s) was read instead (a script or a gateway went first)",
                     wp_pending.name, wp_pending.id, id, name ? name : "?");
        } else if (!result || !file || IsBadReadPtr(file, room)) {
            log_line("warp menu: the field %s (%d) was not read (the reader failed): the game's own fallback decides", wp_pending.name, id);
        } else {
            wp_arrival(file, room, x, y, tri, &a);
            if (x != wp_pending.x || y != wp_pending.y || tri != wp_pending.tri)
                log_line("warp menu: the entrance words changed since the request (%d,%d tri %d, now %d,%d tri %d): the new words are checked", wp_pending.x, wp_pending.y,
                         wp_pending.tri, x, y, tri);
            if (a.kind == WP_ARRIVE_NO_MESH) {
                log_line("warp menu: arrived in %s (%d): the walkmesh could not be read (%lu triangles): the entrance %d,%d tri %d is left as written",
                         wp_pending.name, id, a.triangles, x, y, tri);
            } else {
                if (a.kind != WP_ARRIVE_KEEP) {
                    *(WORD *)ADDR_FIELD_ENTRY_X = (WORD)a.x;
                    *(WORD *)ADDR_FIELD_ENTRY_Y = (WORD)a.y;
                    *(WORD *)ADDR_FIELD_ENTRY_TRI = (WORD)a.tri;
                }
                log_line("warp menu: arrived in %s (%d), %lu triangles: %s (%d,%d tri %d dir %u; written %d,%d tri %d)", wp_pending.name, id, a.triangles,
                         a.kind == WP_ARRIVE_KEEP ? (x == WP_CENTRE ? "the centre of the triangle, as asked" : "the entrance fits the walkmesh: kept")
                         : a.kind == WP_ARRIVE_CENTRE ? "the point is outside its triangle: moved to the triangle's centre"
                                                      : "the triangle is past the walkmesh: the centre of triangle 0",
                         x, y, tri, (unsigned)*(const WORD *)ADDR_FIELD_ENTRY_DIR, (short)*(const WORD *)ADDR_FIELD_ENTRY_X,
                         (short)*(const WORD *)ADDR_FIELD_ENTRY_Y, (int)*(const WORD *)ADDR_FIELD_ENTRY_TRI);
            }
        }
    }
}

/* ---- the page ---- */
#define WARP_VIEW               12
#define WARP_COLOUR_NOTE        2            /* the menu's red */
#define WARP_NOTE_WIDTH         64
#define WP_MODE_LIST            0
#define WP_MODE_ENTRANCES       1
#define WP_MODE_NUMBER          2
#define WP_NUM_MOMENT           0
#define WP_NUM_ID               1

static struct {
    int mode;
    int row, top;                           /* the list's cursor */
    int erow, etop, ecount;                 /* the entrances' cursor: row 0 is the centre of triangle 0 */
    int field;                              /* the field chosen (index in wp_table.f) */
    short elist[WP_ENTRANCE_MAX];
    int number_for;                         /* WP_NUM_MOMENT, WP_NUM_ID */
    struct wp_num num;
    int confirm;                            /* the entrance row that asked for a second OK (a warned field), -1 none */
    char note[200];
} wp_ui;

static void warp_note(const char *fmt, ...)
{
    va_list ap;
    char text[1040];     /* (wvsprintfA writes up to 1024 bytes) */
    int i;

    va_start(ap, fmt);
    wvsprintfA(text, fmt, ap);
    va_end(ap);
    lstrcpynA(wp_ui.note, text, (int)sizeof wp_ui.note);
    for (i = 0; wp_ui.note[i]; i++)
        if ((BYTE)wp_ui.note[i] < 0x20 || (BYTE)wp_ui.note[i] > 0x7e)
            wp_ui.note[i] = '?';
}

static const char *menu_warp(void)
{
    if (warp_waiting) {
        log_line("warp menu: the warp to %s (field %d) never arrived (the menu opened again first, request byte 00cc0d89 %u): dropped", wp_pending.name, wp_pending.id,
                 (unsigned)*(const BYTE *)ADDR_FIELD_REQUEST);
        InterlockedExchange(&warp_waiting, 0);
    }
    if (wp_state == 0)
        warp_table_load(wp_table.fields ? "re-read" : "first read");
    warp_ids_refresh();
    wp_ui.mode = WP_MODE_LIST;
    wp_ui.confirm = -1;
    wp_ui.note[0] = 0;
    wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, 0);
    battle_menu_check_pending("the SpellExt menu's warp page opened");
    menu_view = WARP_VIEW;
    return NULL;
}

static void warp_where(struct wp_where *w, int field)
{
    w->on = warp_menu_shown();
    w->table = wp_state == 1 && wp_table.fields > 0;
    w->mode = *(const short *)ADDR_GAME_MODE;
    w->after_battle = *(const DWORD *)ADDR_MENU_AFTER_BATTLE != 0;
    w->request = *(const BYTE *)ADDR_FIELD_REQUEST;
    w->argument = *(const short *)ADDR_FIELD_REQUEST_ARG;
    w->movie = *(const DWORD *)ADDR_MOVIE_PLAYING == 1;
    w->id_count = (long)*(const DWORD *)ADDR_MAPLIST_COUNT;
    w->id = -1;
    w->placeholder = 0;
    w->listed = 0;
    w->triangles = 0;
    if (field >= 0 && field < wp_table.fields) {
        w->id = wp_table.f[field].id;
        w->listed = wp_table.f[field].id >= 0;
        w->triangles = wp_table.f[field].triangles;
    }
}

/* The six words, the request last; the menu closes. */
static void warp_go(int field, int x, int y, int tri, int dir)
{
    const struct wp_field *f = &wp_table.f[field];

    battle_menu_check_pending("a warp");
    if (warp_waiting)
        log_line("warp menu: the earlier warp to %s (field %d) never arrived: dropped", wp_pending.name, wp_pending.id);
    lstrcpynA(wp_pending.name, f->name, WP_NAME);
    wp_pending.id = f->id;
    wp_pending.x = x;
    wp_pending.y = y;
    wp_pending.tri = tri;
    wp_pending.dir = dir;
    lstrcpynA(wp_last.name, f->name, WP_NAME);
    wp_last.valid = 1;
    wp_last.id = f->id;
    wp_last.x = x;
    wp_last.y = y;
    wp_last.tri = tri;
    wp_last.dir = dir;
    InterlockedExchange(&warp_active, 1);
    InterlockedExchange(&warp_waiting, 1);
    *(WORD *)ADDR_FIELD_REQUEST_ARG = (WORD)f->id;
    *(WORD *)ADDR_FIELD_ENTRY_X = (WORD)x;
    *(WORD *)ADDR_FIELD_ENTRY_Y = (WORD)y;
    *(WORD *)ADDR_FIELD_ENTRY_TRI = (WORD)tri;
    *(WORD *)ADDR_FIELD_ENTRY_DIR = (WORD)dir;
    *(BYTE *)ADDR_FIELD_REQUEST = 1;        /* last */
    log_line("warp menu: WARP to %s (field %d, \"%s\") asked from field %u: 00cc0d8a = %d, x %d, y %d, triangle %d, direction %d, 00cc0d89 = 1, and the menu closed (00dc12f4 = 1)",
             f->name, f->id, f->title, (unsigned)*(const WORD *)ADDR_FIELD_MODULE_ID, f->id, x, y, tri, dir);
    *(DWORD *)ADDR_MENU_FINISHED = 1;       /* the module leaves on it (006cc623); the main menu's close block, which would clear the request, is not run */
}

/* OK on an entrance row (0: the centre of triangle 0; 1 up: the field's entrances), or on Again (entrance < 0). */
static void warp_try(int field, int entrance_row)
{
    struct wp_where w;
    int refusal, x = WP_CENTRE, y = 0, tri = 0, dir = 0;

    if (entrance_row > 0) {
        const struct wp_entrance *e = &wp_table.e[wp_ui.elist[entrance_row - 1]];

        x = e->x;
        y = e->y;
        tri = e->tri;
        dir = e->dir;
    }
    warp_where(&w, field);
    refusal = wp_refusal(&w);
    if (refusal != WP_GO) {
        ((void (__cdecl *)(int))FN_MENU_SOUND)(3);
        warp_note("Warp refused: %s", wp_refusal_text[refusal]);
        log_line("warp menu: warp to %s REFUSED: %s (on %d, table %d, mode %d, menu after a battle %d, request %d with %d, movie flag %lu, id %ld of %ld)",
                 field >= 0 && field < wp_table.fields ? wp_table.f[field].name : "?", wp_refusal_text[refusal], w.on, w.table, w.mode, w.after_battle,
                 w.request, w.argument, (unsigned long)*(const DWORD *)ADDR_MOVIE_PLAYING, w.id, w.id_count);
        return;
    }
    if (wp_table.f[field].warn != WP_WARN_NONE && wp_ui.confirm != entrance_row) {
        ((void (__cdecl *)(int))FN_MENU_SOUND)(3);
        wp_ui.confirm = entrance_row;
        warp_note("Warning: %s. OK again to warp anyway", wp_warn_text[wp_table.f[field].warn]);
        return;
    }
    ((void (__cdecl *)(int))FN_MENU_SOUND)(1);
    warp_go(field, x, y, tri, dir);
}

static void warp_again(void)
{
    int field;

    if (!wp_last.valid) {
        ((void (__cdecl *)(int))FN_MENU_SOUND)(3);
        warp_note("Nothing has been warped to from this page yet");
        return;
    }
    field = wp_find_field(&wp_table, wp_last.name);
    if (field < 0) {
        ((void (__cdecl *)(int))FN_MENU_SOUND)(3);
        warp_note("The last warp's field is not in the table now");
        return;
    }
    {
        struct wp_where w;
        int refusal;

        warp_where(&w, field);
        refusal = wp_refusal(&w);
        if (refusal != WP_GO) {
            ((void (__cdecl *)(int))FN_MENU_SOUND)(3);
            warp_note("Warp refused: %s", wp_refusal_text[refusal]);
            log_line("warp menu: warp again to %s REFUSED: %s", wp_last.name, wp_refusal_text[refusal]);
            return;
        }
    }
    ((void (__cdecl *)(int))FN_MENU_SOUND)(1);
    warp_go(field, wp_last.x, wp_last.y, wp_last.tri, wp_last.dir);
}

static void warp_open_entrances(int field)
{
    wp_ui.field = field;
    wp_ui.ecount = wp_entrances_of(&wp_table, field, wp_ui.elist, WP_ENTRANCE_MAX) + 1;     /* + the centre of triangle 0 */
    wp_ui.erow = wp_ui.ecount > 1 ? 1 : 0;
    wp_ui.etop = 0;
    wp_ui.confirm = -1;
    wp_cursor_move(&wp_ui.erow, &wp_ui.etop, 0, wp_ui.ecount, 0);
    wp_ui.mode = WP_MODE_ENTRANCES;
    wp_ui.note[0] = 0;
}

static void warp_open_number(int for_what)
{
    wp_ui.number_for = for_what;
    wp_ui.num.digit = 4;
    if (for_what == WP_NUM_MOMENT) {
        wp_ui.num.value = *(const WORD *)ADDR_GAME_MOMENT;
        wp_ui.num.max = 65535;
    } else {
        int k = wp_ui.row - WP_SPECIAL_ROWS;

        wp_ui.num.value = k >= 0 && k < wp_order_count ? wp_table.f[wp_order[k]].id : WP_FIRST_ID;
        wp_ui.num.max = wp_order_count ? wp_table.f[wp_order[wp_order_count - 1]].id : WP_FIRST_ID;
    }
    wp_ui.mode = WP_MODE_NUMBER;
    wp_ui.note[0] = 0;
}

/* OK in the number editor: GameMoment is written; a field id moves the list's cursor to the first field of that id or above. */
static void warp_number_ok(void)
{
    if (wp_ui.number_for == WP_NUM_MOMENT) {
        WORD before = *(const WORD *)ADDR_GAME_MOMENT;

        *(WORD *)ADDR_GAME_MOMENT = (WORD)wp_ui.num.value;
        log_line("warp menu: GameMoment (00dc08dc, field variable [2:0]) %u -> %u (a testing aid: the word in the save block, nothing else written)",
                 (unsigned)before, (unsigned)wp_ui.num.value);
        warp_note("GameMoment is now %u (was %u)", (unsigned)wp_ui.num.value, (unsigned)before);
    } else {
        int k;

        for (k = 0; k < wp_order_count && wp_table.f[wp_order[k]].id < wp_ui.num.value; k++)
            ;
        if (k >= wp_order_count)
            k = wp_order_count - 1;
        if (k >= 0) {
            wp_ui.row = WP_SPECIAL_ROWS + k;
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, 0);
            if (wp_table.f[wp_order[k]].id != wp_ui.num.value)
                warp_note("No listed field has id %ld: the cursor is on the next one, %d", wp_ui.num.value, wp_table.f[wp_order[k]].id);
        }
    }
    wp_ui.mode = WP_MODE_LIST;
}

/* A line of the red note, cut at WARP_NOTE_WIDTH on a space. */
static void warp_draw_note(int x, int y, int rows)
{
    const char *p = wp_ui.note;
    int row;

    for (row = 0; row < rows && *p; row++) {
        char piece[WARP_NOTE_WIDTH + 1];
        int length = lstrlenA(p), cut = length;

        if (cut > WARP_NOTE_WIDTH) {
            for (cut = WARP_NOTE_WIDTH; cut > WARP_NOTE_WIDTH / 2 && p[cut] != ' '; cut--)
                ;
            if (p[cut] != ' ')
                cut = WARP_NOTE_WIDTH;
        }
        lstrcpynA(piece, p, cut + 1);
        screen_line(x, y + row * VIEW_ROW_PITCH, WARP_COLOUR_NOTE, "%s", piece);
        p += cut;
        while (*p == ' ')
            p++;
    }
}

static void draw_warp_view(void)
{
    int top = 0x33 + 0x0c + 3 * VIEW_ROW_PITCH + 4, row, y;

    menu_text_quarters = 3;
    if (wp_ui.mode == WP_MODE_NUMBER) {
        int i, shown = (int)wp_ui.num.value;

        screen_line(0x30, 0x33 + 0x0c, 5, "%s", wp_ui.number_for == WP_NUM_MOMENT ? "GameMoment (the story's progress, field variable [2:0])" : "Go to the field with this id");
        screen_line(0x30, 0x33 + 0x0c + VIEW_ROW_PITCH, 0, "range 0 to %d%s", (int)wp_ui.num.max, wp_ui.number_for == WP_NUM_MOMENT ? "" : " (the listed fields)");
        for (i = 0; i < 5; i++) {
            int digit = (shown / (int)wp_power[i]) % 10;

            screen_line(0xb0 + i * 0x24, top + 0x20, i == wp_ui.num.digit ? 5 : 7, "%d", digit);
        }
        screen_line(0xb0 + wp_ui.num.digit * 0x24, top + 0x20 + VIEW_ROW_PITCH, 5, "^");
        if (wp_ui.number_for == WP_NUM_MOMENT)
            screen_line(0x30, top + 0x20 + 3 * VIEW_ROW_PITCH, 0, "now in the game: %d", (int)*(const WORD *)ADDR_GAME_MOMENT);
        lstrcpyA(spell_view_line, "Left/Right: digit   Up/Down: change   OK: take   Cancel: leave");
        menu_text_quarters = 4;
        return;
    }
    if (wp_ui.mode == WP_MODE_ENTRANCES) {
        const struct wp_field *f = &wp_table.f[wp_ui.field];
        static const int column[4] = { 0x30, 0x108, 0x160, 0x1b8 };

        screen_line(0x30, 0x33 + 0x0c, 5, "%s", f->name);
        screen_line(0xb0, 0x33 + 0x0c, 7, "id %d   %s", f->id, f->title[0] ? f->title : "(no title)");
        screen_line(0x30, 0x33 + 0x0c + VIEW_ROW_PITCH, 7, "%d walkmesh triangles   %d entrances", (int)f->triangles, (int)f->entrances);
        if (f->warn)
            screen_line(0x30, 0x33 + 0x0c + 2 * VIEW_ROW_PITCH, WARP_COLOUR_NOTE, "Warning: %s", wp_warn_text[f->warn]);
        menu_text_ascii(column[0], top, "From", 5);
        menu_text_ascii(column[1], top, "x", 5);
        menu_text_ascii(column[2], top, "y", 5);
        menu_text_ascii(column[3], top, "Tri", 5);
        menu_text_ascii(column[3] + 0x60, top, "Dir", 5);
        if (wp_ui.note[0]) {
            warp_draw_note(0x30, top + 0x1a, WP_LIST_ROWS);
            lstrcpyA(spell_view_line, "Cancel: back");
        } else {
            for (row = 0; row < WP_LIST_ROWS && wp_ui.etop + row < wp_ui.ecount; row++) {
                int r = wp_ui.etop + row;

                y = top + 0x1a + row * VIEW_ROW_PITCH;
                if (r == 0) {
                    screen_line(0x30, y, 7, "The centre of triangle 0 (the safe default)");
                } else {
                    const struct wp_entrance *e = &wp_table.e[wp_ui.elist[r - 1]];

                    if (e->kind == 1)
                        screen_line(column[0], y, 7, "%s gate %d", e->from, (int)e->k);
                    else
                        screen_line(column[0], y, 7, "%s jump", e->from);
                    if ((short)e->x == WP_CENTRE) {
                        screen_line(column[1], y, 7, "centre");
                    } else {
                        screen_line(column[1], y, 7, "%d", (int)e->x);
                        screen_line(column[2], y, 7, "%d", (int)e->y);
                    }
                    screen_line(column[3], y, 7, "%d", (int)e->tri);
                    screen_line(column[3] + 0x60, y, 7, "%d", (int)e->dir);
                }
            }
            wsprintfA(spell_view_line, "OK: warp here   Cancel: back   (%d rows)", wp_ui.ecount);
        }
        y = wp_ui.note[0] ? 0 : top + 0x1a + (wp_ui.erow - wp_ui.etop) * VIEW_ROW_PITCH;
        menu_text_quarters = 4;
        if (!wp_ui.note[0])
            ((void (__cdecl *)(int, int, DWORD))FN_DRAW_CURSOR)(0x04, y + 2, DEPTH_CURSOR);
        return;
    }
    /* the list */
    {
        static const char *const heading[4] = { "Id", "Field", "Title", "In" };
        static const int column[4] = { 0x30, 0x6c, 0xe0, 0x210 };
        int k;

        y = 0x33 + 0x0c;
        screen_line(0x30, y, 5, "GameMoment");
        screen_line(0xb0, y, 7, "%d", (int)*(const WORD *)ADDR_GAME_MOMENT);
        screen_line(0x130, y, 0, "OK: edit");
        y += VIEW_ROW_PITCH;
        screen_line(0x30, y, 5, "Again");
        if (wp_last.valid)
            screen_line(0xb0, y, 7, "%s  (%d, %d) triangle %d", wp_last.name, wp_last.x, wp_last.y, wp_last.tri);
        else
            screen_line(0xb0, y, 0, "none yet");
        y += VIEW_ROW_PITCH;
        screen_line(0x30, y, 0, "A warp skips the story; GameMoment is the story's progress");
        for (k = 0; k < 4; k++)
            menu_text_ascii(column[k], top, heading[k], 5);
        if (wp_ui.note[0]) {
            warp_draw_note(0x30, top + 0x1a, WP_LIST_ROWS);
            lstrcpyA(spell_view_line, "Cancel: back");
        } else {
            for (row = 0; row < WP_LIST_ROWS && wp_ui.top + row < wp_order_count; row++) {
                const struct wp_field *f = &wp_table.f[wp_order[wp_ui.top + row]];

                y = top + 0x1a + row * VIEW_ROW_PITCH;
                screen_line(column[0], y, 7, "%d", (int)f->id);
                screen_line(column[1], y, 7, "%s", f->name);
                screen_line(column[2], y, f->title[0] ? 7 : 0, "%s", f->title[0] ? f->title : "-");
                screen_line(column[3], y, 7, "%d", (int)f->entrances);
                if (f->warn)
                    screen_line(column[3] + 0x30, y, WARP_COLOUR_NOTE, "%s", wp_warn_short[f->warn]);
            }
            if (!wp_order_count)
                screen_line(0x30, top + 0x1a, 0, "%s", wp_state == 1 ? "The table lists no field the maplist has" : "No table: SpellExtConfig\\warp\\generated.txt (tools/warp_table.py)");
            wsprintfA(spell_view_line, "OK: entrances   [SWITCH]: go to id   page %d   (%d fields)", WP_LIST_ROWS, wp_order_count);
        }
        if (wp_ui.row < WP_SPECIAL_ROWS)
            y = 0x33 + 0x0c + wp_ui.row * VIEW_ROW_PITCH;
        else
            y = top + 0x1a + (wp_ui.row - WP_SPECIAL_ROWS - wp_ui.top) * VIEW_ROW_PITCH;
        menu_text_quarters = 4;
        if (!wp_ui.note[0] || wp_ui.row < WP_SPECIAL_ROWS)
            ((void (__cdecl *)(int, int, DWORD))FN_DRAW_CURSOR)(0x04, y + 2, DEPTH_CURSOR);
    }
}

#define WP_BUTTON_REPEAT(mask, id)  (((int (__cdecl *)(int, int))FN_BUTTON_REPEAT)((mask), (id)))
#define WP_BUTTON_ONCE(mask)        (((int (__cdecl *)(int))FN_BUTTON_ONCE)((mask)))
#define WP_BUTTON_PRESSED(mask)     (((unsigned (__cdecl *)(unsigned))FN_BUTTON_PRESSED)((mask)))
#define WP_SOUND(n)                 (((void (__cdecl *)(int))FN_MENU_SOUND)((n)))

static void warp_view_input(void)
{
    if (*(const DWORD *)ADDR_MENU_FINISHED)
        return;                     /* (a warp was asked this frame: the module leaves; no second OK if the handler runs again) */
    if (wp_ui.mode == WP_MODE_NUMBER) {
        if (WP_BUTTON_REPEAT(0x1000, 1)) {
            wp_num_step(&wp_ui.num, 1);
        } else if (WP_BUTTON_REPEAT(0x4000, 2)) {
            wp_num_step(&wp_ui.num, -1);
        } else if (WP_BUTTON_REPEAT(0x8000, 8)) {
            int before = wp_ui.num.digit;

            wp_num_digit(&wp_ui.num, -1);
            if (wp_ui.num.digit != before)
                WP_SOUND(1);
        } else if (WP_BUTTON_REPEAT(0x2000, 4)) {
            int before = wp_ui.num.digit;

            wp_num_digit(&wp_ui.num, 1);
            if (wp_ui.num.digit != before)
                WP_SOUND(1);
        } else if (WP_BUTTON_PRESSED(0x20)) {
            WP_SOUND(1);
            warp_number_ok();
        } else if (WP_BUTTON_PRESSED(0x40)) {
            WP_SOUND(4);
            wp_ui.mode = WP_MODE_LIST;
        }
        return;
    }
    if (wp_ui.mode == WP_MODE_ENTRANCES) {
        int before = wp_ui.erow, step = WP_LIST_ROWS;

        if (wp_ui.note[0]) {
            unsigned ok = WP_BUTTON_PRESSED(0x20);

            if (ok && wp_ui.confirm == wp_ui.erow) {        /* "OK again": a warned field's second OK on the same row */
                wp_ui.note[0] = 0;
                warp_try(wp_ui.field, wp_ui.erow);
            } else if (ok || WP_BUTTON_PRESSED(0x40) || WP_BUTTON_REPEAT(0x1000, 1) || WP_BUTTON_REPEAT(0x4000, 2)) {
                wp_ui.note[0] = 0;
                wp_ui.confirm = -1;
                WP_SOUND(4);
            }
            return;
        }
        if (WP_BUTTON_REPEAT(0x1000, 1))
            wp_cursor_move(&wp_ui.erow, &wp_ui.etop, 0, wp_ui.ecount, -1);
        else if (WP_BUTTON_REPEAT(0x4000, 2))
            wp_cursor_move(&wp_ui.erow, &wp_ui.etop, 0, wp_ui.ecount, 1);
        else if (WP_BUTTON_ONCE(4))
            wp_cursor_move(&wp_ui.erow, &wp_ui.etop, 0, wp_ui.ecount, -step);
        else if (WP_BUTTON_ONCE(8))
            wp_cursor_move(&wp_ui.erow, &wp_ui.etop, 0, wp_ui.ecount, step);
        if (wp_ui.erow != before) {
            wp_ui.confirm = -1;
            WP_SOUND(1);
            return;
        }
        if (WP_BUTTON_PRESSED(0x20)) {
            warp_try(wp_ui.field, wp_ui.erow);
        } else if (WP_BUTTON_PRESSED(0x40)) {
            WP_SOUND(4);
            wp_ui.mode = WP_MODE_LIST;
            wp_ui.note[0] = 0;
        }
        return;
    }
    {
        int before = wp_ui.row, step = WP_LIST_ROWS;

        if (wp_ui.note[0]) {        /* (a note covers the list until a button) */
            if (WP_BUTTON_PRESSED(0x40) || WP_BUTTON_PRESSED(0x20) || WP_BUTTON_REPEAT(0x1000, 1) || WP_BUTTON_REPEAT(0x4000, 2)) {
                wp_ui.note[0] = 0;
                WP_SOUND(4);
            }
            return;
        }
        if (WP_BUTTON_REPEAT(0x1000, 1))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, -1);
        else if (WP_BUTTON_REPEAT(0x4000, 2))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, 1);
        else if (WP_BUTTON_ONCE(4))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, -step);
        else if (WP_BUTTON_ONCE(8))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, step);
        else if (WP_BUTTON_REPEAT(0x8000, 8))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, -WP_JUMP);
        else if (WP_BUTTON_REPEAT(0x2000, 4))
            wp_cursor_move(&wp_ui.row, &wp_ui.top, WP_SPECIAL_ROWS, wp_order_count, WP_JUMP);
        if (wp_ui.row != before) {
            WP_SOUND(1);
            return;
        }
        if (WP_BUTTON_PRESSED(0x80)) {
            if (wp_order_count) {
                WP_SOUND(1);
                warp_open_number(WP_NUM_ID);
            } else {
                WP_SOUND(3);
            }
        } else if (WP_BUTTON_PRESSED(0x20)) {
            if (wp_ui.row == 0) {
                WP_SOUND(1);
                warp_open_number(WP_NUM_MOMENT);
            } else if (wp_ui.row == 1) {
                warp_again();
            } else if (wp_ui.row - WP_SPECIAL_ROWS < wp_order_count) {
                WP_SOUND(1);
                warp_open_entrances(wp_order[wp_ui.row - WP_SPECIAL_ROWS]);
            }
        } else if (WP_BUTTON_PRESSED(0x40)) {
            WP_SOUND(4);
            wp_ui.note[0] = 0;
            menu_view = 0;
        }
    }
}
/* ==== WARP PAGE: end ==== */
