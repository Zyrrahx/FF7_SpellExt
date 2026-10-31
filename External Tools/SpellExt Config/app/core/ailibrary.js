// The port of sxcfg/ailibrary.py: the AI Library. What every instruction does, what every named address means, and
// recipes (snippets with parameters) for common jobs. Nothing here has been seen in the game; every recipe is marked
// "untested in game". The recipes' builders are code, rewritten here one for one.
// Node 22 language level.
import * as t from './aitool.js';
import * as aiexplain from './aiexplain.js';
import { pyInt, pyStr, PyValueError } from './py.js';

// ---- 1. instructions ------------------------------------------------------------------------------------------------
// op: [stack before -> after, what it does, source, example body]    "a, b" = b is the top of the stack
const README = 'read from the code (FUN_005d7fe4, ai_tool_README.md)';
export const INSTRUCTIONS = new Map([
  [0x00, ['-> value', 'push the bit at the address (one value per actor from 4000 up)', README, 'load.word  self_mask\nload.bit   ai_controlled\nmask\npop']],
  [0x01, ['-> value', 'push the byte at the address', README, 'addr.byte  0000\nload.byte  0000\npush.b     01\nadd\nstore']],
  [0x02, ['-> value', 'push the 16-bit word at the address', README, 'load.word  enemies_mask\ncount\npop']],
  [0x03, ['-> value', 'push the 32-bit value at the address', README, 'load.dword gil\npop']],
  [0x10, ['-> address', 'push the address itself, as a bit (for store / mask)', README, 'load.word  self_mask\naddr.bit   ai_controlled\nmask\npush.b     01\nstore']],
  [0x11, ['-> address', 'push the address itself, as a byte', README, 'addr.byte  0000\npush.b     05\nstore']],
  [0x12, ['-> address', 'push the address itself, as a word', README, 'addr.word  target_mask\nload.word  enemies_mask\nstore']],
  [0x13, ['-> address', 'push the address itself, as a 32-bit value', README, 'addr.dword 0000\npush.b     00\nstore']],
  [0x30, ['a, b -> a+b', 'add', README, 'addr.byte  0000\nload.byte  0000\npush.b     01\nadd\nstore']],
  [0x31, ['a, b -> a-b', 'subtract', README, 'addr.byte  0000\nload.byte  0000\npush.b     01\nsub\nstore']],
  [0x32, ['a, b -> a*b', 'multiply', README, 'addr.byte  0000\nload.byte  0000\npush.b     02\nmul\nstore']],
  [0x33, ['a, b -> a/b', 'divide', README, 'addr.byte  0000\nload.byte  0000\npush.b     02\ndiv\nstore']],
  [0x34, ['a, b -> a mod b', 'remainder; "rand, push N, mod" is a random number 0 to N-1', README, 'addr.byte  0000\nrand\npush.b     03\nmod\nstore']],
  [0x35, ['a, b -> a & b', 'bitwise and', README, 'addr.byte  0000\nload.byte  0000\npush.b     0f\nband\nstore']],
  [0x36, ['a, b -> a | b', 'bitwise or', README, 'addr.byte  0000\nload.byte  0000\npush.b     10\nbor\nstore']],
  [0x37, ['a -> ~a', 'bitwise not', README, 'addr.byte  0000\nload.byte  0000\nbnot\nstore']],
  [0x40, ['a, b -> a==b', 'compare: 1 or 0 (per actor for per-actor values: the actors that match)', README, 'addr.word  target_mask\nload.word  enemies_mask\nload.byte  level\nmask\npush.b     10\neq\nstore']],
  [0x41, ['a, b -> a!=b', 'compare, not equal', README, 'load.byte  0000\npush.b     00\nne\npop']],
  [0x42, ['a, b -> a>=b', 'compare, at least', README, 'load.byte  0000\npush.b     03\nge\npop']],
  [0x43, ['a, b -> a<=b', 'compare, at most', README, 'load.byte  0000\npush.b     03\nle\npop']],
  [0x44, ['a, b -> a>b', 'compare, more than', README, 'load.byte  0000\npush.b     03\ngt\npop']],
  [0x45, ['a, b -> a<b', 'compare, less than', README, 'load.byte  0000\npush.b     03\nlt\npop']],
  [0x50, ['a, b -> a and b', 'logical and (of actor masks: the actors in both)', README, 'load.word  enemies_mask\nload.word  target_mask\nand\npop']],
  [0x51, ['a, b -> a or b', 'logical or', README, 'load.byte  0000\nload.byte  0008\nor\npop']],
  [0x52, ['a -> not a', 'logical not', README, 'load.byte  0000\nnot\npop']],
  [0x60, ['-> n', 'push a 1-byte constant', README, 'addr.byte  0000\npush.b     07\nstore']],
  [0x61, ['-> n', 'push a 2-byte constant', README, 'addr.word  0000\npush.w     0100\nstore']],
  [0x62, ['-> n', 'push a 3-byte constant', README, 'addr.dword 0000\npush.3     010000\nstore']],
  [0x70, ['c ->', 'pop c; jump to the label if c is 0 (the If of an if)', README, 'load.byte  0000\njz         Lskip\nsay        "Yes"\nLskip:  end']],
  [0x71, ['a, b -> a', 'pop b; jump if b differs from a; a stays (one case of a switch)', README, 'load.byte  0000\npush.b     01\njne        Lnot1\nsay        "One"\nLnot1:  drop\nend']],
  [0x72, ['->', 'jump to the label', README, 'jmp        Ldone\nsay        "never"\nLdone:  end']],
  [0x73, ['->', 'end of the script', README, 'end']],
  [0x74, ['a ->', 'drop the top value', README, 'push.b     01\npop']],
  [0x75, ['n ->', 'from now on this character runs entry n (the DLL keeps it inside the character\'s own block)', README, 'push.b     01\nlink']],
  [0x80, ['a, b -> b for a', 'a = actor mask, b = per-actor value or address: b for those actors only', README, 'load.word  self_mask\nload.word  hp\nmask\npop']],
  [0x81, ['-> r', 'push a random 16-bit number', README, 'rand\npop']],
  [0x82, ['mask -> bit', 'one of the mask\'s set bits (one actor) at random', README, 'addr.word  target_mask\nload.word  enemies_mask\nrandbit\nstore']],
  [0x83, ['mask -> n', 'how many bits (actors) the mask has', README, 'load.word  enemies_mask\ncount\npop']],
  [0x84, ['values -> mask', 'the actor(s) with the greatest per-actor value', README, 'addr.word  target_mask\nload.word  enemies_mask\nload.word  hp\nmask\nmaxof\nstore']],
  [0x85, ['values -> mask', 'the actor(s) with the least per-actor value', README, 'addr.word  target_mask\nload.word  allies_mask\nload.word  hp\nmask\nminof\nstore']],
  [0x86, ['id -> mp', 'the MP cost of an attack', README, 'push.b     1c\nmpcost\npop']],
  [0x87, ['n -> 1<<n', 'the bit for n (an actor slot number to a mask)', README, 'addr.word  target_mask\npush.b     00\ntobit\nstore']],
  [0x90, ['address, value ->', 'write the value at the address (per actor through mask)', README, 'addr.byte  0000\npush.b     01\nstore']],
  [0x91, ['a ->', 'drop the top value', README, 'push.b     01\ndrop']],
  [0x92, ['command, attack ->', 'queue the action (command, attack id) for this actor on target_mask', README, 'addr.word  target_mask\nload.word  enemies_mask\nrandbit\nstore\npush.b     01\npush.w     0000\nattack']],
  [0x93, ['->', 'show the text (queued as command 21)', README, 'say        "Hello"']],
  [0x94, ['a, b ->', 'copy actor b\'s HP, MP, statuses and timers to actor a', README, 'load.word  self_mask\nload.word  target_mask\ncopystats']],
  [0x95, ['mode, index ->', 'mode 0 reads byte index of the field banks (00dc08dc) into bank_value; 1 writes it there', README, 'push.b     00\npush.b     10\nglobalvar']],
  [0x96, ['mask, element ->', 'element_response set for each actor of the mask; target_mask = the actors whose response is not 3', README, 'load.word  enemies_mask\npush.b     08\nelemtarget']],
  [0xa0, ['count values ->', 'the game\'s debug print; pops count values', README, 'push.b     00\ndebug      1 "value %d"']],
  [0xa1, ['a, b ->', 'drop two values', README, 'push.b     01\npush.b     02\ndrop2']],
]);

const OPERAND = { null: 'none', A: 'an address (2 bytes)', J: 'a label (2 bytes, from the script start)', I1: '1 byte',
                  I2: '2 bytes', I3: '3 bytes', S: 'a quoted text, ends with ff', D: 'a count, then a quoted text' };
const WORD_LABEL = /^[\p{L}\p{N}_]+:/u;          // Python's re.match(r'^\w+:', l) on a str
const WORD_LABEL_LINE = /^[\p{L}\p{N}_]+:\n?$/u;  // re.match(r'^\w+:$', l): $ also before a final newline

export function instructions() {
  const aliases = new Map();
  for (const [k, v] of t.ALIASES) {
    if (!aliases.has(v)) aliases.set(v, []);
    aliases.get(v).push(k);
  }
  const out = [];
  for (const [op, [name, kind]] of [...t.OPS].sort((a, b) => a[0] - b[0])) {
    const [stack, does, source, example] = INSTRUCTIONS.has(op) ? INSTRUCTIONS.get(op) : ['?', 'not described yet', 'assumed', ''];
    const operand = Object.prototype.hasOwnProperty.call(OPERAND, String(kind)) ? OPERAND[String(kind)] : kind;
    const body = example.split('\n').map(l => (!l.endsWith(':') && !WORD_LABEL.test(l) ? '        ' + l : l)).join('\n') +
                 (!example.endsWith('end') ? '\n        end\n' : '\n');
    const ex = aiexplain.explain_text(body);
    out.push({ op: op.toString(16).padStart(2, '0'), name, aliases: (aliases.get(name) || []).slice().sort(), operand,
               stack, does, source, example: body,
               english: ex.ok ? (ex.lines || []).map(l => '    '.repeat(l.indent) + l.text)
                              : ['(the example does not assemble: ' + ex.error + ')'] });
  }
  return out;
}

// ---- 2. addresses ---------------------------------------------------------------------------------------------------
// name: [meaning, read/write, typical use, confirmed where]
const CONFIRMED_MASK = 'filled before every script by FUN_005d9550 (ai_tool_README.md)';
const FFNX = 'FFNx 1.24.3 field name (src/ff7.h); not checked further in the game\'s code: treat as likely';
export const VARIABLES = new Map([
  ['self_mask', ['this actor\'s own bit', 'read', 'mask with it to read or write your own values: "my HP"', CONFIRMED_MASK]],
  ['target_mask', ['the actors the next action is aimed at', 'read / write', 'set it before attack', CONFIRMED_MASK]],
  ['allies_mask', ['living actors on my side (whether it includes me is not checked: assumed yes)', 'read', 'heal or buff an ally', CONFIRMED_MASK]],
  ['dead_allies_mask', ['dead actors on my side (FFNx calls it activeAlliesMask; the code says dead)', 'read', 'revive', CONFIRMED_MASK]],
  ['enemies_mask', ['living, targetable actors on the other side', 'read', 'aim at a random enemy', CONFIRMED_MASK]],
  ['dead_enemies_mask', ['dead actors on the other side', 'read', 'rarely', CONFIRMED_MASK]],
  ['formation', ['this battle\'s formation id', 'read', 'act only in one battle', FFNX]],
  ['form', ['the form 0-3 from a transforming limit (FFNx: limitLevel)', 'read', 'choose the limit for a form', FFNX]],
  ['ai_controlled', ['flag 0x10 of the actor: the main script runs on its turn only while it is set', 'read / write',
                     'set it in init to make a character fight by itself (as Sephiroth\'s init)', README]],
  ['immune_physical', ['flag 0x100: immune to physical attacks', 'read / write', 'set in init (as Sephiroth)', README]],
  ['immune_magic', ['flag 0x200: immune to magic', 'read / write', 'set in init (as Sephiroth)', README]],
  ['back_row', ['flag 0x40: in the back row', 'read / write', 'check or change the row', README]],
  ['statuses', ['the status word; bit 0 (the same address) is death', 'read / write', 'status checks; st_* name each bit', FFNX]],
  ['hp', ['current HP', 'read / write', 'HP checks (compare with max_hp for a share)', FFNX]],
  ['max_hp', ['maximum HP', 'read', 'HP share', FFNX]],
  ['mp', ['current MP', 'read / write', 'MP checks; mpcost gives an attack\'s cost', FFNX]],
  ['max_mp', ['maximum MP', 'read', 'MP share', FFNX]],
  ['row', ['the actor\'s row value', 'read', 'Sephiroth\'s main tests row >= 16', FFNX]],
  ['element_response', ['the response to an element, set by elemtarget (3: no effect?)', 'read', 'after elemtarget', README]],
  ['character_id', ['the character id of the actor (party: 0-11 kernel order)', 'read', 'act on one character', FFNX]],
  ['active_actors', ['the actors acting now', 'read', 'whose turn', FFNX]],
  ['last_attacker', ['who attacked this actor last (a mask)', 'read', 'counter the attacker', FFNX]],
  ['last_physical_attacker', ['who hit this actor last with a physical attack', 'read', 'physical counter', FFNX]],
  ['last_magical_attacker', ['who hit this actor last with magic', 'read', 'magic counter', FFNX]],
  ['last_command', ['the command of the last action', 'read', 'react to a command', FFNX]],
  ['last_attack_id', ['the attack id of the last action', 'read', 'react to one attack', FFNX]],
  ['bank_value', ['the byte globalvar reads or writes', 'read / write', 'field banks (affection)', README]],
]);

export function variables() {
  const out = [{ name: '0000-1fff', address: '0000-1fff', meaning: 'the actor\'s own variables (009ab4ec + actor*0x80; ' +
                 'bit addresses: byte k is 8k). 0x80 bytes hold bit addresses 0000-03ff; what lies past that is not checked.',
                 scope: 'local (this actor)', rw: 'read / write', use: 'remember a choice: the command and attack to use',
                 confirmed: 'battle_ai_resolve_address_005d7df2 (ai_tool_README.md); the upper bound is uncertain',
                 uncertain: true }];
  for (const [addr, name] of [...t.ADDR_NAMES].sort((a, b) => a[0] - b[0])) {
    const scope = addr < 0x4000 ? 'global' : 'per actor';
    let meaning;
    let rw;
    let use;
    let conf;
    if (name.startsWith('st_')) {
      meaning = 'status bit: ' + name.slice(3).split('_').join(' ');
      [rw, use, conf] = ['read / write', 'status checks and changes', FFNX];
    } else {
      [meaning, rw, use, conf] = VARIABLES.has(name) ? VARIABLES.get(name)
        : [aiexplain.PLAIN.has(name) ? aiexplain.PLAIN.get(name) : name.split('_').join(' '), 'read', '', FFNX];
    }
    out.push({ name, address: addr.toString(16).padStart(4, '0'), meaning,
               plain: aiexplain.PLAIN.has(name) ? aiexplain.PLAIN.get(name) : '', scope, rw, use, confirmed: conf,
               uncertain: conf === FFNX });
  }
  return out;
}

// ---- 3. recipes -----------------------------------------------------------------------------------------------------
const hx = (n, w) => n.toString(16).padStart(w, '0');
export const TARGETS = new Map([
  ['random_enemy', ['a random enemy', 'addr.word  target_mask\nload.word  enemies_mask\nrandbit\nstore']],
  ['all_enemies', ['all enemies', 'addr.word  target_mask\nload.word  enemies_mask\nstore']],
  ['me', ['me', 'addr.word  target_mask\nload.word  self_mask\nstore']],
  ['random_ally', ['a random ally', 'addr.word  target_mask\nload.word  allies_mask\nrandbit\nstore']],
  ['weakest_ally', ['the ally with the lowest HP', 'addr.word  target_mask\nload.word  allies_mask\nload.word  hp\nmask\nminof\nstore']],
  ['weakest_enemy', ['the enemy with the lowest HP', 'addr.word  target_mask\nload.word  enemies_mask\nload.word  hp\nmask\nminof\nstore']],
  ['last_attacker', ['whoever attacked me last', 'addr.word  target_mask\nload.word  self_mask\nload.word  last_attacker\nmask\nstore']],
]);
export const TARGET_CHOICES = [...TARGETS].map(([k, v]) => [k, v[0]]);
const target_code = k => TARGETS.get(k)[1];

export function act(cmd, atk) {
  return 'push.b     ' + hx(cmd, 2) + '\npush.w     ' + hx(atk, 4) + '\nattack';
}

function _weighted(v) {
  const n = v.count;
  const pairs = [];
  for (let k = 1; k <= n; k++) pairs.push([v['attack' + k], v['weight' + k]]);
  const total = pairs.reduce((s, [, w]) => s + w, 0) || 1;
  let lines = [target_code(v.target), 'addr.byte  ' + hx(v.scratch, 4), 'rand', 'push.w     ' + hx(total, 4), 'mod', 'store'];
  let cum = 0;
  pairs.forEach(([a, w], i) => {
    const k = i + 1;
    cum += w;
    if (k < n) lines = lines.concat(['load.byte  ' + hx(v.scratch, 4), 'push.w     ' + hx(cum, 4), 'lt', 'jz         Lnext' + k + '_' + v.uid]);
    lines.push(act(v.command, a));
    if (k < n) lines = lines.concat(['jmp        Ldone_' + v.uid, 'Lnext' + k + '_' + v.uid + ':']);
  });
  if (n > 1) lines.push('Ldone_' + v.uid + ':');
  return lines.join('\n');
}

const YESNO = [['yes', 'yes'], ['no', 'no']];
export const RECIPES = [
  { id: 'ai_on', title: 'Become AI-controlled', sections: ['init'],
    description: 'From the start of the battle this character fights by itself: its "My turn" script runs on its ' +
                 'turns (as Sephiroth\'s init does).',
    keywords: ['AI-controlled', 'to 1'], params: [],
    template: 'addr.word  self_mask\naddr.bit   ai_controlled\nmask\npush.b     01\nstore' },
  { id: 'ai_off', title: 'Stop being AI-controlled', sections: ['init', 'main', 'counter', 'battle_end'],
    description: 'The player controls this character again on its next turn.',
    keywords: ['AI-controlled', 'to 0'], params: [],
    template: 'addr.word  self_mask\naddr.bit   ai_controlled\nmask\npush.b     00\nstore' },
  { id: 'immune', title: 'Immune to physical and/or magic', sections: ['init'],
    description: 'Sets the immunity flags (as Sephiroth\'s init does).',
    keywords: ['immune'], params: [
      { name: 'physical', label: 'Immune to physical', type: 'choice', default: 'yes', choices: YESNO },
      { name: 'magic', label: 'Immune to magic', type: 'choice', default: 'yes', choices: YESNO }],
    build: v => [['physical', 'immune_physical'], ['magic', 'immune_magic']].map(([k, f]) =>
      'addr.word  self_mask\naddr.bit   ' + f + '\nmask\npush.b     ' + hx(v[k] === 'yes' ? 1 : 0, 2) + '\nstore').join('\n') },
  { id: 'attack_random', title: 'Attack a random enemy', sections: ['main', 'counter', 'physical', 'magical'],
    description: 'Aim at one living enemy at random and use the normal Attack command.',
    keywords: ['Aim at', 'living enemies', 'Act:', 'Attack'], params: [],
    template: target_code('random_enemy') + '\n' + act(0x01, 0) },
  { id: 'use_attack', title: 'Use a chosen attack', sections: ['main', 'counter', 'physical', 'magical', 'death', 'battle_end'],
    description: 'Aim at the chosen targets and use one command and attack (a spell with the Magic command, say).',
    keywords: ['Aim at', 'Act:'], params: [
      { name: 'target', label: 'Aim at', type: 'target', default: 'random_enemy' },
      { name: 'command', label: 'Command', type: 'command', default: 0x02 },
      { name: 'attack', label: 'Attack', type: 'attack', default: 0x1b }],
    build: v => target_code(v.target) + '\n' + act(v.command, v.attack) },
  { id: 'weighted', title: 'Choose between attacks by weight', sections: ['main', 'counter'],
    description: 'Pick one of up to four attacks at random, each as likely as its weight, and use it on the chosen ' +
                 'targets. Uses one of your variables for the roll.',
    keywords: ['random number', 'Act:', 'Otherwise'], params: [
      { name: 'target', label: 'Aim at', type: 'target', default: 'random_enemy' },
      { name: 'command', label: 'Command', type: 'command', default: 0x02 },
      { name: 'count', label: 'How many attacks', type: 'number', default: 2, min: 2, max: 4 },
      { name: 'attack1', label: 'Attack 1', type: 'attack', default: 0x1b },
      { name: 'weight1', label: 'Weight 1', type: 'number', default: 3, min: 1, max: 100 },
      { name: 'attack2', label: 'Attack 2', type: 'attack', default: 0x1e },
      { name: 'weight2', label: 'Weight 2', type: 'number', default: 1, min: 1, max: 100 },
      { name: 'attack3', label: 'Attack 3', type: 'attack', default: 0x21 },
      { name: 'weight3', label: 'Weight 3', type: 'number', default: 1, min: 1, max: 100 },
      { name: 'attack4', label: 'Attack 4', type: 'attack', default: 0x24 },
      { name: 'weight4', label: 'Weight 4', type: 'number', default: 1, min: 1, max: 100 },
      { name: 'scratch', label: 'Variable for the roll (byte, bit address)', type: 'number', default: 0x0060, min: 0, max: 0x03f8, hex: true, step: 8 }],
    build: _weighted },
  { id: 'counter_physical', title: 'Counter a physical hit, some of the time', sections: ['physical'],
    description: 'When hit by a physical attack, X% of the time strike back at the attacker with the chosen attack.',
    keywords: ['random number', 'less than', 'Act:'], params: [
      { name: 'percent', label: 'Chance (%)', type: 'number', default: 50, min: 1, max: 100 },
      { name: 'command', label: 'Command', type: 'command', default: 0x01 },
      { name: 'attack', label: 'Attack', type: 'attack', default: 0x00 }],
    build: v => 'rand\npush.b     64\nmod\npush.b     ' + hx(v.percent, 2) + '\nlt\njz         Lskip_' + v.uid + '\n' +
                target_code('last_attacker') + '\n' + act(v.command, v.attack) + '\nLskip_' + v.uid + ':' },
  { id: 'counter_magic', title: 'Counter magic with a spell', sections: ['magical'],
    description: 'When hit by magic, cast the chosen spell back at the attacker.',
    keywords: ['Aim at', 'Act:', 'Magic'], params: [
      { name: 'attack', label: 'Spell', type: 'attack', default: 0x1b }],
    build: v => target_code('last_attacker') + '\n' + act(0x02, v.attack) },
  { id: 'heal_weakest', title: 'Heal the ally with the lowest HP', sections: ['main'],
    description: 'Aim at the living ally with the least HP and cast the chosen healing spell.',
    keywords: ['least HP', 'Act:'], params: [
      { name: 'attack', label: 'Healing spell', type: 'attack', default: 0x00 }],
    build: v => target_code('weakest_ally') + '\n' + act(0x02, v.attack) },
  { id: 'low_hp', title: 'Act differently when my HP is low', sections: ['main'],
    description: 'When my HP is below N% of my max HP use one attack, otherwise another (both on the chosen targets).',
    keywords: ['my HP', 'less than', 'Otherwise', 'Act:'], params: [
      { name: 'percent', label: 'Below (% of max HP)', type: 'number', default: 25, min: 1, max: 100 },
      { name: 'target', label: 'Aim at', type: 'target', default: 'random_enemy' },
      { name: 'command', label: 'Command', type: 'command', default: 0x02 },
      { name: 'attack_low', label: 'Attack when low', type: 'attack', default: 0x00 },
      { name: 'attack_high', label: 'Attack otherwise', type: 'attack', default: 0x1b }],
    build: v => target_code(v.target) + '\nload.word  self_mask\nload.word  hp\nmask\npush.b     64\nmul\nload.word  self_mask\n' +
                'load.word  max_hp\nmask\ndiv\npush.b     ' + hx(v.percent, 2) + '\nlt\njz         Lhigh_' + v.uid + '\n' +
                act(v.command, v.attack_low) + '\njmp        Ldone_' + v.uid + '\nLhigh_' + v.uid + ':\n' +
                act(v.command, v.attack_high) + '\nLdone_' + v.uid + ':' },
  { id: 'formation_only', title: 'Only in one battle (formation)', sections: ['init', 'main', 'counter'],
    description: 'Do the chosen attack only when this battle\'s formation id is the one given.',
    keywords: ['formation id', 'Act:'], params: [
      { name: 'formation', label: 'Formation id', type: 'number', default: 0x0124, min: 0, max: 0xffff, hex: true },
      { name: 'target', label: 'Aim at', type: 'target', default: 'random_enemy' },
      { name: 'command', label: 'Command', type: 'command', default: 0x01 },
      { name: 'attack', label: 'Attack', type: 'attack', default: 0x00 }],
    build: v => 'load.word  formation\npush.w     ' + hx(v.formation, 4) + '\neq\njz         Lskip_' + v.uid + '\n' +
                target_code(v.target) + '\n' + act(v.command, v.attack) + '\nLskip_' + v.uid + ':' },
  { id: 'say_start', title: 'Say a line at battle start', sections: ['init'],
    description: 'Show a line of text when the battle starts.',
    keywords: ['Say:'], params: [
      { name: 'text', label: 'Text', type: 'text', default: 'Let us begin.', maxlen: 60 }],
    build: v => 'say        "' + v.text + '"' },
  { id: 'on_death', title: 'Say something when I die', sections: ['death'],
    description: 'When this character dies, show a line of text.',
    keywords: ['Say:'], params: [
      { name: 'text', label: 'Text', type: 'text', default: 'Not yet...', maxlen: 60 }],
    build: v => 'say        "' + v.text + '"' },
  { id: 'battle_end', title: 'An action at battle end', sections: ['battle_end'],
    description: 'At the end of the battle, say a line and set one of my variables (to remember the battle).',
    keywords: ['Say:', 'Set var'], params: [
      { name: 'text', label: 'Text', type: 'text', default: 'Done.', maxlen: 60 },
      { name: 'var', label: 'Variable (byte, bit address)', type: 'number', default: 0x0068, min: 0, max: 0x03f8, hex: true, step: 8 },
      { name: 'value', label: 'Value', type: 'number', default: 1, min: 0, max: 255 }],
    build: v => 'say        "' + v.text + '"\naddr.byte  ' + hx(v.var, 4) + '\npush.b     ' + hx(v.value, 2) + '\nstore' },
  { id: 'link', title: 'Switch to another entry', sections: ['init', 'main', 'counter', 'death'],
    description: 'From now on this character runs another entry of the same AI file.',
    keywords: ['From now on', 'entry'], params: [
      { name: 'entry', label: 'Entry', type: 'number', default: 1, min: 0, max: 31 }],
    build: v => 'push.b     ' + hx(v.entry, 2) + '\nlink' },
];
// printable, no " { } \ (the game text's escapes); Python's $ also matches before a final newline
export const TEXT_OK = /^[ !#-[\]-z|~]*\n?$/;

// a ValueError in Python (the routes refuse it with its words)
export class RecipeError extends PyValueError {
  constructor(message) { super(message); this.name = 'RecipeError'; }
}

export function recipe(rid) {
  for (const r of RECIPES) if (r.id === rid) return r;
  throw new RecipeError('no recipe ' + pyStr(rid));
}

// int(x, 0) of a str, int(x) of anything else, as Python does for what JSON can carry
function to_int(x) {
  if (typeof x === 'string') return pyInt(x, 0);
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') {
    if (!Number.isFinite(x)) throw new PyValueError('cannot convert float NaN to integer');
    return Math.trunc(x);
  }
  throw new TypeError('int() argument must be a string, a bytes-like object or a real number');
}

// The recipe's parameters from `given` (strings or numbers), checked; defaults for what is missing.
export function values_for(r, given) {
  const v = {};
  for (const p of r.params) {
    let x = given && Object.prototype.hasOwnProperty.call(given, p.name) ? given[p.name] : p.default;
    if (p.type === 'number' || p.type === 'attack' || p.type === 'command') {
      try {
        x = to_int(x);
      } catch (e) {
        throw new RecipeError(p.label + ' must be a number');
      }
      const lo = p.min !== undefined ? p.min : 0;
      const hi = p.max !== undefined ? p.max : (p.type === 'attack' ? 0xffff : 0xff);
      if (!(lo <= x && x <= hi)) throw new RecipeError(p.label + ' must be from ' + lo + ' to ' + hi);
      x = Number(x);
      if (p.step && x % p.step) throw new RecipeError(p.label + ' must be a multiple of ' + p.step + ' (a byte\'s bit address)');
    } else if (p.type === 'target') {
      if (typeof x !== 'string' || !TARGETS.has(x)) throw new RecipeError(p.label + ': unknown target ' + pyStr(x));
    } else if (p.type === 'choice') {
      if (!p.choices.some(c => c[0] === x)) throw new RecipeError(p.label + ': choose one of ' + p.choices.map(c => c[0]).join(', '));
    } else if (p.type === 'text') {
      x = typeof x === 'string' ? x : pyStr(x);
      const maxlen = p.maxlen !== undefined ? p.maxlen : 60;
      if (!x || [...x].length > maxlen || !TEXT_OK.test(x)) {
        throw new RecipeError(p.label + ': 1 to ' + maxlen + ' plain characters, without " { } \\');
      }
    }
    v[p.name] = x;
  }
  return v;
}

// The recipe's text, indented as ai_tool writes scripts. As a section it ends with `end`.
export function fill(rid, given, uid, as_section) {
  const r = recipe(rid);
  const v = values_for(r, given || {});
  v.uid = pyStr(uid === undefined ? 'a' : uid).replace(/[^A-Za-z0-9_]/g, '') || 'a';
  const raw = r.build ? r.build(v) : r.template;
  const lines = [];
  for (const l of raw.split('\n')) {
    if (WORD_LABEL_LINE.test(l)) lines.push(l);
    else lines.push('        ' + l);
  }
  if (as_section) lines.push('        end');
  return lines.join('\n') + '\n';
}

// The recipes for the page: parameters with their choices (commands and attacks from the chosen kernel)
export function public_recipes(names) {
  names = names || new aiexplain.Names();
  const cmds = [...names.commands].sort((a, b) => a[0] - b[0]).map(([k, n]) => [k, hx(k, 2) + ' ' + n]);
  const atks = [...names.attacks].sort((a, b) => a[0] - b[0]).map(([k, n]) => [k, hx(k, 2) + ' ' + n]);
  const out = [];
  for (const r of RECIPES) {
    const ps = [];
    for (const p of r.params) {
      const q = Object.assign({}, p);
      if (p.type === 'command') q.choices = cmds;
      else if (p.type === 'attack') q.choices = atks;
      else if (p.type === 'target') q.choices = TARGET_CHOICES;
      ps.push(q);
    }
    out.push({ id: r.id, title: r.title, description: r.description, sections: r.sections, keywords: r.keywords,
               params: ps, untested: true });
  }
  return out;
}
