import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../../lib/opsRegistryConstants'
import { listAiUiModelOptions } from '../../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../../services/merchantAiVendorCatalogClient'
import {
  readStoredAiModel,
  readStoredImageAiModel,
  writeStoredAiModel,
  writeStoredImageAiModel,
} from '../../services/merchantAiModelStorage'

export default function AiModelBindingSection() {
  const [textModel, setTextModel] = useState(() => readStoredAiModel())
  const [imageModel, setImageModel] = useState(() => readStoredImageAiModel())
  const [opsLocked, setOpsLocked] = useState(false)
  const [optionsTick, setOptionsTick] = useState(0)

  const modelOptions = useMemo(() => listAiUiModelOptions(), [optionsTick])

  useEffect(() => {
    const bump = () => setOptionsTick((n) => n + 1)
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
    window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
    return () => {
      window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, bump)
      window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bump)
    }
  }, [])

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

  const selectText = useCallback(
    (id: string) => {
      if (opsLocked) return
      setTextModel(id)
      writeStoredAiModel(id)
    },
    [opsLocked],
  )

  const selectImage = useCallback(
    (id: string) => {
      if (opsLocked) return
      setImageModel(id)
      writeStoredImageAiModel(id)
    },
    [opsLocked],
  )

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-medium text-gray-900">AI 模型绑定</h3>
      </div>
      {opsLocked ? (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          当前租户已由运营侧<strong className="mx-1">统一管理</strong>
          下发默认模型与各厂商 API Key；本页为只读展示。如需变更模型或 Key，请联系贵司对接的运营同事或客服。
        </div>
      ) : (
        <p className="text-sm text-gray-600">
          「创建商品」页内文案与生图可分别选模型；此处为进入页面时的默认项。运营台可扩展更多厂商目录，约 2.5
          秒内与本页同步。各厂商 Key 由运营后台或本机弹窗维护；服务端已配置的密钥仍优先生效。
        </p>
      )}
      <p className="mt-3 text-xs font-medium text-gray-800">默认文案模型</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="默认文案 AI 模型">
        {modelOptions.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={textModel === m.id}
            disabled={opsLocked}
            onClick={() => selectText(m.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              textModel === m.id
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              opsLocked && 'cursor-not-allowed opacity-60',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs font-medium text-gray-800">默认生图模型</p>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="默认生图 AI 模型">
        {modelOptions.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={imageModel === m.id}
            disabled={opsLocked}
            onClick={() => selectImage(m.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              imageModel === m.id
                ? 'border-violet-600 bg-violet-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              opsLocked && 'cursor-not-allowed opacity-60',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {!opsLocked ? (
        <p className="mt-4 text-xs text-gray-500">
          运营台新增的供应商会同步出现在上方面板；若所选厂商尚未在您环境中开通，生成能力可能不可用，请咨询管理员。
        </p>
      ) : null}
    </div>
  )
}
