import { BarChart3, Bell, Download, FileSpreadsheet, Share2, Smartphone } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../cn'
import { filterLegacyDemoRecruitmentOrders } from '../recruitmentLegacyDemo'
import {
  appendMpRecruitmentOrder,
  appendTalentPoolCandidates,
  fetchRegistry,
  patchRecruitmentOrder,
  setRecruitmentOrders,
  type RegistryMpRecruitmentOrder,
  type RegistryRecruitmentOrder,
  type RegistryTalentPoolRow,
} from '../opsRegistryApi'
import { normalizeRecruitmentPlatform } from '../../meooRegistryShared/recruitmentInfoFilter'
import { buildMpRecruitmentFieldsFromMerchant } from '../mpRecruitmentFields'
import { findMpOrderByMerchantOrderId } from '../mpRecruitmentDedup'
import { mpRecruitmentSharePath } from '../mpRecruitmentShare'
import { parseRecruitmentTalentSheet } from '../recruitmentSheetParse'

const ALERT_PREFS_KEY = 'meoo_ops_recruitment_alert_v1'

type AlertPrefsV1 = {
  v: 1
  email: string
  browserNotify: boolean
}

function readAlertPrefs(): AlertPrefsV1 {
  try {
    const raw = window.localStorage.getItem(ALERT_PREFS_KEY)
    if (!raw) return { v: 1, email: '', browserNotify: false }
    const o = JSON.parse(raw) as Partial<AlertPrefsV1>
    if (o.v !== 1) return { v: 1, email: '', browserNotify: false }
    return {
      v: 1,
      email: typeof o.email === 'string' ? o.email : '',
      browserNotify: o.browserNotify === true,
    }
  } catch {
    return { v: 1, email: '', browserNotify: false }
  }
}

function writeAlertPrefs(p: AlertPrefsV1) {
  window.localStorage.setItem(ALERT_PREFS_KEY, JSON.stringify(p))
}

type RecruitmentOrderStatus = RegistryRecruitmentOrder['status']

function orderStatusLabel(s: RecruitmentOrderStatus): string {
  const m: Record<RecruitmentOrderStatus, string> = {
    pending: '待接单',
    accepted: '已接单',
    done: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
  }
  return m[s]
}

function orderStatusStyle(s: RecruitmentOrderStatus): string {
  if (s === 'pending') return 'bg-amber-500/15 text-amber-400'
  if (s === 'accepted') return 'bg-sky-500/15 text-sky-400'
  if (s === 'done') return 'bg-emerald-500/15 text-emerald-400'
  if (s === 'cancelled') return 'bg-slate-600 text-slate-300'
  return 'bg-rose-500/15 text-rose-400'
}

function parseTalentLines(text: string): RegistryTalentPoolRow[] {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: RegistryTalentPoolRow[] = []
  let i = 0
  for (const line of lines) {
    const parts = line.split(/[,，\t]/).map((p) => p.trim())
    const name = parts[0]
    if (!name) continue
    i += 1
    let fans = Number(parts[3])
    if (!Number.isFinite(fans)) {
      const m = parts[3]?.match(/(\d+)\s*万/)
      fans = m ? Number(m[1]) * 10000 : 10000
    }
    out.push({
      id: `ing-${Date.now()}-${i}`,
      name,
      platform: parts[1] || '抖音',
      contentFormat: parts[2] || '短视频',
      status: 'pending_confirm',
      followers: Math.max(0, Math.floor(fans)),
      niche: parts[4] || '本地生活',
      baseFee: Math.max(0, Math.floor(Number(parts[5]) || 800)),
      bonus: Math.max(0, Math.floor(Number(parts[6]) || 200)),
      schedulingConflict: /冲突|排期/.test(line),
    })
  }
  return out
}

export default function OpsRecruitmentOrdersPage() {
  const [status, setStatus] = useState<'all' | RecruitmentOrderStatus>('all')
  const [registryOrders, setRegistryOrders] = useState<RegistryRecruitmentOrder[]>([])
  const [talentPaste, setTalentPaste] = useState('')
  const [talentBusy, setTalentBusy] = useState(false)
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null)
  const pruneFailNotifiedRef = useRef(false)
  const prevPendingRef = useRef<number | null>(null)

  const [processOrder, setProcessOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [acceptModeChoiceOrder, setAcceptModeChoiceOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [acceptSheetOrder, setAcceptSheetOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [mpShareInfo, setMpShareInfo] = useState<{ merchantOrderId: string; mpOrderId: string } | null>(null)
  const [mpAcceptBusy, setMpAcceptBusy] = useState(false)
  const [mpRecruitPlatform, setMpRecruitPlatform] = useState<'抖音' | '小红书'>('抖音')
  /** 小程序招募下发至达人端：正常单 → 招募大厅；加急单 → 急单大厅 */
  const [mpHallKind, setMpHallKind] = useState<'normal' | 'urgent'>('normal')
  const [acceptSheetFile, setAcceptSheetFile] = useState<File | null>(null)
  const [acceptSheetBusy, setAcceptSheetBusy] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertEmail, setAlertEmail] = useState('')
  const [alertBrowser, setAlertBrowser] = useState(false)

  const loadRegistry = useCallback(async () => {
    try {
      const r = await fetchRegistry()
      let orders = r.recruitmentOrders ?? []
      const cleaned = filterLegacyDemoRecruitmentOrders(orders)
      if (cleaned.length !== orders.length) {
        const w = await setRecruitmentOrders(cleaned)
        if (!w.ok && !pruneFailNotifiedRef.current) {
          pruneFailNotifiedRef.current = true
          window.alert(`无法从注册表移除历史演示订单：${w.error ?? '未知错误'}。列表已按本地过滤显示。`)
        }
        orders = cleaned
      }
      setRegistryOrders(orders)
    } catch {
      setRegistryOrders([])
    }
  }, [])

  useEffect(() => {
    void loadRegistry()
    const t = window.setInterval(() => void loadRegistry(), 5000)
    return () => window.clearInterval(t)
  }, [loadRegistry])

  const sortedOrders = useMemo(() => {
    return [...registryOrders].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [registryOrders])

  const rows = useMemo(() => {
    if (status === 'all') return sortedOrders
    return sortedOrders.filter((o) => o.status === status)
  }, [sortedOrders, status])

  const stats = useMemo(() => {
    const amount = sortedOrders.filter((o) => o.status === 'done').reduce((s, o) => s + o.netAmount, 0)
    return {
      total: sortedOrders.length,
      pending: sortedOrders.filter((o) => o.status === 'pending').length,
      done: sortedOrders.filter((o) => o.status === 'done').length,
      doneAmount: amount,
    }
  }, [sortedOrders])

  useEffect(() => {
    const prefs = readAlertPrefs()
    if (!prefs.browserNotify) {
      prevPendingRef.current = stats.pending
      return
    }
    if (prevPendingRef.current !== null && stats.pending > prevPendingRef.current && Notification.permission === 'granted') {
      try {
        new Notification('达人招募：新待接单', { body: `当前待接单 ${stats.pending} 条，请及时处理。` })
      } catch {
        /* ignore */
      }
    }
    prevPendingRef.current = stats.pending
  }, [stats.pending])

  useEffect(() => {
    if (!alertOpen) return
    const p = readAlertPrefs()
    setAlertEmail(p.email)
    setAlertBrowser(p.browserNotify)
  }, [alertOpen])

  const exportOrdersJson = () => {
    const payload = status === 'all' ? sortedOrders : sortedOrders.filter((o) => o.status === status)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recruitment-orders-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const submitTalentPaste = async () => {
    const parsed = parseTalentLines(talentPaste)
    if (!parsed.length) {
      window.alert('未解析到达人：每行至少含昵称，可附平台、内容形态、粉丝量、领域、基础费、绩效（逗号分隔）。')
      return
    }
    setTalentBusy(true)
    try {
      const r = await appendTalentPoolCandidates(parsed)
      if (!r.ok) {
        window.alert(r.error ?? '写入失败')
        return
      }
      setTalentPaste('')
      window.alert(`已写入 ${parsed.length} 条达人候选；ERP「达人池确认」将合并展示。`)
    } finally {
      setTalentBusy(false)
    }
  }

  const changeOrderStatus = async (id: string, next: RecruitmentOrderStatus) => {
    setPatchBusyId(id)
    try {
      const r = await patchRecruitmentOrder({ id, status: next })
      if (!r.ok) {
        window.alert(r.error ?? '更新失败')
        return
      }
      await loadRegistry()
      setProcessOrder((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur))
    } finally {
      setPatchBusyId(null)
    }
  }

  const openAcceptModeChoice = (order: RegistryRecruitmentOrder) => {
    setProcessOrder(null)
    setMpRecruitPlatform(normalizeRecruitmentPlatform(order.recruitmentPlatform || order.accountType))
    setMpHallKind('normal')
    setAcceptModeChoiceOrder(order)
  }

  const openAcceptSheetFlow = (order: RegistryRecruitmentOrder) => {
    setAcceptModeChoiceOrder(null)
    setAcceptSheetOrder(order)
    setAcceptSheetFile(null)
  }

  const confirmMiniprogramAccept = async (order: RegistryRecruitmentOrder) => {
    setMpAcceptBusy(true)
    try {
      const reg = await fetchRegistry()
      const existing = findMpOrderByMerchantOrderId(reg.mpRecruitmentOrders, order.id)
      if (existing) {
        window.alert(
          `该商家订单已存在小程序招募单 ${existing.id}，不可重复创建。请在「小程序达人招募订单」查看。`,
        )
        return
      }
      if (order.linkedMpOrderId?.trim()) {
        window.alert(`该订单已关联小程序单 ${order.linkedMpOrderId.trim()}，不可重复创建。`)
        return
      }

      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      const mpId = `MP-RO-${Date.now()}`
      const platform = mpRecruitPlatform
      const urgent = mpHallKind === 'urgent'
      const fields = buildMpRecruitmentFieldsFromMerchant(order, { platform, urgent })
      const mpOrder: RegistryMpRecruitmentOrder = {
        id: mpId,
        sourceMerchantOrderId: order.id,
        customerName: order.customerName,
        storeName: order.storeName,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        applicants: [],
        ...fields,
      }
      const append = await appendMpRecruitmentOrder(mpOrder)
      if (!append.ok) {
        const msg =
          append.error === 'duplicate_merchant_order'
            ? '该商家订单已有小程序招募单，不可重复创建。'
            : (append.error ?? '创建小程序招募单失败')
        window.alert(msg)
        return
      }
      const patch = await patchRecruitmentOrder({
        id: order.id,
        status: 'accepted',
        acceptMode: 'miniprogram',
        linkedMpOrderId: mpId,
        recruitmentPlatform: platform,
      })
      if (!patch.ok) {
        window.alert(`小程序单已创建，但商家订单状态更新失败：${patch.error ?? ''}`)
      }
      setAcceptModeChoiceOrder(null)
      setMpShareInfo({ merchantOrderId: order.id, mpOrderId: mpId })
      await loadRegistry()
    } finally {
      setMpAcceptBusy(false)
    }
  }

  const cancelAcceptSheetFlow = () => {
    const o = acceptSheetOrder
    setAcceptSheetOrder(null)
    setAcceptSheetFile(null)
    if (o) setProcessOrder(o)
  }

  const confirmAcceptSheetUpload = async () => {
    if (!acceptSheetOrder) return
    if (!acceptSheetFile) {
      window.alert('请先选择要上传的 .xlsx 文件')
      return
    }
    setAcceptSheetBusy(true)
    try {
      const buf = await acceptSheetFile.arrayBuffer()
      const { candidates, errors } = parseRecruitmentTalentSheet(buf, acceptSheetOrder.id)
      if (!candidates.length) {
        window.alert(errors[0] ?? '未解析到达人，请检查表头是否与模版一致')
        return
      }
      const append = await appendTalentPoolCandidates(candidates)
      if (!append.ok) {
        window.alert(append.error ?? '写入达人池失败')
        return
      }
      const patch = await patchRecruitmentOrder({
        id: acceptSheetOrder.id,
        status: 'accepted',
        acceptMode: 'manual',
      })
      if (!patch.ok) {
        window.alert(`达人已写入，但订单状态更新失败：${patch.error ?? ''}。请在列表中手动改为已接单。`)
      }
      window.alert(`已智能解析并写入 ${candidates.length} 条达人至共享达人池（已关联订单 ${acceptSheetOrder.id}），订单已标记为已接单。请在 ERP「达人池确认」查看。`)
      setAcceptSheetOrder(null)
      setAcceptSheetFile(null)
      await loadRegistry()
    } catch (e) {
      window.alert(`上传处理异常：${String(e)}`)
    } finally {
      setAcceptSheetBusy(false)
    }
  }

  const saveAlertPrefs = async () => {
    if (alertBrowser && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        window.alert('未获得浏览器通知权限，已仅保存邮箱偏好（通知不会弹出）。')
      }
    }
    writeAlertPrefs({ v: 1, email: alertEmail.trim(), browserNotify: alertBrowser })
    setAlertOpen(false)
    window.alert('新订单提醒偏好已保存到本机浏览器。Webhook/短信等需在生产网关配置。')
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">商家达人招募订单</h1>
          <p className="mt-1 text-sm text-slate-500">
            商家 ERP / 商家小程序提交的招募需求；接单时可选手动表格或流转至「达人招募小程序」。列表来自共享注册表，已剔除历史演示单。
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportOrdersJson()}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
        >
          <Download className="h-4 w-4" />
          导出订单
        </button>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-medium text-slate-200">手动回传达人招募信息表</p>
        <p className="mt-1 text-xs text-slate-500">
          粘贴文本表（每行一条），解析后写入共享注册表，ERP 侧「达人池确认」定时拉取合并。示例：美食小王,抖音,短视频,20000,美食探店,800,200
        </p>
        <textarea
          value={talentPaste}
          onChange={(e) => setTalentPaste(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600"
          placeholder="粘贴回传内容…"
        />
        <button
          type="button"
          disabled={talentBusy}
          onClick={() => void submitTalentPaste()}
          className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {talentBusy ? '解析中…' : '解析并写入达人候选'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: '订单总量', value: stats.total },
          { label: '待接单', value: stats.pending },
          { label: '已完成', value: stats.done },
          { label: '完成成交额(元)', value: stats.doneAmount.toLocaleString('zh-CN') },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{x.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-white">{x.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <BarChart3 className="h-5 w-5 text-indigo-400" />
        <span className="text-sm text-slate-400">订单状态</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
        >
          <option value="all">全部</option>
          <option value="pending">待接单</option>
          <option value="accepted">已接单</option>
          <option value="done">已完成</option>
          <option value="cancelled">已取消</option>
          <option value="refunded">已退款</option>
        </select>
        <button
          type="button"
          onClick={() => setAlertOpen(true)}
          className="inline-flex items-center gap-1 text-xs text-amber-300/90 hover:underline"
        >
          <Bell className="h-3.5 w-3.5" />
          配置新订单提醒
        </button>
        <button
          type="button"
          onClick={() => void loadRegistry()}
          className="ml-auto text-xs text-indigo-400 hover:underline"
        >
          刷新列表
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-slate-800 text-[11px] font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">订单号</th>
                <th className="px-3 py-3">客户 / 门店</th>
                <th className="px-3 py-3">达人</th>
                <th className="px-3 py-3">粉丝 / 类型</th>
                <th className="px-3 py-3">下单时间</th>
                <th className="px-3 py-3">状态</th>
                <th className="px-3 py-3">信息摘要</th>
                <th className="px-3 py-3 text-right">金额</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                    暂无订单。请在 ERP「发布招募需求」提交后自动写入注册表。
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-800/30">
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{o.id}</td>
                    <td className="px-3 py-2 text-slate-300">
                      <div>{o.customerName}</div>
                      <div className="text-xs text-slate-500">{o.storeName}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">
                      {o.talentName}
                      <div className="text-[10px] text-slate-600">{o.talentId}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {o.fans.toLocaleString('zh-CN')} · {o.accountType}
                      <div className="text-slate-600">合作 {o.coopTimes} 次</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{o.createdAt}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', orderStatusStyle(o.status))}>
                        {orderStatusLabel(o.status)}
                      </span>
                    </td>
                    <td className="max-w-[220px] px-3 py-2 text-xs text-slate-500">{o.infoSummary ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      <div>¥{o.serviceAmount.toLocaleString('zh-CN')}</div>
                      <div className="text-[10px] text-slate-600">
                        佣 {o.commissionPct}% → 实收 ¥{o.netAmount.toLocaleString('zh-CN')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={patchBusyId === o.id}
                        onClick={() => setProcessOrder(o)}
                        className="text-xs text-indigo-400 hover:underline disabled:opacity-50"
                      >
                        处理
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-600">
        流程：客户提交 → 后台提醒 → 运营审核接单 → 分配对接人 → 跟进进度 → 完成 / 佣金结算与账单生成。dev
        环境下状态变更写入共享注册表，ERP 侧可据此对齐。
      </p>

      {processOrder ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          onClick={() => setProcessOrder(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">处理订单</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{processOrder.id}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>
                <span className="text-slate-500">客户 / 门店：</span>
                {processOrder.customerName} · {processOrder.storeName}
              </p>
              <p>
                <span className="text-slate-500">达人：</span>
                {processOrder.talentName}（{processOrder.talentId}）
              </p>
              <p>
                <span className="text-slate-500">当前状态：</span>
                {orderStatusLabel(processOrder.status)}
              </p>
              {processOrder.infoSummary ? (
                <p className="text-xs text-slate-500">{processOrder.infoSummary}</p>
              ) : null}
              {processOrder.acceptMode === 'miniprogram' && processOrder.linkedMpOrderId ? (
                <p className="text-xs text-emerald-400/90">
                  小程序招募 ·{' '}
                  <button
                    type="button"
                    className="underline hover:text-emerald-300"
                    onClick={() =>
                      setMpShareInfo({
                        merchantOrderId: processOrder.id,
                        mpOrderId: processOrder.linkedMpOrderId!,
                      })
                    }
                  >
                    查看分享路径
                  </button>
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['pending', '待接单'],
                  ['accepted', '已接单'],
                  ['done', '已完成'],
                  ['cancelled', '已取消'],
                  ['refunded', '已退款'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  disabled={patchBusyId === processOrder.id || processOrder.status === st}
                  onClick={() => {
                    if (st === 'accepted' && processOrder.status === 'pending') {
                      openAcceptModeChoice(processOrder)
                      return
                    }
                    void changeOrderStatus(processOrder.id, st)
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(processOrder.id)
                    window.alert('订单号已复制')
                  } catch {
                    window.alert('复制失败，请手动选择订单号')
                  }
                }}
                className="text-xs text-slate-400 hover:text-white hover:underline"
              >
                复制订单号
              </button>
              <button
                type="button"
                onClick={() => setProcessOrder(null)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {acceptModeChoiceOrder ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => {
            if (mpAcceptBusy) return
            const o = acceptModeChoiceOrder
            setAcceptModeChoiceOrder(null)
            if (o) setProcessOrder(o)
          }}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">已接单：选择招募方式</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{acceptModeChoiceOrder.id}</p>
            <p className="mt-3 text-xs text-slate-500">
              手动招募需下载模版上传表格解析；小程序招募将自动创建达人招募小程序订单并填入商家要求。
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400">下发小程序平台</label>
              <select
                value={mpRecruitPlatform}
                disabled={mpAcceptBusy}
                onChange={(e) => setMpRecruitPlatform(e.target.value as '抖音' | '小红书')}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                <option value="抖音">抖音</option>
                <option value="小红书">小红书</option>
              </select>
              <p className="mt-1 text-[10px] text-slate-600">小红书招募单不展示带货等级；报名表单字段随平台切换。</p>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400">达人端展示大厅</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={mpAcceptBusy}
                  onClick={() => setMpHallKind('normal')}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                    mpHallKind === 'normal'
                      ? 'border-sky-500/60 bg-sky-950/40 text-sky-100'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600',
                  )}
                >
                  正常单
                  <span className="mt-0.5 block text-[10px] font-normal opacity-80">招募大厅</span>
                </button>
                <button
                  type="button"
                  disabled={mpAcceptBusy}
                  onClick={() => setMpHallKind('urgent')}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                    mpHallKind === 'urgent'
                      ? 'border-rose-500/60 bg-rose-950/40 text-rose-100'
                      : 'border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600',
                  )}
                >
                  加急单
                  <span className="mt-0.5 block text-[10px] font-normal opacity-80">急单大厅</span>
                </button>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={mpAcceptBusy}
                onClick={() => openAcceptSheetFlow(acceptModeChoiceOrder)}
                className="flex items-center justify-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-950/30 px-4 py-3 text-sm font-medium text-indigo-100 hover:bg-indigo-900/40 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                手动招募
              </button>
              <button
                type="button"
                disabled={mpAcceptBusy}
                onClick={() => void confirmMiniprogramAccept(acceptModeChoiceOrder)}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                {mpAcceptBusy ? '创建中…' : '小程序招募'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mpShareInfo ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => setMpShareInfo(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-emerald-600/40 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">小程序招募已开通</h3>
                <p className="mt-1 text-xs text-slate-500">
                  商家订单 {mpShareInfo.merchantOrderId} 已标记为已接单，并生成小程序单{' '}
                  <span className="font-mono text-slate-300">{mpShareInfo.mpOrderId}</span>。请将下方路径配置为微信分享或生成小程序码。
                </p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-400">小程序分享路径</label>
            <p className="mt-1 break-all rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200">
              {mpRecruitmentSharePath(mpShareInfo.mpOrderId)}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(mpRecruitmentSharePath(mpShareInfo.mpOrderId))
                    window.alert('分享路径已复制')
                  } catch {
                    window.alert('复制失败，请手动选择路径')
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                <Share2 className="h-4 w-4" />
                复制分享路径
              </button>
              <button
                type="button"
                onClick={() => setMpShareInfo(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {acceptSheetOrder ? (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => !acceptSheetBusy && cancelAcceptSheetFlow()}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-2">
              <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">手动招募：上传达人招募表</h3>
                <p className="mt-1 font-mono text-xs text-slate-400">{acceptSheetOrder.id}</p>
                <p className="mt-2 text-xs text-slate-500">
                  请下载模版填写达人信息后上传。系统将
                  <span className="font-medium text-slate-300">按列智能解析</span>
                  并写入 dev 注册表「达人候选」，且带上本订单号；ERP 端使用本机保存的最近招募订单号筛选达人池。
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href="/达人招募模版.xlsx"
                download="达人招募模版.xlsx"
                className="inline-flex items-center rounded-lg border border-indigo-500/60 bg-indigo-950/40 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-900/50"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                下载模版
              </a>
            </div>
            <label className="mt-4 block text-xs font-medium text-slate-400">选择表格（.xlsx）</label>
            <input
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              disabled={acceptSheetBusy}
              onChange={(e) => setAcceptSheetFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-white"
            />
            {acceptSheetFile ? <p className="mt-2 text-xs text-slate-500">已选：{acceptSheetFile.name}</p> : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={acceptSheetBusy}
                onClick={() => cancelAcceptSheetFlow()}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={acceptSheetBusy}
                onClick={() => void confirmAcceptSheetUpload()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {acceptSheetBusy ? '解析并写入…' : '确认上传并写入达人池'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {alertOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          onClick={() => setAlertOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">配置新订单提醒</h3>
            <p className="mt-2 text-xs text-slate-500">
              以下为 dev 本机偏好：待接单数量增加时可弹出浏览器通知。邮件与 Webhook 需接生产消息服务后生效。
            </p>
            <label className="mt-4 block text-xs text-slate-400">通知邮箱（占位，供后续对接）</label>
            <input
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
              placeholder="name@company.com"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={alertBrowser}
                onChange={(e) => setAlertBrowser(e.target.checked)}
                className="rounded border-slate-600"
              />
              待接单增加时使用浏览器通知（需授权）
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAlertOpen(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void saveAlertPrefs()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
