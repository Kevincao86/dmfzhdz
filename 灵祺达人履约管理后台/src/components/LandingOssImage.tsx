import { useCallback, useMemo, useState, type ImgHTMLAttributes } from 'react'
import { drLandingAssetCandidates } from '../lib/drLandingAssets'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  file: string
}

/** 营销图：先试 OSS，失败自动切 dr 本地同源路径 */
export default function LandingOssImage({ file, ...rest }: Props) {
  const candidates = useMemo(() => drLandingAssetCandidates(file), [file])
  const [idx, setIdx] = useState(0)
  const src = candidates[Math.min(idx, candidates.length - 1)] || ''

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

export function useLandingOssMedia(file: string) {
  const candidates = useMemo(() => drLandingAssetCandidates(file), [file])
  const [idx, setIdx] = useState(0)
  const src = candidates[Math.min(idx, candidates.length - 1)] || ''
  const hasNext = idx + 1 < candidates.length
  const tryNext = useCallback(() => {
    setIdx((i) => (i + 1 < candidates.length ? i + 1 : i))
  }, [candidates.length])
  return { src, tryNext, hasNext }
}
