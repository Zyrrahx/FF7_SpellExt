// FF7_SpellExt_Limits.ini: port of sxcfg/rules/limits.py. load_limits (spellext.c 26462) and the helpers that decide
// its problems: state_section_start (25705), state_name (25681), state_command_word (25768), state_bytes (25795),
// state_lend_key (25905), state_key (25951), prop_name_value (25822), prop_bone_value (25846), prop_three_value
// (25863), prop_scale_value (25883), parse_signed (38329), parse_flags (9890) with element_flags (9739), finish_limit
// (26303), finish_states (26196).
//
// What it reads from the files read before it in the same reading (all optional; absent = not forecast):
//   'characters_defined'   the character file's section IDs that load_characters left defined (roster_character(n)
//                          != NULL). Also accepted: 'characters' as a Set/Array of IDs, or a Map whose keys are IDs
//                          (or that holds 'defined': the IDs). Absent: every ID 12-43 is taken as defined (the "a
//                          section starts with the ID of a character defined in the character file" rule is then not
//                          forecast).
//   'items_defined'        item IDs the items file defines as new items (is_new_item). Absent: the "is a new item of
//                          the items file" rule is not forecast.
// What it leaves for others: 'limits_defined' (the count the DLL logs: "limits file: %d limits defined"),
// 'limit_items' Map {character ID: item ID}.
//
// Keys of a limit's section that are none of its own go to the spell file's apply_key (with spell_file_reading false),
// through spells.js apply_key_for_limits(s, key, key_end, value, stop, draft), `draft` an object made fresh for each
// limit section.
import { lines, trim, parse_number, word_is, next_word, parse_yes_no, is_space, hex_digit } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind, pyIn, pyInt } from '../py.js';
import { apply_key_for_limits } from './spells.js';

export const FILE = 'FF7_SpellExt_Limits.ini';

export const NEW_CHARACTER_FIRST_ID = 12;
export const ROSTER_MAX = 32;
export const LIMIT_ITEM_ID_FIRST = 105;
export const LIMIT_ITEM_ID_COUNT = 23;
export const LIMIT_FIRST_NEW = 0x50;
export const FOLLOW_CHAIN_MAX = 6;
export const LIMIT_SCRIPT_MAX = 128;
export const LIMIT_SEQ_MAX = 24;
export const EFFECT_COPY_FIRST = 0x100;
export const EFFECT_COPY_LAST = 0xffff;
export const LIMIT_PACK_NAMES = 56;
export const PROP_FRAME_MAX = 9999;
export const PROP_TO_END = 0xffff;
export const PROP_BONE_ENTRIES = 50;
export const PROP_OFFSET_MAX = 5000;
export const PROP_TURN_MAX = 360;
export const PROP_SCALE_MAX = 700;
export const STATE_MAX = 4;
export const STATE_NAME_MAX = 15;
export const STATE_SCRIPT_MAX = 48;
export const STATE_IDLE_MAX = 16;
export const STATE_LEND_MAX = 32;
export const STATE_LENDS_MAX = 16;
export const STATE_GAP_MAX = 60;
export const STATE_VIEW_RAISE_MAX = 6000;
export const STATE_VIEW_BACK_MAX = 100;
export const STATE_POINTER_RAISE_MAX = 6000;
export const SEQ_LIMIT = 'limit';
export const SEQ_NATIVE = 'native';
export const SEQ_HIT = 'hit';

export const ELEMENT_FLAGS = Object.freeze([
  ['fire', 0x0001], ['ice', 0x0002], ['lightning', 0x0004], ['bolt', 0x0004],
  ['earth', 0x0008], ['poison', 0x0010], ['gravity', 0x0020], ['water', 0x0040],
  ['wind', 0x0080], ['holy', 0x0100], ['restorative', 0x0200], ['cut', 0x0400],
  ['hit', 0x0800], ['punch', 0x1000], ['shoot', 0x2000], ['shout', 0x4000],
  ['hidden', 0x8000]]);

export const STATE_COMMAND_NAMES = Object.freeze([
  [0x01, 'attack'], [0x09, 'morph'], [0x0a, 'deathblow'], [0x11, 'mug'],
  [0x18, 'slash_all'], [0x19, '2x_cut'], [0x1a, 'flash'], [0x1b, '4x_cut']]);

// The char at i, as the C reads it past the trimmed range (the buffer ends in a 0 byte).
export function ch(s, i) {
  return i >= 0 && i < s.length ? s[i] : '\0';
}

export function lower_or20(c) {
  return String.fromCharCode(c.charCodeAt(0) | 0x20);
}

const inRange = (c, a, b) => c >= a && c <= b;

// ---- shared helpers ----

// parse_flags: returns the mask or null.
export function parse_flags(s, p, end, names, limit) {
  let mask = 0;
  while (true) {
    const w = next_word(s, p, end);
    if (w === null) break;
    let word_end;
    [p, word_end] = w;
    let found = false;
    for (const [name, value] of names) {
      if (word_is(s, p, word_end, name)) {
        mask = (mask | value) >>> 0;
        found = true;
        break;
      }
    }
    if (!found) {
      if (word_is(s, p, word_end, 'none')) {
        // nothing
      } else {
        const [ok, q, number] = parse_number(s, p, word_end);
        if (ok && q === word_end && number <= limit) mask = (mask | number) >>> 0;
        else return null;
      }
    }
    p = word_end;
  }
  return mask;
}

// parse_signed (38329): returns the value or null.
export function parse_signed(s, p, end) {
  const negative = p < end && s[p] === '-';
  if (negative) p += 1;
  const [ok, q, n] = parse_number(s, p, end);
  if (!ok || q !== end || n > 0xffff) return null;
  return negative ? -n : n;
}

// state_name: the lower-case name, or null.
export function state_name(s, start, end) {
  const length = end - start;
  if (length < 1 || length > STATE_NAME_MAX || word_is(s, start, end, 'none')) return null;
  let out = '';
  for (let k = 0; k < length; k++) {
    let c = s[start + k];
    if (inRange(c, 'A', 'Z')) c = String.fromCharCode(c.charCodeAt(0) + 0x20);
    if (!(inRange(c, 'a', 'z') || inRange(c, '0', '9') || c === '_')) return null;
    out += c;
  }
  return out;
}

export function state_command_word(s, start, end) {
  for (const [number, name] of STATE_COMMAND_NAMES) {
    let k = 0;
    while (start + k < end && k < name.length) {
      let c = s[start + k];
      if (inRange(c, 'A', 'Z')) c = String.fromCharCode(c.charCodeAt(0) + 0x20);
      if (c === '-') c = '_';
      if (c !== name[k]) break;
      k += 1;
    }
    if (start + k === end && k === name.length) return number;
  }
  const [ok, p, n] = parse_number(s, start, end);
  if (ok && p === end) {
    for (const [number] of STATE_COMMAND_NAMES) {
      if (number === n) return n;
    }
  }
  return -1;
}

// state_bytes: returns [problem, bytes].
export function state_bytes(s, most, value, stop) {
  let q = value;
  const out = [];
  while (q < stop) {
    let v = 0;
    let digits = 0;
    while (q < stop && is_space(s[q])) q += 1;
    if (q === stop) break;
    while (q < stop && !is_space(s[q])) {
      const d = hex_digit(s[q]);
      if (d < 0 || digits === 2) return ['a script is a list of bytes in hexadecimal, two digits each: fc f7 00 1f 9e', null];
      v = v * 16 + d;
      q += 1;
      digits += 1;
    }
    if (out.length === most) {
      return [most === STATE_SCRIPT_MAX ? 'a state\'s attack script may be up to 48 bytes'
        : most === STATE_LEND_MAX ? 'a state\'s script_NN may be up to 32 bytes'
          : 'a state\'s idle script may be up to 16 bytes', null];
    }
    out.push(v & 0xff);
  }
  if (!out.length) return ['the script is empty', null];
  return [null, out];
}

export function prop_name_value(s, value, stop) {
  const length = stop - value;
  if (word_is(s, value, stop, 'none')) return null;
  if (length < 1 || length > 8) {
    return 'prop is a model\'s name of 1 to 8 characters, without extension (NAME: the files NAME.RSD and NAME.P), or none';
  }
  for (let k = 0; k < length; k++) {
    let c = s[value + k];
    if (inRange(c, 'a', 'z')) c = String.fromCharCode(c.charCodeAt(0) - 0x20);
    if (!(inRange(c, 'A', 'Z') || inRange(c, '0', '9') || c === '_')) return 'prop may only use letters, digits and _';
  }
  return null;
}

// The name prop_name_value keeps ("" for none or a mistake).
export function prop_name_text(s, value, stop) {
  if (word_is(s, value, stop, 'none') || prop_name_value(s, value, stop)) return '';
  return s.slice(value, stop).toUpperCase();
}

export function prop_bone_value(s, value, stop) {
  if (word_is(s, value, stop, 'weapon_hand') || word_is(s, value, stop, 'other_hand')) return null;
  const [ok, p, n] = parse_number(s, value, stop);
  if (!ok || p !== stop || n > PROP_BONE_ENTRIES - 2) {
    return 'prop_bone is weapon_hand, other_hand, or a bone\'s number, 0 to 48 (0 = the skeleton\'s first bone)';
  }
  return null;
}

export function prop_three_value(s, is_turn, value, stop) {
  const most = is_turn ? PROP_TURN_MAX : PROP_OFFSET_MAX;
  let k = 0;
  let q = value;
  let word_end = null;
  while (true) {
    const w = next_word(s, q, stop);
    if (w === null) {
      word_end = null;
      break;
    }
    [q, word_end] = w;
    if (k === 3) break;
    const v = parse_signed(s, q, word_end);
    if (v === null || v > most || v < -most) break;
    q = word_end;
    k += 1;
  }
  if (word_end !== null || k !== 3) {
    return is_turn
      ? 'prop_turn is three whole numbers of degrees, -360 to 360: the turn about the bone\'s X, then Y, then Z (0 0 0 = none)'
      : 'prop_offset is three whole numbers, -5000 to 5000: the prop\'s place from the bone\'s joint along the bone\'s X, Y and Z (0 0 0 = on it)';
  }
  return null;
}

export function prop_scale_value(s, value, stop) {
  let value_end = stop > value && s[stop - 1] === '%' ? stop - 1 : stop;
  let p = value;
  let tenths = 0;
  let n = 0;
  while (value_end > value && is_space(s[value_end - 1])) value_end -= 1;
  const [ok, p2, n2] = parse_number(s, p, value_end);
  if (ok) {
    p = p2;
    n = n2;
  }
  if (ok && n <= PROP_SCALE_MAX && p + 2 === value_end && s[p] === '.' && inRange(s[p + 1], '0', '9')) {
    tenths = s.charCodeAt(p + 1) - 48;
    p += 2;
  }
  if (p !== value_end || p === value || n > PROP_SCALE_MAX || n * 10 + tenths < 10 || n * 10 + tenths > PROP_SCALE_MAX * 10) {
    return 'prop_scale is the prop\'s size in per cent of its own, 1 to 700, with one decimal if wanted (100 = as it is, 87.5)';
  }
  return null;
}

export function state_lend_standing(slot) {
  return [0x02, 0x0c, 0x0d, 0x0e, 0x13].includes(slot);
}

export function state_lend_key(st, s, key, key_end, value, stop) {
  if (key_end - key !== 9 || hex_digit(s[key + 7]) < 0 || hex_digit(s[key + 8]) < 0) {
    return 'script_NN takes the number of the model script it replaces in two hexadecimal digits: script_05 = 22 f2 e5 ee';
  }
  const slot = hex_digit(s[key + 7]) * 16 + hex_digit(s[key + 8]);
  if (slot < 2) return 'script_00 and script_01 are the idle and the weak idle: use idle_script and idle_weak_script';
  if (0x18 <= slot && slot <= 0x1b) {
    return 'script_18 to script_1b are the slots the state\'s attack scripts are lent in: use attack_script_only, attack_script, _next, _next2, _last';
  }
  if ((0x2e <= slot && slot <= 0x32) || (0x34 <= slot && slot <= 0x3b)) {
    return 'scripts 2e-32 and 34-3b are taken from the game\'s exe for every model, not from the model\'s table: a replacement would never be played';
  }
  if (slot === 0x33 || slot >= 0x3c) {
    return 'script_NN replaces a model script from 02 to 17 or 1c to 2d (3c and above are the character\'s limits and transformations)';
  }
  const [problem, b] = state_bytes(s, STATE_LEND_MAX, value, stop);
  if (problem) return problem;
  if (!state_lend_standing(slot) && b.length >= 2 && b[b.length - 2] === 0xfe && b[b.length - 1] === 0xc0) {
    return 'this script is an action or a reaction, which the battle waits to see finished: one that ends in fe c0 never says so and would hold the battle; end it with e5 ee (or ee)';
  }
  const lends = st.lends;
  if (!lends.includes(slot) && lends.length === STATE_LENDS_MAX) {
    return 'a state may replace up to 16 model scripts (script_NN lines)';
  }
  if (!lends.includes(slot)) lends.push(slot);
  return null;
}

// state_key (25951): the problem, or null.
export function state_key(st, s, key, key_end, value, stop) {
  let p = value;
  let ok;
  let n;
  if (word_is(s, key, key_end, 'hits')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < 1 || n > 4) {
      return 'hits is 2, 3 or 4: how many times each turn of a listed attack hits while the state lasts (1 = no change)';
    }
  } else if (word_is(s, key, key_end, 'commands')) {
    if (!word_is(s, value, stop, 'none')) {
      while (true) {
        const w = next_word(s, p, stop);
        if (w === null) break;
        let word_end;
        [p, word_end] = w;
        if (state_command_word(s, p, word_end) < 0) {
          return 'commands is a list of the battle commands the hits apply to: attack 2x_cut 4x_cut slash_all mug deathblow morph flash (or their numbers: 1 25 27 24 17 10 9 26), or none';
        }
        p = word_end;
      }
    }
  } else if (word_is(s, key, key_end, 'ends')) {
    let seen = false;
    while (true) {
      const w = next_word(s, p, stop);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      seen = true;
      if (word_is(s, p, word_end, 'ko') || word_is(s, p, word_end, 'frog')) {
        // nothing
      } else if (word_is(s, p, word_end, 'limit')) {
        return 'ends = limit is not built: ends is a list of battle (always), ko and frog (the line is passed over)';
      } else if (!word_is(s, p, word_end, 'battle')) {
        return 'ends is a list of: battle (the state always ends with the battle), ko (when the actor is knocked out), frog (when it is turned into a frog): ends = battle ko frog';
      }
      p = word_end;
    }
    if (!seen) {      // p == value: next_word never moved p (an empty value, or only spaces and commas)
      return 'ends is a list of: battle (the state always ends with the battle), ko (when the actor is knocked out), frog (when it is turned into a frog): ends = battle ko frog';
    }
  } else if (word_is(s, key, key_end, 'prop')) {
    st.prop = false;
    if (word_is(s, value, stop, 'weapon')) {
      st.prop = true;
    } else {
      const problem = prop_name_value(s, value, stop);
      st.prop = Boolean(prop_name_text(s, value, stop));
      return problem;
    }
  } else if (word_is(s, key, key_end, 'prop_bone')) {
    return prop_bone_value(s, value, stop);
  } else if (word_is(s, key, key_end, 'prop_offset')) {
    return prop_three_value(s, 0, value, stop);
  } else if (word_is(s, key, key_end, 'prop_turn')) {
    return prop_three_value(s, 1, value, stop);
  } else if (word_is(s, key, key_end, 'prop_scale')) {
    return prop_scale_value(s, value, stop);
  } else if (word_is(s, key, key_end, 'prop_hide')) {
    if (!word_is(s, value, stop, 'none')) {
      while (true) {
        const w = next_word(s, p, stop);
        if (w === null) break;
        let word_end;
        [p, word_end] = w;
        if (!['dead', 'victory', 'escape', 'limit'].some(x => word_is(s, p, word_end, x))) {
          return 'prop_hide is none, or a list of when the state\'s prop is not drawn: dead, victory, escape, limit (while a limit\'s own animation is shown)';
        }
        p = word_end;
      }
    }
  } else if (word_is(s, key, key_end, 'prop_colour')) {
    if (!(word_is(s, value, stop, 'body') || word_is(s, value, stop, 'own'))) {
      return 'prop_colour is body (the default: the prop is drawn with the colour and transparency the actor\'s body has: poisoned, petrified, fading) or own (always its own colours)';
    }
  } else if (word_is(s, key, key_end, 'prop_frames') || word_is(s, key, key_end, 'prop_animation')) {
    return 'prop_frames and prop_animation are a limit\'s keys: a state\'s prop is there for as long as the state lasts (see prop_hide)';
  } else if (word_is(s, key, key_end, 'idle_script') || word_is(s, key, key_end, 'idle_weak_script')) {
    return state_bytes(s, STATE_IDLE_MAX, value, stop)[0];
  } else if (word_is(s, key, key_end, 'retarget')) {
    if (!(word_is(s, value, stop, 'yes') || word_is(s, value, stop, 'no'))) {
      return 'retarget is yes or no: whether a later turn whose target has died goes to another living enemy (default yes)';
    }
  } else if (word_is(s, key, key_end, 'hit_gap')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < 1 || n > STATE_GAP_MAX) {
      return 'hit_gap is 1 to 60: the frames after which a hit of a turn that the script has not shown with f7 is shown without it (default 6)';
    }
  } else if (word_is(s, key, key_end, 'limit_gauge')) {
    if (!(word_is(s, value, stop, 'frozen') || word_is(s, value, stop, 'normal'))) {
      return 'limit_gauge is normal (the default) or frozen: whether the actor\'s limit gauge fills while the state lasts';
    }
  } else if (word_is(s, key, key_end, 'camera')) {
    if (!(word_is(s, value, stop, 'keep') || word_is(s, value, stop, 'none'))) {
      [ok, p, n] = parse_number(s, p, stop);
      if (!(ok && p === stop && n <= 0xffff)) {
        return 'camera is keep (each command\'s own camera, the default), none (no camera movement), or a battle camera number';
      }
    }
  } else if (word_is(s, key, key_end, 'stop_step')) {
    if (!(word_is(s, value, stop, 'yes') || word_is(s, value, stop, 'no'))) {
      return 'stop_step is yes or no: whether an attack that runs out of targets between turns still plays the game\'s short "nothing to hit" step (default no)';
    }
  } else if (['attack_script', 'attack_script_next', 'attack_script_last', 'attack_script_only',
              'attack_script_next2'].some(x => word_is(s, key, key_end, x))) {
    return state_bytes(s, STATE_SCRIPT_MAX, value, stop)[0];
  } else if (word_is(s, key, key_end, 'attack_targets')) {
    if (!(word_is(s, value, stop, 'all_enemies') || word_is(s, value, stop, 'as_chosen'))) {
      return 'attack_targets is as_chosen (the default: the targets the attack was given) or all_enemies (each turn of a listed attack goes at every living enemy, with one animation)';
    }
  } else if (word_is(s, key, key_end, 'attack_element')) {
    if (word_is(s, value, stop, 'weapon')) {
      // nothing
    } else if (value < stop && parse_flags(s, value, stop, ELEMENT_FLAGS, 0xffff) !== null) {
      // nothing
    } else {
      return 'attack_element is weapon (the default: the weapon\'s and the Elemental materia\'s) or element words, as a spell\'s element: hidden, fire ice, none';
    }
  } else if (word_is(s, key, key_end, 'long_range')) {
    if (!(word_is(s, value, stop, 'yes') || word_is(s, value, stop, 'no'))) {
      return 'long_range is yes or no (the default): whether the listed attacks are long range (no back-row halving; enemies behind others can be aimed at)';
    }
  } else if (word_is(s, key, key_end, 'physical_evade')) {
    if (!(word_is(s, value, stop, '100') || word_is(s, value, stop, '100%') || word_is(s, value, stop, 'normal'))) {
      return 'physical_evade is normal (the default) or 100: every physical hit on the actor misses while the state lasts';
    }
  } else if (word_is(s, key, key_end, 'view_raise')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n > STATE_VIEW_RAISE_MAX) {
      return 'view_raise is 0 (the default) to 6000: units the battle\'s home view (between turns, the command menu, choosing a target) goes up while an actor is in the state';
    }
  } else if (word_is(s, key, key_end, 'view_back')) {
    if (stop > value && s[stop - 1] === '%') stop -= 1;
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n > STATE_VIEW_BACK_MAX) {
      return 'view_back is 0 (the default) to 100: per cent the battle\'s home view goes back from the point it looks at while an actor is in the state';
    }
  } else if (word_is(s, key, key_end, 'pointer_raise')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n > STATE_POINTER_RAISE_MAX) {
      return 'pointer_raise is 0 (the default) to 6000: units the yellow pointer over the party member whose command menu is open goes up while the actor is in the state';
    }
  } else if (key_end - key >= 7 && word_is(s, key, key + 7, 'script_')) {
    return state_lend_key(st, s, key, key_end, value, stop);
  } else {
    return 'a state\'s section takes: hits, commands, ends (battle ko frog), retarget, hit_gap, stop_step, camera, attack_script / _next / _next2 / _last / _only, idle_script, idle_weak_script, prop (a name, or weapon), prop_bone, prop_offset, prop_turn, prop_scale, prop_hide, prop_colour, attack_targets, attack_element, long_range, physical_evade, script_NN, view_raise, view_back, pointer_raise';
  }
  return null;
}

// ---- the reader ----

// What one reading keeps of a character (new_character's limits fields).
export class Character {
  constructor(ident) {
    this.id = ident;
    this.own_limits = false;
    this.limit_set = '';
    this.defined_limits = new Map();     // index 0-11 -> [start_line, state name]
    this.states = [];                    // names, in their slots
    this.limit_item = 0;
  }
}

// int(k) of a key of the characters map: a number, or a str Python's int() takes
function intKey(k) {
  return typeof k === 'number' ? k : pyInt(String(k));
}

function _defined_ids(shared) {
  if (shared.has('characters_defined')) return [new Set(shared.get('characters_defined')), true];
  const c = shared.has('characters') ? shared.get('characters') : null;
  if (c === null || c === undefined) {
    const all = new Set();
    for (let i = NEW_CHARACTER_FIRST_ID; i < NEW_CHARACTER_FIRST_ID + ROSTER_MAX; i++) all.add(i);
    return [all, false];
  }
  if (c instanceof Map) {
    if (c.has('defined')) return [new Set(c.get('defined')), true];
    return [new Set([...c.keys()].map(intKey)), true];
  }
  return [new Set([...c].map(intKey)), true];
}

const _spell_apply_key = () => apply_key_for_limits;

export function check(r) {
  const s = r.text;
  const [defined_ids, knows_characters] = _defined_ids(r.shared);
  const items_defined = r.shared.has('items_defined') ? r.shared.get('items_defined') : null;
  const apply_key = _spell_apply_key();
  const chars = new Map();

  const roster_character = n => {
    if (NEW_CHARACTER_FIRST_ID <= n && n < NEW_CHARACTER_FIRST_ID + ROSTER_MAX && defined_ids.has(n)) {
      if (!chars.has(n)) chars.set(n, new Character(n));
      return chars.get(n);
    }
    return null;
  };

  const all_lines = [...lines(s)];
  // the pass beforehand: limit_set = name in each character's own section
  let pc = null;
  for (const ln of all_lines) {
    const a = ln.start;
    const t = ln.stop;
    if (a === t) continue;
    if (s[a] === '[') {
      const [ok, q, ident] = parse_number(s, a + 1, t);
      pc = ok && q < t && s[q] === ']' ? roster_character(ident) : null;
      continue;
    }
    const eq = pyFind(s, '=', a, t);
    if (pc && eq >= 0) {
      const [ks, ke] = trim(s, a, eq);
      const [vs, ve] = trim(s, eq + 1, t);
      if (word_is(s, ks, ke, 'limit_set')) {
        let set = '';
        for (const x of s.slice(vs, Math.min(ve, vs + 15))) set += lower_or20(x);
        pc.limit_set = set;
        if (word_is(s, vs, ve, 'default')) pc.limit_set = '';
      }
    }
  }

  let limits_defined = 0;
  let c = null;
  let owner = null;
  let state_section = null;
  let in_test = false;
  let lim = null;      // the limit being read: its draft

  const finish_limit = (d, who) => {
    if (who === null) return;
    if (d.base < 0) {
      r.log(d.line, 'limits file line %d: the limit has no base; skipped', d.line);
      return;
    }
    if (!d.prop && d.placing) {
      r.log(d.line, 'limits file line %d: character %d limit %d-%d has prop_offset, prop_turn, prop_scale, prop_frames or prop_animation but no prop: they do nothing',
            d.line, who.id, d.level, d.position);
    }
    who.defined_limits.set((d.level - 1) * 3 + d.position - 1, [d.line, d.state]);
    limits_defined += 1;
  };

  for (const ln of all_lines) {
    const start = ln.start;
    let stop = ln.stop;
    const n = ln.number;
    let problem = null;
    if (start === stop) continue;
    if (s[start] === '[') {
      if (owner) finish_limit(lim, owner);
      owner = null;
      c = null;
      state_section = null;
      in_test = stop - start === 6 && word_is(s, start + 1, stop - 1, 'test') && s[stop - 1] === ']';
      let [ok, p, ident] = parse_number(s, start + 1, stop);
      if (in_test) {
        // nothing
      } else if (!ok || !roster_character(ident < 0x80000000 ? ident : -1)) {
        problem = 'a section starts with the ID of a character defined in the character file: [12] or [12 1-1]';
      } else {
        c = roster_character(ident);
        c.own_limits = true;
        while (p < stop && is_space(s[p])) p += 1;
        if (stop - p >= 6 && word_is(s, p, p + 5, 'state') && (is_space(s[p + 5]) || s[p + 5] === ']')) {
          // state_section_start
          const [name, name_end] = trim(s, p + 5, stop - 1);
          const lower = s[stop - 1] === ']' ? state_name(s, name, name_end) : null;
          if (lower === null) {
            problem = 'a state\'s section looks like [12 state NAME]: the character, the word state, a name of 1 to 15 letters, digits or _';
          } else if (c.states.includes(lower)) {
            problem = 'this state is already defined for the character';
          } else if (c.states.length === STATE_MAX) {
            problem = 'a character may have up to 4 states';
          } else {
            c.states.push(lower);
            state_section = { name: lower, lends: [], prop: false };
          }
          if (problem) c = null;
        } else if (ch(s, p) !== ']') {
          if (stop - p < 4 || !inRange(s[p], '1', '4') || s[p + 1] !== '-' || !inRange(s[p + 2], '1', '3') ||
              s[stop - 1] !== ']' || (s[p + 3] !== ']' && !is_space(s[p + 3]))) {
            problem = 'a limit\'s section looks like [12 2-1] or [12 2-1 setname]: character, level (1-4) - position (1-3)';
          } else {
            const [tag, tag_end] = trim(s, p + 3, stop - 1);
            let same = tag_end - tag === c.limit_set.length;
            let k = 0;
            while (same && k < tag_end - tag) {
              same = lower_or20(s[tag + k]) === c.limit_set[k];
              k += 1;
            }
            if (!same) c = null;
          }
          if (problem || !c) {
            // nothing
          } else if (c.defined_limits.has((s.charCodeAt(p) - 49) * 3 + s.charCodeAt(p + 2) - 49)) {
            problem = 'this limit is already defined';
          } else {
            lim = { level: s.charCodeAt(p) - 48, position: s.charCodeAt(p + 2) - 48, line: n, base: -1, state: '',
                    prop: false, placing: false, spell: {} };
            owner = c;
          }
        }
      }
    } else if (in_test) {
      const equals = pyFind(s, '=', start, stop);
      if (equals < 0) {
        problem = 'expected key = value';
      } else {
        const [ks, ke] = trim(s, start, equals);
        const [value, vstop] = trim(s, equals + 1, stop);
        let p = value;
        while (true) {
          const w = next_word(s, p, vstop);
          if (w === null) break;
          let word_end;
          [p, word_end] = w;
          let ok;
          let v;
          [ok, p, v] = parse_number(s, p, word_end);
          if (!ok || p !== word_end || v > 8) {
            problem = 'expected the IDs of game characters, 0 to 8 (0 = Cloud)';
            break;
          }
          p = word_end;
        }
        if (problem) {
          // nothing
        } else if (word_is(s, ks, ke, 'full_gauge') || word_is(s, ks, ke, 'learn_all_on_load') ||
                   word_is(s, ks, ke, 'first_limit_block')) {
          // nothing
        } else {
          problem = 'the [test] section takes: full_gauge, learn_all_on_load = game character IDs';
        }
      }
    } else if (!c) {
      continue;
    } else {
      const equals = pyFind(s, '=', start, stop);
      if (equals < 0) {
        problem = 'expected key = value';
      } else {
        const [key, key_end] = trim(s, start, equals);
        let value;
        [value, stop] = trim(s, equals + 1, stop);
        if (state_section !== null) problem = state_key(state_section, s, key, key_end, value, stop);
        else if (!owner) problem = character_key(r, c, chars, items_defined, s, key, key_end, value, stop);
        else problem = limit_key(lim, s, key, key_end, value, stop, apply_key);
      }
    }
    if (problem) r.log(n, 'limits file line %d: %s', n, problem);
  }
  if (owner) finish_limit(lim, owner);
  // finish_states: a limit's state must name a section [ID state NAME] of its character
  for (const ident of [...chars.keys()].sort((a, b) => a - b)) {
    const cc = chars.get(ident);
    if (!cc.own_limits) continue;
    for (const i of [...cc.defined_limits.keys()].sort((a, b) => a - b)) {
      const [line, name] = cc.defined_limits.get(i);
      if (name && !cc.states.includes(name)) {
        r.log(line, 'limits file: character %d limit %d-%d: state = %s, but there is no section [%d state %s]: the limit works without a state',
              ident, Math.floor(i / 3) + 1, i % 3 + 1, name, ident, name);
      }
    }
  }
  r.shared.set('limits_defined', limits_defined);
  const items = new Map();
  for (const [k, v] of chars) if (v.limit_item) items.set(k, v.limit_item);
  r.shared.set('limit_items', items);
  if (!knows_characters) r.note(0, 'the character file\'s sections are not known here: every ID 12-43 is taken as defined');
}

// The character's own section [ID].
export function character_key(r, c, chars, items_defined, s, key, key_end, value, stop) {
  let p = value;
  let ok;
  let n;
  if (word_is(s, key, key_end, 'gauge')) {
    let i = 0;
    let word_end = null;
    while (true) {
      const w = next_word(s, p, stop);
      if (w === null) {
        word_end = null;
        break;
      }
      [p, word_end] = w;
      if (i === 4) break;
      [ok, p, n] = parse_number(s, p, word_end);
      if (!ok || p !== word_end || n < 1 || n > 65535) break;
      i += 1;
      p = word_end;
    }
    if (i !== 4 || word_end !== null) return 'gauge takes four numbers from 1 to 65535, one per limit level';
  } else if (word_is(s, key, key_end, 'learn_all_on_load') || word_is(s, key, key_end, 'full_gauge') ||
             word_is(s, key, key_end, 'limit_item_on_load')) {
    if (parse_yes_no(s, value, stop) === null) return 'expected yes or no';
  } else if (word_is(s, key, key_end, 'limit_set')) {
    // read beforehand
  } else if (word_is(s, key, key_end, 'limit_item')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < LIMIT_ITEM_ID_FIRST || n >= LIMIT_ITEM_ID_FIRST + LIMIT_ITEM_ID_COUNT) {
      return 'limit_item must be one of the kernel\'s unused item IDs, 105 to 127';
    }
    let other = null;
    for (const o of [...chars.keys()].sort((a, b) => a - b)) {
      if (chars.get(o) !== c && chars.get(o).limit_item === n) {
        other = o;
        break;
      }
    }
    if (other !== null) {
      return 'limit_item ' + n + ' is already character ' + other + '\'s limit item: each character needs an item ID of its own (105 to 127)';
    }
    if (items_defined !== null && items_defined !== undefined && pyIn(n, items_defined)) {
      return 'limit_item ' + n + ' is a new item of the items file ([' + n + '] there): use another item ID of 105 to 127, or take that section out';
    }
    c.limit_item = n;
  } else if (word_is(s, key, key_end, 'limit_item_name')) {
    if (stop - value > 24) return 'limit_item_name: at most 24 characters';
  } else if (word_is(s, key, key_end, 'limit_item_description')) {
    // nothing
  } else if (word_is(s, key, key_end, 'limit_item_learned') || word_is(s, key, key_end, 'limit_item_not_yet') ||
             word_is(s, key, key_end, 'limit_item_other')) {
    if (stop - value > 33) return 'a limit item\'s spoken line: at most 33 characters';
  } else {
    return 'a character\'s own section takes: gauge = four numbers, learn_all_on_load, full_gauge = yes or no, and the limit_item keys';
  }
  return null;
}

// A key of a limit's section [ID L-P].
export function limit_key(d, s, key, key_end, value, stop, apply_key) {
  let p = value;
  let ok;
  let n;
  const level = d.level;
  const position = d.position;
  if (word_is(s, key, key_end, 'base')) {
    [ok, p, n] = parse_number(s, p, stop);
    if (!ok || p !== stop || n < 0x80 || n >= 0x80 + LIMIT_FIRST_NEW) {
      return 'base must be one of the game\'s limits, by its number 128 to 200 (0x80 to 0xc8)';
    }
    d.base = n - 0x80;
  } else if (word_is(s, key, key_end, 'effect_file')) {
    const q = value;
    let colon = value;
    while (colon < stop && s[colon] !== ':') colon += 1;
    let a = colon - q;
    let b = colon < stop ? stop - colon - 1 : 0;
    while (a > 0 && is_space(s[q + a - 1])) a -= 1;
    while (b > 0 && is_space(s[colon + 1])) {
      colon += 1;
      b -= 1;
    }
    while (b > 0 && is_space(s[colon + b])) b -= 1;
    if (a < 1 || a > 31 || b < 1 || b > 31) {
      return 'effect_file is NAME:LOOSE, the archive file\'s name and the loose file used in its place (DYNAMITE.P:MYFILE)';
    }
  } else if (word_is(s, key, key_end, 'followup_chain')) {
    [ok, , n] = parse_number(s, value, stop);
    if (!ok || n < 1 || n > FOLLOW_CHAIN_MAX) return 'followup_chain is how many follow-ups run in a row, 1 to 6';
  } else if (word_is(s, key, key_end, 'followup_strengths')) {
    let q = value;
    let k = 0;
    while (true) {
      const w = next_word(s, q, stop);
      if (w === null) break;
      let word_end;
      [q, word_end] = w;
      [ok, q, n] = parse_number(s, q, word_end);
      if (k === FOLLOW_CHAIN_MAX || !ok || q !== word_end || n > 255) {
        return 'followup_strengths is up to six strengths, 0 to 255, one for each follow-up in turn';
      }
      k += 1;
      q = word_end;
    }
  } else if (word_is(s, key, key_end, 'script') || word_is(s, key, key_end, 'followup_script') ||
             word_is(s, key, key_end, 'followup_chain_script')) {
    let q = value;
    let length = 0;
    let problem = null;
    while (q < stop && !problem) {
      let digits = 0;
      while (q < stop && is_space(s[q])) q += 1;
      if (q === stop) break;
      while (q < stop && !is_space(s[q])) {
        const c = s[q];
        const o = s.charCodeAt(q);
        const dd = inRange(c, '0', '9') ? o - 48 : inRange(c, 'a', 'f') ? o - 87 : inRange(c, 'A', 'F') ? o - 55 : -1;
        if (dd < 0 || digits === 2) problem = 'a script is a list of bytes in hexadecimal, two digits each: fc 00 e0 ea ...';
        q += 1;
        digits += 1;
      }
      if (!problem && length === LIMIT_SCRIPT_MAX) problem = 'a script may be up to 128 bytes';
      if (!problem) length += 1;
    }
    if (!problem && !length) problem = 'the script is empty';
    return problem;
  } else if (word_is(s, key, key_end, 'spell_effects')) {
    return spell_effects(s, value, stop);
  } else if (word_is(s, key, key_end, 'hit_elements')) {
    let q = value;
    let count = 0;
    while (q < stop) {
      let piece_end = q;
      while (piece_end < stop && s[piece_end] !== ',') piece_end += 1;
      if (count === LIMIT_SEQ_MAX || parse_flags(s, q, piece_end, ELEMENT_FLAGS, 0xffff) === null) {
        return 'hit_elements is up to 24 element sets separated by commas: fire, ice, lightning';
      }
      count += 1;
      q = piece_end < stop ? piece_end + 1 : stop;
    }
  } else if (word_is(s, key, key_end, 'state')) {
    if (word_is(s, value, stop, 'none')) {
      d.state = '';
    } else {
      const name = state_name(s, value, stop);
      d.state = name || '';
      if (name === null) {
        return 'state is the name of one of the character\'s states, 1 to 15 letters, digits or _ (its section: [12 state NAME]), or none';
      }
    }
  } else if (word_is(s, key, key_end, 'prop')) {
    const problem = prop_name_value(s, value, stop);
    d.prop = Boolean(prop_name_text(s, value, stop));
    return problem;
  } else if (word_is(s, key, key_end, 'prop_bone')) {
    return prop_bone_value(s, value, stop);
  } else if (word_is(s, key, key_end, 'prop_offset') || word_is(s, key, key_end, 'prop_turn')) {
    d.placing = true;
    return prop_three_value(s, word_is(s, key, key_end, 'prop_turn'), value, stop);
  } else if (word_is(s, key, key_end, 'prop_scale')) {
    d.placing = true;
    return prop_scale_value(s, value, stop);
  } else if (word_is(s, key, key_end, 'prop_frames')) {
    d.placing = true;
    if (!word_is(s, value, stop, 'all')) {
      let first;
      [ok, p, first] = parse_number(s, p, stop);
      let good = ok && first <= PROP_FRAME_MAX;
      while (good && p < stop && is_space(s[p])) p += 1;
      good = good && p < stop && s[p] === '-';
      p += 1;
      while (good && p < stop && is_space(s[p])) p += 1;
      if (good && p < stop) {
        let last;
        [ok, p, last] = parse_number(s, p, stop);
        good = ok && p === stop && last <= PROP_FRAME_MAX && last >= first;
      }
      if (!good) {
        return 'prop_frames is all, or first-last: the frames of the animation the prop is shown on, counted from 0 (18-96; 18- = from 18 to its end)';
      }
    }
  } else if (word_is(s, key, key_end, 'prop_animation')) {
    d.placing = true;
    if (!word_is(s, value, stop, 'any')) {
      [ok, p, n] = parse_number(s, p, stop);
      if (!ok || p !== stop || n > 7) {
        return 'prop_animation is any, or the animation of the limit\'s pack the prop is shown in, 0 to 7 (0 = the pack\'s first: script byte 2c)';
      }
    }
  } else if (word_is(s, key, key_end, 'animation_pack')) {
    const length = stop - value;
    if (length < 1 || length > 8) return 'animation_pack is a file name of 1 to 8 characters, without extension';
    for (let k = 0; k < length; k++) {
      let c = s[value + k];
      if (inRange(c, 'a', 'z')) c = String.fromCharCode(c.charCodeAt(0) - 0x20);
      if (!(inRange(c, 'A', 'Z') || inRange(c, '0', '9') || c === '_')) {
        return 'animation_pack may only use letters, digits and _';
      }
    }
  } else if (word_is(s, key, key_end, 'effect')) {
    if (!(word_is(s, value, stop, 'none') || word_is(s, value, stop, 'base'))) {
      [ok, p, n] = parse_number(s, p, stop);
      if (!ok || p !== stop || n < 0x80 || n >= 0x80 + LIMIT_PACK_NAMES) {
        return 'effect must be base, none, or a game limit\'s number, 128 to 183';
      }
    }
  } else if (word_is(s, key, key_end, 'kills')) {
    [ok, p, n] = position === 1 && 2 <= level && level <= 3 ? parse_number(s, p, stop) : [false, p, 0];
    if (position !== 1 || level < 2 || level > 3 || !ok || p !== stop || n > 65534) {
      return 'kills applies to the first limit of levels 2 and 3: a number up to 65534';
    }
  } else if (word_is(s, key, key_end, 'uses')) {
    [ok, p, n] = position >= 2 && level <= 3 ? parse_number(s, p, stop) : [false, p, 0];
    if (position < 2 || level > 3 || !ok || p !== stop || n > 65534) {
      return 'uses applies to the second and third limits of levels 1 to 3: a number up to 65534';
    }
  } else if (word_is(s, key, key_end, 'learned')) {
    if (parse_yes_no(s, value, stop) === null) return 'expected yes or no';
  } else if (word_is(s, key, key_end, 'materia')) {
    return 'unknown key';
  } else {
    // apply_key of the spell file (spell_file_reading false)
    if (apply_key !== null && apply_key !== undefined) return apply_key(s, key, key_end, value, stop, d.spell);
  }
  return null;
}

// spell_effects = [limit | effect] number:frame [all] [visual] [skip N], ... or hit:frame (load_limits 27286).
export function spell_effects(s, value, stop) {
  let q = value;
  let is_limit = false;
  let is_skip = false;
  let is_native = false;
  const flags = [];      // per entry: the kind (null, SEQ_LIMIT, SEQ_NATIVE, SEQ_HIT)
  let problem = null;
  while (!problem) {
    const w = next_word(s, q, stop);
    if (w === null) break;
    let word_end;
    [q, word_end] = w;
    const count = flags.length;
    if (count && flags[flags.length - 1] === SEQ_HIT && !is_limit && !is_native &&
        (word_is(s, q, word_end, 'all') || word_is(s, q, word_end, 'visual') || word_is(s, q, word_end, 'skip'))) {
      problem = 'spell_effects: a `hit:frame` entry (a bare hit, no effect) takes nothing after it: no all, visual or skip';
    } else if (count && flags[flags.length - 1] === SEQ_NATIVE && !is_limit && !is_native &&
        (word_is(s, q, word_end, 'visual') || word_is(s, q, word_end, 'skip'))) {
      problem = 'spell_effects: an `effect N:frame` entry (a native effect) takes `all` only, not visual or skip';
    } else if (is_skip) {
      const [ok, q2, frames] = parse_number(s, q, word_end);
      if (!ok || q2 !== word_end || frames > 255) problem = 'spell_effects: `skip` must be followed by a number of frames, 0 to 255';
      is_skip = false;
    } else if (word_is(s, q, word_end, 'skip') && count && !is_limit && !is_native) {
      is_skip = true;
    } else if (word_is(s, q, word_end, 'limit') && !is_native) {
      is_limit = true;
    } else if (word_is(s, q, word_end, 'effect') && !is_limit && !is_native) {
      is_native = true;
    } else if ((word_is(s, q, word_end, 'all') || word_is(s, q, word_end, 'visual')) && count && !is_limit && !is_native) {
      // nothing
    } else if (!is_limit && !is_native && word_end - q >= 3 && word_is(s, q, q + 3, 'hit') &&
               (word_end - q === 3 || s[q + 3] === ':')) {
      // hit:frame, a bare hit (SEQ_HIT): no effect, the step's hit shown at its frame
      if (count === LIMIT_SEQ_MAX) {
        problem = 'spell_effects is up to 24 of  [limit | effect] number:frame [all] [visual], or hit:frame  (0x1b:40, limit 178:60 all visual, effect 0x200:10 all, hit:70)';
      } else {
        let bad = word_end - q === 3;
        if (!bad) {
          let ok;
          let frame;
          [ok, q, frame] = parse_number(s, q + 4, word_end);
          bad = !ok || q !== word_end || frame > 2000;
        }
        if (bad) problem = 'spell_effects: a bare hit is hit:frame, the frame 0 to 2000 (hit:70)';
        else flags.push(SEQ_HIT);
      }
    } else {
      let bad = count === LIMIT_SEQ_MAX;
      let ok;
      let effect;
      if (!bad) {
        [ok, q, effect] = parse_number(s, q, word_end);
        bad = !ok;
      }
      if (!bad) {
        bad = is_limit ? (effect < 0x80 || effect > 0xb7)
          : is_native ? (effect < EFFECT_COPY_FIRST || effect > EFFECT_COPY_LAST) : effect > 0xff;
      }
      if (!bad) bad = q === word_end || s[q] !== ':';
      if (!bad) {
        q += 1;
        let frame;
        [ok, q, frame] = parse_number(s, q, word_end);
        bad = !ok || q !== word_end || frame > 2000;
      }
      if (bad) {
        problem = is_native
          ? 'spell_effects: `effect` is followed by a native effect\'s number (0x100 up, an [effect N] section with play =) and its frame: effect 0x200:0 all'
          : 'spell_effects is up to 24 of  [limit | effect] number:frame [all] [visual], or hit:frame  (0x1b:40, limit 178:60 all visual, effect 0x200:10 all, hit:70)';
      } else {
        flags.push(is_limit ? SEQ_LIMIT : is_native ? SEQ_NATIVE : null);
        is_limit = false;
        is_native = false;
      }
    }
    q = word_end;
  }
  if (problem || is_limit || is_skip || is_native) {
    if (!problem) {
      problem = is_skip ? 'spell_effects: `skip` must be followed by a number of frames'
        : is_native ? 'spell_effects: `effect` must be followed by number:frame'
          : 'spell_effects: `limit` must be followed by number:frame';
    }
  }
  return problem;
}

// [12] character, [12 L-P] limit, [12 L-P set] set_limit, [12 state NAME] state, [test] test; null: refused.
// (Whether the ID is a character the character file defines is not known here.)
export function section_kind(header) {
  const s = header;
  const [start, stop] = trim(s, 0, s.length);
  if (stop - start === 6 && word_is(s, start + 1, stop - 1, 'test') && s[stop - 1] === ']') return 'test';
  let [ok, p, ident] = parse_number(s, start + 1, stop);
  if (!ok || !(NEW_CHARACTER_FIRST_ID <= ident && ident < NEW_CHARACTER_FIRST_ID + ROSTER_MAX)) return null;
  while (p < stop && is_space(s[p])) p += 1;
  if (stop - p >= 6 && word_is(s, p, p + 5, 'state') && (is_space(s[p + 5]) || s[p + 5] === ']')) {
    const [a, b] = trim(s, p + 5, stop - 1);
    return s[stop - 1] === ']' && state_name(s, a, b) ? 'state' : null;
  }
  if (ch(s, p) === ']') return 'character';
  if (stop - p < 4 || !inRange(s[p], '1', '4') || s[p + 1] !== '-' || !inRange(s[p + 2], '1', '3') ||
      s[stop - 1] !== ']' || (s[p + 3] !== ']' && !is_space(s[p + 3]))) return null;
  const [a, b] = trim(s, p + 3, stop - 1);
  return b > a ? 'set_limit' : 'limit';
}

register(FILE, check, 90, section_kind);
