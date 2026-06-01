/**
 * 运营台注册表 AI Key / 模型 / 短视频写入（ECS erp-api 与 Vercel 共用）。
 */
import { isValidAiVendorSlug, mergeBuiltinAiVendorCatalog } from '../src/lib/aiVendorCatalogShared.js'
import { expandVendorKeysForRegistrySave } from '../src/lib/aiVendorKeysShared.js'
import { validateRegistryVendorKey } from '../src/lib/aiVendorKeyValidate.js'
import type {
  AiVendorCatalogEntry,
  RegistryVendorKeys,
  RegistryVideoAi,
} from '../src/lib/opsRegistryTypes.js'
import { normalizeRegistryVideoAi } from '../src/lib/registryVideoAiNormalize.js'
import type { RegistrySnapshotIo } from '../src/lib/registrySnapshotIoFetch.js'
import { sanitizeVendorApiKey } from './merchantRegistryVendorEnv.js'

export async function opsRegistrySupabaseSaveVendorKeys(
  io: RegistrySnapshotIo,
  bodyRaw: string,
): Promise<{ status: number; body: unknown }> {
  let body: {
    keys?: RegistryVendorKeys
    aiVendorCatalog?: AiVendorCatalogEntry[]
    lastWriter?: 'erp' | 'ops'
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as {
      keys?: RegistryVendorKeys
      aiVendorCatalog?: AiVendorCatalogEntry[]
      lastWriter?: 'erp' | 'ops'
    }
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const lastWriter = body.lastWriter === 'erp' ? 'erp' : 'ops'
  const data = await io.load()
  const patch = body.keys && typeof body.keys === 'object' ? body.keys : {}
  const merged: RegistryVendorKeys = { ...data.vendorKeys }
  for (const [id, v] of Object.entries(patch)) {
    if (!isValidAiVendorSlug(id)) continue
    if (v === undefined) continue
    const t = typeof v === 'string' ? sanitizeVendorApiKey(v) : ''
    if (!t) {
      delete merged[id]
      continue
    }
    const err = validateRegistryVendorKey(id, t)
    if (err) {
      return { status: 400, body: { ok: false, error: 'invalid_vendor_key', vendor: id, detail: err } }
    }
    merged[id] = t
  }
  data.vendorKeys = expandVendorKeysForRegistrySave(merged)
  if (body.aiVendorCatalog !== undefined) {
    data.aiVendorCatalog = mergeBuiltinAiVendorCatalog(
      Array.isArray(body.aiVendorCatalog) ? body.aiVendorCatalog : [],
    )
  }
  data.vendorKeysUpdatedAt = new Date().toISOString()
  data.vendorKeysWriter = lastWriter
  if (lastWriter === 'ops') {
    data.aiModels = {
      ...data.aiModels,
      controlledByOps: true,
      updatedAt: new Date().toISOString(),
      lastWriter: 'ops',
    }
  }
  await io.save(data)
  return { status: 200, body: { ok: true } }
}

export async function opsRegistrySupabaseSaveAiModels(
  io: RegistrySnapshotIo,
  bodyRaw: string,
): Promise<{ status: number; body: unknown }> {
  let body: {
    textModel?: string
    imageModel?: string
    lastWriter?: 'erp' | 'ops'
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as {
      textModel?: string
      imageModel?: string
      lastWriter?: 'erp' | 'ops'
    }
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const rawT = (body.textModel ?? '').trim().toLowerCase()
  const rawI = (body.imageModel ?? '').trim().toLowerCase()
  const textModel = !rawT || rawT === 'auto' ? 'auto' : rawT
  const imageModel = !rawI || rawI === 'auto' ? 'auto' : rawI
  const lastWriter = body.lastWriter === 'ops' ? 'ops' : 'erp'
  const data = await io.load()
  const controlledByOps = lastWriter === 'ops' ? true : data.aiModels.controlledByOps
  data.aiModels = {
    textModel,
    imageModel,
    updatedAt: new Date().toISOString(),
    lastWriter,
    controlledByOps,
  }
  await io.save(data)
  return { status: 200, body: { ok: true } }
}

export async function opsRegistrySupabaseSaveVideoAi(
  io: RegistrySnapshotIo,
  bodyRaw: string,
): Promise<{ status: number; body: unknown }> {
  let body: {
    videoAi?: RegistryVideoAi
    lastWriter?: 'erp' | 'ops'
  }
  try {
    body = JSON.parse(bodyRaw || '{}') as {
      videoAi?: RegistryVideoAi
      lastWriter?: 'erp' | 'ops'
    }
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } }
  }
  const lastWriter = body.lastWriter === 'erp' ? 'erp' : 'ops'
  const data = await io.load()
  const nextAi = normalizeRegistryVideoAi(body.videoAi ?? {})
  data.videoAi = Object.keys(nextAi).length > 0 ? nextAi : {}
  data.videoAiUpdatedAt = new Date().toISOString()
  data.videoAiWriter = lastWriter
  if (lastWriter === 'ops') {
    data.aiModels = {
      ...data.aiModels,
      controlledByOps: true,
      updatedAt: new Date().toISOString(),
      lastWriter: 'ops',
    }
  }
  await io.save(data)
  return { status: 200, body: { ok: true } }
}
