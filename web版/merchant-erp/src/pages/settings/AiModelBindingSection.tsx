import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiModelAutoPicker from '../../components/AiModelAutoPicker'
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

/** 仅展示已配置 API Key 的厂商；无本地 Key 且运营托管时，用当前下发的默认模型兜底（Key 可能仅在服务端合并）。 */
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
      return all.filter((m) => sel.has(m.id))
    }
    return []
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

  const bumpPickers = useCallback(() => {
    setTextModel(readStoredAiModel())
    setImageModel(readStoredImageAiModel())
  }, [])

  if (displayedOptions.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-medium text-gray-900">AI 模型绑定</h3>
      </div>
      <p className="text-sm font-medium text-gray-900">目前绑定的 AI 模型</p>
      <p className="mt-1 text-xs text-gray-500">
        自动：按已配置厂商 Key 与目录顺序选择；关闭「自动」后可指定模型。右侧展开可搜索。
      </p>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-800">文案</p>
          <div className="mt-2">
            <AiModelAutoPicker
              kind="text"
              options={displayedOptions}
              disabled={opsLocked}
              onResolutionChange={bumpPickers}
            />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-800">生图</p>
          <div className="mt-2">
            <AiModelAutoPicker
              kind="image"
              options={displayedOptions}
              disabled={opsLocked}
              onResolutionChange={bumpPickers}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
