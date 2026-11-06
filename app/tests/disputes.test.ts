import { describe, it, expect } from 'vitest';
import { diagnoseDispute } from '../functions/domain/disputes/index.ts';
import { loadKnowledgeSnapshot } from '../functions/data/knowledge-snapshot.ts';
import { syntheticBundle, SYN_CITY } from './fixtures/synthetic-bundle.ts';
import type { DisputeInput } from '../functions/shared/dispute.ts';

function baseInput(overrides: Partial<DisputeInput> = {}): DisputeInput {
  return {
    cityCode: SYN_CITY,
    eventDate: '2026-10-01',
    scenario: 'deposit_not_returned',
    counterpartyType: 'agency',
    depositAmountCents: 300000,
    disputedAmountCents: null,
    tenancyEnded: 'yes',
    handoverStatus: 'completed',
    returnDueStatus: 'due',
    deductionReason: '',
    evidence: [
      { evidenceId: 'lease_contract', status: 'available' },
      { evidenceId: 'deposit_payment', status: 'available' },
      { evidenceId: 'checkout_handover', status: 'available' },
      { evidenceId: 'communications', status: 'available' },
    ],
    priorActions: [],
    goal: 'return_deposit',
    narrative: '退租后中介未退押金。',
    ...overrides,
  };
}

describe('diagnoseDispute - 未支持城市降级', () => {
  it('生产快照城市未核验时返回 unsupported 且无当地渠道', () => {
    const result = diagnoseDispute(baseInput({ cityCode: '410100' }), loadKnowledgeSnapshot());
    expect(result.coverage).toBe('unsupported');
    expect(result.plan.nextSteps).toHaveLength(0);
    expect(result.plan.conditionalOptions).toHaveLength(0);
    expect(result.plan.references).toHaveLength(0);
    expect(result.plan.evidenceChecklist.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('尚未完成资料核验'))).toBe(true);
  });

  it('unsupported 时仍生成事实摘要与协商模板', () => {
    const result = diagnoseDispute(baseInput({ cityCode: '410100' }), loadKnowledgeSnapshot());
    expect(result.plan.factsSummary.length).toBeGreaterThan(0);
    expect(result.plan.communication.text.length).toBeGreaterThan(0);
  });
});

describe('diagnoseDispute - 渠道资格 (D01/D02)', () => {
  it('D01 个人房东：消费者渠道列为待核实，企业渠道不适用', () => {
    const result = diagnoseDispute(baseInput({ counterpartyType: 'individual_landlord' }), syntheticBundle());
    const consumer = result.plan.conditionalOptions.find((s) => s.channelId === 'syn-ch-consumer');
    expect(consumer).toBeDefined();
    expect(consumer?.eligibility).toBe('needs_check');
    const enterpriseExcluded = result.plan.excludedOptions.find((x) => x.channelId === 'syn-ch-enterprise');
    expect(enterpriseExcluded).toBeDefined();
  });

  it('D02 经营性中介：企业渠道可执行', () => {
    const result = diagnoseDispute(baseInput({ counterpartyType: 'agency' }), syntheticBundle());
    const enterprise = result.plan.nextSteps.find((s) => s.channelId === 'syn-ch-enterprise');
    expect(enterprise).toBeDefined();
    expect(enterprise?.eligibility).toBe('eligible');
  });

  it('对方身份未知时，限定主体的渠道列入待核实', () => {
    const result = diagnoseDispute(baseInput({ counterpartyType: 'unknown' }), syntheticBundle());
    const enterprise = result.plan.conditionalOptions.find((s) => s.channelId === 'syn-ch-enterprise');
    expect(enterprise?.eligibility).toBe('needs_check');
  });

  it('法律援助始终为待核实，不承诺免费代理 (D05)', () => {
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    const aid = result.plan.conditionalOptions.find((s) => s.channelId === 'syn-ch-legal-aid');
    expect(aid).toBeDefined();
    expect(aid?.eligibility).toBe('needs_check');
    expect(aid?.why).toContain('资格需核实');
    expect(result.plan.nextSteps.find((s) => s.channelId === 'syn-ch-legal-aid')).toBeUndefined();
  });
});

describe('diagnoseDispute - 证据与缺项 (D04)', () => {
  it('缺失必需证据使渠道转为待核实', () => {
    const result = diagnoseDispute(
      baseInput({
        counterpartyType: 'agency',
        evidence: [
          { evidenceId: 'lease_contract', status: 'missing' },
          { evidenceId: 'communications', status: 'available' },
        ],
      }),
      syntheticBundle(),
    );
    const enterprise = result.plan.conditionalOptions.find((s) => s.channelId === 'syn-ch-enterprise');
    expect(enterprise?.eligibility).toBe('needs_check');
    expect(enterprise?.why).toContain('需补充材料');
  });

  it('unknown 与 missing 状态区分处理', () => {
    const result = diagnoseDispute(
      baseInput({
        evidence: [{ evidenceId: 'lease_contract', status: 'unknown' }],
      }),
      syntheticBundle(),
    );
    const item = result.plan.evidenceChecklist.find((e) => e.evidenceId === 'lease_contract');
    expect(item?.status).toBe('unknown');
  });

  it('扣款纠纷缺少明细时产生补问', () => {
    const result = diagnoseDispute(
      baseInput({
        scenario: 'deposit_deducted',
        disputedAmountCents: 100000,
        evidence: [{ evidenceId: 'deduction_detail', status: 'missing' }],
      }),
      syntheticBundle(),
    );
    expect(result.plan.missingFacts.some((m) => m.field === 'deduction_detail')).toBe(true);
  });
});

describe('diagnoseDispute - 缺项问答', () => {
  it('对方身份未知触发补问', () => {
    const result = diagnoseDispute(baseInput({ counterpartyType: 'unknown' }), syntheticBundle());
    expect(result.plan.missingFacts.some((m) => m.field === 'counterpartyType')).toBe(true);
  });

  it('事件日期为空触发补问并标记 limited', () => {
    const result = diagnoseDispute(baseInput({ eventDate: null }), syntheticBundle());
    expect(result.plan.missingFacts.some((m) => m.field === 'eventDate')).toBe(true);
    expect(result.coverage).toBe('limited');
  });

  it('争议额超过押金时提示拆分', () => {
    const result = diagnoseDispute(
      baseInput({ depositAmountCents: 100000, disputedAmountCents: 200000, scenario: 'deposit_deducted' }),
      syntheticBundle(),
    );
    expect(result.plan.missingFacts.some((m) => m.field === 'disputedAmountCents')).toBe(true);
  });
});

describe('diagnoseDispute - 路径顺序与分支 (D03)', () => {
  it('nextSteps 不超过 3 项且按 orderGroup 升序', () => {
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    expect(result.plan.nextSteps.length).toBeLessThanOrEqual(3);
    const groups = result.plan.nextSteps.map((s) => s.channelId);
    expect(groups[0]).toBe('syn-ch-negotiation');
  });

  it('已协商无果时协商不再固定排第一', () => {
    const result = diagnoseDispute(
      baseInput({ priorActions: [{ type: 'negotiation', outcome: 'unresolved' }] }),
      syntheticBundle(),
    );
    const order = result.plan.nextSteps.map((s) => s.channelId);
    expect(order[0]).not.toBe('syn-ch-negotiation');
  });

  it('unresolvedStepIds 均指向本响应中存在的步骤，无悬空', () => {
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    const allIds = new Set([
      ...result.plan.nextSteps.map((s) => s.stepId),
      ...result.plan.conditionalOptions.map((s) => s.stepId),
    ]);
    for (const step of [...result.plan.nextSteps, ...result.plan.conditionalOptions]) {
      for (const id of step.after.unresolvedStepIds) {
        expect(allIds.has(id)).toBe(true);
      }
    }
  });

  it('references 中的来源均被步骤引用且来自筛选结果', () => {
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    for (const ref of result.plan.references) {
      expect(ref.id).toBe('syn-source-deposit');
    }
  });
});

describe('diagnoseDispute - 协商模板', () => {
  it('未知值保留占位符', () => {
    const result = diagnoseDispute(
      baseInput({ counterpartyType: 'unknown', depositAmountCents: null }),
      syntheticBundle(),
    );
    expect(result.plan.communication.placeholders).toContain('[请补充对方身份]');
    expect(result.plan.communication.placeholders).toContain('[请补充押金金额]');
  });

  it('扣款纠纷模板索取明细凭证', () => {
    const result = diagnoseDispute(
      baseInput({ scenario: 'deposit_deducted', disputedAmountCents: 50000, deductionReason: '墙面损坏' }),
      syntheticBundle(),
    );
    expect(result.plan.communication.text).toContain('逐项扣款明细');
    expect(result.plan.communication.text).toContain('墙面损坏');
  });

  it('模板不虚构法定期限或违法结论', () => {
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    expect(result.plan.communication.text).not.toContain('违法');
    expect(result.plan.communication.text).not.toContain('诉讼时效');
  });
});

describe('diagnoseDispute - 输出结构校验', () => {
  it('plan 通过 isDisputePlan 守卫', async () => {
    const { isDisputePlan } = await import('../functions/shared/dispute.ts');
    const result = diagnoseDispute(baseInput(), syntheticBundle());
    expect(isDisputePlan(result.plan)).toBe(true);
  });
});
