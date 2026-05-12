import { isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import { listAiUiModelOptions, MEOO_AI_VENDOR_CATALOG_EVENT } from './merchantAiVendorCatalogClient'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import { readVendorKeyMap } from './merchantAiVendorKeysStorage'

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

/** 按目录顺序，选用第一个已配置浏览器端 Key 的厂商；均无 Key 时退回目录首项（通常为 MiniMax）。 */
/** 网关 runImageGenerate 仅支持这三家；自动生图勿选仅文案的自定义厂商 slug */
const BUILTIN_IMAGE_VENDOR_ORDER = ['minimax', 'qwen', 'doubao'] as const

export function pickAutoResolvedTextModel(): string {
  const opts = listAiUiModelOptions()
  const keys = readVendorKeyMap()
  for (const o of opts) {
    if (keys[o.id]?.trim()) return o.id
  }
  return opts[0]?.id ?? 'qwen'
}

export function pickAutoResolvedImageModel(): string {
  const keys = readVendorKeyMap()
  for (const id of BUILTIN_IMAGE_VENDOR_ORDER) {
    if (keys[id]?.trim()) return id
  }
  const opts = listAiUiModelOptions()
  for (const o of opts) {
    if (BUILTIN_IMAGE_VENDOR_ORDER.includes(o.id as (typeof BUILTIN_IMAGE_VENDOR_ORDER)[number])) {
      if (keys[o.id]?.trim()) return o.id
    }
  }
  return 'qwen'
}

function normalizeTextModelStored(raw: string | null | undefined): string {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === 'deepseek') return 'minimax'
  if (s === 'auto' || !s) return pickAutoResolvedTextModel()
  if (selectableAiIds().has(s)) return s
  if (isValidAiVendorSlug(s)) return s
  return pickAutoResolvedTextModel()
}

function isBuiltinImageVendorId(id: string): boolean {
  return (BUILTIN_IMAGE_VENDOR_ORDER as readonly string[]).includes(id)
}

function normalizeImageModelStored(raw: string | null | undefined): string {
  const s = raw?.trim().toLowerCase() ?? ''
  if (s === 'deepseek') return 'minimax'
  if (s === 'auto' || !s) return pickAutoResolvedImageModel()
  if (selectableAiIds().has(s)) {
    if (isBuiltinImageVendorId(s)) return s
    return pickAutoResolvedImageModel()
  }
  if (isValidAiVendorSlug(s)) {
    if (isBuiltinImageVendorId(s)) return s
    return pickAutoResolvedImageModel()
  }
  return pickAutoResolvedImageModel()
}

export function readStoredAiModel(): string {
  try {
    const raw = localStorage.getItem(MERCHANT_AI_MODEL_STORAGE_KEY)?.trim()
    return normalizeTextModelStored(raw)
  } catch {
    /* ignore */
  }
  return pickAutoResolvedTextModel()
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
  return pickAutoResolvedImageModel()
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

/** 为 true 时文案类 AI 按目录与已配置 Key 自动选厂商（{@link pickAutoResolvedTextModel}） */
export function readTextAiAuto(): boolean {
  return readBoolStorage(TEXT_AUTO_KEY, true)
}

export function writeTextAiAuto(on: boolean): void {
  writeBoolStorage(TEXT_AUTO_KEY, on, MEOO_TEXT_AI_AUTO_EVENT)
}

/** 为 true 时生图类 AI 按目录与已配置 Key 自动选厂商（{@link pickAutoResolvedImageModel}） */
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
  return pickAutoResolvedTextModel()
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
  return pickAutoResolvedImageModel()
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

/** 自动：按目录顺序与已配置 Key 动态选择；手动：本机指定的模型 */
export function resolveTextAiModelForRequest(): string {
  return readTextAiAuto() ? pickAutoResolvedTextModel() : readTextAiManualModel()
}

export function resolveImageAiModelForRequest(): string {
  return readImageAiAuto() ? pickAutoResolvedImageModel() : readImageAiManualModel()
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
