import type { ChannelRecord } from '../knowledge/types.ts';
import type { DisputeInput, PathStep, ExcludedOption } from '../../shared/dispute.ts';
import type { ChannelEvaluation } from './eligibility.ts';

const MAX_NEXT_STEPS = 3;

function buildPreparations(channel: ChannelRecord, input: DisputeInput): string[] {
  const prep: string[] = [];
  if (channel.requiredEvidenceIds.length > 0) {
    prep.push(`准备材料：${channel.requiredEvidenceIds.join('、')}。`);
  }
  if (channel.kind === 'negotiation') {
    prep.push('整理时间线与诉求要点，保留沟通记录。');
  }
  if (channel.kind === 'litigation') {
    prep.push('咨询专业人士评估证据与时效；本系统不计算诉讼时效截止日。');
  }
  if (channel.kind === 'legal_aid' || channel.kind === 'legal_consultation') {
    prep.push('携带身份与租赁相关材料，先核实是否符合援助/咨询条件。');
  }
  if (input.counterpartyType === 'unknown') {
    prep.push('先核实签约与收款主体身份。');
  }
  return prep;
}

function buildAfter(
  stepId: string,
  nextStepId: string | null,
  channel: ChannelRecord,
): PathStep['after'] {
  return {
    resolved: `若经「${channel.name}」处理达成一致，保留书面结果或凭证，无需再走后续步骤。`,
    unresolvedStepIds: nextStepId ? [nextStepId] : [],
    pending: `若「${channel.name}」已受理但仍在处理中，保存受理编号，按已核实流程跟进，不重复投诉。`,
  };
}

export function buildPathSteps(
  evaluations: ChannelEvaluation[],
  input: DisputeInput,
): {
  nextSteps: PathStep[];
  conditionalOptions: PathStep[];
  excludedOptions: ExcludedOption[];
} {
  const eligible = evaluations
    .filter((e) => e.eligibility === 'eligible')
    .sort((a, b) => a.orderGroup - b.orderGroup || a.channel.id.localeCompare(b.channel.id));

  const needsCheck = evaluations
    .filter((e) => e.eligibility === 'needs_check')
    .sort((a, b) => a.orderGroup - b.orderGroup || a.channel.id.localeCompare(b.channel.id));

  const ineligible = evaluations.filter((e) => e.eligibility === 'ineligible');

  const selected = eligible.slice(0, MAX_NEXT_STEPS);
  const overflow = eligible.slice(MAX_NEXT_STEPS);

  const nextSteps: PathStep[] = selected.map((evalItem, index) => {
    const stepId = `step-${index + 1}`;
    const nextStepId = index + 1 < selected.length ? `step-${index + 2}` : null;
    const channel = evalItem.channel;
    return {
      stepId,
      channelId: channel.id,
      eligibility: 'eligible',
      title: channel.name,
      why: evalItem.reason,
      preparations: buildPreparations(channel, input),
      contact: {
        officialUrl: channel.officialUrl,
        phone: channel.phone,
      },
      sourceRefs: channel.sourceRefs.map((r) => ({
        sourceId: r.sourceId,
        articleIds: [...r.articleIds],
      })),
      after: buildAfter(stepId, nextStepId, channel),
    };
  });

  const conditionalOptions: PathStep[] = [
    ...overflow.map((evalItem, index) => ({ evalItem, stepId: `cond-overflow-${index + 1}` })),
    ...needsCheck.map((evalItem, index) => ({ evalItem, stepId: `cond-check-${index + 1}` })),
  ].map(({ evalItem, stepId }) => {
    const channel = evalItem.channel;
    return {
      stepId,
      channelId: channel.id,
      eligibility: 'needs_check',
      title: channel.name,
      why: evalItem.reason,
      preparations: buildPreparations(channel, input),
      contact: {
        officialUrl: channel.officialUrl,
        phone: channel.phone,
      },
      sourceRefs: channel.sourceRefs.map((r) => ({
        sourceId: r.sourceId,
        articleIds: [...r.articleIds],
      })),
      after: {
        resolved: `若条件满足并经「${channel.name}」处理达成一致，保留书面结果。`,
        unresolvedStepIds: [],
        pending: `若「${channel.name}」受理后仍在处理，保存编号并跟进。`,
      },
    };
  });

  const excludedOptions: ExcludedOption[] = ineligible.map((evalItem) => ({
    channelId: evalItem.channel.id,
    reason: evalItem.reason,
  }));

  return { nextSteps, conditionalOptions, excludedOptions };
}
