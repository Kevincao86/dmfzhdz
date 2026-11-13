import { fetchMpRegistry, fetchRegistryProfile } from './mpApi'
import { mpApiFetchCandidates } from './mpApiBase'
import { getAccount, getToken } from './mpSession'
import { resolveEffectiveMembershipTier } from '@merchant/lib/mpMembershipCatalog'

export type PrTalentFitRow = {
  applicantId: string
  name: string
  score: number
  fit: number
  profileRead: string
  matchRead: string
}

export type PrTalentFitResult = {
  orderRead: string
  talents: PrTalentFitRow[]
}

const PRO_TIERS = new Set(['pro', 'flagship', 'enterprise'])

export function canUsePrTalentFit(plan: string | undefined, expiresAt?: string | null): boolean {
  const tier = resolveEffectiveMembershipTier(String(plan || 'basic'), expiresAt)
  return PRO_TIERS.has(tier)
}

export async function readPrTalentFitOpen(): Promise<boolean> {
  const acc = getAccount()
  let plan = String(acc?.mpMembershipPlan || '').trim()
  let expires = String(acc?.mpMembershipExpiresAt || '').trim()
  if (!plan) {
    const profile = await fetchRegistryProfile()
    plan = String(profile.mpMembershipPlan || 'basic')
    expires = String(profile.mpMembershipExpiresAt || '')
  }
  return canUsePrTalentFit(plan, expires)
}

function clampScore(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, v))
}

function textOf(value: unknown, max = 180): string {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''
  return s.length > max ? s.slice(0, max) : s
}

function orderBrief(order: Record<string, unknown>): string {
  const meta =
    order.mpPublishMeta && typeof order.mpPublishMeta === 'object'
      ? (order.mpPublishMeta as Record<string, unknown>)
      : {}
  const fixed = textOf(meta.fixedPrice ?? order.fixedPrice, 24)
  const cps = textOf(meta.cpsPercent ?? order.cpsPercent, 24)
  const feeType = textOf(meta.feeTypeId ?? order.feeTypeId, 24)
  const fee = [feeType ? `类型${feeType}` : '', fixed ? `一口价${fixed}` : '', cps ? `CPS${cps}%` : '']
    .filter(Boolean)
    .join('，')
  const lines = [
    `标题：${textOf(order.title || order.customerName, 80) || '未填写'}`,
    `平台：${textOf(order.platform, 40) || '未填写'}`,
    `品类：${textOf(order.category, 40) || '未填写'}`,
    `地区：${textOf(order.region || order.storeName || order.city, 40) || '未填写'}`,
    `粉丝要求：${textOf(order.fansRequirement, 80) || '未填写'}`,
    `费用：${fee || '未填写'}`,
    `招募说明：${textOf(order.recruitmentInfo || order.taskDetail, 600) || '未填写'}`,
    `商家要求：${textOf(order.merchantRequirements, 400) || '未填写'}`,
  ]
  return lines.join('\n')
}

function talentLine(raw: Record<string, unknown>, index: number): string {
  const name = textOf(raw.name || raw.nickname, 40) || `达人${index + 1}`
  const bits = [
    name,
    textOf(raw.platform, 20),
    textOf(raw.platformAccount, 40) ? `账号${textOf(raw.platformAccount, 40)}` : '',
    textOf(raw.followers || raw.fans, 24) ? `粉丝${textOf(raw.followers || raw.fans, 24)}` : '',
    textOf(raw.city || raw.region, 20),
    textOf(raw.douyinSalesLevel, 20) ? `带货等级${textOf(raw.douyinSalesLevel, 20)}` : '',
    textOf(raw.tags || raw.accountTags, 80),
    textOf(raw.quotePrice || raw.quote, 20) ? `报价${textOf(raw.quotePrice || raw.quote, 20)}` : '',
    textOf(raw.intro, 120),
  ].filter(Boolean)
  return `${index + 1}. ${bits.join('，')}`
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const text = String(raw || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('分析结果暂时读不出来，请再点一次')
  const slice = text.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1')
  return JSON.parse(slice) as Record<string, unknown>
}

async function askDoubao(system: string, user: string): Promise<string> {
  const candidates = mpApiFetchCandidates('/api/meoo-ai-chat')
  if (!candidates.length) throw new Error('未配置分析接口')
  const token = getToken()
  let lastErr = '分析失败'
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]!
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Mp-Session': token, Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          provider: 'doubao',
          stream: false,
          temperature: 0,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })
      const data = (await res.json()) as Record<string, unknown>
      if (!res.ok || data.ok === false) {
        throw new Error(String(data.message || data.detail || data.error || `http_${res.status}`))
      }
      if (String(data.provider || '') !== 'doubao') throw new Error('分析暂时不可用，请稍后再试')
      const content = String(data.content || data.text || '').trim()
      if (!content) throw new Error('未返回分析结果')
      return content
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (i < candidates.length - 1) continue
      throw e instanceof Error ? e : new Error(lastErr)
    }
  }
  throw new Error(lastErr)
}

export async function analyzePrOrderTalents(mpOrderId: string): Promise<PrTalentFitResult> {
  const id = String(mpOrderId || '').trim()
  if (!id) throw new Error('缺少招募单')
  const open = await readPrTalentFitOpen()
  if (!open) throw new Error('一键分析达人数据需开通专业版会员')
  const reg = await fetchMpRegistry({ includeMpOrderIds: [id], includeOnly: true })
  const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
  const order = list.find((row) => String(row?.id || '') === id) || null
  if (!order) throw new Error('没有读到这张招募单')
  const applicants = (Array.isArray(order.applicants) ? order.applicants : []).filter(
    (row) => row && typeof row === 'object',
  ) as Record<string, unknown>[]
  if (!applicants.length) throw new Error('这张招募单还没有报名达人')
  const picked = applicants.slice(0, 30)
  const system = [
    '你在帮 PR 看报名达人是否适合这张招募单。',
    '先读懂招募单的平台、品类、地区、粉丝要求和任务说明，再给每位达人打分。',
    'score 是 0 到 100 的达人账号分，只根据下面给出的达人资料，不要编造粉丝、播放或成交。',
    'fit 是 0 到 100 的关联程度，看达人平台、地区、粉丝、标签和报价与这张招募单有多贴。',
    '不要写公开资料不足、仅供参考、不是官方这类句子。',
    '只输出一个 JSON 对象。talents 与给出的达人顺序一致，每项含 name、score、fit、profileRead、matchRead。',
    'profileRead 是这位达人的完整分析说明，120到220字，按已给出的平台、地区、粉丝、标签、报价、带货等级来写，没给出的不要编。',
    'matchRead 是这位达人和这张商单的匹配说明，120到220字，对照平台、地区、粉丝要求、费用和任务说明，写清匹配点和不匹配点。',
  ].join('')
  const user = `${orderBrief(order)}\n报名达人：\n${picked.map(talentLine).join('\n')}`
  let parsed: Record<string, unknown>
  try {
    parsed = parseJsonObject(await askDoubao(system, user))
  } catch {
    parsed = parseJsonObject(
      await askDoubao(system, `${user}\n上次不是合法 JSON。只输出一行 JSON，最后一项后面不要逗号。`),
    )
  }
  const rows = Array.isArray(parsed.talents) ? parsed.talents : []
  const talents = picked.map((raw, index) => {
    const item = rows[index] && typeof rows[index] === 'object' ? (rows[index] as Record<string, unknown>) : {}
    return {
      applicantId: textOf(raw.id, 80),
      name: textOf(item.name || raw.name || raw.nickname, 40) || `达人${index + 1}`,
      score: clampScore(item.score),
      fit: clampScore(item.fit),
      profileRead: textOf(item.profileRead || item.reason, 400),
      matchRead: textOf(item.matchRead, 400),
    }
  })
  return {
    orderRead: textOf(parsed.orderRead, 60),
    talents,
  }
}

const FIT_STORAGE_PREFIX = 'meoo_pr_talent_fit_v1:'

export function readSavedPrTalentFit(mpOrderId: string): PrTalentFitResult | null {
  const id = String(mpOrderId || '').trim()
  if (!id || typeof localStorage === 'undefined') return null
  try {
    const raw = JSON.parse(localStorage.getItem(`${FIT_STORAGE_PREFIX}${id}`) || '') as {
      orderRead?: unknown
      talents?: unknown
    }
    if (!raw || !Array.isArray(raw.talents)) return null
    const talents = raw.talents
      .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      .map((row) => ({
        applicantId: String(row.applicantId || '').trim(),
        name: String(row.name || ''),
        score: clampScore(row.score),
        fit: clampScore(row.fit),
        profileRead: String(row.profileRead || row.reason || ''),
        matchRead: String(row.matchRead || ''),
      }))
      .filter((row) => row.applicantId)
    if (!talents.length) return null
    return { orderRead: String(raw.orderRead || ''), talents }
  } catch {
    return null
  }
}

export function savePrTalentFit(mpOrderId: string, result: PrTalentFitResult) {
  const id = String(mpOrderId || '').trim()
  if (!id || !result?.talents?.length) return
  try {
    localStorage.setItem(
      `${FIT_STORAGE_PREFIX}${id}`,
      JSON.stringify({ orderRead: result.orderRead || '', talents: result.talents }),
    )
  } catch {
    /* 本机空间不足时仍显示当次结果 */
  }
}
