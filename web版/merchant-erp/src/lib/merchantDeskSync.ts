/**
 * 商家网页与商家小程序共用的本机草稿：商品库、门店联系人、报税记录、Brief。
 */
import { pullAgentUserStateFromCloud, pushMerchantDeskNow, type MerchantDeskCloud } from './agentUserStateCloud'
import {
  loadProductEditLibrary,
  replaceProductEditLibrary,
  type ProductEditLibraryRow,
} from './productEditLibrary'
import {
  loadStoreContactOverrides,
  replaceStoreContactOverrides,
  type StoreContactOverride,
} from './storeContactOverride'
import { readTaxFilingHistory, replaceTaxFilingHistory, type TaxFilingRecord } from './taxFiling'
import {
  readKolBriefRecords,
  readSelectedBriefForRecruitment,
  writeKolBriefRecords,
  writeSelectedBriefForRecruitment,
  type KolBriefRecord,
  type SelectedBriefPayload,
} from './kolBriefStorage'

let pushTimer: ReturnType<typeof setTimeout> | null = null

function snapshot(): MerchantDeskCloud {
  return {
    productLibrary: loadProductEditLibrary(),
    storeContacts: loadStoreContactOverrides(),
    taxHistory: readTaxFilingHistory(),
    briefRecords: readKolBriefRecords(),
    briefSelected: readSelectedBriefForRecruitment(),
    updatedAt: new Date().toISOString(),
  }
}

export function scheduleMerchantDeskPush() {
  if (typeof window === 'undefined') return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushMerchantDeskNow(snapshot())
  }, 700)
}

export async function pullMerchantDeskIntoLocal() {
  const remote = await pullAgentUserStateFromCloud()
  const desk = remote?.desk
  if (!desk) return
  if (Array.isArray(desk.productLibrary) && desk.productLibrary.length) {
    const merged = mergeById(loadProductEditLibrary(), desk.productLibrary as ProductEditLibraryRow[])
    replaceProductEditLibrary(merged as ProductEditLibraryRow[])
  }
  if (desk.storeContacts && typeof desk.storeContacts === 'object') {
    replaceStoreContactOverrides({
      ...loadStoreContactOverrides(),
      ...(desk.storeContacts as Record<string, StoreContactOverride>),
    })
  }
  if (Array.isArray(desk.taxHistory) && desk.taxHistory.length) {
    replaceTaxFilingHistory(mergeById(readTaxFilingHistory(), desk.taxHistory as TaxFilingRecord[]) as TaxFilingRecord[])
  }
  if (Array.isArray(desk.briefRecords) && desk.briefRecords.length) {
    writeKolBriefRecords(mergeById(readKolBriefRecords(), desk.briefRecords as KolBriefRecord[]) as KolBriefRecord[], {
      push: false,
    })
  }
  if (desk.briefSelected && typeof desk.briefSelected === 'object') {
    writeSelectedBriefForRecruitment(desk.briefSelected as SelectedBriefPayload)
  }
  scheduleMerchantDeskPush()
}

function mergeById<T extends { id?: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>()
  for (const row of [...local, ...remote]) {
    const id = String(row?.id || '').trim()
    if (!id) continue
    map.set(id, row)
  }
  return [...map.values()].slice(0, 80)
}
