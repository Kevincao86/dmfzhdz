import { getAccount, getActiveRole } from '../lib/mpSession'

export default function OrdersPage() {
  const acc = getAccount()
  const role = getActiveRole()

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">我的履约</h2>
      <div className="rounded-xl border border-white/10 bg-[#1a1a28] p-6 space-y-3 text-sm">
        {role === 'talent' ? (
          <>
            <p>
              灵祺达人 ID：<span className="text-amber-400 font-mono">{acc?.lingqiTalentId || '—'}</span>
            </p>
            <p className="text-slate-400">报名、云剪确认、回链提交与小程序「我的报名」共用同一注册表与 API。</p>
          </>
        ) : (
          <>
            <p>
              PR ID：<span className="text-amber-400 font-mono">{acc?.lingqiPrId || '—'}</span>
            </p>
            <p className="text-slate-400">发单、反选达人、履约进度与小程序「我的发单」互通。</p>
          </>
        )}
      </div>
    </div>
  )
}
