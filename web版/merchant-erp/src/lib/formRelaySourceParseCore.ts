/**
 * 转发工具：抓取外部原表链接，解析任务详情 / 招募要求 / 城市；规则解析不足时走 LLM 摘要。
 */
import {
  detectFormRelayPlatform,
  formRelayPlatformLabel,
  type FormRelayPlatformId,
  isValidFormRelayLink,
  canFetchFormRelaySource,
} from './formRelayPlatforms.js'
import { summarizeFormRelaySourceWithAi } from './formRelaySourceParseAi.js'

export type FormRelaySourceParseInput = {
  url: string
  platform?: FormRelayPlatformId | string
  /** ECS / Vite 环境变量，供 AI 摘要兜底 */
  env?: Record<string, string>
}

export type FormRelaySourceParseOk = {
  ok: true
  platform: FormRelayPlatformId
  taskDetail: string
  merchantRequirements: string
  city: string
  region: string
  titleHint: string
  budgetHint: string
  recruitPlatform?: string
}

export type FormRelaySourceParseResult = FormRelaySourceParseOk | { ok: false; message: string }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const FETCH_MS = 18_000
const TUNGEA_API = 'https://api-portal.tungea.com'
const BAOMING_API = 'https://api-xcx-qunsou.weiyoubot.cn'

function isBaominggongjuUrl(url: string): boolean {
  return /baominggongju\.com/i.test(String(url || '').trim())
}

function isQunbaoshuUrl(url: string): boolean {
  return /qun100\.com/i.test(String(url || '').trim())
}

function extractBaomingEid(url: string): string {
  const raw = String(url || '').trim()
  try {
    const u = new URL(raw)
    return String(u.searchParams.get('eid') || '').trim()
  } catch {
    const m = raw.match(/[?&]eid=([^&]+)/i)
    return m?.[1] ? decodeURIComponent(m[1]).trim() : ''
  }
}

type BaomingShortDetail = {
  title?: string
  content?: Array<{ value?: string; type?: string }>
  address?: string
}

function inferRecruitPlatformFromText(text: string): string {
  const s = String(text || '')
  if (/小红书|红薯|xhs/i.test(s)) return '小红书'
  if (/抖音|douyin/i.test(s)) return '抖音'
  if (/快手|kuaishou/i.test(s)) return '快手'
  if (/视频号|微信视频/i.test(s)) return '视频号'
  if (/b站|bilibili/i.test(s)) return 'B站'
  if (/微博|weibo/i.test(s)) return '微博'
  return ''
}

async function parseBaominggongjuShareUrl(
  url: string,
  platform: FormRelayPlatformId,
): Promise<FormRelaySourceParseResult> {
  const eid = extractBaomingEid(url)
  if (!eid) {
    return { ok: false, message: '未识别报名工具活动 ID（eid），请确认分享链接完整' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    const res = await fetch(
      `${BAOMING_API}/xcx/enroll/v1/short_detail?eid=${encodeURIComponent(eid)}`,
      {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': MOBILE_UA,
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
      },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as { sta?: number; msg?: string; data?: BaomingShortDetail }
    if (json.sta !== 0 || !json.data) {
      return { ok: false, message: String(json.msg || '报名工具详情获取失败') }
    }
    const data = json.data
    const titleHint = String(data.title || '').trim()
    const contentText = (Array.isArray(data.content) ? data.content : [])
      .map((c) => String(c?.value || '').trim())
      .filter(Boolean)
      .join('\n')
    const address = String(data.address || '').trim()
    const blob = [titleHint, contentText, address].filter(Boolean).join('\n')
    if (!blob.trim()) {
      return { ok: false, message: '报名工具活动内容为空' }
    }
    const city = extractCityFromText(blob) || extractCityFromText(address)
    const recruitPlatform = inferRecruitPlatformFromText(blob) || '不限'
    const budgetHint = extractBudgetHint(contentText) || extractBudgetHint(titleHint) || '面议'
    return {
      ok: true,
      platform: platform === 'other' ? 'signup_tool' : platform,
      taskDetail: contentText || titleHint,
      merchantRequirements: contentText || '',
      city,
      region: city || '全国',
      titleHint: titleHint || contentText.split('\n')[0]?.slice(0, 40) || '转发代收招募',
      budgetHint,
      recruitPlatform,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.includes('abort') ? '报名工具接口超时' : `报名工具抓取失败：${msg}` }
  } finally {
    clearTimeout(timer)
  }
}

function extractHtmlMetaHints(html: string): { htmlTitle: string; metaHints: string } {
  const titleRaw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''
  const ogTitle =
    html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1] ||
    ''
  const ogDesc =
    html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*property=["']og:description["']/i)?.[1] ||
    ''
  const metaDesc =
    html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
    html.match(/content=["']([^"']+)["'][^>]*name=["']description["']/i)?.[1] ||
    ''
  return {
    htmlTitle: decodeHtmlEntities(titleRaw).trim(),
    metaHints: [ogTitle, ogDesc, metaDesc].filter(Boolean).join('\n'),
  }
}

function isParseResultSparse(result: FormRelaySourceParseOk): boolean {
  const taskDetail = String(result.taskDetail || '').trim()
  const requirements = String(result.merchantRequirements || '').trim()
  if (taskDetail.length >= 24 || requirements.length >= 16) return false
  return !taskDetail && !requirements
}

async function tryAiEnhanceParse(
  env: Record<string, string>,
  url: string,
  platform: FormRelayPlatformId,
  html: string,
  partial: FormRelaySourceParseOk | { ok: false; message: string },
): Promise<FormRelaySourceParseOk | null> {
  const meta = extractHtmlMetaHints(html)
  const pageText = htmlToText(html)
  const ai = await summarizeFormRelaySourceWithAi(env, {
    url,
    platformLabel: formRelayPlatformLabel(platform),
    pageText,
    htmlTitle: meta.htmlTitle,
    metaHints: meta.metaHints,
  })
  if (!ai) return null

  const base = partial.ok ? partial : null
  const taskDetail = String(ai.taskDetail || base?.taskDetail || '').trim()
  const merchantRequirements = String(ai.merchantRequirements || base?.merchantRequirements || '').trim()
  const titleHint =
    String(ai.titleHint || base?.titleHint || meta.htmlTitle || '').trim() ||
    '转发代收招募'
  if (!taskDetail && !merchantRequirements && !titleHint) return null

  return {
    ok: true,
    platform,
    taskDetail: taskDetail || merchantRequirements,
    merchantRequirements: merchantRequirements || taskDetail,
    city: String(ai.city || base?.city || '').trim(),
    region: String(ai.region || ai.city || base?.region || base?.city || '').trim() || '全国',
    titleHint,
    budgetHint: String(ai.budgetHint || base?.budgetHint || '').trim() || '面议',
    recruitPlatform:
      String(ai.recruitPlatform || base?.recruitPlatform || '').trim() ||
      inferRecruitPlatformFromText(`${taskDetail}\n${merchantRequirements}`) ||
      undefined,
  }
}

function isTungeaShareUrl(url: string): boolean {
  return /tungea\.com/i.test(String(url || '').trim())
}

function extractTungeaShortCode(url: string): string {
  const u = String(url || '').trim()
  const m = u.match(/\/s\/(?:tnd|nd)\/([^/?#]+)/i)
  return m?.[1] ? decodeURIComponent(m[1]).trim() : ''
}

type TungeaApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

type TungeaShortUrlInfo = {
  shortCode?: string
  originalUrl?: string
}

type TungeaNoticeDetail = {
  title?: string
  requirements?: string
  noticeCities?: string[]
  citiesStr?: string
  noticePlatforms?: string[]
  platformsStr?: string
  minPaymentAmount?: number
  maxPaymentAmount?: number
  minFans?: number
  maxFans?: number
  taskModel?: string
  deadline?: string
}

async function fetchTungeaJson<T>(path: string): Promise<TungeaApiEnvelope<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    const res = await fetch(`${TUNGEA_API}${path}`, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as TungeaApiEnvelope<T>
  } finally {
    clearTimeout(timer)
  }
}

function mapTungeaNoticeToParseResult(
  notice: TungeaNoticeDetail,
  platform: FormRelayPlatformId,
): FormRelaySourceParseOk {
  const requirementsText = String(notice.requirements || '').trim()
  const sections = parseBracketSections(requirementsText)
  const merchantRequirements =
    sections['达人要求'] ||
    sections['招募要求'] ||
    extractLabeledValue(requirementsText, ['达人要求', '招募要求']) ||
    ''
  const taskDetail = buildTaskDetail(sections, requirementsText) || requirementsText
  const titleHint =
    String(notice.title || '').trim() ||
    sections['商家名称'] ||
    extractLabeledValue(requirementsText, ['商家名称', '通告标题', '标题'])
  const city =
    (Array.isArray(notice.noticeCities) && notice.noticeCities[0]) ||
    String(notice.citiesStr || '').split(/[、,，]/)[0]?.trim() ||
    extractCityFromText(sections['商家地址'] || '') ||
    extractCityFromText(requirementsText)
  const budgetParts: string[] = []
  if (notice.minPaymentAmount || notice.maxPaymentAmount) {
    const min = notice.minPaymentAmount
    const max = notice.maxPaymentAmount
    if (min && max && min !== max) budgetParts.push(`¥${min}-¥${max}`)
    else if (min) budgetParts.push(`¥${min}`)
    else if (max) budgetParts.push(`¥${max}`)
  }
  const budgetHint =
    extractBudgetHint(merchantRequirements) ||
    extractBudgetHint(requirementsText) ||
    budgetParts.join(' ') ||
    ''
  const recruitPlatform =
    (Array.isArray(notice.noticePlatforms) && notice.noticePlatforms[0]) ||
    String(notice.platformsStr || '').trim() ||
    ''

  return {
    ok: true,
    platform,
    taskDetail,
    merchantRequirements,
    city,
    region: city || '',
    titleHint,
    budgetHint,
    recruitPlatform,
  }
}

async function parseTungeaShareUrl(
  url: string,
  platform: FormRelayPlatformId,
): Promise<FormRelaySourceParseResult> {
  const shortCode = extractTungeaShortCode(url)
  if (!shortCode) {
    return { ok: false, message: '未识别探鲸分享码，请确认链接形如 https://h5.tungea.com/s/tnd/…' }
  }
  try {
    const shortRes = await fetchTungeaJson<TungeaShortUrlInfo>(`/portal/shortUrl/info/${encodeURIComponent(shortCode)}`)
    if (shortRes.code !== 200 || !shortRes.data) {
      return { ok: false, message: String(shortRes.message || '探鲸短链解析失败') }
    }
    let noticeId = ''
    try {
      const original = JSON.parse(String(shortRes.data.originalUrl || '{}')) as { noticeId?: string }
      noticeId = String(original.noticeId || '').trim()
    } catch {
      return { ok: false, message: '探鲸短链数据格式异常' }
    }
    if (!noticeId) {
      return { ok: false, message: '探鲸短链未包含通告 ID' }
    }
    const detailRes = await fetchTungeaJson<TungeaNoticeDetail>(
      `/portal/notice/detail?id=${encodeURIComponent(noticeId)}`,
    )
    if (detailRes.code !== 200 || !detailRes.data) {
      return { ok: false, message: String(detailRes.message || '探鲸通告详情获取失败') }
    }
    const notice = detailRes.data
    if (!String(notice.requirements || notice.title || '').trim()) {
      return { ok: false, message: '探鲸通告内容为空' }
    }
    return mapTungeaNoticeToParseResult(notice, platform)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.includes('abort') ? '探鲸接口超时，请稍后重试' : `探鲸抓取失败：${msg}` }
  }
}

function decodeHtmlEntities(s: string): string {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function htmlToText(html: string): string {
  return decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' '),
  ).trim()
}

function parseBracketSections(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /【([^】]{1,40})】\s*([\s\S]*?)(?=【|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const key = String(m[1] || '').trim()
    const val = String(m[2] || '')
      .replace(/\n{2,}/g, '\n')
      .trim()
    if (key && val) out[key] = val
  }
  return out
}

function extractLabeledValue(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:：]\\s*([^\\n【]{1,800})`, 'i')
    const m = text.match(re)
    if (m?.[1]) return String(m[1]).trim()
  }
  return ''
}

function extractCityFromText(text: string): string {
  const src = String(text || '').trim()
  if (!src) return ''
  const ipCity = src.match(/([\u4e00-\u9fa5]{2,8})ip/i)
  if (ipCity?.[1]) return ipCity[1]
  const direct = src.match(/(?:^|[\s·])([\u4e00-\u9fa5]{2,10}(?:市|州|盟|地区))/)
  if (direct?.[1]) return direct[1]
  const withProv = src.match(/([\u4e00-\u9fa5]{2,8}省)[\s·]*([\u4e00-\u9fa5]{2,10}(?:市|州|盟|地区))/)
  if (withProv?.[2]) return withProv[2]
  return ''
}

function extractBudgetHint(requirements: string): string {
  const s = String(requirements || '')
  const m = s.match(/(?:千粉|万粉|粉丝)[^\n。；;]{0,40}/i)
  return m ? m[0].trim() : ''
}

function collectJsonStrings(html: string): string[] {
  const out: string[] = []
  const re = />(\{[\s\S]{20,8000}?\})</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    out.push(m[1])
  }
  const next = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i)
  if (next?.[1]) out.push(next[1])
  return out
}

function deepFindStrings(obj: unknown, keys: string[], depth = 0): string[] {
  if (depth > 8 || obj == null) return []
  if (typeof obj === 'string') {
    const s = obj.trim()
    return s.length >= 2 ? [s] : []
  }
  if (Array.isArray(obj)) {
    return obj.flatMap((x) => deepFindStrings(x, keys, depth + 1))
  }
  if (typeof obj !== 'object') return []
  const rec = obj as Record<string, unknown>
  const found: string[] = []
  for (const k of keys) {
    if (k in rec) {
      const v = rec[k]
      if (typeof v === 'string' && v.trim()) found.push(v.trim())
    }
  }
  for (const v of Object.values(rec)) {
    found.push(...deepFindStrings(v, keys, depth + 1))
  }
  return found
}

function tryParseJsonFields(html: string): Partial<FormRelaySourceParseOk> {
  const blobs = collectJsonStrings(html)
  const keyMap: Record<string, keyof FormRelaySourceParseOk> = {
    taskDetail: 'taskDetail',
    detail: 'taskDetail',
    content: 'taskDetail',
    description: 'taskDetail',
    merchantRequirements: 'merchantRequirements',
    requirement: 'merchantRequirements',
    requirements: 'merchantRequirements',
    city: 'city',
    region: 'region',
    title: 'titleHint',
    name: 'titleHint',
  }
  const out: Partial<FormRelaySourceParseOk> = {}
  for (const blob of blobs) {
    try {
      const parsed = JSON.parse(blob) as unknown
      for (const [jsonKey, target] of Object.entries(keyMap)) {
        if (out[target]) continue
        const hits = deepFindStrings(parsed, [jsonKey])
        if (hits.length) (out as Record<string, string>)[target] = hits[0]
      }
    } catch {
      /* ignore invalid json */
    }
  }
  return out
}

function buildTaskDetail(sections: Record<string, string>, text: string): string {
  const keys = ['任务详情', '详情', '商家名称', '商家地址', '探店时间', '其他', '注意事项']
  const parts: string[] = []
  for (const k of keys) {
    if (sections[k]) parts.push(`【${k}】${sections[k]}`)
  }
  if (!parts.length) {
    const block =
      extractLabeledValue(text, ['任务详情', '详情', '通告详情']) ||
      sections['通告详情'] ||
      ''
    if (block) parts.push(block)
  }
  return parts.join('\n').trim()
}

function buildRequirements(sections: Record<string, string>, text: string): string {
  return (
    sections['达人要求'] ||
    sections['招募要求'] ||
    sections['要求'] ||
    extractLabeledValue(text, ['达人要求', '招募要求', '达人需求', '要求']) ||
    ''
  )
}

function mergeParsed(
  platform: FormRelayPlatformId,
  html: string,
): FormRelaySourceParseOk | { ok: false; message: string } {
  const text = htmlToText(html)
  if (!text || text.length < 20) {
    return { ok: false, message: '页面内容过少，无法解析任务详情' }
  }
  const jsonHints = tryParseJsonFields(html)
  const sections = parseBracketSections(text)
  const address = sections['商家地址'] || sections['地址'] || extractLabeledValue(text, ['商家地址', '地址', '门店地址'])
  const requirements = buildRequirements(sections, text) || String(jsonHints.merchantRequirements || '')
  const taskDetail = buildTaskDetail(sections, text) || String(jsonHints.taskDetail || '')
  const titleHint =
    sections['商家名称'] ||
    sections['通告标题'] ||
    sections['标题'] ||
    String(jsonHints.titleHint || '') ||
    extractLabeledValue(text, ['商家名称', '通告标题', '标题'])
  const city =
    extractCityFromText(sections['城市'] || '') ||
    extractCityFromText(address) ||
    extractCityFromText(text) ||
    String(jsonHints.city || '')
  const region = city || String(jsonHints.region || '') || extractLabeledValue(text, ['城市', '地区', '区域'])

  if (!taskDetail && !requirements && !city && !titleHint) {
    return { ok: false, message: '未识别到任务详情、招募要求或城市，请检查链接是否可公开访问' }
  }

  return {
    ok: true,
    platform,
    taskDetail,
    merchantRequirements: requirements,
    city,
    region: region || city || '',
    titleHint,
    budgetHint: extractBudgetHint(requirements),
  }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': MOBILE_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const ct = String(res.headers.get('content-type') || '')
    if (!/text\/html|application\/json/i.test(ct) && !ct.includes('text/plain')) {
      // 部分站点 content-type 不准，仍尝试读取
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export async function runFormRelaySourceParseCore(
  input: FormRelaySourceParseInput,
): Promise<FormRelaySourceParseResult> {
  const url = String(input.url || '').trim()
  if (!isValidFormRelayLink(url)) {
    return { ok: false, message: '请提供有效的小程序 / H5 / 网站链接' }
  }
  if (!canFetchFormRelaySource(url)) {
    return {
      ok: false,
      message: '小程序 scheme 链接无法自动抓取详情，请改用 H5/网站分享链接，或手动填写标题后生成',
    }
  }
  const platform = (input.platform && String(input.platform).trim()
    ? String(input.platform).trim()
    : detectFormRelayPlatform(url)) as FormRelayPlatformId
  const env = input.env && typeof input.env === 'object' ? input.env : undefined

  if (isBaominggongjuUrl(url)) {
    const baoming = await parseBaominggongjuShareUrl(url, platform === 'other' ? 'signup_tool' : platform)
    if (baoming.ok) return baoming
  }
  if (isQunbaoshuUrl(url)) {
    try {
      const html = await fetchHtml(url)
      const qPlatform = platform === 'other' ? 'qunbaoshu' : platform
      const ruleResult = mergeParsed(qPlatform, html)
      if (ruleResult.ok && !isParseResultSparse(ruleResult)) return ruleResult
      if (env) {
        const aiOut = await tryAiEnhanceParse(env, url, qPlatform, html, ruleResult)
        if (aiOut && !isParseResultSparse(aiOut)) return aiOut
        if (ruleResult.ok) return ruleResult
        if (aiOut) return aiOut
      }
      if (ruleResult.ok) return ruleResult
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, message: msg.includes('abort') ? '群报数页面抓取超时' : `群报数抓取失败：${msg}` }
    }
  }
  if (isTungeaShareUrl(url)) {
    return parseTungeaShareUrl(url, platform === 'other' ? 'tanjing' : platform)
  }
  try {
    const html = await fetchHtml(url)
    const ruleResult = mergeParsed(platform, html)
    if (ruleResult.ok && !isParseResultSparse(ruleResult)) return ruleResult
    if (env) {
      const aiOut = await tryAiEnhanceParse(env, url, platform, html, ruleResult)
      if (aiOut && !isParseResultSparse(aiOut)) return aiOut
      if (ruleResult.ok) return ruleResult
      if (aiOut) return aiOut
    }
    if (ruleResult.ok) return ruleResult
    return ruleResult
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg.includes('abort') ? '抓取超时，请稍后重试' : `抓取失败：${msg}` }
  }
}
