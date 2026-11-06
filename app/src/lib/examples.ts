// 脱敏合成示例与固定展示夹具（doc 04 §1.7）。
// 全部为合成内容，不含真实姓名、证件、账号或未授权合同。
// 「填入示例」走真实接口；「查看示例结果」读取此处固定夹具，界面须标注
// 不代表本次真实分析。

import type { ContractAnalysis, AnalyzeContractInput } from '@shared/contract.ts';
import type { DisputeInput, DisputePlan } from '@shared/dispute.ts';

export const PILOT_CITY_CODE = '410100';
export const PILOT_CITY_NAME = '郑州';

export const EXAMPLE_CONTRACT_TEXT = [
  '房屋租赁合同（合成示例，仅供演示）',
  '第一条 租金及支付方式：月租金由双方另行约定，租金押一付三，签约时支付。',
  '第二条 押金：承租人应于签约时向出租人支付押金2000元，作为履行本合同的担保。',
  '第三条 押金退还：租赁关系终止且承租人结清各项费用、交还房屋及钥匙后，出租人应于7日内退还押金。',
  '第四条 扣款：退租时房屋内设施如有损坏，出租人可凭维修单据从押金中扣除相应费用。',
  '第五条 其他费用：退租时产生的一切费用由出租人决定从押金中扣除。',
  '第六条 保护性约定：出租人不得无故扣除押金，不得无正当理由拒不退还未到期押金。',
  '第七条 提前退租：承租人未经出租人同意提前退租的，已付押金不予退还。',
].join('\n');

function ex(text: string, quote: string): { text: string; start: number; end: number } {
  const start = text.indexOf(quote);
  if (start === -1) {
    throw new Error(`示例夹具引句未在示例文本中找到：${quote}`);
  }
  return { text: quote, start, end: start + quote.length };
}

export const EXAMPLE_CONTRACT_INPUT: AnalyzeContractInput = {
  cityCode: PILOT_CITY_CODE,
  eventDate: '2026-06-01',
  text: EXAMPLE_CONTRACT_TEXT,
  textScope: 'full_contract',
};

// 固定展示夹具：与 EXAMPLE_CONTRACT_TEXT 对应的合成检查结果。
export const EXAMPLE_CONTRACT_FIXTURE: { text: string; analysis: ContractAnalysis } = {
  text: EXAMPLE_CONTRACT_TEXT,
  analysis: {
    findings: [
      {
        id: 'deposit_amount',
        category: 'deposit_amount',
        checkStatus: 'ambiguous',
        priority: 'medium',
        legalAssessment: 'unclear_or_missing',
        excerpts: [ex(EXAMPLE_CONTRACT_TEXT, '租金押一付三，签约时支付。'), ex(EXAMPLE_CONTRACT_TEXT, '支付押金2000元')],
        explanation:
          '【示例结果】同时出现「押一付三」倍数约定与 2000 元金额，需确认两者关系及对应月租，避免金额歧义。',
        suggestedQuestions: ['「押一付三」对应的月租金是多少？押金 2000 元是否即由此计算得出？'],
        negotiationSuggestion: '建议在合同中写明押金的具体金额及其与月租的对应关系。',
        sourceRefs: [],
        missingFacts: ['对应月租金额'],
      },
      {
        id: 'deposit_return',
        category: 'deposit_return',
        checkStatus: 'clear',
        priority: 'notice',
        legalAssessment: 'not_assessed',
        excerpts: [ex(EXAMPLE_CONTRACT_TEXT, '出租人应于7日内退还押金。')],
        explanation: '【示例结果】识别到明确的退还时间（结清费用、交还房屋及钥匙后 7 日内）。此处仅提取合同表述。',
        suggestedQuestions: [],
        negotiationSuggestion: null,
        sourceRefs: [],
        missingFacts: [],
      },
      {
        id: 'deposit_deduction',
        category: 'deposit_deduction',
        checkStatus: 'ambiguous',
        priority: 'high',
        legalAssessment: 'unfavorable_term',
        excerpts: [ex(EXAMPLE_CONTRACT_TEXT, '退租时产生的一切费用由出租人决定从押金中扣除。')],
        explanation:
          '【示例结果】「一切费用由出租人决定」表述宽泛，未列明项目、标准与凭证要求，对承租人不利。不自动认定条款无效，建议协商明确。',
        suggestedQuestions: ['能否列明可扣款的具体项目、计算标准和所需凭证？'],
        negotiationSuggestion: '建议明确扣款项目、计算标准、凭证要求与争议处理方式。',
        sourceRefs: [],
        missingFacts: ['可扣款项目清单', '扣款计算标准'],
      },
      {
        id: 'deposit_forfeit',
        category: 'deposit_forfeit',
        checkStatus: 'needs_verification',
        priority: 'high',
        legalAssessment: 'unfavorable_term',
        excerpts: [ex(EXAMPLE_CONTRACT_TEXT, '承租人未经出租人同意提前退租的，已付押金不予退还。')],
        explanation:
          '【示例结果】识别到提前退租触发押金不退的约定。是否公平或有效需结合事实、违约责任与相关依据判断，此处不作结论。',
        suggestedQuestions: ['触发不退押金的具体条件是什么？是否与违约责任挂钩、是否合理？'],
        negotiationSuggestion: '建议明确不退押金的触发条件、对应责任及争议处理方式。',
        sourceRefs: [],
        missingFacts: [],
      },
    ],
    summary: { needsAttention: 2, needsConfirmation: 2 },
    extractedFacts: {
      depositAmountCents: 200000,
      returnTimingText: '结清费用、交还房屋及钥匙后 7 日内退还',
      deductionItems: ['设施损坏维修费用（凭维修单据）'],
    },
    evidenceChecklist: [
      { evidenceId: 'lease_contract', title: '合同及补充约定', reason: '核实押金、退租与扣款约定' },
      { evidenceId: 'deposit_payment', title: '押金支付记录', reason: '核实支付对象、金额和时间' },
      { evidenceId: 'return_agreement', title: '退还安排及承诺', reason: '判断双方约定，不代替法律结论' },
    ],
    references: [],
  },
};

export const EXAMPLE_DISPUTE_INPUT: DisputeInput = {
  cityCode: PILOT_CITY_CODE,
  eventDate: '2026-05-20',
  scenario: 'deposit_deducted',
  counterpartyType: 'individual_landlord',
  depositAmountCents: 200000,
  disputedAmountCents: 120000,
  tenancyEnded: 'yes',
  handoverStatus: 'completed',
  returnDueStatus: 'due',
  deductionReason: '房东称墙面有损坏、需重新粉刷，另有「清洁费」，未提供逐项凭证。',
  evidence: [
    { evidenceId: 'lease_contract', status: 'available' },
    { evidenceId: 'deposit_payment', status: 'available' },
    { evidenceId: 'checkin_condition', status: 'missing' },
    { evidenceId: 'checkout_handover', status: 'available' },
    { evidenceId: 'deduction_detail', status: 'missing' },
    { evidenceId: 'communications', status: 'available' },
  ],
  priorActions: [{ type: 'negotiation', outcome: 'unresolved' }],
  goal: 'explain_deduction',
  narrative: '退租交接已完成，房东以墙面损坏和清洁为由扣除 1200 元，仅口头说明，未给明细和凭证。',
};

// 固定展示夹具：合成纠纷方案（不代表真实渠道或法律结论）。
export const EXAMPLE_DISPUTE_FIXTURE: DisputePlan = {
  factsSummary: [
    { label: '纠纷类型', value: '押金被部分扣除', origin: 'user_statement' },
    { label: '对方身份', value: '个人房东', origin: 'user_statement' },
    { label: '押金金额', value: '2000 元', origin: 'user_statement' },
    { label: '争议金额', value: '1200 元', origin: 'user_statement' },
    { label: '退租交接', value: '已完成', origin: 'user_statement' },
  ],
  missingFacts: [
    {
      field: 'deduction_detail',
      question: '房东是否能提供逐项扣款明细及对应凭证？',
      reason: '缺少扣款明细时，无法核对扣除项目与金额是否合理。',
    },
    {
      field: 'checkin_condition',
      question: '入住时是否留存了房屋原始状态的照片或交接记录？',
      reason: '用于对比损坏是否为居住期间产生，而非自然损耗。',
    },
  ],
  evidenceChecklist: [
    {
      evidenceId: 'lease_contract',
      title: '合同及补充约定',
      status: 'available',
      priority: 'essential',
      reason: '核实押金、退租与扣款约定',
      preparationTip: '保存双方签字的完整合同与任何补充协议原件。',
    },
    {
      evidenceId: 'deduction_detail',
      title: '扣款明细和对方提出的凭证',
      status: 'missing',
      priority: 'essential',
      reason: '明确争议项目',
      preparationTip: '向对方索取逐项扣款明细及对应凭证。',
    },
    {
      evidenceId: 'checkin_condition',
      title: '入住照片/交接记录',
      status: 'missing',
      priority: 'essential',
      reason: '证明原有状态',
      preparationTip: '整理入住时拍摄的照片、视频或交接单。',
    },
  ],
  communication: {
    text: [
      '【示例协商文本】您好，关于退租押金扣除事宜，我想与您核对以下情况：',
      '1. 我已于交接时完成房屋及钥匙移交；',
      '2. 您提出扣除 1200 元（墙面粉刷、清洁费），目前我尚未收到逐项明细与凭证；',
      '3. 希望能提供扣款项目、计算标准及对应票据，以便我核对。',
      '如双方对扣除有分歧，也希望协商一个都能接受的处理方式。谢谢。',
    ].join('\n'),
    placeholders: ['[请补充：合同约定的退还期限]'],
    warnings: ['发送前请核对金额、日期与称呼，替换全部占位符。'],
  },
  nextSteps: [
    {
      stepId: 'step-negotiation',
      channelId: 'syn-ch-negotiation',
      eligibility: 'eligible',
      title: '与房东书面协商并索取扣款凭证',
      why: '协商是成本最低的先行步骤，且可固定对方主张与证据。',
      preparations: ['整理合同、支付记录、交接记录', '列出要求对方提供的扣款明细与凭证'],
      contact: { officialUrl: null, phone: null },
      sourceRefs: [],
      after: {
        resolved: '若对方提供合理凭证并达成一致，保留书面和解记录。',
        unresolvedStepIds: ['step-mediation'],
        pending: '若对方拒绝提供明细或协商无果，考虑下一步渠道。',
      },
    },
  ],
  conditionalOptions: [
    {
      stepId: 'step-mediation',
      channelId: 'syn-ch-mediation',
      eligibility: 'needs_check',
      title: '申请人民调解（需双方同意）',
      why: '协商无果时，调解是相对低成本的第三方介入方式。',
      preparations: ['确认双方是否同意调解', '准备证据清单与事实经过'],
      contact: { officialUrl: null, phone: null },
      sourceRefs: [],
      after: {
        resolved: '达成调解协议后保留书面文件。',
        unresolvedStepIds: [],
        pending: '若调解不成，可评估其他途径。',
      },
    },
  ],
  excludedOptions: [
    { channelId: 'syn-ch-enterprise', channelName: '企业/平台投诉渠道', reason: '对方为个人房东，非经营性主体，企业投诉渠道通常不适用。' },
  ],
  references: [],
};
