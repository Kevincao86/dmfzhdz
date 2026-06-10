#!/usr/bin/env node
/**
 * 修复「运营台仍显示收集中、但大厅不可见」的招募单：延长报名截止并回写 deadline 字段。
 * ECS: ORDER_ID=MP-ICE-xxx EXTEND_DAYS=14 node scripts/ecs-repair-mp-hall-order-deadline.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ORDER_ID = String(process.env.ORDER_ID || '').trim()
const EXTEND_DAYS = Math.max(1, Number.parseInt(String(process.env.EXTEND_DAYS || '14'), 10) || 14)
if (!ORDER_ID) {
  console.error('用法: ORDER_ID=MP-ICE-xxx EXTEND_DAYS=14 node scripts/ecs-repair-mp-hall-order-deadline.mjs')
  process.exit(1)
}

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      const k = m[1]
      if (process.env[k]) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      process.env[k] = v
    }
  } catch {
    /* optional */
  }
}

const root = resolve(process.cwd())
loadEnvFile(resolve(root, 'web版/merchant-erp/.env'))
loadEnvFile(resolve(root, '.env'))

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '')
const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl || !serviceRole) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

function parseTs(text) {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary, key) {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

function resolveDeadlineMs(mp) {
  const meta = mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const summary = [mp.recruitmentInfo, mp.taskDetail, mp.merchantRequirements].filter(Boolean).join('\n')
  const fromField =
    parseTs(mp.deadline) ||
    parseTs(meta?.signupDeadline) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
  if (fromField > 0) return fromField
  const pub = parseTs(mp.createdAt || mp.updatedAt)
  if (mp.urgent && pub > 0) return pub + 86400000
  return pub > 0 ? pub + 7 * 86400000 : 0
}

function effectiveStatus(mp, nowMs = Date.now()) {
  let raw = String(mp.status || 'open').trim() || 'open'
  if (raw === 'pending_settlement') return 'done'
  if (raw === 'closed' || raw === 'done') return raw
  const deadlineMs = resolveDeadlineMs(mp)
  if (deadlineMs > 0 && nowMs >= deadlineMs && raw !== 'collecting') return 'done'
  return raw
}

function formatDeadline(ms) {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
}

function patchDeadlineInText(text, nextDeadline) {
  const src = String(text || '')
  if (!src.trim()) return `报名截止：${nextDeadline}`
  if (/报名截止[:：]/.test(src)) {
    return src.replace(/报名截止[:：][^；;\n]+/, `报名截止：${nextDeadline}`)
  }
  return `${src}\n报名截止：${nextDeadline}`
}

const snapUrl = `${supabaseUrl}/rest/v1/ops_registry_snapshot?id=eq.1&select=registry`
const snapRes = await fetch(snapUrl, {
  headers: {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    Accept: 'application/json',
  },
})
const snapText = await snapRes.text()
if (!snapRes.ok) {
  console.error('读取注册表失败:', snapText.slice(0, 300))
  process.exit(1)
}
const rows = JSON.parse(snapText || '[]')
const registry = rows[0]?.registry
if (!registry || typeof registry !== 'object') {
  console.error('注册表为空')
  process.exit(1)
}
const list = Array.isArray(registry.mpRecruitmentOrders) ? registry.mpRecruitmentOrders : []
const idx = list.findIndex((o) => o && String(o.id) === ORDER_ID)
if (idx < 0) {
  console.error(`未找到订单 ${ORDER_ID}`)
  process.exit(1)
}
const mp = list[idx]
const beforeEff = effectiveStatus(mp)
const beforeDeadline = resolveDeadlineMs(mp)
const nextDeadlineMs = Date.now() + EXTEND_DAYS * 86400000
const nextDeadline = formatDeadline(nextDeadlineMs)

mp.deadline = nextDeadline
mp.updatedAt = new Date().toLocaleString('zh-CN', { hour12: false })
if (mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object') {
  mp.mpPublishMeta = { ...mp.mpPublishMeta, signupDeadline: nextDeadline }
} else {
  mp.mpPublishMeta = { signupDeadline: nextDeadline }
}
for (const key of ['merchantRequirements', 'recruitmentInfo', 'taskDetail']) {
  if (typeof mp[key] === 'string' && mp[key].trim()) {
    mp[key] = patchDeadlineInText(mp[key], nextDeadline)
  }
}
if (mp.status === 'done') {
  const applicants = Array.isArray(mp.applicants) ? mp.applicants.length : 0
  mp.status = applicants > 0 ? 'collecting' : 'open'
}

const afterEff = effectiveStatus(mp)
const body = JSON.stringify({
  id: 1,
  registry,
  updated_at: new Date().toISOString(),
})
const saveRes = await fetch(`${supabaseUrl}/rest/v1/ops_registry_snapshot`, {
  method: 'POST',
  headers: {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body,
})
const saveText = await saveRes.text()
if (!saveRes.ok) {
  console.error('保存失败:', saveText.slice(0, 300))
  process.exit(1)
}

console.log('OK', {
  orderId: ORDER_ID,
  rawStatus: mp.status,
  effectiveBefore: beforeEff,
  effectiveAfter: afterEff,
  deadlineBefore: beforeDeadline ? formatDeadline(beforeDeadline) : '—',
  deadlineAfter: nextDeadline,
  hallVisible: afterEff === 'open' || afterEff === 'collecting',
})
