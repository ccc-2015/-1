import { describe, it, expect } from 'vitest';
import {
  loadKnowledgeSnapshot,
  KNOWLEDGE_VERSION,
} from '../functions/data/knowledge-snapshot.ts';
import { buildPublicConfig } from '../functions/domain/config.ts';
import {
  deriveSupportedScenarios,
  listVerifiedSources,
  isCitySupported,
} from '../functions/domain/knowledge/select.ts';
import { EVIDENCE_CATALOG } from '../functions/domain/disputes/evidence.ts';
import { ALL_SCENARIOS } from '../functions/shared/config.ts';
import type {
  KnowledgeBundle,
  SourceRecord,
} from '../functions/domain/knowledge/types.ts';

const bundle = loadKnowledgeSnapshot();
const asOf = new Date();

function isVerifiedCurrent(
  r: { reviewStatus: string; reviewDueAt: string },
  now = asOf,
): boolean {
  if (r.reviewStatus !== 'verified') return false;
  const due = Date.parse(r.reviewDueAt);
  return !Number.isNaN(due) && now.getTime() <= due;
}

const evidenceIds = new Set(EVIDENCE_CATALOG.map((e) => e.evidenceId));
const scenarioIds = new Set<string>(ALL_SCENARIOS);

function sourceById(b: KnowledgeBundle): Map<string, SourceRecord> {
  return new Map(b.sources.map((s) => [s.id, s]));
}

describe('knowledge snapshot integrity (P1-05)', () => {
  it('parses with a non-empty version and is real (not synthetic) data', () => {
    expect(KNOWLEDGE_VERSION.length).toBeGreaterThan(0);
    expect(bundle.version).toBe(KNOWLEDGE_VERSION);
    expect(bundle.synthetic).toBe(false);
    expect(Number.isNaN(Date.parse(bundle.builtAt))).toBe(false);
  });

  it('every source has an http(s) officialUrl and at least one article', () => {
    for (const s of bundle.sources) {
      expect(s.officialUrl).toMatch(/^https?:\/\//);
      expect(s.articles.length).toBeGreaterThan(0);
      for (const a of s.articles) {
        expect(a.text.trim().length).toBeGreaterThan(0);
        expect(a.interpretation.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('channel/rule sourceRefs are referentially closed', () => {
    const idx = sourceById(bundle);
    const checkRefs = (owner: string, refs: { sourceId: string; articleIds: string[] }[]) => {
      for (const ref of refs) {
        const s = idx.get(ref.sourceId);
        expect(s, `${owner} -> unknown source ${ref.sourceId}`).toBeDefined();
        const artIds = new Set(s!.articles.map((a) => a.id));
        for (const aid of ref.articleIds) {
          expect(artIds.has(aid), `${owner} -> unknown article ${aid}`).toBe(true);
        }
      }
    };
    for (const c of bundle.channels) checkRefs(`channel ${c.id}`, c.sourceRefs);
    for (const r of bundle.rules) checkRefs(`rule ${r.ruleId}`, r.sourceRefs);
  });

  it('channel requiredEvidenceIds all exist in the evidence catalog', () => {
    for (const c of bundle.channels) {
      for (const e of c.requiredEvidenceIds) {
        expect(evidenceIds.has(e), `channel ${c.id} -> unknown evidence ${e}`).toBe(true);
      }
    }
  });

  it('channel scenarios are valid ScenarioIds', () => {
    for (const c of bundle.channels) {
      for (const s of c.acceptedScenarios) expect(scenarioIds.has(s)).toBe(true);
    }
  });

  it('supportedCities only contains cities backed by verified+current records', () => {
    for (const { cityCode } of bundle.supportedCities) {
      const hasVerifiedChannel = bundle.channels.some(
        (c) => c.cityCode === cityCode && isVerifiedCurrent(c),
      );
      const hasVerifiedSource = bundle.sources.some(
        (s) =>
          isVerifiedCurrent(s) &&
          (s.jurisdiction.level === 'national' || s.jurisdiction.cityCodes.includes(cityCode)),
      );
      expect(hasVerifiedChannel, `${cityCode} lacks verified channel`).toBe(true);
      expect(hasVerifiedSource, `${cityCode} lacks verified source`).toBe(true);
    }
  });

  it('listVerifiedSources never leaks draft/needs_review records', () => {
    for (const s of listVerifiedSources(bundle)) {
      expect(s.reviewStatus).toBe('verified');
      expect(isVerifiedCurrent(s)).toBe(true);
    }
  });

  it('deriveSupportedScenarios only yields scenarios with verified channel+source backing', () => {
    const derived = deriveSupportedScenarios(bundle);
    for (const s of derived) {
      expect(scenarioIds.has(s)).toBe(true);
      const backedByChannel = bundle.channels.some(
        (c) =>
          isVerifiedCurrent(c) &&
          bundle.supportedCities.some((city) => city.cityCode === c.cityCode) &&
          c.acceptedScenarios.includes(s),
      );
      expect(backedByChannel, `scenario ${s} lacks verified channel`).toBe(true);
    }
  });

  it('buildPublicConfig derives coverage from the bundle, not hardcoding', () => {
    const cfg = buildPublicConfig(bundle, false);
    expect(cfg.knowledgeVersion).toBe(bundle.version);
    expect(cfg.supportedCities).toEqual(
      bundle.supportedCities.map((c) => ({ cityCode: c.cityCode, name: c.name })),
    );
    expect(cfg.supportedScenarios).toEqual(deriveSupportedScenarios(bundle));
    expect(cfg.features.liveAi).toBe(false);
    expect(buildPublicConfig(bundle, true).features.liveAi).toBe(true);
    // Phase 1 does not ship these.
    expect(cfg.features.documentExtraction).toBe(false);
    expect(cfg.features.materialExport).toBe(false);
  });

  it('draft state is honest: nothing verified => no supported city, scenario or source', () => {
    const anyVerified =
      bundle.sources.some(isVerifiedCurrent) || bundle.channels.some(isVerifiedCurrent);
    if (!anyVerified) {
      expect(bundle.supportedCities).toEqual([]);
      expect(deriveSupportedScenarios(bundle)).toEqual([]);
      expect(listVerifiedSources(bundle)).toEqual([]);
      expect(isCitySupported(bundle, '410100')).toBe(false);
      expect(buildPublicConfig(bundle, false).supportedCities).toEqual([]);
    }
  });
});
