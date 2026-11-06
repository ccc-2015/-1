// Build + validate the human-maintained knowledge/*.json into a self-contained
// TS snapshot consumed by the Edge Function (app/functions/data/knowledge-snapshot.ts).
//
// Guarantees enforced here (doc 01 §2.5/§2.6):
//  - field presence/type checks
//  - referential closure: every sourceRef points to an existing source + article;
//    every requiredEvidenceId exists in the evidence catalog
//  - regional consistency: local sources declare cityCodes; channels declare a cityCode
//  - supportedCities is DERIVED from records whose reviewStatus === 'verified'
//    and whose reviewDueAt has not passed. Nothing verified => nothing supported.
//
// This script never marks a record verified. Verification is a human step
// recorded in knowledge/REVIEW_LOG.md (doc 01 §2.3.5, doc 05 §7).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const knowledgeDir = join(appRoot, 'knowledge');
const snapshotPath = join(appRoot, 'functions', 'data', 'knowledge-snapshot.ts');

// Must stay in sync with app/functions/domain/disputes/evidence.ts (EVIDENCE_CATALOG).
const EVIDENCE_IDS = new Set([
  'lease_contract',
  'deposit_payment',
  'return_agreement',
  'checkin_condition',
  'checkout_handover',
  'deduction_detail',
  'communications',
]);

const SCENARIO_IDS = new Set([
  'deposit_not_returned',
  'deposit_deducted',
  'early_termination',
  'repair_dispute',
  'extra_fee',
  'agency_service',
]);

const SOURCE_KINDS = new Set([
  'law',
  'regulation',
  'judicial_interpretation',
  'local_rule',
  'official_guidance',
  'official_service',
]);

const CHANNEL_KINDS = new Set([
  'negotiation',
  'enterprise',
  'consumer',
  'administrative',
  'mediation',
  'legal_consultation',
  'legal_aid',
  'litigation',
]);

const REVIEW_STATUSES = new Set(['draft', 'verified', 'needs_review']);
const VALIDITY_STATUSES = new Set(['effective', 'repealed', 'not_yet_effective', 'unknown']);
const COUNTERPARTY_TYPES = new Set(['individual_landlord', 'agency', 'operator', 'unknown']);

const CITY_NAMES = { 410100: '郑州市' };

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(name) {
  const raw = readFileSync(join(knowledgeDir, name), 'utf8');
  return JSON.parse(raw);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}
function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}
function isDateStr(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function isRefArray(v) {
  return (
    Array.isArray(v) &&
    v.every(
      (r) =>
        r &&
        isNonEmptyString(r.sourceId) &&
        Array.isArray(r.articleIds) &&
        r.articleIds.every((a) => typeof a === 'string'),
    )
  );
}

function reviewIsCurrent(record, asOf) {
  return (
    record.reviewStatus === 'verified' &&
    isDateStr(record.reviewDueAt) &&
    asOf <= record.reviewDueAt
  );
}

// ---- load ----
const sources = readJson('sources.json');
const channels = readJson('channels.json');
const rules = readJson('rules.json');

const asOf = new Date().toISOString().slice(0, 10);

// ---- index sources/articles ----
const sourceById = new Map();
for (const s of sources) {
  if (!isNonEmptyString(s.id)) fail('source missing id');
  if (sourceById.has(s.id)) fail(`duplicate source id: ${s.id}`);
  sourceById.set(s.id, s);

  if (!isNonEmptyString(s.title)) fail(`source ${s.id}: missing title`);
  if (!SOURCE_KINDS.has(s.kind)) fail(`source ${s.id}: invalid kind '${s.kind}'`);
  if (!isNonEmptyString(s.issuer)) fail(`source ${s.id}: missing issuer`);
  if (!isNonEmptyString(s.officialUrl)) fail(`source ${s.id}: missing officialUrl`);
  if (!/^https?:\/\//.test(s.officialUrl || '')) {
    fail(`source ${s.id}: officialUrl must be http(s), got '${s.officialUrl}'`);
  }
  const j = s.jurisdiction;
  if (!j || (j.level !== 'national' && j.level !== 'local')) {
    fail(`source ${s.id}: invalid jurisdiction.level`);
  }
  if (!isStringArray(j?.cityCodes ?? null)) fail(`source ${s.id}: cityCodes must be string[]`);
  if (j?.level === 'local' && (j.cityCodes?.length ?? 0) === 0) {
    fail(`source ${s.id}: local source must declare at least one cityCode`);
  }
  if (j?.level === 'national' && (j.cityCodes?.length ?? 0) !== 0) {
    warn(`source ${s.id}: national source usually has empty cityCodes`);
  }
  if (!(s.validFrom === null || isDateStr(s.validFrom))) {
    fail(`source ${s.id}: validFrom must be null or YYYY-MM-DD`);
  }
  if (!(s.validUntil === null || isDateStr(s.validUntil))) {
    fail(`source ${s.id}: validUntil must be null or YYYY-MM-DD`);
  }
  if (!VALIDITY_STATUSES.has(s.validityStatus)) {
    fail(`source ${s.id}: invalid validityStatus '${s.validityStatus}'`);
  }
  if (!isDateStr(s.reviewedAt)) fail(`source ${s.id}: reviewedAt must be YYYY-MM-DD`);
  if (!isDateStr(s.reviewDueAt)) fail(`source ${s.id}: reviewDueAt must be YYYY-MM-DD`);
  if (!REVIEW_STATUSES.has(s.reviewStatus)) {
    fail(`source ${s.id}: invalid reviewStatus '${s.reviewStatus}'`);
  }
  if (!isNonEmptyString(s.reviewer)) fail(`source ${s.id}: missing reviewer`);
  if (!isStringArray(s.scenarios) || !s.scenarios.every((x) => SCENARIO_IDS.has(x))) {
    fail(`source ${s.id}: scenarios must be valid ScenarioId[]`);
  }
  if (!Array.isArray(s.articles) || s.articles.length === 0) {
    fail(`source ${s.id}: must have at least one article`);
  }
  for (const a of s.articles ?? []) {
    if (!isNonEmptyString(a.id)) fail(`source ${s.id}: article missing id`);
    if (!isNonEmptyString(a.label)) fail(`source ${s.id}/${a.id}: article missing label`);
    if (!isNonEmptyString(a.text)) fail(`source ${s.id}/${a.id}: article missing text`);
    if (!isNonEmptyString(a.interpretation)) {
      fail(`source ${s.id}/${a.id}: article missing interpretation`);
    }
    if (!isStringArray(a.applicabilityNotes)) {
      fail(`source ${s.id}/${a.id}: applicabilityNotes must be string[]`);
    }
  }
}

// ---- validate channels ----
const channelById = new Map();
for (const c of channels) {
  if (!isNonEmptyString(c.id)) fail('channel missing id');
  if (channelById.has(c.id)) fail(`duplicate channel id: ${c.id}`);
  channelById.set(c.id, c);

  if (!isNonEmptyString(c.name)) fail(`channel ${c.id}: missing name`);
  if (!isNonEmptyString(c.cityCode)) fail(`channel ${c.id}: missing cityCode`);
  if (!CHANNEL_KINDS.has(c.kind)) fail(`channel ${c.id}: invalid kind '${c.kind}'`);
  if (!isNonEmptyString(c.receiver)) fail(`channel ${c.id}: missing receiver`);
  if (!(c.officialUrl === null || isNonEmptyString(c.officialUrl))) {
    fail(`channel ${c.id}: officialUrl must be null or non-empty string`);
  }
  if (!(c.phone === null || isNonEmptyString(c.phone))) {
    fail(`channel ${c.id}: phone must be null or non-empty string`);
  }
  if (!isStringArray(c.acceptedScenarios) || !c.acceptedScenarios.every((x) => SCENARIO_IDS.has(x))) {
    fail(`channel ${c.id}: acceptedScenarios must be valid ScenarioId[]`);
  }
  if (!Array.isArray(c.counterpartyTypes) || !c.counterpartyTypes.every((x) => COUNTERPARTY_TYPES.has(x))) {
    fail(`channel ${c.id}: counterpartyTypes invalid`);
  }
  if (!isStringArray(c.eligibilityConditions)) fail(`channel ${c.id}: eligibilityConditions must be string[]`);
  if (!isStringArray(c.exclusions)) fail(`channel ${c.id}: exclusions must be string[]`);
  if (!isStringArray(c.requiredEvidenceIds)) fail(`channel ${c.id}: requiredEvidenceIds must be string[]`);
  for (const e of c.requiredEvidenceIds ?? []) {
    if (!EVIDENCE_IDS.has(e)) fail(`channel ${c.id}: unknown requiredEvidenceId '${e}'`);
  }
  if (!isRefArray(c.sourceRefs)) fail(`channel ${c.id}: sourceRefs malformed`);
  if (!isDateStr(c.reviewedAt)) fail(`channel ${c.id}: reviewedAt must be YYYY-MM-DD`);
  if (!isDateStr(c.reviewDueAt)) fail(`channel ${c.id}: reviewDueAt must be YYYY-MM-DD`);
  if (!REVIEW_STATUSES.has(c.reviewStatus)) fail(`channel ${c.id}: invalid reviewStatus`);
}

// ---- validate rules ----
for (const r of rules) {
  if (!isNonEmptyString(r.ruleId)) fail('rule missing ruleId');
  if (!SCENARIO_IDS.has(r.scenario)) fail(`rule ${r.ruleId}: invalid scenario '${r.scenario}'`);
  if (!isNonEmptyString(r.description)) fail(`rule ${r.ruleId}: missing description`);
  if (typeof r.orderGroup !== 'number') fail(`rule ${r.ruleId}: orderGroup must be number`);
  if (!isRefArray(r.sourceRefs)) fail(`rule ${r.ruleId}: sourceRefs malformed`);
}

// ---- referential closure for all sourceRefs ----
function checkRefs(owner, refs) {
  for (const ref of refs ?? []) {
    const s = sourceById.get(ref.sourceId);
    if (!s) {
      fail(`${owner}: sourceRef points to unknown source '${ref.sourceId}'`);
      continue;
    }
    const artIds = new Set((s.articles ?? []).map((a) => a.id));
    for (const aid of ref.articleIds) {
      if (!artIds.has(aid)) fail(`${owner}: unknown articleId '${aid}' on source '${ref.sourceId}'`);
    }
  }
}
for (const c of channels) checkRefs(`channel ${c.id}`, c.sourceRefs);
for (const r of rules) checkRefs(`rule ${r.ruleId}`, r.sourceRefs);

// ---- derive supportedCities from VERIFIED + current records only ----
const verifiedSourceCityCodes = new Set();
let hasVerifiedNational = false;
for (const s of sources) {
  if (!reviewIsCurrent(s, asOf)) continue;
  if (s.jurisdiction.level === 'national') hasVerifiedNational = true;
  for (const code of s.jurisdiction.cityCodes) verifiedSourceCityCodes.add(code);
}
const verifiedChannelCityCodes = new Set();
for (const c of channels) {
  if (!reviewIsCurrent(c, asOf)) continue;
  verifiedChannelCityCodes.add(c.cityCode);
}

const supportedCityCodes = [...verifiedChannelCityCodes].filter(
  (code) => hasVerifiedNational || verifiedSourceCityCodes.has(code),
);
const supportedCities = supportedCityCodes
  .sort()
  .map((code) => ({ cityCode: code, name: CITY_NAMES[code] ?? code }));

// A cityCode may appear in channels only if some source (national or that city) covers it.
for (const code of verifiedChannelCityCodes) {
  if (!hasVerifiedNational && !verifiedSourceCityCodes.has(code)) {
    warn(`verified channels exist for ${code} but no verified source covers it; not marked supported`);
  }
}

// ---- assemble bundle ----
const version = `kb-zhengzhou-${asOf.replace(/-/g, '.')}${supportedCities.length === 0 ? '-draft' : ''}`;
const bundle = {
  version,
  builtAt: new Date().toISOString(),
  synthetic: false,
  supportedCities,
  sources,
  channels,
  rules,
};

// ---- report ----
const verifiedSources = sources.filter((s) => reviewIsCurrent(s, asOf)).length;
const verifiedChannels = channels.filter((c) => reviewIsCurrent(c, asOf)).length;
console.log(`[knowledge] sources=${sources.length} (verified ${verifiedSources})`);
console.log(`[knowledge] channels=${channels.length} (verified ${verifiedChannels})`);
console.log(`[knowledge] rules=${rules.length}`);
console.log(`[knowledge] supportedCities=${JSON.stringify(supportedCities)}`);
console.log(`[knowledge] version=${version}`);
for (const w of warnings) console.warn(`[knowledge][warn] ${w}`);

if (errors.length > 0) {
  console.error(`[knowledge] FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (supportedCities.length === 0) {
  console.warn(
    '[knowledge][warn] No city is supported yet: all records are needs_review. ' +
      'The app will honestly return coverage=unsupported until a human verifies records ' +
      'and sets reviewStatus="verified" in knowledge/*.json.',
  );
}

// ---- emit TS snapshot ----
const json = JSON.stringify(bundle, null, 2);
// Embed via JSON.parse of a template literal; escape backtick / backslash / ${.
const escaped = json.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const ts = `// GENERATED by scripts/build-knowledge.mjs — do not edit by hand.
// Source of truth: app/knowledge/*.json (human-maintained, see knowledge/REVIEW_LOG.md).
import type { KnowledgeBundle } from '../domain/knowledge/types.ts';

const SNAPSHOT_JSON = \`${escaped}\`;

export const KNOWLEDGE_VERSION = ${JSON.stringify(version)};

export function loadKnowledgeSnapshot(): KnowledgeBundle {
  return JSON.parse(SNAPSHOT_JSON) as KnowledgeBundle;
}
`;

writeFileSync(snapshotPath, ts, 'utf8');
console.log(`[knowledge] wrote ${snapshotPath}`);
