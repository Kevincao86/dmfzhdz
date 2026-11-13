import WebStaticOssImage, {
  useWebStaticOssMedia,
} from '@merchant/components/WebStaticOssImage'
import { drLandingAssetLocalUrl } from '../lib/drLandingAssets'
import type { ImgHTMLAttributes } from 'react'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  file: string
}

/** 营销图：先试 OSS，失败自动切 dr 本地同源路径 */
export default function LandingOssImage({ file, ...rest }: Props) {
  return (
    <WebStaticOssImage app="dr" localPath={drLandingAssetLocalUrl(file)} {...rest} />
  )
}

export function useLandingOssMedia(file: string) {
  return useWebStaticOssMedia('dr', drLandingAssetLocalUrl(file))
}
