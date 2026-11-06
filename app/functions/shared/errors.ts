export const ERROR_CODES = {
  invalid_input: 'invalid_input',
  payload_too_large: 'payload_too_large',
  unsupported_media_type: 'unsupported_media_type',
  rate_limited: 'rate_limited',
  upstream_invalid_response: 'upstream_invalid_response',
  service_not_configured: 'service_not_configured',
  service_unavailable: 'service_unavailable',
  upstream_timeout: 'upstream_timeout',
  method_not_allowed: 'method_not_allowed',
  unknown_action: 'unknown_action',
  internal_error: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  upstream_invalid_response: 502,
  service_not_configured: 503,
  service_unavailable: 503,
  upstream_timeout: 504,
  method_not_allowed: 405,
  unknown_action: 404,
  internal_error: 500,
};

export const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  'rate_limited',
  'upstream_invalid_response',
  'service_unavailable',
  'upstream_timeout',
  'internal_error',
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}
