/** 与 CS shortVideoScriptTable 核心对齐（竖屏分镜） */
const SHORT_VIDEO_SEEDANCE_NATIVE_AV_SUFFIX =
  '【原生有声】请同步生成与口播一致的中文语音，并在画面底部安全区显示对应中文字幕。'
const SHORT_VIDEO_STRICT_VISUAL_SUFFIX =
  '【执行要求】严格按【画面】描述生成镜头与运镜，不得偏离场景/主体；同步生成中文口播语音；底部安全区中文字幕与口播一致，禁止乱码。'
const SCRIPT_ROW_MAX_COUNT = 12

function sanitizePromptForSeedanceNativeAv(text) {
  let t = String(text || '').trim()
  if (!t) return SHORT_VIDEO_SEEDANCE_NATIVE_AV_SUFFIX
  if (t.length > 480) t = t.slice(0, 480)
  if (!/原生有声|中文口播|字幕/.test(t)) t = `${t}\n${SHORT_VIDEO_SEEDANCE_NATIVE_AV_SUFFIX}`
  return t
}

function formatDialogueForSeedanceSpeech(dialogue) {
  return String(dialogue || '')
    .replace(/\s+/g, ' ')
    .replace(/[「」『』""]/g, '')
    .trim()
}

function buildVideoPromptFromScriptRow(row) {
  const time = String((row && row.timeRange) || '').trim()
  const visual = String((row && row.visual) || '').trim()
  const spoken = formatDialogueForSeedanceSpeech((row && row.dialogue) || '')
  if (!visual && !time && !spoken) return ''
  const parts = []
  if (time) parts.push(`【时段】${time}`)
  if (visual) parts.push(`【画面】${visual}`)
  if (spoken) {
    parts.push(`【口播对白】角色说：${spoken}`)
    parts.push(`【字幕】底部显示：${spoken}`)
  }
  const body = `${parts.join('\n')}\n${SHORT_VIDEO_SEEDANCE_NATIVE_AV_SUFFIX}\n${SHORT_VIDEO_STRICT_VISUAL_SUFFIX}`
  return sanitizePromptForSeedanceNativeAv(body)
}

function buildPlanFromScriptRows(rows, targetN) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length < 2) return null
  const n = Math.min(SCRIPT_ROW_MAX_COUNT, Math.max(2, Number(targetN) || list.length))
  const sliced = list.slice(0, n)
  while (sliced.length < n && sliced.length > 0) sliced.push({ ...sliced[sliced.length - 1] })
  const prompts = sliced.map(buildVideoPromptFromScriptRow).filter((p) => p.length > 0)
  if (prompts.length < 2) return null
  const narrationScript = sliced
    .map((r) => String(r.dialogue || '').trim())
    .filter(Boolean)
    .join('。')
    .replace(/。+/g, '。')
  return { prompts, narrationScript }
}

function defaultScriptRows(count, segmentSec) {
  const n = Math.min(SCRIPT_ROW_MAX_COUNT, Math.max(1, count || 2))
  const seg = Math.min(15, Math.max(2, Math.round(segmentSec) || 5))
  return Array.from({ length: n }, (_, i) => ({
    timeRange: `${i * seg}-${(i + 1) * seg}秒`,
    visual: '',
    dialogue: '',
    _id: `r-${Date.now()}-${i}`,
  }))
}

function maxScriptTimeRangeEndSec(rows) {
  let max = 0
  for (const r of rows || []) {
    const m = String(r.timeRange || '').match(/(\d+)\s*[-~～到至]\s*(\d+)/)
    if (m) max = Math.max(max, Number(m[2]) || 0)
  }
  return max
}

function appendEmptyScriptRow(rows, segmentSec) {
  const list = Array.isArray(rows) ? rows.slice() : []
  if (list.length >= SCRIPT_ROW_MAX_COUNT) return list
  const seg = Math.min(15, Math.max(2, Math.round(segmentSec) || 5))
  let start = maxScriptTimeRangeEndSec(list)
  if (start <= 0 && list.length > 0) start = list.length * seg
  list.push({
    timeRange: `${start}-${start + seg}秒`,
    visual: '',
    dialogue: '',
    _id: `r-${Date.now()}-${list.length}`,
  })
  return list
}

function removeScriptRowAt(rows, index, minRows) {
  const floor = Math.max(1, Math.min(SCRIPT_ROW_MAX_COUNT, Math.floor(minRows) || 1))
  const list = Array.isArray(rows) ? rows.slice() : []
  if (list.length <= floor) return list
  if (!Number.isFinite(index) || index < 0 || index >= list.length) return list
  list.splice(index, 1)
  return list
}

function moveScriptRow(rows, from, to) {
  const list = Array.isArray(rows) ? rows.slice() : []
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return list
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  return list
}

function resizeScriptRows(rows, count, segmentSec) {
  const effectiveCount = Math.min(12, Math.max(2, count))
  const seg = Math.min(15, Math.max(2, Math.round(segmentSec) || 5))
  const base = (rows || []).slice(0, effectiveCount)
  while (base.length < effectiveCount) {
    const i = base.length
    base.push({
      timeRange: `${i * seg}-${(i + 1) * seg}秒`,
      visual: '',
      dialogue: '',
      _id: `r-${Date.now()}-${i}`,
    })
  }
  return base.map((r, i) => ({
    ...r,
    timeRange: String(r.timeRange || '').trim() || `${i * seg}-${(i + 1) * seg}秒`,
    _id: r._id || `r-${i}`,
  }))
}

function isScriptRowsUsable(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (list.length < 2) return false
  return list.every((r) => String(r.visual || '').trim().length >= 2)
}

function promptsFromLongformPlan(prompts) {
  return (prompts || []).map((p, i) => ({
    timeRange: `${i * 5}-${(i + 1) * 5}秒`,
    visual: String(p || '').slice(0, 120),
    dialogue: '',
    _id: `r-plan-${Date.now()}-${i}`,
  }))
}

module.exports = {
  SCRIPT_ROW_MAX_COUNT,
  SHORT_VIDEO_SEEDANCE_NATIVE_AV_SUFFIX,
  sanitizePromptForSeedanceNativeAv,
  buildVideoPromptFromScriptRow,
  buildPlanFromScriptRows,
  defaultScriptRows,
  appendEmptyScriptRow,
  removeScriptRowAt,
  moveScriptRow,
  resizeScriptRows,
  isScriptRowsUsable,
  promptsFromLongformPlan,
}
