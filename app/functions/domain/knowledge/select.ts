import type { ChannelRecord, KnowledgeBundle, SourceRecord } from './types.ts';

export type SelectionContext = {
  cityCode: string;
  scenario: string;
  eventDate: string | null;
  asOf?: string;
};

export type SourceSelection = {
  source: SourceRecord;
  allowedArticleIds: string[];
};

function isReviewCurrent(record: { reviewStatus: string; reviewDueAt: string }, asOf: Date): boolean {
  if (record.reviewStatus !== 'verified') return false;
  const due = Date.parse(record.reviewDueAt);
  if (Number.isNaN(due)) return false;
  return asOf.getTime() <= due;
}

function matchesJurisdiction(
  record: { jurisdiction: { level: string; cityCodes: string[] } },
  cityCode: string,
): boolean {
  if (record.jurisdiction.level === 'national') return true;
  return record.jurisdiction.cityCodes.includes(cityCode);
}

function matchesScenario(record: { scenarios?: string[]; acceptedScenarios?: string[] }, scenario: string): boolean {
  const list = record.scenarios ?? record.acceptedScenarios ?? [];
  return list.includes(scenario);
}

function isEffectiveOnDate(record: SourceRecord, eventDate: string | null): boolean {
  if (record.validityStatus === 'repealed') return false;
  if (record.validityStatus === 'not_yet_effective') return false;
  if (eventDate === null) {
    return record.validityStatus === 'effective' || record.validityStatus === 'unknown';
  }
  const event = Date.parse(eventDate);
  if (Number.isNaN(event)) return false;
  if (record.validFrom !== null) {
    const from = Date.parse(record.validFrom);
    if (!Number.isNaN(from) && event < from) return false;
  }
  if (record.validUntil !== null) {
    const until = Date.parse(record.validUntil);
    if (!Number.isNaN(until) && event > until) return false;
  }
  return true;
}

export function selectSources(bundle: KnowledgeBundle, ctx: SelectionContext): SourceSelection[] {
  const asOf = ctx.asOf ? new Date(ctx.asOf) : new Date();
  const out: SourceSelection[] = [];
  for (const source of bundle.sources) {
    if (!isReviewCurrent(source, asOf)) continue;
    if (!matchesJurisdiction(source, ctx.cityCode)) continue;
    if (!matchesScenario(source, ctx.scenario)) continue;
    if (!isEffectiveOnDate(source, ctx.eventDate)) continue;
    out.push({
      source,
      allowedArticleIds: source.articles.map((a) => a.id),
    });
  }
  return out;
}

export function selectChannels(bundle: KnowledgeBundle, ctx: SelectionContext): ChannelRecord[] {
  const asOf = ctx.asOf ? new Date(ctx.asOf) : new Date();
  const out: ChannelRecord[] = [];
  for (const channel of bundle.channels) {
    if (!isReviewCurrent(channel, asOf)) continue;
    if (channel.cityCode !== ctx.cityCode) continue;
    if (!matchesScenario(channel, ctx.scenario)) continue;
    out.push(channel);
  }
  return out;
}

export function isCitySupported(bundle: KnowledgeBundle, cityCode: string): boolean {
  return bundle.supportedCities.some((c) => c.cityCode === cityCode);
}

export function buildAllowedRefSet(selections: SourceSelection[]): Set<string> {
  const set = new Set<string>();
  for (const s of selections) {
    for (const articleId of s.allowedArticleIds) {
      set.add(`${s.source.id}::${articleId}`);
    }
  }
  return set;
}
