/**
 * 视频审核 / 文稿审核：按上海时区每月两段（1–14 日、15 日–月底）各拉取一次官方规则摘录。
 * 摘录写入 data/compliance-rules-cache.json。抓取为空时保留内置规则，同一半月最多再试 3 次。
 */
import fs from 'node:fs'
import path from 'node:path'

const EXCERPT_CAP = 4000
const MAX_ATTEMPTS = 3
const FETCH_TIMEOUT_MS = 12_000
const MIN_USEFUL_CHARS = 80

const VIDEO_URLS: Record<string, string[]> = {
  快手: [
    'https://www.kuaishou.com/norm',
    'https://open.kuaishou.com/docs/operate/reviewSpecification/base-operation/operateSpecification',
  ],
  微信视频号: [
    'https://developers.weixin.qq.com/doc/channels/Operating_Specifications/Store_Operation_Rules/Video_Marketing_Information.html',
  ],
  抖音: ['https://www.lifexue.com/knowledge/detail/122977'],
}

const SCRIPT_URLS: Record<string, string[]> = {
  大众点评: ['https://rules-center.meituan.com/m/detail/guize/191'],
  小红书: ['https://pgy.xiaohongshu.com/help/list?id=171&userType=4'],
}

type WindowSlot = {
  fetchedAt: string
  excerpts: Record<string, string>
  attempts: Record<string, number>
}

type CacheFile = {
  windows: Record<string, WindowSlot>
}

const inflight = new Map<string, Promise<string>>()

export function complianceHalfMonthKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value || '0000'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = Number(parts.find((p) => p.type === 'day')?.value || '1')
  return `${year}-${month}-${day <= 14 ? 'H1' : 'H2'}`
}

function cachePath(): string {
  return path.join(process.cwd(), 'data', 'compliance-rules-cache.json')
}

function readCache(): CacheFile {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8')
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed && parsed.windows && typeof parsed.windows === 'object') return parsed
  } catch {
    /* 首次或文件损坏时从空缓存开始 */
  }
  return { windows: {} }
}

function writeCache(cache: CacheFile): void {
  const file = cachePath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const keys = Object.keys(cache.windows).sort()
  for (const key of keys.slice(0, Math.max(0, keys.length - 4))) {
    delete cache.windows[key]
  }
  fs.writeFileSync(file, JSON.stringify(cache), 'utf8')
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPlain(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      'User-Agent': 'LingqiComplianceRulesRefresh/1.0',
    },
  })
  if (!res.ok) return ''
  const text = htmlToText(await res.text())
  return text.length >= MIN_USEFUL_CHARS ? text.slice(0, EXCERPT_CAP) : ''
}

function urlsFor(kind: 'video' | 'script', platform: string): string[] {
  if (kind === 'script') return SCRIPT_URLS[platform] || SCRIPT_URLS['小红书'] || []
  if (platform === '快手' || platform === '微信视频号') return VIDEO_URLS[platform] || []
  return VIDEO_URLS['抖音'] || []
}

async function loadExcerpt(kind: 'video' | 'script', platform: string): Promise<string> {
  const windowKey = complianceHalfMonthKey()
  const excerptKey = `${kind}:${platform}`
  const cache = readCache()
  const slot = cache.windows[windowKey] || { fetchedAt: '', excerpts: {}, attempts: {} }
  if (!slot.attempts) slot.attempts = {}
  if (!slot.excerpts) slot.excerpts = {}
  const cached = slot.excerpts[excerptKey]
  if (cached && cached.trim()) return cached
  const tried = Number(slot.attempts[excerptKey] || 0)
  if (tried >= MAX_ATTEMPTS) return ''

  slot.attempts[excerptKey] = tried + 1
  slot.fetchedAt = new Date().toISOString()
  const parts: string[] = []
  for (const url of urlsFor(kind, platform)) {
    try {
      const text = await fetchPlain(url)
      if (text) parts.push(text)
    } catch {
      /* 单页失败不阻断其它来源 */
    }
  }
  const excerpt = parts.join('\n').slice(0, EXCERPT_CAP).trim()
  if (excerpt) slot.excerpts[excerptKey] = excerpt
  cache.windows[windowKey] = slot
  try {
    writeCache(cache)
  } catch {
    /* 缓存写失败仍可把本次摘录交给当次审核 */
  }
  return excerpt
}

export async function appendOfficialComplianceRules(
  system: string,
  kind: 'video' | 'script',
  platform: string,
): Promise<string> {
  const flightKey = `${complianceHalfMonthKey()}:${kind}:${platform}`
  let pending = inflight.get(flightKey)
  if (!pending) {
    pending = loadExcerpt(kind, platform).finally(() => {
      inflight.delete(flightKey)
    })
    inflight.set(flightKey, pending)
  }
  let excerpt = ''
  try {
    excerpt = await pending
  } catch {
    excerpt = ''
  }
  if (!excerpt.trim()) return system
  return [
    system,
    '',
    '【本半月官方规则摘录】以下为自动读取的最新公开规则，用于补充内置规则。摘录为空或与内置禁止项冲突时，仍以内置规则为准。',
    excerpt.trim(),
  ].join('\n')
}
