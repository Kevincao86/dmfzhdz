import {
  emptyPermissionsForRole,
  type MpLibraryRole,
  type MpMembershipPlanVersion,
  MP_PERMISSION_DEFS,
} from './mpMembershipCatalog.js'
import type { RegistrySnapshot } from './opsRegistryTypes.js'
import { planVersionsRegistryKey } from './mpMembershipCatalog.js'

export type MpPlanVersionRole = MpLibraryRole

function sanitizePrice(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function sanitizePromoEndsAt(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  return new Date(t).toISOString()
}

function sanitizePromoBadge(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return s ? s.slice(0, 40) : null
}

function sanitizePermissionCell(
  role: MpLibraryRole,
  key: string,
  raw: unknown,
): boolean | number | string | undefined {
  const def = (MP_PERMISSION_DEFS[role] ?? []).find((d) => d.key === key)
  if (!def) return undefined
  if (def.kind === 'boolean') {
    if (typeof raw === 'boolean') return raw
    if (raw === 'true' || raw === 1 || raw === '1') return true
    if (raw === 'false' || raw === 0 || raw === '0') return false
    return false
  }
  if (def.kind === 'quota') {
    if (raw === '—' || raw === '-' || raw === '') return '—'
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return '—'
    return Math.min(99999, Math.floor(n))
  }
  if (typeof raw === 'string') return raw.slice(0, 120)
  return undefined
}

function sanitizeVersion(raw: unknown, role: MpLibraryRole, sortOrder: number): MpMembershipPlanVersion | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = String(row.id ?? '').trim()
  const name = String(row.name ?? '').trim()
  if (!id || !name) return null
  if (!/^[a-z][a-z0-9_]*$/i.test(id)) return null

  const permsIn: Record<string, unknown> =
    row.permissions && typeof row.permissions === 'object'
      ? (row.permissions as Record<string, unknown>)
      : {}
  const permissions: Record<string, boolean | number | string> = {}
  for (const def of MP_PERMISSION_DEFS[role] ?? []) {
    const cell = sanitizePermissionCell(role, def.key, permsIn[def.key])
    if (cell !== undefined) permissions[def.key] = cell
  }
  if (!Object.keys(permissions).length) {
    Object.assign(permissions, emptyPermissionsForRole(role))
  }

  return {
    id,
    name: name.slice(0, 80),
    priceMonthlyYuan: sanitizePrice(row.priceMonthlyYuan),
    priceYearlyYuan: sanitizePrice(row.priceYearlyYuan),
    listPriceMonthlyYuan: sanitizePrice(row.listPriceMonthlyYuan),
    listPriceYearlyYuan: sanitizePrice(row.listPriceYearlyYuan),
    promoEndsAt: sanitizePromoEndsAt(row.promoEndsAt),
    promoBadge: sanitizePromoBadge(row.promoBadge),
    permissions,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : sortOrder,
    builtin: row.builtin === true,
  }
}

export function saveMembershipPlanVersionsFromSnapshot(
  data: RegistrySnapshot,
  role: MpPlanVersionRole,
  rawVersions: unknown,
): { ok: true; count: number } | { ok: false; error: string; status: number } {
  if (!Array.isArray(rawVersions) || !rawVersions.length) {
    return { ok: false, error: 'invalid_versions', status: 400 }
  }
  const seen = new Set<string>()
  const versions: MpMembershipPlanVersion[] = []
  rawVersions.forEach((raw, idx) => {
    const v = sanitizeVersion(raw, role, idx)
    if (!v || seen.has(v.id)) return
    seen.add(v.id)
    versions.push(v)
  })
  if (!versions.length) return { ok: false, error: 'no_valid_versions', status: 400 }

  const key = planVersionsRegistryKey(role)
  data[key] = versions.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  return { ok: true, count: versions.length }
}
