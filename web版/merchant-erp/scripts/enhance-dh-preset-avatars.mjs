#!/usr/bin/env node
/**
 * 万相 wanx2.1-imageedit 超分：对 staging 或 public 形象做 AI 像素修正。
 * upscale_factor=1 仅增强清晰度；=2 放大并增强（默认 1）。
 *
 * 环境变量：DASHSCOPE_API_KEY 或 MERCHANT_AI_QWEN_KEY
 *
 * 用法：
 *   node scripts/repair-dh-avatar-staging.mjs
 *   node scripts/enhance-dh-preset-avatars.mjs
 *   node scripts/normalize-dh-preset-avatars.mjs .dh-avatar-staging --map scripts/dh-avatar-frame-map.json
 *
 * 仅超分外国人（重新生成仍偏亚洲时可先 regenerate intl）：
 *   node scripts/enhance-dh-preset-avatars.mjs --intl-only
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fileToDataUri } from './dhAvatarPortrait.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const STAGING = path.join(ROOT, '.dh-avatar-staging')
const MAP_PATH = path.join(__dirname, 'dh-avatar-frame-map.json')
const CREATE_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis'
const MODEL = 'wanx2.1-imageedit'

function readApiKey() {
  return String(process.env.DASHSCOPE_API_KEY || process.env.MERCHANT_AI_QWEN_KEY || '').trim()
}

function readSpecs(argv) {
  const raw = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
  const intlOnly = argv.includes('--intl-only')
  const only = argv.filter((a) => a.startsWith('av-real-'))
  return raw.filter((row) => {
    if (intlOnly && row.nationality !== 'intl') return false
    if (only.length && !only.some((id) => row.file.startsWith(id))) return false
    return true
  })
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function createTask(apiKey, base64DataUri, upscaleFactor) {
  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: MODEL,
      input: {
        function: 'super_resolution',
        prompt: '图像超分，增强人像面部与服装细节，保持原构图与人物身份不变，商业级清晰度。',
        base_image_url: base64DataUri,
      },
      parameters: {
        upscale_factor: upscaleFactor,
        n: 1,
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.code || `create HTTP ${res.status}`)
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
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function main() {
  const apiKey = readApiKey()
  if (!apiKey) {
    console.error('请设置 DASHSCOPE_API_KEY 或 MERCHANT_AI_QWEN_KEY')
    process.exit(1)
  }
  const argv = process.argv.slice(2)
  const upscaleFactor = Number(process.env.DH_AVATAR_UPSCALE_FACTOR || '1') || 1
  const specs = readSpecs(argv)
  fs.mkdirSync(STAGING, { recursive: true })

  for (const spec of specs) {
    const dest = path.join(STAGING, spec.file)
    if (!fs.existsSync(dest)) {
      console.warn('skip missing', spec.file)
      continue
    }
    console.log(`\n==> super_resolution ${spec.file} (${spec.name}) factor=${upscaleFactor}`)
    const dataUri = fileToDataUri(dest)
    const taskId = await createTask(apiKey, dataUri, upscaleFactor)
    console.log('task:', taskId)
    const imageUrl = await pollTask(apiKey, taskId)
    const tmp = `${dest}.enh.tmp.jpg`
    await downloadTo(imageUrl, tmp)
    fs.renameSync(tmp, dest)
    console.log('saved:', dest)
    await sleep(800)
  }

  console.log('\n超分完成。请执行：')
  console.log('  node scripts/repair-dh-avatar-staging.mjs')
  console.log(`  node scripts/normalize-dh-preset-avatars.mjs ${STAGING} --map ${MAP_PATH}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
