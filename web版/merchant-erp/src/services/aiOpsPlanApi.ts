import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import {
  isAiOpsPlanResultUsable,
  normalizeAiOpsPlanResult,
  type AiOpsPlanGenerateInput,
  type AiOpsPlanResult,
} from '../lib/aiOpsPlanTypes'

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function generateAiOpsPlan(
  body: AiOpsPlanGenerateInput,
): Promise<{ ok: true; plan: AiOpsPlanResult } | { ok: false; message: string }> {
  const token = await bearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const targets = merchantErpApiCandidates('/api/meoo-ai-ops-plan')
  let lastErr = '生成失败'
  for (let i = 0; i < targets.length; i++) {
    let res: Response
    try {
      res = await fetch(targets[i]!, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      continue
    }
    const text = await res.text()
    let json: Record<string, unknown> | null = null
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      json = null
    }
    if (res.ok && json?.ok) {
      const plan = normalizeAiOpsPlanResult(json.plan)
      if (plan && isAiOpsPlanResultUsable(plan)) return { ok: true, plan }
      lastErr = '方案内容不完整，请重试'
      continue
    }
    const msg = String(json?.message || json?.detail || json?.error || `HTTP ${res.status}`).trim()
    lastErr = msg || lastErr
    if ((res.status === 404 || res.status >= 502) && i < targets.length - 1) continue
    break
  }
  return { ok: false, message: lastErr.slice(0, 200) }
}
