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

export type RecruitmentPlatform = '抖音' | '小红书' | '大众点评' | '快手' | '微信视频号'

export const RECRUITMENT_PLATFORMS: RecruitmentPlatform[] = [
  '抖音',
  '小红书',
  '大众点评',
  '快手',
  '微信视频号',
]

export function normalizeRecruitmentPlatform(raw: string | undefined): RecruitmentPlatform {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return '抖音'
  if (s.includes('红') || s === 'xiaohongshu' || s === 'xhs') return '小红书'
  if (s.includes('点评') || s.includes('大众') || s === 'dianping') return '大众点评'
  if (s.includes('快手') || s === 'kuaishou' || s === 'ks') return '快手'
  if (s.includes('视频号') || s === 'weixin_video' || s.includes('channels.weixin')) {
    return '微信视频号'
  }
  return '抖音'
}
