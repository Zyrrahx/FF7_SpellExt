FF7 SpellExt - battle cameras of your own
=========================================

Folder: SpellExtConfig\cameras. Every .txt file in it is one battle camera.
Read when the first battle starts. Problems are reported in FF7_SpellExt.log
with the file's name and the line number.

The game keeps its battle cameras in three files (camdat0.bin, camdat1.bin,
camdat2.bin; which one is used depends on the kind of battle). The cameras
here are ADDED to whichever of them is loaded, in memory: the file itself is
not replaced or changed, so the game's own cameras, or those of another mod
that ships camera files, stay as they are.

A camera is used by giving its number as camera_single / camera_multi in the
spell file or the limits file.


A camera text
-------------
    camera = 190                     ; its number, in hex

    [variant 0 1 2 position]         ; where the camera is
    f0 0 250 -290 -1100              ; one command per line: its number in hex,
    f5 8                             ; then its operands in decimal
    f4
    ff                               ; a script ends with ff

    [variant 0 1 2 focus]            ; the point it looks at
    f9 0 0 -260 0
    ff

- camera = NUMBER comes first. Use numbers from 190 (hex) up: the game's own
  files use 0 to 189. Each number once only. If the loaded file already has
  that number, the one here takes its place.
- A camera has two scripts that run side by side, position and focus, and
  three variants of each (0, 1, 2). All six must be given; a heading may name
  several variants, as above.
- Anything after a ; is a comment.
- The numbers between the file's last camera and yours behave as camera 0.

The commands, and what each operand means, are listed by
    tools/cam_tool.py list FILE --words
and in Claude Notes/Battle_Camera_Scripts.md. cam_tool.py export writes any
of the game's cameras out in this form, to start from.


Roll: turning the arena (camera stage 0)
-----------------------------------------
A camera may also have ONE [roll] section, anywhere after camera = NUMBER.
It turns the whole arena about the battle's Z axis: the level line through
the arena's centre at floor height, running from the party's side to the
enemies' side. When the shot looks along that line (from behind the party
toward the enemies, or the other way) this looks like the camera rolling.
When the shot looks across it (from the side), it tilts the floor instead.
A true roll of the camera about its own line of sight is planned for a
later stage.

    [roll]
    at 0 roll 0                      ; level
    at 6 roll 1024 over 18 ease      ; a quarter turn, gliding 18 frames, eased
    at 52 roll 0 over 14 ease        ; back level

- One line: at FRAME roll ANGLE [over FRAMES] [ease]
  FRAME   0 to 599: the frame the line starts at
  ANGLE   -8192 to 8192, in 4096ths of a full turn (1024 a quarter turn,
          2048 a half); the sign gives the direction
  over    the glide's frames, 0 to 600; without it the roll jumps there
  ease    the glide starts and ends gently (without it: even speed)
- Lines go in the order of their frames. A line glides from wherever the
  lines before it had left the roll at its frame. Before the first line the
  roll is 0. Up to 32 lines.
- IMPORTANT: the frames are those of a NATIVE effect (an effect script of the
  effect player, SpellExtConfig\effects; frame 0 = the effect's first frame),
  not of the camera's scripts. The roll plays only while a native effect runs
  under this camera; a spell or limit with one of the game's own effects
  shows the camera without its roll.
- When the effect ends the picture is put back level (to the game's own
  value) at once, from the next frame, so end your roll before the effect's last frame. The log
  says so if a roll is still turned at the effect's end.
- Damage numbers and cursors follow the turned picture; sprites (flames,
  sparks) stay upright on the screen.
- The turn is about the arena's centre line, not the middle of the screen:
  aimed at a target far to one side, the picture also swings sideways.
- While you choose a target (the battle menu's target cursor) the game
  shows its own home view, and that view is not turned.
- No roll is played while the Config menu's camera is set to fixed.
- A camera text with a [roll] section needs a SpellExt with camera stage 0;
  an older one refuses the whole file (the log names the line).
- Log lines (FF7_SpellExt.log): "camera 198: 3 roll line(s) ..." when the
  texts are read; in a battle "camera 198 roll: starts ...", "... roll: 1024
  at frame 24", "... roll: cleared (the effect's length): back to the game's 0".



FF8 cameras: engine = ff8 (camera stages 1, 2 and 3)
----------------------------------------------------
A camera can instead be written the way FINAL FANTASY VIII writes its
battle cameras, and SpellExt plays it itself, frame by frame. Such a camera
has no [variant] scripts: SpellExt makes them (they hold the battle's own
home view, and do nothing else).

    camera = 199
    engine = ff8                     ; FF8's kind of camera
    unit_scale = 1.0                 ; FF8 numbers x this = FF7 numbers
    zoom = fov                       ; how H (FF8's zoom) is played (stage 2)
    blend = 8                        ; optional: glide back at the end (stage 2)
    select = 0.0                     ; which chain plays: animation.variant

    [anim 0 variant 0]               ; one segment of chain 0.0
    snap
    H 512 > 352
    roll 0 > 0
    ease 0
    key 7  eye camera 0 0 0           target focus 0 0 0
    key 1  eye frame1 -976 -130 8188  target frame1 14 56 81

- engine = ff8, select, unit_scale, zoom and blend go before the first
  heading.
  select = ANIM.VARIANT: the animation 0 to 15 and the variant 0 to 7 (FF8
  keeps up to 16 animations of 8 variants in a camera). Only that chain is
  played; other chains in the file are checked for mistakes and skipped.
  unit_scale: 0.001 to 16 (default 1.0). How big FF8's units are next to
  FF7's has not been measured yet. It sizes every offset except those
  counted from frame1 ... frame4, which grow with the distance from the
  caster to the target by themselves (so unit_scale does not change them).
  zoom = fov (the default), dolly or none: how FF8's H is played.
    fov    the battle's own H is changed, and the game makes its field of
           view from it each frame (H 1024 shows everything twice as big,
           H 256 half as big; H 512 is the battle's own view). Damage
           numbers and target cursors stay on the models: the game places
           them with the same projection.
    dolly  the camera moves nearer or further along its line of sight
           instead (the perspective changes a little, unlike FF8's).
    none   H is not played (as in camera stage 1).
    The battle's H is put back whenever the camera is not shown (target
    selection, another camera) and when the effect ends, however it ends.
    If something else in the game sets its own H meanwhile, the game's is
    kept and the camera zooms no more for that cast (one log line).
  blend = N (1 to 255): FF8's glide back. Over the effect's last N frames
    the camera glides from its own shot to the battle's view (and the zoom
    with it), so the effect ends on the battle's view instead of cutting to
    it. The effect is not made longer and the next turn is not delayed.
    Without blend the camera cuts back, as FF8's spell cameras do.
- [anim A variant V] starts a segment of chain A.V. Another heading with the
  same numbers is that chain's next segment. Up to 16 segments in the chain.
- A segment's lines:
  key FRAMES eye REF X Y Z target REF X Y Z
          1 to 32 of them. With two, the camera moves from key 0 to
          key 1 over key 0's FRAMES, then stays on key 1 for its own FRAMES.
          With one, it stays there for FRAMES. With three or more (stage 2)
          the camera follows a smooth curve through all of them, FF8's own
          curve, without stopping at the keys in between; every key but the
          last needs 1 frame at least. FRAMES: 0 to 600; a segment's keys
          2047 frames at most together.
  snap    the keys' places are worked out once, when the segment starts
          (FF8 does this for all of Fire's camera). Without it, a key that
          names the target follows the target as it moves.
  ease N  FF8's easing, -16 to 15: 0 even speed, below 0 starting slowly,
          above 0 ending slowly.
  H A > B and roll A > B: FF8's zoom and roll for the segment, from A at
          its start to B at its end (H A or roll A alone: the same all
          through). H: 1 to 4096 (512 = the battle's own view); played as
          zoom = says. roll: -32768 to 32767 (4096 = a whole turn): the
          picture turns about the middle of the screen, exactly as FF8
          turns it. A segment without an H line plays the H of the segment
          before it again; one without a roll line keeps the roll where it
          is. The [roll] section above still works in these cameras and is
          a different thing: it turns the whole arena (see Roll above).
- REF (what X Y Z are counted from, in FF8 numbers):
  camera / focus     where the camera / the point it looks at was (at the
                     start of the effect: the battle's view); the key's
                     X Y Z are ignored here, as in FF8
  world              the battle's centre (X Y Z are a place)
  frame0 ... frame4  FF8's effect frames: centred halfway between the caster
                     and the target (the middle of the targets when there are
                     several), with Z pointing from the caster to the target,
                     so X Y Z turn with the line between them. frame0 counts
                     X Y Z in FF8 numbers; frame1 ... frame4 count them in
                     5000ths of the caster-target distance. frame0 is on
                     the floor; frame1 ... frame4 run between the caster's
                     and the target's body point (stage 2: the point the
                     game aims its target cursor and damage numbers at;
                     with several targets, their middle at the caster's
                     height).
  target / caster    the highest-numbered target / the caster, on the floor
                     under it
  target.bone N / caster.bone N   one of its bones (its last if it has fewer)
  group              (stage 3) FF8's frame at the target (several targets:
                     the middle of them, on the floor), turned half round
                     when no party member is a target (so X and Z point the
                     other way for a cast on enemies); X Y Z in FF8 numbers
  effect             (stage 3) FF8's frame that the effect itself moves
                     (Death's object). FF7's effects have none: here it is
                     the target's place on the floor, X Y Z in FF8 numbers
  #hhhh              (stage 3) a reference as FF8 stores it, one to four hex
                     digits; only the low byte counts, as in FF8 (#5ef7 is
                     frame3: FF8 Water's data has 74 of these)
  home               (stage 4) the caster's home spot: where it stood when its
                     action was set up, on the floor; X Y Z added as they are
                     (as caster). See "The action's clock" below.
  frame0.home        (stage 4) FF8's frame0 measured from the caster's home
                     spot instead of from where the caster is now (to the
                     target, or the middle of the targets)
  FF8 also turns target and caster offsets with that actor's facing; this
  stage does not.
- When it plays: like [roll], only while a NATIVE effect runs under this
  camera, from the effect's first frame (unless the camera says clock =
  action: see "The action's clock" below). A chain shorter than the effect
  stays on its last shot until the effect ends; then the game cuts straight
  back to the battle's view (no glide unless blend = is given; the next
  turn is not delayed either way).
  With one of the game's own effects, or before and after the effect, the
  camera shows the battle's home view.
- While a target is being chosen (another member's target cursor during
  the effect) the game glides from the FF8 shot back to its battle view
  over a few frames; when the cursor closes, the FF8 shot comes back at
  once, at the effect's current frame (a jump). Not played while the Config
  menu's camera is fixed.
- Log lines: "camera 199: engine ff8, anim 0 variant 0: 1 segment(s) ..."
  when read; in a battle "camera 199 (engine ff8): starts ...", "segment 1 of
  1 at frame 0 ...: eye (...) -> (...)", ten "self-check" lines (the eye
  SpellExt wrote against the eye the game built its picture from: they
  should say "the same"), "its chain ends at frame 8", "ends (the effect's
  length) ... self-check: 31 of 31 frame(s) ..." for a 33-frame effect
  (more if the battle was paused during it). The last frame of the effect
  is drawn from the battle's view already: the cut comes on that frame.
  Stage 2 adds to the "starts" line the zoom and whether the roll is played
  exactly; "roll: layout self-check at roll 0: the same as the game's build"
  once a cast when the camera rolls (if it says DIFFERENT, no roll is
  played again until the game restarts: tell the author); "blend back to
  the battle view from frame N" with blend =; "camera roll (engine ff8):
  on ..." and "camera zoom: zoom = fov on ..." once a game.
- A camera text with engine = ff8 needs a SpellExt with camera stage 1; an
  older one refuses the whole file (the log names the line). zoom =,
  blend = and three keys or more need camera stage 2; select = sequence,
  camera_mode, [sequence], empty, group, effect, #hhhh and segments of 0
  frames need camera stage 3.

FF8's sequence: select = sequence (camera stage 3)
---------------------------------------------------
FF8 does not play one chain: a small program (FF8's camera "sequence")
chooses which chain to start each cast, from who is targeted, the target's
state and dice. With select = sequence SpellExt keeps every chain of the
file and runs that program, FF8's own bytes, the way FF8 runs it.

    camera = 19c
    engine = ff8
    camera_mode = 0, 1               ; FF8's var00: one of the two each cast
    select = sequence

    [sequence]                       ; FF8's program, as the converter writes it
            acc = var19              ; the target: 0-2 the party, 3 and up enemies
            var7f = acc
            acc = 3
            acc -= var7f
            jle Lenemy                ; an enemy: jump
            start 0x20               ; an ally: animation 2 variant 0
            end
    Lenemy: start 0x00                ; animation 0 variant 0
            end

    [anim 0 variant 0]
    ...
    [anim 2 variant 0]
    ...

- [sequence] holds one instruction a line, in the words of the converter
  (Tools/ff8cam/FORMAT.md section 5); a word followed by a colon (Lenemy:)
  is a label. The instructions: start 0xNN (animation NN >> 4, variant
  NN & 7) or start varHH, wait (go on next frame), end, save, blend N,
  hold, release, stop, skip N, halt N, acc = / += / -= / *= / /= / &= /
  |= / ^= / %= with varHH, N (-128 to 127), u8 N or s16 N, varHH = acc,
  jmp jgt jge jeq jne jle jlt (and .w for a far jump) with a label.
  Refused, because FF8 itself would hang or crash on them: acc clear,
  variables 80 to ef, blend 0; the program must end with end, halt or jmp.
- The program runs once a frame from the effect's first frame (not again
  for a frame the pause repeats). start begins that chain at once, on that
  frame; a start of an animation the file does not have is ignored; stop
  and halt stop the chain (the battle's view); blend N glides to the
  battle's view over N frames; an empty chain shows nothing. If the
  program goes wrong where FF8 would crash (a division by 0) it stops, with
  a log line, and nothing more is shown.
- What the program reads (FF8's variables, given FF7's values):
    var00          camera_mode A, B: one of the two, at random, each cast
                   (FF8 takes them from the battle formation; default 0, 1)
    var01 - var07  kept for the whole battle (0 at its start)
    var10          which chains run (a bit a variant)
    var11          a random number; var1c - var22 dice of 2 to 8 faces,
                   with FF8's own random formula
    var13          party members there and alive; var1b there with no status
    var15          0 (FF8: the target's size class; FF7 has none)
    var16          the target: 2 if it is dead, 1 if it is a party member in
                   its weak pose (kneeling), else 0
    var17          0 (FF8: "no camera for this action")
    var18 / var19  the caster / the (last) target: 0-2 the party, 3 and up
                   the enemies (FF7's enemies 4-9 count as 3-8, as in FF8)
    var1a          the number of targets
- [anim A variant V] sections of one chain go one after another. A chain
  written as a heading and the single line `empty` is FF8's empty chain.
  Segments of 0 frames are allowed (FF8 passes over them).
- The Config menu's fixed camera: a sequence camera is not played under it,
  as the cameras without a sequence and the game's own (FF8 would show a
  started chain while its "hold" flag is set; not followed here). The
  `hold`, `release` and `save` lines are read and kept, with no effect then.
- Log lines: "camera 19c: engine ff8, select sequence: a program of 314
  byte(s) ..." when read; in a battle "starts ... select sequence ..., var00
  1 (camera_mode 0, 1)", then "sequence at frame 0: read var00=1 var17=0
  var19=3 ...; the program ended" and "sequence: anim 2 variant 4 from frame
  0 (1 segment(s), 22 frame(s))", then the segment lines as before.

The action's clock: clock = action, home, frame0.home (camera stage 4)
-----------------------------------------------------------------------
An FF8 camera normally plays on a native effect's frames, and starts over
with every native effect. A limit whose script has no native effect (or one
for each cut) then shows the battle's home view, or a camera that keeps
starting again. One more line before the first heading changes that:

    camera = 1d9
    engine = ff8
    select = sequence
    clock = action                   ; frame 0 = the action's effect step

- clock = effect (the default, the same as no clock line): as above.
  clock = action: the camera's frame 0 is the frame of the action's effect
  step (the script's `ec`: for a limit, the step that loads its animation
  pack), and from there it plays on the action's own frames, whatever the
  action shows: the limit's own effects, its spell_effects steps, native
  effects or the game's, none at all. It does not start over at a native
  effect: a native effect started under the same camera plays as always
  (its [roll], its stage lines, actors, sounds and hits) but leaves the
  camera to the action's clock (one log line each).
- It ends when the next action is set up, when another camera runs (a
  record of the action with a camera of its own; a record that keeps the
  camera keeps the clock), after 2400 frames at most, when the battle ends
  or a new one starts. Once the action's display is over the game shows its
  own home view again, as after any camera.
- An action of several turns: the game gives each turn after the first no
  camera (-1) unless the action's flag 0x1000 keeps it (-4), so the clock
  ends at the second turn. Give such a limit its cuts in one turn
  (spell_effects steps).
- Such a camera is played on the action's clock only. If the clock could
  not start (see "no free task" below) or has ended, a native effect under
  it does not play it on its own frames: the battle's home view (one line,
  "clock = action: not played on native effect N's frames").
- The frames count as a native effect's do: not while the effects are
  paused, and the frames FFNx draws in between at 30/60 fps show the same
  frame again.
- Not played while the Config menu's camera is fixed (one log line).
  blend = is refused with clock = action (it counts an effect's last
  frames, which the action's clock does not have): a [sequence]'s blend N
  works. clock = on an engine = ff7 camera is refused.
- home and frame0.home: FF8 measures its frame0 from where the caster
  stands at home; in FF7 the caster runs about, so frame0 follows him. The
  caster's home spot is taken when its action is set up (where it stands
  then: actors are at rest between actions). home is that spot on the floor
  (X Y Z added as they are, like caster); frame0.home is frame0 counted from
  it: centred halfway from the home spot to the target (or to the middle of
  the targets), Z pointing from the home spot to the target. Both work on an
  effect's clock too. home.bone is refused (a spot has no bones). If no home
  spot was taken this battle (an action that set up no attack record), they
  use where the caster is now (one log line).
- Log lines: when read, "... (played on the action's clock from its effect
  step (clock = action); ...)"; in a battle "camera 1d9 (engine ff8): starts
  at actor 0's effect step on the action's clock (clock = action), frame 0,
  targets 0010, home (X, 0, Z): ...", "native effect 0201 starts at the
  action's frame 40: the camera keeps the action's clock", "a second effect
  step (actor 0) at the action's frame N: the clock goes on", "the action's
  display is over at frame N (every actor finished): the game's own view
  until the clock ends", and "ends (the next action was set up; the action's
  frame N, M call(s))" (or "the running camera changed to X", "the clock's
  limit of 2400 frames", "the battle is over"). M is about N at the game's
  own frame rate (more while the effects are paused; 2 x N at FFNx's 30
  fps, 4 x N at 60 fps). "no free task in the list of 60" means the camera
  could not start: the action shows the battle's home view. The start,
  "display is over", "ends" and refusal lines have their own budget (24 a
  battle), so they are written even after the other camera lines of the
  battle (30) are spent.
- A camera text with clock =, home or frame0.home needs a SpellExt with
  camera stage 4; an older one refuses the whole file (the log names the
  line).

Known limits
------------
- Up to 128 cameras, 32768 bytes of script in all.
- Up to 32 roll lines a camera.
- engine = ff8: up to 16 segments a chain, 4096 segments in all the cameras,
  32 keys a segment, 2047 frames a segment; a [sequence] of 2048 bytes and
  256 labels at most, 4096 steps a frame.
- A camera file from another mod that already uses numbers from 190 up would
  have those cameras replaced by the ones here.
