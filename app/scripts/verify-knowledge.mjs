// P1-02v: human-in-the-loop verification flip.
// Turns agent-retrieved, human-CONFIRMED knowledge records from needs_review -> verified.
//
// The agent must NOT run this to self-verify (doc 05 §7, doc 01 §2.3.5):
//  - requires a real --reviewer (rejects AI/draft identifiers)
//  - only flips records a human explicitly lists via --approve-src / --approve-ch
// After flipping it regenerates the snapshot so supportedCities is re-derived.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const knowledgeDir = join(here, '..', 'knowledge');
const buildScript = join(here, 'build-knowledge.mjs');

const FORBIDDEN_REVIEWERS = ['ai', 'agent', 'ai-collection-draft', 'qoder', 'gpt', 'llm', 'auto'];

function parseArgs(argv) {
  const args = { report: false, reviewer: null, due: null, approveSrc: [], approveCh: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--report') args.report = true;
    else if (a === '--reviewer') args.reviewer = next();
    else if (a === '--due') args.due = next();
    else if (a === '--approve-src') args.approveSrc = (next() ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--approve-ch') args.approveCh = (next() ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    else {
      console.error(`unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function readJson(name) {
  return JSON.parse(readFileSync(join(knowledgeDir, name), 'utf8'));
}
function writeJson(name, data) {
  writeFileSync(join(knowledgeDir, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function defaultDue() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 180);
  return d.toISOString().slice(0, 10);
}

const args = parseArgs(process.argv.slice(2));
const sources = readJson('sources.json');
const channels = readJson('channels.json');

if (args.report) {
  console.log('== sources ==');
  for (const s of sources) {
    console.log(`  [${s.reviewStatus}] ${s.id}  reviewer=${s.reviewer}  due=${s.reviewDueAt}  ${s.title}`);
  }
  console.log('== channels ==');
  for (const c of channels) {
    console.log(`  [${c.reviewStatus}] ${c.id}  due=${c.reviewDueAt}  ${c.name}`);
  }
  const vs = sources.filter((s) => s.reviewStatus === 'verified').length;
  const vc = channels.filter((c) => c.reviewStatus === 'verified').length;
  console.log(`== verified: sources ${vs}/${sources.length}, channels ${vc}/${channels.length} ==`);
  process.exit(0);
}

if (args.approveSrc.length === 0 && args.approveCh.length === 0) {
  console.error('Nothing to do. Use --report, or --approve-src/--approve-ch with --reviewer.');
  process.exit(2);
}

const reviewer = (args.reviewer ?? '').trim();
if (!reviewer) {
  console.error('--reviewer is required and must be a real human reviewer (records who verified).');
  process.exit(2);
}
if (FORBIDDEN_REVIEWERS.some((f) => reviewer.toLowerCase() === f || reviewer.toLowerCase().includes('ai-collection'))) {
  console.error(`--reviewer "${reviewer}" looks like an AI/draft identifier. A human must be recorded (doc 01 §2.3.5).`);
  process.exit(2);
}

const reviewedAt = today();
const reviewDueAt = args.due ?? defaultDue();
if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDueAt)) {
  console.error('--due must be YYYY-MM-DD.');
  process.exit(2);
}

const flipped = [];
const missing = [];

function approve(list, records, kind, idField, labelField) {
  for (const id of list) {
    const rec = records.find((r) => r[idField] === id);
    if (!rec) {
      missing.push(`${kind}:${id}`);
      continue;
    }
    rec.reviewStatus = 'verified';
    rec.reviewer = reviewer;
    rec.reviewedAt = reviewedAt;
    rec.reviewDueAt = reviewDueAt;
    flipped.push(`${kind}:${id} (${rec[labelField]})`);
  }
}

approve(args.approveSrc, sources, 'source', 'id', 'title');
approve(args.approveCh, channels, 'channel', 'id', 'name');

if (missing.length > 0) {
  console.error(`ERROR: unknown id(s): ${missing.join(', ')}. Nothing was written.`);
  process.exit(1);
}

writeJson('sources.json', sources);
writeJson('channels.json', channels);

console.log(`reviewer=${reviewer}  reviewedAt=${reviewedAt}  reviewDueAt=${reviewDueAt}`);
console.log(`flipped to verified (${flipped.length}):`);
for (const f of flipped) console.log(`  - ${f}`);
console.log('Reminder: single-person teams need an independent second review with records (doc 01 §2.3.5).');

console.log('\n== rebuilding snapshot ==');
const res = spawnSync(process.execPath, [buildScript], { stdio: 'inherit' });
process.exit(res.status ?? 0);
