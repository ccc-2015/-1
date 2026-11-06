import type { Coverage, ProcessingMode } from '../../shared/envelope.ts';
import type { DisputeInput, DisputePlan } from '../../shared/dispute.ts';
import type { KnowledgeBundle } from '../knowledge/types.ts';
import { toPublicSource } from '../knowledge/types.ts';
import { isCitySupported, selectChannels, selectSources } from '../knowledge/select.ts';
import { EVIDENCE_CATALOG, evidenceIdsForScenario } from './evidence.ts';
import { buildEvidenceChecklist, buildFactsSummary, buildMissingFacts } from './facts.ts';
import { evaluateChannels } from './eligibility.ts';
import { buildPathSteps } from './paths.ts';
import { buildCommunication } from './templates.ts';

export type DiagnoseResult = {
  plan: DisputePlan;
  coverage: Coverage;
  processingMode: ProcessingMode;
  warnings: string[];
  knowledgeVersion: string;
};

function generalEvidenceChecklist(input: DisputeInput) {
  const ids = evidenceIdsForScenario(input.scenario);
  return ids
    .map((id) => {
      const item = EVIDENCE_CATALOG.find((e) => e.evidenceId === id);
      if (!item) return null;
      const entry = input.evidence.find((e) => e.evidenceId === id);
      return {
        evidenceId: id,
        title: item.title,
        status: entry?.status ?? ('unknown' as const),
        priority: item.priorityByScenario[input.scenario],
        reason: item.baseReason,
        preparationTip: item.preparationTip,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export function diagnoseDispute(input: DisputeInput, bundle: KnowledgeBundle): DiagnoseResult {
  const factsSummary = buildFactsSummary(input);
  const missingFacts = buildMissingFacts(input);
  const communication = buildCommunication(input);

  if (!isCitySupported(bundle, input.cityCode)) {
    return {
      plan: {
        factsSummary,
        missingFacts,
        evidenceChecklist: generalEvidenceChecklist(input),
        communication,
        nextSteps: [],
        conditionalOptions: [],
        excludedOptions: [],
        references: [],
      },
      coverage: 'unsupported',
      processingMode: 'rules',
      warnings: [
        '当前城市尚未完成资料核验，未提供当地特定渠道或法律结论。',
        '以上为一般证据清单与事实梳理，可先自行留证。',
        bundle.synthetic ? '当前使用合成资料快照，非真实已核验法规。' : '',
      ].filter((w) => w.length > 0),
      knowledgeVersion: bundle.version,
    };
  }

  const ctx = {
    cityCode: input.cityCode,
    scenario: input.scenario,
    eventDate: input.eventDate,
  };

  const sourceSelections = selectSources(bundle, ctx);
  const channels = selectChannels(bundle, ctx);
  const evaluations = evaluateChannels(channels, input);
  const { nextSteps, conditionalOptions, excludedOptions } = buildPathSteps(evaluations, input);

  const referencedSourceIds = new Set<string>();
  for (const step of [...nextSteps, ...conditionalOptions]) {
    for (const ref of step.sourceRefs) referencedSourceIds.add(ref.sourceId);
  }
  const references = sourceSelections
    .filter((s) => referencedSourceIds.has(s.source.id))
    .map((s) => toPublicSource(s.source));

  const warnings: string[] = [];
  if (bundle.synthetic) {
    warnings.push('当前使用合成资料快照，非真实已核验法规；渠道与来源仅供开发演示。');
  }
  if (input.eventDate === null) {
    warnings.push('事件日期未知，时间适用性判断为条件性结果，请补充后复核。');
  }
  if (nextSteps.length === 0 && conditionalOptions.length > 0) {
    warnings.push('当前没有立即可执行的步骤，请先核实待确认渠道的资格条件。');
  }

  const coverage: Coverage = warnings.some((w) => w.includes('合成')) || input.eventDate === null
    ? 'limited'
    : 'supported';

  return {
    plan: {
      factsSummary,
      missingFacts,
      evidenceChecklist: buildEvidenceChecklist(input),
      communication,
      nextSteps,
      conditionalOptions,
      excludedOptions,
      references,
    },
    coverage,
    processingMode: 'rules',
    warnings,
    knowledgeVersion: bundle.version,
  };
}
