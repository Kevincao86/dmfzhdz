import { Move, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../cn'
import { inferVoucherPricesFromTitle } from '../../lib/douyinProductImageAnchor'
import { buildTradeRuleDescriptionLines, type DouyinProductFormRules } from '../../lib/douyinProductRuleText'

function parseYuanInput(raw: string): number | null {
  const n = Number.parseFloat(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

function formatPreviewYuan(raw: string, fallback?: number): string {
  const n = parseYuanInput(raw) ?? (fallback != null && fallback > 0 ? fallback : null)
  if (n == null) return '—'
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

export type DouyinPreviewComboLine = { name: string; qty: string; price: string }

type PreviewTab = 'product' | 'notice' | 'reviews' | 'recommend'

type Props = {
  productName: string
  productDesc: string
  priceYuan: string
  originYuan: string
  headUrl: string
  envUrls: string[]
  productType: number | null
  comboLines: DouyinPreviewComboLine[]
  poiCount: number
  formRules: DouyinProductFormRules
  /** 内嵌侧栏（大屏） */
  embedded?: boolean
  className?: string
}

function PreviewPhone({
  tab,
  setTab,
  props,
  displayPrice,
  displayOrigin,
  directBuyPrice,
  ruleLines,
}: {
  tab: PreviewTab
  setTab: (t: PreviewTab) => void
  props: Props
  displayPrice: string
  displayOrigin: string
  directBuyPrice: string
  ruleLines: string[]
}) {
  const tabs: { id: PreviewTab; label: string }[] = [
    { id: 'product', label: '商品' },
    { id: 'notice', label: '须知' },
    { id: 'reviews', label: '评价' },
    { id: 'recommend', label: '推荐' },
  ]

  const gallery = [props.headUrl, ...props.envUrls.filter((u) => u.trim())].filter(Boolean)

  return (
    <div className="mx-auto max-w-[280px] overflow-hidden rounded-2xl border-[6px] border-gray-900 bg-white shadow-inner">
      <div className="flex items-center gap-2 border-b bg-white px-2 py-1.5 text-[10px] text-gray-500">
        <span className="rounded-full bg-gray-100 px-2 py-0.5">搜索</span>
        <span className="flex-1 truncate text-center text-gray-400">抖音来客团购预览</span>
      </div>
      <div className="flex border-b text-[10px]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex-1 py-2 text-center',
              tab === t.id ? 'font-semibold text-gray-900 border-b-2 border-gray-900' : 'text-gray-500',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'product' && (
        <>
          <div className="relative aspect-[4/3] bg-gray-100">
            {gallery[0] ? (
              <img src={gallery[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-gray-400">头图</div>
            )}
            {gallery.length > 1 ? (
              <span className="absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] text-white">
                1/{gallery.length}
              </span>
            ) : null}
          </div>
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-2 py-2 text-white">
            <div className="flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] opacity-90">优惠价</p>
                <p className="text-lg font-bold leading-none">¥{displayPrice}</p>
              </div>
              {displayOrigin !== '—' ? (
                <p className="text-[10px] line-through opacity-80">¥{displayOrigin}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 p-2">
            <p className="line-clamp-2 text-[11px] font-bold leading-tight text-gray-900">
              {props.productName.trim() || '商品名称'}
            </p>
            {props.productType === 1 && props.comboLines.length > 0 ? (
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="text-[10px] font-semibold text-gray-800">团购详情</p>
                <ul className="mt-1 space-y-0.5 text-[9px] text-gray-700">
                  {props.comboLines.map((it, idx) => (
                    <li key={`${it.name}-${idx}`} className="flex justify-between gap-1">
                      <span className="truncate">{it.name}</span>
                      <span className="shrink-0">({it.qty || 1}份)</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {gallery.length > 1 ? (
              <div>
                <p className="text-[10px] font-semibold text-gray-800">图片详情</p>
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {gallery.slice(1, 4).map((u, i) => (
                    <img key={i} src={u} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

      {tab === 'notice' && (
        <div className="max-h-64 space-y-2 overflow-y-auto p-2 text-[10px] text-gray-700">
          <p className="font-bold text-gray-900">购买须知</p>
          {ruleLines.length > 0 ? (
            <ul className="space-y-1.5">
              {ruleLines.map((line, i) => (
                <li key={i} className="leading-snug">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">{props.productDesc.trim() || '规则与说明将展示在此'}</p>
          )}
          <p className="text-gray-400">适用门店 {props.poiCount} 家</p>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="p-4 text-center text-[10px] text-gray-400">评价区（预览占位）</div>
      )}

      {tab === 'recommend' && (
        <div className="p-4 text-center text-[10px] text-gray-400">推荐区（预览占位）</div>
      )}

      <div className="flex border-t border-gray-100 bg-gray-50 px-2 py-2 text-[9px] text-gray-600">
        <span className="flex-1 text-center">收藏</span>
        <span className="flex-1 text-center font-medium text-gray-800">直接购买 ¥{directBuyPrice}</span>
        <span className="flex-1 text-center font-semibold text-rose-600">App ¥{displayPrice}</span>
      </div>
    </div>
  )
}

export function DouyinProductMobilePreviewFrame(props: Props) {
  const [tab, setTab] = useState<PreviewTab>('product')
  const inferred = useMemo(
    () => inferVoucherPricesFromTitle(props.productName),
    [props.productName],
  )
  const displayPrice = formatPreviewYuan(props.priceYuan, inferred.sale)
  const displayOrigin = formatPreviewYuan(props.originYuan, inferred.origin)
  const directBuyPrice = displayOrigin !== '—' ? displayOrigin : displayPrice
  const ruleLines = useMemo(() => buildTradeRuleDescriptionLines(props.formRules), [props.formRules])

  return (
    <PreviewPhone
      tab={tab}
      setTab={setTab}
      props={props}
      displayPrice={displayPrice}
      displayOrigin={displayOrigin}
      directBuyPrice={directBuyPrice}
      ruleLines={ruleLines}
    />
  )
}

/** 悬浮预览：随页面滚动与鼠标纵向位置在视口内移动 */
export function DouyinProductScrollFollowPreview(props: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(88)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (collapsed) return
    let raf = 0
    const clampTop = (y: number) => {
      const h = panelRef.current?.offsetHeight ?? 420
      const margin = 12
      const minTop = 64
      const maxTop = Math.max(minTop, window.innerHeight - h - margin)
      return Math.max(minTop, Math.min(maxTop, y))
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setTop(clampTop(window.scrollY + 72))
      })
    }
    const onMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        setTop(clampTop(e.clientY - 100))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    onScroll()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [collapsed])

  if (collapsed) {
    return (
      <button
        type="button"
        className="fixed right-4 z-[54] rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-lg hover:bg-gray-50"
        style={{ top }}
        onClick={() => setCollapsed(false)}
      >
        展开 C 端预览
      </button>
    )
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        'fixed right-4 z-[54] w-[min(100vw-2rem,300px)] rounded-xl border border-gray-200 bg-white shadow-2xl',
        props.className,
      )}
      style={{ top }}
    >
      <div className="flex items-center justify-between border-b bg-gray-50 px-3 py-2">
        <span className="text-xs font-semibold text-gray-800">C 端预览</span>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:bg-gray-200"
          onClick={() => setCollapsed(true)}
        >
          收起
        </button>
      </div>
      <div className="max-h-[min(70vh,520px)] overflow-y-auto p-3">
        <DouyinProductMobilePreviewFrame {...props} embedded />
        <p className="mt-2 text-center text-[10px] text-gray-400">随滚动/鼠标移动 · 布局参考抖音来客团购页</p>
      </div>
    </div>
  )
}

/** @deprecated 侧栏内嵌，请用 DouyinProductScrollFollowPreview */
export function DouyinProductPreviewAside(props: Props) {
  return (
    <aside className={cn('hidden xl:block', props.className)}>
      <div className="sticky top-20 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-semibold text-gray-900">C 端预览</p>
        <DouyinProductMobilePreviewFrame {...props} embedded />
        <p className="mt-2 text-center text-[10px] text-gray-400">布局参考抖音来客团购页</p>
      </div>
    </aside>
  )
}

/** 可拖拽悬浮预览（随页面滚动保持 fixed） */
export function DouyinProductFloatingPreview({
  open,
  onClose,
  ...previewProps
}: Props & { open: boolean; onClose: () => void }) {
  const [pos, setPos] = useState({ x: 24, y: 96 })

  useEffect(() => {
    if (!open) return
    const w = window.innerWidth
    setPos((p) => ({
      x: Math.min(p.x, Math.max(8, w - 296)),
      y: Math.min(p.y, Math.max(8, window.innerHeight - 200)),
    }))
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed z-[55] w-[min(100vw-2rem,300px)] rounded-xl border border-gray-200 bg-white shadow-2xl"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab items-center justify-between border-b bg-gray-50 px-2 py-1.5 active:cursor-grabbing"
        onMouseDown={(e) => {
          e.preventDefault()
          const sx = e.clientX
          const sy = e.clientY
          const ox = pos.x
          const oy = pos.y
          const onMove = (ev: MouseEvent) => {
            setPos({
              x: Math.max(8, Math.min(window.innerWidth - 200, ox + ev.clientX - sx)),
              y: Math.max(8, Math.min(window.innerHeight - 120, oy + ev.clientY - sy)),
            })
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      >
        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
          <Move className="h-3.5 w-3.5" />
          预览（可拖动）
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-500 hover:bg-gray-200"
          aria-label="关闭预览"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-3">
        <DouyinProductMobilePreviewFrame {...previewProps} />
      </div>
    </div>
  )
}
