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
- Up to 64 cameras and 32,768 bytes of script in all.
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
- The game's Config menu option for a fixed camera skips most special cameras (except a short list of the game's
  numbers); whether it skips new ones has not been tested.

Corrections and findings are welcome: every reading above came from the game's two camera interpreters and from
testing cameras in the game.
