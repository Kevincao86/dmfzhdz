/**
 * 自检：按分镜 timeRange 出 SRT + bottom-safe 边距
 * 用法：node --import tsx scripts/shortVideoPostProcess-subtitle-smoke.mjs
 */
import { assForceStyleForSubtitle } from '../src/lib/digitalHumanPostProcessStyles.ts'
import {
  buildSrtFromScriptRows,
  SHORT_VIDEO_SUBTITLE_MAX_CHARS,
} from '../src/lib/digitalHumanSubtitle.ts'
import {
  pickShortVideoSubtitleStyleFromPrompt,
  resolveShortVideoSubtitleStyle,
  SHORT_VIDEO_SUBTITLE_STYLE_AUTO,
} from '../src/lib/shortVideoPostProcess.ts'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const rows = [
  {
    timeRange: '0-2秒',
    dialogue: '一家店，三平台数据一屏看清。',
  },
  {
    timeRange: '2-5秒',
    dialogue: '灵祺商家ERP，听懂需求帮你组出方案。',
  },
  {
    timeRange: '5-10秒',
    dialogue: '少切App，多做生意。',
  },
  {
    timeRange: '10-15秒',
    dialogue: '（无口播）',
  },
]

const srt = buildSrtFromScriptRows(rows, 15, { maxCharsPerLine: SHORT_VIDEO_SUBTITLE_MAX_CHARS })
assert(srt.trim().length > 0, 'SRT 不应为空')
assert(!srt.includes('无口播'), '末段无口播不应出现在 SRT')
assert(srt.includes('00:00:00,000 -->'), '首段应从 0s 开始')
assert(/00:00:0[02],000 --> 00:00:0[25]/.test(srt) || srt.includes('00:00:00,000 -->'), '首段时间轴异常')
assert(srt.includes('00:00:02,000') || srt.includes('00:00:02,'), `第二段应对齐 2s，实际:\n${srt}`)
assert(srt.includes('00:00:05,000') || srt.includes('00:00:05,'), `第三段应对齐 5s，实际:\n${srt}`)
// 10-15 无口播：不应出现从 10s 起的字幕块
const cueStarts = [...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) -->/g)].map((m) => m[1])
assert(
  cueStarts.every((t) => {
    const sec =
      Number(t.slice(0, 2)) * 3600 + Number(t.slice(3, 5)) * 60 + Number(t.slice(6, 8))
    return sec < 10
  }),
  `无口播段后不应有 ≥10s 字幕，实际 starts=${cueStarts.join(',')}`,
)

const style = assForceStyleForSubtitle('bottom-safe')
assert(/Alignment=2/.test(style), 'bottom-safe 须底部对齐')
assert(/MarginV=280/.test(style), `bottom-safe MarginV 应为 280，实际: ${style}`)
assert(/FontSize=14/.test(style), `bottom-safe FontSize 应为 14，实际: ${style}`)

// 折行：整句优先完整上屏（≤12 字不硬拆半截）
const short = buildSrtFromScriptRows(
  [{ timeRange: '0-3秒', dialogue: '少切App，多做生意。' }],
  3,
)
assert(short.includes('少切App，多做生意。'), `短句应整行保留:\n${short}`)

// 按提示词自动板式
assert(
  pickShortVideoSubtitleStyleFromPrompt('老板握着手机切 App，界面特写，灵祺商家ERP') === 'bottom-safe',
  'SaaS/手机应选安全区',
)
assert(
  pickShortVideoSubtitleStyleFromPrompt('夜市探店烟火气，街头门店必吃') === 'bottom-yellow',
  '探店应选黄字',
)
assert(
  pickShortVideoSubtitleStyleFromPrompt('字幕样式：电影感\n氛围大片叙事') === 'cinematic',
  '显式电影感应命中',
)
assert(
  pickShortVideoSubtitleStyleFromPrompt('限时秒杀福利满减促销') === 'bottom-green',
  '促销应选绿字',
)
const autoPick = resolveShortVideoSubtitleStyle({
  preference: SHORT_VIDEO_SUBTITLE_STYLE_AUTO,
  styleHintText: '种草好物测评安利',
})
assert(autoPick.auto && autoPick.styleId === 'bottom-pink', `种草自动粉字，实际 ${JSON.stringify(autoPick)}`)
const fixed = resolveShortVideoSubtitleStyle({
  preference: 'cinematic',
  styleHintText: '限时秒杀',
})
assert(!fixed.auto && fixed.styleId === 'cinematic', '手动板式应覆盖自动')

console.log('shortVideoPostProcess-subtitle-smoke: OK')
console.log('--- SRT sample ---\n' + srt)
