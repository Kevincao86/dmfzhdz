/**
 * 抖音主页分享链接 → 结构化达人资料（零 LLM：解析 HTML 内嵌 JSON）
 */
import {
  extractDouyinShareFromText,
  normalizeDouyinShareUrl,
} from './digitalHumanDouyinLinkCore.js'

export type DouyinProfileParseInput = {
  link: string
  platform?: string
}

export type DouyinProfileParseOk = {
  ok: true
  platform: '抖音'
  platformAccount: string
  platformNickname: string
  profileLink: string
  followers: number
  gender: '' | '男' | '女'
  accountTags: string[]
}

export type DouyinProfileParseResult = DouyinProfileParseOk | { ok: false; message: string }

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const FETCH_HEADERS = {
  'User-Agent': MOBILE_UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
  Referer: 'https://www.douyin.com/',
} as const

/** 与小程序 / 履约 Web 账号标签选项对齐 */
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

type DouyinUserBlob = {
  nickname?: string
  unique_id?: string | number
  short_id?: string | number
  sec_uid?: string
  follower_count?: number
  mplatform_followers_count?: number
  gender?: number
  signature?: string
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

function looksLikeDouyinUser(o: Record<string, unknown>): boolean {
  const nick = o.nickname
  if (typeof nick !== 'string' || !nick.trim()) return false
  const hasId =
    typeof o.unique_id === 'string' ||
    typeof o.unique_id === 'number' ||
    typeof o.short_id === 'string' ||
    typeof o.short_id === 'number'
  if (!hasId) return false
  return (
    typeof o.follower_count === 'number' ||
    typeof o.mplatform_followers_count === 'number' ||
    typeof o.sec_uid === 'string'
  )
}

function findDouyinUserInUnknown(node: unknown): DouyinUserBlob | null {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const el of node) {
      const hit = findDouyinUserInUnknown(el)
      if (hit) return hit
    }
    return null
  }
  const o = node as Record<string, unknown>
  if (looksLikeDouyinUser(o)) return o as DouyinUserBlob
  if (o.user && typeof o.user === 'object' && looksLikeDouyinUser(o.user as Record<string, unknown>)) {
    return o.user as DouyinUserBlob
  }
  if (o.userInfo && typeof o.userInfo === 'object') {
    const ui = o.userInfo as Record<string, unknown>
    if (looksLikeDouyinUser(ui)) return ui as DouyinUserBlob
    if (ui.user && typeof ui.user === 'object') {
      const u = ui.user as Record<string, unknown>
      if (looksLikeDouyinUser(u)) return u as DouyinUserBlob
    }
  }
  for (const v of Object.values(o)) {
    const hit = findDouyinUserInUnknown(v)
    if (hit) return hit
  }
  return null
}

function parseUserFromHtml(html: string): DouyinUserBlob | null {
  const router = /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*)/.exec(html)
  if (router?.[1]) {
    const root = parseJsonObjectFromScriptPrefix(router[1])
    const hit = findDouyinUserInUnknown(root)
    if (hit) return hit
  }
  const render = /window\.__RENDER_DATA__\s*=\s*(\{[\s\S]*)/.exec(html)
  if (render?.[1]) {
    const root = parseJsonObjectFromScriptPrefix(render[1])
    const hit = findDouyinUserInUnknown(root)
    if (hit) return hit
  }
  const nickM = /"nickname"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(html)
  const uidM =
    /"unique_id"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(html) ??
    /"unique_id"\s*:\s*(\d+)/.exec(html)
  const fansM =
    /"follower_count"\s*:\s*(\d+)/.exec(html) ??
    /"mplatform_followers_count"\s*:\s*(\d+)/.exec(html)
  const genderM = /"gender"\s*:\s*([012])/.exec(html)
  const sigM = /"signature"\s*:\s*"((?:\\.|[^"\\])*)"/.exec(html)
  if (nickM || uidM || fansM) {
    return {
      nickname: nickM ? unescapeJsonString(nickM[1]) : undefined,
      unique_id: uidM ? unescapeJsonString(uidM[1]) : undefined,
      follower_count: fansM ? Number.parseInt(fansM[1], 10) : undefined,
      gender: genderM ? Number.parseInt(genderM[1], 10) : undefined,
      signature: sigM ? unescapeJsonString(sigM[1]) : undefined,
    }
  }
  return null
}

function unescapeJsonString(raw: string): string {
  try {
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`) as string
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
}

function isDouyinUserProfileUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (!/(?:^|\.)?(?:douyin\.com|iesdouyin\.com)$/i.test(u.hostname)) return false
    return /\/share\/user\//i.test(u.pathname) || /\/user\//i.test(u.pathname)
  } catch {
    return /share\/user|iesdouyin\.com\/share\/user/i.test(url)
  }
}

async function resolveProfileUrl(input: string): Promise<string | null> {
  const share = extractDouyinShareFromText(input)
  let url = share.url ? normalizeDouyinShareUrl(share.url) : normalizeDouyinShareUrl(input.trim())
  if (!url) return null

  if (/v\.douyin\.com/i.test(url)) {
    let current = url
    for (let step = 0; step < 8; step++) {
      try {
        const res = await fetch(current, {
          redirect: 'manual',
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(12_000),
        })
        const loc = res.headers.get('location')
        if (loc && res.status >= 300 && res.status < 400) {
          current = new URL(loc, current).toString()
          if (isDouyinUserProfileUrl(current)) return current
          continue
        }
        if (res.status === 200) {
          const html = await res.text()
          const user = parseUserFromHtml(html)
          if (user?.sec_uid) {
            return `https://www.douyin.com/user/${user.sec_uid}`
          }
          if (isDouyinUserProfileUrl(current)) return current
          break
        }
        break
      } catch {
        break
      }
    }
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      const finalUrl = res.url?.trim() || url
      if (isDouyinUserProfileUrl(finalUrl)) return finalUrl
      if (res.ok) {
        const html = await res.text()
        const user = parseUserFromHtml(html)
        if (user?.sec_uid) return `https://www.douyin.com/user/${user.sec_uid}`
      }
      return isDouyinUserProfileUrl(finalUrl) ? finalUrl : null
    } catch {
      return null
    }
  }

  if (isDouyinUserProfileUrl(url)) return url
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

function normalizeAccountId(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s.replace(/^@/, '')
}

export async function runDouyinProfileParseCore(
  input: DouyinProfileParseInput,
): Promise<DouyinProfileParseResult> {
  const plat = String(input.platform || '抖音').trim()
  if (plat !== '抖音' && !plat.includes('抖')) {
    return { ok: false, message: '暂仅支持抖音主页链接自动填写' }
  }
  const raw = String(input.link || '').trim()
  if (!raw) return { ok: false, message: '请先粘贴抖音主页分享链接' }

  const profileUrl = await resolveProfileUrl(raw)
  if (!profileUrl) {
    return {
      ok: false,
      message: '未能识别为抖音达人主页链接。请复制抖音 App「分享主页」的整段口令或链接后重试。',
    }
  }

  let html = ''
  try {
    const res = await fetch(profileUrl, {
      redirect: 'follow',
      headers: FETCH_HEADERS,
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

  const user = parseUserFromHtml(html)
  if (!user) {
    return {
      ok: false,
      message: '已打开主页但未解析到资料（可能触发抖音反爬）。请稍后重试或手动填写。',
    }
  }

  const platformNickname = String(user.nickname || '').trim()
  const platformAccount = normalizeAccountId(user.unique_id ?? user.short_id)
  const followers = Math.max(
    0,
    Number(user.follower_count ?? user.mplatform_followers_count ?? 0) || 0,
  )

  if (!platformNickname && !platformAccount) {
    return { ok: false, message: '解析结果不完整，请手动填写昵称与抖音号。' }
  }

  return {
    ok: true,
    platform: '抖音',
    platformAccount,
    platformNickname,
    profileLink: profileUrl,
    followers,
    gender: genderLabel(user.gender),
    accountTags: inferAccountTags(String(user.signature || '')),
  }
}
