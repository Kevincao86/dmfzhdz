import type { MembershipPlan } from '../../lib/membershipPlan.js'
import { membershipAllowsTokenMix } from '../../lib/membershipPlan.js'
import type { AIProvider, AIModelFamily } from './types'
import {
  TOKENMIX_FAMILY_CATALOG,
  normalizeAiModelFamily,
  type TokenMixFamilyDef,
} from './tokenmixClient.js'

export {
  TOKENMIX_FAMILY_CATALOG,
  defaultModelIdForFamily,
  modelsForTokenMixFamily,
  normalizeAiModelFamily,
  resolveTokenMixModelId,
  tokenMixFamilyById,
  type TokenMixFamilyDef,
  type TokenMixModelOption,
} from './tokenmixClient.js'

/** 仍直连厂商的注册项（非 TokenMix） */
export type DirectModelRegistryEntry = {
  provider: Exclude<AIProvider, 'tokenmix'>
  label: string
  defaultBaseUrl: string
  primaryEndpoint: string
  defaultModel: string
  fallbackModel?: string
}

export const DIRECT_MODEL_REGISTRY: readonly DirectModelRegistryEntry[] = [
  {
    provider: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    primaryEndpoint: 'POST /chat/completions',
    defaultModel: 'deepseek-chat',
    fallbackModel: 'deepseek-reasoner',
  },
  {
    provider: 'kimi',
    label: 'Kimi / Moonshot',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
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
] as const

export function registryEntry(provider: Exclude<AIProvider, 'tokenmix'>): DirectModelRegistryEntry | undefined {
  return DIRECT_MODEL_REGISTRY.find((x) => x.provider === provider)
}

/** 智能体页下拉：TokenMix 四家族、通义/豆包（Vercel 服务端密钥）、直连 DeepSeek/Kimi/MiniMax */
export type AiModelCapability = 'chat' | 'image'

export type AiModelPickerOption = {
  key: string
  provider: AIProvider
  /** 仅 TokenMix 选项有值 */
  modelFamily?: AIModelFamily
  model: string
  label: string
  /** 默认 chat；image 为文生图（走服务端万相/豆包/MiniMax） */
  capability?: AiModelCapability
}

/** TokenMix 各家族下展示的「文生图」模型名（与 chat id 独立；出图仍由灵祺服务端引擎执行） */
const AGENT_TOKENMIX_T2I_BY_FAMILY: Partial<Record<AIModelFamily, readonly { id: string; label: string }[]>> = {
  openai: [
    { id: 'gpt-image-1', label: '绘境 Pro' },
    { id: 'dall-e-3', label: '绘境 Classic' },
  ],
  claude: [{ id: 'claude-image-gen', label: '慧思绘境' }],
  gemini: [
    { id: 'gemini-2.5-flash-image', label: '星鉴绘境' },
    { id: 'imagen-3', label: '星鉴绘境 Pro' },
  ],
  grok: [{ id: 'grok-image', label: '破界绘境' }],
}

export function listAiModelPickerOptions(): AiModelPickerOption[] {
  const out: AiModelPickerOption[] = []

  for (const fam of TOKENMIX_FAMILY_CATALOG as readonly TokenMixFamilyDef[]) {
    out.push({
      key: `tokenmix::${fam.id}::__default__`,
      provider: 'tokenmix',
      modelFamily: fam.id,
      model: '',
      label: `${fam.label} · 默认`,
      capability: 'chat',
    })
    for (const m of fam.models) {
      out.push({
        key: `tokenmix::${fam.id}::${m.id}`,
        provider: 'tokenmix',
        modelFamily: fam.id,
        model: m.id,
        label: `${fam.label} · ${m.label}`,
        capability: 'chat',
      })
    }
    const t2iList = AGENT_TOKENMIX_T2I_BY_FAMILY[fam.id]
    if (t2iList) {
      for (const m of t2iList) {
        out.push({
          key: `img::m::${fam.id}::${m.id}`,
          provider: 'tokenmix',
          modelFamily: fam.id,
          model: m.id,
          label: `${fam.label} · ${m.label}（文生图）`,
          capability: 'image',
        })
      }
    }
  }

  for (const r of DIRECT_MODEL_REGISTRY) {
    out.push({
      key: `${r.provider}::__default__`,
      provider: r.provider,
      model: '',
      label: `${r.label} · 默认`,
      capability: 'chat',
    })
    out.push({
      key: `${r.provider}::${r.defaultModel}`,
      provider: r.provider,
      model: r.defaultModel,
      label: `${r.label} · ${r.defaultModel}`,
      capability: 'chat',
    })
    if (r.fallbackModel) {
      out.push({
        key: `${r.provider}::${r.fallbackModel}`,
        provider: r.provider,
        model: r.fallbackModel,
        label: `${r.label} · ${r.fallbackModel}`,
        capability: 'chat',
      })
    }
    if (r.provider === 'deepseek') {
      out.push({
        key: 'img::b::deepseek::t2i',
        provider: 'deepseek',
        model: '',
        label: `${r.label} · 文生图（灵祺引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'kimi') {
      out.push({
        key: 'img::b::kimi::t2i',
        provider: 'kimi',
        model: '',
        label: `${r.label} · 文生图（灵祺引擎）`,
        capability: 'image',
      })
    }
    if (r.provider === 'minimax') {
      out.push({
        key: 'img::v::minimax',
        provider: 'minimax',
        model: 'image-01',
        label: `${r.label} · 文生图（image-01 · 首选 MiniMax）`,
        capability: 'image',
      })
    }
  }

  /** 通义 / 豆包：走 Vercel /api/meoo-ai-chat → 服务端 DashScope / 火山方舟（密钥仅环境变量或运营注册表） */
  const qwenModels = [
    { id: 'qwen-turbo', label: 'qwen-turbo' },
    { id: 'qwen-plus', label: 'qwen-plus' },
    { id: 'qwen-max', label: 'qwen-max' },
  ] as const
  out.push({
    key: 'qwen::__default__',
    provider: 'qwen',
    model: '',
    label: '通义千问 · 默认',
    capability: 'chat',
  })
  for (const m of qwenModels) {
    out.push({
      key: `qwen::${m.id}`,
      provider: 'qwen',
      model: m.id,
      label: `通义千问 · ${m.label}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::qwen',
    provider: 'qwen',
    model: 'wanx',
    label: '通义千问 · 文生图（万相 · 首选通义）',
    capability: 'image',
  })

  const doubaoModels = [
    { id: 'doubao-pro-32k', label: 'doubao-pro-32k' },
    { id: 'doubao-seed-1-6-251015', label: 'doubao-seed-1-6' },
  ] as const
  out.push({
    key: 'doubao::__default__',
    provider: 'doubao',
    model: '',
    label: '豆包 · 默认',
    capability: 'chat',
  })
  for (const m of doubaoModels) {
    out.push({
      key: `doubao::${m.id}`,
      provider: 'doubao',
      model: m.id,
      label: `豆包 · ${m.label}`,
      capability: 'chat',
    })
  }
  out.push({
    key: 'img::v::doubao',
    provider: 'doubao',
    model: 'seedream',
    label: '豆包 · 文生图（Seedream · 首选豆包）',
    capability: 'image',
  })

  out.push({
    key: 'img::v::auto',
    provider: 'qwen',
    model: '',
    label: '文生图 · 自动（按环境变量轮询万相/豆包/MiniMax）',
    capability: 'image',
  })

  return out
}

/** 按会员档位过滤智能体模型下拉（免费/会员：四厂商；Plus：含 TokenMix） */
export function listAiModelPickerOptionsForPlan(plan: MembershipPlan): AiModelPickerOption[] {
  const all = listAiModelPickerOptions()
  if (membershipAllowsTokenMix(plan)) return all
  return all.filter((o) => {
    if (o.provider === 'tokenmix') return false
    if (o.provider === 'kimi') return false
    return (
      o.provider === 'qwen' ||
      o.provider === 'doubao' ||
      o.provider === 'minimax' ||
      o.provider === 'deepseek'
    )
  })
}

export function defaultAiModelPickerKeyForPlan(plan: MembershipPlan): string {
  const opts = listAiModelPickerOptionsForPlan(plan)
  const prefer =
    opts.find((o) => o.provider === 'qwen' && o.capability !== 'image') ??
    opts.find((o) => o.capability !== 'image')
  return prefer?.key ?? opts[0]?.key ?? 'qwen::__default__'
}

export type ParsedModelPicker =
  | { provider: 'tokenmix'; modelFamily: AIModelFamily; model: string }
  | { provider: 'deepseek' | 'kimi' | 'minimax' | 'qwen' | 'doubao'; model: string }

export function parseAiModelPickerKey(key: string): ParsedModelPicker | null {
  const parts = key.split('::')
  if (parts[0] === 'tokenmix' && parts.length >= 3) {
    const family = normalizeAiModelFamily(parts[1])
    const rest = parts.slice(2).join('::')
    const model = rest === '__default__' ? '' : rest
    return { provider: 'tokenmix', modelFamily: family, model }
  }
  if (parts.length >= 2) {
    const p = parts[0] as AIProvider
    if (p !== 'deepseek' && p !== 'kimi' && p !== 'minimax' && p !== 'qwen' && p !== 'doubao') return null
    const rest = parts.slice(1).join('::')
    const model = rest === '__default__' ? '' : rest
    return { provider: p, model }
  }
  return null
}
