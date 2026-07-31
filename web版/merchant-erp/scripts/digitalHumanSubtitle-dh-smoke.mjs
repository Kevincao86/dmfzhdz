/**
 * 数字人：字幕 PlayRes / 分段对齐 / 空手禁实物 自检
 * 用法：node --import tsx scripts/dh-subtitle-product-smoke.mjs
 */
import { assForceStyleForSubtitle } from '../src/lib/digitalHumanPostProcessStyles.ts'
import {
  buildSrtFromTimedChunks,
  DH_SUBTITLE_MAX_CHARS,
} from '../src/lib/digitalHumanSubtitle.ts'
import { buildDhOmniHumanPrompt } from '../src/lib/digitalHumanSeedancePrompt.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const style = assForceStyleForSubtitle('bottom-safe')
assert(/PlayResX=1080/.test(style) && /PlayResY=1920/.test(style), `须声明 PlayRes: ${style}`)
assert(/Alignment=2/.test(style), 'bottom-safe 须底部对齐')
assert(/MarginV=280/.test(style), 'bottom-safe MarginV')

const srt = buildSrtFromTimedChunks(
  [
    { text: '肯德基避风塘大虾塔可，限时预售了！', durationSec: 5 },
    { text: '外层是大鸡排，个大肉厚，一口下去超满足。', durationSec: 6 },
    { text: '现在下单还有优惠，赶紧冲。', durationSec: 4 },
  ],
  { maxCharsPerLine: DH_SUBTITLE_MAX_CHARS, totalDurationSec: 15 },
)
assert(srt.includes('00:00:00,000'), `应从 0s 开始:\n${srt}`)
assert(srt.includes('00:00:05,') || srt.includes('00:00:05,'), `第二段应对齐约 5s:\n${srt}`)
assert(!/个大肉厚，一口下$/.test(srt.split('\n').find((l) => l.includes('肉厚')) || ''), 'ok')
// 不应再出现极短残句单独成行（如仅「下。」）
const lines = srt
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^\d+$/.test(l) && !l.includes('-->'))
assert(
  lines.every((l) => l.replace(/[，。！？；、…\s]/g, '').length >= 3 || l.length <= 2),
  `不应有过短残句: ${JSON.stringify(lines)}`,
)

const draft = {
  background: 'studio',
  frameMode: 'half',
  outfit: '休闲',
  gesturePreset: 'emphasis',
  motionInstructions: '',
}
const noProductPrompt = buildDhOmniHumanPrompt(draft, {
  motionText: '双手比划塔可外形，强调大虾',
  scriptHint: '肯德基避风塘大虾塔可限时预售',
  hasProductFusion: false,
})
assert(/禁止凭空手持/.test(noProductPrompt), `须禁实物道具: ${noProductPrompt}`)
assert(/肯德基|塔可|大虾/.test(noProductPrompt), `须带口播主题: ${noProductPrompt}`)
assert(!/自然手持参考图中的产品/.test(noProductPrompt), '未开融合不应要求手持产品图')

const withProduct = buildDhOmniHumanPrompt(draft, {
  scriptHint: '面霜试用',
  hasProductFusion: true,
})
assert(/自然手持参考图中的产品/.test(withProduct), '开启融合应要求手持产品')

console.log('digitalHumanSubtitle-dh-smoke: OK')
console.log('--- style ---\n' + style)
console.log('--- srt ---\n' + srt)
