#!/usr/bin/env node
/**
 * AI 批量生成数字人预置形象（通义万相 wan2.2-t2i-flash，9:16 竖版）。
 * 生成后写入 .dh-avatar-staging/，再执行 normalize 脚本输出到 public。
 *
 * 环境变量（任选其一）：
 *   DASHSCOPE_API_KEY / MERCHANT_AI_QWEN_KEY
 *
 * 用法：
 *   cd web版/merchant-erp
 *   export DASHSCOPE_API_KEY=sk-...
 *   node scripts/generate-dh-preset-avatars.mjs
 *   node scripts/normalize-dh-preset-avatars.mjs .dh-avatar-staging --map scripts/dh-avatar-frame-map.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING = path.join(ROOT, '.dh-avatar-staging')
const MAP_PATH = path.join(__dirname, 'dh-avatar-frame-map.json')
const MODEL = 'wan2.2-t2i-flash'
const CREATE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'

/** 12 个真人形象：半身/全身 × 中国人/外国人 */
const SPECS = [
  { file: 'av-real-1.jpg', name: '晓晨', gender: '男', bodyFrame: 'half', nationality: 'cn', persona: '商务正装讲解员' },
  { file: 'av-real-2.jpg', name: '悦然', gender: '女', bodyFrame: 'half', nationality: 'cn', persona: '亲和门店主播' },
  { file: 'av-real-3.jpg', name: '明哲', gender: '男', bodyFrame: 'half', nationality: 'cn', persona: '新闻播报员' },
  { file: 'av-real-4.jpg', name: '诗涵', gender: '女', bodyFrame: 'half', nationality: 'intl', persona: '欧美种草博主' },
  { file: 'av-real-5.jpg', name: '俊杰', gender: '男', bodyFrame: 'half', nationality: 'intl', persona: '阳光外籍男主播' },
  { file: 'av-real-6.jpg', name: '婉清', gender: '女', bodyFrame: 'half', nationality: 'intl', persona: '外籍门店店长' },
  { file: 'av-real-7.jpg', name: '浩然', gender: '男', bodyFrame: 'full', nationality: 'cn', persona: '沉稳全身讲解员' },
  { file: 'av-real-8.jpg', name: '思琪', gender: '女', bodyFrame: 'full', nationality: 'cn', persona: '活力全身带货主播' },
  { file: 'av-real-9.jpg', name: '子墨', gender: '男', bodyFrame: 'full', nationality: 'cn', persona: '探店全身 Vlog 博主' },
  { file: 'av-real-10.jpg', name: '静雯', gender: '女', bodyFrame: 'full', nationality: 'intl', persona: '温柔外籍客服' },
  { file: 'av-real-11.jpg', name: '嘉伟', gender: '男', bodyFrame: 'full', nationality: 'intl', persona: '外籍团购带货主持' },
  { file: 'av-real-12.jpg', name: '雨桐', gender: '女', bodyFrame: 'full', nationality: 'intl', persona: '外籍美妆护肤达人' },
]

function buildPrompt(spec) {
  const ethnicity =
    spec.nationality === 'cn'
      ? 'Chinese East Asian appearance'
      : 'Western European or American appearance, non-Asian facial features'
  const framing =
    spec.bodyFrame === 'full'
      ? 'full-body standing portrait from head to feet, complete figure visible, feet on ground'
      : 'half-body bust portrait from waist up, upper body only, no legs visible'
  return [
    `Professional studio photo of a ${spec.gender === '男' ? 'male' : 'female'} digital human presenter, ${ethnicity}.`,
    `${framing}.`,
    `Role: ${spec.persona}.`,
    'Facing camera, natural smile, soft studio lighting, clean light gray background.',
    'Photorealistic, ultra sharp, high detail skin and clothing, commercial spokesperson quality.',
    'Vertical 9:16 composition, no text, no watermark, no phone, no logo.',
  ].join(' ')
}

function readApiKey() {
  return String(process.env.DASHSCOPE_API_KEY || process.env.MERCHANT_AI_QWEN_KEY || '').trim()
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function createTask(apiKey, prompt) {
  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: MODEL,
      input: { prompt },
      parameters: {
        size: '720*1280',
        n: 1,
        style: '<auto>',
        negative_prompt:
          'blurry, lowres, watermark, text, logo, cropped head, cut off feet, multiple people, cartoon, anime, distorted face, extra fingers, horizontal layout, landscape orientation, letterboxing, black bars',
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.message || data.code || `create failed HTTP ${res.status}`)
  }
  const taskId = data.output?.task_id
  if (!taskId) throw new Error(`no task_id: ${JSON.stringify(data).slice(0, 240)}`)
  return taskId
}

async function pollTask(apiKey, taskId) {
  const url = `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`
  for (let i = 0; i < 80; i++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || `poll HTTP ${res.status}`)
    const status = String(data.output?.task_status || '')
    if (status === 'SUCCEEDED') {
      const url0 = data.output?.results?.[0]?.url
      if (!url0) throw new Error('task succeeded but no image url')
      return url0
    }
    if (status === 'FAILED' || status === 'UNKNOWN') {
      throw new Error(data.output?.message || data.message || 'task failed')
    }
    await sleep(i < 18 ? 900 : 1500)
  }
  throw new Error('poll timeout')
}

async function downloadTo(url, dest) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(dest, buf)
}

/** 万相偶发返回横图；统一裁成竖版再进 staging */
async function ensurePortraitStagingFile(sharp, dest) {
  const meta = await sharp(dest).metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  if (w <= 0 || h <= 0) throw new Error('invalid image dimensions')
  if (h >= w * 1.05) return
  const tmp = `${dest}.tmp.jpg`
  await sharp(dest)
    .resize(1080, 1920, { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 95, mozjpeg: true })
    .toFile(tmp)
  fs.renameSync(tmp, dest)
}

async function main() {
  const apiKey = readApiKey()
  if (!apiKey) {
    console.error('请设置 DASHSCOPE_API_KEY 或 MERCHANT_AI_QWEN_KEY')
    process.exit(1)
  }
  const only = process.argv.slice(2).filter((a) => a.startsWith('av-real-'))
  const list = only.length ? SPECS.filter((s) => only.includes(s.file.replace('.jpg', '')) || only.includes(s.file)) : SPECS

  fs.mkdirSync(STAGING, { recursive: true })
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  fs.writeFileSync(
    MAP_PATH,
    JSON.stringify(
      SPECS.map((s) => ({ file: s.file, bodyFrame: s.bodyFrame, nationality: s.nationality, name: s.name })),
      null,
      2,
    ),
  )

  for (const spec of list) {
    const dest = path.join(STAGING, spec.file)
    if (fs.existsSync(dest) && process.env.DH_AVATAR_SKIP_EXISTING === '1') {
      console.log(`skip existing ${spec.file}`)
      continue
    }
    console.log(`\n==> ${spec.file} ${spec.name} (${spec.bodyFrame}/${spec.nationality})`)
    const prompt = buildPrompt(spec)
    const taskId = await createTask(apiKey, prompt)
    console.log('task:', taskId)
    const imageUrl = await pollTask(apiKey, taskId)
    await downloadTo(imageUrl, dest)
    await ensurePortraitStagingFile(sharp, dest)
    console.log('saved:', dest)
    await sleep(1200)
  }

  console.log('\n生成完成。请执行：')
  console.log(`  node scripts/normalize-dh-preset-avatars.mjs ${STAGING} --map ${MAP_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
