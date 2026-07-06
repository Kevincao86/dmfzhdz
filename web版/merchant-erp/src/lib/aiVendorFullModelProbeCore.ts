/**
 * 豆包 / 千问：从上游 API 拉全量模型，各测 1 次 chat，输出连通报告。
 */
import {
  classifyArkModelId,
  fetchArkAccountAllModelIds,
  isArkListableChatModelId,
} from './arkAccountModelDiscovery.js'
import {
  fetchQwenAccountAllModelIds,
  sortQwenChatModelsForText,
} from './qwenAccountModelDiscovery.js'

export type VendorProbeStatus = 'ok' | 'quota' | 'denied' | 'not_found' | 'timeout' | 'error'

export type VendorModelProbeRow = {
  vendor: 'doubao' | 'qwen'
  modelId: string
  status: VendorProbeStatus
  ms: number
  detail?: string
}

export type VendorFullProbeSummary = {
  vendor: 'doubao' | 'qwen'
  keyConfigured: boolean
  listed: number
  probed: number
  ok: number
  failed: number
  rows: VendorModelProbeRow[]
  workingModelIds: string[]
}

function classifyProbeError(msg: string, httpStatus?: number): VendorProbeStatus {
  const lower = msg.toLowerCase()
  if (httpStatus === 404 || /does not exist|not have access|unknown model|invalid.*model/i.test(lower))
    return 'not_found'
  if (
    /free quota|free tier|quota.*exhaust|insufficient|额度|限流|429|1008|2061|plan not support/i.test(
      lower,
    )
  )
    return 'quota'
  if (/access denied|forbidden|403|401|鉴权|invalid.*key/i.test(lower)) return 'denied'
  if (/timeout|aborted|timed out/i.test(lower)) return 'timeout'
  return 'error'
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      out[i] = await fn(items[i]!, i)
    }
  })
  await Promise.all(workers)
  return out
}

async function probeDoubaoModel(input: {
  apiKey: string
  apiV3Root: string
  modelId: string
  timeoutMs: number
}): Promise<VendorModelProbeRow> {
  const t0 = Date.now()
  const url = `${input.apiV3Root.replace(/\/$/, '')}/chat/completions`
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), input.timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0.1,
        stream: false,
      }),
      signal: ac.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const errObj = data.error as { message?: string } | undefined
    const errMsg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      (typeof data.message === 'string' && data.message) ||
      ''
    if (!res.ok) {
      return {
        vendor: 'doubao',
        modelId: input.modelId,
        status: classifyProbeError(errMsg || `HTTP ${res.status}`, res.status),
        ms: Date.now() - t0,
        detail: (errMsg || `HTTP ${res.status}`).slice(0, 200),
      }
    }
    const txt = (data.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message
      ?.content
    return {
      vendor: 'doubao',
      modelId: input.modelId,
      status: txt ? 'ok' : 'error',
      ms: Date.now() - t0,
      detail: txt ? String(txt).slice(0, 40) : 'empty_content',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      vendor: 'doubao',
      modelId: input.modelId,
      status: classifyProbeError(msg),
      ms: Date.now() - t0,
      detail: msg.slice(0, 200),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function probeQwenModel(input: {
  apiKey: string
  chatUrl: string
  modelId: string
  timeoutMs: number
}): Promise<VendorModelProbeRow> {
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), input.timeoutMs)
  try {
    const res = await fetch(input.chatUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        temperature: 0.1,
        stream: false,
      }),
      signal: ac.signal,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const errObj = data.error as { message?: string } | undefined
    const errMsg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      (typeof data.message === 'string' && data.message) ||
      ''
    if (!res.ok) {
      return {
        vendor: 'qwen',
        modelId: input.modelId,
        status: classifyProbeError(errMsg || `HTTP ${res.status}`, res.status),
        ms: Date.now() - t0,
        detail: (errMsg || `HTTP ${res.status}`).slice(0, 200),
      }
    }
    const txt = (data.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message
      ?.content
    return {
      vendor: 'qwen',
      modelId: input.modelId,
      status: txt ? 'ok' : 'error',
      ms: Date.now() - t0,
      detail: txt ? String(txt).slice(0, 40) : 'empty_content',
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      vendor: 'qwen',
      modelId: input.modelId,
      status: classifyProbeError(msg),
      ms: Date.now() - t0,
      detail: msg.slice(0, 200),
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function probeDoubaoAllChatModels(input: {
  apiKey: string
  apiV3Root?: string
  concurrency?: number
  perModelTimeoutMs?: number
  onProgress?: (done: number, total: number) => void
}): Promise<VendorFullProbeSummary> {
  const apiKey = input.apiKey.trim()
  const root = (input.apiV3Root ?? 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')
  if (!apiKey) {
    return {
      vendor: 'doubao',
      keyConfigured: false,
      listed: 0,
      probed: 0,
      ok: 0,
      failed: 0,
      rows: [],
      workingModelIds: [],
    }
  }
  const allIds = await fetchArkAccountAllModelIds({ apiKey, apiV3Root: root, forceRefresh: true })
  const chatIds = allIds.filter(
    (id) => isArkListableChatModelId(id) && classifyArkModelId(id) === 'chat',
  )
  const concurrency = Math.max(1, Math.min(8, input.concurrency ?? 4))
  const timeoutMs = input.perModelTimeoutMs ?? 12_000
  let done = 0
  const rows = await mapPool(chatIds, concurrency, async (modelId) => {
    const row = await probeDoubaoModel({ apiKey, apiV3Root: root, modelId, timeoutMs })
    done++
    input.onProgress?.(done, chatIds.length)
    return row
  })
  const workingModelIds = rows.filter((r) => r.status === 'ok').map((r) => r.modelId)
  return {
    vendor: 'doubao',
    keyConfigured: true,
    listed: chatIds.length,
    probed: rows.length,
    ok: workingModelIds.length,
    failed: rows.length - workingModelIds.length,
    rows,
    workingModelIds,
  }
}

export async function probeQwenAllChatModels(input: {
  apiKey: string
  chatCompletionsUrl?: string
  concurrency?: number
  perModelTimeoutMs?: number
  onProgress?: (done: number, total: number) => void
}): Promise<VendorFullProbeSummary> {
  const apiKey = input.apiKey.trim()
  const chatUrl =
    input.chatCompletionsUrl ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
  if (!apiKey) {
    return {
      vendor: 'qwen',
      keyConfigured: false,
      listed: 0,
      probed: 0,
      ok: 0,
      failed: 0,
      rows: [],
      workingModelIds: [],
    }
  }
  const allIds = await fetchQwenAccountAllModelIds({
    apiKey,
    chatCompletionsUrl: chatUrl,
    forceRefresh: true,
  })
  const chatIds = sortQwenChatModelsForText(allIds)
  const concurrency = Math.max(1, Math.min(8, input.concurrency ?? 4))
  const timeoutMs = input.perModelTimeoutMs ?? 12_000
  let done = 0
  const rows = await mapPool(chatIds, concurrency, async (modelId) => {
    const row = await probeQwenModel({ apiKey, chatUrl, modelId, timeoutMs })
    done++
    input.onProgress?.(done, chatIds.length)
    return row
  })
  const workingModelIds = rows.filter((r) => r.status === 'ok').map((r) => r.modelId)
  return {
    vendor: 'qwen',
    keyConfigured: true,
    listed: chatIds.length,
    probed: rows.length,
    ok: workingModelIds.length,
    failed: rows.length - workingModelIds.length,
    rows,
    workingModelIds,
  }
}
