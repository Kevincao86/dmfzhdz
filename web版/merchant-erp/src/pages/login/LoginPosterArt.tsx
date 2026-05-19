import type { SVGProps } from 'react'

/** 蒲公英风格：浅色底 + 悬浮数据卡片 + 中心经营看板 */
export function PosterPgyTechArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 800 520" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <defs>
        <linearGradient id="pgy-bg" x1="0" y1="0" x2="800" y2="520" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e0f2fe" />
          <stop offset="0.45" stopColor="#f0f9ff" />
          <stop offset="1" stopColor="#faf5ff" />
        </linearGradient>
        <linearGradient id="pgy-card" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.75" />
        </linearGradient>
        <filter id="pgy-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>
      <rect width="800" height="520" fill="url(#pgy-bg)" />
      <circle cx="120" cy="80" r="90" fill="#38bdf8" fillOpacity="0.18" filter="url(#pgy-blur)" />
      <circle cx="680" cy="420" r="110" fill="#a78bfa" fillOpacity="0.16" filter="url(#pgy-blur)" />
      <circle cx="720" cy="100" r="70" fill="#2dd4bf" fillOpacity="0.14" filter="url(#pgy-blur)" />

      {/* 主看板 */}
      <rect x="180" y="100" width="440" height="300" rx="24" fill="url(#pgy-card)" stroke="#fff" strokeWidth="2" />
      <rect x="210" y="130" width="120" height="12" rx="6" fill="#e2e8f0" />
      <rect x="210" y="155" width="80" height="8" rx="4" fill="#f1f5f9" />

      <rect x="210" y="195" width="56" height="140" rx="10" fill="#0ea5e9" fillOpacity="0.35" />
      <rect x="280" y="165" width="56" height="170" rx="10" fill="#6366f1" fillOpacity="0.4" />
      <rect x="350" y="210" width="56" height="125" rx="10" fill="#14b8a6" fillOpacity="0.38" />
      <rect x="420" y="175" width="56" height="160" rx="10" fill="#8b5cf6" fillOpacity="0.35" />
      <rect x="490" y="200" width="56" height="135" rx="10" fill="#06b6d4" fillOpacity="0.32" />

      <path
        d="M200 250c60-50 140-70 220-40s160 50 240 10"
        stroke="#0284c7"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        strokeOpacity="0.45"
      />
      <circle cx="200" cy="250" r="6" fill="#fff" stroke="#0284c7" strokeWidth="2" />
      <circle cx="420" cy="210" r="6" fill="#fff" stroke="#6366f1" strokeWidth="2" />
      <circle cx="660" cy="260" r="6" fill="#fff" stroke="#14b8a6" strokeWidth="2" />

      {/* 左上浮动卡 */}
      <g transform="translate(48, 72)">
        <rect width="168" height="88" rx="16" fill="#fff" fillOpacity="0.92" stroke="#e2e8f0" />
        <rect x="16" y="18" width="64" height="8" rx="4" fill="#cbd5e1" />
        <rect x="16" y="38" width="100" height="22" rx="6" fill="#0ea5e9" fillOpacity="0.15" />
        <text x="22" y="54" fill="#0369a1" fontSize="14" fontWeight="600" fontFamily="system-ui,sans-serif">
          +28.6%
        </text>
      </g>

      {/* 右下浮动卡 */}
      <g transform="translate(580, 320)">
        <rect width="190" height="96" rx="16" fill="#fff" fillOpacity="0.92" stroke="#e2e8f0" />
        <rect x="16" y="16" width="72" height="8" rx="4" fill="#cbd5e1" />
        <circle cx="36" cy="58" r="18" fill="#14b8a6" fillOpacity="0.2" />
        <rect x="64" y="44" width="100" height="10" rx="5" fill="#e2e8f0" />
        <rect x="64" y="62" width="72" height="8" rx="4" fill="#f1f5f9" />
      </g>

      {/* 底部光晕底座 */}
      <ellipse cx="400" cy="430" rx="220" ry="24" fill="#0ea5e9" fillOpacity="0.12" />
    </svg>
  )
}

/** @deprecated 保留导出，登录页已统一使用 PosterPgyTechArt */
export function PosterLocalLifeArt(props: SVGProps<SVGSVGElement>) {
  return <PosterPgyTechArt {...props} />
}

export function PosterDataArt(props: SVGProps<SVGSVGElement>) {
  return <PosterPgyTechArt {...props} />
}

export function PosterFutureArt(props: SVGProps<SVGSVGElement>) {
  return <PosterPgyTechArt {...props} />
}
