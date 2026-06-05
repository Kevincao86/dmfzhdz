import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import AiVendorCatalogAvatar from './AiVendorCatalogAvatar'
import { cn } from '../cn'
import { MEOO_REGISTRY_SYNC_EVENT } from '../lib/opsRegistryConstants'
import { MEOO_AI_VENDOR_CATALOG_EVENT } from '../services/merchantAiVendorCatalogClient'
import {
  MEOO_IMAGE_AI_AUTO_EVENT,
  MEOO_IMAGE_AI_MANUAL_EVENT,
  MEOO_TEXT_AI_AUTO_EVENT,
  MEOO_TEXT_AI_MANUAL_EVENT,
  pickAutoResolvedImageModel,
  pickAutoResolvedTextModel,
  readImageAiAuto,
  readImageAiManualModel,
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

export type AiModelAutoPickerOption = { id: string; label: string; hint?: string; logoUrl?: string }

type AiModelAutoPickerProps = {
  kind: AiModelAutoPickerKind
  options: readonly AiModelAutoPickerOption[]
  /** 仅展示，不可展开（如未来运营强锁场景） */
  disabled?: boolean
  className?: string
  /** 自动/手动或模型变化时通知父级（用于刷新 title 等） */
  onResolutionChange?: () => void
  /**
   * 在按钮旁常驻「自动」开关（下拉内不再重复），避免用户找不到自动模式。
   * @default true
   */
  showInlineAutoToggle?: boolean
  /** 手选时触发器仅展示 logo + 名称（无「指定：」前缀） */
  compactManualTrigger?: boolean
}

function labelForId(options: readonly AiModelAutoPickerOption[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? id
}

function optionById(options: readonly AiModelAutoPickerOption[], id: string): AiModelAutoPickerOption | undefined {
  return options.find((o) => o.id === id)
}

export default function AiModelAutoPicker({
  kind,
  options,
  disabled = false,
  className,
  onResolutionChange,
  showInlineAutoToggle = true,
  compactManualTrigger = false,
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

  const manualId = useMemo(() => {
    void tick
    return kind === 'text' ? readTextAiManualModel() : readImageAiManualModel()
  }, [kind, tick])

  const triggerLabel = showInlineAutoToggle
    ? auto
      ? '自动'
      : compactManualTrigger
        ? labelForId(options, manualId)
        : `指定：${labelForId(options, manualId)}`
    : auto
      ? `自动 · ${labelForId(options, effectiveId)}`
      : labelForId(options, manualId)

  const manualOpt = optionById(options, manualId)
  const effectiveOpt = optionById(options, effectiveId)
  const pickerHighlightId = auto ? effectiveId : manualId

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return [...options]
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        (o.hint && o.hint.toLowerCase().includes(q)),
    )
  }, [options, search])

  const setAuto = (next: boolean) => {
    if (disabled) return
    if (kind === 'text') {
      writeTextAiAuto(next)
      if (!next) {
        writeTextAiManualModel(pickAutoResolvedTextModel())
      }
    } else {
      writeImageAiAuto(next)
      if (!next) {
        writeImageAiManualModel(pickAutoResolvedImageModel())
      } else {
        writeImageAiManualModel(pickAutoResolvedImageModel())
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

  const inlineAuto = showInlineAutoToggle && !disabled

  return (
    <div ref={rootRef} className={cn('relative flex flex-wrap items-center gap-2 text-left', className)}>
      {inlineAuto ? (
        <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-2.5 py-1 shadow-sm">
          <span className="text-[11px] font-semibold embed-text-secondary">自动</span>
          <button
            type="button"
            role="switch"
            aria-checked={auto}
            aria-label={kind === 'text' ? '文案模型跟随系统默认' : '生图模型跟随系统默认'}
            onClick={() => setAuto(!auto)}
            className={cn(
              'relative h-6 w-10 shrink-0 rounded-full transition-colors',
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
      ) : null}

      {inlineAuto && auto && options.length > 0 ? (
        <div
          className="flex max-w-[10.5rem] items-center gap-0.5 overflow-hidden rounded-full border border-gray-100 bg-white/95 px-1.5 py-1 shadow-sm sm:max-w-[14rem]"
          title={options.map((o) => o.label).join('、')}
        >
          {options.map((o) => (
            <AiVendorCatalogAvatar key={o.id} id={o.id} label={o.label} logoUrl={o.logoUrl} size="xs" />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          'inline-flex min-w-[8.5rem] items-center justify-between gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          kind === 'text'
            ? 'border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50'
            : 'border-violet-200 bg-white text-violet-900 hover:bg-violet-50',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
          {!auto && manualOpt ? (
            <AiVendorCatalogAvatar
              id={manualOpt.id}
              label={manualOpt.label}
              logoUrl={manualOpt.logoUrl}
              size="xs"
            />
          ) : null}
          {showInlineAutoToggle ? null : auto && effectiveOpt ? (
            <AiVendorCatalogAvatar
              id={effectiveOpt.id}
              label={effectiveOpt.label}
              logoUrl={effectiveOpt.logoUrl}
              size="xs"
            />
          ) : null}
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-70', open && 'rotate-180')} aria-hidden />
      </button>

      {open && !disabled ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={kind === 'text' ? '文案 AI 模型' : '生图 AI 模型'}
          className="absolute left-0 top-full z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white py-2 shadow-xl ring-1 ring-black/5"
        >
          <div className="px-3 pb-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索模型"
              className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
            />
          </div>

          {!showInlineAutoToggle ? (
            <div className="border-b border-gray-100 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">自动</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                    按目录与已配置 Key 自动选择；运营侧更新 Key 后约 2.5 秒内生效。
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
          ) : auto ? (
            <div className="space-y-2 border-b border-gray-100 px-3 pb-2">
              <p className="text-[11px] leading-snug text-gray-500">
                已开启自动：按目录顺序优先使用<strong className="font-medium text-gray-700"> 已配置 API Key</strong>
                的厂商；关闭「自动」后可搜索并指定模型。
              </p>
              {options.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {options.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1"
                    >
                      <AiVendorCatalogAvatar id={o.id} label={o.label} logoUrl={o.logoUrl} size="sm" />
                      <span className="text-xs font-medium text-gray-800">{o.label}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

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
                      'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-gray-800 hover:bg-gray-50',
                      pickerHighlightId === m.id &&
                        (kind === 'text' ? 'bg-indigo-50 text-indigo-900' : 'bg-violet-50 text-violet-900'),
                    )}
                  >
                    <AiVendorCatalogAvatar id={m.id} label={m.label} logoUrl={m.logoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          <p className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-gray-50 px-3 pt-2 text-[10px] text-gray-400">
            <span>当前请求将使用：</span>
            {effectiveOpt ? (
              <>
                <AiVendorCatalogAvatar id={effectiveOpt.id} label={effectiveOpt.label} logoUrl={effectiveOpt.logoUrl} size="xs" />
                <span className="font-medium text-gray-600">{effectiveOpt.label}</span>
              </>
            ) : (
              <span className="font-medium text-gray-600">{labelForId(options, effectiveId)}</span>
            )}
          </p>
        </div>
      ) : null}
    </div>
  )
}
