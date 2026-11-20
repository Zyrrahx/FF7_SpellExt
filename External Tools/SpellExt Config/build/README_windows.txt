SpellExt Config (Windows, x64)
==============================

The editor of the SpellExt .ini files (FINAL FANTASY VII, the SpellExt mod), as a program of its own.
No install, no Python, no browser needed. Extract the zip anywhere and run "SpellExt Config.exe".

What's new in 0.11.0
  - The Portrait block, on a character's page in the Characters file (the sections [12] to [43] that are not
    commented out). It shows the picture the game's main menu will draw for that character, and the smaller one
    (the "_l" size), each with the part the game really draws marked (the main menu shows 80 of the 84 pixels: a
    dashed line shows where it stops). Under each picture a line says where it comes from: the character's own
    portrait file (a PNG or a .tex in the mod's files folder), or the game's own portrait read from the menu
    archive (menu_us.lgp, or the file named in Settings > menu archive), or, when the character has none of its
    own, the picture of the character it is based on. Where FFNx or an active 7th Heaven mod serves a replacement
    picture (a .dds or .png in a Textures folder), the block shows that one instead and names the file. Each
    line says whether it was "read" from the code or only "inferred"; whatever cannot be read is said in words,
    never left out. The block only reads: it has no button that writes anything. A PNG is decoded by the
    window's own browser engine, so its colours can differ a little from the game's. A new picture file is seen
    by the game only after a restart of the game (7th Heaven lists the mod's files at launch).
  - The 3D view, beside the formation diagram of a scene's [formation N] form, and for every battle of the
    Game formations page. It draws the battle's start as a picture: each enemy posed in frame 0 (the first
    frame) of its idle animation, where the formation puts it and facing the way it starts; the party as
    markers (a post 1,000 tall with a pointer on top showing the way it faces), coloured and numbered from 0 as in the
    diagram (0 is the leader); a floor grid and a dark disc under each fighter. It does NOT draw: the battle
    stage (no scenery), any later frame of an idle animation (an enemy that bobs is shown still), the party's
    own models, or what the Model block does not show (FFNx's texture replacements, the game's battle
    lighting, semi-transparency). The picture is 4:3, the game's picture with FFNx's aspect_ratio 0; a wide
    mode shows more at the sides. "Game's start view" is the formation's camera record 0, which is how the
    game opens the battle, worked out from the game's code and not yet compared with a battle in the game;
    "3/4 view" looks from a little above and to the side. The data is the scene.bin this tool reads (the game
    folder's, or the one chosen in Settings); a DLL scene numbered 0 to 254 in your config, or an active
    mod's own scene.bin, replaces it in the game, and the page says so.
    Mouse: drag turns the view; Shift-drag or right-drag moves it sideways; click the picture, then the wheel
    zooms (the wheel scrolls the page while the picture is not clicked); the arrow keys, + - and 0 work while
    it has the focus; a double click or "Reset view" goes back to the game's start view.

What was new in 0.10.0
  - Formation diagrams: a scene's [formation N] form draws where everyone stands at the start, seen from above:
    the party's places for 3, 2 and 1 members (a switch), each facing, the back-row spot, every enemy row with
    its facing, and the formation's camera record 0 (the view at the start; a camera outside the drawing is shown
    at its edge with its true numbers). Every kind the DLL takes is drawn, surrounded with its triangle as before.
  - Game formations (in the sidebar, read only): every battle of the game's scene.bin (scene:formation, kind,
    stage, enemies), each drawn the same way. It says when an active 7th Heaven mod carries its own scene.bin.
  - Settings can name a scene.bin and a battle.lgp to read in place of the game folder's (Choose a file..., and
    "Use the game folder's" to go back). The pages name the file read; a file that cannot be read is said in red,
    and the game folder's is NOT used in its place.
  - The Model block on an enemy file's form (enemies\FOLDER\enemy.ini or generated.ini, its [enemy] section):
    the enemy's battle model drawn as it stands in the first frame of its first animation (drag turns it, the
    wheel zooms, Reset view or a double click goes back), its number ("model 183 (files hb..)", or "pool (365 +
    slot)" for a model the DLL serves from enemies\FOLDER\model), and for each file where it comes from and what
    it overrides, marked "read from the code" or "read from 7th Heaven 4.6.1's code". Anything missing is a line
    in the panel's own words (no aa in the model folder, a file in none of the places looked in, a part or a
    texture that cannot be read, no animation, the DLL's refusal of the folder): nothing is left out silently.
    The panel only reads: it has no button that writes. Reload (on the file's page) reads every model file again.
  - Where the model's files are looked for, file by file, in the running game's order: the enemy's model folder (a
    pool model); battle\NAME in the active mods of 7th Heaven's current profile (in its order, with the folders
    their options make active), then in FFNx's direct folder; battle.lgp\NAME in the same; then the game's
    data\battle\battle.lgp (or the one named in Settings). Read only: the archives' tables of contents and the
    files wanted, never extracted.
  - Not shown by the Model block: FFNx's texture replacements (mods\Textures, HD packs: the .tex files the model
    names are drawn), the weapons of a model (counted, not drawn), a mod's folders that depend on the running game
    (runtime conditions: listed, not used), the game's battle lighting (the vertex colours as stored, lit a little
    from the eye), and semi-transparency (such parts are drawn opaque). A model's textures are read up to 24 MB
    of pixels in all (the largest real one holds 16 MB); one past that is drawn untextured, and the block says so.
    Its parts are read up to what the preview draws (200,000 triangles); a part past that is left out, said too.

What was new in 0.9.0
  - The DLL's newer keys are known, so they are no longer reported as unknown: in the Game file enemies, the
    battle menu keys (battle_menu and the six battle_menu_* keys) and test_party_damage; in the Characters file
    forget_flag; in the Limits file status2, status2_mode, hits_on_every_target, form and the [form NAME]
    sections, the word room N in spell_effects, and a state's cover, counter and dexterity_per_target. The wider
    ranges are taken too: test_battle up to 16383, the wide gear numbers in a shop's add and in shop_add, and up
    to 1024 effect sections and sound handles.
  - The Enemies file (FF7_SpellExt_Enemies.ini) has its own entry in the sidebar, a page like the other files'.
    Problems also shows what the DLL's start-up look at the scenes\ and enemies\ folders would say (a scene
    file it would pass over, and why).
  - Scenes and Enemies in the sidebar: every scenes\*.ini, scenes\generated\*.ini and enemies\FOLDER\enemy.ini (or
    generated.ini) has a Form tab (a row per key, with its help, range and default) beside Raw. Each row says
    whether your file's value or the generated one is the one used; "override in your file" copies a generated key
    into your own file, and "use the generated value" takes it back out. The generated files can be edited too,
    but running the converter again overwrites them (their page says so). A formation of kind = surrounded shows
    the party's triangle and which of its rows stands before which place.
  - Scene checks: Check this scene (on an enemy's file: every scene that uses that enemy) and Check all scenes,
    also on the Problems page, give the DLL's verdict on each scene's battle in the DLL's own words, on the file
    and line it names. They read the game's own scene.bin and kernel2.bin from the game folder (--game, or
    7th Heaven's settings); without them a line says "not forecast" instead of refusing anything.
  - Enemy AI on the AI page: each enemy folder's AI opens under the enemy's rules (one entry; only its own attack
    IDs), and Save writes the text and also assembles the ai.ai block the DLL reads (no longer a step by hand).
  - Safer saving: nothing is written through a symbolic link inside the config folder; an enemy's AI text and
    its block are written through temporary files, and the text is put back as it was if the block cannot be
    written; an AI file name Windows could not hold is refused before anything is written; a scene or enemy
    file holding a lone CR (one not followed by LF) is pointed out on its form; and a disk error is reported as a
    refusal with nothing written.

Open the SpellExt folder
  A window opens on "Open the SpellExt folder". Click Browse... (or drop a folder on the drop zone) and pick
  either the mod folder (the one with FF7_SpellExt.dll and SpellExtConfig, under 7th Heaven's mods folder) or
  its SpellExtConfig folder. A folder without any FF7_SpellExt_*.ini file is refused with what was looked for.
  The last five folders are offered next time (Enter opens the one selected); Settings > "Open the last folder
  at start" skips the screen.

  "SpellExt Config.exe" --config "D:\7th Heaven\mods\FF7 SpellExt" [--game DIR] [--mods DIR] [--log FILE]
  opens straight into that folder (--game: the folder of ff7_en.exe, for the Game log page, the kernel and the
  scene checks; --mods: 7th Heaven's mods folder; --log: the tool's own errors are also written to FILE).
  Without --game the game folder is taken from 7th Heaven's settings.xml when it is found.

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
  SpellExtConfig\FF7_SpellExt_Templates.txt (plain text; Import and Export are on the Library page).
  examples\FF7_SpellExt_Templates.txt in this folder is an example of that file (three templates on vanilla
  bases): Library > Import... adds them to your own templates file. (Copy it into SpellExtConfig only if
  you have no FF7_SpellExt_Templates.txt there yet: a copy replaces that file.) The mod package carries the
  same file as Examples\FF7_SpellExt_Templates_Example.txt in the mod's folder: Import it from there. Neither the
  DLL nor this program reads that folder by itself, and an update of the mod never touches your own file.

Saving, and where backups go
  Nothing is written until you Save (Ctrl+S) or Save all, except Import / Save as template / Remove on the
  Library page and Rename / Delete on the AI page, which write at once (with a backup). Save shows the
  change first (Settings: "Show the changes before Save"), copies the file as it is on disk into
      SpellExtConfig\Backups\<date_time>\
  (one folder for a whole Save all), writes the new text through a temporary file, and reads it back. Every line
  you did not change keeps its bytes (CRLF or LF). The last 20 backup folders this tool made are kept; folders
  it did not make are never touched. To undo a save, copy the file back from its backup folder (the message
  after a save names it). If another program holds the file open, the save is retried for a second and then
  refused with the backup folder named. Closing with unsaved changes asks first.
  The DLL reads the files at the game's start and on "Re-init .ini files"; saving while the game runs is
  allowed. A new file (a new .ini, a new ai\ file) is seen only after a game restart, and keys marked
  start-up or restart on their page keep the value the game started with.

Live tables (Windows): NOT TESTED
  Live tables reads the running game's tables from its memory through
  resources\app\helper\sxlive_helper.exe, which asks Windows for reading only (it cannot write to the game).
  It has never been run: the Windows build was made and checked on Linux, and nobody has seen this page work on
  Windows yet. If it does not work, the page says why; please report what it says. Antivirus software may flag
  or remove a program that reads another program's memory; everything else in the editor works without it.

Where settings live
  %APPDATA%\SpellExt Config\settings.json (the last folders, the Settings menu, the window size, the kernel
  chosen on the AI page). A file named portable.txt in this folder (beside the resources folder) keeps
  settings.json here instead.

What it never touches
  It writes only inside the SpellExtConfig folder you opened (and its Backups folder), its own settings.json,
  a file you export from the Library to a place you choose, and the --log FILE you name. It never writes
  FF7_SpellExt.dll, mod.xml, the game folder or 7th Heaven's own files. The game's scene.bin and battle.lgp,
  FFNx's direct folder and 7th Heaven's settings, profile, library and mods are only read.

Notes
  The program's icon in Explorer is Electron's (the window's icon is ours).
  The program's RunAsNode, NODE_OPTIONS and --inspect fuses are turned off.
  The Windows build has not been run by its makers: please report anything that does not work.
