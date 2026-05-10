import { Loader2, Percent, RefreshCw, Store } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { findNodeById } from '../data/douyinCategoryMock'
import { MOCK_CATEGORY_TREE } from '../data/douyinCategoryMock'
import { cn } from '../cn'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLabelsForPath,
  pickerPathIdsToLeaf,
} from '../lib/douyinGoodsCategoryPicker'
import {
  fetchDouyinGoodsCategoryChildren,
  mergeDouyinCategoryChildrenIntoTree,
  normalizeCategoryTree,
  type DouyinCategoryTreeNode,
} from '../services/douyinProductApi'
import {
  fetchStoreGrossMarginAdvisor,
  type GrossMarginAdvisorResult,
} from '../services/storeGrossMarginAdvisorApi'

type StoreMargins = { douyin: number; meituan: number; xhs: number }

export type MarginIndustryPersist = {
  /** 历史预设编码，可选 */
  code: string
  /** 抖音来客类目 id：当前为二级类目 id；兼容历史存过末级 id 的还原展示 */
  leafCategoryId: string
  name: string
  path: string
}

type MarginAdvisorOk = Extract<GrossMarginAdvisorResult, { ok: true }>

function clampMarginPct(n: number): number {
  const x = Math.round(Number(n))
  if (!Number.isFinite(x)) return 0
  return Math.min(100, Math.max(0, x))
}

type Props = {
  margins: StoreMargins
  marginIndustry: MarginIndustryPersist
  onSaved: (cfg: { margins: StoreMargins; industry: MarginIndustryPersist }) => void
  marginAdvisorData: MarginAdvisorOk | null
  setMarginAdvisorData: (v: MarginAdvisorOk | null) => void
  marginAdvisorLoading: boolean
  setMarginAdvisorLoading: (v: boolean) => void
  marginAdvisorError: string | null
  setMarginAdvisorError: (v: string | null) => void
  setToast: (msg: string | null) => void
  /** 弹窗内紧凑排版：缩小间距与字号，并隐藏外层大标题（由弹窗标题栏承担） */
  compact?: boolean
}

export default function StoreGrossMarginConfigCard({
  margins,
  marginIndustry,
  onSaved,
  marginAdvisorData,
  setMarginAdvisorData,
  marginAdvisorLoading,
  setMarginAdvisorLoading,
  marginAdvisorError,
  setMarginAdvisorError,
  setToast,
  compact = false,
}: Props) {
  const isCompact = Boolean(compact)
  const [tree, setTree] = useState<DouyinCategoryTreeNode[]>([])
  const [treeSource, setTreeSource] = useState<'none' | 'douyin' | 'demo'>('none')
  const [treeSyncing, setTreeSyncing] = useState(false)
  const [treeErr, setTreeErr] = useState<string | null>(null)

  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')

  const [marginDraft, setMarginDraft] = useState<StoreMargins>(() => ({ ...margins }))

  useEffect(() => {
    setMarginDraft({ ...margins })
  }, [margins])

  const l1Options = useMemo(() => pickerChildrenOf(tree, null), [tree])
  const l2Options = useMemo(() => (cat1 ? pickerChildrenOf(tree, cat1) : []), [tree, cat1])

  /** 毛利按「一级 + 二级」定行业，不要求选末级 */
  const categorySelectionOk = useMemo(() => {
    if (!cat1 || !cat2) return false
    const n = findNodeById(tree as never[], cat2) as DouyinCategoryTreeNode | null
    return Boolean(n && n.enable !== false)
  }, [cat1, cat2, tree])

  const syncSourceActive = treeSource === 'douyin'
  const demoSourceActive = treeSource === 'demo'

  const refreshAdvisor = useCallback(
    async (q: Parameters<typeof fetchStoreGrossMarginAdvisor>[0]) => {
      setMarginAdvisorLoading(true)
      setMarginAdvisorError(null)
      const r = await fetchStoreGrossMarginAdvisor(q)
      setMarginAdvisorLoading(false)
      if (r.ok) setMarginAdvisorData(r)
      else {
        setMarginAdvisorData(null)
        setMarginAdvisorError(r.message)
      }
    },
    [
      setMarginAdvisorData,
      setMarginAdvisorError,
      setMarginAdvisorLoading,
    ],
  )

  /** 恢复已保存类目（二级 id，或历史末级 id → 还原到一级+二级） */
  useEffect(() => {
    if (!tree.length || !marginIndustry.leafCategoryId) return
    const ids = pickerPathIdsToLeaf(tree, marginIndustry.leafCategoryId)
    if (ids.length < 2) return
    if (ids.length >= 3) {
      setCat1(ids[ids.length - 3] ?? '')
      setCat2(ids[ids.length - 2] ?? '')
    } else {
      setCat1(ids[0] ?? '')
      setCat2(ids[1] ?? '')
    }
  }, [tree, marginIndustry.leafCategoryId])

  /** 二级变更后刷新毛利建议（路径为 一级 > 二级） */
  useEffect(() => {
    if (!categorySelectionOk || !cat2) return
    const ids = [cat1, cat2]
    const { path } = pickerLabelsForPath(tree, ids)
    const t = window.setTimeout(() => {
      void refreshAdvisor({ categoryId: cat2, industryPath: path })
    }, 280)
    return () => window.clearTimeout(t)
  }, [cat1, cat2, categorySelectionOk, tree, refreshAdvisor])

  /** 与创建商品页一致：选定一级/二级后再拉一层直系子类目，补全餐饮等下二级、三级数量 */
  useEffect(() => {
    if (treeSource !== 'douyin' || treeSyncing || !cat1 || tree.length === 0) return
    let cancelled = false
    void (async () => {
      const kids = await fetchDouyinGoodsCategoryChildren(cat1)
      if (cancelled || kids.length === 0) return
      setTree((prev) => mergeDouyinCategoryChildrenIntoTree(prev, cat1, kids))
    })()
    return () => {
      cancelled = true
    }
  }, [cat1, treeSource, treeSyncing])

  const syncDouyinCategories = async () => {
    setTreeSyncing(true)
    setTreeErr(null)
    try {
      const cat = await loadDouyinGoodsCategoryTreeForPicker()
      if (!cat.ok) {
        setTree([])
        setTreeSource('none')
        setTreeErr(cat.message)
        setToast('抖音类目同步失败，可尝试「手动加载示例类目」')
        return
      }
      setTree(cat.tree)
      setTreeSource('douyin')
      setCat1('')
      setCat2('')
      setToast(`已同步抖音来客类目（${cat.tree.length} 个一级节点，与创建商品页同源）`)
    } catch (e) {
      setTreeErr(e instanceof Error ? e.message : String(e))
      setToast('类目请求异常')
    } finally {
      setTreeSyncing(false)
    }
  }

  const loadDemoCategories = () => {
    const normalized = normalizeCategoryTree(MOCK_CATEGORY_TREE as unknown as Record<string, unknown>[])
    setTree(normalized)
    setTreeSource('demo')
    setCat1('')
    setCat2('')
    setTreeErr(null)
    setToast('已加载本地示例类目树（未接抖音时可用于联调 UI）')
  }

  const handleSave = () => {
    const next: StoreMargins = {
      douyin: clampMarginPct(marginDraft.douyin),
      meituan: clampMarginPct(marginDraft.meituan),
      xhs: clampMarginPct(marginDraft.xhs),
    }
    let nextIndustry: MarginIndustryPersist = { ...marginIndustry }
    if (tree.length > 0 && categorySelectionOk) {
      const ids = [cat1, cat2]
      const { path, name } = pickerLabelsForPath(tree, ids)
      nextIndustry = {
        code: '',
        leafCategoryId: cat2,
        name,
        path,
      }
    } else if (tree.length > 0 && (cat1 || cat2) && !categorySelectionOk) {
      setToast('请选择可用的二级类目（灰色项为不可用）')
      return
    }
    onSaved({ margins: next, industry: nextIndustry })
    setToast('门店毛利配置已保存')
  }

  return (
    <div
      className={cn(
        isCompact
          ? 'space-y-3'
          : 'rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm',
      )}
    >
      {!isCompact && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Percent className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">门店毛利配置</h3>
              <p className="text-xs text-gray-600">
                经营类目为商品品类 + 二级类目（与来客行业粒度一致）；用于 AI 检测分析中的定价合理性参考。
              </p>
            </div>
          </div>
          <div className="rounded-full bg-amber-200/80 px-3 py-1 text-xs font-medium text-amber-900">
            已保存 {margins.douyin}% / {margins.meituan}% / {margins.xhs}%
            {marginIndustry.path ? ` · ${marginIndustry.path}` : ''}
          </div>
        </div>
      )}

      <div
        className={cn(
          'rounded-lg border border-amber-100/80 bg-white/90',
          isCompact ? 'p-3' : 'mb-5 p-4',
        )}
      >
        <div
          className={cn(
            'mb-2 flex items-center gap-2 font-medium text-gray-800',
            isCompact ? 'text-xs' : 'text-sm',
          )}
        >
          <Store className={cn('shrink-0 text-amber-600', isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
          经营类目选择
        </div>
        <p
          className={cn(
            'mb-3 text-gray-600',
            isCompact ? 'text-[11px] leading-snug' : 'text-xs',
          )}
        >
          {isCompact ? (
            <>同步类目与创建商品页同源；未绑定时可加载示例树。</>
          ) : (
            <>
              「同步抖音来客类目」会从抖音来客拉取与创建商品一致的类目树；请选择一级与二级。未绑定账号时可使用「手动加载示例类目」。
            </>
          )}
        </p>
        <div className={cn('flex flex-wrap gap-2', isCompact ? 'mb-2' : 'mb-4')}>
          <button
            type="button"
            disabled={treeSyncing}
            onClick={() => void syncDouyinCategories()}
            className={cn(
              'inline-flex items-center rounded-lg border font-medium',
              isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
              'transition-[background-color,border-color,box-shadow,color] duration-300 ease-out',
              'disabled:pointer-events-none disabled:opacity-60',
              syncSourceActive
                ? 'border-amber-400 bg-amber-50 text-amber-950 shadow-sm hover:bg-amber-100/90'
                : 'border-gray-300 bg-white text-gray-800 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-950 hover:shadow-sm',
            )}
          >
            {treeSyncing ? (
              <Loader2 className={cn('mr-1.5 animate-spin', isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            ) : (
              <RefreshCw className={cn('mr-1.5', isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            )}
            同步抖音来客类目
          </button>
          <button
            type="button"
            disabled={treeSyncing}
            onClick={loadDemoCategories}
            className={cn(
              'inline-flex items-center rounded-lg border font-medium',
              isCompact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm',
              'transition-[background-color,border-color,box-shadow,color] duration-300 ease-out',
              'disabled:pointer-events-none disabled:opacity-60',
              demoSourceActive
                ? 'border-amber-400 bg-amber-50 text-gray-900 shadow-sm hover:bg-amber-100/90'
                : 'border-gray-300 bg-white text-gray-800 hover:border-amber-300 hover:bg-amber-50 hover:text-gray-900 hover:shadow-sm',
            )}
          >
            手动加载示例类目
          </button>
        </div>
        {treeErr && (
          <p className="mb-3 rounded-md border border-red-100 bg-red-50 px-2 py-1.5 text-xs text-red-800">
            {treeErr}
          </p>
        )}
        {tree.length > 0 ? (
          <div className={cn('grid sm:grid-cols-2', isCompact ? 'gap-2' : 'gap-3')}>
            <label
              className={cn('block font-medium text-gray-700', isCompact ? 'text-[11px]' : 'text-xs')}
            >
              商品品类 <span className="text-red-500">*</span>
              <select
                className={cn(
                  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-2',
                  isCompact ? 'py-1.5 text-xs' : 'py-2 text-sm',
                )}
                value={cat1}
                onChange={(e) => {
                  setCat1(e.target.value)
                  setCat2('')
                }}
              >
                <option value="">请输入商品品类（一级）</option>
                {l1Options.map((n) => (
                  <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                    {!n.enable ? `${n.name}（不可用）` : n.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={cn('block font-medium text-gray-700', isCompact ? 'text-[11px]' : 'text-xs')}
            >
              二级类目 <span className="text-red-500">*</span>
              <select
                className={cn(
                  'mt-1 w-full rounded-lg border border-gray-200 bg-white px-2',
                  isCompact ? 'py-1.5 text-xs' : 'py-2 text-sm',
                )}
                value={cat2}
                disabled={!cat1}
                onChange={(e) => {
                  setCat2(e.target.value)
                }}
              >
                <option value="">请选择</option>
                {l2Options.map((n) => (
                  <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                    {!n.enable ? `${n.name}（不可用）` : n.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className={cn('text-gray-500', isCompact ? 'text-[11px]' : 'text-sm')}>
            请先点击「同步抖音来客类目」或「手动加载示例类目」加载类目树。
          </p>
        )}
        {treeSource !== 'none' && (
          <p className={cn('mt-2 text-gray-500', isCompact ? 'text-[10px]' : 'text-xs')}>
            当前数据源：{treeSource === 'douyin' ? '抖音开放平台' : '本地示例'}
          </p>
        )}
      </div>

      <div className={cn('rounded-lg border border-amber-100/80 bg-white/90', isCompact ? 'p-3' : 'p-4')}>
        <div className={cn('font-medium text-gray-800', isCompact ? 'mb-2 text-xs' : 'mb-3 text-sm')}>
          商家毛利设置（%）
        </div>
        {marginAdvisorLoading && (
          <div
            className={cn('mb-2 flex items-center gap-2 text-amber-900', isCompact ? 'text-[11px]' : 'text-xs')}
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            正在根据所选类目拉取行业建议毛利率…
          </div>
        )}
        {marginAdvisorError && (
          <p className={cn('mb-2 text-amber-900', isCompact ? 'text-[11px]' : 'text-xs')}>
            建议值暂不可用：{marginAdvisorError}
            <span className="mt-0.5 block text-gray-600">仍可手动填写下方比例。</span>
          </p>
        )}
        {marginAdvisorData && !marginAdvisorLoading && (
          <p
            className={cn(
              'mb-2 text-gray-600',
              isCompact
                ? 'line-clamp-2 text-[11px] leading-snug'
                : 'text-xs leading-relaxed',
            )}
          >
            <span className="font-medium text-gray-800">
              {marginAdvisorData.industryName} · {marginAdvisorData.industryPath}
            </span>
            {isCompact ? ' ' : <br />}
            {marginAdvisorData.benchmarkNote}
          </p>
        )}
        <div className={cn(isCompact ? 'space-y-2' : 'space-y-3')}>
          {(
            [
              { key: 'douyin' as const, label: '抖音来客' },
              { key: 'meituan' as const, label: '美团点评' },
              { key: 'xhs' as const, label: '小红书' },
            ] as const
          ).map((row) => (
            <div
              key={row.key}
              className={cn(
                'flex flex-wrap items-center justify-between gap-2',
                isCompact ? 'text-xs' : 'text-sm',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="text-gray-700">{row.label}</div>
                {marginAdvisorData && (
                  <div className={cn('text-gray-500', isCompact ? 'text-[10px]' : 'text-xs')}>
                    行业建议 {marginAdvisorData.suggestedPercent[row.key]}%
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {marginAdvisorData && (
                  <button
                    type="button"
                    onClick={() =>
                      setMarginDraft((d) => ({
                        ...d,
                        [row.key]: clampMarginPct(marginAdvisorData.suggestedPercent[row.key]),
                      }))
                    }
                    className={cn(
                      'shrink-0 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-50',
                      isCompact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
                    )}
                  >
                    采用建议
                  </button>
                )}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={marginDraft[row.key]}
                  onChange={(e) =>
                    setMarginDraft((d) => ({
                      ...d,
                      [row.key]: Number(e.target.value) || 0,
                    }))
                  }
                  className={cn(
                    'rounded-lg border border-gray-300 text-right tabular-nums',
                    isCompact ? 'w-[4.25rem] px-2 py-1 text-xs' : 'w-24 px-3 py-2',
                  )}
                />
                <span className="text-gray-500">%</span>
              </div>
            </div>
          ))}
        </div>
        <div className={cn('flex justify-end', isCompact ? 'mt-3' : 'mt-4')}>
          <button
            type="button"
            onClick={handleSave}
            className={cn(
              'rounded-lg bg-amber-600 font-medium text-white hover:bg-amber-700',
              isCompact ? 'px-4 py-1.5 text-xs' : 'px-5 py-2 text-sm',
            )}
          >
            保存配置
          </button>
        </div>
      </div>
    </div>
  )
}
