#!/usr/bin/env node
/**
 * 豆包 + 千问全量模型连通探测（各测 1 次）
 * 用法（轻量 ECS，须能读注册表）:
 *   cd web版/merchant-erp && npx tsx scripts/ai-vendor-full-model-probe.ts
 *   npx tsx scripts/ai-vendor-full-model-probe.ts --vendor qwen --concurrency 6
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ERP = join(__dirname, '..')

const args = process.argv.slice(2)
const vendor = String(args.find((_, i) => args[i - 1] === '--vendor') || 'all')
const concurrency = Number(args.find((_, i) => args[i - 1] === '--concurrency') || 4)
const timeoutMs = Number(args.find((_, i) => args[i - 1] === '--timeoutMs') || 12_000)

function loadStackEnv() {
  const p = process.env.AUTH_API_ENV || '/home/admin/stack/auth-api.env'
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (process.env[k] == null) process.env[k] = v
  }
}

loadStackEnv()

const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('../vite-plugins/merchantRegistryVendorEnv.js')
const { probeDoubaoAllChatModels, probeQwenAllChatModels } = await import(
  '../src/lib/aiVendorFullModelProbeCore.js'
)
const { qwenChatEndpointCandidates, qwenCompatibleChatCompletionsUrl } = await import(
  '../vite-plugins/merchantAiUpstream.js'
)

const env = await mergeMerchantAiEnvWithRegistrySnapshot(ERP, { ...process.env })
const doubaoKey = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
const qwenKey = String(env.MERCHANT_AI_QWEN_KEY || env.DASHSCOPE_API_KEY || '').trim()
const qwenChatUrl = qwenCompatibleChatCompletionsUrl(env)

function doubaoApiV3FromEnv(env: Record<string, string | undefined>): string {
  const raw = String(env.MERCHANT_AI_DOUBAO_ARK_BASE || 'https://ark.cn-beijing.volces.com/api/v3')
    .trim()
    .replace(/\/$/, '')
  if (raw.endsWith('/api/v3')) return raw
  return `${raw}/api/v3`
}

const doubaoRoot = doubaoApiV3FromEnv(env as Record<string, string | undefined>)

console.log('keys doubao=', !!doubaoKey, 'qwen=', !!qwenKey)
console.log('qwen url', qwenChatUrl)

const out: Record<string, unknown> = { at: new Date().toISOString(), vendor, concurrency, timeoutMs }

if (vendor === 'all' || vendor === 'doubao') {
  console.log('\n== 豆包：拉列表 + 逐个探测 ==')
  out.doubao = await probeDoubaoAllChatModels({
    apiKey: doubaoKey,
    apiV3Root: doubaoRoot,
    concurrency,
    perModelTimeoutMs: timeoutMs,
    onProgress: (d, t) => process.stdout.write(`\r豆包 ${d}/${t}`),
  })
  console.log('')
  const d = out.doubao as { ok: number; listed: number; workingModelIds: string[] }
  console.log(`豆包: 列表 ${d.listed} · 连通 ${d.ok}`)
  console.log('样例可用:', d.workingModelIds.slice(0, 8).join(', '))
}

if (vendor === 'all' || vendor === 'qwen') {
  console.log('\n== 千问：拉列表 + 逐个探测 ==')
  const qwenEndpoints = qwenChatEndpointCandidates(env)
  console.log('千问端点候选:', qwenEndpoints.join(' | '))
  out.qwenEndpoints = qwenEndpoints
  out.qwen = await probeQwenAllChatModels({
    apiKey: qwenKey,
    chatEndpointCandidates: qwenEndpoints,
    concurrency,
    perModelTimeoutMs: timeoutMs,
    onProgress: (d, t) => process.stdout.write(`\r千问 ${d}/${t}`),
  })
  console.log('')
  const q = out.qwen as { ok: number; listed: number; workingModelIds: string[] }
  console.log(`千问: 列表 ${q.listed} · 连通 ${q.ok}`)
  console.log('样例可用:', q.workingModelIds.slice(0, 8).join(', '))
}

const reportPath = join(ERP, 'scripts/.ai-vendor-full-model-probe-report.json')
writeFileSync(reportPath, JSON.stringify(out, null, 2))
console.log('\n报告已写入', reportPath)

const dOk = (out.doubao as { ok?: number } | undefined)?.ok ?? 0
const qOk = (out.qwen as { ok?: number } | undefined)?.ok ?? 0
if ((vendor === 'doubao' || vendor === 'all') && doubaoKey && dOk === 0) process.exit(1)
if ((vendor === 'qwen' || vendor === 'all') && qwenKey && qOk === 0) process.exit(1)
