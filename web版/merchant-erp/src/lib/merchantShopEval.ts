export type ShopEvalPlatformId = 'douyin' | 'meituan' | 'xiaohongshu' | 'kuaishou'
export type ShopEvalScope = 'single' | 'chain'

export type ShopEvalInput = {
  platformId?: string
  storeName?: string
  address?: string
  phone?: string
  businessHours?: string
  city?: string
  offerName?: string
  offerPrice?: string
  category?: string
  mapNote?: string
  publicNote?: string
  scope?: ShopEvalScope
  storeCount?: number
  brandName?: string
  storeNames?: string
  signals?: ShopEvalSignals
}

export type ShopEvalSignals = {
  productTotal: number
  productPriced: number
  productWithImage: number
  reviewTotal: number
  reviewReplied: number
  activityTotal: number
  decorationTotal: number
  decorationWithCover: number
  payAmount: number
  verifyAmount: number
  orderCount: number
  otherPlatformPay: number
  clueCount: number
  adShow: number
  kbTotal: number
  kbFeeding: number
  financeVerify: number
  financeRefund: number
  financeRows: number
}

export type ShopEvalSituation = { name: string; now: string }

export type ShopEvalIndicator = { name: string; score: number; comment: string }

export const PUBLIC_EVAL_INDICATORS = [
  { name: '平台基础搭建', weight: 16 },
  { name: '短视频与团购', weight: 20 },
  { name: '品牌资产与口碑', weight: 16 },
  { name: '私域与复购', weight: 16 },
  { name: '门店标准化', weight: 16 },
  { name: '数据复盘', weight: 16 },
] as const

const ERP_SOLUTION_MODULES = [
  '商品与套餐',
  '评价管理',
  '店铺装修',
  '活动中心',
  '达人招募',
  '店铺分析与投流',
  '知识库与GEO投喂',
  '财务对账',
  '线索跟进',
] as const

export type ShopEvalSuggestion = {
  name: string
  finding: string
  adjust: string
  soon: string
  next: string
  module?: string
}

export type ShopEvalScore = {
  score: number
  searchLevel: string
  verifyLevel: string
  situations: ShopEvalSituation[]
  exposureLift: number
  verifyLift: number
  positioning?: string
  indicators?: ShopEvalIndicator[]
  highlights?: string[]
  gaps?: string[]
  summary?: string
  sources?: string[]
}

export type ShopEvalAdvice = {
  lift: number
  sections: ShopEvalSuggestion[]
}

type ScoreBlock = { name: string; weight: number }

type PlatformSpec = {
  id: ShopEvalPlatformId
  name: string
  scope: ShopEvalScope
  scene: string
  blocks: ScoreBlock[]
  risk: number
  riskNote: string
  levelA: string
  levelB: string
  levelABlocks: string[]
  levelBBlocks: string[]
}

const EVAL_BLOCK_NAMES = ['商品信息', '运营节奏', '品牌视觉', '流量分布', 'GEO 投喂', '财务明晰'] as const
const LEVEL_A_BLOCKS = ['品牌视觉', '流量分布', 'GEO 投喂']
const LEVEL_B_BLOCKS = ['商品信息', '运营节奏', '财务明晰']

function evalBlocks(weights: readonly number[]): ScoreBlock[] {
  return EVAL_BLOCK_NAMES.map((name, index) => ({ name, weight: weights[index] }))
}

const PLATFORM_SPECS: Record<ShopEvalPlatformId, PlatformSpec> = {
  douyin: {
    id: 'douyin',
    name: '抖音来客',
    scope: 'single',
    scene: '按抖音来客打分。六项都是商家 ERP 里的功能：商品信息、运营节奏、品牌视觉、流量分布、GEO 投喂、财务明晰。',
    blocks: evalBlocks([20, 15, 15, 15, 15, 20]),
    risk: 20,
    riskNote: '套餐价格和核销对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  meituan: {
    id: 'meituan',
    name: '美团点评',
    scope: 'single',
    scene: '按美团点评打分。商品信息和财务明晰权重大于视觉和 GEO。六项名称不变。',
    blocks: evalBlocks([25, 15, 10, 15, 10, 25]),
    risk: 20,
    riskNote: '套餐价格和核销对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  xiaohongshu: {
    id: 'xiaohongshu',
    name: '小红书',
    scope: 'single',
    scene: '按小红书打分。品牌视觉和运营节奏权重大于商品信息和财务。六项名称不变。',
    blocks: evalBlocks([15, 20, 20, 15, 15, 15]),
    risk: 20,
    riskNote: '视觉和门店对不上、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
  kuaishou: {
    id: 'kuaishou',
    name: '快手团购',
    scope: 'single',
    scene: '按快手团购打分。六项都是商家 ERP 里的功能，权重与抖音来客相同。',
    blocks: evalBlocks([20, 15, 15, 15, 15, 20]),
    risk: 20,
    riskNote: '挂载和门店无关、价格和核销不符、把未完善的功能写成已经在用',
    levelA: '可被搜到',
    levelB: '可被核销',
    levelABlocks: LEVEL_A_BLOCKS,
    levelBBlocks: LEVEL_B_BLOCKS,
  },
}

const CHAIN_OVERLAYS: Record<ShopEvalPlatformId, Pick<PlatformSpec, 'scene' | 'riskNote' | 'levelA' | 'levelB'>> = {
  douyin: {
    scene: '按抖音来客连锁品牌打分。六项名称与单店相同，多看各店商品、视觉、流量和财务是否统一。看不出统一的项记为未完善。',
    riskNote: '各店套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  meituan: {
    scene: '按美团点评连锁品牌打分。六项名称与单店相同，商品和财务权重更高，并看各店是否统一。',
    riskNote: '各店套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  xiaohongshu: {
    scene: '按小红书连锁品牌打分。六项名称与单店相同，视觉和运营权重更高，并看各店是否统一。',
    riskNote: '各店视觉口径打架、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
  kuaishou: {
    scene: '按快手团购连锁品牌打分。六项名称与单店相同，多看各店是否统一。',
    riskNote: '挂载和分店无关、同套餐不同价、把未完善写成各店已经统一',
    levelA: '品牌可被搜到',
    levelB: '分店可核销',
  },
}

export const SHOP_EVAL_PLATFORMS: { id: ShopEvalPlatformId; name: string }[] = [
  { id: 'douyin', name: '抖音来客' },
  { id: 'meituan', name: '美团点评' },
  { id: 'xiaohongshu', name: '小红书' },
  { id: 'kuaishou', name: '快手团购' },
]

export const SHOP_EVAL_GRADES_SINGLE = [
  { key: 'ready', range: '85~100', label: '经营稳健', note: '六项功能里，商品和已经接上的经营动作比较齐' },
  { key: 'tune', range: '70~84', label: '转化偏弱', note: '店能被看见，运营、流量或财务还没接上' },
  { key: 'fill', range: '55~69', label: '资料偏薄', note: '多项功能还是未完善，获客动作有限' },
  { key: 'build', range: '＜55', label: '形象未立', note: '功能大多未完善，还没形成可经营的闭环' },
] as const

export const SHOP_EVAL_GRADES_CHAIN = [
  { key: 'ready', range: '85~100', label: '品牌成型', note: '六项功能在各店比较统一，分店能被看见、能核销' },
  { key: 'tune', range: '70~84', label: '协同不足', note: '品牌能见客，分店之间功能还没对齐' },
  { key: 'fill', range: '55~69', label: '分店偏散', note: '多家店的商品、视觉或财务还没统一' },
  { key: 'build', range: '＜55', label: '品牌未立', note: '连锁功能大多未完善，还没形成统一形象' },
] as const

export const SHOP_EVAL_GRADES = SHOP_EVAL_GRADES_SINGLE

export function shopEvalScopeOf(raw?: Pick<ShopEvalInput, 'scope' | 'storeCount'> | null): ShopEvalScope {
  if (raw?.scope === 'chain' || Number(raw?.storeCount) >= 2) return 'chain'
  return 'single'
}

export function shopEvalGrades(scope?: ShopEvalScope) {
  return scope === 'chain' ? SHOP_EVAL_GRADES_CHAIN : SHOP_EVAL_GRADES_SINGLE
}

type AskText = (system: string, user: string) => Promise<string>
type StorageLike = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function specOf(platformId: string, scope?: ShopEvalScope): PlatformSpec {
  const id = platformId as ShopEvalPlatformId
  const base = PLATFORM_SPECS[id] || PLATFORM_SPECS.douyin
  if (scope !== 'chain') return base
  return { ...base, scope: 'chain', ...CHAIN_OVERLAYS[base.id] }
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function clampLift(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(35, Math.max(5, v))
}

function clampExposure(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(60, Math.max(8, v))
}

function clampYuan(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v) || v <= 0) return 0
  return Math.min(5_000_000, v)
}

function lineText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text.includes('[object Object]') ? '' : text
  }
  if (Array.isArray(value)) return value.map(lineText).filter(Boolean).join('，')
  if (!value || typeof value !== 'object') return ''
  const item = value as Record<string, unknown>
  const keys = ['text', 'content', 'comment', 'point', 'title', 'desc', 'description', 'finding', 'summary', 'now', 'detail', 'value', 'highlight', 'gap']
  for (const key of keys) {
    const hit = lineText(item[key])
    if (hit) return hit
  }
  return Object.values(item).map(lineText).filter(Boolean).join('，')
}

function clipText(value: unknown, max: number): string {
  return lineText(value).slice(0, max)
}

function normalizeInput(raw: ShopEvalInput) {
  const scope = shopEvalScopeOf(raw)
  const spec = specOf(String(raw?.platformId || 'douyin'), scope)
  return {
    spec,
    row: {
      platformId: spec.id,
      scope,
      storeCount: Math.max(0, Math.round(Number(raw?.storeCount) || 0)),
      brandName: String(raw?.brandName || '').trim(),
      storeNames: String(raw?.storeNames || '').trim(),
      storeName: String(raw?.storeName || '').trim(),
      address: String(raw?.address || '').trim(),
      phone: String(raw?.phone || '').trim(),
      businessHours: String(raw?.businessHours || '').trim(),
      city: String(raw?.city || '').trim(),
      offerName: String(raw?.offerName || '').trim(),
      offerPrice: String(raw?.offerPrice || '').trim(),
      category: String(raw?.category || '').trim(),
      mapNote: String(raw?.mapNote || '').trim(),
      publicNote: String(raw?.publicNote || '').trim(),
      signals: raw?.signals,
    },
  }
}

function filledOr(value: string, empty: string) {
  return value || empty
}

function shopFacts(spec: PlatformSpec, row: ReturnType<typeof normalizeInput>['row']) {
  const lines = [
    `平台：${spec.name}`,
    `经营形态：${spec.scope === 'chain' ? `连锁品牌（${row.storeCount || '多家'}）` : '单门店'}`,
    `品牌：${filledOr(row.brandName, spec.scope === 'chain' ? '未填写' : '无')}`,
    `门店名称：${filledOr(row.storeName, '未填写')}`,
    `分店示例：${filledOr(row.storeNames, spec.scope === 'chain' ? '未列出' : '无')}`,
    `城市：${filledOr(row.city, '未填写')}`,
    `地址：${filledOr(row.address, '未填写')}`,
    `电话：${filledOr(row.phone, '未填写')}`,
    `营业时间：${filledOr(row.businessHours, '未填写')}`,
    `主推套餐：${filledOr(row.offerName, '未填写')}`,
    `套餐价格：${filledOr(row.offerPrice, '未填写，不要编造')}`,
    `经营分类：${filledOr(row.category, '未填写')}`,
    `高德定位：${filledOr(row.mapNote, '未返回')}`,
    `公开检索：${filledOr(row.publicNote, '未返回')}`,
  ]
  return lines.filter(Boolean).join('\n')
}

function loosenJson(slice: string) {
  return String(slice || '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
}

function escapeNewlinesInStrings(slice: string) {
  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < slice.length; i += 1) {
    const c = slice[i]
    if (inStr) {
      if (esc) {
        out += c
        esc = false
        continue
      }
      if (c === '\\') {
        out += c
        esc = true
        continue
      }
      if (c === '"') {
        inStr = false
        out += c
        continue
      }
      if (c === '\n' || c === '\r') {
        out += '\\n'
        continue
      }
      out += c
      continue
    }
    if (c === '"') inStr = true
    out += c
  }
  return out
}

function takeBalancedObject(s: string) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return s.slice(0, i + 1)
    }
  }
  return ''
}

export function parseShopEvalJson(text: string): Record<string, unknown> {
  const raw = String(text || '').trim()
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const body = fence ? fence[1] : raw
  const start = body.indexOf('{')
  if (start < 0) throw new Error('评估结果暂时读不出来，请再点一次')
  const candidates: string[] = []
  const balanced = takeBalancedObject(body.slice(start))
  if (balanced) candidates.push(balanced)
  const end = body.lastIndexOf('}')
  if (end > start) candidates.push(body.slice(start, end + 1))
  for (const item of candidates) {
    try {
      return JSON.parse(escapeNewlinesInStrings(loosenJson(item))) as Record<string, unknown>
    } catch {
      /* next */
    }
  }
  throw new Error('评估结果暂时读不出来，请再点一次')
}


function mapSuggestions(rows: unknown): ShopEvalSuggestion[] {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
      const next = clipText(item.next, 80)
      const adjust = clipText(item.adjust, 180) || next
      return {
        name: clipText(item.name, 12),
        finding: clipText(item.finding, 140),
        adjust,
        soon: clipText(item.soon, 180),
        next: adjust,
        module: clipText(item.module, 16),
      }
    })
    .filter((row) => row.name && (row.finding || row.adjust || row.soon))
    .slice(0, 6)
}

function ownerId() {
  try {
    return sessionStorage.getItem('meoo_active_tenant_id')?.trim() || ''
  } catch {
    return ''
  }
}

function slotId(row: ReturnType<typeof normalizeInput>['row']) {
  return [row.platformId, row.storeName, row.address, row.category].join('|')
}

function cacheKey(row: ReturnType<typeof normalizeInput>['row']) {
  return ['lq_merchant_shop_eval_v6', ownerId(), slotId(row)].join('|')
}

function loadCache(storage: StorageLike, row: ReturnType<typeof normalizeInput>['row']) {
  const key = cacheKey(row)
  return { key, data: readCache(storage, key) }
}

function readCache(storage: StorageLike, key: string): Record<string, unknown> | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const j = JSON.parse(raw) as Record<string, unknown>
    if (typeof j.score !== 'number') return null
    return j
  } catch {
    return null
  }
}

function writeCache(storage: StorageLike, key: string, patch: Record<string, unknown>, replace = false) {
  const prev = replace ? {} : readCache(storage, key) || {}
  storage.setItem(key, JSON.stringify({ ...prev, ...patch }))
}

type ShopEvalProfile = {
  storeCount: number
  scope: ShopEvalScope
  storeNames: string
  brandName: string
  storeName: string
  address: string
  category: string
}

function profileFromRow(row: {
  storeCount?: number
  scope?: ShopEvalScope | string
  storeNames?: string
  brandName?: string
  storeName?: string
  address?: string
  category?: string
}): ShopEvalProfile {
  const storeCount = Math.max(0, Math.round(Number(row.storeCount) || 0))
  const scope: ShopEvalScope = row.scope === 'chain' || storeCount >= 2 ? 'chain' : 'single'
  return {
    storeCount,
    scope,
    storeNames: String(row.storeNames || ''),
    brandName: String(row.brandName || ''),
    storeName: String(row.storeName || ''),
    address: String(row.address || ''),
    category: String(row.category || ''),
  }
}

function savedFromCache(cached: Record<string, unknown> | null): {
  score: ShopEvalScore
  advice: ShopEvalAdvice | null
  profile: ShopEvalProfile | null
} | null {
  const indicators = mapIndicators(cached?.indicators)
  if (!cached || indicators.length !== PUBLIC_EVAL_INDICATORS.length) return null
  const adviceRaw = cached.advice
  let advice: ShopEvalAdvice | null = null
  if (adviceRaw && typeof adviceRaw === 'object' && Array.isArray((adviceRaw as ShopEvalAdvice).sections)) {
    const sections = mapSuggestions((adviceRaw as ShopEvalAdvice).sections)
    if (sections.length) advice = { lift: clampLift((adviceRaw as ShopEvalAdvice).lift), sections }
  }
  const rawProfile = cached.profile
  const profile = rawProfile && typeof rawProfile === 'object' ? profileFromRow(rawProfile as ShopEvalProfile) : null
  return {
    score: scoreFromPublic(cached, indicators),
    advice,
    profile,
  }
}

export function shopEvalGrade(score: number, scope?: ShopEvalScope) {
  const n = Math.round(Number(score))
  if (!Number.isFinite(n)) return null
  const grades = shopEvalGrades(scope)
  if (n >= 85) return grades[0]
  if (n >= 70) return grades[1]
  if (n >= 55) return grades[2]
  return grades[3]
}

export function platformShopEvalMeta(platformId: string, scope?: ShopEvalScope) {
  const spec = specOf(platformId, scope)
  return {
    id: spec.id,
    name: spec.name,
    scope: spec.scope,
    levelA: spec.levelA,
    levelB: spec.levelB,
    title: spec.scope === 'chain' ? '品牌智能分析' : '门店智能分析',
    statusTitle: spec.scope === 'chain' ? '品牌现状' : '门店现状',
  }
}

export function describeShopEvalBasis(raw: ShopEvalInput) {
  const { row, spec } = normalizeInput(raw)
  const bits: string[] = []
  bits.push(spec.scope === 'chain' ? `连锁品牌 · ${row.storeCount || '多'}家` : '单门店')
  if (row.brandName) bits.push(row.brandName)
  if (row.city) bits.push(row.city)
  if (row.address) bits.push('已填地址')
  if (row.phone) bits.push('已填电话')
  if (row.businessHours) bits.push('已填营业时间')
  if (row.offerName) bits.push(`套餐 ${row.offerName}`)
  if (row.offerPrice) bits.push(`价格 ${row.offerPrice}`)
  if (row.category) bits.push(row.category)
  return bits.join(' · ')
}

function parseCount(text: string) {
  const raw = String(text || '').replace(/,/g, '').trim()
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/)
  if (!m) return 0
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) return 0
  return m[2] ? Math.round(n * 10000) : Math.round(n)
}

export function previewShopGains(score: number, offerPrice: string) {
  const exposurePct = clampExposure(Math.round((100 - Math.min(92, score)) * 1.5))
  const price = parseCount(offerPrice) || 80
  const orders = Math.max(1, Math.round(exposurePct * 1.6))
  return { exposurePct, verifyYuan: clampYuan(Math.max(500, orders * price)) }
}

export function formatVerifyYuan(yuan: number) {
  const n = Math.round(Number(yuan) || 0)
  if (n >= 10000) {
    const wan = n / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : wan.toFixed(1).replace(/\.0$/, '')
    return `¥${text}万`
  }
  return `¥${n.toLocaleString('zh-CN')}`
}

export function resolveShopEvalFromStores(
  platformId: ShopEvalPlatformId,
  stores: Array<{
    name?: string
    address?: string
    phone?: string
    businessHours?: string
    city?: string
    brandName?: string
  }>,
  total?: number,
): ShopEvalInput {
  const list = Array.isArray(stores) ? stores : []
  const count = Math.max(list.length, Math.round(Number(total) || 0))
  const first = list[0]
  const scope: ShopEvalScope = count >= 2 ? 'chain' : 'single'
  const brandName = String(first?.brandName || list.find((row) => String(row.brandName || '').trim())?.brandName || '').trim()
  return {
    platformId,
    scope,
    storeCount: count,
    brandName,
    storeNames: list
      .slice(0, 8)
      .map((row) => String(row.name || '').trim())
      .filter(Boolean)
      .join('、'),
    storeName: String(first?.name || '').trim(),
    address: String(first?.address || '').trim(),
    phone: String(first?.phone || '').trim(),
    businessHours: String(first?.businessHours || '').trim(),
    city: String(first?.city || '').trim(),
  }
}

export function readSavedShopEval(raw: ShopEvalInput, storage: StorageLike) {
  const { row } = normalizeInput(raw)
  return savedFromCache(loadCache(storage, row).data)
}

async function askJson(askText: AskText, system: string, user: string) {
  const first = await askText(system, user)
  try {
    return parseShopEvalJson(first)
  } catch {
    const second = await askText(
      system,
      `${user}\n上次输出不是合法 JSON。只输出一行 JSON，键名用英文双引号，最后一项后面不要逗号。`,
    )
    return parseShopEvalJson(second)
  }
}

function mapIndicators(rows: unknown): ShopEvalIndicator[] {
  const byName = new Map<string, ShopEvalIndicator>()
  for (const row of Array.isArray(rows) ? rows : []) {
    const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    const name = clipText(item.name, 12)
    if (!name) continue
    byName.set(name, {
      name,
      score: clampScore(item.score ?? item.points),
      comment: clipText(item.comment || item.now, 180),
    })
  }
  return PUBLIC_EVAL_INDICATORS.map((block) => byName.get(block.name)).filter((row): row is ShopEvalIndicator => Boolean(row?.comment))
}

function textList(rows: unknown, limit: number, maxLen: number) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => clipText(row, maxLen))
    .filter(Boolean)
    .slice(0, limit)
}

function collapsedChainText(text: string, storeCount: number) {
  if (storeCount < 2) return false
  return /单门店|完全空白|形象未立|基本空白/.test(text)
}

function brandScoreLow(raw: Record<string, unknown>) {
  const rows = Array.isArray(raw.indicators) ? raw.indicators : []
  for (const row of rows) {
    const item = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    if (String(item.name || '') !== '品牌资产与口碑') continue
    return clampScore(item.score ?? item.points) < 40
  }
  return false
}

function applyEvidenceFloors(indicators: ShopEvalIndicator[], storeCount: number, note: string) {
  if (storeCount < 2) return indicators
  const floors: Record<string, number> = {
    品牌资产与口碑: storeCount >= 5 ? 74 : 62,
    门店标准化: storeCount >= 5 ? 68 : 58,
    私域与复购: storeCount >= 5 ? 52 : 42,
    数据复盘: storeCount >= 5 ? 40 : 32,
    短视频与团购: storeCount >= 5 ? 50 : 42,
    平台基础搭建: storeCount >= 5 ? 48 : 40,
  }
  if (/团购|抖音|探店|点评|榜/.test(note)) {
    floors['短视频与团购'] = storeCount >= 5 ? 58 : 48
    floors['平台基础搭建'] = storeCount >= 5 ? 54 : 46
  }
  return indicators.map((row) => {
    const floor = floors[row.name] || 0
    if (row.score >= floor) return row
    const comment = /空白|未立|没有线上|零/.test(row.comment)
      ? `${row.name}按高德同城 ${storeCount} 家同名门店来看，品牌已经被本地顾客叫得上名。这一家地址的后台和团购页这次没有逐条核对，短板写在货盘和数据，不把品牌写成没有形象。`
      : row.comment
    return { ...row, score: floor, comment }
  })
}

function scoreFromPublic(raw: Record<string, unknown>, indicators: ShopEvalIndicator[]): ShopEvalScore {
  const byName = new Map(indicators.map((row) => [row.name, row.score]))
  let sum = 0
  for (const block of PUBLIC_EVAL_INDICATORS) {
    sum += ((byName.get(block.name) || 0) / 100) * block.weight
  }
  const highlights = textList(raw.highlights, 3, 140)
  const gaps = textList(raw.gaps, 4, 160)
  return {
    score: clampScore(sum),
    searchLevel: '',
    verifyLevel: '',
    situations: indicators.map((row) => ({ name: row.name, now: row.comment })),
    exposureLift: 0,
    verifyLift: 0,
    positioning: clipText(raw.positioning, 180),
    indicators,
    highlights,
    gaps,
    summary: clipText(raw.summary, 100),
    sources: textList(raw.sources, 8, 80),
  }
}

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseSogouTitles(html: string) {
  const out: string[] = []
  const re = /<h3 class="vr-title[\s\S]*?<\/h3>/gi
  for (const block of html.matchAll(re)) {
    const title = stripTags(block[0] || '')
    if (title.length < 6 || out.includes(title)) continue
    out.push(title.slice(0, 80))
    if (out.length >= 6) break
  }
  return out
}

async function readPublicHtml(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) return ''
    return await res.text()
  } catch {
    return ''
  }
}

async function briefSearchTitles(query: string) {
  const body = JSON.stringify({
    platform: 'douyin',
    queries: [query],
    limit: 4,
    briefContent: { requirementSummary: query, topics: [query] },
  })
  let urls: string[] = [`/api/meoo-brief-reference-search`]
  try {
    const mod = await import('./merchantErpApiBase')
    urls = mod.merchantApiFetchUrls('/api/meoo-brief-reference-search')
  } catch {
    /* 同源路径 */
  }
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { hits?: Array<{ title?: string; originalVideoUrl?: string }> }
      const titles = (data.hits || [])
        .map((hit) => clipText(hit.title || hit.originalVideoUrl, 80))
        .filter(Boolean)
      if (titles.length) return titles
    } catch {
      /* 下一条 */
    }
  }
  return [] as string[]
}

async function searchPublicBrand(row: { brandName: string; storeName: string; city: string; publicNote?: string }) {
  const preset = String(row.publicNote || '')
    .split('\n')
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line) => line.length >= 6)
  if (preset.length) return preset.slice(0, 12)
  const name = row.brandName || row.storeName
  const queries = [`${name} ${row.city} 团购`, `${name} 抖音 探店`, `${row.storeName} 点评`].map((q) => q.replace(/\s+/g, ' ').trim())
  const titles: string[] = []
  const push = (list: string[]) => {
    for (const title of list) {
      if (!title || titles.includes(title)) continue
      titles.push(title)
      if (titles.length >= 12) return
    }
  }
  const batches = await Promise.all(
    queries.slice(0, 3).map(async (query) => {
      const [html, brief] = await Promise.all([
        readPublicHtml(`https://www.sogou.com/web?query=${encodeURIComponent(query)}`),
        briefSearchTitles(query),
      ])
      return [...parseSogouTitles(html), ...brief]
    }),
  )
  for (const batch of batches) push(batch)
  return titles
}

function publicScoreSystem() {
  const names = PUBLIC_EVAL_INDICATORS.map((item) => item.name).join('、')
  return [
    '你在给商家写线上运营打分，用「你」来写，对象是这个品牌或这家店。',
    '只根据下面的门店档案、高德同名门店和公开检索标题来写。检索标题里有的事实优先写进去。',
    '不要编造具体销量、榜单名次、评价条数、核销率。检索里没出现的数字不要写。高德给出的同名门店数量可以写。',
    '高德同名门店达到 2 家时，这是连锁品牌。禁止写成单门店、形象未立、线上运营完全空白、线上经营基本空白。',
    '品牌资产与口碑、门店标准化按品牌在本地的公开认知和门店数量写。没绑定平台账号，只说明这一家地址的后台数据还没接进来，不能把品牌口碑打到 40 分以下。',
    '短视频与团购、平台基础搭建：检索里有团购、探店、点评、榜单时按已有线上内容写；没有时写这一家地址的货盘这次没核对到，分数放在 40 到 60，不要打到个位数。',
    '数据复盘可以低，因为用户还没绑定门店账号，后台数还没进来。',
    '周边同类店是别的餐厅，不能用来证明这家没有客流。不要编造距离和门店数量。',
    '不要写「公开资料不足」「仅供参考」「无法判断」「弱预估」。',
    '只输出一个 JSON 对象，不要 Markdown。',
    'positioning：一句定位，40 到 90 字，写这个品牌在本地公开渠道上的位置和最明显的短板。',
    `indicators 必须正好 6 项，name 只能是：${names}。每项含 score（0 到 100 的整数）和 comment（40 到 90 字，先写做到了什么，再写短板）。`,
    'highlights 正好 3 条，每一条都是字符串，不要写成对象。每条 40 到 80 字，写公开渠道上已经跑通的优势。',
    'gaps 正好 4 条，每一条都是字符串，不要写成对象。每条 40 到 90 字，写会拖后腿的短板。',
    'summary：一句话总结，30 到 60 字。',
  ].join('')
}

type ShopEvalCloudSlot = { savedAt?: string; payload?: Record<string, unknown> }
type ShopEvalCloudFile = { updatedAt?: string; platforms?: Record<string, ShopEvalCloudSlot> }

function readShopEvalCloud(habits: unknown): ShopEvalCloudFile | null {
  if (!habits || typeof habits !== 'object') return null
  const shopEval = (habits as Record<string, unknown>).shopEval
  if (!shopEval || typeof shopEval !== 'object') return null
  return shopEval as ShopEvalCloudFile
}

async function requestShopEvalCloud(method: 'GET' | 'POST', body?: unknown): Promise<{ habits?: unknown } | null> {
  try {
    const [{ merchantApiFetchUrls }, { merchantApiAuthHeaders, resolveMerchantApiBearer }] = await Promise.all([
      import('./merchantErpApiBase'),
      import('./merchantApiAuth'),
    ])
    const auth = await resolveMerchantApiBearer()
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...merchantApiAuthHeaders(auth.token, auth.source),
    }
    if (!auth.token) return null
    for (const url of merchantApiFetchUrls('/api/meoo-agent-user-state')) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const data = (await res.json()) as { ok?: boolean; habits?: unknown }
        if (data && data.ok !== false) return data
      } catch {
        /* 下一条地址 */
      }
    }
  } catch {
    /* 云端不可用时保留本机结果 */
  }
  return null
}

async function publishShopEval(storage: StorageLike, key: string, slot: string) {
  const data = readCache(storage, key)
  if (!data) return
  const savedAt = String(data.savedAt || new Date().toISOString())
  const remote = await requestShopEvalCloud('GET')
  const prev = readShopEvalCloud(remote?.habits)
  const platforms = { ...(prev?.platforms || {}) }
  platforms[slot] = { savedAt, payload: data }
  await requestShopEvalCloud('POST', {
    habits: {
      shopEval: { updatedAt: savedAt, platforms },
      updatedAt: savedAt,
    },
  })
}

export async function hydrateShopEval(raw: ShopEvalInput, storage: StorageLike) {
  const { row } = normalizeInput(raw)
  const remote = await requestShopEvalCloud('GET')
  const fresh = loadCache(storage, row)
  const localAt = Date.parse(String(fresh.data?.savedAt || '')) || 0
  const slot = readShopEvalCloud(remote?.habits)?.platforms?.[slotId(row)]
  const remoteAt = Date.parse(String(slot?.savedAt || '')) || 0
  if (slot?.payload && remoteAt > localAt && savedFromCache(slot.payload)) {
    storage.setItem(fresh.key, JSON.stringify(slot.payload))
    return savedFromCache(slot.payload)
  }
  if (fresh.data && savedFromCache(fresh.data) && localAt >= remoteAt && (localAt > remoteAt || remoteAt === 0)) {
    if (!localAt) writeCache(storage, fresh.key, { savedAt: new Date().toISOString() })
    void publishShopEval(storage, fresh.key, slotId(row))
  }
  return savedFromCache(fresh.data)
}

function erpAdviceSystem() {
  const modules = ERP_SOLUTION_MODULES.join('、')
  return [
    '你在给商家写灵祺 ERP 里能直接去做的改法，用「你」来写。',
    '前面的打分来自公开渠道。这里不要再复述网评，要落到系统功能。',
    `只能使用这些功能：${modules}。不要写系统里没有的会员储值、社群积分商城。`,
    '私域和复购写到线索跟进、评价管理、活动中心。核销和升单写到财务对账、店铺分析与投流、商品与套餐。多店不统一写到店铺装修、商品与套餐、评价管理。',
    '不要编造销量、核销额、GMV。',
    '不要写「公开资料不足」「仅供参考」「无法判断」。',
    '只输出一个 JSON 对象。',
    'sections 正好 4 项，对应四条短板。每项含 name、module、finding、adjust、soon。',
    'name 是短板标题，12 字以内。module 必须是上面列出的功能名。',
    'finding 说明这条短板现在卡在哪，40 到 80 字。',
    'adjust 写去哪个功能里改什么，改完应看到什么，60 到 140 字。',
    'soon 是近两周的 3 件事，用「1.」「2.」「3.」分开。',
  ].join('')
}

export async function evaluateShop(
  raw: ShopEvalInput,
  opts: { force?: boolean; storage: StorageLike; askText: AskText },
): Promise<ShopEvalScore> {
  const { spec, row } = normalizeInput(raw)
  if (!row.storeName) throw new Error('请先完善门店名称')
  const loaded = loadCache(opts.storage, row)
  if (!opts.force) {
    const saved = savedFromCache(loaded.data)
    if (saved) return saved.score
  }
  const sources = await searchPublicBrand(row)
  const material = sources.length
    ? sources.map((title, index) => `${index + 1}. ${title}`).join('\n')
    : '这次没有抓到检索标题。'
  const user = `${shopFacts(spec, row)}\n公开检索标题：\n${material}\n请给出定位、六项得分和点评、三条优势、四条短板、一句话总结。`
  let j = await askJson(opts.askText, publicScoreSystem(), user)
  const evidenceNote = `${row.mapNote}\n${row.publicNote}\n${material}`
  if (collapsedChainText(JSON.stringify(j), row.storeCount) || (row.storeCount >= 3 && brandScoreLow(j))) {
    j = await askJson(
      opts.askText,
      publicScoreSystem(),
      `${user}\n纠正：高德已给出同城同名门店 ${row.storeCount} 家，这是连锁品牌。重写定位、优势和品牌资产、门店标准化，禁止出现单门店、形象未立、线上完全空白。短板只写这一家地址还没接进来的后台数据和这次没核对到的团购货盘。`,
    )
  }
  if (row.storeCount >= 2 && collapsedChainText(`${j.positioning || ''}${j.summary || ''}`, row.storeCount)) {
    j = {
      ...j,
      positioning: `高德在同城检索到 ${row.storeCount} 家同名门店，品牌在本地已经被叫得上名。这一家地址的后台还没绑定，短板在货盘核对和数据复盘。`,
      summary: `同城已有 ${row.storeCount} 家同名门店，先把这一家的线上货盘和后台数据补上。`,
    }
  }
  const indicators = applyEvidenceFloors(mapIndicators(j.indicators), row.storeCount, evidenceNote)
  if (indicators.length !== PUBLIC_EVAL_INDICATORS.length) throw new Error('评估结果不完整，请再点一次')
  const score = scoreFromPublic({ ...j, sources }, indicators)
  writeCache(opts.storage, loaded.key, { ...score, profile: profileFromRow(row), savedAt: new Date().toISOString() })
  void publishShopEval(opts.storage, loaded.key, slotId(row))
  return score
}

export async function adviseShop(
  raw: ShopEvalInput,
  score: ShopEvalScore | null,
  opts: { force?: boolean; storage: StorageLike; askText: AskText },
): Promise<ShopEvalAdvice> {
  if (!score?.indicators?.length) throw new Error('请先完成门店评估')
  const { spec, row } = normalizeInput(raw)
  const loaded = loadCache(opts.storage, row)
  const key = loaded.key
  if (!opts.force) {
    const cached = loaded.data
    const adviceRaw = cached?.advice
    if (adviceRaw && typeof adviceRaw === 'object') {
      const sections = mapSuggestions((adviceRaw as ShopEvalAdvice).sections)
      if (sections.length) return { lift: clampLift((adviceRaw as ShopEvalAdvice).lift), sections }
    }
  }
  const lines = (score.indicators || []).map((item) => `${item.name} ${item.score}分：${item.comment}`).join('\n')
  const gaps = (score.gaps || []).map((item, index) => `${index + 1}. ${item}`).join('\n')
  const j = await askJson(
    opts.askText,
    erpAdviceSystem(),
    `${shopFacts(spec, row)}\n综合得分：${score.score}/100。\n定位：${score.positioning || ''}\n分项：\n${lines}\n短板：\n${gaps}\n请按四条短板，给出灵祺 ERP 里对应功能的改法。`,
  )
  const advice: ShopEvalAdvice = {
    lift: clampLift(j.lift),
    sections: mapSuggestions(j.sections),
  }
  writeCache(opts.storage, key, { advice, savedAt: new Date().toISOString() })
  void publishShopEval(opts.storage, key, slotId(row))
  return advice
}

export function shopEvalGainTargets(score: ShopEvalScore, input: ShopEvalInput) {
  const preview = previewShopGains(score.score, String(input.offerPrice || ''))
  return {
    exposure: score.exposureLift > 0 ? score.exposureLift : preview.exposurePct,
    verify: score.verifyLift > 0 ? score.verifyLift : preview.verifyYuan,
  }
}
