import type { RegistryFile } from './opsRegistryTypes.js'
import {
  isCarouselBannerSlot,
  isLaunchSplashSlot,
  MP_HOME_BANNER_MAX,
  normalizeCarouselSeconds,
  normalizePlaySeconds,
  type PlatformDecorFreq,
  type PlatformDecorIdentity,
  type PlatformDecorLinkType,
  type RegistryPlatformDecorItem,
  type RegistryPlatformDecoration,
} from './platformDecorTypes.js'

function nowIso(): string {
  return new Date().toISOString()
}

function newId(): string {
  return `decor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeLinkType(raw: unknown): PlatformDecorLinkType {
  const v = String(raw || 'none')
  if (v === 'mp_path' || v === 'web_url' || v === 'none') return v
  return 'none'
}

function normalizeFreq(raw: unknown): PlatformDecorFreq {
  const v = String(raw || 'daily')
  if (v === 'once' || v === 'daily' || v === 'always') return v
  return 'daily'
}

function normalizeIdentities(raw: unknown): PlatformDecorIdentity[] {
  if (!Array.isArray(raw) || !raw.length) return ['all']
  const allowed = new Set(['all', 'pr', 'talent', 'shoot', 'edit'])
  const list = raw
    .map((x) => String(x || '').trim())
    .filter((x): x is PlatformDecorIdentity => allowed.has(x))
  return list.length ? list : ['all']
}

export function normalizeDecorItem(raw: unknown): RegistryPlatformDecorItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const slotKey = String(o.slotKey || '').trim()
  const imageUrl = String(o.imageUrl || '').trim()
  if (!slotKey || !imageUrl) return null
  const id = String(o.id || '').trim() || newId()
  const mediaRaw = String(o.mediaType || '').trim().toLowerCase()
  const mediaType =
    mediaRaw === 'video'
      ? ('video' as const)
      : mediaRaw === 'image'
        ? ('image' as const)
        : undefined
  return {
    id,
    slotKey,
    enabled: o.enabled !== false,
    title: String(o.title || '').trim() || slotKey,
    imageUrl,
    ...(mediaType ? { mediaType } : {}),
    linkType: normalizeLinkType(o.linkType),
    linkValue: String(o.linkValue || '').trim() || undefined,
    identities: normalizeIdentities(o.identities),
    startAt: String(o.startAt || '').trim() || undefined,
    endAt: String(o.endAt || '').trim() || undefined,
    freq: normalizeFreq(o.freq),
    ...(isLaunchSplashSlot(slotKey) ? { playSeconds: normalizePlaySeconds(o.playSeconds) } : {}),
    ...(isCarouselBannerSlot(slotKey)
      ? { carouselSeconds: normalizeCarouselSeconds(o.carouselSeconds) }
      : {}),
    priority: Number.isFinite(Number(o.priority)) ? Number(o.priority) : 100,
    updatedAt: String(o.updatedAt || '').trim() || nowIso(),
  }
}

export function resolvePlatformDecoration(data: {
  platformDecoration?: RegistryPlatformDecoration | null
}): RegistryPlatformDecoration {
  const stored = data.platformDecoration
  const items = Array.isArray(stored?.items)
    ? stored!.items.map(normalizeDecorItem).filter((x): x is RegistryPlatformDecorItem => !!x)
    : []
  return {
    items,
    updatedAt: stored?.updatedAt || '',
  }
}

export function setPlatformDecoration(
  data: RegistryFile,
  decoration: RegistryPlatformDecoration,
): void {
  const items = (decoration.items || [])
    .map(normalizeDecorItem)
    .filter((x): x is RegistryPlatformDecorItem => !!x)
  data.platformDecoration = {
    items,
    updatedAt: decoration.updatedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
  }
}

function inSchedule(item: RegistryPlatformDecorItem, now = Date.now()): boolean {
  if (item.startAt) {
    const t = Date.parse(item.startAt)
    if (Number.isFinite(t) && now < t) return false
  }
  if (item.endAt) {
    const t = Date.parse(item.endAt)
    if (Number.isFinite(t) && now > t) return false
  }
  return true
}

function identityMatch(
  item: RegistryPlatformDecorItem,
  identity?: string | null,
): boolean {
  const ids = item.identities?.length ? item.identities : ['all']
  if (ids.includes('all')) return true
  const id = String(identity || '').trim().toLowerCase()
  if (!id) return true
  return ids.includes(id as PlatformDecorIdentity)
}

/** 公开读取：某 slotKey 当前全部生效素材（priority 小优先），供首页海报轮播 */
export function listActiveDecorForSlot(
  data: { platformDecoration?: RegistryPlatformDecoration | null },
  slotKey: string,
  opts?: { identity?: string | null },
): RegistryPlatformDecorItem[] {
  const key = String(slotKey || '').trim()
  if (!key) return []
  const { items } = resolvePlatformDecoration(data)
  const now = Date.now()
  const list = items
    .filter(
      (it) =>
        it.enabled &&
        it.slotKey === key &&
        inSchedule(it, now) &&
        identityMatch(it, opts?.identity),
    )
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
  if (isCarouselBannerSlot(key)) return list.slice(0, MP_HOME_BANNER_MAX)
  return list
}

/** 公开读取：某 slotKey 当前生效的一条（priority 小优先） */
export function pickActiveDecorItem(
  data: { platformDecoration?: RegistryPlatformDecoration | null },
  slotKey: string,
  opts?: { identity?: string | null },
): RegistryPlatformDecorItem | null {
  return listActiveDecorForSlot(data, slotKey, opts)[0] || null
}

export function listActiveDecorByPrefix(
  data: { platformDecoration?: RegistryPlatformDecoration | null },
  prefix: string,
  opts?: { identity?: string | null },
): RegistryPlatformDecorItem[] {
  const p = String(prefix || '').trim()
  if (!p) return []
  const { items } = resolvePlatformDecoration(data)
  const now = Date.now()
  return items
    .filter(
      (it) =>
        it.enabled &&
        it.slotKey.startsWith(p) &&
        inSchedule(it, now) &&
        identityMatch(it, opts?.identity),
    )
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}
