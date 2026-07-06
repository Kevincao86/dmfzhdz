import { createHash } from 'node:crypto'

/** 服务号回调签名校验（明文模式） */
export function verifyWechatOaSignature(
  token: string,
  timestamp: string,
  nonce: string,
  signature: string,
): boolean {
  const parts = [String(token || '').trim(), String(timestamp || '').trim(), String(nonce || '').trim()]
    .filter(Boolean)
    .sort()
  const hash = createHash('sha1').update(parts.join('')).digest('hex')
  return hash === String(signature || '').trim()
}

function cdataValue(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}>([^<]*)</${tag}>`, 'i')
  const m = xml.match(re)
  if (!m) return ''
  return String(m[1] ?? m[2] ?? '').trim()
}

export type WechatOaInboundEvent = {
  toUserName: string
  fromUserName: string
  createTime: number
  msgType: string
  event?: string
  eventKey?: string
  content?: string
}

export function parseWechatOaXml(xml: string): WechatOaInboundEvent | null {
  const raw = String(xml || '').trim()
  if (!raw || !raw.includes('<xml')) return null
  return {
    toUserName: cdataValue(raw, 'ToUserName'),
    fromUserName: cdataValue(raw, 'FromUserName'),
    createTime: Number(cdataValue(raw, 'CreateTime') || 0),
    msgType: cdataValue(raw, 'MsgType'),
    event: cdataValue(raw, 'Event') || undefined,
    eventKey: cdataValue(raw, 'EventKey') || undefined,
    content: cdataValue(raw, 'Content') || undefined,
  }
}

export function buildWechatOaTextReply(toUser: string, fromUser: string, text: string): string {
  const now = Math.floor(Date.now() / 1000)
  const body = String(text || '').trim().slice(0, 600)
  return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${now}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${body}]]></Content>
</xml>`
}

/** 从 subscribe / SCAN 事件的 EventKey 提取绑定 ticket */
export function bindTicketFromEventKey(eventKey: string): string {
  const raw = String(eventKey || '').trim()
  if (!raw) return ''
  const stripped = raw.replace(/^qrscene_/i, '')
  if (/^bt_[a-z0-9]{8,48}$/i.test(stripped)) return stripped
  return ''
}
