/**
 * 智能体用户习惯 — 与 web agentUserHabits.ts 同源（键名、结构、上下文注入）。
 */
const sessionSync = require('./merchantSessionSyncMp.js')

const HABITS_BASE = 'meoo_agent_user_habits_v1'

function tenantLocalKey(base) {
  let tid = ''
  try {
    tid = String(wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {}
  return tid ? `${base}@${tid}` : base
}

function habitsStorageKey(userId) {
  const uid = String(userId || '').trim()
  return tenantLocalKey(uid ? `${HABITS_BASE}_${uid}` : HABITS_BASE)
}

function emptyHabits() {
  return {
    updatedAt: new Date().toISOString(),
    taskCounts: {},
    preferredPlatforms: [],
    recentUserSnippets: [],
  }
}

function loadAgentUserHabits(userId) {
  if (!userId || !String(userId).trim()) return emptyHabits()
  try {
    const raw = wx.getStorageSync(habitsStorageKey(userId))
    if (!raw) return emptyHabits()
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      ...emptyHabits(),
      ...parsed,
      taskCounts: parsed.taskCounts || {},
      preferredPlatforms: Array.isArray(parsed.preferredPlatforms) ? parsed.preferredPlatforms : [],
      recentUserSnippets: Array.isArray(parsed.recentUserSnippets)
        ? parsed.recentUserSnippets.filter((s) => typeof s === 'string').slice(0, 8)
        : [],
    }
  } catch (_) {
    return emptyHabits()
  }
}

function saveAgentUserHabits(userId, habits) {
  if (!userId || !String(userId).trim()) return
  try {
    wx.setStorageSync(
      habitsStorageKey(userId),
      JSON.stringify({ ...habits, updatedAt: new Date().toISOString() }),
    )
  } catch (_) {}
}

function recordAgentUserInteraction(userId, patch) {
  if (!userId || !String(userId).trim()) return
  const cur = loadAgentUserHabits(userId)
  if (patch.taskType) {
    cur.taskCounts[patch.taskType] = (cur.taskCounts[patch.taskType] || 0) + 1
  }
  if (patch.platforms && patch.platforms.length) {
    const merged = patch.platforms.concat(cur.preferredPlatforms)
    cur.preferredPlatforms = [...new Set(merged)].slice(0, 6)
  }
  if (typeof patch.commissionPct === 'number' && Number.isFinite(patch.commissionPct)) {
    cur.defaultCommissionPct = patch.commissionPct
  }
  if (patch.modelPickerKey && String(patch.modelPickerKey).trim()) {
    cur.preferredModelPickerKey = String(patch.modelPickerKey).trim()
  }
  const snippet = patch.userText
    ? String(patch.userText)
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 120)
    : ''
  if (snippet) {
    cur.recentUserSnippets = [snippet]
      .concat(cur.recentUserSnippets.filter((s) => s !== snippet))
      .slice(0, 8)
  }
  saveAgentUserHabits(userId, cur)
  return cur
}

function buildAgentUserHabitsContext(userId) {
  if (!userId || !String(userId).trim()) return null
  const h = loadAgentUserHabits(userId)
  const topTasks = Object.entries(h.taskCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t}(${n}次)`)
  const lines = ['【账户使用习惯 · 系统自动记忆，勿重复询问】']
  if (topTasks.length) lines.push(`常用任务：${topTasks.join('、')}`)
  if (h.preferredPlatforms && h.preferredPlatforms.length) {
    lines.push(`偏好平台：${h.preferredPlatforms.join('、')}`)
  }
  if (typeof h.defaultCommissionPct === 'number') {
    lines.push(`历史常用佣金比例：约 ${h.defaultCommissionPct}%（团购场景）`)
  }
  if (h.recentUserSnippets && h.recentUserSnippets.length) {
    lines.push(`近期关注：${h.recentUserSnippets.slice(0, 4).join('；')}`)
  }
  if (lines.length <= 1) return null
  lines.push('生成方案时须贴合上述习惯；用户本次明确指令优先于习惯默认值。')
  return lines.join('\n')
}

function applyCloudHabits(userId, cloudHabits) {
  if (!userId || !cloudHabits || typeof cloudHabits !== 'object') return loadAgentUserHabits(userId)
  const local = loadAgentUserHabits(userId)
  const localAt = Date.parse(local.updatedAt || '') || 0
  const cloudAt = Date.parse(cloudHabits.updatedAt || '') || 0
  if (cloudAt >= localAt) {
    const merged = {
      ...emptyHabits(),
      ...cloudHabits,
      taskCounts: { ...(local.taskCounts || {}), ...(cloudHabits.taskCounts || {}) },
      preferredPlatforms: cloudHabits.preferredPlatforms || local.preferredPlatforms || [],
      recentUserSnippets: cloudHabits.recentUserSnippets || local.recentUserSnippets || [],
    }
    saveAgentUserHabits(userId, merged)
    return merged
  }
  return local
}

module.exports = {
  loadAgentUserHabits,
  saveAgentUserHabits,
  recordAgentUserInteraction,
  buildAgentUserHabitsContext,
  applyCloudHabits,
  habitsStorageKey,
}
