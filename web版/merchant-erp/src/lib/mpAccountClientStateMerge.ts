/** 小程序与履约 Web 本机态合并（按条目时间戳取新） */

export type PrDouyinLinkeBindingsPayload = {
  serviceProvider?: Record<string, unknown> | null
  clients?: Record<string, unknown>[]
  /** 每次写入林客绑定时刷新，用于跨端 last-write-wins */
  metaUpdatedAt?: string
}

export type MpClientStatePayload = {
  v?: number
  talentMemberDraft?: Record<string, unknown> | null
  prProfileDraft?: Record<string, unknown> | null
  applications?: Record<string, unknown>[]
  publishedOrders?: Record<string, unknown>[]
  notifications?: Record<string, unknown>[]
  messages?: Record<string, unknown>[]
  inboxSeen?: string[]
  selectionHandled?: Record<string, string>
  publishWizardDrafts?: Record<string, unknown>[]
  applyFormTemplates?: Record<string, unknown>[]
  activeApplyTemplateIds?: Record<string, string>
  talentFavoriteIds?: string[]
  orderFavoriteIds?: string[]
  groupQrCache?: Record<string, string>
  prDouyinLinkeBindings?: PrDouyinLinkeBindingsPayload | null
}

const MAX_LIST = 80
const MAX_NOTIFY = 100
const MAX_INBOX_SEEN = 500
const MAX_SELECTION_HANDLED = 300
const MAX_TEMPLATES = 30
const MAX_FAVORITES = 500
const MAX_GROUP_QR = 20

function parseTime(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const s = String(raw ?? '').trim()
  if (!s) return 0
  const n = Number(s)
  if (Number.isFinite(n) && n > 1e11) return n
  const iso = Date.parse(s.replace(/\//g, '-'))
  if (Number.isFinite(iso)) return iso
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] || 0),
      Number(m[5] || 0),
      Number(m[6] || 0),
    ).getTime()
  }
  const idM = s.match(/(?:msg|ntf|DRAFT)-(\d+)/)
  if (idM) return Number(idM[1])
  return 0
}

function mergeDraft(
  a: Record<string, unknown> | null | undefined,
  b: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!a && !b) return null
  if (!a) return b ? { ...b } : null
  if (!b) return { ...a }
  const ta = parseTime(a.updatedAt || a.savedAt || a.registeredAt)
  const tb = parseTime(b.updatedAt || b.savedAt || b.registeredAt)
  return ta >= tb ? { ...a } : { ...b }
}

function mergeListByKey(
  a: Record<string, unknown>[] | undefined,
  b: Record<string, unknown>[] | undefined,
  keyFn: (row: Record<string, unknown>) => string,
  timeFn: (row: Record<string, unknown>) => number,
  limit: number,
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>()
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row || typeof row !== 'object') continue
    const k = keyFn(row)
    if (!k) continue
    const prev = map.get(k)
    if (!prev || timeFn(row) >= timeFn(prev)) map.set(k, row)
  }
  return [...map.values()].sort((x, y) => timeFn(y) - timeFn(x)).slice(0, limit)
}

function mergeInboxSeen(a?: string[], b?: string[]): string[] {
  const set = new Set<string>()
  for (const id of [...(a || []), ...(b || [])]) {
    const s = String(id || '').trim()
    if (s) set.add(s)
  }
  return [...set].slice(-MAX_INBOX_SEEN)
}

function mergeSelectionHandled(
  a?: Record<string, string>,
  b?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const src of [a, b]) {
    for (const [k, v] of Object.entries(src || {})) {
      const key = String(k || '').trim()
      const val = String(v || '').trim()
      if (!key || !val) continue
      out[key] = val === 'joined' ? 'joined' : 'confirmed'
    }
  }
  const keys = Object.keys(out)
  if (keys.length <= MAX_SELECTION_HANDLED) return out
  const trimmed: Record<string, string> = {}
  for (const k of keys.slice(-MAX_SELECTION_HANDLED)) trimmed[k] = out[k]!
  return trimmed
}

function mergeIdSet(a?: string[], b?: string[]): string[] {
  const set = new Set<string>()
  for (const id of [...(a || []), ...(b || [])]) {
    const s = String(id || '').trim()
    if (s) set.add(s)
  }
  return [...set].slice(0, MAX_FAVORITES)
}

function mergeStringMap(
  a?: Record<string, string>,
  b?: Record<string, string>,
  limit = MAX_GROUP_QR,
): Record<string, string> {
  const out: Record<string, string> = { ...(a || {}) }
  for (const [k, v] of Object.entries(b || {})) {
    const key = String(k || '').trim()
    const val = String(v || '').trim()
    if (!key || !val) continue
    out[key] = val
  }
  const keys = Object.keys(out)
  if (keys.length <= limit) return out
  const trimmed: Record<string, string> = {}
  for (const k of keys.slice(-limit)) trimmed[k] = out[k]!
  return trimmed
}

function mergePrDouyinLinkeBindings(
  a?: PrDouyinLinkeBindingsPayload | null,
  b?: PrDouyinLinkeBindingsPayload | null,
): PrDouyinLinkeBindingsPayload | null {
  if (!a && !b) return null
  if (!a) return b ? { ...b } : null
  if (!b) return { ...a }
  const ta = parseTime(a.metaUpdatedAt)
  const tb = parseTime(b.metaUpdatedAt)
  return ta >= tb ? { ...a } : { ...b }
}

function mergeActiveTemplateIds(
  a?: Record<string, string>,
  b?: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...(a || {}) }
  for (const kind of ['talent', 'shoot', 'edit']) {
    const av = String(a?.[kind] || '').trim()
    const bv = String(b?.[kind] || '').trim()
    if (bv) out[kind] = bv
    else if (av) out[kind] = av
  }
  return out
}

export function emptyClientStatePayload(): MpClientStatePayload {
  return {
    v: 1,
    talentMemberDraft: null,
    prProfileDraft: null,
    applications: [],
    publishedOrders: [],
    notifications: [],
    messages: [],
    inboxSeen: [],
    selectionHandled: {},
    publishWizardDrafts: [],
    applyFormTemplates: [],
    activeApplyTemplateIds: {},
    talentFavoriteIds: [],
    orderFavoriteIds: [],
    groupQrCache: {},
    prDouyinLinkeBindings: null,
  }
}

export function mergeClientStatePayload(
  server: MpClientStatePayload | null | undefined,
  client: MpClientStatePayload | null | undefined,
): MpClientStatePayload {
  const s = server || {}
  const c = client || {}
  return {
    v: 1,
    talentMemberDraft: mergeDraft(
      s.talentMemberDraft as Record<string, unknown> | null,
      c.talentMemberDraft as Record<string, unknown> | null,
    ),
    prProfileDraft: mergeDraft(
      s.prProfileDraft as Record<string, unknown> | null,
      c.prProfileDraft as Record<string, unknown> | null,
    ),
    applications: mergeListByKey(
      s.applications,
      c.applications,
      (r) => String(r.mpOrderId || '').trim(),
      (r) => parseTime(r.appliedAt),
      MAX_LIST,
    ),
    publishedOrders: mergeListByKey(
      s.publishedOrders,
      c.publishedOrders,
      (r) => String(r.mpOrderId || '').trim(),
      (r) => parseTime(r.publishedAt),
      MAX_LIST,
    ),
    notifications: mergeListByKey(
      s.notifications,
      c.notifications,
      (r) => String(r.id || `${r.title}-${r.createdAt}`).trim(),
      (r) => parseTime(r.createdAt || r.id),
      MAX_NOTIFY,
    ),
    messages: mergeListByKey(
      s.messages,
      c.messages,
      (r) => String(r.id || `${r.title}-${r.createdAt}`).trim(),
      (r) => parseTime(r.createdAt || r.id),
      MAX_NOTIFY,
    ),
    inboxSeen: mergeInboxSeen(s.inboxSeen, c.inboxSeen),
    selectionHandled: mergeSelectionHandled(
      s.selectionHandled as Record<string, string> | undefined,
      c.selectionHandled as Record<string, string> | undefined,
    ),
    publishWizardDrafts: mergeListByKey(
      s.publishWizardDrafts,
      c.publishWizardDrafts,
      (r) => String(r.id || '').trim(),
      (r) => parseTime(r.savedAt || r.id),
      20,
    ),
    applyFormTemplates: mergeListByKey(
      s.applyFormTemplates,
      c.applyFormTemplates,
      (r) => String(r.id || '').trim(),
      (r) => parseTime(r.updatedAt || r.savedAt || r.id),
      MAX_TEMPLATES,
    ),
    activeApplyTemplateIds: mergeActiveTemplateIds(
      s.activeApplyTemplateIds as Record<string, string> | undefined,
      c.activeApplyTemplateIds as Record<string, string> | undefined,
    ),
    talentFavoriteIds: mergeIdSet(s.talentFavoriteIds, c.talentFavoriteIds),
    orderFavoriteIds: mergeIdSet(s.orderFavoriteIds, c.orderFavoriteIds),
    groupQrCache: mergeStringMap(
      s.groupQrCache as Record<string, string> | undefined,
      c.groupQrCache as Record<string, string> | undefined,
    ),
    prDouyinLinkeBindings: mergePrDouyinLinkeBindings(
      s.prDouyinLinkeBindings as PrDouyinLinkeBindingsPayload | null | undefined,
      c.prDouyinLinkeBindings as PrDouyinLinkeBindingsPayload | null | undefined,
    ),
  }
}

export function normalizeClientStatePayload(raw: unknown): MpClientStatePayload {
  if (!raw || typeof raw !== 'object') return emptyClientStatePayload()
  const o = raw as MpClientStatePayload
  return mergeClientStatePayload(emptyClientStatePayload(), o)
}
