import { Sparkles } from 'lucide-react'
/** 系统设置「平台连接」：仅展示厂商 chips，勿再挂载 AiModelAutoPicker（文案/生图指定已下线）。 */
import { useEffect, useMemo, useState } from 'react'
import AiVendorDirectoryChips from '../../components/AiVendorDirectoryChips'
import { MEOO_REGISTRY_SYNC_EVENT } from '../../lib/opsRegistryConstants'
import { listAiUiModelOptions } from '../../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../../services/merchantAiVendorCatalogClient'
import { readVendorKeyMap } from '../../services/merchantAiVendorKeysStorage'
import { readStoredAiModel, readStoredImageAiModel } from '../../services/merchantAiModelStorage'

function useAiCatalogTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
    window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
    return () => {
      window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
      window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
    }
  }, [])
  return tick
}

/** 用于 chips：优先展示已配置 API Key 的厂商；无 Key 且运营托管时用默认模型；否则仍展示内置目录（避免整块区域空白）。 */
function useDisplayedAiModelOptions(
  opsLocked: boolean,
  textModel: string,
  imageModel: string,
  catalogTick: number,
) {
  return useMemo(() => {
    const all = listAiUiModelOptions()
    const keys = readVendorKeyMap()
    const withKey = all.filter((m) => Boolean(keys[m.id]?.trim()))
    if (withKey.length > 0) return withKey
    if (opsLocked) {
      const sel = new Set(
        [textModel, imageModel]
          .map((x) => String(x ?? '').trim().toLowerCase())
          .filter(Boolean),
      )
      const locked = all.filter((m) => sel.has(m.id))
      if (locked.length > 0) return locked
    }
    return all
  }, [catalogTick, opsLocked, textModel, imageModel])
}

export default function AiModelBindingSection() {
  const [textModel, setTextModel] = useState(() => readStoredAiModel())
  const [imageModel, setImageModel] = useState(() => readStoredImageAiModel())
  const [opsLocked, setOpsLocked] = useState(false)
  const catalogTick = useAiCatalogTick()

  const displayedOptions = useDisplayedAiModelOptions(opsLocked, textModel, imageModel, catalogTick)

  useEffect(() => {
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<{ controlledByOps?: boolean }>).detail
      setOpsLocked(!!d?.controlledByOps)
      setTextModel(readStoredAiModel())
      setImageModel(readStoredImageAiModel())
    }
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync as EventListener)
    return () => window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, onSync as EventListener)
  }, [])

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-medium text-gray-900">AI 模型绑定</h3>
      </div>
      <p className="text-sm font-medium text-gray-900">目前绑定的 AI 模型</p>
      <p className="mt-1 text-xs text-gray-500">
        下方为当前目录中的模型（logo + 名称）。已填写本地 API Key 的厂商会优先列出；未配置时展示内置目录供对照。文案 / 生图路由由运营注册表、Key 与内置策略自动解析；本页
        <strong className="font-medium text-gray-700">不提供</strong>
        模型切换下拉。
      </p>
      <div className="mt-3">
        <AiVendorDirectoryChips options={displayedOptions} />
      </div>
    </div>
  )
}
