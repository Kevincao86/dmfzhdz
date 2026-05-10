import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import { listAiUiModelOptions, MEOO_AI_VENDOR_CATALOG_EVENT } from './merchantAiVendorCatalogClient'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'

export const MERCHANT_AI_MODEL_STORAGE_KEY = 'meoo_merchant_default_ai_model'
const CHANGE_EVENT = 'meoo-merchant-ai-model'

export const MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY = 'meoo_merchant_image_ai_model'
const IMAGE_CHANGE_EVENT = 'meoo-merchant-image-ai-model'

function selectableAiIds(): Set<string> {
  return new Set(listAiUiModelOptions().map((o) => o.id))
}

function normalizeTextModelStored(raw: string | null | undefined): string {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === 'deepseek') return 'minimax'
  if (!s) return 'qwen'
  if (selectableAiIds().has(s)) return s
  if (isValidAiVendorSlug(s)) return s
  return 'qwen'
}

function normalizeImageModelStored(raw: string | null | undefined): string {
  return normalizeTextModelStored(raw)
}

export function readStoredAiModel(): string {
  try {
    const raw = localStorage.getItem(MERCHANT_AI_MODEL_STORAGE_KEY)?.trim()
    return normalizeTextModelStored(raw)
  } catch {
    /* ignore */
  }
  return 'qwen'
}

export function writeStoredAiModel(id: string): void {
  const nid = normalizeTextModelStored(id)
  try {
    localStorage.setItem(MERCHANT_AI_MODEL_STORAGE_KEY, nid)
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: nid }))
  } catch {
    /* ignore */
  }
}

export function subscribeStoredAiModel(handler: (id: string) => void): () => void {
  const fromEvent = (e: Event) => {
    const d = (e as CustomEvent<string>).detail
    if (e.type === CHANGE_EVENT && typeof d === 'string' && d) {
      handler(normalizeTextModelStored(d))
      return
    }
    if (e.type === MEOO_REGISTRY_SYNC_EVENT || e.type === MEOO_AI_VENDOR_CATALOG_EVENT) {
      handler(readStoredAiModel())
    }
  }
  window.addEventListener(CHANGE_EVENT, fromEvent as EventListener)
  window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, fromEvent as EventListener)
  window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, fromEvent as EventListener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, fromEvent as EventListener)
    window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, fromEvent as EventListener)
    window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, fromEvent as EventListener)
  }
}

export function readStoredImageAiModel(): string {
  try {
    const raw = localStorage.getItem(MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY)?.trim()
    return normalizeImageModelStored(raw)
  } catch {
    /* ignore */
  }
  return 'qwen'
}

export function writeStoredImageAiModel(id: string): void {
  const nid = normalizeImageModelStored(id)
  try {
    localStorage.setItem(MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY, nid)
    window.dispatchEvent(new CustomEvent(IMAGE_CHANGE_EVENT, { detail: nid }))
  } catch {
    /* ignore */
  }
}

export function subscribeStoredImageAiModel(handler: (id: string) => void): () => void {
  const fromEvent = (e: Event) => {
    const d = (e as CustomEvent<string>).detail
    if (e.type === IMAGE_CHANGE_EVENT && typeof d === 'string' && d) {
      handler(normalizeImageModelStored(d))
      return
    }
    if (e.type === MEOO_REGISTRY_SYNC_EVENT || e.type === MEOO_AI_VENDOR_CATALOG_EVENT) {
      handler(readStoredImageAiModel())
    }
  }
  window.addEventListener(IMAGE_CHANGE_EVENT, fromEvent as EventListener)
  window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, fromEvent as EventListener)
  window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, fromEvent as EventListener)
  return () => {
    window.removeEventListener(IMAGE_CHANGE_EVENT, fromEvent as EventListener)
    window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, fromEvent as EventListener)
    window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, fromEvent as EventListener)
  }
}
