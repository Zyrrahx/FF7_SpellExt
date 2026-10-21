# Battle cameras in FF7 SpellExt: how they work and how to write your own

Final Fantasy VII moves its battle camera with small **scripts**: where the camera is, what it looks at, and how it
glides between the two over time. Every attack names a camera by number. Until now those scripts could only be changed
by editing the game's camera files by hand. With SpellExt you write a camera as a **text file**, give it a number of
its own, and point any spell or limit break at it. The game's camera files are never changed.

This guide explains the game's camera system as far as it has been decoded, the text format, every command, and the
practical lessons from the cameras made so far. The short reference is `docs/Readme/FF7_SpellExt_Cameras_README.txt`.

## 1. How the game does it

**The files.** The cameras live in `data/lang-en/battle/camdat0.bin`, `camdat1.bin` and `camdat2.bin`. The game loads
one per battle, by the kind of battle (kinds 0, 1 and 8 load camdat0; kind 2 camdat1; kinds 3 to 7 camdat2). They hold
394, 375 and 374 cameras.

**An attack picks a camera.** Every attack record (spells, limits, enemy attacks) has two camera numbers: one for a
single target and one for several. In SpellExt's files they are `camera_single` and `camera_multi`.

**A camera is two scripts that run side by side:**

| Script | What it moves |
|---|---|
| **position** | where the camera is |
| **focus** | the point it looks at |

The two run at the same time, frame by frame, each at its own pace. Most shots are "put the camera here, look there,
then glide both somewhere else".

**Three variants.** Every camera has three versions (variants 0, 1 and 2) of both scripts. All three run every frame and
the game shows one of them; how it chooses has not been traced. In practice, give all three the same scripts (one
heading can name all three, see below).

**A script is a list of commands.** Each command is one byte, followed by its numbers. A script ends with `ff`.
Commands either act at once (jump somewhere, choose a target) or start a movement that takes a number of frames; `f5`
and `f4` make the script wait while things move.

## 2. Where things are: coordinates

Points are in the battle's own units, measured **from a bone of an actor's model** (bone 0 is the model's root, at its
feet) or from a fixed point. Seen from an actor:

| Axis | Meaning | Rough scale |
|---|---|---|
| **x** | sideways, along the line of the party | a party member stands about 700 from the next |
| **y** | up and down; **up is negative** | a character is about 1000 tall; the face is about −260 to −300 |
| **z** | forward and back; **negative is in front** (toward the enemies), positive behind | |

So "in front of the attacker, a little above the waist, looking at her" is roughly `x 700, y −300, z −1400` from her
bone 0, and "behind her shoulder" is roughly `x 150, y −450, z 2100`.

**The view is narrow.** Only about 10 to 15 degrees either side of the line of sight is in frame. A subject 25 degrees
off is out of the picture. When a wide shot misses people, move the camera further out rather than turning it.

**Keep x small for shots on the attacker.** A large x offset depends on which place the attacker stands in: with the
attacker in the third place, `x −700` lands behind the middle party member instead.

## 3. Writing a camera for SpellExt

Put a `.txt` file in `SpellExtConfig/cameras/`. Every file there is one camera. They are read when the first battle
starts and **added to whichever camera file is loaded, in memory**: the game's files, and the cameras of any other mod,
stay as they are.

```text
camera = 191                     ; its number, in hex: 190 and up

[variant 0 1 2 position]         ; where the camera is
f0 0 700 -300 -1400              ; one command per line: its number in hex, then its numbers in decimal
f5 18
f4
ff                               ; a script ends with ff

[variant 0 1 2 focus]            ; the point it looks at
f9 0 0 -500 0
ff
```

- `camera = NUMBER` comes first, in hex. The game's own files use 0 to 189; **use 190 and up**, each number once. A
  number the loaded file already has is replaced by yours.
- Both scripts, for all three variants, must be given. One heading may name several variants.
- Anything after `;` is a comment.
- Up to 128 cameras and 32,768 bytes of script in all; engine = ff8 cameras keep up to 4,096 segments between them.
- Numbers between the file's last camera and yours behave as camera 0.

Then point an attack at it, in the spells file or the limits file:

```ini
camera_single = 0x191
camera_multi  = 0x191
```

## 4. The commands

`b` is a number from 0 to 255 (or −128 to 127), `w` a number from −32768 to 32767. **Glide** means move there smoothly
over the given number of frames; **jump** means be there at once. **Ride with / follow** means stay attached to a bone
as it moves, for the given number of frames. "The target" is the attack's target; `df` makes it the whole group.

A name in *(brackets)* is a reading that has not been confirmed in the game.

### Position script

| Cmd | Numbers | What it does |
|---|---|---|
| `f0` | bone x y z | jump to the **attacker**'s bone + (x, y, z) |
| `f7` | bone x y z | jump to the **target**'s bone + (x, y, z) |
| `ef` | actor bone x y z | jump to an actor's bone + (x, y, z) |
| `f9` | x y z | jump to a fixed point |
| `e4` | bone x y z frames | glide to the attacker's bone + (x, y, z) |
| `e5` | bone x y z frames | glide to the target's bone + (x, y, z) |
| `e3` | actor bone x y z frames | glide to an actor's bone + (x, y, z) |
| `e6` | x y z frames | glide to a fixed point |
| `d8` | hit bone x y z frames | glide to the target of hit number *hit* |
| `e7` | bone x y z frames | ride with the attacker's bone |
| `e9` | bone x y z frames | ride with the target's bone |
| `eb` | actor bone x y z frames | ride with an actor's bone |
| `f8` | turn radius start-angle radius-change rise frames | circle around the focus point (4096 is one full turn, unconfirmed) |
| `e2` | frames | glide to the battle's preset view (what the game's cameras end with to return to the idle view) |
| `e1` | | jump to the preset view |
| `dd` | preset | choose a preset |
| `e0` | part frames | glide to the target point |
| `d9` | | take the current position as the start |
| `df` | | the target is the whole group |
| `f2` / `f3` | shift angle height | *(place by the attacker's / target's facing)* |
| `de` | flag | *(target is actor 3 if set)* |
| `dc` / `f1` | | *(lock on / lock off)* |
| `da` / `db` | | *(mode off / on)* |
| `d7` | which value | *(set a flag)* |
| `d5` | number | play a sound |
| `d6` | | flash |
| `f5` | frames | set the wait |
| `f4` | | wait (for the frames set by `f5`) |
| `fe` `c0` | | start the script again (a loop) |
| `ff` | | end |

### Focus script

| Cmd | Numbers | What it does |
|---|---|---|
| `f9` | bone x y z | jump to the **attacker**'s bone + (x, y, z) |
| `f8` | bone x y z | jump to the **target**'s bone + (x, y, z) |
| `f0` | actor bone x y z | jump to an actor's bone + (x, y, z) |
| `fa` | x y z | jump to a fixed point |
| `e4` / `e5` / `e3` | as for position | glide to the attacker / target / an actor |
| `e6` | x y z frames | glide to a fixed point |
| `d8` | hit bone x y z frames | glide to the target of hit number *hit* |
| `e8` / `ea` / `ec` | (actor) bone x y z frames | follow the attacker's / target's / an actor's bone |
| `e2`, `e1`, `dd`, `e0`, `d9`, `df`, `de` | | as for position |
| `db` / `dc` | | *(mode off / on)* |
| `f5`, `f4`, `fe c0`, `ff` | | wait, loop and end, as for position |

**Watch the numbers:** the same command number means different things in the two scripts. `f9` jumps the camera to a
fixed point in the position script, but jumps the focus to the attacker in the focus script; `f8` circles in one and
jumps to the target in the other.

Usage in the game's own files: `e4`, `e5` and `f0` are by far the most common movements; most cameras are built from
"start at the attacker, glide to the target" with waits in between.

## 5. A worked example: Rapid Fire

A limit where the character reloads (frames 0-25), levels a pistol (26-33) and fires sixteen shots (34-67). The shot:
in front of her while she reloads, round behind her shoulder as she aims, then easing back while the shots go off.

```text
camera = 191

[variant 0 1 2 position]
df                          ; target = the whole group (as the game's own cameras begin)
dc                          ; (lock on)
f0 0 700 -300 -1400         ; jump: in front of her, at chest height
f5 18
f4                          ; hold 18 frames while she reloads
e4 0 150 -450 2100 14       ; glide over 14 frames to behind her shoulder (there by frame 32)
f5 14
f4
e4 0 200 -550 2500 50       ; ease back and up a little during the shots
f5 50
f4
ff

[variant 0 1 2 focus]
df
f9 0 0 -500 0               ; look at her, 500 above her feet
f5 18
f4
e5 0 0 -500 0 14            ; turn to the target as she aims
f5 14
f4
ff
```

The pattern to copy: **jump** to a start, **wait** with `f5 n` + `f4`, **glide** with a frame count, wait the same
number of frames, and so on. A wait shorter than the glide moves on before the glide has finished, which is how two
movements are overlapped.

## 6. Timing

- Cameras count frames, as the attack's animation does.
- **A limit break's camera starts with the limit's animation**, not with the action script before it. A limit whose
  script waits 25 frames for an aura before the animation starts does not delay its camera by those 25 frames.
- End by gliding back to the battle's view (`e2 frames` in both scripts), or the camera stays where your script left it
  until the next action.
- A camera file is read at each battle's start: change a camera, start a new battle, and the change is there; no
  restart needed.

## 6b. Roll: turning the arena

A camera can also **roll**. The game's own camera scripts cannot do this, so a roll is written in a section of its
own, `[roll]`, anywhere after `camera = NUMBER`. In this first stage the roll turns the whole **arena** about the
battle's Z axis: the level line through the arena's centre at floor height, running from the party's side to the
enemies'. When the shot looks along that line (from behind the party toward the enemies, as most spell cameras do)
it looks like the camera rolling, as Final Fantasy VIII's cameras do. When the shot looks across it, from the side,
the floor tilts instead. A true roll of the camera about its own line of sight is planned for a later stage.

```text
[roll]                          ; at FRAME roll ANGLE [over FRAMES] [ease]
at 0 roll 0                     ; level as the effect starts
at 6 roll 1024 over 18 ease     ; a quarter turn, gliding 18 frames, gently at both ends
at 52 roll 0 over 14 ease       ; back level by frame 66
```

| Part | Meaning |
|---|---|
| `at FRAME` | the frame the line starts at, 0 to 479 |
| `roll ANGLE` | where the roll goes, in 4096ths of a full turn: 1024 is a quarter turn, 2048 a half; -8192 to 8192 |
| `over FRAMES` | glide there over this many frames (0 to 480); without it the roll jumps there |
| `ease` | the glide starts and ends gently; without it the speed is even |

- Lines go in the order of their frames; each glides from wherever the lines before it left the roll. Up to 32 lines.
- **The frames are those of a native effect** (an effect script of the effect player, frame 0 being the effect's
  first frame), not the camera's own frames. A roll plays only while a native effect runs under the camera; with one
  of the game's own effects the camera plays without its roll.
- When the effect ends the picture is set level again at once (from the next frame): finish the roll before the effect's last frame.
- Damage numbers and target cursors turn with the picture; sprites such as flames stay upright on the screen.
- The turn is about the arena's centre line, not the middle of the screen: aimed at a target far to one side, the
  picture also swings sideways as it turns.
- While a player chooses a target (the battle menu's target cursor) the game shows its own home view, which is not
  turned; the roll comes back when the cursor closes.
- No roll plays while the Config menu's camera is set to fixed.

Camera 198 (`camera_roll_test_198.txt`, spell 3086 "Camera Roll Test") is the example: camera 197's shot with the
roll above, timed for FF8 Firaga's effect (68 frames, the hit at 46, so the damage numbers appear on a turned
picture).

## 6c. FF8's cameras: `engine = ff8`

FINAL FANTASY VIII describes a battle camera as **segments**: each segment has one or two **keys** (from stage 2, up
to 32), and a key says where the eye is and where it looks, each as a **reference** (the camera itself, the target,
the caster, the battle's centre, the spell's "effect frame") plus an offset. With `engine = ff8` a camera text is
written that way and SpellExt plays it itself, writing the camera's eye and aim every frame. The game's own camera
scripts are not used: SpellExt gives the camera scripts that just hold the battle's home view.

```text
camera = 199
engine = ff8
unit_scale = 1.0                ; FF8 units x this = FF7 units (not measured yet; frame1-frame4 ignore it)
zoom = fov                      ; (stage 2) FF8's H as the field of view (the default), dolly, or none
blend = 8                       ; (stage 2, optional) glide back to the battle view over the effect's last 8 frames
select = 0.0                    ; the chain played: animation 0-15 . variant 0-7

[anim 0 variant 0]              ; a segment of chain 0.0 (another such heading is its next segment)
snap                            ; the keys' places are taken when the segment starts
H 512 > 352                     ; FF8's zoom over the segment (512 = the battle's own view)
roll 0 > 0                      ; FF8's roll over the segment (4096 a turn), about the screen's centre
ease 0                          ; FF8's easing: 0 even, below 0 slow start, above 0 slow end (-16 to 15)
key 7  eye camera 0 0 0           target focus 0 0 0
key 1  eye frame1 -976 -130 8188  target frame1 14 56 81
```

| Part | Meaning |
|---|---|
| `key FRAMES eye REF X Y Z target REF X Y Z` | with two keys: from key 0 to key 1 over key 0's frames, then key 1 for its own; with one: held for its frames; with three or more (stage 2, up to 32): FF8's natural cubic spline through them all, every key but the last 1 frame at least |
| `H A > B`, `roll A > B` | (stage 2) FF8's zoom (1-4096) and roll (-32768 to 32767) from the segment's start to its end, straight; no H line: the last segment's H again; no roll line: the roll held |
| `zoom = fov / dolly / none` | (stage 2) H as the battle's own H (00c05f7c, the default: the game makes its field of view and projection from it each frame, so the 2-D overlays follow it), as the eye moved along its line of sight, or not played |
| `blend = N` | (stage 2) FF8's `04 N`: a sine glide to the battle's view over the effect's last N frames (1-255) in place of the cut; nothing is made longer |
| `camera`, `focus` | where the camera was and where it looked (at the effect's start: the battle's view); the key's X Y Z are ignored, as in FF8 |
| `world` | the battle's centre: X Y Z is a place |
| `frame0`-`frame4` | FF8's effect frames: centred halfway from the caster to the target (the middle of the targets when there are several), Z pointing at the target, so X Y Z turn with that line; `frame0` in FF8 units, `frame1`-`frame4` in 5000ths of the caster-target distance (`unit_scale` does not apply to them); `frame0` on the floor, `frame1`-`frame4` (stage 2) between the caster's and the target's body point (the model's point 0, which the game aims its cursor at) |
| `target`, `caster` | the highest-numbered target, the caster, on the floor; `target.bone N`, `caster.bone N` one of its bones |
| `group` | (stage 3) FF8's 0xb0: a frame at the target (several: the centre of the box round them, on the floor), turned half round about Y (X and Z negated) when no party member is a target; FF8 units |
| `effect` | (stage 3) FF8's 0xf9, a frame the effect module itself moves (Death's object); FF7's effects have none, so it is the target's place on the floor, the battle's axes, FF8 units |
| `#hhhh` | (stage 3) a reference word as FF8 stores it; only its low byte counts, as in FF8 (`#5ef7` = `frame3`, FF8 Water's data) |
| `snap` | without it, a key that names the target follows the target while the segment plays |

- It plays as the roll does: only while a **native effect** runs under the camera, frame 0 being the effect's first.
  A chain shorter than the effect holds its last shot; when the effect ends the game **cuts** back to the battle's
  view, and the next turn is not delayed.
- Before and after the effect, under the Config menu's fixed camera and with the game's own effects, the camera shows
  the battle's home view. During target selection (another member's cursor during the effect) the game glides from
  the FF8 shot back to its battle view; when the cursor closes, the FF8 shot comes back at once (a jump).
- A `[roll]` section can be added to such a camera; it plays on the same frames. It is not the same as the segments'
  `roll`: `[roll]` turns the arena about its Z axis (stage 0, the game's Euler angle), the segments' `roll` turns the
  picture about the screen's centre exactly as FF8 does (stage 2: SpellExt hooks the camera's build at 0041bda4 and
  builds the camera again with the up vector turned). The two can be used together.
- The numbers are FF8's, so a converted FF8 camera keeps its own numbers; `unit_scale` sizes them for FF7's arena.
- Offsets from an effect frame are turned with the caster-target line, as FF8 does. FF8 also turns target and caster
  offsets with that actor's facing; this stage does not (they are measured from the battle's axes, up as -Y).
- Stage 2 plays FF8's curved paths (three or more keys), its zoom and its roll, and the blend back. With `select =
  A.V` one chain plays; `select = sequence` (stage 3, below) lets FF8's own program choose it each cast.

### FF8's sequence: `select = sequence` (stage 3)

FF8 keeps, beside a spell's chains, a small program (its camera "sequence", run by FF8's bytecode machine at
0050db40) that chooses the chain to start from the target's side, its state and dice. With `select = sequence` the
camera keeps every chain and SpellExt runs that program, FF8's own bytes, once a frame from the effect's first:

```
camera = 19c
engine = ff8
camera_mode = 0, 1          ; FF8's var00: one of the two each cast (default 0, 1)
select = sequence

[sequence]                  ; FF8's program, in the converter's words (Tools/ff8cam/FORMAT.md 5)
        acc = var19         ; the target: 0-2 the party, 3 and up the enemies
        var7f = acc
        acc = 3
        acc -= var7f
        jle Lenemy
        start 0x20          ; an ally: animation 2 variant 0
        end
Lenemy: start 0x00          ; an enemy: animation 0 variant 0
        end

[anim 0 variant 0]
...
```

| What the program reads | FF7's value |
|---|---|
| `var00` | `camera_mode`: one of its two bytes at random each cast (FF8: the battle formation's two camera bytes, FUN_00500f70) |
| `var01`-`var07`, `var78`-`var7f` | kept for the battle, 0 at its start (FF8's FUN_005041e0) |
| `var10` | which chains run, a bit a variant (FF8's mask) |
| `var11`, `var1c`-`var22` | FF8's random (seed x 69069 + 1, the top 15 bits) and dice of 2-8 faces |
| `var13`, `var1b` | party members there and alive / there with no status at all (FF8 counts its three party slots) |
| `var15` | 0 (FF8: the target's size class, from the monster's data; FF7 has none) |
| `var16` | the target: bit 1 dead, bit 0 a party member in its weak pose (FF7's weak idle) |
| `var17` | 0 (FF8: the action's "no camera" byte) |
| `var18`, `var19` | the caster, the (last) target: 0-2 the party, 3 and up the enemies (FF7's 4-9 as 3-8) |
| `var1a` | the number of targets |

- `start` begins the chain on that frame (FF8's: a start of an animation the file lacks is ignored); `stop` and
  `halt` stop it (the battle's view); `blend N` glides to the battle's view over N frames; `hold` / `release` / `save`
  set and clear FF8's hold flag; an `empty` chain shows nothing. A frame the pause repeats does not run the program
  again.
- What FF8 itself would hang or crash on is refused when the file is read (`acc clear`, variables 80-ef, `blend 0`, a
  program that does not end with `end`, `halt` or `jmp`) or stops the program with a log line when it runs (a
  division by 0).
- The Config menu's fixed camera: a sequence camera is not played under it, as the cameras without a sequence and the
  game's own (the user's choice; FF8's FUN_00504060 would show a started chain while the hold flag each start sets is
  set). `hold` / `release` / `save` are kept, with no effect then.
- Segments of 0 frames are read (FF8 passes over them in the same frame; an H line of theirs is kept by a later
  segment without one).

Camera 19c (`camera_ff8_fire_seq_19c.txt`, spell 3090 "Camera FF8 Sequence Test") is the stage-3 example: FF8 Fire's
whole camera, its 314-byte program and its 24 chains, checked byte for byte against FF8_EN.exe.

Camera 199 (`camera_ff8_test_199.txt`, spell 3087 "Camera FF8 Test") is the example: FF8 Fire's own camera,
animation 0 variant 0, decoded from FF8_EN.exe, on FF8 Fire's effects. Stage 2's examples: camera 19a
(`camera_ff8_test_19a.txt`, spell 3088: zoom, an exact roll, a spline and a blend back, made by hand) and camera 19b
(`camera_ff8_fira_19b.txt`, spell 3089: FF8 Fira's own animation 0 variant 0, a three-key spline with a zoom).

## 7. Starting from one of the game's cameras

CAMMY (`External Tools/CAMMY`, a page you open in a browser) reads the game's camera files: **Open game camera**, pick
`camdat0.bin` (or 1, 2) from `data/lang-en/battle` and type a camera number, for example `4e`. It shows the camera in
3D and lists every command with what it does, so it is the quickest way to learn the language: take a game camera
close to the shot you want, change it, give it a number from 190 up, and **Save .txt**.

## 8. What is not known yet

- How the game chooses which of the three variants it shows (give all three the same scripts).
- What `da`/`db`, `dc`/`f1` and `d7` do exactly, and the meaning of `de`.
- The units of the angles in `f2`, `f3` and `f8` (4096 to a full turn is likely, unconfirmed).
- What camera numbers −1, −2 and −3 (built into the program) are for.
- Which way a positive roll turns the picture (clockwise or not) has not been seen in the game yet.
- FF8 cameras (`engine = ff8`): the size of FF8's units in FF7's arena (`unit_scale`, for every offset but frames
  1-4) is not settled. Stage 1 has been seen in the game (camera 199); nothing of stage 2 has been seen yet: the
  zoom's look against FF8's, which way the roll turns on screen, and whether FF7's body point (point 0) sits where
  FF8's points 0xf0 / 0xf1 do are read from the code only.
- The game's Config menu option for a fixed camera skips most special cameras (except a short list of the game's
  numbers); whether it skips new ones has not been tested.
- FF8's sequence (stage 3) is read from FF8's code and checked against the converter's reference machine; nothing of
  it has been seen in the game. Its `var15` (the target's size class) and `var17` have no FF7 source and are 0;
  `effect` stands at the target.

Corrections and findings are welcome: every reading above came from the game's two camera interpreters and from
testing cameras in the game.
