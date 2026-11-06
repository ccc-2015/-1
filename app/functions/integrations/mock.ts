import type {
  LLMProvider,
  ExtractRequest,
  ExtractResult,
  ModelFindingDraft,
} from './llm.ts';
import { DEPOSIT_KEYWORDS } from './llm.ts';

function findSentencesContaining(text: string, keywords: readonly string[]): string[] {
  const sentences = text
    .split(/(?<=[。；\n])/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const hits: string[] = [];
  for (const s of sentences) {
    if (keywords.some((k) => s.includes(k))) {
      hits.push(s);
    }
  }
  return hits;
}

function extractAmountCents(text: string): number | null {
  const numMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*元/);
  if (numMatch) {
    const yuan = Number.parseFloat(numMatch[1]);
    if (Number.isFinite(yuan)) return Math.round(yuan * 100);
  }
  return null;
}

export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly available = true;

  async extractContract(req: ExtractRequest): Promise<ExtractResult> {
    const findings: ModelFindingDraft[] = [];
    const text = req.text;

    const amountSentences = findSentencesContaining(text, ['押金', '保证金']);
    const amountExcerpt = amountSentences.find((s) => /\d/.test(s)) ?? amountSentences[0];
    if (amountExcerpt) {
      findings.push({
        category: 'deposit_amount',
        checkStatus: /\d+\s*元/.test(amountExcerpt) ? 'clear' : 'ambiguous',
        excerptTexts: [amountExcerpt],
        explanation: '【示例分析】识别到押金金额相关约定。',
        suggestedQuestions:
          /\d+\s*元/.test(amountExcerpt)
            ? []
            : ['押金具体金额是多少？是否对应「押一付三」中的月租倍数？'],
        negotiationSuggestion: null,
        depositAmountCents: extractAmountCents(amountExcerpt),
        returnTimingText: null,
        deductionItems: [],
      });
    }

    const returnSentences = findSentencesContaining(text, ['退还', '退回']);
    if (returnSentences.length > 0) {
      findings.push({
        category: 'deposit_return',
        checkStatus: /\d+\s*(日|天|个工作日)/.test(returnSentences[0]) ? 'clear' : 'ambiguous',
        excerptTexts: returnSentences.slice(0, 2),
        explanation: '【示例分析】识别到押金退还安排。',
        suggestedQuestions: ['退还的具体时间和条件是什么？是否存在多个冲突期限？'],
        negotiationSuggestion: null,
        depositAmountCents: null,
        returnTimingText: returnSentences[0],
        deductionItems: [],
      });
    }

    const deductionSentences = findSentencesContaining(text, ['扣除', '扣款']);
    if (deductionSentences.length > 0) {
      const vague = deductionSentences.some((s) => s.includes('一切费用') || s.includes('由出租人决定') || s.includes('甲方决定'));
      findings.push({
        category: 'deposit_deduction',
        checkStatus: vague ? 'ambiguous' : 'clear',
        excerptTexts: deductionSentences.slice(0, 2),
        explanation: vague
          ? '【示例分析】扣款条件表述宽泛，未列明具体项目与标准。'
          : '【示例分析】识别到扣款条件约定。',
        suggestedQuestions: vague
          ? ['能否列明可扣款的具体项目、计算标准和凭证要求？']
          : [],
        negotiationSuggestion: vague ? '建议明确扣款项目、凭证与争议处理方式。' : null,
        depositAmountCents: null,
        returnTimingText: null,
        deductionItems: [],
      });
    }

    const forfeitSentences = findSentencesContaining(text, ['不退', '没收']);
    const negated = forfeitSentences.some((s) => s.includes('不得') || s.includes('无故'));
    if (forfeitSentences.length > 0 && !negated) {
      findings.push({
        category: 'deposit_forfeit',
        checkStatus: 'needs_verification',
        excerptTexts: forfeitSentences.slice(0, 1),
        explanation: '【示例分析】识别到可能不退押金的约定，需结合触发条件与违约责任判断。',
        suggestedQuestions: ['触发不退押金的具体条件是什么？是否与违约责任挂钩？'],
        negotiationSuggestion: null,
        depositAmountCents: null,
        returnTimingText: null,
        deductionItems: [],
      });
    }

    if (findings.length === 0) {
      const anyKeyword = DEPOSIT_KEYWORDS.some((k) => text.includes(k));
      findings.push({
        category: 'deposit_amount',
        checkStatus: 'not_found',
        excerptTexts: [],
        explanation: anyKeyword
          ? '【示例分析】文本含押金相关词但未形成明确约定。'
          : '【示例分析】所提供文本中未识别到明确押金约定。',
        suggestedQuestions: ['请确认合同是否包含押金条款，或补充相关页/片段。'],
        negotiationSuggestion: null,
        depositAmountCents: null,
        returnTimingText: null,
        deductionItems: [],
      });
    }

    return { ok: true, extraction: { findings }, provider: this.name, model: 'mock-qwen-plus' };
  }
}
