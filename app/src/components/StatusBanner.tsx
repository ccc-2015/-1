// 请求状态与覆盖度提示（doc 04 §1.3、§1.6）。
// 区分 success / partial（limited/unsupported 能力降级）/ error，
// partial 不得显示成「已全面审查」；示例结果须显著标注。

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { RequestState } from '../lib/request';
import type { ApiError } from '../api/client';

const COVERAGE_LABEL: Record<string, string> = {
  supported: '已支持城市',
  limited: '有限覆盖',
  unsupported: '未支持城市',
};

const MODE_LABEL: Record<string, string> = {
  rules: '仅字面规则',
  rules_and_ai: '规则 + 模型语义',
};

function ErrorAlert({ error }: { error: ApiError }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>请求未完成</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <span>{error.message}</span>
        <span className="text-xs opacity-80">
          {error.code ? `错误码：${error.code}` : `类型：${error.kind}`}
          {error.requestId ? ` · requestId：${error.requestId}` : ''}
          {error.retryable ? ' · 可稍后手动重试' : ' · 请修正后重试'}
        </span>
        {(error.status === 503 || error.status === 504) && (
          <span className="text-xs opacity-80">你的输入已保留，可重新提交。</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

export function StatusBanner<T>({ state }: { state: RequestState<T> }) {
  if (state.phase === 'idle') return null;

  if (state.phase === 'validating' || state.phase === 'submitting') {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {state.phase === 'validating' ? '正在校验输入…' : '正在提交分析，请稍候…'}
      </div>
    );
  }

  if (state.phase === 'error') {
    return <ErrorAlert error={state.error} />;
  }

  const { meta, stale, example } = state;
  const partial = state.phase === 'partial';

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={partial ? 'outline' : 'default'}>
          {partial ? '部分完成（能力降级）' : '分析完成'}
        </Badge>
        <Badge variant="secondary">{COVERAGE_LABEL[meta.coverage] ?? meta.coverage}</Badge>
        <Badge variant="secondary">{MODE_LABEL[meta.processingMode] ?? meta.processingMode}</Badge>
        {example && (
          <Badge variant="destructive" className="font-semibold">
            示例结果 · 固定夹具，不代表本次真实分析
          </Badge>
        )}
        {stale && (
          <Badge variant="outline" className="text-amber-600">
            输入已修改 · 结果已过期，请重新提交
          </Badge>
        )}
      </div>

      {(partial || meta.warnings.length > 0) && (
        <Alert>
          <AlertTitle>请注意以下限制</AlertTitle>
          <AlertDescription>
            <ul className="ml-4 flex list-disc flex-col gap-1">
              {meta.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {partial && meta.warnings.length === 0 && (
                <li>当前结果为有限覆盖或仅字面规则，未完成全面语义审查。</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
