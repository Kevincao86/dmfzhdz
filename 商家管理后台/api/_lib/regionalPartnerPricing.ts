/**
 * 区域服务商订阅定价：平台底价 + 城市加价覆盖 + 租户有效价解析
 */
import {
  cityLabelVariants,
  normalizeCityLabel,
  parseCities,
  tenantCityInPartnerScope,
  type RegionalCity,
  type RegionalPartnerPublic,
} from './regionalPartnersBackend.js'

/** 避免跨包 SupabaseClient 泛型不兼容 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type SubscriptionTierKey =
  | 'member_monthly'
  | 'member_plus_monthly'
  | 'member_quarterly'
  | 'member_plus_quarterly'

export type ResolvedSubscriptionTier = {
  key: SubscriptionTierKey
  label: string
  yuan: number
  cents: number
  floorCents: number
  plan: 'member' | 'member_plus'
  periodDays: 30 | 90
  regionalMarkup: boolean
}

export type CitySubscriptionPricing = Partial<Record<SubscriptionTierKey, number>>

export type PartnerSubscriptionPricingMap = Record<string, CitySubscriptionPricing>

export const PLATFORM_SUBSCRIPTION_FLOOR: Record<
  SubscriptionTierKey,
  {
    label: string
    plan: 'member' | 'member_plus'
    periodDays: 30 | 90
    floorCents: number
  }
> = {
  member_monthly: {
    label: '会员版 · 月度',
    plan: 'member',
    periodDays: 30,
    floorCents: 16800,
  },
  member_plus_monthly: {
    label: '会员 Plus · 月度',
    plan: 'member_plus',
    periodDays: 30,
    floorCents: 59800,
  },
  member_quarterly: {
    label: '会员版 · 季度',
    plan: 'member',
    periodDays: 90,
    floorCents: 46800,
  },
  member_plus_quarterly: {
    label: '会员 Plus · 季度',
    plan: 'member_plus',
    periodDays: 90,
    floorCents: 168800,
  },
}

export const SUBSCRIPTION_TIER_KEYS = Object.keys(
  PLATFORM_SUBSCRIPTION_FLOOR,
) as SubscriptionTierKey[]

function isTierKey(k: string): k is SubscriptionTierKey {
  return k in PLATFORM_SUBSCRIPTION_FLOOR
}

export function platformDefaultTiers(): ResolvedSubscriptionTier[] {
  return SUBSCRIPTION_TIER_KEYS.map((key) => {
    const f = PLATFORM_SUBSCRIPTION_FLOOR[key]
    return {
      key,
      label: f.label,
      yuan: f.floorCents / 100,
      cents: f.floorCents,
      floorCents: f.floorCents,
      plan: f.plan,
      periodDays: f.periodDays,
      regionalMarkup: false,
    }
  })
}

/** 解析并校验价目：仅允许 ≥ 底价；城市键保留原文 */
export function parseAndValidateSubscriptionPricing(
  raw: unknown,
  partnerCities: RegionalCity[],
):
  | { ok: true; pricing: PartnerSubscriptionPricingMap }
  | { ok: false; error: string; detail?: string } {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_pricing' }
  }
  const scope = new Set(
    partnerCities.flatMap((c) => [...cityLabelVariants(c.city), normalizeCityLabel(c.city), c.city]),
  )
  const out: PartnerSubscriptionPricingMap = {}
  for (const [cityRaw, cityVal] of Object.entries(raw as Record<string, unknown>)) {
    const city = String(cityRaw || '').trim()
    if (!city) continue
    if (
      !scope.has(city) &&
      !scope.has(normalizeCityLabel(city)) &&
      !partnerCities.some((c) => cityLabelVariants(c.city).includes(city))
    ) {
      return { ok: false, error: 'city_out_of_scope', detail: city }
    }
    if (!cityVal || typeof cityVal !== 'object' || Array.isArray(cityVal)) {
      return { ok: false, error: 'invalid_city_pricing', detail: city }
    }
    const entry: CitySubscriptionPricing = {}
    for (const [k, v] of Object.entries(cityVal as Record<string, unknown>)) {
      if (!isTierKey(k)) continue
      const cents = Math.floor(Number(v) || 0)
      const floor = PLATFORM_SUBSCRIPTION_FLOOR[k].floorCents
      if (!Number.isFinite(cents) || cents < floor) {
        return {
          ok: false,
          error: 'below_floor',
          detail: `${city}.${k} < ¥${(floor / 100).toFixed(0)}`,
        }
      }
      entry[k] = cents
    }
    out[city] = entry
  }
  return { ok: true, pricing: out }
}

export function mergeCityPricing(
  cityPricing: CitySubscriptionPricing | null | undefined,
): ResolvedSubscriptionTier[] {
  return SUBSCRIPTION_TIER_KEYS.map((key) => {
    const f = PLATFORM_SUBSCRIPTION_FLOOR[key]
    const override = cityPricing?.[key]
    const cents =
      typeof override === 'number' && override >= f.floorCents ? Math.floor(override) : f.floorCents
    return {
      key,
      label: f.label,
      yuan: cents / 100,
      cents,
      floorCents: f.floorCents,
      plan: f.plan,
      periodDays: f.periodDays,
      regionalMarkup: cents > f.floorCents,
    }
  })
}

function pickCityPricing(
  pricing: PartnerSubscriptionPricingMap,
  city: string,
): CitySubscriptionPricing | null {
  if (!city) return null
  if (pricing[city]) return pricing[city]
  const n = normalizeCityLabel(city)
  for (const [k, v] of Object.entries(pricing)) {
    if (normalizeCityLabel(k) === n || cityLabelVariants(k).includes(city)) return v
  }
  return null
}

export function readPricingFromRow(raw: unknown): PartnerSubscriptionPricingMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: PartnerSubscriptionPricingMap = {}
  for (const [city, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object' || Array.isArray(val)) continue
    const entry: CitySubscriptionPricing = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (!isTierKey(k)) continue
      const cents = Math.floor(Number(v) || 0)
      if (cents >= PLATFORM_SUBSCRIPTION_FLOOR[k].floorCents) entry[k] = cents
    }
    out[city] = entry
  }
  return out
}

export async function loadPartnerSubscriptionPricing(
  admin: Db,
  partnerId: string,
): Promise<PartnerSubscriptionPricingMap> {
  const { data } = await admin
    .from('regional_partners')
    .select('subscription_pricing')
    .eq('id', partnerId)
    .maybeSingle()
  return readPricingFromRow(data?.subscription_pricing)
}

export async function savePartnerSubscriptionPricing(
  admin: Db,
  partner: RegionalPartnerPublic,
  rawPricing: unknown,
): Promise<
  | { ok: true; pricing: PartnerSubscriptionPricingMap }
  | { ok: false; error: string; detail?: string }
> {
  const parsed = parseAndValidateSubscriptionPricing(rawPricing, partner.cities)
  if (!parsed.ok) return parsed
  const { error } = await admin
    .from('regional_partners')
    .update({
      subscription_pricing: parsed.pricing,
      updated_at: new Date().toISOString(),
    })
    .eq('id', partner.id)
  if (error) {
    if (/subscription_pricing|schema cache|does not exist/i.test(error.message)) {
      return { ok: false, error: 'pricing_column_missing', detail: error.message }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, pricing: parsed.pricing }
}

type PartnerLite = {
  id: string
  cities: unknown
  status: string
  subscription_pricing?: unknown
}

async function findActivePartnerForCity(
  admin: Db,
  city: string,
  preferredPartnerId?: string | null,
): Promise<PartnerLite | null> {
  if (preferredPartnerId) {
    const { data } = await admin
      .from('regional_partners')
      .select('id,cities,status,subscription_pricing')
      .eq('id', preferredPartnerId)
      .eq('status', 'active')
      .maybeSingle()
    if (data) {
      const cities = parseCities(data.cities)
      if (tenantCityInPartnerScope({ attribution_city: city, register_city: city }, cities)) {
        return data as PartnerLite
      }
    }
  }
  const { data: rows } = await admin
    .from('regional_partners')
    .select('id,cities,status,subscription_pricing')
    .eq('status', 'active')
  for (const row of rows ?? []) {
    const cities = parseCities((row as PartnerLite).cities)
    if (tenantCityInPartnerScope({ attribution_city: city, register_city: city }, cities)) {
      return row as PartnerLite
    }
  }
  return null
}

export async function resolveSubscriptionTiersForTenant(
  admin: Db,
  tenantId: string,
): Promise<{
  tiers: ResolvedSubscriptionTier[]
  source: 'platform' | 'regional'
  pricingCity: string | null
  partnerId: string | null
}> {
  const { data: tenant } = await admin
    .from('tenants')
    .select('register_city,attribution_city,regional_partner_id')
    .eq('id', tenantId)
    .maybeSingle()

  const city = String(tenant?.register_city || tenant?.attribution_city || '').trim()
  if (!city) {
    return {
      tiers: platformDefaultTiers(),
      source: 'platform',
      pricingCity: null,
      partnerId: null,
    }
  }

  const partner = await findActivePartnerForCity(
    admin,
    city,
    tenant?.regional_partner_id ? String(tenant.regional_partner_id) : null,
  )
  if (!partner) {
    return {
      tiers: platformDefaultTiers(),
      source: 'platform',
      pricingCity: city,
      partnerId: null,
    }
  }

  const pricing = readPricingFromRow(partner.subscription_pricing)
  const cityPricing = pickCityPricing(pricing, city)
  const tiers = mergeCityPricing(cityPricing)
  const anyMarkup = tiers.some((t) => t.regionalMarkup)
  return {
    tiers,
    source: anyMarkup ? 'regional' : cityPricing ? 'regional' : 'platform',
    pricingCity: city,
    partnerId: partner.id,
  }
}

export function matchResolvedTierByCents(
  tiers: ResolvedSubscriptionTier[],
  cents: number,
): ResolvedSubscriptionTier | null {
  const c = Math.floor(Number(cents) || 0)
  return tiers.find((t) => t.cents === c) ?? null
}
