import type { LLMProvider } from './llm.ts';
import { DashScopeProvider } from './dashscope.ts';
import { MockProvider } from './mock.ts';

// 生产环境未配置 LLM_API_KEY 时返回 available=false 的 DashScope 实例，
// 使 analyzeContract 降级为 rules-only，绝不伪造「AI 分析成功」（doc 02 §1.7）。
// 仅当显式设置 LLM_USE_MOCK=1（本地开发/测试）时才使用 Mock。
export function selectProvider(): LLMProvider {
  const useMock = typeof Deno !== 'undefined' && Deno.env.get('LLM_USE_MOCK') === '1';
  if (useMock) return new MockProvider();
  return new DashScopeProvider();
}

export { DashScopeProvider, MockProvider };
export type { LLMProvider, ExtractRequest, ExtractResult } from './llm.ts';
