FF7 SpellExt - Breaking Limits
==============================

Breaking Limits lifts limits that are built into the game's engine itself, not into its
data. Each lift is an "item" with its own key. The first item is wide battle skeletons.

Nothing of this is done unless the game file says breaking_limits = on. Without that line
the game runs exactly as without SpellExt: no code of the game is changed.


--- for FF7_SpellExt_Game.ini (the comment block at its top) -------------------------

; breaking_limits         on or off (default off). on turns on every Breaking Limits
;                         item whose own key does not say off. off, or no line:
;                         none of them; the game's own limits.
; wide_skeletons          on (default when breaking_limits is on), off, or all.
;                         on: battle models of more than 48 bones (up to 127) can
;                         be used. all: a TESTING AID: every battle model, however
;                         small, goes through the same new code (see "Testing it"
;                         below); set it back to on when done.
;
; Both are read at start-up only: a change needs a restart of the game
; (Re-init .ini files says so in the log and changes nothing).


--- Wide battle skeletons -------------------------------------------------------------

A battle model is a skeleton of bones, each with its own part. The game holds, for each
of the ten actors of a battle, two tables of 50 entries: where each bone is (used for hit
numbers, effects at a bone, the target cursor and props) and each bone's whole matrix.
Entry 0 is the model's root and bone n is entry n + 1. Nothing in the game checks the
count: a model of more bones writes over the actor's camera matrix and then into the next
actor's record, every frame it is drawn. The battle animation loader has the same limit
in another place (a buffer of 50 tracks). The game's own largest models have 48 bones,
so the game never meets it; enemies brought from FINAL FANTASY VIII often have more
(50 to 71).

With wide_skeletons on:
  - a model of more than 48 bones is drawn with tables of 128 entries kept by SpellExt.
    The first 50 entries are copied back into the game's tables after each draw, so
    everything that reads them (hit numbers, effects, the cursor) works as before for
    bones 0 to 48. Bones from 49 up move and are drawn, but nothing of the game can be
    aimed at them: keep any bone an effect or a script names below 49.
  - the bone count the game keeps for the actor is the model's, but at most 49. The
    game's effects that pick one of the target's bones at random and its loops over the
    bones (the target's height, the clean-up at a death) read that count; with the
    model's own count they read past the 49 bones its tables hold. So for a wide model
    they use bones 0 to 48 only: the model's own bone numbering decides which part of
    the body that is.
  - an animation of more than 49 tracks (48 bones + the root) is loaded by SpellExt's
    own copy of the game's loader loop, which calls the game's own decoder for each
    frame and the game's own routines to store it.
  - models of 48 bones or fewer, and their animations, are left to the game.
  - a model of 128 bones or more is not drawn at all (and the log says so): the
    tables would not hold it.

The effect player's bone=N (effects scripts) takes 0 to 49: the bone places the game's
tables hold. (It said 0 to 54 before: entries 50 to 54 were the actor's camera matrix.)

Making the model: the FF8 enemy converter writes the files. One thing to know: bone n's
part is the file named for index 12 + n, and the animation file is index 78, so bone 66
must be a bone without polygons (the converter's --order auto does this).


--- What it changes in the game's code ------------------------------------------------

Two calls and one store, each checked byte for byte before it is changed (and the
routines SpellExt copies or calls are checked whole); if any check fails, none of the
three is changed, the log says which, and the game keeps its limit:
  0042fab2   the battle draw's call of the body draw (005e0d3c)
  005e83c2   the animation loader's call of the animation decoder (005e7de4)
  00424b8a   the store of the actor's bone count (to 00be1188 + actor * 0x1aec), every
             frame: it becomes a call of a short SpellExt stub that stores the
             same count, but at most 49
FFNx neither replaces nor reads any of these places.


--- Testing it ------------------------------------------------------------------------

wide_skeletons = all sends EVERY battle model and animation through the new code. A
battle with the game's own enemies and party should then look and play exactly as
without it: if it does, the new code does what the game does. The log says, once per
model and animation (at most 32 lines of each kind a run):
  wide_skeletons: actor N's model (B bones) is drawn with the DLL's bone tables ...
  wide_skeletons: an animation of T tracks (B bones), F frames, decoded by the DLL's loop ...


--- Log lines -------------------------------------------------------------------------

At start-up, one of:
  breaking limits: wide_skeletons on: battle models above 48 bones (up to 127) are drawn
      with the DLL's bone tables, their animations decoded by the DLL's loop (calls at
      0042fab2 and 005e83c2); the game's effects see their first 49 bones (count kept at
      00424b8a)
  TESTING AID on: wide_skeletons = all: every battle model is drawn with ...
  breaking limits: on; wide_skeletons off: battle skeletons keep the game's limit of 48 bones
  breaking limits: off (breaking_limits is not on): wide_skeletons is not taken; ...
  breaking limits: wide_skeletons NOT on (see the line above): nothing patched; ...
No line at all when neither key is in the game file.
