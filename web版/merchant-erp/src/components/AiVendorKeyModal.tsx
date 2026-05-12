import { KeyRound, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AiVendorCatalogAvatar from './AiVendorCatalogAvatar'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import type { AiModelId } from '../services/douyinAiAssistApi'
import { listAiUiModelOptions } from '../services/douyinAiAssistApi'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import { patchVendorKeyMap, readVendorKeyMap, type VendorKeyMap } from '../services/merchantAiVendorKeysStorage'

const PLACEHOLDER_DEFAULT = '留空表示清除；由运营台或本机保存的 Key'

export type AiVendorKeyModalProps = {
  open: boolean
  /** 保存传 true，取消传 false */
  onFinished: (saved: boolean) => void
  highlightModel?: AiModelId | null
  notice?: string | null
}

export default function AiVendorKeyModal({
  open,
  onFinished,
  highlightModel,
  notice,
}: AiVendorKeyModalProps) {
  const [tab, setTab] = useState<string>('qwen')
  const [draft, setDraft] = useState<VendorKeyMap>(() => readVendorKeyMap())
  const [optTick, setOptTick] = useState(0)

  const bumpOptions = useCallback(() => setOptTick((n) => n + 1), [])

  useEffect(() => {
    window.addEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bumpOptions)
    window.addEventListener(MEOO_REGISTRY_SYNC_EVENT, bumpOptions)
    return () => {
      window.removeEventListener(MEOO_AI_VENDOR_CATALOG_EVENT, bumpOptions)
      window.removeEventListener(MEOO_REGISTRY_SYNC_EVENT, bumpOptions)
    }
  }, [bumpOptions])

  const catalog = useMemo(() => listAiUiModelOptions(), [optTick, open])

  useEffect(() => {
    if (!open) return
    setDraft(readVendorKeyMap())
  }, [open, optTick])

  useEffect(() => {
    if (!open) return
    const want = (highlightModel ?? 'qwen').trim().toLowerCase()
    const cat = listAiUiModelOptions()
    const first = cat[0]?.id ?? 'qwen'
    setTab(cat.some((t) => t.id === want) ? want : first)
  }, [open, highlightModel, optTick])

  if (!open) return null

  const current = catalog.find((x) => x.id === tab) ?? catalog[0]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-vendor-key-title"
      onClick={() => onFinished(false)}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-indigo-600" />
            <h2 id="ai-vendor-key-title" className="text-lg font-semibold text-gray-900">
              补充 AI 厂商 API Key
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onFinished(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {notice ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {notice}
            </div>
          ) : null}
          <div className="text-xs text-gray-600">
            Key 仅保存在本浏览器中，用于向您已绑定的 AI 服务发起请求。若部署环境已在服务端配置了同名厂商
            Key，将优先使用服务端配置，弹窗中的填写值用于补充或未配置时的本机调试。
          </div>

          <div className="flex flex-wrap gap-1 border-b border-gray-100 pb-2">
            {catalog.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTab(m.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                  tab === m.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                )}
              >
                <AiVendorCatalogAvatar id={m.id} label={m.label} logoUrl={m.logoUrl} size="xs" />
                {m.label}
              </button>
            ))}
          </div>

          {current ? (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <AiVendorCatalogAvatar id={current.id} label={current.label} logoUrl={current.logoUrl} size="sm" />
                {current.label} API Key
              </label>
              <input
                type="password"
                autoComplete="off"
                value={draft[current.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [current.id]: e.target.value }))}
                placeholder={PLACEHOLDER_DEFAULT}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="text-xs text-gray-500">
                {current.hint?.trim() ||
                  '运营后台「AI 模型」可补充该厂商说明；部分供应商需环境与账号开通后方可实际调用，详询管理员。'}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">暂无供应商目录，请确认运营台同步或刷新页面。</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-4">
          <button
            type="button"
            onClick={() => onFinished(false)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              patchVendorKeyMap(draft)
              onFinished(true)
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            保存并重试
          </button>
        </div>
      </div>
    </div>
  )
}
