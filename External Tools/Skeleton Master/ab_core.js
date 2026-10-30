/* Skeleton Master, the Scripts tab's core: read, explain, check and change a FF7 battle model's action scripts (its
   xxab file). No display code: runs in a browser and under node alike (tests/ab_tests.js).

   What the game does (read from ff7_en.exe and its decompile, CFunctions_Readable; nothing here was seen in the game):
   - The loader reads the whole file into one buffer (model_battle_load_005e149a); every offset in it counts from the
     start of the file. The file does not store how many slots it has.
   - Header, 0x68 bytes, the same for party models and enemies (FUN_0042b66a party, FUN_0042bc15 enemy). +0x24: eight
     offsets that opcode f8 NN uses (data for a model effect). This page shows the header and never changes it.
   - +0x68: the script offsets. Party models (rs..sm) have 74 (battle_fix_model_script_pointers_0042ae73), enemies 32
     (FUN_0042b8d2). Both also turn the eight +0x24 offsets into addresses. A party file's first script starts at
     0x190, an enemy's at 0xe8: that is how the kind is told.
   - The interpreter is battle_run_model_script_0041fba4 (jump table 004248c2). A byte below 0x8e plays that
     animation; bb c0 cd d2 d3 d9 ef have no command and play their own number too; every other byte is a command
     with a fixed number of argument bytes (OPS below; s16 = two bytes, low first, FUN_00424f5f).
   - The read position is one byte: a script can be at most 256 bytes long.
   - The battle goes on only when every actor is "finished": ee/ff (then the idle restarts), f1 (holds the last
     frame), 9e (after its wait). fe c0 and c1 loop and never finish: right for an idle, a lock anywhere else.
   - c1 and ca jump to just after the FIRST c9 byte of the script, b3 skips to after the next b2 and ce (enemies only)
     to after the next cd: raw byte scans, arguments included. With the mark missing the scan never stops (a freeze).
   - Party script numbers 0x2e-0x32 and 0x34-0x3b are always the exe's own (007c10e0..007c1170): the file's are
     never read.
   Vanilla files hold dead scripts, leftover bytes and effect data no slot points at, so this core never rebuilds a
   file: it keeps the file's bytes and changes only what was edited. An unedited file saves byte for byte. */
(function (root) {
  'use strict';

  const HEADER = 0x68, FX_AT = 0x24, FX_COUNT = 8, PARTY_SLOTS = 74, ENEMY_SLOTS = 32, MAX_LEN = 256;
  const PARTY_FIRST = HEADER + PARTY_SLOTS * 4;    // 0x190
  const ANIM_LIKE = new Set([0xbb, 0xc0, 0xcd, 0xd2, 0xd3, 0xd9, 0xef]);
  const EXE_SLOTS = new Set([0x2e, 0x2f, 0x30, 0x31, 0x32, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b]);
  const PACK_LO = 0x2c, PACK_HI = 0x33, WEAPON_OFFSET = 0x34;

  /* opcode: [argument bytes (b = one byte, w = a two-byte word), what it does with the values in {n} ({nh} = hex),
     how it ends the script, who it is meant for, the longer note read from the code] */
  const OPS = {
    0x8e: ["", "Sets battle flag 2150, once a battle (meaning not traced)", "", "enemy", "Sets a battle flag (00bf2150 = 1), once per battle (guard 00bfb710); meaning not traced"],
    0x8f: ["", "Clears battle flag 2150 (meaning not traced)", "", "enemy", "Clears the battle flag 00bf2150; meaning not traced"],
    0x90: ["bw", "Recolours model part {0} with colour {1h}", "", "enemy (actors 6-9)", "Recolours a part of the model: byte = part, word = colour as 5-5-5 bits (only actors 6-9 set the part; others use stale values)"],
    0x91: ["b", "Starts background task 4255b7 with {0} (not traced)", "", "enemy", "Starts a background effect task (FUN_004255b7) with NN; not followed"],
    0x92: ["", "Stops battle time (the time-stop flag)", "", "any", "Sets the battle time-stop flag (00bfb2ec = 1). the game clears it elsewhere; misuse may freeze ATB"],
    0x93: ["", "Starts effect task 5bcd42 (not traced)", "", "any", "Starts the effect task FUN_005bcd42; not followed"],
    0x94: ["wwb", "Starts a task going from {0} to {1} over {2} frames (what it moves: not traced)", "", "any", "Starts a task going from value A to value B over NN frames; not followed (what it moves). NN = 0 divides by zero (crash)"],
    0x95: ["", "Turns to its starting direction", "", "any", "Turns to its own starting direction (for the party in a back attack sets it to 0x800 first)"],
    0x96: ["bb", "Weapon trail from frame {0}, {1} frames long", "", "party", "Starts a weapon-trail (swing streak) effect from the weapon, with the weapon's colour word (table 007c10b8 by weapon); NN, MM = start frame and length (read from code, look not seen). needs a party record: does nothing on an enemy"],
    0x97: ["bb", "Enemy death routine with {0}, {1}", "", "enemy", "Runs the enemy death routine FUN_0042567e(self, NN, MM) (FFNx: battle_run_enemy_deaths)"],
    0x98: ["b", "Shows the action's name ({0})", "", "any", "Shows the action's name banner (task with NN)"],
    0x99: ["bwwb", "Moves toward the target to distance {1} over {3} frames ({0}, {2}: not traced)", "", "any", "Moves toward the target (or the targets' centre) to distance W1 over FF frames (NN to 00be10b4)"],
    0x9a: ["ww", "Places itself {0} in front of the target, height {1}, at once", "", "any", "Places itself D (word 1, scaled) in front of the target along the target's heading, height Y (word 2), at once"],
    0x9b: ["", "Sets flag 2370 (meaning not traced)", "", "any", "Sets flag 00bf2370 = 1; meaning not traced"],
    0x9c: ["", "Sets a sound channel to full volume", "", "any", "Sets a sound channel volume (0x7f, 1: set_sfx_volume_on_channel)"],
    0x9d: ["b", "Runs special routine {0} (one of seven in the game; not traced)", "", "party", "NN 0-6 calls one of seven fixed routines (004e1627..004e16b1) with the targets and the acting actor; used by one model's limit scripts (ruab 60-66); not followed. NN above 6 does nothing"],
    0x9e: ["", "Waits until the target has finished reacting and every effect is over, then is finished", "finish", "any", "Waits until the target has finished its reaction and the effect list (100-list) is empty, then marks itself finished; the script goes on next frame (in practice it is a script end: the idle restarts). used as the end of 2x/4x-Cut turns and some limits; can lock if the target never finishes (SpellExt saw a lock when a split limit's beams missed: spellext.c ~24185). For the target itself it waits only for the 100-list"],
    0x9f: ["", "Clears flag 2370 (meaning not traced)", "", "any", "Clears flag 00bf2370"],
    0xa0: ["b", "Holds the target at its own bone {0}", "", "any", "Holds the target at its own bone NN (the target follows that bone; position zeroed; draw flag 0x10). release with ae"],
    0xa1: ["bb", "Starts effect task 5beb27 with {0}, {1} (not traced)", "", "any", "Starts an effect-list (100-list) task with NN, MM; not followed. a 100-list task holds the battle until it ends"],
    0xa2: ["b", "Reloads its model (the one ac chose) and runs script {0} as its script and its idle", "new_script", "party (transformations)", "Reloads its model from the name table chosen by ac (Galian Beast, Death Gigas, Hellmasker, Chaos, VINSENT/2/3.DAT) and makes script NN its script AND idle; sound 0x2d9; stops this frame. model names are fixed in the exe (007c1098)"],
    0xa3: ["b", "Sound operation a4 with {0}", "", "any", "Sound operation 0xa4 with NN (FUN_00740d80)"],
    0xa4: ["", "Enemy Skill glow", "", "party", "Starts the cast aura, kind 2 (value 0x1f0): the Enemy Skill glow"],
    0xa5: ["", "Summon glow", "", "party", "Starts the cast aura, kind 3 (sound 0x1e9): the Summon glow"],
    0xa6: ["", "Puts the covered ally back in its place", "", "any", "Puts actor 00bfcb68 (the one Cover moved) back at its own place. pairs with ab in the Cover script 9"],
    0xa7: ["b", "Plays animation {0h}", "", "any", "Plays animation NN, catching up the frames already counted; stops this frame"],
    0xa8: ["bb", "After {0} frames, glides back home over {1} frames", "", "any", "After NN frames, glides back to its own place over MM frames. MM = 0 divides by zero (crash)"],
    0xa9: ["bb", "Plays animation {1h} from a random frame (0-15); the byte {0h} is skipped", "", "any", "Skips one byte, then plays animation NN started 0-15 frames in (pseudo-random): enemy idles use a9 c9 NN ... c1, the skipped byte being the c9 mark"],
    0xaa: ["", "Clears flag 2a2c (meaning not traced)", "", "any", "Clears flag 00bf2a2c; meaning not traced"],
    0xab: ["ww", "Places the covered ally {0} in front of itself, height {1} (Cover)", "", "any", "Places actor 00bfcb68 (the one being covered) D (word 1) in front of itself at height Y (word 2): the Cover move"],
    0xac: ["b", "Chooses the model a2 will load ({0}) and turns to its own direction", "", "party (transformations)", "Chooses the model a2 will load (0 Galian Beast, 1 Death Gigas, 2 Hellmasker, 3 Chaos, 10 = Vincent by the weapon's high digit) and turns to its own direction"],
    0xad: ["bwbb", "Trail at its bone {0}, colour {1h}, from frame {2}, {3} frames long", "", "any", "Starts a trail effect at its aim bone BB with colour word, NN, MM (as 96 but at a chosen bone)"],
    0xae: ["", "Releases the held target", "", "any", "Releases the target held by a0/af: back to its place, rotation cleared"],
    0xaf: ["b", "Holds the target at its own bone {0} (second form)", "", "any", "As a0 (hold the target at own bone NN), clearing the rotations differently"],
    0xb0: ["", "Steps back a little (258 units)", "", "any", "Steps 0x102 units backward"],
    0xb1: ["", "Steps forward a little (258 units)", "", "any", "Steps 0x102 units forward"],
    0xb2: ["", "Mark: where b3 skips to", "", "any", "Nothing: the mark b3 skips to"],
    0xb3: ["", "If its display bit 1000 is set, skips to after the next b2", "", "any", "If bit 0x1000 of its display state is set, skips forward to after the next b2. no b2 after it: the scan runs on through memory (the position byte wraps at 256: endless loop = freeze)"],
    0xb4: ["", "Turns to its side's starting direction", "", "any", "Sets its starting direction by battle kind (back attack 0x800, side attack 0) and faces it. victory script 12 starts with it"],
    0xb5: ["wwwbww", "Effect with the vector ({0}, {1}, {2}), {3}, {4}, {5} (not traced)", "", "any", "Effect call with a 3D vector, NN and two words (FUN_005be844); not followed"],
    0xb6: ["b", "Starts a background task, then plays animation {0h}", "", "any", "Starts a background task (FUN_0042517b), then plays animation NN as a7; stops this frame"],
    0xb7: ["", "Starts its death", "", "enemy", "Starts its own death task"],
    0xb8: ["", "Leaves the scene (hidden and no longer present)", "", "enemy", "Removes itself from the scene: clears present bit 0x80, sets hidden bit 4"],
    0xb9: ["b", "Starts the built-in camera script {0}", "", "any", "Starts built-in camera script NN (00bf211c) for the playing record"],
    0xba: ["w", "Same as b4 (the value {0} is overwritten: a bug in the game)", "", "any", "Reads a word (a turn) and then runs b4's code, which overwrites it: in effect the same as b4 (a fall-through in the game)"],
    0xbc: ["b", "Sets the formation camera to {0}", "", "any", "Sets the formation camera index (00bfcb28) to NN"],
    0xbd: ["ww", "Places itself {0} in front of the target, height {1}, facing it", "", "any", "Places itself D (word 1) in front of the target along the target's own direction, height Y (word 2), facing it (2x/4x-Cut turns)"],
    0xbe: ["b", "Shows the result {0} frames from now (flagged form)", "", "any", "As f7 (show the result NN frames on) with flag 00bf23bc = 1; skipped in one case (actor kind 2, NN 8, target status 0x800)"],
    0xbf: ["bb", "Sets table byte {0} to {1} (not traced)", "", "any", "Sets byte table 00bfcdf0[NN] = MM, then FUN_004254e8; not followed"],
    0xc1: ["", "Jumps back to just after the first c9 (loops for ever)", "loop", "any", "Jumps back to just after the first c9 of the script (an endless loop: enemy idles). never finishes: in an action or reaction script the battle waits forever; no c9 = scan through memory"],
    0xc2: ["b", "Shows the target's first result {0} frames from now", "", "any", "Starts a 100-list task showing the target's first result NN frames on. 100-list: the battle waits for it"],
    0xc3: ["", "Is finished and starts the disintegrate death; the script goes on", "finish", "enemy", "Marks itself finished and starts the disintegrate death (FFNx battle_disintegrate_1_death); the script goes on"],
    0xc4: ["wb", "Slides {0} over {1} frames (the escape slide)", "", "any", "Sound 0x185 once a battle, then slides by the word (sign by battle kind and side) over NN frames: the escape slide"],
    0xc5: ["", "Wait counter = the stored wait (set by c6)", "", "any", "Wait counter = the stored wait (set by c6); use f3 to wait"],
    0xc6: ["b", "Stores {0} frames as the shared wait (for c5)", "", "any", "Stores NN as the shared wait (00bfd0f0) for c5"],
    0xc7: ["wb", "Gives the enemy part {0} on script {1} and starts it", "", "enemy", "For the enemy at self + word (actors 4-9, if present): makes NN its script and starts it (multi-part enemies)"],
    0xc8: ["wwb", "Move task with {0}, {1} over {2} frames", "", "any", "Starts a 10-list move task (self, word1, word2) over NN frames"],
    0xc9: ["", "Mark: where c1 and ca jump to", "", "any", "Nothing: the mark c1 and ca jump to"],
    0xca: ["", "While an effect is loading, jumps back to just after the first c9", "", "any", "If an effect is still loading, jumps back to after the first c9 (wait loop). no c9 = scan through memory"],
    0xcb: ["bwbbbbb", "Colour effect {0}, {1}, colour ({2}, {3}, {4}), {5}, {6} (not traced)", "", "any", "Effect call with NN, a word, a 5-5-5 colour from three bytes and two more bytes (FUN_005bf388); not followed"],
    0xcc: ["b", "Moves toward twice the targets' centre over {0} frames", "", "any", "Moves toward twice the targets' centre over NN frames"],
    0xce: ["", "Enemies skip to after the next cd; the party runs on", "", "any", "For enemies (actor > 3) skips forward to after the next cd; the party runs on. cd itself, when the party reaches it, is an animation byte (missing animation: one frame)"],
    0xcf: ["wwwbb", "Moves toward the target with {0}, {1}, {2}, {3} over {4} frames", "", "any", "Moves toward the target (mover 0042739d) over FF frames, with three words and NN"],
    0xd0: ["wb", "Moves toward the target to distance {0}; {1} sets the frames (0-3: 5, 4-7: 8)", "", "any", "Moves toward the target (or centre) to distance W; NN 0-3 = 5 frames, 4-7 = 8 frames (other NN: frames not set)"],
    0xd1: ["wwb", "Runs toward the target to distance {0} over {2} frames while the next animation plays ({1}: not traced)", "", "any", "Moves toward the target (or the targets' centre) to distance W1 over FF frames while the next animation plays (the run-in)"],
    0xd4: ["wb", "Steps {0} in all over {1} frames", "", "any", "Starts a task stepping word/NN a frame for NN frames. NN = 0 divides by zero (crash)"],
    0xd5: ["wwwbb", "Moves toward the target with {0}, {1}, {2}, {3} over {4} frames (second mover)", "", "any", "As cf with another mover (004270de)"],
    0xd6: ["b", "After {0} frames starts the action's effect", "", "any", "After NN frames (and when loading is done) starts the action's effect (the ec step, delayed)"],
    0xd7: ["bb", "After {0} frames calls routine 438c36 with {1} (not traced)", "", "any", "After NN frames calls FUN_00438c36(self, MM); not followed"],
    0xd8: ["bw", "After {0} frames plays sound {1h}", "", "any", "After NN frames plays sound effect W (Cloud's attack: d8 00 1a 00)"],
    0xda: ["b", "Sets its attack to {0}", "", "any", "Sets its attack number to NN and its command to 2"],
    0xdb: ["wbb", "Trail, colour {0h}, from frame {1}, {2} frames long", "", "any", "Trail effect with no bone (-1), word, NN, MM"],
    0xdc: ["bw", "Sets its state word {0} to {1}", "", "any", "Sets word NN of its state block (+0x1a + NN*2) to W scaled by its size"],
    0xdd: ["bb", "Trail at its other hand from frame {0}, {1} frames long", "", "any", "Trail effect at its other hand, NN, MM"],
    0xde: ["bb", "Trail at its weapon hand from frame {0}, {1} frames long", "", "any", "Trail effect at its weapon hand, NN, MM"],
    0xdf: ["", "Turns to face the middle of the targets", "", "any", "Turns to face the middle of the targets"],
    0xe0: ["", "Limit glow", "", "party", "Starts the cast aura, kind 1 (value 0x24): the limit glow"],
    0xe1: ["", "Sets script flag 4 (meaning not traced)", "", "any", "Sets flag value 4 in its script flags (00be11b6); meaning not traced"],
    0xe2: ["", "Fades out", "", "any", "Sets the fade-out flag (00be11b6 value 2)"],
    0xe3: ["", "Takes the place where it stands as its home", "", "any", "Stores the acting actor's current X, Z as its own place (home)"],
    0xe4: ["", "Steps back (516 units)", "", "any", "Steps 0x204 units backward"],
    0xe5: ["", "Turns back to its side's direction", "", "any", "Turns back to its side's direction (by battle kind)"],
    0xe6: ["", "Magic glow", "", "party", "Starts the cast aura, kind 0 (value 0x0d): the Magic glow"],
    0xe7: ["b", "{hide}", "", "any", "NN = 0 hides its body and weapon (flag 4), any other NN shows them"],
    0xe8: ["", "Starts loading the action's effect", "", "any", "Chooses and starts loading the action's effect files (do it before ec / eb)"],
    0xe9: ["wb", "Moves toward the target (distance from its header) over {1} frames ({0}: not traced)", "", "any", "Moves toward the target, distance from its state word +0x28, over FF frames"],
    0xea: ["", "Shows the action's name", "", "any", "Shows the action's name banner"],
    0xeb: ["", "Waits for the effect to load, then throws or uses the item", "", "party", "Waits while an effect is loading, then the item/throw step (draws the thrown weapon)"],
    0xec: ["", "Waits for the effect to load, then starts it (the hit comes through it)", "", "any", "Waits while an effect is loading, then starts the action's effect (loads a limit's pack): the hit happens through it"],
    0xed: ["", "Steps forward (516 units)", "", "any", "Steps 0x204 units forward (the step before a cast)"],
    0xee: ["", "End: finished, back to the idle", "finish", "any", "Finished: marks itself finished, goes back to its idle script and starts it at once. every action and reaction script should end here (or 9e/f1)"],
    0xf0: ["", "Dust at its feet", "", "any", "Kicks up dust/smoke at its feet"],
    0xf1: ["", "End: finished, holds the last frame", "hold", "any", "Finished, and stays on its last frame (KO, victory); the idle updater restarts the idle unless this script IS the idle"],
    0xf2: ["", "Nothing (in the PC game)", "", "any", "Nothing in the PC game (hurt scripts use it)"],
    0xf3: ["", "Waits until the wait counter runs out", "", "any", "Waits while the wait counter is not 0, counting it down each frame"],
    0xf4: ["b", "Wait counter = {0} frames", "", "any", "Sets the wait counter to NN frames (then f3 waits)"],
    0xf5: ["b", "Enemies: changes to model slot {0} + 3 and starts again (on the party: memory corruption)", "", "enemy only", "Enemies: sets a model slot word to NN + 3, reloads, restarts the script. on a party actor it writes before its array (memory corruption)"],
    0xf6: ["", "Starts its death if it is due", "", "any", "Starts its death task if it is in the dead mask"],
    0xf7: ["b", "Shows the result (numbers, reaction) {0} frames from now", "", "any", "Shows the result (damage numbers, reaction) NN frames on; only the FIRST result on each target"],
    0xf8: ["b", "Model effect {0} (from the header's list)", "", "any", "Starts a model effect from the ab header's pointer NN (0-7, header 0x24 + NN*4). NN > 7 reads past the 8 pointers"],
    0xf9: ["", "Faces its starting direction", "", "any", "Faces its starting direction (no battle-kind recompute)"],
    0xfa: ["", "Back home at once", "", "any", "Back at its own place at once"],
    0xfb: ["ww", "Places itself {0} in front of the target, height {1}, at once", "", "any", "Same code as 9a"],
    0xfc: ["", "Turns to face the target", "", "any", "Turns to face the target (several targets: by battle kind)"],
    0xfd: ["www", "Sets its position to ({0}, {1}, {2})", "", "any", "Sets its position X, Y, Z"],
    0xfe: ["", "With c0 after it: back to the start of the idle (a loop, never finished)", "loop", "any", "fe c0: if the wait counter is 0 and the next byte is c0, goes back to its idle script from the start (does NOT mark finished). must be followed by c0; with a wait counter set or no c0, c0 is then read as animation 0xc0 and the script runs on. In an action or reaction script: lock"],
    0xff: ["", "End: finished, back to the idle (same as ee)", "finish", "any", "Same code as ee"],
  };

  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function put32(b, o, v) { b[o] = v & 0xff; b[o + 1] = (v >>> 8) & 0xff; b[o + 2] = (v >>> 16) & 0xff; b[o + 3] = (v >>> 24) & 0xff; }
  function s16(b, o) { const v = b[o] | (b[o + 1] << 8); return v >= 0x8000 ? v - 0x10000 : v; }
  function hex(n) { return n.toString(16).padStart(2, '0'); }
  function hexBytes(b) { return Array.from(b, hex).join(' '); }
  const asBytes = b => (b instanceof Uint8Array ? b : new Uint8Array(b));
  const argLen = a => a.split('').reduce((s, c) => s + (c === 'w' ? 2 : 1), 0);

  /* ------------------------------------------------------------------ what each slot is for */
  // party models, read from the code: FF7_SpellExt/tools/work/seph_anims/INVENTORY.md sections 2-3
  const PARTY_USE = [
    ['Idle', 'always, while nothing else plays'],
    ['Weak idle', 'HP below a quarter, or some statuses'],
    ['KO', 'when the actor is dead; ends with f1 to hold the pose'],
    ['No target: step forward', 'the target is gone; also Mini'],
    ['No target: step back', 'after slot 3'],
    ['Hurt', 'most hits (reaction 5)'],
    ['Hurt, second kind', 'reaction 6 (Sleepel, Demi, Silence and others)'],
    ['Knocked down', 'reaction 7 (big hits)'],
    ['Dodge', 'a miss'],
    ['Cover', 'by its bytes (ab, a6 move the covered ally); the caller is not traced'],
    ['Enemy Skill learned', 'reaction 10'],
    ['Reaction 11', 'caller not traced'],
    ['Victory', 'the battle is won; ends with f1'],
    ['Trying to run', 'while running away is held'],
    ['Escaping', 'the party runs away'],
    ['Swallowed', 'reaction 0x0f (Eat and the like)'],
    ['Slot 16', 'caller not traced'],
    ['Slot 17', 'no caller found'],
    ['Blown away', 'reaction 0x12'],
    ['Defend', 'the idle while defending'],
    ['Attack', 'command Attack'],
    ['Attack, several targets', 'Attack on several targets or out of reach'],
    ['2x-Cut, first cut', 'with the materia'], ['2x-Cut, second cut', 'with the materia'],
    ['4x-Cut, cut 1', 'with the materia'], ['4x-Cut, cut 2', 'with the materia'], ['4x-Cut, cut 3', 'with the materia'], ['4x-Cut, cut 4', 'with the materia'],
    ['Flash', 'command Flash'],
    ['Magic', 'Magic and W-Magic'],
    ['Enemy Skill', 'command Enemy Skill'],
    ['Summon', 'Summon and W-Summon'],
    ['Item on the party', 'Item, W-Item on an ally'],
    ['Item on an enemy, Throw, Coin', 'Item on an enemy, Throw, Coin'],
    ['Steal', 'one target'], ['Steal, several targets', 'several targets'],
    ['Mug', 'one target'], ['Mug, several targets', 'several targets'],
    ['Sense', 'one target'], ['Sense, several targets', 'several targets'],
    ['Morph', 'one target'], ['Morph, several targets', 'several targets'],
    ['Deathblow', 'one target'], ['Deathblow, several targets', 'several targets'],
    ['Manipulate', 'one target'], ['Manipulate, several targets', 'several targets'],
  ];
  const LIMIT_NAMES = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1'];
  function slotUse(kind, n) {
    if (kind === 'party') {
      if (n < PARTY_USE.length) return { name: PARTY_USE[n][0], when: PARTY_USE[n][1] };
      if (EXE_SLOTS.has(n)) return { name: 'The game\'s own', when: 'the exe has its own script for this number: the file\'s is never read', exe: true };
      if (n === 0x33) return { name: 'No reaction', when: '0x33 means "no reaction": probably never played' };
      if (n >= 60 && n <= 66) return { name: 'Limit ' + LIMIT_NAMES[n - 60], when: 'the character\'s limits, in the order of its limit list', limit: true };
      if (n === 67 || n === 68) return { name: 'Follow-up ' + (n - 66), when: 'a limit\'s second part (the game\'s follow-ups); SpellExt reads these from the model', limit: true };
      return { name: 'Extra ' + (n - 68), when: 'later follow-ups; SpellExt\'s chained limits; the transformation models\' scripts', limit: true };
    }
    if (n === 0) return { name: 'Idle', when: 'always, while nothing else plays' };
    if (n === 1) return { name: 'Weak idle', when: 'low HP' };
    if (n === 2) return { name: 'Dead', when: 'when it dies' };
    return { name: 'Slot ' + n, when: 'chosen by the enemy\'s own attack data (not read here)' };
  }
  // slots whose script may loop for ever (fe c0, c1): the idles
  function isIdleSlot(kind, n) { return kind === 'party' ? [0, 1, 2, 12, 13, 14, 19].includes(n) : n <= 2; }

  /* ------------------------------------------------------------------ reading a file */
  function guessKind(b) {
    let min = Infinity;
    for (let i = 0; i < ENEMY_SLOTS && HEADER + i * 4 + 4 <= b.length; i++) { const p = u32(b, HEADER + i * 4); if (p >= HEADER && p < min) min = p; }
    return min !== Infinity && min >= PARTY_FIRST && b.length >= PARTY_FIRST ? 'party' : 'enemy';
  }
  /* -> doc: { orig, cur, kind, slots, tableEnd, realSlots, undo: [] } (cur is the file as it now stands) */
  function readAb(bytes, opts) {
    const b = new Uint8Array(asBytes(bytes));      // a copy, also of a node Buffer (whose slice() is a view)
    if (b.length === 8) throw new Error('this is a battle scene\'s xxab (8 bytes): it holds no scripts');
    if (b.length < HEADER + 4) throw new Error('too short for a battle model\'s script file (xxab): ' + b.length + ' bytes');
    if (opts && opts.kind === 'enemy' && guessKind(b) === 'party') throw new Error('this file cannot be read as an enemy: its first script starts at ' + PARTY_FIRST.toString(16) + ' or later, so it has a party model\'s table of 74 offsets (read as 32, edits would overwrite the scripts of slots 32-73)');
    const kind = (opts && opts.kind) || guessKind(b), slots = kind === 'party' ? PARTY_SLOTS : ENEMY_SLOTS, tableEnd = HEADER + slots * 4;
    if (b.length < tableEnd) throw new Error('too short for ' + (kind === 'party' ? 'a party model\'s 74' : 'an enemy\'s 32') + ' script offsets: ' + b.length + ' bytes');
    let min = Infinity;
    for (let i = 0; i < slots; i++) { const p = u32(b, HEADER + i * 4); if (p >= HEADER && p < min) min = p; }
    const realSlots = min < tableEnd ? Math.floor((min - HEADER) / 4) : slots;
    // dataStart: where scripts may begin. A short table (obab..ofab: 24 entries) has its first script inside the 32
    // entries the game reads (and adjusts as offsets when it loads the file).
    return { orig: b.slice(), cur: b, kind, slots, tableEnd, realSlots, dataStart: HEADER + realSlots * 4, undo: [] };
  }
  const ptrOf = (doc, i) => u32(doc.cur, HEADER + i * 4);
  function fxOffsets(doc) { const o = []; for (let i = 0; i < FX_COUNT; i++) o.push(u32(doc.cur, FX_AT + i * 4)); return o; }
  function header(doc) {
    const b = doc.cur, w = o => b[o] | (b[o + 1] << 8);
    return { kindByte: b[2], height: w(4), bones: Array.from(b.slice(0x12, 0x22)), fx: fxOffsets(doc) };
  }
  // where a slot's offset points: ok | header | table | end | outside | none (not a real entry)
  function stateOf(doc, i) {
    if (i >= doc.realSlots) return 'none';
    const p = ptrOf(doc, i);
    if (p < HEADER) return 'header';
    if (p < doc.dataStart) return 'table';
    if (p === doc.cur.length) return 'end';
    if (p > doc.cur.length) return 'outside';
    return 'ok';
  }
  const STATE_TEXT = {
    none: 'not a real entry: this file\'s table is short, and these four bytes are its first script\'s (the game reads them as an offset all the same)',
    header: 'points into the header: the game would run the header\'s bytes as a script',
    table: 'points into the table of offsets',
    end: 'points at the end of the file: the game would run whatever lies after it in memory',
    outside: 'points past the end of the file',
  };
  // every offset that starts something: the slots' and the eight effect offsets
  function boundaries(doc) {
    const s = new Set([doc.cur.length]);
    for (let i = 0; i < doc.realSlots; i++) if (stateOf(doc, i) === 'ok') s.add(ptrOf(doc, i));
    fxOffsets(doc).forEach(p => { if (p >= doc.dataStart && p <= doc.cur.length) s.add(p); });
    return Array.from(s).sort((a, b) => a - b);
  }
  // the room a script at p has before the next thing starts
  function regionEnd(doc, p) { return boundaries(doc).find(x => x > p) || doc.cur.length; }
  function sharers(doc, i) {
    const p = ptrOf(doc, i), out = [];
    for (let j = 0; j < doc.realSlots; j++) if (ptrOf(doc, j) === p) out.push(j);
    return out;
  }

  /* ------------------------------------------------------------------ decoding */
  /* bytes[start..] -> { items: [{at, len, op, args, bytes, kind: anim|animlike|op|cut, anim, late}], end: {kind, at},
     length }. end kinds: finish (ee ff), hold (f1), wait (9e), idle (fe c0), loop (c1), reload (a2),
     cut (arguments run past the data), long (no end within 256 bytes), off (the data ends first).
     After an end, decoding goes on when an earlier b3 (or ce) still has its mark ahead: those bytes run on the
     other path (items marked late). */
  function decode(bytes, start, limit) {
    bytes = asBytes(bytes); start = start || 0;
    const stop = Math.min(bytes.length, limit === undefined ? Infinity : limit, start + MAX_LEN);
    const items = []; let pc = start, end = null, needB2 = false, needCd = false, late = false;
    const markAhead = (m, from) => { for (let k = from; k < stop; k++) if (bytes[k] === m) return true; return false; };
    while (pc < stop) {
      const op = bytes[pc];
      if (op < 0x8e || ANIM_LIKE.has(op)) {
        items.push({ at: pc - start, len: 1, op, args: [], bytes: [op], kind: op < 0x8e ? 'anim' : 'animlike', anim: op, late });
        if (op === 0xb2) needB2 = false;
        if (op === 0xcd) needCd = false;
        pc++; continue;
      }
      const d = OPS[op], n = argLen(d[0]);
      if (pc + 1 + n > stop) {
        items.push({ at: pc - start, len: stop - pc, op, args: [], bytes: Array.from(bytes.slice(pc, stop)), kind: 'cut', late });
        end = { kind: pc + 1 + n > bytes.length || stop < start + MAX_LEN ? 'cut' : 'long', at: pc - start }; pc = stop; break;
      }
      const args = []; let o = pc + 1;
      for (const c of d[0]) { if (c === 'w') { args.push(s16(bytes, o)); o += 2; } else { args.push(bytes[o]); o += 1; } }
      const it = { at: pc - start, len: 1 + n, op, args, bytes: Array.from(bytes.slice(pc, pc + 1 + n)), kind: 'op', late };
      if (op === 0xa7 || op === 0xb6) it.anim = args[0];
      if (op === 0xa9) it.anim = args[1];
      items.push(it); pc += 1 + n;
      if (op === 0xb3) needB2 = true;
      if (op === 0xb2) needB2 = false;
      if (op === 0xce) needCd = true;
      let ends = null;
      if (op === 0xee || op === 0xff) ends = 'finish';
      else if (op === 0xf1) ends = 'hold';
      else if (op === 0x9e) ends = 'wait';
      else if (op === 0xa2) ends = 'reload';
      else if (op === 0xc1) ends = 'loop';
      else if (op === 0xfe && pc < stop && bytes[pc] === 0xc0) {
        items.push({ at: pc - start, len: 1, op: 0xc0, args: [], bytes: [0xc0], kind: 'loopmark', late }); pc++; ends = 'idle';
      }
      if (ends) {
        if (!end) end = { kind: ends, at: it.at };
        if ((needB2 && markAhead(0xb2, pc)) || (needCd && markAhead(0xcd, pc))) { late = true; continue; }
        break;
      }
    }
    if (!end) end = { kind: pc >= start + MAX_LEN ? 'long' : 'off', at: pc - start };
    return { items, end, length: pc - start };
  }
  const END_TEXT = {
    finish: 'ends: finished, back to the idle', hold: 'ends: finished, holds the last frame', wait: 'ends: waits for the target, then finished',
    idle: 'loops: back to the idle (never finished)', loop: 'loops for ever (never finished)', reload: 'ends: changes model and script',
    cut: 'BROKEN: the last command\'s values are missing', long: 'BROKEN: no end within 256 bytes', off: 'BROKEN: no end',
  };

  /* one decoded item in plain words; ctx: { kind: party|enemy, count: animations in the xxda (or undefined) } */
  function animText(n, ctx) {
    ctx = ctx || {};
    let t = 'Plays animation ' + hex(n);
    if (ctx.kind === 'party' && n >= PACK_LO && n <= PACK_HI) t = 'Plays limit pack animation ' + (n - PACK_LO) + ' (' + hex(n) + ')';
    else if (ctx.count !== undefined && n >= ctx.count) t += ' (not in the model: one frame lost)';
    else if (ctx.kind === 'party' && n >= WEAPON_OFFSET && n < 0x68) t += ' (a weapon track\'s number: wrong as a body)';
    return t;
  }
  function describe(it, ctx) {
    if (it.kind === 'anim') return animText(it.op, ctx);
    if (it.kind === 'animlike') return animText(it.op, ctx) + ': no command has this number' + (it.op === 0xcd ? ' (it is also the mark ce skips to)' : '');
    if (it.kind === 'loopmark') return '(the c0 that goes with fe)';
    if (it.kind === 'cut') return 'Command ' + hex(it.op) + ' needs ' + argLen(OPS[it.op][0]) + ' more byte(s): the script ends first';
    const d = OPS[it.op];
    let t = d[1].replace(/\{(\d)(h?)\}/g, (_, i, hx) => { const v = it.args[+i]; return hx ? (v < 0 ? v + 0x10000 : v).toString(16) : String(v); });
    if (it.op === 0xe7) t = it.args[0] === 0 ? 'Hides its body and weapon' : 'Shows its body and weapon';
    if (it.anim !== undefined) t = animText(it.anim, ctx) + (it.op === 0xa9 ? ' from a random frame (0-15); the byte ' + hex(it.args[0]) + ' is skipped' : it.op === 0xb6 ? ', after starting a background task' : '');
    return t;
  }
  const opNote = op => (OPS[op] ? OPS[op][4] : op < 0x8e ? 'An animation of the model' : 'No command: the game plays animation ' + hex(op));

  /* ------------------------------------------------------------------ the text box: hex bytes */
  /* "e5 06 f1" (spaces, lines and # comments free) -> { bytes } or { error } */
  function parseHex(text) {
    const out = [], clean = String(text).split('\n').map(l => l.replace(/#.*/, '')).join(' ');
    for (const tok of clean.split(/[\s,]+/).filter(Boolean)) {
      const t = tok.replace(/^0x/i, '');
      if (!/^([0-9a-fA-F]{2})+$/.test(t)) return { error: '"' + tok + '" is not a byte in hex (two digits, 00 to ff)' };
      for (let i = 0; i < t.length; i += 2) out.push(parseInt(t.slice(i, i + 2), 16));
    }
    return { bytes: new Uint8Array(out) };
  }
  /* the bytes as text, one command per line */
  function formatScript(bytes) {
    const d = decode(bytes), lines = d.items.map(it => hexBytes(it.bytes));
    if (d.length < bytes.length) lines.push(hexBytes(bytes.slice(d.length)));
    // fe and its c0 on one line
    for (let i = lines.length - 1; i > 0; i--) if (lines[i] === 'c0' && lines[i - 1] === 'fe') { lines[i - 1] = 'fe c0'; lines.splice(i, 1); }
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ checking a script */
  // which argument is the frame count of the moves that divide by it
  const MOVE_FRAMES = { 0x99: 3, 0xcc: 0, 0xcf: 4, 0xd5: 4, 0xd1: 2, 0xe9: 1 };
  /* One frame of the interpreter: it keeps reading commands until something plays or waits (an animation byte, a7, a9,
     b6, f3 with a count, eb/ec while loading, f1, 9e, a2). c1 and ca jump back and read on; in an idle, ee/ff and fe c0
     start the same script again and read on. A script that can come back to where it was within one frame without
     playing anything reads for ever (a freeze). Walked from the start and from after every stop, both ways at b3 and
     ca. -> { freeze: byte or null, spin: byte or null (only while an effect loads, through ca) } */
  // slots that ee/ff and fe c0 start again (the actor's idle number is this slot). Enemies: 0 and 1 only; slot 2 (Dead)
  // is not: 296 vanilla enemies end it with e5 ee, which would otherwise freeze.
  const restartsItself = ctx => ctx.slot !== undefined && (ctx.kind === 'party' ? isIdleSlot('party', ctx.slot) : ctx.slot <= 1);
  function frameLoops(bytes, ctx) {
    const idle = restartsItself(ctx), c9 = bytes.indexOf(0xc9);
    const starts = [[0, 0, 0]], seenStart = new Set(['0,0,0']);
    let freeze = null, spin = null, steps = 0;
    // every b3 splits the walk in two: many b3 b2 pairs would take exponential time, so the walk has a budget
    const BUDGET = 50000;
    while (starts.length) {
      const st = starts.pop(), stack = [[st[0], st[1], st[2], new Set(), false]];
      const stop = (pc, counter, stored) => { const k = pc + ',' + (counter ? 1 : 0) + ',' + (stored ? 1 : 0); if (!seenStart.has(k)) { seenStart.add(k); starts.push([pc, counter, stored]); } };
      while (stack.length) {
        let [pc, counter, stored, seen, viaLoad] = stack.pop();
        for (let guard = 0; guard < 4096; guard++) {
          if (++steps > BUDGET) return { freeze, spin, gaveUp: true };
          if (pc >= bytes.length || pc >= MAX_LEN) break;       // runs off the script: reported as "no end"
          const key = pc + ',' + (counter ? 1 : 0) + ',' + (stored ? 1 : 0);
          if (seen.has(key)) { if (viaLoad) { if (spin === null) spin = pc; } else if (freeze === null) freeze = pc; break; }
          seen.add(key);
          const op = bytes[pc];
          if (op < 0x8e || ANIM_LIKE.has(op)) { stop(pc + 1, counter, stored); break; }
          const n = argLen(OPS[op][0]), nx = pc + 1 + n;
          if (nx > bytes.length) break;
          if (op === 0xa7 || op === 0xa9 || op === 0xb6) { stop(nx, counter, stored); break; }
          if (op === 0xf1 || op === 0x9e || op === 0xa2 || op === 0xf5) break;
          if (op === 0xf3) { if (counter) { stop(nx, 0, stored); break; } pc = nx; continue; }
          if (op === 0xf4) { counter = bytes[pc + 1]; pc = nx; continue; }
          if (op === 0xc6) { stored = bytes[pc + 1]; pc = nx; continue; }
          if (op === 0xc5) { counter = stored; pc = nx; continue; }
          if (op === 0xee || op === 0xff || (op === 0xfe && !counter && bytes[nx] === 0xc0)) {
            if (!idle) break;                                     // back to the idle, which plays
            pc = 0; counter = 0; continue;                        // this script is the idle: it starts again
          }
          if (op === 0xc1) { if (c9 < 0) break; pc = c9 + 1; continue; }
          if (op === 0xca) { if (c9 >= 0) stack.push([c9 + 1, counter, stored, new Set(seen), true]); pc = nx; continue; }
          if (op === 0xb3) { const m = bytes.indexOf(0xb2, nx); if (m >= 0) stack.push([m + 1, counter, stored, new Set(seen), viaLoad]); pc = nx; continue; }
          if (op === 0xce && ctx.kind === 'enemy') { const m = bytes.indexOf(0xcd, nx); if (m < 0) break; pc = m + 1; continue; }
          pc = nx;                                                // eb/ec: taken as loaded (the worst case: no stop)
        }
      }
    }
    return { freeze, spin };
  }
  /* ctx: { kind: party|enemy, slot, count } -> { problems: [..], warnings: [..], decoded }
     problems stop a save (a crash, a freeze, a script with no end); warnings are for the eye. */
  function validate(bytes, ctx) {
    bytes = asBytes(bytes); ctx = ctx || {};
    const problems = [], warnings = [], party = ctx.kind === 'party';
    if (!bytes.length) return { problems: ['The script is empty: it needs at least an end (ee).'], warnings, decoded: null };
    if (bytes.length > MAX_LEN) problems.push('The script is ' + bytes.length + ' bytes long: the game counts its place in a script with one byte, so 256 is the most.');
    const d = decode(bytes);
    const e = d.end.kind;
    if (e === 'cut') problems.push('The last command (' + hex(bytes[d.end.at]) + ' at byte ' + d.end.at + ') needs more bytes than the script has.');
    else if (e === 'off' || e === 'long') problems.push('The script has no end. End it with ee (back to the idle), f1 (hold the last frame), 9e (wait for the target), or fe c0 (loop: idles only).');
    const after = bytes.length - d.length;
    if (after > 0 && !['cut', 'off', 'long'].includes(e)) warnings.push(after + ' byte(s) after the end are never played (' + hexBytes(bytes.slice(d.length, d.length + 8)) + (after > 8 ? ' ...' : '') + ').');
    const first = m => bytes.indexOf(m);
    d.items.forEach(it => {
      const at = ' (byte ' + it.at + ')';
      if (it.op === 0xc1 || it.op === 0xca) { if (it.kind === 'op' && first(0xc9) < 0) problems.push(hex(it.op) + at + ' jumps back to the first c9 of the script, and there is none: the game would search memory for ever.'); }
      if (it.op === 0xb3 && it.kind === 'op' && bytes.indexOf(0xb2, it.at + 1) < 0) problems.push('b3' + at + ' can skip to the next b2, and there is none after it: the game would search memory for ever.');
      if (it.op === 0xce && it.kind === 'op' && bytes.indexOf(0xcd, it.at + 1) < 0) (party ? warnings : problems).push('ce' + at + ' makes an enemy skip to the next cd, and there is none after it' + (party ? ' (harmless on a party model, which runs on)' : ': the game would search memory for ever') + '.');
      if ((it.op === 0xd4 && it.args[1] === 0) || (it.op === 0x94 && it.args[2] === 0)) problems.push(hex(it.op) + at + ' over 0 frames divides by zero in the game (a crash).');
      if (it.op === 0xa8 && it.args[1] === 0) problems.push('a8' + at + ' gliding over 0 frames divides by zero in the game (a crash).');
      // the movers through FUN_0042519a divide by the frame count (idiv at 004253fb, 00425427) unless the target is itself
      const fr = MOVE_FRAMES[it.op];
      if (it.kind === 'op' && fr !== undefined && it.args[fr] === 0) problems.push(hex(it.op) + at + ' moving over 0 frames divides by zero in the game (a crash).');
      if (it.op === 0xd0 && it.kind === 'op' && it.args[1] > 7) warnings.push('d0' + at + ' with ' + it.args[1] + ': only 0-7 set the frames (0-3: 5, 4-7: 8); any other value keeps the frames of an earlier move, which can be 0 (a crash).');
      if (it.op === 0xf5 && party) problems.push('f5' + at + ' is for enemies: on a party model it writes outside its table (memory corruption).');
      if (it.op === 0xf8 && it.args[0] > 7) warnings.push('f8 ' + hex(it.args[0]) + at + ': there are only 8 effect offsets (0-7); the game reads past them.');
      if (it.op === 0xf8 && party) warnings.push('f8' + at + ': no party model uses f8; its 8 effect offsets in the header may point at nothing.');
      if (it.op === 0x9d && it.args[0] > 6) warnings.push('9d ' + hex(it.args[0]) + at + ' does nothing (0-6 only).');
      if (it.op === 0xfe && !(bytes[it.at + 1] === 0xc0)) warnings.push('fe' + at + ' without c0 after it does nothing: the next byte runs as usual.');
      if (it.kind === 'animlike') warnings.push(hex(it.op) + at + ' is not a command: the game plays animation ' + hex(it.op) + (ctx.count !== undefined && it.op >= ctx.count ? ', which the model does not have' : '') + '.');
      if (it.anim !== undefined && it.kind !== 'animlike') {
        const n = it.anim;
        if (party && n >= PACK_LO && n <= PACK_HI) { if (!(ctx.slot >= 60)) warnings.push('Animation ' + hex(n) + at + ' is the limit pack\'s: it plays whatever limit pack the actor loaded last.'); }
        else if (ctx.count !== undefined && n >= ctx.count) warnings.push('Animation ' + hex(n) + at + ' is not in the model (it has ' + ctx.count + ', 00-' + hex(ctx.count - 1) + '): the game loses a frame and logs "ANM_ERROR".');
        else if (party && n >= WEAPON_OFFSET && n < 0x68) warnings.push('Animation ' + hex(n) + at + ' is a weapon track\'s number on a party model (the game plays body n\'s weapon at n + 34): played as a body it looks wrong.');
      }
    });
    if ((e === 'idle' || e === 'loop') && ctx.slot !== undefined && !isIdleSlot(ctx.kind, ctx.slot) && !(party && (EXE_SLOTS.has(ctx.slot) || ctx.slot === 0x33))) {
      const how = 'It loops (' + (e === 'idle' ? 'fe c0' : 'c1') + ') and never finishes';
      if (!party) warnings.push(how + ': if the enemy\'s attack data uses this slot for an attack or a reaction, the battle waits for it for ever (an enemy\'s extra slots are not traced here).');
      else if (ctx.slot >= 69) warnings.push(how + ': right for the idle of a transformed model (a2 makes a script its idle), a lock if it is played as a limit or follow-up.');
      else warnings.push(how + ': in this slot the battle would wait for it for ever. End it with ee, f1 or 9e.');
    }
    if (!['cut', 'off', 'long'].includes(e)) {
      const fl = frameLoops(bytes, ctx);
      if (fl.freeze !== null) problems.push('From byte ' + fl.freeze + ' the script comes back to the same place within one frame without playing anything (no animation, a7/a9/b6, f4 + f3 wait, or f1/9e)' + (restartsItself(ctx) ? '; in this idle slot ee, ff and fe c0 start the same script again' : '') + ': the game would read it for ever in one frame (a freeze).');
      else if (fl.gaveUp) warnings.push('The script branches too often (b3 .. b2) for the freeze check to follow every way through it: it was not checked for a freeze.');
      else if (fl.spin !== null) warnings.push('While an effect is loading, ca jumps back to the c9 and nothing plays on the way (byte ' + fl.spin + '): the game reads it over and over in one frame until the loading ends; whether that ends or freezes is not settled. Put an animation between the c9 and the ca.');
    }
    if (party && EXE_SLOTS.has(ctx.slot)) warnings.push('The game never reads this slot from the file: it uses its own script for number ' + hex(ctx.slot) + '.');
    return { problems, warnings, decoded: d };
  }

  /* ------------------------------------------------------------------ a slot's script in a file */
  function scriptOf(doc, i) {
    if (stateOf(doc, i) !== 'ok') return null;
    const p = ptrOf(doc, i), d = decode(doc.cur, p, regionEnd(doc, p));
    return doc.cur.slice(p, p + d.length);
  }
  function slotInfo(doc, i) {
    const state = stateOf(doc, i), p = i < doc.realSlots ? ptrOf(doc, i) : null, use = slotUse(doc.kind, i);
    const info = { slot: i, ptr: p, state, use, shared: state === 'ok' ? sharers(doc, i).filter(j => j !== i) : [] };
    if (state === 'ok') {
      const r = regionEnd(doc, p);
      info.bytes = scriptOf(doc, i); info.decoded = decode(doc.cur, p, r); info.room = r - p;
      info.empty = doc.cur.slice(p, r).every(x => x === 0);     // unused: enemies point unused slots at 4 zero bytes
    }
    return info;
  }

  /* ------------------------------------------------------------------ changing a file */
  /* Give `slots` (all pointing at one script now) the script `bytes`. In place when it fits in its room and no other
     slot or effect offset uses it; otherwise added at the end of the file (4-aligned) and only these slots repointed.
     Nothing else moves. -> { how: 'same'|'in place'|'added', at, notes: [..] } */
  function setScript(doc, slots, bytes) {
    bytes = asBytes(bytes);
    if (!slots.length) throw new Error('no slot given');
    slots.forEach(i => { if (i < 0 || i >= doc.realSlots) throw new Error('slot ' + i + ' is not a real entry of this file\'s table'); });
    if (bytes.length > MAX_LEN) throw new Error('a script can be 256 bytes at most');
    const p = ptrOf(doc, slots[0]);
    if (slots.some(i => ptrOf(doc, i) !== p)) throw new Error('these slots do not share one script');
    const ok = stateOf(doc, slots[0]) === 'ok';
    if (ok) { const old = scriptOf(doc, slots[0]); if (old.length === bytes.length && old.every((x, k) => x === bytes[k])) return { how: 'same', at: p, notes: [] }; }
    doc.undo.push(doc.cur.slice());
    const notes = [], users = ok ? sharers(doc, slots[0]) : [], set = new Set(slots);
    const alone = ok && users.every(j => set.has(j)) && !fxOffsets(doc).includes(p);
    if (alone && p >= doc.tableEnd) {
      const room = regionEnd(doc, p) - p, oldLen = decode(doc.cur, p, p + room).length;
      // a script this page added earlier, at the end of the file: rewrite it there whatever its size
      if (p >= doc.orig.length && regionEnd(doc, p) === doc.cur.length) {
        doc.cur = doc.cur.slice(0, p); return Object.assign(append(doc, slots, bytes, notes, true), { how: 'added', notes });
      }
      if (bytes.length <= room) {
        doc.cur.set(bytes, p);
        for (let k = p + bytes.length; k < Math.min(p + oldLen, p + room); k++) doc.cur[k] = 0;    // the old script's tail
        return { how: 'in place', at: p, notes };
      }
    }
    return Object.assign(append(doc, slots, bytes, notes), { how: 'added', notes });
  }
  function append(doc, slots, bytes, notes, rewrite) {
    let len = doc.cur.length;
    // offsets that point at the file's very end would now point at the new script: give them zeros there instead
    const atEnd = []; for (let j = 0; j < doc.realSlots; j++) if (ptrOf(doc, j) === len && !slots.includes(j)) atEnd.push(j);
    const fxEnd = fxOffsets(doc).some(x => x === len);
    // a slot being set that points at the end itself: without the pad its new script lands on its old offset and the
    // change would not show as a change
    const selfEnd = !rewrite && slots.some(j => ptrOf(doc, j) === len);     // (not a script this page added, rewritten)
    let pad = (4 - (len % 4)) % 4;
    if (atEnd.length || fxEnd || selfEnd) pad += 32;
    if (atEnd.length || fxEnd) { notes.push((atEnd.length ? 'Slot(s) ' + atEnd.join(', ') + (fxEnd ? ' and some effect offsets' : '') : 'Some effect offsets') + ' pointed at the end of the file; 32 bytes (ee, then zeros) were put there first, so they do not run into the new script: such a slot now ends at once (ee).'); }
    const at = len + pad, total = at + bytes.length + ((4 - (bytes.length % 4)) % 4);
    const out = new Uint8Array(total); out.set(doc.cur); out.set(bytes, at);
    if (atEnd.length || fxEnd || selfEnd) out[len] = 0xee;        // the pad: ee and zeros, so a slot pointing there ends at once
    doc.cur = out;
    slots.forEach(i => put32(doc.cur, HEADER + i * 4, at));
    return { at };
  }
  const asLoaded = doc => Object.assign({}, doc, { cur: doc.orig, undo: [] });     // the file as it was loaded
  function undo(doc) { if (!doc.undo.length) return false; doc.cur = doc.undo.pop(); return true; }
  function reset(doc) { doc.cur = doc.orig.slice(); doc.undo = []; }
  function write(doc) { return doc.cur.slice(); }
  /* slots whose script or offset differs from the file as loaded */
  function changes(doc) {
    const before = asLoaded(doc);
    const out = [];
    for (let i = 0; i < doc.realSlots; i++) {
      const a = scriptOf(before, i), b = scriptOf(doc, i);
      // a slot that had no script (a broken offset) and still points at the same place is not a change, even when that
      // place now holds bytes (the pad append() puts at the old end of the file)
      const same = a && b ? a.length === b.length && a.every((x, k) => x === b[k]) : ptrOf(before, i) === ptrOf(doc, i);
      if (!same) out.push(i);
    }
    return out;
  }

  /* ------------------------------------------------------------------ what a script plays, for the preview */
  /* -> { steps: [{anim, at} | {wait, at}], end: {kind, loopTo (step index), at}, notes: [..] }
     Plays the script as the game would with: no effect loading (ca, ec, eb go straight on), display bit 1000 clear (b3
     runs on), the wait counter starting at 0. Moves, turns and effects are not shown: only which animations play. */
  function simulate(bytes, ctx) {
    bytes = asBytes(bytes); ctx = ctx || {};
    const steps = [], notes = new Set(), marks = new Map();
    let pc = 0, counter = 0, stored = 0, guard = 0;
    const end = (kind, extra) => ({ steps, end: Object.assign({ kind, at: pc }, extra || {}), notes: Array.from(notes) });
    while (guard++ < 2000) {
      if (pc >= bytes.length || pc >= MAX_LEN) return end('off');
      const op = bytes[pc];
      if (op < 0x8e || ANIM_LIKE.has(op)) { steps.push({ anim: op, at: pc }); pc++; continue; }
      const d = OPS[op], n = argLen(d[0]);
      if (pc + 1 + n > bytes.length) return end('cut');
      const arg = k => bytes[pc + 1 + k];
      switch (op) {
        case 0xa7: case 0xb6: steps.push({ anim: arg(0), at: pc }); break;
        case 0xa9: steps.push({ anim: arg(1), at: pc }); notes.add('a9 starts its animation 0-15 frames in, at random: the preview starts it at its first frame.'); break;
        case 0xf4: counter = arg(0); break;
        case 0xc6: stored = arg(0); break;
        case 0xc5: counter = stored; break;
        case 0xf3: if (counter > 0) steps.push({ wait: counter, at: pc }); counter = 0; break;
        case 0xee: case 0xff: return end('finish');
        case 0xf1: return end('hold');
        case 0x9e: return end('wait');
        case 0xa2: return end('reload');
        case 0xfe:
          if (counter === 0 && bytes[pc + 1] === 0xc0) return end('idle');
          break;
        case 0xc1: {
          const t = bytes.indexOf(0xc9) + 1;
          if (!t) return end('freeze');
          if (marks.has(t)) return end('loop', { loopTo: marks.get(t) });
          marks.set(t, steps.length); pc = t; continue;
        }
        case 0xb3: notes.add('b3: shown as when its display bit is clear (the script runs on).'); break;
        case 0xce:
          if (ctx.kind === 'enemy') { const t = bytes.indexOf(0xcd, pc + 1); if (t < 0) return end('freeze'); pc = t + 1; continue; }
          break;
        case 0xed: case 0xe4: case 0xb0: case 0xb1: case 0xd1: case 0xd0: case 0x99: case 0xcf: case 0xd5: case 0xe9: case 0xcc: case 0xfa: case 0xa8: case 0xfb: case 0x9a: case 0xbd: case 0xfd: case 0xc4: case 0xd4:
          notes.add('Moves (steps, run-ins, the way home) are not shown: the model plays in place.'); break;
        case 0xe7: if (!arg(0)) notes.add('e7 00 hides the model: the preview still draws it.'); break;
      }
      pc += 1 + n;
    }
    return end('long');
  }

  const api = { HEADER, FX_AT, PARTY_SLOTS, ENEMY_SLOTS, MAX_LEN, ANIM_LIKE, EXE_SLOTS, OPS, END_TEXT, STATE_TEXT,
    hex, hexBytes, u32, readAb, guessKind, ptrOf, fxOffsets, header, stateOf, boundaries, regionEnd, sharers, slotUse, isIdleSlot,
    asLoaded, decode, describe, animText, opNote, parseHex, formatScript, validate, scriptOf, slotInfo, setScript, undo, reset, write, changes, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SKELETON_MASTER_AB = api;
})(typeof self !== 'undefined' ? self : this);
