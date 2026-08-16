/**
 * 招募分享页海报 AI 生图：与视觉工坊常规生图同价（8 积分/张）
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

function buildPrompt(order, userText) {
  const o = order || {}
  const title = String(o.title || '').trim()
  const platform = String(o.platform || '').trim()
  const region = String(o.region || '').trim()
  const user = String(userText || '').trim()
  const lines = [
    '竖版 3:4 探店招募分享海报，生活服务商业摄影质感，画面干净、光影自然，适合微信分享卡片。',
    '不要出现二维码、水印、小字堆砌、变形人脸、乱码文字。',
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
          .runChooseMedia(chooseOpts, { purpose: '上传海报参考图' })
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
    prefer_wanx_poster: true,
    aspect_ratio: '3:4',
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
    content: `生成分享海报需要 ${POSTER_POINTS} 积分，请充值或升级套餐后再试。`,
    confirmText: '去充值',
    success: (res) => {
      if (res.confirm) tryNav(0)
    },
  })
}

async function generateSharePoster(opts) {
  const o = opts || {}
  await points.assertVisualStudioImageAffordable(1)
  const prompt = buildPrompt(o.order, o.userText)
  const imageUrl = await postAgentImage(prompt, o.referenceImage)
  const spend = await points.spendVisualStudioImagePoints({
    idempotencyKey: `recruit-share-poster-${Date.now()}`,
    note: '招募分享海报生图',
  })
  return {
    ok: true,
    imageUrl,
    pointsCharged: Number((spend && spend.pointsCharged) || POSTER_POINTS),
    order: applyCoverToOrder(o.order, imageUrl),
  }
}

module.exports = {
  POSTER_POINTS,
  buildPrompt,
  applyCoverToOrder,
  pickReferenceImage,
  generateSharePoster,
  openRecharge,
  affordActionFromError: points.affordActionFromError,
}
