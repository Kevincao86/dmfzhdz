import { ChevronDown, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import {
  groupStoresByBrand,
  isChainBrandGroup,
  pickBrandAnchorAddress,
  type BrandGroupStore,
} from '../../lib/storeBrandGroup'
import { readMerchantSession } from '../../lib/merchantSession'
import { fetchAllDouyinClaimedStoresPages } from '../../services/douyinMerchantApi'
import type { CompetitorTarget } from '../../lib/competitorStorage'

type PickerOption =
  | { kind: 'brand'; brandKey: string; brandName: string; storeCount: number }
  | { kind: 'store'; poiId: string; label: string }

function targetToOptionId(t: CompetitorTarget | null): string {
  if (!t) return ''
  return t.mode === 'brand' ? `brand:${t.brandKey}` : `store:${t.poiId}`
}

function buildTargetFromId(
  id: string,
  groups: ReturnType<typeof groupStoresByBrand>,
): CompetitorTarget | null {
  if (!id) return null
  if (id.startsWith('brand:')) {
    const key = id.slice(6)
    const g = groups.find((x) => x.brandKey === key)
    if (!g || !isChainBrandGroup(g)) return null
    const anchor = pickBrandAnchorAddress(g)
    if (!anchor.address) return null
    return {
      mode: 'brand',
      brandKey: g.brandKey,
      brandName: g.brandDisplayName,
      storeCount: g.stores.length,
      stores: g.stores
        .filter((s) => s.address?.trim())
        .map((s) => ({
          poiId: s.id,
          storeName: s.name,
          address: s.address!.trim(),
          city: s.city?.trim(),
        })),
      anchorAddress: anchor.address,
      anchorCity: anchor.city,
      anchorStoreName: anchor.anchorStoreName,
    }
  }
  if (id.startsWith('store:')) {
    const poiId = id.slice(6)
    for (const g of groups) {
      const s = g.stores.find((x) => x.id === poiId)
      if (s?.address?.trim()) {
        return {
          mode: 'store',
          poiId: s.id,
          storeName: s.name,
          address: s.address.trim(),
          city: s.city?.trim(),
        }
      }
    }
  }
  return null
}

export default function CompetitorTargetPicker({
  value,
  onChange,
  disabled,
}: {
  value: CompetitorTarget | null
  onChange: (next: CompetitorTarget | null) => void
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [stores, setStores] = useState<BrandGroupStore[]>([])

  const load = useCallback(async () => {
    const tok = readMerchantSession('meoo_douyin_merchant_token')
    if (!tok) {
      setErr('请先在系统设置绑定抖音来客')
      setStores([])
      return
    }
    setLoading(true)
    setErr(null)
    const r = await fetchAllDouyinClaimedStoresPages({
      accessToken: tok,
      merchantId: readMerchantSession('meoo_douyin_merchant_id') ?? undefined,
    })
    setLoading(false)
    if (!r.ok) {
      setErr(r.message)
      setStores([])
      return
    }
    setStores(
      r.items.map((x) => ({
        id: x.id,
        name: x.name,
        address: x.address,
        city: x.city,
        brandName: x.brandName,
      })),
    )
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const groups = useMemo(() => groupStoresByBrand(stores), [stores])

  const options = useMemo((): PickerOption[] => {
    const out: PickerOption[] = []
    for (const g of groups) {
      if (isChainBrandGroup(g) && pickBrandAnchorAddress(g).address) {
        out.push({
          kind: 'brand',
          brandKey: g.brandKey,
          brandName: g.brandDisplayName,
          storeCount: g.stores.length,
        })
      } else {
        for (const s of g.stores) {
          if (!s.address?.trim()) continue
          out.push({
            kind: 'store',
            poiId: s.id,
            label: s.name,
          })
        }
      }
    }
    return out
  }, [groups])

  const selectValue = targetToOptionId(value)

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">选择门店 / 品牌</label>
      <div className="relative">
        <select
          disabled={disabled || loading || options.length === 0}
          value={selectValue}
          onChange={(e) => {
            const t = buildTargetFromId(e.target.value, groups)
            onChange(t)
          }}
          className={cn(
            'w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-9 text-sm text-gray-900',
            (disabled || loading) && 'opacity-60',
          )}
        >
          <option value="">{loading ? '加载门店…' : '请选择已认领门店或品牌'}</option>
          {options.map((o) =>
            o.kind === 'brand' ? (
              <option key={`brand:${o.brandKey}`} value={`brand:${o.brandKey}`}>
                {o.brandName}（{o.storeCount} 家门店 · 按品牌分析）
              </option>
            ) : (
              <option key={`store:${o.poiId}`} value={`store:${o.poiId}`}>
                {o.label}
              </option>
            ),
          )}
        </select>
        {loading ? (
          <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        )}
      </div>
      {err ? <p className="text-xs text-amber-800">{err}</p> : null}
      {!loading && !err && stores.length > 0 ? (
        <p className="text-xs text-gray-500">
          连锁账号下同名品牌已合并展示；选品牌将统筹各分店区位做竞品分析（非单店重复分析）。
        </p>
      ) : null}
    </div>
  )
}
