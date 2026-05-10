import { Image, Megaphone, Radio, Sparkles, Store, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../cn'
import { readMerchantSession } from '../../lib/merchantSession'
import type { DouyinStoreRow } from '../../services/douyinMerchantApi'
import { getDouyinStoreDetail } from '../../services/douyinMerchantApi'

export type DecoStudioSection =
  | 'header'
  | 'cover'
  | 'facility'
  | 'notice'
  | 'staff'
  | 'dynamic'
  | 'live'

const SECTIONS: { id: DecoStudioSection; label: string; icon: typeof Store }[] = [
  { id: 'header', label: '头图和门店相册', icon: Image },
  { id: 'cover', label: '外显小图', icon: Image },
  { id: 'facility', label: '设施及服务', icon: Store },
  { id: 'notice', label: '官方公告', icon: Megaphone },
  { id: 'staff', label: '职人展示', icon: Users },
  { id: 'dynamic', label: '商家动态', icon: Sparkles },
  { id: 'live', label: '直播导流配置', icon: Radio },
]

function draftKey(poiId: string, section: DecoStudioSection) {
  return `meoo_douyin_deco_draft_${poiId}_${section}`
}

type Props = {
  poiId: string
  section: DecoStudioSection
  onSectionChange: (s: DecoStudioSection) => void
  onExitList: () => void
}

export default function DouyinStoreDecorationStudio({
  poiId,
  section,
  onSectionChange,
  onExitList,
}: Props) {
  const [detail, setDetail] = useState<DouyinStoreRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')

  const loadDetail = useCallback(async () => {
    const token = readMerchantSession('meoo_douyin_merchant_token')
    if (!token) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await getDouyinStoreDetail({ accessToken: token, poiId })
    setLoading(false)
    if (res.ok && res.items[0]) setDetail(res.items[0])
    else setDetail(null)
  }, [poiId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    try {
      setDraft(sessionStorage.getItem(draftKey(poiId, section)) ?? '')
    } catch {
      setDraft('')
    }
  }, [poiId, section])

  const persistDraft = (v: string) => {
    setDraft(v)
    try {
      sessionStorage.setItem(draftKey(poiId, section), v)
    } catch {
      /* ignore */
    }
  }

  const saveLocalDraft = () => {
    persistDraft(draft)
    window.alert('已保存在本浏览器的草稿中。正式上线后内容由抖音来客后台与实施环境同步下发。')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <aside className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:col-span-2">
        <div className="mb-2 text-xs font-medium text-gray-500">装修模块</div>
        <nav className="space-y-1">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onSectionChange(id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                section === id ? 'bg-blue-50 font-medium text-blue-800' : 'text-gray-700 hover:bg-gray-50',
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          onClick={onExitList}
          className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-xs text-gray-600 hover:bg-gray-50"
        >
          返回装修列表
        </button>
      </aside>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-7">
        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">加载门店资料…</p>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900">
              {SECTIONS.find((s) => s.id === section)?.label ?? '装修'}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              能力与抖音来客「门店装修」分区一致；正式保存将由平台能力与您的实施环境承接。
            </p>

            {section === 'cover' && (
              <div className="mt-4 space-y-3">
                <label className="block text-xs text-gray-500">外显小图 URL（1:1，建议 PNG/JPG &lt;5MB）</label>
                <input
                  value={draft}
                  onChange={(e) => persistDraft(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500">
                  当前头图来自门店查询：
                  {detail?.avatarUrl ? (
                    <span className="text-green-700">已映射到 POI 图片字段</span>
                  ) : (
                    <span>未返回头图地址，仍可手动填写或由管理员协助核对门店资料</span>
                  )}
                </p>
              </div>
            )}

            {section === 'header' && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-700">头图与相册需对接素材上传与相册管理类接口；此处可记录备注。</p>
                <textarea
                  value={draft}
                  onChange={(e) => persistDraft(e.target.value)}
                  rows={6}
                  placeholder="备注：主图链接、相册规划…"
                  className="w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-500"
                />
              </div>
            )}

            {(section === 'facility' || section === 'notice' || section === 'staff' || section === 'dynamic' || section === 'live') && (
              <div className="mt-4 space-y-3">
                <textarea
                  value={draft}
                  onChange={(e) => persistDraft(e.target.value)}
                  rows={8}
                  placeholder="在此编辑草稿文案；后续可在抖音来客完成正式编辑与发布。"
                  className="w-full rounded-lg border border-gray-200 p-3 text-sm outline-none focus:border-blue-500"
                />
                {section === 'staff' && (
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" className="rounded border-gray-300" readOnly disabled />
                    开启职人展示（需对接职人管理接口）
                  </label>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={saveLocalDraft}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                保存草稿（本地）
              </button>
              <button
                type="button"
                onClick={() => void loadDetail()}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                重新同步门店信息
              </button>
            </div>
          </>
        )}
      </section>

      <aside className="rounded-xl border border-gray-200 bg-gradient-to-b from-slate-900 to-slate-800 p-4 text-white shadow-sm lg:col-span-3">
        <div className="text-center text-xs font-medium text-slate-300">抖音效果预览</div>
        <div className="mx-auto mt-4 w-[200px] rounded-[2rem] border-4 border-slate-700 bg-white p-3 shadow-inner">
          <div className="mb-2 h-4 w-12 rounded-full bg-slate-200 mx-auto" />
          <div className="rounded-lg bg-slate-50 p-2 text-left text-[10px] text-slate-800">
            <div className="flex gap-2">
              {(() => {
                const url =
                  section === 'cover' && draft.trim().startsWith('http')
                    ? draft.trim()
                    : detail?.avatarUrl
                return url ? (
                  <img src={url} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
                ) : null
              })()}
              {!((section === 'cover' && draft.trim().startsWith('http')) || detail?.avatarUrl) ? (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[9px] text-slate-500">
                  暂无图
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{detail?.name ?? '门店名称'}</div>
                <div className="truncate text-slate-500">{detail?.businessStatus ?? '营业状态'}</div>
              </div>
            </div>
            <div className="mt-2 line-clamp-2 text-slate-600">
              {section === 'notice' && draft
                ? draft.slice(0, 120)
                : (detail?.announcement ?? detail?.businessHours ?? '列表卡片副文案')}
            </div>
          </div>
        </div>
        <p className="mt-4 text-center text-[10px] leading-relaxed text-slate-400">
          预览仅示意 C 端列表卡片；实际上线以抖音 App 为准。
        </p>
      </aside>
    </div>
  )
}
