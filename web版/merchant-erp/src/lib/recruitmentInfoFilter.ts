/** 达人可见招募说明：商家内部预算 / 档位单价 / AI 方案等不得出现 */
const TALENT_FACING_PRICE_LEAK_RE =
  /【AI招募方案】|费用模式|总预算|参考单价|一口价|城市档位参考价|档位参考价|预估总成本|人均约|分配来源|达人库测算|离线估算/

export function isTalentFacingRecruitmentPriceLeak(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return false
  if (/车马费/.test(t) && (/V[345]/.test(t) || /每人固定|报名即按此价/.test(t))) return false
  if (/区间估算|以实际报价为准|成本带|档位参考价|城市档位/.test(t)) return true
  if (/达人库均价|库内\d+人|城市参考/.test(t)) return true
  if (/V[345]\+?/.test(t) && /\d+\s*[–\-~至到]\s*\d+/.test(t)) return true
  if (/【AI招募方案】/.test(t)) return true
  if (/费用模式|参考单价|一口价|分配来源/.test(t)) return true
  if (/预算/.test(t) && /[¥￥\d]/.test(t)) return true
  if (/佣金/.test(t) && /\d/.test(t)) return true
  if (/预估总成本|预计总成本|人均约/.test(t)) return true
  if (/[¥￥]/.test(t) && /单价|预算|成本|佣金|档位/.test(t) && !/车马费/.test(t)) return true
  if (/^档位[:：]/.test(t) && /V[345]/.test(t) && !/车马费/.test(t)) return true
  if (TALENT_FACING_PRICE_LEAK_RE.test(t) && /[¥￥\d]/.test(t) && !/车马费/.test(t)) return true
  return false
}

/** 智能体 infoSummary 把 Brief 正文接在「Brief:」后，达人侧只取 Brief */
export function pickTalentFacingBriefFromSummary(summary: string): string {
  const s = String(summary || '')
  const m = s.match(/Brief[:：]\s*([\s\S]+)/i)
  return (m?.[1] || s).trim()
}

/** 发布到星选前清洗招募说明：去掉 AI 方案块、预算/佣金/档位单价行 */
export function stripTalentFacingRecruitmentCopy(text: string): string {
  let s = String(text || '')
  s = s.replace(/【AI招募方案】[\s\S]*?(?=\n【[^\n]*】|$)/g, '')
  const lines: string[] = []
  let skipAiBlock = false
  for (const raw of s.split(/\n/)) {
    const t = raw.trim()
    if (/【AI招募方案】/.test(t)) {
      skipAiBlock = true
      continue
    }
    if (skipAiBlock) {
      if (/^【/.test(t) && !/AI招募/.test(t)) skipAiBlock = false
      else continue
    }
    if (!skipAiBlock) {
      const kept = raw
        .split(/[；;]/)
        .map((p) => p.trim())
        .filter((p) => p && !isTalentFacingRecruitmentPriceLeak(p))
      if (kept.length) lines.push(kept.join('；'))
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 招募信息 / 任务详情展示时排除的片段 */
export function shouldExcludeRecruitmentSegment(text: string): boolean {
  const t = String(text || '').trim()
  if (!t) return true
  if (/^(模式|Brief|brief|预算金额)[:：]/i.test(t)) return true
  if (/^(模式|Brief|brief|预算|桌数)[:：]/i.test(t)) return true
  if (/^预算[¥￥]?/i.test(t)) return true
  if (/^预算/i.test(t) && /[¥￥\d/]/.test(t)) return true
  if (/^桌数/.test(t)) return true
  if (/^【[^】]*AI[^】]*】/.test(t) && /模式|Brief|预算|桌数/.test(t)) return true
  return false
}

export function shouldShowRecruitmentInfoLine(line: string): boolean {
  return !shouldExcludeRecruitmentSegment(line)
}

export function explodeAndFilterDisplayLines(text: string): string[] {
  return String(text || '')
    .split(/[\n\r；;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !shouldExcludeRecruitmentSegment(s))
}

export function filterRecruitmentInfoLines(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => shouldShowRecruitmentInfoLine(l))
}

export function filterRecruitmentInfoText(text: string): string {
  return explodeAndFilterDisplayLines(text).join('\n')
}

export function filterTaskDetailText(text: string): string {
  return explodeAndFilterDisplayLines(text).join('\n')
}

export type RecruitmentPlatform = import('./recruitmentPlatformOptions').RecruitmentPlatform

export const RECRUITMENT_PLATFORMS: RecruitmentPlatform[] = [
  '抖音',
  '小红书',
  '大众点评',
  '快手',
  '微信视频号',
]

export { normalizeRecruitmentPlatform } from './recruitmentPlatformOptions'
