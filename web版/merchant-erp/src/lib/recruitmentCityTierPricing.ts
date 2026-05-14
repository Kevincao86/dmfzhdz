/**
 * 新手版达人招募：按城市给出各档位「单人探店/条」参考成本区间（元），供 AI 分配与页面展示。
 * 未单独配置的城市走 DEFAULT_TIER_BANDS；可按同城行情在 KNOWN 中增补。
 */

export type KolTierBand = { min: number; max: number | null }

export type CityKolTierBands = {
  cityKey: string
  displayCity: string
  v3: KolTierBand
  v4: KolTierBand
  v5: KolTierBand
  v5plus: KolTierBand
}

function normCity(raw: string): string {
  return raw
    .trim()
    .replace(/市$/u, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

/** 通用默认（新一线量级示例，非报价承诺） */
const DEFAULT_TIER_BANDS: Omit<CityKolTierBands, 'cityKey' | 'displayCity'> = {
  v3: { min: 0, max: 80 },
  v4: { min: 80, max: 200 },
  v5: { min: 200, max: 450 },
  v5plus: { min: 450, max: null },
}

/** 宁波示例：3级0–50、4级50–100、5级100–250、5级以上延伸 */
const NINGBO: Omit<CityKolTierBands, 'cityKey' | 'displayCity'> = {
  v3: { min: 0, max: 50 },
  v4: { min: 50, max: 100 },
  v5: { min: 100, max: 250 },
  v5plus: { min: 250, max: null },
}

/** 杭州：略高于宁波默认档 */
const HANGZHOU: Omit<CityKolTierBands, 'cityKey' | 'displayCity'> = {
  v3: { min: 0, max: 80 },
  v4: { min: 80, max: 180 },
  v5: { min: 180, max: 400 },
  v5plus: { min: 400, max: null },
}

/** 成都：西南常见撮合区间占位 */
const CHENGDU: Omit<CityKolTierBands, 'cityKey' | 'displayCity'> = {
  v3: { min: 0, max: 70 },
  v4: { min: 70, max: 160 },
  v5: { min: 160, max: 380 },
  v5plus: { min: 380, max: null },
}

const KNOWN: Record<string, Omit<CityKolTierBands, 'cityKey' | 'displayCity'>> = {
  宁波: NINGBO,
  ningbo: NINGBO,
  杭州: HANGZHOU,
  hangzhou: HANGZHOU,
  成都: CHENGDU,
  chengdu: CHENGDU,
}

export function resolveCityKolTierBands(cityInput: string): CityKolTierBands {
  const raw = cityInput.trim()
  const key = normCity(raw)
  const bands = (key && KNOWN[key]) || (raw && KNOWN[raw]) || DEFAULT_TIER_BANDS
  const displayCity = raw || '未填城市（默认参考带）'
  return {
    cityKey: key || 'default',
    displayCity,
    ...bands,
  }
}

function fmtBand(b: KolTierBand): string {
  if (b.max == null) return `${b.min} 元以上`
  return `${b.min}–${b.max} 元`
}

/** 一行人类可读，用于 costHint / AI 提示 */
export function formatCityTierBandsSummary(b: CityKolTierBands): string {
  const label = b.displayCity.replace(/市$/u, '') || '当前城市'
  return `参考城市「${label}」达人单次撮合成本带：V3 ${fmtBand(b.v3)}；V4 ${fmtBand(b.v4)}；V5 ${fmtBand(b.v5)}；V5以上 ${fmtBand(b.v5plus)}（均为区间估算，以实际报价为准）。`
}

/** 多行展示用 */
export function formatCityTierBandsLines(b: CityKolTierBands): string[] {
  return [
    `V3：${fmtBand(b.v3)}`,
    `V4：${fmtBand(b.v4)}`,
    `V5：${fmtBand(b.v5)}`,
    `V5以上：${fmtBand(b.v5plus)}`,
  ]
}
