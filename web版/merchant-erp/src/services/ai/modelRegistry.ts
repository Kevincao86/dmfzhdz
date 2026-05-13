import type { AIProvider } from './types'

/** 无密钥的默认路由与模型（可被请求体 model / 环境变量覆盖） */
export type ModelRegistryEntry = {
  provider: AIProvider
  label: string
  defaultBaseUrl: string
  /** 说明性：主要 HTTP 路径 */
  primaryEndpoint: string
  defaultModel: string
  fallbackModel?: string
}

export const MODEL_REGISTRY: ModelRegistryEntry[] = [
  {
    provider: 'openai',
    label: 'OpenAI / GPT',
    defaultBaseUrl: 'https://api.openai.com/v1',
    primaryEndpoint: 'POST /responses（可选）或 POST /chat/completions',
    defaultModel: 'gpt-5.5',
    fallbackModel: 'gpt-5.4-mini',
  },
  {
    provider: 'anthropic',
    label: 'Anthropic / Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    primaryEndpoint: 'POST /v1/messages',
    defaultModel: 'claude-sonnet-4-6',
    fallbackModel: 'claude-haiku-4-5',
  },
  {
    provider: 'xai',
    label: 'xAI / Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    primaryEndpoint: 'POST /responses 或 POST /chat/completions',
    defaultModel: 'grok-4.20-reasoning',
  },
  {
    provider: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    primaryEndpoint: 'POST /chat/completions',
    defaultModel: 'deepseek-v4-pro',
    fallbackModel: 'deepseek-v4-flash',
  },
  {
    provider: 'kimi',
    label: 'Kimi / Moonshot',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
    primaryEndpoint: 'POST /chat/completions',
    defaultModel: 'kimi-k2.6',
  },
]

export function registryEntry(provider: AIProvider): ModelRegistryEntry | undefined {
  return MODEL_REGISTRY.find((x) => x.provider === provider)
}
