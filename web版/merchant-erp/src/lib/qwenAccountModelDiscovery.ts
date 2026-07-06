/**
 * 百炼 / DashScope：GET compatible-mode/v1/models 拉取账号可用语言模型列表。
 */
export const QWEN_DEFAULT_DASHSCOPE_CHAT_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

const CACHE_TTL_MS = 5 * 60 * 1000
const listCache = new Map<string, { expiresAt: number; ids: string[] }>()

function cacheKey(apiKey: string, modelsUrl: string): string {
  return `${modelsUrl}::${apiKey.slice(0, 8)}::${apiKey.length}`
}

/** 从 chat completions URL 推导 models 列表 URL */
export function qwenCompatibleModelsListUrl(chatCompletionsUrl: string): string {
  let raw = String(chatCompletionsUrl || '').trim().replace(/\/$/, '')
  if (!raw) raw = QWEN_DEFAULT_DASHSCOPE_CHAT_URL.replace(/\/chat\/completions\/?$/i, '')
  if (/\/chat\/completions\/?$/i.test(raw)) {
    return raw.replace(/\/chat\/completions\/?$/i, '/models')
  }
  if (/\/compatible-mode\/v\d+\/?$/i.test(raw)) {
    return `${raw}/models`
  }
  return 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'
}

function parseModelsPage(j: unknown): { ids: string[]; hasMore: boolean; after?: string } {
  const root = j && typeof j === 'object' ? (j as Record<string, unknown>) : {}
  const data = root.data
  const rows = Array.isArray(data) ? data : []
  const ids: string[] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as { id?: unknown }).id ?? '').trim()
    if (id && !ids.includes(id)) ids.push(id)
  }
  const hasMore = root.has_more === true
  const after =
    typeof root.last_id === 'string'
      ? root.last_id
      : typeof (root as { after?: unknown }).after === 'string'
        ? String((root as { after: string }).after)
        : ids.length
          ? ids[ids.length - 1]
          : undefined
  return { ids, hasMore, after }
}

/** 排除明显非对话类（embedding / rerank / tts / asr / image / video task） */
export function isQwenListableChatModelId(id: string): boolean {
  const t = id.trim().toLowerCase()
  if (!t) return false
  if (/embedding|text-embedding|bge-|rerank|speech|tts|asr|cosyvoice|sambert|wanx|flux|image|video|ocr|vl-ocr/i.test(t))
    return false
  if (/^text-/i.test(t)) return false
  return true
}

function qwenChatModelTier(id: string): number {
  const m = id.toLowerCase()
  if (/qwen3\.7-plus|qwen3-7-plus|qwen-plus-2025/i.test(m)) return 1
  if (/qwen-plus(?!-latest)/i.test(m)) return 2
  if (/qwen-turbo|qwen-flash/i.test(m)) return 3
  if (/qwen-max/i.test(m)) return 4
  if (/qwen3|qwen2\.5|qwen2-/i.test(m)) return 5
  if (/deepseek|glm-|kimi/i.test(m)) return 8
  if (/math|coder/i.test(m)) return 12
  if (/long|vl/i.test(m)) return 15
  return 50
}

export function sortQwenChatModelsForText(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const ta = qwenChatModelTier(a)
    const tb = qwenChatModelTier(b)
    if (ta !== tb) return ta - tb
    return a.localeCompare(b)
  })
}

/** 分页拉取账号 models 列表（OpenAI 兼容） */
export async function fetchQwenAccountAllModelIds(input: {
  apiKey: string
  chatCompletionsUrl?: string
  forceRefresh?: boolean
}): Promise<string[]> {
  const key = input.apiKey.trim()
  if (!key) return []
  const modelsUrl = qwenCompatibleModelsListUrl(input.chatCompletionsUrl ?? '')
  const ck = cacheKey(key, modelsUrl)
  if (!input.forceRefresh) {
    const hit = listCache.get(ck)
    if (hit && hit.expiresAt > Date.now()) return hit.ids
  }

  const all: string[] = []
  let after: string | undefined
  try {
    for (let page = 0; page < 40; page++) {
      const url = new URL(modelsUrl)
      url.searchParams.set('limit', '100')
      if (after) url.searchParams.set('after', after)
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      })
      if (!res.ok) break
      const j = await res.json()
      const pageParsed = parseModelsPage(j)
      for (const id of pageParsed.ids) {
        if (!all.includes(id)) all.push(id)
      }
      if (!pageParsed.hasMore || !pageParsed.after) break
      after = pageParsed.after
    }
    const chat = all.filter(isQwenListableChatModelId)
    listCache.set(ck, { expiresAt: Date.now() + CACHE_TTL_MS, ids: chat })
    return chat
  } catch {
    listCache.set(ck, { expiresAt: Date.now() + 60_000, ids: all.filter(isQwenListableChatModelId) })
    return all.filter(isQwenListableChatModelId)
  }
}
