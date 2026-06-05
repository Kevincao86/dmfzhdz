import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatMpApiErr } from '../lib/mpApiErrors'
import { getAccount } from '../lib/mpSession'
import { applyWorkIdentitySwitch } from '../lib/switchWorkIdentity'
import { getWorkIdentity, workIdentityLabel, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'

const WORK_IDS: MpWorkIdentity[] = ['talent', 'shoot', 'edit', 'pr']

export default function ProfilePage() {
  const nav = useNavigate()
  const acc = getAccount()
  const workId = getWorkIdentity()
  const member = readMember()
  const pr = readPrProfile()
  const [switching, setSwitching] = useState(false)
  const [err, setErr] = useState('')

  async function onPickIdentity(id: MpWorkIdentity) {
    if (id === workId || switching) return
    setErr('')
    setSwitching(true)
    try {
      await applyWorkIdentitySwitch(id)
      nav('/hall', { replace: true })
      window.location.reload()
    } catch (e) {
      setErr(formatMpApiErr(e, '身份切换失败'))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">我的</h2>

      <section className="surface-card rounded-xl border p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">工作台身份</h3>
        <p className="text-xs text-slate-500 mb-3">同一账号可在达人、拍摄团队、剪辑团队、PR 之间自由切换</p>
        <div className="flex flex-wrap gap-2">
          {WORK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              disabled={switching}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                workId === id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'
              }`}
              onClick={() => void onPickIdentity(id)}
            >
              {workIdentityLabel(id)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          当前：{workIdentityLabel(workId)}
          {switching ? ' · 切换中…' : ''}
        </p>
        {err ? <p className="text-xs text-red-400 mt-2">{err}</p> : null}
      </section>

      <dl className="surface-card rounded-xl border p-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">手机号</dt>
          <dd>{acc?.loginName || acc?.wxNickName || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">灵祺达人 ID</dt>
          <dd className="text-amber-400 font-mono">{acc?.lingqiTalentId || member?.lingqiTalentId || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">PR ID</dt>
          <dd className="text-amber-400 font-mono">{acc?.lingqiPrId || pr?.lingqiPrId || '—'}</dd>
        </div>
      </dl>

      <section className="surface-card rounded-xl border p-6">
        <h3 className="font-semibold mb-2">达人资料</h3>
        <p className="text-sm text-slate-400 mb-4">
          {member ? `已填写平台：${memberTypeLabel(member)}` : '尚未填写多平台资料，报名时可一键同步'}
        </p>
        <Link
          to="/profile/talent"
          className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500 mr-3"
        >
          编辑我的信息
        </Link>
      </section>

      <section className="surface-card rounded-xl border p-6">
        <h3 className="font-semibold mb-2">PR 资料</h3>
        <p className="text-sm text-slate-400 mb-4">
          {pr ? prDisplayName(pr) || '已保存 PR 资料' : '填写机构/个人信息后可用于发招募与推荐达人'}
        </p>
        <Link
          to="/profile/pr"
          className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500"
        >
          编辑 PR 信息
        </Link>
      </section>
    </div>
  )
}
