import { Link } from 'react-router-dom'
import { getAccount } from '../lib/mpSession'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'

export default function ProfilePage() {
  const acc = getAccount()
  const workId = getWorkIdentity()
  const isPr = workId === 'pr'
  const member = readMember()
  const pr = readPrProfile()
  const edition = WORK_EDITION_LABEL[workId]

  const systemId = isPr
    ? acc?.lingqiPrId || pr?.lingqiPrId || '—'
    : acc?.lingqiTalentId || member?.lingqiTalentId || '—'
  const systemIdLabel = isPr ? 'PR ID' : '灵祺达人 ID'

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--shell-text)]">我的</h2>
        <p className="text-sm text-[var(--shell-muted)] mt-1">当前身份：{edition}</p>
      </div>

      <dl className="surface-card rounded-xl border p-6 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--shell-muted)]">手机号</dt>
          <dd className="text-[var(--shell-text)]">{acc?.loginName || acc?.wxNickName || '—'}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-[var(--shell-muted)]">{systemIdLabel}</dt>
          <dd className="text-amber-500 font-mono">{systemId}</dd>
        </div>
      </dl>

      {isPr ? (
        <section className="surface-card rounded-xl border p-6">
          <h3 className="font-semibold mb-2 text-[var(--shell-text)]">PR 资料</h3>
          <p className="text-sm text-[var(--shell-muted)] mb-4">
            {pr ? prDisplayName(pr) || '已保存 PR 资料' : '填写机构/个人信息后可用于发招募与推荐达人'}
          </p>
          <Link
            to="/profile/pr"
            className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500 text-white"
          >
            编辑 PR 信息
          </Link>
        </section>
      ) : (
        <section className="surface-card rounded-xl border p-6">
          <h3 className="font-semibold mb-2 text-[var(--shell-text)]">我的资料</h3>
          <p className="text-sm text-[var(--shell-muted)] mb-4">
            {member ? `已填写平台：${memberTypeLabel(member)}` : '尚未填写多平台资料，报名时可一键同步'}
          </p>
          <Link
            to="/profile/talent"
            className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500 text-white"
          >
            编辑我的信息
          </Link>
        </section>
      )}
    </div>
  )
}
