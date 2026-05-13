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
    label: 'OpenAI',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
      { id: 'o3-mini', label: 'o3-mini' },
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    models: [
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: [
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    ],
  },
  {
    id: 'grok',
    label: 'Grok',
    models: [
      { id: 'grok-3', label: 'Grok 3' },
      { id: 'grok-2', label: 'Grok 2' },
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

/**
 * 解析发给 TokenMix `chat/completions` 的最终 `model` id。
 */
export function resolveTokenMixModelId(
  parts: { modelFamily?: AIModelFamily; model?: string | undefined },
  env: Record<string, string>,
): string {
  const explicit = (parts.model ?? '').trim()
  if (explicit) return explicit
  const fromEnv = (env.DEFAULT_AI_MODEL ?? '').trim()
  if (fromEnv) return fromEnv
  const fam = parts.modelFamily ?? normalizeAiModelFamily(env.TOKENMIX_DEFAULT_FAMILY)
  return defaultModelIdForFamily(fam)
}
