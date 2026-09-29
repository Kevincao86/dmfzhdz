/**
 * GET/POST /api/meoo-geo-public
 * 公开门店事实页。GET 无需登录；POST 只允许当前商户覆盖自己的页。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireMerchantRegistryAuth } from '../src/lib/merchantRegistryAuth.js'
import {
  GEO_PUBLIC_ORIGIN,
  buildGeoPublicDoc,
  geoPublicHtmlUrl,
  geoPublicLlmsUrl,
  geoPublicSitemapUrl,
  normalizeGeoPublicStores,
  renderGeoPublicHtml,
  renderGeoPublicLlms,
  renderGeoPublicSitemap,
  type GeoPublicDoc,
} from '../src/lib/geoPublicPage.js'

export const config = { maxDuration: 20 }

const DIR = path.join(process.cwd(), 'data', 'geo-public')

function origin(): string {
  const raw = String(process.env.GEO_PUBLIC_ORIGIN || GEO_PUBLIC_ORIGIN).trim()
  return raw.replace(/\/$/, '') || GEO_PUBLIC_ORIGIN
}

function slugFromTenant(tenantId: string): string {
  return tenantId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64)
}

function isSafeSlug(slug: string): boolean {
  return /^[a-z0-9-]{8,64}$/.test(slug)
}

function fileFor(slug: string): string {
  return path.join(DIR, `${slug}.json`)
}

function readDoc(slug: string): GeoPublicDoc | null {
  if (!isSafeSlug(slug)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(slug), 'utf8')) as GeoPublicDoc
    if (!parsed || typeof parsed.slug !== 'string' || !Array.isArray(parsed.stores)) return null
    return parsed
  } catch {
    return null
  }
}

function listDocs(): GeoPublicDoc[] {
  let names: string[] = []
  try {
    names = fs.readdirSync(DIR)
  } catch {
    return []
  }
  const docs: GeoPublicDoc[] = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const doc = readDoc(name.slice(0, -5))
    if (doc) docs.push(doc)
  }
  return docs
}

function sendText(res: VercelResponse, status: number, type: string, body: string): void {
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.setHeader('X-Robots-Tag', 'index, follow')
  res.status(status).send(body)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const q = req.query ?? {}
  const format = String(q.format ?? '').trim().toLowerCase()
  const slug = String(q.slug ?? '').trim().toLowerCase()

  if (req.method === 'GET') {
    const base = origin()
    if (format === 'llms') {
      sendText(res, 200, 'text/plain; charset=utf-8', renderGeoPublicLlms(listDocs().map((doc) => ({ doc })), base))
      return
    }
    if (format === 'sitemap') {
      sendText(
        res,
        200,
        'application/xml; charset=utf-8',
        renderGeoPublicSitemap(listDocs().map((doc) => ({ doc })), base),
      )
      return
    }
    if (!slug) {
      res.status(200).json({
        ok: true,
        llms: geoPublicLlmsUrl(base),
        sitemap: geoPublicSitemapUrl(base),
      })
      return
    }
    const doc = readDoc(slug)
    if (!doc) {
      res.status(404).json({ ok: false, error: 'not_published' })
      return
    }
    if (format === 'html') {
      sendText(res, 200, 'text/html; charset=utf-8', renderGeoPublicHtml(doc, base))
      return
    }
    res.status(200).json({ ok: true, url: geoPublicHtmlUrl(doc.slug, base), doc })
    return
  }

  if (req.method === 'POST') {
    const auth = await requireMerchantRegistryAuth(req)
    if (!auth.ok) {
      res.status(auth.status).json({ ok: false, error: auth.error, message: auth.message })
      return
    }
    const slug = slugFromTenant(auth.tenantId)
    if (!isSafeSlug(slug)) {
      res.status(400).json({ ok: false, error: 'bad_tenant', message: '租户编号无法作为公开地址' })
      return
    }
    const body = (req.body ?? {}) as { brandName?: unknown; stores?: unknown }
    const stores = normalizeGeoPublicStores(body.stores)
    if (!stores.length) {
      res.status(400).json({ ok: false, error: 'no_stores', message: '没有可发布的门店名称' })
      return
    }
    const doc = buildGeoPublicDoc({
      slug,
      brandName: typeof body.brandName === 'string' ? body.brandName : '',
      stores,
    })
    fs.mkdirSync(DIR, { recursive: true })
    fs.writeFileSync(fileFor(slug), JSON.stringify(doc), 'utf8')
    const base = origin()
    res.status(200).json({
      ok: true,
      slug,
      url: geoPublicHtmlUrl(slug, base),
      llms: geoPublicLlmsUrl(base),
      sitemap: geoPublicSitemapUrl(base),
      citation: doc.citation,
      updatedAt: doc.updatedAt,
    })
    return
  }

  res.status(405).json({ ok: false, error: 'method_not_allowed' })
}
