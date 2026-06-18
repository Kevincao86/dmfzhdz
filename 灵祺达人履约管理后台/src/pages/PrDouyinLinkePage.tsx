import { useCallback, useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import DouyinBindGuide from '@merchant/pages/settings/DouyinBindGuide'
import { getActiveRole } from '../../lib/mpSession'
import { postPrDouyinBind } from '../../lib/mpSync/prDouyinLinkeApi'
import {
  deletePrDouyinLinkeClient,
  hasPrDouyinLinkeServiceProvider,
  listPrDouyinLinkeClients,
  readPrDouyinLinkeBindings,
  upsertPrDouyinLinkeClient,
  upsertPrDouyinServiceProvider,
  writePrDouyinLinkeBindings,
} from '../../lib/mpSync/prDouyinLinkeStore'
import { PR_DOUYIN_LINKE_COPY } from '../../lib/mpSync/prDouyinLinkeTypes'
import PageHero from '../ui/PageHero'

function newClientId() {
  return `pr-lk-${Date.now().toString(36)}`
}

export default function PrDouyinLinkePage() {
  if (getActiveRole() !== 'pr') return <Navigate to="/profile" replace />

  const [bindings, setBindings] = useState(readPrDouyinLinkeBindings)
  const [spModal, setSpModal] = useState(false)
  const [clientModal, setClientModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')

  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [spMerchantId, setSpMerchantId] = useState('')

  const [clientLabel, setClientLabel] = useState('')
  const [clientMerchantId, setClientMerchantId] = useState('')
  const [clientToken, setClientToken] = useState('')
  const [clientAppId, setClientAppId] = useState('')

  const reload = useCallback(() => setBindings(readPrDouyinLinkeBindings()), [])

  useEffect(() => {
    reload()
  }, [reload])

  async function onBindServiceProvider() {
    if (!appId.trim() || !appSecret.trim() || !spMerchantId.trim()) {
      setMsg('请填写 AppID、App Secret 与服务商账户 ID')
      return
    }
    setSubmitting(true)
    setMsg('')
    try {
      const r = await postPrDouyinBind({
        appId: appId.trim(),
        appSecret: appSecret.trim(),
        merchantId: spMerchantId.trim(),
      })
      if (!r.ok) {
        setMsg(r.message)
        return
      }
      upsertPrDouyinServiceProvider({
        appId: appId.trim(),
        merchantAccountId: spMerchantId.trim(),
        accountDisplayName: r.accountName || '林客服务商',
        sealedToken: r.accessToken,
        updatedAt: new Date().toISOString(),
      })
      setSpModal(false)
      setAppSecret('')
      reload()
      setMsg('服务商应用绑定成功')
    } finally {
      setSubmitting(false)
    }
  }

  async function onAddClient() {
    if (!hasPrDouyinLinkeServiceProvider()) {
      setMsg('请先完成「服务商平台」林客应用绑定')
      return
    }
    if (!clientMerchantId.trim() || !clientToken.trim()) {
      setMsg('请填写客户商家账号 ID 与授权 Token')
      return
    }
    setSubmitting(true)
    setMsg('')
    try {
      upsertPrDouyinLinkeClient({
        id: newClientId(),
        merchantAccountId: clientMerchantId.trim(),
        accountDisplayName: clientLabel.trim() || clientMerchantId.trim(),
        clientLabel: clientLabel.trim() || undefined,
        clientKey: clientAppId.trim() || undefined,
        sealedToken: clientToken.trim(),
        updatedAt: new Date().toISOString(),
      })
      setClientModal(false)
      setClientLabel('')
      setClientMerchantId('')
      setClientToken('')
      setClientAppId('')
      reload()
      setMsg('客户商家已添加')
    } finally {
      setSubmitting(false)
    }
  }

  function onRemoveClient(id: string) {
    if (!confirm('确定删除该客户商家绑定？')) return
    deletePrDouyinLinkeClient(id)
    reload()
  }

  function onClearServiceProvider() {
    if (!confirm('确定解除林客服务商绑定？客户商家列表将一并清除。')) return
    writePrDouyinLinkeBindings({ serviceProvider: null, clients: [] })
    reload()
  }

  const sp = bindings.serviceProvider
  const clients = listPrDouyinLinkeClients()

  return (
    <div className="page-content-shell page-content-shell--narrow space-y-6">
      <PageHero title="抖音林客授权" subtitle="非必填 · 流程与服务商版一致，发单时可挂接林客商家" />

      {msg ? <p className="text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">{msg}</p> : null}

      <section className="surface-card rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">{PR_DOUYIN_LINKE_COPY.sectionTitle}</h2>
        <p className="text-sm text-[var(--shell-muted)]">{PR_DOUYIN_LINKE_COPY.sectionIntro}</p>
        {sp ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-sm">
            <p className="font-medium text-emerald-900">
              已绑定 · {sp.accountDisplayName || sp.merchantAccountId}
            </p>
            <p className="text-emerald-800/80 text-xs mt-1">服务商账户 ID：{sp.merchantAccountId}</p>
            <button type="button" className="text-xs text-red-600 mt-2 underline" onClick={onClearServiceProvider}>
              解除绑定
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm"
            onClick={() => setSpModal(true)}
          >
            {PR_DOUYIN_LINKE_COPY.bindButton}
          </button>
        )}
      </section>

      <section className="surface-card rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">客户商家</h2>
        <p className="text-sm text-[var(--shell-muted)]">
          添加代运营客户商家后，发招募单时可搜索选择商家名称（商家 ID）。
        </p>
        <button
          type="button"
          className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50"
          disabled={!sp}
          onClick={() => setClientModal(true)}
        >
          {PR_DOUYIN_LINKE_COPY.addClientButton}
        </button>
        {!sp ? (
          <p className="text-xs text-amber-700">请先完成上方服务商应用绑定</p>
        ) : null}
        <ul className="divide-y border rounded-lg">
          {clients.map((c) => (
            <li key={c.id} className="px-3 py-3 flex justify-between gap-2 items-start">
              <div>
                <p className="font-medium text-sm">{c.accountDisplayName || c.clientLabel}</p>
                <p className="text-xs text-[var(--shell-muted)]">商家 ID {c.merchantAccountId}</p>
              </div>
              <button
                type="button"
                className="text-xs text-red-600 shrink-0"
                onClick={() => onRemoveClient(c.id)}
              >
                删除
              </button>
            </li>
          ))}
          {!clients.length ? (
            <li className="px-3 py-6 text-center text-sm text-[var(--shell-muted)]">暂无客户商家</li>
          ) : null}
        </ul>
      </section>

      <section className="surface-card rounded-xl border p-5">
        <h2 className="font-semibold mb-3">{PR_DOUYIN_LINKE_COPY.guideTitle}</h2>
        <DouyinBindGuide compact />
        <p className="text-xs text-[var(--shell-muted)] mt-3">
          截图步骤与服务商版相同；PR 端绑定后凭证仅保存在本账号，用于发单挂接林客与定向招募同步。
        </p>
      </section>

      <p className="text-sm">
        <Link to="/profile" className="text-violet-600 underline">
          返回我的
        </Link>
      </p>

      {spModal ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <h3 className="font-bold">{PR_DOUYIN_LINKE_COPY.bindButton}</h3>
            <label className="block text-sm">
              AppID
              <input className="w-full border rounded-lg px-3 py-2 mt-1" value={appId} onChange={(e) => setAppId(e.target.value)} />
            </label>
            <label className="block text-sm">
              App Secret
              <input
                type="password"
                className="w-full border rounded-lg px-3 py-2 mt-1"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              {PR_DOUYIN_LINKE_COPY.merchantIdLabel}
              <input
                className="w-full border rounded-lg px-3 py-2 mt-1"
                placeholder={PR_DOUYIN_LINKE_COPY.merchantIdPlaceholder}
                value={spMerchantId}
                onChange={(e) => setSpMerchantId(e.target.value)}
              />
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="px-3 py-2 text-sm" onClick={() => setSpModal(false)}>
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
                disabled={submitting}
                onClick={() => void onBindServiceProvider()}
              >
                {submitting ? '绑定中…' : '确认绑定'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clientModal ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3 shadow-xl">
            <h3 className="font-bold">{PR_DOUYIN_LINKE_COPY.addClientButton}</h3>
            <label className="block text-sm">
              客户简称（展示用）
              <input className="w-full border rounded-lg px-3 py-2 mt-1" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} />
            </label>
            <label className="block text-sm">
              {PR_DOUYIN_LINKE_COPY.clientMerchantIdLabel}
              <input
                className="w-full border rounded-lg px-3 py-2 mt-1"
                value={clientMerchantId}
                onChange={(e) => setClientMerchantId(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              授权 Token（sealed / moo1…）
              <textarea
                className="w-full border rounded-lg px-3 py-2 mt-1 font-mono text-xs"
                rows={3}
                value={clientToken}
                onChange={(e) => setClientToken(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              AppID（可选）
              <input className="w-full border rounded-lg px-3 py-2 mt-1" value={clientAppId} onChange={(e) => setClientAppId(e.target.value)} />
            </label>
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="px-3 py-2 text-sm" onClick={() => setClientModal(false)}>
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm disabled:opacity-50"
                disabled={submitting}
                onClick={() => void onAddClient()}
              >
                {submitting ? '保存中…' : '添加'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
