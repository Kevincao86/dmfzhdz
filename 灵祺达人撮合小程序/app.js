const config = require('./utils/config.js')
const mpRuntime = require('./utils/mpRuntime.js')

App({
  globalData: {
    chatBadge: 0,
  },
  onLaunch() {
    mpRuntime.applyRuntimeConfig(config)
    try {
      if (typeof config.applyDevtoolsOverrides === 'function') {
        config.applyDevtoolsOverrides()
      }
    } catch (e) {
      console.warn('[mp] applyDevtoolsOverrides', e)
    }

    if (mpRuntime.isLocalDevRuntime()) {
      console.info(
        '[mp] 本机调试直连',
        config.MERCHANT_API_BASE_URL || '(未配置)',
        'cloudProxy=',
        config.MP_USE_CLOUD_PROXY,
      )
    }

    const mpShare = require('./utils/mpShare.js')
    try {
      mpShare.enableShareMenu()
      if (!mpRuntime.isLocalDevRuntime()) {
        mpShare.preloadShareCover()
      } else {
        setTimeout(() => {
          try {
            mpShare.preloadShareCover()
          } catch (e) {
            console.warn('[mp] preloadShareCover', e)
          }
        }, 800)
      }
    } catch (e) {
      console.warn('[mp] onLaunch share init', e)
    }

    const ecs = require('./utils/ecs.js')
    if (ecs.useCloudProxy() && wx.cloud) {
      const env = String(config.MP_CLOUD_ENV || '').trim()
      if (env) {
        wx.cloud.init({ env, traceUser: true })
      } else {
        console.warn('[mp] MP_USE_CLOUD_PROXY 已开但 MP_CLOUD_ENV 为空')
      }
    }

    setTimeout(() => {
      try {
        const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
        chatBadgeWatcher.start()
      } catch (e) {
        console.warn('[mp] chatBadgeWatcher.start', e)
      }
      try {
        const auth = require('./utils/auth.js')
        if (auth.isLoggedIn()) {
          require('./utils/mpAccountClientSync.js').pullAfterLogin()
        }
      } catch (e) {
        console.warn('[mp] pullAfterLogin', e)
      }
    }, 0)
  },
  onShow() {
    setTimeout(() => {
      try {
        const chatBadgeWatcher = require('./utils/chatBadgeWatcher.js')
        void chatBadgeWatcher.refreshNow()
      } catch (_) {}
      try {
        const auth = require('./utils/auth.js')
        if (auth.isLoggedIn()) {
          auth
            .refreshSession()
            .then(() => {
              try {
                return require('./utils/registryProfileSync.js').pullRegistryProfileAfterLogin()
              } catch (_) {
                return null
              }
            })
            .catch(() => {})
        }
      } catch (_) {}
    }, 0)
  },
  onError(err) {
    console.error('[mp] onError', err)
  },
})
