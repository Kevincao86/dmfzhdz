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

export function normalizeRecruitmentPlatform(raw: string | undefined): '抖音' | '小红书' {
  const s = String(raw || '').trim()
  if (s.includes('红')) return '小红书'
  return '抖音'
}
