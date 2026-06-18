import { useMemo, useState } from 'react'
import { Link2, Search } from 'lucide-react'
import { listPrDouyinLinkeClients } from '../../lib/mpSync/prDouyinLinkeStore'
import { searchPrDouyinProducts } from '../../lib/mpSync/prDouyinLinkeApi'
import type { PublishLinkeAttach } from '../../lib/mpSync/prDouyinLinkeTypes'
import { emptyPublishLinkeAttach, PR_DOUYIN_LINKE_COPY } from '../../lib/mpSync/prDouyinLinkeTypes'

type Props = {
  value: PublishLinkeAttach
  onChange: (next: PublishLinkeAttach) => void
  platform: string
}

const EMPTY: PublishLinkeAttach = emptyPublishLinkeAttach()

export default function PublishLinkeAttachSection({ value, onChange, platform }: Props) {
  const clients = useMemo(() => listPrDouyinLinkeClients(), [])
  const hasClients = clients.length > 0
  const show = platform === '抖音' || !platform

  const [merchantKw, setMerchantKw] = useState('')
  const [productKw, setProductKw] = useState('')
  const [productHits, setProductHits] = useState<{ id: string; name: string }[]>([])
  const [productSearching, setProductSearching] = useState(false)

  if (!show) return null

  const filteredClients = clients.filter((c) => {
    const kw = merchantKw.trim().toLowerCase()
    if (!kw) return true
    const label = `${c.accountDisplayName} ${c.merchantAccountId} ${c.clientLabel || ''}`.toLowerCase()
    return label.includes(kw)
  })

  const selectedClient = clients.find((c) => c.id === value.clientId)

  async function onSearchProducts() {
    if (!selectedClient) {
      window.alert('请先选择林客客户商家')
      return
    }
    const kw = productKw.trim()
    if (kw.length < 1) {
      window.alert('请输入商品名称关键词')
      return
    }
    setProductSearching(true)
    try {
      const r = await searchPrDouyinProducts(selectedClient, kw)
      if (!r.ok) {
        window.alert(r.message)
        return
      }
      setProductHits(r.hits)
    } finally {
      setProductSearching(false)
    }
  }

  function toggleProduct(id: string) {
    const cur = value.productIds || []
    onChange({
      ...value,
      productIds: cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 20 ? cur : [...cur, id],
    })
  }

  return (
    <section className="surface-card rounded-xl border border-violet-200/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-violet-600" />
        <h3 className="font-semibold text-[var(--shell-text)]">{PR_DOUYIN_LINKE_COPY.publishAttachTitle}</h3>
        <span className="text-xs text-[var(--shell-muted)]">（非必填）</span>
      </div>
      <p className="text-xs text-[var(--shell-muted)]">{PR_DOUYIN_LINKE_COPY.publishAttachHint}</p>

      {!hasClients ? (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          尚未绑定林客客户商家。
          <a href="/profile/linke" className="text-violet-600 underline ml-1">
            去绑定抖音林客
          </a>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={!value.enabled}
                onChange={() => onChange({ ...value, enabled: false })}
              />
              否，不走林客
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={value.enabled}
                onChange={() => onChange({ ...value, enabled: true, merchantPhone: value.merchantPhone || emptyPublishLinkeAttach().merchantPhone })}
              />
              是，挂接林客商家
            </label>
          </div>

          {value.enabled ? (
            <div className="space-y-3 pt-1">
              <div>
                <label className="form-field-label">搜索并选择客户商家</label>
                <input
                  type="search"
                  className="w-full rounded-lg border px-3 py-2 text-sm mt-1"
                  placeholder="商家名称 / 商家 ID"
                  value={merchantKw}
                  onChange={(e) => setMerchantKw(e.target.value)}
                />
                <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg divide-y">
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 ${
                        value.clientId === c.id ? 'bg-violet-100 text-violet-800' : ''
                      }`}
                      onClick={() =>
                        onChange({
                          ...value,
                          enabled: true,
                          clientId: c.id,
                          merchantAccountId: c.merchantAccountId,
                          merchantDisplayName: c.accountDisplayName || c.clientLabel || c.merchantAccountId,
                        })
                      }
                    >
                      <span className="font-medium">{c.accountDisplayName || c.clientLabel || '客户商家'}</span>
                      <span className="text-xs text-[var(--shell-muted)] ml-2">ID {c.merchantAccountId}</span>
                    </button>
                  ))}
                  {!filteredClients.length ? (
                    <p className="text-xs text-[var(--shell-muted)] px-3 py-4 text-center">无匹配商家</p>
                  ) : null}
                </div>
              </div>

              {value.clientId ? (
                <>
                  <div>
                    <label className="form-field-label">商家联系电话（林客定向计划必填）</label>
                    <input
                      className="w-full rounded-lg border px-3 py-2 text-sm mt-1"
                      placeholder="11 位手机号"
                      value={value.merchantPhone}
                      onChange={(e) => onChange({ ...value, merchantPhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-field-label">林客团购商品（通知满员后自动建定向招募）</label>
                    <div className="flex gap-2 mt-1">
                      <input
                        className="flex-1 rounded-lg border px-3 py-2 text-sm"
                        placeholder="商品名称关键词"
                        value={productKw}
                        onChange={(e) => setProductKw(e.target.value)}
                      />
                      <button
                        type="button"
                        className="px-3 py-2 rounded-lg border text-sm flex items-center gap-1"
                        disabled={productSearching}
                        onClick={() => void onSearchProducts()}
                      >
                        <Search className="w-3.5 h-3.5" />
                        {productSearching ? '搜索中…' : '搜索'}
                      </button>
                    </div>
                    {productHits.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {productHits.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={`text-xs px-2 py-1 rounded-full border ${
                              value.productIds?.includes(p.id)
                                ? 'bg-violet-600 text-white border-violet-600'
                                : 'bg-white'
                            }`}
                            onClick={() => toggleProduct(p.id)}
                          >
                            {p.name.slice(0, 24)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {value.productIds?.length ? (
                      <p className="text-xs text-emerald-700 mt-2">已选 {value.productIds.length} 个商品</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
