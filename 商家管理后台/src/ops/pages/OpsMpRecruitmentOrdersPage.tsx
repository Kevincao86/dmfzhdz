import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { dedupeMpOrdersByMerchantSource } from '../mpRecruitmentDedup'
import { mpRecruitmentSharePath } from '../mpRecruitmentShare'
import {
  iceSlotsFilledCount,
  iceSlotsPassedCount,
  isIceMpOrder,
} from '../../meooRegistryShared/mpRecruitmentIceCore'
import {
  reviewOpenMpApplicant,
  type ReviewOpenApplicantAction,
} from '../../meooRegistryShared/mpRecruitmentOpenCore'
import { resolveEffectiveMpOrderStatus } from '../../meooRegistryShared/mpOrderEffectiveStatus'
import {
  fulfillmentLoopLabel,
  inferFulfillmentLoop,
  mpApplicantTaskStatusLabel,
  mpHallDisplayLabel,
} from '../../meooRegistryShared/recruitmentLoop'
import type { RecruitmentFulfillmentLoop } from '../../meooRegistryShared/opsRegistryTypes'
import {
  fetchRegistry,
  patchMpRecruitmentOrder,
  deleteMpRecruitmentOrders,
  type RegistryMpRecruitmentOrder,
} from '../opsRegistryApi'
import OpsPageHero from '../OpsPageHero'

type MpStatus = RegistryMpRecruitmentOrder['status']
type EffectiveMpStatus = MpStatus | 'expired'
type RecruitTarget = 'talent' | 'shoot' | 'edit'

function mpStatusLabel(s: EffectiveMpStatus): string {
  const m: Record<EffectiveMpStatus, string> = {
    open: '招募中',
    collecting: '收集中',
    expired: '已截止',
    pending_settlement: '待结算',
    closed: '已关闭',
    done: '已完成',
  }
  return m[s] ?? s
}

function mpStatusStyle(s: EffectiveMpStatus): string {
  if (s === 'open') return 'bg-emerald-500/15 text-emerald-400'
  if (s === 'collecting') return 'bg-sky-500/15 text-sky-400'
  if (s === 'expired') return 'bg-slate-500/20 text-slate-300'
  if (s === 'pending_settlement') return 'bg-violet-500/15 text-violet-300'
  if (s === 'done') return 'bg-indigo-500/15 text-indigo-300'
  return 'bg-slate-600 text-slate-300'
}

function mpOrderStatusView(o: RegistryMpRecruitmentOrder): {
  effective: EffectiveMpStatus
  staleRaw: boolean
  hallVisible: boolean
} {
  const effective = resolveEffectiveMpOrderStatus(o)
  const raw = o.status
  const staleRaw =
    (raw === 'open' || raw === 'collecting') && effective !== raw
  const hallVisible =
    effective === 'open' ||
    effective === 'collecting' ||
    effective === 'closed' ||
    effective === 'expired'
  return { effective, staleRaw, hallVisible }
}

function inferRecruitTarget(o: RegistryMpRecruitmentOrder): RecruitTarget {
  const raw = o as RegistryMpRecruitmentOrder & { recruitTarget?: string }
  const meta =
    o.mpPublishMeta && typeof o.mpPublishMeta === 'object'
      ? (o.mpPublishMeta as Record<string, unknown>)
      : null
  const t = String(raw.recruitTarget || meta?.recruitTarget || '')
  if (t === 'shoot' || t === 'edit') return t
  const info = String(o.recruitmentInfo || o.taskDetail || '')
  if (info.includes('招募对象：拍摄')) return 'shoot'
  if (info.includes('招募对象：剪辑')) return 'edit'
  return 'talent'
}

function recruitTargetLabel(t: RecruitTarget): string {
  if (t === 'shoot') return '拍摄'
  if (t === 'edit') return '剪辑'
  return '达人'
}

function publisherLabel(o: RegistryMpRecruitmentOrder): string {
  return o.publisherIdentity === 'pr' ? 'PR' : '商家'
}

function rawMpStatusLabel(s: MpStatus): string {
  const m: Record<MpStatus, string> = {
    open: '招募中',
    collecting: '收集中',
    pending_settlement: '待结算',
    closed: '已关闭',
    done: '已完成',
  }
  return m[s] ?? s
}

function loopBadgeStyle(loop: RecruitmentFulfillmentLoop): string {
  return loop === 'closed' ? 'bg-amber-500/15 text-amber-300' : 'bg-teal-500/15 text-teal-300'
}

export default function OpsMpRecruitmentOrdersPage() {
  const [status, setStatus] = useState<'all' | EffectiveMpStatus>('all')
  const [loopFilter, setLoopFilter] = useState<'all' | RecruitmentFulfillmentLoop>('all')
  const [targetFilter, setTargetFilter] = useState<'all' | RecruitTarget>('all')
  const [publisherFilter, setPublisherFilter] = useState<'all' | 'pr' | 'merchant'>('all')
  const [orders, setOrders] = useState<RegistryMpRecruitmentOrder[]>([])
  const [detail, setDetail] = useState<RegistryMpRecruitmentOrder | null>(null)
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setOrders(dedupeMpOrdersByMerchantSource(r.mpRecruitmentOrders))
    } catch {
      setOrders([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(t)
  }, [load])

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [orders],
  )

  const rows = useMemo(() => {
    return sorted.filter((o) => {
      if (status !== 'all' && resolveEffectiveMpOrderStatus(o) !== status) return false
      if (loopFilter !== 'all' && inferFulfillmentLoop(o) !== loopFilter) return false
      if (targetFilter !== 'all' && inferRecruitTarget(o) !== targetFilter) return false
      if (publisherFilter === 'pr' && o.publisherIdentity !== 'pr') return false
      if (publisherFilter === 'merchant' && o.publisherIdentity === 'pr') return false
      return true
    })
  }, [sorted, status, loopFilter, targetFilter, publisherFilter])

  const visibleIds = useMemo(() => rows.map((o) => o.id), [rows])
  const allVisibleChecked = visibleIds.length > 0 && visibleIds.every((id) => checkedIds.includes(id))

  const toggleRowCheck = (id: string) => {
    setCheckedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  const toggleAllVisible = () => {
    if (allVisibleChecked) {
      setCheckedIds((cur) => cur.filter((id) => !visibleIds.includes(id)))
    } else {
      setCheckedIds((cur) => [...new Set([...cur, ...visibleIds])])
    }
  }

  const deleteOrders = async (ids: string[]) => {
    const uniq = [...new Set(ids.map(String).filter(Boolean))]
    if (!uniq.length || deleting) return
    const msg =
      uniq.length === 1
        ? '删除后该招募单将从大厅移除，报名与站内信一并清除，商家/PR/达人/拍摄/剪辑端刷新后可重新发单或报名。确定删除？'
        : `确定删除选中的 ${uniq.length} 条招募单？删除后相关端需刷新，可重新开始发单与报名。`
    if (!window.confirm(msg)) return
    setDeleting(true)
    try {
      const r = await deleteMpRecruitmentOrders({ ids: uniq })
      if (!r.ok) {
        window.alert(r.error ?? '删除失败')
        return
      }
      setCheckedIds((cur) => cur.filter((id) => !uniq.includes(id)))
      setDetail((cur) => (cur && uniq.includes(cur.id) ? null : cur))
      await load()
    } finally {
      setDeleting(false)
    }
  }

  const changeStatus = async (id: string, next: MpStatus) => {
    setPatchBusyId(id)
    try {
      const r = await patchMpRecruitmentOrder({ id, status: next })
      if (!r.ok) {
        window.alert(r.error ?? '更新失败')
        return
      }
      await load()
      setDetail((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur))
    } finally {
      setPatchBusyId(null)
    }
  }

  const reviewApplicant = async (mpId: string, applicantId: string, action: ReviewOpenApplicantAction) => {
    if (!detail || detail.id !== mpId) return
    const reviewed = reviewOpenMpApplicant(detail, applicantId, action)
    if (!reviewed.ok) {
      window.alert(reviewed.error)
      return
    }
    setPatchBusyId(mpId)
    try {
      const r = await patchMpRecruitmentOrder({
        id: mpId,
        applicants: reviewed.mp.applicants,
      })
      if (!r.ok) {
        window.alert(r.error ?? '更新失败')
        return
      }
      await load()
      setDetail(reviewed.mp)
    } finally {
      setPatchBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <OpsPageHero
        heroKey="mp-recruitment-orders"
        trailing={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-sm text-white backdrop-blur-sm hover:bg-white/20"
          >
            刷新列表
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <span className="text-sm text-slate-400">状态</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="open">招募中</option>
          <option value="collecting">收集中</option>
          <option value="expired">已截止</option>
          <option value="pending_settlement">待结算</option>
          <option value="closed">已关闭</option>
          <option value="done">已完成</option>
        </select>
        <span className="text-sm text-slate-400">链路</span>
        <select
          value={loopFilter}
          onChange={(e) => setLoopFilter(e.target.value as typeof loopFilter)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="open">开环招募</option>
          <option value="closed">闭环云剪</option>
        </select>
        <span className="text-sm text-slate-400">对象</span>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value as typeof targetFilter)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="talent">达人</option>
          <option value="shoot">拍摄</option>
          <option value="edit">剪辑</option>
        </select>
        <span className="text-sm text-slate-400">发布方</span>
        <select
          value={publisherFilter}
          onChange={(e) => setPublisherFilter(e.target.value as typeof publisherFilter)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="pr">PR</option>
          <option value="merchant">商家/运营</option>
        </select>
        {checkedIds.length > 0 ? (
          <button
            type="button"
            disabled={deleting}
            onClick={() => void deleteOrders(checkedIds)}
            className="rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-950 disabled:opacity-50"
          >
            {deleting ? '删除中…' : `批量删除（${checkedIds.length}）`}
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">共 {rows.length} 条</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleChecked}
                    onChange={toggleAllVisible}
                    aria-label="全选当前页"
                    className="rounded border-slate-600"
                  />
                </th>
                <th className="px-3 py-3">小程序单号</th>
                <th className="px-3 py-3">关联商家订单</th>
                <th className="px-3 py-3">客户 / 门店</th>
                <th className="px-3 py-3">对象</th>
                <th className="px-3 py-3">发布方</th>
                <th className="px-3 py-3">链路</th>
                <th className="px-3 py-3">大厅</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">报名数</th>
                <th className="px-3 py-3">创建时间</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-10 text-center text-sm text-slate-500">
                    暂无小程序招募单。请在「商家达人招募订单」处理弹窗中选择「小程序招募」或「云剪单」创建。
                  </td>
                </tr>
              ) : (
                rows.map((o) => {
                  const loop = inferFulfillmentLoop(o)
                  const target = inferRecruitTarget(o)
                  return (
                    <tr key={o.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={checkedIds.includes(o.id)}
                          onChange={() => toggleRowCheck(o.id)}
                          aria-label={`选择 ${o.id}`}
                          className="rounded border-slate-600"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-300">{o.id}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">{o.sourceMerchantOrderId}</td>
                      <td className="px-3 py-2 text-slate-300">
                        <div>{o.customerName}</div>
                        <div className="text-xs text-slate-500">{o.storeName}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                          {recruitTargetLabel(target)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            o.publisherIdentity === 'pr' ? 'bg-violet-500/15 text-violet-300' : 'bg-slate-700 text-slate-300',
                          )}
                        >
                          {publisherLabel(o)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', loopBadgeStyle(loop))}>
                          {fulfillmentLoopLabel(loop)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            isIceMpOrder(o) ? 'bg-amber-500/15 text-amber-300' : o.urgent ? 'bg-rose-500/15 text-rose-400' : 'bg-sky-500/15 text-sky-400',
                          )}
                        >
                          {mpHallDisplayLabel(o)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {(() => {
                          const sv = mpOrderStatusView(o)
                          return (
                            <div className="space-y-0.5">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-xs font-medium',
                                  mpStatusStyle(sv.effective),
                                )}
                              >
                                {mpStatusLabel(sv.effective)}
                              </span>
                              {sv.staleRaw ? (
                                <p className="text-[10px] leading-tight text-amber-400/90">
                                  库内仍标「{rawMpStatusLabel(o.status)}」· 星选展示为「{mpStatusLabel(sv.effective)}」
                                </p>
                              ) : null}
                              {!sv.hallVisible && !sv.staleRaw ? (
                                <p className="text-[10px] leading-tight text-slate-500">大厅不可见</p>
                              ) : null}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-slate-300">{(o.applicants ?? []).length}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{o.createdAt}</td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button type="button" onClick={() => setDetail(o)} className="text-xs text-indigo-400 hover:underline">
                          详情
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={() => void deleteOrders([o.id])}
                          className="text-xs text-rose-400 hover:underline disabled:opacity-40"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" onClick={() => setDetail(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">小程序招募详情</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{detail.id}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', loopBadgeStyle(inferFulfillmentLoop(detail)))}>
                {fulfillmentLoopLabel(inferFulfillmentLoop(detail))}
              </span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{mpHallDisplayLabel(detail)}</span>
            </div>
            {isIceMpOrder(detail) ? (
              <p className="mt-2 text-xs text-amber-200/80">
                成片 {iceSlotsFilledCount(detail)}/{(detail.iceVideoSlots ?? []).length} 已分配 ·{' '}
                {iceSlotsPassedCount(detail)} 条已通过 AI 核查
              </p>
            ) : null}
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                <span className="text-slate-500">商家订单：</span>
                {detail.sourceMerchantOrderId}
              </p>
              <p>
                <span className="text-slate-500">客户 / 门店：</span>
                {detail.customerName} · {detail.storeName}
              </p>
              <p>
                <span className="text-slate-500">招募平台：</span>
                {detail.platform || '抖音'}
              </p>
              <p>
                <span className="text-slate-500">分享路径：</span>
                <span className="font-mono text-xs text-emerald-300">{mpRecruitmentSharePath(detail.id)}</span>
              </p>
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                <p className="mb-1 font-medium text-slate-300">招募信息</p>
                <pre className="whitespace-pre-wrap">{detail.recruitmentInfo || detail.merchantRequirements || '—'}</pre>
                <p className="mt-2 mb-1 font-medium text-slate-300">任务详情</p>
                <pre className="whitespace-pre-wrap">{detail.taskDetail || '—'}</pre>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['open', '招募中'],
                  ['collecting', '收集中'],
                  ['pending_settlement', '待结算'],
                  ['closed', '已关闭'],
                  ['done', '已完成'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  disabled={patchBusyId === detail.id || detail.status === st}
                  onClick={() => void changeStatus(detail.id, st)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-400">达人报名（{(detail.applicants ?? []).length}）</div>
              {(detail.applicants ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">暂无报名，请分享小程序招募页给达人。</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {(detail.applicants ?? []).map((a) => {
                    const nick = a.platformNickname || a.name
                    const loop = inferFulfillmentLoop(detail)
                    const taskLabel = mpApplicantTaskStatusLabel(a.taskStatus, loop)
                    return (
                      <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-200">
                            {nick} · {a.platform} · {a.followers.toLocaleString('zh-CN')} 粉
                          </div>
                          <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{taskLabel}</span>
                        </div>
                        <div className="mt-1 space-y-0.5 text-slate-500">
                          <div>号：{a.platformAccount || '—'}</div>
                          {a.douyinPublishUrl ? (
                            <div className="truncate text-emerald-400" title={a.douyinPublishUrl}>
                              抖音链接：{a.douyinPublishUrl}
                            </div>
                          ) : null}
                          {a.assignedVideoLabel ? <div>成片：{a.assignedVideoLabel}</div> : null}
                          {a.aiVerifyStatus ? (
                            <div>
                              AI 核查：{a.aiVerifyStatus === 'passed' ? '通过' : a.aiVerifyStatus}
                              {a.aiVerifyNote ? ` · ${a.aiVerifyNote}` : ''}
                            </div>
                          ) : null}
                          <div>联系：{a.contact || '—'} · 微信：{a.wechatId || '—'}</div>
                          {!isIceMpOrder(detail) ? (
                            <div>
                              报价：{a.quotePrice || '—'} · 探店：{a.visitTimeSlot || '—'}
                            </div>
                          ) : null}
                        </div>
                        {loop === 'open' && (!a.taskStatus || a.taskStatus === 'applied') ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={patchBusyId === detail.id}
                              onClick={() => void reviewApplicant(detail.id, a.id, 'shortlist')}
                              className="rounded border border-slate-600 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800"
                            >
                              初筛通过
                            </button>
                            <button
                              type="button"
                              disabled={patchBusyId === detail.id}
                              onClick={() => void reviewApplicant(detail.id, a.id, 'approve')}
                              className="rounded border border-emerald-700 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-950"
                            >
                              通过反选
                            </button>
                            <button
                              type="button"
                              disabled={patchBusyId === detail.id}
                              onClick={() => void reviewApplicant(detail.id, a.id, 'reject')}
                              className="rounded border border-rose-800 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-950"
                            >
                              拒绝
                            </button>
                          </div>
                        ) : null}
                        <div className="mt-1 text-[10px] text-slate-600">{a.appliedAt}</div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void deleteOrders([detail.id])}
                className="rounded-lg border border-rose-700 bg-rose-950/40 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950 disabled:opacity-50"
              >
                删除招募单
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mpRecruitmentSharePath(detail.id))
                    window.alert('分享路径已复制')
                  } catch {
                    window.alert('复制失败')
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
              >
                复制分享路径
              </button>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600">
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
