import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { uploadOpsContentImage } from '../opsContentImageApi'
import {
  loadMarketingCampaign,
  markMarketingWithdrawPaid,
  saveMarketingCampaign,
  type MarketingCampaignForm,
  type MarketingGrantRow,
  type MarketingSurface,
  type MarketingWithdrawRow,
} from '../opsMarketingCampaignApi'

function emptyForm(): MarketingCampaignForm {
  return {
    title: '',
    subtitle: '',
    enabled: false,
    amountYuan: '5.00',
    totalQuota: 0,
    grantedCount: 0,
    remaining: 0,
    posterUrl: '',
    rulesText: '',
    withdrawAfterOrders: 5,
    updatedAt: '',
  }
}

export default function OpsMarketingCenterPage() {
  const [params] = useSearchParams()
  const surface: MarketingSurface = params.get('surface') === 'merchant' ? 'merchant_erp' : 'xingxuan'
  const xingxuan = surface === 'xingxuan'
  const [form, setForm] = useState<MarketingCampaignForm>(emptyForm)
  const [grants, setGrants] = useState<MarketingGrantRow[]>([])
  const [withdraws, setWithdraws] = useState<MarketingWithdrawRow[]>([])
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    let stop = false
    setLoading(true)
    setErr('')
    setMsg('')
    void loadMarketingCampaign(surface).then((result) => {
      if (stop) return
      setLoading(false)
      if (!result.ok) {
        setErr(result.error)
        return
      }
      setForm(result.data.campaign)
      setGrants(result.data.grants)
      setWithdraws(result.data.withdraws)
    })
    return () => {
      stop = true
    }
  }, [surface])

  function patch(partial: Partial<MarketingCampaignForm>) {
    setForm((prev) => ({ ...prev, ...partial }))
  }

  async function onUpload(file: File | undefined) {
    if (!file) return
    setUploading(true)
    setErr('')
    const uploaded = await uploadOpsContentImage(file)
    setUploading(false)
    if (!uploaded.ok) {
      setErr(uploaded.error || '海报上传失败')
      return
    }
    patch({ posterUrl: uploaded.imageUrl })
  }

  async function onSave() {
    setSaving(true)
    setErr('')
    setMsg('')
    const result = await saveMarketingCampaign(surface, form)
    setSaving(false)
    if (!result.ok) {
      setErr(result.error)
      return
    }
    setForm(result.data.campaign)
    setGrants(result.data.grants)
    setWithdraws(result.data.withdraws)
    setMsg('已保存')
  }

  async function onPaid(id: string) {
    setErr('')
    const result = await markMarketingWithdrawPaid(surface, id)
    if (!result.ok) {
      setErr(result.error)
      return
    }
    setWithdraws(result.data.withdraws)
    setMsg('已标记打款')
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="ops-page-title text-xl font-semibold">{xingxuan ? '星选平台活动' : '商家ERP活动'}</h1>
        <p className="ops-muted mt-1 text-sm">
          {xingxuan
            ? '现金红包模版。PR 在达人小程序或星选平台完成闭环或开环招募发单后，红包自动进入钱包。大于设定单数才可提现。单价、数量和海报在这里改。'
            : '商家 ERP 使用同一套现金红包模版，价格、数量和海报单独保存。当前自动入账接在星选 PR 发单。'}
        </p>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {loading ? <p className="ops-muted text-sm">加载中…</p> : null}

      {!loading ? (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={form.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            开启活动
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">活动名称</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.title} onChange={(e) => patch({ title: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">副标题</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" value={form.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">单笔红包（元）</span>
              <input className="w-full rounded-lg border border-slate-200 px-3 py-2" inputMode="decimal" value={form.amountYuan} onChange={(e) => patch({ amountYuan: e.target.value })} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">红包数量</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                inputMode="numeric"
                value={String(form.totalQuota)}
                onChange={(e) => patch({ totalQuota: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">大于几单可提现</span>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                inputMode="numeric"
                value={String(form.withdrawAfterOrders)}
                onChange={(e) => patch({ withdrawAfterOrders: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </label>
            <div className="text-sm text-slate-600">
              <p>已发放 {form.grantedCount} 个</p>
              <p className="mt-1">剩余 {form.remaining} 个</p>
              {form.updatedAt ? <p className="mt-1">最近保存 {form.updatedAt}</p> : null}
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">关联海报</span>
            <input className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="https://" value={form.posterUrl} onChange={(e) => patch({ posterUrl: e.target.value })} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {uploading ? '上传中…' : '上传海报'}
              <input className="hidden" type="file" accept="image/*" disabled={uploading} onChange={(e) => void onUpload(e.target.files?.[0])} />
            </label>
            {form.posterUrl ? <img src={form.posterUrl} alt="" className="h-24 rounded-lg border border-slate-200 object-cover" /> : null}
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">规则说明</span>
            <textarea className="min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2" value={form.rulesText} onChange={(e) => patch({ rulesText: e.target.value })} />
          </label>
          <button type="button" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={saving} onClick={() => void onSave()}>
            {saving ? '保存中…' : '保存活动'}
          </button>
        </section>
      ) : null}

      {xingxuan && !loading ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">发放记录</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="p-3">PR</th>
                    <th className="p-3">招募单</th>
                    <th className="p-3">金额</th>
                    <th className="p-3">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {grants.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3">{row.displayName || row.prKey}</td>
                      <td className="p-3">{row.orderId}</td>
                      <td className="p-3">¥{row.amountYuan}</td>
                      <td className="p-3">{row.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!grants.length ? <p className="ops-muted p-6 text-center text-sm">还没有发放</p> : null}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold">提现申请</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-slate-500">
                    <th className="p-3">PR</th>
                    <th className="p-3">金额</th>
                    <th className="p-3">达标单数</th>
                    <th className="p-3">状态</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {withdraws.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="p-3">{row.displayName || row.prKey}</td>
                      <td className="p-3">¥{row.amountYuan}</td>
                      <td className="p-3">{row.qualifyingOrders}</td>
                      <td className="p-3">{row.status === 'paid' ? '已打款' : '待打款'}</td>
                      <td className="p-3">
                        {row.status === 'pending' ? (
                          <button type="button" className="text-violet-700" onClick={() => void onPaid(row.id)}>
                            标记已打款
                          </button>
                        ) : (
                          row.paidAt || ''
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!withdraws.length ? <p className="ops-muted p-6 text-center text-sm">还没有提现</p> : null}
          </section>
        </>
      ) : null}
    </div>
  )
}
