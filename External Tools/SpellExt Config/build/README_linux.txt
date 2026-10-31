SpellExt Config (Linux, x86-64)
===============================

The editor of the SpellExt .ini files (FINAL FANTASY VII, the SpellExt mod), as a program of its own.
No install, no Python, no browser needed. Extract the zip anywhere and run ./spellext-config.

Open the SpellExt folder
  A window opens on "Open the SpellExt folder". Click Browse... (or drop a folder on the drop zone) and pick
  either the mod folder (the one with FF7_SpellExt.dll and SpellExtConfig, under 7th Heaven's mods folder) or
  its SpellExtConfig folder. A folder without any FF7_SpellExt_*.ini file is refused with what was looked for.
  The last five folders are offered next time (Enter opens the one selected); Settings > "Open the last folder
  at start" skips the screen.

  ./spellext-config --config "/path/to/mods/FF7 SpellExt" [--game DIR] [--mods DIR] [--log FILE]
  opens straight into that folder (--game: the folder of ff7_en.exe, for the Game log page and the kernel;
  --mods: 7th Heaven's mods folder; --log: the tool's own errors are also written to FILE). Without --game the
  game folder is taken from 7th Heaven's settings.xml when it is found.

Editing
  The sidebar has one entry per kind of file (Game options, Spells, Materia, Weapons, Items, Characters,
  Limits, Shops, Fields, ...). Each page: the file's sections, a form for the chosen one, the Raw text and the
  Changes (the diff) one click away, and the problems the DLL would log, on the line they are about.
  Every key, comment and section stays editable; Add a key takes any name.

The Library
  Library (in the sidebar, or "+ Add from template" on a page): pick a kind (item, weapon, armour, accessory,
  materia, spell, shop line, character, AI), a template, fill the short form (the next free ID is suggested),
  and Preview shows the exact lines and whether the DLL would report anything new. Add makes ordinary unsaved
  edits; nothing is written until Save. Every built-in template is built on the game's own data.
  "Save as template" on a section keeps it as a template of your own in
  SpellExtConfig/FF7_SpellExt_Templates.txt (plain text; Import and Export are on the Library page).
  examples/FF7_SpellExt_Templates.txt in this folder is an example of that file (three templates on vanilla
  bases): Library > Import... adds them to your own templates file. (Copy it into SpellExtConfig only if
  you have no FF7_SpellExt_Templates.txt there yet: a copy replaces that file.) The mod package carries the
  same file as Examples/FF7_SpellExt_Templates_Example.txt in the mod's folder: Import it from there. Neither the
  DLL nor this program reads that folder by itself, and an update of the mod never touches your own file.

Saving, and where backups go
  Nothing is written until you Save (Ctrl+S) or Save all, except Import / Save as template / Remove on the
  Library page and Rename / Delete on the AI page, which write at once (with a backup). Save shows the
  change first (Settings: "Show the changes before Save"), copies the file as it is on disk into
      SpellExtConfig/Backups/<date_time>/
  (one folder for a whole Save all), writes the new text through a temporary file, and reads it back. Every line
  you did not change keeps its bytes (CRLF or LF). The last 20 backup folders this tool made are kept; folders
  it did not make are never touched. To undo a save, copy the file back from its backup folder (the message
  after a save names it). Closing with unsaved changes asks first.
  The DLL reads the files at the game's start and on "Re-init .ini files"; saving while the game runs is
  allowed. A new file (a new .ini, a new ai/ file) is seen only after a game restart, and keys marked
  start-up or restart on their page keep the value the game started with.

Live tables (Linux)
  Reads the running game's tables from its memory (read only; nothing is attached, stopped or written).
  Linux allows that only when kernel.yama.ptrace_scope permits it. At 1 (the usual setting) the kernel may refuse
  to let a program read a game it did not start (one started from 7th Heaven, say); if it does, the page says why
  and what to do. (At 1, a game started from 7th Heaven was read without a refusal on 2026-10-28.) To allow it for
  this session, with root: sysctl kernel.yama.ptrace_scope=0 (back to 1 at the next boot).

The sandbox note
  Electron's sandbox needs unprivileged user namespaces (on by default on most distributions) or a root-owned
  setuid chrome-sandbox. If the window does not open and the terminal says "The SUID sandbox helper binary was
  found, but is not configured correctly", either enable user namespaces, or run once as root in this folder:
      chown root:root chrome-sandbox && chmod 4755 chrome-sandbox
  This program never turns the sandbox off by itself.

Where settings live
  ~/.config/SpellExt Config/settings.json (the last folders, the Settings menu, the window size, the kernel
  chosen on the AI page). A file named portable.txt in this folder (beside the resources folder) keeps
  settings.json here instead.

What it never touches
  It writes only inside the SpellExtConfig folder you opened (and its Backups folder), its own settings.json,
  a file you export from the Library to a place you choose, and the --log FILE you name. It never writes
  FF7_SpellExt.dll, mod.xml, the game folder or 7th Heaven's own files.

Hardening
  The binary's RunAsNode, NODE_OPTIONS and --inspect fuses are turned off: ELECTRON_RUN_AS_NODE=1 does not make
  it a plain Node.
