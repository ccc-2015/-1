import type { FindingCategory, CheckStatus } from '../shared/contract.ts';

export type ModelFindingDraft = {
  category: FindingCategory;
  checkStatus: CheckStatus;
  excerptTexts: string[];
  explanation: string;
  suggestedQuestions: string[];
  negotiationSuggestion: string | null;
  depositAmountCents: number | null;
  returnTimingText: string | null;
  deductionItems: string[];
};

export type ModelExtraction = {
  findings: ModelFindingDraft[];
};

export type ExtractRequest = {
  cityCode: string;
  eventDate: string | null;
  text: string;
  textScope: 'full_contract' | 'excerpt';
  candidateParagraphs: string[];
};

export type ExtractSuccess = {
  ok: true;
  extraction: ModelExtraction;
  provider: string;
  model: string;
};

export type ExtractFailure = {
  ok: false;
  code: 'service_not_configured' | 'upstream_timeout' | 'upstream_invalid_response' | 'service_unavailable';
  message: string;
  provider: string;
};

export type ExtractResult = ExtractSuccess | ExtractFailure;

export interface LLMProvider {
  readonly name: string;
  readonly available: boolean;
  extractContract(req: ExtractRequest): Promise<ExtractResult>;
}

export const DEPOSIT_KEYWORDS = [
  '押金',
  '保证金',
  '订金',
  '定金',
  '退还',
  '退回',
  '扣除',
  '扣款',
  '不退',
  '没收',
  '违约',
] as const;

export const NEGATION_MARKERS = ['不得', '无故', '禁止', '不准', '不应', '无需'] as const;
