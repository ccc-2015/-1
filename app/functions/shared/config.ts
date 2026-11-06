export type SupportedCity = {
  cityCode: string;
  name: string;
};

export type ScenarioId =
  | 'deposit_not_returned'
  | 'deposit_deducted'
  | 'early_termination'
  | 'repair_dispute'
  | 'extra_fee'
  | 'agency_service';

export const PHASE1_SCENARIOS: readonly ScenarioId[] = [
  'deposit_not_returned',
  'deposit_deducted',
] as const;

export type FeatureFlags = {
  contractAnalysis: boolean;
  disputePlan: boolean;
  documentExtraction: boolean;
  materialExport: boolean;
  liveAi: boolean;
};

export type InputLimits = {
  contractTextCodeUnits: number;
  contractJsonBytes: number;
  disputeJsonBytes: number;
  extractionBytes: number | null;
  extractionPages: number | null;
};

export type PublicConfig = {
  supportedCities: SupportedCity[];
  supportedScenarios: ScenarioId[];
  knowledgeVersion: string;
  features: FeatureFlags;
  limits: InputLimits;
};

export function isPublicConfig(value: unknown): value is PublicConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.supportedCities)) return false;
  if (!v.supportedCities.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const city = c as Record<string, unknown>;
    return typeof city.cityCode === 'string' && typeof city.name === 'string';
  })) return false;
  if (!Array.isArray(v.supportedScenarios)) return false;
  if (!v.supportedScenarios.every((s) => typeof s === 'string')) return false;
  if (typeof v.knowledgeVersion !== 'string') return false;
  const f = v.features as Record<string, unknown> | undefined;
  if (!f) return false;
  for (const key of ['contractAnalysis', 'disputePlan', 'documentExtraction', 'materialExport', 'liveAi']) {
    if (typeof f[key] !== 'boolean') return false;
  }
  const l = v.limits as Record<string, unknown> | undefined;
  if (!l) return false;
  if (
    typeof l.contractTextCodeUnits !== 'number' ||
    typeof l.contractJsonBytes !== 'number' ||
    typeof l.disputeJsonBytes !== 'number'
  ) return false;
  if (
    !(l.extractionBytes === null || typeof l.extractionBytes === 'number') ||
    !(l.extractionPages === null || typeof l.extractionPages === 'number')
  ) return false;
  return true;
}
