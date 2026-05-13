import type { AIProvider, AIModelFamily } from './types'
import {
  TOKENMIX_FAMILY_CATALOG,
  normalizeAiModelFamily,
  type TokenMixFamilyDef,
} from './tokenmixClient'

export {
  TOKENMIX_FAMILY_CATALOG,
  defaultModelIdForFamily,
  modelsForTokenMixFamily,
  normalizeAiModelFamily,
  resolveTokenMixModelId,
  tokenMixFamilyById,
  type TokenMixFamilyDef,
  type TokenMixModelOption,
} from './tokenmixClient'

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
] as const

export function registryEntry(provider: Exclude<AIProvider, 'tokenmix'>): DirectModelRegistryEntry | undefined {
  return DIRECT_MODEL_REGISTRY.find((x) => x.provider === provider)
}

/** 智能体页下拉：TokenMix 四家族 + 直连三家 */
export type AiModelPickerOption = {
  key: string
  provider: AIProvider
  /** 仅 TokenMix 选项有值 */
  modelFamily?: AIModelFamily
  model: string
  label: string
}

export function listAiModelPickerOptions(): AiModelPickerOption[] {
  const out: AiModelPickerOption[] = []

  for (const fam of TOKENMIX_FAMILY_CATALOG as readonly TokenMixFamilyDef[]) {
    out.push({
      key: `tokenmix::${fam.id}::__default__`,
      provider: 'tokenmix',
      modelFamily: fam.id,
      model: '',
      label: `${fam.label}（TokenMix）· 默认`,
    })
    for (const m of fam.models) {
      out.push({
        key: `tokenmix::${fam.id}::${m.id}`,
        provider: 'tokenmix',
        modelFamily: fam.id,
        model: m.id,
        label: `${fam.label}（TokenMix）· ${m.label}`,
      })
    }
  }

  for (const r of DIRECT_MODEL_REGISTRY) {
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

export type ParsedModelPicker =
  | { provider: 'tokenmix'; modelFamily: AIModelFamily; model: string }
  | { provider: 'deepseek' | 'kimi' | 'minimax'; model: string }

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
    if (p !== 'deepseek' && p !== 'kimi' && p !== 'minimax') return null
    const rest = parts.slice(1).join('::')
    const model = rest === '__default__' ? '' : rest
    return { provider: p, model }
  }
  return null
}
