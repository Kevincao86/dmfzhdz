import type { ImgHTMLAttributes, SVGProps } from 'react'
import { drLandingAssetUrl } from '../../lib/drLandingAssets'

/** 星图风格浅色数据看板插画（无图时的 SVG 兜底） */
export function LoginXingtuPosterSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 960 560" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <defs>
        <linearGradient id="xt-bg" x1="0" y1="0" x2="960" y2="560">
          <stop stopColor="#e8f4ff" />
          <stop offset="0.5" stopColor="#f5f0ff" />
          <stop offset="1" stopColor="#fff7ed" />
        </linearGradient>
        <linearGradient id="xt-bar" x1="0" y1="1" x2="0" y2="0">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="960" height="560" fill="url(#xt-bg)" />
      <ellipse cx="180" cy="120" rx="100" ry="80" fill="#38bdf8" fillOpacity="0.15" />
      <ellipse cx="780" cy="440" rx="120" ry="90" fill="#a78bfa" fillOpacity="0.14" />

      <rect x="120" y="80" width="720" height="400" rx="28" fill="#fff" fillOpacity="0.92" stroke="#e2e8f0" />
      <rect x="160" y="120" width="140" height="12" rx="6" fill="#cbd5e1" />
      <rect x="160" y="148" width="200" height="8" rx="4" fill="#f1f5f9" />

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={160 + i * 72}
          y={200 + (i % 3) * 12}
          width="48"
          height={120 - i * 8}
          rx="10"
          fill="url(#xt-bar)"
          fillOpacity={0.25 + (i % 3) * 0.08}
        />
      ))}

      <path
        d="M180 320 C280 260 400 240 520 280 S720 340 820 300"
        stroke="#4f46e5"
        strokeWidth="3"
        fill="none"
        strokeOpacity="0.4"
      />

      <g transform="translate(48, 200)">
        <rect width="200" height="100" rx="18" fill="#fff" stroke="#e2e8f0" />
        <text x="20" y="36" fill="#64748b" fontSize="12" fontFamily="system-ui,sans-serif">
          AI 匹配度
        </text>
        <text x="20" y="68" fill="#4f46e5" fontSize="28" fontWeight="700" fontFamily="system-ui,sans-serif">
          92%
        </text>
      </g>

      <g transform="translate(700, 360)">
        <rect width="210" height="108" rx="18" fill="#fff" stroke="#e2e8f0" />
        <text x="20" y="36" fill="#64748b" fontSize="12" fontFamily="system-ui,sans-serif">
          本周履约
        </text>
        <text x="20" y="72" fill="#0f172a" fontSize="26" fontWeight="700" fontFamily="system-ui,sans-serif">
          128 单
        </text>
      </g>
    </svg>
  )
}

type HeroImageProps = ImgHTMLAttributes<HTMLImageElement>

/** 登录左侧主视觉：优先使用生成的中国人像营销图 */
export function LoginHeroImage({ className, alt = '达人履约协作场景', ...rest }: HeroImageProps) {
  return (
    <img
      src={drLandingAssetUrl('login-hero.png')}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      {...rest}
    />
  )
}
