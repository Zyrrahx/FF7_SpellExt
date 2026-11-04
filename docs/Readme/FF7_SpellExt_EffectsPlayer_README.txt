FF7 SpellExt - the native effect player: effect scripts
========================================================

A native effect is an effect number the DLL plays itself, from a script, with no effect routine of the
game's. It is named in FF7_SpellExt_Effects.ini and played by a spell like any effect copy, or by a
limit (`spell_effects = effect 0x201:0 all` in FF7_SpellExt_Limits.ini: see "A limit made of spell
effects" in FF7_SpellExt_Limits_README.txt).

    ; FF7_SpellExt_Effects.ini
    [effect 0x201]
    play = stage1_demo      ; the script SpellExtConfig\effects\stage1_demo.txt (the name, without .txt)
    base = 0x00             ; optional: the effect the spell's record holds while the script plays

    ; FF7_SpellExt_Spells.ini
    [3027]
    animation = 0x201       ; (or animation_all, for several targets)

`base` must be an effect that loads no files: 0x00-0x04 or 0x19 (0x00, Cure, if not given). It is also
what plays whenever the DLL cannot play the script (the log says why): a broken script, a missing file,
the battle's lists full. The cast's aura, animation, camera, name and damage are the spell's as always.

`play = stage0_test` still works without its file: the DLL has stage 0's timeline built in, and plays the
file SpellExtConfig\effects\stage0_test.txt instead when it is there.

"Re-init .ini files" reads the effects file and every script again. A NEW file in a mod folder is only
seen after the game is restarted (7th Heaven lists a mod's files when it starts the game).


1. A script
-----------

Lines are read one at a time. `;` or `#` (at the start, or after a space) begins a comment. Upper or lower
case does not matter. A script has a head (`key = value` lines) and a timeline.

    folder = MAGIC/FIRE
    file 0 = FIRE00.TIM FI_A01.SPT blend=add
    file 1 = FIRE01.TIM blend=add
    length = 30

    0    sound 9 pan=targets
    0-29 sprite 0 at=target bone=1 page=loop
    10   hit

Head:

  file N = TEXTURE.TIM [SHEET.SPT] [blend=KIND] [tex=A,B,...]
      The effect's files, numbered 0, 1, 2 ... in order (32 at most: 0 to 31). The game asks for NAME.TIM as
      NAME.TEX and for NAME.SPT as NAME.S. A file with a sheet (.SPT) can be drawn by `sprite`; a file
      with only a texture is there for a sheet's second (third, fourth) texture page.
      blend:  add (the default; fire and light), average (half and half), subtract, quarter (a quarter
              added). These are the engine's four blended kinds, set per file.
      tex:    the files whose textures the sheet's texture pages are, in the order the sheet names its
              pages. A sheet names 1 to 4 texture pages. The default is this file, then the next ones,
              as many as the sheet has texture pages (file 0's default here: tex=0,1; a sheet of one
              page: tex=N, its own file alone). The log refuses the effect if the sheet names more pages
              than tex gives, or if a quad of the sheet names a texture page the sheet does not list.
              With one texture page, tex's first file is the texture drawn (tex=1: file 1's texture).
              A tex= list longer than the sheet's pages is allowed: its extra files are not drawn by
              this sheet (each must still be a loaded texture). A model file is never one of a sheet's
              textures: the default list stops before it, and tex= naming one is refused.

  file N = MODEL.RSD [blend=KIND] [morph=NAME.MRF]
      A 3-D model, drawn by `model` lines: the game reads NAME.RSD, the .P its PLY line names and the
      textures (.TIM, asked for as .TEX) its TEX lines name. A model's line names the .RSD alone: no
      second name and no tex=. blend: add (the default), average, subtract, quarter, or solid (drawn
      as an opaque model; solid is for a model only). morph: the model's vertex sets, for a model
      whose shape changes from frame to frame (see "Morph files" below). At "Re-init .ini files" the DLL looks for NAME.RSD
      and the .P its PLY line names (108.RSD names 101.PLY: 101.P is looked for; NAME.P when the RSD
      cannot be read or has no PLY line); its textures are only checked when the effect is cast. Sprite and model files may be mixed in
      one effect (the game's own effects do: Holy's group is a sprite sheet and a model).

  folder = FOLDER
      The archive folder the game looks in for a name magic.lgp holds in several folders, as the game's
      own loaders name them (MAGIC/FIRE, MAGIC/BIO, magic/brizag ...). Default MAGIC/FIRE. It does not
      matter for a file of the mod's own (a name the archive does not hold). One folder serves the whole
      effect, so the game's own files of two different folders cannot be mixed in one script.
      For a game model whose name magic.lgp holds twice (BRIZAG_1.RSD, .P and its .TEX files are in
      magic/brizag and magic/brizag2), folder must be the game's own (folder = magic/brizag): without it
      the file passes "Re-init .ini files" but is not found when the effect is cast ("no model" in the
      log; its spells play their base effect). A name the archive holds once is found from any folder.

  length = FRAMES
      How long the effect is, 1 to 600 frames. The battle runs 15 frames a second (30 = 2 s). The
      effect ENDS at its length whatever else is pending. Without `length`, the last frame any line
      names, plus one.

Timeline: one command a line, `FRAME` or `FIRST-LAST` first (0 to length - 1):

  FRAMES sprite FILE [key=value ...]
      Draws one page of file FILE's sprite sheet, on every frame from FIRST to LAST, as a flat picture
      facing the camera. Without a frame: the whole effect. Keys (none may contain a space):
        at=target       one sprite at each target of the cast (the default)
        at=caster       one at the caster
        at=centre       ONE sprite in the middle of the cast's targets, however many they are (also
                        at=center): the middle of their places on the floor (the point the game's own
                        sounds pan from, and Comet2's place for several targets), raised to the targets'
                        mean height at bone=N, or on the floor with bone=ground. For a picture that
                        belongs to the whole cast, not to each target: a darkened screen, a sky, a
                        shower over all the enemies. With one target it is the floor under that target,
                        raised to its bone=N height (not the bone's own place, as at=target uses).
        at=screen       ONE sprite fixed to the camera, however many targets: x=, y= and z= are its place
                        in the CAMERA's own space (x to the right, y down, z away from the camera, in the
                        battle's units), so it stays where it is on the screen whatever the camera does.
                        z is required, 1 to 32767 (below 250 the game's near plane cuts it off); x and y
                        -32767 to 32767. The picture's edges are at x = +-213.5 z / H and y = +-120 z / H
                        (FFNx at 16:9; +-160 z / H at 4:3), H being the camera's projection (512 unless
                        a camera zooms): at z=600 and H 512 the screen is about 500 units wide and 280
                        high. For what FF8 draws on the screen itself: a dark cover, a sky, a title.
                        It is depth-tested as any sprite: a small z is in front of every actor, a large
                        one behind the actors nearer than it. No bone=, depth= or each= (refused).
        at=arena        ONE sprite at a fixed place in the battle's arena, however many targets: x=, y=
                        and z= are its place in the battle's world, from the arena's centre (the point the
                        game lays the party and the enemies out around), y 0 the floor and negative up,
                        -32767 to 32767 each (default 0). It does not follow any actor, and the arena is
                        never turned: whoever casts, x, y and z are the world's own, as FF8 keeps them
                        (its enemies always stand toward -z; in FF7's normal battle the party stands at
                        z +1700 and the enemies at z below 0, the same way round). In a back attack the
                        sides are swapped and the line is not turned for it, as the camera and the lines
                        at a target are not either. For a picture fixed in the arena: FF8's Meteor drops
                        its rocks round the arena, not round the target. No bone=, depth= or each=
                        (refused).
        bone=N          the bone place it sits at, 0 to 49 (default 1; 0 is the model's root, inside its
                        body, not its feet; past a model's last bone: its last). bone=random: a bone
                        chosen once for each target (as Fire's bursts; not with at=centre). bone=ground:
                        on the floor under the actor (see `model`); x, y and depth still apply on top
        page=loop       one page a frame, from the first, round the sheet (the default)
        page=N          always page N
        page=A>B        from page A at FIRST to page B at LAST (page=0>13; page=13>0 backwards)
        palette=N       draws every quad with palette row N of its texture (0 to 255, and below the number
                        of palettes its .TEX has: see below). palette=A>B steps from row A at FIRST to row
                        B at LAST in whole rows, as page=A>B does (the last row shows on the last frame).
                        Without palette=: each quad's own row, as the sheet names it (Fire's FI_A01.S
                        picks rows 2 and 3 of FIRE00's four) - exactly as before palette= existed.
        scale=P         size in percent (100: as the sheet has it), 0 to 700; scale=W,H for a different
                        width and height (scale=200,50)
        rot=D           turned D degrees in the screen's plane, -3600 to 3600 (rot=0>360: one full turn)
        x=N y=N         moved on the screen's plane: x to the right, y down (y=-200: higher), -8192 to 8192
                        (at=screen and at=arena: the place itself, -32767 to 32767)
        z=N             at=screen: the distance from the camera, 1 to 32767 (required there); at=arena:
                        the place's z, -32767 to 32767. Not with any other at=
        zoom=fixed      at=screen only: the sprite keeps the size it has at the battle's own H (512)
                        when a camera zooms (plays another H): as FF8 draws a layer that carries its
                        own H, or a picture drawn in screen pixels. zoom=camera (the default): it grows
                        and shrinks with the zoom as everything else. Only x and y are stretched (by
                        512 / H), so its depth does not change. A line so large that the stretch would
                        pass the engine's range is drawn smaller (the log says so once a cast): give it
                        a smaller scale= and a bigger picture (or model file) if it must stay whole.
        depth=N         moved along the line of sight: negative toward the camera. depth=model (the
                        default) pulls it toward the camera by the target's height, as Fire does
                        (at=centre: by the targets' mean height). Not with at=screen or at=arena (z= is
                        its place)
        colour=R,G,B    0 to 255 each; 255,255,255 is the picture as it is (it cannot be made brighter).
                        On an additive sprite, toward 0,0,0 fades it out. (color= also works)
        each=K          targets in turn: the second target's sprite runs K frames after the first's,
                        the third's 2K after, and so on (in the order of the actors: party, then
                        enemies). Not with at=caster, at=centre, at=screen or at=arena.
      Any value except bone, at and each may be FROM>TO: it goes from FROM at the line's first frame to
      TO at its last, in a straight line (scale=60>140, colour=255,255,255>0,0,0, rot=0>180, y=0>-200).
      With each=K the change runs over each target's own frames.

  FRAMES model FILE [key=value ...]
      Draws file FILE's model (a file NAME.RSD), on every frame from FIRST to LAST, as a solid 3-D
      object placed in the battle's world (it does not face the camera unless face=camera). Without a
      frame: the whole effect. Keys:
        at=target       one model at each target of the cast (the default)
        at=caster       one at the caster
        at=centre       ONE model in the middle of the cast's targets (also at=center), as a sprite's
                        at=centre
        at=screen       ONE model fixed to the camera, as a sprite's at=screen: x=, y= and z= are its
                        place in the camera's own space (z required, 1 to 32767; x and y -32767 to
                        32767), its axes the screen's as with face=camera (turn=X,Y,Z about the screen's
                        x, y and z), sized by scale= in the battle's units. A model standing all round
                        the camera's view (FF8's Meteor: a dark plane, a bowl of stars, a planet wider
                        than the screen) is drawn this way. No bone=, each= or face=world (refused).
        at=arena        ONE model at a fixed place in the arena, as a sprite's at=arena: x=, y= and z=
                        are its place in the battle's world from the arena's centre (-32767 to 32767,
                        y 0 the floor, negative up), and turn= is about the world's axes as at a
                        target (never turned with the caster: see the sprite's at=arena). face=camera
                        works as at a target (its axes the screen's, at that place). No bone= or each=
                        (refused).
        bone=N          the bone place it sits at, 0 to 49 (default 1, as a sprite; 0 is the model's
                        root, inside its body (about the hips), NOT its feet; past a model's last bone:
                        its last). bone=random as a sprite (not with at=centre)
        bone=ground     on the floor under the actor: the actor's place now (it follows the actor when
                        a script moves it, as when it steps forward), at the floor's height (y 0, where
                        the game draws every shadow). Use it for anything that stands on the floor.
                        Offsets apply on top (y=-300: 300 above the floor). Works with at=caster,
                        at=target, at=centre (the floor in the middle of the targets) and each= as any
                        bone.
        x=N y=N z=N     moved from the bone in the battle's world units (not the screen's plane):
                        along the world's X, Y and Z axes, whichever way the target faces. y negative is
                        UP (y=-600: 600 above the bone). -8192 to 8192. A character is about 900 tall.
        turn=X,Y,Z      degrees about the world's X axis, Y (the vertical) and Z, -36000 to 36000
                        each. Any of the three may be FROM>TO by itself: turn=0,0>720,0 turns it twice
                        about the vertical over the line's frames; turn=0,0,0>360,180,90 is the same as
                        turn=0>360,0>180,0>90. A positive turn about Y looked clockwise in the game
                        (stage 3a's test); it turns the same way as a limit prop's prop_turn.
        scale=P         size in percent, 0 to 700, the same on all three axes (100: as the file has it);
        scale=X,Y,Z     one per axis (scale=300,150,300: wide and short). FROM>TO as for turn:
                        scale=200>700, scale=100,50,100>200,50,200, or scale=100,50>150,100 (Y alone).
                        The model is sized first, then turned, then moved.
        fade=A          0 to 255: 255 the model's own colours (the default), 0 fully the colour= (default
                        black). fade=255>0 over the line: on an additive model a fade-out (it darkens to
                        nothing, which is how an additive effect fades); on a solid model it darkens
                        toward black (or toward the colour), never see-through.
        colour=R,G,B    the colour the model fades toward as fade= goes from 255 to 0, 0 to 255 each
                        (color= also works). Alone (fade 255) it changes nothing. colour=0,0,255
                        fade=255>0: the model turns blue. FROM>TO as for turn (colour=255,0,0>0,0,255).
        uv=U,V          the model's texture moved by U/256 of its width and V/256 of its height, 0 to 255
                        each, wrapping round. uv=0>255,0: the texture slides once round sideways over the
                        line's frames. A polygon whose texture spans the wrap stretches across it, so a
                        scrolled model is best made of cells that scroll by whole cells.
        palette=N       the palette row of the model's first texture (TEX[0] of its RSD), 0 to 255 and
                        below that .TEX's palette count (checked when the effect is cast; past it, not
                        played). palette=A>B steps in whole rows. When one line of a file gives
                        palette=, every line of that file draws a row (row 0 when it gives none), since
                        the game keeps the row on the texture. Only for a model with one texture (an RSD
                        with NTEX=1): a model with more, or with none, is not played (its spells play their
                        base effect; the log says why).
        face=camera     the model's axes are the screen's (x right, y down, z away from the camera) at
                        its place: it always shows the same side to the camera, whichever way the camera
                        turns. Then x= and y= move it on the screen's plane, z= along the line of sight
                        (negative: toward the camera), and turn=X,Y,Z turns it about the screen's axes
                        (turn=0,0,0>0,0,360: once round in the screen's plane). face=world: the default.
                        With at=screen face=camera is implied (it may be given; face=world is refused).
        face=yaw        the model stays upright in the world and turns about the vertical to face the
                        camera (a cylindrical billboard: a tree, a pillar of light, a standing wave). Its
                        axes: x the screen's right made level, y the world's vertical (down, as y always
                        is), z the line of sight made level (away from the camera). With a level camera
                        it is face=camera; with a camera looking down it is seen tilted by that pitch
                        only. x=, y= and z= move it along those axes (y the vertical), turn=X,Y,Z turns it
                        about them (turn=0,0>360,0 spins it about the vertical). It works with at=target,
                        caster, centre and arena, bone= and each= as without it. Not with at=screen
                        (refused: a screen model's axes are the screen's). The last face= of a line counts.
                        (A camera looking within about 14 degrees of straight down takes the screen's
                        right for x instead.)
        shape=N         a model with a morph file (morph= on its file line): its vertex set N, 0 and up
                        (below the file's set count). shape=A>B: from set A at FIRST to set B at LAST in
                        whole sets, as a sprite's page=A>B (the last set shows on the last frame;
                        shape=59>0 backwards). Without shape= a line of a morph file draws set 0.
        tween=smooth    with shape=A>B: blended between neighbouring sets instead of stepping, in 256ths
                        of a step (10 sets over 60 frames, smoothly). tween=step: the default.
        zoom=fixed      at=screen only: as a sprite's zoom=fixed (the model keeps the size it has at H
                        512 whatever H a camera plays; its depth unchanged). Keep such a model's scale=
                        at 150 or below if it must stay whole down to H 128 (x 4): the matrix holds at
                        most 800 % (32767 / 4096) once stretched; past it the model is drawn smaller.
        each=K          targets in turn, as for a sprite. Not with at=caster, at=centre, at=screen or
                        at=arena.
      x, y, z, fade, colour, uv and palette may be FROM>TO too. A model has no page=, rot=, depth=
      (refused; shape= is a model's page). The colour mixing and fading above is FFNx's (the user's driver); the stock driver
      uses other routines for them: not checked.
      The game's own effect models are often tiny in their files and enlarged when the game loads them
      (Blizzaga's spike BRIZAG_1 stands 106 units tall in its file and is loaded 25 times larger): a
      script draws a model at its file's size, so such a model needs a large scale.

  Morph files: a model that changes its shape
      A model whose vertices move from frame to frame (a ribbon growing, a beam stretching, a cloud
      billowing) keeps its polygons, colours and texture and takes its vertex POSITIONS from a morph
      file, one set of them a frame:
          file 0 = RIBBON.RSD blend=add morph=RIBBON.MRF
          0-59 model 0 at=target bone=ground shape=0>59
      draws set 0 at frame 0, set 1 at frame 1, ... set 59 at frame 59.
        NAME.MRF        in SpellExtConfig\effects, beside the scripts (the DLL reads it itself, at
                        "Re-init .ini files"; the game never asks for it, so it is never looked for in
                        the magic folder or magic.lgp). Several file lines and scripts may name one: it
                        is read once.
        its bytes       (little-endian) "SXMORPH1", then 32 (the header's size), V (the vertices of a
                        set, 1 to 32768: the .P's own count), S (the sets, 1 to 600), and three 0s; then
                        S sets of V vertices, each three 32-bit floats x, y, z in the .P's own units and
                        axes, in the .P's vertex order (group by group, as its vertex block). Exactly
                        32 + S x V x 12 bytes. Every value finite and below 2097152 either way.
                        (A 60-set ribbon of 400 vertices: 288,032 bytes.)
        the .P          an ordinary model. Its own vertices are not drawn while a morph line draws it:
                        make them set 0. Give its box block room for every set.
      One set a frame for each FILE. A file is one model in the engine, so every copy of it drawn in a
      frame shows that frame's set: several targets are fine (each gets the same set). Two lines of one
      morph file that would ask for different sets on one frame refuse the script, and so does each=
      with a changing shape= (the targets would ask for different sets): for copies at different sets,
      give each its own file line naming the same RSD and morph= (file 3 and file 4 both
      RIBBON.RSD morph=RIBBON.MRF). An each=K line is taken as on to LAST + 9 K for that test. A line
      of a morph file without shape= asks for set 0.
      The sets are written into the model's own vertices each frame it is drawn, through the game's own
      vertex lock (the routine its fades use); under FFNx they reach the screen the same frame. Cost:
      12 bytes a vertex a frame for each morph file drawn.

  FRAME hit [each=K]
      Shows the cast's result on every target (the damage number and the target's reaction). Each
      target is hit EXACTLY ONCE: by the first hit line that reaches it. A target not hit when the
      effect ends (its length, or the effect cut short) is hit then. each=K: the first target at FRAME,
      the next at FRAME + K, ... Without a frame: a third of the way in. A script with no hit line hits
      every target a third of the way in.

  FRAME sound ID [pan=targets|caster] [kind=0x20] [each=K]
  FRAME sound HANDLE [pan=targets|caster] [each=K]
      Plays sound effect ID (1 to 751, the game's numbering; Fire's is 9). pan: from where it seems to
      come, the targets' centre (the default) or the caster. kind: 0x20 (the default, an effect's plain
      sound) or 0x28-0x2b (four channels; a sound on a channel stops the last one there), as the game's
      own effects call it. each=K with pan=targets: one sound on each target in turn. Without a frame:
      frame 0.
      HANDLE is a sound of your own, a [sound N] section of the effects file (section 5), by its number
      or its name: `6 sound 56780 pan=targets` or `6 sound ff8_fire_0 pan=targets`. It plays on the
      handle's own channel, so kind= is refused on it. A number above 751 that is no usable handle, or a
      name no usable handle has, refuses the script like any bad line.

  FIRST-LAST stage hide=all|far|none
  FIRST-LAST stage dark=A>B [colour=R,G,B]
      The battle's stage (the arena: its floor, walls and sky), while the line is on. It belongs to the
      cast, not to a target: once a frame whatever the targets, so no at=, bone= or each= (refused).
        hide=all        the stage is not drawn at all: the actors and the effect's own sprites and models
                        show against the empty background (black), as the game's Shadow Flare, Omnislash
                        or Super Nova do it
        hide=far        only the stage's far layer (its sky or distant parts) is not drawn, as Typhoon
                        does it. On a few stages (the game's stage kind 2) it hides nothing.
        hide=none       the stage drawn as the game has it (to end an earlier line's hide early)
        dark=A>B        how far the stage goes toward the colour: 0 the stage as it is, 4096 the flat
                        colour, A at the line's first frame to B at its last (dark=0>4096 darkens it,
                        dark=4096 holds it). colour=R,G,B (0-255 each, may be FROM>TO too): the colour,
                        default 0,0,0 (black). colour= needs dark=.
      hide= and dark= may be on one line. Several stage lines may be on at a frame: the LAST one in the
      script with hide= decides the hide, the last one with dark= the darkness. When no line asks, the
      stage is the game's own. When the effect ends (any way: its length, cut short, a newer cast) the
      stage is put back as the game had it; what the game itself changed meanwhile is left as the game
      wrote it. The change shows one frame after the line's frame (the stage is drawn before the effect).
      Without a frame: the whole effect.
      Under FFNx the darkening goes through FFNx's lighting (enable_lighting): to be compared in the game
      with the game's own Shadow Flare.

  FIRST-LAST fill colour=R,G,B [blend=add]
  FIRST-LAST fill alpha=A
  FIRST-LAST fill blend=alpha [colour=R,G,B] [alpha=A]
  FIRST-LAST fill blend=subtract colour=R,G,B
  FIRST-LAST flash colour=R,G,B [in=N] [out=M]
  FIRST-LAST fill layer=back colour=R,G,B
      A flat colour over the whole screen, in front of everything, each frame the line is on: the game's
      own full-screen quad (the one its white-outs and its boss deaths use). Like a stage line it belongs to
      the cast: drawn once whatever the targets, so no at=, bone= or each= (refused).
        colour=R,G,B    0-255 each (color= also works); FROM>TO over the line (colour=255,255,255>0,0,0)
        blend=add       (the default) the colour is ADDED to the picture: 255,255,255 is a white-out,
                        0,0,0 changes nothing. FF8's flashes and additive fills.
        alpha=A         0-255: black laid over the picture, A/255 of it (255: the screen black). Alone it
                        is blend=alpha with colour 0,0,0. FROM>TO allowed (alpha=0>255 fades to black).
        blend=alpha     the colour laid over the picture at alpha= (default 128, half and half: FF8's
                        "average" fills): picture x (1 - A/255) + colour x A/255. Drawn as one quad: the
                        game's darkening quad, given the colour. (blend=average also works.)
        blend=subtract  the colour taken away from the picture (FF8's subtractive fills). The game has no
                        such quad, so it is APPROXIMATED: black laid over at the colour's mean, picture x
                        (1 - mean/255). Exact on white, lighter than FF8's on a dark picture.
      alpha= goes only with blend=alpha (or alone). A fill shows on the same frame as its line.
      flash is FF8's screen flash: the colour rises from nothing over the first in= frames, holds, and falls
      over the last out= frames, frame for frame as FF8's own flash task does it (its first frame is dark
      when in= is given; in=0 out=0, the default, holds the colour throughout). FF8's flash (attack, hold,
      decay, grey) is `flash colour=grey,grey,grey in=attack out=decay` over attack+hold+decay frames.
      in= + out= may not be more than the line's frames. Several fill and flash lines may be on at a frame:
      they are all drawn, up to 16 a frame (the first 16 in the script's order). The game draws every
      ADDED colour of a frame (blend=add, flash) first and every LAID-OVER one (alpha=, blend=alpha,
      blend=subtract) after it, whatever their order in the script: a blend=alpha fill on the same frame
      as a flash covers the flash too. Without a frame: the whole effect.
      (Read from the game's code: the quad adds its colour; to be confirmed in the game, see the test
      F8ULTIMA_FLASH.)
      layer=back is not in front: an OPAQUE colour BEHIND the actors and the effect, at the far end of the
      view (the game's own Shadow Flare backdrop, 30 flat strips across the battle's view; FFNx widens them
      for a wide screen). Hide the stage with a stage line to see it everywhere: `45-62 stage hide=all` and
      `45-62 fill layer=back colour=120,160,255` stand the actors on a sky-blue picture. With the stage
      shown it is only seen where nothing of the stage is drawn. It takes colour= alone (FROM>TO allowed; no
      alpha= or blend=); of the layer=back lines on at a frame the LAST one in the script is drawn. A flash
      has no layer=.

  FIRST-LAST shake [x=N] [y=N] [z=N] [period=P]
      The whole picture (stage, actors and effect together) jolts while the line is on: N battle units
      (0 to 1024) along the SCREEN's axes, x to the right, y down, z along the line of sight (a jolt in and
      out), whatever way the camera looks. The jolt is +N for the first half of each period and -N for the
      second, counted from the line's first frame: period=2 (the default) is up one frame, down the next;
      period 2 to 60, even. Each of x, y, z may be FROM>TO: y=200>0 over 12 frames is FF8's own dying jolt.
      At least one of x=, y=, z= must be given. Of the shake lines on at a frame the LAST one in the script
      decides. The camera's own shake (the game's) is kept underneath: the line's jolt is added to it.
      When the effect ends (any way) the camera is put back as the game had it; if the game writes its own
      shake meanwhile, the game's is kept and this effect shakes no more (the log says so). The jolt shows
      one frame after the line's frame (the camera is built at the end of the frame). Without a frame: the
      whole effect. Belongs to the cast: no at=, bone= or each=.

  FIRST-LAST actors hide who=caster|allies|bystanders
  FIRST-LAST actors hide who=targets|opponents|others|all      (ending before the first hit)
  FIRST-LAST actors fade=A>B [who=W]
  FIRST-LAST actors tint=R,G,B [amount=A>B] [who=W]
      The battle's actors themselves, while the line is on: hidden, darkened, or turned toward a colour.
      who= names them, always as seen from the caster:
        who=targets     the cast's targets (the default)
        who=caster      the caster
        who=allies      the caster's side, the caster too (the party for a party member, the enemies for an
                        enemy)
        who=opponents   the other side (who=enemies also works: the caster's enemies)
        who=others      everyone but the caster
        who=all         everyone
        who=bystanders  everyone but the caster and the cast's targets, both sides (the rest of the party
                        and the enemies not targeted)
        hide            the actor's body, its weapon and its shadow are not drawn; it still acts, its
                        scripts run and effects still find its bones. hide always names its who= (no
                        default). who=caster, who=allies and who=bystanders: any frames; a target of the
                        cast is never hidden by who=caster or who=allies (a cast on its own party; the log
                        says so once), and bystanders are never targets. FF8's Meteor hides the caster's
                        side this way, Shockwave Pulsar the party and the other enemies (allies +
                        bystanders) while the target stands alone in the void.
                        who=targets, opponents, others or all can name a target: such a line must END
                        BEFORE THE SCRIPT'S FIRST HIT (the earliest hit line's frame, or a third of the
                        length when the script has none): `20 hit` allows `5-19 actors hide who=targets`
                        and refuses `5-20 ...` (the whole script is then not used). So a target is always
                        drawn when it is struck, and its death is seen. An enemy the game is not drawing
                        (dead, removed, not yet appeared) is never hidden. If the game's own death takes
                        a hidden enemy during the cast, its bit 2 is left as it is: a dead enemy is not
                        drawn either way (the log says so).
        fade=A>B        the body darkened toward black: 0 as it is, 4096 black (a silhouette). FF7 does not
                        make a body see-through: 4096 is black, not invisible (as the game's Shadow Flare
                        turns its actors black). A at the line's first frame to B at its last.
        tint=R,G,B      the body turned toward the colour (0-255 each, may be FROM>TO), by amount= (0 to
                        4096, default 4096: fully the colour; FROM>TO allowed): FF8's tinted and flashing
                        actors (tint=255,255,255 amount=4096>2048 is a white flash).
      fade= and tint= are not on one line (with tint=, amount= is how far). hide may share a line with
      either. Several actors lines may be on at a frame: for each actor the LAST one naming it with fade= or
      tint= decides its look; hide is on while any hide line names it. An actor no line names is as the game
      has it. When the effect ends (any way: its length, cut short, a newer cast) every actor is put back
      as the game had it. An actor showing a status's pulsing colour (Poison, Regen and others: the game
      moves its look every frame) is left to the game: fade= and tint= do not change it. If the game changes
      an actor's look meanwhile (a status put on, a death's fade, a summon), the game's is kept and this
      cast leaves that actor's look alone; if the game shows a
      hidden actor again, or takes it out of the picture itself (a summon), it is the game's from then on
      (the log says so). An actor that is removed or replaced during the effect is left alone. The change
      shows one frame after the line's frame. Without a frame: the whole effect. Belongs to the cast: no
      at=, bone= or each=. (Read from the game's code; to be confirmed in the game, see the tests
      F8METEOR_ACTORS and F8THUNDAGA_TINT.)

  FIRST-LAST actors move [who=W] [x=A>B] [y=A>B] [z=A>B]
  FIRST-LAST actors turn [who=W] turn=X,Y,Z
      The actors themselves moved from their own place, or turned from their own turn, while the line is
      on; who= as above (targets by default).
        move            x=, y=, z= are the offset from each actor's own place along the battle's axes, in
                        battle units, -8192 to 8192 (y negative is UP: y=0>-1024 lifts a body about a
                        character's height; the floor is y 0). FROM>TO goes straight from A at the line's
                        first frame to B at its last. An axis not given is 0. The game's own shadow, where
                        it is drawn, stays on the floor (with FFNx's enable_lighting it is not drawn).
        turn            turn=X,Y,Z adds degrees to each actor's own turn about the world's X axis,
                        its Y axis (the vertical: its facing) and the world's Z axis, -36000 to 36000
                        each; any of them FROM>TO (turn=0,0>360,0 is one turn about the vertical), or
                        X,Y,Z>X,Y,Z. The body turns about its own place (the point on the floor it stands
                        on), not about its middle: a half turn about X with no lift swings it below the
                        floor, so a flip goes with a lift (move y=). Read from the game's draw: the facing
                        is applied first, then X and Z about the WORLD's axes (so an X turn tips an actor
                        toward or away from the other side whichever way it faces); a positive X tips the
                        top of the body toward the enemies' side (the battle's -z), a positive Z toward
                        the battle's +x. To be confirmed in the game.
      move and turn may share a line (actors move turn y=0>-800 turn=0>-180,0,0) and a line with hide,
      fade= or tint=. Several lines on at a frame: for each actor the LAST one naming it with move decides
      its offset, and the last one with turn its turn. As hide, a move or turn line that can name a target
      (who=targets, opponents, others, all) must END BEFORE THE SCRIPT'S FIRST HIT (refused otherwise: the
      whole script is not used): a target is back on its own place, in its own turn, when it is struck and
      when it dies. who=caster and who=allies never move a target of the cast (the log says so once);
      who=bystanders never names one. An actor is put back on its place and turn the frame after the last
      line naming it, and at the effect's end whatever the way (its length, cut short, a newer cast); a
      later line takes it again from where it then is. An enemy the game is not drawing (dead, removed, not
      yet appeared) and an actor out of the picture (a summon's) are never moved; one that leaves the
      picture or dies meanwhile is put back at once. If the game moves or turns an actor itself while a
      line holds it (its own script stepping, a mover), that field is the game's for the rest of the cast
      (the log says so, with the offset it held): a game step taken while an actor is moved keeps that
      moment's offset. A target is never moved when the game stores its home place; a caster, ally or
      bystander moved while its own script stores its home would keep the moved place as its home. The
      move shows one frame after the line's frame. Without a frame: the whole effect. Belongs to the
      cast: no at=, bone= or each=. (Read from the game's code; to be confirmed in the game.)

Palettes. A .TEX file may hold several palettes (rows) of the same size: its header says how many (Fire's
FIRE00.TEX holds 4 rows of 16 colours). palette=N picks one per sprite, per frame, and FFNx draws each row
as its own texture, so two sprites of one texture may show two rows in the same frame (read from the game's
and FFNx's code; to be confirmed in the game). Every row a script
names must exist in EVERY texture the sheet draws with (file 0 = A.TIM A.SPT with tex=0,1 and a sheet of two
texture pages: A.TEX and the other file's .TEX). Only the textures the sheet draws with count: its first
pages of tex, so a later file that is not one of its pages (another sheet's texture) is not asked. This is
checked when the effect is cast (the textures must be loaded to be read): a row
past the count, and the effect is not played (its spells play their base effect; the log names the line).
A texture with no palette, or a PNG the DLL turns into a .TEX for the stock driver, has one row (0). With a
texture pack under FFNx, a replaced texture needs one picture per row (FFNx's NAME_00.png, NAME_01.png ...).

Several lines may be on at the same frame: they all draw. A per-frame description (as a program writing
a script from another game's frames would make) is simply one line per sprite per frame:
    12 sprite 0 page=3 scale=120 rot=30 colour=255,200,160
    13 sprite 0 page=4 scale=126 rot=34 colour=250,190,150


2. Limits
---------

    files per effect         32         texture pages per sheet   4
    frames (length)          600 (40 s) timeline lines per script 2048 (1048576 for all scripts together)
    lines in a script file   12000      script file size          512 KB
    sprites drawn per frame  128 (the rest of that frame is not drawn; the log says so once)
    models drawn per frame   256 (the same; counted apart from the sprites)
    turn                     -36000 to 36000 degrees about each axis
    fade                     0-255      uv                        0-255 each (256ths of the texture)
    sound ids                1-751      each=                     0-60 frames
    sound handles            1024       a handle's name           1-23 characters
    [effect] sections        1024 (effect copies and native effects together)
    scale                    0-700 %    rot                       -3600 to 3600 degrees (sprites)
    palette rows             0-255, and below the count in every .TEX the sheet draws with (checked at the cast);
                             a model's: below its first texture's count
    x, y, z, depth           -8192 to 8192
    stage dark               0-4096     stage colour              0-255 each
    fill / flash colour      0-255 each fill alpha                0-255
    fill and flash lines     16 drawn a frame (the rest of that frame is not drawn; the log says so once)
    flash in=, out=          0-599, together no more than the line's frames
    shake x, y, z            0-1024     shake period              2-60, even
    actors fade, amount      0-4096     actors tint               0-255 each
    actors move x, y, z      -8192 to 8192 battle units from the actor's own place
    actors turn              -36000 to 36000 degrees about each axis
    backdrop (layer=back)    one a frame (the last line on)
    morph file (.MRF)        1-600 vertex sets of 1-32768 vertices (the .P's count); 16 MiB a file;
                             64 MiB and 256 names for all the scripts' morph files together
    shape                    0-599, below the morph file's set count; one set a frame for each file

The pool of timeline lines grows to what the scripts need, up to 1048576 (the log says its size after each reading:
"native effects: N timeline line(s) read into a pool of M"). If the memory for more is not to be had, the log says so
and a refusal names the size the pool has then: that is the limit for that run.

One native effect plays at a time (a cast's script waits for its effect before the next action; a limit's
second `effect` step ends the first one, whose hits are shown then). An
effect also always ends: at its length, as soon as its files are freed by another effect, or after a
watchdog (450 updates, or four per frame and 60 more for a long one) if the battle's pause flag never
clears.


3. When something is wrong
--------------------------

Every refused line is written to FF7_SpellExt.log with its file and line:
    effect script effects\stage1_demo.txt line 14: scale is in percent, 0 to 700: ...
    native effect 0201: effects\stage1_demo.txt has 1 refused line(s): not used (its spells play effect 00)
A script with any refused line is not used at all; its spells play their base effect. (At most 20 lines
are listed per script.) A file the script names and that is not found (in the mod's magic folder,
SpellExtConfig\files, or the game's magic.lgp) is refused the same way:
    effect script effects\x.txt line 2: the file F8FIRE.TEX is not found (...): native effect 0201 is not used

Notes (the line or key is ignored; the effect still plays):
    alpha=, fade=       reserved on a SPRITE: the engine's sprite call takes its alpha from the texture,
                        not per sprite (on an additive sprite, colour toward 0,0,0 fades it). On a model
                        line fade= works (see `model`).
    fade, camera                             reserved for a later stage (the screen)
    stage lines when the game's stage drawing routine (0042e52e) is not as expected: the log says
        "stage lines: OFF ..." once; the stage lines are not played, the rest of the effect is
    fill and flash lines when the game's full-screen quad (005bd436, 005bd456, 005bd473, 0066c3bf, and the
        setters 00667270, 0066727d, 0066723c) is
        not as expected: "fill lines: OFF ..." once; the fills are not drawn, the rest of the effect is
    fill layer=back lines when the game's backdrop (0057747e, its store at 005775f5, 00667297, 0066c3bf) is
        not as expected: "backdrop lines: OFF ..." once; the backdrop is not drawn, the rest of the effect is
    shake lines when the game's camera build (0041bda4, 0042d971, 00430be6) is not as expected:
        "shake lines: OFF ..." once; the shakes are not played, the rest of the effect is

Refused for now (the whole script is not used, as for any refused line):
    at=point              a fixed place in the arena is at=arena. A sprite or a model is at=target,
                          at=caster, at=centre, at=screen or at=arena.
    at=arena with bone=, each=, depth= (a sprite) or zoom=fixed
    each= or bone=random with at=centre   one draw for all the targets has no turn and no bone of its own
    at=screen without z=, or with z below 1; with bone=, each=, depth= (a sprite) or face=world (a model);
    z= on a sprite that is not at=screen or at=arena
    zoom=fixed on a line that is not at=screen; zoom= other than camera or fixed
    face=yaw with at=screen
    morph= on a sprite file, or a name that is not NAME.MRF; shape= on a model without morph=; tween=
    without shape=; each= with a changing shape=; two lines of one morph file asking for different sets
    on one frame:
    effect script effects\x.txt line 14: this line and line 12 draw file 0 with different vertex sets on frame 6: a morph file shows one vertex set a frame for all its lines and copies (...)
    the morph file itself (on the file line): not found, a bad header, a size that does not match its
    counts, a value that is not a finite number below 2097152 (the log names its set and vertex), past
    16 MiB, or past 64 MiB for all the morph files together; a shape= at or past its set count; a .P
    whose vertex count is not the morph file's (when the .P can be read at "Re-init .ini files"):
    native effects: morph file effects\RIBBON.MRF (4000 bytes): the morph file's size is not 32 + sets x vertices x 12 bytes (...)
    effect script effects\x.txt line 3: the morph file's size is not 32 + sets x vertices x 12 bytes (...)
    effect script effects\x.txt line 3: the morph file has 400 vertices in a set, but the model's .P has 396: a set holds every vertex of the .P, in the .P's order (file 0)

A sound handle refused in the effects file (section 5), or a script naming one that is not usable:
    effects file line 160: a sound handle's number is 53848 to 58089 (...); the log names the usable runs
    effects file line 163: sound 53848 cannot be used: the dword FFNx reads for it (00f51010) is 00000003, not 0: ... Pick one of 56780-57181, ...
    effect script effects\F8FIRE.txt line 13: sound NAME names a [sound N] handle of the effects file: none usable has this name ...
A handle that cannot be played when the effect reaches it plays nothing, says why once, and the rest of
the effect plays:
    sound handles: not played: the channel player 00745160 starts 55 8b ec 83 ec, not a jump out of the game to code (FFNx's, ...)

Refused when the effect is cast (not played this time; its spells play their base effect):
    native effect 0202: effects\x.txt line 12 asks for palette row 4, but file 0 (NFXPAL00.TIM) has 4 palette row(s) (0-3): not played
    native effect 0203: file 0 (BRIZAG_1.RSD): no model (the .P or a texture the RSD names was not found or not readable): not played
    native effect 0204: effects\x.txt line 20 asks for palette row 1, but the first texture of file 0 (F8RING.RSD) has 1 palette row(s) (0-0): not played
    native effect 0204: file 1 (KAYAKU.RSD): the model has no texture 0 (TEX[0]) on any of its states, so palette= cannot be checked: not played
    native effect 0204: file 0 (BRIZAG_1.RSD): palette= needs a model with one texture (its RSD names more; FFNx would draw the others with TEX[0]'s picture when the row changes): not played
    native effect 04f0: file 0 (SXF1QUAD.RSD): morph file SXF1QUAD.MRF: its .P's vertex count is not the morph file's (6, 8): not played
      (the loaded model checked against its morph file: its .P there, the group counts, no pre-lit screen
      vertices, every group's vertices within the morph file's, and the game's vertex lock giving them)
    native effects: morph files OFF: 00670196 is not as expected (byte 3 is ..., not 83); an effect with a morph file plays its base effect (first: 04f0)
      (once: the game's vertex lock 00670196 / 00670144 is not as the DLL knows it; effects without a morph
      file play as before)

A script may start with a UTF-8 byte-order mark (as some editors save one): it is passed over.

When a script loads, the log says what it plays:
    native effect 0201: plays effects\stage1_demo.txt: 2 file(s), 45 frames, 7 timeline line(s), 0 note(s); the record holds effect 00
and each cast:
    native effect 0201: started for actor 0 (effects\stage1_demo.txt, ...): 45 frames, 7 timeline line(s)
    native effect 0201: first draw at frame 0: 1 sprite(s), the last of line 10 (page 0, colour 2c808080), at (...)
    native effect 0202: first draw at frame 0: 1 sprite(s), the last of line 10 (page 0, palette row 0, colour 2c808080), at (...)
    native effect 0203: file 0 (BRIZAG_1.RSD): model record ..., polygon set ..., 4 group(s), instanced 1, matrix mode 1
    native effect 0203: first model draw at frame 0: 0 sprite(s), 2 model(s), the last model of line 16 at (...), turn (0, 0, 0), scale (300, 300, 300)
    native effect 0205: first model draw at frame 0: ..., the last model of line 12 at (...) on the ground, turn (0, 0, 0), scale (500, 500, 500), fade 255 colour none 000000 uv 0,0 row -1 (context ...)
      (the line is about the last model line drawn in that frame; the longer form when that line uses
      bone=ground or a key of fade, colour, uv, palette, face; face=yaw says "turned to the camera's yaw")
    native effects: morph file effects\SXF1QUAD.MRF: 60 vertex set(s) of 6 vertices (4 KiB)
    native effects: 1 morph file(s) named, 1 read (4 KiB of vertex sets; 64 MiB at most)
      (at "Re-init .ini files", only when a script names a morph file)
    native effects: morph files on (00670196, 00670144 as expected; the driver's vertex arrays (d3d2_flag 1: FFNx)): ...
      (once, at the first cast of an effect with a morph file)
    native effect 04f0: first morph set at frame 0: line 13, file 0 (SXF1QUAD.RSD, SXF1QUAD.MRF): set 0, 6 vertices
      (once a cast, the first set written; when that frame falls between two sets of a tween=smooth line, the
      line ends "set A and N/256 of the way to set A+1")
    native effect 0286: first arena draw at frame 90: line 896 (sprite) at (14, -6575, 61) in the world (caster 0, targets 0010)
      (once a cast, the first at=arena line drawn, at the place the line gives: the same for every caster)
    native effect 0201: hit queued at frame 14 for targets 0010
    stage lines: on (0042e52e as expected) (...)          (once, when the first script with stage lines loads)
    stage: darkening starts at native effect 027c's frame 0 (0 toward 0,0,0); the game's own 0, tint 0,0,0
    stage: hidden (07 of 07) at native effect 027c's frame 51
    stage: shown again (00 of 00) at native effect 027c's frame 219
    stage: back to the game's 00 (the effect's length)
    stage: darkening back to the game's 0, tint 0,0,0 (the effect's length)
    stage: the game wrote 08 there at frame 10 (...): left as it is, this effect hides no more
    fill lines: on (005bd436, 005bd456, 005bd473, 0066c3bf, 00667270, 0066727d, 0066723c as expected) (...)
                                                                 (once, at the first script with fills)
    fill: first quad at native effect 027e's frame 0 (line 30): colour 1,1,1 added (005bd436)
      (the first fill of each cast; a laid-over one says "black laid over at alpha 128 (005bd456)" or, for
      blend=alpha, "colour 0,0,128 laid over at alpha 13 (005bd473, set 5)")
    fill: more than 16 fill or flash lines at native effect 027e's frame 3: the rest are not drawn (line 40 first)
    shake lines: on (0041bda4, 0042d971, 00430be6 as expected) (...)            (once, at the first script with shakes)
    shake: starts at native effect 0280's frame 0: 0, 200, 0 on the screen, the camera's offset 3, 198, -35 (the game's 0, 0, 0)
    shake: back to the game's offset 0, 0, 0 (the effect's length)
    shake: the game wrote its own offset 0, 35, 0 at frame 7 (...): this effect shakes no more
    native effect 0201: ended at frame 45 (its length); ...


4. Where the files go
---------------------

A script:    SpellExtConfig\effects\NAME.txt
Its files:   the mod's magic folder (FFNx reads them from there; a PNG may stand in for a .TEX), or
             SpellExtConfig\files (the stock driver), or none at all for the game's own (magic.lgp).
             A .S sheet: header '#', then pages of quads, each quad (x, y, u, v, texture page, palette,
             w, h) in 8-pixel units; one page per picture of an animation.

Examples: effects\stage0_test.txt (one sprite, one hit, one sound) and effects\stage1_demo.txt (several
sprites, pages stepping, colour, scale, turn, targets taken in turn), both with Fire's own files;
effects\stage2a_palette.txt (palette rows), with NFXPAL00.TEX and NFXPAL01.TEX in the mod's magic folder:
Fire's two textures with row 0 made blue and row 1 grey (rows 2 and 3 Fire's own); effects\stage3a_model.txt
(model lines), with the game's own Blizzaga spike from magic.lgp (folder magic/brizag): no file needed;
effects\stage3b_model.txt (bone=ground beside bone 0, fade, colour, uv, face=camera, a solid model), with the
game's own BRIZAG_1, DYNAMITE and Fire files: no file needed; effects\SXF1_MORPH.txt (a quad stretched by its
morph file SXF1QUAD.MRF over 60 frames, then shrunk back with tween=smooth, and a face=yaw plane beside a
face=camera one), with base\magic\SXF1QUAD.RSD/.P and SXF1YAW.RSD/.P.


5. Sound handles: sounds of your own
------------------------------------

A [sound N] section of FF7_SpellExt_Effects.ini gives a script a sound that is not one of the game's 751:

    [sound 56780]
    name = ff8_fire_0         ; optional: letters, digits and _, not starting with a digit, 1-23 characters
    channel = 4             ; optional, 1-4 (default 4): the channel it plays on
    volume = 100            ; reserved for a later stage: a note in the log, ignored

N is the sound's file: <game>\sfx\N.ogg, which in a 7th Heaven mod is base\sfx\N.ogg (restart the game
after adding a NEW file; a changed file is read at its next play). The sound is played by FFNx, so it
needs FFNx with `use_external_sfx = true` in FFNx.toml (7th Heaven's default). Without it a handle plays
nothing (the log says so once) and the rest of the effect plays.

The number. FFNx reads one value of the game's 751-entry sound table for every sound it plays (whether
the sound loops), with no check of the number. For N in 53848-58089 that value lies in the exe's
read-only resources, which never change; the DLL takes a number only where it is 0 (a sound that does not
loop) and where the size before it is at most 0x20000 (so the game's own player could never pass it to its
big-sound routine), and checks both again at each play. 2,767 numbers qualify; the longest runs:
    56780-57181, 54841-55228, 54376-54484, 53900-54005, 57742-57841, 57256-57349
56780-56999 are kept for the FF8 port (ff8_fire_0 56780, ff8_fira_0 56781, ff8_firaga_0 56782); take others
from the other runs. A number outside them is refused, and the log names the runs. Numbers 1-751 are
the game's own: a script plays them by number with no section.

A name must be unique (any case): two handles with one name are both refused, as are two sections with
one number.

The channel. A sound on a channel stops whatever played on that channel before, and is stopped by the
next sound there: the game's own effect sounds use channel 1 (kind 0x20) and a few long ones channels 1-4
(Super Nova: 1 and 2). each=K plays the handle once per target on the same channel, so each new one cuts
the last if it is still playing.

Pan and volume are FFNx's. FFNx centres every external sound while `external_sfx_always_centered = true`
(the DLL passes the pan all the same); the volume is the game's SFX slider (`external_sfx_volume = -1`).
FFNx's sfx\config.toml applies to handles as to the game's sounds, by number: [56780] shuffle = [...],
loop = true, ... (read when the game starts). FFNx also tries battle_char_XX_N.ogg first (XX the caster's
character number in hex), so one handle may sound different per caster for free.

The log, at "Re-init .ini files" and at the start:
    sound handle 56780 = ff8_fire_0: channel 4, file sfx\56780.ogg
    sound handles: 3, 3 usable (...); the channel player 00745160 is now a jump out of the game (FFNx's): handles play
and with each play (up to 40 lines a battle):
    sound handle 56780 = ff8_fire_0: channel 4, pan 64 (00745160 -> ...)
