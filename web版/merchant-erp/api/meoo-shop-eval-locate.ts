/**
 * POST /api/meoo-shop-eval-locate
 * 门店首次评估：高德省市区、地址定位、周边同类门店。不扣积分、不看会员。
 */
import fs from 'fs'
import path from 'path'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { loadTenantAiContextForUser } from '../vite-plugins/tenantMembershipCore.js'
import {
  amapGeocodeAddress,
  amapPlaceNearby,
  amapQueryForIndustry,
  isAmapMapConfigured,
} from '../vite-plugins/amapMapClient.js'
import { handleMerchantApiOptions, rawBody, sendMerchantJson } from './merchant/merchantGatewayShared.js'

export const config = { maxDuration: 30 }

const PAID_EVALS_PER_MONTH = 30
const FREE_EVALS_LIFETIME = 1
const QUOTA_DIR = path.join(process.cwd(), 'data', 'shop-eval-quota')

type EvalQuotaFile = { freeUsed?: number; month?: string; paidUsed?: number }

function shanghaiMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value || '1970'
  const m = parts.find((p) => p.type === 'month')?.value || '01'
  return `${y}-${m}`
}

function quotaPath(tenantId: string, userId: string) {
  const key = `${tenantId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(QUOTA_DIR, `${key}.json`)
}

function readQuotaFile(tenantId: string, userId: string): EvalQuotaFile {
  try {
    const raw = fs.readFileSync(quotaPath(tenantId, userId), 'utf8')
    const parsed = JSON.parse(raw) as EvalQuotaFile
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeQuotaFile(tenantId: string, userId: string, file: EvalQuotaFile) {
  if (!fs.existsSync(QUOTA_DIR)) fs.mkdirSync(QUOTA_DIR, { recursive: true })
  fs.writeFileSync(quotaPath(tenantId, userId), JSON.stringify(file), 'utf8')
}

function quotaSnapshot(file: EvalQuotaFile, paid: boolean) {
  const month = shanghaiMonth()
  if (paid) {
    const used = file.month === month ? Math.max(0, Math.floor(Number(file.paidUsed) || 0)) : 0
    return {
      paid: true,
      month,
      limit: PAID_EVALS_PER_MONTH,
      used,
      remaining: Math.max(0, PAID_EVALS_PER_MONTH - used),
      message: used >= PAID_EVALS_PER_MONTH ? '本月 30 次评估已用完，下月恢复' : '',
    }
  }
  const used = Math.max(0, Math.floor(Number(file.freeUsed) || 0))
  return {
    paid: false,
    month,
    limit: FREE_EVALS_LIFETIME,
    used,
    remaining: Math.max(0, FREE_EVALS_LIFETIME - used),
    message: used >= FREE_EVALS_LIFETIME ? '免费评估已用完。升级会员后每月可评估 30 次' : '',
  }
}

async function evalQuota(userId: string, env: Record<string, string>, token: string, consume: boolean) {
  const ctx = await loadTenantAiContextForUser(userId, env, token)
  if (!ctx?.tenantId) return { ok: false as const, message: '请先登录' }
  const paid = ctx.plan === 'member' || ctx.plan === 'member_store' || ctx.plan === 'member_plus'
  const file = readQuotaFile(ctx.tenantId, userId)
  const current = quotaSnapshot(file, paid)
  if (!consume) return { ok: true as const, ...current }
  if (current.remaining <= 0) return { ok: false as const, ...current }
  const month = current.month
  const next: EvalQuotaFile = {
    freeUsed: paid ? Math.max(0, Math.floor(Number(file.freeUsed) || 0)) : current.used + 1,
    month,
    paidUsed: paid ? current.used + 1 : file.month === month ? Math.max(0, Math.floor(Number(file.paidUsed) || 0)) : 0,
  }
  writeQuotaFile(ctx.tenantId, userId, next)
  return { ok: true as const, ...quotaSnapshot(next, paid) }
}

function amapKey(env: Record<string, string | undefined>) {
  return (
    env.AMAP_WEB_KEY?.trim() ||
    env.AMAP_MAP_KEY?.trim() ||
    env.GAODE_MAP_KEY?.trim() ||
    env.MERCHANT_AI_AMAP_KEY?.trim() ||
    ''
  )
}

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function brandCore(name: string) {
  return name
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/(南湖店|旗舰店|总店|分店)$/u, '')
    .replace(/店$/u, '')
    .replace(/[·•\s]/g, '')
    .trim()
}

function keepStoreTitle(title: string, core: string) {
  if (title.length < 8 || title.length > 140) return false
  if (/汉语词语|近义词|反义词|造句|百度百科|安全验证|搜狗搜索|相关搜索/.test(title)) return false
  if (core.length >= 2 && !title.includes(core)) return false
  return true
}

function parseSearchTitles(html: string, core: string) {
  const out: string[] = []
  const re = /<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi
  for (const block of html.matchAll(re)) {
    const title = stripTags(block[1] || '')
    if (!keepStoreTitle(title, core) || out.includes(title)) continue
    out.push(title)
    if (out.length >= 6) break
  }
  return out
}

async function publicTitlesFor(name: string, city: string) {
  const core = brandCore(name) || name.trim()
  const cityShort = city.replace(/市$/u, '').trim()
  const queries = [`${core} ${cityShort} 团购`, `${name} ${cityShort} 团购`, `${core} ${cityShort}`]
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q, i, all) => q.length >= 2 && all.indexOf(q) === i)
  const headers = {
    Accept: 'text/html',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  }
  const titles: string[] = []
  for (const query of queries) {
    if (titles.length >= 6) break
    try {
      const res = await fetch(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`, {
        headers,
        signal: AbortSignal.timeout(7000),
      })
      if (!res.ok) continue
      for (const title of parseSearchTitles(await res.text(), core)) {
        if (!titles.includes(title)) titles.push(title)
      }
    } catch {
      /* 下一条检索词 */
    }
  }
  return titles.slice(0, 8)
}

async function brandPlaces(name: string, city: string, env: Record<string, string | undefined>) {
  const key = amapKey(env)
  const token = name.trim()
  if (!key || token.length < 2) return { count: 0, names: [] as string[], note: '' }
  const qs = new URLSearchParams({
    key,
    keywords: token,
    offset: '20',
    page: '1',
    extensions: 'base',
    output: 'JSON',
  })
  if (city.trim()) {
    qs.set('city', city.trim())
    qs.set('citylimit', 'true')
  }
  const res = await fetch(`https://restapi.amap.com/v3/place/text?${qs.toString()}`, { signal: AbortSignal.timeout(8000) })
  const json = (await res.json()) as { status?: string; count?: string; pois?: Array<{ name?: string; address?: string }> }
  if (String(json.status) !== '1') return { count: 0, names: [] as string[], note: '' }
  const pois = (json.pois || []).filter((row) => String(row.name || '').includes(token))
  const listed = pois.length
  const reported = Number(json.count)
  const count = listed > 0 && listed === (json.pois || []).length && Number.isFinite(reported) && reported > listed ? reported : listed
  const names = pois.slice(0, 12).map((row) => {
    const addr = String(row.address || '').trim()
    return addr ? `${row.name}（${addr}）` : String(row.name || '')
  })
  const where = city.trim() || '全国'
  const note =
    count >= 2
      ? `高德在${where}按「${token}」检索到 ${count} 家同名门店：${names.join('、')}。这是连锁品牌，按品牌评估，不要写成单店。`
      : count === 1
        ? `高德在${where}只检索到 1 家名称含「${token}」的门店：${names[0] || token}。`
        : `高德在${where}没有检索到名称含「${token}」的门店。`
  return { count, names, note }
}

async function districtNames(keywords: string, env: Record<string, string | undefined>) {
  const key = amapKey(env)
  if (!key) return { ok: false as const, message: '未配置高德地图' }
  const qs = new URLSearchParams({
    key,
    keywords: keywords.trim() || '中国',
    subdistrict: '1',
    extensions: 'base',
    output: 'JSON',
  })
  const res = await fetch(`https://restapi.amap.com/v3/config/district?${qs.toString()}`)
  const json = (await res.json()) as { status?: string; info?: string; districts?: Array<{ districts?: Array<{ name?: string }> }> }
  if (String(json.status) !== '1') return { ok: false as const, message: String(json.info || '高德行政区查询失败') }
  const names = (json.districts?.[0]?.districts || [])
    .map((row) => String(row.name || '').trim())
    .filter(Boolean)
  return { ok: true as const, names }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }
  const env = process.env as Record<string, string>
  const session = await verifyBearerJwt(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined, env)
  if (!session) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录' })
    return
  }
  let body: { action?: string; keywords?: string; address?: string; city?: string; category?: string; storeName?: string; consume?: boolean }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  if (body.action === 'eval-quota') {
    const token = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
    const hit = await evalQuota(session.id, env, token, body.consume === true)
    sendMerchantJson(res, 200, hit as unknown as Record<string, unknown>)
    return
  }
  if (!isAmapMapConfigured(env)) {
    sendMerchantJson(res, 200, { ok: false, error: 'amap_unconfigured', message: '未配置高德地图' })
    return
  }
  if (body.action === 'districts') {
    const hit = await districtNames(String(body.keywords || '中国'), env)
    if (!hit.ok) {
      sendMerchantJson(res, 200, { ok: false, message: hit.message })
      return
    }
    sendMerchantJson(res, 200, { ok: true, names: hit.names })
    return
  }
  const address = String(body.address || '').trim()
  const city = String(body.city || '').trim()
  const category = String(body.category || '').trim()
  const storeName = String(body.storeName || '').trim()
  if (!address) {
    sendMerchantJson(res, 400, { ok: false, message: '请填写地址' })
    return
  }
  const geo = await amapGeocodeAddress(env, address, city)
  if (!geo.ok) {
    sendMerchantJson(res, 200, { ok: false, message: geo.message })
    return
  }
  const query = amapQueryForIndustry(category || '餐饮')
  const [nearby, brand, titles] = await Promise.all([
    amapPlaceNearby(env, { location: geo.location, query, radiusM: 3000, pageSize: 8 }),
    brandPlaces(storeName, city, env),
    storeName ? publicTitlesFor(storeName, city) : Promise.resolve([] as string[]),
  ])
  const pois = nearby.ok
    ? nearby.pois.slice(0, 8).map((poi) => ({
        name: poi.name,
        distanceM: poi.distanceM,
      }))
    : []
  const poiLine = pois.length
    ? pois.map((poi) => `${poi.name}${poi.distanceM != null ? ` ${poi.distanceM}米` : ''}`).join('；')
    : '3 公里内没有检索到同类门店'
  const mapNote = `高德已定位到该地址（坐标 ${geo.location.lng},${geo.location.lat}）。周边同类「${query}」是别的店，不能当成这家没有客流：${poiLine}。`
  sendMerchantJson(res, 200, {
    ok: true,
    location: geo.location,
    mapNote,
    pois,
    brandCount: brand.count,
    brandNames: brand.names,
    brandNote: brand.note,
    publicTitles: titles,
  })
}
