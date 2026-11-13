import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listForTalent, respond } from '../lib/mpSync/mpTargetedRecruitApi'
import { statusLabel } from '../lib/mpSync/mpTargetedRecruit'
import { resolveTalentMemberId } from '../lib/mpSync/participant'
import { BtnOutline, BtnPrimary } from '../components/ui/MockupLayouts'

type InviteRow = {
  mpOrderId?: string
  orderTitle?: string
  status?: string
  invitedAt?: string
  inviteDeadline?: string
}

export default function TargetedInvitesPage() {
  const [rows, setRows] = useState<InviteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    const talentMemberId = resolveTalentMemberId()
    if (!talentMemberId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await listForTalent(talentMemberId)
      const list = (res.invites as InviteRow[]) || []
      setRows(list)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onRespond(mpOrderId: string, response: 'accept' | 'reject', rejectReason?: string) {
    const talentMemberId = resolveTalentMemberId()
    if (!mpOrderId || !talentMemberId) return
    setBusyId(mpOrderId)
    try {
      await respond(mpOrderId, talentMemberId, response, rejectReason)
      await load()
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '操作失败'))
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="page-content-shell">
      <header className="mb-4">
        <Link to="/orders" className="text-sm text-blue-600 hover:underline">
          ← 我的报名
        </Link>
        <h1 className="text-xl font-semibold mt-2">定向合作邀约</h1>
      </header>

      {loading ? <p className="text-sm">加载中…</p> : null}
      {!loading && !rows.length ? (
        <p className="text-sm text-[var(--shell-muted)]">暂无定向邀约</p>
      ) : null}

      <ul className="space-y-3">
        {rows.map((row) => {
          const mpOrderId = String(row.mpOrderId || '')
          const pending = row.status === 'pending'
          return (
            <li key={mpOrderId} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    to={`/recruitment/${encodeURIComponent(mpOrderId)}?targetedInvite=1`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {row.orderTitle || mpOrderId}
                  </Link>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">
                    {statusLabel(String(row.status || ''))}
                    {row.inviteDeadline ? ` · 截止 ${row.inviteDeadline}` : ''}
                  </p>
                </div>
                {pending ? (
                  <div className="flex gap-2">
                    <BtnPrimary
                      disabled={busyId === mpOrderId}
                      onClick={() => void onRespond(mpOrderId, 'accept')}
                    >
                      接受
                    </BtnPrimary>
                    <BtnOutline
                      disabled={busyId === mpOrderId}
                      onClick={() => {
                        const reason = window.prompt('拒绝原因（可选）')
                        if (reason === null) return
                        void onRespond(mpOrderId, 'reject', reason.trim())
                      }}
                    >
                      拒绝
                    </BtnOutline>
                  </div>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
