import { fetchPublicPortalJson } from './merchantErpApiBase.js'
import type { RegistryPlatformDecorItem } from './platformDecorTypes.js'

const STORAGE_PREFIX = 'cs_platform_decor_v1_'

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function fetchPlatformDecorItem(
  slotKey: string,
  identity?: string,
): Promise<RegistryPlatformDecorItem | null> {
  const key = String(slotKey || '').trim()
  if (!key) return null
  const q = new URLSearchParams({ slotKey: key })
  if (identity) q.set('identity', identity)
  try {
    const data = await fetchPublicPortalJson<{ ok?: boolean; item?: RegistryPlatformDecorItem | null }>(
      `/api/meoo-platform-decor-public?${q.toString()}`,
    )
    return data.item ?? null
  } catch {
    return null
  }
}

export function shouldShowDecorPopup(item: RegistryPlatformDecorItem | null): boolean {
  if (!item?.id || !item.imageUrl) return false
  const freq = String(item.freq || 'daily')
  if (freq === 'always') return true
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + item.id)
    if (!raw) return true
    const st = JSON.parse(raw) as { dismissed?: boolean; day?: string }
    if (freq === 'once' && st.dismissed) return false
    if (freq === 'daily' && st.day === todayKey()) return false
  } catch {
    /* ignore */
  }
  return true
}

export function dismissDecorPopup(item: RegistryPlatformDecorItem | null): void {
  if (!item?.id) return
  const freq = String(item.freq || 'daily')
  if (freq === 'always') return
  try {
    localStorage.setItem(
      STORAGE_PREFIX + item.id,
      JSON.stringify({ dismissed: true, day: todayKey(), at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

export function openDecorLink(item: RegistryPlatformDecorItem | null): void {
  if (!item) return
  const type = String(item.linkType || 'none')
  const val = String(item.linkValue || '').trim()
  if (type === 'none' || !val) return
  if (type === 'web_url' || /^https?:\/\//i.test(val)) {
    window.open(val, '_blank', 'noopener,noreferrer')
    return
  }
  if (type === 'mp_path') {
    // CS/DR：小程序路径无法直开，复制提示
    void navigator.clipboard?.writeText(val).catch(() => undefined)
  }
}
