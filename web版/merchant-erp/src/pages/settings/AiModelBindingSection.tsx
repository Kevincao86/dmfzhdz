import { Sparkles } from 'lucide-react'
/** 系统设置「平台连接」：仅展示厂商 chips，勿再挂载 AiModelAutoPicker（文案/生图指定已下线）。 */
import { useEffect, useMemo, useState } from 'react'
import AiVendorDirectoryChips from '../../components/AiVendorDirectoryChips'
import { MEOO_REGISTRY_SYNC_EVENT } from '../../lib/opsRegistryConstants'
import { listAiUiModelOptions } from '../../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../../services/merchantAiVendorCatalogClient'

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

export default function AiModelBindingSection() {
  const catalogTick = useAiCatalogTick()

  /** 与商品向导「文案类」一致：始终展示完整内置目录（含 OpenAI、Claude、DeepSeek、Kimi 等），便于对照与 Key 管理 */
  const displayedOptions = useMemo(() => listAiUiModelOptions(), [catalogTick])

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-indigo-600" />
        <h3 className="text-lg font-medium text-gray-900">AI 模型绑定</h3>
      </div>
      <p className="text-sm font-medium text-gray-900">AI 模型目录</p>
      <p className="mt-1 text-xs text-gray-500">
        下方为当前内置与运营同步目录中的全部模型（logo + 名称），与商品创建页「AI 模型（可选）」中文案类可选项一致。请在同页「管理各模型 API Key」为需用的厂商填写
        Key。文案 / 生图路由由注册表、Key 与内置策略解析；本页
        <strong className="font-medium text-gray-700">不提供</strong>
        模型切换下拉。
      </p>
      <div className="mt-3">
        <AiVendorDirectoryChips options={displayedOptions} />
      </div>
    </div>
  )
}
