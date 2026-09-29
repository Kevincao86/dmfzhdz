import { useEffect, useState } from 'react'
import { getAccount } from '../lib/mpSession'
import { readMember } from '../lib/mpSync/talentMember'
import {
  adviseTalent,
  evaluateTalent,
  type LocalLifeAdvice,
  type LocalLifeScore,
} from '../lib/talentLocalLifeEval'

function letterOf(name: string) {
  const s = name.trim()
  return s ? s.slice(0, 1) : '达'
}

export default function TalentLocalLifeEvalPage() {
  const member = readMember()
  const douyin = member?.platformProfiles?.douyin
  const nickname = String(douyin?.platformNickname || '').trim()
  const douyinId = String(douyin?.platformAccount || '').trim()
  const avatarUrl = String(getAccount()?.wxAvatarUrl || '').trim()
  const canEval = !!(nickname || douyinId)

  const [evaluating, setEvaluating] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [displayScore, setDisplayScore] = useState(0)
  const [scorePop, setScorePop] = useState(false)
  const [score, setScore] = useState<LocalLifeScore | null>(null)
  const [advice, setAdvice] = useState<LocalLifeAdvice | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!score) return
    const goal = score.score
    const start = performance.now()
    const dur = 1400
    let frame = 0
    setScorePop(false)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 3
      setDisplayScore(Math.round(goal * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else setScorePop(true)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [score])

  async function onEvaluate() {
    if (!canEval || evaluating || advising) return
    setEvaluating(true)
    setErr('')
    setScore(null)
    setAdvice(null)
    setScorePop(false)
    setDisplayScore(0)
    try {
      const next = await evaluateTalent(nickname, douyinId)
      setScore(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEvaluating(false)
    }
  }

  async function onAdvise() {
    if (!canEval || evaluating || advising) return
    setAdvising(true)
    setErr('')
    try {
      setAdvice(await adviseTalent(nickname, douyinId, score))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvising(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">达人抖音本地生活信息评估</h1>
      </header>

      <div className="surface-card rounded-xl border p-8 text-center">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" />
        ) : (
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-violet-700">
            {letterOf(nickname || douyinId)}
          </div>
        )}
        <p className="mt-3 text-lg font-bold">{nickname || '未填写昵称'}</p>
        <p className="mt-1 text-sm text-[var(--shell-muted)]">抖音号 {douyinId || '未填写'}</p>
      </div>

      <div className="surface-card rounded-xl border p-8 text-center">
        <div className="relative mx-auto h-52 w-52">
          <div
            className="absolute inset-2 rounded-full blur-md"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0 62%, rgba(124,77,255,0.55) 78%, transparent 92%)',
              animation: evaluating ? 'talent-eval-spin 1.15s linear infinite' : undefined,
              opacity: evaluating ? 1 : 0,
            }}
          />
          <svg viewBox="0 0 200 200" className="relative h-full w-full -rotate-90">
            <circle cx="100" cy="100" r="86" fill="none" stroke="#efeaf8" strokeWidth="14" />
            <circle
              cx="100"
              cy="100"
              r="86"
              fill="none"
              stroke="url(#talentEvalArc)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 86}`}
              strokeDashoffset={`${2 * Math.PI * 86 * (1 - displayScore / 100)}`}
            />
            <defs>
              <linearGradient id="talentEvalArc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#7c4dff" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className="text-6xl font-extrabold tabular-nums text-violet-700"
              style={{
                animation: scorePop ? 'talent-eval-pop 0.55s cubic-bezier(0.2, 1.35, 0.36, 1)' : undefined,
              }}
            >
              {displayScore}
            </span>
          </div>
        </div>
        <p className="mt-3 font-medium">数据智能分析</p>
        {score ? (
          <div className="mt-4 space-y-1 text-sm">
            <p className="font-medium">预估下月带货等级</p>
            <p>视频带货力 {score.videoLevel}</p>
            <p>直播带货力 {score.liveLevel}</p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={!canEval || evaluating || advising}
          onClick={() => void onEvaluate()}
        >
          {evaluating ? '评估中…' : '达人信息评估'}
        </button>
        <button
          type="button"
          className="rounded-xl border border-violet-300 bg-white px-4 py-3 text-sm font-medium text-violet-700 disabled:opacity-50"
          disabled={!canEval || evaluating || advising}
          onClick={() => void onAdvise()}
        >
          {advising ? '分析中…' : '分析整改'}
        </button>
      </div>
      {!canEval ? (
        <p className="text-center text-sm text-[var(--shell-muted)]">请先到「我的信息」填写抖音昵称或抖音号</p>
      ) : null}
      {err ? <p className="text-center text-sm text-red-600">{err}</p> : null}

      {advice ? (
        <div className="surface-card space-y-3 rounded-xl border p-4">
          <p className="font-medium">现状</p>
          <p className="text-sm text-[var(--shell-muted)]">{advice.status}</p>
          {advice.sections.map((row) => (
            <div key={row.name} className="border-t border-violet-100 pt-3">
              <p className="text-sm font-semibold text-violet-700">{row.name}</p>
              {row.now ? <p className="mt-1 text-sm">现状：{row.now}</p> : null}
              <p className="mt-1 text-sm">接下来：{row.next}</p>
            </div>
          ))}
        </div>
      ) : null}

      <style>{`@keyframes talent-eval-spin { to { transform: rotate(360deg); } } @keyframes talent-eval-pop { 0% { transform: scale(0.72); opacity: 0.4; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  )
}
