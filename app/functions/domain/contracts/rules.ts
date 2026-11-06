// 一期字面规则（doc 02 §1.6）。
// 这些是「已实现且独立验证」的确定性结果，可在主模型不可用时单独返回
// （processingMode=rules, coverage=limited）。规则只描述合同表述，不判断合法性、
// 不凭空给出法定天数、不认定条款无效。

import type {
  ContractFinding,
  FindingCategory,
  CheckStatus,
  FindingPriority,
  LegalAssessment,
  ContractExcerpt,
} from '../../shared/contract.ts';
import { NEGATION_MARKERS } from '../../integrations/llm.ts';
import type { CandidateSegment } from './candidates.ts';

const AMOUNT_RE = /(\d+(?:\.\d{1,2})?)\s*元/;
const GLOBAL_AMOUNT_RE = /(\d+(?:\.\d{1,2})?)\s*元/g;
const DEPOSIT_MULTIPLIER_RE = /押[一二三四1-4]\s*付[一二三四1-4]/;
const RETURN_TIME_RE = /\d+\s*(日|天|个工作日|个月|个月内|日内)/;
const VAGUE_DEDUCTION = ['一切费用', '所有费用', '由出租人决定', '甲方决定', '酌情', '任意', '出租方单方'];
const FORFEIT_WORDS = ['不退', '没收', '不予退还', '全额扣除', '不退还'];

function toExcerpt(seg: CandidateSegment): ContractExcerpt {
  return { text: seg.text, start: seg.start, end: seg.end };
}

function isNegated(segment: string): boolean {
  return NEGATION_MARKERS.some((m) => segment.includes(m));
}

function firstAmountCents(segment: string): number | null {
  const m = segment.match(AMOUNT_RE);
  if (!m) return null;
  const yuan = Number.parseFloat(m[1]!);
  if (!Number.isFinite(yuan)) return null;
  return Math.round(yuan * 100);
}

function allAmountCents(segments: CandidateSegment[]): number[] {
  const out: number[] = [];
  for (const seg of segments) {
    GLOBAL_AMOUNT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GLOBAL_AMOUNT_RE.exec(seg.text)) !== null) {
      const yuan = Number.parseFloat(m[1]!);
      if (Number.isFinite(yuan)) out.push(Math.round(yuan * 100));
    }
  }
  return out;
}

function baseFinding(
  category: FindingCategory,
  checkStatus: CheckStatus,
  priority: FindingPriority,
  legalAssessment: LegalAssessment,
  excerpts: ContractExcerpt[],
  explanation: string,
  suggestedQuestions: string[],
  negotiationSuggestion: string | null,
  missingFacts: string[],
): ContractFinding {
  return {
    id: category,
    category,
    checkStatus,
    priority,
    legalAssessment,
    excerpts,
    explanation,
    suggestedQuestions,
    negotiationSuggestion,
    sourceRefs: [],
    missingFacts,
  };
}

function segmentsWith(segments: CandidateSegment[], words: readonly string[]): CandidateSegment[] {
  return segments.filter((s) => words.some((w) => s.text.includes(w)));
}

export type RuleFindings = {
  findings: ContractFinding[];
  depositAmountCents: number | null;
  returnTimingText: string | null;
  deductionItems: string[];
};

function buildAmountFinding(segments: CandidateSegment[]): { finding: ContractFinding; cents: number | null } {
  const relevant = segmentsWith(segments, ['押金', '保证金', '订金', '定金']);
  const multiplierSegs = segments.filter((s) => DEPOSIT_MULTIPLIER_RE.test(s.text));
  if (relevant.length === 0 && multiplierSegs.length === 0) {
    return {
      finding: baseFinding(
        'deposit_amount',
        'not_found',
        'notice',
        'not_assessed',
        [],
        '所提供文本中未识别到明确押金金额约定。',
        ['请确认合同是否包含押金条款，或补充相关页/片段。'],
        null,
        [],
      ),
      cents: null,
    };
  }

  const amounts = allAmountCents(relevant);
  const unique = [...new Set(amounts)];
  const excerpts = relevant.slice(0, 3).map(toExcerpt);

  if (unique.length > 1) {
    return {
      finding: baseFinding(
        'deposit_amount',
        'ambiguous',
        'high',
        'unclear_or_missing',
        excerpts,
        '文本中出现多个不同的押金金额，可能相互矛盾或分别对应不同款项，需核实以哪个为准。',
        ['合同中约定的押金金额具体是多少？是否存在多处不一致的表述？'],
        '建议要求双方确认唯一押金金额并在合同中统一表述。',
        ['唯一押金金额'],
      ),
      cents: null,
    };
  }

  if (unique.length === 1) {
    return {
      finding: baseFinding(
        'deposit_amount',
        'clear',
        'notice',
        'not_assessed',
        excerpts,
        '识别到明确的押金金额约定。金额是否合法合理需结合当地规定与实际情况判断，此处仅提取合同表述。',
        [],
        null,
        [],
      ),
      cents: unique[0]!,
    };
  }

  // 无显式金额：可能是「押一付三」类倍数约定。
  const multiplier = multiplierSegs[0];
  if (multiplier) {
    return {
      finding: baseFinding(
        'deposit_amount',
        'ambiguous',
        'medium',
        'unclear_or_missing',
        [toExcerpt(multiplier)],
        '识别到「押一付三」类倍数约定，但未写明对应的具体金额，需结合月租金确认。',
        ['该倍数约定对应的月租金是多少？押金实际金额如何计算？'],
        '建议在合同中写明押金的具体金额，避免仅以倍数表述产生歧义。',
        ['对应月租金额'],
      ),
      cents: null,
    };
  }

  return {
    finding: baseFinding(
      'deposit_amount',
      'ambiguous',
      'medium',
      'unclear_or_missing',
      excerpts,
      '文本提及押金但未写明具体金额，需补充核实。',
      ['押金的具体金额是多少？'],
      null,
      ['押金具体金额'],
    ),
    cents: null,
  };
}

function buildReturnFinding(segments: CandidateSegment[]): { finding: ContractFinding; timing: string | null } {
  const relevant = segmentsWith(segments, ['退还', '退回', '返还']);
  if (relevant.length === 0) {
    return {
      finding: baseFinding(
        'deposit_return',
        'not_found',
        'notice',
        'unclear_or_missing',
        [],
        '所提供文本中未识别到押金退还安排。',
        ['合同是否约定了押金退还的时间和条件？'],
        null,
        ['退还时间与条件'],
      ),
      timing: null,
    };
  }

  const timed = relevant.find((s) => RETURN_TIME_RE.test(s.text));
  const excerpts = relevant.slice(0, 3).map(toExcerpt);
  if (timed) {
    return {
      finding: baseFinding(
        'deposit_return',
        'clear',
        'notice',
        'not_assessed',
        excerpts,
        '识别到押金退还的时间/条件约定。此处仅提取合同表述，不代表该约定必然合法或可执行。',
        [],
        null,
        [],
      ),
      timing: timed.text,
    };
  }

  return {
    finding: baseFinding(
      'deposit_return',
      'ambiguous',
      'medium',
      'unclear_or_missing',
      excerpts,
      '识别到退还相关表述，但未写明具体退还时间或条件，需补充核实。',
      ['押金在什么时间、满足什么条件下退还？是否存在多个不一致的期限？'],
      '建议明确退还的具体时间、条件与所需凭证。',
      ['退还时间', '退还条件'],
    ),
    timing: null,
  };
}

function buildDeductionFinding(segments: CandidateSegment[]): { finding: ContractFinding; items: string[] } {
  const relevant = segmentsWith(segments, ['扣除', '扣款', '抵扣']);
  if (relevant.length === 0) {
    return {
      finding: baseFinding(
        'deposit_deduction',
        'not_found',
        'notice',
        'not_assessed',
        [],
        '所提供文本中未识别到押金扣款条件约定。',
        ['合同是否约定了可以从押金中扣除的情形？'],
        null,
        [],
      ),
      items: [],
    };
  }

  // 保护性表述（如「不得无故扣除」）不应标红（doc 02 §1.8）。
  const protective = relevant.filter((s) => isNegated(s.text));
  const unfavorable = relevant.filter((s) => !isNegated(s.text));

  if (unfavorable.length === 0 && protective.length > 0) {
    return {
      finding: baseFinding(
        'deposit_deduction',
        'clear',
        'notice',
        'not_assessed',
        protective.slice(0, 2).map(toExcerpt),
        '识别到对承租人有保护作用的扣款限制表述（如不得无故扣除），未见明显不利扣款条件。',
        [],
        null,
        [],
      ),
      items: [],
    };
  }

  const vague = unfavorable.filter((s) => VAGUE_DEDUCTION.some((v) => s.text.includes(v)));
  if (vague.length > 0) {
    return {
      finding: baseFinding(
        'deposit_deduction',
        'ambiguous',
        'high',
        'unfavorable_term',
        vague.slice(0, 3).map(toExcerpt),
        '扣款条件表述宽泛（如「一切费用」「由出租人决定」），未列明具体项目、标准与凭证要求，对承租人不利。此处不自动认定条款无效，建议协商明确。',
        ['能否列明可扣款的具体项目、计算标准和所需凭证？'],
        '建议明确扣款项目、计算标准、凭证要求与争议处理方式。',
        ['可扣款项目清单', '扣款计算标准'],
      ),
      items: [],
    };
  }

  return {
    finding: baseFinding(
      'deposit_deduction',
      'clear',
      'notice',
      'not_assessed',
      unfavorable.slice(0, 3).map(toExcerpt),
      '识别到扣款条件约定，表述相对具体。是否合理需结合实际情况判断。',
      [],
      null,
      [],
    ),
    items: unfavorable.map((s) => s.text),
  };
}

function buildForfeitFinding(segments: CandidateSegment[]): ContractFinding {
  const relevant = segmentsWith(segments, FORFEIT_WORDS);
  // 排除保护性否定表述（如「不得无故不退押金」）。
  const unfavorable = relevant.filter((s) => !isNegated(s.text));
  if (unfavorable.length === 0) {
    return baseFinding(
      'deposit_forfeit',
      'not_found',
      'notice',
      'not_assessed',
      [],
      '所提供文本中未识别到不退/没收押金的约定。',
      ['合同是否约定了某些情形下押金不予退还？'],
      null,
      [],
    );
  }

  const trigger = unfavorable.find((s) =>
    ['提前', '违约', '损坏', '逾期', '擅自', '未经'].some((w) => s.text.includes(w)),
  );
  return baseFinding(
    'deposit_forfeit',
    'needs_verification',
    'high',
    'unfavorable_term',
    unfavorable.slice(0, 2).map(toExcerpt),
    trigger
      ? '识别到可能不退/全额扣除押金的约定，并与特定触发条件相关。是否构成不公平或违法需结合事实、违约责任与相关依据判断，此处不作结论。'
      : '识别到可能不退/全额扣除押金的约定，但未写明触发条件，需核实其适用情形。',
    trigger
      ? ['触发不退押金的具体条件是什么？是否与违约责任挂钩、是否合理？']
      : ['在什么情形下会不退押金？该约定是否有明确触发条件？'],
    '建议要求明确不退押金的触发条件、对应责任及争议处理方式。',
    trigger ? [] : ['不退押金的触发条件'],
  );
}

export function buildRuleFindings(segments: CandidateSegment[]): RuleFindings {
  const amount = buildAmountFinding(segments);
  const ret = buildReturnFinding(segments);
  const deduction = buildDeductionFinding(segments);
  const forfeit = buildForfeitFinding(segments);

  return {
    findings: [amount.finding, ret.finding, deduction.finding, forfeit],
    depositAmountCents: amount.cents,
    returnTimingText: ret.timing,
    deductionItems: deduction.items,
  };
}
