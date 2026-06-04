import { Link } from 'react-router-dom'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { getWorkIdentity, setWorkIdentity, workIdentityLabel, type MpWorkIdentity } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'

const WORK_IDS: MpWorkIdentity[] = ['talent', 'shoot', 'edit', 'pr']

export default function ProfilePage() {
  const acc = getAccount()
  const role = getActiveRole()
  const workId = getWorkIdentity()
  const member = readMember()
  const pr = readPrProfile()

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">我的</h2>

      <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">工作台身份（与小程序「我的」一致）</h3>
        <div className="flex flex-wrap gap-2">
          {WORK_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                workId === id ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'
              }`}
              onClick={() => setWorkIdentity(id)}
            >
              {workIdentityLabel(id)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">当前：{workIdentityLabel(workId)} · 账号版本仍为 {role === 'pr' ? 'PR' : '达人'}</p>
      </section>

      <dl className="rounded-xl border border-white/10 bg-[#1a1a28] p-6 space-y-3 text-sm">
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
        <p className="text-xs text-slate-500 pt-2 border-t border-white/10">
          与小程序共用 localStorage（meoo_talent_member_v1、meoo_pr_profile_v1 等），同一浏览器下数据互通。
        </p>
      </dl>

      {role === 'talent' ? (
        <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-6">
          <h3 className="font-semibold mb-2">达人资料</h3>
          <p className="text-sm text-slate-400 mb-4">
            {member ? `已填写平台：${memberTypeLabel(member)}` : '尚未填写多平台资料，报名时可一键同步'}
          </p>
          <Link
            to="/profile/talent"
            className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500"
          >
            编辑我的信息
          </Link>
        </section>
      ) : (
        <section className="rounded-xl border border-white/10 bg-[#1a1a28] p-6">
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
      )}
    </div>
  )
}
