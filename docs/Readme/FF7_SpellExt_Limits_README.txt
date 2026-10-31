FF7 SpellExt - limits file
==========================

File: FF7_SpellExt_Limits.ini, in the SpellExtConfig folder. Read once, when
the game starts, after the character file. Problems are reported in
FF7_SpellExt.log with the line number.

This file gives a NEW character (one defined in the character file) limit
breaks of its own. Each limit belongs to one character.

Limits are character specific because their animations are: a limit's
animation is made for one battle model's skeleton. Every limit here names a
`base`, one of the game's limits, and uses that limit's animation. Take
bases from the character whose battle model the new character uses
(`battle_like` in the character file).

A character with any section here has ONLY the limits defined here; it no
longer uses `limits = ...` from the character file for its list (that key
then only says whose thresholds to start from).


Sections
--------
[12]            The character's own settings.
[12 1-1]        One limit: character 12, limit level 1, first limit.
                Levels are 1-4, positions 1-3. The game's own characters use
                two limits at levels 1-3 and one at level 4.


The character's section
-----------------------
gauge           Four numbers, one per limit level: how slowly the gauge
                fills. Higher is slower. See the table below for the nine.


learn_all_on_load  yes = TESTING AID: whenever a save is loaded, every limit
                the character has in this file is marked learned, level 4
                included. A save made afterwards keeps them. Default: no.

full_gauge      yes = TESTING AID: the character starts every battle with a
                full limit gauge, and any damage taken fills it again.
                Default: no.

limit_item      The item that teaches the character's fourth-level limit
                (4-1), as Omnislash and the rest do for the game's nine:
                an unused item ID of the game's, 105 to 127. Used on the
                character in the Item menu, it teaches 4-1 once every other
                limit in this file is learned, and is used up. It cannot
                be used in battle.
                Every new character can have one of its own: each
                character's section names its own item ID, with its own
                name, description and lines. Two characters cannot name
                the same item ID (the second is refused, with a line in
                the log), and the ID must not be one the items file
                defines as a new item (refused, with a line in the log).
                A refused limit_item leaves the character without one:
                with learn_all_on_load, 4-1 is then learned on load.
                A character made with copy_of does not get the item of
                the one it copies. To have one it needs a section of
                its own here, and a copy with any section of its own no
                longer uses the limits and states of the one it copies:
                write its limits out in full as well ([13 1-1] to
                [13 4-1]), or the item can never be used.
                The item teaches 4-1 and nothing else: a character with
                a limit_item and no 4-1 limit in this file can never
                use it (a line in the log says so).
                While it is set, learn_all_on_load leaves 4-1 unlearned.
limit_item_name         its name in the item list (up to 24 characters)
limit_item_description  its description
limit_item_learned      what the character says on learning the limit,
limit_item_not_yet      with other limits still to learn (or 4-1 known),
limit_item_other        and when shown a limit item that is not its own:
                        one of the game's, or another new character's
                        (up to 33 characters each)
                These five are the character's own, whether or not it has
                an item (limit_item_other is also what a character
                without one says). Left out, they are: "Limit item",
                "Teaches a limit break", "I understand it now.",
                "I'm not ready for this yet.", "This isn't meant for me."
limit_item_on_load      yes = TESTING AID, for this character: whenever a
                save is loaded, its 4-1 is forgotten and one of its item
                is put in the stock (unless one is there already).
                Default: no.
                The game's characters shown any of these items answer
                with their own "not mine" lines.

The [test] section
------------------
Testing aids for the game's OWN characters, listed by ID (0 Cloud, 1 Barret,
2 Tifa, 3 Aeris, 4 Red XIII, 5 Yuffie, 6 Cait Sith, 7 Vincent, 8 Cid):
  learn_all_on_load = 0 2   they know all their limits whenever a save is loaded
  full_gauge = 0 2          they start every battle with a full limit gauge,
                            and any damage refills it
  first_limit_block = 7     (0 to 7) which block of the game's limit entries
                            is lent to new characters first; only for testing
                            the DLL itself
A save made afterwards keeps the limits learned. Remove the section when done.

limit_set       Which set of limits the character uses. A limit's section may
                carry a set name after its position: [12 1-1 barret]. Sections
                without one form the default set. With `limit_set = barret`
                only the sections tagged barret are read for this character;
                with `limit_set = default` (or no line) only the untagged ones.
                One set at a time; change the line and restart to switch.
                A save keeps which POSITIONS are learned, not which limits,
                so switching sets keeps the same positions learned.

A limit's section
-----------------
name            Up to 31 characters.
description     Up to 95 characters.
base            Required. One of the game's limits, by number (table below).
                Supplies the animation and everything not set here.
animation_pack  File name, without extension, of this limit's own animation
                pack: <name>.a00 anywhere under SpellExtConfig\files (name up
                to 8 characters). The pack is loaded into the character's
                model when the limit starts and fills its animation numbers
                0x2c onward (the first eight animations of the pack; a pack
                must hold at least 16, so pad with one-frame dummies as the
                game's own packs do). The limit's action script (scripts
                60-69 of the model's xxab file) then plays them, and must
                contain the `ec` command before it does: that is what loads
                the pack. The pack must be made for the same skeleton as the
                battle model. Default: the base limit's pack.
script          The limit's action script, as bytes in hexadecimal (the form
                tools/ab_tool.py shows): what the character does, in order.
                  script = e8 fc 00 e0 ea f4 19 f3 ec 2c e5 ee
                Up to 128 bytes. With this key the limit no longer depends on
                the model's script file: without it the game runs script
                60 + n of the model's xxab file, n being the limit's place
                among the character's limits (first = 60).
                Usual pieces: e8 start the effect, fc 00 face the target,
                e0 limit flash, ea show the name, f4 19 f3 wait, ec load
                the animation pack, 2c 2d ... play the pack's animations,
                f7 NN show the damage NN frames from now, fa return,
                e5 ee finish. A script that never finishes locks the battle.
followup_script For a limit whose base has a follow-up hit (Blade Beam's
                split beam): the script run for that hit. Without it the
                game runs a fixed script of the model's file for it (68 for
                Blade Beam's), which a model made from another character
                may not have. It applies to this limit only.
followup_chain  For a limit whose base has a follow-up hit: how many follow-ups
                run in a row, 1 to 6 (default 1, as the game). With 2, Blade
                Beam's split beam launches a second split beam after it.
                The first follow-up hits the enemies the limit did not. A
                later one comes only from the enemies the one before it
                actually HIT (none hit: the chain stops there), and hits
                every living enemy, except that when it comes from a single
                enemy it does not hit that one.
followup_strengths
                The strength of each follow-up in turn, 0-255:
                    followup_strengths = 16 8
                One not given is half the one before it (the first: the
                game's own, 16 for the split beam).
followup_chain_script
                The script of the LAST follow-up of a chain. Default: ec e5 ee
                (the effect step and the end), so the character does not
                repeat the first follow-up's animation. Follow-ups between the
                first and the last run ec f4 1a f3 e5 ee (the effect, a wait
                of 26 frames, the end). followup_script is the first's.
                In a chain, give followup_script a wait before its end, so
                the next follow-up starts after its effect and not at the
                same moment:
                    followup_script = ec 2d f4 08 f3 e5 ee
                Do not use 9e for this: it locked the battle when the
                follow-up missed.
effect_file     NAME:LOOSE. While this limit is carried out, the effect's request
                for the archive file NAME is answered with the loose file
                LOOSE from SpellExtConfig\files. For an effect that shows a
                model, to give it one of your own:
                    base        = 159            Cid's Dynamite
                    effect      = base
                    effect_file = KAYAKU.P:ZAEAFX
                An effect draws its models at a scale of its own (Dynamite's
                about 20 times), so the loose file must be the model made
                small: ZAEAFX is her grenade ZAEA at 0.06 of its size
                (tools\scale_model.py ZAEA ZAEAFX 0.06). KAYAKU.P is the
                stick in the hand; DYNAMITE.P is the blast.
                The log lists the files an effect asks for while a swap is
                set, which is how to find the right NAME.
                An effect loads its files once in a battle and keeps them, so
                if the game's own user of that effect and this limit are both
                used in one battle, both show whichever model came first.
prop            NAME. A model of the limit's own, shown at one of the character's
                bones while the limit's animation (the one from its
                animation_pack) plays: a rifle taken up for one limit, say.
                    prop        = ZAEB
                    prop_bone   = weapon_hand
                    prop_offset = 12 -51 -54
                The model is two files, NAME.RSD and NAME.P, in the mod's
                base\magic folder beside the .a00 packs (without FFNx: anywhere
                under SpellExtConfig\files). NAME is 1 to 8 letters, digits or
                _. The RSD is a six-line text file that names the model:
                    @RSD940102
                    PLY=ZAEB.PLY
                    MAT=ZAEB.MAT
                    GRP=ZAEB.GRP
                    # Number of TIM (Texture) Files
                    NTEX=0
                The .P is a model in the game's format made at battle size,
                as a weapon of a battle model is (tools\make_sniper.py): it is
                drawn at its own size. (An effect_file model, by contrast, is
                drawn by a game effect at that effect's scale and must be made
                small.)
                The prop starts at the effect step of the limit's OWN script,
                so that script must have ec, followed by an animation of the
                pack (2c ...). The ec of a follow-up hit's script does not
                start it. A limit whose script has no ec shows no prop, and
                the log says so when the character's next action begins.
                It does not change the limit's effect: one that is drawn at
                the character's weapon (Angermax's muzzle flashes, say) stays
                with the weapon, at the hip if the pack holsters it. It does
                nothing to the character's own weapon: where that is, in the
                hand or at the hip, is the pack's weapon animation (its second
                half), as in the limits that holster the pistol.
                It is shown while an animation of the pack plays (see
                prop_animation and prop_frames for less) and goes when the
                script returns to one of the model's own animations. It is
                not shown on frames where the character is not drawn.
                If a file is missing or anything else fails, the log says so
                in one line ("prop NAME: not loaded ...") and the limit runs
                without the prop. Up to 8 different props in one battle.
                none = no prop (the default).
                The five keys below place it and say when; they do nothing
                without prop. All of them are read again by "Re-init .ini
                files" and act the next time the limit is used, so a prop can
                be placed by eye without restarting: change a number, re-init,
                use the limit, look. (Only the model's files are not read
                again in the same battle.) Each use of the limit writes the
                numbers it was played with to the log:
                    prop ZAEB.RSD actor 0: placing: offset (12, -51, -54),
                    turn (0, 0, 0) degrees about X then Y then Z, scale
                    100.0%, frames all, animation any; the prop's place
                    (...), the bone's (...), (...) apart ...
prop_bone       Where the prop is shown:
                  weapon_hand  (default) the hand the character's weapon is in
                  other_hand   the other one
                  0-48         a bone of the battle model by its number, as
                               tools\anim_tool.py skeleton lists them
                With nothing else asked for, the prop's origin is on the
                bone's joint (for a hand: the wrist, not the palm) and its
                X, Y and Z axes are the bone's.
prop_offset     X Y Z. Three whole numbers, -5000 to 5000 (spaces or commas
                between them): where the prop's origin goes from the bone's
                joint, in model units, along the BONE's own X, Y and Z axes.
                So the same numbers hold it in the same place in the hand
                whichever way the character faces and however the arm moves.
                Default 0 0 0.
                    prop_offset = 12 -51 -54
                The bone's axes are not written anywhere handy; find them by
                trying one number at a time (30, say) and looking. For a hand
                that holds a gun made as the game's guns are (barrel toward
                -Z, top toward -Y), the hand's axes are close to the gun's:
                the third number, more negative, moves the prop forward toward
                the muzzle; the second, more negative, moves it up out of the
                top of the fist; the first moves it sideways through the hand.
prop_turn       X Y Z. Three whole numbers of degrees, -360 to 360: the prop
                is turned about the bone's X axis, then about the bone's Y,
                then about the bone's Z, each time about the prop's own origin
                (so a turn does not move the point that prop_offset placed).
                A positive turn about X carries +Y toward +Z, about Y carries
                +Z toward +X, about Z carries +X toward +Y. The order matters
                when more than one number is set: it is always X first, Z
                last, and the later turns are about the bone's axes, not about
                the prop's already turned ones. Default 0 0 0: the prop's axes
                are the bone's.
                For a gun as above: the first number, more, tips the muzzle
                down; the second, more, swings the muzzle toward -X; the third
                rolls it about its barrel.
prop_scale      N. The prop's size in per cent of the model's own, 1 to 700,
                with one decimal if wanted (87.5; a % sign may follow). It
                grows and shrinks about its own origin. Default 100.
prop_frames     FIRST-LAST. The frames of the animation, counted from 0, on
                which the prop is shown: it is in the hand from frame FIRST to
                frame LAST and not drawn before or after (drawn from behind
                the back at 18 and put away at 96, say).
                    prop_frames = 18-96
                  all      (default) every frame of the animation
                  18-      from 18 to the animation's end
                The numbers are those of the pack's animation itself, as
                tools\anim_tool.py counts its frames.
prop_animation  N. Which animation of the limit's pack the prop goes with, 0
                to 7 (0 = the pack's first, script byte 2c; 1 = 2d ...).
                  any      (default) every animation of the pack: the prop
                           stays through a second one that follows the first
                With a number, the prop is shown only while that animation
                plays (and prop_frames counts its frames); while another
                animation of the pack plays it is put away, and it comes back
                if its own is played again. In both cases one of the model's
                own animations after the prop has been shown ends it for this
                use of the limit.
                NOT THERE YET: letting go of the prop (a throw), and a blended
                (see-through or glowing) prop: it is always drawn solid.
state           NAME. Once the limit has been carried out, its user is in the
                state NAME for the rest of the battle: one of the character's
                own states, defined in a section [12 state NAME] of this file
                (anywhere in it). NAME is 1 to 15 letters, digits or _.
                    state = akimbo
                The state begins at the effect step of the limit's own script
                (ec), as a prop does. If the script has no ec, it begins when
                the character's next attack, magic, summon or limit is set up (not an item,
                Steal, Throw or Defend: those come and go first), and the log says so. A
                limit that is never carried out (no target left) begins
                nothing. Using the limit again while in the state changes
                nothing. If no section defines NAME the log says so in one
                line and the limit works without a state.
                none = no state (the default).

---- New part ----
States
------
A state is something a limit leaves its user in: "a pistol in each hand for
the rest of the battle". It belongs to the character, not to one limit and
not to a limit set: sections [12 state NAME] are read whatever `limit_set`
says, and several limits may name the same state. Up to 4 states for a
character. A character made with copy_of that has no sections of its own
here has the states of the one it copies, with its limits. "Re-init .ini
files" reads the states again; a state someone is already in during a battle
keeps the settings it began with until the battle ends.

A state lasts to the end of the battle, or until the character is knocked
out or turned into a frog if its `ends` says so. Nobody is in a state when a
battle starts.

What a state does:
  - it makes each of the character's attacks hit several times in quick
    succession, gives those attacks moves of their own, and sends them on
    when their target dies (hits, commands, retarget, the attack scripts);
  - it gives the character a standing pose of its own (idle_script);
  - it keeps a model at one of the character's bones for as long as it
    lasts: a second weapon in the other hand (prop);
  - it sends each attack at every enemy at once, with an element and a
    range of its own (attack_targets, attack_element, long_range);
  - it makes every physical hit on the character miss (physical_evade);
  - it replaces some of the model's scripts while it lasts: its
    reactions to being hit, its casting (script_NN);
  - it raises the battle's resting view while it lasts, so a body held
    up in the air stays in the picture (view_raise, view_back);
  - it raises the yellow pointer over the character when its command
    menu is open, so it stays above a body held up in the air
    (pointer_raise).
Every part is optional: a state may be only a pose, or only a prop.

Two words first. A TURN is one attack of an action: Attack has one turn,
2x-Cut two, 4x-Cut four, and each turn has its own target and plays one
script. A HIT is one roll for damage. Without a state a turn is one hit.

hits            N, 2 to 4. While the state lasts, each turn of one of the
                `commands` below hits N times instead of once, all N at
                that turn's one target, one straight after the other. The
                number of turns is the command's own. With hits = 2:
                    Attack   1 turn  of 2 hits = 2
                    2x-Cut   2 turns of 2 hits = 4
                    4x-Cut   4 turns of 2 hits = 8
                Each hit is a whole hit of its own: its own hit or miss,
                critical, damage and number, and the weapon's element and
                added effects every time. All the hits of a turn stay on
                the turn's target even if one of them kills it: a hit on a
                target that is already dead cannot miss, does its damage to
                nothing, and its number is shown over the dying target with
                no second flinch. A new target is only ever chosen per
                turn (retarget, below). Counter attacks, Mime, and attacks
                made while Berserk or Confused are the same commands and
                hit N times too. Default 1: no change to the hits. A state
                with hits = 1 still gives the listed attacks its attack
                scripts and its attack_targets, attack_element and
                long_range (until 2026-10-22 a state with hits = 1 played
                the model's own attack scripts).
                A turn gets its N hits only when it goes at ONE ENEMY:
                  - a command that picks one of several enemies for each
                    attack (4x-Cut) picks one per turn, and all N hits of
                    the turn go at that one;
                  - a turn at several targets at once (Slash-All, Flash)
                    and a turn aimed at the party's side are left as the
                    game has them, one hit each.
                While the character is a frog nothing is changed (with
                `ends = ... frog` the state is over by then).
                (Before 2026-10-13 `hits` multiplied the TURNS: with 2,
                Attack was two whole attacks and 4x-Cut eight, each with
                the game's pause between attacks. A section written then
                still loads; see "A section written for the older meaning"
                below.)
commands        Which battle commands `hits` applies to: a list of names
                (numbers are accepted too):
                    attack 2x_cut 4x_cut slash_all mug deathblow morph flash
                Default: attack 2x_cut 4x_cut.
                Mug, Deathblow and Morph are one turn at one target and
                hit N times with their own script (the script keys below
                are for Attack, 2x-Cut and 4x-Cut only); they have not
                been tried in the game yet, which is why they are not in
                the default. Slash-All and Flash go at several targets at
                once and are left as the game has them even when listed.
retarget        yes or no. Default yes. A turn after the first whose
                target has died (killed in an earlier turn of the same
                action) goes to another living enemy, chosen at random among
                those the character can reach; the turns after it stay on
                the new one. For a command that picks among several
                (4x-Cut) the dead are taken out of the choice. A turn
                aimed at the party's side (by choice, or while Confused) is
                never moved. The first turn always goes where it was aimed.
                With no enemy left for a turn the action ends there: the
                turn before becomes the closing one (the character lowers
                the weapon and goes back), and nothing more is played; see
                stop_step.
                no = every turn goes where the game sends it, dead target or
                not, and the action is never cut short.
limit_gauge     normal or frozen. Default normal. frozen: the character's limit
                gauge does not fill while the state lasts (damage taken adds
                nothing), so the Limit command does not come back; it fills
                again from where it stood when the state ends.
                    limit_gauge = frozen
camera          keep, none or a battle camera number. Default keep. The camera
                for the state's attacks. keep: each command's own (Attack has
                none; 2x-Cut and 4x-Cut have the game's, made for single
                strikes). none: no camera movement. A number: that camera, for
                instance one of your own from SpellExtConfig\cameras.
                    camera = none
stop_step       yes or no. Default no. What follows when an action is cut
                short because no enemy is left for its next turn.
                no  = nothing: the action ends with the turns made, as an
                      action of that many turns ends.
                yes = the game's own short "nothing to hit" step forward
                      and back is played after them, as for an attack that
                      finds no target. It no longer cuts the action's
                      camera off (2x-Cut's and 4x-Cut's own camera goes on
                      through it).
attack_script, attack_script_next, attack_script_last, attack_script_only
                What the character does in Attack, 2x-Cut and 4x-Cut while
                the state lasts: scripts in hex bytes, written like a
                limit's `script` (up to 48 bytes each). ONE SCRIPT IS ONE
                TURN, and shows all N hits of that turn.
                    attack_script_only   the whole move of an action of one
                                         turn (Attack): out, strike N
                                         times, home
                    attack_script        the first turn of an action of
                                         several turns (2x-Cut, 4x-Cut)
                    attack_script_next   each turn between
                    attack_script_last   the last turn
                2x-Cut plays first, last; 4x-Cut plays first, next, next,
                last. attack_script_next left out is the same as
                attack_script; attack_script_last left out is the same as
                attack_script_next. Without attack_script the other two are
                not used and 2x-Cut and 4x-Cut play the model's own scripts
                (22, 23 and 24 to 27 of its xxab file). Without
                attack_script_only, Attack plays the model's own Attack
                script (20). The model's own scripts work too: see hit_gap.
                    attack_script_only = f9 03 ed fc f7 06 1e 1f f7 00 1f 20 f9 04 fa e5 ee
                    attack_script      = f9 03 ed fc f7 06 1e 1f f7 00 1f 9e
                    attack_script_next = fc f7 00 1f f7 00 1f 9e
                    attack_script_last = fc f7 00 1f f7 00 1f 20 f9 04 fa e5 ee
                Showing the hits: f7 NN ("show the result NN frames from
                now") shows the NEXT hit of the turn that has not been
                shown yet: the first f7 of a script shows the first hit, the
                second f7 the second. So a script times each number to its
                strike: f7 00 before each strike's animation, as above. An
                f7 with no hit left shows nothing. Each hit shows its own
                number and the target's own reaction to it (a dodge for a
                miss, a flinch for a hit); the target dies at the hit that
                killed it.
                The first and the between scripts should end with 9e (wait
                for the target and the effects, stay where you stand) and
                not go home; the last and the only one go home and end with
                ee (fa e5 ee). A script that does not end itself is stopped
                after its last byte, and the log says so when the file is
                read. Every script must have at least one f7: a turn whose
                script has none is never shown, as with any attack script.
                An animation byte plays the whole animation and the script
                goes on when it has ended; there is no command to play part
                of one, so two strikes in one turn are two animations one
                after the other (or one animation made with two strikes in
                it, and the two f7 timed into it: f7 00 f7 05 1f shows the
                second number 5 frames after the first).
                The easiest way to write them is from the model's own
                Attack and 4x-Cut scripts (ab_tool.py dump): the only script
                is the Attack script with a second "f7 00 <strike>"; the
                first is the 4x-Cut's first with the same added, a between
                one its second, the last its fourth.
                The state's scripts are used for a turn at one target and
                not while the character is a frog. While one of these
                attacks is being shown, the model's scripts 24 to 27 (its
                four 4x-Cut scripts) are lent to the state's only, first,
                next and last; they are the model's own again before any
                other action begins.
hit_gap         Frames, 1 to 60. Default 6. A hit of a turn that the script
                has not shown this many frames after the hit before it is
                shown anyway, without an f7. This is what makes a script
                with ONE f7 work: the model's own Attack script, or a
                state's script written for one hit, shows the first hit at
                its f7 and the others hit_gap frames apart, on the one
                strike. It also means no hit of a turn is ever left
                unshown once the first has been shown. If a script has its
                own f7 for every hit, set hit_gap longer than the time
                between them (hit_gap = 20 for two strikes of 10 frames),
                or the gap shows a hit before the script's f7 does. The
                count stands still while the game is paused; it may be a
                frame longer than asked.
ends            When the state ends: a list of
                    battle   with the battle. Always, named or not.
                    ko       when the character is knocked out
                    frog     when the character is turned into a frog
                    ends = battle ko frog
                Default: battle. The state ends on the frame the knock-out
                (or the frog) is SHOWN on the character, not when the blow
                was worked out, so nothing changes before the blow is seen.
                When it ends, everything the state gave goes at once: the
                prop is no longer drawn, the model's own standing pose is
                back, the attacks are the game's again (hits, scripts), and
                the log has one line with the reason. Reviving or curing
                the character does not bring the state back: the limit
                does. Without frog in the list a frog stays in the state:
                its attacks are left as the game has them while it is a
                frog, its prop is not drawn (a frog is another model), and
                all is as before when it is cured. Without ko a knocked-out
                character keeps the state: when revived it stands in the
                state's pose again, and the prop follows the hand of the
                body on the ground unless `prop_hide = dead`.
                (limit: "until the character's next limit" is not built; it
                is refused with a line in the log.)
attack_script_next2
                A second script for the turns BETWEEN the first and the last: with
                it, those turns alternate attack_script_next, attack_script_next2,
                next, next2 ... (a 4x-Cut plays first, next, next2, last). Used
                only when attack_script is given and the action has four turns or
                more; a 2x-Cut plays first and last. It is lent in the slot the
                one-turn script uses, so while it is lent a burst that runs out of
                enemies after its FIRST turn is closed by attack_script_last, not by
                attack_script_only.
                    attack_script_next2 = fc f7 04 f7 05 2f 9e
idle_script     What the character does while it stands in the state: a
                script in hex bytes, up to 16, in place of the model's own
                idle script.
                    idle_script = 0b fe c0
                = play the model's animation 0x0b and loop. `NN fe c0` is
                the form of every idle of the game: the animation's number
                FIRST, then fe c0 (loop). A looping script is started again
                from its first byte AS ITS ANIMATION, so do not put a
                command before the animation (the log says so if you do).
                Default: none, the model's own idle.
                Everything that takes the standing pose over goes on doing
                so, and gives it back to the state's idle afterwards:
                Defend, running (both run buttons held), the victory and
                escape poses, being knocked out, being a frog (another
                model: its own idle), and after every action the character
                returns to the state's idle. Haste, Slow, Stop and
                Paralysis change the pace of whatever animation is shown,
                as always.
idle_weak_script  The standing pose near death (less than a quarter of the
                HP) and under Sleep, Poison, Silence, Death Sentence,
                Paralysis or Darkness: the game's "weak" idle (the kneeling
                one). Default: THE SAME AS idle_script, so a state with an
                idle has no separate weak pose: the character stands in the
                state's pose however hurt it is. Give it to have one:
                    idle_weak_script = 01 fe c0
                is the model's own kneeling animation again. A state with
                only idle_weak_script changes only the weak pose.
prop            A model that stays with the character while the state lasts,
                drawn at one of its bones every frame: NAME (the files
                NAME.RSD and NAME.P in the mod's magic folder, exactly as a
                limit's `prop`), or
                    prop = weapon
                = the model of the weapon the character has equipped, as a
                second copy. The game loads only the equipped weapon's
                model, from the model's own weapon file (letters C K to
                C Z after the model's two: ZACK ... ZACZ), and that loaded
                model cannot be drawn twice; so the copy is a file of the
                same name in the magic folder: ZACK.RSD and ZACK.P for
                weapon model 0, and so on. The tool
                    make_weapon_props.py BATTLE_FOLDER ZA OUT_FOLDER
                (in tools\work\akimbo\stageC)
                writes them all from the model's battle files (and, for a
                textured weapon model, the RSD's texture lines and a copy of
                the texture). Put them in the magic folder of the SAME mod
                folder the battle model is in (model_standard\magic beside
                model_standard\battle), so that a 7th Heaven option that
                swaps the model swaps the props with it. A file that is
                missing or does not load: one line in the log, and the
                state works without the prop.
                none = no prop (the default).
prop_bone       weapon_hand, other_hand, or a bone's number. Default for a
                state: other_hand (the hand that holds no weapon).
prop_offset, prop_turn, prop_scale
                As for a limit's prop: the prop's place from the bone's
                joint along the bone's own X, Y, Z; the turn about them in
                degrees; the size in per cent.
                    prop_offset = -11 -58 -52
                    prop_turn   = 0 0 0
                    prop_scale  = 100
                There is no prop_frames or prop_animation for a state: its
                prop is there for as long as the state lasts.
prop_colour     body or own. Default body: the prop is drawn with the colour
                and transparency the game gives the character's body at that
                moment (the pulse of Poison, Berserk, Regen, Darkness, the
                grey of Petrify, a fade), so that it does not stand out in
                its hand. own = always its own colours, exactly as a limit's
                prop is drawn. (body has not been seen in the game yet: if a
                coloured prop looks wrong, use own.)
prop_hide       When the prop is NOT drawn although the state lasts: none
                (the default: it follows the bone through everything), or a
                list of
                    dead      while the character is knocked out
                    victory   in the victory pose
                    escape    while running away, and once escaped
                    limit     while an animation of a limit's own pack is
                              shown (any limit of the character's)
                    prop_hide = victory
                It is never drawn while the character is a frog, while its
                body is hidden (summons, some limits) or is not drawn at
                all, and it is drawn small with a character under Mini. A
                poisoned, petrified or darkened character's colour and a
                fading one's transparency are handed to the prop's draw (see
                prop_colour).
                THE LIMIT'S OWN PROP AND THE STATE'S. The limit that begins
                the state may have a `prop` of its own at the same bone (the
                second weapon being drawn from its holster, by prop_frames).
                While that limit's prop is there the state's is not drawn;
                on the frame the limit's animation is over the state's prop
                takes its place: never two, and none only on the frames the
                limit itself shows none. With the same model and the same
                offset, turn and scale in both there is no jump. A limit
                with no prop at that bone: the state's prop is drawn from
                the limit's effect step (ec) on. Any later limit of the
                character's with a prop at that bone hides the state's the
                same way while its own is there.
                While the game is paused the prop stays where it was.

attack_targets  as_chosen or all_enemies. Default as_chosen: the attack goes
                at the targets it was given. all_enemies: each turn of a
                listed attack goes at EVERY living enemy it can be aimed at,
                as one record with one animation (the game's own way for
                Slash-All): the one-turn script (attack_script_only, or the
                model's own Attack) plays once and its f7 shows every
                enemy's number, one frame apart. The enemies are counted
                again at each turn: the dead and those out of reach (below)
                are left out; nobody left after a first turn ends the
                action. It goes only with hits = 1 (with more, the line is
                ignored and the log says so) and only to Attack, 2x-Cut and
                4x-Cut; an attack aimed at the party's side (Confusion,
                Manipulate) is left as the game has it.
                The game's rule for several targets applies: each enemy
                takes 2/3 of the damage one target would (FUN_005de8f4), as
                with Slash-All or a spell cast on all.
                A script with a 9e in it waits for THE target to finish,
                and a record at several targets has none: so an action
                whose script has a byte 9e anywhere (the model's own 2x-Cut
                and 4x-Cut scripts end in one) keeps its own targets, and
                the log says "every enemy NOT applied". End the state's
                scripts with e5 ee:
                    attack_targets     = all_enemies
                    attack_script_only = fc 29 2a 2a f7 04 2b e5 ee
                In the battle menu, the target cursor of an attack that
                will go at every enemy sits on EVERY enemy at once, as for
                Slash-All or a spell cast on all: there is no single target
                to choose, no switch to the party's side and no L1/R1
                toggle (with Mega-All too); the confirm button issues it.
                It shows the enemies the attack can reach: every one that
                can be aimed at, or only those no other stands in front of
                when the attack stays short range (no long_range and a
                short-range weapon). With every enemy hidden the confirm
                button only buzzes, as for a spell on all: choose another
                command. An attack that keeps its own targets (a 9e, above;
                a command not listed; a frog) keeps the game's cursor.
attack_element  weapon, or element words as a spell's `element` (fire, ice,
                lightning, earth, poison, gravity, water, wind, holy,
                restorative, cut, hit, punch, shoot, shout, hidden; several
                together; none = no element). Default weapon: the weapon's
                element and the Elemental materia's, as always. Anything
                else REPLACES both for the listed attacks while the state
                lasts:
                    attack_element = hidden
                An element without cut, hit and punch also frees the
                attack from the reach rule (enemies flying out of a short
                weapon's reach can be hit).
long_range      yes or no. Default no. yes: the listed attacks are long
                range: no damage halving for a back row (the attacker's or
                the target's), and enemies standing behind others can be
                aimed at (the short-range bit of the weapon's targeting is
                taken off). The reach rule for flying enemies is the Long
                Range materia's and the element's (above), not this key's.
physical_evade  normal or 100. Default normal. 100: while the state lasts
                EVERY physical hit on the character misses: a weapon-type
                hit, the enemies' and a confused ally's alike, whatever the
                attacker's luck, the character's status or the element (the
                game's physical hit check is answered with its own miss for
                the character). Magic, and the attacks that never roll to
                hit (fixed-damage and "always hits" specials), hit as
                always. A miss plays the character's own miss reaction
                (its dodge, script 08). Not while the character
                is a frog. A party member covering the character is hit by
                the usual rule.
                    physical_evade = 100
script_NN       While the state lasts, the character's model script NN (two
                hexadecimal digits) is replaced by these bytes, as idle_script
                replaces script 00. A reaction is a model script: 05 hurt,
                06 hurt while defending, 07 the knock-out fall, 08 the dodge,
                0a the big recoil, 0b the two-part recoil; casting is a
                model script too: 1d Magic and W-Magic, 1e Enemy Skill, 1f
                Summon, 20 and 21 Item (20 at the party's side, 21 at the
                enemies'), 21 also Throw and Coin; 13 is the Defend pose,
                03 / 04 the row change, 10 an interrupted cast (ab_tool.py
                dump lists the model's own). Up to 16 lines a state, up to
                32 bytes each; a later line for the same NN replaces it:
                    script_05 = 22 f2 e5 ee
                    script_08 = 23 e5 ee
                    script_07 = 25 f2 e5 ee
                    script_1d = e8 fc e6 ea 29 2a 2a ec 2d 2d 2d 2d 2d e5 ee
                (the hurt, the dodge and the fall played from animations
                0x22, 0x23, 0x25; Magic as a wind-up, a hold twice, the
                spell's effect step ec, then animation 0x2d five times while
                the spell plays.) Not taken: 00 and 01 (idle_script,
                idle_weak_script), 18 to 1b (the attack scripts' slots),
                2e-32 and 34-3b (the game takes those from its exe for every
                model), 33 and 3c up (the limits and transformations).
                A script that the battle waits for (every one but 02, 0c,
                0d, 0e and 13, the standing poses) must END: one that ends
                in fe c0 is refused, because it would never say it has
                finished and the battle would wait for ever. A long one is
                safe: the action is over when the effect has finished AND
                the character has, whichever is later. Like idle_script, a
                script that loops (fe c0) is started again from its first
                byte as its animation's number.
                The scripts are lent when the state begins and given back
                when it ends; a script the character is playing at that
                moment (the knock-out fall that ends the state with
                `ends = ko`) plays to its end first, and only then is the
                model's own put back. Animations 0x2c-0x33 are the loaded
                limit pack's: a script that names them needs that pack
                still loaded (a state with limit_gauge = frozen keeps it).
view_raise      0 to 6000. Default 0. While the character is in the state,
                the battle's RESTING view (between actions, the command
                menu, choosing a target: the scene's own camera, wherever
                the game shows it) is raised by this many units, the point
                it looks at with it: a body held up in the air (an idle
                whose animation lifts the root) stays in the picture. The
                cameras of actions (attacks, spells, limits, the enemies')
                are their own, except that their first moments carry the
                fading lift: the view glides from the raised one into an
                action's camera and back, a fifth of the way each frame
                (gone after about 37 frames), so nothing jumps. Several
                characters in such states: the largest value. The view is the game's again
                while the character is knocked out, a frog, in the victory
                or escape pose, and after the state ends (it glides back
                down). FFNx's analogue camera (the right stick) works as
                before, on top of the raised view. A battle model stands
                about 1,300 to 1,800 units tall; a scene's camera stands
                about 12,000 to 17,000 units from the point it looks at.
                    view_raise = 800
view_back       0 to 100 (a % may follow). Default 0. With view_raise or
                alone: the resting view also moves this many per cent
                farther back from the point it looks at, so the floor and
                the enemies' feet stay in the picture when it is raised.
                    view_back = 20
pointer_raise   0 to 6000. Default 0. While the character is in the state,
                the yellow pyramid that turns over it when its command menu
                is open is this many units higher. The game puts the
                pyramid at a fixed height for each model (from the model's
                own data), not at its head, so a body held up by its
                animations would have it below or inside it: give the same
                number of units as the animations lift the body. It is at
                the game's height again while the character is knocked
                out, a frog, in the victory or escape pose, and when the
                state ends. The target hand (when the character is chosen
                as a target) and the damage numbers follow the body's bones
                and need nothing; the status marks over the head (sleep,
                silence, a countdown) are not moved.
                    pointer_raise = 1563

A section written for the older meaning (hits = 2 and three scripts, each
with one f7) still loads and gives the same numbers of hits: Attack 2, 2x-Cut
4, 4x-Cut 8. Attack plays the model's own Attack script once (there is no
attack_script_only) and shows its two numbers 6 frames apart on the one
strike; 2x-Cut plays the first and the last script, 4x-Cut first, next, next,
last, each showing its turn's two numbers 6 frames apart on its one strike.
To see a strike for each hit, give each script a second "f7 00 <strike>" and
add attack_script_only, as in the example above.

In the log: per state when the file is read, one line ("character 12 state
akimbo (line 83): 2 hits a turn on attack 2x_cut 4x_cut ..., ends: battle ko
frog, retarget yes, hit gap 20, stop step no, attack scripts its own (first
7 bytes, next 7, last 8; one turn: only, 8 bytes); entered by limit 1-3"),
one for its prop ("... prop = the equipped weapon's model file at the other
hand, not drawn when: victory (and always: frog, body hidden, a limit's own
prop at that bone); offset (-11, -58, -52), ...") and one for its idle; at
start-up,
four lines "limit states: ..." that say whether the four places the state
works through are followed (if the per-turn call, the record's call or the
f7 task's call is not, states are entered but change nothing; if only the
no-target call is not, an action cut short ends with the game's empty step
and its camera cut). In a battle: "state akimbo actor 0: ON ..." when it
begins; then one line for each attack it changes:
    state akimbo actor 0: command 19 (2x_cut): 2 turns of 2 hits, scripts
    0x16 -> the state's first, next, last in slots 0x19 0x1a 0x1b, targets
    0010, flags 1000, retarget yes
(targets as bits: 0010 is the first enemy) and one more line only when
something was changed on the way: a turn was moved ("turn 2 of 2 re-aimed,
its target was dead: 0010 -> 0040"), the dead were taken out of a random
choice, a command's turns were held to one target each ("each turn's 2 hits
go at ONE of its targets, picked per turn ..."), a turn was left with one hit
("goes at several targets at once", "is aimed at the party's side"), a hit
was shown by hit_gap and not by an f7 (said once an action), or the action
was cut short ("no target left: stopped after 1 of 2 turns (the last
record's script 0x19 -> 0x18); nothing follows (stop_step = no)"). At most 40
such lines a battle, then one line that says so; "cleared" when the next
battle starts. Each hit also has its own "hit: actor ..." line, as every
attack has.
What stays with the character says, when the state begins: "idle lent ...:
slot 0 the state's idle_script (3 bytes, was ...), slot 1 the state's ...";
"prop ZACK.RSD = weapon model 0 of "NEWCH12.DAT" (group ...) at the other
hand: offset ..." (after the prop's own loading lines, the same as a limit's
prop writes; or one line saying why there is no prop); "task started in slot
N of the list of 60 ...". Then: "prop ZACK.RSD first drawn at frame 1 of the
state: bone entry 42 of 47, bone place (...), the prop's (...) ..." once; one
line each time the prop stops being drawn, with the reason ("not drawn: a
limit's own prop is at the same bone", "the actor is shown as a frog",
"prop_hide = victory" ...) and one when it is shown again, at most 30 a
battle; a count every 600 frames, six times at most. When the state ends
early: "state akimbo actor 0: ENDED: knocked out (ends = ko), as it was
shown (frame 812 of the state); its prop ZACK.RSD was drawn on 800 of 812
frames; idle slots 0 1 put back; attack script slots not lent; the actor's
attacks are the game's again".
The keys attack_targets, attack_element, long_range, physical_evade,
script_NN, view_raise, view_back and pointer_raise, when a state has any: one
line when the file is read
("character 13 state aloft: attack_targets all_enemies, attack_element 8000,
long_range, physical_evade 100, scripts lent: 05 07 08 0a 1d"), the same
after "ON" when it begins, "scripts lent (the state is entered): slots 05 07
08 0a 1d", and on each attack's line what was changed ("; every enemy each
turn (target flags 23 -> 27); element 2001 -> 8000; long range (short-range
bit 0x20 cleared)", then "turn 1 of 1 goes at every living enemy: 0010 ->
00f0"). The first physical hit it makes miss in a battle: "state aloft actor
1: physical_evade: a physical hit on it by actor 4 is a miss (said once a
battle)". At start-up: "limit states: the physical hit check (hit-step table
entry 007b77a8 -> 005ddbb0) is followed" and "limit states: the battle
menu's target set-up (006d95ba, 006d95fe -> 006e5c52) is followed". The first
time in a battle the menu aims such an attack: "state aloft actor 1: the
battle menu's target cursor for attack is every enemy (target flags 23 -> 26,
the pool every enemy, not only the uncovered): the attack goes at every
enemy". With view_raise or view_back, when the state begins: "state aloft
actor 1: view_raise 800, view_back 20%: the battle's home view is lifted while
the actor stands in the state (the camera's build at 0041bda4 is followed)",
then at most 20 lines a battle: "home view: lifting (view_raise 800,
view_back 20%): the game shows its home view (camera -1)", "home view: lifted
whole ...", "home view: the game's own again ...". With pointer_raise, when
the state begins: "state aloft actor 1: pointer_raise 1563: the pointer over
the acting actor is raised while the actor stands in the state ...", then at
most 12 lines a battle: "pointer raised 1563 units (its height -200 ->
-1763)", "pointer at the game's height again (-200): the state ended" (or
"... the actor does not stand in the state"), "the game wrote the pointer's
height again ...: taken as its own" (the model was loaded again). When the state ends, the ENDED
line says "scripts put back: ..." and "; when the actor no longer plays it:
07" for a script still playing, then "the script slots it was playing at the
state's end are put back".
The SpellExt screen's limit page shows "state" in the More column of a limit
that has one.
effect          The visual effect (game code, one routine per limit):
                  base  (default) the base limit's
                  none  no effect
                  128-183  another game limit's, by number
                Effects were written around their own character's model, so
                `none` is the safe choice on a different skeleton.
kills           For the FIRST limit of level 2 and of level 3: total kills
                by the character that teach it.
uses            For the SECOND and THIRD limits of levels 1-3: uses of that
                level's first limit that teach it.
learned         yes = the character has it from the moment it is created.
                Default: only limit 1-1.

A level 4 limit has no kills or uses rule in the game (the nine learn theirs
from an item). Give it `learned = yes`, or leave it out for now.

Any attack key from the spell file also works here, with the same meaning,
and overrides the base limit's value:
    strength  element  target  status  status_mode  status_chance  special
    accuracy  damage_formula  mp  animation  byte_XX  word_XX  ...
See FF7_SpellExt_Spells_README.txt.


The game's limits (for `base`)
------------------------------
level-position  number  name;  then that character's kills, uses and gauge
  Cloud     1-1 128 Braver; 1-2 129 Cross-slash; 2-1 130 Blade Beam; 2-2 131 Climhazzard; 3-1 132 Meteorain; 3-2 133 Finishing Touch; 4-1 134 Omnislash
            kills [120, 320]  uses [8, 65535, 7, 65535, 6, 65535]  gauge [140, 324, 435, 506]
  Barret    1-1 135 Big Shot; 1-2 137 Mindblow; 2-1 136 Grenade Bomb; 2-2 138 Hammerblow; 3-1 139 Satellite Beam; 3-2 140 Ungarmax; 4-1 141 Catastrophe
            kills [80, 160]  uses [9, 65535, 8, 65535, 6, 65535]  gauge [129, 240, 374, 450]
  Tifa      1-1 149 Beat Rush; 1-2 150 Somersault; 2-1 151 Waterkick; 2-2 152 Meteodrive; 3-1 153 Dolphin Blow; 3-2 154 Meteor Strike; 4-1 155 Final Heaven
            kills [96, 192]  uses [9, 65535, 7, 65535, 6, 65535]  gauge [120, 334, 509, 566]
  Aeris     1-1 142 Healing Wind; 1-2 143 Seal Evil; 2-1 144 Breath of the Earth; 2-2 145 Fury Brand; 3-1 146 Planet Protector; 3-2 147 Pulse of Life; 4-1 148 Great Gospel
            kills [80, 160]  uses [8, 65535, 6, 65535, 5, 65535]  gauge [200, 284, 322, 436]
  Red XIII  1-1 163 Sled Fang; 1-2 167 Lunatic High; 2-1 165 Blood Fang; 2-2 166 Stardust Ray; 3-1 164 Howling Moon; 3-2 168 Earth Rave; 4-1 169 Cosmo Memory
            kills [72, 144]  uses [8, 65535, 7, 65535, 6, 65535]  gauge [195, 300, 389, 486]
  Yuffie    1-1 177 Greased Lightning; 1-2 178 Clear Tranquil; 2-1 179 Landscaper; 2-2 180 Bloodfest; 3-1 181 Gauntlet; 3-2 182 Doom of the Living; 4-1 183 All Creation
            kills [64, 128]  uses [8, 65535, 7, 65535, 6, 65535]  gauge [200, 300, 400, 480]
  Cait Sith 1-1 170 Dice; 2-1 172 Slots
            kills [40, 65535]  uses [65535, 65535, 65535, 65535, 65535, 65535]  gauge [160, 180, 9590, 12760]
  Vincent   1-1 173 Galian Beast; 2-1 174 Death Gigas; 3-1 175 Hellmasker; 4-1 176 Chaos
            kills [40, 96]  uses [65535, 65535, 65535, 65535, 65535, 65535]  gauge [202, 244, 319, 426]
  Cid       1-1 156 Boost Jump; 1-2 159 Dynamite; 2-1 158 Hyper Jump; 2-2 157 Dragon; 3-1 160 Dragon Dive; 3-2 161 Big Brawl; 4-1 162 Highwind
            kills [60, 136]  uses [7, 65535, 6, 65535, 5, 65535]  gauge [200, 280, 380, 480]

Others in the table (transformation attacks and Cait Sith's slot results):
  184 Transform, 185 Mog Dance, 186 Toy Soldier, 187 Lucky Girl,
  188 Death Joker, 189 Game Over, 190 Berserk Dance, 191 Beast Flare,
  192 Gigadunk, 193 Livewire, 194 Splattercombo, 195 Nightmare,
  196 Chaos Saber, 197 Satan Slam

kills = [level 2, level 3].  uses = [1-2, 1-3, 2-2, 2-3, 3-2, 3-3]; 65535
means "never".  gauge = levels 1-4.


Known limits
------------
- Twelve limits per new character (four levels of three); no total across
  characters.
- Animations are always an existing limit's.
- Vincent's limits are transformations into other models; using them as a
  base for a new character has not been tried.
- A character already stored in a save keeps the limits it had learned.
  Changing this file changes what those learned slots contain.


A limit made of spell effects
-----------------------------
A limit normally has one visual effect (effect = base, none, or another
limit's). It can instead run a SPELL's effect for each of its hits:

    additional_effect   = 0          several hits
    additional_modifier = 3          three of them
    effect        = none
    spell_effects = 0x1b:41, 0x1e:65, 0x21:105
    hit_elements  = fire, ice, lightning

spell_effects   Up to 24 of  animation:frame , one for each hit in order
                (an older DLL takes 8).
                animation is a magic animation number as in the spell file
                (0x1b Fire, 0x1e Ice, 0x21 Bolt ...; enemy attack effects
                are scene effect + 0x4e). frame counts from the limit's
                effect step (the ec in its script), which is frame 0 of the
                animation the script plays next. Each effect is shown on its
                hit's own target and shows that hit's damage.
hit_elements    Up to 24 element sets separated by commas, one for each
                hit: its element in place of the limit's own. The last one
                is used for any hits beyond the list.
                    hit_elements = fire, ice lightning, none
An entry of spell_effects may also be written with these words:
    limit N:frame     a game LIMIT's effect, not a spell's (N = the limit's
                      number, 128-183, as for `base`)
    ... all           after an entry: the effect is shown once on ALL the
                      limit's targets (a party-wide limit), not on one hit's
                      target. The effect shows the result itself.
    ... visual        after an entry: for show only. The result (damage,
                      statuses) is not shown by this effect. Use it when two
                      effects go on the same targets, so only one shows it.
    ... skip N        after an entry: the effect starts N frames in (0-255).
                      Some effects show nothing at first, waiting for their
                      own character's animation: Clear Tranquil's water comes
                      60 frames after it starts, so `skip 59` brings it on at
                      once. Only for effects that need it.
    spell_effects = limit 178:34 all visual skip 59, 0x0f:97 all
        Clear Tranquil's effect on the party at frame 34 for show, Barrier's
        at frame 97, which shows the limit's result.
    effect N:frame    a NATIVE effect: an [effect N] section of
                      FF7_SpellExt_Effects.ini with `play =` (a script of
                      the effect player, FF7_SpellExt_EffectsPlayer_README.txt;
                      N = 0x100 up). It plays as it does for a spell: the
                      limit's camera, if one of your own with a [roll] or
                      engine = ff8, on the effect's frames (an engine = ff8
                      camera with clock = action plays on the limit's own
                      clock instead, from its effect step through every
                      step, and does not start over at each native effect:
                      FF7_SpellExt_Cameras_README.txt); its stage and
                      actors lines, sounds and pictures; and its `hit` lines
                      show the limit's results (each target once; one not hit
                      when it ends is hit then). Takes `all`, not `visual` or
                      `skip`.
    spell_effects = effect 0x28f:0 all
        Native effect 0x28f on all the limit's targets from the effect step
        (frame 0): one hit on every target, shown at the script's hit frame.
    hit:frame         a BARE HIT: no effect at all. At its frame the entry's
                      own hit (the Nth entry shows the Nth hit, on that hit's
                      target) is shown as an effect shows it: the damage number,
                      the target's reaction, and the limit's impact_effect /
                      impact_sound if it has them (all read from the code, not
                      yet seen in the game). Nothing after it (no all, visual
                      or skip). A hit with no target (fewer hits than entries)
                      is passed over, with a line in the log.
    spell_effects = effect 0x290:29, hit:39, hit:47, hit:55
        Native effect 0x290 from frame 29 shows hit 1 (its hit line); hits 2,
        3 and 4 are shown at frames 39, 47 and 55 while it plays on. Use bare
        hits for the hits of a flurry that one long effect draws: a second
        native effect would end the first, and a game effect would draw its
        own flash over it.
Effects may overlap or start on the same frame. Only one NATIVE effect plays
at a time: a second `effect` entry that starts while the first still plays
ends the first (its hits are shown then).
A limit of more than eight entries (read from the code, not yet seen in the
game):
- At most eight entries start in one frame; the rest start on the next frames,
  eight a frame (one line in the log). The game keeps at most 15 hits waiting
  to be shown between two frames.
- An entry from the ninth on also waits for the next frame while eight hits or
  more may still be shown in this one (those already waiting, and the hits
  still to come of this limit's one-target spell and `limit` effects, not
  `all` or `visual` ones, as long as other effect tasks still run): 300 frames
  at most in all, then the rest start when due. A bare hit or
  a native effect also waits while the battle's list of 60 small tasks is
  nearly full: 60 frames at most in all. One line in the log each.
- What a shown hit costs the game: one task in its list of effect tasks for a
  frame, up to three in its list of 60 small tasks (the damage number for about
  13 frames, the HP / MP bar for 4, one more for a frame), and for a killing hit
  a second effect task, the target's death (read from the code).
- A spell or `limit` entry from the ninth on starts only while the battle's
  list of effect tasks has 16 free places; otherwise it is passed over, with a
  line in the log, and its hit is shown at once if that list has two free
  places for each of its targets and for each hit shown at once in the same
  frame, and one for each hit shown in the frame before (a `visual` entry's
  hit is never shown). With
  fewer its hit is not shown (its damage was worked out with the action's), and
  a target it kills is not started dying by it (what the battle does then was
  not seen in the game). Native effects and bare hits are not held back this
  way.
- So keep bare hits a frame or more apart beyond the eighth entry: hits on one
  frame are spread over the next frames.
- The hits need results to show: the Nth entry shows the Nth hit, so give the
  limit as many hits (additional_modifier) as the place of its last entry that
  shows one (a `visual` entry before it still takes its number).

A limit with a native effect (its target, damage and the rest as any limit's;
here a limit with one hit on all its targets):

    effect        = none             no limit effect of its own
    spell_effects = effect 0x28f:0 all
    camera_single = 0x1d7            (a camera of your own: an engine = ff8
    camera_multi  = 0x1d7             one plays on the effect's frames)
    script        = e8 fc 00 e0 ea f4 19 f3 ec 2c e5 ee

The script's `ec` is frame 0 of the entry; its `2c` (the pack's first
animation) plays while the effect runs, and the battle waits for the effect to
end before the next action. With `clock = action` in the camera's file (an
engine = ff8 camera), the camera plays from that `ec` on the limit's own
frames, with or without native effects in spell_effects, through all of them. Do not give such a script an `f7`: the effect's
hit lines show the results. If the native effect cannot be played (no such
section, its script refused, its files or a task slot not to be had: the log
says which), the step's targets are hit at once, so the action always ends.

The hits' targets follow the limit's `target` as usual (Meteorain's, 0x97,
picks a random enemy for each hit).

Apart from states: the log now has a line when a battle is paused with the
game's pause button and one when it goes on, with how long it stood still
("battle PAUSED ...", "battle RESUMED after 51234 ms of pause ...").
