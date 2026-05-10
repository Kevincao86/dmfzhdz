const STORAGE_KEY = 'meoo_ops_support_reply_templates_v1'

const DEFAULT_TEMPLATES = [
  '您好，已收到您的问题，我们正在核实，请稍候。',
  '如需协助，请补充门店名称、所在平台与大致发生时间，便于我们定位。',
  '若涉及订单或对账，可留下联系电话，我们将尽快回访。',
]

export function readSupportReplyTemplates(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw?.trim()) return [...DEFAULT_TEMPLATES]
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return [...DEFAULT_TEMPLATES]
    const lines = j.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
    return lines.length > 0 ? lines : [...DEFAULT_TEMPLATES]
  } catch {
    return [...DEFAULT_TEMPLATES]
  }
}

export function writeSupportReplyTemplates(lines: string[]): void {
  const cleaned = lines.map((x) => x.trim()).filter(Boolean)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned.length > 0 ? cleaned : DEFAULT_TEMPLATES))
  } catch {
    /* ignore */
  }
}
