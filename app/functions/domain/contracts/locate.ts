// UTF-16 原文定位（doc 02 §1.5）。
// start/end 为左闭右开 UTF-16 索引，必须满足 text.slice(start, end) === located.text。
// 先精确匹配，失败后做空白归一化回映射；重复匹配标记歧义；找不到则丢弃。

const WHITESPACE = /\s/;

export type Normalization = {
  normalized: string;
  // map[i] = 归一化串第 i 个字符对应的原文 UTF-16 索引（真实字符）
  map: number[];
};

export function buildNormalization(text: string): Normalization {
  let normalized = '';
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (WHITESPACE.test(c)) {
      if (normalized.length > 0) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      normalized += ' ';
      map.push(i);
      pendingSpace = false;
    }
    normalized += c;
    map.push(i);
  }
  return { normalized, map };
}

export type LocatedExcerpt = { text: string; start: number; end: number };

export type LocateResult = {
  found: boolean;
  matches: LocatedExcerpt[];
  ambiguous: boolean;
};

const NOT_FOUND: LocateResult = { found: false, matches: [], ambiguous: false };

function collectExact(original: string, quote: string): LocatedExcerpt[] {
  const out: LocatedExcerpt[] = [];
  if (quote.length === 0) return out;
  let from = 0;
  for (;;) {
    const idx = original.indexOf(quote, from);
    if (idx === -1) break;
    out.push({ text: quote, start: idx, end: idx + quote.length });
    from = idx + quote.length;
  }
  return out;
}

function collectNormalized(original: string, quote: string): LocatedExcerpt[] {
  const quoteNorm = buildNormalization(quote).normalized;
  if (quoteNorm.length === 0) return [];
  const { normalized, map } = buildNormalization(original);
  const out: LocatedExcerpt[] = [];
  let from = 0;
  for (;;) {
    const nStart = normalized.indexOf(quoteNorm, from);
    if (nStart === -1) break;
    const nEnd = nStart + quoteNorm.length;
    const start = map[nStart]!;
    const end = map[nEnd - 1]! + 1;
    const slice = original.slice(start, end);
    // 回映射后必须与原引句归一化一致，避免空白差异导致越界或串段。
    if (buildNormalization(slice).normalized === quoteNorm) {
      out.push({ text: slice, start, end });
    }
    from = nEnd;
  }
  return out;
}

export function locateExcerpt(original: string, quote: string): LocateResult {
  const trimmed = quote.trim();
  if (trimmed.length === 0) return NOT_FOUND;

  let matches = collectExact(original, trimmed);
  if (matches.length === 0) {
    matches = collectNormalized(original, trimmed);
  }
  if (matches.length === 0) return NOT_FOUND;

  // 去重（精确与归一化不会产生重复，但保险起见按 start 去重）
  const seen = new Set<number>();
  const unique = matches.filter((m) => {
    if (seen.has(m.start)) return false;
    seen.add(m.start);
    return true;
  });

  return { found: true, matches: unique, ambiguous: unique.length > 1 };
}
