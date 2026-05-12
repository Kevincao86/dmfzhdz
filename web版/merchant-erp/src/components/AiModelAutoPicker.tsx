import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import {
  MEOO_IMAGE_AI_AUTO_EVENT,
  MEOO_IMAGE_AI_MANUAL_EVENT,
  MEOO_TEXT_AI_AUTO_EVENT,
  MEOO_TEXT_AI_MANUAL_EVENT,
} from '../services/merchantAiModelStorage'
import {
  readImageAiAuto,
  readImageAiManualModel,
  readStoredAiModel,
  readStoredImageAiModel,
  readTextAiAuto,
  readTextAiManualModel,
  resolveImageAiModelForRequest,
  resolveTextAiModelForRequest,
  writeImageAiAuto,
  writeImageAiManualModel,
  writeTextAiAuto,
  writeTextAiManualModel,
} from '../services/merchantAiModelStorage'

export type AiModelAutoPickerKind = 'text' | 'image'

export type AiModelAutoPickerOption = { id: string; label: string; hint?: string }

type AiModelAutoPickerProps = {
  kind: AiModelAutoPickerKind
  options: readonly AiModelAutoPickerOption[]
  /** 仅展示，不可展开（如未来运营强锁场景） */
  disabled?: boolean
  className?: string
  /** 自动/手动或模型变化时通知父级（用于刷新 title 等） */
  onResolutionChange?: () => void
}

function labelForId(options: readonly AiModelAutoPickerOption[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id
}

export default function AiModelAutoPicker({
  kind,
  options,
  disabled = false,
  className,
  onResolutionChange,
}: AiModelAutoPickerProps) {
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tick, setTick] = useState(0)

  const bump = useCallback(() => {
    setTick((n) => n + 1)
    onResolutionChange?.()
  }, [onResolutionChange])

  useEffect(() => {
    const evs = [
      MEOO_TEXT_AI_AUTO_EVENT,
      MEOO_IMAGE_AI_AUTO_EVENT,
      MEOO_TEXT_AI_MANUAL_EVENT,
      MEOO_IMAGE_AI_MANUAL_EVENT,
      MEOO_REGISTRY_SYNC_EVENT,
      MEOO_AI_VENDOR_CATALOG_EVENT,
      'meoo-merchant-ai-model',
      'meoo-merchant-image-ai-model',
    ] as const
    const h = () => bump()
    for (const e of evs) window.addEventListener(e, h)
    return () => {
      for (const e of evs) window.removeEventListener(e, h)
    }
  }, [bump])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc, true)
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [open])

  const auto = kind === 'text' ? readTextAiAuto() : readImageAiAuto()
  const effectiveId = useMemo(() => {
    void tick
    return kind === 'text' ? resolveTextAiModelForRequest() : resolveImageAiModelForRequest()
  }, [kind, tick])

  const defaultStoredId = useMemo(() => {
    void tick
    return kind === 'text' ? readStoredAiModel() : readStoredImageAiModel()
  }, [kind, tick])

  const manualId = useMemo(() => {
    void tick
    return kind === 'text' ? readTextAiManualModel() : readImageAiManualModel()
  }, [kind, tick])

  const modelLabel = auto ? labelForId(options, defaultStoredId) : labelForId(options, manualId)

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...options]
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.id.toLowerCase().includes(q))
  }, [options, search])

  const setAuto = (next: boolean) => {
    if (disabled) return
    if (kind === 'text') {
      writeTextAiAuto(next)
      if (!next) {
        writeTextAiManualModel(readTextAiManualModel())
      }
    } else {
      writeImageAiAuto(next)
      if (!next) {
        writeImageAiManualModel(readImageAiManualModel())
      }
    }
    bump()
  }

  const pickModel = (id: string) => {
    if (disabled) return
    if (kind === 'text') {
      writeTextAiAuto(false)
      writeTextAiManualModel(id)
    } else {
      writeImageAiAuto(false)
      writeImageAiManualModel(id)
    }
    bump()
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={rootRef} className={cn('relative inline-block text-left', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'inline-flex min-w-[9.5rem] items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          kind === 'text'
            ? 'border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50'
            : 'border-violet-200 bg-white text-violet-900 hover:bg-violet-50',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide',
              auto ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
            )}
          >
            {auto ? '自动' : '手动'}
          </span>
          <span className="truncate">{modelLabel}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-70', open && 'rotate-180')} aria-hidden />
      </button>

      {open && !disabled ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={kind === 'text' ? '文案 AI 模型' : '生图 AI 模型'}
          className="absolute left-0 z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white py-2 shadow-xl ring-1 ring-black/5"
        >
          <div className="px-3 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
          </div>

          <div className="border-b border-gray-100 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">自动</p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                  跟随系统设置中的默认模型；运营侧更新后约 2.5 秒内生效。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                onClick={() => setAuto(!auto)}
                className={cn(
                  'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors',
                  auto ? 'bg-emerald-500' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    auto && 'translate-x-4',
                  )}
                />
              </button>
            </div>
          </div>

          {!auto ? (
            <div className="max-h-52 overflow-y-auto px-2 pt-1">
              <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-400">指定模型</p>
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-2 text-xs text-gray-500">无匹配项</p>
              ) : (
                filteredOptions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pickModel(m.id)}
                    className={cn(
                      'flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs font-medium text-gray-800 hover:bg-gray-50',
                      effectiveId === m.id && 'bg-indigo-50 text-indigo-900',
                    )}
                  >
                    {m.label}
                  </button>
                ))
              )}
            </div>
          ) : null}

          <p className="mt-1 border-t border-gray-50 px-3 pt-2 text-[10px] text-gray-400">
            当前请求将使用：{labelForId(options, effectiveId)}
          </p>
        </div>
      ) : null}
    </div>
  )
}
