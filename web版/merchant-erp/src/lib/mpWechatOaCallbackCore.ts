import type { RegistrySnapshot } from './opsRegistryTypes.js'
import {
  bindTicketFromEventKey,
  buildWechatOaTextReply,
  parseWechatOaXml,
  type WechatOaInboundEvent,
} from './mpWechatOfficialAccountCrypto.js'
import { completeWechatOaBindInSnapshot } from './mpWechatOaBindingCore.js'
import { loadWechatOaConfig } from './mpWechatOfficialAccountConfig.js'

export type WechatOaCallbackResult = {
  replyXml?: string
  bind?: { ok: boolean; talentMemberId?: string; error?: string }
}

function shouldHandleBindEvent(evt: WechatOaInboundEvent): boolean {
  const event = String(evt.event || '').trim().toLowerCase()
  return event === 'subscribe' || event === 'scan'
}

export function handleWechatOaEventInSnapshot(
  data: RegistrySnapshot,
  xml: string,
): WechatOaCallbackResult {
  const evt = parseWechatOaXml(xml)
  if (!evt || evt.msgType !== 'event' || !shouldHandleBindEvent(evt)) {
    return {}
  }

  const ticket = bindTicketFromEventKey(evt.eventKey || '')
  if (!ticket) return {}

  const oaOpenId = String(evt.fromUserName || '').trim()
  const bindResult = completeWechatOaBindInSnapshot(data, ticket, oaOpenId)
  const cfg = loadWechatOaConfig()
  const name = cfg.ok ? cfg.config.displayName : '灵祺星选'

  if (!bindResult.ok) {
    return {
      bind: { ok: false, error: bindResult.error },
      replyXml: buildWechatOaTextReply(
        evt.fromUserName,
        evt.toUserName,
        '绑定失败或二维码已过期，请在小程序重新获取二维码后再试。',
      ),
    }
  }

  return {
    bind: { ok: true, talentMemberId: bindResult.talentMemberId },
    replyXml: buildWechatOaTextReply(
      evt.fromUserName,
      evt.toUserName,
      `已关注${name}！定向合作邀约将推送到此服务号，您也可在小程序「我的邀约」中查看。`,
    ),
  }
}
