#!/usr/bin/env npx tsx
import { buildDhSeedanceSegmentPrompt, chunkScriptForSeedanceVideo } from '../src/lib/digitalHumanSeedancePrompt.ts'
import { defaultDraft } from '../src/lib/digitalHumanBroadcast.ts'
import { SEEDANCE_I2V_MAX_CONTENT_TEXT } from '../src/lib/shortVideoNarrationExtract.ts'

const script = '肯德基蛋挞现在预售中！外酥里嫩，奶香十足，真的超好吃，快来抢购。'
const draft = defaultDraft()
draft.script = script
draft.motionInstructions = '自然微笑，向镜头介绍产品，轻微手势强调'
draft.background = 'store'
draft.storeScene = '餐饮门店'

const chunks = chunkScriptForSeedanceVideo(script)
if (!chunks.length) {
  console.error('FAIL: no chunks')
  process.exit(1)
}

for (let i = 0; i < Math.max(chunks.length, 3); i++) {
  const p = buildDhSeedanceSegmentPrompt(draft, chunks[i] ?? chunks[0]!, {
    segmentIndex: i,
    segmentTotal: Math.max(chunks.length, 3),
    continuation: i > 0,
    hasProductFusion: i === 1,
  })
  if (p.length > SEEDANCE_I2V_MAX_CONTENT_TEXT) {
    console.error(`FAIL: seg ${i + 1} len ${p.length} > ${SEEDANCE_I2V_MAX_CONTENT_TEXT}`)
    console.error(p)
    process.exit(1)
  }
  if (/--(?:dur|fps|ratio|wm)\s/i.test(p)) {
    console.error(`FAIL: seg ${i + 1} contains inline CLI flags`)
    process.exit(1)
  }
  if ((p.match(/【/g) ?? []).length !== (p.match(/】/g) ?? []).length) {
    console.error(`FAIL: seg ${i + 1} unbalanced brackets`)
    process.exit(1)
  }
  if (p.length < 20) {
    console.error(`FAIL: seg ${i + 1} too short`)
    process.exit(1)
  }
}

console.log('OK: digital human seedance prompts compact', {
  chunks: chunks.length,
  maxLen: SEEDANCE_I2V_MAX_CONTENT_TEXT,
  sampleLen: buildDhSeedanceSegmentPrompt(draft, chunks[0]!, { segmentTotal: chunks.length }).length,
})
