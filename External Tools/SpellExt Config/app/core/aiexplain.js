// The port of sxcfg/aiexplain.py: a decompiler for FF7's battle AI scripts, in plain English, for the AI page's
// focused editor. The operand stack is simulated through the script: values become expressions, and the instructions
// that consume them become statements. Conditional jumps become If / Otherwise blocks where the flow is a clean nest;
// anything else stays honest ("If not ..., go to L0019"). Every instruction belongs to exactly one English line (its
// pcs), so each line maps back to the source lines it came from.
// Node 22 language level.
import * as t from './aitool.js';
import { pySplit } from './py.js';

// ---- plain words for the addresses (ai_tool's names) -------------------------------------------------------------
export const PLAIN = new Map([
  ['last_command', 'the last command used'], ['last_action', 'the last action'], ['bank_value', 'the bank value'],
  ['battle_type', 'the battle type'], ['color_mask', 'the colour mask'], ['form', 'the form (0-3, from a transforming limit)'],
  ['active_actors', 'the actors acting now'], ['self_mask', 'me'], ['target_mask', 'the targets'],
  ['allies_mask', 'my living allies'], ['dead_allies_mask', 'my dead allies'], ['enemies_mask', 'the living enemies'],
  ['dead_enemies_mask', 'the dead enemies'], ['party_mask', 'the party'], ['enemy_actors_mask', 'the enemy side'],
  ['all_actors_mask', 'every actor'], ['end_battle_flags', 'the end-of-battle flags'],
  ['last_elements', "the last attack's elements"], ['formation', "this battle's formation id"],
  ['last_attack_id', "the last attack's id"], ['battle_flags', 'the battle flags'],
  ['special_attack_flags', 'the special attack flags'], ['limit_divisor', 'the limit divisor'], ['gil', "the party's gil"],
  // one per actor
  ['statuses', 'status word'], ['state_flags', 'state flags'], ['ai_controlled', 'AI-controlled flag (bit 4024)'],
  ['back_row', 'back-row flag'], ['immune_physical', 'immune-to-physical flag'], ['immune_magic', 'immune-to-magic flag'],
  ['index', 'index'], ['level', 'level'], ['element_response', 'element response'], ['character_id', 'character id'],
  ['strength', 'strength'], ['magic', 'magic'], ['evade', 'evade'], ['idle_anim', 'idle animation'],
  ['damage_anim', 'damage animation'], ['back_damage', 'back-attack damage'], ['size', 'size'], ['dexterity', 'dexterity'],
  ['luck', 'luck'], ['idle_holder', 'idle holder'], ['last_covered', 'last covered'], ['last_targets', 'last targets'],
  ['last_attacker', 'last attacker'], ['last_physical_attacker', 'last physical attacker'],
  ['last_magical_attacker', 'last magical attacker'], ['defense', 'defense'], ['mdefense', 'magic defense'],
  ['formation_id', 'formation id'], ['absorbed_elements', 'absorbed elements'], ['mp', 'MP'], ['max_mp', 'max MP'],
  ['hp', 'HP'], ['max_hp', 'max HP'], ['initial_statuses', 'starting statuses'], ['mevade', 'magic evade'], ['row', 'row'],
  ['camera_data', 'camera data'], ['gil_stolen', 'gil stolen'], ['item_stolen', 'item stolen'], ['miss_anim', 'miss animation'],
  ['ap', 'AP'], ['gil_value', 'gil given'], ['exp_value', 'EXP given'],
]);
export const MASK_NAMES = new Set(['self_mask', 'target_mask', 'allies_mask', 'dead_allies_mask', 'enemies_mask',
  'dead_enemies_mask', 'party_mask', 'enemy_actors_mask', 'all_actors_mask', 'active_actors', 'last_targets',
  'last_attacker', 'last_physical_attacker', 'last_magical_attacker', 'last_covered']);
const SIZES = ['bit', 'byte', 'word', 'dword'];
export const CMP_WORDS = new Map([[0x40, 'is'], [0x41, 'is not'], [0x42, 'is at least'], [0x43, 'is at most'],
  [0x44, 'is more than'], [0x45, 'is less than']]);
const CMP_NEG = new Map([[0x40, 0x41], [0x41, 0x40], [0x42, 0x45], [0x43, 0x44], [0x44, 0x43], [0x45, 0x42]]);
const ARITH = new Map([[0x30, '+'], [0x31, '-'], [0x32, '*'], [0x33, '/'], [0x34, 'mod'], [0x35, 'bits-and'], [0x36, 'bits-or']]);

export const LEGEND = 'Read from the interpreter\'s rules (FUN_005d7fe4), not seen in the game. "me" is the actor running the ' +
  'script; "the targets" is target_mask, which an attack is aimed at. A value read at 4000 and up is one per ' +
  'actor: "my HP", "HP of the living enemies"; comparing such values picks the actors that match. var XXXX is ' +
  'one of the actor\'s own variables (a bit address). Click a line on either side to see its partner.';

const hx = (n, w) => n.toString(16).padStart(w || 0, '0');
function addr_name(a) {
  return t.ADDR_NAMES.has(a) ? t.ADDR_NAMES.get(a) : null;
}

export function num(v) {
  return v < 10 ? String(v) : '0x' + hx(v) + ' (' + v + ')';
}

// A value on the stack: its English, the instructions that made it, and what it is.
export class Ex {
  constructor(text, pcs, kind, o) {
    o = o || {};
    this.text = text;
    this.pcs = pcs.slice();
    this.kind = kind || 'val';
    this.const = o.const === undefined ? null : o.const;
    this.name = o.name === undefined ? null : o.name;
    this.per_actor = !!o.per_actor;
    this.owner = o.owner === undefined ? null : o.owner;
    this.size = o.size === undefined ? null : o.size;
    this.addr = o.addr === undefined ? null : o.addr;
    this.is_mask = !!o.is_mask;
    this.cmp = o.cmp === undefined ? null : o.cmp;
    this.subject = false;
  }

  paren() {
    return ['const', 'load', 'addr', 'simple'].indexOf(this.kind) >= 0 ? this.text : '(' + this.text + ')';
  }
}

export class Line {
  constructor(indent, text, pcs, kind) {
    this.indent = indent;
    this.text = text;
    this.pcs = pcs.slice();
    this.kind = kind || 'stmt';
  }

  as_dict(rel) {
    rel = rel || 0;
    return { indent: this.indent, text: this.text, kind: this.kind, pcs: this.pcs.map(p => p - rel) };
  }
}

// Command and attack names from a kernel's text sections (17: command names, 18: magic names), if given.
export class Names {
  constructor(kernel_bytes) {
    this.commands = new Map(t.COMMANDS);
    this.attacks = new Map();
    if (kernel_bytes && kernel_bytes.length) {
      try {
        const secs = t.kernel_sections(kernel_bytes);
        for (const [k, target] of [[17, this.commands], [18, this.attacks]]) {
          if (k >= secs.length) throw new RangeError('list index out of range');
          const sec = secs[k];
          const n = Math.floor(t.u16(sec, 0) / 2);
          for (let i = 0; i < n; i++) {
            const o = t.u16(sec, 2 * i);
            const e = sec.indexOf(0xff, o);
            if (e < 0 || o > sec.length) throw new RangeError('subsection not found');
            const name = t.ff7_text(sec.subarray(o, e)).slice(1, -1);
            if (name) target.set(i, name);
          }
        }
      } catch (e) {
        // as the reference: names read so far are kept, the rest is left out
      }
    }
  }

  command(v) { return this.commands.has(v) ? this.commands.get(v) : null; }

  attack(v) { return this.attacks.has(v) ? this.attacks.get(v) : null; }
}

const pyIn = (v, list) => list.indexOf(v) >= 0;

export class Decompiler {
  // ins: [[pc, op, length, operand]] in order (ai_tool.walk_script); jump operands are relative to `start`
  constructor(ins, start, names) {
    this.ins = ins;
    this.start = start;
    this.names = names || new Names();
    this.idx = new Map();
    ins.forEach((x, i) => this.idx.set(x[0], i));
    this.claimed = new Set();
    this.goto_targets = new Set();
    this.reach = this._reachability();
    this.attack_vars = this._attack_vars();
  }

  // ---- flow ----------------------------------------------------------------------------------------------------
  _target_index(i) {
    const v = this.ins[i][3];
    const k = this.start + v;
    return this.idx.has(k) ? this.idx.get(k) : null;
  }

  _reachability() {
    const seen = new Array(this.ins.length).fill(false);
    const todo = this.ins.length ? [0] : [];
    while (todo.length) {
      let i = todo.pop();
      while (i >= 0 && i < this.ins.length && !seen[i]) {
        seen[i] = true;
        const op = this.ins[i][1];
        if (op === 0x70 || op === 0x71 || op === 0x72) {
          const tg = this._target_index(i);
          if (tg !== null) todo.push(tg);
          if (op === 0x72) break;
        }
        if (op === 0x73) break;
        i += 1;
      }
    }
    return seen;
  }

  // Local variables read straight into attack's operands: {address: 'command' | 'attack'}
  _attack_vars() {
    const out = new Map();
    this.ins.forEach(([, op], i) => {
      if (op === 0x92 && i >= 2) {
        for (const [role, j] of [['command', i - 2], ['attack', i - 1]]) {
          const o2 = this.ins[j][1];
          const v2 = this.ins[j][3];
          if ((o2 === 0x00 || o2 === 0x01 || o2 === 0x02 || o2 === 0x03) && v2 < 0x2000) out.set(v2, role);
        }
      }
    });
    return out;
  }

  // No reachable jump from outside [a, b) lands inside it (except `allowed_entries` {target: source}), and no
  // reachable jump inside leaves it except to b or to `exits`.
  _jumps_ok(a, b, allowed_entries, exits) {
    exits = exits || [];
    for (let j = 0; j < this.ins.length; j++) {
      const op = this.ins[j][1];
      if (!(op === 0x70 || op === 0x71 || op === 0x72) || !this.reach[j]) continue;
      const tg = this._target_index(j);
      if (tg === null) return false;
      const inside_src = a <= j && j < b;
      if (inside_src) {
        if (!((a <= tg && tg <= b) || pyIn(tg, exits))) return false;
      } else if (a <= tg && tg < b && (allowed_entries.has(tg) ? allowed_entries.get(tg) : undefined) !== j) {
        return false;
      }
    }
    return true;
  }

  // ---- stack helpers -------------------------------------------------------------------------------------------
  // The instructions of these values (and pcs) not yet given to a line.
  claim(...items) {
    const out = [];
    for (const it of items) {
      const pcs = it instanceof Ex ? it.pcs : [it];
      for (const p of pcs) {
        if (!this.claimed.has(p)) {
          this.claimed.add(p);
          out.push(p);
        }
      }
    }
    return out;
  }

  static pop(stack) {
    if (stack.length) return stack.pop();
    return new Ex('a value from before (the stack is empty here)', [], 'simple');
  }

  // ---- expressions ---------------------------------------------------------------------------------------------
  addr_ex(op, v, pc, load) {
    const size = SIZES[op & 3];
    const name = addr_name(v);
    const per_actor = v >= 0x4000;
    let text;
    if (v < 0x2000) {
      text = 'var ' + hx(v, 4);
      if (this.attack_vars.has(v)) text += ' (the ' + this.attack_vars.get(v) + ' to use)';
    } else if (v === 0x4000 && size === 'bit') {
      text = 'death status';
    } else if (name) {
      if (name.startsWith('st_')) text = name.slice(3).split('_').join(' ') + ' status';
      else text = PLAIN.has(name) ? PLAIN.get(name) : name.split('_').join(' ');
    } else {
      text = per_actor ? size + ' ' + hx(v, 4) : 'global ' + size + ' ' + hx(v, 4);
    }
    let text_full;
    if (per_actor && load) text_full = 'the ' + text + ' of each actor';
    else if (per_actor) text_full = 'the ' + text + ' of each actor (as a place to write)';
    else text_full = text;
    return new Ex(text_full, [pc], load ? 'load' : 'addr', { name: text, per_actor, size, addr: v,
                                                            is_mask: Boolean(load && MASK_NAMES.has(name)) });
  }

  owned(owner, field) {
    if (owner.text === 'me') return 'my ' + field;
    return field + ' of ' + owner.paren();
  }

  // a = actor mask, b = per-actor value or address
  mask_ex(a, b, pc) {
    if (b.per_actor && (b.kind === 'load' || b.kind === 'addr')) {
      const text = this.owned(a, b.name);
      return new Ex(text, a.pcs.concat(b.pcs, [pc]), b.kind, { name: b.name, per_actor: true, owner: a, size: b.size,
                                                               addr: b.addr, is_mask: b.is_mask });
    }
    return new Ex(b.paren() + ', for ' + a.paren() + ' only', a.pcs.concat(b.pcs, [pc]), 'val', { per_actor: true, owner: a });
  }

  compare_ex(op, a, b, pc) {
    const word = CMP_WORDS.get(op);
    const pcs = a.pcs.concat(b.pcs, [pc]);
    if (a.per_actor && a.owner !== null && a.kind === 'load' && a.owner.text === 'me') {
      // about me only: reads as a plain yes / no
      if (a.size === 'bit' && (b.const === 0 || b.const === 1) && (op === 0x40 || op === 0x41)) {
        const has = (b.const === 1) === (op === 0x40);
        return new Ex('I ' + (has ? 'have' : 'do not have') + ' ' + a.name, pcs, 'cmp', { cmp: null });
      }
      return new Ex('my ' + a.name + ' ' + word + ' ' + b.paren(), pcs, 'cmp',
                    { cmp: [op, new Ex('my ' + a.name, [], 'simple'), b] });
    }
    if (a.per_actor && a.owner !== null && a.kind === 'load') {
      const owner = a.owner;
      if (a.size === 'bit' && (b.const === 0 || b.const === 1) && (op === 0x40 || op === 0x41)) {
        const has = (b.const === 1) === (op === 0x40);
        const who = owner.text === 'me' ? 'me' : owner.paren();
        return new Ex('those of ' + who + ' who ' + (has ? 'have' : 'do not have') + ' ' + a.name, pcs, 'cmp',
                      { is_mask: true, cmp: [op, a, b] });
      }
      const text = 'those of ' + (owner.text !== 'me' ? owner.paren() : 'me') + ' whose ' + a.name + ' ' + word + ' ' + b.paren();
      return new Ex(text, pcs, 'cmp', { is_mask: true, cmp: [op, a, b] });
    }
    return new Ex(a.paren() + ' ' + word + ' ' + b.paren(), pcs, 'cmp', { cmp: [op, a, b] });
  }

  negate(e) {
    if (e.size === 'bit' && e.kind === 'load') return e.text + ' is not set';
    if (e.kind === 'cmp' && e.cmp && !e.is_mask) {
      const [op, a, b] = e.cmp;
      return a.paren() + ' ' + CMP_WORDS.get(CMP_NEG.get(op)) + ' ' + b.paren();
    }
    if (e.is_mask) return e.kind !== 'cmp' ? 'there is nobody in ' + e.text : 'there is nobody among ' + e.text;
    return 'not ' + e.paren();
  }

  truth(e) {
    if (e.size === 'bit' && e.kind === 'load') return e.text + ' is set';
    if (e.is_mask) return e.kind !== 'cmp' ? 'there is anyone in ' + e.text : 'there is anyone among ' + e.text;
    return e.text;
  }

  // Words for a value stored into an address: attack and command names where the variable is used so.
  value_for(addr, value) {
    if (value.const === null) return value.text;
    const role = addr.addr !== null && addr.addr < 0x2000 ? (this.attack_vars.has(addr.addr) ? this.attack_vars.get(addr.addr) : null) : null;
    if (role === 'command') {
      const nm = this.names.command(value.const);
      return num(value.const) + ' (command' + (nm ? ': ' + nm : '') + ')';
    }
    if (role === 'attack') {
      const nm = this.names.attack(value.const);
      return num(value.const) + ' (attack' + (nm ? ': ' + nm : '') + ')';
    }
    return value.text;
  }

  // ---- the walk ----------------------------------------------------------------------------------------------------
  run() {
    const lines = [];
    this.emit(0, this.ins.length, [], 0, lines);
    // what nothing claimed (values left on the stack at the end, say): one honest line
    const rest = this.ins.map(x => x[0]).filter(pc => !this.claimed.has(pc));
    if (rest.length) {
      for (const p of rest) this.claimed.add(p);
      lines.push(new Line(0, 'Left unused on the stack at the end: ' + rest.map(p => t.OPS.get(this.ins[this.idx.get(p)][1])[0]).join(', '), rest, 'note'));
    }
    // labels for the gotos
    for (const tpc of [...this.goto_targets].sort((x, y) => x - y)) {
      let at = null;
      for (let k = 0; k < lines.length; k++) {
        if (lines[k].pcs.indexOf(tpc) >= 0) {
          at = k;
          break;
        }
      }
      const lab = new Line(at !== null ? lines[at].indent : 0, 'L' + hx(tpc - this.start, 4) + ':', [], 'label');
      if (at === null) lines.push(lab);
      else lines.splice(at, 0, lab);
    }
    return lines;
  }

  // English for ins[i:end] with the stack as it is at i. Returns the stack at end, or null if no path falls out of
  // the range (it ended or jumped away).
  emit(i, end, stack, ind, out) {
    const pop = () => Decompiler.pop(stack);
    while (i < end) {
      const [pc, op, , v] = this.ins[i];
      if (!this.reach[i]) {
        let j = i;
        while (j < end && !this.reach[j]) j++;
        const pcs = [];
        for (let k = i; k < j; k++) pcs.push(this.ins[k][0]);
        for (const p of pcs) this.claimed.add(p);
        const words = [];
        for (let k = i; k < j; k++) words.push(this.mnemonic(k));
        out.push(new Line(ind, 'Never runs (no path reaches it): ' + words.join('; '), pcs, 'dead'));
        i = j;
        continue;
      }
      const name = t.OPS.get(op)[0];
      if (op === 0x00 || op === 0x01 || op === 0x02 || op === 0x03) {
        stack.push(this.addr_ex(op, v, pc, true));
      } else if (op === 0x10 || op === 0x11 || op === 0x12 || op === 0x13) {
        stack.push(this.addr_ex(op, v, pc, false));
      } else if (op === 0x60 || op === 0x61 || op === 0x62) {
        stack.push(new Ex(num(v), [pc], 'const', { const: v }));
      } else if (ARITH.has(op)) {
        const b = pop();
        const a = pop();
        if (op === 0x34 && a.kind === 'rand' && b.const !== null && b.const > 0) {
          stack.push(new Ex('a random number from 0 to ' + (b.const - 1), a.pcs.concat(b.pcs, [pc]), 'simple'));
        } else {
          stack.push(new Ex(a.paren() + ' ' + ARITH.get(op) + ' ' + b.paren(), a.pcs.concat(b.pcs, [pc])));
        }
      } else if (op === 0x37) {
        const a = pop();
        stack.push(new Ex('bits-not ' + a.paren(), a.pcs.concat([pc])));
      } else if (CMP_WORDS.has(op)) {
        const b = pop();
        const a = pop();
        stack.push(this.compare_ex(op, a, b, pc));
      } else if (op === 0x50 || op === 0x51) {
        const b = pop();
        const a = pop();
        const both_masks = a.is_mask && b.is_mask;
        let text;
        if (op === 0x50) {
          const same = both_masks && b.kind === 'cmp' && b.cmp && b.cmp[1].owner !== null && b.cmp[1].owner.text === a.text;
          text = same ? b.text : both_masks ? b.text + ', among ' + a.paren() : a.paren() + ' and ' + b.paren();
        } else {
          text = a.paren() + ' or ' + b.paren();
        }
        stack.push(new Ex(text, a.pcs.concat(b.pcs, [pc]), op === 0x50 && both_masks && b.kind === 'cmp' ? 'cmp' : 'val',
                          { is_mask: both_masks, cmp: op === 0x50 && both_masks ? b.cmp : null }));
      } else if (op === 0x52) {
        const a = pop();
        stack.push(new Ex(this.negate(a), a.pcs.concat([pc])));
      } else if (op === 0x80) {
        const b = pop();
        const a = pop();
        stack.push(this.mask_ex(a, b, pc));
      } else if (op === 0x81) {
        stack.push(new Ex('a random number (0 to 65535)', [pc], 'rand'));
      } else if (op === 0x82) {
        const a = pop();
        stack.push(new Ex('one of ' + a.paren() + ', picked at random', a.pcs.concat([pc]), 'simple', { is_mask: true }));
      } else if (op === 0x83) {
        const a = pop();
        stack.push(new Ex('how many of ' + a.paren() + ' there are', a.pcs.concat([pc]), 'simple'));
      } else if (op === 0x84 || op === 0x85) {
        const a = pop();
        const most = op === 0x84 ? 'most' : 'least';
        let text;
        if (a.per_actor && a.owner !== null && a.name) {
          text = 'whoever of ' + (a.owner.text === 'me' ? 'me' : a.owner.paren()) + ' has the ' + most + ' ' + a.name;
        } else {
          text = 'the actor(s) with the ' + most + ' ' + a.paren();
        }
        stack.push(new Ex(text, a.pcs.concat([pc]), 'simple', { is_mask: true }));
      } else if (op === 0x86) {
        const a = pop();
        const nm = a.const !== null ? this.names.attack(a.const) : null;
        stack.push(new Ex('the MP cost of attack ' + a.text + (nm ? ' (' + nm + ')' : ''), a.pcs.concat([pc]), 'simple'));
      } else if (op === 0x87) {
        const a = pop();
        stack.push(new Ex('bit ' + a.paren(), a.pcs.concat([pc]), 'simple', { is_mask: true }));
      } else if (op === 0x90) {
        const b = pop();
        const a = pop();
        let text;
        if (a.addr === 0x2070 && a.kind === 'addr') {
          text = 'Aim at: ' + (b.text ? b.text[0].toUpperCase() + b.text.slice(1) : b.text) + '.';
        } else {
          const target = a.kind === 'addr' ? a.text : 'the place ' + a.paren();
          text = 'Set ' + target + ' to ' + this.value_for(a, b) + '.';
        }
        out.push(new Line(ind, text, this.claim(a, b, pc)));
      } else if (op === 0x74 || op === 0x91) {
        const a = pop();
        const text = a.subject ? 'Done with ' + a.text + '.' : 'Discard ' + a.text + '.';
        out.push(new Line(ind, text, this.claim(a, pc), 'minor'));
      } else if (op === 0xa1) {
        const b = pop();
        const a = pop();
        out.push(new Line(ind, 'Discard ' + a.text + ' and ' + b.text + '.', this.claim(a, b, pc), 'minor'));
      } else if (op === 0x92) {
        const b = pop();
        const a = pop();
        const cmd = a.const === null ? 'command ' + a.text
          : (this.names.command(a.const) || '?') + ' (command 0x' + hx(a.const, 2) + ')';
        let atk;
        if (b.const !== null) {
          const nm = (a.const === null || [0x02, 0x03, 0x0d, 0x14, 0x20].indexOf(a.const) >= 0) && a.const !== 0x20
            ? this.names.attack(b.const) : null;
          atk = 'attack 0x' + hx(b.const, 2) + (nm ? ' (' + nm + ')' : '');
          if (a.const === 0x20) atk += ' (one of this scene\'s enemy attacks)';
        } else {
          atk = 'attack ' + b.text;
        }
        out.push(new Line(ind, 'Act: ' + cmd + ', ' + atk + ', on the targets.', this.claim(a, b, pc), 'act'));
      } else if (op === 0x93) {
        out.push(new Line(ind, 'Say: ' + t.ff7_text(v), this.claim(pc), 'act'));
      } else if (op === 0x94) {
        const b = pop();
        const a = pop();
        out.push(new Line(ind, 'Copy HP, MP, statuses and timers of ' + b.paren() + ' to ' + a.paren() + '.', this.claim(a, b, pc), 'act'));
      } else if (op === 0x95) {
        const b = pop();
        const a = pop();
        let text;
        if (a.const === 0) text = 'Read byte ' + b.text + ' of the field banks into the bank value.';
        else if (a.const === 1) text = 'Write the bank value to byte ' + b.text + ' of the field banks.';
        else text = 'Field banks, mode ' + a.text + ', byte ' + b.text + '.';
        out.push(new Line(ind, text, this.claim(a, b, pc)));
      } else if (op === 0x96) {
        const b = pop();
        const a = pop();
        out.push(new Line(ind, 'Aim at those of ' + a.paren() + ' whose response to element ' + b.text + ' is not 3 (and note each one\'s ' +
                               'response).', this.claim(a, b, pc)));
      } else if (op === 0xa0) {
        const [count, text] = v;
        const vals = [];
        for (let k = 0; k < count; k++) vals.push(pop());
        out.push(new Line(ind, 'Debug print ' + t.ascii_text(text) + '.', this.claim(...vals, pc), 'minor'));
      } else if (op === 0x75) {
        const a = pop();
        out.push(new Line(ind, 'From now on, run entry ' + a.text + ' of this AI instead.', this.claim(a, pc), 'act'));
      } else if (op === 0x73) {
        out.push(new Line(ind, 'End.', this.claim(pc), 'end'));
        // what follows (reached by a jump) is handled by the caller's structure, or by labels
        if (!this._more_reachable(i + 1, end)) {
          if (i + 1 < end) this.emit(i + 1, end, [], ind, out);
          return null;
        }
        stack = [];
      } else if (op === 0x72) {
        const tg = this._target_index(i);
        let nxt = i + 1;
        while (nxt < this.ins.length && !this.reach[nxt]) nxt++;
        if (tg !== null && (tg === end || tg === nxt)) {
          out.push(new Line(ind, '(on to what follows this block)', this.claim(pc), 'minor'));
        } else {
          this.goto_targets.add(this.start + v);
          out.push(new Line(ind, 'Go to L' + hx(v, 4) + '.', this.claim(pc), 'goto'));
        }
        i += 1;
        if (!this._more_reachable(i, end)) {
          this.emit(i, end, [], ind, out);
          return null;
        }
        stack = stack.slice();
        continue;
      } else if (op === 0x70 || op === 0x71) {
        const done = this.conditional(i, end, stack, ind, out);
        if (done !== null) {
          i = done[0];
          stack = done[1];
          if (stack === null) {
            // neither branch falls out: what is left is reached only through labels, if at all
            if (i < end) this.emit(i, end, [], ind, out);
            return null;
          }
          continue;
        }
      } else {
        out.push(new Line(ind, 'Raw: ' + name, this.claim(pc), 'raw'));
      }
      i += 1;
    }
    return stack;
  }

  mnemonic(k) {
    const [, op, , v] = this.ins[k];
    const [name, kind] = t.OPS.get(op);
    if (kind === 'J') return name + ' L' + hx(v, 4);
    if (kind === 'I1' || kind === 'I2' || kind === 'I3' || kind === 'A') return name + ' ' + hx(v);
    return name;
  }

  _more_reachable(i, end) {
    for (let k = i; k < end; k++) if (this.reach[k]) return true;
    return false;
  }

  // jz / jne at i: structured when the flow allows, else a goto. Returns [next index, stack] or null.
  conditional(i, end, stack, ind, out) {
    const [pc, op, , v] = this.ins[i];
    let cond_true;
    let cond_jump;
    let used;
    if (op === 0x70) {
      const c = Decompiler.pop(stack);
      cond_true = this.truth(c);
      cond_jump = this.negate(c);
      used = [c];
    } else {
      const b = Decompiler.pop(stack);
      const a = stack.length ? stack[stack.length - 1] : new Ex('a value from before (the stack is empty here)', [], 'simple');
      a.subject = true;
      cond_true = a.paren() + ' is ' + b.paren();
      cond_jump = a.paren() + ' is not ' + b.paren();
      used = [a, b];
    }
    const tg = this._target_index(i);
    if (tg !== null && i < tg && tg <= end) {
      // the last instruction of the then-range that runs
      let last = tg - 1;
      while (last > i && !this.reach[last]) last--;
      let e = null;
      if (last > i && this.ins[last][1] === 0x72) {
        e = this._target_index(last);
        if (e === null || !(tg < e && e <= end)) e = null;
      }
      if (e !== null && this._jumps_ok(i + 1, last, new Map(), []) &&
          this._jumps_ok(tg, e, new Map([[tg, i]])) && this._only_entry(i + 1, last, tg, e, i, last)) {
        // If ... Otherwise ...
        out.push(new Line(ind, 'If ' + cond_true + ':', this.claim(...used, pc), 'if'));
        const s_then = this.emit(i + 1, last, stack.slice(), ind + 1, out);
        let k = out.length;
        out.push(new Line(ind, 'Otherwise:', this.claim(this.ins[last][0]), 'else'));
        // dead instructions between the jump and the else-start belong to the then-branch
        if (last + 1 < tg) {
          const dead = [];
          this.emit(last + 1, tg, [], ind + 1, dead);
          out.splice(k, 0, ...dead);
          k += dead.length;
        }
        const else_lines = [];
        const s_else = this.emit(tg, e, stack.slice(), ind + 1, else_lines);
        Decompiler._flatten_else(out, k, else_lines, ind);
        const join = s_then !== null ? s_then : s_else;
        return [e, join];
      }
      if (this._jumps_ok(i + 1, tg, new Map()) && this._only_entry(i + 1, tg, null, null, i, null)) {
        out.push(new Line(ind, 'If ' + cond_true + ':', this.claim(...used, pc), 'if'));
        const s_then = this.emit(i + 1, tg, stack.slice(), ind + 1, out);
        const join = s_then === null ? stack : (s_then.length === stack.length ? s_then : stack);
        return [tg, join.slice()];
      }
    }
    // not a clean nest: a goto
    this.goto_targets.add(this.start + v);
    out.push(new Line(ind, 'If ' + cond_jump + ', go to L' + hx(v, 4) + '.', this.claim(...used, pc), 'goto'));
    return [i + 1, stack];
  }

  // Reachable jumps from outside may enter [a, b) and [t, e) only as the structure says.
  _only_entry(a, b, tg, e, cond, final_jump) {
    for (let j = 0; j < this.ins.length; j++) {
      const op = this.ins[j][1];
      if (!(op === 0x70 || op === 0x71 || op === 0x72) || !this.reach[j] || j === cond || j === final_jump) continue;
      const x = this._target_index(j);
      if (x === null) continue;
      if (a <= x && x < b && !(a <= j && j < b)) return false;
      if (tg !== null && tg <= x && x < e && !(tg <= j && j < e)) return false;
    }
    return true;
  }

  // 'Otherwise:' + a lone If chain at the next level reads as 'Otherwise, if ...:'.
  static _flatten_else(out, k, else_lines, ind) {
    const top = else_lines.filter(l => l.indent === ind + 1);
    if (top.length && top[0].kind === 'if' && top.every(l => ['if', 'else', 'elif'].indexOf(l.kind) >= 0) &&
        top.filter(l => l.kind === 'if').length === 1) {
      const first = else_lines[0];
      const other = out[k];
      other.text = 'Otherwise, if ' + first.text.slice(3);
      other.pcs = other.pcs.concat(first.pcs);
      other.kind = 'elif';
      for (const l of else_lines.slice(1)) l.indent -= 1;
      for (const l of else_lines.slice(1)) out.push(l);
    } else {
      for (const l of else_lines) out.push(l);
    }
  }
}

// ---- entry points --------------------------------------------------------------------------------------------------
// A script of a block (ai_tool.walk_script from `start`): [lines, instructions]
export function explain_block_script(block, start, names) {
  const ins = t.walk_script(block, start, block.length)[1];
  const d = new Decompiler(ins, start, names);
  return [d.run(), ins];
}

export const SECTION_INDEX = new Map(['init', 'main', 'counter', 'death', 'physical', 'magical', 'battle_end',
  'pre_action', 'custom1', 'custom2', 'custom3', 'custom4', 'custom5', 'custom6', 'custom7', 'custom8'].map((n, i) => [n, i]));

// A card's script text: assembled alone, decompiled, every English line mapped to the body's lines.
// {ok, lines: [{indent, text, kind, src: [body line numbers]}], legend, size} or {ok: false, error, error_line, ...}
export function explain_text(body, kernel_bytes, section) {
  section = section || 'init';
  const head = 'table 1\nentry 0\nscript ' + section + '\n';
  let block;
  try {
    block = t.assemble(head + body);
  } catch (ex) {
    if (!(ex instanceof t.AIError)) throw ex;
    const msg = ex.message;
    const m = /^line ([0-9]+): ([^\n]*)/.exec(msg);
    const line = m ? Number(m[1]) - 3 : 0;
    return { ok: false, error: m ? m[2] : msg, error_line: line, lines: [], legend: LEGEND };
  }
  const sec = SECTION_INDEX.has(section) ? SECTION_INDEX.get(section) : 0;
  const eo = t.u16(block, 0);
  const so = t.u16(block, eo + 2 * sec);
  const start = eo + so;
  let lines;
  let ins;
  try {
    [lines, ins] = explain_block_script(block, start, new Names(kernel_bytes));
  } catch (ex) {
    if (!(ex instanceof t.AIError)) throw ex;
    return { ok: false, error: ex.message, error_line: 0, lines: [], legend: LEGEND };
  }
  // the k-th instruction line of the body is the k-th instruction assembled
  const ins_lines = [];
  body.split('\n').forEach((text, k) => {
    let toks;
    try {
      toks = t.tokenize(text);
    } catch (e) {
      if (!(e instanceof t.AIError)) throw e;
      toks = [];
    }
    while (toks.length && toks[0].endsWith(':') && !toks[0].startsWith('"') && toks[0].slice(0, -1).indexOf(':') < 0) toks.shift();
    if (toks.length) ins_lines.push(k + 1);
  });
  const pc_line = new Map();
  ins.forEach(([ipc], k) => {
    if (k < ins_lines.length) pc_line.set(ipc, ins_lines[k]);
  });
  const unreached = ins_lines.slice(ins.length);
  const out = [];
  for (const l of lines) {
    const src = [...new Set(l.pcs.filter(p => pc_line.has(p)).map(p => pc_line.get(p)))].sort((x, y) => x - y);
    out.push({ indent: l.indent, text: l.text, kind: l.kind, src });
  }
  if (unreached.length) {
    out.push({ indent: 0, text: 'After the last End no path reaches these lines: they are never run.', kind: 'dead', src: unreached });
  }
  return { ok: true, lines: out, legend: LEGEND, size: ins.reduce((n, x) => n + x[2], 0) };
}

// Plain text of the lines (for tests and the CLI)
export function render(lines) {
  return lines.map(l => '    '.repeat(l.indent) + l.text).join('\n');
}
void pySplit;
