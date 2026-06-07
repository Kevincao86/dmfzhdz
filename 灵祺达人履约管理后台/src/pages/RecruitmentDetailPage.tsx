import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { fetchMpRegistry } from '../lib/mpApi'
import { getActiveRole } from '../lib/mpSession'
import { hasAppliedToOrder } from '../lib/mpSync/applicationsStore'
import { enrichMpOrder } from '../lib/mpSync/recruitmentDisplay'
import {
  applicationStatusLabel,
  evaluateContactPrGate,
  extractPrChatMeta,
} from '../lib/mpSync/talentContactPrGate'
import {
  canChat,
  ensureSessionWithPr,
  formatChatError,
  syncProfile,
} from '../lib/mpSync/talentChat'
import { copyRecruitmentShareForTalent } from '../lib/mpSync/recruitmentShareCopy'

export default function RecruitmentDetailPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const nav = useNavigate()
  const role = getActiveRole()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [view, setView] = useState<ReturnType<typeof enrichMpOrder> | null>(null)
  const [mpRaw, setMpRaw] = useState<Record<string, unknown> | null>(null)
  const [contactGate, setContactGate] = useState(evaluateContactPrGate(null, id || ''))
  const [prChatMeta, setPrChatMeta] = useState<ReturnType<typeof extractPrChatMeta>>(null)
  const [contacting, setContacting] = useState(false)
  const [sharing, setSharing] = useState(false)
  const appliedFromUrl = search.get('applied') === '1'
  const applied = appliedFromUrl || (id ? hasAppliedToOrder(id) : false) || contactGate.hasApplication

  useEffect(() => {
    if (!id) {
      setErr('缺少招募单号')
      setLoading(false)
      return
    }
    void (async () => {
      setLoading(true)
      setErr('')
      try {
        const reg = await fetchMpRegistry()
        const list = (Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []) as Record<string, unknown>[]
        const mp = list.find((o) => o && o.id === id)
        if (!mp) {
          setErr('招募单不存在或已结束')
          return
        }
        if (mp.status === 'closed' || mp.status === 'done') {
          setErr('该招募已结束')
          return
        }
        const enriched = enrichMpOrder(mp)
        setMpRaw(mp)
        setView(enriched)
        const gate = evaluateContactPrGate(mp, id)
        setContactGate(gate)
        setPrChatMeta(extractPrChatMeta(mp, enriched.merchantName || enriched.title))
      } catch (e) {
        setErr(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  function goApply() {
    if (!view || !id) return
    const meta = mpRaw?.mpPublishMeta as { applyFormTemplateId?: string } | undefined
    const q = new URLSearchParams({
      platform: view.platform,
      merchantOrderNo: view.merchantOrderNo,
    })
    if (view.isIce) q.set('ice', '1')
    if (meta?.applyFormTemplateId) q.set('templateId', meta.applyFormTemplateId)
    nav(`/recruitment/${encodeURIComponent(id)}/apply?${q}`)
  }

  async function onContactPr() {
    if (!prChatMeta?.prParticipantKey) {
      window.alert('该单暂不支持私信')
      return
    }
    if (!contactGate.canContact) {
      window.alert(contactGate.message || '请先报名并等待 PR 审核通过')
      return
    }
    if (!canChat()) {
      window.alert('未配置后台 API，无法发起私信')
      return
    }
    setContacting(true)
    try {
      await syncProfile()
      const sessionId = await ensureSessionWithPr(prChatMeta)
      nav(
        `/chat?sessionId=${encodeURIComponent(sessionId)}` +
          `&peerName=${encodeURIComponent(prChatMeta.prDisplayName || '招募方')}` +
          `&peerAvatar=${encodeURIComponent(prChatMeta.prWxAvatarUrl || '')}`,
      )
    } catch (e) {
      window.alert(formatChatError(e))
    } finally {
      setContacting(false)
    }
  }

  async function onShare() {
    if (!mpRaw) return
    setSharing(true)
    try {
      await copyRecruitmentShareForTalent(mpRaw)
      window.alert('招募信息已复制，可粘贴到微信等渠道分享')
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '分享失败')
    } finally {
      setSharing(false)
    }
  }

  const statusLabel = applicationStatusLabel(contactGate)
  const chatEnabled = role === 'talent' && canChat() && !!prChatMeta

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/hall" className="text-sm text-slate-400 hover:text-white">
        ← 返回招募大厅
      </Link>
      {loading ? <p className="text-slate-400">加载中…</p> : null}
      {err ? <p className="text-red-400">{err}</p> : null}
      {view ? (
        <>
          <h2 className="text-xl font-bold">{view.title}</h2>
          <p className="text-amber-400 font-semibold">{view.budgetText}</p>
          <div className="text-sm text-slate-400 space-y-1">
            <p>
              {view.platform} · {view.region} · 报名 {view.applicantCount}/{view.recruitCount}
            </p>
            <p>粉丝要求：{view.fansRequirement}</p>
            <p className="font-mono text-xs text-slate-500">单号 {view.mpOrderId}</p>
          </div>

          {role === 'talent' && applied ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                contactGate.canContact
                  ? 'border-emerald-200 bg-emerald-50/80 text-emerald-800'
                  : 'border-amber-200 bg-amber-50/80 text-amber-900'
              }`}
            >
              <p className="font-medium">报名状态：{statusLabel}</p>
              {contactGate.reason === 'pending_pr_review' ? (
                <p className="mt-1 text-xs opacity-90">{contactGate.message}</p>
              ) : null}
              {contactGate.canContact ? (
                <p className="mt-1 text-xs opacity-90">PR 已通过您的报名，可联系招募方沟通排期。</p>
              ) : null}
            </div>
          ) : null}

          <section className="surface-card rounded-xl border p-4">
            <h3 className="font-medium mb-2">招募说明</h3>
            <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{view.recruitmentInfo}</pre>
          </section>
          {view.taskDetail !== view.recruitmentInfo ? (
            <section className="surface-card rounded-xl border p-4">
              <h3 className="font-medium mb-2">任务说明</h3>
              <pre className="text-sm text-slate-300 whitespace-pre-wrap font-sans">{view.taskDetail}</pre>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {role === 'talent' && !applied ? (
              <button type="button" className="flex-1 min-w-[10rem] py-3 rounded-xl bg-violet-600 font-medium" onClick={goApply}>
                {view.isIce ? '认领云剪任务' : '立即报名'}
              </button>
            ) : null}
            {role === 'talent' ? (
              <button
                type="button"
                className="px-4 py-3 rounded-xl border border-[var(--shell-border)] panel-tab text-sm font-medium"
                disabled={sharing}
                onClick={() => void onShare()}
              >
                {sharing ? '复制中…' : '分享招募'}
              </button>
            ) : null}
          </div>

          {applied && role === 'talent' && !contactGate.canContact ? (
            <p className="text-sm text-emerald-400">您已报名该招募，可在「我的报名」查看记录。</p>
          ) : null}

          {chatEnabled && contactGate.canContact ? (
            <button
              type="button"
              className="w-full py-3 rounded-xl bg-[#07c160] text-white font-medium hover:bg-[#06ad56] disabled:opacity-50 transition-colors"
              disabled={contacting}
              onClick={() => void onContactPr()}
            >
              {contacting ? '连接中…' : '沟通'}
            </button>
          ) : null}

          {chatEnabled && applied && prChatMeta && !contactGate.canContact ? (
            <p className="text-sm text-[var(--shell-muted)]">{contactGate.message}</p>
          ) : null}

          {role === 'pr' ? (
            <p className="text-sm text-slate-500">PR 账号仅可浏览大厅，报名请退出后以达人 / 拍摄 / 剪辑身份登录。</p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
