// 前端格式化与严格校验工具（doc 04 §1.5、§1.6）。
// 金额输入元、提交严格解析为整数分；UTF-16 计数与后端一致；来源链接仅允许 HTTPS。

export type CentsParse =
  | { ok: true; cents: number | null }
  | { ok: false; error: string };

const YUAN_RE = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

// 空字符串表示「未知」，返回 null；其余必须为严格十进制元（拒绝科学计数、
// 超过两位小数、负号、千分位、前后空白、非有限数及超出安全整数）。
export function yuanToCents(raw: string): CentsParse {
  const value = raw.trim();
  if (value === '') return { ok: true, cents: null };
  if (!YUAN_RE.test(value)) {
    return { ok: false, error: '请输入合法金额（元，最多两位小数，不含符号或千分位）。' };
  }
  const [intPart, decPart = ''] = value.split('.');
  const centsStr = intPart! + decPart.padEnd(2, '0').slice(0, 2);
  const cents = Number.parseInt(centsStr, 10);
  if (!Number.isSafeInteger(cents)) {
    return { ok: false, error: '金额超出可安全表示的范围。' };
  }
  return { ok: true, cents };
}

export function centsToYuan(cents: number | null): string {
  if (cents === null) return '未知';
  const yuan = Math.trunc(cents / 100);
  const fen = cents % 100;
  return fen === 0 ? `${yuan} 元` : `${yuan}.${String(fen).padStart(2, '0')} 元`;
}

// 与后端一致使用 UTF-16 code unit 计数。
export function utf16Length(text: string): number {
  return text.length;
}

export function isAllowedHttpsUrl(url: string | null): url is string {
  if (typeof url !== 'string') return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:';
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOrEmpty(value: string): boolean {
  if (value === '') return true;
  if (!DATE_RE.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

export const PRIORITY_LABEL: Record<string, string> = {
  high: '优先核实',
  medium: '建议核实',
  notice: '提示',
  unrated: '未评级',
};

export const STATUS_LABEL: Record<string, string> = {
  clear: '较清楚',
  ambiguous: '需确认',
  not_found: '未识别到',
  needs_verification: '需核对原文',
};

export const CATEGORY_LABEL: Record<string, string> = {
  deposit_amount: '押金金额',
  deposit_return: '退还安排',
  deposit_deduction: '扣款条件',
  deposit_forfeit: '不退押金',
};

export const ASSESSMENT_LABEL: Record<string, string> = {
  potential_legal_issue: '可能涉及法律问题',
  unfavorable_term: '对承租人不利',
  unclear_or_missing: '不清晰或缺失',
  not_assessed: '未作法律评价',
};
