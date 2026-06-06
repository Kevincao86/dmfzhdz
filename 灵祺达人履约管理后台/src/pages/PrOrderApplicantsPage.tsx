import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import {
  enrichApplicantRow,
  hallLabelFromMp,
  normalizeProfileUrl,
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
import { groupQrFromMp, isGroupQrExpired, patchGroupQrImage, readImageFileAsDataUrl } from '../lib/mpSync/mpGroupQr'
import { buildMpOrderHeroMeta } from '../lib/mpSync/mpOrderHeroMeta'
import { resolveTalentInboxTarget } from '../lib/mpSync/talentInboxMatch'
import { pushNotification } from '../lib/mpSync/messagesStore'

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
  const [showSelectedPanel, setShowSelectedPanel] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [groupQrImage, setGroupQrImage] = useState('')
  const [groupQrExpired, setGroupQrExpired] = useState(false)
  const [groupQrUploading, setGroupQrUploading] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [savingSelect, setSavingSelect] = useState(false)
  const [profileModalUrl, setProfileModalUrl] = useState('')
  const [mpOrder, setMpOrder] = useState<Record<string, unknown> | null>(null)

  const selectedCount = selectedIds.length
  const selectedApplicants = filterSelectedApplicants(applicants, selectedIds)

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
      const reg = await fetchMpRegistry()
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
      const rows = (Array.isArray(mp.applicants) ? mp.applicants : []).map((a, i) =>
        enrichApplicantRow(a as Record<string, unknown>, i, reg),
      )
      setTitle(String(mp.title || mp.customerName || mpOrderId))
      setOrderNo(meta.orderNo)
      setPublishedAt(meta.publishedAt)
      setDeadlineText(meta.deadlineText)
      setStatusLabelText(statusLabel(mp.status))
      setHallLabel(hallLabelFromMp(mp))
      setMpOrder(mp)
      setGroupQrImage(groupQrFromMp(mp))
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

  async function onDeselectFromPanel(id: string) {
    if (!id || savingSelect) return
    const next = selectedIds.filter((x) => x !== id)
    applyApplicantsState(applicants, next)
    if (!next.length) setShowSelectedPanel(false)
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
    setNotifying(true)
    try {
      const reg = await fetchMpRegistry()
      const orderTitle = title || mpOrderId
      const skipped: string[] = []
      for (const a of selectedApplicants) {
        const target = resolveTalentInboxTarget(a, reg)
        if (!target.talentMemberId) {
          skipped.push(String(a.displayName || a.id))
          continue
        }
        pushNotification({
          category: 'business',
          title: '恭喜入选招募',
          body: `您已被 PR 选入「${orderTitle}」（单号 ${orderNo}）。请扫码加入项目群，二维码见下图。`,
          imageUrl: qr,
          noticeType: 'selection',
          pinned: true,
          mpOrderId,
          applicantId: target.applicantId,
        })
      }
      if (skipped.length) {
        alert(`已写入站内信。部分达人（${skipped.slice(0, 3).join('、')}）未匹配到会员，请引导其完善资料。`)
      } else {
        alert('通知已写入系统消息，达人可在「消息 → 系统消息」查看。')
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '发送失败')
    } finally {
      setNotifying(false)
    }
  }

  function onOpenProfile(a: EnrichedApplicantRow) {
    const url = normalizeProfileUrl(a.profileLink)
    if (!url) {
      alert('未填写主页链接')
      return
    }
    setProfileModalUrl(url)
  }

  return (
    <div className="max-w-4xl space-y-4 pb-28">
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
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">已报名 {applicants.length} 人</span>
              {selectedCount > 0 ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">已选 {selectedCount} 人</span>
              ) : null}
            </div>
          </div>
          <dl className="text-xs text-[var(--shell-muted)] space-y-1 shrink-0">
            <div>单号 {orderNo}</div>
            <div>发布 {publishedAt}</div>
            <div>截止 {deadlineText}</div>
          </dl>
        </header>
      ) : null}

      <div className="space-y-3">
        {applicants.map((a) => (
          <article
            key={String(a.id)}
            className={`surface-card rounded-xl border p-4 ${a.selected ? 'border-orange-400/60 bg-orange-50/30' : ''}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
              <div className="flex gap-3 min-w-0">
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
                  {Array.isArray(a.accountTags) && a.accountTags.length ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(a.accountTags as string[]).map((tag) => (
                        <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">{tag}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
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
            </div>

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

      {!loading && !err && !applicants.length ? (
        <p className="text-sm text-[var(--shell-muted)] text-center py-8">暂无达人报名，分享招募后等待达人提交</p>
      ) : null}

      {!loading && applicants.length > 0 ? (
        <footer className="fixed bottom-0 left-0 right-0 z-40 border-t bg-[var(--shell-bg)]/95 backdrop-blur p-4 md:pl-64">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-2">
            <button type="button" className="px-3 py-2 rounded-lg border text-sm" onClick={() => setShowSelectedPanel(true)}>
              查看已选名单 ({selectedCount})
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
              className="px-3 py-2 rounded-lg bg-violet-600 text-white text-sm ml-auto"
              disabled={notifying}
              onClick={() => void onNotifySelected()}
            >
              通知已选达人
            </button>
          </div>
          {groupQrImage ? (
            <button type="button" className="mt-2 block" onClick={() => window.open(groupQrImage, '_blank')}>
              <img src={groupQrImage} alt="群二维码" className="h-16 rounded border" />
            </button>
          ) : null}
          {groupQrExpired ? (
            <p className="text-xs text-amber-600 mt-2">报名截止已满 7 天，群二维码已从服务器自动清理</p>
          ) : null}
        </footer>
      ) : null}

      {showSelectedPanel ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setShowSelectedPanel(false)}>
          <div className="w-full max-w-md rounded-2xl panel-card p-4 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-3">已选达人 ({selectedCount})</h3>
            {selectedApplicants.length ? (
              <ul className="space-y-2">
                {selectedApplicants.map((a) => (
                  <li key={String(a.id)} className="flex justify-between items-center text-sm border-b pb-2">
                    <span>{String(a.displayName)}</span>
                    <button type="button" className="text-red-500 text-xs" onClick={() => void onDeselectFromPanel(String(a.id))}>
                      取消
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--shell-muted)]">暂无已选达人</p>
            )}
            <button type="button" className="w-full mt-4 py-2 rounded-lg panel-tab-active" onClick={() => setShowSelectedPanel(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {profileModalUrl ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/50" onClick={() => setProfileModalUrl('')}>
          <div className="flex justify-between items-center p-3 bg-white border-b" onClick={(e) => e.stopPropagation()}>
            <span className="font-medium text-sm">达人主页预览</span>
            <div className="flex gap-2">
              <a href={profileModalUrl} target="_blank" rel="noreferrer" className="text-sm text-violet-600">
                新窗口打开
              </a>
              <button type="button" className="text-sm" onClick={() => setProfileModalUrl('')}>关闭</button>
            </div>
          </div>
          <iframe
            src={profileModalUrl}
            title="达人主页"
            className="flex-1 w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  )
}
