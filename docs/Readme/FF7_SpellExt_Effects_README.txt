FF7 SpellExt - effects file reference (effect copies)
=====================================================

An effect copy is one of the game's magic effects, played with some of its
files replaced by files of your own: a recoloured Fire, say. It gets a
number of its own, 0x100 and up, which a spell names as its animation:

  FF7_SpellExt_Effects.ini            FF7_SpellExt_Spells.ini
    [effect 0x100]                      [3016]
    copy = 0x1b                         name      = Blue Fire
    file = FIRE00.TIM:YFIRE00.TIM       base      = 0x1b
    file = FI_A01.SPT:YFI_A01.SPT       animation = 0x100
    file = FIRE01.TIM:YFIRE01.TIM       materia   = any

The game's own effect still runs (its movement, timing, sounds and damage
display are Fire's); only the files it loads are yours. The copy's files are
loaded, as the effect's own are, in place of them for the action that casts
the copy, and are unloaded again at the next action's preload (or, if the
copy was still being drawn then, at the next effect that needs that effect's
files), so Fire cast later by anyone, and a limit that plays Fire as one of
its hits, gets Fire's own files.

The file is FF7_SpellExt_Effects.ini, in the SpellExtConfig folder. It is
read when the game starts, before the spell file, and again by "Re-init
.ini files". Problems are reported, with line numbers, in FF7_SpellExt.log
(beside ff7_en.exe); a copy with any problem is not used at all:
- a spell line `animation = 0x100` naming a copy that is not usable when
  the spell file is read is itself a problem, and the spell keeps the
  animation it had (its base spell's);
- a copy dropped after that (one of its files is missing, see below), or
  effect copies switched OFF as a whole (the log says "effect copies: OFF"
  and why): the spell plays the effect it copies (Fire) with that effect's
  own files.

Layout
------
  [effect 0x100]           the copy's own number, 0x100 to 0xffff, unique;
                           up to 64 copies
  copy = 0x1b              the magic effect copied (see the list below)
  file = FROM:TO           one of that effect's files, and the name to load
                           in its place. Up to 16 file lines. Files not
                           named are the effect's own.

- Numbers are decimal, or hexadecimal with 0x.
- A comment starts with ; or # at the start of a line or after a space.
- FROM must be one of the effect's own files, written as the list below
  (and the log) gives it; case does not matter. A name the effect uses
  more than once is replaced everywhere.
- TO must keep FROM's extension. The game asks for a .TIM as .TEX and a
  .SPT as .S, so for  FIRE00.TIM:YFIRE00.TIM  the file you supply is
  YFIRE00.TEX. Names are 1 to 31 characters: letters, digits, _ and -
  (and the dot of the extension; a name may not start with a dot).
- Use new names that are in no archive of the game (a prefix of your own,
  like the Y above), or you replace that file everywhere.

Where the files go
------------------
- With FFNx and 7th Heaven: in the mod's magic folder itself (beside the
  limits' .a00 packs, not in a magic.lgp folder or a sub-folder: the DLL
  checks that the files are there, see below), which FFNx reads as
  direct\magic. Put ALL of a copy's files
  there: FFNx reads a .TEX itself and never looks in SpellExtConfig\files
  for it (a .S or .RSD there would be found, a .TEX would not). FFNx's
  texture replacement knows the copy by its own name (YFIRE00), so an HD
  texture pack made for Fire does not apply to it.
- With the game's own driver: anywhere under SpellExtConfig\files (a PNG
  standing in for a .TEX counts: YFIRE00.TEX.png or YFIRE00.png).
- Each file is looked for when the game starts and on "Re-init .ini
  files"; a copy with a file not found where its driver looks is not used
  (the log names the file), and its spells play the effect's own files.
- A NEW file is only seen after the game is restarted (7th Heaven lists a
  mod's files when it starts the game; SpellExtConfig\files is indexed at
  start-up). A changed file needs no restart.

Using a copy in the spell file
------------------------------
  animation     = 0x100    the spell plays copy 0x100 (on one target and on
                           several, unless animation_all says otherwise)
  animation_all = 0x101    a copy (or an effect's own number) for several
                           targets
A copy of the effect a spell would play anyway is fine: the record holds
the effect copied (0x1b here), the copy is chosen per cast.

Effects that can be copied (this stage: magic only)
---------------------------------------------------
Their files, as the game's code lists them (the log lists the files of each
effect a copy uses, at start-up):

  05 Esuna     ESNA.TIM LINE.SPT
  06 Resist    RESIST.TIM LINE.SPT
  09 Mini      MINI_1.TIM MINI_1.SPT
  0a Toad      todo_1.tim todo_3.spt
  0b Sleepel   slipl.rsd
  0d Silence   sailess.rsd
  0e Berserk   BARSAC_1.RSD ELEC_1.TIM ELEC_1.SPT SMOKE_1.TIM SMOKE_1.SPT
  0f Barrier   BARI_A1.RSD BARI_A2.RSD
  10 MBarrier  BARI_M.RSD
  11 Reflect   RIFREK.RSD
  12 Wall      WOLL.RSD
  13 Haste     HARI.RSD HEIST_1.RSD
  14 Slow      SLOU1.RSD HARI.RSD
  15 Stop      hari_1.rsd stop_1.rsd stop_2.rsd
  16 DeBarrier light_1.rsd
  17 DeSpell   DETHPE_1.TIM DETHP_1.RSD DETHP_2.RSD LIGHT_1.RSD
  1a Remove    DEJON01.TIM DEJON_2.SPT DEJON00.TIM DEJON_1.SPT DEJON_2.RSD
  1b Fire      FIRE00.TIM FI_A01.SPT FIRE01.TIM
  1c Fire2     1.RSD 2.RSD ... 8.RSD FAIRA00.TIM FAIRA01.TIM
  1d Fire3     FAIGA_3.TIM FAIGA_3.SPT FAIGA_4.TIM FAIGA_1.SPT FAIGA_1.RSD
               FAIGA_2.RSD
  1f Ice2      BRIZAR.RSD
  20 Ice3      brizag_1.rsd brizag_2.rsd
  21 Bolt      THUNDE00.TIM KAMI_1.SPT THUNDE01.TIM SPARK_1.SPT THUND_3.RSD
  22 Bolt2     THUNDE00.TIM KAMI_2.SPT THUNDE01.TIM SPARK_2.SPT THUNDE02.TIM
               SPARK_3.SPT ELEC_1.SPT THUND_4.RSD
  23 Bolt3     THUNDG02.TIM KAMI_7.SPT STONE.RSD THUNDG03.TIM SPARK_4.SPT
               THUNDG_2.RSD THUNDG01.TIM THUND_3.RSD
  24 Quake     queik.rsd
  25 Quake2    LIGHT34.TIM LIGHT_5.TIM STONE.TIM QUEIR_1.TIM light_1.rsd
               light_2.rsd queir.rsd
  27 Bio       BIO.TIM BIO_A.SPT BUBBLE_A.SPT
  28 Bio2      BIORA01.TIM BUBBLE_B.SPT BIORA02.TIM BIO_A.SPT BIORA00.TIM
  29 Bio3      00.RSD BIOGA102.TIM BIO_A.SPT BIOGA100.TIM BIOGA101.TIM
  2a Demi      GRAVID03.TIM GRAV_1.SPT GRAV_A.SPT GRAVID00.TIM ELEC_3.SPT
               GRAVID01.TIM GRAVID02.TIM
  2b Demi2     GRAVIR03.TIM GRAV_2.SPT GRAVIR00.TIM ELEC_4.SPT GRAVIR01.TIM
               GRAVIR02.TIM
  2c Demi3     GRAVIG03.TIM GRAV_2.SPT GRAVIG00.TIM ELEC_4.SPT GRAVIG01.TIM
               GRAVIG02.TIM
  30 Break     WIND_1.RSD BREAK_1.RSD WIND_2.RSD
  31 Tornado   TORNADO1.RSD TORNADO2.RSD TORNAD00.TIM LINE.SPT
  32 Flare     flea_4.TIM exp_1.SPT flea_3.TIM exp_2.SPT flea_5.TIM exp_3.SPT
               FLEA_1.RSD FLEA_2.RSD
  33 FullCure  SONIC.RSD FULL_1.RSD LIGHT.TIM
  35 Shield    SEALD.TIM SEALD.rsd SEALD2.rsd

- A .RSD is a model's small text file; it names the model's .P and its
  textures itself. To recolour a model, copy the .RSD under a new name,
  point its texture line at a texture of your own, and rename the .RSD in
  the copy.
- Fire3, Ice3, Bolt3, Bio3 and Demi3 (1d 20 23 29 2c) are a different
  routine of the game's when the cast has several targets: their copies are
  used on one target only (the log says so once).

Not copied (the log says why if a copy names one):
  00-04, 19     load no files of their own
  07 Life, 08 Life2, 0c Confu, 18 Death
                their files are loaded later, by a task, not when the effect
                starts
  1e Ice, 26 Quake3, 2d Comet, 2e Comet2, 2f Freeze, 34 Ultima
                their loader is built differently from the others (a later
                stage may take them)
  36 and up     enemy attacks, limits, summons: not in this stage

How it works, briefly
---------------------
Nothing in the game's archives changes. The DLL puts the copy's file names
in the effect's own file list just while the game loads the effect for an
action that wants the copy, and puts the list back at once. It notes which
set of files the effect has loaded; when the next cast wants the other set
and nothing in between unloaded it, that one effect's files are unloaded
(with the game's own routine) so the effect loads the right ones, and a
copy's files are unloaded at every action's preload. Files an effect is
still drawing are never unloaded: the cast then shows the set loaded. The DLL
checks the game's code for each effect before it uses it and refuses (with
a line in the log) anything that is not as expected, for instance because
another mod changed it.

Two variants of one effect in a single action are not possible yet (no key
can ask for them).

Example
-------
  [effect 0x100]
  copy = 0x1b                         ; Fire
  file = FIRE00.TIM:YFIRE00.TIM       ; supply YFIRE00.TEX
  file = FI_A01.SPT:YFI_A01.SPT       ; supply YFI_A01.S
  file = FIRE01.TIM:YFIRE01.TIM       ; supply YFIRE01.TEX
