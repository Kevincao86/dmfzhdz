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
  const [score, setScore] = useState<LocalLifeScore | null>(null)
  const [advice, setAdvice] = useState<LocalLifeAdvice | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!score) return
    let cur = 0
    const goal = score.score
    const timer = window.setInterval(() => {
      cur += Math.max(1, Math.round((goal - cur) / 8))
      if (cur >= goal) {
        cur = goal
        window.clearInterval(timer)
      }
      setDisplayScore(cur)
    }, 40)
    return () => window.clearInterval(timer)
  }, [score])

  async function onEvaluate() {
    if (!canEval || evaluating || advising) return
    setEvaluating(true)
    setErr('')
    setScore(null)
    setAdvice(null)
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
        <div
          className="mx-auto flex h-44 w-44 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(#7c4dff ${displayScore}%, #efeaf8 0)`,
            animation: evaluating ? 'talent-eval-spin 0.9s linear infinite' : undefined,
          }}
        >
          <div className="flex h-36 w-36 items-center justify-center rounded-full bg-white">
            <span className="text-5xl font-extrabold text-violet-700">{displayScore}</span>
          </div>
        </div>
        <p className="mt-3 font-medium">豆包预估分</p>
        <p className="mt-1 text-xs text-[var(--shell-muted)]">豆包预估，不是来客官方等级</p>
        {score ? (
          <div className="mt-4 space-y-1 text-sm">
            <p className="font-medium">预估下月带货等级</p>
            <p>视频带货力 {score.videoLevel}</p>
            <p>直播带货力 {score.liveLevel}</p>
            {score.basis ? <p className="text-[var(--shell-muted)]">{score.basis}</p> : null}
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

      <style>{`@keyframes talent-eval-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
