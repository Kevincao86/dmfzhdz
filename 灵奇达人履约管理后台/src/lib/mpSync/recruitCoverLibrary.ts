import manifest from './recruitCoverLibrary.manifest.json'
import { recruitCoverAssetCandidates } from '@merchant/lib/webStaticOssAssets'

export type CoverLibraryItem = {
  id: string
  path: string
  label: string
  url?: string
}

const WEB_COVER_ROOT = '/recruit-covers/'

export function webAssetUrl(relPath: string): string {
  const rel = String(relPath || '').replace(/^\/+/, '')
  const candidates = recruitCoverAssetCandidates(rel)
  return candidates[0] || `${WEB_COVER_ROOT}${rel}`
}

export function findCoverById(id: string): CoverLibraryItem | null {
  const key = String(id || '').trim()
  if (!key) return null
  for (const list of Object.values(manifest.platforms || {})) {
    const hit = (list as CoverLibraryItem[]).find((x) => x.id === key)
    if (hit) return { ...hit, url: webAssetUrl(hit.path) }
  }
  for (const list of Object.values(manifest.tags || {})) {
    const hit = (list as CoverLibraryItem[]).find((x) => x.id === key)
    if (hit) return { ...hit, url: webAssetUrl(hit.path) }
  }
  return null
}

export function getPlatformCovers(platform: string): CoverLibraryItem[] {
  const list = ((manifest.platforms || {}) as Record<string, CoverLibraryItem[]>)[String(platform || '').trim()] || []
  return list.map((x) => ({ ...x, url: webAssetUrl(x.path) }))
}

export function getTagCovers(tag: string): CoverLibraryItem[] {
  const list = ((manifest.tags || {}) as Record<string, CoverLibraryItem[]>)[String(tag || '').trim()] || []
  return list.map((x) => ({ ...x, url: webAssetUrl(x.path) }))
}

export function getSuggestedGalleryItems(platform: string, talentTags: string[]): CoverLibraryItem[] {
  const out: CoverLibraryItem[] = []
  const seen = new Set<string>()
  const add = (item: CoverLibraryItem) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    out.push(item)
  }
  getPlatformCovers(platform).forEach(add)
  ;(talentTags || []).forEach((tag) => getTagCovers(tag).forEach(add))
  if (!out.length) getPlatformCovers('抖音').forEach(add)
  return out
}

export function listCoverPlatformNames(): string[] {
  return Object.keys((manifest.platforms || {}) as Record<string, CoverLibraryItem[]>)
}

export function listCoverTagNames(): string[] {
  return Object.keys((manifest.tags || {}) as Record<string, CoverLibraryItem[]>)
}

export function getAllGalleryItems(): CoverLibraryItem[] {
  const out: CoverLibraryItem[] = []
  const seen = new Set<string>()
  const add = (item: CoverLibraryItem) => {
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    out.push({ ...item, url: webAssetUrl(item.path) })
  }
  for (const list of Object.values((manifest.platforms || {}) as Record<string, CoverLibraryItem[]>)) {
    ;(list || []).forEach(add)
  }
  for (const list of Object.values((manifest.tags || {}) as Record<string, CoverLibraryItem[]>)) {
    ;(list || []).forEach(add)
  }
  return out
}

export type CoverGalleryTab = 'recommended' | 'all' | 'platform' | 'tag'

export function getGalleryItemsForTab(
  tab: CoverGalleryTab,
  platform: string,
  talentTags: string[],
  subKey = '',
): CoverLibraryItem[] {
  if (tab === 'recommended') return getSuggestedGalleryItems(platform, talentTags)
  if (tab === 'all') return getAllGalleryItems()
  if (tab === 'platform') {
    const key = subKey || platform || '抖音'
    return getPlatformCovers(key)
  }
  if (tab === 'tag') {
    const key = subKey || talentTags[0] || listCoverTagNames()[0] || '美食'
    return getTagCovers(key)
  }
  return getAllGalleryItems()
}

export function resolveDefaultCover(platform: string, talentTags: string[]): CoverLibraryItem {
  const platformCovers = getPlatformCovers(platform)
  if (platformCovers.length) return platformCovers[0]
  for (const tag of talentTags || []) {
    const tagCovers = getTagCovers(tag)
    if (tagCovers.length) return tagCovers[0]
  }
  return (
    getPlatformCovers('抖音')[0] || {
      id: 'platform-douyin-1',
      path: 'platforms/douyin-1.png',
      url: webAssetUrl('platforms/douyin-1.png'),
      label: '默认封面',
    }
  )
}

export function coverImageFromOrder(order: Record<string, unknown> | null | undefined): string {
  if (!order) return ''
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  return String(order.coverImage || meta.coverImage || '').trim()
}

export function resolveOrderCoverUrl(order: Record<string, unknown>): string {
  const custom = coverImageFromOrder(order)
  if (custom) return custom
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const libId = String(meta.coverLibraryId || '').trim()
  if (libId) {
    const hit = findCoverById(libId)
    if (hit?.url) return hit.url
  }
  const platform = String(order.platform || meta.platform || '').trim()
  const tags = Array.isArray(meta.talentTags) ? (meta.talentTags as string[]) : []
  return resolveDefaultCover(platform, tags).url || ''
}

export function buildCoverFieldsForOrder(form: {
  coverImage?: string
  coverLibraryId?: string
  platform?: string
  talentTags?: string[]
}) {
  const upload = String(form.coverImage || '').trim()
  const libId = String(form.coverLibraryId || '').trim()
  if (upload) {
    return { coverImage: upload, coverLibraryId: '', coverImageSource: 'upload' as const }
  }
  if (libId) {
    const hit = findCoverById(libId)
    return {
      coverImage: hit?.url || '',
      coverLibraryId: libId,
      coverImageSource: 'library' as const,
    }
  }
  const def = resolveDefaultCover(form.platform || '', form.talentTags || [])
  return {
    coverImage: def.url || '',
    coverLibraryId: def.id,
    coverImageSource: 'default' as const,
  }
}
