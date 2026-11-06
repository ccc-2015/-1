import type { ChannelRecord, KnowledgeBundle, SourceRecord } from './types.ts';
import { isScenarioId, type ScenarioId } from '../../shared/config.ts';

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

// Scenarios that are actually backed by verified+current data for a supported city:
// a verified channel accepting the scenario AND a verified source covering it.
// Nothing verified => empty, so the UI never claims a scenario it cannot substantiate.
export function deriveSupportedScenarios(bundle: KnowledgeBundle, asOf = new Date()): ScenarioId[] {
  const result = new Set<ScenarioId>();
  for (const { cityCode } of bundle.supportedCities) {
    const channelScenarios = new Set<string>();
    for (const ch of bundle.channels) {
      if (!isReviewCurrent(ch, asOf) || ch.cityCode !== cityCode) continue;
      for (const s of ch.acceptedScenarios) channelScenarios.add(s);
    }
    const sourceScenarios = new Set<string>();
    for (const src of bundle.sources) {
      if (!isReviewCurrent(src, asOf) || !matchesJurisdiction(src, cityCode)) continue;
      for (const s of src.scenarios) sourceScenarios.add(s);
    }
    for (const s of channelScenarios) {
      if (sourceScenarios.has(s) && isScenarioId(s)) result.add(s);
    }
  }
  return [...result];
}

// Verified+current sources only. Unverified (draft/needs_review) records are never
// exposed as authoritative citations (doc 01 §2.2).
export function listVerifiedSources(bundle: KnowledgeBundle, asOf = new Date()): SourceRecord[] {
  return bundle.sources.filter((s) => isReviewCurrent(s, asOf));
}
