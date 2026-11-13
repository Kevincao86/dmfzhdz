/**
 * 抖音小程序运行时：tt 挂载为 wx，与微信版业务代码共用同一套 wx.* 调用。
 */
;(function initMpWxAdapter() {
  const api = typeof tt !== 'undefined' ? tt : typeof wx !== 'undefined' ? wx : null
  if (!api) return

  const g = typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : null
  if (g && typeof g.wx === 'undefined') g.wx = api

  if (!api.cloud) {
    api.cloud = {
      init() {},
      callFunction() {
        return Promise.reject(new Error('douyin_mp_no_cloud'))
      },
    }
  }

  if (typeof api.onNeedPrivacyAuthorization !== 'function') {
    api.onNeedPrivacyAuthorization = function () {}
  }

  if (typeof api.getPrivacySetting !== 'function') {
    api.getPrivacySetting = function (opts) {
      const cb = opts && opts.success
      if (cb) cb({ needAuthorization: false, privacyContractName: '' })
    }
  }
})()
