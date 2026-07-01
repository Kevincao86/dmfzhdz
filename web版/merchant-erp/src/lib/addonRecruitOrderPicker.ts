/**
 * 增值服务 · AI 文章/Brief：招募订单选择（商家 cs + dr 履约嵌入 + 小程序同源 hall-registry）。
 */
import type { RecruitOrderPickerRow } from './aiRecruitOrderContext'
import { mapRecruitOrderPickerRow } from './aiRecruitOrderContext'
import { filterPublishedRecruitingOrders } from './addonPublishedRecruitFilter'
import { merchantApiFetchUrls } from './merchantErpApiBase'
import { readMpSessionToken } from './merchantApiAuth'
import { fetchOpsRegistry } from './opsRegistryClient'
import { mpOrderOwnedByPrKeys, type PrOwnerKeys } from './registryTenantIsolation'
import type { RegistryMpRecruitmentOrder } from './opsRegistryTypes'

const MP_ACCOUNT_KEY = 'lingqi_mp_account'
const MP_ROLE_KEY = 'lingqi_mp_active_role'

function readMpPickerContext(): { activeRole: 'talent' | 'pr'; prKeys: PrOwnerKeys } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(MP_ACCOUNT_KEY)
    if (!raw) return null
    const acc = JSON.parse(raw) as Record<string, unknown>
    const roleRaw = String(localStorage.getItem(MP_ROLE_KEY) || acc.activeRole || 'talent').trim()
    const activeRole = roleRaw === 'pr' ? 'pr' : 'talent'
    return {
      activeRole,
      prKeys: {
        lingqiPrId: String(acc.lingqiPrId ?? acc.lingqi_pr_id ?? '').trim(),
        registryPrId: String(acc.registryPrId ?? acc.registry_pr_id ?? '').trim(),
      },
    }
  } catch {
    return null
  }
}

async function fetchJsonFromCandidates(
  urls: string[],
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let lastErr = '招募订单接口不可达'
  for (const url of urls) {
    try {
      const res = await fetch(url, init)
      const text = await res.text()
      let j: Record<string, unknown> = {}
      try {
        j = JSON.parse(text) as Record<string, unknown>
      } catch {
        lastErr = `接口返回非 JSON（HTTP ${res.status}）`
        continue
      }
      if (res.ok && j.ok !== false) return j
      lastErr = String(j.message || j.detail || j.error || `HTTP ${res.status}`)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

async function fetchHallRegistryMpOrders(includePrOwned: boolean): Promise<RegistryMpRecruitmentOrder[]> {
  const mpToken = readMpSessionToken()
  if (includePrOwned && mpToken) {
    const data = await fetchJsonFromCandidates(merchantApiFetchUrls('/api/meoo-ops-mp-auth'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpToken}`,
        'X-Mp-Session': mpToken,
      },
      body: JSON.stringify({ action: 'hall_registry', includePrOwned: true }),
    })
    const mp = data.mpRecruitmentOrders
    return Array.isArray(mp) ? (mp as RegistryMpRecruitmentOrder[]) : []
  }

  const data = await fetchJsonFromCandidates(merchantApiFetchUrls('/api/meoo-ops-mp-hall-registry'), {
    method: 'GET',
  })
  const mp = data.mpRecruitmentOrders
  return Array.isArray(mp) ? (mp as RegistryMpRecruitmentOrder[]) : []
}

function filterPublishedRecruitingForPicker(
  mpList: RegistryMpRecruitmentOrder[],
  opts?: { prOnly?: boolean; prKeys?: PrOwnerKeys | null },
): RegistryMpRecruitmentOrder[] {
  return filterPublishedRecruitingOrders(mpList, {
    owned:
      opts?.prOnly && opts.prKeys
        ? (mp) => mpOrderOwnedByPrKeys(mp, opts.prKeys!)
        : undefined,
  })
}

function rowsFromMpList(mpList: RegistryMpRecruitmentOrder[]): RecruitOrderPickerRow[] {
  return mpList
    .map(mapRecruitOrderPickerRow)
    .filter((r) => r.id)
    .sort((a, b) => b.id.localeCompare(a.id))
}

/** 星选 dr / 小程序：hall-registry；商家 ERP：sync-registry 兜底 */
export async function loadAddonRecruitOrderPickerRows(): Promise<RecruitOrderPickerRow[]> {
  const ctx = readMpPickerContext()
  const mpToken = readMpSessionToken()
  const useHall = Boolean(mpToken) || (typeof window !== 'undefined' && /^dr\./i.test(window.location.hostname))

  if (useHall) {
    const mpList = await fetchHallRegistryMpOrders(ctx?.activeRole === 'pr')
    const prKeys = ctx?.activeRole === 'pr' ? ctx.prKeys : null
    const filtered = filterPublishedRecruitingForPicker(mpList, {
      prOnly: ctx?.activeRole === 'pr',
      prKeys,
    })
    const rows = rowsFromMpList(filtered)
    if (rows.length > 0) return rows
  }

  const reg = await fetchOpsRegistry()
  const list = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
  const filtered = filterPublishedRecruitingForPicker(list, {
    prOnly: ctx?.activeRole === 'pr',
    prKeys: ctx?.activeRole === 'pr' ? ctx?.prKeys ?? null : null,
  })
  return rowsFromMpList(filtered)
}
