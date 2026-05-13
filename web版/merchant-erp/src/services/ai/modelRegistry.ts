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
    /** 须与当前账号在控制台可见的模型 id 一致；也可用环境变量 OPENAI_MODEL 覆盖 */
    defaultModel: 'gpt-4o',
    fallbackModel: 'gpt-4o-mini',
  },
  {
    provider: 'anthropic',
    label: 'Anthropic / Claude',
    defaultBaseUrl: 'https://api.anthropic.com',
    primaryEndpoint: 'POST /v1/messages',
    /** 与 Anthropic 控制台可见模型 id 一致；可用 ANTHROPIC_MODEL 覆盖 */
    defaultModel: 'claude-3-5-sonnet-20241022',
    fallbackModel: 'claude-3-5-haiku-20241022',
  },
  {
    provider: 'xai',
    label: 'xAI / Grok',
    defaultBaseUrl: 'https://api.x.ai/v1',
    primaryEndpoint: 'POST /responses 或 POST /chat/completions',
    defaultModel: 'grok-2-latest',
    fallbackModel: 'grok-beta',
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
    defaultModel: 'moonshot-v1-8k',
    fallbackModel: 'moonshot-v1-32k',
  },
  {
    provider: 'minimax',
    label: 'MiniMax',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    primaryEndpoint: 'POST /chat/completions（OpenAI 兼容）',
    defaultModel: 'MiniMax-M2',
    fallbackModel: 'MiniMax-M2.1',
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

const PICKER_PROVIDERS: AIProvider[] = ['openai', 'anthropic', 'xai', 'deepseek', 'kimi', 'minimax']

export function parseAiModelPickerKey(key: string): { provider: AIProvider; model: string } | null {
  const idx = key.indexOf('::')
  if (idx <= 0) return null
  const provider = key.slice(0, idx) as AIProvider
  if (!PICKER_PROVIDERS.includes(provider)) return null
  const rest = key.slice(idx + 2)
  const model = rest === '__default__' ? '' : rest
  return { provider, model }
}
