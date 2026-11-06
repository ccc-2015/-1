import type { DisputeScenario } from '../../shared/dispute.ts';
import type { EvidencePriority } from '../../shared/dispute.ts';

export type EvidenceCatalogItem = {
  evidenceId: string;
  title: string;
  baseReason: string;
  preparationTip: string;
  applicableScenarios: DisputeScenario[];
  priorityByScenario: Record<DisputeScenario, EvidencePriority>;
};

export const EVIDENCE_CATALOG: readonly EvidenceCatalogItem[] = [
  {
    evidenceId: 'lease_contract',
    title: '合同及补充约定',
    baseReason: '核实押金、退租与扣款约定',
    preparationTip: '保存双方签字的完整合同与任何补充协议原件；仅有片段时注明缺失页。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'essential',
      deposit_deducted: 'essential',
    },
  },
  {
    evidenceId: 'deposit_payment',
    title: '押金支付记录',
    baseReason: '核实支付对象、金额和时间',
    preparationTip: '保留转账凭证、收据或聊天记录中确认收款的内容，注意收款方名称与合同主体是否一致。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'essential',
      deposit_deducted: 'essential',
    },
  },
  {
    evidenceId: 'return_agreement',
    title: '退还安排及承诺',
    baseReason: '判断双方约定，不代替法律结论',
    preparationTip: '收集关于退还时间、条件或金额的书面/聊天承诺；口头承诺尽量补充文字确认。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'helpful',
      deposit_deducted: 'helpful',
    },
  },
  {
    evidenceId: 'checkin_condition',
    title: '入住照片/交接记录',
    baseReason: '证明原有状态',
    preparationTip: '整理入住时拍摄的照片、视频或交接单；缺失时说明当时未留存，不假设一定能补回。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'helpful',
      deposit_deducted: 'essential',
    },
  },
  {
    evidenceId: 'checkout_handover',
    title: '退租交接及钥匙移交记录',
    baseReason: '证明交接及退租事实',
    preparationTip: '保留退租交接单、钥匙移交凭证或带时间戳的沟通记录。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'essential',
      deposit_deducted: 'helpful',
    },
  },
  {
    evidenceId: 'deduction_detail',
    title: '扣款明细和对方提出的凭证',
    baseReason: '明确争议项目',
    preparationTip: '向对方索取逐项扣款明细及对应凭证；保留对方提供的任何照片、报价单或维修单。',
    applicableScenarios: ['deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'helpful',
      deposit_deducted: 'essential',
    },
  },
  {
    evidenceId: 'communications',
    title: '完整沟通与催告记录',
    baseReason: '整理经过和双方表述',
    preparationTip: '导出与房东/中介的完整聊天记录，保留时间与上下文，避免断章取义。',
    applicableScenarios: ['deposit_not_returned', 'deposit_deducted'],
    priorityByScenario: {
      deposit_not_returned: 'helpful',
      deposit_deducted: 'helpful',
    },
  },
] as const;

export function getEvidenceItem(evidenceId: string): EvidenceCatalogItem | undefined {
  return EVIDENCE_CATALOG.find((e) => e.evidenceId === evidenceId);
}

export function evidenceIdsForScenario(scenario: DisputeScenario): string[] {
  return EVIDENCE_CATALOG.filter((e) => e.applicableScenarios.includes(scenario)).map(
    (e) => e.evidenceId,
  );
}
