// 覆盖度与服务说明（doc 04 §1.1 CoverageNotice/PrivacyNotice、服务说明视图）。
// 支持范围、第三方处理、保存方式、使用边界；不堆叠重复免责声明。

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import type { PublicConfig } from '@shared/config.ts';

export function CoverageNotice({ config }: { config: PublicConfig | null }) {
  if (config === null) {
    return (
      <Alert>
        <AlertTitle>正在读取支持范围…</AlertTitle>
        <AlertDescription>尚未取得后端 config，暂无法确认支持城市与场景。</AlertDescription>
      </Alert>
    );
  }

  const noCity = config.supportedCities.length === 0;
  const noAi = !config.features.liveAi;

  if (!noCity && !noAi) return null;

  return (
    <Alert>
      <AlertTitle>当前覆盖范围</AlertTitle>
      <AlertDescription>
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {noCity && (
            <li>试点城市（郑州）资料尚在核验中，暂未声明为「已支持」；结果将标记为有限覆盖或未支持，不提供当地特定法律结论。</li>
          )}
          {noAi && (
            <li>未配置可用模型服务时，仅返回已独立验证的字面规则结果，语义审查未完成。</li>
          )}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function ServiceInfoDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">服务说明</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>服务说明与使用边界</DialogTitle>
          <DialogDescription>请在开始前了解以下范围与处理方式。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <section className="flex flex-col gap-1">
            <h3 className="font-medium">支持范围（一期）</h3>
            <p className="text-muted-foreground">
              单一试点城市（郑州）· 押金条款检查 · 押金未退/被部分扣除纠纷。不含 OCR、账号、案件历史与文件持久化。支持城市与场景以后端 config 为准，不在前端硬编码为全国支持。
            </p>
          </section>
          <Separator />
          <section className="flex flex-col gap-1">
            <h3 className="font-medium">第三方处理</h3>
            <p className="text-muted-foreground">
              启用模型语义分析时，你提交的合同/纠纷文本会发送至所选模型供应商用于本次分析。未配置模型时仅使用本地字面规则，不发送文本。
            </p>
          </section>
          <Separator />
          <section className="flex flex-col gap-1">
            <h3 className="font-medium">保存方式</h3>
            <p className="text-muted-foreground">
              合同原文、纠纷事实与结果仅保存在本次页面会话的内存中，不写入浏览器本地存储、不记录到服务端日志、不持久化到数据库。刷新或关闭页面即丢失。
            </p>
          </section>
          <Separator />
          <section className="flex flex-col gap-1">
            <h3 className="font-medium">使用边界</h3>
            <p className="text-muted-foreground">
              本工具提供法律信息参考与行动思路，不替代律师意见，不保证任何结果。原文提取不等于法律效力判断；「较清楚」不代表合同安全或合法；未识别到不代表条款不存在。涉及重大权益请咨询执业律师或当地法律援助机构。
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
