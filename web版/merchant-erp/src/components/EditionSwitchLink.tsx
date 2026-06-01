import { ArrowLeftRight } from 'lucide-react'
import { editionLabel, isPartnerEdition, peerEditionLoginUrl } from '../lib/appEdition'

/** 登录页右上角：商家版 ↔ 服务商版（跳转对端，会话互不共享） */
export default function EditionSwitchLink() {
  const target = peerEditionLoginUrl()
  const peerLabel = isPartnerEdition() ? '商家版' : '服务商版'

  return (
    <a
      href={target}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition hover:border-cyan-200 hover:bg-white/90 hover:text-cyan-800"
      title={`切换到${peerLabel}登录（当前为${editionLabel()}）`}
    >
      <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{peerLabel}</span>
    </a>
  )
}
