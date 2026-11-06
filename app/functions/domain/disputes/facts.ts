import type { DisputeInput, FactSummaryItem, MissingFact } from '../../shared/dispute.ts';
import { getEvidenceItem } from './evidence.ts';

function yuan(cents: number | null): string {
  if (cents === null) return '未填写';
  return `${(cents / 100).toFixed(2)} 元`;
}

const COUNTERPARTY_LABEL: Record<DisputeInput['counterpartyType'], string> = {
  individual_landlord: '个人房东',
  agency: '中介机构',
  operator: '公寓经营者',
  unknown: '未知',
};

const SCENARIO_LABEL: Record<DisputeInput['scenario'], string> = {
  deposit_not_returned: '押金未退',
  deposit_deducted: '押金被部分扣款',
};

const TENANCY_LABEL: Record<DisputeInput['tenancyEnded'], string> = {
  yes: '已退租',
  no: '仍在租',
  unknown: '未知',
};

const HANDOVER_LABEL: Record<DisputeInput['handoverStatus'], string> = {
  completed: '已完成交接',
  not_completed: '未交接',
  disputed: '交接有争议',
  unknown: '未知',
};

const DUE_LABEL: Record<DisputeInput['returnDueStatus'], string> = {
  due: '自述已到退还时间',
  not_due: '自述未到退还时间',
  unclear: '退还时间不明',
};

const GOAL_LABEL: Record<DisputeInput['goal'], string> = {
  return_deposit: '要回押金',
  explain_deduction: '要求解释扣款',
  prepare_evidence: '准备证据',
  understand_options: '了解可选路径',
};

export function buildFactsSummary(input: DisputeInput): FactSummaryItem[] {
  const facts: FactSummaryItem[] = [
    { label: '纠纷类型', value: SCENARIO_LABEL[input.scenario], origin: 'user_statement' },
    { label: '对方身份', value: COUNTERPARTY_LABEL[input.counterpartyType], origin: 'user_statement' },
    { label: '押金金额', value: yuan(input.depositAmountCents), origin: 'user_statement' },
    { label: '是否已退租', value: TENANCY_LABEL[input.tenancyEnded], origin: 'user_statement' },
    { label: '交接状态', value: HANDOVER_LABEL[input.handoverStatus], origin: 'user_statement' },
    { label: '退还时间', value: DUE_LABEL[input.returnDueStatus], origin: 'user_statement' },
    { label: '你的目标', value: GOAL_LABEL[input.goal], origin: 'user_statement' },
  ];
  if (input.scenario === 'deposit_deducted') {
    facts.splice(3, 0, {
      label: '争议扣款金额',
      value: yuan(input.disputedAmountCents),
      origin: 'user_statement',
    });
    if (input.deductionReason.trim().length > 0) {
      facts.push({
        label: '对方扣款理由',
        value: input.deductionReason.trim(),
        origin: 'user_statement',
      });
    }
  }
  if (input.eventDate !== null) {
    facts.push({ label: '事件日期', value: input.eventDate, origin: 'user_statement' });
  }
  return facts;
}

function evidenceStatus(input: DisputeInput, evidenceId: string): string {
  const entry = input.evidence.find((e) => e.evidenceId === evidenceId);
  return entry?.status ?? 'unknown';
}

export function buildMissingFacts(input: DisputeInput): MissingFact[] {
  const missing: MissingFact[] = [];

  if (input.counterpartyType === 'unknown') {
    missing.push({
      field: 'counterpartyType',
      question: '和你签约、收款的主体是个人房东、中介机构还是公寓经营者？',
      reason: '对方身份决定哪些渠道可能受理；身份未知时涉及经营者资格的路径只能列为待核实。',
    });
  }

  if (input.eventDate === null) {
    missing.push({
      field: 'eventDate',
      question: '争议行为（如退租、被扣款、催告）大约发生在哪一天？',
      reason: '事件日期用于选择当时有效的资料版本；缺失时只能给出条件性说明。',
    });
  }

  if (input.depositAmountCents === null) {
    missing.push({
      field: 'depositAmountCents',
      question: '合同约定的押金金额是多少？',
      reason: '押金金额用于核对争议额是否超出押金范围。',
    });
  }

  if (input.returnDueStatus === 'unclear') {
    missing.push({
      field: 'returnDueStatus',
      question: '按合同或双方约定，押金退还的时间/条件是否已经满足？',
      reason: '退还条件或是否到期不明时，应先核实合同及交接事实，不直接指称逾期违法。',
    });
  }

  if (input.tenancyEnded === 'unknown') {
    missing.push({
      field: 'tenancyEnded',
      question: '目前是否已经退租？',
      reason: '是否退租影响交接证据与退还时间的判断。',
    });
  }

  if (input.handoverStatus === 'unknown') {
    missing.push({
      field: 'handoverStatus',
      question: '退租交接（含钥匙移交）是否已经完成？',
      reason: '交接状态是证明退租事实与房屋返还的关键。',
    });
  }

  if (input.scenario === 'deposit_deducted') {
    const detailStatus = evidenceStatus(input, 'deduction_detail');
    if (detailStatus === 'missing' || detailStatus === 'unknown') {
      missing.push({
        field: 'deduction_detail',
        question: '对方是否提供了逐项扣款明细和对应凭证？',
        reason: '未拿到扣款明细时，应优先索取项目、标准和凭证，再判断争议是否合理。',
      });
    }
  }

  if (
    input.depositAmountCents !== null &&
    input.disputedAmountCents !== null &&
    input.disputedAmountCents > input.depositAmountCents
  ) {
    missing.push({
      field: 'disputedAmountCents',
      question: '争议金额超过了押金总额，其中是否包含押金以外的其他费用？请拆分明细。',
      reason: '争议额超过押金时可能包含其他费用，需要拆分后才能准确判断。',
    });
  }

  return missing;
}

export function buildEvidenceChecklist(input: DisputeInput) {
  return input.evidence
    .map((entry) => {
      const item = getEvidenceItem(entry.evidenceId);
      if (!item) return null;
      return {
        evidenceId: entry.evidenceId,
        title: item.title,
        status: entry.status,
        priority: item.priorityByScenario[input.scenario],
        reason: item.baseReason,
        preparationTip: item.preparationTip,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
