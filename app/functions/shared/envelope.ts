export type ApiVersion = '1';

export type ProcessingMode = 'rules' | 'rules_and_ai';

export type Coverage = 'supported' | 'limited' | 'unsupported';

export type ApiMeta = {
  apiVersion: ApiVersion;
  requestId: string;
  generatedAt: string;
  knowledgeVersion: string;
  processingMode: ProcessingMode;
  coverage: Coverage;
  warnings: string[];
};

export type Success<T> = {
  ok: true;
  data: T;
  meta: ApiMeta;
};

export type Failure = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  requestId: string;
};

export type Envelope<T> = Success<T> | Failure;

export type ActionKind =
  | 'config'
  | 'sources'
  | 'analyze-contract'
  | 'diagnose-dispute'
  | 'extract-document';

export const ACTIONS: readonly ActionKind[] = [
  'config',
  'sources',
  'analyze-contract',
  'diagnose-dispute',
  'extract-document',
] as const;

export function isActionKind(value: unknown): value is ActionKind {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}

export function isSuccess<T>(envelope: Envelope<T>): envelope is Success<T> {
  return envelope.ok === true;
}

export function isFailure<T>(envelope: Envelope<T>): envelope is Failure {
  return envelope.ok === false;
}

export function isApiMeta(value: unknown): value is ApiMeta {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    v.apiVersion === '1' &&
    typeof v.requestId === 'string' &&
    typeof v.generatedAt === 'string' &&
    typeof v.knowledgeVersion === 'string' &&
    (v.processingMode === 'rules' || v.processingMode === 'rules_and_ai') &&
    (v.coverage === 'supported' || v.coverage === 'limited' || v.coverage === 'unsupported') &&
    Array.isArray(v.warnings) &&
    v.warnings.every((w) => typeof w === 'string')
  );
}

export function isSuccessEnvelope<T>(
  value: unknown,
  dataGuard: (data: unknown) => data is T,
): value is Success<T> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.ok === true && dataGuard(v.data) && isApiMeta(v.meta);
}

export function isFailureEnvelope(value: unknown): value is Failure {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.ok !== false || typeof v.requestId !== 'string') return false;
  const err = v.error as Record<string, unknown> | undefined;
  return (
    !!err &&
    typeof err === 'object' &&
    typeof err.code === 'string' &&
    typeof err.message === 'string' &&
    typeof err.retryable === 'boolean'
  );
}
