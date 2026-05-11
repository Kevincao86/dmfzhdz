#!/usr/bin/env node
/**
 * 校验 mergeRelayChatMessages 行为（与 src/lib/supportRelayChatMerge.ts 保持一致）。
 * 用法：node scripts/support-relay-merge-test.mjs
 */

function mergeRelayChatMessages(prev, rows) {
  const map = new Map()
  for (const m of prev) map.set(m.id, m)
  for (const r of rows) {
    map.set(r.client_msg_id, {
      id: r.client_msg_id,
      role: r.from_role,
      text: r.text,
      ts: r.ts,
    })
  }
  return [...map.values()].sort((a, b) =>
    a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id),
  )
}

const prev = [
  { id: 'm0', role: 'bot', text: 'hi', ts: 0 },
  { id: 'u_local', role: 'user', text: '你好', ts: 50 },
]
const rows = [
  { client_msg_id: 'u_local', from_role: 'user', text: '你好', ts: 50 },
  { client_msg_id: 'ops_1', from_role: 'ops', text: '在的', ts: 99 },
]

const merged = mergeRelayChatMessages(prev, rows)
const ids = merged.map((m) => m.id).join(',')
if (!ids.includes('ops_1')) {
  console.error('[test] 期望合并后包含 ops 消息 ops_1，实际:', ids)
  process.exit(1)
}
if (!merged.some((m) => m.role === 'ops' && m.text === '在的')) {
  console.error('[test] ops 行内容不对')
  process.exit(1)
}
console.log('[test] support-relay-merge OK')
