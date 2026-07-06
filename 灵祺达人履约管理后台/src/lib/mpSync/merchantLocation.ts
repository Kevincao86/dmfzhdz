export type MerchantLocationMeta = {
  name: string
  address: string
  latitude?: number
  longitude?: number
  source: 'map' | 'text'
}

export type MerchantLocationFormFields = {
  merchantLocationAddress: string
  merchantLocationName: string
  merchantLocationLat: string
  merchantLocationLng: string
}

export function emptyMerchantLocationFields(): MerchantLocationFormFields {
  return {
    merchantLocationAddress: '',
    merchantLocationName: '',
    merchantLocationLat: '',
    merchantLocationLng: '',
  }
}

export function merchantLocationToMeta(fields: MerchantLocationFormFields): MerchantLocationMeta | null {
  const address = String(fields.merchantLocationAddress || '').trim()
  const name = String(fields.merchantLocationName || '').trim()
  if (!address && !name) return null
  const lat = Number(fields.merchantLocationLat)
  const lng = Number(fields.merchantLocationLng)
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      name: name || address,
      address: address || name,
      latitude: lat,
      longitude: lng,
      source: 'map',
    }
  }
  return {
    name: name || address,
    address: address || name,
    source: 'text',
  }
}

export function merchantLocationFromMeta(meta: Record<string, unknown> | null | undefined): MerchantLocationFormFields {
  const loc = meta && (meta.merchantLocation as MerchantLocationMeta | undefined)
  if (!loc || typeof loc !== 'object') return emptyMerchantLocationFields()
  return {
    merchantLocationAddress: String(loc.address || '').trim(),
    merchantLocationName: String(loc.name || '').trim(),
    merchantLocationLat: loc.latitude != null ? String(loc.latitude) : '',
    merchantLocationLng: loc.longitude != null ? String(loc.longitude) : '',
  }
}

export function merchantLocationRecruitmentLine(fields: MerchantLocationFormFields): string {
  const meta = merchantLocationToMeta(fields)
  if (!meta) return ''
  if (meta.source === 'map') {
    return `商家位置：${meta.name}${meta.address && meta.address !== meta.name ? `（${meta.address}）` : ''} [地图定位]`
  }
  return `商家位置：${meta.address || meta.name}`
}
