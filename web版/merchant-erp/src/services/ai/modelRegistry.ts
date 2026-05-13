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

/** 智能体页 / 抽屉：模型下拉（不含密钥，仅 provider + 模型名） */
export type AiModelPickerOption = {
  key: string
  provider: AIProvider
  /** 空串表示请求体不传 model，由服务端环境变量默认 */
  model: string
  label: string
}

export function listAiModelPickerOptions(): AiModelPickerOption[] {
  const out: AiModelPickerOption[] = []
  for (const r of MODEL_REGISTRY) {
    out.push({
      key: `${r.provider}::__default__`,
      provider: r.provider,
      model: '',
      label: `${r.label} · 默认`,
    })
    out.push({
      key: `${r.provider}::${r.defaultModel}`,
      provider: r.provider,
      model: r.defaultModel,
      label: `${r.label} · ${r.defaultModel}`,
    })
    if (r.fallbackModel) {
      out.push({
        key: `${r.provider}::${r.fallbackModel}`,
        provider: r.provider,
        model: r.fallbackModel,
        label: `${r.label} · ${r.fallbackModel}`,
      })
    }
  }
  return out
}

const PICKER_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'xai', 'deepseek', 'kimi']

export function parseAiModelPickerKey(key: string): { provider: AIProvider; model: string } | null {
  const idx = key.indexOf('::')
  if (idx <= 0) return null
  const provider = key.slice(0, idx) as AIProvider
  if (!PICKER_PROVIDERS.includes(provider)) return null
  const rest = key.slice(idx + 2)
  const model = rest === '__default__' ? '' : rest
  return { provider, model }
}
