import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchTraining, postTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'
import { initModalState } from '../lib/mpSync/publishCityPicker'
import { allCitiesFlat } from '../lib/mpSync/chinaRegion'

const LECTURER_PLATFORMS = ['抖音', '小红书', '大众点评', '快手', '微信视频号']

function splitPlatforms(raw: string) {
  return String(raw || '')
    .split(/[、,，/]/)
    .map((s) => s.trim())
    .filter((s) => LECTURER_PLATFORMS.includes(s))
}

function parseLecturerCities(raw: string) {
  const text = String(raw || '').trim()
  if (!text) return { national: false, cities: [] as string[] }
  if (text === '全国' || text === '不限') return { national: true, cities: [] as string[] }
  const all = allCitiesFlat()
  const matched: string[] = []
  for (const part of text.split(/[、,，/\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const hit = all.find((c) => c === part || c.replace(/市$/, '') === part.replace(/市$/, '') || c.includes(part))
    if (hit && !matched.includes(hit)) matched.push(hit)
  }
  return { national: false, cities: matched }
}

function lecturerCityText(national: boolean, cities: string[]) {
  if (national) return '全国'
  return cities.length ? cities.join('、') : ''
}

function parseWhen(raw: string) {
  const text = String(raw || '').trim()
  const range = text.match(/^(\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})[，,\s]*每天\s*(\d{2}:\d{2})\s*[-–—至到]\s*(\d{2}:\d{2})/)
  if (range) return { startDate: range[1], endDate: range[2], startTime: range[3], endTime: range[4] }
  const one = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/)
  if (one) return { startDate: one[1], endDate: one[1], startTime: one[2] || '14:00', endTime: '16:00' }
  return { startDate: '', endDate: '', startTime: '14:00', endTime: '16:00' }
}

function formatWhen(startDate: string, endDate: string, startTime: string, endTime: string) {
  if (!startDate || !endDate || !startTime || !endTime) return ''
  return `${startDate} 至 ${endDate}，每天 ${startTime}-${endTime}`
}

const ADVANCED = new Set(['pro', 'flagship', 'enterprise'])
const DEPOSIT = 500

function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1600
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('无法处理图片'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片'))
    }
    img.src = url
  })
}

type Lecturer = {
  hostId: string
  kind: 'person' | 'entity'
  name: string
  idNo: string
  bank: string
  bankNo: string
  licenseNo: string
  city?: string
  platforms?: string
  skills?: string
  years?: string
  intro?: string
  avatar?: string
  idFront?: string
  idBack?: string
  licenseImage?: string
  lecturerStatus?: 'none' | 'pending' | 'approved' | 'rejected' | ''
}

type SignupField = { key: string; label: string; kind: 'name' | 'idNo' | 'phone' | 'text' }

const DEFAULT_FIELDS: SignupField[] = [
  { key: 'name', label: '姓名', kind: 'name' },
  { key: 'idNo', label: '身份证号', kind: 'idNo' },
  { key: 'phone', label: '手机号', kind: 'phone' },
]

function fieldsOf(raw: unknown): SignupField[] {
  const list = Array.isArray(raw) ? raw : []
  const out: SignupField[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as SignupField
    const label = String(row.label || '').trim()
    if (!label) continue
    const kind = row.kind === 'name' || row.kind === 'idNo' || row.kind === 'phone' || row.kind === 'text' ? row.kind : 'text'
    const key = String(row.key || `${kind}-${out.length}`)
    if (out.some((field) => field.key === key)) continue
    out.push({ key, label, kind })
  }
  if (!out.some((field) => field.kind === 'name')) out.unshift(DEFAULT_FIELDS[0])
  return out.length ? out : DEFAULT_FIELDS.map((field) => ({ ...field }))
}

function answersError(fields: SignupField[], answers: Record<string, string>) {
  for (const field of fields) {
    const value = String(answers[field.key] || '').trim()
    if (!value) return `请填写${field.label}`
    if (field.kind === 'idNo' && !/^(\d{15}|\d{17}[\dXx])$/.test(value)) return '请填写正确的身份证号'
    if (field.kind === 'phone' && !/^1\d{10}$/.test(value)) return '请填写正确的手机号'
  }
  return ''
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
  poster?: string
  note?: string
  signupFields?: SignupField[]
  reviewStatus?: 'pending' | 'approved' | 'rejected' | ''
  reviewNote?: string
}

export default function TrainingPage() {
  const me = getAccount()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusCourseId = searchParams.get('course') || ''
  const [courses, setCourses] = useState<Course[]>([])
  const [mine, setMine] = useState<Course[]>([])
  const [mode, setMode] = useState<'all' | 'online' | 'offline'>('all')
  const [err, setErr] = useState('')
  const [title, setTitle] = useState('')
  const [fee, setFee] = useState('')
  const [postMode, setPostMode] = useState<'online' | 'offline'>('online')
  const [postCity, setPostCity] = useState('')
  const [whenText, setWhenText] = useState('')
  const [seats, setSeats] = useState('20')
  const [note, setNote] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [kind, setKind] = useState<'person' | 'entity'>('person')
  const [name, setName] = useState('')
  const [idNo, setIdNo] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [bank, setBank] = useState('')
  const [bankNo, setBankNo] = useState('')
  const [city, setCity] = useState('')
  const [platforms, setPlatforms] = useState('')
  const [skills, setSkills] = useState('')
  const [years, setYears] = useState('')
  const [intro, setIntro] = useState('')
  const [avatar, setAvatar] = useState('')
  const [cityNational, setCityNational] = useState(false)
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [cityKeyword, setCityKeyword] = useState('')
  const [cityProvince, setCityProvince] = useState('')
  const [cityOpen, setCityOpen] = useState(false)
  const [cityTarget, setCityTarget] = useState<'lecturer' | 'course'>('lecturer')
  const [courseNational, setCourseNational] = useState(false)
  const [courseCities, setCourseCities] = useState<string[]>([])
  const [whenStartDate, setWhenStartDate] = useState('')
  const [whenEndDate, setWhenEndDate] = useState('')
  const [whenStartTime, setWhenStartTime] = useState('14:00')
  const [whenEndTime, setWhenEndTime] = useState('16:00')
  const [platformMode, setPlatformMode] = useState<'single' | 'multi'>('multi')
  const [platformPicks, setPlatformPicks] = useState<string[]>([])
  const [poster, setPoster] = useState('')
  const [signupFields, setSignupFields] = useState<SignupField[]>(DEFAULT_FIELDS)
  const [fieldDraft, setFieldDraft] = useState('')
  const [sheetErr, setSheetErr] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [idFront, setIdFront] = useState('')
  const [idBack, setIdBack] = useState('')
  const [licenseImage, setLicenseImage] = useState('')
  const [ocrHint, setOcrHint] = useState('')
  const [depositPaid, setDepositPaid] = useState(false)
  const [payOpen, setPayOpen] = useState<null | { purpose: 'deposit' | 'course'; courseId: string; name: string; title: string; fields: SignupField[] }>(null)
  const [payChannel, setPayChannel] = useState<'wechat' | 'alipay' | 'douyin'>('wechat')
  const [payQr, setPayQr] = useState('')
  const [payTrade, setPayTrade] = useState('')
  const [payBusy, setPayBusy] = useState(false)
  const [panel, setPanel] = useState<'' | 'apply' | 'payout'>('')
  const [lecturerStatus, setLecturerStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none')
  const [saving, setSaving] = useState(false)
  const advanced = ADVANCED.has(String(me?.mpMembershipPlan || ''))

  async function load() {
    const data = await fetchTraining(me?.accountId)
    setCourses((data.courses as Course[]) || [])
    setMine((data.mine as Course[]) || [])
    const deposit = data.deposit as { paid?: boolean } | undefined
    setDepositPaid(!!deposit?.paid)
    const profile = data.profile as Lecturer | null
    const status = profile?.lecturerStatus
    const nextStatus =
      status === 'none' || status === 'pending' || status === 'approved' || status === 'rejected'
        ? status
        : profile?.intro && profile?.city
          ? 'approved'
          : 'none'
    setLecturerStatus(nextStatus)
    if (!profile) return
    setKind(profile.kind === 'entity' ? 'entity' : 'person')
    setName(profile.name || '')
    setIdNo(profile.idNo || '')
    setLicenseNo(profile.licenseNo || '')
    setBank(profile.bank || '')
    setBankNo(profile.bankNo || '')
    setCity(profile.city || '')
    const parsedCities = parseLecturerCities(profile.city || '')
    setCityNational(parsedCities.national)
    setSelectedCities(parsedCities.cities)
    setPlatforms(profile.platforms || '')
    const picked = splitPlatforms(profile.platforms || '')
    setPlatformPicks(picked)
    setPlatformMode(picked.length > 1 ? 'multi' : 'single')
    setAvatar(profile.avatar || '')
    setSkills(profile.skills || '')
    setYears(profile.years || '')
    setIntro(profile.intro || '')
    setIdFront(profile.idFront || '')
    setIdBack(profile.idBack || '')
    setLicenseImage(profile.licenseImage || '')
  }

  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : '加载失败'))
  }, [])

  useEffect(() => {
    if (!focusCourseId) return
    document.getElementById(`train-${focusCourseId}`)?.scrollIntoView({ block: 'center' })
  }, [focusCourseId, courses])

  useEffect(() => {
    if (!payTrade) return
    const timer = window.setInterval(() => {
      postTraining({ action: 'payQuery', outTradeNo: payTrade })
        .then((res) => {
          if (!res.paid) return
          window.clearInterval(timer)
          setPayTrade('')
          setPayQr('')
          setPayOpen(null)
          return load()
        })
        .catch(() => {})
    }, 2500)
    return () => window.clearInterval(timer)
  }, [payTrade])

  const shown = courses.filter((c) => mode === 'all' || c.mode === mode)
  function publishGate() {
    if (lecturerStatus !== 'approved') return '请先申请讲师并通过审核'
    if (!depositPaid) return '请先到我的钱包缴纳保证金'
    return ''
  }
  const pickerCities = cityTarget === 'course' ? courseCities : selectedCities
  const pickerNational = cityTarget === 'course' ? courseNational : cityNational
  const cityUi = useMemo(
    () => initModalState(cityKeyword, cityProvince, pickerCities),
    [cityKeyword, cityProvince, pickerCities],
  )
  const cityLabel = lecturerCityText(cityNational, selectedCities) || '请选择城市'
  const courseCityLabel = lecturerCityText(courseNational, courseCities) || '请选择城市'

  function applyCourseCity(national: boolean, cities: string[]) {
    setCourseNational(national)
    setCourseCities(cities)
    setPostCity(lecturerCityText(national, cities))
  }

  function openCourseCity() {
    setCityTarget('course')
    setCityKeyword('')
    setCityOpen(true)
  }

  async function startScanPay() {
    if (!payOpen || !me?.accountId) {
      setSheetErr('请先登录')
      return
    }
    setPayBusy(true)
    setSheetErr('')
    try {
      const res = await postTraining({
        action: 'prepay',
        purpose: payOpen.purpose,
        channel: payChannel,
        scene: 'native',
        hostId: me.accountId,
        courseId: payOpen.courseId,
        name: answers.name || payOpen.name,
        contact: answers.phone || '',
        answers,
      })
      setPayQr(String(res.qrDataUrl || ''))
      setPayTrade(String(res.outTradeNo || ''))
      if (!res.qrDataUrl) setSheetErr('没有拿到付款码')
    } catch (ex) {
      setSheetErr(ex instanceof Error ? ex.message : '支付下单失败')
    } finally {
      setPayBusy(false)
    }
  }

  function openCreate() {
    const reason = publishGate()
    if (reason) {
      setErr(reason)
      if (lecturerStatus !== 'approved') setPanel('apply')
      else navigate('/profile/wallet')
      return
    }
    setEditingId('')
    setTitle('')
    setFee('')
    setPostMode('online')
    setPostCity('')
    setCourseNational(false)
    setCourseCities([])
    setWhenText('')
    setWhenStartDate('')
    setWhenEndDate('')
    setWhenStartTime('14:00')
    setWhenEndTime('16:00')
    setSeats('20')
    setNote('')
    setPoster('')
    setSignupFields(DEFAULT_FIELDS.map((field) => ({ ...field })))
    setFieldDraft('')
    setErr('')
    setSheetErr('')
    setEditorOpen(true)
  }

  function openEdit(course: Course) {
    setEditingId(course.id)
    setTitle(course.title || '')
    setFee(course.fee || '')
    setPostMode(course.mode === 'offline' ? 'offline' : 'online')
    const parsedCity = parseLecturerCities(course.city || '')
    setPostCity(lecturerCityText(parsedCity.national, parsedCity.cities))
    setCourseNational(parsedCity.national)
    setCourseCities(parsedCity.cities)
    const parsedWhen = parseWhen(course.whenText || '')
    setWhenStartDate(parsedWhen.startDate)
    setWhenEndDate(parsedWhen.endDate)
    setWhenStartTime(parsedWhen.startTime)
    setWhenEndTime(parsedWhen.endTime)
    setWhenText(formatWhen(parsedWhen.startDate, parsedWhen.endDate, parsedWhen.startTime, parsedWhen.endTime))
    setSeats(String(course.seats || 20))
    setNote(course.note || '')
    setPoster(course.poster || '')
    setSignupFields(fieldsOf(course.signupFields))
    setFieldDraft('')
    setErr('')
    setSheetErr('')
    setEditorOpen(true)
  }
  const applyLabel =
    lecturerStatus === 'approved' ? '讲师已通过' : lecturerStatus === 'pending' ? '讲师审核中' : lecturerStatus === 'rejected' ? '重新申请讲师' : '申请讲师'

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-900">培训课程</h1>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setErr('')
                setPanel('apply')
              }}
            >
              {applyLabel}
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          课时费由平台代收，不提供提现。提交完成证明后进入 T+1 应付款。个人预扣个税，企业凭发票打款。
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
      {err && !editorOpen && !panel && !payOpen ? <p className="text-sm text-red-600">{err}</p> : null}
      <div className="space-y-3">
        {shown.map((c) => (
          <article id={`train-${c.id}`} key={c.id} className={`rounded-2xl border bg-white p-4 ${focusCourseId === c.id ? 'border-violet-400 ring-2 ring-violet-200' : 'border-slate-200'}`}>
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
                setAnswers({})
                setSheetErr('')
                setPayQr('')
                setPayTrade('')
                setPayOpen({ purpose: 'course', courseId: c.id, name: '', title: c.title, fields: fieldsOf(c.signupFields) })
              }}
            >
              扫码支付报名
            </button>
          </article>
        ))}
        {!shown.length ? <p className="text-sm text-slate-400">还没有课程</p> : null}
      </div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">我发布的</h2>
            <p className="mt-1 text-sm text-slate-500">查看已提交的课程。新增或修改后都会重新进入审核。</p>
          </div>
          <button type="button" className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white" onClick={openCreate}>
            新增培训
          </button>
        </div>
        {publishGate() ? <p className="mt-3 text-xs text-slate-500">{publishGate()}</p> : null}
        <div className="mt-4 space-y-3">
          {mine.map((c) => (
            <article key={c.id} className="flex gap-3 rounded-2xl bg-slate-50 p-3">
              {c.poster ? (
                <img src={c.poster} alt="" className="h-24 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs text-violet-700">海报</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{c.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${c.reviewStatus === 'rejected' ? 'bg-red-50 text-red-700' : c.reviewStatus === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                    {c.reviewStatus === 'rejected' ? '未通过' : c.reviewStatus === 'pending' ? '审核中' : '已通过'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {c.mode === 'offline' ? '线下' : '线上'}
                  {c.city ? ` · ${c.city}` : ''}
                  {c.whenText ? ` · ${c.whenText}` : ''} · ¥{c.fee || '0'} · {c.signupCount || 0}/{c.seats} 人
                </p>
                {c.reviewStatus === 'rejected' && c.reviewNote ? <p className="mt-1 text-xs text-red-600">{c.reviewNote}</p> : null}
                <button type="button" className="mt-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-violet-700" onClick={() => openEdit(c)}>
                  编辑
                </button>
              </div>
            </article>
          ))}
          {!mine.length ? <p className="py-6 text-center text-sm text-slate-400">还没有发布培训</p> : null}
        </div>
      </section>
      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => setEditorOpen(false)}>
          <form
            className="flex max-h-[min(94vh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              const reason = publishGate()
              if (reason) {
                setErr(reason)
                return
              }
              if (!title.trim()) {
                setSheetErr('请填写课程名称')
                return
              }
              if (!poster.startsWith('data:image/')) {
                setSheetErr('请上传宣传海报')
                return
              }
              if (!postCity.trim()) {
                setSheetErr('请选择城市')
                return
              }
              if (!whenStartDate || !whenEndDate) {
                setSheetErr('请选择上课日期')
                return
              }
              if (whenEndDate < whenStartDate) {
                setSheetErr('结束日期不能早于开始日期')
                return
              }
              if (!whenStartTime || !whenEndTime || whenEndTime <= whenStartTime) {
                setSheetErr('请设置每天的起止时间')
                return
              }
              setErr('')
              setSheetErr('')
              postTraining({
                action: editingId ? 'update' : 'create',
                id: editingId,
                title: title.trim(),
                fee,
                mode: postMode,
                city: postCity.trim(),
                whenText: formatWhen(whenStartDate, whenEndDate, whenStartTime, whenEndTime),
                seats: Number(seats) || 1,
                note: note.trim(),
                poster,
                signupFields,
                hostId: me?.accountId || '',
                hostName: me?.wxNickName || me?.loginName || '达人',
                hostRole: me?.activeRole || 'talent',
              })
                .then(() => {
                  setEditorOpen(false)
                  setErr(editingId ? '已保存，重新进入审核' : '已提交审核，通过后会出现在首页广告栏')
                  return load()
                })
                .catch((ex) => setSheetErr(ex instanceof Error ? ex.message : '提交失败'))
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold tracking-wide text-violet-600">本地生活培训</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{editingId ? '编辑培训' : '新增培训'}</h2>
                <p className="mt-1 text-sm text-slate-500">保存后重新审核。通过前不会出现在首页广告栏。</p>
              </div>
              <button type="button" className="rounded-full px-2 text-xl leading-none text-slate-400" onClick={() => setEditorOpen(false)} aria-label="关闭">×</button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <section>
                <h3 className="text-sm font-semibold text-slate-900">宣传海报</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">小程序和星选用同一张海报。建议按 16:9 出图（1500×840），课程名放正中。星选首页按 16:9 完整显示；小程序首页广告栏更扁，大约 3:1；详情头图接近 16:9；两边「我发布的」是竖图，会裁掉左右。</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <figure className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="rounded-lg bg-white p-1.5 shadow-sm">
                      <div className="h-1.5 w-8 rounded bg-slate-200" />
                      <div className="mt-1 h-2 rounded bg-slate-100" />
                      <div className="relative mt-1 h-7 overflow-hidden rounded bg-violet-200">
                        <span className="absolute inset-x-1 bottom-0.5 text-[8px] font-semibold text-violet-900">课程名</span>
                      </div>
                      <div className="mt-1 h-6 rounded bg-slate-100" />
                    </div>
                    <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-600">小程序首页，搜索框下的广告栏。扁横幅，底部压课程名。</figcaption>
                  </figure>
                  <figure className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="rounded-lg bg-white p-1.5 shadow-sm">
                      <div className="h-10 rounded bg-violet-200" />
                      <div className="mt-1 h-1.5 w-12 rounded bg-slate-200" />
                      <div className="mt-1 h-1.5 w-8 rounded bg-slate-100" />
                    </div>
                    <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-600">小程序培训列表封面，点进详情后是更高的头图。</figcaption>
                  </figure>
                  <figure className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <div className="rounded-lg bg-white p-1.5 shadow-sm">
                      <div className="h-6 rounded bg-violet-200" />
                      <div className="mt-1.5 flex gap-1">
                        <div className="h-8 w-5 shrink-0 rounded bg-violet-300" />
                        <div className="min-w-0 flex-1">
                          <div className="h-1.5 w-full rounded bg-slate-200" />
                          <div className="mt-1 h-1.5 w-8 rounded bg-slate-100" />
                        </div>
                      </div>
                    </div>
                    <figcaption className="mt-1.5 text-[11px] leading-snug text-slate-600">星选首页按 16:9 完整显示这张海报。我发布的列表是左侧竖向小图。</figcaption>
                  </figure>
                </div>
                <label className="relative mt-3 flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border border-dashed border-violet-200 bg-violet-50/50">
                  {poster ? <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  <span className={`relative text-sm font-medium ${poster ? 'rounded-full bg-slate-900/70 px-3 py-1 text-white' : 'text-slate-700'}`}>{poster ? '更换海报' : '上传海报'}</span>
                  <input className="sr-only" type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    compressImageFile(file).then((url) => setPoster(url)).catch((ex) => setSheetErr(ex instanceof Error ? ex.message : '海报处理失败'))
                  }} />
                </label>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">课程信息</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-500 sm:col-span-2">课程名称
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" placeholder="如：宁波探店口播训练营" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-slate-500">形式</p>
                    <div className="mt-1 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                      <button type="button" className={`rounded-xl py-2 text-sm ${postMode === 'online' ? 'bg-white font-semibold text-violet-700 shadow-sm' : 'text-slate-500'}`} onClick={() => setPostMode('online')}>线上</button>
                      <button type="button" className={`rounded-xl py-2 text-sm ${postMode === 'offline' ? 'bg-white font-semibold text-violet-700 shadow-sm' : 'text-slate-500'}`} onClick={() => setPostMode('offline')}>线下</button>
                    </div>
                  </div>
                  <div className="block text-xs font-medium text-slate-500">城市
                    <button type="button" className={`mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm ${courseCityLabel === '请选择城市' ? 'text-slate-400' : 'text-slate-900'}`} onClick={openCourseCity}>
                      {courseCityLabel}
                    </button>
                  </div>
                  <div className="block text-xs font-medium text-slate-500 sm:col-span-2">上课日期
                    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" type="date" value={whenStartDate} onChange={(e) => {
                        const next = e.target.value
                        setWhenStartDate(next)
                        if (whenEndDate && whenEndDate < next) setWhenEndDate(next)
                      }} />
                      <span className="text-sm text-slate-400">至</span>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" type="date" min={whenStartDate || undefined} value={whenEndDate} onChange={(e) => setWhenEndDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="block text-xs font-medium text-slate-500 sm:col-span-2">每天时段
                    <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" type="time" value={whenStartTime} onChange={(e) => setWhenStartTime(e.target.value)} />
                      <span className="text-sm text-slate-400">至</span>
                      <input className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" type="time" value={whenEndTime} onChange={(e) => setWhenEndTime(e.target.value)} />
                    </div>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">费用与名额</h3>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-medium text-slate-500">课时费（元）
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" placeholder="平台代收" value={fee} onChange={(e) => setFee(e.target.value)} />
                  </label>
                  <label className="block text-xs font-medium text-slate-500">名额
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" value={seats} onChange={(e) => setSeats(e.target.value)} />
                  </label>
                  <label className="block text-xs font-medium text-slate-500 sm:col-span-2">课程说明
                    <textarea className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" rows={3} placeholder="这门课解决什么接单问题" value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                </div>
              </section>
              <section>
                <h3 className="text-sm font-semibold text-slate-900">报名字段</h3>
                <p className="mt-1 text-xs text-slate-500">学员填完这些资料后才能支付。姓名必填，身份证和手机号可以关掉，也可以再加自定义项。</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DEFAULT_FIELDS.map((preset) => {
                    const on = signupFields.some((field) => field.key === preset.key)
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'} ${preset.kind === 'name' ? 'cursor-default' : ''}`}
                        onClick={() => {
                          if (preset.kind === 'name') return
                          setSignupFields((prev) => (prev.some((field) => field.key === preset.key) ? prev.filter((field) => field.key !== preset.key) : prev.concat(preset)))
                        }}
                      >
                        {preset.label}{preset.kind === 'name' ? ' · 必填' : on ? ' · 已选' : ''}
                      </button>
                    )
                  })}
                  {signupFields.filter((field) => field.kind === 'text').map((field) => (
                    <button key={field.key} type="button" className="rounded-full bg-violet-50 px-3 py-1.5 text-sm text-violet-700" onClick={() => setSignupFields((prev) => prev.filter((item) => item.key !== field.key))}>
                      {field.label} ×
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400" placeholder="自定义字段，如微信号" value={fieldDraft} onChange={(e) => setFieldDraft(e.target.value)} />
                  <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white" onClick={() => {
                    const label = fieldDraft.trim()
                    if (!label || signupFields.length >= 8 || signupFields.some((field) => field.label === label)) return
                    setSignupFields((prev) => prev.concat({ key: `c${Date.now()}`, label, kind: 'text' }))
                    setFieldDraft('')
                  }}>添加</button>
                </div>
              </section>
            </div>
            <div className="border-t border-slate-100 px-6 py-4">
              {sheetErr ? <p className="mb-3 text-sm text-red-600">{sheetErr}</p> : null}
              <div className="flex gap-2">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600" onClick={() => setEditorOpen(false)}>取消</button>
              <button type="submit" className="flex-1 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white">{editingId ? '保存并重新审核' : '提交审核'}</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
      {panel ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => setPanel('')}>
          <form
            className="flex max-h-[min(94vh,880px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault()
              if (!me?.accountId) {
                setErr('请先登录')
                return
              }
              if (panel === 'apply') {
                if (!advanced) {
                  setErr('请先开通专业版、旗舰版或企业版')
                  return
                }
                if (!depositPaid) {
                  setPanel('')
                  navigate('/profile/wallet')
                  return
                }
                const cityValue = lecturerCityText(cityNational, selectedCities)
                if (!cityValue || !intro.trim()) {
                  setErr('请选择常驻城市并填写讲师介绍')
                  return
                }
                setSaving(true)
                setErr('')
                postTraining({
                  action: 'applyLecturer',
                  hostId: me.accountId,
                  city: cityValue,
                  platforms: platformPicks.join('、'),
                  avatar,
                  skills: skills.trim(),
                  years: years.trim(),
                  intro: intro.trim(),
                })
                  .then(() => {
                    setLecturerStatus('pending')
                    setPanel('')
                  })
                  .catch((ex) => setErr(ex instanceof Error ? ex.message : '申请失败'))
                  .finally(() => setSaving(false))
                return
              }
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold tracking-wide text-violet-600">本地生活讲师</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">申请讲师</h2>
                <p className="mt-1 text-sm text-slate-500">先写你在哪座城市、出镜什么平台、带过哪些到店内容。审核通过后即可发布培训。收款账户在我的钱包绑定。</p>
              </div>
              <button type="button" className="rounded-full px-2 text-xl leading-none text-slate-400 hover:text-slate-700" onClick={() => setPanel('')} aria-label="关闭">
                ×
              </button>
            </div>
            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              {panel === 'apply' ? (
              <section className="rounded-2xl bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">申请条件</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">这里只填写讲师资料。保证金 ¥{DEPOSIT} 到我的钱包缴纳。个人按月预扣个税，当月不超过 800 元不预扣。</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${advanced ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    高级会员{advanced ? '已开通' : '未开通'}
                  </span>
                </div>
                {!advanced ? (
                  <Link to="/profile/membership" className="mt-3 inline-block text-sm font-semibold text-violet-700">
                    去开通会员
                  </Link>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-slate-700">
                  <span>{depositPaid ? `保证金 ¥${DEPOSIT} 已缴纳` : `保证金 ¥${DEPOSIT} 未缴纳`}</span>
                  {depositPaid ? null : (
                    <Link to="/profile/wallet" className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white" onClick={() => setPanel('')}>
                      去钱包缴纳
                    </Link>
                  )}
                </div>
              </section>
              ) : null}

              {panel === 'apply' ? (
              <section>
                <h3 className="text-sm font-semibold text-slate-900">头像或照片</h3>
                <p className="mt-1 text-xs text-slate-500">用一张能看出是你的近照。</p>
                <label className="relative mt-3 flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-violet-200 bg-violet-50/50">
                  {avatar ? <img src={avatar} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="text-sm text-violet-700">上传</span>}
                  <input className="sr-only" type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    compressImageFile(file).then(setAvatar).catch((ex) => setErr(ex instanceof Error ? ex.message : '照片处理失败'))
                  }} />
                </label>
              </section>
              ) : null}

              {panel === 'apply' ? (
              <section>
                <h3 className="text-sm font-semibold text-slate-900">讲师介绍</h3>
                <p className="mt-1 text-xs text-slate-500">写给本地生活达人：常驻城市、出镜平台、带过的到店内容。</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="block text-xs font-medium text-slate-500">
                    常驻城市
                    <button type="button" className={`mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm ${cityLabel === '请选择城市' ? 'text-slate-400' : 'text-slate-900'}`} onClick={() => { setCityTarget('lecturer'); setCityOpen(true) }}>
                      {cityLabel}
                    </button>
                  </div>
                  <label className="block text-xs font-medium text-slate-500">
                    本地生活经验
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" placeholder="如：3 年" value={years} onChange={(e) => setYears(e.target.value)} />
                  </label>
                  <div className="text-xs font-medium text-slate-500 sm:col-span-2">
                    出镜平台
                    <div className="mt-1 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                      <button type="button" className={`rounded-xl py-2 text-sm ${platformMode === 'single' ? 'bg-white font-semibold text-violet-700 shadow-sm' : 'text-slate-500'}`} onClick={() => { setPlatformMode('single'); setPlatformPicks((prev) => prev.slice(0, 1)) }}>单选</button>
                      <button type="button" className={`rounded-xl py-2 text-sm ${platformMode === 'multi' ? 'bg-white font-semibold text-violet-700 shadow-sm' : 'text-slate-500'}`} onClick={() => setPlatformMode('multi')}>多选</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {LECTURER_PLATFORMS.map((name) => {
                        const on = platformPicks.includes(name)
                        return (
                          <button
                            key={name}
                            type="button"
                            className={`rounded-full px-3 py-1.5 text-sm ${on ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                            onClick={() => {
                              setPlatformPicks((prev) => {
                                if (platformMode === 'single') return prev.length === 1 && prev[0] === name ? [] : [name]
                                return prev.includes(name) ? prev.filter((x) => x !== name) : prev.concat(name)
                              })
                            }}
                          >
                            {name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <label className="block text-xs font-medium text-slate-500">
                    擅长内容
                    <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" placeholder="探店、团购带货、到店直播" value={skills} onChange={(e) => setSkills(e.target.value)} />
                  </label>
                  <label className="block text-xs font-medium text-slate-500 sm:col-span-2">
                    介绍
                    <textarea className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400 focus:bg-white" rows={3} placeholder="带过哪些品类、商圈或门店，这门课解决什么接单问题" value={intro} onChange={(e) => setIntro(e.target.value)} />
                  </label>
                </div>
              </section>
              ) : null}

              {err ? <p className="text-sm text-red-600">{err}</p> : null}
            </div>
            <div className="flex gap-2 border-t border-slate-100 bg-white px-6 py-4">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600" onClick={() => setPanel('')}>
                取消
              </button>
              <button type="submit" disabled={saving || (panel === 'apply' && lecturerStatus === 'approved')} className="flex-1 rounded-xl bg-violet-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {saving ? '提交中…' : lecturerStatus === 'approved' ? '已通过' : lecturerStatus === 'pending' ? '更新申请' : '提交申请'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {cityOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-6" onClick={() => setCityOpen(false)}>
          <div className="flex max-h-[86vh] w-full max-w-lg flex-col rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">选择城市</h3>
              <button type="button" className="text-xl text-slate-400" onClick={() => setCityOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">可多选城市；选「全国」则不限地域</p>
            <button type="button" className={`mt-3 w-full rounded-xl py-2 text-sm font-semibold ${pickerNational ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'}`} onClick={() => {
              if (cityTarget === 'course') applyCourseCity(true, [])
              else { setCityNational(true); setSelectedCities([]); setCity('全国') }
            }}>全国</button>
            <input className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-violet-400" placeholder="搜索省、市" value={cityKeyword} onChange={(e) => setCityKeyword(e.target.value)} />
            <div className="mt-3 grid h-64 grid-cols-2 overflow-hidden rounded-2xl bg-slate-50">
              <div className="overflow-auto">
                {cityUi.provinceRows.map((p) => (
                  <button key={p.name} type="button" className={`block w-full px-3 py-2.5 text-left text-sm ${p.active ? 'bg-white font-semibold text-violet-700' : 'text-slate-600'}`} onClick={() => setCityProvince(p.name)}>{p.name}</button>
                ))}
              </div>
              <div className="overflow-auto bg-white">
                {cityUi.cityCheckGrid.map((c) => (
                  <button key={c.name} type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm" onClick={() => {
                    const next = pickerCities.includes(c.name) ? pickerCities.filter((x) => x !== c.name) : pickerCities.concat(c.name)
                    if (cityTarget === 'course') applyCourseCity(false, next)
                    else { setCityNational(false); setSelectedCities(next); setCity(next.join('、')) }
                  }}>
                    <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] text-white ${c.on ? 'border-violet-600 bg-violet-600' : 'border-slate-300'}`}>{c.on ? '✓' : ''}</span>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            {pickerCities.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {pickerCities.map((name) => (
                  <button key={name} type="button" className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700" onClick={() => {
                    const next = pickerCities.filter((x) => x !== name)
                    if (cityTarget === 'course') applyCourseCity(false, next)
                    else { setSelectedCities(next); setCity(next.join('、')); setCityNational(false) }
                  }}>{name} ×</button>
                ))}
              </div>
            ) : null}
            <button type="button" className="mt-4 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white" onClick={() => setCityOpen(false)}>确认</button>
          </div>
        </div>
      ) : null}
      {payOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => { setPayOpen(null); setPayTrade(''); setPayQr('') }}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">{payOpen.purpose === 'course' ? '填写报名信息' : payOpen.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{payOpen.purpose === 'course' ? '资料填完后才能支付报名费。支付成功后自动入账。' : '用微信、支付宝或抖音扫码支付。'}</p>
            {payOpen.purpose === 'course' ? (
              <div className="mt-4 space-y-3">
                {payOpen.fields.map((field) => (
                  <label key={field.key} className="block text-xs font-medium text-slate-500">
                    {field.label}
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400"
                      value={answers[field.key] || ''}
                      placeholder={field.kind === 'idNo' ? '18 位身份证号' : field.kind === 'phone' ? '11 位手机号' : ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [field.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                ['wechat', '微信'],
                ['alipay', '支付宝'],
                ['douyin', '抖音'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={payChannel === id ? 'rounded-xl bg-violet-600 py-2 text-sm font-semibold text-white' : 'rounded-xl bg-slate-100 py-2 text-sm text-slate-600'}
                  onClick={() => { setPayChannel(id); setPayQr(''); setPayTrade('') }}
                >
                  {label}
                </button>
              ))}
            </div>
            {payQr ? <img src={payQr} alt="付款码" className="mx-auto mt-4 h-56 w-56" /> : null}
            {sheetErr ? <p className="mt-3 text-sm text-red-600">{sheetErr}</p> : null}
            <button type="button" disabled={payBusy} className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => {
              if (payOpen.purpose === 'course') {
                const reason = answersError(payOpen.fields, answers)
                if (reason) {
                  setSheetErr(reason)
                  return
                }
              }
              setSheetErr('')
              void startScanPay()
            }}>
              {payBusy ? '正在生成付款码' : payQr ? '重新生成付款码' : '生成付款码'}
            </button>
            {payTrade ? <p className="mt-2 text-center text-xs text-slate-400">等待支付结果</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
