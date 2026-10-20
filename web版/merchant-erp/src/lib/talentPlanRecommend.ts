import { postAiChat } from '../services/ai/aiClient'
import type { KolTierKey } from './merchantRecruitmentTierPlan'
import { inferKolTierFromApplicant, kolTierLabel } from './merchantRecruitmentTierPlan'
import type { RegistryTalentLibraryEntry } from './opsRegistryTypes'
import { extractProfileLinkUrl } from './talentProfileLink'
import { isIncompleteTalentLibraryEntry } from './talentLibraryUpsert'
import {
  buildNoviceAllocationFromTalentLibrary,
  parseQuotePriceYuan,
  resolveTalentLibraryEntriesForCity,
} from './talentLibraryTierPricing'

export type TalentPlanSeat = {
  seatId: string
  tierKey: KolTierKey
  tierLabel: string
  unitBudgetYuan: number
  talentType: string
  platform: string
  lockedTalentId?: string
}

export type TalentPlanCard = {
  seatId: string
  talentId: string
  nickname: string
  city: string
  platform: string
  followers: number
  /** 公网粉丝来自检索摘录。没有该标记的数字是模型填写的，界面不展示 */
  followersVerified?: boolean
  level: string
  quoteYuan: number | null
  tags: string[]
  /** 微信头像，仅 https。账号表只读补全，不落库 */
  avatarUrl: string
  /** 可打开的主页链接。公网未核到时是抖音搜索页 */
  profileLink: string
  /** 公网主页来自检索引用。没有该标记的用户主页按编造处理 */
  profileVerified?: boolean
  tierLabel: string
  unitBudgetYuan: number
  talentType: string
  source: 'library' | 'public'
  reason: string
  empty?: boolean
  /** 星选小程序会员 id。没有对应会员时不能站内定向邀约 */
  memberId?: string
  /** 公网这位达人已经过豆包联网检索，确认是本地生活探店账号 */
  exploreVerified?: boolean
}

export type TalentBudgetSeatSource = {
  talentRows?: Array<{
    platform?: string
    tier?: string
    talentType?: string
    headcount?: number
    unitBudgetYuan?: number
    contentForm?: string
  }>
  budgetLines?: Array<{
    category?: string
    platform?: string
    tier?: string
    headcount?: number
    unitBudgetYuan?: number
    note?: string
  }>
}

/** 与招募向导人数上限一致，避免方案要 36 人时名单被截成 24 人 */
const MAX_SEATS = 80

function asPlatform(raw: string): RegistryTalentLibraryEntry['platform'] {
  if (raw === '小红书' || raw === '大众点评' || raw === '快手' || raw === '微信视频号') return raw
  return '抖音'
}

/** 门店类目近义词。命中任一算接近，不用「生活」「探店」凑人数。 */
const CLOSE_CATEGORY_GROUPS: Array<{ keys: string[]; words: string[] }> = [
  { keys: ['足疗', '足浴', '洗浴', '按摩'], words: ['足疗', '足浴', '洗浴', '按摩', 'SPA', '养生', '休闲娱乐', '休闲'] },
  { keys: ['休闲娱乐'], words: ['休闲娱乐', '休闲', '娱乐', '足疗', '足浴', 'KTV', '酒吧', '剧本杀', '密室', '洗浴', '养生'] },
  { keys: ['丽人', '美发', '美甲', '美睫', '美容'], words: ['丽人', '美发', '美甲', '美睫', '美容', '美妆'] },
  { keys: ['餐饮', '美食', '火锅', '烧烤'], words: ['餐饮', '美食', '火锅', '烧烤'] },
  { keys: ['亲子'], words: ['亲子', '母婴', '儿童'] },
  { keys: ['母婴'], words: ['母婴', '亲子'] },
  { keys: ['医疗', '医美', '口腔'], words: ['医疗', '医美', '口腔', '齿科'] },
  { keys: ['宠物'], words: ['宠物'] },
  { keys: ['运动', '健身'], words: ['运动', '健身'] },
  { keys: ['酒店', '旅游', '民宿'], words: ['酒店', '旅游', '民宿'] },
  { keys: ['生活服务', '家政'], words: ['生活服务', '家政', '保洁'] },
]

export function talentCloseWords(industry: string): string[] {
  const parts = String(industry || '')
    .split(/[/、,，|>]+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !/本地生活|到店|其他|推广/.test(part))
  const words = new Set<string>()
  for (const part of parts) {
    let hit = false
    for (const group of CLOSE_CATEGORY_GROUPS) {
      if (!group.keys.some((key) => part.includes(key))) continue
      hit = true
      for (const word of group.words) words.add(word)
    }
    if (!hit) words.add(part)
  }
  return [...words].slice(0, 16)
}

export function talentCardMatchesCloseWords(
  card: Pick<TalentPlanCard, 'nickname' | 'reason' | 'level' | 'tags'>,
  words: string[],
): boolean {
  if (!words.length) return true
  const blob = [card.nickname, card.reason, card.level, ...(card.tags || [])].join(' ')
  return words.some((word) => word && blob.includes(word))
}

function profileUrlPattern(): RegExp {
  return /https?:\/\/(?:[\w.-]+\.)?(?:douyin\.com\/(?:user|share\/user)\/[A-Za-z0-9_-]+|v\.douyin\.com\/[A-Za-z0-9]+|iesdouyin\.com\/share\/user\/[A-Za-z0-9_-]+|xiaohongshu\.com\/user\/[A-Za-z0-9]+|xhslink\.com\/[A-Za-z0-9]+|kuaishou\.com\/(?:profile|fw)\/[A-Za-z0-9]+)/gi
}

function cleanProfileUrl(raw: string): string {
  return raw.replace(/[)），。]+$/, '').replace(/\/+$/, '')
}

/** 只认检索结果里单独列出的主页，不认模型写在达人行里的链接。 */
export function citedProfileUrls(text: string): string[] {
  const block = String(text || '').split('【检索到的主页】')[1] || ''
  const found = block.match(profileUrlPattern()) || []
  return [...new Set(found.map((url) => cleanProfileUrl(url)))]
}

/** 旧会话里的公网主页没有核验标记，打开时改去抖音搜索，避免「用户不存在」。 */
export function displayTalentProfileLink(card: {
  source: string
  nickname: string
  profileLink: string
  profileVerified?: boolean
}): string {
  if (card.source !== 'public') return card.profileLink || ''
  if (card.profileVerified && card.profileLink && !/\/search\//.test(card.profileLink)) return card.profileLink
  if (card.profileLink && /\/search\//.test(card.profileLink)) return card.profileLink
  return publicTalentJumpLink(card.nickname, '', [])
}

/** 检索里核到的主页才当主页；否则去抖音搜索昵称，避免点进「用户不存在」。 */
export function publicTalentJumpLink(nickname: string, rawUrl: string, cited: string[]): string {
  const url = (String(rawUrl || '').match(profileUrlPattern()) || [])[0] || ''
  const cleaned = url ? cleanProfileUrl(url) : ''
  if (cleaned && cited.some((item) => cleanProfileUrl(item) === cleaned)) return cleaned
  const name = nickname.trim()
  if (name.length < 2) return ''
  return `https://www.douyin.com/search/${encodeURIComponent(name)}?type=user`
}

function fanCountInExcerpt(row: string): number {
  const wan = row.match(/(\d+(?:\.\d+)?)\s*万\s*粉/)
  if (wan) return Math.round(Number(wan[1]) * 10000)
  const labeled = row.match(/粉(?:丝)?[:：]?\s*(\d+(?:\.\d+)?)\s*万/)
  if (labeled) return Math.round(Number(labeled[1]) * 10000)
  const plain = row.match(/粉丝[:：]?\s*(\d{2,})/)
  return plain ? Number(plain[1]) : 0
}

const BRAND_ACCOUNT_RE = /旗舰店|官方|官旗|专卖店|企业号|总店|直营店|品牌店|体验店|形象店|品牌推广|官方号|门店号|放映室|电视台|传媒/

/** 旗舰店、官方号、门店自己的号直接排除，不必再检索。 */
export function isBrandPublicAccount(nickname: string, direction = ''): boolean {
  const name = nickname.trim()
  if (name.length < 2) return true
  return BRAND_ACCOUNT_RE.test(`${name}${direction}`)
}

/** 只认豆包这次检索写出的探店结论。昵称里有没有「探店」不算。 */
export function exploreSearchSaysYes(text: string): boolean {
  const body = String(text || '').split('【检索')[0].replace(/\*\*/g, '').trim()
  if (!body) return false
  const lines = body
    .split(/\n+/)
    .map((row) => row.replace(/^[\s\d.、\-•*]+/, '').trim())
    .filter(Boolean)
  const head = lines.find((row) => /^(是|否)/.test(row)) || ''
  if (/^否/.test(head)) return false
  const basis = head.replace(/^是[|｜:：,，\s]*/, '').trim()
  if (/不是探店|非探店|不算探店|并非探店/.test(basis || body)) return false
  const evidence = `${head}\n${body}`
  if (!/探店|到店|打卡/.test(evidence)) return false
  if (/^是/.test(head)) {
    if (basis.length < 8) return false
    if (/^(本地生活)?探店达人[。！!]?$/.test(basis)) return false
    return true
  }
  return /该账号|这个账号|博主|达人/.test(body) && /探店|到店打卡|到店拍摄/.test(body) && body.length >= 12
}

/** 依据里写明「由某人运营 / 真名是某人」时，某人是同一个号，不能再占一个名额。 */
export function exploreOperatorNames(text: string): string[] {
  const body = String(text || '').split('【检索')[0]
  const found = new Set<string>()
  for (const match of body.matchAll(/由(?:[^，,。|｜\n]{0,24}?)([\u4e00-\u9fa5]{2,3})\s*(?:个人)?运营/g)) {
    if (match[1]) found.add(match[1].trim())
  }
  for (const match of body.matchAll(/(?:真名|本名)(?:是|为|叫)\s*([\u4e00-\u9fa5]{2,3})/g)) {
    if (match[1]) found.add(match[1].trim())
  }
  return [...found]
}

const EXPLORE_JUDGE_SYSTEM = (name: string) =>
  `你是豆包公网检索。请联网搜索抖音账号「${name}」，只根据检索结果判断：这个账号是不是自己在做本地生活探店（到店拍摄、探店、吃喝玩乐打卡）。昵称里有没有「探店」两个字不能作为依据。品牌官方号、旗舰店、专卖店、门店自己的号、企业号、放映室、电视台回答否。检索结果看不出在做探店，回答否。不要前言。只写一行：是｜检索依据，或：否｜原因。依据必须来自这次检索，写清这个账号实际发什么内容。`

async function oneExploreVerdict(
  name: string,
  city: string,
  signal?: AbortSignal,
): Promise<{ yes: boolean; text: string }> {
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => ac.abort(), 22000)
  try {
    const data = await postAiChat(
      {
        provider: 'doubao',
        stream: false,
        temperature: 0,
        webSearch: true,
        messages: [
          { role: 'system', content: EXPLORE_JUDGE_SYSTEM(name) },
          { role: 'user', content: `搜索：抖音 ${name} ${city || ''} 探店` },
        ],
      },
      { signal: ac.signal },
    )
    const text = String(data.content || '')
    return { yes: exploreSearchSaysYes(text), text }
  } catch {
    return { yes: false, text: '' }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** 两次结论要一致。一是一否时再查一次，以多数为准。 */
async function exploreVerdictMajority(
  name: string,
  city: string,
  signal?: AbortSignal,
): Promise<{ yes: boolean; text: string }> {
  let yesCount = 0
  let noCount = 0
  let yesText = ''
  for (let attempt = 0; attempt < 3 && yesCount < 2 && noCount < 2; attempt += 1) {
    if (signal?.aborted) break
    const verdict = await oneExploreVerdict(name, city, signal)
    if (verdict.yes) {
      yesCount += 1
      yesText = verdict.text
    } else {
      noCount += 1
    }
  }
  return { yes: yesCount >= 2, text: yesText }
}

/** 对这一位达人单独联网检索。两次结论一致才收下。 */
export async function searchConfirmsExploreCreator(
  nickname: string,
  city: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const name = nickname.trim()
  if (isBrandPublicAccount(name)) return false
  const verdict = await exploreVerdictMajority(name, city, signal)
  return verdict.yes
}

/** 逐个检索。同时最多 6 个。同一人的真名和昵称只留昵称那一条。 */
export async function nicknamesConfirmedExplore(
  names: string[],
  city: string,
  signal?: AbortSignal,
  aliasOut?: Set<string>,
): Promise<Set<string>> {
  const unique = [...new Set(names.map((item) => item.trim()).filter((item) => !isBrandPublicAccount(item)))]
  const confirmed = new Set<string>()
  const basis = new Map<string, string>()
  let cursor = 0
  async function worker() {
    while (cursor < unique.length) {
      if (signal?.aborted) return
      const index = cursor
      cursor += 1
      const name = unique[index]!
      if (isBrandPublicAccount(name)) continue
      const verdict = await exploreVerdictMajority(name, city, signal)
      if (!verdict.yes) continue
      confirmed.add(name)
      basis.set(name, verdict.text)
    }
  }
  const workers = Math.min(6, unique.length)
  if (workers > 0) await Promise.all(Array.from({ length: workers }, () => worker()))
  for (const text of basis.values()) {
    for (const alias of exploreOperatorNames(text)) {
      if (confirmed.has(alias)) confirmed.delete(alias)
      aliasOut?.add(alias)
    }
  }
  return confirmed
}

export type PublicTalentSeed = {
  nickname: string
  city: string
  direction: string
  sourceText: string
  rawUrl: string
}

/** 先搜同城探店名单，再按类目和区县补。实测这两类检索词才能凑出人数。 */
export function exploreFillQueries(city: string, industry: string): string[] {
  const region = String(city || '本地').replace(/市$/, '').trim() || '本地'
  const angles = talentCloseWords(industry).filter((word) => word.length >= 2 && word !== '休闲' && word !== '娱乐')
  const head = [
    `${region} 抖音 探店达人`,
    `${region} 抖音 本地生活 探店博主`,
    `${region} 抖音 美食探店博主`,
    `${region} 各县市区 抖音 探店达人`,
    `${region} 抖音 吃喝玩乐 探店`,
    `${region} 市区 抖音 探店博主`,
    `${region} 县城 抖音 探店达人`,
  ]
  const local = /温州/.test(region) ? ['温州 鹿城 抖音 探店博主', '永嘉 抖音 探店达人'] : []
  const angled = angles.slice(0, 3).map((word) => `${region} 抖音 ${word} 探店达人`)
  return [...new Set([...head, ...local, ...angled])].slice(0, 12)
}

const PUBLIC_NAME_SKIP = /^(达人|公网|检索|粉丝|探店|本地生活|抖音|昵称|城市|无|主页|内容|实际内容|等级|推荐)$/

function publicRosterBody(text: string): string {
  const marks = ['【检索到的主页】', '【检索摘录】']
  let cut = text.length
  for (const mark of marks) {
    const index = text.indexOf(mark)
    if (index >= 0 && index < cut) cut = index
  }
  return text.slice(0, cut)
}

export function parsePublicTalentSeeds(text: string, fallbackCity: string): PublicTalentSeed[] {
  const sourceText = String(text || '')
  const out: PublicTalentSeed[] = []
  const seen = new Set<string>()
  for (const line of publicRosterBody(sourceText).split(/\n+/)) {
    const row = line.replace(/^[\s\d.、\-•*]+/, '').replace(/\*\*/g, '').trim()
    if (!row || /暂无|不拉公网|库内已凑满|没有返回|公网暂无/.test(row)) continue
    if (/不对|没有这个|不确定|剩下|重新看/.test(row)) continue
    const parts = row.split(/[|｜]/).map((part) => part.trim()).filter(Boolean)
    if (parts.length < 2) continue
    let nickname = parts[0]!.replace(/^昵称[:：]/, '')
    const city = parts[1] || fallbackCity
    const direction = parts.find((part, index) => index >= 3 && !/^https?:/.test(part) && part !== '无') || ''
    nickname = nickname.replace(/[（(].*$/, '').trim().slice(0, 24)
    if (nickname.length < 3 || seen.has(nickname) || PUBLIC_NAME_SKIP.test(nickname)) continue
    if (isBrandPublicAccount(nickname, `${direction}${row}`)) continue
    seen.add(nickname)
    const rawUrl = (row.match(/https?:\/\/[^\s|｜)）]+/) || [])[0] || ''
    out.push({ nickname, city, direction, sourceText, rawUrl })
  }
  return out
}

export async function searchPublicTalentBatch(opts: {
  query: string
  city: string
  count: number
  skipNames: string[]
  signal?: AbortSignal
}): Promise<string> {
  const want = Math.min(12, Math.max(1, opts.count))
  const skip = opts.skipNames.filter(Boolean).slice(0, 40)
  const ac = new AbortController()
  const onAbort = () => ac.abort()
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => ac.abort(), 32000)
  try {
    const data = await postAiChat(
      {
        provider: 'doubao',
        stream: false,
        temperature: 0,
        webSearch: true,
        messages: [
          {
            role: 'system',
            content: `你是豆包公网达人检索。请联网搜索「${opts.query}」。只写检索结果里能看出本人在做本地生活探店的抖音账号，昵称不必含有「探店」。不要品牌官方号、旗舰店、专卖店、门店自己的号、企业号，不要拿不确定的人凑数。检索里有几位就写几位，禁止为了写满 ${want} 行而编造。${skip.length ? `不要重复：${skip.join('、')}。` : ''}每人一行：昵称｜城市｜无｜实际内容｜主页。粉丝写无。主页只能原样复制检索结果里的用户主页，没有就写无。一个都没有就只回答「公网暂无」。`,
          },
          {
            role: 'user',
            content: `城市：${opts.city || ''}\n搜索：${opts.query}。只列出检索能确认的探店达人，目标 ${want} 位，不够就少写。`,
          },
        ],
      },
      { signal: ac.signal },
    )
    return String(data.content || '').trim()
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** 换检索词继续补，直到人数够，或 12 个不同检索词都用完。 */
export async function fillExploreTalentSeeds(opts: {
  city: string
  industry: string
  gap: number
  skipNames?: string[]
  signal?: AbortSignal
  queries?: string[]
  searchBatch?: (query: string, count: number, skip: string[], signal?: AbortSignal) => Promise<string>
  confirmNames?: (names: string[], city: string, signal?: AbortSignal) => Promise<Set<string>>
}): Promise<PublicTalentSeed[]> {
  const gap = Math.max(0, Math.min(20, opts.gap))
  if (!gap) return []
  const queries = (opts.queries?.length ? opts.queries : exploreFillQueries(opts.city, opts.industry)).slice(0, 12)
  const searchBatch =
    opts.searchBatch ||
    ((query: string, count: number, skip: string[], signal?: AbortSignal) =>
      searchPublicTalentBatch({ query, city: opts.city, count, skipNames: skip, signal }))
  const aliases = new Set<string>()
  const confirmNames =
    opts.confirmNames ||
    ((names: string[], city: string, signal?: AbortSignal) =>
      nicknamesConfirmedExplore(names, city, signal, aliases))
  const kept: PublicTalentSeed[] = []
  const seen = new Set((opts.skipNames || []).map((name) => name.trim()).filter(Boolean))
  for (let index = 0; index < queries.length && kept.length < gap; index += 2) {
    if (opts.signal?.aborted) break
    const wave = queries.slice(index, index + 2)
    const left = gap - kept.length
    const ask = Math.min(12, Math.max(left, Math.min(8, left + 3)))
    const skip = [...seen].slice(0, 40)
    const texts = await Promise.all(
      wave.map((query) => searchBatch(query, ask, skip, opts.signal).catch(() => '')),
    )
    const fresh: PublicTalentSeed[] = []
    for (const text of texts) {
      for (const seed of parsePublicTalentSeeds(text, opts.city)) {
        if (seen.has(seed.nickname)) continue
        seen.add(seed.nickname)
        fresh.push(seed)
      }
    }
    if (!fresh.length) continue
    const confirmed = await confirmNames(
      fresh.map((seed) => seed.nickname),
      opts.city,
      opts.signal,
    )
    for (const seed of fresh) {
      if (kept.length >= gap) break
      if (!confirmed.has(seed.nickname) || aliases.has(seed.nickname)) continue
      kept.push(seed)
    }
    for (let keptIndex = kept.length - 1; keptIndex >= 0; keptIndex -= 1) {
      if (aliases.has(kept[keptIndex]!.nickname)) kept.splice(keptIndex, 1)
    }
  }
  return kept
}

/** 只认检索摘录里和该昵称写在一起的粉丝数，不认模型名单里的数字。 */
export function citedFollowerCount(nickname: string, text: string): number {
  const name = nickname.trim()
  if (name.length < 2) return 0
  const block = String(text || '').split('【检索摘录】')[1] || ''
  let best = 0
  for (const line of block.split('\n')) {
    const row = line.trim()
    if (!row.includes(name)) continue
    const found = fanCountInExcerpt(row)
    if (found > best) best = found
  }
  return best
}

export function formatFollowerCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return ''
  if (count >= 10000) {
    const wan = count / 10000
    const text = wan >= 100 ? String(Math.round(wan)) : String(Math.round(wan * 10) / 10)
    return `${text}万`
  }
  return String(Math.round(count))
}

export function talentCardFromPublicSeed(seed: PublicTalentSeed, seatId: string, talentType: string): TalentPlanCard {
  const followers = citedFollowerCount(seed.nickname, seed.sourceText)
  const profileLink = publicTalentJumpLink(seed.nickname, seed.rawUrl, citedProfileUrls(seed.sourceText))
  return {
    seatId,
    talentId: `public:${seed.nickname}`,
    nickname: seed.nickname,
    city: seed.city,
    platform: '抖音',
    followers,
    followersVerified: followers > 0,
    level: '',
    quoteYuan: null,
    tags: [],
    avatarUrl: '',
    profileLink,
    profileVerified: Boolean(profileLink) && !/\/search\//.test(profileLink),
    tierLabel: '公网',
    unitBudgetYuan: 0,
    talentType: seed.direction || talentType,
    source: 'public',
    exploreVerified: true,
    reason: seed.direction ? `公网 · ${seed.direction}` : '公网补位',
  }
}

export function talentRosterNote(headcount: number, libraryCount: number, publicCount: number): string {
  const asked = `方案要 ${headcount} 位。`
  if (publicCount > 0) return `${asked}星选库接近要求的有 ${libraryCount} 位，公网补了 ${publicCount} 位。`
  if (libraryCount < headcount) return `${asked}星选库接近要求的有 ${libraryCount} 位。公网这次没有补到更多同城达人。`
  return `${asked}星选库已按门店类目配满 ${libraryCount} 位。`
}

export function tierKeyFromLabel(tier: string): KolTierKey {
  const s = tier.trim()
  if (/5\+|V5\+|以上/.test(s)) return 'v5plus'
  if (/头|V5|^5|五级/.test(s)) return 'v5'
  if (/腰|V4|^4|四级/.test(s)) return 'v4'
  return 'v3'
}

function isPeopleBudgetLine(category: string): boolean {
  if (/投流|本地推/.test(category)) return false
  return /达人/.test(category)
}

/** 方案里的达人行展开成一个名额一张卡。投流、本地推不进人。 */
export function seatsFromTalentBudget(
  budget: TalentBudgetSeatSource | null | undefined,
  fallbackPlatform = '抖音',
): TalentPlanSeat[] {
  const seats: TalentPlanSeat[] = []
  const rows = Array.isArray(budget?.talentRows) ? budget.talentRows : []
  const lines = Array.isArray(budget?.budgetLines) ? budget.budgetLines : []
  const push = (row: {
    platform?: string
    tier?: string
    talentType?: string
    headcount?: number
    unitBudgetYuan?: number
  }, kind: string) => {
    const count = Math.max(0, Math.floor(Number(row.headcount) || 0))
    if (count < 1) return
    const tierKey = tierKeyFromLabel(String(row.tier || ''))
    const unit = Math.max(0, Math.round(Number(row.unitBudgetYuan) || 0))
    const platform = String(row.platform || fallbackPlatform || '抖音').trim() || '抖音'
    const talentType = String(row.talentType || row.tier || kind).trim()
    for (let i = 0; i < count && seats.length < MAX_SEATS; i += 1) {
      seats.push({
        seatId: `${kind}-${seats.length + 1}`,
        tierKey,
        tierLabel: String(row.tier || '').trim() || kolTierLabel(tierKey),
        unitBudgetYuan: unit,
        talentType,
        platform,
      })
    }
  }
  for (const row of rows) {
    if (/投流/.test(`${row.contentForm || ''}${row.talentType || ''}`)) continue
    push(row, 'row')
  }
  if (seats.length > 0) return seats
  for (const line of lines) {
    const category = String(line.category || '')
    if (!isPeopleBudgetLine(category)) continue
    push({ ...line, talentType: category }, 'line')
  }
  return seats
}

function quoteInBand(quote: number | null, unit: number): boolean {
  if (unit <= 0 || quote == null) return true
  return quote >= unit * 0.7 && quote <= unit * 1.3
}

function categoryHit(entry: RegistryTalentLibraryEntry, talentType: string): boolean {
  const needles = talentType
    .split(/[/、,，|\s]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  if (!needles.length) return false
  const blob = [entry.platformNickname || '', ...(entry.accountTags || [])].join(' ')
  return needles.some((n) => blob.includes(n))
}

function publicAvatarUrl(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!/^https:\/\//i.test(s)) return ''
  return s
}

function toCard(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  reason: string,
): TalentPlanCard {
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  return {
    seatId: seat.seatId,
    talentId: String(entry.id || ''),
    nickname: String(entry.platformNickname || entry.platformAccount || '达人'),
    city: String(entry.city || '').trim(),
    platform: String(entry.platform || seat.platform),
    followers: Math.max(0, Math.round(Number(entry.followers) || 0)),
    level: String(entry.douyinSalesLevel || '').trim(),
    quoteYuan: quote,
    tags: (entry.accountTags || []).map((t) => String(t)).filter(Boolean).slice(0, 3),
    avatarUrl: publicAvatarUrl(entry.avatarUrl),
    profileLink: extractProfileLinkUrl(entry.profileLink),
    tierLabel: seat.tierLabel,
    unitBudgetYuan: seat.unitBudgetYuan,
    talentType: seat.talentType,
    source: 'library',
    reason,
  }
}

function emptyCard(seat: TalentPlanSeat): TalentPlanCard {
  return {
    seatId: seat.seatId,
    talentId: '',
    nickname: '',
    city: '',
    platform: seat.platform,
    followers: 0,
    level: '',
    quoteYuan: null,
    tags: [],
    avatarUrl: '',
    profileLink: '',
    tierLabel: seat.tierLabel,
    unitBudgetYuan: seat.unitBudgetYuan,
    talentType: seat.talentType,
    source: 'library',
    reason: '这一档库内没有下一位',
    empty: true,
  }
}

function scoreEntry(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  strict: boolean,
): number | null {
  const tier = inferKolTierFromApplicant({
    douyinSalesLevel: entry.douyinSalesLevel,
    followers: entry.followers,
  })
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  const tierOk = tier === seat.tierKey
  const quoteOk = quoteInBand(quote, seat.unitBudgetYuan)
  if (strict && !tierOk) return null
  if (strict && seat.unitBudgetYuan > 0 && quote != null && !quoteOk) return null
  let score = 0
  if (tierOk) score += 6
  else if (
    (seat.tierKey === 'v5' && tier === 'v5plus') ||
    (seat.tierKey === 'v5plus' && tier === 'v5') ||
    (seat.tierKey === 'v4' && (tier === 'v3' || tier === 'v5'))
  ) {
    score += 2
  }
  if (quoteOk && quote != null) score += 4
  if (categoryHit(entry, seat.talentType)) score += 3
  if (Number(entry.followers) > 0) score += 1
  return score
}

function pickEntry(
  pool: RegistryTalentLibraryEntry[],
  seat: TalentPlanSeat,
  used: Set<string>,
  excluded: Set<string>,
): { entry: RegistryTalentLibraryEntry; relaxed: boolean } | null {
  const candidates = pool.filter((e) => {
    const id = String(e.id || '')
    return id && !used.has(id) && !excluded.has(id) && !isIncompleteTalentLibraryEntry(e)
  })
  const rank = (strict: boolean) => {
    let best: { entry: RegistryTalentLibraryEntry; score: number } | null = null
    for (const entry of candidates) {
      const score = scoreEntry(entry, seat, strict)
      if (score == null) continue
      if (!best || score > best.score) best = { entry, score }
    }
    return best
  }
  const strict = rank(true)
  if (strict) return { entry: strict.entry, relaxed: false }
  const relaxed = rank(false)
  if (relaxed) return { entry: relaxed.entry, relaxed: true }
  return null
}

function reasonFor(
  entry: RegistryTalentLibraryEntry,
  seat: TalentPlanSeat,
  citySource: string,
  relaxed: boolean,
): string {
  const quote = parseQuotePriceYuan(String(entry.quotePrice || ''))
  const bits = [
    citySource === 'city' ? entry.city || '同城' : '全国本地生活参考',
    seat.tierLabel,
  ]
  if (quote != null) bits.push(`报价¥${quote}`)
  const tag = (entry.accountTags || [])[0]
  if (tag) bits.push(String(tag))
  if (relaxed) bits.push('条件已放宽')
  return bits.filter(Boolean).join(' · ')
}

export function seatsFromBudgetHeadcount(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  budgetYuan: number
  headcount: number
  talentType: string
}): TalentPlanSeat[] {
  const platform = asPlatform(params.platform)
  const headcount = Math.max(1, Math.min(MAX_SEATS, Math.floor(params.headcount) || 1))
  const alloc = buildNoviceAllocationFromTalentLibrary({
    entries: params.entries,
    city: params.city,
    budgetYuan: Math.max(0, params.budgetYuan),
    targetHeadcount: headcount,
    feeType: 'tier',
    platform,
  })
  const seats: TalentPlanSeat[] = []
  for (const key of ['v3', 'v4', 'v5', 'v5plus'] as const) {
    const count = alloc[key]
    const unit = Math.max(0, Math.round(alloc.unitPrices?.[key] || 0))
    for (let i = 0; i < count && seats.length < MAX_SEATS; i += 1) {
      seats.push({
        seatId: `${key}-${i + 1}`,
        tierKey: key,
        tierLabel: kolTierLabel(key),
        unitBudgetYuan: unit,
        talentType: params.talentType,
        platform,
      })
    }
  }
  return seats
}

export function fillTalentPlanSeats(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  seats: TalentPlanSeat[]
  excludedIds?: string[]
}): { cards: TalentPlanCard[]; seats: TalentPlanSeat[]; cityNote: string } {
  const city = params.city.trim()
  const platform = asPlatform(params.platform)
  const resolved = resolveTalentLibraryEntriesForCity({
    entries: params.entries,
    city,
    platform,
  })
  const excluded = new Set((params.excludedIds || []).map((id) => String(id || '').trim()).filter(Boolean))
  const byId = new Map(params.entries.map((e) => [String(e.id || ''), e]))
  const used = new Set<string>()
  const seats = params.seats.slice(0, MAX_SEATS)
  const cityNote =
    resolved.source === 'city'
      ? `按${city || '同城'}达人库推荐`
      : city
        ? `达人库暂无「${city}」同城达人，以下为全国本地生活参考`
        : '未解析到城市，以下为全国本地生活参考'
  const cards = seats.map((seat) => {
    const lockedId = String(seat.lockedTalentId || '').trim()
    const locked = lockedId ? byId.get(lockedId) : undefined
    if (locked && !excluded.has(lockedId) && !isIncompleteTalentLibraryEntry(locked)) {
      used.add(lockedId)
      return toCard(locked, seat, '已留下')
    }
    const pool = resolveTalentLibraryEntriesForCity({
      entries: params.entries,
      city,
      platform: asPlatform(seat.platform || platform),
    }).entries
    const picked = pickEntry(pool, seat, used, excluded)
    if (!picked) return emptyCard(seat)
    const id = String(picked.entry.id || '')
    used.add(id)
    return toCard(
      picked.entry,
      seat,
      reasonFor(picked.entry, seat, resolved.source, picked.relaxed),
    )
  })
  return { cards, seats, cityNote }
}

export function parseTalentPlanRecommendRequest(body: unknown):
  | {
      ok: true
      value: {
        city: string
        platform: string
        talentType: string
        budgetYuan: number
        headcount: number
        seats: TalentPlanSeat[]
        excludedIds: string[]
      }
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid_body' }
  const raw = body as Record<string, unknown>
  const city = String(raw.city ?? '').trim()
  const platform = String(raw.platform ?? '抖音').trim() || '抖音'
  const talentType = String(raw.talentType ?? raw.category ?? '').trim()
  const budgetYuan = Number(raw.budgetYuan)
  const headcount = Number(raw.headcount)
  const excludedIds = Array.isArray(raw.excludedIds)
    ? raw.excludedIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 200)
    : []
  const seatsIn = Array.isArray(raw.seats) ? raw.seats : []
  const seats: TalentPlanSeat[] = []
  for (const item of seatsIn) {
    if (!item || typeof item !== 'object' || seats.length >= MAX_SEATS) continue
    const row = item as Record<string, unknown>
    const tierKey = tierKeyFromLabel(String(row.tierKey || row.tierLabel || row.tier || ''))
    const seatId = String(row.seatId || `seat-${seats.length + 1}`).trim() || `seat-${seats.length + 1}`
    seats.push({
      seatId,
      tierKey:
        row.tierKey === 'v3' || row.tierKey === 'v4' || row.tierKey === 'v5' || row.tierKey === 'v5plus'
          ? row.tierKey
          : tierKey,
      tierLabel: String(row.tierLabel || kolTierLabel(tierKey)),
      unitBudgetYuan: Math.max(0, Math.round(Number(row.unitBudgetYuan) || 0)),
      talentType: String(row.talentType || talentType),
      platform: String(row.platform || platform),
      ...(String(row.lockedTalentId || '').trim()
        ? { lockedTalentId: String(row.lockedTalentId).trim() }
        : {}),
    })
  }
  if (!seats.length && !(Number.isFinite(budgetYuan) && budgetYuan > 0)) {
    return { ok: false, error: 'invalid_budget' }
  }
  return {
    ok: true,
    value: {
      city,
      platform,
      talentType,
      budgetYuan: Number.isFinite(budgetYuan) ? budgetYuan : 0,
      headcount: Number.isFinite(headcount) && headcount > 0 ? Math.min(MAX_SEATS, Math.floor(headcount)) : 0,
      seats,
      excludedIds,
    },
  }
}

export function recommendTalentPlan(params: {
  entries: RegistryTalentLibraryEntry[]
  city: string
  platform: string
  talentType: string
  budgetYuan: number
  headcount: number
  seats: TalentPlanSeat[]
  excludedIds?: string[]
}): { cards: TalentPlanCard[]; seats: TalentPlanSeat[]; cityNote: string } {
  const seats =
    params.seats.length > 0
      ? params.seats
      : seatsFromBudgetHeadcount({
          entries: params.entries,
          city: params.city,
          platform: params.platform,
          budgetYuan: params.budgetYuan,
          headcount: params.headcount > 0 ? params.headcount : Math.max(3, Math.min(12, Math.round(params.budgetYuan / 1200))),
          talentType: params.talentType,
        })
  return fillTalentPlanSeats({
    entries: params.entries,
    city: params.city,
    platform: params.platform,
    seats,
    excludedIds: params.excludedIds,
  })
}
