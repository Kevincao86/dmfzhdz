/** OpenAI 兼容 Chat Completions 流式（SSE） */

import type { OpenAiCompatMessage } from './providers/openAiCompatibleFetch.js'

const UPSTREAM_STREAM_TIMEOUT_MS = 45_000

function combineAbortSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
  if (!a) return b
  if (!b) return a
  if (a.aborted) return a
  if (b.aborted) return b
  const c = new AbortController()
  const onAbort = () => c.abort()
  a.addEventListener('abort', onAbort, { once: true })
  b.addEventListener('abort', onAbort, { once: true })
  return c.signal
}

function upstreamStreamTimeoutSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(UPSTREAM_STREAM_TIMEOUT_MS)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), UPSTREAM_STREAM_TIMEOUT_MS)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

export type OpenAiStreamDelta = {
  reasoning?: string
  content?: string
}

function parseSseDataLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}

function deltaFromChunk(json: Record<string, unknown>): OpenAiStreamDelta {
  const choices = json.choices as Array<Record<string, unknown>> | undefined
  const delta = choices?.[0]?.delta as Record<string, unknown> | undefined
  if (!delta) return {}
  const out: OpenAiStreamDelta = {}
  const reasoning =
    (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
    (typeof delta.reasoning === 'string' && delta.reasoning) ||
    ''
  if (reasoning) out.reasoning = reasoning
  const content = typeof delta.content === 'string' ? delta.content : ''
  if (content) out.content = content
  return out
}

export async function* openAiCompatChatStream(opts: {
  url: string
  apiKey: string
  model: string
  messages: OpenAiCompatMessage[]
  temperature?: number
  extraBody?: Record<string, unknown>
  signal?: AbortSignal
}): AsyncGenerator<OpenAiStreamDelta> {
  const res = await fetch(opts.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.6,
      stream: true,
      ...opts.extraBody,
    }),
    signal: combineAbortSignals(opts.signal, upstreamStreamTimeoutSignal()),
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = text.slice(0, 400)
    try {
      const j = JSON.parse(text) as { error?: { message?: string } }
      msg = j.error?.message ?? msg
    } catch {
      /* keep */
    }
    throw new Error(`${res.status} ${msg}`)
  }
  const body = res.body
  if (!body) throw new Error('上游未返回流式 body')
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const json = parseSseDataLine(line)
        if (!json) continue
        const d = deltaFromChunk(json)
        if (d.reasoning || d.content) yield d
      }
    }
    if (buf.trim()) {
      const json = parseSseDataLine(buf)
      if (json) {
        const d = deltaFromChunk(json)
        if (d.reasoning || d.content) yield d
      }
    }
  } finally {
    reader.releaseLock()
  }
}
