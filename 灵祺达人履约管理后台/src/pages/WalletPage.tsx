import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchRegistryProfile, fetchTraining, postTraining } from '../lib/mpApi'
import { getAccount } from '../lib/mpSession'

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

const ORDER_STATUS: Record<string, string> = {
  escrow: '托管中',
  review: '待核实',
  ready: 'T+1 待打款',
  settled: '已结算',
}

type SettleOrder = {
  id: string
  title: string
  payable: number
  status: string
  settleAt?: string
}

type Quote = {
  count: number
  payable: number
  commission: number
  tax: number
  net: number
  bank: string
  bankTail: string
  hasAccount: boolean
}

type BoundAccount = {
  kind?: string
  name?: string
  bank?: string
  bankNo?: string
  licenseNo?: string
  idNo?: string
  idFront?: string
  idBack?: string
  licenseImage?: string
  lecturerStatus?: string
  city?: string
  intro?: string
}

export default function WalletPage() {
  const me = getAccount()
  const [balance, setBalance] = useState(0)
  const [depositPaid, setDepositPaid] = useState(false)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [account, setAccount] = useState<BoundAccount | null>(null)
  const [bindOpen, setBindOpen] = useState(false)
  const [kind, setKind] = useState<'person' | 'entity'>('person')
  const [holder, setHolder] = useState('')
  const [bankName, setBankName] = useState('')
  const [bankNo, setBankNo] = useState('')
  const [licenseNo, setLicenseNo] = useState('')
  const [idNo, setIdNo] = useState('')
  const [idFront, setIdFront] = useState('')
  const [idBack, setIdBack] = useState('')
  const [licenseImage, setLicenseImage] = useState('')
  const [orders, setOrders] = useState<SettleOrder[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)
  const [payChannel, setPayChannel] = useState<'wechat' | 'alipay' | 'douyin'>('wechat')
  const [payQr, setPayQr] = useState('')
  const [payTrade, setPayTrade] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  async function load() {
    setLoading(true)
    setErr('')
    try {
      const [profile, training] = await Promise.all([
        fetchRegistryProfile().catch(() => null),
        fetchTraining(me?.accountId),
      ])
      const summary = profile?.mpAiPointsSummary
      const points = summary
        ? Math.max(0, Math.floor(Number(summary.balance) || Number(summary.packageRemaining || 0) + Number(summary.rechargeBalance || 0)))
        : Math.max(0, Math.floor(Number(profile?.mpAiPointsBalance) || 0))
      const deposit = training.deposit as { paid?: boolean } | undefined
      const rows = Array.isArray(training.orders) ? (training.orders as SettleOrder[]) : []
      setBalance(points)
      setDepositPaid(!!deposit?.paid)
      setQuote((training.settlement as Quote) || null)
      setAccount((training.profile as BoundAccount) || null)
      setOrders(rows)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!payTrade) return
    const timer = window.setInterval(() => {
      postTraining({ action: 'payQuery', outTradeNo: payTrade })
        .then((res) => {
          if (!res.paid) return
          window.clearInterval(timer)
          setPayTrade('')
          setPayQr('')
          setPayOpen(false)
          return load()
        })
        .catch(() => {})
    }, 2500)
    return () => window.clearInterval(timer)
  }, [payTrade])

  async function refundDeposit() {
    if (!me?.accountId) return
    if (!window.confirm('退回保证金后，讲师变为未认证，不能发布课程。确认退款？')) return
    setBusy('refund')
    setErr('')
    try {
      await postTraining({ action: 'refundDeposit', hostId: me.accountId })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '退款失败')
    } finally {
      setBusy('')
    }
  }

  async function withdraw() {
    if (!me?.accountId) return
    const net = Number(quote?.net || 0).toFixed(2)
    const tax = Number(quote?.tax || 0).toFixed(2)
    const commission = Number(quote?.commission || 0).toFixed(2)
    if (!window.confirm(`提现 ¥${net} 到绑定账户。已扣佣金 ¥${commission}、个税 ¥${tax}。`)) return
    setBusy('withdraw')
    setErr('')
    try {
      await postTraining({ action: 'withdraw', hostId: me.accountId })
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提现失败')
    } finally {
      setBusy('')
    }
  }

  function lecturerApproved(profile: BoundAccount | null) {
    if (!profile) return false
    if (profile.lecturerStatus === 'none' || profile.lecturerStatus === 'pending' || profile.lecturerStatus === 'rejected') return false
    if (profile.lecturerStatus === 'approved') return true
    return !!(profile.intro && profile.city)
  }

  function openBind() {
    setKind(account?.kind === 'entity' ? 'entity' : 'person')
    setHolder(account?.name || '')
    setBankName(account?.bank || '')
    setBankNo(account?.bankNo || '')
    setLicenseNo(account?.licenseNo || '')
    setIdNo(account?.idNo || '')
    setIdFront(account?.idFront || '')
    setIdBack(account?.idBack || '')
    setLicenseImage(account?.licenseImage || '')
    setErr('')
    setBindOpen(true)
  }

  async function onDoc(docKind: 'id_front' | 'id_back' | 'license', file: File) {
    const label = docKind === 'id_front' ? '身份证人像面' : docKind === 'id_back' ? '身份证国徽面' : '营业执照'
    setErr('')
    try {
      const imageDataUrl = await compressImageFile(file)
      if (docKind === 'id_front') setIdFront(imageDataUrl)
      else if (docKind === 'id_back') setIdBack(imageDataUrl)
      else setLicenseImage(imageDataUrl)
      const result = await postTraining({ action: 'ocrDoc', kind: docKind, imageDataUrl })
      const fields = (result.fields || {}) as Record<string, string>
      if (fields.name) setHolder(fields.name)
      if (fields.idNo) setIdNo(fields.idNo)
      if (fields.licenseNo) setLicenseNo(fields.licenseNo)
    } catch (e) {
      setErr(e instanceof Error ? e.message : `${label}识别失败`)
    }
  }

  async function saveAccount() {
    if (!me?.accountId) return
    if (!lecturerApproved(account)) {
      setErr('讲师通过后才能绑定收款账户')
      return
    }
    if (!idFront || !idBack) {
      setErr('请上传身份证人像面和国徽面')
      return
    }
    if (kind === 'entity' && !licenseImage) {
      setErr('请上传营业执照')
      return
    }
    if (!holder.trim() || !bankNo.trim()) {
      setErr('请填写户名和账号')
      return
    }
    if (kind === 'entity' && !licenseNo.trim()) {
      setErr('请填写统一社会信用代码')
      return
    }
    setBusy('bind')
    setErr('')
    try {
      await postTraining({
        action: 'saveProfile',
        hostId: me.accountId,
        kind,
        name: holder.trim(),
        idNo: idNo.trim(),
        bank: bankName.trim(),
        bankNo: bankNo.trim(),
        licenseNo: kind === 'entity' ? licenseNo.trim() : '',
        idFront,
        idBack,
        licenseImage: kind === 'entity' ? licenseImage : '',
      })
      setBindOpen(false)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : '保存失败')
    } finally {
      setBusy('')
    }
  }

  async function startScanPay() {
    if (!me?.accountId) {
      setErr('请先登录')
      return
    }
    setPayBusy(true)
    setErr('')
    try {
      const res = await postTraining({
        action: 'prepay',
        purpose: 'deposit',
        channel: payChannel,
        scene: 'native',
        hostId: me.accountId,
      })
      setPayQr(String(res.qrDataUrl || ''))
      setPayTrade(String(res.outTradeNo || ''))
      if (!res.qrDataUrl) setErr('没有拿到付款码')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '支付下单失败')
    } finally {
      setPayBusy(false)
    }
  }

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-4">
      <div>
        <Link to="/profile" className="text-sm text-[var(--shell-muted)] hover:text-[var(--shell-text)]">
          ← 返回我的
        </Link>
        <h1 className="mt-2 text-xl font-bold text-[var(--shell-text)]">我的钱包</h1>
        <p className="mt-1 text-sm text-[var(--shell-muted)]">积分、培训保证金和课时费。退保证金后讲师变为未认证，不能发布课程。</p>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">积分</h2>
            <p className="mt-1 text-2xl font-bold text-violet-700">{loading ? '…' : balance.toLocaleString('zh-CN')}</p>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">用于视频、文稿检核和 Brief 生成</p>
          </div>
          <Link to="/profile/points-recharge" className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white">
            去充值
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">培训保证金</h2>
            <p className="mt-1 text-sm text-[var(--shell-text)]">
              {depositPaid ? `¥${DEPOSIT} 已缴纳` : `¥${DEPOSIT} 未缴纳`}
            </p>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">讲师履约保证金，和小程序同一份记录</p>
          </div>
          {depositPaid ? (
            <button type="button" className="rounded-xl border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700" disabled={busy === 'refund'} onClick={() => { void refundDeposit() }}>
              {busy === 'refund' ? '退款中' : '退款'}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setPayQr('')
                setPayTrade('')
                setPayOpen(true)
              }}
            >
              扫码缴纳
            </button>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">收款账户绑定</h2>
            <p className="mt-1 text-sm text-[var(--shell-text)]">
              {account?.name && account?.bankNo ? `已绑定 ${account.bank || '收款账户'} 尾号 ${String(account.bankNo).slice(-4)}` : '未绑定'}
            </p>
          </div>
          <button type="button" className="rounded-xl border border-violet-200 px-3 py-2 text-sm font-semibold text-violet-700" onClick={openBind}>
            {account?.name && account?.bankNo ? '修改' : '去绑定'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--shell-text)]">培训结算</h2>
            <p className="mt-1 text-sm text-[var(--shell-text)]">可提现 ¥{Number(quote?.net || 0).toFixed(2)}</p>
            <p className="mt-1 text-xs text-[var(--shell-muted)]">
              已扣佣金 ¥{Number(quote?.commission || 0).toFixed(2)}，个税 ¥{Number(quote?.tax || 0).toFixed(2)}。提现到绑定的收款账户{quote?.bankTail ? `（尾号 ${quote.bankTail}）` : ''}。
            </p>
          </div>
          <button type="button" className="rounded-xl bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={busy === 'withdraw'} onClick={() => { void withdraw() }}>
            {busy === 'withdraw' ? '提现中' : '提现'}
          </button>
        </div>
        {!orders.length ? <p className="mt-3 text-sm text-[var(--shell-muted)]">还没有报名订单</p> : null}
        <div className="mt-3 space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <p className="font-medium text-[var(--shell-text)]">{order.title}</p>
              <p className="mt-1 text-xs text-[var(--shell-muted)]">
                应付款 ¥{order.payable} · {ORDER_STATUS[order.status] || order.status}
                {order.settleAt ? ` · ${String(order.settleAt).slice(0, 10)}` : ''}
              </p>
            </div>
          ))}
        </div>
      </section>

      <Link to="/profile/my-orders" className="block rounded-2xl border border-[var(--shell-border)] bg-[var(--panel-card)] p-4">
        <h2 className="text-sm font-semibold text-[var(--shell-text)]">支付记录</h2>
        <p className="mt-1 text-xs text-[var(--shell-muted)]">会员开通与积分充值</p>
      </Link>

      {bindOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => setBindOpen(false)}>
          <form
            className="max-h-[min(92vh,760px)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); void saveAccount() }}
          >
            <h2 className="text-lg font-bold text-slate-900">收款账户绑定</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button type="button" className={kind === 'person' ? 'rounded-xl bg-white py-2 text-sm font-semibold text-violet-700' : 'rounded-xl py-2 text-sm text-slate-500'} onClick={() => setKind('person')}>个人</button>
              <button type="button" className={kind === 'entity' ? 'rounded-xl bg-white py-2 text-sm font-semibold text-violet-700' : 'rounded-xl py-2 text-sm text-slate-500'} onClick={() => setKind('entity')}>个体户 / 企业</button>
            </div>
            <div className={`mt-4 grid gap-3 ${kind === 'entity' ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {(
                [
                  ['id_front', '身份证人像面', idFront],
                  ['id_back', '身份证国徽面', idBack],
                  ...(kind === 'entity' ? [['license', '营业执照', licenseImage] as const] : []),
                ] as const
              ).map(([docKind, label, preview]) => (
                <label key={docKind} className="relative flex h-28 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 text-center">
                  {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
                  <span className={`relative px-2 text-xs font-medium ${preview ? 'rounded-full bg-slate-900/70 py-1 text-white' : 'text-slate-700'}`}>{preview ? '更换' : label}</span>
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) void onDoc(docKind, file)
                    }}
                  />
                </label>
              ))}
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-500">
              户名
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" value={holder} onChange={(e) => setHolder(e.target.value)} placeholder={kind === 'person' ? '收款人姓名' : '账户名称'} />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-500">
              开户行
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="开户行" />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-500">
              账号
              <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" value={bankNo} onChange={(e) => setBankNo(e.target.value)} placeholder="收款账号" />
            </label>
            {kind === 'entity' ? (
              <label className="mt-3 block text-xs font-medium text-slate-500">
                统一社会信用代码
                <input className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} placeholder="18 位信用代码" />
              </label>
            ) : null}
            {err && bindOpen ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
            <div className="mt-5 flex gap-2">
              <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600" onClick={() => setBindOpen(false)}>取消</button>
              <button type="submit" disabled={busy === 'bind'} className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy === 'bind' ? '保存中' : '保存账户'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {payOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" onClick={() => { setPayOpen(false); setPayTrade(''); setPayQr('') }}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-900">培训保证金</h2>
            <p className="mt-1 text-sm text-slate-500">用微信、支付宝或抖音扫码支付 ¥{DEPOSIT}。支付成功后和小程序共用同一份记录。</p>
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
            <button type="button" disabled={payBusy} className="mt-4 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60" onClick={() => { void startScanPay() }}>
              {payBusy ? '正在生成付款码' : payQr ? '重新生成付款码' : '生成付款码'}
            </button>
            {payTrade ? <p className="mt-2 text-center text-xs text-slate-400">等待支付结果</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
