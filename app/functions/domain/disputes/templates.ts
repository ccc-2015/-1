import type { CommunicationDraft, DisputeInput } from '../../shared/dispute.ts';

function yuan(cents: number | null): string | null {
  if (cents === null) return null;
  return `${(cents / 100).toFixed(2)} 元`;
}

const COUNTERPARTY_TERM: Record<DisputeInput['counterpartyType'], string> = {
  individual_landlord: '房东',
  agency: '中介',
  operator: '公寓方',
  unknown: '[请补充对方身份]',
};

export function buildCommunication(input: DisputeInput): CommunicationDraft {
  const placeholders: string[] = [];
  const warnings: string[] = [];
  const party = COUNTERPARTY_TERM[input.counterpartyType];
  if (input.counterpartyType === 'unknown') placeholders.push('[请补充对方身份]');

  const depositText = yuan(input.depositAmountCents);
  if (depositText === null) placeholders.push('[请补充押金金额]');

  const lines: string[] = [];

  lines.push(`${party}您好：`);
  lines.push('');

  const leaseFact =
    input.tenancyEnded === 'yes'
      ? '我已按约定退租'
      : input.tenancyEnded === 'no'
        ? '目前仍在租期内'
        : '[请补充是否已退租]';
  if (input.tenancyEnded === 'unknown') placeholders.push('[请补充是否已退租]');

  const handoverFact =
    input.handoverStatus === 'completed'
      ? '房屋及钥匙交接已完成'
      : input.handoverStatus === 'not_completed'
        ? '房屋交接尚未完成'
        : input.handoverStatus === 'disputed'
          ? '交接情况存在争议'
          : '[请补充交接状态]';
  if (input.handoverStatus === 'unknown') placeholders.push('[请补充交接状态]');

  lines.push(`关于押金事宜（押金金额：${depositText ?? '[请补充押金金额]'}），${leaseFact}，${handoverFact}。`);
  lines.push('');

  if (input.scenario === 'deposit_not_returned') {
    const dueFact =
      input.returnDueStatus === 'due'
        ? '按约定退还时间已到'
        : input.returnDueStatus === 'not_due'
          ? '退还时间尚未到'
          : '[请补充退还时间约定]';
    if (input.returnDueStatus === 'unclear') placeholders.push('[请补充退还时间约定]');
    lines.push(`现押金尚未退还，${dueFact}。请在合理期限内退还押金，或书面说明暂不退还的具体理由和依据。`);
  } else {
    const disputedText = yuan(input.disputedAmountCents);
    if (disputedText === null) placeholders.push('[请补充争议扣款金额]');
    lines.push(
      `现押金被扣除 ${disputedText ?? '[请补充争议扣款金额]'}。请提供逐项扣款明细、计算标准及对应凭证（如维修报价、照片、缴费单据），以便我核对。`,
    );
    if (input.deductionReason.trim().length > 0) {
      lines.push(`你方此前提出的扣款理由为：「${input.deductionReason.trim()}」。如与明细不一致，请一并说明。`);
    }
  }

  lines.push('');
  lines.push('如对上述内容有不同意见，希望我们先行协商解决。我的联系方式为：[请补充联系方式]。');
  placeholders.push('[请补充联系方式]');
  lines.push('');
  lines.push('谢谢。');

  warnings.push('模板仅供你复制后自行编辑发送，系统不代发。');
  warnings.push('发送前请替换所有 [请补充…] 占位符，并核对事实与你掌握的证据一致。');
  warnings.push('模板未填入任何违法结论、恶意判断或法定期限；如需主张权利期限，请咨询专业人士。');

  const uniquePlaceholders = Array.from(new Set(placeholders));

  return {
    text: lines.join('\n'),
    placeholders: uniquePlaceholders,
    warnings,
  };
}
