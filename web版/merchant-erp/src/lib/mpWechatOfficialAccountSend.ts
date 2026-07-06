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
      first: { value: clipThing('您收到一条定向合作邀约', 20) },
      keyword1: { value: clipThing(orderTitle(mp)) },
      keyword2: { value: clipThing(merchantNameForOrder(mp)) },
      keyword3: { value: clipThing(String(mp.region || '').trim() || '全国') },
      remark: { value: clipThing('点击进入小程序查看并回复') },
      thing1: { value: clipThing('定向合作邀约') },
      thing2: { value: clipThing(orderTitle(mp)) },
      thing3: { value: clipThing(merchantNameForOrder(mp)) },
      thing4: { value: clipThing(String(mp.region || '').trim() || '全国') },
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
