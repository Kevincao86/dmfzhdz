import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildPrQrScanUrl } from '../../lib/mpSync/prRecruitQr'

type Props = {
  mpOrderId: string
  caption?: string
  size?: number
}

export default function PrRecruitQrCard({ mpOrderId, caption = '灵祺官方认证', size = 112 }: Props) {
  const [dataUrl, setDataUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const url = buildPrQrScanUrl(mpOrderId)

  useEffect(() => {
    if (!url) {
      setDataUrl('')
      setFailed(false)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(url, {
      width: size,
      margin: 1,
      color: { dark: '#1e293b', light: '#ffffff' },
    })
      .then((next) => {
        if (cancelled) return
        setDataUrl(next)
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl('')
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [url, size])

  if (!url) return null

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="rounded-xl border border-[var(--shell-border)] bg-white p-2 shadow-sm">
        {failed ? (
          <div
            className="flex items-center justify-center text-center text-[10px] leading-snug text-slate-600"
            style={{ width: size, height: size }}
          >
            二维码加载失败
          </div>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            width={size}
            height={size}
            className="block"
            alt="招募方认证二维码"
          />
        ) : (
          <div
            className="animate-pulse rounded bg-slate-100"
            style={{ width: size, height: size }}
            aria-hidden
          />
        )}
      </div>
      <p className="max-w-[7rem] text-center text-[10px] font-medium leading-snug text-slate-700">{caption}</p>
    </div>
  )
}
