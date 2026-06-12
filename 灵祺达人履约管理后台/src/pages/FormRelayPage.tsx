import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import PageHero from '../components/ui/PageHero'
import { appendMpRecruitmentOrder, fetchMpRegistry, parseFormRelaySource } from '../lib/mpApi'
import { addPublishedOrder } from '../lib/mpSync/applicationsStore'
import { builtinMinimalTemplate, saveApplyFormForMpOrder } from '../lib/mpSync/applyFormTemplates'
import { buildRecruitmentApplyLink } from '../lib/mpSync/recruitmentShareCopy'
import { copyTextToClipboard } from '../lib/copyTextToClipboard'
import { getAccount, getActiveRole } from '../lib/mpSession'
import { mpOrderOwnedByCurrentPr } from '../lib/mpRecruitment/prPublishedOrders'
import { prParticipantKey } from '../lib/mpSync/participant'
import { prDisplayName, readPrProfile, emptyPrProfile } from '../lib/mpSync/userProfile'
import { buildFormRelayOrder } from '@merchant/lib/formRelayOrder'
import {
  FORM_RELAY_PLATFORMS,
  detectFormRelayPlatform,
  formRelayPlatformLabel,
  readExternalFormRelay,
  type FormRelayPlatformId,
} from '@merchant/lib/formRelayPlatforms'

type RelayRow = {
  mpOrderId: string
  title: string
  platformLabel: string
  sourceUrl: string
  createdAt: string
  applicantCount: number
}

export default function FormRelayPage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/hall" replace />

  const [sourceUrl, setSourceUrl] = useState('')
  const [platformId, setPlatformId] = useState<FormRelayPlatformId>('other')
  const [title, setTitle] = useState('')
  const [titleNote, setTitleNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [doneId, setDoneId] = useState('')
  const [parsePreview, setParsePreview] = useState<{
    taskDetail: string
    merchantRequirements: string
    city: string
    titleHint: string
  } | null>(null)
  const [parseWarn, setParseWarn] = useState('')
  const [rows, setRows] = useState<RelayRow[]>([])
  const [loadingList, setLoadingList] = useState(true)

  const platformOptions = useMemo(() => FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other'), [])

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
          platformLabel: formRelayPlatformLabel(relay.sourcePlatform),
          sourceUrl: relay.sourceUrl,
          createdAt: String(mp.createdAt || relay.createdAt || ''),
          applicantCount: Array.isArray(mp.applicants) ? mp.applicants.length : 0,
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

  function onUrlChange(v: string) {
    setSourceUrl(v)
    setParsePreview(null)
    setParseWarn('')
    const detected = detectFormRelayPlatform(v)
    if (detected !== 'other') setPlatformId(detected)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = String(sourceUrl || '').trim()
    if (!/^https?:\/\//i.test(url)) {
      setErr('请粘贴有效的 http(s) 原表链接')
      return
    }
    setSubmitting(true)
    setErr('')
    setParseWarn('')
    setDoneId('')
    let parsed: Awaited<ReturnType<typeof parseFormRelaySource>> | null = null
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
    const resolvedTitle = String(title || '').trim() || String(parsed?.titleHint || '').trim()
    if (!resolvedTitle) {
      setErr('请填写代收单标题，或确保原表链接可解析出商家名称')
      setSubmitting(false)
      return
    }
    if (!String(title || '').trim() && parsed?.titleHint) {
      setTitle(parsed.titleHint)
    }
    try {
      const pr = readPrProfile() || emptyPrProfile()
      const account = getAccount()
      const order = buildFormRelayOrder({
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
      setDoneId(String(order.id))
      setSourceUrl('')
      setTitle('')
      setTitleNote('')
      await loadList()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '创建失败')
    } finally {
      setSubmitting(false)
    }
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

  return (
    <div className="max-w-3xl space-y-5">
      <PageHero
        title="转发工具"
        subtitle="粘贴客户腾讯文档 / WPS / 报名工具 / 派单工具 / 探鲸等原表链接，生成灵祺代收单。达人在我们侧报名，导出后可回填原表。"
        badge="代收 · 导出回填"
      />

      <section className="surface-card rounded-xl border p-5 space-y-4">
        <h3 className="text-sm font-semibold">新建转发代收</h3>
        <form className="space-y-3" onSubmit={(ev) => void onSubmit(ev)}>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--shell-muted)]">原表链接</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-panel)]"
              placeholder="粘贴腾讯文档 / WPS / 报名工具 / 探鲸等分享链接"
              value={sourceUrl}
              onChange={(e) => onUrlChange(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--shell-muted)]">转发平台</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-panel)]"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value as FormRelayPlatformId)}
            >
              {platformOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}（{p.hint}）
                </option>
              ))}
              <option value="other">其他平台</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--shell-muted)]">代收单标题</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-panel)]"
              placeholder="如：XX品牌探店代收"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-[var(--shell-muted)]">备注（可选）</span>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm bg-[var(--shell-panel)]"
              placeholder="客户表头说明、回填注意事项"
              value={titleNote}
              onChange={(e) => setTitleNote(e.target.value)}
            />
          </label>
          {parseWarn ? <p className="text-sm text-amber-600">{parseWarn}</p> : null}
          {parsePreview ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-xs space-y-2">
              <p className="font-semibold text-violet-800">已抓取原表信息</p>
              {parsePreview.city ? <p><span className="text-[var(--shell-muted)]">城市 </span>{parsePreview.city}</p> : null}
              {parsePreview.merchantRequirements ? (
                <p><span className="text-[var(--shell-muted)]">招募要求 </span>{parsePreview.merchantRequirements}</p>
              ) : null}
              {parsePreview.taskDetail ? (
                <pre className="whitespace-pre-wrap text-[var(--shell-text)] leading-relaxed">{parsePreview.taskDetail}</pre>
              ) : null}
            </div>
          ) : null}
          {err ? <p className="text-sm text-amber-600">{err}</p> : null}
          {doneId ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-sm space-y-2">
              <p className="text-emerald-800">已生成代收单 {doneId}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm"
                  onClick={() => void onCopyShareLink(doneId)}
                >
                  复制报名分享链接
                </button>
                <Link
                  to={`/orders/${encodeURIComponent(doneId)}/applicants`}
                  className="px-3 py-1.5 rounded-lg border text-sm"
                >
                  查看报名
                </Link>
              </div>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {submitting ? '抓取并生成中…' : '生成灵祺代收单'}
          </button>
        </form>
      </section>

      <section className="surface-card rounded-xl border p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">我的转发代收</h3>
          <button type="button" className="text-xs text-violet-600" onClick={() => void loadList()}>
            刷新
          </button>
        </div>
        {loadingList ? <p className="text-sm text-[var(--shell-muted)]">加载中…</p> : null}
        {!loadingList && !rows.length ? (
          <p className="text-sm text-[var(--shell-muted)]">暂无转发代收单，粘贴原表链接即可创建。</p>
        ) : null}
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.mpOrderId} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="font-semibold">{row.title}</h4>
                  <p className="text-xs text-[var(--shell-muted)] mt-1">
                    {row.platformLabel} · 已报名 {row.applicantCount} 人 · {row.createdAt}
                  </p>
                </div>
                <span className="text-xs font-mono text-[var(--shell-muted)]">{row.mpOrderId}</span>
              </div>
              {row.sourceUrl ? (
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 break-all"
                >
                  原表链接
                </a>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="text-xs px-2.5 py-1 rounded-lg border"
                  onClick={() => void onCopyShareLink(row.mpOrderId)}
                >
                  复制分享链接
                </button>
                <Link
                  to={`/orders/${encodeURIComponent(row.mpOrderId)}/applicants`}
                  className="text-xs px-2.5 py-1 rounded-lg bg-violet-600 text-white"
                >
                  报名管理 / 导出
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
