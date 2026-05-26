const aiOperation = require('./aiOperationMp.js')
const videoAi = require('./videoAiMp.js')
const { ICE_ASPECT_PRESETS } = require('./shortVideoLabelsMp.js')

function newJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function parseUrlLines(text) {
  return String(text || '')
    .split(/\n|,|;/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
}

function parseImageUrlLines(text) {
  return parseUrlLines(text).filter((s) => /\.(jpe?g|png|webp|gif|bmp|heic)(\?|#|$)/i.test(s) || /\/image\//i.test(s))
}

function aspectById(id) {
  return ICE_ASPECT_PRESETS.find((a) => a.id === id) || ICE_ASPECT_PRESETS[0]
}

function buildMaterialSummary(ctx) {
  const lines = [
    '【云剪素材概况】',
    `画幅：${ctx.aspectLabel}`,
    `单段/每张时长约：${ctx.clipEndSec} 秒`,
    `画面特效：${ctx.preset}`,
    `图片素材 ${ctx.imageUrls.length} 张：`,
    ...ctx.imageUrls.map((u, i) => `  - 图${i + 1}：${ctx.imageLabels[i] || '素材'} · ${u}`),
    `视频素材 ${ctx.videoUrls.length} 条：`,
    ...ctx.videoUrls.map((u, i) => `  - 视频${i + 1}：${u}`),
  ]
  if (ctx.userHint && String(ctx.userHint).trim()) lines.push(`商家补充说明：${String(ctx.userHint).trim()}`)
  return lines.join('\n')
}

async function generateIceEditBrief(ctx) {
  const imageUrls = ctx.imageUrls || []
  const videoUrls = ctx.videoUrls || []
  if (!imageUrls.length && !videoUrls.length) {
    return { ok: false, message: '请先上传至少一张图片或一条视频素材' }
  }
  const titleDraft = [
    '请根据下列素材，推断商家发布短视频的意图（探店种草/带货转化/门店氛围/活动促销等），',
    '并输出一段可直接交给阿里云智能媒体云剪的「剪辑文案指令」。',
    '要求：竖屏短视频包装；必须写清「全片总时长」（如 10-12 秒，与商家输出参数接近）、前 3 秒吸睛、节奏与转场、字幕风格；',
    '若为多图合成，用「一、二、三」分条写每段画面要点；结尾预留品牌 Slogan 或行动号召位。',
    '只输出剪辑指令正文，不要 Markdown 标题，不要 JSON。',
    '',
    buildMaterialSummary(ctx),
  ].join('\n')

  const r = await aiOperation.postAiOperationAssist('operation_article', {
    productContextName: '墨典AI云剪',
    titleDraft,
    model: 'qwen',
  })
  if (!r.ok) return r
  return { ok: true, brief: r.text }
}

const POLL_MS = 5000
const POLL_MAX = 120

function formatProgress(p) {
  if (p == null || Number.isNaN(Number(p))) return ''
  const n = Number(p) <= 1 ? Math.round(Number(p) * 100) : Math.round(Number(p))
  return ` ${n}%`
}

/**
 * 轮询 ICE 任务并 patch 回调（与 Web pollJob 一致）
 */
async function pollIceJobForBatch(localJobId, iceJobId, patchJob) {
  for (let i = 0; i < POLL_MAX; i++) {
    // eslint-disable-next-line no-await-in-loop
    const st = await videoAi.fetchIceJobStatus(iceJobId)
    if (!st.ok) {
      patchJob(localJobId, { phase: 'failed', message: st.message })
      return false
    }
    if (st.failed) {
      patchJob(localJobId, {
        phase: 'failed',
        message: st.message ? `剪辑失败：${st.message}` : `剪辑失败：${st.status}`,
      })
      return false
    }
    if (st.outputPending) {
      patchJob(localJobId, {
        phase: 'polling',
        message: st.message || '成片写入 OSS 中，请稍候…',
      })
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, POLL_MS))
      continue
    }
    if (st.done) {
      const kb =
        st.outputBytes && st.outputBytes > 0 ? `（约 ${Math.round(st.outputBytes / 1024)} KB）` : ''
      patchJob(localJobId, {
        phase: 'done',
        exportId: iceJobId,
        downloadUrl: st.downloadUrl || videoAi.iceJobDownloadUrl(iceJobId, false),
        previewUrl: st.previewUrl || videoAi.iceJobDownloadUrl(iceJobId, true),
        message: `剪辑完成${kb}，可下载成片`,
      })
      return true
    }
    patchJob(localJobId, {
      phase: 'polling',
      message: `剪辑中 ${st.status}${formatProgress(st.progress)}`,
    })
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  patchJob(localJobId, { phase: 'failed', message: '剪辑超时，请稍后重试或联系运营' })
  return false
}

module.exports = {
  newJobId,
  parseUrlLines,
  parseImageUrlLines,
  aspectById,
  generateIceEditBrief,
  pollIceJobForBatch,
  ICE_ASPECT_PRESETS,
}
