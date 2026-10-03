/**
 * 智能体习惯 / 对话线程云端同步 — 与小程序共用 /api/meoo-agent-user-state。
 */
import type { AgentUserHabits } from './agentUserHabits'
import { supabase } from './supabaseClient'

let pushTimer: ReturnType<typeof setTimeout> | null = null

async function authHeaders(): Promise<Record<string, string>> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const token = session?.access_token?.trim()
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

function apiBase(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin.replace(/\/$/, '')
}

export type MerchantDeskCloud = {
  productLibrary?: unknown[]
  storeContacts?: Record<string, unknown>
  taxHistory?: unknown[]
  briefRecords?: unknown[]
  briefSelected?: unknown
  updatedAt?: string
}

export async function pullAgentUserStateFromCloud(): Promise<{
  habits?: AgentUserHabits
  thread?: unknown[]
  desk?: MerchantDeskCloud
} | null> {
  const base = apiBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/meoo-agent-user-state`, {
      method: 'GET',
      headers: await authHeaders(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      ok?: boolean
      habits?: AgentUserHabits
      thread?: unknown[]
      desk?: MerchantDeskCloud
    }
    if (!data || data.ok === false) return null
    return {
      habits: data.habits ?? undefined,
      thread: data.thread ?? undefined,
      desk: data.desk ?? undefined,
    }
  } catch {
    return null
  }
}

export function schedulePushAgentUserState(habits: AgentUserHabits, thread?: unknown[]): void {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushAgentUserStateNow(habits, thread)
  }, 600)
}

export async function pushAgentThreadNow(thread: unknown[]): Promise<void> {
  const base = apiBase()
  if (!base) return
  try {
    await fetch(`${base}/api/meoo-agent-user-state`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ thread: thread.slice(-40) }),
    })
  } catch {
    /* ignore */
  }
}

export async function pushMerchantDeskNow(desk: MerchantDeskCloud): Promise<void> {
  const base = apiBase()
  if (!base) return
  try {
    await fetch(`${base}/api/meoo-agent-user-state`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ desk }),
    })
  } catch {
    /* ignore */
  }
}

export async function pushAgentUserStateNow(
  habits: AgentUserHabits,
  thread?: unknown[],
): Promise<void> {
  const base = apiBase()
  if (!base) return
  try {
    const body: { habits: AgentUserHabits; thread?: unknown[] } = { habits }
    if (Array.isArray(thread)) body.thread = thread.slice(-40)
    await fetch(`${base}/api/meoo-agent-user-state`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(body),
    })
  } catch {
    /* ignore */
  }
}

export function mergeCloudHabits(local: AgentUserHabits, cloud?: AgentUserHabits | null): AgentUserHabits {
  if (!cloud) return local
  const localAt = Date.parse(local.updatedAt || '') || 0
  const cloudAt = Date.parse(cloud.updatedAt || '') || 0
  if (cloudAt < localAt) return local
  return {
    ...local,
    ...cloud,
    taskCounts: { ...local.taskCounts, ...(cloud.taskCounts ?? {}) },
    preferredPlatforms: cloud.preferredPlatforms?.length
      ? cloud.preferredPlatforms
      : local.preferredPlatforms,
    recentUserSnippets: cloud.recentUserSnippets?.length
      ? cloud.recentUserSnippets
      : local.recentUserSnippets,
    updatedAt: cloud.updatedAt || local.updatedAt,
  }
}
