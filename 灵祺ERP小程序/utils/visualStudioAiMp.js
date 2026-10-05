/**
 * 商家 ERP 小程序 · AI 视觉工坊
 * 与 Web AiImageStudio / 达人小程序 mpVisualStudioAi 同源能力（chat + agent-image）
 */
const config = require('./config.js')
const api = require('./api.js')
const devAuth = require('./devAuth.js')

const CHANNELS = [
  { id: 'douyin', label: '抖音' },
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'wechat_moments', label: '朋友圈' },
  { id: 'meituan', label: '美团' },
  { id: 'kuaishou', label: '快手' },
  { id: 'offline_print', label: '印刷' },
]

const PLAYBOOKS = [
  { id: 'grand_opening', label: '开业引流', desc: '新店开业、试营业、首单立减' },
  { id: 'flash_sale', label: '限时秒杀', desc: '48小时闪购、清仓' },
  { id: 'group_buy_new', label: '团购上新', desc: '套餐上架、组合卖点' },
  { id: 'festival_promo', label: '节日大促', desc: '节日限定福利' },
  { id: 'store_visit', label: '探店种草', desc: '打卡、UGC、氛围感' },
  { id: 'member_recharge', label: '会员储值', desc: '储值送礼、复购锁客' },
  { id: 'daily_sign', label: '日签海报', desc: '每日营业、天气联动、社群触达' },
  { id: 'product_hero', label: '招牌单品', desc: '爆款菜、引流品、主图' },
  { id: 'logo_brand', label: '品牌标识', desc: 'Logo、头像、门头字' },
  { id: 'menu_board', label: '菜单价目', desc: '电子菜单、价目视觉' },
  { id: 'platform_carousel_five', label: '三连图', desc: '一张连续海报裁成 3 张，从左到右横滑' },
  { id: 'platform_detail_page', label: '详情图', desc: '团购详情页竖向长图，5 段拼接' },
]

const INDUSTRIES = [
  { id: 'catering', label: '餐饮' },
  { id: 'beauty', label: '美业' },
  { id: 'leisure', label: '休娱' },
  { id: 'hotel', label: '酒旅' },
  { id: 'pet', label: '宠物' },
  { id: 'education', label: '教育' },
]

function apiBase() {
  return String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
}

function authHeaders() {
  const token = api.getBearerToken ? api.getBearerToken() : api.getAccessToken()
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token && token !== devAuth.DEV_TOKEN) h.Authorization = `Bearer ${token}`
  return h
}

function ensureAuth() {
  if (api.isRealAuthed && api.isRealAuthed()) return
  throw new Error('请先登录后再使用视觉工坊（「我的」页完成登录）')
}

function requestJson(path, data, timeoutMs) {
  const base = apiBase()
  if (!base) return Promise.reject(new Error('未配置商家后台 API'))
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}${path}`,
      method: 'POST',
      header: authHeaders(),
      data,
      timeout: Math.max(8000, Number(timeoutMs) || 25000),
      success(res) {
        const body = res.data
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.ok !== false) {
          resolve(body)
          return
        }
        const msg =
          (body && (body.message || body.error)) ||
          `请求失败（HTTP ${res.statusCode || '?'}）`
        reject(new Error(String(msg)))
      },
      fail(err) {
        reject(new Error((err && err.errMsg) || '网络异常'))
      },
    })
  })
}

async function postAiChat(messages, opts) {
  ensureAuth()
  const o = opts || {}
  try {
    const data = await requestJson('/api/meoo-ai-chat', {
      provider: o.provider || 'qwen',
      messages,
      taskType: o.taskType || 'generate_copywriting',
      temperature: o.temperature != null ? o.temperature : 0.4,
    })
    return { ok: true, content: String(data.content || '') }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e), content: '' }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 高级生图走 start/poll，单次请求控制在微信超时以内 */
async function pollTokenmixImage(body) {
  const started = await requestJson(
    '/api/meoo-ai-agent-image',
    Object.assign({}, body, { phase: 'start' }),
    50000,
  )
  if (started.imageUrl) return started
  const taskId = String(started.taskId || '').trim()
  if (!taskId) throw new Error('高级生图未返回任务号')
  const deadline = Date.now() + 240000
  let retryAfterSec = Number(started.retryAfterSec) || 4
  while (Date.now() < deadline) {
    const waitSec = Math.max(2, Math.min(8, retryAfterSec))
    await sleep(waitSec * 1000)
    const polled = await requestJson(
      '/api/meoo-ai-agent-image',
      {
        phase: 'poll',
        task_id: taskId,
        image_route: 'tokenmix',
        tokenmix_image_model: body.tokenmix_image_model,
        prompt: body.prompt,
      },
      25000,
    )
    if (polled.retryAfterSec) retryAfterSec = Number(polled.retryAfterSec) || retryAfterSec
    if (polled.imageUrl) return polled
    if (polled.pending === false && !polled.imageUrl) {
      throw new Error('高级生图未返回图片')
    }
  }
  throw new Error('高级生图仍在生成，请稍后重试')
}

const ASPECT_WANX = {
  '3:4': '832*1184',
  '1:1': '1024*1024',
  '9:16': '720*1280',
  '4:3': '1184*832',
  '16:9': '1280*720',
  carousel: '1440*768',
}

async function postAiAgentImage(prompt, opts) {
  ensureAuth()
  const o = opts || {}
  const body = {
    prompt: String(prompt || '').trim(),
    preferred_vendor: o.preferredVendor || 'qwen',
  }
  if (o.aspectRatio && o.aspectRatio !== 'carousel') body.aspect_ratio = o.aspectRatio
  if (o.wanxSize) body.wanx_size = o.wanxSize
  if (o.exactPrompt) body.exact_prompt = true
  if (o.preferWanxPoster) body.prefer_wanx_poster = true
  if (o.referenceImage) body.reference_image = o.referenceImage
  if (o.imageRoute === 'tokenmix') {
    body.image_route = 'tokenmix'
    if (o.tokenmixImageModel) body.tokenmix_image_model = o.tokenmixImageModel
  }
  try {
    const useAsyncPro = body.image_route === 'tokenmix'
    const data = useAsyncPro
      ? await pollTokenmixImage(body)
      : await requestJson('/api/meoo-ai-agent-image', body, 55000)
    const imageUrl = String(data.imageUrl || '').trim()
    if (!imageUrl) return { ok: false, message: '生图未返回图片地址' }
    return {
      ok: true,
      imageUrl,
      channel: data.channel === 'tokenmix' ? 'tokenmix' : 'builtin',
      pointsCharged:
        data.pointsCharged != null ? Math.max(0, Math.floor(Number(data.pointsCharged) || 0)) : undefined,
    }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) }
  }
}

function stripJsonFence(raw) {
  const t = String(raw || '').trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (m && m[1] ? m[1] : t).trim()
}

function extractJsonArray(text) {
  const cleaned = stripJsonFence(text)
  try {
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      for (const key of ['items', 'data', 'suggestions', 'copy', 'list']) {
        if (Array.isArray(parsed[key])) return parsed[key]
      }
    }
  } catch (_) {
    /* fallthrough */
  }
  const bracket = cleaned.match(/\[[\s\S]*\]/)
  if (bracket) {
    try {
      const arr = JSON.parse(bracket[0])
      if (Array.isArray(arr)) return arr
    } catch (_) {
      /* ignore */
    }
  }
  return null
}

function normalizeCopyRow(row) {
  if (!row || typeof row !== 'object') return null
  const headline = String(row.headline || row.title || row['主标题'] || '').trim()
  if (!headline) return null
  return {
    headline,
    subheadline: String(row.subheadline || row.subtitle || row['副标题'] || '').trim(),
    offer: String(row.offer || row.price || row['优惠'] || '').trim(),
    timeRange: String(row.timeRange || row.time || '').trim(),
    note: String(row.note || '').trim(),
  }
}

function localCopyFallback(form) {
  const store = String(form.storeName || '').trim() || '本店'
  const leaf = String(form.categoryPath || '').split('/').pop()
  const topic = String(leaf || '').trim() || '到店'
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  return [
    {
      headline: `${store}${topic}`,
      subheadline: pb.desc,
      offer: '到店立减',
      timeRange: '限时活动',
      note: '',
    },
    {
      headline: `限时福利开抢`,
      subheadline: `${store}专属优惠`,
      offer: '超值套餐',
      timeRange: '本周末有效',
      note: '',
    },
    {
      headline: `打卡必去`,
      subheadline: `${store}人气推荐`,
      offer: '新人专享',
      timeRange: '今日可用',
      note: '',
    },
  ]
}

function categoryLockLines(form) {
  const path = String(form.categoryPath || '').trim()
  const scene = String(form.categoryScene || '').trim()
  const storePath = String(form.storeIndustryPath || '').trim()
  const menu = String(form.menuHint || '').trim()
  return [
    path
      ? `【类目锁定】本次三级类目是「${path}」。画面主体、道具、环境只能是这一类的商品或服务：${scene || path}。禁止改成无关行业，禁止通用节日茶席、风景或与该类目无关的海报。`
      : '',
    storePath ? `门店档案经营类目：${storePath}。画面须能认出是这家店的业务，不要换成别的行业。` : '',
    menu ? `门店在售（必须优先画这些，不要另造无关单品）：${menu}。` : '',
  ].filter(Boolean)
}

function buildLocalImagePrompt(form, copy) {
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  const ch = (form.channels || [])
    .map((id) => (CHANNELS.find((c) => c.id === id) || {}).label || id)
    .join('、')
  const c = copy || {}
  return [
    ...categoryLockLines(form),
    `中国大陆本地生活营销海报，玩法：${pb.label}（${pb.desc}）。`,
    form.variantLabel && form.variantName
      ? `${form.variantLabel}：${form.variantName}${form.variantPeriod ? `（${form.variantPeriod}）` : ''}。`
      : '',
    `投放渠道：${ch || '抖音'}。门店：${form.storeName || '本店'}。`,
    `画面主标题大字只能使用：「${c.headline || '限时优惠'}」。副标题「${c.subheadline || ''}」。优惠信息「${c.offer || ''}」。禁止改写标题，禁止另起一套无关文案。`,
    c.timeRange ? `活动时段：${c.timeRange}。` : '',
    c.note ? `补充说明：${c.note}。` : '',
    form.keywords ? `关键词：${form.keywords}。` : '',
    '专业排版，中文清晰可读，无水印乱码，真实质感。不要描述画布比例。',
  ]
    .filter(Boolean)
    .join('')
}

async function fetchCopySuggestions(form) {
  const fallback = localCopyFallback(form)
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  const channels = (form.channels || [])
    .map((id) => (CHANNELS.find((c) => c.id === id) || {}).label || id)
    .join('、')
  const jsonExample = '[{"headline":"","subheadline":"","offer":"","timeRange":"","note":""}]'
  const userPrompt = [
    '你是中国大陆本地生活商家营销文案专家。文案必须只写下面这一条三级类目，禁止写成别的行业。',
    ...categoryLockLines(form),
    `门店名：${form.storeName || '（未填，可用「本店」）'}`,
    `营销玩法：${pb.label}（${pb.desc}）`,
    form.variantLabel && form.variantName
      ? `${form.variantLabel}：${form.variantName}${form.variantPeriod ? `，${form.variantPeriod}` : ''}`
      : '',
    `投放平台：${channels || '抖音'}`,
    '要求：每套含 headline（主标题≤12字）、subheadline、offer、timeRange、note；卖点必须是该类目的真实商品或服务；只输出 JSON 数组。',
    `格式：${jsonExample}`,
  ].join('\n')

  const res = await postAiChat(
    [
      {
        role: 'system',
        content:
          '你是营销文案生成器。只输出合法 JSON 数组，字段名必须为 headline、subheadline、offer、timeRange、note。',
      },
      { role: 'user', content: userPrompt },
    ],
    { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.4 },
  )
  if (!res.ok) return { ok: false, message: res.message, items: fallback, source: 'local' }
  const rows = extractJsonArray(res.content) || []
  const items = []
  for (const row of rows.slice(0, 3)) {
    const item = normalizeCopyRow(row)
    if (item) items.push(item)
  }
  if (!items.length) return { ok: true, items: fallback, source: 'local', message: '已用本地文案包' }
  return { ok: true, items, source: 'ai' }
}

async function fetchImagePrompt(form, copy) {
  const fallback = buildLocalImagePrompt(form, copy)
  const ctx = {
    categoryPath: form.categoryPath || '',
    categoryScene: form.categoryScene || '',
    storeIndustryPath: form.storeIndustryPath || '',
    menuHint: form.menuHint || '',
    storeName: form.storeName,
    playbook: form.playbook,
    channels: form.channels,
    headline: copy.headline,
    subheadline: copy.subheadline,
    offer: copy.offer,
    timeRange: copy.timeRange,
    note: copy.note,
    keywords: form.keywords || '',
  }
  const userPrompt = [
    '你是中国大陆本地生活营销海报的生图 Prompt 工程师。根据 JSON 输出一段可直接交给文生图模型的中文 Prompt（300～600 字，单段，不要 JSON/markdown）。',
    '画面主体必须严格等于 categoryPath / categoryScene，并优先画 menuHint 里的在售商品或服务。',
    '标题大字只能使用 headline、subheadline、offer，禁止改成别的节日文案。',
    '禁止写画幅、比例、竖构图、横构图、像素尺寸、留白。画幅由系统锁定，你写了也会被删掉。',
    '业务上下文 JSON：',
    JSON.stringify(ctx),
  ].join('\n')
  const res = await postAiChat(
    [
      {
        role: 'system',
        content:
          '你只输出一段中文文生图 Prompt 正文，禁止解释与代码块。禁止出现任何画幅比例。画面必须是用户指定的三级类目。',
      },
      { role: 'user', content: userPrompt },
    ],
    { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.35 },
  )
  if (!res.ok) return { ok: true, prompt: fallback, source: 'local' }
  const prompt = stripJsonFence(res.content)
  if (prompt.length < 80) return { ok: true, prompt: fallback, source: 'local' }
  return { ok: true, prompt, source: 'ai' }
}

async function generatePosterImage(form, copy, opts) {
  const o = opts || {}
  const cats = require('./visualStudioCategoryMp.js')
  const packed = await fetchImagePrompt(form, copy)
  const usePro = o.tier === 'pro'
  const economics = require('./mpPointsEconomicsMp.js')
  const aspect = o.aspectRatio || '3:4'
  const spec = cats.aspectSpec(aspect)
  const prompt = cats.lockPromptToAspect(packed.prompt, aspect)
  const gen = await postAiAgentImage(prompt, {
    preferredVendor: 'qwen',
    aspectRatio: aspect === 'carousel' ? '' : aspect,
    wanxSize: spec.wanx,
    exactPrompt: true,
    preferWanxPoster: true,
    // 高级 GPT Image 2 暂不支持参考图
    referenceImage: usePro ? '' : o.referenceImage || '',
    ...(usePro
      ? {
          imageRoute: 'tokenmix',
          tokenmixImageModel: economics.VISUAL_STUDIO_PRO_IMAGE_MODEL || 'gpt-image-2',
        }
      : {}),
  })
  if (!gen.ok) return gen
  return {
    ok: true,
    imageUrl: gen.imageUrl,
    promptSource: packed.source,
    channel: gen.channel,
    usedPro: usePro && gen.channel === 'tokenmix',
    pointsCharged: gen.pointsCharged,
  }
}

async function fetchKeywords(form, copy) {
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  const userPrompt = [
    `为「${form.categoryPath || '本地生活'}」门店「${form.storeName || '本店'}」的「${pb.label}」海报生成 8～12 个中文关键词。`,
    form.categoryScene ? `画面只能围绕：${form.categoryScene}` : '',
    form.menuHint ? `在售：${form.menuHint}` : '',
    `主标题：${(copy && copy.headline) || ''}；优惠：${(copy && copy.offer) || ''}`,
    '只输出用顿号分隔的关键词，不要解释。',
  ].join('\n')
  const res = await postAiChat(
    [
      { role: 'system', content: '你只输出中文关键词，用顿号分隔。' },
      { role: 'user', content: userPrompt },
    ],
    { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.3 },
  )
  if (!res.ok) return { ok: false, message: res.message, keywords: '' }
  return { ok: true, keywords: String(res.content || '').replace(/\s+/g, ' ').trim() }
}

/** 小程序 downloadFile 拉不到的成图（TokenMix / 火山），改由接口代拉成 data URL。 */
async function fetchRemoteImageDataUrl(imageUrl) {
  const url = String(imageUrl || '').trim()
  if (!url) return ''
  if (/^data:image\//i.test(url)) return url
  try {
    const data = await requestJson('/api/meoo-ai-agent-image', { phase: 'fetch', image_url: url }, 40000)
    const out = String((data && data.imageUrl) || '').trim()
    return /^data:image\//i.test(out) ? out : ''
  } catch (_) {
    return ''
  }
}

module.exports = {
  CHANNELS,
  PLAYBOOKS,
  INDUSTRIES,
  postAiChat,
  postAiAgentImage,
  fetchRemoteImageDataUrl,
  fetchCopySuggestions,
  fetchImagePrompt,
  generatePosterImage,
  fetchKeywords,
  buildLocalImagePrompt,
  localCopyFallback,
}
