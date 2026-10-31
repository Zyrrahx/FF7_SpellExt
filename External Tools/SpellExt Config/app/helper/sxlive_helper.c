/* sxlive_helper.exe: the Live tables page's memory reader on Windows (SpellExt Config, design 1.9).
 *
 * READ ONLY, by construction: the game is opened with PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION and
 * nothing else, so the handle cannot write, attach, suspend or create threads; the only calls made with it are
 * ReadProcessMemory and VirtualQueryEx. The module list comes from a Toolhelp snapshot (no handle of ours).
 *
 * Spoken to by the app's main process over stdin / stdout, one JSON object per line each way:
 *   {"op":"find"}                                -> {"pid":1234} | {"pid":null}            (ff7_en.exe, any case)
 *   {"op":"maps","pid":1234}                     -> {"maps":[{"start":"00400000","end":"00401000","perms":"r--",
 *                                                    "name":"C:\\...\\ff7_en.exe"},...]}     (committed regions; the
 *                                                    module's path on its regions; when VirtualQueryEx is refused,
 *                                                    the modules and one region over the rest of the 32-bit space)
 *                                                 | {"error":"gone"|"refused","text":"..."}
 *   {"op":"read","pid":1234,"addr":"00dbfd38","len":65536}
 *                                                -> {"data":"<hex>"} | {"error":"unmapped"|"eio"|"gone"|"refused","text":"..."}
 * At most 1 MB a read. Unknown or malformed requests get {"error":"eio","text":"bad request"}.
 *
 * Written for x86_64-w64-mingw32-gcc (plain Win32, kernel32 only; -lpsapi kept on the command line of the build for
 * older toolchains). NOT SEEN WORKING: it cannot be run on the machine it was written on.
 *   x86_64-w64-mingw32-gcc -O2 -s -municode -o sxlive_helper.exe sxlive_helper.c -lpsapi
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <tlhelp32.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_LINE 4096
#define MAX_READ (1024 * 1024)
#define TOP_32 0x100000000ULL

static const DWORD READ_ACCESS = PROCESS_VM_READ | PROCESS_QUERY_LIMITED_INFORMATION;

/* ---- output -------------------------------------------------------------------------------------------------------- */
static void put_json_string(const char *s)
{
    putchar('"');
    for (; *s; s++) {
        unsigned char c = (unsigned char)*s;
        if (c == '"' || c == '\\') { putchar('\\'); putchar(c); }
        else if (c < 0x20) printf("\\u%04x", c);
        else putchar(c);
    }
    putchar('"');
}

static void put_error(const char *kind, const char *text)
{
    fputs("{\"error\":", stdout);
    put_json_string(kind);
    fputs(",\"text\":", stdout);
    put_json_string(text);
    fputs("}\n", stdout);
}

static void last_error_text(char *buf, size_t n, const char *what)
{
    DWORD e = GetLastError();
    char msg[256] = "";
    FormatMessageA(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, NULL, e, 0, msg, sizeof msg, NULL);
    for (char *p = msg; *p; p++) if (*p == '\r' || *p == '\n') *p = ' ';
    snprintf(buf, n, "%s: error %lu %s", what, (unsigned long)e, msg);
}

/* the path of a wide string as UTF-8 */
static void utf8_of(const WCHAR *w, char *out, int n)
{
    if (!WideCharToMultiByte(CP_UTF8, 0, w, -1, out, n, NULL, NULL)) out[0] = 0;
}

/* ---- the request's fields (a request is one small JSON object written by the app) ----------------------------------- */
static int field_str(const char *line, const char *key, char *out, size_t n)
{
    char pat[64];
    snprintf(pat, sizeof pat, "\"%s\":\"", key);
    const char *p = strstr(line, pat);
    if (!p) return 0;
    p += strlen(pat);
    size_t k = 0;
    while (*p && *p != '"' && k + 1 < n) out[k++] = *p++;
    out[k] = 0;
    return *p == '"';
}

static int field_num(const char *line, const char *key, unsigned long long *out)
{
    char pat[64];
    snprintf(pat, sizeof pat, "\"%s\":", key);
    const char *p = strstr(line, pat);
    if (!p) return 0;
    p += strlen(pat);
    if (*p < '0' || *p > '9') return 0;
    *out = strtoull(p, NULL, 10);
    return 1;
}

/* ---- the operations ----------------------------------------------------------------------------------------------- */
static void op_find(void)
{
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    DWORD found = 0;
    if (snap != INVALID_HANDLE_VALUE) {
        PROCESSENTRY32W pe;
        pe.dwSize = sizeof pe;
        if (Process32FirstW(snap, &pe)) {
            do {
                if (_wcsicmp(pe.szExeFile, L"ff7_en.exe") == 0) { found = pe.th32ProcessID; break; }
            } while (Process32NextW(snap, &pe));
        }
        CloseHandle(snap);
    }
    if (found) printf("{\"pid\":%lu}\n", (unsigned long)found);
    else fputs("{\"pid\":null}\n", stdout);
}

/* opens the game for reading only; on failure writes the error line and returns NULL */
static HANDLE open_game(DWORD pid)
{
    HANDLE h = OpenProcess(READ_ACCESS, FALSE, pid);
    if (!h) {
        char text[400];
        DWORD e = GetLastError();
        last_error_text(text, sizeof text, "OpenProcess");
        put_error(e == ERROR_ACCESS_DENIED ? "refused" : "gone", text);
        return NULL;
    }
    DWORD code = 0;
    if (GetExitCodeProcess(h, &code) && code != STILL_ACTIVE) {
        CloseHandle(h);
        put_error("gone", "the game has ended");
        return NULL;
    }
    return h;
}

typedef struct { unsigned long long base, end; char path[MAX_PATH * 3]; } Module;

static int list_modules(DWORD pid, Module *mods, int most)
{
    int n = 0;
    HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE | TH32CS_SNAPMODULE32, pid);
    if (snap == INVALID_HANDLE_VALUE) return 0;
    MODULEENTRY32W me;
    me.dwSize = sizeof me;
    if (Module32FirstW(snap, &me)) {
        do {
            if (n >= most) break;
            mods[n].base = (unsigned long long)(ULONG_PTR)me.modBaseAddr;
            mods[n].end = mods[n].base + me.modBaseSize;
            utf8_of(me.szExePath, mods[n].path, (int)sizeof mods[n].path);
            n++;
        } while (Module32NextW(snap, &me));
    }
    CloseHandle(snap);
    return n;
}

static const char *perms_of(DWORD protect)
{
    if (protect & (PAGE_GUARD | PAGE_NOACCESS)) return "---";
    switch (protect & 0xff) {
        case PAGE_READONLY: return "r--";
        case PAGE_READWRITE: return "rw-";
        case PAGE_WRITECOPY: return "rw-";
        case PAGE_EXECUTE: return "--x";
        case PAGE_EXECUTE_READ: return "r-x";
        case PAGE_EXECUTE_READWRITE: return "rwx";
        case PAGE_EXECUTE_WRITECOPY: return "rwx";
        default: return "---";
    }
}

static void put_region(int *first, unsigned long long a, unsigned long long b, const char *perms, const char *name)
{
    printf("%s{\"start\":\"%08llx\",\"end\":\"%08llx\",\"perms\":\"%s\",\"name\":", *first ? "" : ",", a, b, perms);
    put_json_string(name);
    putchar('}');
    *first = 0;
}

static void op_maps(DWORD pid)
{
    static Module mods[1024];
    HANDLE h = open_game(pid);
    if (!h) return;
    int nmods = list_modules(pid, mods, 1024);
    int first = 1;
    MEMORY_BASIC_INFORMATION mbi;
    unsigned long long a = 0;
    int queried = 0;
    fputs("{\"maps\":[", stdout);
    while (a < TOP_32 && VirtualQueryEx(h, (LPCVOID)(ULONG_PTR)a, &mbi, sizeof mbi) == sizeof mbi) {
        unsigned long long base = (unsigned long long)(ULONG_PTR)mbi.BaseAddress;
        unsigned long long end = base + mbi.RegionSize;
        queried = 1;
        if (mbi.State == MEM_COMMIT) {
            const char *name = "";
            for (int i = 0; i < nmods; i++) if (base >= mods[i].base && base < mods[i].end) { name = mods[i].path; break; }
            put_region(&first, base, end > TOP_32 ? TOP_32 : end, perms_of(mbi.Protect), name);
        }
        if (end <= a) break;
        a = end;
    }
    if (!queried) {
        /* VirtualQueryEx refused (it may want PROCESS_QUERY_INFORMATION, which this reader does not ask for): the
           modules, and the rest of the 32-bit space as one readable region, to 0xffff0000 (ff7_en.exe is large-
           address-aware, so its heap may lie above 2 GB); a read there that fails says so */
        unsigned long long at = 0x10000;
        for (int i = 0; i < nmods; i++) if (mods[i].base < TOP_32) put_region(&first, mods[i].base, mods[i].end, "r--", mods[i].path);
        put_region(&first, at, 0xffff0000ULL, "r--", "");
    }
    fputs("]}\n", stdout);
    CloseHandle(h);
}

static void op_read(DWORD pid, unsigned long long addr, unsigned long long len)
{
    static unsigned char buf[MAX_READ];
    if (len > MAX_READ || addr + len > TOP_32) { put_error("unmapped", "outside the game's 32-bit space or over 1 MB"); return; }
    HANDLE h = open_game(pid);
    if (!h) return;
    SIZE_T got = 0;
    BOOL ok = ReadProcessMemory(h, (LPCVOID)(ULONG_PTR)addr, buf, (SIZE_T)len, &got);
    if (!ok || got != len) {
        char text[400];
        DWORD e = GetLastError();
        last_error_text(text, sizeof text, "ReadProcessMemory");
        DWORD code = 0;
        if (GetExitCodeProcess(h, &code) && code != STILL_ACTIVE) put_error("gone", "the game has ended");
        else if (e == ERROR_ACCESS_DENIED) put_error("refused", text);
        else if (e == ERROR_PARTIAL_COPY || e == ERROR_NOACCESS) put_error("unmapped", text);
        else put_error("eio", text);
        CloseHandle(h);
        return;
    }
    CloseHandle(h);
    static const char hexd[] = "0123456789abcdef";
    fputs("{\"data\":\"", stdout);
    for (SIZE_T i = 0; i < got; i++) { putchar(hexd[buf[i] >> 4]); putchar(hexd[buf[i] & 15]); }
    fputs("\"}\n", stdout);
}

int wmain(void)
{
    static char line[MAX_LINE];
    setvbuf(stdout, NULL, _IOFBF, 1 << 16);
    while (fgets(line, sizeof line, stdin)) {
        char op[32], addr[32];
        unsigned long long pid = 0, len = 0;
        if (!field_str(line, "op", op, sizeof op)) put_error("eio", "bad request");
        else if (strcmp(op, "find") == 0) op_find();
        else if (strcmp(op, "maps") == 0 && field_num(line, "pid", &pid)) op_maps((DWORD)pid);
        else if (strcmp(op, "read") == 0 && field_num(line, "pid", &pid) && field_str(line, "addr", addr, sizeof addr) &&
                 field_num(line, "len", &len)) op_read((DWORD)pid, strtoull(addr, NULL, 16), len);
        else put_error("eio", "bad request");
        fflush(stdout);
    }
    return 0;
}
