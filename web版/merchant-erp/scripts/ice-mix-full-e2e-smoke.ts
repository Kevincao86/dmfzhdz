#!/usr/bin/env npx tsx
/**
 * 混剪全链路 E2E：本地上传 → 截帧 → AI 视觉 → 指导文案 → AI 分镜 → ICE 混剪成片
 * 默认素材：~/Downloads/街头牛排（与用户测试一致）
 *
 * 用法:
 *   cd web版/merchant-erp && npx tsx scripts/ice-mix-full-e2e-smoke.ts
 *   ICE_MIX_E2E_RUNS=2 npx tsx scripts/ice-mix-full-e2e-smoke.ts
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { mergeMerchantAiEnvWithRegistrySnapshot } from '../vite-plugins/merchantRegistryVendorEnv.js'
import { routeAiChat } from '../vite-plugins/aiGateway/chatRouter.js'
import {
  assignMixMaterialSlots,
  ensureSequentialMixScriptRows,
  type IceMixMaterialSlot,
} from '../src/lib/iceMixPlan.ts'
import {
  buildIceMixSegmentsFromSlots,
  validateMixSegmentDiversity,
} from '../src/services/iceMixProduceEngine.ts'
import type { IceMixMaterialProfile } from '../src/services/iceMixEditPlanAi.ts'
import type { ShortVideoScriptRow } from '../src/lib/shortVideoScriptTable.ts'

const VISION_FAIL_RE =
  /暂未获取|仅获得编号|尚未获取|无法看到|看不清|没有图|无图|请补充.*画面|缺少.*画面|未提供.*画面/i

function isVisionNotesUsable(notes: string): boolean {
  const t = notes.trim()
  if (t.length < 24) return false
  if (VISION_FAIL_RE.test(t)) return false
  return true
}

function resolveMixVisionNotes(profiles: IceMixMaterialProfile[], batchVisionText: string): string {
  const fromProfiles = profiles
    .filter((p) => isVisionNotesUsable(p.description))
    .map((p) => `素材${p.index + 1}：${p.description}`)
    .join('\n')
  if (isVisionNotesUsable(fromProfiles)) return fromProfiles
  const batch = batchVisionText.trim()
  if (isVisionNotesUsable(batch)) return batch
  return ''
}

const BASE = (process.env.MEOO_ERP_API_BASE ?? 'http://139.196.42.5/erp-api').replace(/\/+$/, '')
const MAT_DIR =
  process.env.ICE_MIX_E2E_MAT_DIR?.trim() ||
  path.join(os.homedir(), 'Downloads', '街头牛排')
const RUNS = Math.max(1, Number(process.env.ICE_MIX_E2E_RUNS) || 2)
const TARGET_SEC = Math.max(12, Number(process.env.ICE_MIX_E2E_TARGET_SEC) || 20)
const SEGMENT_SEC = 5
const VISION_SAMPLE_MAX = 8
const VISION_BATCH = 4

const FRAME_VISION_SYSTEM = `你是短视频素材分析师。用户会附上从实拍视频/图片截取的采样帧。
请用中文描述每张图：场景类型、可见主体（产品/门店/人物/招牌文字等）、色调氛围、可提炼的卖点线索。
必须基于图像内容描述，不要复述文件名或编号；若确实看不清内容才写「画面模糊」。
多张图时空行分隔，每段开头标注「素材N：」。不要 JSON。`

const MIX_GUIDANCE_SYSTEM = `你是本地生活/电商短视频编导，负责根据商家已上传的实拍素材，撰写「AI混剪指导文案」（中文）。
输出须覆盖：商业创意方向、核心卖点、目标受众、镜头与场景描述、叙事节奏。
要求：约 150–380 字；具体、可画面化；适合后续 AI 自动规划分镜表。
禁止：Markdown、JSON、列表编号；勿写「暂未获取画面」等推脱句。
只输出指导正文一段。`

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function jsonFetch<T>(apiPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${apiPath}`, init)
  const body = (await res.json().catch(() => null)) as T | null
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: string }).message)
        : `HTTP ${res.status}`
    throw new Error(msg)
  }
  return body as T
}

function listMaterialFiles(): string[] {
  if (!fs.existsSync(MAT_DIR)) {
    throw new Error(`素材目录不存在: ${MAT_DIR}`)
  }
  const names = fs
    .readdirSync(MAT_DIR)
    .filter((f) => /\.(mov|mp4)$/i.test(f))
    .sort()
  const explicit = process.env.ICE_MIX_E2E_FILES?.trim()
  if (explicit) {
    return explicit.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
  }
  const max = Math.max(2, Number(process.env.ICE_MIX_E2E_FILE_COUNT) || 11)
  return names.slice(0, max)
}

async function uploadVideo(fileName: string): Promise<IceMixMaterialSlot> {
  const full = path.join(MAT_DIR, fileName)
  const buf = fs.readFileSync(full)
  const ct = /\.mov$/i.test(fileName) ? 'video/quicktime' : 'video/mp4'
  const up = await jsonFetch<{
    ok: boolean
    message?: string
    timelineUrl?: string
    mediaUrl?: string
  }>('/meoo-merchant-ai-video-ice-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      contentType: ct,
      contentBase64: buf.toString('base64'),
    }),
  })
  if (!up.ok || !up.timelineUrl) {
    throw new Error(`upload ${fileName}: ${up.message ?? 'no timelineUrl'}`)
  }
  return {
    kind: 'video',
    label: fileName.replace(/\.(mov|mp4)$/i, ''),
    mediaUrl: up.timelineUrl,
    signedMediaUrl: up.mediaUrl || up.timelineUrl,
  }
}

async function extractOpeningFrame(url: string): Promise<string> {
  const fr = await jsonFetch<{ ok: boolean; message?: string; imageBase64?: string }>(
    '/meoo-merchant-ai-video-last-frame',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, frame: 'opening' }),
    },
  )
  if (!fr.ok || !fr.imageBase64 || fr.imageBase64.length < 64) {
    throw new Error(fr.message || '截帧失败')
  }
  const compact = await sharp(Buffer.from(fr.imageBase64, 'base64'))
    .resize({ width: 720, withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer()
  return compact.toString('base64')
}

function sampleMaterials(materials: IceMixMaterialSlot[], max: number): IceMixMaterialSlot[] {
  if (materials.length <= max) return [...materials]
  const out: IceMixMaterialSlot[] = []
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * materials.length) / max)
    out.push(materials[idx]!)
  }
  return out
}

async function visionOnce(
  env: Record<string, string>,
  frames: Array<{ label: string; b64: string }>,
): Promise<string> {
  const imageDataUrls = frames.map((f) => `data:image/jpeg;base64,${f.b64}`)
  const userText = frames.map((f) => f.label).join('\n')
  for (const provider of ['doubao', 'qwen'] as const) {
    try {
      const res = await routeAiChat(
        {
          provider,
          temperature: 0.35,
          imageDataUrls,
          messages: [
            { role: 'system', content: FRAME_VISION_SYSTEM },
            { role: 'user', content: userText },
          ],
        },
        env,
      )
      const text = res.content?.trim() || ''
      if (text.length >= 24) return text
    } catch {
      /* next */
    }
  }
  throw new Error('视觉模型未返回有效画面描述')
}

async function runVision(
  env: Record<string, string>,
  materials: IceMixMaterialSlot[],
): Promise<{ visionNotes: string; frameCount: number }> {
  const sampled = sampleMaterials(materials, VISION_SAMPLE_MAX)
  const frames: Array<{ index: number; label: string; b64: string }> = []
  for (let i = 0; i < sampled.length; i++) {
    const mat = sampled[i]!
    const idx = materials.indexOf(mat)
    const index = idx >= 0 ? idx : i
    console.log(`  截帧 ${i + 1}/${sampled.length}: ${mat.label}`)
    const b64 = await extractOpeningFrame(mat.mediaUrl!)
    frames.push({ index, label: `素材${index + 1}（${mat.label}）`, b64 })
  }
  const parts: string[] = []
  for (let i = 0; i < frames.length; i += VISION_BATCH) {
    const chunk = frames.slice(i, i + VISION_BATCH)
    console.log(`  AI 视觉 batch ${i / VISION_BATCH + 1}: ${chunk.length} 张`)
    parts.push(await visionOnce(env, chunk))
  }
  const batchVisionText = parts.join('\n\n')
  const profiles: IceMixMaterialProfile[] = materials.map((mat, index) => ({
    index,
    label: mat.label || `素材${index + 1}`,
    kind: mat.kind,
    description: mat.label || `实拍视频`,
    estimatedDurationSec: 6,
  }))
  const visionNotes = resolveMixVisionNotes(profiles, batchVisionText)
  if (!visionNotes || visionNotes.length < 24) {
    throw new Error('AI 未能从素材中识别有效画面内容')
  }
  return { visionNotes, frameCount: frames.length }
}

async function runGuidance(
  env: Record<string, string>,
  visionNotes: string,
  materialCount: number,
): Promise<string> {
  const userBlock = [
    `【画面理解（AI 看图）】\n${visionNotes}`,
    `【素材清单】共 ${materialCount} 个视频`,
    `\n目标成片约 ${TARGET_SEC} 秒；画幅 竖屏 9:16。`,
    '请严格根据「画面理解」撰写混剪指导文案。',
  ].join('\n')
  for (const provider of ['doubao', 'qwen'] as const) {
    try {
      const res = await routeAiChat(
        {
          provider,
          temperature: 0.65,
          messages: [
            { role: 'system', content: MIX_GUIDANCE_SYSTEM },
            { role: 'user', content: userBlock },
          ],
        },
        env,
      )
      const text = res.content?.trim() || ''
      if (text.length >= 20) return text
    } catch {
      /* next */
    }
  }
  throw new Error('AI 未返回指导文案')
}

async function runPlan(guidance: string, materialCount: number): Promise<ShortVideoScriptRow[]> {
  const plannerInput = `${guidance}\n\n【混剪素材 ${materialCount} 条】\n规划要求：时间段从 0 连续覆盖至 ${TARGET_SEC} 秒，每段 visual 与 dialogue 均须非空。`
  const plan = await jsonFetch<{
    ok: boolean
    message?: string
    scriptSegments?: Array<{ timeRange?: string; visual?: string; dialogue?: string }>
  }>('/meoo-merchant-ai-video-longform-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plannerModel: 'auto',
      targetTotalSec: TARGET_SEC,
      segmentSec: SEGMENT_SEC,
      mode: 'generate_text',
      forceAiPlanner: true,
      planStage: 'draft',
      overallPrompt: plannerInput,
    }),
  })
  if (!plan.ok || !plan.scriptSegments?.length) {
    throw new Error(plan.message || 'AI 分镜规划失败')
  }
  const rows: ShortVideoScriptRow[] = plan.scriptSegments.map((s) => ({
    timeRange: s.timeRange || '',
    visual: s.visual || '',
    dialogue: s.dialogue || '',
  }))
  const fixed = ensureSequentialMixScriptRows(rows, TARGET_SEC)
  if (fixed.length < 2) throw new Error('分镜段数不足 2')
  return fixed
}

async function runMixPipeline(
  materials: IceMixMaterialSlot[],
  rows: ShortVideoScriptRow[],
  guidance: string,
): Promise<string> {
  const slots = assignMixMaterialSlots(rows.length, materials.length)
  const segments = buildIceMixSegmentsFromSlots(rows, materials, slots, TARGET_SEC)
  const divErr = validateMixSegmentDiversity(segments, materials)
  if (divErr) throw new Error(divErr)
  if (segments.length < 2) throw new Error('混剪 segments 不足 2')

  const narration = rows.map((r) => r.dialogue.trim()).filter(Boolean).join(' ')
  const pipeline = await jsonFetch<{ ok: boolean; message?: string; jobId?: string }>(
    '/meoo-merchant-ai-video-ice-pipeline',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mixSegments: segments,
        mixNarrationText: narration || undefined,
        projectName: 'ice-mix-full-e2e-smoke',
        editBrief: `${guidance.slice(0, 200)}；多素材拼接；原素材静音，使用 ICE AI_TTS 口播讲解`,
        width: 1080,
        height: 1920,
        clipEndSec: TARGET_SEC,
        effectId: 'none',
        subtitleStyleId: 'viral-white-pop',
      }),
    },
  )
  if (!pipeline.ok || !pipeline.jobId) {
    throw new Error(pipeline.message || '提交混剪任务失败')
  }
  console.log('  混剪 jobId:', pipeline.jobId)
  for (let i = 0; i < 72; i++) {
    await sleep(5000)
    const st = await jsonFetch<{
      ok: boolean
      status?: string
      done?: boolean
      failed?: boolean
      message?: string
      downloadUrl?: string
    }>(`/meoo-merchant-ai-video-ice-job?id=${encodeURIComponent(pipeline.jobId)}`)
    console.log(`  poll ${i + 1}: ${st.status}${st.message ? ` — ${st.message.slice(0, 80)}` : ''}`)
    if (st.failed) throw new Error(st.message || 'ICE 混剪失败')
    if (st.done && st.downloadUrl) return st.downloadUrl
  }
  throw new Error('混剪轮询超时')
}

async function runOnce(runIndex: number, env: Record<string, string>): Promise<void> {
  const files = listMaterialFiles()
  console.log(`\n=== RUN ${runIndex}/${RUNS} | ${files.length} 素材 from ${MAT_DIR} ===`)
  console.log('BASE=', BASE)

  const materials: IceMixMaterialSlot[] = []
  for (const fn of files) {
    console.log(`上传: ${fn}`)
    materials.push(await uploadVideo(fn))
  }

  console.log('Step 1/4 AI 视觉识别…')
  const { visionNotes, frameCount } = await runVision(env, materials)
  console.log(`  OK vision frames=${frameCount} notes=${visionNotes.length} chars`)

  console.log('Step 2/4 AI 指导文案…')
  const guidance = await runGuidance(env, visionNotes, materials.length)
  console.log(`  OK guidance=${guidance.length} chars`)

  console.log('Step 3/4 AI 规划分镜…')
  const rows = await runPlan(guidance, materials.length)
  console.log(`  OK rows=${rows.length}`)

  console.log('Step 4/4 ICE 混剪成片…')
  const downloadUrl = await runMixPipeline(materials, rows, guidance)
  console.log(`RUN ${runIndex} OK:`, downloadUrl.slice(0, 100))
}

async function main(): Promise<void> {
  const __dir = path.dirname(fileURLToPath(import.meta.url))
  const root = path.resolve(__dir, '..')
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(root, process.env as Record<string, string>)
  for (let i = 1; i <= RUNS; i++) {
    await runOnce(i, env)
  }
  console.log(`\nOK: ${RUNS}/${RUNS} 全链路混剪 E2E 通过（上传→视觉→指导→分镜→成片）`)
}

main().catch((e) => {
  console.error('FAIL:', e instanceof Error ? e.message : e)
  process.exit(1)
})
