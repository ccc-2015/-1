import type { PublicConfig } from '../shared/config.ts';
import type { KnowledgeBundle } from './knowledge/types.ts';
import { deriveSupportedScenarios } from './knowledge/select.ts';

// Retained as the neutral default for success envelopes whose action does not
// carry a knowledge result (see handler.ts). Real actions override it.
export const KNOWLEDGE_VERSION_SYNTHETIC = 'synthetic-0.0.1';

export const ZHENGZHOU_CITY_CODE = '410100';

export const CONTRACT_TEXT_CODE_UNITS = 30000;
export const CONTRACT_JSON_BYTES = 256 * 1024;
export const DISPUTE_JSON_BYTES = 64 * 1024;

// supportedCities / supportedScenarios / knowledgeVersion are DERIVED from the
// knowledge bundle (which the build script derives from verified records only),
// never hardcoded — doc 01 §2.5「不因创建配置项即显示为已支持」.
export function buildPublicConfig(bundle: KnowledgeBundle, liveAi: boolean): PublicConfig {
  return {
    supportedCities: bundle.supportedCities.map((c) => ({ cityCode: c.cityCode, name: c.name })),
    supportedScenarios: deriveSupportedScenarios(bundle),
    knowledgeVersion: bundle.version,
    features: {
      contractAnalysis: true,
      disputePlan: true,
      documentExtraction: false,
      materialExport: false,
      liveAi,
    },
    limits: {
      contractTextCodeUnits: CONTRACT_TEXT_CODE_UNITS,
      contractJsonBytes: CONTRACT_JSON_BYTES,
      disputeJsonBytes: DISPUTE_JSON_BYTES,
      extractionBytes: null,
      extractionPages: null,
    },
  };
}
