import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Share2 } from 'lucide-react'
import { cn } from '../cn'
import LoginPortalNav from '../components/login/LoginPortalNav'
import { isPartnerEdition } from '../lib/appEdition'
import {
  affiliateStatusLabel,
  applyAsAffiliate,
  fetchAffiliateApplyStatus,
  type PublicAffiliateSummary,
} from '../lib/distributionAffiliateApplyClient'

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 11)
}

function validPhone(raw: string): boolean {
  return /^1\d{10}$/.test(normalizePhone(raw))
}

const SHELL = cn(
  'relative w-full max-w-md rounded-[28px] border border-white/80 p-6 sm:p-8',
  'bg-white/55 shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.9)]',
  'backdrop-blur-2xl backdrop-saturate-150',
)

export default function AffiliateApplyPage() {
  const partnerSite = isPartnerEdition()
  const [realName, setRealName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState<PublicAffiliateSummary | null>(null)

  if (partnerSite) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 px-4 text-white">
        <p className="text-center text-sm text-slate-400">
          服务商版仅配置内部分销员，个人推广员申请请前往商家版或星选端。
        </p>
        <Link to="/login" className="mt-4 text-sm text-cyan-400 hover:underline">
          返回登录
        </Link>
      </div>
    )
  }

  async function onCheckStatus() {
    const p = normalizePhone(phone)
    if (!validPhone(p)) {
      setErr('请输入有效大陆手机号后再查询')
      return
    }
    setChecking(true)
    setErr('')
    setInfo('')
    try {
      const r = await fetchAffiliateApplyStatus(p)
      if (!r.ok) throw new Error(r.error || '查询失败')
      setResult(r.affiliate)
      if (!r.affiliate) setInfo('暂无该手机号的申请记录，可填写下方表单提交。')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '查询失败')
    } finally {
      setChecking(false)
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = normalizePhone(phone)
    const name = realName.trim()
    if (!name) {
      setErr('请填写真实姓名')
      return
    }
    if (!validPhone(p)) {
      setErr('请输入有效大陆手机号')
      return
    }
    setLoading(true)
    setErr('')
    setInfo('')
    try {
      const r = await applyAsAffiliate({ realName: name, phone: p, note: note.trim() || undefined })
      if (!r.ok) {
        if (r.error === 'already_active' && r.affiliate) {
          setResult(r.affiliate)
          setInfo('您已是通过审核的推广员。')
          return
        }
        throw new Error(r.error || '提交失败')
      }
      setResult(r.affiliate ?? null)
      setInfo(r.created ? '申请已提交，请等待运营审核。' : '您已有待审核申请，请耐心等待。')
    } catch (e) {
      setErr(e instanceof Error ? e.message : '提交失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] bg-gradient-to-b from-slate-100 via-white to-cyan-50/40 px-4 py-8 text-slate-900">
      <header className="mx-auto mb-8 flex max-w-lg items-center justify-between">
        <LoginPortalNav />
        <Link to="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
          登录
        </Link>
      </header>

      <div className="mx-auto flex max-w-lg flex-col items-center">
        <div className={SHELL}>
          <div className="mb-4 flex items-center gap-2">
            <Share2 className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-bold">申请成为推广员</h1>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            个人推广员可推广灵祺 ERP 商家会员与星选会员，审核通过后将获得专属推广码。实名认证可在首次提现前完成。
          </p>

          {result ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
              <p className="font-medium">当前状态：{affiliateStatusLabel(result.status)}</p>
              {result.refCode ? (
                <p className="mt-1 font-mono text-xs">推广码：{result.refCode}</p>
              ) : null}
              <p className="mt-1 text-emerald-800/80">申请时间：{new Date(result.appliedAt).toLocaleString()}</p>
            </div>
          ) : null}

          {info ? <p className="mt-3 text-sm text-indigo-700">{info}</p> : null}
          {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <label className="block text-sm">
              <span className="text-slate-600">真实姓名</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={realName}
                onChange={(e) => setRealName(e.target.value)}
                placeholder="与后续提现账户一致"
                maxLength={32}
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">手机号</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(normalizePhone(e.target.value))}
                placeholder="11 位大陆手机号"
                inputMode="numeric"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">备注（选填）</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：主要推广 ERP / 星选"
                maxLength={120}
              />
            </label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                提交申请
              </button>
              <button
                type="button"
                disabled={checking}
                onClick={() => void onCheckStatus()}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 disabled:opacity-60"
              >
                {checking ? '查询中…' : '查询进度'}
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            提交即表示同意平台推广合作规则。审核结果可在本页通过手机号查询；通过后推广链接与素材将在后续版本开放。
          </p>
        </div>
      </div>
    </div>
  )
}
