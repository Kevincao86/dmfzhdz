import type { RegistryFile, RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'

const MAX_URL_LEN = 512

function isInlineImage(v: unknown): boolean {
  const s = String(v || '').trim()
  return s.startsWith('data:image/') || s.length > MAX_URL_LEN
}

function slimUrl(v: unknown): string {
  const s = String(v || '').trim()
  if (!s || isInlineImage(s)) return ''
  return s.slice(0, MAX_URL_LEN)
}

function slimPlatformProfiles(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const out: Record<string, unknown> = {}
  for (const [k, prof] of Object.entries(raw as Record<string, unknown>)) {
    if (!prof || typeof prof !== 'object') continue
    const p = { ...(prof as Record<string, unknown>) }
    if (isInlineImage(p.avatarUrl)) delete p.avatarUrl
    out[k] = p
  }
  return out
}

function slimTalentMember(m: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...m }
  next.wxAvatarUrl = slimUrl(next.wxAvatarUrl)
  if (next.platformProfiles) next.platformProfiles = slimPlatformProfiles(next.platformProfiles)
  return next
}

function slimLibraryEntry(e: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...e }
  next.avatarUrl = slimUrl(next.avatarUrl)
  next.wxAvatarUrl = slimUrl(next.wxAvatarUrl)
  return next
}

function slimMpOrder(o: RegistryMpRecruitmentOrder): RegistryMpRecruitmentOrder {
  const apps = Array.isArray(o.applicants) ? o.applicants : []
  const next: RegistryMpRecruitmentOrder = {
    ...o,
    coverImage: undefined,
    groupQrImage: undefined,
    editGroupQrImage: undefined,
    applicants: [],
    applicantCount: apps.length,
  }
  const metaRaw = o.mpPublishMeta
  if (metaRaw && typeof metaRaw === 'object') {
    const meta = { ...(metaRaw as Record<string, unknown>) }
    delete meta.groupQrImage
    delete meta.editGroupQrImage
    delete meta.coverImage
    if (isInlineImage(meta.prWxAvatarUrl)) delete meta.prWxAvatarUrl
    next.mpPublishMeta = meta
  }
  return next
}

/** 推荐大厅经云函数代理时响应须 <1MB：去掉内联图与报名明细 */
export function slimRecommendHallPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload }
  if (Array.isArray(out.mpTalentMembers)) {
    out.mpTalentMembers = (out.mpTalentMembers as Record<string, unknown>[]).map(slimTalentMember)
  }
  if (Array.isArray(out.talentLibraryEntries)) {
    out.talentLibraryEntries = (out.talentLibraryEntries as Record<string, unknown>[]).map(slimLibraryEntry)
  }
  if (Array.isArray(out.mpRecruitmentOrders)) {
    out.mpRecruitmentOrders = (out.mpRecruitmentOrders as RegistryMpRecruitmentOrder[]).map(slimMpOrder)
  }
  return out
}

export function slimRecommendRegistryPartial(partial: Partial<RegistryFile>): Partial<RegistryFile> {
  const next: Partial<RegistryFile> = { ...partial }
  if (Array.isArray(next.mpTalentMembers)) {
    next.mpTalentMembers = next.mpTalentMembers.map((m) => slimTalentMember(m as Record<string, unknown>)) as typeof next.mpTalentMembers
  }
  if (Array.isArray(next.talentLibraryEntries)) {
    next.talentLibraryEntries = next.talentLibraryEntries.map((e) =>
      slimLibraryEntry(e as Record<string, unknown>),
    ) as typeof next.talentLibraryEntries
  }
  if (Array.isArray(next.mpRecruitmentOrders)) {
    next.mpRecruitmentOrders = next.mpRecruitmentOrders.map(slimMpOrder)
  }
  return next
}
