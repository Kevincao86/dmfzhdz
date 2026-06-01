/** 租户使用数据：由注册、资料更新、钱包流水、客服消息等时间戳汇总 */

export type TenantUsageInput = {
  createdAt: string
  updatedAt: string
  /** 额外活跃时间（ISO 或毫秒 ts） */
  extraActivityAt?: Array<string | number>
}

export type TenantUsageMetrics = {
  firstLoginAt: string
  lastLoginAt: string
  activeDays: number
  dau: number
  wau: number
  mau: number
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function toMs(v: string | number): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = new Date(String(v)).getTime()
  return Number.isNaN(t) ? null : t
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function collectActivityMs(input: TenantUsageInput): number[] {
  const out: number[] = []
  for (const raw of [input.createdAt, input.updatedAt, ...(input.extraActivityAt ?? [])]) {
    const ms = toMs(raw)
    if (ms != null) out.push(ms)
  }
  const created = toMs(input.createdAt)
  const updated = toMs(input.updatedAt)
  if (created != null && updated != null && updated - created < 120_000) {
    return out.filter((ms) => ms !== updated || ms === created)
  }
  return out
}

export function computeTenantUsageMetrics(input: TenantUsageInput): TenantUsageMetrics {
  const activityMs = collectActivityMs(input)
  if (activityMs.length === 0) {
    return {
      firstLoginAt: '—',
      lastLoginAt: '—',
      activeDays: 0,
      dau: 0,
      wau: 0,
      mau: 0,
    }
  }

  const sorted = [...activityMs].sort((a, b) => a - b)
  const firstMs = sorted[0]!
  const lastMs = sorted[sorted.length - 1]!
  const daySet = new Set(sorted.map(dayKey))

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const lastAge = now - lastMs

  return {
    firstLoginAt: fmt(new Date(firstMs).toISOString()),
    lastLoginAt: fmt(new Date(lastMs).toISOString()),
    activeDays: daySet.size,
    dau: lastAge <= dayMs ? 1 : 0,
    wau: lastAge <= 7 * dayMs ? 1 : 0,
    mau: lastAge <= 30 * dayMs ? 1 : 0,
  }
}
