import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import { listAiUiModelOptions, MEOO_AI_VENDOR_CATALOG_EVENT } from './merchantAiVendorCatalogClient'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'

export const MERCHANT_AI_MODEL_STORAGE_KEY = 'meoo_merchant_default_ai_model'
const CHANGE_EVENT = 'meoo-merchant-ai-model'

export const MERCHANT_IMAGE_AI_MODEL_STORAGE_KEY = 'meoo_merchant_image_ai_model'
const IMAGE_CHANGE_EVENT = 'meoo-merchant-image-ai-model'

const TEXT_AUTO_KEY = 'meoo_merchant_text_ai_auto_v1'
const IMAGE_AUTO_KEY = 'meoo_merchant_image_ai_auto_v1'
const TEXT_MANUAL_KEY = 'meoo_merchant_text_ai_manual_v1'
const IMAGE_MANUAL_KEY = 'meoo_merchant_image_ai_manual_v1'

export const MEOO_TEXT_AI_AUTO_EVENT = 'meoo-text-ai-auto'
export const MEOO_IMAGE_AI_AUTO_EVENT = 'meoo-image-ai-auto'
export const MEOO_TEXT_AI_MANUAL_EVENT = 'meoo-text-ai-manual'
export const MEOO_IMAGE_AI_MANUAL_EVENT = 'meoo-image-ai-manual'

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

function readBoolStorage(key: string, defaultTrue: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === '0') return false
    if (v === '1') return true
    return defaultTrue
  } catch {
    return defaultTrue
  }
}

function writeBoolStorage(key: string, on: boolean, eventName: string): void {
  try {
    localStorage.setItem(key, on ? '1' : '0')
    window.dispatchEvent(new CustomEvent(eventName, { detail: on }))
  } catch {
    /* ignore */
  }
}

/** 为 true 时文案类 AI 请求跟随「系统设置 / 运营下发」的默认模型（{@link readStoredAiModel}） */
export function readTextAiAuto(): boolean {
  return readBoolStorage(TEXT_AUTO_KEY, true)
}

export function writeTextAiAuto(on: boolean): void {
  writeBoolStorage(TEXT_AUTO_KEY, on, MEOO_TEXT_AI_AUTO_EVENT)
}

/** 为 true 时生图类 AI 请求跟随默认生图模型（{@link readStoredImageAiModel}） */
export function readImageAiAuto(): boolean {
  return readBoolStorage(IMAGE_AUTO_KEY, true)
}

export function writeImageAiAuto(on: boolean): void {
  writeBoolStorage(IMAGE_AUTO_KEY, on, MEOO_IMAGE_AI_AUTO_EVENT)
}

export function readTextAiManualModel(): string {
  try {
    const raw = localStorage.getItem(TEXT_MANUAL_KEY)?.trim()
    if (raw) return normalizeTextModelStored(raw)
  } catch {
    /* ignore */
  }
  return readStoredAiModel()
}

export function writeTextAiManualModel(id: string): void {
  const nid = normalizeTextModelStored(id)
  try {
    localStorage.setItem(TEXT_MANUAL_KEY, nid)
    window.dispatchEvent(new CustomEvent(MEOO_TEXT_AI_MANUAL_EVENT, { detail: nid }))
  } catch {
    /* ignore */
  }
}

export function readImageAiManualModel(): string {
  try {
    const raw = localStorage.getItem(IMAGE_MANUAL_KEY)?.trim()
    if (raw) return normalizeImageModelStored(raw)
  } catch {
    /* ignore */
  }
  return readStoredImageAiModel()
}

export function writeImageAiManualModel(id: string): void {
  const nid = normalizeImageModelStored(id)
  try {
    localStorage.setItem(IMAGE_MANUAL_KEY, nid)
    window.dispatchEvent(new CustomEvent(MEOO_IMAGE_AI_MANUAL_EVENT, { detail: nid }))
  } catch {
    /* ignore */
  }
}

/** 自动：与系统默认一致；手动：仅本机记住的指定模型（不覆盖运营台同步的默认项） */
export function resolveTextAiModelForRequest(): string {
  return readTextAiAuto() ? readStoredAiModel() : readTextAiManualModel()
}

export function resolveImageAiModelForRequest(): string {
  return readImageAiAuto() ? readStoredImageAiModel() : readImageAiManualModel()
}

/**
 * 按 AI assist action 选择文案模型或生图模型（与自动/手动开关一致）。
 */
export function resolveModelForAssistAction(action: string): string {
  if (action === 'image_generate' || action === 'image_enhance') {
    return resolveImageAiModelForRequest()
  }
  return resolveTextAiModelForRequest()
}
