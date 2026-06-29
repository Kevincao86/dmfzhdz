/**
 * 运营管控台 · 模块查看/编辑 + 省市数据范围（permissions jsonb v2）
 */

export type OpsModuleGrant = { view: boolean; edit: boolean }

export type OpsDataScope = {
  mode: 'national' | 'provinces' | 'cities'
  provinces: string[]
  cities: string[]
}

export type OpsPermissionsV2 = {
  v: 2
  grants: Partial<Record<string, OpsModuleGrant>>
  dataScope: OpsDataScope
}

export const NATIONAL_DATA_SCOPE: OpsDataScope = {
  mode: 'national',
  provinces: [],
  cities: [],
}

export function defaultDataScope(): OpsDataScope {
  return { mode: 'national', provinces: [], cities: [] }
}

export function normalizeDataScope(raw: unknown): OpsDataScope {
  if (!raw || typeof raw !== 'object') return defaultDataScope()
  const o = raw as Record<string, unknown>
  const modeRaw = String(o.mode || 'national').trim()
  const mode =
    modeRaw === 'provinces' || modeRaw === 'cities' ? modeRaw : ('national' as OpsDataScope['mode'])
  const provinces = Array.isArray(o.provinces)
    ? [...new Set(o.provinces.map((p) => String(p).trim()).filter(Boolean))]
    : []
  const cities = Array.isArray(o.cities)
    ? [...new Set(o.cities.map((c) => String(c).trim()).filter(Boolean))]
    : []
  if (mode === 'national') return defaultDataScope()
  if (mode === 'provinces' && !provinces.length) return defaultDataScope()
  if (mode === 'cities' && !cities.length) return defaultDataScope()
  return { mode, provinces, cities }
}

export function parsePermissionsPayload(
  raw: unknown,
  role: 'super_admin' | 'sub_admin',
  allKeys: string[],
): { legacyKeys: string[]; grants: Partial<Record<string, OpsModuleGrant>>; dataScope: OpsDataScope } {
  if (role === 'super_admin') {
    const grants: Partial<Record<string, OpsModuleGrant>> = {}
    for (const k of allKeys) grants[k] = { view: true, edit: true }
    return { legacyKeys: allKeys, grants, dataScope: defaultDataScope() }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as OpsPermissionsV2).v === 2) {
    const p = raw as OpsPermissionsV2
    const grants: Partial<Record<string, OpsModuleGrant>> = {}
    for (const k of allKeys) {
      const g = p.grants?.[k]
      if (!g) continue
      const view = !!g.view
      const edit = !!g.edit
      if (view || edit) grants[k] = { view: view || edit, edit }
    }
    const legacyKeys = Object.entries(grants)
      .filter(([, g]) => g?.view)
      .map(([k]) => k)
    return {
      legacyKeys,
      grants,
      dataScope: normalizeDataScope(p.dataScope),
    }
  }

  if (Array.isArray(raw)) {
    const legacyKeys = raw.filter((p): p is string => allKeys.includes(String(p)))
    const grants: Partial<Record<string, OpsModuleGrant>> = {}
    for (const k of legacyKeys) grants[k] = { view: true, edit: true }
    return { legacyKeys, grants, dataScope: defaultDataScope() }
  }

  return { legacyKeys: [], grants: {}, dataScope: defaultDataScope() }
}

export function buildPermissionsV2Payload(
  grants: Partial<Record<string, OpsModuleGrant>>,
  dataScope: OpsDataScope,
): OpsPermissionsV2 {
  const cleaned: Partial<Record<string, OpsModuleGrant>> = {}
  for (const [k, g] of Object.entries(grants)) {
    if (!g) continue
    const view = !!g.view || !!g.edit
    const edit = !!g.edit
    if (view || edit) cleaned[k] = { view, edit }
  }
  return { v: 2, grants: cleaned, dataScope: normalizeDataScope(dataScope) }
}

export function sessionCanViewModule(
  grants: Partial<Record<string, OpsModuleGrant>> | undefined,
  legacyKeys: string[] | undefined,
  key: string,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true
  const g = grants?.[key]
  if (g) return !!(g.view || g.edit)
  return legacyKeys?.includes(key) ?? false
}

export function sessionCanEditModule(
  grants: Partial<Record<string, OpsModuleGrant>> | undefined,
  legacyKeys: string[] | undefined,
  key: string,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true
  const g = grants?.[key]
  if (g) return !!g.edit
  return legacyKeys?.includes(key) ?? false
}

export function matchStaffDataScope(
  item: { province?: string; city?: string },
  scope: OpsDataScope,
): boolean {
  if (scope.mode === 'national') return true
  const province = String(item.province || '').trim()
  const city = String(item.city || '').trim()
  if (scope.mode === 'provinces') {
    return scope.provinces.length ? scope.provinces.includes(province) : true
  }
  if (scope.mode === 'cities') {
    return scope.cities.length ? scope.cities.includes(city) : true
  }
  return true
}

export function dataScopeSummary(scope: OpsDataScope): string {
  if (scope.mode === 'national') return '全国'
  if (scope.mode === 'provinces') return scope.provinces.join('、') || '全国'
  if (scope.mode === 'cities') return scope.cities.join('、') || '全国'
  return '全国'
}

export function grantsSummary(
  grants: Partial<Record<string, OpsModuleGrant>>,
  labels: Map<string, string>,
): string {
  const parts: string[] = []
  for (const [k, g] of Object.entries(grants)) {
    if (!g?.view && !g?.edit) continue
    const label = labels.get(k) ?? k
    if (g.edit) parts.push(`${label}(编)`)
    else parts.push(`${label}(查)`)
  }
  return parts.length ? parts.join('、') : '—'
}

/** 去重后的模块列表（announcements 在 UI 出现两次但 key 相同） */
export function uniquePermissionModules<
  T extends { key: string; label: string; pathPrefix?: string },
>(modules: readonly T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const m of modules) {
    if (seen.has(m.key)) continue
    seen.add(m.key)
    out.push(m)
  }
  return out
}
