// The port of sxcfg/livetables.py: the tables the Live tables page shows, and how their records are decoded.
//
// VANILLA is the game's own tables at their fixed addresses in ff7_en.exe (image base 00400000), as data. The
// SpellExt tables come from the DLL's directory record (live.js); their layouts from data/live_layouts.json (the
// Python tool's copy, generated from the DLL source) or, for the kernel's own record formats, from LAYOUTS here. A
// layout is used only when its size equals the record size the directory gives; otherwise the table is raw hex.
//
// Names are resolved as the DLL's text_fetch_hook does: the kernel2 texts the game has loaded (read live, after a
// test that they are loaded), with the DLL's own name arrays and catalogues on top for its new IDs. Under FFNx the
// game's texts are never at 009a13c8 (FFNx keeps them in its own heap), so the kernel names are then taken from a
// kernel2.bin file instead (texts_file), and every table that used one says so.
// Node 22 language level.
import fs from 'node:fs';
import * as t from './aitool.js';
import * as live from './live.js';
import { lzs } from './lzs.js';
import { MAX_KERNEL } from './kernels.js';
import { pyJoin, PyValueError } from './py.js';

export const GROUPS = ['Game: kernel', 'Game: save', 'Game: field and menu', 'Game: battle', 'SpellExt: tables', 'SpellExt: heap'];
export const VALID_TEXT = { always: 'always (static data)', kernel: 'after a kernel load (the title screen onward)',
                            game: 'in a game (a save loaded or a new game)',
                            battle: 'battle only: outside a battle these bytes are stale' };
export const ROW_CAP = 256;
export const BYTE_CAP = 64 * 1024;

// ---- fixed addresses (the DLL's #defines) ----------------------------------------------------------------------------
export const KERNEL_POINTERS = 0x007ba070;
export const KERNEL_EXE = [0x00db9590, 0x00db9690, 0x0099ce10, 0x00dbfd8c, 0x00dbd160, 0x00dbe730, 0x00dbcce0, 0x00dbcae0,
  0x00dbdf60];
export const KERNEL_TITLES = ['commands', 'attacks', 'growth (section 3)', 'starting save data', 'items', 'weapons', 'armour',
  'accessories', 'materia'];
export const TEXT_BUFFER = 0x009a13c8;
export const TEXT_OFFSETS = 0x009a7fc8;
export const TEXT_BUFFER_SIZE = 0x6c00;
export const TEXT_SECTIONS = 18;
export const TEXT_TYPE_MAP = 0x007b74a8;
export const KERNEL2_GET_TEXT = 0x00419457;   // 55 8b ec in the exe; FFNx's replace_function leaves a jmp (e9) here
export const TEXT_TITLES = ['command descriptions', 'magic descriptions', 'item descriptions', 'weapon descriptions',
  'armour descriptions', 'accessory descriptions', 'materia descriptions', 'key item descriptions',
  'command names', 'magic names', 'item names', 'weapon names', 'armour names', 'accessory names',
  'materia names', 'key item names', 'battle texts', 'summon names'];
export const SAVE = 0x00dbfd38;
export const SAVE_RECORDS = SAVE + 0x54;
export const ID_TO_RECORD = 0x00919928;
export const CURVES_EXE = 0x0099d02c;
export const CURVES_OPERAND = 0x005c790d;
export const PRICES_EXE = 0x00924e58;
export const PRICES_POINTER = 0x00dd4720;
export const MAPLIST_POINTER = 0x00cff430;
export const MAPLIST_COUNT = 0x00cff464;
export const PAUSE = 0x00dc0e70;
export const SAVE_MODE = SAVE + 0xb94;
// kernel_kept: the eight sections the DLL keeps as loaded, in order (section 4 is not kept)
export const KEPT_SECTIONS = [[1, 0x100], [2, 0xe00], [3, 0xf94], [5, 0xe00], [6, 0x1600], [7, 0x480], [8, 0x200], [9, 0x780]];

const F = (offset, width, name, dec) => [offset, width, name, dec || 'u'];

// ---- the kernel's record formats, and the game's other records -----------------------------------------------------
export const LAYOUTS = {
  ATTACK: [28, [F(0, 1, 'accuracy'), F(1, 1, 'impact_effect'), F(2, 1, 'hurt_action'), F(4, 2, 'mp'),
                F(6, 2, 'impact_sound'), F(8, 2, 'camera_single'), F(10, 2, 'camera_multi'),
                F(12, 1, 'target', 'hex'), F(13, 1, 'effect'), F(14, 1, 'damage_formula', 'hex'),
                F(15, 1, 'power'), F(16, 1, 'condition'), F(17, 1, 'status_change', 'hex'),
                F(18, 1, 'additional_effect'), F(19, 1, 'additional_modifier'), F(20, 4, 'status', 'hex'),
                F(24, 2, 'element', 'hex'), F(26, 2, 'special', 'hex')]],
  COMMAND: [8, [F(0, 1, 'cursor'), F(1, 1, 'target', 'hex'), F(2, 2, 'unknown', 'hex'),
                F(4, 2, 'camera_single'), F(6, 2, 'camera_multi')]],
  GROWTH: [0x38, ['curve_str', 'curve_vit', 'curve_mag', 'curve_spr', 'curve_dex', 'curve_lck', 'curve_hp', 'curve_mp',
                  'curve_exp'].map((n, i) => F(i, 1, n)).concat([F(9, 0x2f, 'rest', 'bytes')])],
  CURVE: [16, [0, 1, 2, 3, 4, 5, 6, 7].map(i => F(2 * i, 2, 'band' + (i + 1), 'band'))],
  ITEM: [0x1c, [F(0, 8, 'unknown', 'hex'), F(8, 2, 'camera'), F(10, 2, 'restrictions', 'hex'),
                F(12, 1, 'target', 'hex'), F(13, 1, 'effect'), F(14, 1, 'damage_formula', 'hex'),
                F(15, 1, 'power'), F(16, 1, 'condition'), F(17, 1, 'status_change', 'hex'),
                F(18, 1, 'additional_effect'), F(19, 1, 'additional_modifier'), F(20, 4, 'status', 'hex'),
                F(24, 2, 'element', 'hex'), F(26, 2, 'special', 'hex')]],
  WEAPON: [0x2c, [F(0, 1, 'target', 'hex'), F(2, 1, 'damage_formula', 'hex'), F(4, 1, 'power'),
                  F(5, 1, 'status'), F(6, 1, 'growth'), F(7, 1, 'critical'), F(8, 1, 'accuracy'),
                  F(9, 1, 'model', 'hex'), F(0x0b, 1, 'sound_mask', 'hex'), F(0x0c, 2, 'camera'),
                  F(0x0e, 2, 'equip', 'hex'), F(0x10, 2, 'element', 'hex'), F(0x14, 4, 'stat_types', 'hex'),
                  F(0x18, 4, 'stat_amounts', 'hex'), F(0x1c, 8, 'slots', 'hex'), F(0x24, 4, 'sounds', 'hex'),
                  F(0x28, 2, 'special', 'hex'), F(0x2a, 2, 'restrictions', 'hex')]],
  ARMOUR: [0x24, [F(1, 1, 'element_modifier'), F(2, 1, 'defence'), F(3, 1, 'magic_defence'),
                  F(4, 1, 'defence_pct'), F(5, 1, 'magic_defence_pct'), F(6, 1, 'status_defence'),
                  F(9, 8, 'slots', 'hex'), F(0x11, 1, 'growth'), F(0x12, 2, 'equip', 'hex'),
                  F(0x14, 2, 'element', 'hex'), F(0x18, 4, 'stat_types', 'hex'),
                  F(0x1c, 4, 'stat_amounts', 'hex'), F(0x20, 2, 'restrictions', 'hex')]],
  ACCESSORY: [0x10, [F(0, 2, 'stat_types', 'hex'), F(2, 2, 'stat_amounts', 'hex'),
                     F(4, 1, 'element_modifier'), F(5, 1, 'special'), F(6, 2, 'element', 'hex'),
                     F(8, 4, 'status', 'hex'), F(0x0c, 2, 'equip', 'hex'), F(0x0e, 2, 'restrictions', 'hex')]],
  MATERIA: [20, [F(0, 2, 'ap_level2'), F(2, 2, 'ap_level3'), F(4, 2, 'ap_level4'), F(6, 2, 'ap_level5'),
                 F(8, 1, 'equip_effect'), F(9, 3, 'status', 'hex'), F(0x0c, 1, 'element'),
                 F(0x0d, 1, 'type', 'hex'), F(0x0e, 6, 'attributes', 'hex')]],
  CHARACTER: [0x84, [F(0, 1, 'id'), F(1, 1, 'level'), F(2, 1, 'str'), F(3, 1, 'vit'), F(4, 1, 'mag'),
                     F(5, 1, 'spr'), F(6, 1, 'dex'), F(7, 1, 'lck'), F(8, 6, 'bonuses', 'hex'),
                     F(0x0e, 1, 'limit_level'), F(0x0f, 1, 'limit_gauge'), F(0x10, 12, 'name', 'ff7text'),
                     F(0x1c, 1, 'weapon', 'weapon_index'), F(0x1d, 1, 'armour', 'armour_index'),
                     F(0x1e, 1, 'accessory', 'accessory_index'), F(0x1f, 1, 'status_flags', 'hex'),
                     F(0x20, 1, 'row'), F(0x21, 1, 'level_bar'), F(0x22, 2, 'learned_limits', 'hex'),
                     F(0x24, 2, 'kills'), F(0x26, 6, 'limit_uses', 'hex'), F(0x2c, 2, 'hp'),
                     F(0x2e, 2, 'base_hp'), F(0x30, 2, 'mp'), F(0x32, 2, 'base_mp'), F(0x38, 2, 'max_hp'),
                     F(0x3a, 2, 'max_mp'), F(0x3c, 4, 'exp'), F(0x40, 32, 'weapon_materia', 'materia_slots'),
                     F(0x60, 32, 'armour_materia', 'materia_slots'), F(0x80, 4, 'exp_to_next')]],
  SAVE_HEAD: [0x54, [F(0, 4, 'checksum', 'hex'), F(4, 1, 'level'), F(5, 3, 'portraits', 'hex'),
                     F(8, 16, 'name', 'ff7text'), F(0x18, 2, 'hp'), F(0x1a, 2, 'max_hp'), F(0x1c, 2, 'mp'),
                     F(0x1e, 2, 'max_mp'), F(0x20, 4, 'gil'), F(0x24, 4, 'seconds'),
                     F(0x28, 32, 'location', 'ff7text'), F(0x48, 12, 'window_colours', 'hex')]],
  PARTY: [3, [F(0, 1, 'slot1', 'char'), F(1, 1, 'slot2', 'char'), F(2, 1, 'slot3', 'char')]],
  STOCK: [2, [F(0, 2, 'entry', 'stock')]],
  MATERIA_STOCK: [4, [F(0, 4, 'entry', 'materia_slot')]],
  SAVE_MISC: [0x28, [F(0, 4, 'gil'), F(4, 4, 'play_seconds'), F(8, 4, 'countdown'), F(0x18, 2, 'mode'),
                     F(0x1a, 2, 'field', 'field'), F(0x1e, 2, 'x', 'i'), F(0x20, 2, 'y', 'i'),
                     F(0x22, 2, 'triangle')]],
  SAVE_TAIL: [0x50, [F(0, 2, 'phs_locked', 'hex'), F(2, 2, 'phs_shown', 'hex'), F(0x34, 1, 'battle_speed'),
                     F(0x35, 1, 'battle_message_speed'), F(0x36, 2, 'config_word', 'hex'),
                     F(0x48, 1, 'message_speed')]],
  PARTY_BATTLE: [0x440, [F(0x10, 2, 'hp'), F(0x12, 2, 'max_hp'), F(0x14, 2, 'mp'), F(0x16, 2, 'max_mp'),
                         F(0x24, 24, 'counters', 'bytes'), F(0x4c, 96, 'command_menu', 'bytes'),
                         F(0xac, 3, 'limit_ids', 'hex'), F(0xb4, 84, 'attack_records', 'bytes'),
                         F(0x108, 768, 'spell_slots', 'bytes')]],
  BATTLE_CTX: [0x3c, [F(0, 1, 'command', 'command'), F(1, 1, 'attack_id_byte'), F(2, 1, 'bank_value'),
                      F(4, 1, 'battle_type'), F(5, 1, 'colour_mask', 'hex'), F(6, 1, 'limit_level'),
                      F(0x0a, 2, 'active_actors', 'hex'), F(0x0c, 2, 'script_owner', 'hex'),
                      F(0x0e, 2, 'targets', 'hex'), F(0x22, 2, 'end_battle_flags', 'hex'),
                      F(0x28, 2, 'formation'), F(0x2a, 2, 'attack_id'), F(0x2c, 2, 'flags', 'hex'),
                      F(0x38, 4, 'party_gil')]],
  ACTOR: [0x68, [F(0, 4, 'status', 'hex'), F(4, 4, 'flags', 'hex'), F(8, 1, 'index'), F(9, 1, 'level'),
                 F(0x0c, 1, 'character', 'char'), F(0x0d, 1, 'attack'), F(0x0e, 1, 'magic_attack'),
                 F(0x14, 1, 'dexterity'), F(0x15, 1, 'luck'), F(0x20, 2, 'defence'), F(0x22, 2, 'magic_defence'),
                 F(0x28, 2, 'mp'), F(0x2a, 2, 'max_mp'), F(0x2c, 4, 'hp'), F(0x30, 4, 'max_hp'),
                 F(0x50, 2, 'gil_stolen'), F(0x52, 2, 'item_stolen'), F(0x58, 4, 'gil'), F(0x5c, 4, 'exp')]],
  ACTOR_TIMER: [0x44, [F(4, 2, 'time_gauge'), F(0x0d, 1, 'accessory_effect'), F(0x2c, 4, 'pending_mp', 'i'),
                       F(0x30, 4, 'pending_hp', 'i')]],
  LIMIT_DATA: [0x34, [F(0, 4, 'record', 'ptr'), F(4, 1, 'limit_uses'), F(5, 1, 'limit_level_minus_1'),
                      F(8, 2, 'gauge'), F(0x14, 2, 'mp_limit'), F(0x16, 2, 'hp_limit'), F(0x1c, 4, 'divisor'),
                      F(0x20, 4, 'accessory_status', 'hex'), F(0x24, 4, 'enemy_skill_mask', 'hex')]],
  BATTLE_ITEM: [6, [F(0, 2, 'item', 'item'), F(2, 1, 'quantity'), F(3, 1, 'target', 'hex'),
                    F(4, 1, 'use_flags', 'hex')]],
  ACTION: [0x100, [F(0, 4, 'actor', 'i'), F(0x0c, 4, 'command', 'i'), F(0x18, 4, 'targets', 'hex'),
                   F(0x20, 4, 'script', 'i')]],
  SHOP: [0x54, [F(0, 2, 'kind'), F(2, 2, 'count'), F(4, 80, 'entries', 'shop_entries')]],
  WIDE_ROW: [4, [F(0, 4, 'row', 'wide_row')]],
  MAPNAME: [32, [F(0, 32, 'name', 'ascii')]],
  TEXT32: [32, [F(0, 32, 'text', 'ff7text')]],
  TEXT96: [96, [F(0, 96, 'text', 'ff7text')]],
  U8: [1, [F(0, 1, 'value')]], I8: [1, [F(0, 1, 'value', 'i')]],
  U16: [2, [F(0, 2, 'value')]], I16: [2, [F(0, 2, 'value', 'i')]],
  U32: [4, [F(0, 4, 'value')]], I32: [4, [F(0, 4, 'value', 'i')]], PTR: [4, [F(0, 4, 'value', 'ptr')]],
  ITEM_ID: [2, [F(0, 2, 'item', 'item')]],
};

// ---- the game's tables -----------------------------------------------------------------------------------------------
// address: a number, ['kernel', section], ['pointer', where, fallback] or ['operand', where, fallback];
// count: a number, or [width, where, most]; names: how a row is named, [kind, base]
const V = o => o;
export const VANILLA = [
  V({ id: 'k_commands', title: 'Commands (kernel 1)', group: 'Game: kernel', address: ['kernel', 1], record_size: 8,
      count: 32, layout: 'COMMAND', names: ['command', 0], valid: 'kernel', kept: 1 }),
  V({ id: 'k_attacks', title: 'Attacks (kernel 2)', group: 'Game: kernel', address: ['kernel', 2], record_size: 28,
      count: 128, layout: 'ATTACK', names: ['magic', 0], valid: 'kernel', kept: 2 }),
  V({ id: 'k_growth', title: 'Growth records (kernel 3)', group: 'Game: kernel', address: ['kernel', 3],
      record_size: 0x38, count: 9, layout: 'GROWTH', names: ['char', 0], valid: 'kernel', kept: 3 }),
  V({ id: 'k_curves', title: 'Growth curves', group: 'Game: kernel', address: ['operand', CURVES_OPERAND, CURVES_EXE],
      record_size: 16, count: 64, layout: 'CURVE', names: null, valid: 'kernel', dll: 'growth_curves' }),
  V({ id: 'k_start', title: 'Starting save data (kernel 4)', group: 'Game: kernel', address: ['kernel', 4],
      record_size: 0x84, count: 9, layout: 'CHARACTER', names: ['char', 0], valid: 'kernel',
      note: 'every kernel load writes the starting records here (the savemap\'s records): at the title screen ' +
            'they are the new-game records, not a save\'s' }),
  V({ id: 'k_items', title: 'Items (kernel 5)', group: 'Game: kernel', address: ['kernel', 5], record_size: 0x1c,
      count: 128, layout: 'ITEM', names: ['item', 0], valid: 'kernel', kept: 5 }),
  V({ id: 'k_weapons', title: 'Weapons (kernel 6)', group: 'Game: kernel', address: ['kernel', 6], record_size: 0x2c,
      count: 128, layout: 'WEAPON', names: ['weapon_index', 0], valid: 'kernel', kept: 6 }),
  V({ id: 'k_armour', title: 'Armour (kernel 7)', group: 'Game: kernel', address: ['kernel', 7], record_size: 0x24,
      count: 32, layout: 'ARMOUR', names: ['armour_index', 0], valid: 'kernel', kept: 7 }),
  V({ id: 'k_accessories', title: 'Accessories (kernel 8)', group: 'Game: kernel', address: ['kernel', 8],
      record_size: 0x10, count: 32, layout: 'ACCESSORY', names: ['accessory_index', 0], valid: 'kernel', kept: 8 }),
  V({ id: 'k_materia', title: 'Materia (kernel 9)', group: 'Game: kernel', address: ['kernel', 9], record_size: 20,
      count: 96, layout: 'MATERIA', names: ['materia', 0], valid: 'kernel', kept: 9 }),
  V({ id: 'limits', title: 'Limits (in the exe)', group: 'Game: kernel', address: 0x0091f6d4, record_size: 28,
      count: 128, layout: 'ATTACK', names: ['magic', 0x80], valid: 'always',
      note: 'the game uses entries 0-0x48; once the DLL moves its limit tables it reads the "limits" table of the ' +
            'SpellExt list' }),
  V({ id: 'prices', title: 'Prices', group: 'Game: kernel', address: ['pointer', PRICES_POINTER, PRICES_EXE],
      record_size: 4, count: 480, layout: 'U32', names: ['price', 0], valid: 'always', dll: 'prices',
      note: 'items 0-319, then materia from entry 384 in the exe\'s table (from 512 in the DLL\'s, once moved)' }),
  V({ id: 'item_ranks', title: 'Item ranks (sort by name)', group: 'Game: kernel', address: 0x00921548, record_size: 2,
      count: 320, layout: 'U16', names: ['item', 0], valid: 'always' }),
  V({ id: 'throw_effects', title: 'Throw effects', group: 'Game: kernel', address: 0x007c1a48, record_size: 2,
      count: 128, layout: 'U16', names: ['weapon_index', 0], valid: 'always' }),
  V({ id: 'shops', title: 'Shops', group: 'Game: kernel', address: 0x00923418, record_size: 0x54, count: 80,
      layout: 'SHOP', names: null, valid: 'always', dll: 'shops' }),
  V({ id: 'kernel_pointers', title: 'Kernel section pointers', group: 'Game: kernel', kind: 'values', valid: 'always',
      values: KERNEL_TITLES.map((tt, i) => ['section ' + (i + 1) + ': ' + tt, KERNEL_POINTERS + 4 * i, 4, 'kernel_ptr']) }),
  V({ id: 'kernel2_texts', title: 'Kernel texts (kernel2)', group: 'Game: kernel', kind: 'texts', valid: 'kernel',
      address: TEXT_BUFFER }),

  V({ id: 'save_head', title: 'Save preview and colours', group: 'Game: save', address: SAVE, record_size: 0x54,
      count: 1, layout: 'SAVE_HEAD', names: null, valid: 'game' }),
  V({ id: 'save_characters', title: 'Character records', group: 'Game: save', address: SAVE_RECORDS,
      record_size: 0x84, count: 9, layout: 'CHARACTER', names: ['char', 0], valid: 'game' }),
  V({ id: 'save_party', title: 'Party', group: 'Game: save', address: SAVE + 0x4f8, record_size: 3, count: 1,
      layout: 'PARTY', names: null, valid: 'game' }),
  V({ id: 'save_stock', title: 'Item stock', group: 'Game: save', address: SAVE + 0x4fc, record_size: 2, count: 320,
      layout: 'STOCK', names: null, valid: 'game',
      note: 'once the DLL\'s wide list is on, the game reads the SpellExt "wide_list" table instead' }),
  V({ id: 'save_materia', title: 'Materia stock', group: 'Game: save', address: SAVE + 0x77c, record_size: 4,
      count: 200, layout: 'MATERIA_STOCK', names: null, valid: 'game' }),
  V({ id: 'save_stolen', title: 'Stolen materia', group: 'Game: save', address: SAVE + 0xa9c, record_size: 4,
      count: 48, layout: 'MATERIA_STOCK', names: null, valid: 'game' }),
  V({ id: 'save_misc', title: 'Gil, time, place', group: 'Game: save', address: SAVE + 0xb7c, record_size: 0x28,
      count: 1, layout: 'SAVE_MISC', names: null, valid: 'game' }),
  V({ id: 'save_banks', title: 'Field script banks', group: 'Game: save', address: SAVE + 0xba4, record_size: 16,
      count: 0x50, layout: null, names: null, valid: 'game', note: 'story progress is the word at 0xba4' }),
  V({ id: 'save_tail', title: 'PHS masks and config', group: 'Game: save', address: SAVE + 0x10a4, record_size: 0x50,
      count: 1, layout: 'SAVE_TAIL', names: null, valid: 'game' }),

  V({ id: 'party_battle', title: 'Party battle records', group: 'Game: field and menu', address: 0x00dba498,
      record_size: 0x440, count: 3, layout: 'PARTY_BATTLE', names: null, valid: 'game' }),
  V({ id: 'id_to_record', title: 'Character ID to record', group: 'Game: field and menu', address: ID_TO_RECORD,
      record_size: 4, count: 14, layout: 'I32', names: ['char', 0], valid: 'always', seat_rows: true,
      note: 'the exe holds 14 entries (IDs 0-13); the DLL writes IDs 12 to 12 + seat_count - 1' }),
  V({ id: 'equip_list', title: 'Equip menu list', group: 'Game: field and menu', address: 0x00dca6a8, record_size: 1,
      count: [4, 0x00dca7ec, 0x140], layout: 'U8', names: null, valid: 'game', note: 'stock indices, ff = padding' }),
  V({ id: 'field_now', title: 'Field: current, next, previous', group: 'Game: field and menu', kind: 'values',
      valid: 'game', values: [['current field', 0x00cc15d0, 2, 'field'], ['next field', 0x00cc0d8a, 2, 'field'],
                              ['previous field', 0x00cc0dec, 2, 'field']] }),
  V({ id: 'maplist', title: 'Field names (maplist)', group: 'Game: field and menu',
      address: ['pointer', MAPLIST_POINTER, 0], record_size: 32, count: [4, MAPLIST_COUNT, 4096], layout: 'MAPNAME',
      names: null, valid: 'always' }),
  V({ id: 'field_infos', title: 'Field infos', group: 'Game: field and menu', address: 0x00cc2280, record_size: 0xd0,
      count: 1200, layout: null, names: null, valid: 'always', note: 'or the DLL\'s fields_infos (SpellExt list)' }),

  V({ id: 'battle_ctx', title: 'Battle context', group: 'Game: battle', address: 0x009ab0a0, record_size: 0x3c,
      count: 1, layout: 'BATTLE_CTX', names: null, valid: 'battle' }),
  V({ id: 'actors', title: 'Actor variables', group: 'Game: battle', address: 0x009ab0dc, record_size: 0x68, count: 10,
      layout: 'ACTOR', names: null, valid: 'battle', note: '0-2 the party, 4-9 enemies' }),
  V({ id: 'actor_timers', title: 'Actor timers', group: 'Game: battle', address: 0x009a8b10, record_size: 0x44,
      count: 10, layout: 'ACTOR_TIMER', names: null, valid: 'battle' }),
  V({ id: 'limit_data', title: 'Limit data per party slot', group: 'Game: battle', address: 0x009a8db8,
      record_size: 0x34, count: 3, layout: 'LIMIT_DATA', names: null, valid: 'battle' }),
  V({ id: 'battle_inventory', title: 'Battle inventory', group: 'Game: battle', address: 0x009ac354, record_size: 6,
      count: 320, layout: 'BATTLE_ITEM', names: null, valid: 'battle', dll: 'wide_battle',
      note: 'rows in use: the byte at 009ac110' }),
  V({ id: 'action', title: 'The action being built', group: 'Game: battle', address: ['pointer', 0x0099ce0c, 0],
      record_size: 0x100, count: 1, layout: 'ACTION', names: null, valid: 'battle' }),
  V({ id: 'display', title: 'Display records', group: 'Game: battle', address: 0x009aad70, record_size: 0xc,
      count: 64, layout: null, names: null, valid: 'battle' }),
  V({ id: 'tasks100', title: 'Task list (100)', group: 'Game: battle', address: 0x00bf2858, record_size: 4, count: 100,
      layout: 'PTR', names: null, valid: 'battle', note: 'count of tasks: the int at 00c05ebc' }),
  V({ id: 'tasks60', title: 'Task list (60)', group: 'Game: battle', address: 0x00bfb1b0, record_size: 4, count: 60,
      layout: 'PTR', names: null, valid: 'battle', note: 'count of tasks: the word at 00be10e8' }),
  V({ id: 'battle_flags', title: 'Pause and counts', group: 'Game: battle', kind: 'values', valid: 'always',
      values: [['pause / timer held (00dc0e70)', PAUSE, 4, 'u'], ['savemap mode (1 field, 3 world)', SAVE_MODE, 2, 'u'],
               ['battle inventory rows in use', 0x009ac110, 1, 'u'], ['tasks in the 100-list', 0x00c05ebc, 4, 'u'],
               ['tasks in the 60-list', 0x00be10e8, 2, 'u']] }),
];
export const VANILLA_BY_ID = new Map(VANILLA.map(x => [x.id, x]));

// ---- the SpellExt tables: layout and how a row is named, by directory entry name -----------------------------------
export const DLL_LAYOUT = {
  spells: 'SPELL', spell_support: 'SPELL_SUPPORT', spell_by_id: 'U16', spell_list0: 'LIST_ENTRY',
  spell_list1: 'LIST_ENTRY', spell_list2: 'LIST_ENTRY', wide_items: 'WIDE_ITEM', wide_gears: 'WIDE_GEAR',
  fields_entries: 'FIELDS_ENTRY', fields_infos: null, fields_scales: 'U32', loose_files: 'LOOSE_FILE',
  materia: 'MATERIA', materia_names: 'TEXT32', materia_descriptions: 'TEXT96', limits: 'ATTACK',
  spell_renames: 'RENAME', weapons: 'WEAPON', weapon_mirror: 'WEAPON', weapon_names: 'TEXT32',
  weapon_descriptions: 'TEXT96', armour: 'ARMOUR', armour_mirror: 'ARMOUR', armour_names: 'TEXT32',
  armour_descriptions: 'TEXT96', accessories: 'ACCESSORY', accessory_mirror: 'ACCESSORY',
  accessory_names: 'TEXT32', accessory_descriptions: 'TEXT96', items: 'ITEM', item_names: 'TEXT32',
  item_descriptions: 'TEXT96', prices: 'U32', throw_effects: 'I16', item_ranks: 'U16',
  wide_list: 'WIDE_ROW', wide_battle: 'BATTLE_ITEM', wide_carried: 'WIDE_ROW', shops: 'SHOP', shop_open: null,
  shops_original: 'SHOP', shop_adds: 'SHOP_ADD', growth_curves: 'CURVE', characters: 'NEW_CHARACTER', seats: 'I8',
  char_ai: 'CHAR_AI', effects: 'EFFECT_COPY', effect_bases: 'EFFECT_BASE', nfx_scripts: 'NFX_SCRIPT',
  nfx_pool: 'NFX_ITEM', sounds: 'SOUND', cameras: 'OWN_CAMERA', camera_pool: null,
  camera_ff8: 'CAMERA_FF8', kernel_kept: null,
};
export const DLL_NAMES = {
  materia: ['materia', 0], materia_names: ['materia', 96], materia_descriptions: ['materia', 96],
  limits: ['magic', 0x80], weapons: ['weapon_index', 0], armour: ['armour_index', 0],
  accessories: ['accessory_index', 0], items: ['item', 0], weapon_names: ['item', 320],
  weapon_descriptions: ['item', 320], armour_names: ['item', 384], armour_descriptions: ['item', 384],
  accessory_names: ['item', 416], accessory_descriptions: ['item', 416], item_names: ['new_item', 0],
  item_descriptions: ['new_item', 0], prices: ['price', 0], item_ranks: ['item', 0],
  throw_effects: ['weapon_index', 0], spell_by_id: ['magic', 0], spell_renames: ['magic', 0],
  characters: ['roster', 0], seats: ['seat', 0],
};
export const DLL_TITLES = { spells: 'Spells', materia: 'Materia', weapons: 'Weapons', armour: 'Armour',
  accessories: 'Accessories', items: 'Items', characters: 'Characters (roster)', shops: 'Shops',
  shop_open: 'Shop open now (raw)', shops_original: 'Shops (as the exe had them)',
  limits: 'Limits', prices: 'Prices', effects: 'Effect copies', sounds: 'Sounds',
  cameras: 'Own cameras', kernel_kept: 'Kernel as loaded (kept)' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const get = (o, k, dflt) => (own(o, k) ? o[k] : dflt);
// Python's KeyError (str() of it is the key's repr)
export class KeyError extends Error {
  constructor(key) { super("'" + key + "'"); this.name = 'KeyError'; }
}
// t[k] of a table's dict: KeyError when it has no such key
const req = (o, k) => { if (!own(o, k)) throw new KeyError(k); return o[k]; };

let LAYOUTS_JSON = null;
export const LAYOUTS_PATH = pyJoin(import.meta.dirname, 'data', 'live_layouts.json');

export function dll_layouts() {
  if (LAYOUTS_JSON === null) {
    try {
      LAYOUTS_JSON = JSON.parse(fs.readFileSync(LAYOUTS_PATH, 'utf8')).layouts || {};
    } catch (e) {
      LAYOUTS_JSON = {};
    }
  }
  return LAYOUTS_JSON;
}

const JSON_DEC = { u8: 'u', u16: 'u', u32: 'u', i8: 'i', i16: 'i', i32: 'i', ptr: 'ptr', ff7text: 'ff7text', ascii: 'ascii', bytes: 'bytes' };

// [size, [[offset, width, field, decoder]]] of a layout name, or null
export function layout(name) {
  if (!name) return null;
  if (own(LAYOUTS, name)) return LAYOUTS[name];
  const j = get(dll_layouts(), name, null);
  if (!j) return null;
  return [j.size, j.fields.map(([n, o, s, k]) => [o, s, n, get(JSON_DEC, k, 'bytes')])];
}

// ---- names ----------------------------------------------------------------------------------------------------------
// FF7 text bytes up to the first ff, as the AI page shows kernel names ({xx} for codes)
export function ff7_text(raw) {
  const z = raw.indexOf(0xff);
  return t.ff7_text(z < 0 ? raw : raw.subarray(0, z)).slice(1, -1);
}

export function weapon_item_id(i) {
  return i >= 0 && i < 128 ? 128 + i : i >= 192 && i < 256 ? 320 + i - 192 : null;
}

export function armour_item_id(i) {
  return i >= 0 && i < 32 ? 256 + i : i >= 128 && i < 160 ? 384 + i - 128 : null;
}

export function accessory_item_id(i) {
  return i >= 0 && i < 32 ? 288 + i : i >= 128 && i < 160 ? 416 + i - 128 : null;
}

// The item ID of a slot of the DLL's item_names: 0-22 are 105-127, 23-86 are 448-511.
export function new_item_id(slot) {
  return slot < 23 ? 105 + slot : 448 + slot - 23;
}

// The kernel2 offset words as the loader leaves them: off[1..17] non-zero, strictly rising, all below the buffer's
// size (off[0] may be 0)
export function texts_loaded(offsets) {
  if (offsets.length !== TEXT_SECTIONS) return false;
  const rest = offsets.slice(1);
  return rest.every(o => o) && rest.every((b, k) => offsets[k] < b) && rest[rest.length - 1] < TEXT_BUFFER_SIZE;
}

// true when kernel2_get_text_00419457 starts with a jmp (FFNx replaced it), false when it does not, null when it
// cannot be read
export function kernel2_replaced(proc) {
  try {
    return proc.u8(KERNEL2_GET_TEXT) === 0xe9;
  } catch (e) {
    if (e instanceof live.LiveError) return null;
    throw e;
  }
}

// The 18 text sections of a kernel2.bin (a u32 length, then LZS data unpacking to 18 x (u32 size, bytes))
export function kernel2_bin_sections(data) {
  if (data.length < 8 || data.length > MAX_KERNEL) throw new PyValueError('not a kernel2.bin (' + data.length + ' bytes)');
  const d = lzs(data.subarray(4, 4 + data.readUInt32LE(0)));
  const out = [];
  let i = 0;
  while (i + 4 <= d.length && out.length < TEXT_SECTIONS) {
    const n = d.readUInt32LE(i);
    if (i + 4 + n > d.length) break;
    out.push(d.subarray(i + 4, i + 4 + n));
    i += 4 + n;
  }
  if (out.length !== TEXT_SECTIONS || out.some(x => x.length < 2)) {
    throw new PyValueError('not a kernel2.bin (' + out.length + ' text sections unpacked, not 18)');
  }
  return out;
}

// KERNEL.BIN sections 10-27: the kernel's own copy of the texts
export function kernel_bin_text_sections(kernel) {
  const secs = t.kernel_sections(kernel);
  if (secs.length < 9 + TEXT_SECTIONS) throw new PyValueError('the kernel has ' + secs.length + ' sections, not 27');
  return secs.slice(9, 9 + TEXT_SECTIONS);
}

// Python's str(KeyError(k))
const key_error = k => "'" + k + "'";

// Names for IDs, read live and kept for one request: kernel2 first, the DLL's tables over it for new IDs.
// `texts_file` is {sections: [18 bytes], label}: used for the kernel texts only when the game's own are not at
// 009a13c8. A read that fails while looking up a name is kept in `errors` (message() gives the words).
export class Names {
  constructor(proc, dir, texts_file) {
    this.proc = proc;
    this.dir = dir || null;
    this._offsets = null;
    this._buf = null;
    this._secs = null;
    this.texts_file = texts_file || null;
    this.source = null;            // 'game' | 'file' | null, once the sections are looked at
    this.used_file = false;        // a name was taken from texts_file
    this.errors = [];
    this._cache = new Map();
    this.entries = new Map();
    for (const e of (this.dir || {}).entries || []) this.entries.set(e.name, e);
  }

  _error(what, ex) {
    const tt = what + ': ' + (typeof ex === 'string' ? ex : ex.message);
    if (this.errors.indexOf(tt) < 0) this.errors.push(tt);
  }

  replaced() {
    if (!this._cache.has('replaced')) this._cache.set('replaced', kernel2_replaced(this.proc));
    return this._cache.get('replaced');
  }

  // Why the game's kernel2 texts are not read live (null when they are)
  why_not_loaded() {
    if (this.loaded()) return null;
    if (this.replaced()) {
      return 'the game\'s kernel2 texts are held by FFNx (it replaced kernel2_add_section and kernel2_get_text, ' +
             'so the buffer at 009a13c8 is never written)';
    }
    return 'the kernel2 texts are not loaded: the offset words at 009a7fc8 are not as the loader leaves them';
  }

  // The words a table adds to its message: names from a file, names that could not be read; or null
  message() {
    const parts = [];
    if (this.used_file && this.texts_file) {
      parts.push('kernel names from ' + this.texts_file.label + ', not from the game: ' + this.why_not_loaded());
    }
    if (this.errors.length) {
      parts.push('some names could not be read (' + this.errors.slice(0, 4).join('; ') + ')' +
                 (this.errors.length > 4 ? ' and ' + (this.errors.length - 4) + ' more' : ''));
    }
    return parts.join('. ') || null;
  }

  // kernel2
  offsets() {
    if (this._offsets === null) {
      try {
        const b = this.proc.read(TEXT_OFFSETS, 36);
        this._offsets = [];
        for (let k = 0; k < 18; k++) this._offsets.push(b.readUInt16LE(2 * k));
      } catch (ex) {
        if (!(ex instanceof live.LiveError)) throw ex;
        this._error('the kernel2 offsets at ' + live.x08(TEXT_OFFSETS), ex);
        this._offsets = [];
      }
    }
    return this._offsets;
  }

  loaded() {
    return texts_loaded(this.offsets());
  }

  buffer() {
    if (this._buf === null) {
      this._buf = Buffer.alloc(0);
      if (this.loaded()) {
        try {
          this._buf = this.proc.read(TEXT_BUFFER, TEXT_BUFFER_SIZE);
        } catch (ex) {
          if (!(ex instanceof live.LiveError)) throw ex;
          this._error('the kernel2 texts at ' + live.x08(TEXT_BUFFER), ex);
        }
      }
    }
    return this._buf;
  }

  // The 18 text sections: the game's (cut from its buffer by the offset words), else texts_file's, else []
  sections() {
    if (this._secs === null) {
      this._secs = [];
      const buf = this.buffer();
      if (buf.length) {
        const off = this.offsets().concat([TEXT_BUFFER_SIZE]);
        this._secs = [];
        for (let i = 0; i < TEXT_SECTIONS; i++) this._secs.push(buf.subarray(off[i], Math.max(off[i], off[i + 1])));
        this.source = 'game';
      } else if (this.texts_file) {
        this._secs = this.texts_file.sections.slice();
        this.source = 'file';
      }
    }
    return this._secs;
  }

  section_count(section) {
    const secs = this.sections();
    if (!secs.length || secs[section].length < 2) return 0;
    const sec = secs[section];
    return Math.min(Math.floor(sec.readUInt16LE(0) / 2), Math.floor(sec.length / 2));
  }

  // The text the game's kernel2_get_text_00419457 gives for (section, index), or null
  kernel2(section, index) {
    if (index === null || index === undefined || index < 0 || index >= this.section_count(section)) return null;
    const sec = this.sections()[section];
    const w = sec.readUInt16LE(2 * index);
    if (w >= sec.length) return null;
    const tt = ff7_text(sec.subarray(w)) || null;
    if (tt && this.source === 'file') this.used_file = true;
    return tt;
  }

  // the DLL's: {row index: FF7 text} from a DLL entry's records first..first+count-1 (one window per 256 rows)
  _dll_rows(name, field_off, field_len, first, count) {
    const key = 'rows\0' + name + '\0' + field_off + '\0' + first + '\0' + count;
    if (this._cache.has(key)) return this._cache.get(key);
    const out = new Map();
    const e = this.entries.get(name);
    if (e && e.address && this.dir) {
      count = Math.max(0, Math.min(count, e.count - first));
      const rs = e.record_size;
      let at = first;
      try {
        while (at < first + count) {
          const n = Math.max(1, Math.min(first + count - at, Math.floor(BYTE_CAP / Math.max(rs, 1))));
          const [data] = live.read_table_window(this.proc, this.dir, e, at, n);
          for (let k = 0; k < n; k++) {
            const rec = data.subarray(k * rs, (k + 1) * rs);
            const tt = rec.subarray(field_off, field_off + field_len);
            if (tt.length && tt[0] !== 0xff) out.set(at + k, ff7_text(tt));
          }
          at += n;
        }
      } catch (ex) {
        if (!(ex instanceof live.LiveError)) throw ex;
        this._error('the DLL\'s ' + name, ex);
      }
    }
    this._cache.set(key, out);
    return out;
  }

  _dll_name(name, slot) {
    const e = this.entries.get(name);
    if (!e || slot < 0 || slot >= e.count) return null;
    const rows = this._dll_rows(name, 0, 32, slot - (slot % 64), 64);
    return rows.has(slot) ? rows.get(slot) : null;
  }

  _catalogue(name, layout_name, number_field, name_field) {
    number_field = number_field || 'number';
    name_field = name_field || 'name';
    const key = 'catalogue\0' + name;
    if (this._cache.has(key)) return this._cache.get(key);
    const out = new Map();
    const e = this.entries.get(name);
    const lay = get(dll_layouts(), layout_name, null);
    if (e && e.address && lay && lay.size === e.record_size && this.dir) {
      const f = new Map(lay.fields.map(([n, o, s]) => [n, [o, s]]));
      try {
        let n = live.live_count(this.proc, this.dir, e);
        n = Math.min(n !== null ? n : e.count, e.count, 4096);
        const rs = e.record_size;
        let at = 0;
        while (at < n) {
          const k = Math.min(n - at, Math.floor(BYTE_CAP / rs));
          const [data] = live.read_table_window(this.proc, this.dir, e, at, k);
          for (let j = 0; j < k; j++) {
            const rec = data.subarray(j * rs, (j + 1) * rs);
            if (!f.has(number_field)) throw Object.assign(new Error(key_error(number_field)), { key_error: true });
            let [o, s] = f.get(number_field);
            const num = rec.readUIntLE(o, Math.min(s, 6));
            if (!f.has(name_field)) throw Object.assign(new Error(key_error(name_field)), { key_error: true });
            [o, s] = f.get(name_field);
            if (rec[o] !== 0xff) {
              const text = ff7_text(rec.subarray(o, o + s));       // setdefault: the text is made even when the number is known
              if (!out.has(num)) out.set(num, text);
            }
          }
          at += k;
        }
      } catch (ex) {
        if (ex instanceof live.LiveError) this._error('the DLL\'s ' + name, ex);
        else if (ex.key_error) this._error('the DLL\'s ' + name, 'no field ' + ex.message + ' in its layout');
        else throw ex;
      }
    }
    this._cache.set(key, out);
    return out;
  }

  magic(i) {
    const sp = this._catalogue('spells', 'SPELL', 'id', 'name');
    return (sp.has(i) ? sp.get(i) : null) || this.kernel2(9, i);
  }

  command(i) {
    return this.kernel2(8, i) || (t.COMMANDS.has(i) ? t.COMMANDS.get(i) : null);
  }

  materia(i) {
    if (i >= 96) return this._dll_name('materia_names', i - 96);
    return this.kernel2(14, i);
  }

  item(i) {
    if (i === null || i === undefined) return null;
    if (i >= 105 && i < 128 && this._dll_name('item_names', i - 105)) return this._dll_name('item_names', i - 105);
    if (i < 128) return this.kernel2(10, i);
    if (i < 256) return this.kernel2(11, i - 128);
    if (i < 288) return this.kernel2(12, i - 256);
    if (i < 320) return this.kernel2(13, i - 288);
    if (i < 384) return this._dll_name('weapon_names', i - 320);
    if (i < 416) return this._dll_name('armour_names', i - 384);
    if (i < 448) return this._dll_name('accessory_names', i - 416);
    if (i < 512) return this._dll_name('item_names', i - 448 + 23);
    if (i >= 1024 && i < 10000) {
      const c = this._catalogue('wide_items', 'WIDE_ITEM');
      return c.has(i) ? c.get(i) : null;
    }
    if (i >= 10000 && i < 28000) {
      const c = this._catalogue('wide_gears', 'WIDE_GEAR');
      return c.has(i) ? c.get(i) : null;
    }
    return null;
  }

  // A character's name: the save record of one of the nine, or a seat's occupant from the roster.
  char(i) {
    if (i === null || i === undefined || i === 0xff) return null;
    const key = 'char\0' + i;
    if (this._cache.has(key)) return this._cache.get(key);
    let name = null;
    try {
      if (i >= 0 && i < 12) {
        const idx = this.proc.i32(ID_TO_RECORD + 4 * i);
        if (idx >= 0 && idx < 9) {
          const raw = this.proc.read(SAVE_RECORDS + idx * 0x84 + 0x10, 12);
          name = raw[0] !== 0xff ? ff7_text(raw) : null;
        }
      } else if (i >= 12 && i < 16 && this.entries.has('seats') && this.dir) {
        const seat = this.entries.get('seats');
        const [data] = live.read_table_window(this.proc, this.dir, seat, i - 12, 1);
        if (data.length < 1) throw new t.StructError('unpack requires a buffer of 1 bytes');
        const r = data.readInt8(0);
        if (r >= 0) name = this.roster(r);
      }
    } catch (ex) {
      if (!(ex instanceof live.LiveError)) throw ex;
      this._error('the name of character ' + i, ex);
      name = null;
    }
    this._cache.set(key, name);
    return name;
  }

  roster(n) {
    const lay = get(dll_layouts(), 'NEW_CHARACTER', null);
    const e = this.entries.get('characters');
    if (!lay || !e || lay.size !== e.record_size) return null;
    const f = new Map(lay.fields.map(x => [x[0], x]));
    if (!f.has('name')) return null;
    const rows = this._dll_rows('characters', f.get('name')[1], f.get('name')[2], n, 1);
    return rows.has(n) ? rows.get(n) : null;
  }

  // The name of row i of a table named by `spec` = [kind, base]: [id, name]
  row_name(spec, i) {
    if (!spec) return [null, null];
    const [kind, base] = spec;
    let n = base + i;
    if (kind === 'magic') return [n, this.magic(n)];
    if (kind === 'command') return [n, this.command(n)];
    if (kind === 'materia') return [n, this.materia(n)];
    if (kind === 'item') return [n, this.item(n)];
    if (kind === 'new_item') {
      n = new_item_id(i);
      return [n, this.item(n)];
    }
    if (kind === 'weapon_index') {
      n = weapon_item_id(i);
      return [n, n !== null ? this.item(n) : null];
    }
    if (kind === 'armour_index') {
      n = armour_item_id(i);
      return [n, n !== null ? this.item(n) : null];
    }
    if (kind === 'accessory_index') {
      n = accessory_item_id(i);
      return [n, n !== null ? this.item(n) : null];
    }
    if (kind === 'char') return [n, this.char(n)];
    if (kind === 'roster') return [12 + i, this.roster(i)];
    if (kind === 'seat') return [12 + i, null];
    return [n, null];
  }
}

// ---- decoding -------------------------------------------------------------------------------------------------------
export function _hex(b) {
  return Array.from(b, c => c.toString(16).padStart(2, '0')).join(' ');
}

// int.from_bytes(raw, 'little'): a Number up to 6 bytes, a BigInt beyond
function from_le(raw) {
  if (raw.length <= 6) return raw.length ? raw.readUIntLE(0, raw.length) : 0;
  let v = 0n;
  for (let k = raw.length - 1; k >= 0; k--) v = (v << 8n) | BigInt(raw[k]);
  return v;
}

const hx0 = (n, w) => n.toString(16).padStart(w, '0');
// n & mask, n >> bits of a field's value, a Number or a BigInt
const low = (n, mask) => (typeof n === 'bigint' ? Number(n & BigInt(mask)) : n % (mask + 1));
const shr = (n, bits) => (typeof n === 'bigint' ? n >> BigInt(bits) : Math.floor(n / 2 ** bits));
// '%08x' of a field's value (a BigInt past 6 bytes)
const x08 = n => (typeof n === 'bigint' ? n.toString(16).padStart(8, '0') : live.x08(n));

// [shown text, raw value] of one field
export function decode_field(raw, dec, names) {
  const n = from_le(raw);
  if (dec === 'u') return [String(n), n];
  if (dec === 'i') {
    const neg = raw.length && (raw[raw.length - 1] & 0x80);
    const v = !neg ? n : typeof n === 'bigint' ? n - (1n << BigInt(8 * raw.length)) : n - 2 ** (8 * raw.length);
    return [String(v), v];
  }
  if (dec === 'ptr') return [x08(n), n];
  if (dec === 'hex') return [raw.length <= 4 ? hx0(n, 2 * raw.length) : _hex(raw), raw.length <= 4 ? n : _hex(raw)];
  if (dec === 'bytes') {
    const h = _hex(raw.subarray(0, 32));
    return [raw.length > 32 ? h + ' ... (' + raw.length + ' bytes)' : h, null];
  }
  if (dec === 'ff7text') return [!raw.length || raw[0] === 0xff ? '' : ff7_text(raw), null];
  if (dec === 'ascii') {
    const z = raw.indexOf(0);
    return [(z < 0 ? raw : raw.subarray(0, z)).toString('latin1'), null];
  }
  if (dec === 'band') {
    if (raw.length < 2) throw Object.assign(new RangeError('index out of range'), { name: 'IndexError' });
    return ['gradient ' + raw[0] + ', base ' + raw[1], n];
  }
  if (dec === 'char') {
    if (n === 0xff) return ['none', n];
    const nm = names ? names.char(n) : null;
    return [nm ? n + ' ' + nm : String(n), n];
  }
  if (dec === 'command') {
    const nm = names ? names.command(n) : null;
    return [nm ? n + ' ' + nm : String(n), n];
  }
  if (dec === 'item') {
    if (n === 0xffff) return ['empty', n];
    const nm = names ? names.item(n) : null;
    return [nm ? n + ' ' + nm : String(n), n];
  }
  if (dec === 'stock') {
    if (n === 0xffff) return ['empty', n];
    const i = low(n, 0x1ff);
    const q = shr(n, 9);
    const nm = names ? names.item(i) : null;
    return [i + ' ' + (nm || '') + ' x ' + q, n];
  }
  if (dec === 'materia_slot') {
    if (raw.length > 4) {
      const parts = [];
      for (let k = 0; k < raw.length; k += 4) parts.push(decode_field(raw.subarray(k, k + 4), 'materia_slot', names)[0]);
      return [parts.join(', '), null];
    }
    if (n === 0xffffffff) return ['empty', n];
    const m = low(n, 0xff);
    const ap = shr(n, 8);
    const nm = names ? names.materia(m) : null;
    return [m + ' ' + (nm || '') + ' (AP ' + ap + ')', n];
  }
  if (dec === 'weapon_index' || dec === 'armour_index' || dec === 'accessory_index') {
    if (dec === 'accessory_index' && n === 0xff) return ['none', n];
    const iid = { weapon_index: weapon_item_id, armour_index: armour_item_id, accessory_index: accessory_item_id }[dec](n);
    const nm = names && iid !== null ? names.item(iid) : null;
    return [nm ? n + ' ' + nm : String(n), n];
  }
  if (dec === 'field') return [String(n), n];
  if (dec === 'wide_row') {
    if (n === 0xffffffff) return ['empty', n];
    const num = low(n, 0xffff);
    const q = shr(n, 16);
    const nm = names ? names.item(num) : null;
    return [num + ' ' + (nm || '') + ' x ' + q, n];
  }
  if (dec === 'shop_entries') {
    const out = [];
    for (let k = 0; k < raw.length - 7; k += 8) {
      const tt = raw.readUInt32LE(k);
      const v = raw.readUInt32LE(k + 4);
      if (tt === 0 && v === 0) continue;
      const nm = names ? (tt ? names.materia(v) : names.item(v)) : null;
      out.push((tt ? 'materia' : 'item') + ' ' + v + (nm ? ' ' + nm : ''));
    }
    return [out.join('; '), null];
  }
  if (dec === 'kernel_ptr') return [x08(n), n];
  return [_hex(raw), null];
}

// Rows as [{index, id, name, empty, fields: [{name, value, raw}], hex}]: `lay` from layout(), or null (raw)
export function decode_rows(lay, raw_bytes, record_size, first, names, name_spec, raw, id_for) {
  const rows = [];
  const n = record_size ? Math.floor(raw_bytes.length / record_size) : 0;
  for (let k = 0; k < n; k++) {
    const rec = raw_bytes.subarray(k * record_size, (k + 1) * record_size);
    const i = first + k;
    let [rid, nm] = names ? names.row_name(name_spec, i) : [null, null];
    if (id_for) rid = id_for(i);
    const row = { index: i, id: rid, name: nm, empty: rec.every(b => b === 0xff), fields: [] };
    if (lay) {
      for (const [off, w, fname, dec] of lay[1]) {
        const [v, r] = decode_field(rec.subarray(off, off + w), dec, names);
        row.fields.push({ name: fname, value: v, raw: r });
        if (fname === 'name' && !nm && v) row.name = v;
      }
    }
    if (raw || !lay) row.hex = _hex(rec);
    rows.push(row);
  }
  return rows;
}

// ---- the list -------------------------------------------------------------------------------------------------------
export function kernel_pointer(proc, section) {
  return proc.u32(KERNEL_POINTERS + 4 * (section - 1));
}

export function owner_of(address, exe_value, dir, dll_range) {
  if (address === exe_value) return 'exe';
  if (dll_range && dll_range[0] <= address && address < dll_range[1]) return 'dll';
  for (const e of (dir || {}).entries || []) {
    if (e.address && e.address <= address && address < e.address + e.record_size * Math.max(e.count, 1)) return 'dll';
  }
  return 'other';
}

export function dll_entry_at(dir, address) {
  for (const e of (dir || {}).entries || []) if (e.address === address) return e;
  return null;
}

export function dll_entry_by_name(dir, name) {
  for (const e of (dir || {}).entries || []) if (e.name === name) return e;
  return null;
}

// [address, count, record_size, note] of a vanilla table as the game has it now
export function resolve_vanilla(proc, tb, dir) {
  const a = get(tb, 'address', null);
  let note = null;
  let addr;
  if (Array.isArray(a)) {
    if (a[0] === 'kernel') {
      addr = kernel_pointer(proc, a[1]);
      const exe = KERNEL_EXE[a[1] - 1];
      if (addr !== exe) note = 'the game reads the copy at ' + live.x08(addr) + ' (the exe\'s is at ' + live.x08(exe) + ')';
    } else if (a[0] === 'pointer') {
      addr = proc.u32(a[1]) || a[2];
    } else {
      addr = proc.u32(a[1]) || a[2];
      if (addr !== a[2]) note = 'moved: the game reads ' + live.x08(addr) + ' (the exe\'s is at ' + live.x08(a[2]) + ')';
    }
  } else {
    addr = a;
  }
  let count = get(tb, 'count', null);
  if (Array.isArray(count)) {
    const [width, where, most] = count;
    count = Math.max(0, Math.min(proc.uint(where, width), most));
  }
  const e = dll_entry_at(dir, addr);
  if (e && e.record_size === req(tb, 'record_size') && addr !== (typeof a === 'number' ? a : null)) count = e.count;
  const d = get(tb, 'dll', null) ? dll_entry_by_name(dir, tb.dll) : null;
  if (d && d.live && d.address && typeof a === 'number' && d.record_size === req(tb, 'record_size')) {
    note = 'the game reads the DLL\'s ' + d.name + ' at ' + live.x08(d.address) + ' (the exe\'s is at ' + live.x08(addr) + ')';
    addr = d.address;
    count = d.count;
  }
  if (get(tb, 'seat_rows', false)) {
    let seats = null;
    const ch = ((dir || {}).entries || []).find(x => x.name === 'characters') || null;
    if (ch) {
      try {
        seats = live.live_count(proc, dir, ch);
      } catch (ex) {
        if (!(ex instanceof live.LiveError)) throw ex;
        seats = null;
      }
    }
    count = seats !== null && seats >= 0 && seats <= 4 ? 12 + seats : req(tb, 'count');
  }
  return [addr, count, req(tb, 'record_size'), note];
}

export function vanilla_list(proc, dir) {
  const out = [];
  for (const tb of VANILLA) {
    const row = { id: tb.id, title: tb.title, group: tb.group, valid: tb.valid, valid_text: VALID_TEXT[tb.valid],
                  kind: get(tb, 'kind', 'table'), note: get(tb, 'note', null), comparable: Boolean(get(tb, 'kept', 0)) };
    if (row.kind === 'table') {
      try {
        const [addr, count, rs, note] = resolve_vanilla(proc, tb, dir);
        Object.assign(row, { address: addr, count, record_size: rs, in_use: null, live: null,
                             layout_known: Boolean(tb.layout), moved: note });
      } catch (ex) {
        if (!(ex instanceof live.LiveError)) throw ex;
        Object.assign(row, { address: null, count: null, record_size: get(tb, 'record_size', null), error: ex.message });
      }
    }
    out.push(row);
  }
  return out;
}

export function dll_group(e) {
  return e.kind === live.KIND_HEAP ? 'SpellExt: heap' : 'SpellExt: tables';
}

// [layout or null, message or null] for a directory entry
export function dll_layout_check(e) {
  const name = get(DLL_LAYOUT, e.name, null);
  if (e.record_size === 1 || name === null) return [null, null];
  const lay = layout(name);
  if (lay === null) return [null, 'no layout for ' + e.name + ': raw hex'];
  if (lay[0] !== e.record_size) {
    return [null, 'the layout is from another build of the DLL (' + name + ' is ' + lay[0] + ' bytes here, ' + e.record_size + ' in the DLL): raw hex'];
  }
  return [lay, null];
}

export function dll_list(proc, dir) {
  const out = [];
  for (const e of (dir || {}).entries || []) {
    const [lay, msg] = dll_layout_check(e);
    const row = { id: 'sx:' + e.name, title: get(DLL_TITLES, e.name, e.name), name: e.name,
                  group: dll_group(e), address: e.address, record_size: e.record_size,
                  count: e.count, in_use: e.in_use, live: e.live, kind: 'table',
                  layout_known: lay !== null, layout_message: msg, valid: 'always',
                  heap: e.kind === live.KIND_HEAP, in_use_live: null };
    if (e.in_use_at) {
      try {
        row.in_use_live = live.live_count(proc, dir, e);
      } catch (ex) {
        if (!(ex instanceof live.LiveError)) throw ex;
        row.in_use_error = ex.message;
      }
    }
    if (e.kind === live.KIND_HEAP && !e.address) row.note = 'does not exist now (address 0)';
    out.push(row);
  }
  return out;
}

// ---- one table ------------------------------------------------------------------------------------------------------
export function clamp_window(count, record_size, first, want) {
  first = Math.max(0, Math.min(first, Math.max(count - 1, 0)));
  const cap = Math.max(1, Math.min(ROW_CAP, Math.floor(BYTE_CAP / Math.max(record_size, 1))));
  const n = Math.max(0, Math.min(want, cap, count - first));
  return [first, n];
}

export function read_values(proc, tb, names) {
  const rows = [];
  for (const [label, addr, width, dec] of tb.values) {
    try {
      const raw = proc.read(addr, width);
      let [v, r] = decode_field(raw, dec, names);
      if (dec === 'kernel_ptr') {
        const sec = Math.floor((addr - KERNEL_POINTERS) / 4);
        v += ' (' + (r === KERNEL_EXE[sec] ? 'the exe\'s' : 'moved') + ')';
      }
      rows.push({ label, address: addr, value: v, raw: r });
    } catch (ex) {
      if (!(ex instanceof live.LiveError)) throw ex;
      rows.push({ label, address: addr, value: null, error: ex.message });
    }
  }
  return rows;
}

// One kernel2 section's texts: the game's, else (with a message saying so) texts_file's.
export function read_texts(proc, names, section, first, want) {
  if (!names.sections().length) {
    return { texts_loaded: false, rows: [], count: 0, source: null,
             message: names.why_not_loaded() + ', and no kernel2.bin was found to show instead' };
  }
  section = Math.max(0, Math.min(Math.trunc(section), TEXT_SECTIONS - 1));
  const count = names.section_count(section);
  let n;
  [first, n] = clamp_window(count, 1, first, want);
  const rows = [];
  for (let i = first; i < first + n; i++) rows.push({ index: i, text: names.kernel2(section, i) });
  const out = { texts_loaded: true, section, section_title: TEXT_TITLES[section], count, from: first, rows,
                sections: TEXT_TITLES, source: names.source };
  if (names.source === 'file') out.message = 'shown from ' + names.texts_file.label + ', not from the game: ' + names.why_not_loaded();
  return out;
}

// Appends what `names` has to say (names from a file, reads that failed) to the table's message.
export function add_names_message(out, names) {
  const m = names ? names.message() : null;
  if (m) out.message = out.message ? out.message + '. ' + m : m;
  return out;
}

export function read_vanilla(proc, tb, names, first, want, raw, dir) {
  const out = { id: tb.id, title: tb.title, group: tb.group, kind: get(tb, 'kind', 'table'),
                valid: tb.valid, valid_text: VALID_TEXT[tb.valid], note: get(tb, 'note', null) };
  if (out.kind === 'values') {
    out.values = read_values(proc, tb, names);
    return add_names_message(out, names);
  }
  const [addr, count, rs, moved] = resolve_vanilla(proc, tb, dir);
  const lay = get(tb, 'layout', null) ? layout(tb.layout) : null;
  let n;
  [first, n] = clamp_window(count, rs, first, want);
  Object.assign(out, { address: addr, count, record_size: rs, moved, layout_known: lay !== null, from: first });
  if (!addr) {
    Object.assign(out, { rows: [], message: 'the pointer is 0: the table does not exist now' });
    return out;
  }
  const data = n ? proc.read(addr + first * rs, n * rs) : Buffer.alloc(0);
  out.rows = decode_rows(lay, data, rs, first, names, get(tb, 'names', null), raw);
  return add_names_message(out, names);
}

export function read_dll(proc, dir, e, names, first, want, raw) {
  const [lay, msg] = dll_layout_check(e);
  const out = { id: 'sx:' + e.name, title: get(DLL_TITLES, e.name, e.name), name: e.name,
                group: dll_group(e), kind: 'table', address: e.address, record_size: e.record_size,
                count: e.count, in_use: e.in_use, live: e.live, layout_known: lay !== null,
                layout_message: msg, valid: 'always', valid_text: VALID_TEXT.always,
                generation: dir.generation };
  let rs = e.record_size;
  let count = e.count;
  const view = e;
  if (rs === 1) {                               // a byte array: shown as rows of 16
    rs = 16;
    count = Math.floor((e.count + 15) / 16);
    out.record_size_shown = 16;
  }
  let n;
  [first, n] = clamp_window(count, rs, first, want);
  out.from = first;
  out.count_shown = count;
  if (!e.address) {
    Object.assign(out, { rows: [], message: 'does not exist now (a heap table with address 0)', in_use_live: null });
    return out;
  }
  let data;
  let live_n;
  try {
    if (e.record_size === 1) {
      const nbytes = Math.max(0, Math.min(n * 16, e.count - first * 16));
      [data, live_n] = live.read_table_window(proc, dir, view, first * 16, nbytes);
    } else {
      [data, live_n] = live.read_table_window(proc, dir, view, first, n);
    }
  } catch (ex) {
    if (ex instanceof live.LiveRebuilt) {
      Object.assign(out, { rows: [], rebuilt: true, message: ex.message });
      return out;
    }
    throw ex;
  }
  out.in_use_live = e.in_use_at ? live_n : null;
  if (e.record_size === 1 && data.length % 16) data = Buffer.concat([data, Buffer.alloc(16 - (data.length % 16), 0xff)]);
  out.rows = decode_rows(lay, data, rs, first, names, get(DLL_NAMES, e.name, null), raw);
  return add_names_message(out, names);
}

// ---- comparisons ------------------------------------------------------------------------------------------------------
export function diff_records(live_bytes, other, record_size, label_of, limit) {
  limit = limit === undefined ? 200 : limit;
  const lines = [];
  const n = Math.floor(Math.min(live_bytes.length, other.length) / record_size);
  let same = 0;
  for (let i = 0; i < n; i++) {
    const a = live_bytes.subarray(i * record_size, (i + 1) * record_size);
    const b = other.subarray(i * record_size, (i + 1) * record_size);
    if (a.equals(b)) {
      same += 1;
      continue;
    }
    const ch = [];
    for (let k = 0; k < record_size; k++) {
      if (a[k] !== b[k]) ch.push('+' + hx0(k, 2) + ' ' + hx0(b[k], 2) + '->' + hx0(a[k], 2));
    }
    if (lines.length < limit) {
      lines.push({ record: i, name: label_of(i), text: 'differs: ' + ch.slice(0, 12).join(', ') +
                   (ch.length > 12 ? ' and ' + (ch.length - 12) + ' more' : '') });
    }
  }
  return { agree: same, differ: n - same, lines };
}

// KERNEL.BIN section 1-9 unpacked (ai_tool's reader)
export function kernel_section_bytes(kernel_bytes, section) {
  const secs = t.kernel_sections(kernel_bytes);
  if (section - 1 >= secs.length) throw Object.assign(new RangeError('list index out of range'), { name: 'IndexError' });
  return secs[section - 1];
}

// The comparisons of a vanilla kernel table: with the DLL's kernel_kept copy and with the KERNEL.BIN chosen on the
// AI page.
export function compare(proc, tb, names, dir, kernel, kernel_label) {
  const sec = get(tb, 'kept', null);
  if (!sec) return { id: tb.id, comparisons: [], message: 'no comparison for this table' };
  const [addr, count, rs] = resolve_vanilla(proc, tb, dir);
  const size = new Map(KEPT_SECTIONS).get(sec);
  const whole = sec === 3;
  const cmp_size = whole ? size : Math.min(size, count * rs);
  const live_bytes = proc.read(addr, cmp_size);
  const rsz = whole ? size : rs;
  const label = i => (whole ? null : names.row_name(get(tb, 'names', null), i)[1]);
  const out = [];
  const kept = dll_entry_by_name(dir, 'kernel_kept');
  if (kept && kept.address) {
    let off = 0;
    for (const [k, s] of KEPT_SECTIONS) if (k < sec) off += s;
    try {
      const [data] = live.read_table_window(proc, dir, Object.assign({}, kept, { record_size: 1 }), off, size);
      if (kept.live === false) {
        out.push({ with: 'kernel_kept', message: 'the DLL has not kept the kernel yet (kernel_kept_ready 0)' });
      } else {
        const r = diff_records(live_bytes, data.subarray(0, cmp_size), rsz, label);
        r.with = 'kernel_kept (the kernel as loaded, before SpellExt changed it)';
        out.push(r);
      }
    } catch (ex) {
      if (!(ex instanceof live.LiveError)) throw ex;
      out.push({ with: 'kernel_kept', message: ex.message });
    }
  } else {
    out.push({ with: 'kernel_kept', message: 'no SpellExt directory: nothing kept to compare with' });
  }
  if (kernel && kernel.length) {
    try {
      const k = kernel_section_bytes(kernel, sec);
      const r = diff_records(live_bytes, k.subarray(0, cmp_size), rsz, label);
      r.with = 'KERNEL.BIN: ' + (kernel_label || 'the chosen kernel');
      out.push(r);
    } catch (ex) {         // a kernel ai_tool cannot read
      out.push({ with: 'KERNEL.BIN', message: 'cannot read the chosen kernel: ' + ex.message });
    }
  }
  return add_names_message({ id: tb.id, section: sec, comparisons: out }, names);
}
