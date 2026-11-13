import { useEffect, useState } from 'react'
import { xingxuanEnhanceApi } from '../lib/mpSync/xingxuanEnhanceApi'

export default function XingxuanTalentCreditPage() {
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState('—')
  const [tips, setTips] = useState<string[]>([])
  const [stats, setStats] = useState<Array<{ label: string; value: string }>>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = (await xingxuanEnhanceApi.getTalentCredit()) as {
          credit?: {
            score?: number
            completedCount?: number
            appliedCount?: number
            passRate?: number
            onTimeRate?: number
            badges?: string[]
          }
        }
        const c = res.credit || {}
        const s = c.score ?? 0
        setScore(s)
        setLevel(s >= 90 ? '优秀达人' : s >= 75 ? '可靠达人' : s >= 60 ? '成长中' : '待提升')
        const t: string[] = []
        if ((c.passRate ?? 100) < 80) t.push('提高成片一次通过率可显著加分')
        if ((c.onTimeRate ?? 100) < 85) t.push('按时提交探店与成片，避免逾期')
        if (c.badges?.length) t.push(`已获得：${c.badges.join('、')}`)
        setTips(t)
        setStats([
          { label: '完成商单', value: String(c.completedCount ?? 0) },
          { label: '准时交付', value: `${c.onTimeRate ?? 0}%` },
          { label: '成片通过率', value: `${c.passRate ?? 0}%` },
          { label: '累计报名', value: String(c.appliedCount ?? 0) },
        ])
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <header>
        <h1 className="text-xl font-bold">达人信用</h1>
      </header>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="surface-card rounded-xl border p-8 text-center">
        <p className="text-5xl font-bold text-sky-600">{score}</p>
        <p className="text-sm text-[var(--shell-muted)] mt-2">信用分</p>
        <p className="font-medium mt-2">{level}</p>
      </div>
      <div className="analytics-metrics surface-card rounded-xl border p-4 grid grid-cols-2 gap-3">
        {stats.map((s) => (
          <div key={s.label}>
            <p className="text-xs text-[var(--shell-muted)]">{s.label}</p>
            <p className="text-lg font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      {tips.length ? (
        <div className="surface-card rounded-xl border p-4 space-y-2">
          <p className="font-medium text-sm">提升建议</p>
          {tips.map((t) => (
            <p key={t} className="text-sm text-[var(--shell-muted)]">
              · {t}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
