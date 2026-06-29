/** 运营权限 v2 解析（api/_lib 副本，与 src/meooRegistryShared/opsPermissionsV2.ts 同步） */

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
    return { legacyKeys, grants, dataScope: normalizeDataScope(p.dataScope) }
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
