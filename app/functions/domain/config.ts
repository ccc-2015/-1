import type { PublicConfig } from '../shared/config.ts';

export const KNOWLEDGE_VERSION_SYNTHETIC = 'synthetic-0.0.1';

export const ZHENGZHOU_CITY_CODE = '410100';

export function buildPublicConfig(): PublicConfig {
  return {
    supportedCities: [],
    supportedScenarios: [],
    knowledgeVersion: KNOWLEDGE_VERSION_SYNTHETIC,
    features: {
      contractAnalysis: false,
      disputePlan: false,
      documentExtraction: false,
      materialExport: false,
      liveAi: false,
    },
    limits: {
      contractTextCodeUnits: 30000,
      contractJsonBytes: 256 * 1024,
      disputeJsonBytes: 64 * 1024,
      extractionBytes: null,
      extractionPages: null,
    },
  };
}
