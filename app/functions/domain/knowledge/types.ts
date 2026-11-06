import type { SourceRecordPublic, ValidityStatus, JurisdictionLevel } from '../../shared/sources.ts';

export type SourceKind =
  | 'law'
  | 'regulation'
  | 'judicial_interpretation'
  | 'local_rule'
  | 'official_guidance'
  | 'official_service';

export type ReviewStatus = 'draft' | 'verified' | 'needs_review';

export type SourceArticle = {
  id: string;
  label: string;
  text: string;
  interpretation: string;
  applicabilityNotes: string[];
};

export type SourceRecord = {
  id: string;
  title: string;
  kind: SourceKind;
  issuer: string;
  officialUrl: string;
  jurisdiction: {
    level: JurisdictionLevel;
    cityCodes: string[];
  };
  validFrom: string | null;
  validUntil: string | null;
  validityStatus: ValidityStatus;
  reviewedAt: string;
  reviewDueAt: string;
  reviewStatus: ReviewStatus;
  reviewer: string;
  scenarios: string[];
  articles: SourceArticle[];
};

export type ChannelKind =
  | 'negotiation'
  | 'enterprise'
  | 'consumer'
  | 'administrative'
  | 'mediation'
  | 'legal_consultation'
  | 'legal_aid'
  | 'litigation';

export type ChannelRecord = {
  id: string;
  name: string;
  cityCode: string;
  kind: ChannelKind;
  receiver: string;
  officialUrl: string | null;
  phone: string | null;
  acceptedScenarios: string[];
  counterpartyTypes: Array<'individual_landlord' | 'agency' | 'operator' | 'unknown'>;
  eligibilityConditions: string[];
  exclusions: string[];
  requiredEvidenceIds: string[];
  sourceRefs: Array<{ sourceId: string; articleIds: string[] }>;
  reviewedAt: string;
  reviewDueAt: string;
  reviewStatus: ReviewStatus;
};

export type DisputeRuleRecord = {
  ruleId: string;
  scenario: string;
  description: string;
  orderGroup: number;
  sourceRefs: Array<{ sourceId: string; articleIds: string[] }>;
};

export type KnowledgeBundle = {
  version: string;
  builtAt: string;
  synthetic: boolean;
  supportedCities: Array<{ cityCode: string; name: string }>;
  sources: SourceRecord[];
  channels: ChannelRecord[];
  rules: DisputeRuleRecord[];
};

export function toPublicSource(record: SourceRecord): SourceRecordPublic {
  return {
    id: record.id,
    title: record.title,
    kind: record.kind,
    issuer: record.issuer,
    officialUrl: record.officialUrl,
    jurisdiction: {
      level: record.jurisdiction.level,
      cityCodes: [...record.jurisdiction.cityCodes],
    },
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    validityStatus: record.validityStatus,
    reviewedAt: record.reviewedAt,
    articles: record.articles.map((a) => ({
      id: a.id,
      label: a.label,
      text: a.text,
      interpretation: a.interpretation,
      applicabilityNotes: [...a.applicabilityNotes],
    })),
  };
}
