import { useEffect, useState } from 'react'
import { fetchTraining, postTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'

type Course = {
  id: string
  title: string
  hostName: string
  mode: 'online' | 'offline'
  city: string
  whenText: string
  seats: number
  fee: string
  signupCount?: number
}

export default function TrainingPage() {
  const me = getAccount()
  const [courses, setCourses] = useState<Course[]>([])
  const [mode, setMode] = useState<'all' | 'online' | 'offline'>('all')
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [fee, setFee] = useState('')
  const [postMode, setPostMode] = useState<'online' | 'offline'>('online')

  async function load() {
    const data = await fetchTraining()
    setCourses((data.courses as Course[]) || [])
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [])

  const shown = courses.filter((c) => mode === 'all' || c.mode === mode)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">培训课程</h1>
        <p className="mt-1 text-sm text-slate-500">
          课时费由平台代收。平台确认 1% 佣金，其余记应付款，核实通过后 T+1 结算。
        </p>
      </div>
      <div className="flex gap-2 text-sm">
        {(['all', 'online', 'offline'] as const).map((id) => (
          <button
            key={id}
            type="button"
            className={mode === id ? 'rounded-full bg-violet-600 px-3 py-1 text-white' : 'rounded-full bg-slate-100 px-3 py-1'}
            onClick={() => setMode(id)}
          >
            {id === 'all' ? '全部' : id === 'online' ? '线上' : '线下'}
          </button>
        ))}
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="space-y-3">
        {shown.map((c) => (
          <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-900">{c.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {c.hostName} · {c.mode === 'online' ? '线上' : '线下'}
                  {c.city ? ` · ${c.city}` : ''} {c.whenText ? ` · ${c.whenText}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-violet-700">¥{c.fee || '0'}</p>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              已报 {c.signupCount || 0}/{c.seats}
            </p>
            <button
              type="button"
              className="mt-3 rounded-xl bg-violet-600 px-3 py-2 text-sm text-white"
              onClick={() => {
                const name = window.prompt('报名姓名')
                if (!name) return
                postTraining({ action: 'signup', id: c.id, name, contact: me?.loginName || '' })
                  .then(() => load())
                  .catch((e) => setErr(e instanceof Error ? e.message : '报名失败'))
              }}
            >
              报名
            </button>
          </article>
        ))}
        {!shown.length ? <p className="text-sm text-slate-400">还没有课程</p> : null}
      </div>
      <form
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!title.trim()) return
          postTraining({
            action: 'create',
            title: title.trim(),
            fee,
            mode: postMode,
            hostId: me?.accountId || '',
            hostName: me?.wxNickName || me?.loginName || '达人',
            hostRole: me?.activeRole || 'talent',
          })
            .then(() => {
              setTitle('')
              setFee('')
              return load()
            })
            .catch((ex) => setErr(ex instanceof Error ? ex.message : '发布失败'))
        }}
      >
        <h2 className="font-semibold text-slate-900">发布培训</h2>
        <p className="text-xs text-slate-500">高级会员与保证金规则与小程序一致，网页先记录课程。</p>
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="课程名称" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="费用（元）" value={fee} onChange={(e) => setFee(e.target.value)} />
        <div className="flex gap-3 text-sm">
          <button type="button" className={postMode === 'online' ? 'font-semibold text-violet-700' : ''} onClick={() => setPostMode('online')}>线上</button>
          <button type="button" className={postMode === 'offline' ? 'font-semibold text-violet-700' : ''} onClick={() => setPostMode('offline')}>线下</button>
        </div>
        <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">发布</button>
      </form>
    </div>
  )
}
