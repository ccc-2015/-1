// 候选段落提取（doc 02 §1.4 步骤 3）。
// 通过押金相关词与上下文规则获取候选段落，保留否定语义与相邻条件。
// 每个候选段都带有原文 UTF-16 偏移，text.slice(start,end) === segment.text。

import { DEPOSIT_KEYWORDS } from '../../integrations/llm.ts';

export type CandidateSegment = { text: string; start: number; end: number };

// 触发纳入相邻句的条件/转折标记，用于保留“若…则扣除”等上下文。
const CONTEXT_MARKERS = [
  '若',
  '如果',
  '如',
  '提前',
  '违约',
  '损坏',
  '逾期',
  '未经',
  '擅自',
  '则',
  '应',
  '需',
  '按',
  '照',
] as const;

// 押金语境的扩展词：未含核心关键词但明显与押金有关（doc 02 §1.8「履约保证金」）。
const CONTEXT_KEYWORDS = ['履约保证金', '保证金', '押一', '押', '租金', '退房', '退租', '交接'] as const;

const SENTENCE_RE = /[^。；\n]+[。；\n]?/g;

export function splitSegments(text: string): CandidateSegment[] {
  const segments: CandidateSegment[] = [];
  SENTENCE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SENTENCE_RE.exec(text)) !== null) {
    const raw = m[0];
    const base = m.index;
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const start = base + lead;
    const end = start + trimmed.length;
    segments.push({ text: trimmed, start, end });
  }
  return segments;
}

function hasCoreKeyword(segment: string): boolean {
  return DEPOSIT_KEYWORDS.some((k) => segment.includes(k));
}

function hasContextKeyword(segment: string): boolean {
  return CONTEXT_KEYWORDS.some((k) => segment.includes(k));
}

function hasContextMarker(segment: string): boolean {
  return CONTEXT_MARKERS.some((k) => segment.includes(k));
}

// 返回带原文偏移的候选段落，按出现顺序，已去重。
export function extractCandidates(text: string): CandidateSegment[] {
  const segments = splitSegments(text);
  const keep = new Set<number>();

  segments.forEach((seg, i) => {
    if (hasCoreKeyword(seg.text) || hasContextKeyword(seg.text)) {
      keep.add(i);
      // 相邻条件句：前一句或后一句含条件/转折标记时一并纳入，保留上下文。
      const prev = segments[i - 1];
      const next = segments[i + 1];
      if (prev && hasContextMarker(prev.text)) keep.add(i - 1);
      if (next && hasContextMarker(next.text)) keep.add(i + 1);
    }
  });

  return [...keep].sort((a, b) => a - b).map((i) => segments[i]!);
}

// 供模型请求使用的纯文本候选段（不含偏移）。
export function candidateParagraphs(segments: CandidateSegment[]): string[] {
  return segments.map((s) => s.text);
}
