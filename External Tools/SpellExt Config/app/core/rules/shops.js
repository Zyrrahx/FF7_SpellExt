// FF7_SpellExt_Shops.ini: port of sxcfg/rules/shops.py. load_shop_file (spellext.c 37293), called from the game file's
// reader (load_game_settings, after its own lines: shop_add entries of the game file count first).
//
// Not forecast: the cap of SHOP_ADD_MAX (2560) entries counts the game file's shop_add entries too; the port counts
// only this file's (a cap no real file reaches).
import { lines, trim, parse_number, word_is, next_word } from '../grammar.js';
import { register } from '../validate.js';
import { pyFind } from '../py.js';

export const FILE = 'FF7_SpellExt_Shops.ini';
export const SHOP_COUNT = 80;
export const SHOP_ADD_MAX = 80 * 32;

export function check(r) {
  const s = r.text;
  let shop = -1;
  let count = 0;
  for (const ln of lines(s)) {
    const start = ln.start;
    const stop = ln.stop;
    const n = ln.number;
    if (start === stop) continue;
    if (s[start] === '[') {
      let p = start + 1;
      let ok = false;
      let v;
      if (s[stop - 1] === ']') [ok, p, v] = parse_number(s, p, stop - 1);
      if (s[stop - 1] !== ']' || !ok || p !== stop - 1 || v >= SHOP_COUNT) {
        r.log(n, 'shop file line %d: a section is a shop\'s number in brackets, [0] to [79]', n);
        shop = -1;
      } else {
        shop = v;
      }
      continue;
    }
    let equals = pyFind(s, '=', start, stop);
    if (equals < 0) equals = stop;
    const [key, key_end] = trim(s, start, equals);
    const [value, vstop] = trim(s, equals < stop ? equals + 1 : stop, stop);
    if (!word_is(s, key, key_end, 'add') || shop < 0) {
      r.log(n, 'shop file line %d: %s', n, shop < 0 ? 'no shop section before this line' : 'the only key is add');
      continue;
    }
    let p = value;
    while (true) {
      const w = next_word(s, p, vstop);
      if (w === null) break;
      let word_end;
      [p, word_end] = w;
      const materia = p < word_end && (s[p] === 'm' || s[p] === 'M');
      if (materia) p += 1;
      let ok;
      let ident;
      [ok, p, ident] = parse_number(s, p, word_end);
      if (!ok || (ident > (materia ? 254 : 511) && (materia || !(1024 <= ident && ident <= 9999))) ||
          p !== word_end || count === SHOP_ADD_MAX) {
        r.log(n, 'shop file line %d: add takes item IDs (0 to 511, or a wide item\'s number 1024 to 9999) and materia as m and an ID (m49); a shop holds 32 entries', n);
        break;
      }
      count += 1;
      p = word_end;
    }
  }
}

export function section_kind(header) {
  const s = header;
  if (!s.startsWith('[') || s[s.length - 1] !== ']') return null;
  const [ok, p, v] = parse_number(s, 1, s.length - 1);
  return ok && p === s.length - 1 && v < SHOP_COUNT ? 'shop' : null;
}

register(FILE, check, 21, section_kind);
