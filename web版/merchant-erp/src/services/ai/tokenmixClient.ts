import type { AIModelFamily } from './types'

/**
 * TokenMix 统一网关 — 模型目录与解析逻辑（浏览器可安全 import，无 Node / OpenAI SDK）。
 * 中继文档：<https://tokenmix.ai/docs> · Base URL 默认 `https://api.tokenmix.ai/v1`
 *
 * 各 `models[].id` 须与 TokenMix 控制台当前可用 id 一致；若中继更新目录，可通过部署调整本文件
 * 或请求体显传 `model` 覆盖。
 */

export type TokenMixModelOption = { id: string; label: string }

export type TokenMixFamilyDef = {
  id: AIModelFamily
  label: string
  models: readonly TokenMixModelOption[]
}

export const TOKENMIX_FAMILY_CATALOG: readonly TokenMixFamilyDef[] = [
  {
    id: 'openai',
    label: '墨典智能AI · 灵犀',
    models: [
      { id: 'gpt-4o', label: '旗舰对话' },
      { id: 'gpt-4o-mini', label: '轻量对话' },
      { id: 'o4-mini', label: '深度推理' },
    ],
  },
  {
    id: 'claude',
    label: '墨典智能AI · 慧思',
    models: [
      { id: 'claude-sonnet-4.6', label: '均衡旗舰' },
      { id: 'claude-haiku-4.5', label: '迅捷轻量' },
      { id: 'claude-opus-4.7', label: '顶配深度' },
    ],
  },
  {
    id: 'gemini',
    label: '墨典智能AI · 星鉴',
    models: [
      { id: 'gemini-2.5-flash', label: '闪速对话' },
      { id: 'gemini-2.5-pro', label: '专业对话' },
    ],
  },
  {
    id: 'grok',
    label: '墨典智能AI · 破界',
    models: [
      { id: 'grok-4.1-fast-non-reasoning', label: '极速对话' },
      { id: 'grok-4.1-fast-reasoning', label: '极速推理' },
    ],
  },
] as const

export function tokenMixFamilyById(id: string): TokenMixFamilyDef | undefined {
  return TOKENMIX_FAMILY_CATALOG.find((f) => f.id === id)
}

export function modelsForTokenMixFamily(family: AIModelFamily): readonly TokenMixModelOption[] {
  return tokenMixFamilyById(family)?.models ?? TOKENMIX_FAMILY_CATALOG[0].models
}

export function defaultModelIdForFamily(family: AIModelFamily): string {
  const list = modelsForTokenMixFamily(family)
  return list[0]?.id ?? 'gpt-4o'
}

export function normalizeAiModelFamily(raw: unknown): AIModelFamily {
  if (raw === 'openai' || raw === 'claude' || raw === 'gemini' || raw === 'grok') return raw
  return 'openai'
}

/** TokenMix 目录迭代后已下线的 id → 当前等价物（含本地持久化的旧 picker key） */
const LEGACY_TOKENMIX_MODEL_ID: Readonly<Record<string, string>> = {
  'o3-mini': 'o4-mini',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4.6',
  'claude-3-5-haiku-20241022': 'claude-haiku-4.5',
  'claude-3-opus-20240229': 'claude-opus-4.7',
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'grok-3': 'grok-4.1-fast-non-reasoning',
  'grok-2': 'grok-4.1-fast-non-reasoning',
}

/**
 * 解析发给 TokenMix `chat/completions` 的最终 `model` id。
 */
export function resolveTokenMixModelId(
  parts: { modelFamily?: AIModelFamily; model?: string | undefined },
  env: Record<string, string>,
): string {
  const explicit = (parts.model ?? '').trim()
  const fromEnv = (env.DEFAULT_AI_MODEL ?? '').trim()
  const fam = parts.modelFamily ?? normalizeAiModelFamily(env.TOKENMIX_DEFAULT_FAMILY)

  let resolved: string
  if (explicit) resolved = explicit
  else if (fromEnv) resolved = fromEnv
  else resolved = defaultModelIdForFamily(fam)

  return LEGACY_TOKENMIX_MODEL_ID[resolved] ?? resolved
}
