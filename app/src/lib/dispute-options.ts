// 纠纷表单选项标签与证据清单（doc 04 §1.5）。
// evidenceId 必须与后端 EVIDENCE_CATALOG 一致；标签仅用于前端展示。

export const EVIDENCE_OPTIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'lease_contract', title: '合同及补充约定' },
  { id: 'deposit_payment', title: '押金支付记录' },
  { id: 'return_agreement', title: '退还安排及承诺' },
  { id: 'checkin_condition', title: '入住照片/交接记录' },
  { id: 'checkout_handover', title: '退租交接及钥匙移交记录' },
  { id: 'deduction_detail', title: '扣款明细和对方提出的凭证' },
  { id: 'communications', title: '完整沟通与催告记录' },
];

export const SCENARIO_LABEL: Record<string, string> = {
  deposit_not_returned: '押金未退还',
  deposit_deducted: '押金被部分扣除',
};

export const COUNTERPARTY_LABEL: Record<string, string> = {
  individual_landlord: '个人房东',
  agency: '中介/代理机构',
  operator: '运营方/平台',
  unknown: '不确定',
};

export const TENANCY_LABEL: Record<string, string> = {
  yes: '已退租',
  no: '仍在租住',
  unknown: '不确定',
};

export const HANDOVER_LABEL: Record<string, string> = {
  completed: '已完成交接',
  not_completed: '未交接',
  disputed: '交接有争议',
  unknown: '不确定',
};

export const RETURN_DUE_LABEL: Record<string, string> = {
  due: '已到约定退还期限',
  not_due: '未到约定退还期限',
  unclear: '约定不明确',
};

export const GOAL_LABEL: Record<string, string> = {
  return_deposit: '要回押金',
  explain_deduction: '弄清扣款理由',
  prepare_evidence: '准备证据',
  understand_options: '了解可选途径',
};

export const EVIDENCE_STATUS_LABEL: Record<string, string> = {
  available: '已有',
  missing: '缺失',
  unknown: '不确定',
  not_applicable: '不适用',
};

export const PRIOR_ACTION_OPTIONS: ReadonlyArray<{ type: string; label: string }> = [
  { type: 'negotiation', label: '与对方协商' },
  { type: 'written_notice', label: '书面催告' },
  { type: 'enterprise_complaint', label: '企业/平台投诉' },
  { type: 'mediation', label: '调解' },
  { type: 'administrative_contact', label: '联系行政部门' },
  { type: 'consumer_contact', label: '联系消协' },
  { type: 'legal_consultation', label: '法律咨询' },
];

export const PRIOR_OUTCOME_LABEL: Record<string, string> = {
  not_started: '未进行',
  pending: '进行中',
  resolved: '已解决',
  unresolved: '未解决',
  unknown: '不确定',
};

export const PRIORITY_LABEL: Record<string, string> = {
  essential: '关键',
  helpful: '有助',
};
