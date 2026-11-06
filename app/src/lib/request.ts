// 请求状态模型（doc 04 §1.3）。
// idle → validating → submitting → success | partial | error。
// partial 对应 limited/unsupported 或能力降级，界面不得显示成「已全面审查」。

import type { ApiError, ApiResult } from '../api/client';

export type RequestPhase =
  | 'idle'
  | 'validating'
  | 'submitting'
  | 'success'
  | 'partial'
  | 'error';

export type ResultMeta = ApiResult<unknown>['meta'];

export type RequestState<T> =
  | { phase: 'idle' }
  | { phase: 'validating' }
  | { phase: 'submitting' }
  | { phase: 'success'; data: T; meta: ResultMeta; stale: boolean; example: boolean }
  | { phase: 'partial'; data: T; meta: ResultMeta; stale: boolean; example: boolean }
  | { phase: 'error'; error: ApiError };

export function isErrorState<T>(s: RequestState<T>): s is Extract<RequestState<T>, { phase: 'error' }> {
  return s.phase === 'error';
}

export function hasData<T>(
  s: RequestState<T>,
): s is Extract<RequestState<T>, { phase: 'success' | 'partial' }> {
  return s.phase === 'success' || s.phase === 'partial';
}

export function toApiError(err: unknown): ApiError {
  if (err && typeof err === 'object' && 'kind' in err && 'message' in err) {
    return err as ApiError;
  }
  return {
    kind: 'network',
    message: err instanceof Error ? err.message : String(err),
    retryable: false,
  };
}

// 根据响应 meta 决定 success 还是 partial（能力降级）。
export function phaseFromMeta(meta: ResultMeta): 'success' | 'partial' {
  return meta.coverage === 'supported' && meta.processingMode === 'rules_and_ai'
    ? 'success'
    : 'partial';
}
