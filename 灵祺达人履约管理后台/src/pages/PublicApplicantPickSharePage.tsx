import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import PageHero from '../components/ui/PageHero'
import {
  fetchPublicApplicantPickShare,
  upsertPublicApplicantPickNote,
  type ApplicantPickShareNote,
  type ApplicantPickShareTalent,
} from '../lib/applicantPickShare'

const VISITOR_KEY = 'meoo_ap_share_visitor'

function loadVisitorName(): string {
  try {
    return localStorage.getItem(VISITOR_KEY) || ''
  } catch {
    return ''
  }
}

function saveVisitorName(name: string) {
  try {
    localStorage.setItem(VISITOR_KEY, name)
  } catch {
    /* ignore */
  }
}

function resolveShareToken(params: { token?: string; shareToken?: string }): string {
  return String(params.shareToken || params.token || '').trim()
}

export default function PublicApplicantPickSharePage() {
  const params = useParams()
  const token = resolveShareToken(params)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [talents, setTalents] = useState<ApplicantPickShareTalent[]>([])
  const [notes, setNotes] = useState<ApplicantPickShareNote[]>([])
  const [visitorName, setVisitorName] = useState(loadVisitorName)
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [submittingId, setSubmittingId] = useState('')
  const initialLoadDoneRef = useRef(false)

  const noteByApplicant = useMemo(() => {
    const map: Record<string, ApplicantPickShareNote> = {}
    for (const n of notes) {
      if (n.applicantId) map[n.applicantId] = n
    }
    return map
  }, [notes])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return
    const silent = opts?.silent ?? initialLoadDoneRef.current
    if (!silent) setLoading(true)
    if (!silent) setErr('')
    try {
      const data = await fetchPublicApplicantPickShare(token)
      setTitle(data.title)
      setExpiresAt(data.expiresAt)
      setTalents(data.talents)
      setNotes(data.notes)
      initialLoadDoneRef.current = true
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load({ silent: true }), 8000)
    return () => window.clearInterval(t)
  }, [load])

  async function copyProfileLink(rawLink: string) {
    const text = String(rawLink || '').trim()
    if (!text) {
      alert('未填写主页链接')
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      alert('已复制主页链接')
    } catch {
      alert('复制失败，请手动复制')
    }
  }

  async function onSubmitNote(applicantId: string) {
    if (!token || submittingId) return
    const noteText = String(draftNotes[applicantId] || '').trim()
    if (!noteText) {
      alert('请先填写备注')
      return
    }
    setSubmittingId(applicantId)
    try {
      await upsertPublicApplicantPickNote({
        token,
        applicantId,
        visitorName: visitorName.trim() || '商家',
        noteText,
      })
      await load({ silent: true })
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmittingId('')
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-red-600">分享链接无效</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-4">
        <PageHero title="达人反选备注" subtitle={title || '—'} />
        <p className="text-sm text-slate-500">
          共 {talents.length} 位达人
          {expiresAt ? ` · 分享有效至 ${expiresAt.slice(0, 19).replace('T', ' ')}` : ''}
        </p>

        <div className="surface-card rounded-2xl border p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">您的称呼（选填）</label>
          <input
            className="w-full rounded-xl border px-3 py-2 text-sm"
            placeholder="如：客户张总、品牌方"
            value={visitorName}
            onChange={(e) => {
              setVisitorName(e.target.value)
              saveVisitorName(e.target.value)
            }}
            maxLength={20}
          />
        </div>

        {loading && !talents.length ? <p className="text-sm text-slate-500">加载中…</p> : null}
        {err ? <p className="text-sm text-red-600">{err.includes('share_link_invalid') ? '分享链接已失效或过期' : err}</p> : null}

        {talents.map((t) => {
          const saved = noteByApplicant[t.applicantId]
          const draft = draftNotes[t.applicantId] ?? saved?.noteText ?? ''
          return (
            <article key={t.applicantId} className="surface-card rounded-2xl border p-4 space-y-3">
              <div>
                <h2 className="text-lg font-semibold">{t.displayName}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {t.platform} · 粉丝 {t.displayFollowers} · 带货 {t.displaySalesLevel}
                  {t.platformAccount ? ` · 账号 ${t.platformAccount}` : ''}
                </p>
                {t.profileLink ? (
                  <button
                    type="button"
                    className="mt-2 text-sm px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-700 font-medium"
                    onClick={() => void copyProfileLink(t.profileLink)}
                  >
                    复制主页链接
                  </button>
                ) : null}
                {t.accountTags?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.accountTags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {saved?.noteText ? (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
                  <div className="text-xs text-emerald-700 mb-1">
                    {saved.visitorName} · {String(saved.updatedAt || '').slice(0, 16).replace('T', ' ')}
                  </div>
                  {saved.noteText}
                </div>
              ) : null}

              <div>
                <label className="block text-sm font-medium text-indigo-700 mb-2">填写反选备注</label>
                <textarea
                  className="w-full min-h-[88px] rounded-xl border px-3 py-2 text-sm"
                  placeholder="如：优先合作 / 暂不选用 / 需确认档期…"
                  value={draft}
                  maxLength={500}
                  onChange={(e) =>
                    setDraftNotes((prev) => ({ ...prev, [t.applicantId]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  disabled={submittingId === t.applicantId}
                  className="mt-3 px-4 py-2 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-sm font-semibold disabled:opacity-60"
                  onClick={() => void onSubmitNote(t.applicantId)}
                >
                  {submittingId === t.applicantId ? '保存中…' : '保存备注'}
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
