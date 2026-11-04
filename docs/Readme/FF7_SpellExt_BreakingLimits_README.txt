FF7 SpellExt - Breaking Limits
==============================

Breaking Limits lifts limits that are built into the game's engine itself, not into its
data. Each lift is an "item" with its own key. The first item is wide battle skeletons;
the second, model skinning, is off unless its own key says on.

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
; model_skinning            on or off (default off). on: a battle model's file in
;                         SpellExtConfig\skins can give single vertices another
;                         bone (see "Model skinning" below). Needs breaking_limits
;                         = on and wide_skeletons on or all.
;
; All are read at start-up only: a change needs a restart of the game
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


--- Model skinning --------------------------------------------------------------------

The game has one rigid part per bone, so a polygon that crosses two bones must live in
one part and tears or stretches wrongly when the joint bends. With model_skinning = on, a
model can say that single vertices of a part follow another bone. Each time the model is
drawn in battle the DLL works out where that bone puts them and writes them into the part
before it is drawn. Nothing else about the model changes. No file: the model is left alone.

The file is SpellExtConfig\skins\<first two letters of the model's parts>.skin, plain text,
the parts being named as in the battle archive (rtax, rt.skin; a new character's battle_files
letters for its own), one vertex a line; an empty line or one starting with ; or # is skipped:

  part=rtax group=0 vertex=59 bone=12 x=18.5 y=-191.7 z=30.6 rx=18.544249 ry=28.303410 rz=-86.441521

  part     the part file's name, without folder or extension (capitals do not matter)
  group    the group inside that part
  vertex   the vertex, counted inside that group
  bone     the bone it follows, from 0
  x y z    its place in that bone's frame
  rx ry rz where the part file has it (within 0.01): the check that this file belongs to
           the part that is loaded

Numbers are plain decimals. The file is taken whole or not at all: a part, group, vertex or
bone that does not exist, a vertex not at rx ry rz, a vertex listed twice, the part's own
bone given as the true bone, or a part with no vertex arrays (not FFNx) refuses the whole
file with one log line, and that model is drawn as if the file were not there. A model
made to lean on this looks wrong without it, so such a model needs this DLL.

Seen in the code only so far. It relies on FFNx drawing a part from the vertices it keeps in
memory; a new FFNx could change that.


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

With model_skinning asked for, at start-up, one of:
  model_skinning: on: a battle model's skins\<first two letters of its parts>.skin is honoured
  model_skinning: NOT on: it needs breaking_limits = on and wide_skeletons on (the call at
      0042fab2): no skin file is read
In a battle (at most 64 of the first three kinds a run):
  model_skinning: skins\rt.skin taken: 3 vertices in 1 part(s) of a model of 23 bones
  model_skinning: skins\rt.skin refused whole, nothing is written: <why> (line N)
  model_skinning: a model of 23 bones has no skin: <why>; part sets looked at N, without a
      set N, without data N, without a name N; first name '...', first stem '...'; file
      'skins\rt.skin' did not open
      (once per model per battle. <why> "no file for it" is the usual case: a model with no
      skin file. Read the file's name here if you expected one to be taken.)
  model_skinning: this battle: 1 skin file(s) in use; V vertices rewritten in D model draws
      of N; S draws skipped (determinant near 0); the largest move from a vertex's place
      in its file was U units
The last is one line a battle, at its end.
