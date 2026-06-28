require('./utils/wxAdapter.js')
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
      const identityNavBarGuard = require('./utils/identityNavBarGuard.js')
      identityNavBarGuard.installNavigationPatch()
      identityNavBarGuard.applyNow()
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
      'base=',
      config.MERCHANT_API_BASE_URL || ecs.base(),
      'platform=',
      config.MP_PLATFORM || '',
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
    if (!isWelcomeRoute()) {
      try {
        require('./utils/identityNavBarGuard.js').applyNow()
      } catch (_) {}
    }

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
    if (/showShareMenu|shareAppMessage|shareTimeline/i.test(msg)) return
    if (/canvas\.createImage is not a function/i.test(msg)) return
    console.error('[mp] onError', err)
  },
  onUnhandledRejection(res) {
    const reason = res && res.reason
    const msg = String((reason && reason.errMsg) || (reason && reason.message) || reason || '')
    if (/80424|get(?:Fuzzy)?Location.*not authorized/i.test(msg)) return
    console.warn('[mp] unhandledRejection', reason && reason.message ? reason.message : reason)
  },
})
