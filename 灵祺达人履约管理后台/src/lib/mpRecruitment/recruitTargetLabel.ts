/** 分享文案 / 招募详情：talent/shoot/edit → 中文 */
export function recruitTargetLabel(target: string | undefined | null): string {
  const raw = String(target || '').trim()
  if (!raw) return '达人'
  const t = raw.toLowerCase()
  if (t === 'shoot' || raw === '拍摄') return '拍摄'
  if (t === 'edit' || raw === '剪辑') return '剪辑'
  if (t === 'talent' || raw === '达人') return '达人'
  return raw
}
