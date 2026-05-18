import { tenantLocalKey } from './tenantLocalState'

export type KolBriefRecord = {
  id: string
  createdAt: string
  platform: string
  mainProductName: string
  secondaryProductName?: string
  tags: string[]
  previews: [string, string, string]
}

const RECORDS_KEY_BASE = 'meoo_kol_brief_records'
const SELECTED_BRIEF_KEY_BASE = 'meoo_kol_selected_brief_payload'

function recordsKey(): string {
  return tenantLocalKey(RECORDS_KEY_BASE)
}

function selectedKey(): string {
  return tenantLocalKey(SELECTED_BRIEF_KEY_BASE)
}

export function readKolBriefRecords(): KolBriefRecord[] {
  try {
    const raw = window.localStorage.getItem(recordsKey())
    if (!raw) return []
    const j = JSON.parse(raw) as KolBriefRecord[]
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}

export function writeKolBriefRecords(rows: KolBriefRecord[]) {
  window.localStorage.setItem(recordsKey(), JSON.stringify(rows.slice(0, 50)))
}

export function appendKolBriefRecord(row: KolBriefRecord) {
  const cur = readKolBriefRecords()
  writeKolBriefRecords([row, ...cur])
}

export type SelectedBriefPayload = {
  recordId: string
  variantIndex: 0 | 1 | 2
  text: string
  platform: string
  mainProductName: string
  tags: string[]
}

export function writeSelectedBriefForRecruitment(payload: SelectedBriefPayload | null) {
  const key = selectedKey()
  if (!payload) window.localStorage.removeItem(key)
  else window.localStorage.setItem(key, JSON.stringify(payload))
}

export function readSelectedBriefForRecruitment(): SelectedBriefPayload | null {
  try {
    const raw = window.localStorage.getItem(selectedKey())
    if (!raw) return null
    return JSON.parse(raw) as SelectedBriefPayload
  } catch {
    return null
  }
}
