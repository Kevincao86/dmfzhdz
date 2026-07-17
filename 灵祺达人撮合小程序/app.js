const config = require('./utils/config.js')
const mpRuntime = require('./utils/mpRuntime.js')
const mpPrivacyAuthorize = require('./utils/mpPrivacyAuthorize.js')

function isWelcomeRoute() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  const route = pages.length ? String(pages[pages.length - 1].route || '') : ''
  return route === 'pages/welcome/welcome' || route === ''
}

function redirectIfPhoneBindRequired() {
  try {
    const auth = require('./utils/auth.js')
    if (!auth.isLoggedIn() || !auth.needsPhoneBind()) return
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const route = pages.length ? String(pages[pages.length - 1].route || '') : ''
    if (route === 'pages/login/login') return
    wx.reLaunch({ url: '/pages/login/login' })
  } catch (_) {}
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

    mpPrivacyAuthorize.registerAppPrivacyHandler(this)

    try {
      require('./utils/identityTheme.js').broadcast()
    } catch (_) {}

    try {
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
      if (ecs.useCloudProxy() && wx.cloud) {
        const env = String(config.MP_CLOUD_ENV || '').trim()
        if (env) wx.cloud.init({ env, traceUser: true })
      }
    } catch (e) {
      console.warn('[mp] ecs init', e)
    }

    try {
      require('./utils/mpShare.js').enableShareMenu()
    } catch (e) {
      console.warn('[mp] share menu', e)
    }

    setTimeout(() => {
      try {
        require('./utils/mpShare.js').preloadShareCover()
      } catch (_) {}
    }, 800)

    setTimeout(runDeferredStartup, 1200)
  },
  onShow() {
    if (isWelcomeRoute()) return

    const now = Date.now()
    const lastHeavy = Number(this.globalData && this.globalData._lastAppShowHeavyAt) || 0
    // 切 Tab 也会触发 App.onShow；30s 内跳过重网络，避免底栏卡顿
    if (now - lastHeavy < 30000) {
      try {
        require('./utils/chatBadgeWatcher.js').syncBarFromGlobal()
      } catch (_) {}
      return
    }
    if (this.globalData) this.globalData._lastAppShowHeavyAt = now

    setTimeout(() => {
      try {
        const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
        void chatBadgeWatcher.refreshNow({ minIntervalMs: 20000 })
      } catch (_) {}
      try {
        const auth = require('./utils/auth.js')
        if (!auth.isLoggedIn()) return
        auth
          .refreshSession()
          .then(() => {
            redirectIfPhoneBindRequired()
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
    if (/80424|get(?:Fuzzy)?Location.*not authorized/i.test(msg)) return
    console.error('[mp] onError', err)
  },
  onUnhandledRejection(res) {
    const reason = res && res.reason
    const msg = String((reason && reason.errMsg) || (reason && reason.message) || reason || '')
    if (/80424|get(?:Fuzzy)?Location.*not authorized/i.test(msg)) return
    console.warn('[mp] unhandledRejection', reason && reason.message ? reason.message : reason)
  },
})
