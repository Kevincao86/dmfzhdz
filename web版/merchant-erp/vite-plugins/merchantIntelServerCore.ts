/**
 * 服务端为 /api/meoo-ai-chat 注入门店经营情报（读 Supabase tenant_store_intel + 平台绑定）。
 * 小程序无浏览器 localStorage，须走此路径与 Web 对齐。
 */
import type { AiTaskType } from '../src/lib/aiAgentTypes.js'

type MarginConfig = {
  margins?: { douyin?: number; meituan?: number; xhs?: number }
  industry?: { code?: string; name?: string; path?: string; leafCategoryId?: string }
}

type MenuItem = {
  name?: string
  productCode?: string
  priceYuan?: number
  category?: string
  note?: string
}

function serviceRoleHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

function supabaseBase(env: Record<string, string>): string | null {
  const base = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  const serviceRole = (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
  if (!base || !serviceRole) return null
  return base
}

function serviceKey(env: Record<string, string>): string {
  return (env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE ?? '').trim()
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

async function loadTenantIdForUser(userId: string, env: Record<string, string>): Promise<string | null> {
  const base = supabaseBase(env)
  if (!base) return null
  const headers = serviceRoleHeaders(serviceKey(env))
  const rows = await fetchJson<{ tenant_id?: string }[]>(
    `${base}/rest/v1/tenant_members?select=tenant_id&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc&limit=1`,
    headers,
  )
  return rows?.[0]?.tenant_id ?? null
}

async function loadTenantStoreIntel(
  tenantId: string,
  env: Record<string, string>,
): Promise<{
  marginConfig: MarginConfig | null
  menuItems: MenuItem[]
  menuStoreName: string | null
} | null> {
  const base = supabaseBase(env)
  if (!base) return null
  const headers = serviceRoleHeaders(serviceKey(env))
  const rows = await fetchJson<
    {
      margin_config?: MarginConfig | null
      menu_items?: MenuItem[] | null
      menu_store_name?: string | null
    }[]
  >(
    `${base}/rest/v1/tenant_store_intel?select=margin_config,menu_items,menu_store_name&tenant_id=eq.${encodeURIComponent(tenantId)}&limit=1`,
    headers,
  )
  const row = rows?.[0]
  if (!row) return { marginConfig: null, menuItems: [], menuStoreName: null }
  return {
    marginConfig: row.margin_config ?? null,
    menuItems: Array.isArray(row.menu_items) ? row.menu_items : [],
    menuStoreName: row.menu_store_name?.trim() || null,
  }
}

async function loadTenantName(tenantId: string, env: Record<string, string>): Promise<string | null> {
  const base = supabaseBase(env)
  if (!base) return null
  const headers = serviceRoleHeaders(serviceKey(env))
  const rows = await fetchJson<{ name?: string }[]>(
    `${base}/rest/v1/tenants?select=name&id=eq.${encodeURIComponent(tenantId)}&limit=1`,
    headers,
  )
  const n = rows?.[0]?.name?.trim()
  return n || null
}

async function loadDouyinBindingLabel(
  tenantId: string,
  env: Record<string, string>,
): Promise<string | null> {
  const base = supabaseBase(env)
  if (!base) return null
  const headers = serviceRoleHeaders(serviceKey(env))
  const rows = await fetchJson<
    {
      binding_label?: string | null
      account_display_name?: string | null
      merchant_account_id?: string | null
    }[]
  >(
    `${base}/rest/v1/tenant_merchant_bindings?select=binding_label,account_display_name,merchant_account_id&tenant_id=eq.${encodeURIComponent(tenantId)}&provider=eq.douyin&order=updated_at.desc&limit=1`,
    headers,
  )
  const row = rows?.[0]
  if (!row) return null
  return (
    row.binding_label?.trim() ||
    row.account_display_name?.trim() ||
    row.merchant_account_id?.trim() ||
    null
  )
}

function clampPct(n: unknown, fallback: number): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return fallback
  return Math.min(100, Math.max(0, x))
}

function parseMargins(cfg: MarginConfig | null): { douyin: number; meituan: number; xhs: number } {
  const m = cfg?.margins ?? {}
  return {
    douyin: clampPct(m.douyin, 38),
    meituan: clampPct(m.meituan, 35),
    xhs: clampPct(m.xhs, 32),
  }
}

function parseIndustry(cfg: MarginConfig | null): { path: string; name: string } {
  const ind = cfg?.industry ?? {}
  return {
    path: typeof ind.path === 'string' ? ind.path.trim() : '',
    name: typeof ind.name === 'string' ? ind.name.trim() : '',
  }
}

function inferIndustryFromText(text: string): { path: string; name: string } | null {
  const sn = text.trim()
  if (!sn) return null
  if (/3[Cc]|数码|电子|手机|电脑|家电|科技|潮品|智能设备|通讯/.test(sn)) {
    return { path: '购物 > 数码家电', name: '数码家电' }
  }
  if (/便利|超市|卖场|生鲜|社区店/.test(sn)) {
    return { path: '购物 > 商超便利', name: '商超便利' }
  }
  if (/餐|饮|茶|咖啡|火锅|烧烤|面|饭|小吃|烘焙/.test(sn)) {
    return { path: '餐饮', name: '餐饮' }
  }
  return null
}

function resolveIndustry(
  cfg: MarginConfig | null,
  hints: string[],
): { path: string; name: string; source: string } {
  const fromCfg = parseIndustry(cfg)
  if (fromCfg.path || fromCfg.name) {
    return { ...fromCfg, source: '商品页门店毛利配置（云端）' }
  }
  for (const h of hints) {
    const inferred = inferIndustryFromText(h)
    if (inferred) return { ...inferred, source: '门店/账号名推断' }
  }
  return { path: '', name: '', source: '未配置' }
}

function isDigitalIndustry(industry: { path: string; name: string }): boolean {
  const t = `${industry.path} ${industry.name}`
  return /3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备/.test(t)
}

function menuSummary(items: MenuItem[], max = 40): string {
  const lines = items.slice(0, max).map((it) => {
    const name = String(it.name ?? '').trim()
    if (!name) return ''
    const p =
      typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan) ? ` ¥${it.priceYuan}` : ''
    const code = it.productCode ? ` #${it.productCode}` : ''
    const cat = it.category ? `[${it.category}] ` : ''
    const note = it.note ? `（${it.note}）` : ''
    return `${cat}${name}${code}${p}${note}`
  }).filter(Boolean)
  if (items.length > max) lines.push(`…共 ${items.length} 项，仅展示前 ${max} 项`)
  return lines.join('\n')
}

export async function buildServerMerchantIntelContext(
  userId: string,
  env: Record<string, string>,
  _taskType?: AiTaskType,
): Promise<string | null> {
  const tenantId = await loadTenantIdForUser(userId, env)
  if (!tenantId) return null

  const [intel, tenantName, douyinLabel] = await Promise.all([
    loadTenantStoreIntel(tenantId, env),
    loadTenantName(tenantId, env),
    loadDouyinBindingLabel(tenantId, env),
  ])

  const marginCfg = intel?.marginConfig ?? null
  const margins = parseMargins(marginCfg)
  const menuItems = intel?.menuItems ?? []
  const menuStoreName = intel?.menuStoreName ?? ''
  const industry = resolveIndustry(marginCfg, [
    tenantName ?? '',
    menuStoreName,
    douyinLabel ?? '',
  ])
  const digital = isDigitalIndustry(industry)

  const lines: string[] = [
    '【门店经营情报 · ERP 云端同步，勿要求用户重复填写】',
    '来源：Supabase tenant_store_intel + 平台绑定（与电脑端同账号）。',
  ]

  if (tenantName) lines.push(`商户/租户：${tenantName}`)
  if (douyinLabel) lines.push(`抖音来客绑定账号：${douyinLabel}`)
  if (menuStoreName) lines.push(`菜单关联门店：${menuStoreName}`)

  lines.push(
    `综合毛利率（%）：抖音 ${margins.douyin}，美团 ${margins.meituan}，小红书 ${margins.xhs}。`,
  )

  if (industry.path || industry.name) {
    lines.push(`经营类目：${industry.path || industry.name}（${industry.source}）`)
  } else {
    lines.push('经营类目：未在云端配置；请提示用户在电脑端「商品 → 门店毛利配置」选择类目后保存。')
  }

  if (menuItems.length) {
    lines.push(`价目/商品参考（${menuItems.length} 项）：\n${menuSummary(menuItems)}`)
  } else {
    lines.push('价目/商品参考：云端暂无菜单条目；不得虚构具体菜品或数码 SKU，须按经营类目给出合理方案框架。')
  }

  if (digital) {
    lines.push(
      '【类目约束 · 数码/3C】须输出数码团购、配件组合、到店体验、代金券、开学季/潮品等方案；严禁输出餐饮菜品、冰饮、火锅、探店套餐、奶茶等与本类目无关内容。',
    )
  }

  lines.push(
    '补充说明：以上门店情报仅在用户讨论经营、商品、推广等话题时作为背景参考；与当前问题无关时不要主动展开。涉及经营类任务时，推广/组品/文案须匹配上述经营类目与价目；无数据时给出类目级方案，禁止默认按餐饮编造。不得因缺少情报而拒绝回答一般性问题。',
  )

  return lines.join('\n')
}
