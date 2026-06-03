import { getAccount } from '../lib/mpSession'

export default function ProfilePage() {
  const acc = getAccount()
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">账号资料</h2>
      <dl className="rounded-xl border border-white/10 bg-[#1a1a28] p-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">账号 ID</dt>
          <dd className="font-mono text-xs">{acc?.accountId}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">微信 OpenID</dt>
          <dd className="font-mono text-xs truncate max-w-[200px]">{acc?.openid || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">登录名</dt>
          <dd>{acc?.loginName || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">灵祺达人 ID</dt>
          <dd className="text-amber-400">{acc?.lingqiTalentId || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">PR ID</dt>
          <dd className="text-amber-400">{acc?.lingqiPrId || '—'}</dd>
        </div>
        <p className="text-xs text-slate-500 pt-2 border-t border-white/10">
          同一微信仅能注册一个灵祺账号；可在侧栏切换达人版/PR 版视图，不可重复注册第二个账号。
        </p>
      </dl>
    </div>
  )
}
