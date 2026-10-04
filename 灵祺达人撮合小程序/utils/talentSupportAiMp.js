/**
 * 达人小程序在线客服：AI 先答，9:00–22:00 可转人工并排队。
 * 与商家 ERP 小程序 supportAiMp 同一套流程，走达人会话通道和达人 AI 接口。
 */
const relay = require('./supportRelayMp.js')
const addon = require('./mpAddonMerchantApi.js')

const CFG_SESSION = '__lq_support_ai_cfg__'
const QUEUE_SESSION = '__lq_support_queue__'
const CFG_PREFIX = 'LQCFG:'

const PROJECT_BRIEF = `你是灵祺星选在线客服。灵祺星选是达人、拍摄、剪辑和 PR 使用的招募小程序，主要能力包括：推荐大厅、报名与履约、PR 发招募、转发工具、钱包与收款账户、培训课程、消息和在线客服。
用简体中文直接回答，先给结论。不知道的功能说明去小程序哪个菜单查看，不要编造订单、退款或已处理结果。
人工客服时段为 9:00–22:00，时段内可点「进入人工客服」；人多时会排队。`

function defaultConfig() {
  return { aiEnabled: true, humanStartHour: 9, humanEndHour: 22, knowledge: '' }
}

function humanWindowOpen(cfg, date) {
  const d = date || new Date()
  const h = d.getHours()
  const start = Number(cfg && cfg.humanStartHour)
  const end = Number(cfg && cfg.humanEndHour)
  const from = Number.isFinite(start) ? start : 9
  const to = Number.isFinite(end) ? end : 22
  return h >= from && h < to
}

function parseConfigText(text) {
  const raw = String(text || '')
  const body = raw.startsWith(CFG_PREFIX) ? raw.slice(CFG_PREFIX.length) : raw
  try {
    const o = JSON.parse(body)
    if (!o || typeof o !== 'object') return null
    return {
      aiEnabled: o.aiEnabled !== false,
      humanStartHour: Number(o.humanStartHour) || 9,
      humanEndHour: Number(o.humanEndHour) || 22,
      knowledge: String(o.knowledge || '').slice(0, 4000),
    }
  } catch (_) {
    return null
  }
}

async function loadConfig() {
  const base = defaultConfig()
  try {
    let joinId = ''
    try {
      joinId = String(wx.getStorageSync('meoo_talent_support_cfg_join') || '')
      if (!joinId) {
        joinId = `cfg-join-${Date.now()}`
        wx.setStorageSync('meoo_talent_support_cfg_join', joinId)
      }
    } catch (_) {
      joinId = `cfg-join-${Date.now()}`
    }
    await relay.sendChatLine('system', 'join', joinId, CFG_SESSION).catch(() => {})
    const rows = await relay.fetchSessionMessages(CFG_SESSION)
    let latest = null
    for (const row of rows) {
      const text = row.text || row.content || ''
      const parsed = parseConfigText(text)
      if (parsed) latest = parsed
    }
    return latest || base
  } catch (_) {
    return base
  }
}

async function askAi(userText, history, cfg) {
  const knowledge = cfg && cfg.knowledge ? `\n\n【运营补充说明】\n${cfg.knowledge}` : ''
  const messages = [{ role: 'system', content: PROJECT_BRIEF + knowledge }]
  for (const m of (history || []).slice(-6)) {
    const text = String((m && (m.text || m.content)) || '').trim()
    if (!text || text === String(userText || '').trim()) continue
    if (/进入人工客服|人工服务/.test(text)) continue
    if (m.role === 'user') messages.push({ role: 'user', content: text })
    else if (m.role === 'bot' || m.role === 'assistant') messages.push({ role: 'assistant', content: text })
  }
  messages.push({ role: 'user', content: String(userText || '').trim() })
  const res = await addon.postAiChat(messages, { provider: 'qwen' })
  if (!res || res.ok === false || !res.content) {
    throw new Error(String((res && res.message) || 'AI 暂不可用'))
  }
  return String(res.content).trim()
}

async function enqueue(userSessionId) {
  const sid = String(userSessionId || '').trim()
  const openId = `q-open-${sid}`
  try {
    await relay.sendChatLine('system', `LQQUEUE OPEN ${sid}`, openId, QUEUE_SESSION)
  } catch (e) {
    const msg = String((e && e.message) || '')
    if (!/duplicate|23505|已存在|unique/i.test(msg)) throw e
  }
  const rows = await relay.fetchSessionMessages(QUEUE_SESSION)
  const done = new Set()
  const opens = []
  for (const row of rows) {
    const text = String(row.text || '')
    if (text.startsWith('LQQUEUE DONE ')) done.add(text.slice('LQQUEUE DONE '.length).trim())
    if (text.startsWith('LQQUEUE OPEN ')) {
      opens.push({ sid: text.slice('LQQUEUE OPEN '.length).trim(), ts: Number(row.ts) || 0 })
    }
  }
  const waiting = opens.filter((o) => o.sid && !done.has(o.sid))
  waiting.sort((a, b) => a.ts - b.ts)
  const idx = waiting.findIndex((o) => o.sid === sid)
  const ahead = idx <= 0 ? 0 : idx
  return { ahead, waiting: waiting.length }
}

module.exports = {
  defaultConfig,
  humanWindowOpen,
  loadConfig,
  askAi,
  enqueue,
}
