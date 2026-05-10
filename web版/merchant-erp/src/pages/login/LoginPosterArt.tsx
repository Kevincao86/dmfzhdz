import type { SVGProps } from 'react'

/** 海报①：夜市摊位 + 城市天际线（本地生活） */
export function PosterLocalLifeArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 720 420" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <defs>
        <linearGradient id="pll-sky" x1="0" y1="0" x2="720" y2="420" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fb923c" stopOpacity="0.35" />
          <stop offset="0.45" stopColor="#be185d" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="pll-glow" x1="360" y1="80" x2="360" y2="380" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="720" height="420" fill="url(#pll-sky)" />
      <ellipse cx="380" cy="360" rx="280" ry="120" fill="url(#pll-glow)" />
      {/* 远景楼群 */}
      <path
        fill="#1e293b"
        fillOpacity="0.65"
        d="M40 280h52v80H40V280zm72-40h44v120h-44V240zm56 20h56v100h-56V260zm72-55h48v155h-48V205zm64 35h40v120h-40V240zm52-28h52v148h-52V212zm68 18h44v130h-44V230zm56-42h60v172h-60V188zm76 30h48v142h-48V218z"
      />
      {/* 摊位顶棚 */}
      <path fill="#f97316" fillOpacity="0.85" d="M120 310l140-48 140 48v24H120v-24z" />
      <path fill="#fdba74" fillOpacity="0.5" d="M140 318h240v8H140v-8z" />
      <rect x="155" y="326" width="210" height="52" rx="6" fill="#0f172a" fillOpacity="0.55" />
      <circle cx="210" cy="352" r="10" fill="#22d3ee" fillOpacity="0.35" />
      <circle cx="260" cy="348" r="8" fill="#fb7185" fillOpacity="0.45" />
      <circle cx="310" cy="354" r="9" fill="#a78bfa" fillOpacity="0.4" />
      {/* POI 定位脉冲 */}
      <circle cx="520" cy="300" r="36" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth="2" fill="none" />
      <circle cx="520" cy="300" r="22" stroke="#38bdf8" strokeOpacity="0.55" strokeWidth="2" fill="none" />
      <path fill="#38bdf8" d="M520 278c-12 0-22 10-22 22 0 16 22 36 22 36s22-20 22-36c0-12-10-22-22-22zm0 30c-5 0-8-3-8-8s3-8 8-8 8 3 8 8-3 8-8 8z" />
    </svg>
  )
}

/** 海报②：悬浮数据屏 + 柱状趋势（智能经营） */
export function PosterDataArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 720 420" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <defs>
        <linearGradient id="pd-bg" x1="80" y1="40" x2="640" y2="380" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4" stopOpacity="0.35" />
          <stop offset="0.5" stopColor="#2563eb" stopOpacity="0.22" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="pd-glass" x1="200" y1="90" x2="540" y2="330" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect width="720" height="420" fill="url(#pd-bg)" />
      <rect x="140" y="70" width="440" height="260" rx="18" fill="url(#pd-glass)" stroke="#fff" strokeOpacity="0.14" strokeWidth="1.5" />
      {/* 图表柱 */}
      <rect x="190" y="240" width="36" height="90" rx="6" fill="#22d3ee" fillOpacity="0.55" />
      <rect x="248" y="200" width="36" height="130" rx="6" fill="#38bdf8" fillOpacity="0.65" />
      <rect x="306" y="220" width="36" height="110" rx="6" fill="#818cf8" fillOpacity="0.55" />
      <rect x="364" y="175" width="36" height="155" rx="6" fill="#c084fc" fillOpacity="0.5" />
      <rect x="422" y="210" width="36" height="120" rx="6" fill="#34d399" fillOpacity="0.45" />
      <path
        d="M175 215c55-38 118-22 178 8s132 46 198 18"
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* 全息环 */}
      <ellipse cx="360" cy="360" rx="200" ry="28" stroke="#67e8f9" strokeOpacity="0.25" strokeWidth="2" fill="none" />
      <ellipse cx="360" cy="360" rx="260" ry="38" stroke="#38bdf8" strokeOpacity="0.15" strokeWidth="1.5" fill="none" />
      {/* 网格节点 */}
      <circle cx="580" cy="110" r="4" fill="#67e8f9" fillOpacity="0.8" />
      <circle cx="620" cy="140" r="3" fill="#a5f3fc" fillOpacity="0.6" />
      <circle cx="600" cy="175" r="3.5" fill="#67e8f9" fillOpacity="0.55" />
      <path d="M580 110l40 30M620 140l-20 35" stroke="#67e8f9" strokeOpacity="0.35" strokeWidth="1" />
    </svg>
  )
}

/** 海报③：芯片与城市神经网络（未来科技） */
export function PosterFutureArt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 720 420" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden {...props}>
      <defs>
        <linearGradient id="pf-bg" x1="0" y1="0" x2="720" y2="420" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" stopOpacity="0.38" />
          <stop offset="0.45" stopColor="#db2777" stopOpacity="0.18" />
          <stop offset="1" stopColor="#020617" stopOpacity="0.94" />
        </linearGradient>
        <radialGradient id="pf-core" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(420 160) rotate(90) scale(140)">
          <stop stopColor="#e879f9" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="720" height="420" fill="url(#pf-bg)" />
      <circle cx="420" cy="160" r="160" fill="url(#pf-core)" />
      {/* 芯片外框 */}
      <rect x="330" y="120" width="160" height="160" rx="14" fill="#0f172a" fillOpacity="0.55" stroke="#c084fc" strokeOpacity="0.45" strokeWidth="2" />
      <rect x="350" y="140" width="120" height="120" rx="8" fill="#1e1b4b" fillOpacity="0.8" stroke="#a78bfa" strokeOpacity="0.25" />
      <rect x="385" y="175" width="50" height="50" rx="6" fill="#22d3ee" fillOpacity="0.25" />
      <path d="M410 188h10M405 193v10M415 193v10M405 207h20" stroke="#e0e7ff" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round" />
      {/* 引脚 */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`t-${i}`} x={338 + i * 28} y="108" width="10" height="18" rx="2" fill="#94a3b8" fillOpacity="0.45" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={`b-${i}`} x={338 + i * 28} y="274" width="10" height="18" rx="2" fill="#94a3b8" fillOpacity="0.45" />
      ))}
      {/*  neural lines */}
      <path
        d="M80 320c80-120 200-100 280-40s200 30 280-40M60 200c100 40 180-20 260-60s220-30 300 20"
        stroke="#e879f9"
        strokeOpacity="0.22"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="120" cy="300" r="5" fill="#22d3ee" fillOpacity="0.5" />
      <circle cx="220" cy="240" r="4" fill="#c084fc" fillOpacity="0.55" />
      <circle cx="640" cy="280" r="5" fill="#f472b6" fillOpacity="0.45" />
      <circle cx="560" cy="120" r="4" fill="#67e8f9" fillOpacity="0.5" />
    </svg>
  )
}
