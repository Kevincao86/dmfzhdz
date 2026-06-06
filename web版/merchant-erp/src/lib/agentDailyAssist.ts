/**
 * 智能体日常问答：天气、日期星期等（走 BFF，优先 ECS /erp-api，无需大模型联网）。
 */

import { merchantErpApiCandidates } from './merchantErpApiBase'

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

/** 纯问候：本地秒回，不走大模型 */
export function instantCasualGreetingReply(text: string): string | null {
  const t = text.trim().replace(/[!！。~～\s]+$/u, '')
  if (!t || t.length > 24) return null
  if (/^(你好|您好|hi|hello|嗨|在吗|在么|早上好|下午好|晚上好)$/i.test(t)) {
    return '你好！我是灵祺 AI 助手，有什么可以帮你的？'
  }
  return null
}

export function isDailyAssistQuery(text: string): boolean {
  const t = text.trim()
  if (!t || t.length > 120) return false
  if (instantCasualGreetingReply(t)) return true
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
  const greeting = instantCasualGreetingReply(text)
  if (greeting) return greeting
  if (!isDailyAssistQuery(text)) return null

  const dateOnly = formatLocalDateReply(text)
  if (dateOnly && !/天气|气温|温度|下雨|降雨|下雪|预报|几度/.test(text)) {
    return dateOnly
  }

  const city = extractCity(text)
  const offset = dayOffset(text)

  try {
    let lastMsg = ''
    for (const target of merchantErpApiCandidates('/api/meoo-agent-daily-info')) {
      const res = await fetch(target, {
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
      if (j.message) lastMsg = j.message
    }
    if (lastMsg) {
      // 天气 BFF 失败时不阻断对话，交还给大模型作答
      return null
    }
  } catch {
    /* fall through to LLM */
  }

  if (/天气|气温|下雨|降雨|下雪|预报|几度|冷不冷|热不热|穿什么|带伞/.test(text)) {
    return null
  }
  return formatLocalDateReply(text)
}
