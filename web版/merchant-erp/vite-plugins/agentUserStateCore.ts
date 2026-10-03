/**
 * 智能体用户状态（习惯 + 对话线程）文件持久化 — Web / 小程序同源。
 */
import fs from 'fs'
import path from 'path'

export type AgentUserHabitsPayload = {
  updatedAt: string
  taskCounts?: Record<string, number>
  preferredPlatforms?: string[]
  recentUserSnippets?: string[]
  defaultCommissionPct?: number
  preferredModelPickerKey?: string
}

export type MerchantDeskPayload = {
  productLibrary?: unknown[]
  storeContacts?: Record<string, unknown>
  taxHistory?: unknown[]
  briefRecords?: unknown[]
  briefSelected?: unknown
  updatedAt?: string
}

export type AgentUserStateFile = {
  userId: string
  tenantId: string
  habits?: AgentUserHabitsPayload
  thread?: unknown[]
  desk?: MerchantDeskPayload
  updatedAt: string
}

const STATE_DIR = path.join(process.cwd(), 'data', 'agent-user-state')

function ensureDir(): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true })
}

function safeKey(tenantId: string, userId: string): string {
  return `${tenantId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function statePath(tenantId: string, userId: string): string {
  return path.join(STATE_DIR, `${safeKey(tenantId, userId)}.json`)
}

export function readAgentUserState(tenantId: string, userId: string): AgentUserStateFile | null {
  const fp = statePath(tenantId, userId)
  try {
    if (!fs.existsSync(fp)) return null
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8')) as AgentUserStateFile
    if (!parsed?.userId || !parsed?.tenantId) return null
    if (parsed.userId !== userId || parsed.tenantId !== tenantId) return null
    return parsed
  } catch {
    return null
  }
}

function rowTime(row: unknown): number {
  if (!row || typeof row !== 'object') return 0
  const o = row as Record<string, unknown>
  const raw = o.updatedAt || o.createdAt || o.submittedAt
  const n = Date.parse(String(raw || ''))
  return Number.isFinite(n) ? n : 0
}

function mergeRows(a: unknown[] | undefined, b: unknown[] | undefined, limit: number): unknown[] {
  const map = new Map<string, unknown>()
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row || typeof row !== 'object') continue
    const id = String((row as Record<string, unknown>).id || '').trim()
    if (!id) continue
    const prev = map.get(id)
    if (!prev || rowTime(row) >= rowTime(prev)) map.set(id, row)
  }
  return [...map.values()].sort((x, y) => rowTime(y) - rowTime(x)).slice(0, limit)
}

function mergeContacts(
  a?: Record<string, unknown>,
  b?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(a || {}) }
  for (const [key, value] of Object.entries(b || {})) {
    if (!value || typeof value !== 'object') continue
    const prev = out[key]
    if (!prev || rowTime(value) >= rowTime(prev)) out[key] = value
  }
  return out
}

export function mergeAgentUserState(
  tenantId: string,
  userId: string,
  patch: { habits?: AgentUserHabitsPayload; thread?: unknown[]; desk?: MerchantDeskPayload },
): AgentUserStateFile {
  ensureDir()
  const cur = readAgentUserState(tenantId, userId)
  const next: AgentUserStateFile = {
    userId,
    tenantId,
    updatedAt: new Date().toISOString(),
    habits: cur?.habits,
    thread: cur?.thread,
    desk: cur?.desk,
  }
  if (patch.habits) {
    next.habits = {
      ...(cur?.habits ?? { updatedAt: new Date().toISOString() }),
      ...patch.habits,
      updatedAt: new Date().toISOString(),
      taskCounts: { ...(cur?.habits?.taskCounts ?? {}), ...(patch.habits.taskCounts ?? {}) },
    }
  }
  if (patch.thread) {
    next.thread = Array.isArray(patch.thread) ? patch.thread.slice(-40) : patch.thread
  }
  if (patch.desk && typeof patch.desk === 'object') {
    const prev = cur?.desk
    next.desk = {
      productLibrary: mergeRows(prev?.productLibrary, patch.desk.productLibrary, 80),
      storeContacts: mergeContacts(prev?.storeContacts, patch.desk.storeContacts),
      taxHistory: mergeRows(prev?.taxHistory, patch.desk.taxHistory, 24),
      briefRecords: mergeRows(prev?.briefRecords, patch.desk.briefRecords, 50),
      briefSelected: patch.desk.briefSelected ?? prev?.briefSelected ?? null,
      updatedAt: new Date().toISOString(),
    }
  }
  fs.writeFileSync(statePath(tenantId, userId), JSON.stringify(next, null, 2), 'utf8')
  return next
}
