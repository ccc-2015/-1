// 合同检查入口（doc 04 §1.1/§1.3/§1.5/§1.6/§1.7）。
// 表单 → 提交分析 → 结果（四类检查项、原文高亮、需确认问题、引用）。
// 原文/结果仅存 React 内存；POST 由用户主动触发；取消旧请求并忽略迟到响应。

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
import { CheckIcon, InfoIcon, TriangleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { analyzeContract, isApiError } from '../api/client';
import type { PublicConfig } from '@shared/config.ts';
import type { ContractAnalysis, ContractFinding, AnalyzeContractInput } from '@shared/contract.ts';
import type { SourceRecordPublic } from '@shared/sources.ts';
import {
  type RequestState,
  phaseFromMeta,
  toApiError,
} from '../lib/request';
import {
  yuanToCents,
  centsToYuan,
  utf16Length,
  isValidDateOrEmpty,
  PRIORITY_LABEL,
  STATUS_LABEL,
  CATEGORY_LABEL,
  ASSESSMENT_LABEL,
} from '../lib/format';
import {
  EXAMPLE_CONTRACT_INPUT,
  EXAMPLE_CONTRACT_FIXTURE,
  PILOT_CITY_CODE,
  PILOT_CITY_NAME,
} from '../lib/examples';
import { StatusBanner } from './StatusBanner';

type Props = {
  config: PublicConfig | null;
  onOpenSource: (source: SourceRecordPublic) => void;
};

type FormState = {
  cityCode: string;
  dateUnknown: boolean;
  eventDate: string;
  textScope: 'full_contract' | 'excerpt';
  text: string;
};

const INITIAL_FORM: FormState = {
  cityCode: PILOT_CITY_CODE,
  dateUnknown: false,
  eventDate: '',
  textScope: 'full_contract',
  text: '',
};

type Highlight = { text: string; findingIds: string[] };

// 将已验证的原文偏移区间合并为高亮片段；普通文本节点渲染，不用 dangerouslySetInnerHTML。
function buildHighlights(text: string, findings: ContractFinding[]): Highlight[] {
  type Range = { start: number; end: number; id: string };
  const ranges: Range[] = [];
  for (const f of findings) {
    for (const ex of f.excerpts) {
      // 客户端再次验证偏移，未通过则不高亮（doc 04 §1.6）。
      if (ex.start >= 0 && ex.end <= text.length && text.slice(ex.start, ex.end) === ex.text) {
        ranges.push({ start: ex.start, end: ex.end, id: f.id });
      }
    }
  }
  if (ranges.length === 0) return [{ text, findingIds: [] }];
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  const points = new Set<number>([0, text.length]);
  for (const r of ranges) {
    points.add(r.start);
    points.add(r.end);
  }
  const sorted = [...points].sort((a, b) => a - b);
  const out: Highlight[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i]!;
    const e = sorted[i + 1]!;
    if (e <= s) continue;
    const ids = ranges.filter((r) => r.start <= s && r.end >= e).map((r) => r.id);
    out.push({ text: text.slice(s, e), findingIds: [...new Set(ids)] });
  }
  return out;
}

function PriorityIcon({ priority }: { priority: ContractFinding['priority'] }) {
  if (priority === 'high') return <TriangleAlertIcon className="size-4 text-destructive" aria-hidden />;
  if (priority === 'medium') return <InfoIcon className="size-4 text-amber-500" aria-hidden />;
  return <CircleCheckIcon className="size-4 text-muted-foreground" aria-hidden />;
}

export function ContractPanel({ config, onOpenSource }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [state, setState] = useState<RequestState<ContractAnalysis>>({ phase: 'idle' });
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const reqIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const textLimit = config?.limits.contractTextCodeUnits ?? 30000;
  const charCount = utf16Length(form.text);
  const overLimit = charCount > textLimit;

  const cityOptions = useMemo(() => {
    const opts: Array<{ code: string; name: string }> = [
      { code: PILOT_CITY_CODE, name: `${PILOT_CITY_NAME}（试点·资料核验中）` },
    ];
    for (const c of config?.supportedCities ?? []) {
      if (!opts.some((o) => o.code === c.cityCode)) opts.push({ code: c.cityCode, name: c.name });
    }
    return opts;
  }, [config]);

  function update(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    // 修改输入后标记旧结果已过期（doc 04 §1.3）。
    setState((prev) =>
      prev.phase === 'success' || prev.phase === 'partial' ? { ...prev, stale: true } : prev,
    );
  }

  function fillExample() {
    if (form.text.trim().length > 0 && form.text !== EXAMPLE_CONTRACT_INPUT.text) {
      if (!window.confirm('填入示例将覆盖当前合同文本，是否继续？')) return;
    }
    setForm({
      cityCode: EXAMPLE_CONTRACT_INPUT.cityCode,
      dateUnknown: EXAMPLE_CONTRACT_INPUT.eventDate === null,
      eventDate: EXAMPLE_CONTRACT_INPUT.eventDate ?? '',
      textScope: EXAMPLE_CONTRACT_INPUT.textScope,
      text: EXAMPLE_CONTRACT_INPUT.text,
    });
    setState({ phase: 'idle' });
    toast.info('已填入合成示例合同，点击「提交分析」走真实接口。');
  }

  function viewExampleResult() {
    reqIdRef.current++;
    controllerRef.current?.abort();
    setState({
      phase: 'partial',
      data: EXAMPLE_CONTRACT_FIXTURE.analysis,
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
    setActiveFinding(null);
  }

  function reset() {
    if (form.text.trim().length > 0 && !window.confirm('重置将清空当前输入与结果，是否继续？')) return;
    reqIdRef.current++;
    controllerRef.current?.abort();
    setForm(INITIAL_FORM);
    setState({ phase: 'idle' });
    setActiveFinding(null);
  }

  async function submit() {
    setState({ phase: 'validating' });

    const errors = validate(form, textLimit);
    if (errors.length > 0) {
      setState({ phase: 'idle' });
      toast.error(errors[0]!);
      return;
    }

    const id = ++reqIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const input: AnalyzeContractInput = {
      cityCode: form.cityCode,
      eventDate: form.dateUnknown || form.eventDate === '' ? null : form.eventDate,
      text: form.text,
      textScope: form.textScope,
    };

    setState({ phase: 'submitting' });
    try {
      const result = await analyzeContract(input, controller.signal);
      if (id !== reqIdRef.current) return; // 忽略迟到响应
      setState({
        phase: phaseFromMeta(result.meta),
        data: result.data,
        meta: result.meta,
        stale: false,
        example: false,
      });
      setActiveFinding(null);
    } catch (err) {
      if (id !== reqIdRef.current) return;
      if ((err as Error)?.name === 'AbortError') return;
      setState({ phase: 'error', error: isApiError(err) ? err : toApiError(err) });
    }
  }

  const busy = state.phase === 'validating' || state.phase === 'submitting';
  const result = state.phase === 'success' || state.phase === 'partial' ? state.data : null;
  const resultText =
    state.phase === 'success' || state.phase === 'partial'
      ? state.example
        ? EXAMPLE_CONTRACT_FIXTURE.text
        : form.text
      : '';

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>合同押金条款检查</CardTitle>
          <CardDescription>
            粘贴合同文本，识别押金金额、退还安排、扣款条件与不退押金四类约定。原文提取不等于法律效力判断。
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
              <FieldLegend>基本信息</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="contract-city">城市</FieldLabel>
                  <Select
                    value={form.cityCode}
                    onValueChange={(v) => update({ cityCode: v })}
                    disabled={busy}
                  >
                    <SelectTrigger id="contract-city" className="w-full">
                      <SelectValue placeholder="选择城市" />
                    </SelectTrigger>
                    <SelectContent>
                      {cityOptions.map((o) => (
                        <SelectItem key={o.code} value={o.code}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>支持范围由后端 config 决定，未核验城市将限制结论。</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="contract-date">拟签约 / 签约日期</FieldLabel>
                  <Input
                    id="contract-date"
                    type="date"
                    value={form.eventDate}
                    disabled={busy || form.dateUnknown}
                    onChange={(e) => update({ eventDate: e.target.value })}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="contract-date-unknown"
                      checked={form.dateUnknown}
                      disabled={busy}
                      onCheckedChange={(c) => update({ dateUnknown: c === true })}
                    />
                    <Label htmlFor="contract-date-unknown" className="text-sm font-normal">
                      日期未知
                    </Label>
                  </div>
                  <FieldError>
                    {!form.dateUnknown && !isValidDateOrEmpty(form.eventDate)
                      ? '日期格式不正确，或勾选「日期未知」。'
                      : undefined}
                  </FieldError>
                </Field>
              </div>
            </FieldSet>

            <FieldSet>
              <FieldLegend>合同文本</FieldLegend>
              <Field>
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="contract-text">粘贴合同内容</FieldLabel>
                  <RadioGroup
                    value={form.textScope}
                    onValueChange={(v) => update({ textScope: v as FormState['textScope'] })}
                    className="flex gap-4"
                    disabled={busy}
                  >
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="full_contract" id="scope-full" />
                      <Label htmlFor="scope-full" className="text-sm font-normal">全文</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <RadioGroupItem value="excerpt" id="scope-excerpt" />
                      <Label htmlFor="scope-excerpt" className="text-sm font-normal">片段</Label>
                    </div>
                  </RadioGroup>
                </div>
                <Textarea
                  id="contract-text"
                  value={form.text}
                  disabled={busy}
                  onChange={(e) => update({ text: e.target.value })}
                  placeholder="粘贴合同押金相关条款……"
                  className="min-h-48 font-mono text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between text-xs">
                  <span className={overLimit ? 'text-destructive' : 'text-muted-foreground'}>
                    {charCount} / {textLimit} 字符（UTF-16）
                  </span>
                  {overLimit && <span className="text-destructive">超出上限，请选择相关页或片段，不会静默截断。</span>}
                </div>
                <FieldError>{form.text.trim().length === 0 ? undefined : undefined}</FieldError>
              </Field>
            </FieldSet>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || overLimit || form.text.trim().length === 0}>
                {busy ? '分析中…' : '提交分析'}
              </Button>
              <Button type="button" variant="outline" onClick={fillExample} disabled={busy}>
                填入示例
              </Button>
              <Button type="button" variant="outline" onClick={viewExampleResult} disabled={busy}>
                查看示例结果
              </Button>
              <Button type="button" variant="ghost" onClick={reset} disabled={busy}>
                重置
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <StatusBanner state={state} />

      {result && (
        <ContractResult
          analysis={result}
          originalText={resultText}
          activeFinding={activeFinding}
          onSelectFinding={setActiveFinding}
          copiedId={copiedId}
          onCopy={async (id, text) => {
            try {
              await navigator.clipboard.writeText(text);
              setCopiedId(id);
              toast.success('已复制到剪贴板');
              setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
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

function validate(form: FormState, textLimit: number): string[] {
  const errors: string[] = [];
  if (form.text.trim().length === 0) errors.push('请粘贴合同文本。');
  if (utf16Length(form.text) > textLimit) errors.push('合同文本超出字符上限，请选择相关片段。');
  if (form.cityCode.trim().length === 0) errors.push('请选择城市。');
  if (!form.dateUnknown && form.eventDate !== '' && !isValidDateOrEmpty(form.eventDate)) {
    errors.push('日期格式不正确，或勾选「日期未知」。');
  }
  return errors;
}

type ResultProps = {
  analysis: ContractAnalysis;
  originalText: string;
  activeFinding: string | null;
  onSelectFinding: (id: string | null) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onOpenSource: (source: SourceRecordPublic) => void;
};

function ContractResult({
  analysis,
  originalText,
  activeFinding,
  onSelectFinding,
  copiedId,
  onCopy,
  onOpenSource,
}: ResultProps) {
  const highlights = useMemo(
    () => buildHighlights(originalText, analysis.findings),
    [originalText, analysis.findings],
  );
  const refById = useMemo(() => {
    const m = new Map<string, SourceRecordPublic>();
    for (const r of analysis.references) m.set(r.id, r);
    return m;
  }, [analysis.references]);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">检查概览</CardTitle>
          <CardDescription>
            需优先核实 {analysis.summary.needsAttention} 项 · 需确认 {analysis.summary.needsConfirmation} 项。
            计数不代表风险百分比，clear 也不代表合同安全或合法。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">押金金额</dt>
              <dd className="font-medium">{centsToYuan(analysis.extractedFacts.depositAmountCents)}</dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">退还安排</dt>
              <dd className="font-medium">{analysis.extractedFacts.returnTimingText ?? '未识别到'}</dd>
            </div>
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground">扣款项目</dt>
              <dd className="font-medium">
                {analysis.extractedFacts.deductionItems.length > 0
                  ? `${analysis.extractedFacts.deductionItems.length} 项`
                  : '未识别到'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">检查项（按类别）</h2>
          {analysis.findings.map((f) => (
            <FindingCard
              key={f.id}
              finding={f}
              active={activeFinding === f.id}
              copied={copiedId === f.id}
              onSelect={() => onSelectFinding(activeFinding === f.id ? null : f.id)}
              onCopy={onCopy}
              refById={refById}
              onOpenSource={onOpenSource}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">合同原文（高亮已验证偏移）</h2>
          <Card className="lg:sticky lg:top-4">
            <CardContent className="max-h-[70vh] overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed">
                {highlights.map((h, i) =>
                  h.findingIds.length === 0 ? (
                    <span key={i}>{h.text}</span>
                  ) : (
                    <mark
                      key={i}
                      data-active={activeFinding !== null && h.findingIds.includes(activeFinding)}
                      className="rounded-sm bg-yellow-200/70 px-0.5 text-inherit data-[active=true]:bg-yellow-400/90 dark:bg-yellow-500/30 dark:data-[active=true]:bg-yellow-400/50"
                    >
                      {h.text}
                    </mark>
                  ),
                )}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>

      {analysis.evidenceChecklist.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">留证清单</CardTitle>
            <CardDescription>仅为清单提示，不代表证据已安全备份。</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {analysis.evidenceChecklist.map((e) => (
                <li key={e.evidenceId} className="flex flex-col gap-0.5 rounded-md border p-3 text-sm">
                  <span className="font-medium">{e.title}</span>
                  <span className="text-muted-foreground">{e.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  active,
  copied,
  onSelect,
  onCopy,
  refById,
  onOpenSource,
}: {
  finding: ContractFinding;
  active: boolean;
  copied: boolean;
  onSelect: () => void;
  onCopy: (id: string, text: string) => void;
  refById: Map<string, SourceRecordPublic>;
  onOpenSource: (source: SourceRecordPublic) => void;
}) {
  const hasValidExcerpt = finding.excerpts.length > 0;
  const refs = finding.sourceRefs
    .map((r) => refById.get(r.sourceId))
    .filter((s): s is SourceRecordPublic => s !== undefined);

  return (
    <Card data-active={active} className="data-[active=true]:border-primary">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <PriorityIcon priority={finding.priority} />
            <CardTitle className="text-base">{CATEGORY_LABEL[finding.category] ?? finding.category}</CardTitle>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Badge variant="outline">{PRIORITY_LABEL[finding.priority] ?? finding.priority}</Badge>
            <Badge variant="secondary">{STATUS_LABEL[finding.checkStatus] ?? finding.checkStatus}</Badge>
          </div>
        </div>
        <CardDescription>{ASSESSMENT_LABEL[finding.legalAssessment] ?? finding.legalAssessment}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed">{finding.explanation}</p>

        {hasValidExcerpt ? (
          <button
            type="button"
            onClick={onSelect}
            className="text-left text-xs text-primary underline underline-offset-4"
          >
            {active ? '取消原文定位' : `定位原文（${finding.excerpts.length} 处）`}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {finding.checkStatus === 'not_found'
              ? '所提供文本中未识别到明确约定。'
              : '需核对原文：未能定位可展示的原文片段。'}
          </p>
        )}

        {finding.suggestedQuestions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">需确认的问题</span>
            <ul className="ml-4 list-disc text-sm">
              {finding.suggestedQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {finding.missingFacts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {finding.missingFacts.map((m, i) => (
              <Badge key={i} variant="outline" className="text-xs">缺：{m}</Badge>
            ))}
          </div>
        )}

        {finding.negotiationSuggestion && (
          <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
            <span className="text-xs font-medium text-muted-foreground">协商建议（一般性，非法律意见）</span>
            <p className="text-sm leading-relaxed">{finding.negotiationSuggestion}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit"
              onClick={() => onCopy(finding.id, finding.negotiationSuggestion!)}
            >
              {copied ? <CheckIcon className="size-4" aria-hidden /> : null}
              {copied ? '已复制' : '复制建议'}
            </Button>
          </div>
        )}

        {refs.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">引用来源（后端审核）</span>
              {refs.map((s) => (
                <Button
                  key={s.id}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="w-fit justify-start px-2 text-primary"
                  onClick={() => onOpenSource(s)}
                >
                  {s.title}
                </Button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
