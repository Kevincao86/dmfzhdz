/**
 * 智能体：优先 ECS /erp-api（本机 Supabase + 运营台注册表 Key），再回退当前站点 Vercel /api。
 */
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { merchantErpApiCandidates } from '../../lib/merchantErpApiBase'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import type { AIChatOkBody, AIChatRequest, AIChatResponse, AIChatStreamEvent } from './types'

export type { AIChatStreamEvent }

export function isAiRequestAborted(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true
  if (e instanceof Error) {
    return e.name === 'AbortError' || /aborted|abort/i.test(e.message)
  }
  return false
}

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function tenantIdForApi(): Promise<string | undefined> {
  if (!supabaseConfigured || !supabase) return undefined
  const tid = await fetchPrimaryTenantId(supabase)
  return tid ?? undefined
}

/** 流式对话优先同源 /api（cs 经 Nginx 反代），避免先打跨域 erp-api 卡住 SSE */
function aiChatFetchUrlCandidates(path: string): string[] {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const all = merchantErpApiCandidates(normalized)
  if (typeof window !== 'undefined') {
    const sameOrigin = `${window.location.origin}${normalized}`
    const rest = all.filter((u) => u !== sameOrigin)
    return [sameOrigin, ...rest]
  }
  return all
}

/** 优先扁平路由 + erp-api，避免生产环境 Vercel 查不到租户 */
export async function postAiChat(
  req: AIChatRequest,
  opts?: { signal?: AbortSignal },
): Promise<AIChatResponse> {
  const token = await bearer()
  const tenantId = await tenantIdForApi()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const tryPaths = ['/api/meoo-ai-chat', '/api/ai/chat']
  let lastErr = 'no_response'
  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      let res: Response
      try {
        res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...req,
            ...(tenantId ? { tenantId } : {}),
          }),
          signal: opts?.signal,
        })
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        continue
      }
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok && json && typeof json === 'object' && (json as { ok?: boolean }).ok === true) {
        const b = json as AIChatOkBody
        return {
          provider: b.provider,
          model: b.model,
          content: b.content,
          raw: b.raw,
          usage: b.usage,
        }
      }
      if (res.status !== 404) {
        if (json && typeof json === 'object') {
          const o = json as {
            ok?: boolean
            error?: unknown
            detail?: string
            hint?: string
            message?: string
            keyDebug?: { fingerprint?: string; source?: string; looksLikeJwt?: boolean }
          }
          const code = typeof o.error === 'string' ? o.error.trim() : ''
          const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
          const hint = typeof o.hint === 'string' ? o.hint.trim() : ''
          const topMsg = typeof o.message === 'string' ? o.message.trim() : ''
          const dbg = o.keyDebug
          const dbgLine =
            dbg?.fingerprint
              ? `Key诊断：${dbg.fingerprint}，来源=${dbg.source ?? '?'}，JWT=${dbg.looksLikeJwt ? '是' : '否'}`
              : ''
          const parts = [code, detail, dbgLine, hint, topMsg].filter(Boolean)
          if (parts.length) throw new Error(parts.join(' — '))
          if (o.error && typeof o.error === 'object' && o.error !== null) {
            const nest = o.error as { message?: string; code?: string | number }
            const nm = typeof nest.message === 'string' ? nest.message.trim() : ''
            if (nm) {
              throw new Error(
                `网关返回异常（HTTP ${res.status}）。多为服务端未正确部署或函数崩溃；请查看 Vercel 该次部署日志。平台信息：${nm}`,
              )
            }
          }
        }
        const trimmed = text?.trim() ?? ''
        if (/MODULE_NOT_FOUND|Cannot find module/i.test(trimmed)) {
          throw new Error(
            `智能体服务端模块加载失败（HTTP ${res.status}）。请重新部署并确认 ECS auth-api 与 Vercel 环境变量已配置。${trimmed.slice(0, 200)}`,
          )
        }
        if (res.status === 502 || /502\s+Bad\s+Gateway/i.test(trimmed)) {
          lastErr =
            'erp-api 502（ECS auth-api 未运行）。SSH 执行：cd ~/app/web版/merchant-erp && git pull && bash scripts/ecs-fix-erp-api-502.sh'
          continue
        }
        throw new Error(trimmed || `HTTP ${res.status}`)
      }
      lastErr = text.slice(0, 200)
    }
  }
  throw new Error(lastErr || 'ai_chat_unavailable')
}

function parseAiChatSseLine(line: string): AIChatStreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return null
  const payload = trimmed.slice(5).trim()
  if (!payload) return null
  try {
    const j = JSON.parse(payload) as AIChatStreamEvent & { event?: string }
    if (
      j.event === 'thinking' &&
      typeof (j as { text?: string }).text === 'string'
    ) {
      return { event: 'thinking', text: (j as { text: string }).text }
    }
    if (j.event === 'content' && typeof (j as { text?: string }).text === 'string') {
      return { event: 'content', text: (j as { text: string }).text }
    }
    if (
      j.event === 'done' &&
      typeof (j as { content?: string }).content === 'string' &&
      typeof (j as { provider?: string }).provider === 'string'
    ) {
      return {
        event: 'done',
        content: (j as { content: string }).content,
        provider: (j as { provider: AIChatResponse['provider'] }).provider,
        model: String((j as { model?: string }).model ?? ''),
      }
    }
    if (j.event === 'error') {
      const o = j as { error?: string; detail?: string; hint?: string }
      return {
        event: 'error',
        error: String(o.error ?? 'upstream_error'),
        detail: o.detail,
        hint: o.hint,
      }
    }
  } catch {
    return null
  }
  return null
}

/** 上游未部署 SSE 时（旧 erp-api 返回 stream_not_implemented）改走非流式 JSON */
function shouldFallbackNonStreamAi(err: string): boolean {
  return /stream_not_implemented|stream_not_supported|use_sse_stream/i.test(err)
}

async function completeAiChatViaNonStream(
  req: AIChatRequest,
  handlers: {
    onEvent: (ev: AIChatStreamEvent) => void
    signal?: AbortSignal
  },
): Promise<AIChatResponse> {
  const { stream: _omit, ...plain } = req
  const res = await postAiChat(plain, { signal: handlers.signal })
  handlers.onEvent({ event: 'content', text: res.content })
  handlers.onEvent({
    event: 'done',
    content: res.content,
    provider: res.provider,
    model: res.model,
  })
  return res
}

/** 智能体流式对话（SSE）；onEvent 可多次收到 thinking / content，最终以 done 结束 */
export async function streamAiChat(
  req: AIChatRequest,
  handlers: {
    onEvent: (ev: AIChatStreamEvent) => void
    signal?: AbortSignal
  },
): Promise<AIChatResponse> {
  const token = await bearer()
  const tenantId = await tenantIdForApi()
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const body = JSON.stringify({
    ...req,
    stream: true,
    ...(tenantId ? { tenantId } : {}),
  })

  const tryPaths = ['/api/meoo-ai-chat', '/api/ai/chat']
  let lastErr = 'no_response'
  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      if (handlers.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      let res: Response
      try {
        res = await fetch(target, {
          method: 'POST',
          headers,
          body,
          signal: handlers.signal,
        })
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        continue
      }

      const ct = res.headers.get('content-type') ?? ''
      if (!res.ok) {
        const text = await res.text()
        if (res.status !== 404) {
          let detail = text.slice(0, 400)
          let errCode = ''
          try {
            const j = JSON.parse(text) as { detail?: string; error?: string }
            errCode = typeof j.error === 'string' ? j.error : ''
            detail = [j.error, j.detail].filter(Boolean).join(' — ') || detail
          } catch {
            /* keep */
          }
          if (shouldFallbackNonStreamAi(errCode) || shouldFallbackNonStreamAi(detail)) {
            lastErr = errCode || detail
            continue
          }
          throw new Error(detail || `HTTP ${res.status}`)
        }
        lastErr = text.slice(0, 200)
        continue
      }

      if (!ct.includes('text/event-stream') || !res.body) {
        const text = await res.text()
        try {
          const j = JSON.parse(text) as AIChatOkBody
          if (j.ok && j.content) {
            handlers.onEvent({ event: 'content', text: j.content })
            handlers.onEvent({
              event: 'done',
              content: j.content,
              provider: j.provider,
              model: j.model,
            })
            return {
              provider: j.provider,
              model: j.model,
              content: j.content,
              raw: j.raw,
              usage: j.usage,
            }
          }
        } catch {
          /* fall through */
        }
        lastErr = 'stream_not_supported'
        continue
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let final: AIChatResponse | null = null
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += dec.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            const ev = parseAiChatSseLine(line)
            if (!ev) continue
            handlers.onEvent(ev)
            if (ev.event === 'error') {
              const parts = [ev.error, ev.detail, ev.hint].filter(Boolean)
              throw new Error(parts.join(' — ') || ev.error)
            }
            if (ev.event === 'done') {
              final = {
                provider: ev.provider,
                model: ev.model,
                content: ev.content,
              }
            }
          }
        }
        if (buf.trim()) {
          const ev = parseAiChatSseLine(buf)
          if (ev) {
            handlers.onEvent(ev)
            if (ev.event === 'error') {
              const parts = [ev.error, ev.detail, ev.hint].filter(Boolean)
              throw new Error(parts.join(' — ') || ev.error)
            }
            if (ev.event === 'done') {
              final = {
                provider: ev.provider,
                model: ev.model,
                content: ev.content,
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
      if (!final) throw new Error('流式对话未收到完成事件')
      return final
    }
  }
  if (shouldFallbackNonStreamAi(lastErr)) {
    return completeAiChatViaNonStream(req, handlers)
  }
  throw new Error(lastErr || 'ai_chat_unavailable')
}

export type AiAgentNativeImageOk =
  | {
      ok: true
      imageUrl: string
      channel: 'tokenmix'
      displayModel?: string
      fallbackNote?: string
    }
  | {
      ok: true
      imageUrl: string
      channel: 'builtin'
      vendorUsed: 'qwen' | 'doubao' | 'minimax'
      fallbackNote?: string
    }

export type AiAgentNativeImageErr = { ok: false; message: string }

export async function postAiAgentNativeImage(
  prompt: string,
  opts?: {
    preferredVendor?: 'qwen' | 'doubao' | 'minimax'
    referenceImageDataUrl?: string
    imageRoute?: 'builtin' | 'tokenmix'
    tokenmixImageModel?: string
    signal?: AbortSignal
  },
): Promise<AiAgentNativeImageOk | AiAgentNativeImageErr> {
  const token = await bearer()
  const tenantId = await tenantIdForApi()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const tryPaths = ['/api/meoo-ai-agent-image']
  let lastErr = 'no_response'
  const body: Record<string, unknown> = { prompt }
  if (opts?.preferredVendor) body.preferred_vendor = opts.preferredVendor
  const ref = opts?.referenceImageDataUrl?.trim()
  if (ref) body.reference_image = ref
  if (opts?.imageRoute === 'tokenmix') body.image_route = 'tokenmix'
  const tim = opts?.tokenmixImageModel?.trim()
  if (tim) body.tokenmix_image_model = tim
  if (tenantId) body.tenantId = tenantId

  for (const p of tryPaths) {
    const targets = aiChatFetchUrlCandidates(p)
    for (const target of targets) {
      if (opts?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      let res: Response
      try {
        res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: opts?.signal,
        })
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        continue
      }
      const text = await res.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        json = null
      }
      if (res.ok && json && typeof json === 'object' && (json as { ok?: boolean }).ok === true) {
        const b = json as {
          imageUrl?: unknown
          vendorUsed?: unknown
          channel?: unknown
          displayModel?: unknown
          fallbackNote?: unknown
        }
        const imageUrl = typeof b.imageUrl === 'string' ? b.imageUrl.trim() : ''
        const ch = b.channel === 'tokenmix' ? 'tokenmix' : 'builtin'
        const displayModel = typeof b.displayModel === 'string' ? b.displayModel.trim() : undefined
        const fallbackNote = typeof b.fallbackNote === 'string' ? b.fallbackNote.trim() : undefined
        if (!imageUrl) return { ok: false, message: '生图接口返回格式异常' }
        if (ch === 'tokenmix') {
          return {
            ok: true,
            imageUrl,
            channel: 'tokenmix',
            ...(displayModel ? { displayModel } : {}),
            ...(fallbackNote ? { fallbackNote } : {}),
          }
        }
        const vuRaw = typeof b.vendorUsed === 'string' ? b.vendorUsed.trim() : ''
        const vuOk = vuRaw === 'qwen' || vuRaw === 'doubao' || vuRaw === 'minimax'
        if (!vuOk) return { ok: false, message: '生图接口返回格式异常' }
        return {
          ok: true,
          imageUrl,
          channel: 'builtin',
          vendorUsed: vuRaw as 'qwen' | 'doubao' | 'minimax',
          ...(fallbackNote ? { fallbackNote } : {}),
        }
      }
      if (res.status !== 404) {
        if (json && typeof json === 'object') {
          const o = json as { ok?: boolean; error?: unknown; detail?: string }
          const code = typeof o.error === 'string' ? o.error.trim() : ''
          const detail = typeof o.detail === 'string' ? o.detail.trim() : ''
          const parts = [code, detail].filter(Boolean)
          if (parts.length) return { ok: false, message: parts.join(' — ') }
        }
        return { ok: false, message: text?.trim() || `HTTP ${res.status}` }
      }
      lastErr = text.slice(0, 200)
    }
  }
  return { ok: false, message: lastErr || 'ai_agent_image_unavailable' }
}
