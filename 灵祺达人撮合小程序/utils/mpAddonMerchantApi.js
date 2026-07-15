const ecs = require('./ecs.js')
const sessionStore = require('./mpSessionStore.js')
const linkeStore = require('./prDouyinLinkeStore.js')

const TEXT_MODELS = [
  { id: 'qwen', label: '通义千问' },
  { id: 'doubao', label: '豆包' },
  { id: 'minimax', label: 'MiniMax' },
]

function mpAuthHeaders() {
  const token = sessionStore.readSessionToken()
  return token ? { 'X-Mp-Session': token } : {}
}

function douyinBearerHeaders() {
  const bindings = linkeStore.readPrDouyinLinkeBindings()
  const spTok = bindings.serviceProvider && bindings.serviceProvider.sealedToken
  const clientTok =
    (bindings.clients && bindings.clients[0] && bindings.clients[0].sealedToken) || ''
  const token = String(spTok || clientTok || linkeStore.readPrDouyinClientSessionToken() || '').trim()
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (token) h.Authorization = `Bearer ${token}`
  return h
}

async function postPaths(paths, body, headers) {
  let lastErr = 'request_failed'
  for (const p of paths) {
    try {
      const data = await ecs.post(p, body, headers)
      if (data && data.ok === false) {
        const msg = String(data.message || data.error || '请求失败')
        lastErr = msg
        if (/404|not_found/i.test(msg)) continue
        return { ok: false, message: msg, data }
      }
      return { ok: true, data }
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e)
      if (/404|not_found/i.test(lastErr)) continue
      throw e
    }
  }
  return { ok: false, message: lastErr }
}

async function getPaths(paths, headers) {
  let lastErr = 'request_failed'
  for (const p of paths) {
    try {
      const data = await ecs.get(p, headers)
      if (data && data.ok === false) {
        const msg = String(data.message || data.error || '请求失败')
        lastErr = msg
        if (/404|not_found/i.test(msg)) continue
        return { ok: false, message: msg, data }
      }
      return { ok: true, data }
    } catch (e) {
      lastErr = String(e && e.message ? e.message : e)
      if (/404|not_found/i.test(lastErr)) continue
      throw e
    }
  }
  return { ok: false, message: lastErr }
}

function hasDouyinLinkeToken() {
  const h = douyinBearerHeaders()
  return !!h.Authorization
}

async function postDouyinAiAssist(body) {
  let r
  try {
    r = await postPaths(
      ['/api/meoo-douyin-goods-ai-assist', '/api/merchant/douyin/goods/ai/assist'],
      body,
      mpAuthHeaders(),
    )
  } catch (e) {
    return { ok: false, message: String(e && e.message ? e.message : e) }
  }
  if (!r.ok) return r
  const d = r.data || {}
  return {
    ok: true,
    description: String(d.description || d.text || '').trim(),
    needVendorKey: !!d.needVendorKey,
  }
}

async function postAiChat(messages, opts) {
  const o = opts || {}
  const body = {
    provider: o.provider || 'qwen',
    ...(o.model ? { model: o.model } : {}),
    messages,
    stream: false,
  }
  if (o.taskType) body.taskType = o.taskType
  if (o.temperature != null) body.temperature = o.temperature
  if (Array.isArray(o.imageDataUrls) && o.imageDataUrls.length) {
    body.imageDataUrls = o.imageDataUrls
  }
  let r
  try {
    r = await postPaths(['/api/meoo-ai-chat', '/api/ai/chat'], body, mpAuthHeaders())
  } catch (e) {
    return { ok: false, message: String(e && e.message ? e.message : e) }
  }
  if (!r.ok) return r
  const d = r.data || {}
  const content = String(d.content || d.text || (d.message && d.message.content) || '').trim()
  if (!content) return { ok: false, message: 'AI 未返回内容' }
  return { ok: true, content }
}

async function postAiAgentImage(prompt, opts) {
  const o = opts || {}
  const body = { prompt: String(prompt || '').trim() }
  if (o.preferredVendor) body.preferred_vendor = o.preferredVendor
  if (o.referenceImage) body.reference_image = o.referenceImage
  if (o.aspectRatio) body.aspect_ratio = o.aspectRatio
  if (o.exactPrompt) body.exact_prompt = true
  if (o.preferWanxPoster) body.prefer_wanx_poster = true
  let r
  try {
    r = await postPaths(['/api/meoo-ai-agent-image'], body, mpAuthHeaders())
  } catch (e) {
    return { ok: false, message: String(e && e.message ? e.message : e) }
  }
  if (!r.ok) return r
  const d = r.data || {}
  const imageUrl = String(d.imageUrl || d.url || d.image_url || '').trim()
  if (!imageUrl) return { ok: false, message: '未返回图片地址' }
  return { ok: true, imageUrl, vendorUsed: d.vendorUsed || d.channel || '' }
}

async function postDouyinLinkForDh(url) {
  const r = await postPaths(
    ['/api/meoo-digital-human-douyin-link'],
    { url: String(url || '').trim() },
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  return {
    ok: true,
    script: String(d.script || '').trim(),
    motionInstructions: String(d.motionInstructions || '').trim(),
    normalizedUrl: String(d.normalizedUrl || url || '').trim(),
    sourceTitle: d.sourceTitle ? String(d.sourceTitle) : '',
  }
}

async function fetchVideoAiConfig() {
  const r = await getPaths(
    ['/api/meoo-merchant-ai-video-config', '/api/merchant/ai/video/config'],
    mpAuthHeaders(),
  )
  if (!r.ok) return null
  return r.data || null
}

async function postSeedanceStart(body) {
  const r = await postPaths(
    ['/api/meoo-merchant-ai-video-seedance-start', '/api/merchant/ai/video/seedance/start'],
    body,
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  const taskId = String(d.taskId || '').trim()
  if (!taskId) return { ok: false, message: '未返回任务 ID' }
  return { ok: true, taskId, provider: d.provider, modelUsed: d.modelUsed }
}

async function fetchSeedanceStatus(taskId) {
  const qs = `?taskId=${encodeURIComponent(taskId)}`
  const r = await getPaths(
    [
      `/api/meoo-merchant-ai-video-seedance-status${qs}`,
      `/api/merchant/ai/video/seedance/status${qs}`,
    ],
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  return {
    ok: true,
    phase: String(d.phase || 'running'),
    statusLabel: String(d.statusLabel || d.phase || '处理中'),
    videoUrl: d.videoUrl ? String(d.videoUrl) : '',
    failReason: d.failReason ? String(d.failReason) : '',
  }
}

async function postShortVideoWithFailover(opts) {
  const engines = opts.engine === 'seedance' ? ['seedance', 'qwen'] : ['qwen', 'seedance']
  let lastMsg = ''
  for (const eng of engines) {
    const body = { ...opts.body }
    if (eng === 'qwen') {
      body.prefer_provider = 'qwen'
      body.model = '__server_auto__'
    }
    const r = await postSeedanceStart(body)
    if (r.ok) return { ...r, engineUsed: eng }
    lastMsg = r.message || lastMsg
    if (!/额度|限流|quota|limit|hopable/i.test(lastMsg)) break
  }
  return { ok: false, message: lastMsg || '视频生成失败' }
}

async function postDigitalHumanTts(body) {
  const r = await postPaths(['/api/meoo-digital-human-tts'], body, mpAuthHeaders())
  if (!r.ok) return r
  const d = r.data || {}
  const audioBase64 = String(d.audioBase64 || '').trim()
  if (!audioBase64) return { ok: false, message: '未返回音频数据' }
  return { ok: true, audioBase64, mimeType: d.mimeType || 'audio/mpeg' }
}

async function postDhS2vStart(body) {
  const r = await postPaths(
    ['/api/meoo-merchant-ai-dh-s2v-start', '/api/merchant/ai/video/dh-s2v/start'],
    body,
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  const taskId = String(d.taskId || '').trim()
  if (!taskId) return { ok: false, message: '未返回合成任务 ID' }
  return { ok: true, taskId, modelUsed: d.modelUsed }
}

async function fetchDhS2vStatus(taskId) {
  const qs = `?taskId=${encodeURIComponent(taskId)}`
  const r = await getPaths(
    [
      `/api/meoo-merchant-ai-dh-s2v-status${qs}`,
      `/api/merchant/ai/video/dh-s2v/status${qs}`,
    ],
    mpAuthHeaders(),
  )
  if (!r.ok) return r
  const d = r.data || {}
  return {
    ok: true,
    phase: String(d.phase || 'running'),
    statusLabel: String(d.statusLabel || d.phase || '合成中'),
    videoUrl: d.videoUrl ? String(d.videoUrl) : '',
    failReason: d.failReason ? String(d.failReason) : '',
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function pollVideoTask(fetchStatus, taskId, onProgress, maxTries) {
  const limit = maxTries || 120
  for (let i = 0; i < limit; i += 1) {
    const st = await fetchStatus(taskId)
    if (!st.ok) return st
    if (onProgress) onProgress(st.statusLabel, i + 1)
    if (st.phase === 'succeeded' && st.videoUrl) return { ok: true, videoUrl: st.videoUrl }
    if (st.phase === 'failed') {
      return { ok: false, message: st.failReason || '生成失败' }
    }
    await sleep(5000)
  }
  return { ok: false, message: '生成超时，请稍后在星选平台查看' }
}

module.exports = {
  TEXT_MODELS,
  hasDouyinLinkeToken,
  postDouyinAiAssist,
  postAiChat,
  postAiAgentImage,
  postDouyinLinkForDh,
  fetchVideoAiConfig,
  postShortVideoWithFailover,
  pollVideoTask,
  fetchSeedanceStatus,
  postDigitalHumanTts,
  postDhS2vStart,
  fetchDhS2vStatus,
}
