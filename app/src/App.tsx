import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { fetchConfig, isApiError, type ApiError } from "./api/client";
import type { PublicConfig } from "@shared/config.ts";

type ConfigState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; config: PublicConfig }
  | { status: "error"; error: ApiError };

export default function App() {
  const [configState, setConfigState] = useState<ConfigState>({ status: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    setConfigState({ status: "loading" });
    fetchConfig(controller.signal)
      .then((config: PublicConfig) => setConfigState({ status: "ready", config }))
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setConfigState({
          status: "error",
          error: isApiError(err)
            ? err
            : { kind: "network", message: String(err), retryable: false },
        });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">租住有据</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          为初次租房的你提供押金条款检查与纠纷行动辅助。法律信息参考，不替代律师意见。
        </p>
      </header>

      <Alert>
        <AlertTitle>开发中（一期脚手架）</AlertTitle>
        <AlertDescription>
          当前为 P1-04 初始化产物：共享契约、API 客户端、后端 action 分发已就位。合同检查与纠纷处理表单将在 P1-06/P1-07/P1-08 实现。
          试点城市（郑州）资料尚未核验，公开覆盖声明暂为空。
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="contract" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="contract">检查押金条款</TabsTrigger>
          <TabsTrigger value="dispute">处理押金纠纷</TabsTrigger>
        </TabsList>
        <TabsContent value="contract" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>合同押金条款检查</CardTitle>
              <CardDescription>
                粘贴合同文本，识别押金金额、退还安排、扣款条件与不退押金约定四类问题。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                表单尚未实装（P1-08）。后端 analyze-contract 当前返回 service_not_configured，等待 P1-07 完成。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="dispute" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>押金纠纷行动方案</CardTitle>
              <CardDescription>
                填写纠纷事实与证据状态，获得证据缺项、协商文本与符合条件的下一步路径。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                表单尚未实装（P1-08）。后端 diagnose-dispute 当前返回 service_not_configured，等待 P1-06 完成。
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">后端配置状态</CardTitle>
          <CardDescription>GET /functions/v1/app?action=config</CardDescription>
        </CardHeader>
        <CardContent>
          {configState.status === "idle" && (
            <p className="text-sm text-muted-foreground">尚未请求。</p>
          )}
          {configState.status === "loading" && (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
          {configState.status === "error" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">
                请求失败：{configState.error.message}
                {configState.error.code ? `（code: ${configState.error.code}）` : ""}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfigState({ status: "idle" })}
              >
                重试
              </Button>
            </div>
          )}
          {configState.status === "ready" && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">knowledgeVersion: {configState.config.knowledgeVersion}</Badge>
                <Badge variant="secondary">
                  supportedCities: {configState.config.supportedCities.length}
                </Badge>
                <Badge variant="secondary">
                  supportedScenarios: {configState.config.supportedScenarios.length}
                </Badge>
                <Badge variant={configState.config.features.liveAi ? "default" : "outline"}>
                  liveAi: {String(configState.config.features.liveAi)}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground md:grid-cols-4">
                <dt>contractTextCodeUnits</dt>
                <dd className="text-foreground">{configState.config.limits.contractTextCodeUnits}</dd>
                <dt>contractJsonBytes</dt>
                <dd className="text-foreground">{configState.config.limits.contractJsonBytes}</dd>
                <dt>disputeJsonBytes</dt>
                <dd className="text-foreground">{configState.config.limits.disputeJsonBytes}</dd>
                <dt>features.contractAnalysis</dt>
                <dd className="text-foreground">{String(configState.config.features.contractAnalysis)}</dd>
              </dl>
            </div>
          )}
        </CardContent>
      </Card>

      <footer className="mt-auto pt-4 text-xs text-muted-foreground">
        一期范围：单一试点城市 · 押金条款检查 · 押金未退/部分扣款纠纷。不含 OCR、账号、案件历史、文件持久化。
      </footer>
    </main>
  );
}
