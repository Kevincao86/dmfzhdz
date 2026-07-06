#!/usr/bin/env node
/** 探测注册表豆包 Key + 已开通模型，找首个可用的 Brief 快模型 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ERP = join(__dirname, '..')

function loadStackEnv() {
  const p = process.env.AUTH_API_ENV || '/home/admin/stack/auth-api.env'
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (process.env[k] == null) process.env[k] = v
  }
}

loadStackEnv()

const { mergeMerchantAiEnvWithRegistrySnapshot } = await import('../vite-plugins/merchantRegistryVendorEnv.js')
const { fetchArkAccountAllModelIds, sortArkChatModelsForBrief, isArkListableChatModelId } = await import(
  '../src/lib/arkAccountModelDiscovery.js'
)

const base = { ...process.env }
const env = await mergeMerchantAiEnvWithRegistrySnapshot(ERP, base)
const apiKey = String(env.MERCHANT_AI_DOUBAO_KEY || env.ARK_API_KEY || '').trim()
const qwenKey = String(env.MERCHANT_AI_QWEN_KEY || env.DASHSCOPE_API_KEY || '').trim()
console.log('doubao configured:', !!apiKey, 'qwen:', !!qwenKey)

const root = String(env.MERCHANT_AI_DOUBAO_ARK_BASE || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '')

if (apiKey) {
  const ids = await fetchArkAccountAllModelIds({ apiKey, apiV3Root: root, forceRefresh: true })
  const chat = sortArkChatModelsForBrief(ids.filter(isArkListableChatModelId))
  console.log('discovered chat', chat.length, 'top5', chat.slice(0, 5))
  for (const mid of chat.slice(0, 8)) {
    const t0 = Date.now()
    try {
      const r = await fetch(`${root}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: mid,
          messages: [{ role: 'user', content: '你好，5字内' }],
          max_tokens: 16,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(8000),
      })
      const d = await r.json().catch(() => ({}))
      const err = d?.error?.message
      const txt = d?.choices?.[0]?.message?.content
      console.log(
        mid,
        `${Date.now() - t0}ms`,
        r.status,
        err ? `ERR:${String(err).slice(0, 90)}` : `OK:${String(txt).slice(0, 30)}`,
      )
    } catch (e) {
      console.log(mid, `${Date.now() - t0}ms`, 'EXC', e instanceof Error ? e.message : String(e))
    }
  }
}

if (qwenKey) {
  const t0 = Date.now()
  const r = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${qwenKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen-flash',
      messages: [{ role: 'user', content: '你好' }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(8000),
  })
  const d = await r.json().catch(() => ({}))
  console.log(
    'qwen-flash',
    `${Date.now() - t0}ms`,
    r.status,
    d?.choices?.[0]?.message?.content || d?.error?.message || 'fail',
  )
}
