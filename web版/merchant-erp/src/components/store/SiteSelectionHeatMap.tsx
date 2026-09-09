import { useEffect, useMemo, useState } from 'react'
import {
  fetchSiteMapStaticImage,
  SITE_MAP_STATIC_H,
  SITE_MAP_STATIC_W,
  SITE_MAP_STATIC_ZOOM,
  type SiteSelectionRecommendSpot,
} from '../../services/storeIntelApi'

type HeatCell = { lat: number; lng: number; weight: number }
type PeerPoi = { name: string; location?: { lat: number; lng: number } }

const W = SITE_MAP_STATIC_W
const H = SITE_MAP_STATIC_H
const ZOOM = SITE_MAP_STATIC_ZOOM
const TILE = 256

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
  const [basemapUrl, setBasemapUrl] = useState<string | null>(null)
  const [basemapReady, setBasemapReady] = useState(false)
  const [basemapFailed, setBasemapFailed] = useState(false)

  const cells = useMemo(() => {
    if (heatMapGrid?.length) return heatMapGrid
    return fallbackGrid(center)
  }, [heatMapGrid, center])

  const sorted = useMemo(() => [...cells].sort((a, b) => a.weight - b.weight), [cells])

  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    setBasemapReady(false)
    setBasemapFailed(false)
    setBasemapUrl(null)
    void fetchSiteMapStaticImage({
      lat: center.lat,
      lng: center.lng,
      zoom: ZOOM,
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
        return
      }
      created = r.blobUrl
      setBasemapUrl(r.blobUrl)
      setBasemapReady(true)
    })
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [center.lat, center.lng, mapProvider])

  const label = candidateLabel || '预想点位'
  const mapLink = openMapUrl(mapProvider, center, label)
  const mapLinkText = mapProvider === 'baidu' ? '在百度地图打开' : '在高德地图打开'

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">地图热力图</p>
          <p className="text-[11px] text-slate-500">
            实景底图 · 热力为区位代理（周边 POI 衰减）· 非信令
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
      <div className="relative w-full bg-slate-200" style={{ aspectRatio: `${W} / ${H}` }}>
        {!basemapReady && !basemapFailed ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-xs text-slate-300">
            正在拉取实景地图…
          </div>
        ) : null}
        {basemapUrl ? (
          <img
            src={basemapUrl}
            alt=""
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
              <radialGradient key={`g-${i}`} id={`heat-cell-${i}`}>
                <stop offset="0%" stopColor={`rgba(${heatRgb(c.weight)}, 0.48)`} />
                <stop offset="70%" stopColor={`rgba(${heatRgb(c.weight)}, 0.16)`} />
                <stop offset="100%" stopColor={`rgba(${heatRgb(c.weight)}, 0)`} />
              </radialGradient>
            ))}
          </defs>
          {sorted.map((c, i) => {
            const { x, y } = projectMercator(c.lat, c.lng, center, W, H, ZOOM)
            const r = 18 + (c.weight / 100) * 28
            return <circle key={i} cx={x} cy={y} r={r} fill={`url(#heat-cell-${i})`} />
          })}
          {(peerPois ?? [])
            .filter((p) => p.location)
            .slice(0, 12)
            .map((p, i) => {
              const loc = p.location!
              const { x, y } = projectMercator(loc.lat, loc.lng, center, W, H, ZOOM)
              return (
                <g key={`peer-${i}`}>
                  <circle cx={x} cy={y} r={5} fill="#f59e0b" stroke="#fffbeb" strokeWidth={1.5} />
                </g>
              )
            })}
          {(() => {
            const { x, y } = projectMercator(center.lat, center.lng, center, W, H, ZOOM)
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
            const { x, y } = projectMercator(r.location.lat, r.location.lng, center, W, H, ZOOM)
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
