import { useEffect, useState } from 'react'
import { cn } from '../../cn'
import { HERO_FRAMES } from './landingCopy'

/** 全屏首屏：优先 10s 循环视频，失败则三图交叉淡入 */
export default function LandingHeroBackground({ className }: { className?: string }) {
  const [useVideo, setUseVideo] = useState(true)

  useEffect(() => {
    const v = document.createElement('video')
    v.src = '/landing/hero-loop.mp4'
    v.addEventListener('error', () => setUseVideo(false), { once: true })
    v.load()
  }, [])

  if (useVideo) {
    return (
      <video
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        src="/landing/hero-loop.mp4"
        autoPlay
        loop
        muted
        playsInline
        poster={HERO_FRAMES[0]}
        onError={() => setUseVideo(false)}
        aria-hidden
      />
    )
  }

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden>
      {HERO_FRAMES.map((src, i) => (
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
