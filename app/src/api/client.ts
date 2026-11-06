import {
  isFailureEnvelope,
  isSuccessEnvelope,
  type ActionKind,
  type ApiMeta,
  type Envelope,
  type Success,
} from '@shared/envelope.ts';
import { isPublicConfig, type PublicConfig } from '@shared/config.ts';
import { isSourceRecordPublic, type SourceRecordPublic } from '@shared/sources.ts';
import { isContractAnalysis, type AnalyzeContractInput, type ContractAnalysis } from '@shared/contract.ts';
import { isDisputeInput, isDisputePlan, type DisputeInput, type DisputePlan } from '@shared/dispute.ts';

export type ApiError = {
  kind: 'network' | 'http' | 'invalid_response' | 'business';
  status?: number;
  code?: string;
  message: string;
  retryable: boolean;
  requestId?: string;
};

// 业务结果连同响应 meta 一起返回，前端据 coverage/processingMode/warnings
// 区分 success 与 partial（limited/unsupported 能力降级），不显示成「已全面审查」。
export type ApiResult<T> = { data: T; meta: ApiMeta };

const BASE = '/functions/v1/app';

function describeHttpError(status: number): { message: string; retryable: boolean } {
  switch (status) {
    case 400: return { message: '请求字段有误，请检查后重试。', retryable: false };
    case 401: return { message: '需要登录后才能继续。', retryable: false };
    case 403: return { message: '当前账号无权访问该功能。', retryable: false };
    case 404: return { message: '接口不存在。', retryable: false };
    case 405: return { message: '请求方法不被允许。', retryable: false };
    case 413: return { message: '提交内容超过大小限制。', retryable: false };
    case 415: return { message: '不支持的提交格式。', retryable: false };
    case 429: return { message: '请求过于频繁，请稍后手动重试。', retryable: true };
    case 502: return { message: '上游返回无效内容，本次未完成。', retryable: true };
    case 503: return { message: '服务暂不可用或未配置。', retryable: true };
    case 504: return { message: '上游超时，本次未完成；输入已保留。', retryable: true };
    default: return { message: `服务返回异常状态 ${status}。`, retryable: status >= 500 };
  }
}

async function parseEnvelope(raw: Response): Promise<Envelope<unknown>> {
  const text = await raw.text();
  const contentType = raw.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw {
      kind: 'invalid_response',
      status: raw.status,
      message: '服务返回了非 JSON 内容，可能是登录页或网关错误。',
      retryable: false,
    } satisfies ApiError;
  }
  try {
    return JSON.parse(text) as Envelope<unknown>;
  } catch {
    throw {
      kind: 'invalid_response',
      status: raw.status,
      message: '服务返回了无法解析的内容。',
      retryable: false,
    } satisfies ApiError;
  }
}

async function call<T>(
  action: ActionKind,
  init: RequestInit | undefined,
  dataGuard: (data: unknown) => data is T,
  signal?: AbortSignal,
): Promise<ApiResult<T>> {
  const url = `${BASE}?action=${encodeURIComponent(action)}`;
  let raw: Response;
  try {
    raw = await fetch(url, { ...init, signal, credentials: 'same-origin' });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw {
      kind: 'network',
      message: '无法连接到服务，请检查网络后重试。',
      retryable: true,
    } satisfies ApiError;
  }

  if (!raw.ok) {
    let envelope: Envelope<unknown> | null = null;
    try {
      envelope = await parseEnvelope(raw);
    } catch {
      envelope = null;
    }
    if (envelope && isFailureEnvelope(envelope)) {
      throw {
        kind: 'business',
        status: raw.status,
        code: envelope.error.code,
        message: envelope.error.message,
        retryable: envelope.error.retryable,
        requestId: envelope.requestId,
      } satisfies ApiError;
    }
    const described = describeHttpError(raw.status);
    throw {
      kind: 'http',
      status: raw.status,
      message: described.message,
      retryable: described.retryable,
    } satisfies ApiError;
  }

  const envelope = await parseEnvelope(raw);
  if (isFailureEnvelope(envelope)) {
    throw {
      kind: 'business',
      status: raw.status,
      code: envelope.error.code,
      message: envelope.error.message,
      retryable: envelope.error.retryable,
      requestId: envelope.requestId,
    } satisfies ApiError;
  }
  if (!isSuccessEnvelope(envelope, dataGuard)) {
    throw {
      kind: 'invalid_response',
      status: raw.status,
      message: '服务返回的结构未通过校验，本次结果不予展示。',
      retryable: false,
    } satisfies ApiError;
  }
  return { data: envelope.data, meta: envelope.meta };
}

export type ConfigResult = { config: PublicConfig };

export function fetchConfig(signal?: AbortSignal): Promise<PublicConfig> {
  return call('config', { method: 'GET' }, isPublicConfig, signal).then((r) => r.data);
}

export type SourcesResult = { sources: SourceRecordPublic[] };

function isSourcesResult(value: unknown): value is SourcesResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.sources) && v.sources.every(isSourceRecordPublic);
}

export function fetchSources(
  params: { cityCode?: string; scenario?: string; eventDate?: string } = {},
  signal?: AbortSignal,
): Promise<SourcesResult> {
  const qs = new URLSearchParams();
  if (params.cityCode) qs.set('cityCode', params.cityCode);
  if (params.scenario) qs.set('scenario', params.scenario);
  if (params.eventDate) qs.set('eventDate', params.eventDate);
  const suffix = qs.toString();
  const url = `${BASE}?action=sources${suffix ? `&${suffix}` : ''}`;
  return fetch(url, { method: 'GET', credentials: 'same-origin', signal })
    .then(async (raw) => {
      if (!raw.ok) {
        const described = describeHttpError(raw.status);
        throw { kind: 'http', status: raw.status, ...described } satisfies ApiError;
      }
      const envelope = await parseEnvelope(raw);
      if (!isSuccessEnvelope(envelope, isSourcesResult)) {
        throw {
          kind: 'invalid_response',
          status: raw.status,
          message: '来源响应结构未通过校验。',
          retryable: false,
        } satisfies ApiError;
      }
      return envelope.data;
    });
}

export function analyzeContract(
  input: AnalyzeContractInput,
  signal?: AbortSignal,
): Promise<ApiResult<ContractAnalysis>> {
  return call(
    'analyze-contract',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    isContractAnalysis,
    signal,
  );
}

export function diagnoseDispute(
  input: DisputeInput,
  signal?: AbortSignal,
): Promise<ApiResult<DisputePlan>> {
  if (!isDisputeInput(input)) {
    return Promise.reject({
      kind: 'invalid_response',
      message: '纠纷表单未通过前端校验。',
      retryable: false,
    } satisfies ApiError);
  }
  return call(
    'diagnose-dispute',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    isDisputePlan,
    signal,
  );
}

export function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === 'string' && typeof v.message === 'string';
}
