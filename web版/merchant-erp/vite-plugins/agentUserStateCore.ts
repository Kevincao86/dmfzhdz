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

export type AgentUserStateFile = {
  userId: string
  tenantId: string
  habits?: AgentUserHabitsPayload
  thread?: unknown[]
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

export function mergeAgentUserState(
  tenantId: string,
  userId: string,
  patch: { habits?: AgentUserHabitsPayload; thread?: unknown[] },
): AgentUserStateFile {
  ensureDir()
  const cur = readAgentUserState(tenantId, userId)
  const next: AgentUserStateFile = {
    userId,
    tenantId,
    updatedAt: new Date().toISOString(),
    habits: cur?.habits,
    thread: cur?.thread,
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
  fs.writeFileSync(statePath(tenantId, userId), JSON.stringify(next, null, 2), 'utf8')
  return next
}
