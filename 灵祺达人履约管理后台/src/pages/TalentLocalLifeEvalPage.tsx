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
  readTalentEvalQuota,
  TALENT_ADVICE_POINTS,
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

const RADAR_AXES = [
  { name: '本地人群匹配', max: 20 },
  { name: '口碑合规风险', max: 10 },
  { name: '内容转化潜力', max: 15 },
  { name: '团购带货能力', max: 25 },
  { name: '内容质量人设', max: 15 },
  { name: '内容产能稳定', max: 15 },
]

function radarRows(situations: { name: string; points?: number; max?: number }[] | undefined) {
  return RADAR_AXES.map((axis) => {
    const hit = (situations || []).find((row) => row.name === axis.name || row.name.includes(axis.name.slice(0, 4)))
    return {
      name: axis.name,
      points: Number(hit?.points) || 0,
      max: Number(hit?.max) || axis.max,
    }
  })
}

function radarPoint(index: number, count: number, ratio: number, cx: number, cy: number, radius: number) {
  const ang = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return { x: cx + Math.cos(ang) * radius * ratio, y: cy + Math.sin(ang) * radius * ratio, ang }
}

function RadarFigure({
  rows,
  progress,
  sweep,
  showScore,
}: {
  rows: { name: string; points: number; max: number }[]
  progress: number
  sweep: number
  showScore: boolean
}) {
  const cx = 260
  const cy = 246
  const radius = 104
  const count = rows.length
  const poly = rows
    .map((row, index) => {
      const ratio = Math.max(0.03, Math.min(1, row.max ? row.points / row.max : 0)) * progress
      const point = radarPoint(index, count, ratio, cx, cy, radius)
      return `${point.x},${point.y}`
    })
    .join(' ')
  let wedge = ''
  if (sweep >= 0) {
    const start = -Math.PI / 2 + sweep * Math.PI * 2
    const end = start + Math.PI / 4.2
    const x0 = cx + Math.cos(start) * radius
    const y0 = cy + Math.sin(start) * radius
    const x1 = cx + Math.cos(end) * radius
    const y1 = cy + Math.sin(end) * radius
    wedge = `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 0 1 ${x1} ${y1} Z`
  }
  return (
    <svg viewBox="0 0 520 470" className="radar-svg" role="img" aria-label="六维评估">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={Array.from({ length: count }, (_, index) => {
            const point = radarPoint(index, count, ring, cx, cy, radius)
            return `${point.x},${point.y}`
          }).join(' ')}
          fill="none"
          stroke="#d7e4f4"
          strokeWidth="1"
        />
      ))}
      {rows.map((row, index) => {
        const edge = radarPoint(index, count, 1, cx, cy, radius)
        return <line key={row.name} x1={cx} y1={cy} x2={edge.x} y2={edge.y} stroke="#d7e4f4" strokeWidth="1" />
      })}
      {wedge ? <path d={wedge} fill="rgba(37,99,235,0.14)" /> : null}
      <polygon points={poly} fill="rgba(96,165,250,0.38)" stroke="#2563eb" strokeWidth="2.2" />
      {rows.map((row, index) => {
        const ratio = Math.max(0.03, Math.min(1, row.max ? row.points / row.max : 0)) * progress
        const point = radarPoint(index, count, ratio, cx, cy, radius)
        return <circle key={`${row.name}-dot`} cx={point.x} cy={point.y} r="3.6" fill="#1d4ed8" />
      })}
      {rows.map((row, index) => {
        const point = radarPoint(index, count, 1.46, cx, cy, radius)
        const cos = Math.cos(point.ang)
        const sin = Math.sin(point.ang)
        const anchor = cos > 0.34 ? 'start' : cos < -0.34 ? 'end' : 'middle'
        const shift = sin < -0.34 ? -20 : sin > 0.34 ? 6 : -8
        const shown = Math.max(0, Math.round(row.points * (showScore ? progress : 0)))
        return (
          <text key={`${row.name}-label`} x={point.x} y={point.y + shift} textAnchor={anchor} fill="#1e293b" fontSize="13" fontWeight="600">
            <tspan x={point.x}>{row.name}</tspan>
            {showScore ? (
              <tspan x={point.x} dy="16" fill="#1d4ed8" fontSize="12" fontWeight="700">
                {shown}/{row.max}
              </tspan>
            ) : null}
          </text>
        )
      })}
    </svg>
  )
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
  const canRunAdvice = talentAccess.talentAdvice
  const [quota, setQuota] = useState<{ paid: boolean; remaining: number; limit: number } | null>(null)
  const canEval = !!(nickname || accountId)
  const [evaluating, setEvaluating] = useState(false)
  const [advising, setAdvising] = useState(false)
  const [displayScore, setDisplayScore] = useState(0)
  const [scorePop, setScorePop] = useState(false)
  const [animateScore, setAnimateScore] = useState(false)
  const [radarProgress, setRadarProgress] = useState(1)
  const [sweep, setSweep] = useState(-1)
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
      setRadarProgress(0)
      return
    }
    setAnimateScore(false)
    setRadarProgress(1)
    setScore(saved.score)
    setAdvice(saved.advice)
    setDisplayScore(saved.score.score)
  }, [savedKey])

  useEffect(() => {
    let cancel = false
    void readTalentEvalQuota()
      .then((row) => {
        if (!cancel) setQuota({ paid: row.paid, remaining: row.remaining, limit: row.limit })
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
  }, [score])

  useEffect(() => {
    if (!score || !animateScore) return
    const goal = score.score
    const start = performance.now()
    const dur = 1400
    let frame = 0
    setScorePop(false)
    setRadarProgress(0)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      const eased = 1 - (1 - t) ** 3
      setDisplayScore(Math.round(goal * eased))
      setRadarProgress(eased)
      if (t < 1) frame = requestAnimationFrame(tick)
      else setScorePop(true)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [score, animateScore])

  useEffect(() => {
    if (!evaluating) {
      setSweep(-1)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      setSweep(((now - start) / 1100) % 1)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [evaluating])

  async function onEvaluate() {
    if (quota && quota.remaining <= 0) {
      if (quota.paid) {
        setErr('本月 15 次评估已用完，下月恢复')
        return
      }
      const ok = window.confirm('本月免费评估已用完。升级会员后每月可评估 15 次。')
      if (ok) navigate('/profile/membership')
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

  function scrollAdvice() {
    requestAnimationFrame(() => {
      document.getElementById('talent-advice-plan')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function onAdvise() {
    if (!score || evaluating || advising) return
    setAdvising(true)
    setErr('')
    setAdvice(null)
    scrollAdvice()
    try {
      setAdvice(await adviseTalent(input, score, { force: true }))
      scrollAdvice()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
      if (/未开通|升级会员|开通会员/.test(msg)) promptUpgradeMembership(navigate, '分析与提升方案')
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
              disabled={!canEval || evaluating || advising}
              onClick={() => void onEvaluate()}
            >
              {evaluating
                ? '评估中…'
                : quota && quota.remaining === 0
                  ? quota.paid
                    ? '本月次数已用完'
                    : '升级后每月 15 次'
                  : score
                    ? `重新评估 · 剩 ${quota && quota.remaining >= 0 ? quota.remaining : ''}次`
                    : quota?.paid
                      ? `评估 · 剩 ${quota.remaining}次`
                      : `免费评估 · 剩 ${quota && quota.remaining >= 0 ? quota.remaining : 1}次`}
            </button>
            <p className="mt-2 text-center text-xs text-[var(--shell-muted)]">
              免费版每月可评估 1 次。升级会员后每月可评估 15 次。分析提升每次 {TALENT_ADVICE_POINTS} 积分。
            </p>
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
              {advising ? '分析中…' : `分析提升 · ${TALENT_ADVICE_POINTS}积分`}
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

          {evaluating || score?.situations?.length ? (
            <div className="surface-card radar-card">
              <p className="radar-title">
                {(nickname || '达人') + ' 6维评估'}
                {score ? `（${displayScore}/100）` : ''}
              </p>
              <p className="radar-sub">{basis || '按已填写资料和公开主页估算'}</p>
              <RadarFigure
                rows={radarRows(score?.situations)}
                progress={score ? radarProgress : 0.08}
                sweep={sweep}
                showScore={!!score}
              />
            </div>
          ) : null}

          {score?.situations?.length ? (
            <div className="surface-card rounded-xl border p-5 text-left">
              <p className="text-xs tracking-wide text-[var(--shell-muted)]">达人现状</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {score.situations.map((row, index) => (
                  <div key={row.name} className="eval-plate eval-plate--stack">
                    <span className="eval-plate-no">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {row.name}
                        {row.max ? ` ${row.points}/${row.max}` : ''}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{row.now}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {advising ? (
            <div id="talent-advice-plan" className="surface-card rounded-xl border p-5">
              <p className="text-sm font-medium text-slate-700">正在按绑定资料和公网数据写提升方案…</p>
            </div>
          ) : null}

          {advice?.sections?.length ? (
            <div id="talent-advice-plan" className="surface-card rounded-xl border p-5">
              <p className="text-xs tracking-wide text-[var(--shell-muted)]">分析与提升方案</p>
              <div className="mt-3 grid gap-4">
                {advice.sections.map((row, index) => (
                  <div key={row.name} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {String(index + 1).padStart(2, '0')} {row.name}
                    </p>
                    {row.finding ? <p className="mt-2 text-sm leading-6 text-slate-700">分析结果：{row.finding}</p> : null}
                    {row.adjust ? <p className="mt-2 text-sm leading-6 text-slate-700">怎么调整：{row.adjust}</p> : null}
                    {row.soon ? <p className="mt-2 text-sm leading-6 text-slate-700">近期要做：{row.soon}</p> : null}
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
        .radar-card { text-align: center; padding: 1.25rem 0.5rem 0.25rem; }
        .radar-title { margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a; }
        .radar-sub { margin: 0.35rem 0 0; font-size: 0.8rem; color: #64748b; }
        .radar-svg { display: block; width: min(100%, 560px); height: auto; margin: 0 auto; }
      `}</style>
    </div>
  )
}
