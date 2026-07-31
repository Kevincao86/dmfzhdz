/**
 * 自检：SaaS 痛点开场不得再报「结构节拍缺失：开场钩子」
 * 用法：node --import tsx scripts/shortVideoGenBrief-hook-smoke.mjs
 */
import {
  buildBriefFromInput,
  validateBriefFidelity,
} from '../src/lib/shortVideoGenBrief.ts'
import { preparePreciseVideoGeneration } from '../src/services/preparePreciseVideoGeneration.ts'

const screenshotRows = [
  {
    timeRange: '0-5秒',
    visual: '老板焦虑地切多个外卖/短视频App，镜头急推到困惑表情',
    dialogue: '一家店，抖音美团小红书，还在一个个翻？',
  },
  {
    timeRange: '5-10秒',
    visual: '切入 ERP 多平台看板 + 助手对话框卡片，界面特写、轻推进',
    dialogue: '灵祺商家 ERP：数据一屏清，助手帮你出方案。',
  },
  {
    timeRange: '10-15秒',
    visual: '老板低头微笑着向屏幕，界面定格，镜头缓缓推远',
    dialogue: '少切 App，多做生意——今天就用灵祺。',
  },
]

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

const raw = screenshotRows.map((r) => `${r.visual}\n${r.dialogue}`).join('\n')
const brief = buildBriefFromInput(raw, null)

const withRows = validateBriefFidelity(brief, { rows: screenshotRows, skill: null })
assert(withRows.ok, `分镜路径应通过，实际: ${JSON.stringify(withRows.issues)}`)
assert(
  !withRows.issues.some((x) => x.includes('开场钩子')),
  `不应报开场钩子: ${JSON.stringify(withRows.issues)}`,
)

const promptOnly = validateBriefFidelity(brief, { prompt: raw, skill: null })
assert(promptOnly.ok, `纯文案路径应通过，实际: ${JSON.stringify(promptOnly.issues)}`)
assert(
  !promptOnly.issues.some((x) => x.includes('开场钩子')),
  `纯文案不应报开场钩子: ${JSON.stringify(promptOnly.issues)}`,
)

// 旧餐饮词开场仍应识别为钩子
const localLife = validateBriefFidelity(buildBriefFromInput('门口排队冲突亮相，招牌必点，扫码到店', null), {
  prompt: '门口排队冲突亮相，招牌必点，扫码到店预约',
  skill: null,
})
assert(localLife.ok, `本地生活路径应通过: ${JSON.stringify(localLife.issues)}`)

const prep = await preparePreciseVideoGeneration({
  rawPrompt: raw,
  skillId: null,
  targetTotalSec: 15,
  segmentSec: 5,
  longform: true,
  existingRows: screenshotRows,
  optimizeGuidance: false,
})
assert(prep.ok, `prepare 门禁应放行，实际: ${JSON.stringify(prep)}`)

console.log('shortVideoGenBrief-hook-smoke: OK')
