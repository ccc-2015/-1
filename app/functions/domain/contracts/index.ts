// 合同检查编排（doc 02 §1.4）。
// 确定性规则为主干，模型输出经定位/引用校验后增强；模型不可用时降级为
// processingMode=rules、coverage=limited，绝不伪造「AI 分析成功」。

import type { Coverage, ProcessingMode } from '../../shared/envelope.ts';
import type { ErrorCode } from '../../shared/errors.ts';
import type {
  AnalyzeContractInput,
  ContractAnalysis,
  ContractFinding,
  ContractEvidenceChecklistItem,
} from '../../shared/contract.ts';
import type { SourceRecordPublic } from '../../shared/sources.ts';
import type { KnowledgeBundle } from '../knowledge/types.ts';
import { toPublicSource } from '../knowledge/types.ts';
import { isCitySupported, selectSources, buildAllowedRefSet } from '../knowledge/select.ts';
import type { LLMProvider, ExtractRequest } from '../../integrations/llm.ts';
import { extractCandidates, candidateParagraphs } from './candidates.ts';
import { buildRuleFindings } from './rules.ts';
import { validateModelFindings, type AllowedRefs, type ValidatedModelFinding } from './validate.ts';
import { EVIDENCE_CATALOG } from '../disputes/evidence.ts';

export const MAX_CONTRACT_TEXT_CODE_UNITS = 30000;
const CONTRACT_SCENARIO = 'deposit';

export type AnalyzeContractResult = {
  analysis: ContractAnalysis;
  coverage: Coverage;
  processingMode: ProcessingMode;
  warnings: string[];
  knowledgeVersion: string;
};

export function checkContractInput(
  input: AnalyzeContractInput,
): { code: ErrorCode; message: string } | null {
  if (input.text.trim().length === 0) {
    return { code: 'invalid_input', message: '合同文本不能为空。' };
  }
  if (input.text.length > MAX_CONTRACT_TEXT_CODE_UNITS) {
    return {
      code: 'payload_too_large',
      message: `合同文本超过 ${MAX_CONTRACT_TEXT_CODE_UNITS} 个字符上限，请粘贴相关页或片段。`,
    };
  }
  const scopes = input.analysisScopes ?? ['deposit'];
  if (scopes.length === 0 || !scopes.every((s) => s === 'deposit')) {
    return {
      code: 'invalid_input',
      message: '一期仅支持押金（deposit）检查范围，其他范围尚未开放。',
    };
  }
  return null;
}

function contractEvidenceChecklist(): ContractEvidenceChecklistItem[] {
  const ids = ['lease_contract', 'deposit_payment', 'return_agreement', 'communications'];
  return ids
    .map((id) => EVIDENCE_CATALOG.find((e) => e.evidenceId === id))
    .filter((x): x is NonNullable<typeof x> => x !== undefined)
    .map((item) => ({
      evidenceId: item.evidenceId,
      title: item.title,
      reason: item.baseReason,
    }));
}

function mergeModelIntoRules(
  ruleFindings: ContractFinding[],
  modelFindings: ValidatedModelFinding[],
): void {
  for (const mf of modelFindings) {
    if (!mf.hasOriginalSupport) continue; // 无原文支撑，不得新增检查项（doc 02 §1.4 步骤 7）
    const rf = ruleFindings.find((f) => f.category === mf.category);
    if (!rf) continue;

    for (const ex of mf.excerpts) {
      if (!rf.excerpts.some((e) => e.start === ex.start)) rf.excerpts.push(ex);
    }
    if (rf.checkStatus === 'not_found' && mf.excerpts.length > 0) {
      rf.checkStatus = mf.checkStatus;
    }
    for (const q of mf.suggestedQuestions) {
      if (!rf.suggestedQuestions.includes(q)) rf.suggestedQuestions.push(q);
    }
    if (rf.negotiationSuggestion === null && mf.negotiationSuggestion !== null) {
      rf.negotiationSuggestion = mf.negotiationSuggestion;
    }
  }
}

function computeSummary(findings: ContractFinding[]): { needsAttention: number; needsConfirmation: number } {
  let needsAttention = 0;
  let needsConfirmation = 0;
  for (const f of findings) {
    if (
      f.priority === 'high' ||
      f.legalAssessment === 'potential_legal_issue' ||
      f.legalAssessment === 'unfavorable_term'
    ) {
      needsAttention++;
    }
    if (f.checkStatus === 'ambiguous' || f.checkStatus === 'needs_verification') {
      needsConfirmation++;
    }
  }
  return { needsAttention, needsConfirmation };
}

export async function analyzeContract(
  input: AnalyzeContractInput,
  bundle: KnowledgeBundle,
  provider: LLMProvider,
): Promise<AnalyzeContractResult> {
  const segments = extractCandidates(input.text);
  const ruleResult = buildRuleFindings(segments);
  const findings = ruleResult.findings;

  const citySupported = isCitySupported(bundle, input.cityCode);
  const selections = citySupported
    ? selectSources(bundle, {
        cityCode: input.cityCode,
        scenario: CONTRACT_SCENARIO,
        eventDate: input.eventDate,
      })
    : [];
  const allowed: AllowedRefs = {
    sourceIds: new Set(selections.map((s) => s.source.id)),
    refKeys: buildAllowedRefSet(selections),
  };

  const warnings: string[] = [];
  let processingMode: ProcessingMode = 'rules';
  let aiOk = false;

  if (provider.available) {
    const req: ExtractRequest = {
      cityCode: input.cityCode,
      eventDate: input.eventDate,
      text: input.text,
      textScope: input.textScope,
      candidateParagraphs: candidateParagraphs(segments),
    };
    const result = await provider.extractContract(req);
    if (result.ok) {
      aiOk = true;
      processingMode = 'rules_and_ai';
      const validation = validateModelFindings(result.extraction.findings, input.text, allowed);
      mergeModelIntoRules(findings, validation.findings);
      warnings.push(...validation.warnings);

      // 模型可在规则未提取到事实时补充（仍以原文定位为前提）。
      for (const mf of validation.findings) {
        if (!mf.hasOriginalSupport) continue;
        if (mf.category === 'deposit_amount' && ruleResult.depositAmountCents === null && mf.depositAmountCents !== null) {
          ruleResult.depositAmountCents = mf.depositAmountCents;
        }
        if (mf.category === 'deposit_return' && ruleResult.returnTimingText === null && mf.returnTimingText !== null) {
          ruleResult.returnTimingText = mf.returnTimingText;
        }
      }
    } else {
      warnings.push('主模型不可用，仅返回已独立验证的字面规则结果，语义审查未完成。');
    }
  } else {
    warnings.push('未配置可用的模型服务，仅返回字面规则结果，语义审查未完成。');
  }

  if (!citySupported) {
    warnings.push('当前城市尚未完成资料核验，未提供当地特定法规引用或法律结论。');
  }
  if (bundle.synthetic) {
    warnings.push('当前使用合成资料快照，非真实已核验法规。');
  }
  if (input.eventDate === null) {
    warnings.push('签约/事件日期未知，时间适用性判断为条件性结果，请补充后复核。');
  }
  if (input.textScope === 'excerpt') {
    warnings.push('所提供为合同片段，未识别到不代表整份合同没有相关条款。');
  }

  const referencedIds = new Set<string>();
  for (const f of findings) for (const ref of f.sourceRefs) referencedIds.add(ref.sourceId);
  const references: SourceRecordPublic[] = selections
    .filter((s) => referencedIds.has(s.source.id))
    .map((s) => toPublicSource(s.source));

  let coverage: Coverage;
  if (!citySupported) coverage = 'unsupported';
  else if (!aiOk || bundle.synthetic) coverage = 'limited';
  else coverage = 'supported';

  const analysis: ContractAnalysis = {
    findings,
    summary: computeSummary(findings),
    extractedFacts: {
      depositAmountCents: ruleResult.depositAmountCents,
      returnTimingText: ruleResult.returnTimingText,
      deductionItems: ruleResult.deductionItems,
    },
    evidenceChecklist: contractEvidenceChecklist(),
    references,
  };

  return {
    analysis,
    coverage,
    processingMode,
    warnings,
    knowledgeVersion: bundle.version,
  };
}
