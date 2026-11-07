import type { LLMProvider } from './llm.ts';
import { OpenAICompatProvider } from './openai-compat.ts';
import { MockProvider } from './mock.ts';

// 端点/模型/密钥均来自环境变量（LLM_BASE_URL、LLM_MODEL、LLM_API_KEY），不写死厂商。
// 未完整配置时返回 available=false 的实例，使 analyzeContract 降级为 rules-only，
// 绝不伪造「AI 分析成功」（doc 02 §1.7）。
// 仅当显式设置 LLM_USE_MOCK=1（本地开发/测试）时才使用 Mock。
export function selectProvider(): LLMProvider {
  const useMock = typeof Deno !== 'undefined' && Deno.env.get('LLM_USE_MOCK') === '1';
  if (useMock) return new MockProvider();
  return new OpenAICompatProvider();
}

export { OpenAICompatProvider, MockProvider };
export type { LLMProvider, ExtractRequest, ExtractResult } from './llm.ts';
