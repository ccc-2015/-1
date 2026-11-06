import { describe, it, expect, afterEach } from 'vitest';
import { handler } from '../functions/handler.ts';
import { loadKnowledgeSnapshot, KNOWLEDGE_VERSION } from '../functions/data/knowledge-snapshot.ts';
import type { Success, Failure } from '../functions/shared/envelope.ts';
import type { PublicConfig } from '../functions/shared/config.ts';
import type { DisputePlan } from '../functions/shared/dispute.ts';
import type { ContractAnalysis } from '../functions/shared/contract.ts';

const bundle = loadKnowledgeSnapshot();
const BASE = 'http://127.0.0.1/functions/v1/app';

type ReqInit = {
  method?: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
};

function makeRequest(action: string | null, init: ReqInit = {}): Request {
  const url = new URL(BASE);
  if (action !== null) url.searchParams.set('action', action);
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (init.rawBody !== undefined) {
    body = init.rawBody;
    if (init.contentType) headers['content-type'] = init.contentType;
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['content-type'] = init.contentType ?? 'application/json';
  }
  return new Request(url.toString(), { method, headers, body });
}

async function callJson<T>(r: Request): Promise<{ status: number; body: T; headers: Headers }> {
  const res = await handler(r);
  return { status: res.status, body: (await res.json()) as T, headers: res.headers };
}

function validDisputeInput(cityCode: string) {
  return {
    cityCode,
    eventDate: '2026-10-01',
    scenario: 'deposit_not_returned',
    counterpartyType: 'agency',
    depositAmountCents: 300000,
    disputedAmountCents: null,
    tenancyEnded: 'yes',
    handoverStatus: 'completed',
    returnDueStatus: 'due',
    deductionReason: '',
    goal: 'return_deposit',
    narrative: '',
    evidence: [
      { evidenceId: 'lease_contract', status: 'available' },
      { evidenceId: 'deposit_payment', status: 'available' },
      { evidenceId: 'checkout_handover', status: 'available' },
    ],
    priorActions: [],
  };
}

afterEach(() => {
  // Ensure a Deno stub never leaks between tests.
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe('handler routing & envelope (P1-09 edge checks)', () => {
  it('missing action -> unknown_action 404', async () => {
    const { status, body } = await callJson<Failure>(makeRequest(null));
    expect(status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('unknown_action');
    expect(typeof body.requestId).toBe('string');
  });

  it('unknown action value -> unknown_action 404', async () => {
    const { status, body } = await callJson<Failure>(makeRequest('not-a-real-action'));
    expect(status).toBe(404);
    expect(body.error.code).toBe('unknown_action');
  });

  it('config GET -> 200, coverage derived from bundle, no-store', async () => {
    const { status, body, headers } = await callJson<Success<PublicConfig>>(makeRequest('config'));
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.apiVersion).toBe('1');
    expect(body.meta.knowledgeVersion).toBe(KNOWLEDGE_VERSION);
    expect(headers.get('cache-control')).toBe('no-store');
    // Draft state: nothing verified => no supported city, AI not configured.
    expect(body.data.knowledgeVersion).toBe(bundle.version);
    expect(body.data.supportedCities).toEqual([]);
    expect(body.data.features.liveAi).toBe(false);
    expect(body.data.features.documentExtraction).toBe(false);
    expect(body.data.features.materialExport).toBe(false);
  });

  it('config POST -> 405 with Allow: GET', async () => {
    const res = await handler(makeRequest('config', { method: 'POST' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('sources GET -> 200, only verified sources (none yet)', async () => {
    const { status, body } = await callJson<Success<{ sources: unknown[] }>>(
      makeRequest('sources'),
    );
    expect(status).toBe(200);
    expect(body.data.sources).toEqual([]);
    expect(body.meta.knowledgeVersion).toBe(bundle.version);
  });

  it('extract-document POST -> service_unavailable 503 (Phase 1)', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('extract-document', { method: 'POST', body: {} }),
    );
    expect(status).toBe(503);
    expect(body.error.code).toBe('service_unavailable');
    expect(body.error.retryable).toBe(true);
  });

  it('analyze-contract GET -> 405 with Allow: POST', async () => {
    const res = await handler(makeRequest('analyze-contract', { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it('analyze-contract non-JSON content-type -> unsupported_media_type 415', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('analyze-contract', {
        method: 'POST',
        rawBody: '{}',
        contentType: 'text/plain',
      }),
    );
    expect(status).toBe(415);
    expect(body.error.code).toBe('unsupported_media_type');
  });

  it('analyze-contract empty text -> invalid_input 400', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('analyze-contract', {
        method: 'POST',
        body: { cityCode: '410100', eventDate: null, text: '   ', textScope: 'full_contract' },
      }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_input');
  });

  it('analyze-contract text over code-unit limit -> payload_too_large 413', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('analyze-contract', {
        method: 'POST',
        body: {
          cityCode: '410100',
          eventDate: null,
          text: '押'.repeat(30001),
          textScope: 'full_contract',
        },
      }),
    );
    expect(status).toBe(413);
    expect(body.error.code).toBe('payload_too_large');
  });

  it('analyze-contract body over byte limit -> payload_too_large 413', async () => {
    const huge = JSON.stringify({
      cityCode: '410100',
      eventDate: null,
      text: 'a'.repeat(300000),
      textScope: 'full_contract',
    });
    const { status, body } = await callJson<Failure>(
      makeRequest('analyze-contract', {
        method: 'POST',
        rawBody: huge,
        contentType: 'application/json',
      }),
    );
    expect(status).toBe(413);
    expect(body.error.code).toBe('payload_too_large');
  });

  it('analyze-contract unsupported scope -> invalid_input 400', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('analyze-contract', {
        method: 'POST',
        body: {
          cityCode: '410100',
          eventDate: null,
          text: '押金3000元，退租后7日内退还。',
          textScope: 'full_contract',
          analysisScopes: ['repair'],
        },
      }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_input');
  });

  it('diagnose-dispute invalid input -> invalid_input 400', async () => {
    const { status, body } = await callJson<Failure>(
      makeRequest('diagnose-dispute', { method: 'POST', body: {} }),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe('invalid_input');
  });

  it('diagnose-dispute unverified city -> 200 coverage=unsupported, no local steps/refs', async () => {
    const { status, body } = await callJson<Success<DisputePlan>>(
      makeRequest('diagnose-dispute', {
        method: 'POST',
        body: validDisputeInput('410100'),
      }),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.coverage).toBe('unsupported');
    expect(body.meta.processingMode).toBe('rules');
    expect(body.meta.knowledgeVersion).toBe(bundle.version);
    expect(body.data.nextSteps).toEqual([]);
    expect(body.data.references).toEqual([]);
    expect(body.meta.warnings.some((w) => w.includes('尚未完成资料核验'))).toBe(true);
    // General evidence checklist is still provided (right to evidence not denied).
    expect(body.data.evidenceChecklist.length).toBeGreaterThan(0);
  });

  it('diagnose-dispute unknown city -> 200 coverage=unsupported', async () => {
    const { status, body } = await callJson<Success<DisputePlan>>(
      makeRequest('diagnose-dispute', {
        method: 'POST',
        body: validDisputeInput('999999'),
      }),
    );
    expect(status).toBe(200);
    expect(body.meta.coverage).toBe('unsupported');
  });

  it('analyze-contract with mock provider -> 200 rules_and_ai, still unsupported coverage', async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (k: string) => (k === 'LLM_USE_MOCK' ? '1' : undefined) },
    };
    const { status, body } = await callJson<Success<ContractAnalysis>>(
      makeRequest('analyze-contract', {
        method: 'POST',
        body: {
          cityCode: '410100',
          eventDate: null,
          text: '乙方应于签约时支付押金3000元。租赁期满且无欠费的，甲方应于7日内无息退还押金。',
          textScope: 'full_contract',
        },
      }),
    );
    expect(status).toBe(200);
    expect(body.meta.processingMode).toBe('rules_and_ai');
    expect(body.meta.coverage).toBe('unsupported');
    expect(Array.isArray(body.data.findings)).toBe(true);
    expect(body.data.references).toEqual([]);
    expect(body.meta.warnings.some((w) => w.includes('尚未完成资料核验'))).toBe(true);
  });

  it('analyze-contract without provider -> 200 rules-only, degraded warning', async () => {
    const { status, body } = await callJson<Success<ContractAnalysis>>(
      makeRequest('analyze-contract', {
        method: 'POST',
        body: {
          cityCode: '410100',
          eventDate: null,
          text: '押金3000元，退租后退还。',
          textScope: 'excerpt',
        },
      }),
    );
    expect(status).toBe(200);
    expect(body.meta.processingMode).toBe('rules');
    expect(body.meta.warnings.some((w) => w.includes('模型服务'))).toBe(true);
    expect(body.meta.warnings.some((w) => w.includes('合同片段'))).toBe(true);
  });
});
