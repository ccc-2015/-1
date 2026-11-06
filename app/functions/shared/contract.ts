import type { SourceRecordPublic, SourceRef } from './sources.ts';

export type TextScope = 'full_contract' | 'excerpt';

export type AnalysisScope =
  | 'deposit'
  | 'early_termination'
  | 'repair'
  | 'extra_fee'
  | 'agency_service';

export const PHASE1_ANALYSIS_SCOPES: readonly AnalysisScope[] = ['deposit'] as const;

export type AnalyzeContractInput = {
  cityCode: string;
  eventDate: string | null;
  text: string;
  textScope: TextScope;
  analysisScopes?: AnalysisScope[];
};

export type FindingCategory =
  | 'deposit_amount'
  | 'deposit_return'
  | 'deposit_deduction'
  | 'deposit_forfeit';

export type CheckStatus = 'clear' | 'ambiguous' | 'not_found' | 'needs_verification';

export type FindingPriority = 'high' | 'medium' | 'notice' | 'unrated';

export type LegalAssessment =
  | 'potential_legal_issue'
  | 'unfavorable_term'
  | 'unclear_or_missing'
  | 'not_assessed';

export type ContractExcerpt = {
  text: string;
  start: number;
  end: number;
};

export type ContractFinding = {
  id: string;
  category: FindingCategory;
  checkStatus: CheckStatus;
  priority: FindingPriority;
  legalAssessment: LegalAssessment;
  excerpts: ContractExcerpt[];
  explanation: string;
  suggestedQuestions: string[];
  negotiationSuggestion: string | null;
  sourceRefs: SourceRef[];
  missingFacts: string[];
};

export type ContractExtractedFacts = {
  depositAmountCents: number | null;
  returnTimingText: string | null;
  deductionItems: string[];
};

export type ContractEvidenceChecklistItem = {
  evidenceId: string;
  title: string;
  reason: string;
};

export type ContractAnalysis = {
  findings: ContractFinding[];
  summary: {
    needsAttention: number;
    needsConfirmation: number;
  };
  extractedFacts: ContractExtractedFacts;
  evidenceChecklist: ContractEvidenceChecklistItem[];
  references: SourceRecordPublic[];
};

export function isAnalyzeContractInput(value: unknown): value is AnalyzeContractInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.cityCode !== 'string' || v.cityCode.length === 0) return false;
  if (!(v.eventDate === null || typeof v.eventDate === 'string')) return false;
  if (typeof v.eventDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate)) return false;
  if (typeof v.text !== 'string') return false;
  if (v.textScope !== 'full_contract' && v.textScope !== 'excerpt') return false;
  if (v.analysisScopes !== undefined) {
    if (!Array.isArray(v.analysisScopes)) return false;
    const allowed: readonly string[] = [
      'deposit',
      'early_termination',
      'repair',
      'extra_fee',
      'agency_service',
    ];
    if (!v.analysisScopes.every((s) => typeof s === 'string' && allowed.includes(s))) return false;
  }
  return true;
}

export function isContractExcerpt(value: unknown): value is ContractExcerpt {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.text === 'string' &&
    Number.isInteger(v.start) &&
    Number.isInteger(v.end) &&
    (v.start as number) >= 0 &&
    (v.end as number) >= (v.start as number)
  );
}

export function isContractFinding(value: unknown): value is ContractFinding {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string') return false;
  const cats: readonly string[] = [
    'deposit_amount',
    'deposit_return',
    'deposit_deduction',
    'deposit_forfeit',
  ];
  if (!cats.includes(v.category as string)) return false;
  const statuses: readonly string[] = ['clear', 'ambiguous', 'not_found', 'needs_verification'];
  if (!statuses.includes(v.checkStatus as string)) return false;
  const priorities: readonly string[] = ['high', 'medium', 'notice', 'unrated'];
  if (!priorities.includes(v.priority as string)) return false;
  const assessments: readonly string[] = [
    'potential_legal_issue',
    'unfavorable_term',
    'unclear_or_missing',
    'not_assessed',
  ];
  if (!assessments.includes(v.legalAssessment as string)) return false;
  if (!Array.isArray(v.excerpts) || !v.excerpts.every(isContractExcerpt)) return false;
  if (typeof v.explanation !== 'string') return false;
  if (!Array.isArray(v.suggestedQuestions)) return false;
  if (!v.suggestedQuestions.every((q) => typeof q === 'string')) return false;
  if (!(v.negotiationSuggestion === null || typeof v.negotiationSuggestion === 'string')) return false;
  if (!Array.isArray(v.sourceRefs)) return false;
  if (!v.sourceRefs.every((r) => {
    if (!r || typeof r !== 'object') return false;
    const sr = r as Record<string, unknown>;
    return typeof sr.sourceId === 'string' &&
      Array.isArray(sr.articleIds) &&
      sr.articleIds.every((a) => typeof a === 'string');
  })) return false;
  if (!Array.isArray(v.missingFacts)) return false;
  return v.missingFacts.every((m) => typeof m === 'string');
}

export function isContractAnalysis(value: unknown): value is ContractAnalysis {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.findings) || !v.findings.every(isContractFinding)) return false;
  const s = v.summary as Record<string, unknown> | undefined;
  if (!s || !Number.isInteger(s.needsAttention) || !Number.isInteger(s.needsConfirmation)) return false;
  const ef = v.extractedFacts as Record<string, unknown> | undefined;
  if (!ef) return false;
  if (!(ef.depositAmountCents === null || Number.isSafeInteger(ef.depositAmountCents))) return false;
  if (!(ef.returnTimingText === null || typeof ef.returnTimingText === 'string')) return false;
  if (!Array.isArray(ef.deductionItems)) return false;
  if (!ef.deductionItems.every((d) => typeof d === 'string')) return false;
  if (!Array.isArray(v.evidenceChecklist)) return false;
  if (!v.evidenceChecklist.every((e) => {
    if (!e || typeof e !== 'object') return false;
    const ec = e as Record<string, unknown>;
    return typeof ec.evidenceId === 'string' &&
      typeof ec.title === 'string' &&
      typeof ec.reason === 'string';
  })) return false;
  if (!Array.isArray(v.references)) return false;
  return true;
}
