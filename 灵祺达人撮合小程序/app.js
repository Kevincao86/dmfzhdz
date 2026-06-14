const config = require('./utils/config.js')
const mpRuntime = require('./utils/mpRuntime.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    mpRuntime.resetRuntimeCache()
    mpRuntime.applyRuntimeConfig(config)
    console.info(
      '[mp] transport',
      mpRuntime.isLocalDevRuntime() ? 'direct' : 'cloud-proxy',
      'cloud=',
      config.MP_USE_CLOUD_PROXY,
      config.MERCHANT_API_BASE_URL || '',
    )

    try {
      const mpShare = require('./utils/mpShare.js')
      mpShare.enableShareMenu()
    } catch (e) {
      console.warn('[mp] share menu', e)
    }

    try {
      const ecs = require('./utils/ecs.js')
      if (ecs.useCloudProxy() && wx.cloud) {
        const env = String(config.MP_CLOUD_ENV || '').trim()
        if (env) wx.cloud.init({ env, traceUser: true })
      }
    } catch (e) {
      console.warn('[mp] cloud.init', e)
    }

    setTimeout(() => {
      try {
        const mpShare = require('./utils/mpShare.js')
        mpShare.preloadShareCover()
      } catch (_) {}
    }, 1200)

    setTimeout(() => {
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
    }, 500)
  },
  onShow() {
    const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
    const route = pages.length ? String(pages[pages.length - 1].route || '') : ''
    if (route === 'pages/welcome/welcome') return

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
  },
  onError(err) {
    console.error('[mp] onError', err)
  },
  onUnhandledRejection(res) {
    const reason = res && res.reason
    console.warn('[mp] unhandledRejection', reason && reason.message ? reason.message : reason)
  },
})
