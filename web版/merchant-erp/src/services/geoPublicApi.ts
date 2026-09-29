import { merchantErpApiBase } from '../lib/merchantErpApiBase'
import { supabase } from '../lib/supabaseClient'
import { tenantLocalKey } from '../lib/tenantLocalState'
import type { GeoPublicStore } from '../lib/geoPublicPage'

const KEY = 'meoo_geo_public_page_v1'

export type GeoPublicLink = {
  url: string
  citation: string
  updatedAt: string
  llms?: string
  sitemap?: string
}

function storageKey(): string {
  return tenantLocalKey(KEY)
}

export function loadSavedGeoPublicLink(): GeoPublicLink | null {
  try {
    const raw = window.localStorage.getItem(storageKey())
    if (!raw) return null
    const j = JSON.parse(raw) as GeoPublicLink
    if (!j?.url) return null
    return j
  } catch {
    return null
  }
}

export function saveGeoPublicLink(link: GeoPublicLink): void {
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(link))
  } catch {
    /* ignore */
  }
}

export async function publishGeoPublicPage(input: {
  brandName: string
  stores: GeoPublicStore[]
}): Promise<{ ok: true; link: GeoPublicLink } | { ok: false; message: string }> {
  const base = merchantErpApiBase()
  if (!base) return { ok: false, message: '未配置接口地址' }
  if (!supabase) return { ok: false, message: '请先登录' }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, message: '请先登录' }

  const res = await fetch(`${base}/meoo-geo-public`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      brandName: input.brandName,
      stores: input.stores,
    }),
  })
  let json: Record<string, unknown> = {}
  try {
    json = (await res.json()) as Record<string, unknown>
  } catch {
    json = {}
  }
  if (!res.ok || json.ok !== true || typeof json.url !== 'string') {
    const message = typeof json.message === 'string' && json.message.trim() ? json.message : '发布失败'
    return { ok: false, message }
  }
  const link: GeoPublicLink = {
    url: json.url,
    citation: typeof json.citation === 'string' ? json.citation : '',
    updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : '',
    llms: typeof json.llms === 'string' ? json.llms : undefined,
    sitemap: typeof json.sitemap === 'string' ? json.sitemap : undefined,
  }
  saveGeoPublicLink(link)
  return { ok: true, link }
}
