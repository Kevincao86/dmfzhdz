import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../cn'
import { mpRecruitmentSharePath } from '../mpRecruitmentShare'
import {
  fetchRegistry,
  patchMpRecruitmentOrder,
  type RegistryMpRecruitmentOrder,
} from '../opsRegistryApi'

type MpStatus = RegistryMpRecruitmentOrder['status']

function mpStatusLabel(s: MpStatus): string {
  const m: Record<MpStatus, string> = {
    open: '招募中',
    collecting: '收集中',
    closed: '已关闭',
    done: '已完成',
  }
  return m[s]
}

function mpStatusStyle(s: MpStatus): string {
  if (s === 'open') return 'bg-emerald-500/15 text-emerald-400'
  if (s === 'collecting') return 'bg-sky-500/15 text-sky-400'
  if (s === 'done') return 'bg-indigo-500/15 text-indigo-300'
  return 'bg-slate-600 text-slate-300'
}

export default function OpsMpRecruitmentOrdersPage() {
  const [status, setStatus] = useState<'all' | MpStatus>('all')
  const [orders, setOrders] = useState<RegistryMpRecruitmentOrder[]>([])
  const [detail, setDetail] = useState<RegistryMpRecruitmentOrder | null>(null)
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      setOrders(r.mpRecruitmentOrders ?? [])
    } catch {
      setOrders([])
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(t)
  }, [load])

  const sorted = useMemo(
    () => [...orders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [orders],
  )

  const rows = useMemo(() => {
    if (status === 'all') return sorted
    return sorted.filter((o) => o.status === status)
  }, [sorted, status])

  const changeStatus = async (id: string, next: MpStatus) => {
    setPatchBusyId(id)
    try {
      const r = await patchMpRecruitmentOrder({ id, status: next })
      if (!r.ok) {
        window.alert(r.error ?? '更新失败')
        return
      }
      await load()
      setDetail((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur))
    } finally {
      setPatchBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">小程序达人招募订单</h1>
          <p className="mt-1 text-sm text-slate-500">
            运营在商家订单中选择「小程序招募」后自动生成；达人通过「墨典达人招募小程序」报名，报名记录同步至本列表。
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="text-xs text-indigo-400 hover:underline">
          刷新列表
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <span className="text-sm text-slate-400">状态</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="open">招募中</option>
          <option value="collecting">收集中</option>
          <option value="closed">已关闭</option>
          <option value="done">已完成</option>
        </select>
        <span className="ml-auto text-xs text-slate-500">共 {rows.length} 条</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">小程序单号</th>
                <th className="px-3 py-3">关联商家订单</th>
                <th className="px-3 py-3">客户 / 门店</th>
                <th className="px-3 py-3">平台</th>
                <th className="px-3 py-3">大厅</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">报名数</th>
                <th className="px-3 py-3">创建时间</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                    暂无小程序招募单。请在「商家达人招募订单」处理弹窗中选择「小程序招募」创建。
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{o.id}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-400">{o.sourceMerchantOrderId}</td>
                    <td className="px-3 py-2 text-slate-300">
                      <div>{o.customerName}</div>
                      <div className="text-xs text-slate-500">{o.storeName}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{o.platform || '抖音'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          o.urgent ? 'bg-rose-500/15 text-rose-400' : 'bg-sky-500/15 text-sky-400',
                        )}
                      >
                        {o.urgent ? '急单大厅' : '招募大厅'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', mpStatusStyle(o.status))}>
                        {mpStatusLabel(o.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-300">{(o.applicants ?? []).length}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{o.createdAt}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setDetail(o)} className="text-xs text-indigo-400 hover:underline">
                        详情
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" role="dialog" onClick={() => setDetail(null)}>
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">小程序招募详情</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{detail.id}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                <span className="text-slate-500">商家订单：</span>
                {detail.sourceMerchantOrderId}
              </p>
              <p>
                <span className="text-slate-500">客户 / 门店：</span>
                {detail.customerName} · {detail.storeName}
              </p>
              <p>
                <span className="text-slate-500">招募平台：</span>
                {detail.platform || '抖音'}
              </p>
              <p>
                <span className="text-slate-500">分享路径：</span>
                <span className="font-mono text-xs text-emerald-300">{mpRecruitmentSharePath(detail.id)}</span>
              </p>
              <div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">
                <p className="mb-1 font-medium text-slate-300">商家订单号</p>
                <p className="font-mono text-slate-300">{detail.sourceMerchantOrderId}</p>
                <p className="mt-2 mb-1 font-medium text-slate-300">招募信息</p>
                <pre className="whitespace-pre-wrap">{detail.recruitmentInfo || detail.merchantRequirements || '—'}</pre>
                <p className="mt-2 mb-1 font-medium text-slate-300">任务详情</p>
                <pre className="whitespace-pre-wrap">{detail.taskDetail || '—'}</pre>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['open', '招募中'],
                  ['collecting', '收集中'],
                  ['closed', '已关闭'],
                  ['done', '已完成'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  disabled={patchBusyId === detail.id || detail.status === st}
                  onClick={() => void changeStatus(detail.id, st)}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-400">达人报名（{(detail.applicants ?? []).length}）</div>
              {(detail.applicants ?? []).length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">暂无报名，请分享小程序招募页给达人。</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {(detail.applicants ?? []).map((a) => {
                    const nick = a.platformNickname || a.name
                    return (
                      <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                        <div className="font-medium text-slate-200">
                          {nick} · {a.platform} · {a.followers.toLocaleString('zh-CN')} 粉
                        </div>
                        <div className="mt-1 space-y-0.5 text-slate-500">
                          <div>号：{a.platformAccount || '—'}</div>
                          {a.profileLink ? (
                            <div className="truncate" title={a.profileLink}>
                              主页：
                              <a href={a.profileLink} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                                {a.profileLink}
                              </a>
                            </div>
                          ) : null}
                          {a.douyinSalesLevel && detail.platform !== '小红书' ? (
                            <div>带货等级：{a.douyinSalesLevel}</div>
                          ) : null}
                          <div>
                            省市：{a.province || '—'} {a.city || ''}
                          </div>
                          <div>联系：{a.contact || '—'} · 微信：{a.wechatId || '—'}</div>
                          <div>报价：{a.quotePrice || '—'} · 探店：{a.visitTimeSlot || '—'}</div>
                          <div>收款：{a.paymentMethod || (a.alipayAccount ? `支付宝：${a.alipayAccount}` : '—')}</div>
                        </div>
                        {a.intro ? <div className="mt-1 text-slate-600">{a.intro}</div> : null}
                        <div className="mt-1 text-[10px] text-slate-600">{a.appliedAt}</div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mpRecruitmentSharePath(detail.id))
                    window.alert('分享路径已复制')
                  } catch {
                    window.alert('复制失败')
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
              >
                复制分享路径
              </button>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600">
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
