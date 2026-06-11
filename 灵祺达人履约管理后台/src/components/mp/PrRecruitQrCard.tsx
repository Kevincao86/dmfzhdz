import { useEffect, useRef, useState } from 'react'
import { buildPrQrScanUrl } from '../../lib/mpSync/prRecruitQr'

type Props = {
  mpOrderId: string
  caption?: string
  size?: number
}

export default function PrRecruitQrCard({ mpOrderId, caption = '灵祺官方认证', size = 112 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const url = buildPrQrScanUrl(mpOrderId)

  useEffect(() => {
    if (!url || !canvasRef.current) return
    let cancelled = false
    void (async () => {
      try {
        const QRCode = await import('qrcode')
        if (cancelled || !canvasRef.current) return
        await QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 1,
          color: { dark: '#1e293b', light: '#ffffff' },
        })
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
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
        ) : (
          <canvas ref={canvasRef} width={size} height={size} className="block" aria-label="招募方认证二维码" />
        )}
      </div>
      <p className="max-w-[7rem] text-center text-[10px] font-medium leading-snug text-slate-700">{caption}</p>
    </div>
  )
}
