import {
  vendorTierAutoPickerKey,
  VENDOR_TIER_LABELS,
  type BuiltinVendor,
  type VendorModelTier,
} from '../../lib/vendorModelPool.js'
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
    defaultModel: 'MiniMax-M2.7',
    fallbackModel: 'MiniMax-M2.1',
  },
  {
    provider: 'aimodelserver',
    label: 'AiModelServer',
    defaultBaseUrl: 'https://api.aimodelserver.com/v1',
    primaryEndpoint: 'POST /chat/completions（OpenAI 兼容）',
    defaultModel: 'gpt-5.4',
    fallbackModel: 'claude-sonnet-4-6',
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
  /** 豆包/千问六类分组标题（下拉展示） */
  groupLabel?: string
  /** 是否为分组内「自动随机 + 额度切换」项 */
  tierAuto?: boolean
}

/** TokenMix 各家族下展示的「文生图」模型名（与 chat id 独立；出图仍由灵祺服务端引擎执行） */
const AGENT_TOKENMIX_T2I_BY_FAMILY: Partial<Record<AIModelFamily, readonly { id: string; label: string }[]>> = {
  openai: [
    { id: 'gpt-image-2', label: '绘境 Max（GPT Image 2）' },
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
    if (r.provider === 'aimodelserver') {
      for (const m of ['gemini-3.5-flash', 'deepseek-v4-flash', 'glm-5.2'] as const) {
        out.push({
          key: `${r.provider}::${m}`,
          provider: r.provider,
          model: m,
          label: `${r.label} · ${m}`,
          capability: 'chat',
        })
      }
    }
  }

  /** 千问 / 豆包：下拉仅展示三档主封装（子模型在 vendorModelPool 内随机 + 额度切换） */
  const pushVendorTierAutoOnly = (
    vendor: BuiltinVendor,
    tier: VendorModelTier,
    capability: AiModelCapability,
  ) => {
    const tierLabel = VENDOR_TIER_LABELS[vendor][tier]
    const vendorBrand = tierLabel.split(' · ')[0] ?? tierLabel
    out.push({
      key: vendorTierAutoPickerKey(vendor, tier),
      provider: vendor,
      model: '',
      label: `${tierLabel} · 自动（随机 · 额度切换）`,
      capability,
      groupLabel: vendorBrand,
      tierAuto: true,
    })
  }

  /** 按厂商成块排列：豆包三档 → 千问三档，避免交替 */
  for (const vendor of ['doubao', 'qwen'] as const) {
    for (const tier of ['language', 'image_text', 'vision'] as const) {
      pushVendorTierAutoOnly(vendor, tier, tier === 'language' ? 'chat' : 'image')
    }
  }

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
    if (o.provider === 'aimodelserver') return false
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
  return prefer?.key ?? opts[0]?.key ?? vendorTierAutoPickerKey('qwen', 'language')
}

export type ParsedModelPicker =
  | { provider: 'tokenmix'; modelFamily: AIModelFamily; model: string }
  | {
      provider: 'deepseek' | 'kimi' | 'minimax' | 'qwen' | 'doubao' | 'aimodelserver'
      model: string
    }

export function parseAiModelPickerKey(key: string): ParsedModelPicker | null {
  const tierAuto = parseVendorTierAutoFromKey(key)
  if (tierAuto) {
    return { provider: tierAuto.vendor, model: '' }
  }
  const parts = key.split('::')
  if (parts[0] === 'tokenmix' && parts.length >= 3) {
    const family = normalizeAiModelFamily(parts[1])
    const rest = parts.slice(2).join('::')
    const model = rest === '__default__' ? '' : rest
    return { provider: 'tokenmix', modelFamily: family, model }
  }
  if (parts.length >= 2) {
    const p = parts[0] as AIProvider
    if (
      p !== 'deepseek' &&
      p !== 'kimi' &&
      p !== 'minimax' &&
      p !== 'qwen' &&
      p !== 'doubao' &&
      p !== 'aimodelserver'
    ) {
      return null
    }
    const rest = parts.slice(1).join('::')
    const model = rest === '__default__' ? '' : rest
    return { provider: p, model }
  }
  return null
}

function parseVendorTierAutoFromKey(key: string): { vendor: BuiltinVendor; tier: VendorModelTier } | null {
  const parts = key.split('::')
  if (parts.length !== 4 || parts[1] !== 'tier' || parts[3] !== '__auto__') return null
  if (parts[0] !== 'doubao' && parts[0] !== 'qwen') return null
  const tier = parts[2] as VendorModelTier
  if (tier !== 'language' && tier !== 'image_text' && tier !== 'vision') return null
  return { vendor: parts[0], tier }
}

export { parseVendorTierAutoFromKey, vendorTierAutoPickerKey }
