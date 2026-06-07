/**
 * 多平台主页分享链接 → 结构化达人资料（零 LLM：解析 HTML 内嵌 JSON / meta）
 */
import {
  extractDouyinShareFromText,
  normalizeDouyinShareUrl,
} from './digitalHumanDouyinLinkCore.js'

export type ProfilePlatformKey =
  | 'douyin'
  | 'xiaohongshu'
  | 'kuaishou'
  | 'dianping'
  | 'weixin_video'

export type ProfilePlatformName = '抖音' | '小红书' | '快手' | '大众点评' | '微信视频号'

export type ProfileLinkParseInput = {
  link: string
  platform?: string
}

export type ProfileLinkParseOk = {
  ok: true
  platform: ProfilePlatformName
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  gender: '' | '男' | '女'
  accountTags: string[]
  talentGrade?: string
  reviewCount?: string
}

export type ProfileLinkParseResult = ProfileLinkParseOk | { ok: false; message: string }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const REFERER_BY_PLATFORM: Record<ProfilePlatformKey, string> = {
  douyin: 'https://www.douyin.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  kuaishou: 'https://www.kuaishou.com/',
  dianping: 'https://www.dianping.com/',
  weixin_video: 'https://channels.weixin.qq.com/',
}

const TALENT_TAG_OPTIONS = [
  '美食',
  '母婴',
  '家居家装',
  '生活记录',
  '美妆时尚',
  '健康养生',
  '运动健身',
  '教育',
  '摄影',
  '酒店旅游',
  '文化艺术',
  '兴趣爱好',
  '科技数码',
  '影视综艺',
  '宠物',
] as const

const TAG_KEYWORDS: Record<string, readonly string[]> = {
  美食: ['美食', '探店', '吃货', '餐饮', '火锅', '烘焙'],
  母婴: ['母婴', '育儿', '宝妈', '亲子'],
  家居家装: ['家居', '家装', '装修', '软装'],
  生活记录: ['生活', 'vlog', '日常', '记录'],
  美妆时尚: ['美妆', '时尚', '穿搭', '护肤', '化妆'],
  健康养生: ['健康', '养生', '中医', '保健'],
  运动健身: ['运动', '健身', '跑步', '瑜伽'],
  教育: ['教育', '学习', '知识', '科普'],
  摄影: ['摄影', '拍照', '镜头'],
  酒店旅游: ['旅游', '旅行', '酒店', '民宿', '打卡'],
  文化艺术: ['文化', '艺术', '书法', '绘画'],
  兴趣爱好: ['兴趣', '爱好', '手作'],
  科技数码: ['科技', '数码', '手机', '电脑', '测评'],
  影视综艺: ['影视', '综艺', '剧评', '电影'],
  宠物: ['宠物', '猫', '狗', '萌宠'],
}

type RawProfileBlob = {
  platformAccount?: string
  platformNickname?: string
  followers?: number
  gender?: number
  signature?: string
  talentGrade?: string
  reviewCount?: string
}

const PLATFORM_HOST: Record<ProfilePlatformKey, RegExp> = {
  douyin: /(?:^|\.)?(?:douyin\.com|iesdouyin\.com|v\.douyin\.com)(?:\/|$)/i,
  xiaohongshu: /(?:^|\.)?(?:xiaohongshu\.com|xhslink\.com|xhs\.cn)(?:\/|$)/i,
  kuaishou: /(?:^|\.)?(?:kuaishou\.com|chenzhongtech\.com|gifshow\.com|v\.kuaishou\.com)(?:\/|$)/i,
  dianping: /(?:^|\.)?(?:dianping\.com|m\.dianping\.com)(?:\/|$)/i,
  weixin_video: /(?:^|\.)?(?:channels\.weixin\.qq\.com)(?:\/|$)/i,
}

const SHORT_LINK_HOST: Record<ProfilePlatformKey, RegExp | null> = {
  douyin: /v\.douyin\.com/i,
  xiaohongshu: /xhslink\.com/i,
  kuaishou: /v\.kuaishou\.com/i,
  dianping: null,
  weixin_video: null,
}

const PROFILE_PATH: Record<ProfilePlatformKey, RegExp> = {
  douyin: /\/(?:share\/)?user\//i,
  xiaohongshu: /\/user\/(?:profile\/)?/i,
  kuaishou: /\/profile\/|\/user\//i,
  dianping: /\/member\/|\/user\/|\/shop\//i,
  weixin_video: /\/platform\/|\/finder\//i,
}

export function normalizeProfilePlatform(raw: string): ProfilePlatformKey {
  const s = String(raw || '').trim()
  if (s.includes('红') || s.includes('xiaohongshu') || s === 'xhs') return 'xiaohongshu'
  if (s.includes('快手') || s.includes('kuaishou')) return 'kuaishou'
  if (s.includes('点评') || s.includes('大众') || s.includes('dianping')) return 'dianping'
  if (s.includes('视频号') || s.includes('weixin')) return 'weixin_video'
  return 'douyin'
}

function platformDisplayName(key: ProfilePlatformKey): ProfilePlatformName {
  const map: Record<ProfilePlatformKey, ProfilePlatformName> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    kuaishou: '快手',
    dianping: '大众点评',
    weixin_video: '微信视频号',
  }
  return map[key]
}

function fetchHeaders(key: ProfilePlatformKey) {
  return {
    'User-Agent': MOBILE_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Referer: REFERER_BY_PLATFORM[key],
  } as const
}

function parseJsonObjectFromScriptPrefix(raw: string): unknown | null {
  let depth = 0
  let end = -1
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end <= 0) return null
  try {
    return JSON.parse(raw.slice(0, end)) as unknown
  } catch {
    return null
  }
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`) as string
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

function pickMetaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const m = re.exec(html)
  return m?.[1] ? unescapeJsonString(m[1].trim()) : null
}

function pickStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

function pickNum(o: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = o[k]
    if (v == null) continue
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v))
    const s = String(v).replace(/,/g, '').trim()
    const n = Number.parseInt(s, 10)
    if (Number.isFinite(n)) return Math.max(0, n)
    const wm = /^([\d.]+)\s*万$/i.exec(s)
    if (wm) return Math.round(Number(wm[1]) * 10000)
  }
  return 0
}

function scoreProfileObject(o: Record<string, unknown>, key: ProfilePlatformKey): number {
  let score = 0
  const nick = pickStr(o, [
    'nickname',
    'nickName',
    'userName',
    'name',
    'displayName',
    'title',
  ])
  if (nick && nick.length <= 64) score += 4

  const idKeys =
    key === 'douyin'
      ? ['unique_id', 'uniqueId', 'short_id', 'shortId', 'sec_uid']
      : key === 'xiaohongshu'
        ? ['redId', 'red_id', 'xhsId', 'userId', 'user_id']
        : key === 'kuaishou'
          ? ['userId', 'user_id', 'eid', 'kwaiId', 'kwai_id']
          : key === 'dianping'
            ? ['userId', 'user_id', 'userNickName', 'loginId']
            : ['finderUsername', 'username', 'userId', 'user_id', 'uniqId']

  const id = pickStr(o, idKeys)
  if (id && id.length <= 64) score += 3

  const fans = pickNum(o, [
    'follower_count',
    'followerCount',
    'mplatform_followers_count',
    'fans',
    'fansCount',
    'fan',
    'fanCount',
    'follows',
    'follower',
    'subscribers',
  ])
  if (fans > 0) score += 3

  if (typeof o.gender === 'number') score += 1
  if (pickStr(o, ['signature', 'desc', 'description', 'bio', 'userDesc'])) score += 1

  if (key === 'kuaishou' && pickStr(o, ['liveLevel', 'authorLevel', 'grade'])) score += 1
  if (key === 'dianping' && pickNum(o, ['reviewCount', 'review_count', 'commentCount']) > 0) {
    score += 2
  }

  return score
}

function objectToBlob(o: Record<string, unknown>, key: ProfilePlatformKey): RawProfileBlob {
  const idKeys =
    key === 'douyin'
      ? ['unique_id', 'uniqueId', 'short_id', 'shortId']
      : key === 'xiaohongshu'
        ? ['redId', 'red_id', 'xhsId', 'userId']
        : key === 'kuaishou'
          ? ['userId', 'user_id', 'eid', 'kwaiId']
          : key === 'dianping'
            ? ['userId', 'user_id', 'loginId']
            : ['finderUsername', 'username', 'userId', 'uniqId']

  const blob: RawProfileBlob = {
    platformNickname: pickStr(o, ['nickname', 'nickName', 'userName', 'name', 'displayName']),
    platformAccount: pickStr(o, idKeys).replace(/^@/, ''),
    followers: pickNum(o, [
      'follower_count',
      'followerCount',
      'mplatform_followers_count',
      'fans',
      'fansCount',
      'fan',
      'fanCount',
      'follows',
      'follower',
      'subscribers',
    ]),
    gender: typeof o.gender === 'number' ? o.gender : undefined,
    signature: pickStr(o, ['signature', 'desc', 'description', 'bio', 'userDesc']),
  }

  if (key === 'kuaishou') {
    const grade = pickStr(o, ['liveLevelName', 'authorLevel', 'grade', 'levelName'])
    if (grade) blob.talentGrade = grade
  }
  if (key === 'dianping') {
    const rc = pickNum(o, ['reviewCount', 'review_count', 'commentCount'])
    if (rc > 0) blob.reviewCount = String(rc)
  }

  return blob
}

function findBestProfileInTree(node: unknown, key: ProfilePlatformKey): RawProfileBlob | null {
  let best: { score: number; blob: RawProfileBlob } | null = null

  function walk(n: unknown, depth: number) {
    if (!n || depth > 24) return
    if (Array.isArray(n)) {
      for (const el of n) walk(el, depth + 1)
      return
    }
    if (typeof n !== 'object') return
    const o = n as Record<string, unknown>
    const score = scoreProfileObject(o, key)
    if (score >= 6) {
      const blob = objectToBlob(o, key)
      if (!best || score > best.score) best = { score, blob }
    }
    if (o.user && typeof o.user === 'object') {
      const u = o.user as Record<string, unknown>
      const us = scoreProfileObject(u, key)
      if (us >= 6) {
        const blob = objectToBlob(u, key)
        if (!best || us > best.score) best = { score: us, blob }
      }
    }
    if (o.userInfo && typeof o.userInfo === 'object') walk(o.userInfo, depth + 1)
    if (o.basicInfo && typeof o.basicInfo === 'object') walk(o.basicInfo, depth + 1)
    for (const v of Object.values(o)) walk(v, depth + 1)
  }

  walk(node, 0)
  return best?.blob ?? null
}

function parseProfileFromHtml(html: string, key: ProfilePlatformKey): RawProfileBlob | null {
  const scripts = [
    /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*)/,
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*)/,
    /window\.__INITIAL_SSR_STATE__\s*=\s*(\{[\s\S]*)/,
    /window\.__RENDER_DATA__\s*=\s*(\{[\s\S]*)/,
    /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*)/,
    /window\.__NEXT_DATA__\s*=\s*(\{[\s\S]*)/,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*)/,
  ]
  for (const pat of scripts) {
    const m = pat.exec(html)
    if (!m?.[1]) continue
    const root = parseJsonObjectFromScriptPrefix(m[1])
    const hit = findBestProfileInTree(root, key)
    if (hit?.platformNickname || hit?.platformAccount) return hit
  }

  const nickM = /"(?:nickname|nickName|userName)"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(html)
  const uidM =
    /"(?:unique_id|redId|red_id|userId|finderUsername|kwaiId)"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(
      html,
    ) ?? /"(?:unique_id|userId)"\s*:\s*(\d+)/.exec(html)
  const fansM =
    /"(?:follower_count|followerCount|fansCount|fanCount|fans)"\s*:\s*(\d+)/i.exec(html) ??
    /"(?:mplatform_followers_count)"\s*:\s*(\d+)/.exec(html)
  const genderM = /"gender"\s*:\s*([012])/.exec(html)
  const sigM = /"(?:signature|desc|description|bio)"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(html)

  if (nickM || uidM || fansM) {
    return {
      platformNickname: nickM ? unescapeJsonString(nickM[1]) : undefined,
      platformAccount: uidM ? unescapeJsonString(uidM[1]) : undefined,
      followers: fansM ? Number.parseInt(fansM[1], 10) : undefined,
      gender: genderM ? Number.parseInt(genderM[1], 10) : undefined,
      signature: sigM ? unescapeJsonString(sigM[1]) : undefined,
    }
  }

  const ogTitle = pickMetaContent(html, 'og:title')
  const ogDesc = pickMetaContent(html, 'og:description')
  if (ogTitle) {
    const title = ogTitle.replace(/\s*[-|–—]\s*.*$/, '').trim()
    return {
      platformNickname: title,
      signature: ogDesc || '',
    }
  }

  return null
}

function cleanUrlFromText(text: string): string {
  let u = text.trim()
  u = u.replace(/[/，。！？、；：'"）】\]>]+$/u, '')
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, '')}`
  try {
    const parsed = new URL(u)
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return u
  }
}

function extractPlatformUrlFromText(text: string, key: ProfilePlatformKey): string | null {
  const t = text.trim()
  if (!t) return null

  if (key === 'douyin') {
    const share = extractDouyinShareFromText(t)
    if (share.url) return normalizeDouyinShareUrl(share.url)
    return normalizeDouyinShareUrl(t)
  }

  const hostPart =
    key === 'xiaohongshu'
      ? '(?:www\\.)?(?:xiaohongshu\\.com|xhslink\\.com)[^\\s\\u4e00-\\u9fff「」【】《》]+'
      : key === 'kuaishou'
        ? '(?:www\\.)?(?:kuaishou\\.com|v\\.kuaishou\\.com|chenzhongtech\\.com)[^\\s\\u4e00-\\u9fff「」【】《》]+'
        : key === 'dianping'
          ? '(?:www\\.|m\\.)?dianping\\.com[^\\s\\u4e00-\\u9fff「」【】《》]+'
          : 'channels\\.weixin\\.qq\\.com[^\\s\\u4e00-\\u9fff「」【】《】]+'

  const re = new RegExp(`https?:\\/\\/${hostPart}`, 'gi')
  const hits: string[] = []
  for (const m of t.matchAll(re)) {
    if (m[0]) hits.push(cleanUrlFromText(m[0]))
  }
  if (hits.length) return hits[0] ?? null

  const bare = new RegExp(hostPart.replace('https?:\\/\\/', ''), 'i')
  const bareM = bare.exec(t)
  if (bareM?.[0]) return cleanUrlFromText(bareM[0])

  return cleanUrlFromText(t)
}

function isPlatformProfileUrl(url: string, key: ProfilePlatformKey): boolean {
  try {
    const u = new URL(url)
    if (!PLATFORM_HOST[key].test(u.hostname)) return false
    return PROFILE_PATH[key].test(u.pathname + u.search) || PROFILE_PATH[key].test(url)
  } catch {
    return PLATFORM_HOST[key].test(url)
  }
}

async function followRedirects(url: string, key: ProfilePlatformKey): Promise<string> {
  const shortRe = SHORT_LINK_HOST[key]
  let current = url
  const max = shortRe && shortRe.test(url) ? 8 : 3

  for (let step = 0; step < max; step++) {
    try {
      const res = await fetch(current, {
        redirect: 'manual',
        headers: fetchHeaders(key),
        signal: AbortSignal.timeout(12_000),
      })
      const loc = res.headers.get('location')
      if (loc && res.status >= 300 && res.status < 400) {
        current = new URL(loc, current).toString()
        if (isPlatformProfileUrl(current, key)) return current
        continue
      }
      if (res.status === 200) return res.url?.trim() || current
      break
    } catch {
      break
    }
  }

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: fetchHeaders(key),
      signal: AbortSignal.timeout(15_000),
    })
    return res.url?.trim() || url
  } catch {
    return url
  }
}

async function resolveProfileUrl(raw: string, key: ProfilePlatformKey): Promise<string | null> {
  const extracted = extractPlatformUrlFromText(raw, key)
  if (!extracted) return null

  let url = extracted
  try {
    const u = new URL(url)
    if (!PLATFORM_HOST[key].test(u.hostname)) return null
  } catch {
    if (!PLATFORM_HOST[key].test(url)) return null
  }

  url = await followRedirects(url, key)
  if (isPlatformProfileUrl(url, key)) return url

  if (PLATFORM_HOST[key].test(url)) return url
  return null
}

function genderLabel(code: number | undefined): '' | '男' | '女' {
  if (code === 1) return '男'
  if (code === 2) return '女'
  return ''
}

function inferAccountTags(signature: string): string[] {
  const text = String(signature || '').trim()
  if (!text) return []
  const picked = new Set<string>()
  for (const m of text.matchAll(/#([^\s#]{1,12})/g)) {
    const frag = m[1] || ''
    for (const tag of TALENT_TAG_OPTIONS) {
      if (frag.includes(tag) || tag.includes(frag)) picked.add(tag)
    }
  }
  for (const tag of TALENT_TAG_OPTIONS) {
    const kws = TAG_KEYWORDS[tag] || [tag]
    if (kws.some((kw) => text.includes(kw))) picked.add(tag)
  }
  return [...picked].slice(0, 5)
}

const PLATFORM_HINT: Record<ProfilePlatformKey, string> = {
  douyin: '抖音 App「分享主页」',
  xiaohongshu: '小红书 App「分享主页」',
  kuaishou: '快手 App「分享主页」',
  dianping: '大众点评达人/店铺主页分享',
  weixin_video: '微信视频号主页分享链接',
}

export async function runProfileLinkParseCore(
  input: ProfileLinkParseInput,
): Promise<ProfileLinkParseResult> {
  const key = normalizeProfilePlatform(input.platform || '抖音')
  const platName = platformDisplayName(key)
  const raw = String(input.link || '').trim()
  if (!raw) return { ok: false, message: `请先粘贴${platName}主页分享链接` }

  const profileUrl = await resolveProfileUrl(raw, key)
  if (!profileUrl) {
    return {
      ok: false,
      message: `未能识别为${platName}主页链接。请复制${PLATFORM_HINT[key]}的整段口令或链接后重试。`,
    }
  }

  let html = ''
  try {
    const res = await fetch(profileUrl, {
      redirect: 'follow',
      headers: fetchHeaders(key),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { ok: false, message: `抓取主页失败（HTTP ${res.status}），请稍后重试或手动填写。` }
    }
    html = await res.text()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `网络请求失败：${msg.slice(0, 120)}` }
  }

  const user = parseProfileFromHtml(html, key)
  if (!user) {
    return {
      ok: false,
      message: `已打开${platName}主页但未解析到资料（可能触发平台反爬）。请稍后重试或手动填写。`,
    }
  }

  const platformNickname = String(user.platformNickname || '').trim()
  const platformAccount = String(user.platformAccount || '').replace(/^@/, '').trim()
  const followers = Math.max(0, Number(user.followers ?? 0) || 0)

  if (!platformNickname && !platformAccount) {
    return { ok: false, message: '解析结果不完整，请手动填写昵称与账号。' }
  }

  const out: ProfileLinkParseOk = {
    ok: true,
    platform: platName,
    platformAccount,
    platformNickname,
    profileLink: profileUrl,
    followers,
    gender: genderLabel(user.gender),
    accountTags: inferAccountTags(String(user.signature || '')),
  }
  if (user.talentGrade) out.talentGrade = user.talentGrade
  if (user.reviewCount) out.reviewCount = user.reviewCount
  return out
}

/** @deprecated 使用 runProfileLinkParseCore */
export async function runDouyinProfileParseCore(
  input: ProfileLinkParseInput,
): Promise<ProfileLinkParseResult> {
  return runProfileLinkParseCore(input)
}

export type DouyinProfileParseInput = ProfileLinkParseInput
export type DouyinProfileParseOk = ProfileLinkParseOk
export type DouyinProfileParseResult = ProfileLinkParseResult
