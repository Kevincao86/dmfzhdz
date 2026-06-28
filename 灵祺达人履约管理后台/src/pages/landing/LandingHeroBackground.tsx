import { useState } from 'react'
import { cn } from '../../cn'
import LandingOssImage, { useLandingOssMedia } from '../../components/LandingOssImage'
import { drLandingAssetLocalUrl } from '../../lib/drLandingAssets'
import { HERO_FRAME_FILES, HERO_LOOP_VIDEO_FILE } from './landingCopy'

/** 全屏首屏：优先 OSS 10s 循环视频，失败则 OSS/本地三图交叉淡入 */
export default function LandingHeroBackground({ className }: { className?: string }) {
  const [useVideo, setUseVideo] = useState(true)
  const video = useLandingOssMedia(HERO_LOOP_VIDEO_FILE)

  if (useVideo) {
    return (
      <video
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
        src={video.src}
        autoPlay
        loop
        muted
        playsInline
        poster={drLandingAssetLocalUrl(HERO_FRAME_FILES[0])}
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
      {HERO_FRAME_FILES.map((file, i) => (
        <LandingOssImage
          key={file}
          file={file}
          alt=""
          className="absolute inset-0 h-full w-full object-cover animate-hero-crossfade"
          style={{ animationDelay: `${i * 3.33}s` }}
        />
      ))}
    </div>
  )
}
