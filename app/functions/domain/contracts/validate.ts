// 模型输出校验（doc 02 §1.4 步骤 8、§1.5、§1.7、§1.8）。
// 模型输出视为不可信：只接受能在原文定位的引句，丢弃越界/改写引句，
// 拒绝不在允许集合内的来源引用，并清除模型不应生成的网址/电话。

import type {
  FindingCategory,
  CheckStatus,
  ContractExcerpt,
} from '../../shared/contract.ts';
import type { SourceRef } from '../../shared/sources.ts';
import type { ModelFindingDraft } from '../../integrations/llm.ts';
import { locateExcerpt } from './locate.ts';

const CATEGORIES: readonly FindingCategory[] = [
  'deposit_amount',
  'deposit_return',
  'deposit_deduction',
  'deposit_forfeit',
];
const STATUSES: readonly CheckStatus[] = ['clear', 'ambiguous', 'not_found', 'needs_verification'];

const URL_RE = /(https?:\/\/[^\s，。；)）]+|www\.[^\s，。；)）]+)/g;
const PHONE_RE = /(?<!\d)(1[3-9]\d{9}|\d{3,4}-\d{7,8})(?!\d)/g;

export type ValidatedModelFinding = {
  category: FindingCategory;
  checkStatus: CheckStatus;
  excerpts: ContractExcerpt[];
  hasOriginalSupport: boolean;
  ambiguousLocations: boolean;
  explanation: string;
  suggestedQuestions: string[];
  negotiationSuggestion: string | null;
  sourceRefs: SourceRef[];
  depositAmountCents: number | null;
  returnTimingText: string | null;
  deductionItems: string[];
};

export type ValidationResult = {
  findings: ValidatedModelFinding[];
  warnings: string[];
  droppedExcerpts: number;
  droppedRefs: number;
  sanitizedFields: number;
};

export type AllowedRefs = {
  sourceIds: Set<string>;
  refKeys: Set<string>; // `${sourceId}::${articleId}`
};

function sanitize(text: string): { value: string; changed: boolean } {
  let changed = false;
  let value = text.replace(URL_RE, () => {
    changed = true;
    return '[已移除链接]';
  });
  value = value.replace(PHONE_RE, () => {
    changed = true;
    return '[已移除号码]';
  });
  return { value, changed };
}

function isRefAllowed(ref: SourceRef, allowed: AllowedRefs): boolean {
  if (!allowed.sourceIds.has(ref.sourceId)) return false;
  if (ref.articleIds.length === 0) return true;
  return ref.articleIds.every((a) => allowed.refKeys.has(`${ref.sourceId}::${a}`));
}

export function validateModelFindings(
  drafts: ModelFindingDraft[],
  originalText: string,
  allowed: AllowedRefs,
): ValidationResult {
  const findings: ValidatedModelFinding[] = [];
  const warnings: string[] = [];
  let droppedExcerpts = 0;
  let droppedRefs = 0;
  let sanitizedFields = 0;

  for (const draft of drafts) {
    if (!CATEGORIES.includes(draft.category)) continue;
    const checkStatus: CheckStatus = STATUSES.includes(draft.checkStatus)
      ? draft.checkStatus
      : 'needs_verification';

    const excerpts: ContractExcerpt[] = [];
    let ambiguousLocations = false;
    for (const quote of draft.excerptTexts) {
      const located = locateExcerpt(originalText, quote);
      if (!located.found) {
        droppedExcerpts++;
        continue;
      }
      if (located.ambiguous) ambiguousLocations = true;
      for (const m of located.matches) excerpts.push({ text: m.text, start: m.start, end: m.end });
    }

    const sourceRefs: SourceRef[] = [];
    for (const ref of draftExcerptRefs(draft)) {
      if (isRefAllowed(ref, allowed)) sourceRefs.push(ref);
      else droppedRefs++;
    }

    const expSan = sanitize(draft.explanation);
    if (expSan.changed) sanitizedFields++;
    const questions: string[] = [];
    for (const q of draft.suggestedQuestions) {
      const s = sanitize(q);
      if (s.changed) sanitizedFields++;
      questions.push(s.value);
    }
    let negotiation: string | null = null;
    if (draft.negotiationSuggestion !== null) {
      const s = sanitize(draft.negotiationSuggestion);
      if (s.changed) sanitizedFields++;
      negotiation = s.value;
    }

    findings.push({
      category: draft.category,
      // 引句全部无法定位时，不得保留确定性结论（doc 02 §1.5）。
      checkStatus: excerpts.length === 0 && draft.excerptTexts.length > 0 ? 'needs_verification' : checkStatus,
      excerpts,
      hasOriginalSupport: excerpts.length > 0,
      ambiguousLocations,
      explanation: expSan.value,
      suggestedQuestions: questions,
      negotiationSuggestion: negotiation,
      sourceRefs,
      depositAmountCents:
        Number.isSafeInteger(draft.depositAmountCents) && (draft.depositAmountCents as number) >= 0
          ? (draft.depositAmountCents as number)
          : null,
      returnTimingText: draft.returnTimingText,
      deductionItems: draft.deductionItems.filter((d) => typeof d === 'string'),
    });
  }

  if (droppedExcerpts > 0) {
    warnings.push(`已丢弃 ${droppedExcerpts} 条无法在原文定位的模型引句，相关项转为待核实。`);
  }
  if (droppedRefs > 0) {
    warnings.push(`已拒绝 ${droppedRefs} 条不在允许资料范围内的来源引用。`);
  }
  if (sanitizedFields > 0) {
    warnings.push('模型输出中检测到不应出现的网址/号码，已移除。');
  }
  if (findings.some((f) => f.ambiguousLocations)) {
    warnings.push('部分引句在原文中出现多次，已纳入全部匹配位置并标记歧义，请人工确认对应段落。');
  }

  return { findings, warnings, droppedExcerpts, droppedRefs, sanitizedFields };
}

// ModelFindingDraft 当前不携带 sourceRefs（一期由规则/资料侧闭合引用），
// 保留此函数以便未来扩展时集中处理引用校验。
function draftExcerptRefs(draft: ModelFindingDraft): SourceRef[] {
  const withRefs = draft as ModelFindingDraft & { sourceRefs?: SourceRef[] };
  return Array.isArray(withRefs.sourceRefs) ? withRefs.sourceRefs : [];
}
