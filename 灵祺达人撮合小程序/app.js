const config = require('./utils/config.js')
const mpRuntime = require('./utils/mpRuntime.js')

function isWelcomeRoute() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const route = pages.length ? String(pages[pages.length - 1].route || '') : ''
  return route === 'pages/welcome/welcome' || route === ''
}

function runDeferredStartup() {
  if (isWelcomeRoute()) return

  try {
    const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
    chatBadgeWatcher.start()
  } catch (e) {
    console.warn('[mp] chatBadgeWatcher', e)
  }
  try {
    const auth = require('./utils/auth.js')
    if (auth.isLoggedIn()) {
      require('./utils/mpAccountClientSync.js').pullAfterLogin().catch(() => {})
    }
  } catch (e) {
    console.warn('[mp] pullAfterLogin', e)
  }
}

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    mpRuntime.resetRuntimeCache()
    mpRuntime.applyRuntimeConfig(config)

    if (typeof wx.onNeedPrivacyAuthorization === 'function') {
      wx.onNeedPrivacyAuthorization((resolve) => {
        wx.showModal({
          title: '用户隐私保护提示',
          content: '使用自动定位等功能前，请阅读并同意《隐私政策》',
          confirmText: '同意',
          cancelText: '拒绝',
          success(res) {
            if (res.confirm) resolve({ event: 'agree', buttonId: 'agree-btn' })
            else resolve({ event: 'disagree' })
          },
          fail() {
            resolve({ event: 'disagree' })
          },
        })
      })
    }

    try {
      require('./utils/identityTheme.js').broadcast()
    } catch (_) {}

    const ecs = require('./utils/ecs.js')
    console.info(
      '[mp] transport',
      ecs.transportLabel(),
      'useCloud=',
      ecs.useCloudProxy(),
      'MP_USE_CLOUD_PROXY=',
      config.MP_USE_CLOUD_PROXY,
      config.MERCHANT_API_BASE_URL || '',
    )

    try {
      const mpShare = require('./utils/mpShare.js')
      mpShare.enableShareMenu()
    } catch (e) {
      console.warn('[mp] share menu', e)
    }

    if (ecs.useCloudProxy() && wx.cloud) {
      try {
        const env = String(config.MP_CLOUD_ENV || '').trim()
        if (env) wx.cloud.init({ env, traceUser: true })
      } catch (e) {
        console.warn('[mp] cloud.init', e)
      }
    }

    setTimeout(() => {
      try {
        const mpShare = require('./utils/mpShare.js')
        mpShare.preloadShareCover()
      } catch (_) {}
    }, 200)

    setTimeout(runDeferredStartup, 500)
  },
  onShow() {
    if (isWelcomeRoute()) return

    setTimeout(() => {
      try {
        const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
        void chatBadgeWatcher.refreshNow()
      } catch (_) {}
      try {
        const auth = require('./utils/auth.js')
        if (!auth.isLoggedIn()) return
        auth
          .refreshSession()
          .then(() => {
            try {
              return require('./utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
            } catch (_) {
              return null
            }
          })
          .catch((e) => {
            console.warn('[mp] refreshSession', e && e.message ? e.message : e)
          })
      } catch (_) {}
    }, 300)

    setTimeout(runDeferredStartup, 600)
  },
  onError(err) {
    const msg = String(err || '')
    if (/80424|getFuzzyLocation.*not authorized/i.test(msg)) return
    console.error('[mp] onError', err)
  },
  onUnhandledRejection(res) {
    const reason = res && res.reason
    const msg = String((reason && reason.errMsg) || (reason && reason.message) || reason || '')
    if (/80424|getFuzzyLocation.*not authorized/i.test(msg)) return
    console.warn('[mp] unhandledRejection', reason && reason.message ? reason.message : reason)
  },
})
