// 来源详情抽屉（doc 04 §1.1 来源详情、§1.6 来源链接）。
// 仅渲染后端审核字段；外链校验为 HTTPS，新窗口 rel=noopener noreferrer。

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { SourceRecordPublic } from '@shared/sources.ts';
import { isAllowedHttpsUrl } from '../lib/format';

const KIND_LABEL: Record<string, string> = {
  law: '法律',
  regulation: '法规',
  judicial_interpretation: '司法解释',
  local_rule: '地方规定',
  official_guidance: '官方指引',
  official_service: '官方服务',
};

const VALIDITY_LABEL: Record<string, string> = {
  effective: '现行有效',
  repealed: '已废止',
  not_yet_effective: '尚未生效',
  unknown: '效力未知',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SourceRecordPublic | null;
};

export function SourceSheet({ open, onOpenChange, source }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {source === null ? (
          <SheetHeader>
            <SheetTitle>来源详情</SheetTitle>
            <SheetDescription>未选择来源。</SheetDescription>
          </SheetHeader>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <SheetHeader className="p-0">
              <SheetTitle className="text-base leading-snug">{source.title}</SheetTitle>
              <SheetDescription>{source.issuer}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{KIND_LABEL[source.kind] ?? source.kind}</Badge>
              <Badge variant="outline">{VALIDITY_LABEL[source.validityStatus] ?? source.validityStatus}</Badge>
              <Badge variant="outline">
                {source.jurisdiction.level === 'national' ? '全国' : `地方（${source.jurisdiction.cityCodes.join('、')}）`}
              </Badge>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">生效起</dt>
              <dd>{source.validFrom ?? '未知'}</dd>
              <dt className="text-muted-foreground">失效止</dt>
              <dd>{source.validUntil ?? '未设定'}</dd>
              <dt className="text-muted-foreground">核验时间</dt>
              <dd>{source.reviewedAt}</dd>
            </dl>

            {isAllowedHttpsUrl(source.officialUrl) && (
              <a
                href={source.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline underline-offset-4"
              >
                打开核验过的官方来源
              </a>
            )}

            <Separator />

            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium">条文</h3>
              {source.articles.length === 0 && (
                <p className="text-sm text-muted-foreground">该来源未提供可展示条文。</p>
              )}
              {source.articles.map((a) => (
                <article key={a.id} className="flex flex-col gap-1.5 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">{a.id}</Badge>
                    <span className="text-sm font-medium">{a.label}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{a.text}</p>
                  {a.interpretation && (
                    <p className="text-sm text-muted-foreground">说明：{a.interpretation}</p>
                  )}
                  {a.applicabilityNotes.length > 0 && (
                    <ul className="ml-4 list-disc text-xs text-muted-foreground">
                      {a.applicabilityNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
