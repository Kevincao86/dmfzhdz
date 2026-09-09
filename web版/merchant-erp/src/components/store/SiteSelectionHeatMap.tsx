import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  fetchSiteMapStaticImage,
  SITE_MAP_STATIC_H,
  SITE_MAP_STATIC_W,
  SITE_MAP_STATIC_ZOOM,
  type SiteSelectionRecommendSpot,
} from '../../services/storeIntelApi'

type HeatCell = { lat: number; lng: number; weight: number }
type PeerPoi = { name: string; location?: { lat: number; lng: number } }
type MapView = { lat: number; lng: number; zoom: number }

const W = SITE_MAP_STATIC_W
const H = SITE_MAP_STATIC_H
const TILE = 256
const ZOOM_MIN = 12
const ZOOM_MAX = 17

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)))
}

function heatRgb(w: number): string {
  const t = Math.min(1, Math.max(0, w / 100))
  if (t > 0.75) return '225, 29, 72'
  if (t > 0.5) return '245, 158, 11'
  if (t > 0.3) return '14, 165, 233'
  return '148, 163, 184'
}

function mercatorX(lng: number): number {
  return ((lng + 180) / 360) * TILE
}

function mercatorY(lat: number): number {
  const clamped = Math.min(85.05112878, Math.max(-85.05112878, lat))
  const s = Math.sin((clamped * Math.PI) / 180)
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE
}

function lngFromMercX(x: number): number {
  return (x / TILE) * 360 - 180
}

function latFromMercY(y: number): number {
  const yNorm = y / TILE
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI
}

/** 与高德静态图 Web Mercator / zoom 对齐，勿用等距经纬度投影 */
function projectMercator(
  lat: number,
  lng: number,
  center: { lat: number; lng: number },
  width: number,
  height: number,
  zoom: number,
): { x: number; y: number } {
  const scale = 2 ** zoom
  const cx = mercatorX(center.lng) * scale
  const cy = mercatorY(center.lat) * scale
  return {
    x: width / 2 + (mercatorX(lng) * scale - cx),
    y: height / 2 + (mercatorY(lat) * scale - cy),
  }
}

function pixelToLatLng(
  px: number,
  py: number,
  center: { lat: number; lng: number },
  zoom: number,
): { lat: number; lng: number } {
  const scale = 2 ** zoom
  return {
    lng: lngFromMercX(mercatorX(center.lng) + (px - W / 2) / scale),
    lat: latFromMercY(mercatorY(center.lat) + (py - H / 2) / scale),
  }
}

function centerSoPointAtPixel(
  point: { lat: number; lng: number },
  px: number,
  py: number,
  zoom: number,
): { lat: number; lng: number } {
  const scale = 2 ** zoom
  return {
    lng: lngFromMercX(mercatorX(point.lng) - (px - W / 2) / scale),
    lat: latFromMercY(mercatorY(point.lat) - (py - H / 2) / scale),
  }
}

function panByPixels(
  center: { lat: number; lng: number },
  dx: number,
  dy: number,
  zoom: number,
): { lat: number; lng: number } {
  const scale = 2 ** zoom
  return {
    lng: lngFromMercX(mercatorX(center.lng) - dx / scale),
    lat: latFromMercY(mercatorY(center.lat) - dy / scale),
  }
}

function fallbackGrid(center: { lat: number; lng: number }): HeatCell[] {
  const cells: HeatCell[] = []
  const half = 4
  const step = 0.00115
  for (let iy = -half; iy <= half; iy++) {
    for (let ix = -half; ix <= half; ix++) {
      const dist = Math.hypot(ix, iy)
      cells.push({
        lat: center.lat - iy * step,
        lng: center.lng + ix * step,
        weight: Math.round(Math.max(10, 88 - dist * 14)),
      })
    }
  }
  return cells
}

function openMapUrl(
  provider: 'amap' | 'baidu' | undefined,
  center: { lat: number; lng: number },
  name: string,
): string {
  const n = encodeURIComponent(name || '点位')
  if (provider === 'baidu') {
    return `https://api.map.baidu.com/marker?location=${center.lat},${center.lng}&title=${n}&content=${n}&output=html`
  }
  return `https://uri.amap.com/marker?position=${center.lng},${center.lat}&name=${n}`
}

function inView(x: number, y: number, pad = 48): boolean {
  return x >= -pad && x <= W + pad && y >= -pad && y <= H + pad
}

export default function SiteSelectionHeatMap({
  center,
  heatMapGrid,
  recommendations,
  peerPois,
  candidateLabel,
  mapProvider,
}: {
  center: { lat: number; lng: number }
  heatMapGrid?: HeatCell[]
  recommendations?: SiteSelectionRecommendSpot[]
  peerPois?: PeerPoi[]
  candidateLabel?: string
  mapProvider?: 'amap' | 'baidu'
}) {
  const uid = useId().replace(/:/g, '')
  const boxRef = useRef<HTMLDivElement | null>(null)
  const blobRef = useRef<string | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const shownRef = useRef<MapView>({ lat: center.lat, lng: center.lng, zoom: SITE_MAP_STATIC_ZOOM })
  const dragRef = useRef({ x: 0, y: 0 })

  const originView = useMemo<MapView>(
    () => ({ lat: center.lat, lng: center.lng, zoom: SITE_MAP_STATIC_ZOOM }),
    [center.lat, center.lng],
  )
  const [shown, setShown] = useState<MapView>(originView)
  shownRef.current = shown
  const [desired, setDesired] = useState<MapView>(originView)
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  dragRef.current = drag
  const [dragging, setDragging] = useState(false)
  const [basemapUrl, setBasemapUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [basemapFailed, setBasemapFailed] = useState(false)

  useEffect(() => {
    setShown(originView)
    setDesired(originView)
    setDrag({ x: 0, y: 0 })
  }, [originView])

  const cells = useMemo(() => {
    if (heatMapGrid?.length) return heatMapGrid
    return fallbackGrid(center)
  }, [heatMapGrid, center])

  const sorted = useMemo(() => [...cells].sort((a, b) => a.weight - b.weight), [cells])
  const zoomScale = 2 ** (shown.zoom - SITE_MAP_STATIC_ZOOM)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      void fetchSiteMapStaticImage({
        lat: desired.lat,
        lng: desired.lng,
        zoom: desired.zoom,
        width: W,
        height: H,
        provider: mapProvider,
      }).then((r) => {
        if (cancelled) {
          if (r.ok) URL.revokeObjectURL(r.blobUrl)
          return
        }
        if (!r.ok) {
          setBasemapFailed(true)
          setLoading(false)
          return
        }
        if (blobRef.current) URL.revokeObjectURL(blobRef.current)
        blobRef.current = r.blobUrl
        setBasemapUrl(r.blobUrl)
        setShown(desired)
        setDrag({ x: 0, y: 0 })
        setBasemapFailed(false)
        setLoading(false)
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [desired.lat, desired.lng, desired.zoom, mapProvider])

  useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    }
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * W
      const py = ((e.clientY - rect.top) / Math.max(rect.height, 1)) * H
      const dir = e.deltaY > 0 ? -1 : 1
      const cur = shownRef.current
      const off = dragRef.current
      const nextZoom = clampZoom(cur.zoom + dir)
      if (nextZoom === cur.zoom) return
      const pin = pixelToLatLng(px - off.x, py - off.y, cur, cur.zoom)
      const nextCenter = centerSoPointAtPixel(pin, px, py, nextZoom)
      setDrag({ x: 0, y: 0 })
      setDesired({ lat: nextCenter.lat, lng: nextCenter.lng, zoom: nextZoom })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const zoomBy = (dir: 1 | -1) => {
    setDesired((prev) => {
      const nextZoom = clampZoom(prev.zoom + dir)
      if (nextZoom === prev.zoom) return prev
      return { ...prev, zoom: nextZoom }
    })
  }

  const resetView = () => {
    setDesired(originView)
    setDrag({ x: 0, y: 0 })
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    setDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY, ox: drag.x, oy: drag.y }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    if (!start) return
    const el = boxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const dx = ((e.clientX - start.x) / Math.max(rect.width, 1)) * W
    const dy = ((e.clientY - start.y) / Math.max(rect.height, 1)) * H
    setDrag({ x: start.ox + dx, y: start.oy + dy })
  }

  const endDrag = () => {
    const start = dragStartRef.current
    dragStartRef.current = null
    setDragging(false)
    if (!start) return
    const offset = dragRef.current
    if (Math.hypot(offset.x, offset.y) < 4) {
      setDrag({ x: 0, y: 0 })
      return
    }
    const cur = shownRef.current
    const next = panByPixels(cur, offset.x, offset.y, cur.zoom)
    setDesired({ lat: next.lat, lng: next.lng, zoom: cur.zoom })
  }

  const label = candidateLabel || '预想点位'
  const mapLink = openMapUrl(mapProvider, center, label)
  const mapLinkText = mapProvider === 'baidu' ? '在百度地图打开' : '在高德地图打开'
  const atOrigin =
    Math.abs(desired.lat - originView.lat) < 1e-6 &&
    Math.abs(desired.lng - originView.lng) < 1e-6 &&
    desired.zoom === originView.zoom &&
    Math.hypot(drag.x, drag.y) < 1

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">地图热力图</p>
          <p className="text-[11px] text-slate-500">
            实景底图 · 滚轮/按钮缩放 · 拖动平移 · 热力为区位代理（非信令）
            {basemapFailed ? ' · 底图暂不可用，已保留点位叠加' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-slate-400/80" />低
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-sky-400/80" />中
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-amber-400/90" />高
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2 w-3 rounded-sm bg-rose-500" />很高
          </span>
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium text-sky-700 underline decoration-sky-200 underline-offset-2 hover:text-sky-900"
          >
            {mapLinkText}
          </a>
        </div>
      </div>
      <div
        ref={boxRef}
        className="relative w-full touch-none select-none bg-slate-200"
        style={{ aspectRatio: `${W} / ${H}`, cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {!basemapUrl && loading && !basemapFailed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-xs text-slate-300">
            正在拉取实景地图…
          </div>
        ) : null}
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${(drag.x / W) * 100}%, ${(drag.y / H) * 100}%)` }}
        >
          {basemapUrl ? (
            <img
              src={basemapUrl}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: 'fill' }}
            />
          ) : basemapFailed ? (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1e293b_0%,_#0f172a_70%)]" />
          ) : null}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label="选址热力图"
          >
            <defs>
              {sorted.map((c, i) => (
                <radialGradient key={`g-${i}`} id={`heat-${uid}-${i}`}>
                  <stop offset="0%" stopColor={`rgba(${heatRgb(c.weight)}, 0.48)`} />
                  <stop offset="70%" stopColor={`rgba(${heatRgb(c.weight)}, 0.16)`} />
                  <stop offset="100%" stopColor={`rgba(${heatRgb(c.weight)}, 0)`} />
                </radialGradient>
              ))}
            </defs>
            {sorted.map((c, i) => {
              const { x, y } = projectMercator(c.lat, c.lng, shown, W, H, shown.zoom)
              if (!inView(x, y, 80)) return null
              const r = Math.max(8, Math.min(96, (16 + (c.weight / 100) * 26) * zoomScale))
              return <circle key={i} cx={x} cy={y} r={r} fill={`url(#heat-${uid}-${i})`} />
            })}
            {(peerPois ?? [])
              .filter((p) => p.location)
              .slice(0, 12)
              .map((p, i) => {
                const loc = p.location!
                const { x, y } = projectMercator(loc.lat, loc.lng, shown, W, H, shown.zoom)
                if (!inView(x, y)) return null
                return (
                  <g key={`peer-${i}`}>
                    <circle cx={x} cy={y} r={5} fill="#f59e0b" stroke="#fffbeb" strokeWidth={1.5} />
                  </g>
                )
              })}
            {(() => {
              const { x, y } = projectMercator(center.lat, center.lng, shown, W, H, shown.zoom)
              if (!inView(x, y, 80)) return null
              const textFill = basemapFailed ? '#fecdd3' : '#881337'
              return (
                <g>
                  <circle cx={x} cy={y} r={10} fill="#fff" stroke="#e11d48" strokeWidth={3} />
                  <circle cx={x} cy={y} r={4} fill="#e11d48" />
                  <text
                    x={x + 14}
                    y={y - 10}
                    fill={textFill}
                    fontSize={12}
                    fontWeight={700}
                    stroke="#fff"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {label}
                  </text>
                </g>
              )
            })()}
            {(recommendations ?? []).map((r) => {
              const { x, y } = projectMercator(r.location.lat, r.location.lng, shown, W, H, shown.zoom)
              if (!inView(x, y, 80)) return null
              const textFill = basemapFailed ? '#a7f3d0' : '#065f46'
              return (
                <g key={r.rank}>
                  <circle cx={x} cy={y} r={7} fill="#10b981" stroke="#ecfdf5" strokeWidth={2} />
                  <text
                    x={x + 10}
                    y={y + 4}
                    fill={textFill}
                    fontSize={11}
                    fontWeight={700}
                    stroke="#fff"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    荐{r.rank}·{r.score}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        <div
          className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-2"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/95 shadow-sm">
            <button
              type="button"
              aria-label="放大"
              disabled={desired.zoom >= ZOOM_MAX}
              onClick={() => zoomBy(1)}
              className="flex h-8 w-8 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
            >
              <Plus className="h-4 w-4" />
            </button>
            <div className="border-t border-slate-100 text-center text-[10px] font-medium leading-5 text-slate-500">
              {desired.zoom}
            </div>
            <button
              type="button"
              aria-label="缩小"
              disabled={desired.zoom <= ZOOM_MIN}
              onClick={() => zoomBy(-1)}
              className="flex h-8 w-8 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:text-slate-300"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={resetView}
            disabled={atOrigin && !drag.x && !drag.y}
            className="pointer-events-auto inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:text-slate-300"
          >
            <RotateCcw className="h-3 w-3" />
            复位
          </button>
        </div>
        {loading && basemapUrl ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-slate-900/70 px-2 py-1 text-[10px] text-white">
            更新底图…
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-rose-500 bg-white" />
          {label}
        </span>
        {(recommendations ?? []).length ? (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            推荐点
          </span>
        ) : null}
        {(peerPois ?? []).some((p) => p.location) ? (
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            同业点
          </span>
        ) : null}
      </div>
    </div>
  )
}
