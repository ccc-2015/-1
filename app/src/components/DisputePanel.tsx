// 纠纷处理入口（doc 04 §1.1/§1.3/§1.5/§1.6/§1.7）。
// 表单 → 生成方案 → 结果（先显示待确认事实，再显示可执行步骤；待核实渠道单独展示）。
// 金额输入元、提交严格解析为整数分；叙述/扣款理由有字符上限；结果仅存内存。

import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { CheckIcon, TriangleAlertIcon } from 'lucide-react';
import { diagnoseDispute, isApiError } from '../api/client';
import type { PublicConfig } from '@shared/config.ts';
import type {
  DisputeInput,
  DisputePlan,
  EvidenceEntry,
  EvidenceStatus,
  PriorAction,
  PriorActionOutcome,
  PathStep,
} from '@shared/dispute.ts';
import { DEDUCTION_REASON_MAX, NARRATIVE_MAX } from '@shared/dispute.ts';
import type { SourceRecordPublic } from '@shared/sources.ts';
import { type RequestState, phaseFromMeta, toApiError } from '../lib/request';
import { yuanToCents, centsToYuan, utf16Length, isValidDateOrEmpty } from '../lib/format';
import {
  EVIDENCE_OPTIONS,
  SCENARIO_LABEL,
  COUNTERPARTY_LABEL,
  TENANCY_LABEL,
  HANDOVER_LABEL,
  RETURN_DUE_LABEL,
  GOAL_LABEL,
  EVIDENCE_STATUS_LABEL,
  PRIOR_ACTION_OPTIONS,
  PRIOR_OUTCOME_LABEL,
  PRIORITY_LABEL,
} from '../lib/dispute-options';
import { EXAMPLE_DISPUTE_INPUT, EXAMPLE_DISPUTE_FIXTURE, PILOT_CITY_CODE, PILOT_CITY_NAME } from '../lib/examples';
import { StatusBanner } from './StatusBanner';

type Props = {
  config: PublicConfig | null;
  onOpenSource: (source: SourceRecordPublic) => void;
};

type FormState = {
  cityCode: string;
  dateUnknown: boolean;
  eventDate: string;
  scenario: DisputeInput['scenario'];
  counterpartyType: DisputeInput['counterpartyType'];
  depositYuan: string;
  disputedYuan: string;
  tenancyEnded: DisputeInput['tenancyEnded'];
  handoverStatus: DisputeInput['handoverStatus'];
  returnDueStatus: DisputeInput['returnDueStatus'];
  deductionReason: string;
  evidence: Record<string, EvidenceStatus>;
  priorOutcomes: Record<string, PriorActionOutcome>;
  goal: DisputeInput['goal'];
  narrative: string;
};

function initialEvidence(): Record<string, EvidenceStatus> {
  const m: Record<string, EvidenceStatus> = {};
  for (const e of EVIDENCE_OPTIONS) m[e.id] = 'unknown';
  return m;
}

function initialPriorOutcomes(): Record<string, PriorActionOutcome> {
  const m: Record<string, PriorActionOutcome> = {};
  for (const p of PRIOR_ACTION_OPTIONS) m[p.type] = 'not_started';
  return m;
}

const INITIAL_FORM: FormState = {
  cityCode: PILOT_CITY_CODE,
  dateUnknown: false,
  eventDate: '',
  scenario: 'deposit_deducted',
  counterpartyType: 'individual_landlord',
  depositYuan: '',
  disputedYuan: '',
  tenancyEnded: 'unknown',
  handoverStatus: 'unknown',
  returnDueStatus: 'unclear',
  deductionReason: '',
  evidence: initialEvidence(),
  priorOutcomes: initialPriorOutcomes(),
  goal: 'explain_deduction',
  narrative: '',
};

function amountError(value: string): string | undefined {
  const parsed = yuanToCents(value);
  return parsed.ok ? undefined : parsed.error;
}

function formToInput(form: FormState): { input?: DisputeInput; errors: string[] } {
  const errors: string[] = [];
  const deposit = yuanToCents(form.depositYuan);
  if (!deposit.ok) errors.push(`押金金额：${deposit.error}`);
  const disputed = yuanToCents(form.disputedYuan);
  if (!disputed.ok) errors.push(`争议金额：${disputed.error}`);
  if (form.cityCode.trim().length === 0) errors.push('请选择城市。');
  if (!form.dateUnknown && form.eventDate !== '' && !isValidDateOrEmpty(form.eventDate)) {
    errors.push('日期格式不正确，或勾选「日期未知」。');
  }
  if (utf16Length(form.deductionReason) > DEDUCTION_REASON_MAX) {
    errors.push(`扣款理由超过 ${DEDUCTION_REASON_MAX} 字符。`);
  }
  if (utf16Length(form.narrative) > NARRATIVE_MAX) {
    errors.push(`经过叙述超过 ${NARRATIVE_MAX} 字符。`);
  }
  if (errors.length > 0) return { errors };

  const evidence: EvidenceEntry[] = EVIDENCE_OPTIONS.map((e) => ({
    evidenceId: e.id,
    status: form.evidence[e.id] ?? 'unknown',
  }));
  const priorActions: PriorAction[] = PRIOR_ACTION_OPTIONS.filter(
    (p) => (form.priorOutcomes[p.type] ?? 'not_started') !== 'not_started',
  ).map((p) => ({ type: p.type as PriorAction['type'], outcome: form.priorOutcomes[p.type]! }));

  return {
    errors,
    input: {
      cityCode: form.cityCode,
      eventDate: form.dateUnknown || form.eventDate === '' ? null : form.eventDate,
      scenario: form.scenario,
      counterpartyType: form.counterpartyType,
      depositAmountCents: deposit.ok ? deposit.cents : null,
      disputedAmountCents: disputed.ok ? disputed.cents : null,
      tenancyEnded: form.tenancyEnded,
      handoverStatus: form.handoverStatus,
      returnDueStatus: form.returnDueStatus,
      deductionReason: form.deductionReason,
      evidence,
      priorActions,
      goal: form.goal,
      narrative: form.narrative,
    },
  };
}

export function DisputePanel({ config, onOpenSource }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [state, setState] = useState<RequestState<DisputePlan>>({ phase: 'idle' });
  const [commText, setCommText] = useState('');
  const [copied, setCopied] = useState(false);

  const reqIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const cityOptions = useMemo(() => {
    const opts = [{ code: PILOT_CITY_CODE, name: `${PILOT_CITY_NAME}（试点·资料核验中）` }];
    for (const c of config?.supportedCities ?? []) {
      if (!opts.some((o) => o.code === c.cityCode)) opts.push({ code: c.cityCode, name: c.name });
    }
    return opts;
  }, [config]);

  function update(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setState((prev) =>
      prev.phase === 'success' || prev.phase === 'partial' ? { ...prev, stale: true } : prev,
    );
  }

  function fillExample() {
    if (form.narrative.trim().length > 0 && !window.confirm('填入示例将覆盖当前纠纷信息，是否继续？')) return;
    const ex = EXAMPLE_DISPUTE_INPUT;
    const ev = initialEvidence();
    for (const e of ex.evidence) ev[e.evidenceId] = e.status;
    const po = initialPriorOutcomes();
    for (const p of ex.priorActions) po[p.type] = p.outcome;
    setForm({
      cityCode: ex.cityCode,
      dateUnknown: ex.eventDate === null,
      eventDate: ex.eventDate ?? '',
      scenario: ex.scenario,
      counterpartyType: ex.counterpartyType,
      depositYuan: ex.depositAmountCents === null ? '' : (ex.depositAmountCents / 100).toString(),
      disputedYuan: ex.disputedAmountCents === null ? '' : (ex.disputedAmountCents / 100).toString(),
      tenancyEnded: ex.tenancyEnded,
      handoverStatus: ex.handoverStatus,
      returnDueStatus: ex.returnDueStatus,
      deductionReason: ex.deductionReason,
      evidence: ev,
      priorOutcomes: po,
      goal: ex.goal,
      narrative: ex.narrative,
    });
    setState({ phase: 'idle' });
    toast.info('已填入合成示例纠纷信息，点击「生成方案」走真实接口。');
  }

  function viewExampleResult() {
    reqIdRef.current++;
    controllerRef.current?.abort();
    setState({
      phase: 'partial',
      data: EXAMPLE_DISPUTE_FIXTURE,
      meta: {
        apiVersion: '1',
        requestId: 'example-fixture',
        generatedAt: new Date().toISOString(),
        knowledgeVersion: 'example-fixture',
        processingMode: 'rules',
        coverage: 'limited',
        warnings: ['此为固定展示夹具，不代表本次真实分析结果。'],
      },
      stale: false,
      example: true,
    });
    setCommText(EXAMPLE_DISPUTE_FIXTURE.communication.text);
    setCopied(false);
  }

  function reset() {
    if (form.narrative.trim().length > 0 && !window.confirm('重置将清空当前输入与结果，是否继续？')) return;
    reqIdRef.current++;
    controllerRef.current?.abort();
    setForm(INITIAL_FORM);
    setState({ phase: 'idle' });
    setCommText('');
  }

  async function submit() {
    setState({ phase: 'validating' });
    const { input, errors } = formToInput(form);
    if (errors.length > 0 || !input) {
      setState({ phase: 'idle' });
      toast.error(errors[0] ?? '表单未通过校验。');
      return;
    }

    const id = ++reqIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState({ phase: 'submitting' });
    try {
      const result = await diagnoseDispute(input, controller.signal);
      if (id !== reqIdRef.current) return;
      setState({
        phase: phaseFromMeta(result.meta),
        data: result.data,
        meta: result.meta,
        stale: false,
        example: false,
      });
      setCommText(result.data.communication.text);
      setCopied(false);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      if ((err as Error)?.name === 'AbortError') return;
      setState({ phase: 'error', error: isApiError(err) ? err : toApiError(err) });
    }
  }

  const busy = state.phase === 'validating' || state.phase === 'submitting';
  const plan = state.phase === 'success' || state.phase === 'partial' ? state.data : null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>押金纠纷行动方案</CardTitle>
          <CardDescription>
            填写纠纷事实与证据状态，获得待确认事实、证据缺项、协商文本与符合条件的下一步。本工具提供法律信息参考，不替代律师意见、不保证结果。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            noValidate
          >
            <FieldSet>
              <FieldLegend>纠纷基本情况</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel>纠纷类型</FieldLabel>
                  <RadioGroup
                    value={form.scenario}
                    onValueChange={(v) => update({ scenario: v as DisputeInput['scenario'] })}
                    className="flex gap-4"
                    disabled={busy}
                  >
                    {Object.entries(SCENARIO_LABEL).map(([value, label]) => (
                      <div key={value} className="flex items-center gap-1.5">
                        <RadioGroupItem value={value} id={`sc-${value}`} />
                        <Label htmlFor={`sc-${value}`} className="text-sm font-normal">{label}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-city">城市</FieldLabel>
                  <Select value={form.cityCode} onValueChange={(v) => update({ cityCode: v })} disabled={busy}>
                    <SelectTrigger id="d-city" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cityOptions.map((o) => (
                        <SelectItem key={o.code} value={o.code}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-date">事件日期（退租/扣款发生日）</FieldLabel>
                  <Input
                    id="d-date"
                    type="date"
                    value={form.eventDate}
                    disabled={busy || form.dateUnknown}
                    onChange={(e) => update({ eventDate: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="d-date-unknown"
                      checked={form.dateUnknown}
                      disabled={busy}
                      onCheckedChange={(c) => update({ dateUnknown: c === true })}
                    />
                    <Label htmlFor="d-date-unknown" className="text-sm font-normal">日期未知</Label>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-counterparty">对方身份</FieldLabel>
                  <Select
                    value={form.counterpartyType}
                    onValueChange={(v) => update({ counterpartyType: v as DisputeInput['counterpartyType'] })}
                    disabled={busy}
                  >
                    <SelectTrigger id="d-counterparty" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUNTERPARTY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-deposit">押金金额（元）</FieldLabel>
                  <Input
                    id="d-deposit"
                    inputMode="decimal"
                    value={form.depositYuan}
                    disabled={busy}
                    onChange={(e) => update({ depositYuan: e.target.value })}
                    placeholder="留空表示未知"
                  />
                  <FieldError>{amountError(form.depositYuan)}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-disputed">争议金额（元）</FieldLabel>
                  <Input
                    id="d-disputed"
                    inputMode="decimal"
                    value={form.disputedYuan}
                    disabled={busy}
                    onChange={(e) => update({ disputedYuan: e.target.value })}
                    placeholder="留空表示未知"
                  />
                  <FieldError>{amountError(form.disputedYuan)}</FieldError>
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>退租与交接</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="d-tenancy">是否已退租</FieldLabel>
                  <Select value={form.tenancyEnded} onValueChange={(v) => update({ tenancyEnded: v as DisputeInput['tenancyEnded'] })} disabled={busy}>
                    <SelectTrigger id="d-tenancy" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TENANCY_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-handover">交接状态</FieldLabel>
                  <Select value={form.handoverStatus} onValueChange={(v) => update({ handoverStatus: v as DisputeInput['handoverStatus'] })} disabled={busy}>
                    <SelectTrigger id="d-handover" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(HANDOVER_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-due">退还期限</FieldLabel>
                  <Select value={form.returnDueStatus} onValueChange={(v) => update({ returnDueStatus: v as DisputeInput['returnDueStatus'] })} disabled={busy}>
                    <SelectTrigger id="d-due" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(RETURN_DUE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>证据状态</FieldLegend>
              <FieldDescription className="mb-2">每项默认「不确定」，请按实际情况选择。</FieldDescription>
              <div className="grid gap-3 sm:grid-cols-2">
                {EVIDENCE_OPTIONS.map((e) => (
                  <Field key={e.id} orientation="horizontal" className="items-center justify-between gap-3">
                    <FieldLabel htmlFor={`ev-${e.id}`} className="text-sm font-normal">{e.title}</FieldLabel>
                    <Select
                      value={form.evidence[e.id] ?? 'unknown'}
                      onValueChange={(v) => update({ evidence: { ...form.evidence, [e.id]: v as EvidenceStatus } })}
                      disabled={busy}
                    >
                      <SelectTrigger id={`ev-${e.id}`} size="sm" className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(EVIDENCE_STATUS_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>已采取的行动</FieldLegend>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRIOR_ACTION_OPTIONS.map((p) => (
                  <Field key={p.type} orientation="horizontal" className="items-center justify-between gap-3">
                    <FieldLabel htmlFor={`pa-${p.type}`} className="text-sm font-normal">{p.label}</FieldLabel>
                    <Select
                      value={form.priorOutcomes[p.type] ?? 'not_started'}
                      onValueChange={(v) => update({ priorOutcomes: { ...form.priorOutcomes, [p.type]: v as PriorActionOutcome } })}
                      disabled={busy}
                    >
                      <SelectTrigger id={`pa-${p.type}`} size="sm" className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PRIOR_OUTCOME_LABEL).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>补充信息</FieldLegend>
              <Field>
                <FieldLabel htmlFor="d-goal">你的目标</FieldLabel>
                <Select value={form.goal} onValueChange={(v) => update({ goal: v as DisputeInput['goal'] })} disabled={busy}>
                  <SelectTrigger id="d-goal" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(GOAL_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="d-reason">对方提出的扣款理由</FieldLabel>
                <Textarea
                  id="d-reason"
                  value={form.deductionReason}
                  disabled={busy}
                  onChange={(e) => update({ deductionReason: e.target.value })}
                  className="min-h-20 text-sm"
                />
                <span className="text-xs text-muted-foreground">{utf16Length(form.deductionReason)} / {DEDUCTION_REASON_MAX}</span>
              </Field>
              <Field>
                <FieldLabel htmlFor="d-narrative">经过叙述（可选）</FieldLabel>
                <Textarea
                  id="d-narrative"
                  value={form.narrative}
                  disabled={busy}
                  onChange={(e) => update({ narrative: e.target.value })}
                  className="min-h-24 text-sm"
                />
                <span className="text-xs text-muted-foreground">{utf16Length(form.narrative)} / {NARRATIVE_MAX}</span>
              </Field>
            </FieldSet>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>{busy ? '生成中…' : '生成方案'}</Button>
              <Button type="button" variant="outline" onClick={fillExample} disabled={busy}>填入示例</Button>
              <Button type="button" variant="outline" onClick={viewExampleResult} disabled={busy}>查看示例结果</Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>重置</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <StatusBanner state={state} />

      {plan && (
        <DisputeResult
          plan={plan}
          commText={commText}
          onCommChange={(t) => {
            setCommText(t);
            setCopied(false);
          }}
          copied={copied}
          onCopy={async () => {
            const placeholders = plan.communication.placeholders;
            const hasUnfilled = placeholders.some((p) => commText.includes(p)) || commText.includes('[请补充');
            if (hasUnfilled) {
              toast.warning('文本中仍有未填写的占位符，请先核对补全再发送。');
            }
            try {
              await navigator.clipboard.writeText(commText);
              setCopied(true);
              toast.success('协商文本已复制，发送前请再次核对。');
              setTimeout(() => setCopied(false), 2000);
            } catch {
              toast.error('复制失败，请手动选择文本复制。');
            }
          }}
          onOpenSource={onOpenSource}
        />
      )}
    </div>
  );
}

type ResultProps = {
  plan: DisputePlan;
  commText: string;
  onCommChange: (text: string) => void;
  copied: boolean;
  onCopy: () => void;
  onOpenSource: (source: SourceRecordPublic) => void;
};

function DisputeResult({ plan, commText, onCommChange, copied, onCopy, onOpenSource }: ResultProps) {
  const refById = useMemo(() => {
    const m = new Map<string, SourceRecordPublic>();
    for (const r of plan.references) m.set(r.id, r);
    return m;
  }, [plan.references]);

  const stepTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of [...plan.nextSteps, ...plan.conditionalOptions]) m.set(s.stepId, s.title);
    return m;
  }, [plan.nextSteps, plan.conditionalOptions]);

  return (
    <div className="flex flex-col gap-6">
      {plan.missingFacts.length > 0 && (
        <Card className="border-amber-400/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TriangleAlertIcon className="size-4 text-amber-500" aria-hidden />
              仍需确认的事实
            </CardTitle>
            <CardDescription>以下信息缺失会影响判断，建议先补充核实。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {plan.missingFacts.map((m, i) => (
                <li key={i} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{m.question}</p>
                  <p className="text-muted-foreground">{m.reason}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">事实摘要（基于你的陈述）</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            {plan.factsSummary.map((f, i) => (
              <div key={i} className="rounded-md border p-3">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="font-medium">{f.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">证据清单</CardTitle>
          <CardDescription>仅为清单提示，不代表证据已安全备份。</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {plan.evidenceChecklist.map((e) => (
              <li key={e.evidenceId} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline">{PRIORITY_LABEL[e.priority] ?? e.priority}</Badge>
                    <Badge variant={e.status === 'missing' ? 'destructive' : 'secondary'}>
                      {EVIDENCE_STATUS_LABEL[e.status] ?? e.status}
                    </Badge>
                  </div>
                </div>
                <span className="text-muted-foreground">{e.reason}</span>
                <span className="text-xs text-muted-foreground">准备建议：{e.preparationTip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">协商文本（可编辑）</CardTitle>
          <CardDescription>
            占位符需补全；发送前请核对金额、日期与称呼。一般协商建议，非法律意见。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {plan.communication.warnings.length > 0 && (
            <ul className="ml-4 list-disc text-xs text-amber-600">
              {plan.communication.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <Textarea value={commText} onChange={(e) => onCommChange(e.target.value)} className="min-h-40 text-sm leading-relaxed" />
          {plan.communication.placeholders.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.communication.placeholders.map((p, i) => (
                <Badge key={i} variant="outline" className="text-xs text-amber-600">待补全：{p}</Badge>
              ))}
            </div>
          )}
          <Button type="button" size="sm" variant="outline" className="w-fit" onClick={onCopy}>
            {copied ? <CheckIcon className="size-4" aria-hidden /> : null}
            {copied ? '已复制' : '复制文本'}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <StepsColumn title="当前可执行步骤" steps={plan.nextSteps} refById={refById} stepTitleById={stepTitleById} onOpenSource={onOpenSource} empty="当前没有立即可执行的步骤，请先核实待确认渠道的资格条件。" />
        <StepsColumn title="待核实渠道（条件性）" steps={plan.conditionalOptions} refById={refById} stepTitleById={stepTitleById} onOpenSource={onOpenSource} empty="暂无待核实渠道。" needsCheck />
      </div>

      {plan.excludedOptions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">本次不适用的途径</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {plan.excludedOptions.map((x, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{x.channelName}</span>：{x.reason}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepsColumn({
  title,
  steps,
  refById,
  stepTitleById,
  onOpenSource,
  empty,
  needsCheck,
}: {
  title: string;
  steps: PathStep[];
  refById: Map<string, SourceRecordPublic>;
  stepTitleById: Map<string, string>;
  onOpenSource: (source: SourceRecordPublic) => void;
  empty: string;
  needsCheck?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {steps.length === 0 && <p className="text-sm text-muted-foreground">{empty}</p>}
      {steps.map((s) => {
        const refs = s.sourceRefs.map((r) => refById.get(r.sourceId)).filter((x): x is SourceRecordPublic => x !== undefined);
        return (
          <Card key={s.stepId}>
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{s.title}</CardTitle>
                <Badge variant={needsCheck || s.eligibility === 'needs_check' ? 'outline' : 'default'}>
                  {s.eligibility === 'needs_check' ? '待核实资格' : '可执行'}
                </Badge>
              </div>
              <CardDescription>{s.why}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {s.preparations.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">准备事项</span>
                  <ul className="ml-4 list-disc text-sm">
                    {s.preparations.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-md bg-muted/50 p-3 text-sm">
                <p className="text-muted-foreground">若解决：{s.after.resolved}</p>
                <Separator className="my-2" />
                <p className="text-muted-foreground">若未解决：{s.after.pending}</p>
                {s.after.unresolvedStepIds.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    转至：{s.after.unresolvedStepIds.map((id) => stepTitleById.get(id) ?? id).join('、')}
                  </p>
                )}
              </div>
              {refs.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">引用来源（后端审核）</span>
                  {refs.map((r) => (
                    <Button key={r.id} type="button" size="sm" variant="ghost" className="w-fit justify-start px-2 text-primary" onClick={() => onOpenSource(r)}>
                      {r.title}
                    </Button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
