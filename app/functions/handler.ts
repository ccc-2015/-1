import { buildPublicConfig } from './domain/config.ts';
import { loadKnowledgeSnapshot } from './data/knowledge-snapshot.ts';
import { listVerifiedSources } from './domain/knowledge/select.ts';
import { toPublicSource } from './domain/knowledge/types.ts';
import { diagnoseDispute } from './domain/disputes/index.ts';
import { analyzeContract, checkContractInput } from './domain/contracts/index.ts';
import { selectProvider } from './integrations/index.ts';
import { isDisputeInput } from './shared/dispute.ts';
import { isAnalyzeContractInput } from './shared/contract.ts';
import {
  ERROR_CODES,
  ERROR_HTTP_STATUS,
  isRetryable,
  type ErrorCode,
} from './shared/errors.ts';
import { isActionKind, type Failure, type Success } from './shared/envelope.ts';
import { KNOWLEDGE_VERSION_SYNTHETIC } from './domain/config.ts';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

function makeRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function failure(requestId: string, code: ErrorCode, message: string): Response {
  const body: Failure = {
    ok: false,
    error: { code, message, retryable: isRetryable(code) },
    requestId,
  };
  return Response.json(body, {
    status: ERROR_HTTP_STATUS[code],
    headers: NO_STORE,
  });
}

function success<T>(requestId: string, data: T, overrides: Partial<Success<T>['meta']> = {}): Response {
  const body: Success<T> = {
    ok: true,
    data,
    meta: {
      apiVersion: '1',
      requestId,
      generatedAt: new Date().toISOString(),
      knowledgeVersion: KNOWLEDGE_VERSION_SYNTHETIC,
      processingMode: 'rules',
      coverage: 'unsupported',
      warnings: [],
      ...overrides,
    },
  };
  return Response.json(body, { status: 200, headers: NO_STORE });
}

const MAX_CONTRACT_JSON_BYTES = 256 * 1024;
const MAX_DISPUTE_JSON_BYTES = 64 * 1024;

async function readJsonWithinLimit(request: Request, limitBytes: number): Promise<unknown | null> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  const raw = await request.arrayBuffer();
  if (raw.byteLength > limitBytes) return { __too_large: true };
  try {
    return JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
}

export async function handler(request: Request): Promise<Response> {
  const requestId = makeRequestId();
  const url = new URL(request.url);
  const actionParam = url.searchParams.get('action');

  if (!actionParam) {
    return failure(requestId, 'unknown_action', 'Missing action query parameter.');
  }
  if (!isActionKind(actionParam)) {
    return failure(requestId, 'unknown_action', `Unknown action: ${actionParam}`);
  }

  const method = request.method.toUpperCase();

  if (actionParam === 'config' || actionParam === 'sources') {
    if (method !== 'GET') {
      return new Response(null, {
        status: 405,
        headers: { ...NO_STORE, Allow: 'GET' },
      });
    }
    const bundle = loadKnowledgeSnapshot();
    if (actionParam === 'config') {
      const provider = selectProvider();
      return success(requestId, buildPublicConfig(bundle, provider.available), {
        knowledgeVersion: bundle.version,
      });
    }
    return success(
      requestId,
      { sources: listVerifiedSources(bundle).map(toPublicSource) },
      { knowledgeVersion: bundle.version },
    );
  }

  if (
    actionParam === 'analyze-contract' ||
    actionParam === 'diagnose-dispute' ||
    actionParam === 'extract-document'
  ) {
    if (method !== 'POST') {
      return new Response(null, {
        status: 405,
        headers: { ...NO_STORE, Allow: 'POST' },
      });
    }
    if (actionParam === 'extract-document') {
      return failure(
        requestId,
        'service_unavailable',
        'Document extraction is not available in Phase 1.',
      );
    }
    const limit =
      actionParam === 'analyze-contract' ? MAX_CONTRACT_JSON_BYTES : MAX_DISPUTE_JSON_BYTES;
    const parsed = await readJsonWithinLimit(request, limit);
    if (parsed && typeof parsed === 'object' && '__too_large' in (parsed as Record<string, unknown>)) {
      return failure(
        requestId,
        'payload_too_large',
        `Request body exceeds ${limit} bytes.`,
      );
    }
    if (parsed === null) {
      return failure(
        requestId,
        'unsupported_media_type',
        'Content-Type must be application/json.',
      );
    }

    if (actionParam === 'diagnose-dispute') {
      if (!isDisputeInput(parsed)) {
        return failure(requestId, 'invalid_input', '纠纷请求字段未通过校验。');
      }
      const bundle = loadKnowledgeSnapshot();
      const result = diagnoseDispute(parsed, bundle);
      return success(requestId, result.plan, {
        knowledgeVersion: result.knowledgeVersion,
        processingMode: result.processingMode,
        coverage: result.coverage,
        warnings: result.warnings,
      });
    }

    if (actionParam === 'analyze-contract') {
      if (!isAnalyzeContractInput(parsed)) {
        return failure(requestId, 'invalid_input', '合同检查请求字段未通过校验。');
      }
      const inputError = checkContractInput(parsed);
      if (inputError) {
        return failure(requestId, inputError.code, inputError.message);
      }
      const bundle = loadKnowledgeSnapshot();
      const provider = selectProvider();
      const result = await analyzeContract(parsed, bundle, provider);
      return success(requestId, result.analysis, {
        knowledgeVersion: result.knowledgeVersion,
        processingMode: result.processingMode,
        coverage: result.coverage,
        warnings: result.warnings,
      });
    }

    return failure(
      requestId,
      'service_not_configured',
      `Action ${actionParam} is not yet implemented.`,
    );
  }

  return failure(requestId, 'unknown_action', `Unhandled action: ${actionParam}`);
}
