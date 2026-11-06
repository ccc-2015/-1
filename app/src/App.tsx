import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { fetchConfig, isApiError, type ApiError } from './api/client';
import type { PublicConfig } from '@shared/config.ts';
import type { SourceRecordPublic } from '@shared/sources.ts';
import { ContractPanel } from './components/ContractPanel';
import { DisputePanel } from './components/DisputePanel';
import { SourceSheet } from './components/SourceSheet';
import { CoverageNotice, ServiceInfoDialog } from './components/Notices';

type ConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: PublicConfig }
  | { status: 'error'; error: ApiError };

export default function App() {
  const [configState, setConfigState] = useState<ConfigState>({ status: 'loading' });
  const [sourceSheet, setSourceSheet] = useState<{ open: boolean; source: SourceRecordPublic | null }>({
    open: false,
    source: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setConfigState({ status: 'loading' });
    fetchConfig(controller.signal)
      .then((config) => setConfigState({ status: 'ready', config }))
      .catch((err: unknown) => {
        if ((err as Error)?.name === 'AbortError') return;
        setConfigState({
          status: 'error',
          error: isApiError(err) ? err : { kind: 'network', message: String(err), retryable: false },
        });
      });
    return () => controller.abort();
  }, []);

  const config = configState.status === 'ready' ? configState.config : null;

  function openSource(source: SourceRecordPublic) {
    setSourceSheet({ open: true, source });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">租住有据</h1>
            <p className="text-sm text-muted-foreground md:text-base">
              为初次租房的你提供押金条款检查与纠纷行动辅助。法律信息参考，不替代律师意见、不保证结果。
            </p>
          </div>
          <ServiceInfoDialog />
        </div>
      </header>

      {configState.status === 'error' && (
        <div className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          配置加载失败：{configState.error.message}（{configState.error.code ?? configState.error.kind}）。
          你仍可使用「查看示例结果」体验固定夹具。
        </div>
      )}

      <CoverageNotice config={config} />

      <Tabs defaultValue="contract" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contract">检查押金条款</TabsTrigger>
          <TabsTrigger value="dispute">处理押金纠纷</TabsTrigger>
        </TabsList>
        <TabsContent value="contract" className="mt-4">
          <ContractPanel config={config} onOpenSource={openSource} />
        </TabsContent>
        <TabsContent value="dispute" className="mt-4">
          <DisputePanel config={config} onOpenSource={openSource} />
        </TabsContent>
      </Tabs>

      <footer className="mt-auto pt-4 text-xs text-muted-foreground">
        一期范围：单一试点城市 · 押金条款检查 · 押金未退/部分扣款纠纷。不含 OCR、账号、案件历史、文件持久化。
        合同与纠纷信息仅存于本次页面会话，不写入本地存储或服务端日志。
      </footer>

      <SourceSheet
        open={sourceSheet.open}
        onOpenChange={(open) => setSourceSheet((prev) => ({ ...prev, open }))}
        source={sourceSheet.source}
      />
      <Toaster position="top-center" />
    </main>
  );
}
