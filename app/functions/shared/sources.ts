export type SourceRef = {
  sourceId: string;
  articleIds: string[];
};

export type SourceKindPublic = string;

export type ValidityStatus = 'effective' | 'repealed' | 'not_yet_effective' | 'unknown';

export type JurisdictionLevel = 'national' | 'local';

export type SourceArticlePublic = {
  id: string;
  label: string;
  text: string;
  interpretation: string;
  applicabilityNotes: string[];
};

export type SourceRecordPublic = {
  id: string;
  title: string;
  kind: SourceKindPublic;
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
  articles: SourceArticlePublic[];
};

export function isSourceRef(value: unknown): value is SourceRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sourceId === 'string' &&
    Array.isArray(v.articleIds) &&
    v.articleIds.every((id) => typeof id === 'string')
  );
}

export function isSourceRecordPublic(value: unknown): value is SourceRecordPublic {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' ||
    typeof v.title !== 'string' ||
    typeof v.kind !== 'string' ||
    typeof v.issuer !== 'string' ||
    typeof v.officialUrl !== 'string' ||
    typeof v.reviewedAt !== 'string'
  ) {
    return false;
  }
  const j = v.jurisdiction as Record<string, unknown> | undefined;
  if (
    !j ||
    (j.level !== 'national' && j.level !== 'local') ||
    !Array.isArray(j.cityCodes) ||
    !j.cityCodes.every((c) => typeof c === 'string')
  ) {
    return false;
  }
  if (
    !(v.validFrom === null || typeof v.validFrom === 'string') ||
    !(v.validUntil === null || typeof v.validUntil === 'string')
  ) {
    return false;
  }
  const vs = v.validityStatus;
  if (vs !== 'effective' && vs !== 'repealed' && vs !== 'not_yet_effective' && vs !== 'unknown') {
    return false;
  }
  if (!Array.isArray(v.articles)) return false;
  return v.articles.every((a) => {
    if (!a || typeof a !== 'object') return false;
    const art = a as Record<string, unknown>;
    return (
      typeof art.id === 'string' &&
      typeof art.label === 'string' &&
      typeof art.text === 'string' &&
      typeof art.interpretation === 'string' &&
      Array.isArray(art.applicabilityNotes) &&
      art.applicabilityNotes.every((n) => typeof n === 'string')
    );
  });
}
