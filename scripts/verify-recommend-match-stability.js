#!/usr/bin/env node
/** 推荐大厅：去重 + 切换标签竞态模拟（20 轮） */

function dedupeTalentRows(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows || []) {
    if (!r) continue
    const id = String(r.id || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(r)
  }
  return out
}

async function runFilter(tokenRef, token, assign) {
  await new Promise((r) => setTimeout(r, Math.random() * 8))
  if (token !== tokenRef.v) return false
  assign()
  return true
}

async function simulateTabSwitch(rounds) {
  const tokenRef = { v: 0 }
  let displayRows = []
  let failures = 0

  for (let i = 0; i < rounds; i += 1) {
    tokenRef.v += 1
    displayRows = []
    const token = tokenRef.v

    const jobs = [
      runFilter(tokenRef, token - 1, () => {
        displayRows = [{ id: 'stale', name: '脏数据', matchScore: 99 }]
      }),
      runFilter(tokenRef, token, () => {
        const pool = [
          { id: 'a', name: '星雨', matchScore: 68 },
          { id: 'b', name: '奶盐小兔', matchScore: 72 },
          { id: 'b', name: '奶盐小兔重复', matchScore: 0 },
          { id: 'c', name: '小天来了', matchScore: 65 },
        ]
        displayRows = dedupeTalentRows(pool.filter((r) => (r.matchScore || 0) >= 60))
      }),
    ]
    await Promise.all(jobs)

    if (displayRows.length !== 3) failures += 1
    if (displayRows.some((r) => r.id === 'stale')) failures += 1
    if (displayRows.some((r) => !r.matchScore)) failures += 1
    if (new Set(displayRows.map((r) => r.id)).size !== displayRows.length) failures += 1
  }

  return failures
}

;(async () => {
  const dup = dedupeTalentRows([
    { id: 'x', name: '1' },
    { id: 'x', name: '2' },
    { id: 'y', name: '3' },
  ])
  let failed = dup.length === 2 && dup[0].name === '1' ? 0 : 1
  if (failed) console.log('FAIL dedupe basic')

  const raceFails = await simulateTabSwitch(20)
  failed += raceFails
  console.log(`${failed ? 'FAIL' : 'OK'} tab-switch race x20 (${raceFails} issues)`)
  process.exit(failed ? 1 : 0)
})()
