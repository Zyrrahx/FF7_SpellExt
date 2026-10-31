# Skeleton Master

A browser page for Final Fantasy VII battle animations, with three tabs:
- **Add slots**: add extra animations to a battle model.
- **Retarget**: move animations from one model's skeleton to another's (Cloud's limit on Vincent, say).
- **Scripts (ab)**: read and change a battle model's action scripts: which animations each slot plays, and when.

Open `index.html` in Firefox, Chrome or Edge; nothing to install, nothing sent anywhere. Add slots works offline; the
Retarget and Scripts tabs' 3D views need the internet once (see below).

## Add slots

1. **Load the model**: choose its skeleton `xxaa` and animations `xxda` together (Cloud: `rtaa`, `rtda`), the files the
   game actually loads (a model mod has its own). The page shows the model's **kind**, its **empty slots** and its
   **free new numbers** (see "Which numbers" below).
2. **Load animations to add**: any `xxda`, a limit pack `.a00`, a single animation saved as `.anim` (one record), or
   the `.zip` the Retarget tab's Download gives. They must be made for the model's skeleton (same bone count). The
   **Weapon** column says which weapon track comes with each:
   - from an `xxda`: number + 34 (also for 68-9b and d0-ff of an `xxda` an earlier build extended);
   - from a limit pack: number + 8;
   - from the Retarget tab's `.zip`: the `NAME_weapon.anim` inside it;
   - a single `.anim` holds a body only. Choose `NAME.anim` and `NAME_weapon.anim` **together** (or the weapon file
     later): they pair by themselves, and the Weapon column then names `NAME_weapon.anim`. A browser's copy number
     (`NAME(3).anim`) is NOT used to pair: a browser numbers each name on its own, so once a body was saved without its
     weapon file `NAME(3).anim` goes with `NAME_weapon(2).anim`. One body and one weapon file of a name pair unless
     they were saved more than a minute apart (the Retarget tab's "Body .anim only" and "Weapon track .anim only" are
     two clicks, seconds apart); with several of a name, a weapon file pairs with the body saved within 2 s of it (the
     two files out of one `.zip` have the same time). A pair saved further apart, or files the times cannot tell apart,
     are left unpaired, and the page says so: choose the weapon in step 3. A weapon file with no body paired with it is listed as "this
     is a weapon track"; it cannot be added as a body (the page refuses it and says why).
3. **Pick a number and add**; repeat. Each added animation's **Weapon track** (step 3) can be changed by hand: any
   weapon track loaded in step 2 (a `_weapon.anim`, or a 1-bone animation of an `xxda` or a pack), or one made here
   (at the feet, or held as in this model's idle), or empty (the game's placeholder: the weapon is hidden while it
   plays). It is written at number + 34 (party), 16 further on (an enemy with a weapon); a model with no weapon tracks
   gets none. See "An animation with no weapon track" below.
4. **Build**, then download each file with its own button: the `xxaa`, the `xxda` (they belong together) and a list of
   the new numbers with the script bytes that play them and the weapon track each got. Every download is its own
   click: a browser may block a second download a page starts by itself, without a word.

### Adding a retargeted animation with its weapon (the round trip)
- **In one session**: Retarget tab, preview the animation (its message must say "with its weapon track"), then **Send
  to Add slots**. Body and weapon go over together; nothing is kept after a reload.
- **Through files**: Retarget tab, **Download**. With a weapon track it saves ONE file, `NAME.zip`, holding
  `NAME.anim` (the body) and `NAME_weapon.anim` (the weapon track), for example `rtda_02_on_saaa.zip`. In Add slots
  step 2 choose that `.zip`, or unzip it and choose both `.anim` files together. Check the Weapon column names the
  weapon file, add, and check step 3's Weapon track says "at 9c" (number + 34), not "none". Then build.
- Already have a body `.anim` and its `_weapon.anim` under other names? Add the body, then choose the weapon file in
  step 3's Weapon track list.
- Several downloads of the same animation (`NAME(1).anim`, `NAME_weapon(2).anim`, ...) are paired by the time each was
  saved, not by the number; when the page cannot tell, it says so and leaves them unpaired: choose each weapon in
  step 3.
- The page reads a `.zip` whose files are stored, not compressed (the kind it writes); a compressed one (as most
  other tools make) is refused: unzip it and choose the `.anim` files instead. The Retarget tab does not read the
  `.zip`: there, unzip it and choose `NAME.anim`, or save with **Body .anim only**.

### An animation with no weapon track (from a model without a weapon)
A party model (and an enemy with a weapon, 16 + 16) plays a weapon track beside every body animation. An animation that brings none (one retargeted from an
enemy model without a weapon, or a body `.anim` saved alone) gets one by the rule in step 3, **An added animation with no weapon track
of its own gets one**:
- **at the feet** (the default): the weapon lies on the floor beside the feet for the whole animation, turning and
  moving with the model. **at the feet: side front lift** places its grip: by default `250 250 30`, 250 to the model's
  left, 250 ahead, 30 above the floor (the weapon lies on its side with its blade to the back). Weapons differ in
  thickness: raise lift if the weapon sinks into the floor, lower it if it floats (measured on idle frame 0 with the
  defaults: Sephiroth's sword 4 above the floor, Cloud's 3 into it, Barret's gun-arm 39 into it). Barret needs about
  `450 250 70` (measured over all his animations: clear of the floor and at least 24 from his bones); Cloud's sword
  comes close to his legs when he steps to the side. A flip (the model upside down) does not turn the weapon round.
- **held as in this model's idle**: the weapon stays in the hand as the idle (animation 00, frame 0, with its weapon
  track 34; 10 on a 16 + 16 model) holds it; the hand is the bone whose end is nearest the weapon there.
- **empty**: the game's 1-frame placeholder. The game then draws the weapon only on frame 0, if at all (it draws a
  weapon frame only while the animation's frame is below the track's frame count: read from its code, not seen).
A made track has exactly the body's frame count, which matters to **KimeraCS**: read from its source (version 1.8z;
not run), it lists a party model's first 52 animations and draws each one's weapon from the weapon track at number +
34 frame by frame without checking the track is long enough, so an animation it lists whose weapon track is shorter
(the placeholder above all) makes it fail: it shows "Error Drawing current model: Index was out of range" again at
every redraw. The new numbers 68-ff are not listed by KimeraCS and never do; a body put
into an old placeholder number below 2c does, unless its weapon track is as long as it: the build says so when one is
not. On a 16 + 16 model the same holds below 10 (KimeraCS lists its first 16 bodies), not for the bands from 20 on. The slots the page fills between new numbers stay the game's placeholders (KimeraCS never pairs them with an
animation it lists).
The Retarget tab does the same with the map's `weapon_when_missing` (see below), so its Download carries the made
track; with "empty" it carries the body alone, and Send to Add slots keeps "empty" for it.

### Which numbers, by the model's kind
| Kind (the `xxaa` header) | Examples | New bodies go | Weapon track | Header after |
|---|---|---|---|---|
| party member: dword 7 = 52, dword 10 > 0 | `rt`..`si`, your own party models | 68-9b, d0-ff; or an empty slot below 2c | number + 34 | 52 + the rest |
| no weapon tracks: dword 10 = 0 | 356 of the 391 vanilla models (every enemy without a weapon, the 1-bone ones), `rs` `sj` `sk` `sl` `sm`, a party-sized model that carries no weapon | after the last, up to ff; or an empty slot | none | the count + 0 |
| an enemy with a weapon: dword 7 = 16, dword 10 > 0 | `mu` (final-duel Sephiroth, the Masamune), `np`..`nu`, `aq` `ci` `dq` `gr` `jp` `jq` `jr` `ob`..`of` | first its **empty bodies below 10** (`mu` 0d-0f, `np`..`nu` 0e-0f, the others 0a-0f); then the bands 20-2f, 40-4f, 60-6f, 80-8f, a0-af, c0-cf, e0-ef | number + 10 (16 further on: 1d-1f, 30-3f, ..) | 16 + the rest |
| any other N bodies + M weapon tracks | none among the vanilla models | refused | | |

- A **character's skeleton** without weapon tracks (dword 0 = 2, e.g. `rs`) is not offered 2c-33: played as a party
  member, those numbers play its limit pack.
- An **enemy with a weapon**: the game draws an enemy's weapon from body + 0x10 (0043076b, hard-coded) and KimeraCS
  from the header's dword 7 + n: both are 16 further on only when the model has 16 bodies, so every new body keeps
  its track 16 further on. The empty bodies below 10 are the safest: the game and KimeraCS both show them (give each a
  weapon track of its own length: KimeraCS fails showing a body whose track is shorter). The bands from 20 on are
  played by the game with their own tracks, but KimeraCS reads every record after the first 16 as a weapon track: it
  does not list them, and saving the model from KimeraCS turns them into 1-bone tracks (they are lost); the build says
  so. It is the same limit as a party model's 68-ff. "Held as in the idle" uses the model's idle 00 with its track 10.
- Header dword 8 (dword 7 + 2 in the vanilla models) is left as it is: the game does not read it (read from the code)
  and KimeraCS copies it.
- The Python twin does the same: `anim_tool.py add XXAA XXDA` lists the kind and numbers, `anim_tool.py add XXAA XXDA
  OUT_AA OUT_DA NN=ITEM[,WEAPON] ...` builds the same two files byte for byte (see `FF7_SpellExt/tools/README_tools.txt`).

### Why it works
A party model has 52 body animations (0-2b its own, 2c-33 the limit pack). The game finds body animation n's weapon
track at n + 0x34, so new animations go in the free numbers **68-9b** and **d0-ff**, each with its weapon track 0x34
further on; every slot between is filled with the game's own placeholder, and the skeleton header's count is raised
so the game makes room for them all. Every existing animation stays byte for byte as it was. No DLL is needed.

In the model's action scripts (`xxab`, edited in the Scripts tab), bytes 00-8d play that animation; numbers above 8d are played with `a7 NN`.
Never use 2c-33 or 34-67 as body animations on a party model. Models with no weapon tracks (the header's second count
0) are extended after their last animation, up to ff. A model whose header gives 16 bodies + 16 weapon tracks (an
enemy with a weapon, such as the final-duel Sephiroth `mu`: body n's weapon track is n + 16, hex 10; KimeraCS pairs
them by the header, dword 7 + n, and the game draws an enemy's weapon from n + 0x10) has its empty bodies below 10
filled first, then bands of 16 bodies each followed by their 16 tracks (see "Which numbers"). Its animations come with
their own weapon tracks wherever they are used (Add slots step 2, the Retarget tab, where the sword's own movement is
retargeted into the target's hand), also from a file Add slots built (bands of 16: body n with n + 16).

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
   reference (34, frame 0). When a map already names the references for that side, they are kept as the map gives
   them (with their folders): an `xxda` the map names fills in only a missing weapon reference, and one the map does
   not name leaves the map's two references together (body and weapon measured from the same pose) and offers a
   button to use the file's 00 and 34 instead, both at once. When the map names this model's own xxda (rtda for
   rtaa) and that file is not loaded, an xxda loaded under another name (rtda(1), a rebuilt sada(1)) takes the place
   of both references, and the message says so. A map opened after the files that names no weapon reference gets
   them from the loaded `xxda` (34), as if the files were loaded after it.
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
   (`30-31 35 36`) or pick them in the view. **Weapon when missing** says what the weapon does in an animation that
   brings no weapon track (see "The choices").
5. **Watch the preview** (section 4). Pick an animation: the original plays on the source, the result on the target,
   with play, pause, a timeline and a speed. It updates a moment after every change, so you can adjust and watch. If
   the map cannot run yet, the reasons are listed (a bone out of range, feet on one side only, and so on).
6. **Export** (section 5):
   - **Download**: with a weapon track (retargeted, or made by Weapon when missing), one `.zip` of `NAME.anim` and
     `NAME_weapon.anim`; without one (Weapon when missing "empty", or a target with no weapon tracks), the `.anim`
     alone (the message says which, and why). **Body .anim only** and **Weapon track
     .anim only** save one file each, each its own click.
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
- **Weapon**: the target's weapon hand, and a weapon reference for each model (the weapon track of its idle, frame
  0: 34 in a party model's `xxda`, 10 in a model of 16 bodies + 16 weapon tracks such as `mu`; loading a side's
  `xxda` fills it when the map names none). Each body animation brings its own weapon track (n + 34 in a party
  model, n + 8 in a limit pack, n + 16 in a 16 + 16 model, by the source skeleton's header). The target's weapon then turns as the source's does and stays in the hand. Without a weapon hand the
  source's weapon tracks are not retargeted: step 2 warns when the animations loaded have weapon tracks and the map has
  no hand. A weapon hand and missing weapon references stop the retargeting only when the animations loaded have
  weapon tracks; a model without a weapon retargets as it is.
- **Weapon when missing** (`weapon_when_missing = feet | idle | empty`, default feet; `weapon_feet = SIDE FRONT LIFT`,
  default `250 250 30`): the weapon track of an animation that brings none to retarget (the source has none, or the
  map has no weapon hand), when the target has weapon tracks (the map's target weapon reference, or the idle's weapon
  track of the target reference's `xxda`: 34, or 10 for a 16 + 16 model). **at the feet**: lying on the floor beside the feet for the whole animation;
  **held as in the target's idle**: in the hand (the weapon hand, or the bone nearest the weapon in the target
  reference) as the target weapon reference holds it; **empty**: none (the game's placeholder, which KimeraCS cannot
  show below 34). A limit pack's weapon tracks follow the same rule. The made track has the body's frame count.
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
- **A single animation**: **Send to Add slots** (or download it and load the `.zip` there), load the target model in
  that tab, give it a free number and build. The list the build gives says which script byte plays it and which
  weapon track it got. See "Adding a retargeted animation with its weapon" above.

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
weapon_when_missing = feet                  # feet | idle | empty: the weapon track of an animation that brings none
weapon_feet = 250 250 30                    # at the feet: the grip to the model's left, ahead, above the floor
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

## Scripts (ab)

### What the scripts are
A battle model's `xxab` file holds its action scripts: one per **slot**, and the game picks the slot. Slot 0 is the
idle, 2 the KO, 5 a hurt reaction, 20 the attack, 29 magic, 60 onwards the limits, and so on (party models have 74
slots, enemies 32). A script is a short list of bytes run one after another: a byte from 00 to 8d plays that
animation of the model; every other byte is a command (turn to the target, step forward, show the damage, start the
spell's effect...), some followed by values. So Cloud's KO, `e5 06 f1`, reads: turn back to his side, play animation
06 (lying down), finish and hold the last frame. The game moves to the next byte only when the animation playing has
reached its last frame.

### Step by step
1. **Load the files**: choose the model's `xxab` (Cloud: `rtab`) and, for the checks and the preview, its `xxaa` and
   `xxda`, all three at once. The xxab alone works too: then animation numbers are not checked and nothing is shown
   in 3D; a model already loaded is kept when Add slots handed it over or it has the file's prefix (`rtaa` for
   `rtab`), and the message names it; another character's model is dropped.
   The page tells a party model from an enemy by the file; the Kind list overrides it, but a party model's file cannot
   be read as an enemy. While the file has changes not saved, another xxab is not opened: save or undo them first (once saved, it opens).
2. **The slots**: every slot with what it is used for (hover for when the game plays it), its bytes and how it ends.
   Tags mark slots that share their bytes, unused slots, broken offsets and slots the game never reads.
3. **Edit the slot**: click a slot. Its script is in the box, one command to a line, and explained line by line
   below it. Change the bytes; the page checks them as you type. **Apply to this slot**, or, when other slots share
   the script, **Apply to every slot that shares it**. To start from another model's script, open its xxab under
   "Copy a script from another model", pick the slot and put its script in the box; its animation numbers are then
   this model's, so check them.
4. **Preview**: the animations the script in the box plays, one after another, with its waits and its loops, on the
   model's skeleton. A script that ends (`ee`, `f1`, `9e`) stops on its last frame; Play starts it again. The list under
   the view says the same in words.
5. **Save**: downloads the xxab under its own name. The table shows each changed slot, was and now. Undo goes back one
   change; Undo every change gives the file back as loaded.

### How a script must end
- `ee`: finished, back to the idle. Every attack, reaction and limit ends with it (or `f1` or `9e`).
- `f1`: finished, holds the last frame (KO, victory).
- `9e`: waits until the target has finished and every effect is over, then finished (the 2x-Cut turns).
- `fe c0` and `c1`: loop for ever. Right for an idle (slots 0, 1, 2, 12, 13, 14 and 19 of a party model, 0-2 of an
  enemy); anywhere else the battle waits for the script for ever. The page warns about it.

The page **refuses** the crashes and freezes it knows of: a script with no end, a command whose values are cut off, a
jump (`c1`, `ca`, `b3`, enemy `ce`) with no mark to land on, a move or step over 0 frames (`d4`, `94`, `a8`, `99`, `cc`,
`cf`, `d1`, `d5`, `e9`: a division by zero), `f5` on a party model, a script over 256 bytes, and a script that can come
back to the same place within one frame without playing anything (the game reads on until something plays: `c9 e5 c1`,
or in an idle slot `ee` or `e5 fe c0`, which start the same script again). It **warns** about an animation the model
does not have (the game loses a frame and logs "ANM_ERROR"), a weapon track's number (34-67) played as a body, the
limit pack (2c-33) outside a limit slot, `fe` without `c0`, `d0` with a value over 7 (the frames are left as an earlier
move set them), a `c9`..`ca` wait with nothing played between (it spins while an effect loads), a script with so many
`b3`..`b2` branches that the freeze check cannot follow them all (it is then not checked for a freeze), bytes after the end
that never play, and slots the game never reads. With "Apply to every slot that shares it" each of those slots is
checked as itself.

### What saving does to the file
The file's other bytes never move. Vanilla files hold scripts no slot uses, leftover bytes and (for some enemies)
effect data, and all of it stays where it is, so a file saved with no change is the loaded file byte for byte. A
changed script is written over its old one when it fits before the next script and no other slot uses it; otherwise
it is added at the end of the file and only its slot's offset changes (when a slot or the header's effect offsets
pointed at the very end of the file, 32 bytes go there first: `ee` and 31 zeros, so such a slot now ends at once
instead of running into the new script; it was broken before, and is not counted as a change). A script added this way
and changed again is rewritten where it is.

### Limits
- Read from the game's code (ff7_en.exe, Steam 2013) and checked on all 481 xxab files of battle.lgp: every script
  reads cleanly and every file saves back byte for byte. Nothing here was seen in the game: test before you share.
- What several commands do is not traced (they say so in the explanation), nor which of an enemy's slots past 0-2 its
  attacks use: an enemy's attack data chooses them.
- Party slots 46-50 and 52-59 are the game's own scripts: what the file holds there is never read.
- The preview plays animations only, in place: steps, run-ins, the way home and effects are not shown, `a9` starts at
  the first frame (the game starts it at random), `b3` is shown with its display bit clear, effects load at once. The
  limit pack's animations (2c-33) are not in the model's files and are skipped.
- Some vanilla files are broken and the page shows it: Sephiroth's `saab` points 14 slots at the file's end (51, 52, 61,
  62) or the header (64-73), `hbab` points every slot at the header, `obab`-`ofab` have only 24 real entries. A broken slot can be given a
  script (it is added at the end); the 8 entries past `obab`'s 24 cannot.
- Eight enemies have a single bone (`ed`, `fi`, `if`, `ig`, `iy`, `jv`, `jw`, `lo`): their animation numbers are checked,
  but the stick view has nothing to draw.
- The header (bone numbers for effects, effect offsets) is shown but never changed.
- Animations added in the Add slots tab: build there, then "Use them in Scripts" hands the new files over, so their
  numbers are checked and previewed here.

## Files
- `index.html`: the page. `anim_core.js`: Add slots' file handling. `retarget_core.js`: retargeting (the codec, the
  pose, the map format). `ui_logic.js`: the Retarget tab's names, map editing and checks. `retarget_ui.js`: the
  Retarget tab's display. `ab_core.js`: the Scripts tab's reading, explaining, checking and saving. `ab_ui.js`: the
  Scripts tab's display (it borrows the Retarget tab's 3D view). The `.js` files other than the two `_ui.js` and the
  page have no display code.
- `tests/` (for whoever changes the page; run with node): `run_tests.js` (Add slots), `retarget_tests.js` (the
  retarget core against stored results), `ui_tests.js` (the Retarget tab's logic), `page_smoke.js` (the page's own
  scripts driven step by step against a stand-in for the browser; with `THREE_DIR=<folder holding three.js 0.128's
  three.min.js and OrbitControls.js>` it also builds the 3D views and clicks bones in them), `weapon_tests.js` (the
  weapon track's round trip with real files: Retarget's one-file Download, the `.zip` and the paired `.anim` files in
  Add slots, the Weapon track chosen by hand, Build's one-click downloads, the map's weapon references kept; against
  `weapon_expected/`, made by `make_weapon_expected.py` from the Python tools; `dom_standin.js` is its browser
  stand-in), `noweapon_tests.js` (animations from a model without a weapon: the final-duel Sephiroth `mu` onto the
  playable one with the maps in `noweapon_maps/`, the weapon track made by each rule in the Retarget tab and in Add
  slots, the pack, and every built model read as KimeraCS reads it; against `noweapon_expected/`, made by
  `make_noweapon_expected.py` from the Python tools), `pair16_tests.js` (a model of 16 bodies + 16 weapon tracks: which
  record is each body's weapon track in every battle model, by all three copies of the rule and the Python twin, the
  same as before for every other file; mu's own sword retargeted onto sa through Retarget and Add slots; mu as a
  model taken, 17 + 15 refused; 'at the feet' through flips; `weapon_feet` refusals; against `pair16_expected/`, made by
  `make_pair16_expected.py`), `addslots_tests.js` (Add slots on a sample of every kind of battle model: the core =
  the Python twin `anim_tool.py add` byte for byte, with the same refusals and notes; every built pair read back by the
  page's reader, by the game's rules and by KimeraCS's; the page itself on mu, am, rs and a 17 + 15 model; against
  `addslots_expected/`, made by `make_addslots_expected.py`; the five `make_*_expected.py` take `--py DIR` to use a
  changed copy of the Python tools),
  `ab_tests.js` (the
  scripts core: every xxab of an extracted battle.lgp read and saved back byte for byte, every script decoded and
  checked, edits on real files; the folder is its first argument, by default the project's `Battle.lgp Files`).
