import { useCallback, useMemo, useState, type ImgHTMLAttributes } from 'react'
import { webStaticCandidates, type WebStaticApp } from '../lib/webStaticOssAssets'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  app: WebStaticApp
  localPath: string
}

/** 静态图：OSS →（dr landing 兼容 dr-landing/）→ 本地 public */
export default function WebStaticOssImage({ app, localPath, ...rest }: Props) {
  const candidates = useMemo(() => webStaticCandidates(app, localPath), [app, localPath])
  const [idx, setIdx] = useState(0)
  const src = candidates[Math.min(idx, Math.max(candidates.length - 1, 0))] || ''

  return (
    <img
      {...rest}
      src={src}
      onError={() => {
        setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))
      }}
    />
  )
}

export function useWebStaticOssMedia(app: WebStaticApp, localPath: string) {
  const candidates = useMemo(() => webStaticCandidates(app, localPath), [app, localPath])
  const [idx, setIdx] = useState(0)
  const src = candidates[Math.min(idx, Math.max(candidates.length - 1, 0))] || ''
  const hasNext = idx + 1 < candidates.length
  const tryNext = useCallback(() => {
    setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))
  }, [candidates.length])
  return { src, tryNext, hasNext, candidates }
}
