/**
 * 探店成片 AI 违规检核冒烟：本地词扫描 + 位置解析（不依赖线上 Key）
 */
import {
  buildVideoComplianceChannelReport,
  buildVideoComplianceChannelSummary,
  findAsrPhraseMs,
  findAsrPhraseSec,
  findPhraseMsInSegments,
  formatComplianceTimeLabel,
  locatePhraseMsInSegment,
  findParagraphNoForExcerpt,
  resolveVideoHitLocations,
  splitScriptParagraphs,
} from '../src/lib/complianceHitLocations.js'
import { runRecruitmentVideoComplianceCheck } from '../src/lib/recruitmentVideoComplianceCore.js'
import { runRecruitmentScriptComplianceCheck } from '../src/lib/recruitmentScriptComplianceCore.js'

const fakeEnv = { MERCHANT_AI_DOUBAO_KEY: 'sk-smoke-invalid' }

async function main() {
  if (formatComplianceTimeLabel(5200) !== '00:05:200') {
    throw new Error(`expected 00:05:200 for 5200ms, got ${formatComplianceTimeLabel(5200)}`)
  }
  if (formatComplianceTimeLabel(5000) !== '00:05:000') {
    throw new Error(`expected 00:05:000 for 5000ms, got ${formatComplianceTimeLabel(5000)}`)
  }
  if (formatComplianceTimeLabel(12000) !== '00:12:000') {
    throw new Error(`expected 00:12:000 for 12000ms, got ${formatComplianceTimeLabel(12000)}`)
  }
  if (formatComplianceTimeLabel(2720) !== '00:02:720') {
    throw new Error(`expected 00:02:720 for 2720ms (not 00:02:72), got ${formatComplianceTimeLabel(2720)}`)
  }
  if (/:\d{2}$/.test(formatComplianceTimeLabel(2720)) && formatComplianceTimeLabel(2720).endsWith(':72')) {
    throw new Error('time label must not use 2-digit pseudo-centiseconds')
  }

  const interpolated = locatePhraseMsInSegment(
    {
      text: '大家好今天来到这家店周边门店最便宜的汉堡',
      beginMs: 320,
      endMs: 8200,
    },
    '周边门店最便宜',
  )
  if (interpolated == null || interpolated < 4000 || interpolated > 6500) {
    throw new Error(`expected interpolated ~5s, got ${interpolated}`)
  }

  const wordMs = findPhraseMsInSegments(
    [
      { text: '大家好', beginMs: 0, endMs: 1200 },
      { text: '今天', beginMs: 1200, endMs: 2200 },
      { text: '周边门店最便宜', beginMs: 5100, endMs: 6200 },
    ],
    '周边门店最便宜',
  )
  if (wordMs !== 5100) throw new Error(`expected word-level 5100ms, got ${wordMs}`)

  const reconciled = findAsrPhraseMs(
    '周边门店最便宜',
    [{ text: '大家好今天来到这家店周边门店最便宜的汉堡', beginMs: 320, endMs: 8200 }],
    '大家好今天来到这家店周边门店最便宜的汉堡',
    40,
  )
  if (reconciled == null || reconciled <= 500 || reconciled < 4000 || reconciled > 6500) {
    throw new Error(`expected reconciled ~5s (not sentence head 320ms), got ${reconciled}`)
  }

  const asrMs = findAsrPhraseMs(
    '最便宜',
    [
      { text: '今天来到这家店', beginMs: 0 },
      { text: '周边最便宜的汉堡就在这儿', beginMs: 12000 },
    ],
    '今天来到这家店周边最便宜的汉堡就在这儿',
    40,
  )
  if (asrMs !== 12000) throw new Error(`expected asr ms 12000, got ${asrMs}`)

  const asrSec = findAsrPhraseSec(
    '最便宜',
    [
      { text: '今天来到这家店', beginMs: 0 },
      { text: '周边最便宜的汉堡就在这儿', beginMs: 12000 },
    ],
    '今天来到这家店周边最便宜的汉堡就在这儿',
    40,
  )
  if (asrSec !== 12) throw new Error(`expected asr sec 12, got ${asrSec}`)

  const estimated = findAsrPhraseSec('最便宜', [], '前面正常后面周边最便宜的汉堡', 30)
  if (estimated == null || estimated < 5) {
    throw new Error(`expected estimated sec >=5, got ${estimated}`)
  }

  const locs = resolveVideoHitLocations({
    phrases: ['最便宜'],
    asrSegments: [{ text: '周边最便宜的汉堡', beginMs: 8000 }],
    asrText: '周边最便宜的汉堡',
    durationSec: 40,
  })
  if (!locs.length || locs[0]?.timeLabel !== '00:08:000') {
    throw new Error(`expected located hit at 00:08:000, got ${JSON.stringify(locs)}`)
  }

  const channelReport = buildVideoComplianceChannelReport({
    phrases: ['最便宜', '周边最便宜'],
    asrText: '前面介绍后面周边最便宜的汉堡',
    asrSegments: [],
    durationSec: 40,
    frameSlotHits: [],
  })
  const summary = buildVideoComplianceChannelSummary(channelReport)
  if (!summary.includes('口播') || summary.includes('0:00「最便宜」')) {
    throw new Error(`bad channel summary: ${summary}`)
  }
  if (!/\d{2}:\d{2}:\d{3}/.test(summary)) {
    throw new Error(`expected MM:SS:MMM timecode in summary: ${summary}`)
  }
  if (!summary.includes('字幕正常') || !summary.includes('画面正常')) {
    throw new Error(`expected subtitle/visual normal in: ${summary}`)
  }

  const paragraphs = splitScriptParagraphs('第一段正常\n\n第二段周边最便宜\n\n第三段结尾')
  const pNo = findParagraphNoForExcerpt('最便宜', paragraphs)
  if (pNo !== 2) throw new Error(`expected paragraph 2, got ${pNo}`)

  const suspect = await runRecruitmentVideoComplianceCheck(
    {
      orderTitle: '测试商单',
      recruitmentInfo: '本店全网最低价，限时秒杀保证效果',
      merchantRequirements: '口播需提及店铺',
    },
    fakeEnv,
  )
  if (!suspect.ok) throw new Error(`suspect case failed: ${suspect.message}`)
  if (suspect.verdict !== 'suspect') {
    throw new Error(`expected suspect, got ${suspect.verdict}`)
  }

  const cheapest = await runRecruitmentVideoComplianceCheck(
    {
      orderTitle: '汉堡探店',
      extraText: '【口播 ASR】\n周边最便宜的汉堡就在这家店',
    },
    fakeEnv,
  )
  if (!cheapest.ok) throw new Error(`cheapest case failed: ${cheapest.message}`)
  if (cheapest.verdict !== 'suspect') {
    throw new Error(`expected suspect for 最便宜, got ${cheapest.verdict}`)
  }

  const script = await runRecruitmentScriptComplianceCheck(
    {
      platform: '小红书',
      scriptText: '开头介绍店铺环境。\n\n这里全网最低，必须来打卡。\n\n结尾引导收藏。',
    },
    fakeEnv,
  )
  if (!script.ok) throw new Error(`script case failed: ${script.message}`)
  if (script.verdict !== 'suspect') throw new Error('expected script suspect')
  const scriptPara = script.violations?.[0]?.paragraphNo
  if (scriptPara !== 2) throw new Error(`expected script paragraph 2, got ${scriptPara}`)

  const noKey = await runRecruitmentVideoComplianceCheck({ recruitmentInfo: '普通探店文案' }, {})
  if (noKey.ok || !noKey.message.includes('未配置 AI 模型 Key')) {
    throw new Error('expected no-key error')
  }

  const empty = await runRecruitmentVideoComplianceCheck({}, fakeEnv)
  if (empty.ok || !empty.message.includes('缺少可检核')) {
    throw new Error(`expected empty-content error, got: ${empty.ok ? 'ok' : empty.message}`)
  }

  console.log('OK: recruitment video compliance smoke passed')
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e))
  process.exit(1)
})
