# Skeleton Master

A browser page for Final Fantasy VII battle animations, with two tabs:
- **Add slots**: add extra animations to a battle model.
- **Retarget**: move animations from one model's skeleton to another's (Cloud's limit on Vincent, say).

Open `index.html` in Firefox, Chrome or Edge; nothing to install, nothing sent anywhere. Add slots works offline; the
Retarget tab's 3D views need the internet once (see below).

## Add slots

1. **Load the model**: choose its skeleton `xxaa` and animations `xxda` together (Cloud: `rtaa`, `rtda`), the files the
   game actually loads (a model mod has its own).
2. **Load animations to add**: any `xxda`, a limit pack `.a00`, or a single animation saved as `.anim` (one record). They
   must be made for the model's skeleton (same bone count). A body animation's weapon track comes along when the file
   has one.
3. **Pick a number and add**; repeat. **Build** downloads the two new files (same names) and a list of the new numbers
   with the script bytes that play them.

### Why it works
A party model has 52 body animations (0-2b its own, 2c-33 the limit pack). The game finds body animation n's weapon
track at n + 0x34, so new animations go in the free numbers **68-9b** and **d0-ff**, each with its weapon track 0x34
further on; every slot between is filled with the game's own placeholder, and the skeleton header's count is raised
so the game makes room for them all. Every existing animation stays byte for byte as it was. No DLL is needed.

In the model's action scripts (`xxab`), bytes 00-8d play that animation; numbers above 8d are played with `a7 NN`.
Never use 2c-33 or 34-67 as body animations on a party model. Enemies (no weapon tracks) are extended after their last
animation, up to ff; models with 16 body + 16 weapon tracks are not handled yet.

All of this was read from the game's code (ff7_en.exe, Steam 2013) and checked by building and reading back test files;
please report what you find in the game.

## Retarget

### What retargeting is
An animation stores, for every frame, how far each bone of **one particular skeleton** is turned. Another model has
other bones: other numbers, other lengths, other directions at rest (Cloud has 23 bones, Vincent 47). Copying the
numbers across makes a tangle. Retargeting works the movement out again for the other skeleton: you say which bone of
the target should move like which bone of the source (a **map**), and the page recomputes every frame so the target
strikes the same poses with its own body. Typical uses: give a new character another character's limit break or
victory pose, or borrow an enemy's attack.

### Words used here
- **Source**: the model whose animation you want. **Target**: the model that will play it.
- **xxaa / xxda**: a battle model's skeleton and its animations, in `battle.lgp` (Cloud: `rtaa`, `rtda`; the two letters
  differ per model). A limit break's animations are a separate **limit pack** (`.a00`) in `magic.lgp`. Use an LGP
  tool to take them out, or the files of the mod that supplies the model.
- **Weapon track**: a party model's weapon has its own animation beside every body animation. The page retargets it
  too, so the weapon stays in the hand.
- **Map**: a small text file of pairs and settings. It is the only part you write; save it and you can redo the job,
  or share it so others can retarget any animation between the same two models.

### Step by step
1. **Load the files** (section 1).
   - *Source skeleton* and *source animations*: the source's `xxaa` and `xxda`.
   - *Target skeleton* and *target animations*: the target's `xxaa` and `xxda`.
   - *Animations to retarget*: the source's `xxda` again (you then pick animations from it), a limit pack `.a00`, or a
     single `.anim`. Several at once is fine.
   - *Other files*: anything else a map names, such as a weapon reference kept in another file.

   Loading an `xxda` also sets that model's reference pose (animation 00, frame 0) and, when it has one, its weapon
   reference (34, frame 0).
2. **Start a map** (section 2): **New**, or **Open** a `.map` someone made for these two models. An opened map lists
   the file names it needs; files are matched by name, ignoring case and folders (`../work/model/rtda` finds `RTDA`).
   A map of the other kind (a "pose copy" map, used when a model wears the source's own parts) is refused with the
   reason.
3. **Pair the bones** (section 3). Both skeletons stand side by side in 3D, in their reference poses; drag to turn the
   view, tick *show every bone number* to label them all. Choose **aim**, **follow** or **reach**, then click a bone of the
   source and a bone of the target (either order). Hover a bone to see its number, its parent and what it follows;
   its partner lights up. The list below the views lets you change a pair's source bone or kind, remove it, or add
   one by typing numbers.
4. **Set feet and weapon** (section 3): the foot and toe bones on each side, and the target's weapon hand. Type numbers
   (`30-31 35 36`) or pick them in the view.
5. **Watch the preview** (section 4). Pick an animation: the original plays on the source, the result on the target,
   with play, pause, a timeline and a speed. It updates a moment after every change, so you can adjust and watch. If
   the map cannot run yet, the reasons are listed (a bone out of range, feet on one side only, and so on).
6. **Export** (section 5):
   - **Download .anim**: the result (and `_weapon.anim`, its weapon track, when there is one).
   - **Retarget the whole pack**: a limit pack in, the same pack for the target out, with a report.
   - **Send to Add slots**: hands the result to the other tab; load the target model there and give it a new number.
7. **Save the map** (section 2) so you can come back to it.

### The choices, in plain words
- **aim**: the target bone points exactly where the source bone points. The target takes up the source's stance. The
  usual choice for spine, head, arms and legs.
- **follow** (a pair with no word in the map file): the target bone turns as the source bone turns away from its
  reference pose. It carries twist and small motions faithfully, and a bone shaped differently on the two models keeps
  its difference. Good for a pelvis that points down on one model and up on the other, and for shoulders that should
  stay on the target's own torso.
- **reach**: the target bone points from the model's origin toward where the source bone ends. For a bone that only
  carries a shoulder or hip out from the body, when the two skeletons hang their limbs from different places.
- **Bones without a pair** keep their reference pose and ride on their parent (hair, a cape, a tail), unless they are
  made loose.
- **Reference poses**: one frame of each model in which both stand the same way. Every movement is measured from
  these, so they must mean the same pose. The default, frame 0 of animation 00, is each model's idle stance, which
  usually works.
- **Feet**: each frame the target is raised or lowered so its lowest foot is as high off the floor as the source's.
  Leave them out and feet may float or sink.
- **Weapon**: the target's weapon hand, and a weapon reference for each model (the weapon track of its idle, 34
  frame 0). The target's weapon then turns as the source's does and stays in the hand. Without a weapon hand, weapon
  tracks are left empty and the weapon is hidden while the animation plays.
- **Advanced** (closed until you open it):
  - *scale*: how far the whole model moves. Empty = worked out from the two models' heights.
  - *loose bones*: hair or a cape that trail behind the movement and settle. *hang* (0-1): how much a bone keeps
    hanging down when its parent tips; *stiffness* (0-1): how strongly it is pulled back to its rest pose (1 = rigid);
    *damping* (0-1): how much speed it keeps; *gravity*: how far its tip sinks each frame; *limit*: the most it may
    bend, in degrees. It is a simple lag, not a cloth simulation.
  - *colliders*: an oval tube round a body bone (the torso, say) that loose bones are pushed out of, so long hair lies
    on the back instead of passing through it.
  - *style*: *pose* (the default) uses aim and reach; *offset* only follows the turning of every bone.
  - *loose on/off*: off holds every unpaired bone stiff.
  - *key*: the precision the angles are stored with (0 finest; the default keeps the source's).

### Making a good map
- **Start with the trunk.** Pair the torso or chest and the head with **aim**, and the pelvis with **follow**, and
  look at the preview before going on.
- **Then the limbs, one side at a time**, root to tip: upper arm, forearm, hand; thigh, shin, foot, toe, all **aim**.
  Make sure left goes to left: hover the bones and compare. A crossed pair shows at once as a twisted limb.
- **Shoulders and hips**: where the target hangs its arms or legs from a bone that the source does not have, or from
  another place, pair those bones with **reach** or **follow**. Bones a target has and the source lacks can stay
  unpaired.
- **Feet** last: give both sides' foot and toe bones, and watch that the target's feet stay planted.
- **Weapon**: set the hand and both references, then check the weapon stays in the hand through the swing.
- **Look for**: hands passing through the body, feet sliding, a sudden snap between two frames, an arm turning inside
  out. Change one pair at a time.
- When it looks right in the preview, check it in the game: the preview draws sticks, not the model's parts, so a pose
  can look right as sticks and still show a gap or a crease on the real model.

### Putting the result in the game
- **A limit pack** (`.a00`): it keeps its name. Put it where the game or your mod loads limit packs from (a mod's
  `magic` folder); with FF7 SpellExt a new character's limit can name its own pack in `FF7_SpellExt_Limits.ini`. Keep
  the original pack: the new one replaces it for everyone who uses that name.
- **A single animation**: **Send to Add slots** (or download it and load it there), load the target model in that
  tab, give it a free number and build. The list the build downloads says which script byte plays it.

### The map file
Plain text, one setting per line; `#` starts a comment. A map someone gives you opens in the page, and the page writes
the same format.

```
source_skeleton  = rtaa
target_skeleton  = zaaa
source_reference = rtda:00 frame 0          # file:animation frame
target_reference = zada:00 frame 0
source_feet = 16 17 21 22
target_feet = 30 31 35 36
source_weapon_reference = rtda:34 frame 0
target_weapon_reference = zada:34 frame 0
target_weapon_bone = 46
0  = 1  aim                                 # target bone = source bone [aim | reach]; nothing = follow
26 = 0
37 = 4  reach
39 = 5  aim
loose = 2-5 6-8 stiffness 0.45 damping 0.5 gravity 2 limit 25
collide = 0 118 89 12 140 0                 # bone, radius across, radius front to back, [height offset, below, above]
```

File names may not contain spaces, `#` or `;`.

### Limits
- **Only your eye can judge the result.** The page measures nothing for you.
- The 3D views use three.js 0.128, loaded from cdn.jsdelivr.net the first time (the browser keeps it). Without it the
  views stay empty; files, maps, pairing by number, preview messages and downloads still work.
- On a phone, a finger on a 3D view turns the view rather than scrolling the page.
- Comments in an opened map are not kept when you save it. *style*, *loose on/off* and *key* are page settings, not
  part of the map.
- Retargeting gives exactly the same bytes as the project's original command-line tools in every case tested.

## Files
- `index.html`: the page. `anim_core.js`: Add slots' file handling. `retarget_core.js`: retargeting (the codec, the
  pose, the map format). `ui_logic.js`: the Retarget tab's names, map editing and checks. `retarget_ui.js`: the
  Retarget tab's display. The `.js` files other than `retarget_ui.js` have no display code.
- `tests/` (for whoever changes the page; run with node): `run_tests.js` (Add slots), `retarget_tests.js` (the
  retarget core against stored results), `ui_tests.js` (the Retarget tab's logic), `page_smoke.js` (the page's own
  scripts driven step by step against a stand-in for the browser; with `THREE_DIR=<folder holding three.js 0.128's
  three.min.js and OrbitControls.js>` it also builds the 3D views and clicks bones in them).
