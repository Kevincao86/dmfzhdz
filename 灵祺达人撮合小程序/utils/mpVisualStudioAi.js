/**
 * 小程序 AI 视觉工坊：与商家 ERP visualStudioAi 同源调用链（chat + agent-image）
 */
const api = require('./mpAddonMerchantApi.js')

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
]

const INDUSTRIES = [
  { id: 'dining', label: '餐饮' },
  { id: 'beauty', label: '美业' },
  { id: 'leisure', label: '休娱' },
  { id: 'hotel', label: '酒店' },
  { id: 'pet', label: '宠物' },
  { id: 'edu', label: '教育' },
]

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
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  return [
    {
      headline: `${store}${pb.label}`,
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

function buildLocalImagePrompt(form, copy) {
  const industry = INDUSTRIES.find((i) => i.id === form.industry) || INDUSTRIES[0]
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  const ch = (form.channels || [])
    .map((id) => (CHANNELS.find((c) => c.id === id) || {}).label || id)
    .join('、')
  const c = copy || {}
  return [
    `中国大陆本地生活营销海报，业态：${industry.label}，玩法：${pb.label}（${pb.desc}）。`,
    `投放渠道：${ch || '抖音'}。门店：${form.storeName || '本店'}。`,
    `画面主标题大字：「${c.headline || '限时优惠'}」，副标题「${c.subheadline || ''}」，优惠信息「${c.offer || ''}」。`,
    `竖构图海报，专业排版，中文清晰可读，无水印乱码，真实质感，适合手机信息流。`,
  ]
    .filter(Boolean)
    .join('')
}

async function fetchCopySuggestions(form) {
  const fallback = localCopyFallback(form)
  const industry = INDUSTRIES.find((i) => i.id === form.industry) || INDUSTRIES[0]
  const pb = PLAYBOOKS.find((p) => p.id === form.playbook) || PLAYBOOKS[0]
  const channels = (form.channels || [])
    .map((id) => (CHANNELS.find((c) => c.id === id) || {}).label || id)
    .join('、')
  const jsonExample = '[{"headline":"","subheadline":"","offer":"","timeRange":"","note":""}]'
  const userPrompt = [
    `你是中国大陆本地生活商家营销文案专家。请为「${industry.label}」门店生成 3 套海报文案。`,
    `门店名：${form.storeName || '（未填，可用「本店」）'}`,
    `营销玩法：${pb.label}（${pb.desc}）`,
    `投放平台：${channels || '抖音'}`,
    '要求：每套含 headline（主标题≤12字）、subheadline、offer、timeRange、note；只输出 JSON 数组。',
    `格式：${jsonExample}`,
  ].join('\n')

  const res = await api.postAiChat(
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
    industry: form.industry,
    storeName: form.storeName,
    playbook: form.playbook,
    channels: form.channels,
    headline: copy.headline,
    subheadline: copy.subheadline,
    offer: copy.offer,
    timeRange: copy.timeRange,
  }
  const userPrompt = [
    '你是中国大陆本地生活营销海报的生图 Prompt 工程师。根据 JSON 输出一段可直接交给文生图模型的中文 Prompt（300～600 字，单段，不要 JSON/markdown）。',
    '必须体现 headline/offer 为画面中文大字，业态匹配，专业海报排版。',
    '业务上下文 JSON：',
    JSON.stringify(ctx),
  ].join('\n')
  const res = await api.postAiChat(
    [
      {
        role: 'system',
        content: '你只输出一段中文文生图 Prompt 正文，禁止解释与代码块。',
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
  const packed = await fetchImagePrompt(form, copy)
  const gen = await api.postAiAgentImage(packed.prompt, {
    preferredVendor: 'qwen',
    aspectRatio: o.aspectRatio || '3:4',
    exactPrompt: true,
    preferWanxPoster: true,
    referenceImage: o.referenceImage || '',
  })
  if (!gen.ok) return gen
  return { ok: true, imageUrl: gen.imageUrl, promptSource: packed.source }
}

module.exports = {
  CHANNELS,
  PLAYBOOKS,
  INDUSTRIES,
  fetchCopySuggestions,
  fetchImagePrompt,
  generatePosterImage,
  buildLocalImagePrompt,
  localCopyFallback,
}
