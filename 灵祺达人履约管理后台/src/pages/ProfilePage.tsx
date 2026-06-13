import { Link } from 'react-router-dom'
import { getAccount } from '../lib/mpSession'
import { getWorkIdentity, WORK_EDITION_LABEL } from '../lib/mpWorkIdentity'
import { readMember, memberTypeLabel } from '../lib/mpSync/talentMember'
import { supplierSummaryLabel } from '../lib/mpSync/supplierTeamProfile'
import { prDisplayName, readPrProfile } from '../lib/mpSync/userProfile'
import PageHero from '../components/ui/PageHero'

export default function ProfilePage() {
  const acc = getAccount()
  const workId = getWorkIdentity()
  const isPr = workId === 'pr'
  const member = readMember()
  const pr = readPrProfile()
  const edition = WORK_EDITION_LABEL[workId]

  const systemId = isPr
    ? acc?.lingqiPrId || pr?.lingqiPrId || '—'
    : workId === 'shoot'
      ? member?.lingqiShootTeamId || acc?.lingqiShootTeamId || '—'
      : workId === 'edit'
        ? member?.lingqiEditTeamId || acc?.lingqiEditTeamId || '—'
        : acc?.lingqiTalentId || member?.lingqiTalentId || '—'
  const systemIdLabel = isPr
    ? 'PR ID'
    : workId === 'shoot'
      ? '拍摄团队 ID'
      : workId === 'edit'
        ? '剪辑团队 ID'
        : '灵祺达人 ID'

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-5">
      <PageHero
        title="我的"
        subtitle={`当前身份：${edition} · 完善资料后，推荐大厅将按标签与习惯智能匹配`}
        badge={acc?.loginName || acc?.wxNickName || '账户'}
      />

      <dl className="surface-card rounded-xl border p-6 space-y-4 text-sm hover-panel">
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
        <section className="surface-card rounded-xl border p-6 hover-panel">
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
        <section className="surface-card rounded-xl border p-6 hover-panel">
          <h3 className="font-semibold mb-2 text-[var(--shell-text)]">我的资料</h3>
          <p className="text-sm text-[var(--shell-muted)] mb-4">
            {workId === 'shoot' || workId === 'edit'
              ? member?.supplierProfile
                ? supplierSummaryLabel(workId, member.supplierProfile as never)
                : '尚未填写团队资料'
              : member
                ? `已填写平台：${memberTypeLabel(member)}`
                : '尚未填写多平台资料，报名时可一键同步'}
          </p>
          <Link
            to={workId === 'shoot' || workId === 'edit' ? '/profile/supplier' : '/profile/talent'}
            className="inline-block px-4 py-2 rounded-lg bg-violet-600 text-sm font-medium hover:bg-violet-500 text-white"
          >
            {workId === 'shoot' || workId === 'edit' ? '编辑团队信息' : '编辑我的信息'}
          </Link>
        </section>
      )}
    </div>
  )
}
