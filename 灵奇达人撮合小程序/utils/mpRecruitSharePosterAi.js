/**
 * 招募单封面 AI 生图：与视觉工坊常规生图同价（8 积分/张）
 */
const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const points = require('./mpPointsSpendApi.js')

const POSTER_POINTS = 8
const RECHARGE_PATHS = [
  '/pages/subpack-mine/mine-xingxuan-points-recharge/mine-xingxuan-points-recharge',
  '/pages/mine-xingxuan-membership/mine-xingxuan-membership',
]

function mpAuthHeaders() {
  const token = sessionStore.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function buildPrompt(ctx, userText) {
  const o = ctx || {}
  const title = String(o.title || '').trim()
  const platform = String(o.platform || '').trim()
  const region = String(o.region || '').trim()
  const user = String(userText || '').trim()
  const lines = [
    '横版 5:4 微信小程序分享封面（宽:高=5:4，约 1280×1024），生活服务商业摄影质感，画面干净、光影自然。',
    '不要做成竖版海报、9:16 长图或上下留白；构图按横版卡片铺满，主视觉居中。',
    title ? `招募主题：${title}` : '',
    platform ? `投放平台氛围：${platform}` : '',
    region ? `城市场景：${region}` : '',
    user
      ? `用户补充要求（海报文字与风格）：${user}`
      : '未提供额外文案时，以探店/生活方式氛围为主视觉，构图简洁有质感。',
  ]
  return lines.filter(Boolean).join('\n')
}

function applyCoverToOrder(order, imageUrl) {
  const url = String(imageUrl || '').trim()
  const next = Object.assign({}, order || {})
  next.coverImage = url
  next.coverLibraryId = ''
  next.coverImageSource = 'ai'
  const meta = Object.assign({}, (order && order.mpPublishMeta) || {})
  meta.coverImage = url
  meta.coverLibraryId = ''
  meta.coverImageSource = 'ai'
  next.mpPublishMeta = meta
  return next
}

function readPathAsDataUrl(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => {
        const mime = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
        resolve(`data:${mime};base64,${r.data}`)
      },
      fail: () => reject(new Error('读取参考图失败')),
    })
  })
}

function compressThenRead(path) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: path,
      quality: 72,
      compressedWidth: 768,
      success: (c) => {
        readPathAsDataUrl(c.tempFilePath || path).then(resolve).catch(reject)
      },
      fail: () => {
        readPathAsDataUrl(path).then(resolve).catch(reject)
      },
    })
  })
}

function pickReferenceImage() {
  const chooseOpts = {
    count: 1,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
  }
  return new Promise((resolve, reject) => {
    const onPicked = (res) => {
      if (!res) {
        reject(new Error('cancel'))
        return
      }
      const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
      if (!path) {
        reject(new Error('未选择图片'))
        return
      }
      compressThenRead(path)
        .then((dataUrl) => resolve({ path, dataUrl }))
        .catch(reject)
    }
    try {
      const mpPrivacy = require('./mpPrivacyAuthorize.js')
      if (mpPrivacy && typeof mpPrivacy.runChooseMedia === 'function') {
        mpPrivacy
          .runChooseMedia(chooseOpts, { purpose: '上传封面参考图' })
          .then(onPicked)
          .catch((e) => {
            const msg = String((e && e.message) || e || '')
            reject(new Error(/cancel/i.test(msg) ? 'cancel' : msg || '选择图片失败'))
          })
        return
      }
    } catch (_) {}
    wx.chooseMedia({
      ...chooseOpts,
      success: onPicked,
      fail: (e) => {
        if (e && e.errMsg && /cancel/.test(e.errMsg)) reject(new Error('cancel'))
        else reject(new Error('选择图片失败'))
      },
    })
  })
}

async function postAgentImage(prompt, referenceImage) {
  const body = {
    prompt: String(prompt || '').trim(),
    exact_prompt: true,
    prefer_wanx_poster: false,
    aspect_ratio: '4:3',
    wanx_size: '1280*1024',
    preferred_vendor: 'qwen',
  }
  const ref = String(referenceImage || '').trim()
  if (ref) body.reference_image = ref
  const d = await ecs.post('/api/meoo-ai-agent-image', body, mpAuthHeaders())
  if (d && d.ok === false) {
    throw new Error(String(d.message || d.error || '生图失败'))
  }
  const imageUrl = String((d && (d.imageUrl || d.url || d.image_url)) || '').trim()
  if (!imageUrl) throw new Error('未返回图片地址')
  return imageUrl
}

function openRecharge() {
  const tryNav = (i) => {
    if (i >= RECHARGE_PATHS.length) {
      wx.showToast({ title: '请前往我的页充值积分', icon: 'none' })
      return
    }
    wx.navigateTo({
      url: RECHARGE_PATHS[i],
      fail: () => tryNav(i + 1),
    })
  }
  wx.showModal({
    title: '积分不足',
    content: `生成招募封面需要 ${POSTER_POINTS} 积分，请充值或升级套餐后再试。`,
    confirmText: '去充值',
    success: (res) => {
      if (res.confirm) tryNav(0)
    },
  })
}

async function generateCoverImage(opts) {
  const o = opts || {}
  await points.assertVisualStudioImageAffordable(1)
  const prompt = buildPrompt(
    { title: o.title, platform: o.platform, region: o.region },
    o.userText,
  )
  const imageUrl = await postAgentImage(prompt, o.referenceImage)
  const spend = await points.spendVisualStudioImagePoints({
    idempotencyKey: `recruit-cover-ai-${Date.now()}`,
    note: '招募封面生图',
  })
  return {
    ok: true,
    imageUrl,
    pointsCharged: Number((spend && spend.pointsCharged) || POSTER_POINTS),
  }
}

module.exports = {
  POSTER_POINTS,
  buildPrompt,
  applyCoverToOrder,
  pickReferenceImage,
  generateCoverImage,
  openRecharge,
  affordActionFromError: points.affordActionFromError,
}
