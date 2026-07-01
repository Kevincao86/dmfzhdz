import { useEffect, useState } from 'react'
import { cn } from '../../cn'
import DyOAuthOfficialPanel from './DyOAuthOfficialPanel'
import { erpDyOAuthBegin, type ErpOAuthPortal } from '../../lib/mpScanAuthApi'
import { toUserFacingError } from '../../lib/userFacingError'

export type ScanChannel = 'wechat' | 'douyin'

/** 微信开放平台网站应用资质就绪后改为 true */
export const SCAN_LOGIN_WECHAT_ENABLED = false

type Props = {
  portal: ErpOAuthPortal
  err: string | null
  onErr: (v: string | null) => void
}

export default function ErpScanLoginPanel({ portal, err, onErr }: Props) {
  const [scanChannel, setScanChannel] = useState<ScanChannel>('douyin')
  const [dyAuthorizeUrl, setDyAuthorizeUrl] = useState('')
  const [dyScanHint, setDyScanHint] = useState('')
  const [dyLoading, setDyLoading] = useState(false)

  useEffect(() => {
    if (scanChannel !== 'douyin') return
    let cancelled = false
    setDyLoading(true)
    setDyScanHint('')
    setDyAuthorizeUrl('')
    onErr(null)
    ;(async () => {
      try {
        const s = await erpDyOAuthBegin(portal)
        if (cancelled) return
        setDyAuthorizeUrl(s.authorizeUrl)
        setDyScanHint('加载完成后，请扫页面内抖音官方二维码')
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          onErr(
            /dy_web_not_configured|尚未配置/i.test(msg)
              ? '抖音网站扫码尚未配置，请联系管理员在轻量配置 MP_DOUYIN_WEB_* 环境变量'
              : toUserFacingError(e, '扫码登录'),
          )
        }
      } finally {
        if (!cancelled) setDyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [scanChannel, portal, onErr])

  return (
    <div className="space-y-4">
      <div className="flex gap-4 border-b border-white/40 pb-1">
        {(
          [
            ['wechat', '微信扫码'],
            ['douyin', '抖音扫码'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setScanChannel(id)
              onErr(null)
            }}
            className={cn(
              'relative pb-2 text-sm font-semibold transition-colors',
              scanChannel === id ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
            )}
          >
            {label}
            {scanChannel === id ? (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-cyan-500" />
            ) : null}
          </button>
        ))}
      </div>

      {scanChannel === 'wechat' ? (
        <div className="rounded-2xl border border-white/50 bg-white/40 px-4 py-8 text-center backdrop-blur-sm">
          {SCAN_LOGIN_WECHAT_ENABLED ? (
            <p className="text-sm text-slate-600">微信扫码登录接入中</p>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-800">微信扫码登录接入中</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                微信开放平台网站应用资质审核通过后自动开放；当前请使用抖音扫码或手机验证码登录。
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/50 bg-white/40 px-4 py-6 backdrop-blur-sm">
          {dyLoading ? (
            <div className="flex flex-col items-center py-6">
              <div className="mb-3 h-9 w-9 animate-spin rounded-full border-2 border-cyan-200 border-t-cyan-600" />
              <p className="text-sm text-slate-500">正在加载抖音官方授权页…</p>
            </div>
          ) : dyAuthorizeUrl ? (
            <DyOAuthOfficialPanel authorizeUrl={dyAuthorizeUrl} />
          ) : (
            <p className="py-4 text-center text-sm text-slate-500">
              {dyScanHint || '无法加载抖音扫码，请稍后重试'}
            </p>
          )}
          <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
            扫码后需抖音账号已在小程序绑定手机号，且该手机号已注册 ERP 账号
          </p>
        </div>
      )}

      {err ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">{err}</p>
      ) : null}
    </div>
  )
}
