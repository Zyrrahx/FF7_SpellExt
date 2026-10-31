// Python's difflib, the parts the editor uses, ported from CPython 3.14 Lib/difflib.py line for line:
// SequenceMatcher (isjunk, autojunk: with 200 or more elements in b, an element seen more than 1 % of the time is
// "popular" and left out of the matching), find_longest_match, get_matching_blocks, get_opcodes,
// get_grouped_opcodes, and unified_diff with its "@@ -a,b +c,d @@" ranges. Elements are compared with === (the
// editor compares lines, which are strings). Not an approximation: the Changes tab and apply_edited_text depend on
// the exact same matching as the Python tool.

export class SequenceMatcher {
  constructor(isjunk, a, b, autojunk) {
    this.isjunk = isjunk || null;
    this.a = this.b = null;
    this.autojunk = autojunk === undefined ? true : autojunk;
    this.set_seqs(a === undefined ? '' : a, b === undefined ? '' : b);
  }

  set_seqs(a, b) {
    this.set_seq1(a);
    this.set_seq2(b);
  }

  set_seq1(a) {
    if (a === this.a) return;
    this.a = a;
    this.matching_blocks = this.opcodes = null;
  }

  set_seq2(b) {
    if (b === this.b) return;
    this.b = b;
    this.matching_blocks = this.opcodes = null;
    this.fullbcount = null;
    this._chain_b();
  }

  _chain_b() {
    const b = this.b;
    const b2j = this.b2j = new Map();
    for (let i = 0; i < b.length; i++) {
      const elt = b[i];
      let indices = b2j.get(elt);
      if (indices === undefined) {
        indices = [];
        b2j.set(elt, indices);
      }
      indices.push(i);
    }
    const junk = this.bjunk = new Set();
    if (this.isjunk) {
      for (const elt of b2j.keys()) {
        if (this.isjunk(elt)) junk.add(elt);
      }
      for (const elt of junk) b2j.delete(elt);
    }
    const popular = this.bpopular = new Set();
    const n = b.length;
    if (this.autojunk && n >= 200) {
      const ntest = Math.floor(n / 100) + 1;
      for (const [elt, idxs] of b2j) {
        if (idxs.length > ntest) popular.add(elt);
      }
      for (const elt of popular) b2j.delete(elt);
    }
  }

  // [i, j, k]: a[i:i+k] equals b[j:j+k], the longest such block, earliest in a, then earliest in b
  find_longest_match(alo, ahi, blo, bhi) {
    const a = this.a;
    const b = this.b;
    const b2j = this.b2j;
    const bjunk = this.bjunk;
    if (alo === undefined) alo = 0;
    if (ahi === undefined || ahi === null) ahi = a.length;
    if (blo === undefined) blo = 0;
    if (bhi === undefined || bhi === null) bhi = b.length;
    let besti = alo;
    let bestj = blo;
    let bestsize = 0;
    let j2len = new Map();
    const nothing = [];
    for (let i = alo; i < ahi; i++) {
      const newj2len = new Map();
      const js = b2j.get(a[i]) || nothing;
      for (const j of js) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (j2len.get(j - 1) || 0) + 1;
        newj2len.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
      j2len = newj2len;
    }
    while (besti > alo && bestj > blo && !bjunk.has(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && !bjunk.has(b[bestj + bestsize]) &&
           a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize += 1;
    }
    while (besti > alo && bestj > blo && bjunk.has(b[bestj - 1]) && a[besti - 1] === b[bestj - 1]) {
      besti -= 1;
      bestj -= 1;
      bestsize += 1;
    }
    while (besti + bestsize < ahi && bestj + bestsize < bhi && bjunk.has(b[bestj + bestsize]) &&
           a[besti + bestsize] === b[bestj + bestsize]) {
      bestsize = bestsize + 1;
    }
    return [besti, bestj, bestsize];
  }

  get_matching_blocks() {
    if (this.matching_blocks !== null) return this.matching_blocks;
    const la = this.a.length;
    const lb = this.b.length;
    const queue = [[0, la, 0, lb]];
    const matching_blocks = [];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const x = this.find_longest_match(alo, ahi, blo, bhi);
      const [i, j, k] = x;
      if (k) {
        matching_blocks.push(x);
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    matching_blocks.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]) || (p[2] - q[2]));
    let i1 = 0;
    let j1 = 0;
    let k1 = 0;
    const non_adjacent = [];
    for (const [i2, j2, k2] of matching_blocks) {
      if (i1 + k1 === i2 && j1 + k1 === j2) {
        k1 += k2;
      } else {
        if (k1) non_adjacent.push([i1, j1, k1]);
        i1 = i2;
        j1 = j2;
        k1 = k2;
      }
    }
    if (k1) non_adjacent.push([i1, j1, k1]);
    non_adjacent.push([la, lb, 0]);
    this.matching_blocks = non_adjacent;
    return this.matching_blocks;
  }

  // [[tag, i1, i2, j1, j2]], tag one of 'replace', 'delete', 'insert', 'equal'
  get_opcodes() {
    if (this.opcodes !== null) return this.opcodes;
    let i = 0;
    let j = 0;
    const answer = this.opcodes = [];
    for (const [ai, bj, size] of this.get_matching_blocks()) {
      let tag = '';
      if (i < ai && j < bj) tag = 'replace';
      else if (i < ai) tag = 'delete';
      else if (j < bj) tag = 'insert';
      if (tag) answer.push([tag, i, ai, j, bj]);
      i = ai + size;
      j = bj + size;
      if (size) answer.push(['equal', ai, i, bj, j]);
    }
    return answer;
  }

  // the change clusters with up to n lines of context (a generator in Python: a list here)
  get_grouped_opcodes(n) {
    if (n === undefined) n = 3;
    // the first and last opcode are changed in the cached list itself, as Python does
    let codes = this.get_opcodes();
    if (!codes.length) codes = [['equal', 0, 1, 0, 1]];
    if (codes[0][0] === 'equal') {
      const [tag, i1, i2, j1, j2] = codes[0];
      codes[0] = [tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2];
    }
    if (codes[codes.length - 1][0] === 'equal') {
      const [tag, i1, i2, j1, j2] = codes[codes.length - 1];
      codes[codes.length - 1] = [tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)];
    }
    const nn = n + n;
    const out = [];
    let group = [];
    for (let [tag, i1, i2, j1, j2] of codes) {
      if (tag === 'equal' && i2 - i1 > nn) {
        group.push([tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)]);
        out.push(group);
        group = [];
        i1 = Math.max(i1, i2 - n);
        j1 = Math.max(j1, j2 - n);
      }
      group.push([tag, i1, i2, j1, j2]);
    }
    if (group.length && !(group.length === 1 && group[0][0] === 'equal')) out.push(group);
    return out;
  }
}

// Convert range to the "ed" format
export function _format_range_unified(start, stop) {
  let beginning = start + 1;
  const length = stop - start;
  if (length === 1) return String(beginning);
  if (!length) beginning -= 1;
  return beginning + ',' + length;
}

// the unified diff of two lists of lines (a generator in Python: a list of lines here)
export function unified_diff(a, b, fromfile, tofile, fromfiledate, tofiledate, n, lineterm) {
  if (fromfile === undefined) fromfile = '';
  if (tofile === undefined) tofile = '';
  if (!fromfiledate) fromfiledate = '';
  if (!tofiledate) tofiledate = '';
  if (n === undefined) n = 3;
  if (lineterm === undefined) lineterm = '\n';
  const out = [];
  let started = false;
  for (const group of new SequenceMatcher(null, a, b).get_grouped_opcodes(n)) {
    if (!started) {
      started = true;
      const fromdate = fromfiledate ? '\t' + fromfiledate : '';
      const todate = tofiledate ? '\t' + tofiledate : '';
      out.push('--- ' + fromfile + fromdate + lineterm);
      out.push('+++ ' + tofile + todate + lineterm);
    }
    const first = group[0];
    const last = group[group.length - 1];
    const file1_range = _format_range_unified(first[1], last[2]);
    const file2_range = _format_range_unified(first[3], last[4]);
    out.push('@@ -' + file1_range + ' +' + file2_range + ' @@' + lineterm);
    for (const [tag, i1, i2, j1, j2] of group) {
      if (tag === 'equal') {
        for (const line of a.slice(i1, i2)) out.push(' ' + line);
        continue;
      }
      if (tag === 'replace' || tag === 'delete') {
        for (const line of a.slice(i1, i2)) out.push('-' + line);
      }
      if (tag === 'replace' || tag === 'insert') {
        for (const line of b.slice(j1, j2)) out.push('+' + line);
      }
    }
  }
  return out;
}
