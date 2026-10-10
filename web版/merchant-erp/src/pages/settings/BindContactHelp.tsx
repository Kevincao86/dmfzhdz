import { useState } from 'react'

type Channel = 'qq' | 'wechat'

const QR: Record<Channel, { src: string; title: string }> = {
  qq: { src: '/bind-contact/qq-qr.png', title: 'QQ 联系' },
  wechat: { src: '/bind-contact/wechat-qr.png', title: '微信联系' },
}

function QqMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#12B7F5" />
      <ellipse cx="12" cy="13.2" rx="5.2" ry="4.6" fill="#fff" />
      <circle cx="10" cy="12.6" r="0.7" fill="#12B7F5" />
      <circle cx="14" cy="12.6" r="0.7" fill="#12B7F5" />
      <path d="M9.2 15.2c.8.7 1.8 1 2.8 1s2-.3 2.8-1" fill="none" stroke="#12B7F5" strokeWidth="0.7" strokeLinecap="round" />
    </svg>
  )
}

function WechatMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#07C160" />
      <circle cx="9.2" cy="11.2" r="3.3" fill="#fff" />
      <circle cx="14.4" cy="13.1" r="2.7" fill="#E8FFF2" />
      <circle cx="8.2" cy="11" r="0.45" fill="#07C160" />
      <circle cx="10.1" cy="11" r="0.45" fill="#07C160" />
    </svg>
  )
}

/** 商家版后台、本地推绑定页：绑定遇到问题可扫码联系 */
export default function BindContactHelp() {
  const [open, setOpen] = useState<Channel | null>(null)
  const current = open ? QR[open] : null

  return (
    <>
      <p className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
        <span>绑定有问题，请联系</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-sky-700 hover:text-sky-800"
          onClick={() => setOpen('qq')}
        >
          <QqMark />
          QQ
        </button>
        <span>或者</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-800"
          onClick={() => setOpen('wechat')}
        >
          <WechatMark />
          微信
        </button>
      </p>
      {current ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => setOpen(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={current.title}
          >
            <p className="text-center text-sm font-medium text-slate-800">{current.title}</p>
            <img src={current.src} alt={current.title} className="mx-auto mt-3 block w-56 max-w-full bg-white" />
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => setOpen(null)}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
