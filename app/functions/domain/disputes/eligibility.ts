import type { ChannelRecord } from '../knowledge/types.ts';
import type { DisputeInput, ChannelEligibility } from '../../shared/dispute.ts';
import { getEvidenceItem } from './evidence.ts';

export type ChannelEvaluation = {
  channel: ChannelRecord;
  eligibility: ChannelEligibility | 'ineligible';
  reason: string;
  orderGroup: number;
};

const KIND_ORDER_GROUP: Record<ChannelRecord['kind'], number> = {
  negotiation: 10,
  enterprise: 20,
  consumer: 30,
  administrative: 40,
  mediation: 50,
  legal_consultation: 60,
  legal_aid: 70,
  litigation: 80,
};

const DEPRIORITIZED_NEGOTIATION_GROUP = 95;

const COUNTERPARTY_TEXT: Record<DisputeInput['counterpartyType'], string> = {
  individual_landlord: '个人房东',
  agency: '中介/代理机构',
  operator: '运营方/平台',
  unknown: '身份未知',
};

function evidenceTitles(ids: string[]): string {
  return ids.map((id) => getEvidenceItem(id)?.title ?? id).join('、');
}

function evidenceStatus(input: DisputeInput, evidenceId: string): string {
  return input.evidence.find((e) => e.evidenceId === evidenceId)?.status ?? 'unknown';
}

function hasPriorAction(
  input: DisputeInput,
  type: DisputeInput['priorActions'][number]['type'],
  outcome: DisputeInput['priorActions'][number]['outcome'],
): boolean {
  return input.priorActions.some((p) => p.type === type && p.outcome === outcome);
}

export function evaluateChannel(channel: ChannelRecord, input: DisputeInput): ChannelEvaluation {
  const orderGroup = KIND_ORDER_GROUP[channel.kind] ?? 90;

  if (channel.counterpartyTypes.length === 0) {
    return { channel, eligibility: 'ineligible', reason: '该渠道未登记受理对象。', orderGroup };
  }

  if (input.counterpartyType === 'unknown') {
    if (!channel.counterpartyTypes.includes('unknown')) {
      return {
        channel,
        eligibility: 'needs_check',
        reason: '对方身份未知，需先核实签约/收款主体才能判断该渠道是否受理。',
        orderGroup,
      };
    }
  } else if (!channel.counterpartyTypes.includes(input.counterpartyType)) {
    return {
      channel,
      eligibility: 'ineligible',
      reason: `该渠道受理对象不包含「${COUNTERPARTY_TEXT[input.counterpartyType]}」类对方。`,
      orderGroup,
    };
  }

  if (channel.kind === 'consumer' && input.counterpartyType === 'individual_landlord') {
    return {
      channel,
      eligibility: 'needs_check',
      reason: '个人之间的租赁争议不默认满足消费者投诉渠道受理条件，需按当地核验资料确认。',
      orderGroup,
    };
  }

  if (channel.kind === 'legal_aid') {
    return {
      channel,
      eligibility: 'needs_check',
      reason: '法律援助资格需核实（援助事项与经济困难条件）；提供咨询入口不代表符合代理援助资格。',
      orderGroup,
    };
  }

  const missingRequired = channel.requiredEvidenceIds.filter((id) => {
    const status = evidenceStatus(input, id);
    return status === 'missing';
  });
  const unknownRequired = channel.requiredEvidenceIds.filter((id) => {
    const status = evidenceStatus(input, id);
    return status === 'unknown';
  });

  if (missingRequired.length > 0) {
    return {
      channel,
      eligibility: 'needs_check',
      reason: `需补充材料：${evidenceTitles(missingRequired)}。`,
      orderGroup,
    };
  }
  if (unknownRequired.length > 0) {
    return {
      channel,
      eligibility: 'needs_check',
      reason: `以下材料状态待核实：${evidenceTitles(unknownRequired)}。`,
      orderGroup,
    };
  }

  if (channel.kind === 'negotiation' && hasPriorAction(input, 'negotiation', 'unresolved')) {
    return {
      channel,
      eligibility: 'eligible',
      reason: '已协商无果，可再次协商但不作为首选；应优先考虑符合条件的后续途径。',
      orderGroup: DEPRIORITIZED_NEGOTIATION_GROUP,
    };
  }

  return { channel, eligibility: 'eligible', reason: '事实与材料满足该渠道的结构化受理条件。', orderGroup };
}

export function evaluateChannels(
  channels: ChannelRecord[],
  input: DisputeInput,
): ChannelEvaluation[] {
  return channels.map((c) => evaluateChannel(c, input));
}
