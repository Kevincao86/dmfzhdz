import { Megaphone, RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  ANNOUNCEMENT_CATEGORY_ZH,
  ANNOUNCEMENT_PRIORITY_ZH,
  type TenantAnnouncementCategory,
  type TenantAnnouncementPriority,
} from '../../../api/_lib/tenantAnnouncementsCore'
import {
  countByExpiringBucket,
  draftExpiringAnnouncementCopy,
  filterTenantsByExpiringBucket,
  type AnnouncementTenantRow,
  type ExpiringBucket,
} from '../opsAnnouncementEntitlement'
import { fetchOpsAnnouncements, sendOpsAnnouncement, type OpsAnnouncementRow } from '../opsAnnouncementsApi'
import OpsRichContentEditor from '../components/OpsRichContentEditor'
import { richContentPlainPreview } from '../../meooRegistryShared/richContentCore.js'
import {
  fetchSupabaseTenantsForOps,
  supabaseOpsAvailableOnClient,
  supabaseRowsToRegistryTenants,
} from '../supabaseTenantsApi'

const PLAN_ZH: Record<string, string> = {
  free: '免费版',
  member: '会员版',
  member_plus: '会员 Plus',
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export default function OpsAnnouncementsPage() {
  const [tenants, setTenants] = useState<AnnouncementTenantRow[]>([])
  const [tenantLoadErr, setTenantLoadErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [targetAll, setTargetAll] = useState(false)
  const [category, setCategory] = useState<TenantAnnouncementCategory>('subscription_expiring')
  const [priority, setPriority] = useState<TenantAnnouncementPriority>('normal')
  const [expiringBucket, setExpiringBucket] = useState<ExpiringBucket | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [history, setHistory] = useState<OpsAnnouncementRow[]>([])
  const [historyErr, setHistoryErr] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const [tenantKeyword, setTenantKeyword] = useState('')

  const loadTenants = useCallback(async () => {
    if (!supabaseOpsAvailableOnClient()) {
      setTenantLoadErr('未配置 Supabase，无法向云端租户推送')
      setTenants([])
      return
    }
    const sb = await fetchSupabaseTenantsForOps()
    if (!sb.ok) {
      setTenantLoadErr(sb.hint ?? sb.detail ?? sb.error)
      setTenants([])
      return
    }
    setTenantLoadErr(null)
    const rows = supabaseRowsToRegistryTenants(sb.rows)
    setTenants(
      rows.map((t) => ({
        id: t.id,
        name: t.merchantName,
        loginName: t.loginName,
        plan: PLAN_ZH[t.membershipPlan ?? 'free'] ?? '免费版',
        serviceExpireAt: t.serviceExpireAt ?? null,
      })),
    )
  }, [])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    const r = await fetchOpsAnnouncements()
    setHistoryLoading(false)
    if (!r.ok) {
      setHistoryErr(r.hint ?? r.detail ?? r.error)
      setHistory([])
      return
    }
    setHistoryErr(null)
    setHistory(r.rows)
  }, [])

  useEffect(() => {
    void loadTenants()
    void loadHistory()
  }, [loadTenants, loadHistory])

  const bucketCounts = useMemo(() => countByExpiringBucket(tenants), [tenants])

  const applyExpiringBucket = useCallback(
    (bucket: ExpiringBucket) => {
      setTargetAll(false)
      setExpiringBucket(bucket)
      const matched = filterTenantsByExpiringBucket(tenants, bucket)
      setSelected(new Set(matched.map((t) => t.id)))
      const draft = draftExpiringAnnouncementCopy(bucket, matched)
      setTitle(draft.title)
      setBody(draft.body)
      setSendMsg(
        matched.length === 0
          ? { tone: 'err', text: `当前无「总权益剩余 ${bucket} 天到期」的 Supabase 客户，请检查 service_expire_at` }
          : null,
      )
    },
    [tenants],
  )

  const filteredTenants = useMemo(() => {
    let list = tenants
    if (category === 'subscription_expiring' && expiringBucket != null) {
      list = filterTenantsByExpiringBucket(tenants, expiringBucket)
    }
    const q = tenantKeyword.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.loginName.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }, [tenants, tenantKeyword, category, expiringBucket])

  const allVisibleSelected =
    filteredTenants.length > 0 && filteredTenants.every((t) => selected.has(t.id))

  const toggleAllVisible = () => {
    setTargetAll(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        for (const t of filteredTenants) next.delete(t.id)
      } else {
        for (const t of filteredTenants) next.add(t.id)
      }
      return next
    })
  }

  const toggleOne = (id: string) => {
    setTargetAll(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    setSendMsg(null)
    if (!targetAll && selected.size === 0) {
      setSendMsg({ tone: 'err', text: '请勾选至少一个租户，或选择「发送给全部注册用户」' })
      return
    }
    const t = title.trim()
    const b = body.trim()
    if (!t || !b) {
      setSendMsg({ tone: 'err', text: '请填写标题与正文' })
      return
    }
    const recipientHint = targetAll ? `全部 ${tenants.length} 个租户` : `${selected.size} 个租户`
    const priorityHint =
      category === 'platform_change'
        ? `\n标签：${ANNOUNCEMENT_PRIORITY_ZH[priority]}${priority === 'urgent' ? '（首页弹窗）' : ''}`
        : ''
    if (
      !window.confirm(
        `确认发送「${ANNOUNCEMENT_CATEGORY_ZH[category]}」？\n收件：${recipientHint}${priorityHint}\n标题：${t}`,
      )
    ) {
      return
    }

    setSending(true)
    const r = await sendOpsAnnouncement({
      category,
      priority: category === 'platform_change' ? priority : 'normal',
      title: t,
      body: b,
      targetAll,
      tenantIds: [...selected],
    })
    setSending(false)

    if (!r.ok) {
      const parts = [r.hint, r.detail, r.error].filter(Boolean)
      setSendMsg({ tone: 'err', text: parts.join(' · ') || '发送失败' })
      return
    }
    setSendMsg({
      tone: 'ok',
      text:
        category === 'platform_change' && priority === 'urgent'
          ? `已推送，共 ${r.recipientCount} 个租户；紧急公告将在商户 ERP 首页弹窗展示，铃铛中也可查看。`
          : `已推送，共 ${r.recipientCount} 个租户；商户 ERP 右上角铃铛可查看。`,
    })
    setTitle('')
    setBody('')
    setSelected(new Set())
    setTargetAll(false)
    setExpiringBucket(null)
    setPriority('normal')
    void loadHistory()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Megaphone className="h-6 w-6 text-indigo-400" />
          公告栏推送
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          向灵祺 ERP 注册用户发送站内公告，商户在 ERP 右上角铃铛中查看。支持套餐即将结束预警、平台改动预警两类。
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-200">新建推送</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                公告类型
              </label>
              <select
                value={category}
                onChange={(e) => {
                  const v = e.target.value as TenantAnnouncementCategory
                  setCategory(v)
                  if (v !== 'subscription_expiring') {
                    setExpiringBucket(null)
                  }
                  if (v !== 'platform_change') {
                    setPriority('normal')
                  }
                }}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="subscription_expiring">{ANNOUNCEMENT_CATEGORY_ZH.subscription_expiring}</option>
                <option value="platform_change">{ANNOUNCEMENT_CATEGORY_ZH.platform_change}</option>
              </select>
            </div>

            {category === 'subscription_expiring' ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="mb-2 text-xs font-medium text-amber-200/90">
                  按总权益剩余时长筛选（依据 tenants.service_expire_at，与 ERP 订阅页一致）
                </p>
                <div className="flex flex-wrap gap-2">
                  {([5, 3, 1] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => applyExpiringBucket(days)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        expiringBucket === days
                          ? 'border-amber-400 bg-amber-500/20 text-amber-100'
                          : 'border-slate-600 bg-slate-950 text-slate-300 hover:border-amber-500/50',
                      )}
                    >
                      总权益剩余 {days} 天到期
                      <span className="ml-1 text-slate-400">({bucketCounts[days]})</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                  <Sparkles className="h-3 w-3 text-indigo-400" />
                  选择后将自动勾选对应客户，并 AI 智能起草标题与正文（可再编辑）
                </p>
              </div>
            ) : null}

            {category === 'platform_change' ? (
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  优先级标签
                </label>
                <div className="flex gap-2">
                  {(['normal', 'urgent'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        priority === p
                          ? p === 'urgent'
                            ? 'border-red-400 bg-red-500/20 text-red-100'
                            : 'border-slate-500 bg-slate-800 text-slate-100'
                          : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-500',
                      )}
                    >
                      {ANNOUNCEMENT_PRIORITY_ZH[p]}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  紧急：商户登录后进入 ERP 首页将居中弹窗；普通：仅在右上角铃铛列表展示。
                </p>
              </div>
            ) : null}

            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                标题
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：您的会员服务即将到期"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                正文（支持图文排版）
              </label>
              <OpsRichContentEditor
                value={body}
                onChange={setBody}
                placeholder="公告详细说明，可插入图片与分段标题…"
                minRows={6}
                variant="light"
                textareaClassName="w-full min-h-[140px] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                hintClassName="text-slate-500"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={targetAll}
                onChange={(e) => {
                  setTargetAll(e.target.checked)
                  if (e.target.checked) {
                    setSelected(new Set())
                    setExpiringBucket(null)
                  }
                }}
                className="rounded border-slate-600"
              />
              发送给全部 Supabase 注册用户（{tenants.length} 个）
            </label>

            {!targetAll ? (
              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    已选 {selected.size} / {tenants.length}
                    {expiringBucket != null ? ` · 当前筛选：剩余 ${expiringBucket} 天到期` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={toggleAllVisible}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    {allVisibleSelected ? '取消本页全选' : '本页全选'}
                  </button>
                </div>
                <input
                  value={tenantKeyword}
                  onChange={(e) => setTenantKeyword(e.target.value)}
                  placeholder="筛选企业 / 登录名"
                  className="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-200"
                />
                {tenantLoadErr ? (
                  <p className="text-xs text-amber-400">{tenantLoadErr}</p>
                ) : (
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                    {filteredTenants.length === 0 ? (
                      <li className="px-1 py-2 text-xs text-slate-500">无匹配客户</li>
                    ) : null}
                    {filteredTenants.map((t) => (
                      <li key={t.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-slate-800/80">
                          <input
                            type="checkbox"
                            checked={selected.has(t.id)}
                            onChange={() => toggleOne(t.id)}
                            className="mt-1 rounded border-slate-600"
                          />
                          <span>
                            <span className="font-medium text-slate-200">{t.name}</span>
                            <span className="ml-2 text-xs text-slate-500">{t.loginName}</span>
                            <span className="ml-2 text-xs text-indigo-400/90">{t.plan}</span>
                            {t.serviceExpireAt ? (
                              <span className="ml-2 text-xs text-amber-400/80">
                                至 {fmt(t.serviceExpireAt).slice(0, 10)}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {sendMsg ? (
              <p
                className={cn(
                  'text-sm',
                  sendMsg.tone === 'ok' ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {sendMsg.text}
              </p>
            ) : null}

            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? '发送中…' : '发送公告'}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">推送记录</h2>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={historyLoading}
              className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className={cn('h-3 w-3', historyLoading && 'animate-spin')} />
              刷新
            </button>
          </div>
          {historyErr ? <p className="text-sm text-amber-400">{historyErr}</p> : null}
          <div className="max-h-[32rem] space-y-3 overflow-y-auto">
            {history.length === 0 && !historyLoading ? (
              <p className="text-sm text-slate-500">暂无推送记录</p>
            ) : null}
            {history.map((row) => (
              <article
                key={row.id}
                className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">
                    {ANNOUNCEMENT_CATEGORY_ZH[row.category]}
                  </span>
                  {row.category === 'platform_change' ? (
                    <span
                      className={cn(
                        'rounded px-2 py-0.5 text-xs',
                        row.priority === 'urgent'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-slate-700 text-slate-400',
                      )}
                    >
                      {ANNOUNCEMENT_PRIORITY_ZH[row.priority ?? 'normal']}
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-500">{fmt(row.created_at)}</span>
                  <span className="text-xs text-slate-400">
                    {row.target_all ? '全部用户' : `${row.recipient_count} 人`}
                  </span>
                </div>
                <p className="mt-1 font-medium text-slate-200">{row.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-400">
                  {richContentPlainPreview(row.body, 160)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
