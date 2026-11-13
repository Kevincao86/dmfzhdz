const config = require('./utils/config.js')
const mpRuntime = require('./utils/mpRuntime.js')
const mpPrivacyAuthorize = require('./utils/mpPrivacyAuthorize.js')
const ossDisplay = require('./utils/mpOssDisplayUrl.js')

function patchOssSetData(ctx) {
  if (!ctx || ctx.__ossDisplaySetData || typeof ctx.setData !== 'function') return
  const rawSetData = ctx.setData
  ctx.setData = function (data, cb) {
    const next = data && typeof data === 'object' ? ossDisplay.rewriteOssDisplayUrlDeep(data) : data
    return rawSetData.call(this, next, cb)
  }
  ctx.__ossDisplaySetData = true
}

function patchWxRead(name) {
  if (typeof wx === 'undefined' || typeof wx[name] !== 'function' || wx[name].__ossDisplayPatched) return
  const raw = wx[name]
  const wrapped = function (opts) {
    if (!opts || typeof opts !== 'object') return raw.call(wx, opts)
    const next = Object.assign({}, opts)
    if (typeof next.url === 'string') next.url = ossDisplay.rewriteOssDisplayUrl(next.url)
    if (typeof next.src === 'string') next.src = ossDisplay.rewriteOssDisplayUrl(next.src)
    if (typeof next.current === 'string') next.current = ossDisplay.rewriteOssDisplayUrl(next.current)
    if (Array.isArray(next.urls)) {
      next.urls = next.urls.map((u) => ossDisplay.rewriteOssDisplayUrl(u))
    }
    return raw.call(wx, next)
  }
  wrapped.__ossDisplayPatched = true
  try {
    wx[name] = wrapped
  } catch (_) {}
}

patchWxRead('downloadFile')
patchWxRead('getImageInfo')
patchWxRead('previewImage')

const _NativePage = Page
Page = function (opts) {
  const pageOpts = opts || {}
  try {
    const accentTheme = require('./utils/accentTheme.js')
    pageOpts.data = Object.assign({}, accentTheme.viewModel(), pageOpts.data || {})
  } catch (_) {}
  pageOpts.data = ossDisplay.rewriteOssDisplayUrlDeep(pageOpts.data || {})
  const userOnLoad = pageOpts.onLoad
  pageOpts.onLoad = function () {
    patchOssSetData(this)
    if (typeof userOnLoad === 'function') return userOnLoad.apply(this, arguments)
  }
  const userOnShow = pageOpts.onShow
  pageOpts.onShow = function () {
    const ret = typeof userOnShow === 'function' ? userOnShow.apply(this, arguments) : undefined
    try {
      require('./utils/accentTheme.js').pin(this)
    } catch (_) {}
    return ret
  }
  return _NativePage(pageOpts)
}

const _NativeComponent = Component
Component = function (opts) {
  const compOpts = opts || {}
  if (compOpts.data) compOpts.data = ossDisplay.rewriteOssDisplayUrlDeep(compOpts.data)
  const lifetimes = compOpts.lifetimes || (compOpts.lifetimes = {})
  const userCreated = lifetimes.created || compOpts.created
  const created = function () {
    patchOssSetData(this)
    if (typeof userCreated === 'function') return userCreated.apply(this, arguments)
  }
  lifetimes.created = created
  compOpts.created = created
  return _NativeComponent(compOpts)
}

function currentRoute() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  return pages.length ? String(pages[pages.length - 1].route || '') : ''
}

function isWelcomeRoute() {
  const route = currentRoute()
  return route === '' || route === 'pages/login/login' || route === 'pages/subpack-signup/signup/signup' || route === 'pages/subpack-signup/legal/legal'
}

/** 已登录则同步身份。未登录留在首页浏览，不在打开时要求手机号、头像或昵称。 */
function redirectIfLoginRequired() {
  try {
    const auth = require('./utils/auth.js')
    if (!auth.isLoggedIn()) return
    const acc = auth.readAccount()
    if (acc) require('./utils/userProfile.js').adoptAccountIdentity(acc)
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
      require('./utils/hallLoad.js').warmupHallRegistry()
    } catch (e) {
      console.warn('[mp] warmupHallRegistry', e)
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
    redirectIfLoginRequired()

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
    redirectIfLoginRequired()
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
