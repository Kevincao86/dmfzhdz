import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchTraining, postTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'

const ADVANCED = new Set(['pro', 'flagship', 'enterprise'])
const DEPOSIT = 500

type Lecturer = {
  hostId: string
  kind: 'person' | 'entity'
  name: string
  idNo: string
  bank: string
  bankNo: string
  licenseNo: string
  idFront?: string
  idBack?: string
  licenseImage?: string
}

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
  const [applyOpen, setApplyOpen] = useState(false)
  const [kind, setKind] = useState<'person' | 'entity'>('person')
  const [name, setName] = useState('')
  const [idNo, setIdNo] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [bank, setBank] = useState('')
  const [bankNo, setBankNo] = useState('')
  const [idFront, setIdFront] = useState('')
  const [idBack, setIdBack] = useState('')
  const [licenseImage, setLicenseImage] = useState('')
  const [ocrHint, setOcrHint] = useState('')
  const [depositOk, setDepositOk] = useState(false)
  const [lecturer, setLecturer] = useState(false)
  const [saving, setSaving] = useState(false)
  const advanced = ADVANCED.has(String(me?.mpMembershipPlan || ''))

  async function load() {
    const data = await fetchTraining(me?.accountId)
    setCourses((data.courses as Course[]) || [])
    const profile = data.profile as Lecturer | null
    if (profile?.name) {
      setLecturer(true)
      setKind(profile.kind === 'entity' ? 'entity' : 'person')
      setName(profile.name || '')
      setIdNo(profile.idNo || '')
      setLicenseNo(profile.licenseNo || '')
      setBank(profile.bank || '')
      setBankNo(profile.bankNo || '')
      setIdFront(profile.idFront || '')
      setIdBack(profile.idBack || '')
      setLicenseImage(profile.licenseImage || '')
      setDepositOk(true)
    }
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [])

  const shown = courses.filter((c) => mode === 'all' || c.mode === mode)

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">培训课程</h1>
          <button
            type="button"
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setApplyOpen(true)}
          >
            {lecturer ? '讲师资料' : '申请讲师'}
          </button>
        </div>
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
          if (!lecturer || !title.trim()) return
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
        {!lecturer ? (
          <p className="text-xs text-slate-500">
            先点右上角「申请讲师」，完成高级会员、保证金和收款资料后才能发布。
          </p>
        ) : null}
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="课程名称" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="费用（元）" value={fee} onChange={(e) => setFee(e.target.value)} />
        <div className="flex gap-3 text-sm">
          <button type="button" className={postMode === 'online' ? 'font-semibold text-violet-700' : ''} onClick={() => setPostMode('online')}>线上</button>
          <button type="button" className={postMode === 'offline' ? 'font-semibold text-violet-700' : ''} onClick={() => setPostMode('offline')}>线下</button>
        </div>
        <button type="submit" disabled={!lecturer} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-40">
          发布
        </button>
      </form>
      {applyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setApplyOpen(false)}>
          <form
            className="max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-2xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (!me?.accountId) {
                setErr('请先登录')
                return
              }
              if (!advanced) {
                setErr('请先开通专业版、旗舰版或企业版')
                return
              }
              if (!depositOk) {
                setErr(`请确认缴纳保证金 ¥${DEPOSIT}`)
                return
              }
              if (!name.trim() || !idNo.trim() || !bank.trim() || !bankNo.trim()) {
                setErr('请填写收款资料')
                return
              }
              if (kind === 'entity' && !licenseNo.trim()) {
                setErr('请填写统一社会信用代码')
                return
              }
              setSaving(true)
              setErr('')
              postTraining({
                action: 'saveProfile',
                hostId: me.accountId,
                kind,
                name: name.trim(),
                idNo: idNo.trim(),
                bank: bank.trim(),
                bankNo: bankNo.trim(),
                licenseNo: kind === 'entity' ? licenseNo.trim() : '',
                idFront,
                idBack,
                licenseImage,
              })
                .then(() => {
                  setLecturer(true)
                  setApplyOpen(false)
                })
                .catch((ex) => setErr(ex instanceof Error ? ex.message : '申请失败'))
                .finally(() => setSaving(false))
            }}
          >
            <h2 className="text-lg font-bold text-slate-900">申请讲师</h2>
            <p className="text-xs leading-relaxed text-slate-500">
              需高级会员，并确认保证金 ¥{DEPOSIT}。个人按月预扣个税，当月不超过 800 元不预扣。个体户或企业凭发票结算。
            </p>
            <p className="text-sm text-slate-700">高级会员：{advanced ? '已开通' : '未开通'}</p>
            {!advanced ? (
              <Link to="/profile/membership" className="inline-block text-sm font-semibold text-violet-700">
                去开通会员
              </Link>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={depositOk} onChange={(e) => setDepositOk(e.target.checked)} />
              确认缴纳保证金 ¥{DEPOSIT}
            </label>
            <p className="text-sm font-medium text-slate-800">上传原件并识别</p>
            <label className="block text-sm text-slate-600">
              身份证人像面
              <input
                className="mt-1 block w-full text-sm"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const imageDataUrl = String(reader.result || '')
                    setIdFront(imageDataUrl)
                    setOcrHint('正在识别人像面…')
                    postTraining({ action: 'ocrDoc', kind: 'id_front', imageDataUrl })
                      .then((r) => {
                        const f = (r.fields || {}) as Record<string, string>
                        if (f.name) setName(f.name)
                        if (f.idNo) setIdNo(f.idNo)
                        setOcrHint('已填入人像面文字，请核对')
                      })
                      .catch(() => setOcrHint('人像面识别失败，请手工填写'))
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            <label className="block text-sm text-slate-600">
              身份证国徽面
              <input
                className="mt-1 block w-full text-sm"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = () => {
                    const imageDataUrl = String(reader.result || '')
                    setIdBack(imageDataUrl)
                    setOcrHint('正在识别国徽面…')
                    postTraining({ action: 'ocrDoc', kind: 'id_back', imageDataUrl })
                      .then(() => setOcrHint('国徽面已上传'))
                      .catch(() => setOcrHint('国徽面识别失败'))
                  }
                  reader.readAsDataURL(file)
                }}
              />
            </label>
            {kind === 'entity' ? (
              <label className="block text-sm text-slate-600">
                营业执照
                <input
                  className="mt-1 block w-full text-sm"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = () => {
                      const imageDataUrl = String(reader.result || '')
                      setLicenseImage(imageDataUrl)
                      setOcrHint('正在识别营业执照…')
                      postTraining({ action: 'ocrDoc', kind: 'license', imageDataUrl })
                        .then((r) => {
                          const f = (r.fields || {}) as Record<string, string>
                          if (f.name) setName(f.name)
                          if (f.licenseNo) setLicenseNo(f.licenseNo)
                          setOcrHint('已填入执照文字，请核对')
                        })
                        .catch(() => setOcrHint('执照识别失败，请手工填写'))
                    }
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
            ) : null}
            {ocrHint ? <p className="text-xs text-violet-700">{ocrHint}</p> : null}
            <div className="flex gap-3 text-sm">
              <button type="button" className={kind === 'person' ? 'font-semibold text-violet-700' : 'text-slate-500'} onClick={() => setKind('person')}>
                个人
              </button>
              <button type="button" className={kind === 'entity' ? 'font-semibold text-violet-700' : 'text-slate-500'} onClick={() => setKind('entity')}>
                个体户 / 企业
              </button>
            </div>
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder={kind === 'person' ? '姓名' : '主体名称'} value={name} onChange={(e) => setName(e.target.value)} />
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder={kind === 'person' ? '身份证号' : '联系人身份证'} value={idNo} onChange={(e) => setIdNo(e.target.value)} />
            {kind === 'entity' ? (
              <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="统一社会信用代码" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
            ) : null}
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="开户行" value={bank} onChange={(e) => setBank(e.target.value)} />
            <input className="w-full rounded-xl border px-3 py-2 text-sm" placeholder="账号" value={bankNo} onChange={(e) => setBankNo(e.target.value)} />
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded-xl border px-3 py-2 text-sm" onClick={() => setApplyOpen(false)}>
                取消
              </button>
              <button type="submit" disabled={saving} className="flex-1 rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? '提交中…' : '提交申请'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
