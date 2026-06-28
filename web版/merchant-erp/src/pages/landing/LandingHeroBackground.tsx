import { useEffect, useState } from 'react'
import { cn } from '../../cn'
import WebStaticOssImage, { useWebStaticOssMedia } from '../../components/WebStaticOssImage'
import type { LandingConfig } from './landingConfig'

type Props = {
  config: LandingConfig
  className?: string
}

/** 全屏首屏：OSS 10s 循环视频，失败则 OSS/本地三图交叉淡入 */
export default function LandingHeroBackground({ config, className }: Props) {
  const [useVideo, setUseVideo] = useState(true)
  const video = useWebStaticOssMedia('merchant', config.heroVideo)
  const poster = useWebStaticOssMedia('merchant', config.heroFrames[0] || '')

  useEffect(() => {
    const v = document.createElement('video')
    v.src = video.src
    v.addEventListener('error', () => setUseVideo(false), { once: true })
    v.load()
  }, [video.src])

  if (useVideo) {
    return (
      <video
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        src={video.src}
        autoPlay
        loop
        muted
        playsInline
        poster={poster.src}
        onError={() => {
          if (video.hasNext) video.tryNext()
          else setUseVideo(false)
        }}
        aria-hidden
      />
    )
  }

  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)} aria-hidden>
      {config.heroFrames.map((localPath, i) => (
        <WebStaticOssImage
          key={localPath}
          app="merchant"
          localPath={localPath}
          alt=""
          className="absolute inset-0 h-full w-full object-cover animate-hero-crossfade"
          style={{ animationDelay: `${i * 3.33}s` }}
        />
      ))}
    </div>
  )
}
