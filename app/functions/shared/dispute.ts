import type { SourceRecordPublic, SourceRef } from './sources.ts';

export type EvidenceStatus = 'available' | 'missing' | 'unknown' | 'not_applicable';

export type DisputeScenario = 'deposit_not_returned' | 'deposit_deducted';

export type CounterpartyType = 'individual_landlord' | 'agency' | 'operator' | 'unknown';

export type TenancyEnded = 'yes' | 'no' | 'unknown';

export type HandoverStatus = 'completed' | 'not_completed' | 'disputed' | 'unknown';

export type ReturnDueStatus = 'due' | 'not_due' | 'unclear';

export type PriorActionType =
  | 'negotiation'
  | 'written_notice'
  | 'enterprise_complaint'
  | 'mediation'
  | 'administrative_contact'
  | 'consumer_contact'
  | 'legal_consultation';

export type PriorActionOutcome =
  | 'not_started'
  | 'pending'
  | 'resolved'
  | 'unresolved'
  | 'unknown';

export type DisputeGoal =
  | 'return_deposit'
  | 'explain_deduction'
  | 'prepare_evidence'
  | 'understand_options';

export type EvidenceEntry = {
  evidenceId: string;
  status: EvidenceStatus;
};

export type PriorAction = {
  type: PriorActionType;
  outcome: PriorActionOutcome;
};

export type DisputeInput = {
  cityCode: string;
  eventDate: string | null;
  scenario: DisputeScenario;
  counterpartyType: CounterpartyType;
  depositAmountCents: number | null;
  disputedAmountCents: number | null;
  tenancyEnded: TenancyEnded;
  handoverStatus: HandoverStatus;
  returnDueStatus: ReturnDueStatus;
  deductionReason: string;
  evidence: EvidenceEntry[];
  priorActions: PriorAction[];
  goal: DisputeGoal;
  narrative: string;
};

export type FactSummaryItem = {
  label: string;
  value: string;
  origin: 'user_statement';
};

export type MissingFact = {
  field: string;
  question: string;
  reason: string;
};

export type EvidencePriority = 'essential' | 'helpful';

export type EvidenceChecklistItem = {
  evidenceId: string;
  title: string;
  status: EvidenceStatus;
  priority: EvidencePriority;
  reason: string;
  preparationTip: string;
};

export type CommunicationDraft = {
  text: string;
  placeholders: string[];
  warnings: string[];
};

export type ChannelEligibility = 'eligible' | 'needs_check';

export type PathStepContact = {
  officialUrl: string | null;
  phone: string | null;
};

export type PathStepAfter = {
  resolved: string;
  unresolvedStepIds: string[];
  pending: string;
};

export type PathStep = {
  stepId: string;
  channelId: string;
  eligibility: ChannelEligibility;
  title: string;
  why: string;
  preparations: string[];
  contact: PathStepContact;
  sourceRefs: SourceRef[];
  after: PathStepAfter;
};

export type ExcludedOption = {
  channelId: string;
  reason: string;
};

export type DisputePlan = {
  factsSummary: FactSummaryItem[];
  missingFacts: MissingFact[];
  evidenceChecklist: EvidenceChecklistItem[];
  communication: CommunicationDraft;
  nextSteps: PathStep[];
  conditionalOptions: PathStep[];
  excludedOptions: ExcludedOption[];
  references: SourceRecordPublic[];
};

const EVIDENCE_STATUSES: readonly string[] = [
  'available',
  'missing',
  'unknown',
  'not_applicable',
];

const PRIOR_ACTION_TYPES: readonly string[] = [
  'negotiation',
  'written_notice',
  'enterprise_complaint',
  'mediation',
  'administrative_contact',
  'consumer_contact',
  'legal_consultation',
];

const PRIOR_ACTION_OUTCOMES: readonly string[] = [
  'not_started',
  'pending',
  'resolved',
  'unresolved',
  'unknown',
];

const DISPUTE_GOALS: readonly string[] = [
  'return_deposit',
  'explain_deduction',
  'prepare_evidence',
  'understand_options',
];

export const DEDUCTION_REASON_MAX = 1000;
export const NARRATIVE_MAX = 3000;

export function isDisputeInput(value: unknown): value is DisputeInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.cityCode !== 'string' || v.cityCode.length === 0) return false;
  if (!(v.eventDate === null || typeof v.eventDate === 'string')) return false;
  if (typeof v.eventDate === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(v.eventDate)) return false;
  if (v.scenario !== 'deposit_not_returned' && v.scenario !== 'deposit_deducted') return false;
  const cp: readonly string[] = ['individual_landlord', 'agency', 'operator', 'unknown'];
  if (!cp.includes(v.counterpartyType as string)) return false;
  if (!(v.depositAmountCents === null || Number.isSafeInteger(v.depositAmountCents))) return false;
  if (v.depositAmountCents !== null && (v.depositAmountCents as number) < 0) return false;
  if (!(v.disputedAmountCents === null || Number.isSafeInteger(v.disputedAmountCents))) return false;
  if (v.disputedAmountCents !== null && (v.disputedAmountCents as number) < 0) return false;
  const te: readonly string[] = ['yes', 'no', 'unknown'];
  if (!te.includes(v.tenancyEnded as string)) return false;
  const hs: readonly string[] = ['completed', 'not_completed', 'disputed', 'unknown'];
  if (!hs.includes(v.handoverStatus as string)) return false;
  const rd: readonly string[] = ['due', 'not_due', 'unclear'];
  if (!rd.includes(v.returnDueStatus as string)) return false;
  if (typeof v.deductionReason !== 'string') return false;
  if (v.deductionReason.length > DEDUCTION_REASON_MAX) return false;
  if (!Array.isArray(v.evidence)) return false;
  if (!v.evidence.every((e) => {
    if (!e || typeof e !== 'object') return false;
    const ev = e as Record<string, unknown>;
    return typeof ev.evidenceId === 'string' &&
      EVIDENCE_STATUSES.includes(ev.status as string);
  })) return false;
  if (!Array.isArray(v.priorActions)) return false;
  if (!v.priorActions.every((p) => {
    if (!p || typeof p !== 'object') return false;
    const pa = p as Record<string, unknown>;
    return PRIOR_ACTION_TYPES.includes(pa.type as string) &&
      PRIOR_ACTION_OUTCOMES.includes(pa.outcome as string);
  })) return false;
  if (!DISPUTE_GOALS.includes(v.goal as string)) return false;
  if (typeof v.narrative !== 'string') return false;
  if (v.narrative.length > NARRATIVE_MAX) return false;
  return true;
}

export function isPathStep(value: unknown): value is PathStep {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.stepId !== 'string' || typeof v.channelId !== 'string') return false;
  if (v.eligibility !== 'eligible' && v.eligibility !== 'needs_check') return false;
  if (typeof v.title !== 'string' || typeof v.why !== 'string') return false;
  if (!Array.isArray(v.preparations)) return false;
  if (!v.preparations.every((p) => typeof p === 'string')) return false;
  const c = v.contact as Record<string, unknown> | undefined;
  if (!c) return false;
  if (!(c.officialUrl === null || typeof c.officialUrl === 'string')) return false;
  if (!(c.phone === null || typeof c.phone === 'string')) return false;
  if (!Array.isArray(v.sourceRefs)) return false;
  if (!v.sourceRefs.every((r) => {
    if (!r || typeof r !== 'object') return false;
    const sr = r as Record<string, unknown>;
    return typeof sr.sourceId === 'string' &&
      Array.isArray(sr.articleIds) &&
      sr.articleIds.every((a) => typeof a === 'string');
  })) return false;
  const after = v.after as Record<string, unknown> | undefined;
  if (!after) return false;
  if (typeof after.resolved !== 'string' || typeof after.pending !== 'string') return false;
  if (!Array.isArray(after.unresolvedStepIds)) return false;
  return after.unresolvedStepIds.every((id) => typeof id === 'string');
}

export function isDisputePlan(value: unknown): value is DisputePlan {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.factsSummary)) return false;
  if (!v.factsSummary.every((f) => {
    if (!f || typeof f !== 'object') return false;
    const fs = f as Record<string, unknown>;
    return typeof fs.label === 'string' &&
      typeof fs.value === 'string' &&
      fs.origin === 'user_statement';
  })) return false;
  if (!Array.isArray(v.missingFacts)) return false;
  if (!v.missingFacts.every((m) => {
    if (!m || typeof m !== 'object') return false;
    const mf = m as Record<string, unknown>;
    return typeof mf.field === 'string' &&
      typeof mf.question === 'string' &&
      typeof mf.reason === 'string';
  })) return false;
  if (!Array.isArray(v.evidenceChecklist)) return false;
  if (!v.evidenceChecklist.every((e) => {
    if (!e || typeof e !== 'object') return false;
    const ec = e as Record<string, unknown>;
    return typeof ec.evidenceId === 'string' &&
      typeof ec.title === 'string' &&
      EVIDENCE_STATUSES.includes(ec.status as string) &&
      (ec.priority === 'essential' || ec.priority === 'helpful') &&
      typeof ec.reason === 'string' &&
      typeof ec.preparationTip === 'string';
  })) return false;
  const comm = v.communication as Record<string, unknown> | undefined;
  if (!comm) return false;
  if (typeof comm.text !== 'string') return false;
  if (!Array.isArray(comm.placeholders)) return false;
  if (!comm.placeholders.every((p) => typeof p === 'string')) return false;
  if (!Array.isArray(comm.warnings)) return false;
  if (!comm.warnings.every((w) => typeof w === 'string')) return false;
  if (!Array.isArray(v.nextSteps) || !v.nextSteps.every(isPathStep)) return false;
  if (!Array.isArray(v.conditionalOptions) || !v.conditionalOptions.every(isPathStep)) return false;
  if (!Array.isArray(v.excludedOptions)) return false;
  if (!v.excludedOptions.every((x) => {
    if (!x || typeof x !== 'object') return false;
    const xo = x as Record<string, unknown>;
    return typeof xo.channelId === 'string' && typeof xo.reason === 'string';
  })) return false;
  if (!Array.isArray(v.references)) return false;
  return true;
}
