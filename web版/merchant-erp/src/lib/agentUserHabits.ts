/**
 * 智能体用户习惯：按租户 + 登录用户持久化，注入对话上下文以实现「越用越懂您」。
 */
import type { AiTaskType } from './aiAgentTypes'
import type { CreatePlatformId } from '../constants/productCreatePlatforms'
import { tenantLocalKey } from './tenantLocalState'

const HABITS_BASE = 'meoo_agent_user_habits_v1'
const ARCHIVE_BASE = 'meoo_agent_archived_sessions_v1'

export type AgentUserHabits = {
  updatedAt: string
  taskCounts: Partial<Record<AiTaskType, number>>
  preferredPlatforms: CreatePlatformId[]
  recentUserSnippets: string[]
  defaultCommissionPct?: number
  preferredModelPickerKey?: string
}

function emptyHabits(): AgentUserHabits {
  return {
    updatedAt: new Date().toISOString(),
    taskCounts: {},
    preferredPlatforms: [],
    recentUserSnippets: [],
  }
}

function habitsStorageKey(userId: string): string {
  const uid = userId.trim()
  return tenantLocalKey(uid ? `${HABITS_BASE}_${uid}` : HABITS_BASE)
}

export function loadAgentUserHabits(userId?: string | null): AgentUserHabits {
  if (!userId?.trim()) return emptyHabits()
  try {
    const raw = localStorage.getItem(habitsStorageKey(userId))
    if (!raw) return emptyHabits()
    const parsed = JSON.parse(raw) as Partial<AgentUserHabits>
    return {
      ...emptyHabits(),
      ...parsed,
      taskCounts: parsed.taskCounts ?? {},
      preferredPlatforms: Array.isArray(parsed.preferredPlatforms) ? parsed.preferredPlatforms : [],
      recentUserSnippets: Array.isArray(parsed.recentUserSnippets)
        ? parsed.recentUserSnippets.filter((s) => typeof s === 'string').slice(0, 8)
        : [],
    }
  } catch {
    return emptyHabits()
  }
}

function saveAgentUserHabits(userId: string, habits: AgentUserHabits): void {
  try {
    localStorage.setItem(
      habitsStorageKey(userId),
      JSON.stringify({ ...habits, updatedAt: new Date().toISOString() }),
    )
  } catch {
    /* ignore */
  }
}

export function recordAgentUserInteraction(
  userId: string | null | undefined,
  patch: {
    taskType?: AiTaskType
    userText?: string
    platforms?: CreatePlatformId[]
    commissionPct?: number
    modelPickerKey?: string
  },
): void {
  if (!userId?.trim()) return
  const cur = loadAgentUserHabits(userId)
  if (patch.taskType) {
    cur.taskCounts[patch.taskType] = (cur.taskCounts[patch.taskType] ?? 0) + 1
  }
  if (patch.platforms?.length) {
    const merged = [...patch.platforms, ...cur.preferredPlatforms]
    cur.preferredPlatforms = [...new Set(merged)].slice(0, 6) as CreatePlatformId[]
  }
  if (typeof patch.commissionPct === 'number' && Number.isFinite(patch.commissionPct)) {
    cur.defaultCommissionPct = patch.commissionPct
  }
  if (patch.modelPickerKey?.trim()) {
    cur.preferredModelPickerKey = patch.modelPickerKey.trim()
  }
  const snippet = patch.userText?.trim().replace(/\s+/g, ' ').slice(0, 120)
  if (snippet) {
    cur.recentUserSnippets = [snippet, ...cur.recentUserSnippets.filter((s) => s !== snippet)].slice(
      0,
      8,
    )
  }
  saveAgentUserHabits(userId, cur)
}

export function buildAgentUserHabitsContext(userId?: string | null): string | null {
  if (!userId?.trim()) return null
  const h = loadAgentUserHabits(userId)
  const topTasks = Object.entries(h.taskCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t}(${n}次)`)
  const lines: string[] = ['【账户使用习惯 · 系统自动记忆，勿重复询问】']
  if (topTasks.length) lines.push(`常用任务：${topTasks.join('、')}`)
  if (h.preferredPlatforms.length) {
    lines.push(`偏好平台：${h.preferredPlatforms.join('、')}`)
  }
  if (typeof h.defaultCommissionPct === 'number') {
    lines.push(`历史常用佣金比例：约 ${h.defaultCommissionPct}%（团购场景）`)
  }
  if (h.recentUserSnippets.length) {
    lines.push(`近期关注：${h.recentUserSnippets.slice(0, 4).join('；')}`)
  }
  if (lines.length <= 1) return null
  lines.push('生成方案时须贴合上述习惯；用户本次明确指令优先于习惯默认值。')
  return lines.join('\n')
}

export function loadAgentArchivedSessions<T>(userId?: string | null): T[] {
  if (!userId?.trim()) return []
  try {
    const raw = localStorage.getItem(tenantLocalKey(`${ARCHIVE_BASE}_${userId.trim()}`))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export function saveAgentArchivedSessions<T>(userId: string | null | undefined, sessions: T[]): void {
  if (!userId?.trim()) return
  try {
    localStorage.setItem(
      tenantLocalKey(`${ARCHIVE_BASE}_${userId.trim()}`),
      JSON.stringify(sessions.slice(0, 10)),
    )
  } catch {
    /* ignore */
  }
}
