/** 微信订阅消息：在用户点击时请求授权（每次授权可下发一条） */
const TEMPLATES = {
  applyResult: 'p-ZBJVOIX_vnpydcB82JdKRq6SYeBHgcjdmP4r9Y4YY',
  auditPass: 'HR_2V9NYdv7epS8peQqB6rijOXhPgTYAZmwaon3Gsrg',
  videoReject: 'RBI40YXz-Q4M8fAruxuT3oZ7o09le-_zstFx4VyJEuA',
  videoPass: '50rPxvWW1aBLLLK0cyqV9YJbhlENqbyR4EZc68LDmUI',
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

/** 报名提交前：报名结果 + 审核入选（微信单次最多 3 个模板） */
function requestForApply() {
  return requestIds([TEMPLATES.applyResult, TEMPLATES.auditPass])
}

/** 上传视频/链接前：视频审核通过 + 驳回 */
function requestForVideoReview() {
  return requestIds([TEMPLATES.videoPass, TEMPLATES.videoReject])
}

module.exports = {
  TEMPLATES,
  requestForApply,
  requestForVideoReview,
}
