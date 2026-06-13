import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { appendTalentInbox, clearMpRegistryCache, fetchMpRegistry } from '../lib/mpApi'
import {
  enrichApplicantRow,
  hallLabelFromMp,
  statusLabel,
  type EnrichedApplicantRow,
} from '../lib/mpSync/applicationDisplay'
import {
  filterSelectedApplicants,
  persistSelectedIds,
  selectedIdsFromMp,
  readLocalSelectedIds,
  stampApplicantsSelected,
} from '../lib/mpSync/mpApplicantSelection'
import { copyApplicantProfile, downloadApplicantsCsv } from '../lib/mpSync/mpApplicantsExport'
import { groupQrFromMp, groupQrFromRegistry, isGroupQrExpired, patchGroupQrImage, readImageFileAsDataUrl } from '../lib/mpSync/mpGroupQr'
import { buildMpOrderHeroMeta } from '../lib/mpSync/mpOrderHeroMeta'
import { resolveTalentInboxTarget } from '../lib/mpSync/talentInboxMatch'
import { prepareRecruitmentSharePayload } from '../lib/mpSync/recruitmentShareCopy'
import { reviewRecruitmentVideo } from '../lib/mpSync/recruitmentVideo'
import { readPrProfile } from '../lib/mpSync/userProfile'
import RecruitmentShareSheet from '../components/mp/RecruitmentShareSheet'
import {
  applicantTaskStatusLabel,
  canReviewIceLink,
  countIceOrderStats,
  getIceVerifyMode,
  isIceMpOrder,
} from '../lib/mpRecruitment/iceOrderStats'
import {
  collectApplicantTagOptions,
  collectSalesLevelOptions,
  enrichAndSortApplicants,
  filterApplicantRows,
  type ApplicantListFilters,
} from '../lib/mpSync/applicantListExtras'
import MatchScoreBadge from '../components/ui/MatchScoreBadge'

type IceApplicantRow = EnrichedApplicantRow & {
  iceTaskStatus?: string
  iceDouyinUrl?: string
  iceRejectReason?: string
  canReviewIceLink?: boolean
  selectionNotified?: boolean
  matchScore?: number
}

const EMPTY_LIST_FILTERS: ApplicantListFilters = {
  searchQuery: '',
  filterSalesLevel: '',
  filterTag: '',
  filterNotified: '',
}

export default function PrOrderApplicantsPage() {
  const { id: mpOrderId = '' } = useParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [publishedAt, setPublishedAt] = useState('')
  const [deadlineText, setDeadlineText] = useState('')
  const [statusLabelText, setStatusLabelText] = useState('')
  const [hallLabel, setHallLabel] = useState('')
  const [applicants, setApplicants] = useState<EnrichedApplicantRow[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterSelectedOnly, setFilterSelectedOnly] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [groupQrImage, setGroupQrImage] = useState('')
  const [groupQrExpired, setGroupQrExpired] = useState(false)
  const [groupQrUploading, setGroupQrUploading] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [savingSelect, setSavingSelect] = useState(false)
  const [checkedIds, setCheckedIds] = useState<string[]>([])
  const [batchConfirming, setBatchConfirming] = useState(false)
  const [mpOrder, setMpOrder] = useState<Record<string, unknown> | null>(null)
  const [profileModalApplicant, setProfileModalApplicant] = useState<EnrichedApplicantRow | null>(null)
  const [isIce, setIsIce] = useState(false)
  const [iceVerifyMode, setIceVerifyMode] = useState<'ai' | 'pr'>('ai')
  const [iceClaimed, setIceClaimed] = useState(0)
  const [iceCompleted, setIceCompleted] = useState(0)
  const [icePendingReview, setIcePendingReview] = useState(0)
  const [iceReviewBusyId, setIceReviewBusyId] = useState('')
  const [iceRejectModal, setIceRejectModal] = useState(false)
  const [iceRejectTargetId, setIceRejectTargetId] = useState('')
  const [iceRejectTargetName, setIceRejectTargetName] = useState('')
  const [iceRejectReason, setIceRejectReason] = useState('')
  const [sharingOrder, setSharingOrder] = useState(false)
  const [shareSheet, setShareSheet] = useState<{ text: string; title: string; order: Record<string, unknown> } | null>(null)
  const [listFilters, setListFilters] = useState<ApplicantListFilters>(EMPTY_LIST_FILTERS)
  const [tagFilterOptions, setTagFilterOptions] = useState<string[]>([])
  const [salesLevelOptions, setSalesLevelOptions] = useState<string[]>([])

  const selectedCount = selectedIds.length
  const notifiedCount = useMemo(
    () => applicants.filter((a) => a.selectionNotified).length,
    [applicants],
  )
  const checkedCount = checkedIds.length
  const selectedApplicants = filterSelectedApplicants(applicants, selectedIds)
  const displayApplicants = useMemo(() => {
    let rows = filterApplicantRows(applicants, listFilters)
    if (filterSelectedOnly) rows = rows.filter((a) => a.selected)
    return rows
  }, [applicants, listFilters, filterSelectedOnly])
  const hasActiveListFilters = useMemo(
    () =>
      !!(
        listFilters.searchQuery ||
        listFilters.filterSalesLevel ||
        listFilters.filterTag ||
        listFilters.filterNotified
      ),
    [listFilters],
  )

  function onToggleViewSelected() {
    if (!filterSelectedOnly && selectedCount === 0) {
      alert('请先确认选择达人')
      return
    }
    setFilterSelectedOnly((v) => !v)
  }

  const applyApplicantsState = useCallback((rows: EnrichedApplicantRow[], ids: string[]) => {
    setApplicants(stampApplicantsSelected(rows, ids) as EnrichedApplicantRow[])
    setSelectedIds(ids)
  }, [])

  const loadOrder = useCallback(async () => {
    if (!mpOrderId) {
      setLoading(false)
      setErr('缺少招募单号')
      return
    }
    setLoading(true)
    setErr('')
    try {
      const reg = await fetchMpRegistry({ includeMpOrderIds: [mpOrderId] })
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const mp = mpList.find((o) => o && (o as Record<string, unknown>).id === mpOrderId) as
        | Record<string, unknown>
        | undefined
      if (!mp) {
        setLoading(false)
        setErr('未找到该招募单，请刷新重试')
        setApplicants([])
        setMpOrder(null)
        return
      }
      const meta = buildMpOrderHeroMeta(mp)
      let ids = selectedIdsFromMp(mp)
      if (!ids.length) ids = readLocalSelectedIds(mpOrderId)
      const ice = isIceMpOrder(mp)
      const verifyMode = getIceVerifyMode(mp)
      const iceStats = countIceOrderStats(mp)
      let pendingReview = 0
      const baseRows = (Array.isArray(mp.applicants) ? mp.applicants : []).map((a, i) => {
        const row = enrichApplicantRow(a as Record<string, unknown>, i, reg) as IceApplicantRow
        if (!ice) return row
        const canReview = canReviewIceLink(a as Record<string, unknown>, mp)
        if (canReview) pendingReview += 1
        return {
          ...row,
          iceTaskStatus: applicantTaskStatusLabel(a as Record<string, unknown>),
          iceDouyinUrl: String((a as Record<string, unknown>).douyinPublishUrl || (a as Record<string, unknown>).videoUrl || '').trim(),
          iceRejectReason: String((a as Record<string, unknown>).videoRejectReason || (a as Record<string, unknown>).aiVerifyNote || '').trim(),
          canReviewIceLink: canReview,
        }
      })
      const rows = enrichAndSortApplicants(baseRows, reg, mp, mpOrderId) as IceApplicantRow[]
      setTagFilterOptions(collectApplicantTagOptions(rows))
      setSalesLevelOptions(collectSalesLevelOptions(rows))
      setTitle(String(mp.title || mp.customerName || mpOrderId))
      setOrderNo(meta.orderNo)
      setPublishedAt(meta.publishedAt)
      setDeadlineText(meta.deadlineText)
      setStatusLabelText(statusLabel(mp.status))
      setHallLabel(hallLabelFromMp(mp))
      setIsIce(ice)
      setIceVerifyMode(verifyMode)
      setIceClaimed(iceStats.claimed)
      setIceCompleted(iceStats.completed)
      setIcePendingReview(pendingReview)
      setMpOrder(mp)
      setGroupQrImage(groupQrFromRegistry(reg as Record<string, unknown>, mpOrderId, mp))
      setGroupQrExpired(isGroupQrExpired(mp))
      applyApplicantsState(rows, ids)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [mpOrderId, applyApplicantsState])

  useEffect(() => {
    void loadOrder()
  }, [loadOrder])

  async function onToggleSelect(a: EnrichedApplicantRow) {
    if (!a?.id || savingSelect) return
    const set = new Set(selectedIds)
    if (set.has(String(a.id))) set.delete(String(a.id))
    else set.add(String(a.id))
    const next = [...set]
    applyApplicantsState(applicants, next)
    if (!next.length) setFilterSelectedOnly(false)
    setSavingSelect(true)
    try {
      await persistSelectedIds(mpOrderId, next)
      if (mpOrder) setMpOrder({ ...mpOrder, selectedApplicantIds: next })
    } catch (e) {
      alert(e instanceof Error ? e.message : '保存失败')
      await loadOrder()
    } finally {
      setSavingSelect(false)
    }
  }

  function onExportAll() {
    if (!applicants.length) {
      alert('暂无数据可导出')
      return
    }
    if (exportingAll) return
    setExportingAll(true)
    try {
      downloadApplicantsCsv(applicants, mpOrderId)
    } catch (e) {
      alert(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExportingAll(false)
    }
  }

  async function onUploadGroupQr(file: File) {
    if (groupQrUploading) return
    if (groupQrExpired) {
      alert('报名截止已满7天，群码已自动清理')
      return
    }
    setGroupQrUploading(true)
    try {
      const dataUrl = await readImageFileAsDataUrl(file)
      setGroupQrImage(dataUrl)
      await patchGroupQrImage(mpOrderId, dataUrl)
      if (mpOrder) setMpOrder({ ...mpOrder, groupQrImage: dataUrl })
    } catch (e) {
      const err = e as Error & { localSaved?: boolean }
      if (err.localSaved && mpOrder) setMpOrder({ ...mpOrder, groupQrImage })
      if (err.message !== 'cancel') alert(err.message || '上传失败')
    } finally {
      setGroupQrUploading(false)
    }
  }

  async function onToggleCheck(a: EnrichedApplicantRow) {
    if (!a?.id) return
    const id = String(a.id)
    setCheckedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function onBatchConfirm() {
    if (batchConfirming || savingSelect) return
    const ids = checkedIds.filter((id) => !selectedIds.includes(id))
    if (!ids.length) {
      alert(checkedCount ? '勾选的达人已在已选名单中' : '请先勾选要确认的达人')
      return
    }
    const next = [...new Set([...selectedIds, ...ids])]
    applyApplicantsState(applicants, next)
    setCheckedIds([])
    setBatchConfirming(true)
    try {
      await persistSelectedIds(mpOrderId, next)
      if (mpOrder) setMpOrder({ ...mpOrder, selectedApplicantIds: next })
    } catch (e) {
      alert(e instanceof Error ? e.message : '批量确认失败')
      await loadOrder()
    } finally {
      setBatchConfirming(false)
    }
  }

  async function onNotifySelected() {
    if (notifying) return
    if (!selectedApplicants.length) {
      alert('请先确认选择达人')
      return
    }
    const qr = String(groupQrImage || '').trim()
    if (!qr) {
      alert('请先上传群二维码')
      return
    }
    if (!confirm(`将向 ${selectedApplicants.length} 位达人发送站内信（含群二维码）。是否继续？`)) return
    if (!groupQrImage) {
      alert('请先上传群二维码')
      return
    }
    setNotifying(true)
    try {
      const reg = await fetchMpRegistry()
      const orderTitle = title || mpOrderId
      const entries = []
      const skipped: string[] = []
      for (const a of selectedApplicants) {
        const target = resolveTalentInboxTarget(a, reg)
        if (!target.talentMemberId) {
          skipped.push(String(a.displayName || a.id))
          continue
        }
        entries.push({
          talentMemberId: target.talentMemberId,
          contact: target.contact,
          platformAccount: target.platformAccount,
          applicantId: target.applicantId,
          mpOrderId,
          category: 'business' as const,
          title: '恭喜入选招募',
          body: `您已被 PR 选入「${orderTitle}」（单号 ${orderNo}）。请扫码加入项目群，二维码见下图。`,
          noticeType: 'selection' as const,
          pinned: true,
        })
      }
      if (!entries.length) {
        alert('所选达人缺少手机号或平台账号，无法通知')
        return
      }
      await appendTalentInbox(entries)
      clearMpRegistryCache()
      const notifiedIdSet = new Set(
        entries.map((e) => String(e.applicantId || '').trim()).filter(Boolean),
      )
      if (notifiedIdSet.size) {
        setApplicants((prev) =>
          prev.map((a) =>
            notifiedIdSet.has(String(a.id || '')) ? { ...a, selectionNotified: true } : a,
          ),
        )
        if (mpOrder) {
          const prevNotified = Array.isArray(mpOrder.notifiedApplicantIds)
            ? (mpOrder.notifiedApplicantIds as string[])
            : []
          const merged = [...new Set([...prevNotified.map(String), ...notifiedIdSet])]
          setMpOrder({ ...mpOrder, notifiedApplicantIds: merged })
        }
      }
      alert(
        skipped.length
          ? `已通知 ${entries.length} 人。部分达人（${skipped.slice(0, 3).join('、')}）未匹配到会员，请引导其完善资料。`
          : '通知已发送，达人可在小程序与履约后台「消息 → 系统消息」查看。',
      )
      await loadOrder()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '发送失败'
      if (msg.includes('group_qr_missing')) {
        alert('群二维码未同步到服务器，请重新上传群码后再通知')
      } else {
        alert(msg)
      }
    } finally {
      setNotifying(false)
    }
  }

  async function onShareOrder() {
    if (!mpOrder || sharingOrder) return
    setSharingOrder(true)
    try {
      const payload = await prepareRecruitmentSharePayload(mpOrder, readPrProfile())
      setShareSheet(payload)
    } catch (e) {
      alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharingOrder(false)
    }
  }

  function onOpenProfile(a: EnrichedApplicantRow) {
    const url = String(a.resolvedProfileHref || '').trim()
    if (!url) {
      alert('未填写主页链接，且达人库中未找到对应平台资料')
      return
    }
    setProfileModalApplicant(a)
  }

  function onOpenProfileInNewWindow(a: EnrichedApplicantRow) {
    const url = String(a.resolvedProfileHref || '').trim()
    if (!url) {
      alert('未填写主页链接')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function onIcePass(a: IceApplicantRow) {
    if (!a?.id || iceReviewBusyId) return
    setIceReviewBusyId(String(a.id))
    try {
      await reviewRecruitmentVideo(mpOrderId, String(a.id), 'pass')
      alert('已通过')
      await loadOrder()
    } catch (e) {
      alert(e instanceof Error ? e.message : '审核失败')
    } finally {
      setIceReviewBusyId('')
    }
  }

  function onIceOpenReject(a: IceApplicantRow) {
    if (!a?.id) return
    setIceRejectModal(true)
    setIceRejectTargetId(String(a.id))
    setIceRejectTargetName(String(a.displayName || '达人'))
    setIceRejectReason('')
  }

  async function onIceConfirmReject() {
    const reason = iceRejectReason.trim()
    if (!iceRejectTargetId || !reason || iceReviewBusyId) {
      alert('请填写驳回原因')
      return
    }
    setIceReviewBusyId(iceRejectTargetId)
    try {
      await reviewRecruitmentVideo(mpOrderId, iceRejectTargetId, 'reject', reason)
      alert('已驳回')
      setIceRejectModal(false)
      setIceRejectTargetId('')
      setIceRejectTargetName('')
      setIceRejectReason('')
      await loadOrder()
    } catch (e) {
      alert(e instanceof Error ? e.message : '驳回失败')
    } finally {
      setIceReviewBusyId('')
    }
  }

  return (
    <div className="page-content-shell page-content-shell--wide space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/orders" className="text-violet-500 hover:text-violet-400">← 我的发单</Link>
      </div>

      {loading ? <p className="text-[var(--shell-muted)]">加载报名列表…</p> : null}
      {err ? <p className="text-amber-600 text-sm">{err}</p> : null}

      {!loading && !err ? (
        <header className="surface-card rounded-xl border p-5 flex flex-col md:flex-row md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--shell-text)]">{title}</h2>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{hallLabel}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{statusLabelText}</span>
              {isIce ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  认领 {iceClaimed} · 已完成 {iceCompleted}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">已报名 {applicants.length} 人</span>
              )}
              {!isIce && applicants.length > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">已通知 {notifiedCount} 人</span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            <button
              type="button"
              disabled={sharingOrder}
              className="text-sm px-3 py-1.5 rounded-lg border disabled:opacity-50"
              onClick={() => void onShareOrder()}
            >
              {sharingOrder ? '生成中…' : '分享招募'}
            </button>
            <dl className="text-xs text-[var(--shell-muted)] space-y-1 text-right">
              <div>单号 {orderNo}</div>
              <div>发布 {publishedAt}</div>
              <div>截止 {deadlineText}</div>
            </dl>
          </div>
        </header>
      ) : null}

      {!loading && !err && applicants.length > 0 ? (
        <section className="surface-card rounded-xl border p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-[var(--shell-text)]">筛选报名达人</h3>
            {hasActiveListFilters ? (
              <button
                type="button"
                className="text-xs text-violet-600 hover:text-violet-500"
                onClick={() => setListFilters(EMPTY_LIST_FILTERS)}
              >
                清空筛选
              </button>
            ) : null}
          </div>
          <input
            type="search"
            value={listFilters.searchQuery || ''}
            placeholder="搜索达人 ID / 昵称 / 手机号"
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
            onChange={(e) => setListFilters((f) => ({ ...f, searchQuery: e.target.value }))}
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={listFilters.filterSalesLevel || ''}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              onChange={(e) => setListFilters((f) => ({ ...f, filterSalesLevel: e.target.value }))}
            >
              <option value="">带货等级 · 全部</option>
              {salesLevelOptions.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>
            <select
              value={listFilters.filterTag || ''}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              onChange={(e) => setListFilters((f) => ({ ...f, filterTag: e.target.value }))}
            >
              <option value="">达人标签 · 全部</option>
              {tagFilterOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
            <select
              value={listFilters.filterNotified || ''}
              className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              onChange={(e) =>
                setListFilters((f) => ({
                  ...f,
                  filterNotified: e.target.value as ApplicantListFilters['filterNotified'],
                }))
              }
            >
              <option value="">通知状态 · 全部</option>
              <option value="yes">已发通知</option>
              <option value="no">未发通知</option>
            </select>
          </div>
          <p className="text-xs text-[var(--shell-muted)]">
            共 {applicants.length} 人报名 · 当前显示 {displayApplicants.length} 人 · 按匹配分从高到低排序
          </p>
        </section>
      ) : null}

      <div className="space-y-3">
        {(displayApplicants as IceApplicantRow[]).map((a) => (
          <article
            key={String(a.id)}
            className={`surface-card rounded-xl border p-4 ${!isIce && a.selected ? 'border-orange-400/60 bg-orange-50/30' : ''}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
              <div className="flex gap-3 min-w-0">
                {!isIce ? (
                  <label className="flex items-start pt-1 shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-slate-300"
                      checked={checkedIds.includes(String(a.id))}
                      onChange={() => void onToggleCheck(a)}
                    />
                  </label>
                ) : null}
                {a.avatar ? (
                  <img src={String(a.avatar)} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center shrink-0">
                    {String(a.displayName || '?').slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    <span className="text-[var(--shell-muted)] text-sm mr-1">#{String(a.index)}</span>
                    {String(a.displayName)}
                  </h3>
                  <p className="text-xs text-[var(--shell-muted)] mt-0.5">
                    {String(a.displayPlatform)} · 粉丝 {String(a.displayFollowers)}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Array.isArray(a.accountTags) && a.accountTags.length
                      ? (a.accountTags as string[]).map((tag) => (
                          <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                            {tag}
                          </span>
                        ))
                      : null}
                    {a.selectionNotified ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">已发通知</span>
                    ) : null}
                    {Number(a.matchScore) > 0 ? <MatchScoreBadge score={Number(a.matchScore)} /> : null}
                  </div>
                </div>
              </div>
              {isIce ? (
                <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-violet-100 text-violet-700">
                  {String(a.iceTaskStatus || '—')}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={savingSelect}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium ${
                    a.selected ? 'bg-orange-600 text-white' : 'border border-violet-400 text-violet-600'
                  }`}
                  onClick={() => void onToggleSelect(a)}
                >
                  {a.selected ? '已选择' : '确认选择'}
                </button>
              )}
            </div>

            {isIce && a.iceDouyinUrl ? (
              <div className="mt-3 p-3 rounded-lg bg-slate-50 border text-xs space-y-2">
                <div>
                  <span className="text-[var(--shell-muted)]">抖音链接 </span>
                  <a href={a.iceDouyinUrl} target="_blank" rel="noreferrer" className="text-blue-600 break-all">
                    {a.iceDouyinUrl}
                  </a>
                </div>
                {a.iceRejectReason && a.iceTaskStatus === '链接已驳回' ? (
                  <p className="text-red-600">驳回原因：{a.iceRejectReason}</p>
                ) : null}
                {a.canReviewIceLink ? (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={iceReviewBusyId === String(a.id)}
                      className="px-3 py-1 rounded-lg border border-green-500 text-green-700 text-sm"
                      onClick={() => void onIcePass(a)}
                    >
                      通过
                    </button>
                    <button
                      type="button"
                      disabled={iceReviewBusyId === String(a.id)}
                      className="px-3 py-1 rounded-lg border border-red-400 text-red-600 text-sm"
                      onClick={() => onIceOpenReject(a)}
                    >
                      驳回
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
              {a.platformAccount ? (
                <div><span className="text-[var(--shell-muted)]">平台账号 </span>{String(a.platformAccount)}</div>
              ) : null}
              {a.quotePrice ? (
                <div><span className="text-[var(--shell-muted)]">报价 </span>{String(a.quotePrice)}</div>
              ) : null}
              <div><span className="text-[var(--shell-muted)]">带货等级 </span>{String(a.displaySalesLevel)}</div>
              {a.contact ? <div><span className="text-[var(--shell-muted)]">手机 </span>{String(a.contact)}</div> : null}
              {a.wechatId ? <div><span className="text-[var(--shell-muted)]">微信 </span>{String(a.wechatId)}</div> : null}
              <div><span className="text-[var(--shell-muted)]">报名时间 </span>{String(a.displayAppliedAt)}</div>
              {!isIce ? (
                <div>
                  <span className="text-[var(--shell-muted)]">视频上传 </span>
                  <span
                    className={
                      a.videoUploadTone === 'passed'
                        ? 'text-emerald-700 font-medium'
                        : a.videoUploadTone === 'rejected'
                          ? 'text-red-600 font-medium'
                          : a.videoUploadTone === 'uploaded'
                            ? 'text-amber-950 font-medium'
                            : 'text-[var(--shell-muted)]'
                    }
                  >
                    {String(a.videoUploadLabel || '未上传')}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {a.hasProfileLink ? (
                <button
                  type="button"
                  className="text-sm px-3 py-1 rounded-lg border border-teal-500/50 text-teal-600"
                  onClick={() => onOpenProfile(a)}
                >
                  查看达人主页
                </button>
              ) : null}
              <button
                type="button"
                className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]"
                onClick={() => void copyApplicantProfile(a).then(() => alert('已复制全部资料'))}
              >
                复制全部资料
              </button>
            </div>
          </article>
        ))}
      </div>

      {!loading && !err && applicants.length > 0 && !displayApplicants.length ? (
        <p className="text-sm text-[var(--shell-muted)] text-center py-8">
          {filterSelectedOnly ? '暂无已选达人' : hasActiveListFilters ? '没有符合筛选条件的达人' : '暂无达人'}
        </p>
      ) : null}

      {!loading && !err && !filterSelectedOnly && !applicants.length ? (
        <p className="text-sm text-[var(--shell-muted)] text-center py-8">
          {isIce ? '暂无达人认领，分享招募后等待达人认领' : '暂无达人报名，分享招募后等待达人提交'}
        </p>
      ) : null}

      {!loading && applicants.length > 0 && isIce ? (
        <footer className="fixed bottom-0 left-0 right-0 z-40 border-t bg-[var(--shell-bg)]/95 backdrop-blur p-4 md:pl-64">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-2 items-center">
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm"
              disabled={exportingAll}
              onClick={() => void onExportAll()}
            >
              下载全部明细
            </button>
            <p className="text-xs text-[var(--shell-muted)]">
              {iceVerifyMode === 'pr' && icePendingReview > 0
                ? `${icePendingReview} 条链接待审核 · 请在卡片上通过或驳回`
                : iceVerifyMode === 'ai'
                  ? 'AI 核查模式 · 达人提交链接后自动完成'
                  : 'PR 审核模式 · 达人回传链接后请审核'}
            </p>
          </div>
        </footer>
      ) : null}

      {!loading && applicants.length > 0 && !isIce ? (
        <div className="applicant-sticky-toolbar">
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border text-sm ${
                filterSelectedOnly ? 'border-violet-500 bg-violet-50 text-violet-700' : ''
              }`}
              onClick={onToggleViewSelected}
            >
              {filterSelectedOnly ? '查看全部报名' : `查看已选名单 (${selectedCount})`}
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border text-sm ${groupQrImage ? 'border-green-500 text-green-700' : ''}`}
              disabled={groupQrUploading}
              onClick={() => fileRef.current?.click()}
            >
              {groupQrImage ? '已上传群码' : '上传群二维码'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onUploadGroupQr(f)
                e.target.value = ''
              }}
            />
            <button type="button" className="px-3 py-2 rounded-lg border text-sm" disabled={exportingAll} onClick={onExportAll}>
              下载明细
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm"
              disabled={notifying}
              onClick={() => void onNotifySelected()}
            >
              通知已选达人
            </button>
            {checkedCount > 0 ? (
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-orange-500 text-orange-700 text-sm font-medium"
                disabled={batchConfirming || savingSelect}
                onClick={() => void onBatchConfirm()}
              >
                批量确认 ({checkedCount})
              </button>
            ) : null}
        </div>
      ) : null}

      {profileModalApplicant ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setProfileModalApplicant(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 py-3 border-b">
              <span className="font-medium text-sm">
                达人主页 · {String(profileModalApplicant.displayPlatform)}
              </span>
              <button type="button" className="text-sm text-slate-500" onClick={() => setProfileModalApplicant(null)}>
                关闭
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <div className="text-lg font-semibold">{String(profileModalApplicant.displayName)}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {String(profileModalApplicant.displayPlatform)} · 粉丝 {String(profileModalApplicant.displayFollowers)}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs">
                {profileModalApplicant.platformAccount ? (
                  <div>
                    <dt className="text-slate-500">平台账号</dt>
                    <dd className="font-medium">{String(profileModalApplicant.platformAccount)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-slate-500">带货等级</dt>
                  <dd className="font-medium">{String(profileModalApplicant.displaySalesLevel)}</dd>
                </div>
                {profileModalApplicant.quotePrice ? (
                  <div>
                    <dt className="text-slate-500">报价</dt>
                    <dd className="font-medium">{String(profileModalApplicant.quotePrice)}</dd>
                  </div>
                ) : null}
                {profileModalApplicant.contact ? (
                  <div>
                    <dt className="text-slate-500">手机</dt>
                    <dd className="font-medium">{String(profileModalApplicant.contact)}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="rounded-lg bg-slate-50 border px-3 py-2 text-xs break-all">
                <span className="text-slate-500">主页链接 </span>
                {String(profileModalApplicant.resolvedProfileHref)}
              </div>
              {profileModalApplicant.profileOpensExternally ? (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  抖音、小红书等平台禁止在网页内嵌预览，请点击下方按钮在新窗口打开，或复制链接到对应 App 查看。
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium"
                  onClick={() => onOpenProfileInNewWindow(profileModalApplicant)}
                >
                  {profileModalApplicant.profileLinkDisplay || '新窗口打开主页'}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg border text-sm"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(String(profileModalApplicant.resolvedProfileHref))
                      .then(() => alert('主页链接已复制'))
                  }
                >
                  复制链接
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {iceRejectModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIceRejectModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">驳回链接 · {iceRejectTargetName}</h3>
            <p className="text-sm text-slate-500 mt-2">请填写驳回原因，达人将收到通知并可在任务详情重新提交。</p>
            <textarea
              className="mt-3 w-full min-h-28 rounded-lg border px-3 py-2 text-sm"
              placeholder="请输入驳回原因"
              value={iceRejectReason}
              onChange={(e) => setIceRejectReason(e.target.value)}
              maxLength={200}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 rounded-lg border text-sm" onClick={() => setIceRejectModal(false)}>
                取消
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-red-400 text-red-600 text-sm disabled:opacity-50"
                disabled={!iceRejectReason.trim() || iceReviewBusyId === iceRejectTargetId}
                onClick={() => void onIceConfirmReject()}
              >
                确认驳回
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareSheet ? (
        <RecruitmentShareSheet
          text={shareSheet.text}
          title={shareSheet.title}
          order={shareSheet.order}
          onClose={() => setShareSheet(null)}
        />
      ) : null}
    </div>
  )
}
