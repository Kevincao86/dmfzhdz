import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAccount } from '../lib/mpSession'
import { readAccountPrFeatureAccess } from '../lib/prFeatureAccess'
import { readMember } from '../lib/mpSync/talentMember'
import {
  adviseTalent,
  describeEvalBasis,
  DOUYIN_SCORE_GRADES,
  douyinScoreGrade,
  evaluateTalent,
  platformEvalMeta,
  TALENT_ADVICE_POINTS,
  TALENT_EVAL_POINTS,
  readSavedTalentEval,
  previewTalentGains,
  formatSalesYuan,
  type EvalAccountInput,
  type LocalLifeAdvice,
  type LocalLifeScore,
} from '../lib/talentLocalLifeEval'

const PLATFORMS = [
  { id: 'douyin', name: '抖音平台', icon: '/platforms/douyin.png' },
  { id: 'xiaohongshu', name: '小红书', icon: '/platforms/xiaohongshu.png' },
  { id: 'kuaishou', name: '快手', icon: '/platforms/kuaishou-local.png' },
  { id: 'dianping', name: '大众点评', icon: '/platforms/dianping.png' },
  { id: 'weixin_video', name: '微信视频号', icon: '/platforms/wechat.png' },
] as const

function letterOf(name: string) {
  const s = name.trim()
  return s ? s.slice(0, 1) : '达'
}

function promptUpgradeMembership(navigate: (to: string) => void, feature: string) {
  const ok = window.confirm(`${feature}需更高会员档位，请升级至专业版后使用。`)
  if (ok) navigate('/profile/membership')
}

function useRiseCount(target: number, active: boolean) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active || target <= 0) {
      setValue(0)
      return
    }
    const start = performance.now()
    const dur = 1600
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 3
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, active])
  return value
}

export default function TalentLocalLifeEvalPage() {
  const navigate = useNavigate()
  const member = readMember()
  const [platformId, setPlatformId] = useState<(typeof PLATFORMS)[number]['id']>('douyin')
  const prof = member?.platformProfiles?.[platformId]
  const meta = platformEvalMeta(platformId)
  const input: EvalAccountInput = {
    platformId,
    nickname: String(prof?.platformNickname || '').trim(),
    accountId: String(prof?.platformAccount || '').trim(),
    followers: String(prof?.followers || '').trim(),
    profileLink: String(prof?.profileLink || '').trim(),
    tags: Array.isArray(prof?.accountTags) ? prof.accountTags : [],
    salesLevel: String(prof?.douyinSalesLevel || '').trim(),
    talentGrade: String(prof?.talentGrade || '').trim(),
    quotePrice: String(prof?.quotePrice || '').trim(),
  }
  const nickname = input.nickname || ''
  const accountId = input.accountId || ''
  const basis = describeEvalBasis(input)
  const avatarUrl = String(getAccount()?.wxAvatarUrl || '').trim()
  const talentAccess = readAccountPrFeatureAccess(getAccount())
  const canRunEval = talentAccess.talentEval
  const canRunAdvice = talentAccess.talentAdvice
  const canEval = !!(nickname || accountId)
  const [evaluating, setEvaluating] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [displayScore, setDisplayScore] = useState(0)
  const [scorePop, setScorePop] = useState(false)
  const [animateScore, setAnimateScore] = useState(false)
  const [score, setScore] = useState<LocalLifeScore | null>(null)
  const [advice, setAdvice] = useState<LocalLifeAdvice | null>(null)
  const [err, setErr] = useState('')
  const grade = platformId === 'douyin' && score ? douyinScoreGrade(score.score) : null
  const savedKey = [
    platformId,
    nickname,
    accountId,
    input.followers,
    input.profileLink,
    (input.tags || []).join(','),
    input.salesLevel,
    input.talentGrade,
    input.quotePrice,
  ].join('|')

  useEffect(() => {
    const saved = readSavedTalentEval(input)
    setErr('')
    if (!saved) {
      setScore(null)
      setAdvice(null)
      setDisplayScore(0)
      setScorePop(false)
      setAnimateScore(false)
      return
    }
    setAnimateScore(false)
    setScore(saved.score)
    setAdvice(saved.advice)
    setDisplayScore(saved.score.score)
  }, [savedKey])

  useEffect(() => {
    if (!score || !animateScore) return
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
  }, [score, animateScore])

  async function onEvaluate() {
    if (!canRunEval) {
      promptUpgradeMembership(navigate, '达人账号评估')
      return
    }
    if (!canEval || evaluating || advising) return
    setEvaluating(true)
    setErr('')
    try {
      const next = await evaluateTalent(input, { force: true })
      setAdvice(null)
      setAnimateScore(true)
      setDisplayScore(0)
      setScorePop(false)
      setScore(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setEvaluating(false)
    }
  }

  async function onAdvise() {
    if (!canRunAdvice) {
      promptUpgradeMembership(navigate, '分析与提升方案')
      return
    }
    if (!score || evaluating || advising) return
    setAdvising(true)
    setErr('')
    try {
      setAdvice(await adviseTalent(input, score, { force: true }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAdvising(false)
    }
  }

  const preview = score ? previewTalentGains(score.score, input.followers || '', input.quotePrice || '') : null
  const exposurePct = score ? (score.exposureLift > 0 ? score.exposureLift : preview?.exposurePct || 0) : 0
  const salesYuan = score ? (score.salesLift > 0 ? score.salesLift : preview?.salesYuan || 0) : 0
  const exposureShown = useRiseCount(exposurePct, !!score)
  const salesShown = useRiseCount(salesYuan, !!score)

  return (
    <div className="page-content-shell space-y-4">
      <header>
        <h1 className="text-xl font-bold">达人账号分析</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              platformId === item.id
                ? 'inline-flex items-center gap-1.5 rounded-full bg-violet-600 py-1 pl-1 pr-3 text-sm font-medium text-white'
                : 'inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white py-1 pl-1 pr-3 text-sm text-[var(--shell-muted)]'
            }
            onClick={() => setPlatformId(item.id)}
          >
            <img src={item.icon} alt="" className="h-5 w-5 rounded bg-white object-contain" />
            {item.name}
          </button>
        ))}
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="surface-card flex items-center gap-5 rounded-xl border p-6 text-left">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-20 w-20 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-violet-100 text-2xl font-bold text-violet-700">
              {letterOf(nickname || accountId)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-lg font-bold">{nickname || '未填写昵称'}</p>
            <p className="mt-1 text-sm text-[var(--shell-muted)]">
              {meta.accountLabel} {accountId || '未填写'}
            </p>
            <p className="mt-1 text-sm text-[var(--shell-muted)]">{basis || '按已填写的昵称和账号分析'}</p>
          </div>
        </div>

        <div className="surface-card rounded-xl border p-6 text-center">
            <div className="relative mx-auto h-44 w-44">
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
                  className="text-5xl font-extrabold tabular-nums text-violet-700"
                  style={{
                    animation: scorePop ? 'talent-eval-pop 0.55s cubic-bezier(0.2, 1.35, 0.36, 1)' : undefined,
                  }}
                >
                  {displayScore}
                </span>
              </div>
            </div>
            <p className="mt-2 font-medium">数据智能分析</p>
            {grade ? (
              <div className="mt-2">
                <p
                  className={`text-lg font-extrabold ${
                    grade.key === 'excellent'
                      ? 'text-green-700'
                      : grade.key === 'good'
                        ? 'text-violet-700'
                        : grade.key === 'fix'
                          ? 'text-amber-700'
                          : 'text-red-700'
                  }`}
                >
                  {grade.label}
                </p>
                <p className="mt-1 text-sm text-[var(--shell-muted)]">{grade.note}</p>
              </div>
            ) : null}
            {score ? (
              <div className="mt-3 space-y-1 text-sm">
                <p className="font-medium">{meta.levelTitle}</p>
                <p>
                  {meta.levelA} {score.videoLevel}
                </p>
                <p>
                  {meta.levelB} {score.liveLevel}
                </p>
              </div>
            ) : null}
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              disabled={(canRunEval && !canEval) || evaluating || advising}
              onClick={() => void onEvaluate()}
            >
              {evaluating
                ? '评估中…'
                : score
                  ? `重新评估 · ${TALENT_EVAL_POINTS}积分`
                  : `达人信息评估 · ${TALENT_EVAL_POINTS}积分`}
            </button>
          </div>
      </div>

      <div className="space-y-4">
          <div className="surface-card rounded-xl border p-6">
            {score ? (
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="text-xs tracking-wide text-[var(--shell-muted)]">预计提升曝光</p>
                  <p className="gain-figure">+{exposureShown}%</p>
                </div>
                <div>
                  <p className="text-xs tracking-wide text-[var(--shell-muted)]">预计提升带货金额</p>
                  <p className="gain-figure">+{formatSalesYuan(salesShown)}</p>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--shell-muted)]">完成评估后，这里显示预计提升的曝光和带货金额</p>
            )}
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-violet-300 bg-white px-4 py-3 text-sm font-medium text-violet-700 disabled:opacity-50"
              disabled={(canRunAdvice && !score) || evaluating || advising}
              onClick={() => void onAdvise()}
            >
              {advising ? '分析中…' : `查看分析与提升方案 · ${TALENT_ADVICE_POINTS}积分`}
            </button>
            {!canEval ? (
              <p className="mt-3 text-center text-sm text-[var(--shell-muted)]">
                请先到「我的信息」填写{meta.nickLabel}或{meta.accountLabel}
              </p>
            ) : !score ? (
              <p className="mt-3 text-center text-sm text-[var(--shell-muted)]">请先完成达人信息评估</p>
            ) : null}
            {err ? <p className="mt-3 text-center text-sm text-red-600">{err}</p> : null}
          </div>

          {score?.situations?.length ? (
            <div className="surface-card rounded-xl border p-5 text-left">
              <p className="text-xs tracking-wide text-[var(--shell-muted)]">达人现状</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {score.situations.map((row, index) => (
                  <div key={row.name} className="eval-plate eval-plate--stack">
                    <span className="eval-plate-no">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{row.now}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {advice?.sections?.length ? (
            <div className="surface-card rounded-xl border p-5">
              <p className="text-xs tracking-wide text-[var(--shell-muted)]">分析与提升方案</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {advice.sections.map((row, index) => (
                  <div key={row.name} className="eval-plate eval-plate--stack">
                    <span className="eval-plate-no">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{row.next}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {grade ? (
            <div className="surface-card rounded-xl border p-5 text-left">
              <p className="text-xs tracking-wide text-[var(--shell-muted)]">评级释义</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {DOUYIN_SCORE_GRADES.map((row) => (
                  <div key={row.key} className={`eval-plate ${row.key === grade.key ? 'eval-plate--on' : ''}`}>
                    <span className="eval-plate-no">{row.range}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{row.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

      <style>{`
        @keyframes talent-eval-spin { to { transform: rotate(360deg); } }
        @keyframes talent-eval-pop { 0% { transform: scale(0.72); opacity: 0.4; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes gain-sheen { 0% { background-position: 0% 50%; } 100% { background-position: 220% 50%; } }
        @keyframes gain-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        .gain-figure {
          margin-top: 0.35rem;
          font-size: clamp(2.6rem, 4vw, 3.6rem);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          color: #5b21b6;
          animation: gain-float 2.6s ease-in-out infinite;
        }
        @supports ((-webkit-background-clip: text) or (background-clip: text)) {
          .gain-figure {
            background-image: linear-gradient(100deg, #3b0764 0%, #6d28d9 28%, #ddd6fe 46%, #6d28d9 64%, #3b0764 100%);
            background-size: 220% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: gain-sheen 2.2s linear infinite, gain-float 2.6s ease-in-out infinite;
          }
        }
        .eval-plate {
          display: grid;
          grid-template-columns: 4.4rem minmax(0, 1fr);
          gap: 0.75rem;
          align-items: start;
          border-radius: 1rem;
          background: #f6f3ee;
          padding: 0.9rem 1rem;
        }
        .eval-plate--stack {
          grid-template-columns: 1fr;
          gap: 0.35rem;
          min-height: 100%;
        }
        .eval-plate--on {
          background: #efeaf8;
          box-shadow: inset 0 0 0 1px #ddd6fe;
        }
        .eval-plate-no {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #7c4dff;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          padding-top: 0.15rem;
        }
      `}</style>
    </div>
  )
}
