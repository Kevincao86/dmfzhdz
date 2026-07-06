#!/usr/bin/env node
/**
 * 爆款 Brief 生文冒烟：连续 N 次 operation_article，校验 ok + 耗时 ≤ maxSec。
 * 用法（轻量本机）:
 *   node scripts/brief-operation-article-smoke.mjs --count 20 --max-sec 10
 *   BASE_URL=http://127.0.0.1:3001 node scripts/brief-operation-article-smoke.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ERP = join(__dirname, '..')

function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v
  }
}

loadEnvFile(join(ERP, '.env'))
loadEnvFile(join(ERP, '.env.local'))

const args = process.argv.slice(2)
const count = Number(args.find((a, i) => args[i - 1] === '--count') || 20)
const maxSec = Number(args.find((a, i) => args[i - 1] === '--max-sec') || 10)
const base = (process.env.BASE_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const url = `${base}/api/meoo-douyin-goods-ai-assist`

const briefPrompt = [
  '【输出格式强制】你只输出一个合法 JSON 对象，禁止 Markdown。',
  '你是抖音爆款内容总监。风格：氛围出片感。',
  '输出 JSON：{"hooks":["钩子1"],"titles":["标题1"],"structure":[{"scene":"开场","visual":"全景","voice":"口播"}],"mustMention":["卖点"],"forbidden":[],"topics":["#话题"],"roles":{"talent":"达人"},"checklist":["自检"]}',
  '【订单】北京潮流街舞活动探店，强调周末氛围与出片点位。',
].join('\n')

const body = {
  model: 'doubao',
  action: 'operation_article',
  product_name: '爆款Brief｜抖音｜北京上德银泰城街舞活动',
  title_draft: briefPrompt,
}

let okN = 0
const times = []
const errors = []

for (let i = 1; i <= count; i++) {
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    const ms = Date.now() - t0
    times.push(ms)
    if (!res.ok || data.ok === false) {
      const msg = String(data.message || data.error || `HTTP ${res.status}`)
      errors.push({ i, ms, msg })
      console.log(`FAIL #${i} ${ms}ms — ${msg.slice(0, 120)}`)
      continue
    }
    const text = String(data.description || '').trim()
    if (text.length < 80) {
      errors.push({ i, ms, msg: `输出过短(${text.length})` })
      console.log(`FAIL #${i} ${ms}ms — 输出过短`)
      continue
    }
    okN++
    const vendor = data.ai_vendor_used ? ` [${data.ai_vendor_used}]` : ''
    console.log(`OK   #${i} ${ms}ms${vendor} len=${text.length}`)
  } catch (e) {
    const ms = Date.now() - t0
    times.push(ms)
    const msg = e instanceof Error ? e.message : String(e)
    errors.push({ i, ms, msg })
    console.log(`FAIL #${i} ${ms}ms — ${msg}`)
  }
}

const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
const p95 = times.length ? times.sort((a, b) => a - b)[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)] : 0
const maxMs = times.length ? Math.max(...times) : 0
const slow = times.filter((t) => t > maxSec * 1000).length

console.log('')
console.log(`结果: ${okN}/${count} 成功 | 平均 ${avg}ms | P95 ${p95}ms | 最大 ${maxMs}ms | 超 ${maxSec}s: ${slow} 次`)
if (errors.length) {
  console.log('失败样例:')
  for (const e of errors.slice(0, 5)) {
    console.log(`  #${e.i} ${e.ms}ms — ${e.msg.slice(0, 160)}`)
  }
}

if (okN < count || slow > 0) {
  process.exit(1)
}
process.exit(0)
