/** 微信订阅消息：在用户点击时请求授权（每次授权可下发一条） */
const TEMPLATES = {
  auditPass: 'HR_2V9NYdv7epS8peQqB6rijOXhPgTYAZmwaon3Gsrg',
  videoReject: 'RBI40YXz-Q4M8fAruxuT3oZ7o09le-_zstFx4VyJEuA',
  videoPass: '50rPxvWW1aBLLLK0cyqV9YJbhlENqbyR4EZc68LDmUI',
  /** 新订单提醒 — 商单订阅匹配 */
  orderMatch: 'oTL0yWf_l6lxYkeUaFJk_AyZ4dYlh_x48fmpMu6vF9E',
}

function requestIds(tmplIds) {
  const ids = (tmplIds || []).filter(Boolean).slice(0, 3)
  if (!ids.length || !wx.requestSubscribeMessage) return Promise.resolve({})
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => resolve(res || {}),
      fail: () => resolve({}),
    })
  })
}

/** 报名提交前：一次性预授权入选 + 视频审核通过/驳回（微信单次最多 3 个模板） */
function requestForAuditPass() {
  return requestIds([TEMPLATES.auditPass, TEMPLATES.videoPass, TEMPLATES.videoReject])
}

/** 上传视频/链接前：补授权（报名时若未勾选视频类模板） */
function requestForVideoReview() {
  return requestIds([TEMPLATES.videoPass, TEMPLATES.videoReject])
}

/** 保存商单订阅时：授权新招募匹配提醒（每次授权可下发一条） */
function requestForOrderSubscription() {
  return requestIds([TEMPLATES.orderMatch])
}

module.exports = {
  TEMPLATES,
  requestForAuditPass,
  requestForVideoReview,
  requestForOrderSubscription,
}
