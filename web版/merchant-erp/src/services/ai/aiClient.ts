/**
 * 智能体：优先 ECS /erp-api（本机 Supabase + 运营台注册表 Key），再回退当前站点 Vercel /api。
 */
import { supabase, supabaseConfigured } from '../../lib/supabaseClient'
import { merchantErpApiCandidates } from '../../lib/merchantErpApiBase'
import { fetchPrimaryTenantId } from '../../lib/tenantBilling'
import type { AIChatOkBody, AIChatRequest, AIChatResponse } from './types'

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

function aiChatFetchUrlCandidates(path: string): string[] {
  return merchantErpApiCandidates(path)
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
