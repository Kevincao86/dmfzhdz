import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { createGroup, getGroup } from '../lib/mpSync/orderGroupChat'
import {
  groupQrFromMp,
  groupQrFromRegistry,
  isGroupQrExpired,
  patchGroupQrImage,
  readImageFileAsDataUrl,
} from '../lib/mpSync/mpGroupQr'
import {
  inviteStats,
  isTargetedInvitePhaseFinalized,
  readInvites,
  statusLabel,
  type TargetedInvite,
} from '../lib/mpSync/mpTargetedRecruit'
import { cancelInvite, confirmInvitePhase, orderSummary } from '../lib/mpSync/mpTargetedRecruitApi'
import { resolvePrWorkflowStage } from '../lib/mpRecruitment/prOrderWorkflowStage'
import { BtnOutline, BtnPrimary, FormSection } from '../components/ui/MockupLayouts'

function splitInvites(invites: TargetedInvite[]) {
  return {
    acceptedRows: invites.filter((i) => i.status === 'accepted'),
    pendingRows: invites.filter((i) => i.status === 'pending'),
    rejectedRows: invites.filter((i) => i.status === 'rejected'),
    expiredRows: invites.filter((i) => i.status === 'expired'),
  }
}

export default function PrTargetedManagePage() {
  const { id: mpOrderId = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [orderTitle, setOrderTitle] = useState('')
  const [inviteDeadline, setInviteDeadline] = useState('')
  const [inviteResponseHours, setInviteResponseHours] = useState(72)
  const [stats, setStats] = useState({ invited: 0, accepted: 0, rejected: 0, pending: 0, expired: 0 })
  const [acceptedRows, setAcceptedRows] = useState<TargetedInvite[]>([])
  const [pendingRows, setPendingRows] = useState<TargetedInvite[]>([])
  const [rejectedRows, setRejectedRows] = useState<TargetedInvite[]>([])
  const [expiredRows, setExpiredRows] = useState<TargetedInvite[]>([])
  const [invitePhaseFinalized, setInvitePhaseFinalized] = useState(false)
  const [groupContactMode, setGroupContactMode] = useState<'mp_group' | 'wechat_qr' | ''>('')
  const [groupQrImage, setGroupQrImage] = useState('')
  const [groupQrExpired, setGroupQrExpired] = useState(false)
  const [groupQrUploading, setGroupQrUploading] = useState(false)
  const [orderGroupChatActive, setOrderGroupChatActive] = useState(false)
  const [orderGroupChatClosed, setOrderGroupChatClosed] = useState(false)
  const [orderGroupChatTitle, setOrderGroupChatTitle] = useState('')
  const [orderGroupChatCreating, setOrderGroupChatCreating] = useState(false)
  const [confirmingPhase, setConfirmingPhase] = useState(false)
  const qrFileRef = useRef<HTMLInputElement>(null)

  const syncOrderGroupChatState = useCallback(async () => {
    if (!mpOrderId) return
    try {
      const body = await getGroup(mpOrderId)
      const group = body.group as Record<string, unknown> | undefined
      if (!group) {
        setOrderGroupChatActive(false)
        setOrderGroupChatClosed(false)
        setOrderGroupChatTitle('')
        return
      }
      setOrderGroupChatActive(true)
      setOrderGroupChatClosed(group.status === 'closed')
      setOrderGroupChatTitle(String(group.title || ''))
      setGroupContactMode((prev) => prev || 'mp_group')
    } catch {
      setOrderGroupChatActive(false)
      setOrderGroupChatClosed(false)
      setOrderGroupChatTitle('')
    }
  }, [mpOrderId])

  const load = useCallback(async () => {
    if (!mpOrderId) return
    setLoading(true)
    setErr('')
    try {
      const [summary, reg] = await Promise.all([
        orderSummary(mpOrderId),
        fetchMpRegistry({ includeMpOrderIds: [mpOrderId] }),
      ])
      const mpList = Array.isArray(reg?.mpOrders) ? (reg.mpOrders as Record<string, unknown>[]) : []
      const mp = mpList.find((x) => String(x.id || x.mpOrderId || '') === mpOrderId) || null
      const meta = (summary.meta as Record<string, unknown>) || (mp?.mpPublishMeta as Record<string, unknown>) || {}
      const invites = (summary.invites as TargetedInvite[]) || readInvites(mp)
      const parts = splitInvites(invites)
      const finalized =
        isTargetedInvitePhaseFinalized(mp) || resolvePrWorkflowStage(mp) === 'pending_schedule'
      setOrderTitle(String(mp?.title || '定向招募'))
      setInviteDeadline(String(meta.inviteDeadline || ''))
      setInviteResponseHours(Number(meta.inviteResponseHours) || 72)
      setStats((summary.stats as typeof stats) || inviteStats(mp))
      setAcceptedRows(parts.acceptedRows)
      setPendingRows(parts.pendingRows)
      setRejectedRows(parts.rejectedRows)
      setExpiredRows(parts.expiredRows)
      setInvitePhaseFinalized(finalized)
      setGroupQrImage(groupQrFromRegistry(reg as Record<string, unknown>, mpOrderId) || groupQrFromMp(mp))
      setGroupQrExpired(isGroupQrExpired(mp))
      await syncOrderGroupChatState()
    } catch (e) {
      setErr(String(e instanceof Error ? e.message : e || '加载失败'))
    } finally {
      setLoading(false)
    }
  }, [mpOrderId, syncOrderGroupChatState])

  useEffect(() => {
    void load()
  }, [load])

  async function onConfirmCreateOrderGroupChat() {
    if (orderGroupChatCreating) return
    if (stats.accepted <= 0) {
      window.alert('暂无已同意达人')
      return
    }
    if (orderGroupChatActive) {
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)
      return
    }
    if (!window.confirm(`将为已同意 ${stats.accepted} 位达人创建商单群。是否确认？`)) return
    setOrderGroupChatCreating(true)
    setGroupContactMode('mp_group')
    try {
      const body = await createGroup(mpOrderId)
      const group = body.group as Record<string, unknown> | undefined
      setOrderGroupChatActive(true)
      setOrderGroupChatClosed(false)
      setOrderGroupChatTitle(String(group?.title || ''))
      window.alert(body.existed ? '群已存在' : '商单群已创建')
      navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '创建失败'))
    } finally {
      setOrderGroupChatCreating(false)
    }
  }

  async function onUploadGroupQrFile(file: File) {
    if (groupQrUploading || groupQrExpired) return
    try {
      setGroupQrUploading(true)
      const dataUrl = await readImageFileAsDataUrl(file)
      const patchResult = await patchGroupQrImage(mpOrderId, dataUrl)
      const imageUrl = String(patchResult?.imageUrl || dataUrl || '').trim()
      setGroupQrImage(imageUrl)
      setGroupContactMode('wechat_qr')
      window.alert('群二维码已保存')
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e)
      if (msg !== 'cancel') window.alert(msg.slice(0, 80))
    } finally {
      setGroupQrUploading(false)
    }
  }

  async function onConfirmInvitePhase() {
    if (confirmingPhase || invitePhaseFinalized) return
    if (stats.accepted <= 0) {
      window.alert('暂无已同意达人')
      return
    }
    if (
      !window.confirm(
        `将把 ${stats.accepted} 位已同意达人移入「待排期」，未响应邀约将标记过期。是否继续？`,
      )
    ) {
      return
    }
    setConfirmingPhase(true)
    try {
      await confirmInvitePhase(mpOrderId)
      window.alert('已进入待排期')
      navigate('/orders?tab=pending_schedule')
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '操作失败'))
    } finally {
      setConfirmingPhase(false)
    }
  }

  async function onCancelInvite(inviteId: string) {
    if (!inviteId || invitePhaseFinalized) return
    if (!window.confirm('确认取消该达人的邀约？')) return
    try {
      await cancelInvite(mpOrderId, inviteId)
      await load()
    } catch (e) {
      window.alert(String(e instanceof Error ? e.message : e || '失败'))
    }
  }

  function InviteTable({ rows, showCancel }: { rows: TargetedInvite[]; showCancel?: boolean }) {
    if (!rows.length) return <p className="text-sm text-[var(--shell-muted)]">暂无</p>
    return (
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <li key={String(row.id || row.talentMemberId)} className="flex items-center justify-between px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{row.talentName || row.talentMemberId || '达人'}</div>
              <div className="text-xs text-[var(--shell-muted)]">{statusLabel(String(row.status || ''))}</div>
            </div>
            {showCancel && row.id ? (
              <button type="button" className="text-red-600 text-xs" onClick={() => void onCancelInvite(String(row.id))}>
                取消
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="page-content-shell">
      <header className="mb-4">
        <Link to="/orders" className="text-sm text-blue-600 hover:underline">
          ← 我的发单
        </Link>
        <h1 className="text-xl font-semibold mt-2">定向邀约管理</h1>
        <p className="text-sm text-[var(--shell-muted)]">{orderTitle}</p>
        {inviteDeadline ? (
          <p className="text-xs text-[var(--shell-muted)] mt-1">邀约截止：{inviteDeadline}</p>
        ) : null}
      </header>

      {loading ? <p className="text-sm">加载中…</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {!loading && !err ? (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-slate-100 px-3 py-1">邀约 {stats.invited}</span>
            <span className="rounded-full bg-emerald-50 text-emerald-800 px-3 py-1">同意 {stats.accepted}</span>
            <span className="rounded-full bg-amber-50 text-amber-800 px-3 py-1">待响应 {stats.pending}</span>
          </div>

          {!invitePhaseFinalized ? (
            <div className="flex flex-wrap gap-2">
              <BtnPrimary onClick={() => navigate(`/orders/${encodeURIComponent(mpOrderId)}/targeted/pick?hours=${inviteResponseHours}`)}>
                继续邀约达人
              </BtnPrimary>
            </div>
          ) : null}

          <FormSection title="已同意">
            <InviteTable rows={acceptedRows} />
          </FormSection>
          <FormSection title="待响应">
            <InviteTable rows={pendingRows} showCancel={!invitePhaseFinalized} />
          </FormSection>
          <FormSection title="已拒绝">
            <InviteTable rows={rejectedRows} />
          </FormSection>
          {expiredRows.length ? (
            <FormSection title="已过期">
              <InviteTable rows={expiredRows} />
            </FormSection>
          ) : null}

          {stats.accepted > 0 && !invitePhaseFinalized ? (
            <FormSection title="建群方式">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left ${groupContactMode === 'mp_group' ? 'border-blue-500 ring-1 ring-blue-200' : ''}`}
                  onClick={() => setGroupContactMode('mp_group')}
                >
                  <div className="font-medium">一键拉群</div>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">小程序商单群，支持文字/图片/视频</p>
                </button>
                <button
                  type="button"
                  className={`rounded-xl border p-4 text-left ${groupContactMode === 'wechat_qr' ? 'border-blue-500 ring-1 ring-blue-200' : ''}`}
                  onClick={() => setGroupContactMode('wechat_qr')}
                >
                  <div className="font-medium">上传群二维码</div>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">微信群码，确认进待排期后可通知达人</p>
                </button>
              </div>

              {groupContactMode === 'mp_group' ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {orderGroupChatActive ? (
                    <>
                      <BtnPrimary onClick={() => navigate(`/orders/${encodeURIComponent(mpOrderId)}/group-chat`)}>
                        进入商单群{orderGroupChatClosed ? '（已关闭）' : ''}
                      </BtnPrimary>
                      {orderGroupChatTitle ? (
                        <span className="text-xs text-[var(--shell-muted)] self-center">{orderGroupChatTitle}</span>
                      ) : null}
                    </>
                  ) : (
                    <BtnPrimary disabled={orderGroupChatCreating} onClick={() => void onConfirmCreateOrderGroupChat()}>
                      {orderGroupChatCreating ? '拉群中…' : '确认拉群'}
                    </BtnPrimary>
                  )}
                </div>
              ) : null}

              {groupContactMode === 'wechat_qr' ? (
                <div className="mt-4 space-y-3">
                  {groupQrImage ? (
                    <img src={groupQrImage} alt="群二维码" className="max-w-[200px] rounded-lg border" />
                  ) : null}
                  <BtnOutline disabled={groupQrUploading || groupQrExpired} onClick={() => qrFileRef.current?.click()}>
                    {groupQrUploading ? '上传中…' : groupQrImage ? '更换二维码' : '上传群二维码'}
                  </BtnOutline>
                  <input
                    ref={qrFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void onUploadGroupQrFile(file)
                    }}
                  />
                  {groupQrExpired ? (
                    <p className="text-xs text-amber-600">招募已截止超过 7 天，群二维码不可再修改</p>
                  ) : null}
                </div>
              ) : null}
            </FormSection>
          ) : null}

          {!invitePhaseFinalized && stats.accepted > 0 ? (
            <div className="pt-2">
              <BtnPrimary disabled={confirmingPhase} onClick={() => void onConfirmInvitePhase()}>
                {confirmingPhase ? '处理中…' : '确认完成邀约 · 进入待排期'}
              </BtnPrimary>
            </div>
          ) : invitePhaseFinalized ? (
            <div className="flex flex-wrap gap-2">
              <Link
                to={
                  mpOrderId
                    ? `/orders/${encodeURIComponent(mpOrderId)}/schedule/dates`
                    : '/orders?tab=pending_schedule'
                }
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm text-white"
              >
                进入排期
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
