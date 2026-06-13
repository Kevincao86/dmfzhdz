import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Copy,
  Link2,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { EmptyState } from '../components/ui/MockupLayouts'
import { appendMpRecruitmentOrder, fetchMpRegistry, parseFormRelaySource } from '../lib/mpApi'
import { addPublishedOrder } from '../lib/mpSync/applicationsStore'
import { builtinMinimalTemplate, saveApplyFormForMpOrder } from '../lib/mpSync/applyFormTemplates'
import { buildRecruitmentApplyLink } from '../lib/mpSync/recruitmentShareCopy'
import { copyTextToClipboard } from '../lib/copyTextToClipboard'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { mpOrderOwnedByCurrentPr } from '../lib/mpRecruitment/prPublishedOrders'
import { prParticipantKey } from '../lib/mpSync/participant'
import { prDisplayName, readPrProfile, emptyPrProfile } from '../lib/mpSync/userProfile'
import { buildFormRelayOrder, applyFormRelayPublishPreviewEdits } from '@merchant/lib/formRelayOrder'
import { normalizePlatform } from '../lib/mpSync/platformLabels'
import {
  FORM_RELAY_PLATFORMS,
  detectFormRelayPlatform,
  resolveFormRelayPlatformLabel,
  readExternalFormRelay,
  isValidFormRelayLink,
  canFetchFormRelaySource,
  type FormRelayPlatformId,
} from '@merchant/lib/formRelayPlatforms'

type RelayRow = {
  mpOrderId: string
  title: string
  platformLabel: string
  sourceUrl: string
  createdAt: string
  applicantCount: number
  shareLink: string
}

type PublishPreview = {
  title: string
  platform: string
  region: string
  budgetText: string
  recruitmentInfo: string
  titleNote: string
  sourceUrl: string
  platformLabel: string
  deadline: string
}

const TITLE_MAX = 50

function orderToPublishPreview(order: Record<string, unknown>): PublishPreview {
  const relay = readExternalFormRelay(order)
  return {
    title: String(order.title || order.customerName || '转发代收招募'),
    platform: String(order.platform || '抖音'),
    region: String(order.region || '全国'),
    budgetText: String(order.budgetText || '面议'),
    recruitmentInfo: String(order.recruitmentInfo || order.taskDetail || ''),
    titleNote: String(relay?.titleNote || ''),
    sourceUrl: String(relay?.sourceUrl || ''),
    platformLabel: resolveFormRelayPlatformLabel(relay),
    deadline: String(order.deadline || ''),
  }
}

async function publishRelayOrder(order: Record<string, unknown>): Promise<string> {
  const tpl = builtinMinimalTemplate()
  await appendMpRecruitmentOrder(order)
  saveApplyFormForMpOrder(String(order.id), {
    templateId: tpl.id,
    templateName: tpl.name,
    fields: tpl.fields,
  })
  addPublishedOrder({
    mpOrderId: String(order.id),
    title: String(order.title),
    hall: 'normal',
  })
  return String(order.id)
}

function formatRelayDate(raw: string): string {
  const t = Date.parse(String(raw || '').replace(/\//g, '-'))
  if (!t) return raw || '—'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function platformMeta(id: FormRelayPlatformId) {
  return FORM_RELAY_PLATFORMS.find((p) => p.id === id) || FORM_RELAY_PLATFORMS[0]
}

export default function FormRelayPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [sourceUrl, setSourceUrl] = useState('')
  const [platformId, setPlatformId] = useState<FormRelayPlatformId>('tencent_doc')
  const [title, setTitle] = useState('')
  const [titleNote, setTitleNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [doneId, setDoneId] = useState('')
  const [editPublish, setEditPublish] = useState(false)
  const [parsePreview, setParsePreview] = useState<{
    taskDetail: string
    merchantRequirements: string
    city: string
    titleHint: string
  } | null>(null)
  const [parseWarn, setParseWarn] = useState('')
  const [pendingOrder, setPendingOrder] = useState<Record<string, unknown> | null>(null)
  const [publishPreview, setPublishPreview] = useState<PublishPreview | null>(null)
  const [rows, setRows] = useState<RelayRow[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [listSearch, setListSearch] = useState('')
  const [listPage, setListPage] = useState(1)
  const pageSize = 10

  const platformOptions = useMemo(() => FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other'), [])
  const selectedPlatform = platformMeta(platformId)

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const reg = await fetchMpRegistry({})
      const account = getAccount()
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const next: RelayRow[] = []
      for (const raw of mpList) {
        const mp = raw as Record<string, unknown>
        if (!mpOrderOwnedByCurrentPr(mp, account)) continue
        const relay = readExternalFormRelay(mp)
        if (!relay) continue
        const id = String(mp.id || '').trim()
        if (!id) continue
        next.push({
          mpOrderId: id,
          title: String(mp.title || mp.customerName || id),
          platformLabel: resolveFormRelayPlatformLabel(relay) || normalizePlatform(mp.platform || '抖音'),
          sourceUrl: relay.sourceUrl,
          createdAt: String(mp.createdAt || relay.createdAt || ''),
          applicantCount: Array.isArray(mp.applicants) ? mp.applicants.length : 0,
          shareLink: buildRecruitmentApplyLink(id) || '',
        })
      }
      next.sort((a, b) => {
        const ta = Date.parse(String(a.createdAt).replace(/\//g, '-')) || 0
        const tb = Date.parse(String(b.createdAt).replace(/\//g, '-')) || 0
        return tb - ta
      })
      setRows(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const filteredRows = useMemo(() => {
    const kw = listSearch.trim().toLowerCase()
    if (!kw) return rows
    return rows.filter((r) => r.title.toLowerCase().includes(kw) || r.mpOrderId.toLowerCase().includes(kw))
  }, [rows, listSearch])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const pagedRows = filteredRows.slice((listPage - 1) * pageSize, listPage * pageSize)

  useEffect(() => {
    setListPage(1)
  }, [listSearch])

  function onUrlChange(v: string) {
    setSourceUrl(v)
    setParsePreview(null)
    setParseWarn('')
    setPendingOrder(null)
    setPublishPreview(null)
    setEditPublish(false)
    const detected = detectFormRelayPlatform(v)
    if (detected !== 'other') setPlatformId(detected)
  }

  function buildPendingOrder(
    url: string,
    parsed: Awaited<ReturnType<typeof parseFormRelaySource>> | null,
    resolvedTitle: string,
  ): Record<string, unknown> {
    const pr = readPrProfile() || emptyPrProfile()
    const account = getAccount()
    return buildFormRelayOrder({
      sourceUrl: url,
      sourcePlatform: platformId,
      title: resolvedTitle,
      titleNote: String(titleNote || '').trim(),
      parsed: parsed
        ? {
            taskDetail: parsed.taskDetail,
            merchantRequirements: parsed.merchantRequirements,
            city: parsed.city,
            region: parsed.region,
            titleHint: parsed.titleHint,
            budgetHint: parsed.budgetHint,
            recruitPlatform: parsed.recruitPlatform,
          }
        : null,
      prMeta: {
        prParticipantKey: prParticipantKey(pr),
        prDisplayName: prDisplayName(pr),
        lingqiPrId: String(account?.lingqiPrId || pr.lingqiPrId || '').trim(),
        registryPrId: String(account?.registryPrId || account?.registryMemberId || pr.id || '').trim(),
        prWxNickName: String(pr.wxNickName || '').trim(),
        prWxAvatarUrl: String(pr.wxAvatarUrl || '').trim(),
      },
    })
  }

  async function onPreview(e: React.FormEvent) {
    e.preventDefault()
    const url = String(sourceUrl || '').trim()
    if (!isValidFormRelayLink(url)) {
      setErr('请粘贴有效链接：支持网站 https、H5 页面、小程序 #小程序:// 分享链接')
      return
    }
    setSubmitting(true)
    setErr('')
    setParseWarn('')
    setDoneId('')
    setPendingOrder(null)
    setPublishPreview(null)
    setEditPublish(false)
    let parsed: Awaited<ReturnType<typeof parseFormRelaySource>> | null = null
    if (canFetchFormRelaySource(url)) {
      try {
        parsed = await parseFormRelaySource(url, platformId)
        setParsePreview({
          taskDetail: parsed.taskDetail,
          merchantRequirements: parsed.merchantRequirements,
          city: parsed.city || parsed.region,
          titleHint: parsed.titleHint,
        })
      } catch (e) {
        setParsePreview(null)
        setParseWarn(e instanceof Error ? e.message : '未能抓取原表详情，将仅创建基础代收单')
      }
    } else {
      setParsePreview(null)
      setParseWarn('当前为小程序 scheme 链接，无法自动抓取详情；请填写标题后预览，或改用 H5/网站分享链接')
    }
    const resolvedTitle = String(title || '').trim() || String(parsed?.titleHint || '').trim()
    if (!resolvedTitle) {
      setErr('请填写转发表单标题，或确保原表链接可解析出商家名称')
      setSubmitting(false)
      return
    }
    if (!String(title || '').trim() && parsed?.titleHint) {
      setTitle(parsed.titleHint.slice(0, TITLE_MAX))
    }
    try {
      const order = buildPendingOrder(url, parsed, resolvedTitle)
      setPendingOrder(order)
      setPublishPreview(orderToPublishPreview(order))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '预览生成失败')
    } finally {
      setSubmitting(false)
    }
  }

  async function onConfirmPublish() {
    if (!pendingOrder || !publishPreview || submitting) return
    setSubmitting(true)
    setErr('')
    try {
      const order = applyFormRelayPublishPreviewEdits(pendingOrder, {
        ...publishPreview,
        title: String(title || publishPreview.title || '').trim(),
        titleNote: String(titleNote || publishPreview.titleNote || '').trim(),
      })
      const id = await publishRelayOrder(order)
      setDoneId(id)
      setSourceUrl('')
      setTitle('')
      setTitleNote('')
      setParsePreview(null)
      setPendingOrder(null)
      setPublishPreview(null)
      setEditPublish(false)
      await loadList()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '发布失败')
    } finally {
      setSubmitting(false)
    }
  }

  function syncTopFormToPreview(patch: Partial<PublishPreview>) {
    setPublishPreview((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  function patchPublishPreview(patch: Partial<PublishPreview>) {
    setPublishPreview((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      if (patch.title !== undefined) setTitle(patch.title)
      if (patch.titleNote !== undefined) setTitleNote(patch.titleNote)
      return next
    })
  }

  async function onCopyShareLink(mpOrderId: string) {
    const link = buildRecruitmentApplyLink(mpOrderId)
    if (!link) return
    try {
      await copyTextToClipboard(link)
      alert('报名分享链接已复制')
    } catch {
      alert('复制失败，请手动复制链接')
    }
  }

  const sourcePreviewTitle = publishPreview?.title || parsePreview?.titleHint || title || '活动报名表'
  const publishSubtitle = publishPreview?.recruitmentInfo
    ? publishPreview.recruitmentInfo.split('\n')[0].slice(0, 48)
    : '欢迎填写表单，我们会认真处理您的数据'

  return (
    <div className="page-content-shell page-content-shell--wide form-relay-stack">
      <section className="form-relay-section">
        <h2 className="form-relay-section__title">创建转发表单</h2>

        <form className="form-relay-workflow" onSubmit={(ev) => void onPreview(ev)}>
          <div className="form-relay-workflow__col">
            <label className="form-relay-field">
              <span className="form-relay-field__label">原表链接</span>
              <div className="form-relay-field__input-wrap">
                <Link2 size={16} className="form-relay-field__icon" aria-hidden />
                <input
                  className="form-relay-field__input"
                  placeholder="粘贴腾讯文档 / WPS / 报名工具分享链接"
                  value={sourceUrl}
                  onChange={(e) => onUrlChange(e.target.value)}
                />
              </div>
            </label>

            <label className="form-relay-field">
              <span className="form-relay-field__label">选择平台</span>
              <div className="form-relay-field__input-wrap">
                <span className="form-relay-platform-badge" aria-hidden>
                  {selectedPlatform.label.slice(0, 1)}
                </span>
                <select
                  className="form-relay-field__input form-relay-field__input--select"
                  value={platformId}
                  onChange={(e) => setPlatformId(e.target.value as FormRelayPlatformId)}
                >
                  {platformOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                  <option value="other">其他平台</option>
                </select>
              </div>
            </label>

            <label className="form-relay-field">
              <span className="form-relay-field__label">转发表单标题</span>
              <div className="form-relay-field__input-wrap">
                <input
                  className="form-relay-field__input"
                  placeholder="如：活动报名表"
                  maxLength={TITLE_MAX}
                  value={title}
                  onChange={(e) => {
                    const v = e.target.value
                    setTitle(v)
                    syncTopFormToPreview({ title: v })
                  }}
                />
                <span className="form-relay-field__count">
                  {title.length}/{TITLE_MAX}
                </span>
              </div>
            </label>

            {parseWarn ? <p className="form-relay-warn">{parseWarn}</p> : null}
            {err ? <p className="form-relay-err">{err}</p> : null}

            {!publishPreview ? (
              <button type="submit" disabled={submitting} className="form-relay-preview-btn">
                <Sparkles size={16} aria-hidden />
                {submitting ? '获取中…' : '获取预览'}
              </button>
            ) : (
              <div className="form-relay-publish-actions">
                <button
                  type="button"
                  disabled={submitting}
                  className="form-relay-preview-btn"
                  onClick={() => void onConfirmPublish()}
                >
                  {submitting ? '发布中…' : '确认发布'}
                </button>
                <button type="submit" disabled={submitting} className="form-relay-secondary-btn">
                  重新预览
                </button>
              </div>
            )}

            {doneId ? (
              <div className="form-relay-done">
                <p>已生成代收单 {doneId}</p>
                <div className="form-relay-done__actions">
                  <button type="button" onClick={() => void onCopyShareLink(doneId)}>
                    复制报名链接
                  </button>
                  <Link to={`/orders/${encodeURIComponent(doneId)}/applicants`}>查看报名</Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="form-relay-workflow__arrow" aria-hidden>
            <ArrowRight size={20} />
          </div>

          <div className="form-relay-workflow__col">
            <p className="form-relay-preview-label">原表预览</p>
            <div className="form-relay-source-card">
              <div className="form-relay-source-card__icon">{selectedPlatform.label.slice(0, 1)}</div>
              <h3 className="form-relay-source-card__title">{sourcePreviewTitle}</h3>
              <p className="form-relay-source-card__platform">{selectedPlatform.label}</p>
              <div className="form-relay-source-card__lines" aria-hidden>
                <span /><span /><span />
              </div>
              {parsePreview?.taskDetail ? (
                <p className="form-relay-source-card__detail">{parsePreview.taskDetail.slice(0, 120)}</p>
              ) : null}
              <footer className="form-relay-source-card__foot">
                <span>创建者：{prDisplayName(readPrProfile() || emptyPrProfile()) || '当前 PR'}</span>
                <span className="form-relay-source-card__ok">
                  <CheckCircle2 size={14} aria-hidden />
                  文档所有者可收集表单数据
                </span>
              </footer>
            </div>
          </div>

          <div className="form-relay-workflow__arrow" aria-hidden>
            <ArrowRight size={20} />
          </div>

          <div className="form-relay-workflow__col">
            <div className="form-relay-preview-head">
              <p className="form-relay-preview-label">发布页预览（可编辑）</p>
              {publishPreview ? (
                <button
                  type="button"
                  className="form-relay-edit-btn"
                  onClick={() => setEditPublish((v) => !v)}
                >
                  <Pencil size={14} aria-hidden />
                  {editPublish ? '收起编辑' : '编辑发布页'}
                </button>
              ) : null}
            </div>

            {editPublish && publishPreview ? (
              <div className="form-relay-edit-panel">
                <label className="form-relay-field">
                  <span className="form-relay-field__label">标题</span>
                  <input
                    className="form-relay-field__input"
                    value={publishPreview.title}
                    onChange={(e) => patchPublishPreview({ title: e.target.value })}
                  />
                </label>
                <label className="form-relay-field">
                  <span className="form-relay-field__label">招募说明</span>
                  <textarea
                    className="form-relay-field__textarea"
                    rows={5}
                    value={publishPreview.recruitmentInfo}
                    onChange={(e) => patchPublishPreview({ recruitmentInfo: e.target.value })}
                  />
                </label>
                <label className="form-relay-field">
                  <span className="form-relay-field__label">备注</span>
                  <textarea
                    className="form-relay-field__textarea"
                    rows={3}
                    value={titleNote}
                    onChange={(e) => {
                      const v = e.target.value
                      setTitleNote(v)
                      patchPublishPreview({ titleNote: v })
                    }}
                  />
                </label>
              </div>
            ) : null}

            <div className="form-relay-publish-card">
              <div className="form-relay-publish-card__cover">
                <span>点击上传封面</span>
                <small>建议尺寸 750×420</small>
              </div>
              <div className="form-relay-publish-card__body">
                <h3>{publishPreview?.title || title || '活动报名表'}</h3>
                <p>{publishSubtitle}</p>
                <div className="form-relay-publish-card__meta">
                  <span>
                    <Clock3 size={14} aria-hidden />
                    填写时间：约 2 分钟
                  </span>
                  <span>
                    <ShieldCheck size={14} aria-hidden />
                    收集数据：所有人可填写
                  </span>
                </div>
                <button type="button" className="form-relay-publish-card__cta" disabled>
                  立即填写
                </button>
              </div>
            </div>
          </div>
        </form>
      </section>

      <section className="form-relay-section">
        <div className="form-relay-records-head">
          <h2 className="form-relay-section__title">转发记录（订单历史）</h2>
          <input
            className="form-relay-records-search"
            placeholder="搜索标题"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
          />
        </div>

        {loadingList ? <p className="form-relay-muted">加载中…</p> : null}
        {!loadingList && !filteredRows.length ? (
          <EmptyState title="暂无转发记录" desc="粘贴原表链接创建第一条转发表单。" />
        ) : null}

        {filteredRows.length ? (
          <div className="form-relay-table-wrap">
            <table className="form-relay-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>平台</th>
                  <th>创建时间</th>
                  <th>访问/填写</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row) => (
                  <tr key={row.mpOrderId}>
                    <td>
                      <div className="form-relay-table__title-cell">
                        <div className="form-relay-table__thumb" aria-hidden />
                        <div className="min-w-0">
                          <div className="form-relay-table__title">{row.title}</div>
                          {row.shareLink ? (
                            <div className="form-relay-table__link">
                              <span className="truncate">{row.shareLink}</span>
                              <button
                                type="button"
                                className="form-relay-table__copy"
                                aria-label="复制链接"
                                onClick={() => void onCopyShareLink(row.mpOrderId)}
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="form-relay-table__platform">
                        <span className="form-relay-platform-badge form-relay-platform-badge--sm" aria-hidden>
                          {row.platformLabel.slice(0, 1)}
                        </span>
                        {row.platformLabel}
                      </span>
                    </td>
                    <td className="form-relay-table__time">{formatRelayDate(row.createdAt)}</td>
                    <td>
                      <span className="form-relay-table__ratio">
                        {row.applicantCount > 0 ? row.applicantCount * 2 : 0} / {row.applicantCount}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`form-relay-status ${
                          row.applicantCount > 0 ? 'form-relay-status--active' : 'form-relay-status--ended'
                        }`}
                      >
                        {row.applicantCount > 0 ? '进行中' : '已结束'}
                      </span>
                    </td>
                    <td>
                      <div className="form-relay-table__actions">
                        <button type="button" onClick={() => void onCopyShareLink(row.mpOrderId)}>
                          复制链接
                        </button>
                        <Link to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}>报名管理</Link>
                        {row.sourceUrl ? (
                          <a href={row.sourceUrl} target="_blank" rel="noreferrer" aria-label="更多">
                            <MoreHorizontal size={16} />
                          </a>
                        ) : (
                          <span className="form-relay-table__more" aria-hidden>
                            <MoreHorizontal size={16} />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {filteredRows.length ? (
          <footer className="form-relay-table-foot">
            <span>共 {filteredRows.length} 条</span>
            <div className="form-relay-pagination">
              <button
                type="button"
                disabled={listPage <= 1}
                onClick={() => setListPage((p) => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <span>
                {listPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={listPage >= totalPages}
                onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
              <span className="form-relay-pagination__size">{pageSize} 条/页</span>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  )
}
