import { useEffect, useRef } from 'react'
import { buildErpRegistryTenant } from '../lib/buildErpRegistryTenant'
import { syncManualTenantsFromRegistry } from '../lib/syncRegistryManualAccounts'
import {
  MEOO_REGISTRY_AI_APPLIED_AT_KEY,
  MEOO_REGISTRY_AI_SESSION_BOOTSTRAP_KEY,
  MEOO_REGISTRY_SYNC_EVENT,
  MEOO_VENDOR_KEYS_APPLIED_AT_KEY,
} from '../lib/opsRegistryConstants'
import { pushAiModels, pushErpTenant, fetchOpsRegistry } from '../lib/opsRegistryClient'
import { isBuiltinAiVendorId, isValidAiVendorSlug } from '../lib/aiVendorCatalogShared'
import type { RegistryFile } from '../lib/opsRegistryTypes'
import { patchVendorKeyMap } from '../services/merchantAiVendorKeysStorage'
import { applyAiVendorCatalogFromRegistry } from '../services/merchantAiVendorCatalogClient'
import {
  MEOO_IMAGE_AI_AUTO_EVENT,
  MEOO_IMAGE_AI_MANUAL_EVENT,
  MEOO_TEXT_AI_AUTO_EVENT,
  MEOO_TEXT_AI_MANUAL_EVENT,
  readImageAiAuto,
  readImageAiManualModel,
  readTextAiAuto,
  readTextAiManualModel,
  subscribeStoredAiModel,
  subscribeStoredImageAiModel,
  writeStoredAiModel,
  writeStoredImageAiModel,
} from '../services/merchantAiModelStorage'

function vendorIdSyncedFromOps(reg: RegistryFile, raw: string): boolean {
  const id = raw.trim().toLowerCase()
  if (!id) return false
  if (isBuiltinAiVendorId(id)) return true
  if (!isValidAiVendorSlug(id)) return false
  return (reg.aiVendorCatalog ?? []).some((e) => e.id === id)
}

function applyAiFromRegistry(reg: RegistryFile) {
  const remote = reg.aiModels
  const lastApplied = sessionStorage.getItem(MEOO_REGISTRY_AI_APPLIED_AT_KEY) ?? ''
  const sessionBootDone = sessionStorage.getItem(MEOO_REGISTRY_AI_SESSION_BOOTSTRAP_KEY) === '1'
  const writerSaysOps = remote.controlledByOps === true || remote.lastWriter === 'ops'
  const shouldApply =
    remote.updatedAt > lastApplied && (writerSaysOps || !sessionBootDone)
  if (!shouldApply) return

  const tm = remote.textModel.trim().toLowerCase()
  const im = remote.imageModel.trim().toLowerCase()
  if (tm && tm !== 'auto' && vendorIdSyncedFromOps(reg, tm)) writeStoredAiModel(tm)
  if (im && im !== 'auto' && vendorIdSyncedFromOps(reg, im)) writeStoredImageAiModel(im)
  sessionStorage.setItem(MEOO_REGISTRY_AI_APPLIED_AT_KEY, remote.updatedAt)
  sessionStorage.setItem(MEOO_REGISTRY_AI_SESSION_BOOTSTRAP_KEY, '1')
}

function applyVendorKeysFromRegistry(reg: RegistryFile) {
  if (reg.vendorKeysWriter !== 'ops') return
  const applied = sessionStorage.getItem(MEOO_VENDOR_KEYS_APPLIED_AT_KEY) ?? ''
  if (reg.vendorKeysUpdatedAt <= applied) return
  const patch: Partial<Record<string, string>> = {}
  for (const [id, val] of Object.entries(reg.vendorKeys)) {
    if (!isValidAiVendorSlug(id)) continue
    patch[id] = typeof val === 'string' ? val : ''
  }
  patchVendorKeyMap(patch)
  sessionStorage.setItem(MEOO_VENDOR_KEYS_APPLIED_AT_KEY, reg.vendorKeysUpdatedAt)
}

function dispatchSync(reg: RegistryFile) {
  try {
    window.dispatchEvent(
      new CustomEvent(MEOO_REGISTRY_SYNC_EVENT, {
        detail: { controlledByOps: !!reg.aiModels.controlledByOps },
      }),
    )
  } catch {
    /* ignore */
  }
}

/**
 * Dev：子账号、试用、AI 模型与厂商 Key 与运营管控台注册表同步。
 */
export default function OpsRegistryBridge() {
  const controlledByOpsRef = useRef(false)
  const applyingRemoteAi = useRef(false)

  useEffect(() => {
    let cancelled = false

    const pullFromRegistry = async () => {
      try {
        const reg = await fetchOpsRegistry()
        if (cancelled) return
        controlledByOpsRef.current = !!reg.aiModels.controlledByOps
        applyingRemoteAi.current = true
        applyAiVendorCatalogFromRegistry(reg)
        applyAiFromRegistry(reg)
        applyVendorKeysFromRegistry(reg)
        syncManualTenantsFromRegistry(reg)
        applyingRemoteAi.current = false
        dispatchSync(reg)
      } catch {
        /* ignore */
      }
    }

    const pushTenant = async () => {
      try {
        const tenant = buildErpRegistryTenant()
        if (!tenant) return
        await pushErpTenant(tenant)
      } catch {
        /* ignore */
      }
    }

    const pushAi = async () => {
      if (applyingRemoteAi.current || controlledByOpsRef.current) return
      try {
        await pushAiModels({
          textModel: readTextAiAuto() ? 'auto' : readTextAiManualModel(),
          imageModel: readImageAiAuto() ? 'auto' : readImageAiManualModel(),
          lastWriter: 'erp',
          controlledByOps: false,
        })
      } catch {
        /* ignore */
      }
    }

    const tick = async () => {
      if (cancelled) return
      await pullFromRegistry()
      await pushTenant()
      await pushAi()
    }

    void tick()

    const interval = window.setInterval(() => void tick(), 15_000)

    const onVis = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('meoo-subaccounts-changed', tick)

    const unsubText = subscribeStoredAiModel(() => {
      void pushAi()
    })
    const unsubImg = subscribeStoredImageAiModel(() => {
      void pushAi()
    })

    const autoManualEvents = [
      MEOO_TEXT_AI_AUTO_EVENT,
      MEOO_IMAGE_AI_AUTO_EVENT,
      MEOO_TEXT_AI_MANUAL_EVENT,
      MEOO_IMAGE_AI_MANUAL_EVENT,
    ] as const
    const onAutoManual = () => void pushAi()
    for (const ev of autoManualEvents) window.addEventListener(ev, onAutoManual)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('meoo-subaccounts-changed', tick)
      unsubText()
      unsubImg()
      for (const ev of autoManualEvents) window.removeEventListener(ev, onAutoManual)
    }
  }, [])

  return null
}
