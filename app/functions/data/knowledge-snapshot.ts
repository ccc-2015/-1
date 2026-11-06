import type { KnowledgeBundle } from '../domain/knowledge/types.ts';

export const KNOWLEDGE_VERSION = 'synthetic-0.0.1';

export function loadKnowledgeSnapshot(): KnowledgeBundle {
  return {
    version: KNOWLEDGE_VERSION,
    builtAt: '2026-11-06T00:00:00.000Z',
    synthetic: true,
    supportedCities: [],
    sources: [],
    channels: [],
    rules: [],
  };
}
