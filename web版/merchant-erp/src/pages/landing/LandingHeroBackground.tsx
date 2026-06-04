import { useEffect, useState } from 'react'
import { cn } from '../../cn'
import type { LandingConfig } from './landingConfig'

type Props = {
  config: LandingConfig
  className?: string
}

/** 全屏首屏：10s 循环视频，失败则三图交叉淡入 */
export default function LandingHeroBackground({ config, className }: Props) {
  const [useVideo, setUseVideo] = useState(true)

  useEffect(() => {
    const v = document.createElement('video')
    v.src = config.heroVideo
    v.addEventListener('error', () => setUseVideo(false), { once: true })
    v.load()
  }, [config.heroVideo])

  if (useVideo) {
    return (
      <video
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        src={config.heroVideo}
        autoPlay
        loop
        muted
        playsInline
        poster={config.heroFrames[0]}
        onError={() => setUseVideo(false)}
        aria-hidden
      />
    )
  }

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden>
      {config.heroFrames.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover animate-hero-crossfade"
          style={{ animationDelay: `${i * 3.33}s` }}
        />
      ))}
    </div>
  )
}
