/**
 * 运营台注册表中与 AI 模型 / Key / 短视频网关相关的写入（无 node:crypto）。
 * 供独立 Vercel 路由与 dispatch 共用，避免 POST 冷启动拉整包租户/招聘逻辑导致 FUNCTION_INVOCATION_FAILED。
 */
import { isValidAiVendorSlug, mergeBuiltinAiVendorCatalog } from '../meooRegistryShared/aiVendorCatalogShared'
import type {
  AiVendorCatalogEntry,
  RegistryVendorKeys,
  RegistryVideoAi,
} from '../meooRegistryShared/opsRegistryTypes'
import { DEFAULT_AI } from '../meooRegistryShared/opsRegistryGatewayCore'
import { normalizeRegistryVideoAi } from '../meooRegistryShared/registryVideoAiNormalize'
import type { RegistrySnapshotIo } from './registrySnapshotIo'

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
  const next: RegistryVendorKeys = { ...data.vendorKeys }
  const patch = body.keys && typeof body.keys === 'object' ? body.keys : {}
  for (const [id, v] of Object.entries(patch)) {
    if (!isValidAiVendorSlug(id)) continue
    if (v === undefined) continue
    const t = typeof v === 'string' ? v.trim() : ''
    if (t) next[id] = t
    else delete next[id]
  }
  data.vendorKeys = next
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
  const textModel = (body.textModel ?? '').trim() || DEFAULT_AI.textModel
  const imageModel = (body.imageModel ?? '').trim() || DEFAULT_AI.imageModel
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
