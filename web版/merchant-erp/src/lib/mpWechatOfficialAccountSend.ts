import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes.js'
import { getWechatOfficialAccountAccessToken } from './mpWechatOfficialAccountAccess.js'
import { loadWechatOaConfig } from './mpWechatOfficialAccountConfig.js'
import { mpWechatAppId } from './mpWechatMiniProgramAccess.js'
import { orderTitle } from './mpSubscribeMessageSend.js'

function clipThing(text: unknown, max = 20): string {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function merchantNameForOrder(mp: RegistryMpRecruitmentOrder): string {
  const store = String(mp.storeName || '').trim()
  const customer = String(mp.customerName || '').trim()
  return store || customer || '招募商家'
}

function prContactForOrder(mp: RegistryMpRecruitmentOrder): string {
  const meta = mp.mpPublishMeta
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null
  const fromMeta = String(m?.prDisplayName || m?.publisherDisplayName || '').trim()
  if (fromMeta) return fromMeta
  return String(mp.customerName || '').trim() || 'PR'
}

function formatTemplateTime2(deadline?: string): string {
  const raw = String(deadline || '').trim()
  const d = raw ? new Date(raw.replace(/-/g, '/')) : new Date()
  if (!Number.isFinite(d.getTime())) return raw.slice(0, 20) || '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function inviteDeadlineForOrder(mp: RegistryMpRecruitmentOrder): string {
  const meta = mp.mpPublishMeta
  const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null
  const deadline = String(m?.inviteDeadline || '').trim()
  if (deadline) return deadline
  const hours = Math.max(1, Math.min(720, Math.floor(Number(m?.inviteResponseHours) || 72)))
  const d = new Date(Date.now() + hours * 3600000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`
}

export async function sendWechatOaTargetedInviteTemplate(
  oaOpenId: string,
  mp: RegistryMpRecruitmentOrder,
): Promise<void> {
  const oid = String(oaOpenId || '').trim()
  if (!oid) return
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) throw new Error('wx_oa_not_configured')

  const mpOrderId = String(mp.id || '').trim()
  const pagePath = 'pages/subpack-mine/mine-targeted-invites/mine-targeted-invites'
  const token = await getWechatOfficialAccountAccessToken()
  const mpAppId = mpWechatAppId()

  const payload: Record<string, unknown> = {
    touser: oid,
    template_id: cfgResult.config.targetedInviteTemplateId,
    data: {
      /** 52247 会议室预约待审批通知 — PR定向合作邀约 */
      thing3: { value: clipThing(orderTitle(mp)) },
      time2: { value: formatTemplateTime2(inviteDeadlineForOrder(mp)) },
      thing1: { value: clipThing(String(mp.region || '').trim() || '全国') },
      thing9: { value: clipThing(merchantNameForOrder(mp)) },
      thing4: { value: clipThing(prContactForOrder(mp)) },
    },
  }

  if (mpAppId) {
    payload.miniprogram = {
      appid: mpAppId,
      pagepath: mpOrderId
        ? `${pagePath}?from=oa&mpOrderId=${encodeURIComponent(mpOrderId)}`
        : pagePath,
    }
  }

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = (await res.json()) as { errcode?: number; errmsg?: string }
  if (body.errcode && body.errcode !== 0) {
    throw new Error(`oa_template_${body.errcode}:${body.errmsg || 'failed'}`)
  }
}

/** 服务号类目模板 time 字段：2019年10月1日 或 2019年10月1日 15:01 */
function formatOaCalendarTime15(eventDateKey: string): string {
  const dk = String(eventDateKey || '').trim()
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(dk)
  if (!m) return '—'
  const date = `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`
  if (!m[4]) return date
  return `${date} ${String(m[4]).padStart(2, '0')}:${m[5]}`
}

function oaCalendarProjectLabel(eventTitle: string, eventKind?: string): string {
  const title = String(eventTitle || '').trim()
  if (title) return title
  if (eventKind === 'visit') return '探店提醒'
  if (eventKind === 'deadline') return '交片提醒'
  if (eventKind === 'plan_slot') return '可探店提醒'
  return '日程提醒'
}

/** 商单日历到点提醒 — 服务号模板 45122（time15 报名时间 / thing3 名称 / thing14 项目） */
export async function sendWechatOaCalendarReminderTemplate(opts: {
  oaOpenId: string
  eventTitle: string
  storeName: string
  eventDateKey: string
  eventKind?: string
  mpOrderId?: string
}): Promise<void> {
  const oid = String(opts.oaOpenId || '').trim()
  if (!oid) return
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) throw new Error('wx_oa_not_configured')

  const templateId = String(cfgResult.config.calendarReminderTemplateId || '').trim()
  if (!templateId) throw new Error('wx_oa_calendar_template_missing')

  const mpOrderId = String(opts.mpOrderId || '').trim()
  const pagePath = 'pages/subpack-mine/mine-order-calendar/mine-order-calendar'
  const token = await getWechatOfficialAccountAccessToken()
  const mpAppId = mpWechatAppId()

  const timeValue = formatOaCalendarTime15(opts.eventDateKey)
  if (timeValue === '—') throw new Error('wx_oa_calendar_time_invalid')

  const payload: Record<string, unknown> = {
    touser: oid,
    template_id: templateId,
    data: {
      time15: { value: timeValue },
      thing3: { value: clipThing(oaCalendarProjectLabel(opts.eventTitle, opts.eventKind)) },
      thing14: { value: clipThing(opts.storeName || '商单日程') },
    },
  }

  if (mpAppId) {
    payload.miniprogram = {
      appid: mpAppId,
      pagepath: mpOrderId
        ? `pages/detail/detail?id=${encodeURIComponent(mpOrderId)}`
        : pagePath,
    }
  }

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = (await res.json()) as { errcode?: number; errmsg?: string }
  if (body.errcode && body.errcode !== 0) {
    throw new Error(`oa_template_${body.errcode}:${body.errmsg || 'failed'}`)
  }
}

/** 收到客户预约新订单通知 — 复用为私信未读提醒（thing2=提醒文案 thing6=发送方） */
export async function sendWechatOaDmUnreadTemplate(opts: {
  oaOpenId: string
  senderName: string
  sessionId: string
  hintText?: string
}): Promise<void> {
  const oid = String(opts.oaOpenId || '').trim()
  if (!oid) return
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) throw new Error('wx_oa_not_configured')

  const templateId = String(cfgResult.config.dmUnreadTemplateId || '').trim()
  if (!templateId) return

  const sessionId = String(opts.sessionId || '').trim()
  const pagePath = 'pages/subpack-pr/chat/chat'
  const token = await getWechatOfficialAccountAccessToken()
  const mpAppId = mpWechatAppId()

  const payload: Record<string, unknown> = {
    touser: oid,
    template_id: templateId,
    data: {
      thing2: {
        value: clipThing(opts.hintText || '您有未读私信请查看'),
      },
      thing6: {
        value: clipThing(opts.senderName || '招募方'),
      },
    },
  }

  if (mpAppId) {
    payload.miniprogram = {
      appid: mpAppId,
      pagepath: sessionId
        ? `${pagePath}?sessionId=${encodeURIComponent(sessionId)}&from=oa`
        : pagePath,
    }
  }

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  const body = (await res.json()) as { errcode?: number; errmsg?: string }
  if (body.errcode && body.errcode !== 0) {
    throw new Error(`oa_template_${body.errcode}:${body.errmsg || 'failed'}`)
  }
}
