/**
 * PR 达人查验：公开主页解析 + 豆包分析。
 * 免费账号每月成功 1 次；会员不限次数，每次成功查验 5 积分（先套餐桶，再充值桶）。
 * 同一号 24 小时内读缓存，不重复扣。
 */
import fs from 'node:fs'
import path from 'node:path'
import type { MpAccountRow } from './mpAccountAuth.js'
import type { MpLibraryRole } from './mpMembershipCatalog.js'
import { currentGiftMonthKey } from './mpAiPointsBuckets.js'
import { talentEvalMonthlyLimit } from './mpMembershipQuota.js'
import { createRegistrySnapshotIoFetch } from './registrySnapshotIoFetch.js'
import { readAccountMpAiPointsBalance } from './mpAiPointsSpendCore.js'
import { spendMpAiPointsForSessionToken } from './mpAiPointsSpendSession.js'
import { MP_POINTS_XHS_CHECK_PER_USE } from './mpPointsEconomics.js'
import { runProfileLinkParseCore } from './profileLinkParseCore.js'

export const TALENT_CHECK_POINTS = 5
const CACHE_MS = 24 * 60 * 60 * 1000
const MAX_ROWS = 30

type CheckRow = { label: string; value: string; source: string }

export type TalentCheckView = {
  nickname: string
  account: string
  followersText: string
  signature: string
  avatarUrl: string
  direction: string
  recent: string[]
  summary: string
  sales30d: string
  /** 小红书查验才有。抖音记录没有这个字段。 */
  platform?: 'douyin' | 'xhs'
  engageText?: string
  /** 解读已按 PR 派单口径写过。旧缓存没有这段时会补写一次，不重复扣积分。 */
  readingReady?: boolean
  checkedAt: string
  checkedAtLabel: string
  cached: boolean
  charged: number
  balance: number | null
  rows: CheckRow[]
}

type CacheFile = { at: number; view: TalentCheckView }

function safeKey(value: string) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'unknown'
}

function quotaFile(accountId: string) {
  return path.join(process.cwd(), 'data', 'talent-check-quota', `${safeKey(accountId)}.json`)
}

function cacheFile(accountId: string, douyinKey: string) {
  return path.join(process.cwd(), 'data', 'talent-check-cache', `${safeKey(accountId)}__${safeKey(douyinKey)}.json`)
}

function readFreeUsed(accountId: string) {
  const month = currentGiftMonthKey()
  try {
    const parsed = JSON.parse(fs.readFileSync(quotaFile(accountId), 'utf8')) as { month?: string; used?: number }
    if (parsed.month !== month) return 0
    return Math.max(0, Math.floor(Number(parsed.used) || 0))
  } catch {
    return 0
  }
}

function writeFreeUsed(accountId: string) {
  const file = quotaFile(accountId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ month: currentGiftMonthKey(), used: 1 }))
}

function readCache(accountId: string, douyinKey: string): TalentCheckView | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile(accountId, douyinKey), 'utf8')) as CacheFile
    if (!parsed || typeof parsed.at !== 'number' || !parsed.view) return null
    if (Date.now() - parsed.at > CACHE_MS) return null
    return presentSales({ ...parsed.view, cached: true, charged: 0 })
  } catch {
    return null
  }
}

function writeCache(accountId: string, douyinKey: string, view: TalentCheckView) {
  const file = cacheFile(accountId, douyinKey)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ at: Date.now(), view }))
  rememberCheck(accountId, view)
}

const HISTORY_LIMIT = 30

function historyFile(accountId: string) {
  return path.join(process.cwd(), 'data', 'talent-check-history', `${safeKey(accountId)}.json`)
}

function readHistoryFile(accountId: string): TalentCheckView[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(historyFile(accountId), 'utf8')) as { records?: TalentCheckView[] }
    return Array.isArray(parsed.records) ? parsed.records : []
  } catch {
    return []
  }
}

function writeHistoryFile(accountId: string, records: TalentCheckView[]) {
  const file = historyFile(accountId)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({ records: records.slice(0, HISTORY_LIMIT) }))
}

function recordKey(view: TalentCheckView) {
  return normDouyinKey(view.account)
}

function rememberCheck(accountId: string, view: TalentCheckView) {
  const key = recordKey(view)
  if (!key) return
  const kept = readHistoryFile(accountId).filter((row) => recordKey(row) !== key)
  writeHistoryFile(accountId, [presentSales({ ...view, cached: false }), ...kept])
}

function listHistory(accountId: string): TalentCheckView[] {
  const saved = readHistoryFile(accountId)
  const seen = new Set(saved.map(recordKey).filter(Boolean))
  const dir = path.join(process.cwd(), 'data', 'talent-check-cache')
  const prefix = `${safeKey(accountId)}__`
  let names: string[] = []
  try {
    names = fs.readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
  } catch {
    names = []
  }
  const extra: TalentCheckView[] = []
  for (const name of names) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as CacheFile
      const view = parsed?.view
      const key = view ? recordKey(view) : ''
      if (!view || !key || seen.has(key)) continue
      seen.add(key)
      extra.push(presentSales({ ...view, cached: false }))
    } catch {
      /* 跳过坏缓存 */
    }
  }
  const records = [...saved, ...extra]
    .sort((a, b) => String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')))
    .slice(0, HISTORY_LIMIT)
  if (extra.length) writeHistoryFile(accountId, records)
  return records
}

function deleteCache(accountId: string, douyinKey: string) {
  try {
    fs.unlinkSync(cacheFile(accountId, douyinKey))
  } catch {
    /* 没有缓存 */
  }
}

export function normDouyinKey(raw: string) {
  return String(raw || '')
    .trim()
    .replace(/^@/, '')
    .replace(/\s+/g, '')
    .toLowerCase()
    .slice(0, 120)
}

function followersText(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '未公开'
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `${text}万`
  }
  return n.toLocaleString('zh-CN')
}

function checkedClock(iso: string) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return parts
}

const SALES_UNKNOWN = '公开信息不足，暂不估算'

function wanOf(n: number, unit: string | undefined): number {
  if (unit === '千') return n / 10
  if (unit === '元') return n / 10000
  if (unit === '万') return n
  if (n >= 10000) return n / 10000
  return n
}

function salesCenterWan(text: string): number | null {
  const range = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(万|千|元)?\s*[–—\-~到至]\s*([0-9]+(?:\.[0-9]+)?)\s*(万|千|元)?/)
  if (range) {
    const unit = range[4] || range[2] || ''
    const a = wanOf(Number(range[1]), range[2] || unit)
    const b = wanOf(Number(range[3]), range[4] || range[2] || unit)
    if (a > 0 && b > 0) return (a + b) / 2
  }
  const one = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(万|千|元)/)
  if (one) {
    const value = wanOf(Number(one[1]), one[2])
    if (value > 0) return value
  }
  const yuan = text.match(/([0-9][0-9,]{3,})/)
  if (yuan) {
    const n = Number(yuan[1]!.replace(/,/g, ''))
    if (n >= 10000) return n / 10000
  }
  return null
}

function formatSalesBand(centerWan: number): string {
  const lo = centerWan * 0.95
  const hi = centerWan * 1.05
  const snap = (value: number, mode: 'up' | 'down', digits: number) => {
    const factor = 10 ** digits
    const scaled = value * factor
    const n = mode === 'up' ? Math.ceil(scaled - 1e-9) : Math.floor(scaled + 1e-9)
    return n / factor
  }
  const textOf = (n: number) => {
    if (Number.isInteger(n)) return String(n)
    const one = Math.round(n * 10) / 10
    if (Math.abs(one - n) < 1e-9) return one.toFixed(1).replace(/\.0$/, '')
    return n.toFixed(2).replace(/0$/, '')
  }
  let digits = centerWan >= 20 ? 0 : 1
  let loShown = snap(lo, 'up', digits)
  let hiShown = snap(hi, 'down', digits)
  if (!(loShown < hiShown)) {
    digits = 2
    loShown = snap(lo, 'up', digits)
    hiShown = snap(hi, 'down', digits)
  }
  if (!(loShown < hiShown)) return `约 ${textOf(Math.round(centerWan * 100) / 100)}万`
  return `约 ${textOf(loShown)}万–${textOf(hiShown)}万`
}

export function cleanSales30d(raw: unknown): string {
  const text = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!text) return SALES_UNKNOWN
  if (/不足|无法|看不出|没有带货|暂不/.test(text)) return SALES_UNKNOWN
  const center = salesCenterWan(text)
  if (center == null || !Number.isFinite(center) || center <= 0) return SALES_UNKNOWN
  return formatSalesBand(center)
}

function presentSales(view: TalentCheckView): TalentCheckView {
  const sales30d = cleanSales30d(view.sales30d)
  const rows = (view.rows || []).map((row) =>
    row.label === '近30天带货金额' ? { ...row, value: sales30d, source: '' } : row,
  )
  return { ...view, sales30d, rows }
}

export function readAnalysisJson(text: string): { summary: string; direction: string; recent: string[]; sales30d: string } | null {
  const raw = String(text || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const j = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: unknown
      direction?: unknown
      recent?: unknown
      sales30d?: unknown
    }
    const summary = String(j.summary || '').trim()
    if (summary.length < 20) return null
    const direction = String(j.direction || '').trim().slice(0, 16)
    const recent = Array.isArray(j.recent)
      ? j.recent.map((item) => String(item || '').trim()).filter((item) => item.length >= 2).slice(0, 3)
      : []
    return { summary: summary.slice(0, 420), direction, recent, sales30d: cleanSales30d(j.sales30d) }
  } catch {
    return null
  }
}

function buildView(input: {
  nickname: string
  account: string
  followers: number
  signature: string
  avatarUrl: string
  direction: string
  recent: string[]
  summary: string
  sales30d: string
  checkedAt: string
  cached: boolean
  charged: number
  balance: number | null
}): TalentCheckView {
  const sales30d = input.sales30d || SALES_UNKNOWN
  const rows: CheckRow[] = [
    { label: '昵称', value: input.nickname || '未公开', source: '公开主页' },
    { label: '抖音号', value: input.account || '未公开', source: '公开主页' },
    { label: '粉丝', value: followersText(input.followers), source: '公开主页' },
    { label: '签名', value: input.signature || '未公开', source: '公开主页' },
  ]
  if (input.direction) rows.push({ label: '内容方向', value: input.direction, source: '抖音官方数据检索' })
  rows.push({ label: '近30天带货金额', value: sales30d, source: '' })
  if (input.recent.length) rows.push({ label: '近期内容', value: input.recent.join('、'), source: '抖音官方数据检索' })
  rows.push({ label: '说明', value: input.summary, source: '抖音官方数据检索' })
  return {
    nickname: input.nickname,
    account: input.account,
    followersText: followersText(input.followers),
    signature: input.signature,
    avatarUrl: input.avatarUrl,
    direction: input.direction,
    recent: input.recent,
    summary: input.summary,
    sales30d,
    readingReady: String(input.summary || '').trim().length >= 120,
    checkedAt: input.checkedAt,
    checkedAtLabel: checkedClock(input.checkedAt),
    cached: input.cached,
    charged: input.charged,
    balance: input.balance,
    rows,
  }
}

export function parseCheckSheet(text: string): { rows: { douyinId: string; nickname: string }[]; truncated: boolean } {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rows: { douyinId: string; nickname: string }[] = []
  for (const line of lines) {
    const cells = line.split(/[,，\t]/).map((cell) => cell.trim().replace(/^"|"$/g, ''))
    const id = cells[0] || ''
    if (!id || /抖音号|账号|douyin/i.test(id)) continue
    rows.push({ douyinId: id.slice(0, 200), nickname: (cells[1] || '').slice(0, 40) })
    if (rows.length >= MAX_ROWS) break
  }
  return { rows, truncated: lines.length > rows.length + 1 }
}

async function sheetRowsFromBody(body: Record<string, unknown>) {
  const csvText = String(body.csvText || '')
  if (csvText.trim()) return parseCheckSheet(csvText)
  const fileBase64 = String(body.fileBase64 || '').trim()
  if (!fileBase64) return { rows: [] as { douyinId: string; nickname: string }[], truncated: false }
  const buf = Buffer.from(fileBase64, 'base64')
  if (buf.length > 2_000_000) {
    throw new Error('表格过大，请控制在 2MB 以内')
  }
  const XLSX = await import('xlsx')
  const book = XLSX.read(buf, { type: 'buffer' })
  const name = book.SheetNames[0]
  const sheet = name ? book.Sheets[name] : null
  if (!sheet) return { rows: [] as { douyinId: string; nickname: string }[], truncated: false }
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: false })
  const lines = grid
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell || '').trim()).join(',') : ''))
    .filter(Boolean)
  return parseCheckSheet(lines.join('\n'))
}

async function askDoubao(nickname: string, account: string, followersLabel: string, signature: string) {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('../../vite-plugins/merchantRegistryVendorEnv.js')
  const { callDoubaoWebSearch } = await import('../../vite-plugins/merchantAiUpstream.js')
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), process.env as Record<string, string>)
  const key = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
  if (!key) throw new Error('豆包暂不可用，请稍后再试')
  const system = [
    '你是本地生活 PR 的选号助手。只根据这次联网检索到的公开主页回答。',
    '不要编造粉丝数、播放量、报价、GMV、手机号或微信。粉丝数以用户消息里给出的公开资料为准，不要改写。看不出的就写看不出。',
    '近30天带货金额只写一个中位估算，用「约 N万」。不要自己写宽区间，不要写成官方精确成交，不要写成精确到元的数字。',
    'summary 是给 PR 派单用的解读，180到320字，写成完整的几句话，不要只写一句账号介绍。',
    'summary 必须覆盖三件事：这个号的内容调性和观众是谁；适合合作的商家品类和内容形式（探店、团购、口播，按公开内容判断，不适合就写不适合）；派单时 brief 要写清什么、要避开什么。',
    '只输出一个 JSON 对象，不要 Markdown。',
    '键：summary（180到320字的 PR 派单解读）、direction（8个字以内的内容方向）、recent（最多3条公开作品标题，没有就空数组）、sales30d（近30天带货金额中位数，必须带「约」和「万」，例如「约 20万」。按公开内容、粉丝量和带货痕迹估算；看不出带货就写「公开信息不足，暂不估算」）。',
  ].join('')
  const user = [
    `抖音号：${account || '未公开'}`,
    `昵称：${nickname || '未公开'}`,
    `粉丝：${followersLabel || '未公开'}`,
    `签名：${signature || '未公开'}`,
    '请联网检索这一个抖音账号的公开主页和近期内容。先估算近30天带货金额中位数，再站在 PR 派单角度写解读：适合什么商家、用什么内容形式、brief 要避开什么。',
  ].join('\n')
  const hit = await callDoubaoWebSearch(key, env, system, user)
  return readAnalysisJson(hit.text)
}

function withSales(view: TalentCheckView, sales30d: string): TalentCheckView {
  const rows = (view.rows || []).filter((row) => row.label !== '近30天带货金额')
  const at = rows.findIndex((row) => row.label === '内容方向')
  rows.splice(at >= 0 ? at + 1 : rows.length, 0, { label: '近30天带货金额', value: sales30d, source: '' })
  return { ...view, sales30d, rows, cached: true, charged: 0 }
}

async function ensureSales(accountId: string, keys: string[], view: TalentCheckView): Promise<TalentCheckView> {
  if (view.platform === 'xhs') return view
  if (String(view.sales30d || '').trim()) return view
  let analysis: { sales30d: string } | null = null
  try {
    analysis = await askDoubao(view.nickname, view.account, view.followersText || '未公开', view.signature || '')
  } catch {
    return view
  }
  if (!analysis) return view
  const next = withSales(view, analysis.sales30d || SALES_UNKNOWN)
  for (const key of Array.from(new Set(keys.filter(Boolean)))) writeCache(accountId, key, next)
  return next
}

function withReading(
  view: TalentCheckView,
  analysis: { summary: string; direction: string; recent: string[]; sales30d: string },
): TalentCheckView {
  const sales30d = cleanSales30d(analysis.sales30d || view.sales30d)
  const direction = analysis.direction || view.direction
  const recent = analysis.recent.length ? analysis.recent : view.recent
  const rows = (view.rows || []).map((row) => {
    if (row.label === '说明') return { ...row, value: analysis.summary }
    if (row.label === '内容方向' && direction) return { ...row, value: direction }
    if (row.label === '近期内容' && recent.length) return { ...row, value: recent.join('、') }
    if (row.label === '近30天带货金额') return { ...row, value: sales30d, source: '' }
    return row
  })
  return presentSales({
    ...view,
    summary: analysis.summary,
    direction,
    recent,
    sales30d,
    rows,
    readingReady: true,
    cached: true,
    charged: 0,
  })
}

async function ensureReading(accountId: string, keys: string[], view: TalentCheckView): Promise<TalentCheckView> {
  if (view.platform === 'xhs') return view
  if (view.readingReady || String(view.summary || '').trim().length >= 120) return view
  let analysis: { summary: string; direction: string; recent: string[]; sales30d: string } | null = null
  try {
    analysis = await askDoubao(view.nickname, view.account, view.followersText || '未公开', view.signature || '')
  } catch {
    return view
  }
  if (!analysis || String(analysis.summary || '').trim().length < 40) return view
  const next = withReading(view, analysis)
  for (const key of Array.from(new Set(keys.filter(Boolean)))) writeCache(accountId, key, next)
  return next
}

function upgradeBody() {
  return {
    ok: false,
    error: 'upgrade_membership',
    message: '本月免费查验已用完，下月恢复。升级会员后按积分查验，不限次数。',
  }
}

function findCached(accountId: string, keys: string[]) {
  for (const key of keys) {
    if (!key) continue
    const hit = readCache(accountId, key)
    if (hit) return hit
  }
  return null
}

export async function runTalentAccountCheck(opts: {
  supabaseUrl: string
  serviceRole: string
  token: string
  account: MpAccountRow
  body: Record<string, unknown>
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const roleRaw = String(opts.body.billingRole || opts.body.libraryRole || '').trim().toLowerCase()
  const roleHint: MpLibraryRole | undefined =
    roleRaw === 'pr' || roleRaw === 'talent' || roleRaw === 'shoot' || roleRaw === 'edit' ? roleRaw : undefined
  if (roleHint !== 'pr') {
    return { status: 200, body: { ok: false, error: 'pr_only', message: '达人查验只在 PR 身份下使用' } }
  }
  const accountId = String(opts.account.id || '').trim()
  if (!accountId) return { status: 200, body: { ok: false, error: 'not_found', message: '请先登录' } }

  const io = createRegistrySnapshotIoFetch(opts.supabaseUrl, opts.serviceRole)
  const data = await io.load()
  const plan = talentEvalMonthlyLimit(data, opts.account, { roleHint: 'pr' })
  const member = plan.paid
  const balance = readAccountMpAiPointsBalance(data, opts.account, { roleHint: 'pr' })
  const freeUsed = readFreeUsed(accountId)
  const freeRemaining = member ? 0 : Math.max(0, 1 - freeUsed)
  const mode = String(opts.body.mode || 'status').trim()
  const platform = String(opts.body.platform || 'douyin').trim().toLowerCase()
  if (mode !== 'status' && mode !== 'history' && platform && platform !== 'douyin' && platform !== 'xhs') {
    const names: Record<string, string> = { kuaishou: '快手', dianping: '大众点评', channels: '视频号' }
    const name = names[platform] || '该平台'
    return { status: 200, body: { ok: false, error: 'platform_closed', message: `${name}尚未开放，目前只能查验抖音和小红书` } }
  }
  if (platform === 'xhs' && (mode === 'parse_sheet' || mode === 'quote')) {
    return { status: 200, body: { ok: false, error: 'platform_closed', message: '小红书目前只支持单个查验' } }
  }

  if (mode === 'history') {
    return { status: 200, body: { ok: true, records: listHistory(accountId) } }
  }

  if (mode === 'status') {
    return {
      status: 200,
      body: {
        ok: true,
        member,
        freeRemaining,
        pointsPerCheck: TALENT_CHECK_POINTS,
        xhsPointsPerCheck: MP_POINTS_XHS_CHECK_PER_USE,
        pointsBalance: balance,
        hint: member
          ? '会员不限次数。查验失败不扣除积分，先扣套餐积分，再扣充值积分。'
          : freeRemaining > 0
            ? '免费版本月还可成功查验 1 次。'
            : '本月免费次数已用完，下月恢复。升级会员后按积分查验。',
      },
    }
  }

  if (mode === 'parse_sheet' || mode === 'quote') {
    if (!member) return { status: 200, body: upgradeBody() }
  }

  if (mode === 'parse_sheet') {
    try {
      const parsed = await sheetRowsFromBody(opts.body)
      if (!parsed.rows.length) {
        return { status: 200, body: { ok: false, error: 'empty_sheet', message: '表格里没有抖音号。第一列填抖音号，昵称可以空着。' } }
      }
      return { status: 200, body: { ok: true, rows: parsed.rows, truncated: parsed.truncated, limit: MAX_ROWS } }
    } catch (e) {
      const message = e instanceof Error ? e.message : '表格读取失败'
      return { status: 200, body: { ok: false, error: 'sheet_failed', message } }
    }
  }

  if (mode === 'quote') {
    const queries = Array.isArray(opts.body.queries) ? opts.body.queries.map((item) => String(item || '').trim()).filter(Boolean) : []
    const unique = Array.from(new Set(queries.map(normDouyinKey))).filter(Boolean).slice(0, MAX_ROWS)
    if (!unique.length) {
      return { status: 200, body: { ok: false, error: 'empty_sheet', message: '请先放入要查的抖音号' } }
    }
    let cached = 0
    for (const key of unique) {
      if (readCache(accountId, key)) cached += 1
    }
    const chargeCount = unique.length - cached
    const pointsRequired = chargeCount * TALENT_CHECK_POINTS
    return {
      status: 200,
      body: {
        ok: balance >= pointsRequired,
        error: balance >= pointsRequired ? '' : 'insufficient_points',
        message:
          balance >= pointsRequired
            ? ''
            : `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${pointsRequired.toLocaleString('zh-CN')}），请充值积分或升级套餐后再试`,
        count: unique.length,
        cached,
        chargeCount,
        pointsRequired,
        pointsBalance: balance,
        pointsPerCheck: TALENT_CHECK_POINTS,
      },
    }
  }

  if (platform === 'xhs') {
    return runXhsAccountCheck(opts, { accountId, member, freeRemaining, balance })
  }

  const query = String(opts.body.query || '').trim()
  if (!query) return { status: 200, body: { ok: false, error: 'missing_query', message: '请输入抖音号、分享口令或主页链接' } }
  const inputKey = normDouyinKey(query)
  const cachedFirst = findCached(accountId, [inputKey])
  if (cachedFirst) {
    const withSalesView = await ensureSales(accountId, [inputKey, normDouyinKey(cachedFirst.account)], cachedFirst)
    const view = await ensureReading(accountId, [inputKey, normDouyinKey(cachedFirst.account)], withSalesView)
    return { status: 200, body: { ok: true, view, member, freeRemaining, pointsBalance: balance, pointsPerCheck: TALENT_CHECK_POINTS } }
  }
  if (!member && freeRemaining <= 0) return { status: 200, body: upgradeBody() }
  if (member && balance < TALENT_CHECK_POINTS) {
    return {
      status: 200,
      body: {
        ok: false,
        error: 'insufficient_points',
        message: `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${TALENT_CHECK_POINTS}），请充值积分或升级套餐后再试`,
        required: TALENT_CHECK_POINTS,
        balance,
      },
    }
  }

  const parsed = await runProfileLinkParseCore({ link: query, platform: '抖音' })
  if (!parsed.ok) {
    return { status: 200, body: { ok: false, error: 'parse_failed', message: parsed.message || '没有查到这个抖音号的公开主页' } }
  }
  const accountKey = normDouyinKey(parsed.platformAccount)
  const cachedParsed = findCached(accountId, [accountKey, inputKey])
  if (cachedParsed) {
    const withSalesView = await ensureSales(accountId, [accountKey, inputKey], cachedParsed)
    const view = await ensureReading(accountId, [accountKey, inputKey], withSalesView)
    return { status: 200, body: { ok: true, view, member, freeRemaining, pointsBalance: balance, pointsPerCheck: TALENT_CHECK_POINTS } }
  }

  let analysis: { summary: string; direction: string; recent: string[]; sales30d: string } | null = null
  try {
    analysis = await askDoubao(
      parsed.platformNickname,
      parsed.platformAccount,
      parsed.followers > 0 ? followersText(parsed.followers) : '未公开',
      String(parsed.signature || ''),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : '豆包分析失败'
    return { status: 200, body: { ok: false, error: 'analysis_failed', message } }
  }
  if (!analysis) {
    return { status: 200, body: { ok: false, error: 'analysis_incomplete', message: '豆包这次没有写完分析，未扣积分。请再查一次。' } }
  }

  const checkedAt = new Date().toISOString()
  const view = buildView({
    nickname: parsed.platformNickname,
    account: parsed.platformAccount,
    followers: parsed.followers,
    signature: String(parsed.signature || ''),
    avatarUrl: String(parsed.avatarUrl || ''),
    direction: analysis.direction,
    recent: analysis.recent,
    summary: analysis.summary,
    sales30d: analysis.sales30d,
    checkedAt,
    cached: false,
    charged: member ? TALENT_CHECK_POINTS : 0,
    balance: null,
  })
  const keys = Array.from(new Set([accountKey, inputKey].filter(Boolean)))
  for (const key of keys) writeCache(accountId, key, view)

  if (!member) {
    writeFreeUsed(accountId)
    return {
      status: 200,
      body: {
        ok: true,
        view: { ...view, charged: 0 },
        member: false,
        freeRemaining: 0,
        pointsBalance: balance,
        pointsPerCheck: TALENT_CHECK_POINTS,
      },
    }
  }

  const daySlot = Math.floor(Date.now() / 86400000)
  const spent = await spendMpAiPointsForSessionToken(opts.supabaseUrl, opts.serviceRole, opts.token, {
    kind: 'talent_check',
    idempotencyKey: `talent-check:${accountId}:${accountKey || inputKey}:${daySlot}`,
    note: `达人查验 ${parsed.platformNickname || parsed.platformAccount}`,
    roleHint: 'pr',
  })
  if (!spent.ok) {
    for (const key of keys) deleteCache(accountId, key)
    return {
      status: 200,
      body: {
        ok: false,
        error: spent.error || 'insufficient_points',
        message: spent.message || '积分不足，请充值积分或升级套餐后再试',
        required: TALENT_CHECK_POINTS,
        balance,
      },
    }
  }
  const charged = spent.already ? 0 : spent.pointsCharged
  const nextBalance = spent.newBalance
  const saved = { ...view, charged, balance: nextBalance }
  for (const key of keys) writeCache(accountId, key, saved)
  return {
    status: 200,
    body: {
      ok: true,
      view: saved,
      member: true,
      freeRemaining: 0,
      pointsBalance: nextBalance,
      pointsPerCheck: TALENT_CHECK_POINTS,
    },
  }
}

const XHS_MODEL = 'doubao-seed-1-8-251228'

function rnoteApiKey() {
  const raw = String(process.env.RNOTE_API_KEY || '').trim()
  if (!raw) return ''
  return raw.startsWith('sk-') ? raw : `sk-${raw}`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function unwrapRnote(body: Record<string, unknown>) {
  const level1 = asRecord(body.data)
  const level2 = asRecord(level1.data)
  return Object.keys(level2).length ? level2 : level1
}

function firstUrl(text: string) {
  const matched = text.match(/https?:\/\/[^\s]+/i)
  return matched ? matched[0].replace(/[)），。]+$/, '') : ''
}

function xhsUserIdIn(text: string) {
  const profile = text.match(/\/user\/profile\/([0-9a-f]{24})/i)
  if (profile) return profile[1]!.toLowerCase()
  const bare = text.trim().match(/^[0-9a-f]{24}$/i)
  return bare ? bare[0].toLowerCase() : ''
}

function xhsNoteIdIn(text: string) {
  const note = text.match(/\/(?:explore|discovery\/item|item)\/([0-9a-f]{24})/i)
  return note ? note[1]!.toLowerCase() : ''
}

async function rnoteGet(path: string, params: Record<string, string>) {
  const key = rnoteApiKey()
  if (!key) throw new Error('小红书查验还没配好，请稍后再试')
  const url = new URL(path, 'https://rnote.dev')
  for (const [name, value] of Object.entries(params)) {
    if (value) url.searchParams.set(name, value)
  }
  const res = await fetch(url, {
    headers: { 'X-API-Key': key, accept: 'application/json' },
    signal: AbortSignal.timeout(25_000),
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const detail = String(body.error || body.detail || '')
  if (res.status === 402 || /余额不足/.test(detail)) {
    throw new Error('小红书数据接口余额不足，请充值后再查')
  }
  if (res.status === 401 || /无效的 API Key/.test(detail)) throw new Error('小红书查验密钥无效')
  if (!res.ok || body.success === false) throw new Error(detail || '没有查到这个小红书账号')
  return body
}

function collectXhsUsers(value: unknown, out: { userId: string; nickname: string; redId: string }[], depth = 0) {
  if (depth > 6 || value == null) return
  if (Array.isArray(value)) {
    for (const item of value) collectXhsUsers(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const row = value as Record<string, unknown>
  const named = String(row.userid || row.user_id || row.userId || '').trim().toLowerCase()
  const bare = String(row.id || '').trim().toLowerCase()
  const userId = /^[0-9a-f]{24}$/.test(named)
    ? named
    : /^[0-9a-f]{24}$/.test(bare) && (row.red_id || row.nickname || row.name)
      ? bare
      : ''
  if (userId && !out.some((item) => item.userId === userId)) {
    out.push({
      userId,
      nickname: String(row.nickname || row.name || '').trim(),
      redId: String(row.red_id || '').trim(),
    })
  }
  for (const child of Object.values(row)) {
    if (child && typeof child === 'object') collectXhsUsers(child, out, depth + 1)
  }
}

function pickXhsUser(body: unknown, query: string) {
  const found: { userId: string; nickname: string; redId: string }[] = []
  collectXhsUsers(body, found)
  const want = query.trim()
  return found.find((item) => item.redId && item.redId === want) || found[0] || null
}

async function resolveXhsUserId(query: string) {
  let text = query.trim()
  const url = firstUrl(text)
  if (url && /xhslink\.com|xhs\.cn/i.test(url)) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8_000) })
      if (res.url) text = `${text}\n${res.url}`
    } catch {
      /* 短链打不开就继续用原文 */
    }
  }
  const direct = xhsUserIdIn(text)
  if (direct) return { userId: direct, nickname: '' }
  const noteId = xhsNoteIdIn(text)
  if (noteId) {
    for (const path of ['/api/v2/crawler/note/image', '/api/v2/crawler/note/video']) {
      try {
        const body = await rnoteGet(path, { note_id: noteId })
        const hit = pickXhsUser(body, text)
        if (hit) return hit
      } catch (err) {
        const message = err instanceof Error ? err.message : ''
        if (/余额不足|密钥无效/.test(message)) throw err
      }
    }
  }
  const keyword = text.replace(/https?:\/\/\S+/g, '').trim() || text
  const body = await rnoteGet('/api/v2/crawler/search/users', { keyword: keyword.slice(0, 40), page: '1' })
  const hit = pickXhsUser(body, keyword)
  if (!hit) throw new Error('没有查到这个小红书账号。请换主页链接或小红书号。')
  return hit
}

function countOf(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function avgOf(nums: number[]) {
  if (!nums.length) return 0
  return Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length)
}

type XhsFacts = {
  userId: string
  redId: string
  nickname: string
  signature: string
  avatarUrl: string
  fans: number
  liked: number
  collected: number
  follows: number
  notes: number
  engageText: string
  recent: string[]
  brief: string
}

async function loadXhsFacts(userId: string, nicknameHint: string): Promise<XhsFacts> {
  const infoBody = await rnoteGet('/api/v2/crawler/user/info', { user_id: userId })
  const info = unwrapRnote(infoBody)
  const postedBody = await rnoteGet('/api/v2/crawler/user/posted', { user_id: userId, num: '20' })
  const posted = unwrapRnote(postedBody)
  const notes = Array.isArray(posted.notes) ? posted.notes.map(asRecord) : []
  const titles: string[] = []
  const likes: number[] = []
  const collects: number[] = []
  const lines: string[] = []
  for (const note of notes) {
    const title = String(note.display_title || note.title || '').trim()
    if (title && titles.length < 3) titles.push(title.slice(0, 40))
    const like = countOf(note.likes)
    const collect = countOf(note.collected_count)
    likes.push(like)
    collects.push(collect)
    if (lines.length < 8 && title) {
      lines.push(`${title.slice(0, 40)}｜赞${like}｜藏${collect}｜评${countOf(note.comments_count)}${note.is_goods_note ? '｜商品笔记' : ''}`)
    }
  }
  const likeAvg = avgOf(likes)
  const collectAvg = avgOf(collects)
  const engageText = notes.length ? `近期${notes.length}篇，篇均赞${followersText(likeAvg)}，篇均藏${followersText(collectAvg)}` : '近期笔记未公开'
  const ip = String(info.ip_location || '').trim()
  const desc = String(info.desc || '').trim()
  const verify = String(info.red_official_verify_content || '').trim()
  return {
    userId,
    redId: String(info.red_id || '').trim(),
    nickname: String(info.nickname || nicknameHint || '').trim(),
    signature: [desc, ip ? `IP ${ip}` : ''].filter(Boolean).join(' · '),
    avatarUrl: String(info.images || info.imageb || '').trim(),
    fans: countOf(info.fans),
    liked: countOf(info.liked),
    collected: countOf(info.collected),
    follows: countOf(info.follows),
    notes: countOf(asRecord(info.note_num_stat).posted || info.ndiscovery),
    engageText,
    recent: titles,
    brief: [
      `小红书号：${String(info.red_id || '未公开')}`,
      `昵称：${String(info.nickname || nicknameHint || '未公开')}`,
      `粉丝：${followersText(countOf(info.fans))}`,
      `关注：${followersText(countOf(info.follows))}`,
      `获赞：${followersText(countOf(info.liked))}`,
      `收藏：${followersText(countOf(info.collected))}`,
      `笔记数：${followersText(countOf(asRecord(info.note_num_stat).posted || info.ndiscovery))}`,
      `简介：${desc || '未公开'}`,
      ip ? `IP属地：${ip}` : '',
      verify ? `认证：${verify}` : '',
      engageText,
      lines.length ? `近期笔记：\n${lines.join('\n')}` : '近期笔记未公开',
    ]
      .filter(Boolean)
      .join('\n'),
  }
}

function responsesText(data: Record<string, unknown>) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim()
  const output = data.output
  if (!Array.isArray(output)) return ''
  const parts: string[] = []
  for (const item of output) {
    const rec = asRecord(item)
    const blocks = Array.isArray(rec.content) ? rec.content : []
    for (const block of blocks) {
      const text = asRecord(block).text
      if (typeof text === 'string' && text.trim()) parts.push(text.trim())
    }
  }
  return parts.join('\n').trim()
}

async function askXhsDoubao(facts: string) {
  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('../../vite-plugins/merchantRegistryVendorEnv.js')
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(process.cwd(), process.env as Record<string, string>)
  const key = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
  if (!key) throw new Error('豆包暂不可用，请稍后再试')
  const raw = String(env.MERCHANT_AI_DOUBAO_ARK_BASE || '').trim().replace(/\/$/, '')
  const root = !raw ? 'https://ark.cn-beijing.volces.com/api/v3' : raw.endsWith('/api/v3') ? raw : `${raw}/api/v3`
  const system = [
    '你是本地生活 PR 的小红书选号助手。',
    '粉丝、获赞、收藏、笔记数、篇均赞藏以用户消息里的公开资料为准，不要改写。联网只用来核对内容调性，对不上就以资料为准。',
    '不要编造报价、GMV、手机号或微信。小红书公开笔记没有成交金额，sales30d 固定写「公开信息不足，暂不估算」。',
    'summary 是给 PR 派单用的解读，180到320字，覆盖三件事：内容调性和观众是谁；适合合作的商家品类和内容形式；brief 要写清什么、要避开什么。',
    '只输出一个 JSON 对象，不要 Markdown。',
    '键：summary、direction（8个字以内）、recent（最多3条，优先抄资料里的笔记标题）、sales30d。',
  ].join('')
  const user = `${facts}\n请联网检索这个小红书账号的公开内容，再按资料里的数字写 PR 派单解读。`
  const post = async (web: boolean) => {
    const res = await fetch(`${root}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: XHS_MODEL,
        stream: false,
        ...(web ? { tools: [{ type: 'web_search', max_keyword: 3, limit: 5, sources: ['search_engine'] }] } : {}),
        thinking: { type: 'disabled' },
        input: [
          { role: 'system', content: [{ type: 'input_text', text: system }] },
          { role: 'user', content: [{ type: 'input_text', text: user }] },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const err = asRecord(data.error)
      throw new Error(String(err.message || `豆包分析失败`))
    }
    const text = responsesText(data)
    if (!text) throw new Error('豆包这次没有写完分析')
    return text
  }
  let text = ''
  try {
    text = await post(true)
  } catch {
    try {
      text = await post(false)
    } catch {
      text = ''
    }
  }
  const parsed = text ? readAnalysisJson(text) : null
  if (parsed) return parsed
  const { callDoubaoWebSearch } = await import('../../vite-plugins/merchantAiUpstream.js')
  try {
    const hit = await callDoubaoWebSearch(key, env, system, user)
    const again = readAnalysisJson(hit.text)
    if (again) return again
  } catch (err) {
    const message = err instanceof Error ? err.message : ''
    if (/endpoint that is currently closed|temporarily unavailable|Request id/i.test(message)) {
      throw new Error('豆包分析暂时不可用，未扣积分。请稍后再查。')
    }
    throw err instanceof Error ? err : new Error('豆包分析失败')
  }
  throw new Error('豆包这次没有写完分析，未扣积分。请再查一次。')
}

function buildXhsView(facts: XhsFacts, direction: string, summary: string, checkedAt: string, charged: number, balance: number | null): TalentCheckView {
  const praise = followersText(facts.liked + facts.collected)
  const rows: CheckRow[] = [
    { label: '昵称', value: facts.nickname || '未公开', source: '公开主页' },
    { label: '小红书号', value: facts.redId || '未公开', source: '公开主页' },
    { label: '粉丝', value: followersText(facts.fans), source: '公开主页' },
    { label: '简介', value: facts.signature || '未公开', source: '公开主页' },
    { label: '获赞与收藏', value: praise, source: '公开主页' },
  ]
  if (direction) rows.push({ label: '内容方向', value: direction, source: '豆包联网' })
  rows.push({ label: '近期篇均互动', value: facts.engageText, source: '公开笔记' })
  if (facts.recent.length) rows.push({ label: '近期内容', value: facts.recent.join('、'), source: '公开笔记' })
  rows.push({ label: '说明', value: summary, source: '豆包联网' })
  return {
    nickname: facts.nickname,
    account: facts.redId || facts.userId,
    followersText: followersText(facts.fans),
    signature: facts.signature,
    avatarUrl: facts.avatarUrl,
    direction,
    recent: facts.recent,
    summary,
    sales30d: SALES_UNKNOWN,
    platform: 'xhs',
    engageText: facts.engageText,
    readingReady: summary.trim().length >= 120,
    checkedAt,
    checkedAtLabel: checkedClock(checkedAt),
    cached: false,
    charged,
    balance,
    rows,
  }
}

async function runXhsAccountCheck(
  opts: {
    supabaseUrl: string
    serviceRole: string
    token: string
    account: MpAccountRow
    body: Record<string, unknown>
  },
  gate: { accountId: string; member: boolean; freeRemaining: number; balance: number },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { accountId, member, freeRemaining, balance } = gate
  const query = String(opts.body.query || '').trim()
  if (!query) return { status: 200, body: { ok: false, error: 'missing_query', message: '请输入小红书号、主页链接或昵称' } }
  const directId = xhsUserIdIn(query)
  const preset = Array.from(new Set([directId ? `xhs_${directId}` : '', `xhsq_${normDouyinKey(query)}`].filter(Boolean)))
  const cachedFirst = findCached(accountId, preset)
  if (cachedFirst) {
    return {
      status: 200,
      body: { ok: true, view: cachedFirst, member, freeRemaining, pointsBalance: balance, pointsPerCheck: MP_POINTS_XHS_CHECK_PER_USE },
    }
  }
  if (balance < MP_POINTS_XHS_CHECK_PER_USE) {
    return {
      status: 200,
      body: {
        ok: false,
        error: 'insufficient_points',
        message: `积分不足（当前 ${balance.toLocaleString('zh-CN')}，需要 ${MP_POINTS_XHS_CHECK_PER_USE}），请充值积分或升级套餐后再试`,
        required: MP_POINTS_XHS_CHECK_PER_USE,
        balance,
      },
    }
  }
  let resolved: { userId: string; nickname: string }
  try {
    resolved = await resolveXhsUserId(query)
  } catch (err) {
    const message = err instanceof Error ? err.message : '没有查到这个小红书账号'
    return { status: 200, body: { ok: false, error: 'parse_failed', message } }
  }
  const keys = Array.from(new Set([`xhs_${resolved.userId}`, `xhsq_${normDouyinKey(query)}`, ...preset]))
  const cachedResolved = findCached(accountId, keys)
  if (cachedResolved) {
    return {
      status: 200,
      body: { ok: true, view: cachedResolved, member, freeRemaining, pointsBalance: balance, pointsPerCheck: MP_POINTS_XHS_CHECK_PER_USE },
    }
  }
  let facts: XhsFacts
  try {
    facts = await loadXhsFacts(resolved.userId, resolved.nickname)
  } catch (err) {
    const message = err instanceof Error ? err.message : '没有查到这个小红书账号'
    return { status: 200, body: { ok: false, error: 'parse_failed', message } }
  }
  let analysis: { summary: string; direction: string; recent: string[] } | null = null
  try {
    analysis = await askXhsDoubao(facts.brief)
  } catch (err) {
    const message = err instanceof Error ? err.message : '豆包分析失败'
    return { status: 200, body: { ok: false, error: 'analysis_failed', message } }
  }
  if (!analysis) {
    return { status: 200, body: { ok: false, error: 'analysis_incomplete', message: '豆包这次没有写完分析，未扣积分。请再查一次。' } }
  }
  const checkedAt = new Date().toISOString()
  const view = buildXhsView(facts, analysis.direction, analysis.summary, checkedAt, MP_POINTS_XHS_CHECK_PER_USE, null)
  const daySlot = Math.floor(Date.now() / 86400000)
  const spent = await spendMpAiPointsForSessionToken(opts.supabaseUrl, opts.serviceRole, opts.token, {
    kind: 'talent_check_xhs',
    idempotencyKey: `talent-check:${accountId}:xhs:${resolved.userId}:${daySlot}`,
    note: `达人查验 小红书 ${facts.nickname || facts.redId}`,
    roleHint: 'pr',
  })
  if (!spent.ok) {
    return {
      status: 200,
      body: {
        ok: false,
        error: spent.error || 'insufficient_points',
        message: spent.message || '积分不足，请充值积分或升级套餐后再试',
        required: MP_POINTS_XHS_CHECK_PER_USE,
        balance,
      },
    }
  }
  const charged = spent.already ? 0 : spent.pointsCharged
  const saved = { ...view, charged, balance: spent.newBalance }
  for (const key of keys) writeCache(accountId, key, saved)
  return {
    status: 200,
    body: {
      ok: true,
      view: saved,
      member,
      freeRemaining,
      pointsBalance: spent.newBalance,
      pointsPerCheck: MP_POINTS_XHS_CHECK_PER_USE,
    },
  }
}
