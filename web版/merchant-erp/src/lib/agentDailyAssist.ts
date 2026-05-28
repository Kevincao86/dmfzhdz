/**
 * 智能体日常问答：天气、日期星期等（走同源 BFF，不占用大模型「无法联网」话术）。
 */

const CITY_ALIASES: Record<string, string> = {
  北京: 'Beijing',
  上海: 'Shanghai',
  广州: 'Guangzhou',
  深圳: 'Shenzhen',
  杭州: 'Hangzhou',
  温州: 'Wenzhou',
  宁波: 'Ningbo',
  成都: 'Chengdu',
  重庆: 'Chongqing',
  武汉: 'Wuhan',
  西安: "Xi'an",
  南京: 'Nanjing',
  苏州: 'Suzhou',
  天津: 'Tianjin',
  青岛: 'Qingdao',
  厦门: 'Xiamen',
  福州: 'Fuzhou',
  合肥: 'Hefei',
  长沙: 'Changsha',
  郑州: 'Zhengzhou',
  东莞: 'Dongguan',
  佛山: 'Foshan',
  无锡: 'Wuxi',
  济南: 'Jinan',
  沈阳: 'Shenyang',
  大连: 'Dalian',
  哈尔滨: 'Harbin',
  昆明: 'Kunming',
  贵阳: 'Guiyang',
  南宁: 'Nanning',
  海口: 'Haikou',
  乌鲁木齐: 'Urumqi',
  拉萨: 'Lhasa',
  香港: 'Hong Kong',
  澳门: 'Macau',
  台北: 'Taipei',
}

function extractCity(text: string): string {
  const t = text.trim()
  for (const [cn, en] of Object.entries(CITY_ALIASES)) {
    if (t.includes(cn)) return en
  }
  const m = t.match(/(?:在|到|去)([\u4e00-\u9fa5]{2,8})(?:市|县|区)?/)
  if (m?.[1] && CITY_ALIASES[m[1]]) return CITY_ALIASES[m[1]]
  return 'Beijing'
}

function dayOffset(text: string): 0 | 1 | 2 {
  if (/后天/.test(text)) return 2
  if (/明天|翌日/.test(text)) return 1
  return 0
}

export function isDailyAssistQuery(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 120) return false
  if (
    /天气|气温|温度|下雨|降雨|下雪|预报|几度|冷不冷|热不热|穿什么|带伞/.test(t)
  ) {
    return true
  }
  if (/星期几|周几|几号|几月几日|今天几|明天几|农历|节假日/.test(t)) return true
  if (/^(今天|明天|后天)(是)?什么日子/.test(t)) return true
  return false
}

function formatLocalDateReply(text: string): string | null {
  const now = new Date()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const base = `今天是 ${now.getFullYear()} 年 ${now.getMonth() + 1} 月 ${now.getDate()} 日，星期${weekdays[now.getDay()]}。`
  if (/星期几|周几/.test(text) && !/天气|气温|下雨/.test(text)) {
    return base
  }
  if (/几号|几月几日/.test(text) && !/天气|气温|下雨/.test(text)) {
    return base
  }
  if (/^(今天|明天|后天)(是)?什么日子/.test(text)) {
    const off = dayOffset(text)
    const d = new Date(now.getTime() + off * 86400000)
    const label = off === 0 ? '今天' : off === 1 ? '明天' : '后天'
    return `${label}是 ${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日，星期${weekdays[d.getDay()]}。`
  }
  return null
}

export async function fetchDailyAssistReply(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!isDailyAssistQuery(text)) return null

  const dateOnly = formatLocalDateReply(text)
  if (dateOnly && !/天气|气温|温度|下雨|降雨|下雪|预报|几度/.test(text)) {
    return dateOnly
  }

  const city = extractCity(text)
  const offset = dayOffset(text)
  const dayLabel = offset === 0 ? '今天' : offset === 1 ? '明天' : '后天'

  try {
    const res = await fetch('/api/meoo-agent-daily-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, dayOffset: offset, query: text.slice(0, 200) }),
      signal,
    })
    const j = (await res.json()) as { ok?: boolean; reply?: string; message?: string }
    if (res.ok && j.ok && j.reply) {
      const prefix = dateOnly && /星期|几号/.test(text) ? `${dateOnly}\n` : ''
      return `${prefix}${j.reply}`.trim()
    }
    if (!res.ok && j.message) {
      return `${dayLabel}${city === 'Beijing' ? '北京' : '当地'}天气暂时查询失败（${j.message}）。${dateOnly || formatLocalDateReply(text) || ''}`.trim()
    }
  } catch {
    /* fallback below */
  }

  const fallbackDate = formatLocalDateReply(text)
  if (/天气|气温|下雨/.test(text)) {
    return (
      `${dayLabel}天气服务暂不可用，请稍后在系统天气 App 查看。` +
      (fallbackDate ? `\n${fallbackDate}` : '')
    ).trim()
  }
  return fallbackDate
}
