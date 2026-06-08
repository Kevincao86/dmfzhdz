import { BarChart3, Bell, Download, FileSpreadsheet, Film, Share2, Smartphone } from 'lucide-react'
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
import {
  normalizeRecruitmentPlatform,
  RECRUITMENT_PLATFORMS,
  type RecruitmentPlatform,
} from '../../meooRegistryShared/recruitmentInfoFilter'
import { buildMpRecruitmentFieldsForIce, buildMpRecruitmentFieldsFromMerchant } from '../mpRecruitmentFields'
import {
  MP_RECRUIT_ALREADY_SUBMITTED_MSG,
  resolveMpOrderForMerchantOrder,
} from '../mpRecruitmentDedup'
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
    pending: '待处理',
    accepted: '已处理',
    done: '已完成',
    cancelled: '已作废',
    refunded: '已退款',
  }
  return m[s]
}

function orderDetailRows(order: RegistryRecruitmentOrder): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [
    { label: '订单号', value: order.id },
    { label: '客户名称', value: order.customerName },
    { label: '门店', value: order.storeName },
    { label: '门店地址', value: order.storeAddress || '—' },
    { label: '达人', value: `${order.talentName}（${order.talentId}）` },
    { label: '粉丝 / 账号类型', value: `${order.fans.toLocaleString('zh-CN')} · ${order.accountType}` },
    { label: '合作次数', value: String(order.coopTimes) },
    { label: '下单时间', value: order.createdAt },
    { label: '订单状态', value: orderStatusLabel(order.status) },
    { label: '服务费', value: `¥${order.serviceAmount.toLocaleString('zh-CN')}` },
    { label: '佣金比例', value: `${order.commissionPct}%` },
    { label: '实收金额', value: `¥${order.netAmount.toLocaleString('zh-CN')}` },
    { label: '品类', value: order.category || '—' },
    { label: '招募平台', value: order.recruitmentPlatform || order.accountType || '—' },
  ]
  if (order.orderKind === 'recruitment_ice') {
    rows.push({
      label: '云剪成片',
      value: `${order.iceVideoCount ?? order.iceVideoSlots?.length ?? 0} 条`,
    })
  }
  if (order.acceptMode) {
    rows.push({ label: '接单方式', value: order.acceptMode })
  }
  if (order.linkedMpOrderId) {
    rows.push({ label: '关联小程序单', value: order.linkedMpOrderId })
  }
  if (order.infoSummary?.trim()) {
    rows.push({ label: '招募信息详情', value: order.infoSummary.trim() })
  }
  return rows
}

function hasOrderInfoSummary(order: RegistryRecruitmentOrder): boolean {
  return Boolean(order.infoSummary?.trim())
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
  const [detailOrder, setDetailOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [voidConfirmOrder, setVoidConfirmOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [voidBusy, setVoidBusy] = useState(false)
  const [acceptModeChoiceOrder, setAcceptModeChoiceOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [acceptSheetOrder, setAcceptSheetOrder] = useState<RegistryRecruitmentOrder | null>(null)
  const [mpShareInfo, setMpShareInfo] = useState<{ merchantOrderId: string; mpOrderId: string } | null>(null)
  const [mpAcceptBusy, setMpAcceptBusy] = useState(false)
  const [mpRecruitPlatform, setMpRecruitPlatform] = useState<RecruitmentPlatform>('抖音')
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
        new Notification('达人招募：新待处理订单', { body: `当前待处理 ${stats.pending} 条，请及时处理。` })
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

  const applyOrderStatusLocally = (id: string, next: RecruitmentOrderStatus) => {
    setRegistryOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: next } : o)))
    setProcessOrder((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur))
    setAcceptModeChoiceOrder((cur) => (cur && cur.id === id ? { ...cur, status: next } : cur))
  }

  const changeOrderStatus = async (id: string, next: RecruitmentOrderStatus) => {
    setPatchBusyId(id)
    try {
      const r = await patchRecruitmentOrder({ id, status: next })
      if (!r.ok) {
        window.alert(r.error ?? '更新失败')
        return
      }
      applyOrderStatusLocally(id, next)
      await loadRegistry()
    } finally {
      setPatchBusyId(null)
    }
  }

  /** 运营点击「已处理」并选择招募方式时写入注册表 */
  const ensureOrderAccepted = async (
    order: RegistryRecruitmentOrder,
  ): Promise<RegistryRecruitmentOrder | null> => {
    if (order.status !== 'pending') return order
    const r = await patchRecruitmentOrder({ id: order.id, status: 'accepted' })
    if (!r.ok) {
      window.alert(r.error ?? '标记已处理失败')
      return null
    }
    const next = { ...order, status: 'accepted' as const }
    applyOrderStatusLocally(order.id, 'accepted')
    return next
  }

  const openProcessOrder = (order: RegistryRecruitmentOrder) => {
    setProcessOrder(order)
  }

  const voidOrder = async (order: RegistryRecruitmentOrder) => {
    setVoidBusy(true)
    try {
      const r = await patchRecruitmentOrder({ id: order.id, status: 'cancelled' })
      if (!r.ok) {
        window.alert(r.error ?? '作废失败')
        return
      }
      applyOrderStatusLocally(order.id, 'cancelled')
      setVoidConfirmOrder(null)
      setProcessOrder((cur) => (cur?.id === order.id ? null : cur))
      setDetailOrder((cur) => (cur?.id === order.id ? null : cur))
      await loadRegistry()
    } finally {
      setVoidBusy(false)
    }
  }

  const guardMerchantMpRecruitmentDup = async (
    order: RegistryRecruitmentOrder,
  ): Promise<RegistryMpRecruitmentOrder | null> => {
    try {
      const reg = await fetchRegistry()
      const existing = resolveMpOrderForMerchantOrder(reg.mpRecruitmentOrders, order)
      if (existing) {
        window.alert(`${MP_RECRUIT_ALREADY_SUBMITTED_MSG}\n关联小程序单号：${existing.id}`)
        return existing
      }
    } catch {
      /* 网络异常时仍允许进入下一步，由服务端 append 去重 */
    }
    return null
  }

  const openAcceptModeChoice = async (order: RegistryRecruitmentOrder) => {
    const existing = await guardMerchantMpRecruitmentDup(order)
    if (existing) {
      if (order.status === 'pending') {
        const acceptMode =
          existing.orderKind === 'recruitment_ice' || existing.hall === 'ice' ? 'ice' : 'miniprogram'
        const r = await patchRecruitmentOrder({
          id: order.id,
          status: 'accepted',
          linkedMpOrderId: existing.id,
          acceptMode,
        })
        if (!r.ok) {
          window.alert(r.error ?? '同步已处理状态失败')
          return
        }
        applyOrderStatusLocally(order.id, 'accepted')
        await loadRegistry()
      }
      setMpShareInfo({ merchantOrderId: order.id, mpOrderId: existing.id })
      return
    }
    const accepted = await ensureOrderAccepted(order)
    if (!accepted) return
    setProcessOrder(null)
    setMpRecruitPlatform(normalizeRecruitmentPlatform(accepted.recruitmentPlatform || accepted.accountType))
    setMpHallKind('normal')
    setAcceptModeChoiceOrder(accepted)
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
      const existing = resolveMpOrderForMerchantOrder(reg.mpRecruitmentOrders, order)
      if (existing) {
        window.alert(`${MP_RECRUIT_ALREADY_SUBMITTED_MSG}\n关联小程序单号：${existing.id}`)
        setAcceptModeChoiceOrder(null)
        if (order.status === 'pending') {
          const r = await patchRecruitmentOrder({
            id: order.id,
            status: 'accepted',
            linkedMpOrderId: existing.id,
            acceptMode: 'miniprogram',
          })
          if (r.ok) applyOrderStatusLocally(order.id, 'accepted')
        }
        setMpShareInfo({ merchantOrderId: order.id, mpOrderId: existing.id })
        await loadRegistry()
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
        fulfillmentLoop: 'open',
        publisherIdentity: 'merchant',
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
      applyOrderStatusLocally(order.id, 'accepted')
      await loadRegistry()
    } finally {
      setMpAcceptBusy(false)
    }
  }

  const confirmIceAccept = async (order: RegistryRecruitmentOrder) => {
    setMpAcceptBusy(true)
    try {
      const reg = await fetchRegistry()
      const existing = resolveMpOrderForMerchantOrder(reg.mpRecruitmentOrders, order)
      if (existing) {
        window.alert(`${MP_RECRUIT_ALREADY_SUBMITTED_MSG}\n关联小程序单号：${existing.id}`)
        setAcceptModeChoiceOrder(null)
        if (order.status === 'pending') {
          const r = await patchRecruitmentOrder({
            id: order.id,
            status: 'accepted',
            linkedMpOrderId: existing.id,
            acceptMode: 'ice',
          })
          if (r.ok) applyOrderStatusLocally(order.id, 'accepted')
        }
        setMpShareInfo({ merchantOrderId: order.id, mpOrderId: existing.id })
        await loadRegistry()
        return
      }

      const slots = (order.iceVideoSlots ?? []).map((s) => ({
        slotId: s.slotId,
        label: s.label,
        downloadUrl: s.downloadUrl,
        iceJobId: s.iceJobId,
      }))
      const n = order.iceVideoCount ?? slots.length
      if (!slots.length) {
        window.alert('该云剪订单缺少成片链接，请让商户在 ERP 重新派发达人投放。')
        return
      }

      const now = new Date().toLocaleString('zh-CN', { hour12: false })
      const mpId = `MP-ICE-${Date.now()}`
      const fields = buildMpRecruitmentFieldsForIce(order)
      const mpOrder: RegistryMpRecruitmentOrder = {
        id: mpId,
        sourceMerchantOrderId: order.id,
        customerName: order.customerName,
        storeName: order.storeName,
        status: 'open',
        createdAt: now,
        updatedAt: now,
        applicants: [],
        orderKind: 'recruitment_ice',
        hall: 'ice',
        fulfillmentLoop: 'closed',
        iceVideoSlots: slots,
        publisherIdentity: 'merchant',
        ...fields,
        recruitCount: n,
      }
      const append = await appendMpRecruitmentOrder(mpOrder)
      if (!append.ok) {
        const msg =
          append.error === 'duplicate_merchant_order'
            ? '该商家订单已有小程序招募单，不可重复创建。'
            : (append.error ?? '创建云剪小程序单失败')
        window.alert(msg)
        return
      }
      const patch = await patchRecruitmentOrder({
        id: order.id,
        status: 'accepted',
        acceptMode: 'ice',
        linkedMpOrderId: mpId,
        recruitmentPlatform: '抖音',
      })
      if (!patch.ok) {
        window.alert(`云剪单已创建，但商家订单状态更新失败：${patch.error ?? ''}`)
      } else {
        applyOrderStatusLocally(order.id, 'accepted')
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
        window.alert(`达人已写入，但订单状态更新失败：${patch.error ?? ''}。请在列表中手动改为已处理。`)
      } else {
        applyOrderStatusLocally(acceptSheetOrder.id, 'accepted')
      }
      window.alert(`已智能解析并写入 ${candidates.length} 条达人至共享达人池（已关联订单 ${acceptSheetOrder.id}），订单已标记为已处理。请在 ERP「达人池确认」查看。`)
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
          { label: '待处理', value: stats.pending },
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
          <option value="pending">待处理</option>
          <option value="accepted">已处理</option>
          <option value="done">已完成</option>
          <option value="cancelled">已作废</option>
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
                      {o.orderKind === 'recruitment_ice' ? (
                        <>
                          云剪 {o.iceVideoCount ?? o.iceVideoSlots?.length ?? o.fans} 条
                          <div className="text-violet-400/90">云剪（招募、云剪）</div>
                        </>
                      ) : (
                        <>
                          {o.fans.toLocaleString('zh-CN')} · {o.accountType}
                          <div className="text-slate-600">合作 {o.coopTimes} 次</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-500">{o.createdAt}</td>
                    <td className="px-3 py-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', orderStatusStyle(o.status))}>
                        {orderStatusLabel(o.status)}
                      </span>
                    </td>
                    <td className="max-w-[12rem] px-3 py-2 align-top">
                      {hasOrderInfoSummary(o) ? (
                        <button
                          type="button"
                          onClick={() => setDetailOrder(o)}
                          className="group w-full max-w-[12rem] text-left"
                          title="点击查看完整招募信息"
                        >
                          <p className="line-clamp-2 text-xs leading-relaxed text-slate-500 group-hover:text-slate-300">
                            {o.infoSummary!.trim()}
                          </p>
                          <span className="mt-1 inline-block text-[11px] text-indigo-400 group-hover:underline">
                            查看详情
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-300">
                      <div>¥{o.serviceAmount.toLocaleString('zh-CN')}</div>
                      <div className="text-[10px] text-slate-600">
                        佣 {o.commissionPct}% → 实收 ¥{o.netAmount.toLocaleString('zh-CN')}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-x-2 gap-y-1">
                        <button
                          type="button"
                          onClick={() => setDetailOrder(o)}
                          className="text-xs text-slate-400 hover:text-white hover:underline"
                        >
                          查看信息详情
                        </button>
                        <button
                          type="button"
                          disabled={patchBusyId === o.id}
                          onClick={() => openProcessOrder(o)}
                          className="text-xs text-indigo-400 hover:underline disabled:opacity-50"
                        >
                          处理
                        </button>
                        {o.status !== 'cancelled' && o.status !== 'refunded' ? (
                          <button
                            type="button"
                            disabled={voidBusy && voidConfirmOrder?.id === o.id}
                            onClick={() => setVoidConfirmOrder(o)}
                            className="text-xs text-rose-400 hover:underline disabled:opacity-50"
                          >
                            作废
                          </button>
                        ) : null}
                      </div>
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
              {processOrder.orderKind === 'recruitment_ice' ? (
                <p className="text-xs text-violet-300/90">
                  云剪（招募、云剪）· 成片 {processOrder.iceVideoCount ?? processOrder.iceVideoSlots?.length ?? 0} 条
                </p>
              ) : null}
              {(processOrder.acceptMode === 'miniprogram' || processOrder.acceptMode === 'ice') &&
              processOrder.linkedMpOrderId ? (
                <p className="text-xs text-emerald-400/90">
                  {processOrder.acceptMode === 'ice' ? '云剪单' : '小程序招募'} ·{' '}
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
            {(processOrder as RegistryRecruitmentOrder & { paymentState?: string }).paymentState ===
            'awaiting_ops_paid' ? (
              <button
                type="button"
                disabled={patchBusyId === processOrder.id}
                onClick={async () => {
                  setPatchBusyId(processOrder.id)
                  try {
                    const r = await patchRecruitmentOrder({
                      id: processOrder.id,
                      paymentState: 'paid',
                      workflowStage: 'completed',
                      status: 'done',
                    })
                    if (!r.ok) {
                      window.alert(r.error ?? '更新失败')
                      return
                    }
                    if (processOrder.linkedMpOrderId) {
                      await fetch('/api/ops-sync/mp-recruitment-orders/patch', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: processOrder.linkedMpOrderId, status: 'done' }),
                      })
                    }
                    window.alert('已确认打款，星选达人将收到到账通知（站内信需另行配置或手动触达）。')
                    setProcessOrder(null)
                    await loadRegistry()
                  } finally {
                    setPatchBusyId(null)
                  }
                }}
                className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                确认已打款（通知达人 · 订单完结）
              </button>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  ['pending', '待处理'],
                  ['accepted', '已处理'],
                  ['done', '已完成'],
                  ['cancelled', '已作废'],
                  ['refunded', '已退款'],
                ] as const
              ).map(([st, label]) => (
                <button
                  key={st}
                  type="button"
                  disabled={patchBusyId === processOrder.id || processOrder.status === st}
                  onClick={() => {
                    if (st === 'accepted' && processOrder.status === 'pending') {
                      void openAcceptModeChoice(processOrder)
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
            <div className="mt-4 flex flex-wrap justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailOrder(processOrder)
                  }}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                >
                  查看信息详情
                </button>
                {processOrder.status !== 'cancelled' && processOrder.status !== 'refunded' ? (
                  <button
                    type="button"
                    disabled={voidBusy}
                    onClick={() => setVoidConfirmOrder(processOrder)}
                    className="rounded-lg border border-rose-500/50 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/40 disabled:opacity-50"
                  >
                    作废
                  </button>
                ) : null}
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
              </div>
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

      {detailOrder ? (
        <div
          className="fixed inset-0 z-[82] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          onClick={() => setDetailOrder(null)}
        >
          <div
            className="flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-800 px-5 py-4">
              <h3 className="text-lg font-semibold text-white">招募信息详情</h3>
              <p className="mt-1 font-mono text-xs text-slate-400">{detailOrder.id}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <dl className="space-y-3">
                {orderDetailRows(detailOrder).map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {row.label}
                    </dt>
                    <dd
                      className={cn(
                        'mt-1 text-sm text-slate-200',
                        row.label === '招募信息详情' && 'whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-xs leading-relaxed text-slate-300',
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {voidConfirmOrder ? (
        <div
          className="fixed inset-0 z-[92] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          onClick={() => !voidBusy && setVoidConfirmOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">确认作废订单</h3>
            <p className="mt-2 text-sm text-slate-300">
              确定作废订单 <span className="font-mono text-rose-200">{voidConfirmOrder.id}</span> 吗？
            </p>
            <p className="mt-2 text-xs text-slate-500">
              作废后订单状态将变为「已作废」，商户侧招募需求将不再继续流转。此操作不可撤销。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                disabled={voidBusy}
                onClick={() => setVoidConfirmOrder(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={voidBusy}
                onClick={() => void voidOrder(voidConfirmOrder)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {voidBusy ? '作废中…' : '确认作废'}
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
            <h3 className="text-lg font-semibold text-white">已处理：选择招募方式</h3>
            <p className="mt-1 font-mono text-xs text-slate-400">{acceptModeChoiceOrder.id}</p>
            <p className="mt-3 text-xs text-slate-500">
              {acceptModeChoiceOrder.orderKind === 'recruitment_ice'
                ? '云剪单将下发至达人小程序「云剪任务」大厅；每位达人认领后分配一条成片，回传抖音链接后 AI 核查。'
                : '手动招募需下载模版上传表格解析；小程序招募将自动创建达人招募小程序订单并填入商家要求。'}
            </p>
            {acceptModeChoiceOrder.orderKind === 'recruitment_ice' ? (
              <div className="mt-4 rounded-lg border border-violet-500/40 bg-violet-950/30 px-3 py-2 text-xs text-violet-100">
                云剪视频数量：{' '}
                <span className="font-semibold tabular-nums">
                  {acceptModeChoiceOrder.iceVideoCount ??
                    acceptModeChoiceOrder.iceVideoSlots?.length ??
                    0}
                </span>{' '}
                条 · 需 {acceptModeChoiceOrder.iceVideoCount ?? acceptModeChoiceOrder.iceVideoSlots?.length ?? 0} 位达人认领发布
              </div>
            ) : null}
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400">下发小程序平台</label>
              <select
                value={mpRecruitPlatform}
                disabled={mpAcceptBusy || acceptModeChoiceOrder.orderKind === 'recruitment_ice'}
                onChange={(e) => setMpRecruitPlatform(e.target.value as RecruitmentPlatform)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
              >
                {RECRUITMENT_PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-slate-600">小红书招募单不展示带货等级；报名表单字段随平台切换。</p>
            </div>
            {acceptModeChoiceOrder.orderKind !== 'recruitment_ice' ? (
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
            ) : null}
            <div className={cn('mt-5 grid gap-2', acceptModeChoiceOrder.orderKind === 'recruitment_ice' ? '' : 'sm:grid-cols-2')}>
              {acceptModeChoiceOrder.orderKind !== 'recruitment_ice' ? (
              <button
                type="button"
                disabled={mpAcceptBusy}
                onClick={() => openAcceptSheetFlow(acceptModeChoiceOrder)}
                className="flex items-center justify-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-950/30 px-4 py-3 text-sm font-medium text-indigo-100 hover:bg-indigo-900/40 disabled:opacity-50"
              >
                <FileSpreadsheet className="h-4 w-4" />
                手动招募
              </button>
              ) : null}
              {acceptModeChoiceOrder.orderKind === 'recruitment_ice' ? (
              <button
                type="button"
                disabled={mpAcceptBusy}
                onClick={() => {
                  void (async () => {
                    const hit = await guardMerchantMpRecruitmentDup(acceptModeChoiceOrder)
                    if (hit) return
                    void confirmIceAccept(acceptModeChoiceOrder)
                  })()
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-violet-500/50 bg-violet-950/30 px-4 py-3 text-sm font-medium text-violet-100 hover:bg-violet-900/40 disabled:opacity-50"
              >
                <Film className="h-4 w-4" />
                {mpAcceptBusy ? '创建中…' : '云剪单'}
              </button>
              ) : (
              <button
                type="button"
                disabled={mpAcceptBusy}
                onClick={() => {
                  void (async () => {
                    const hit = await guardMerchantMpRecruitmentDup(acceptModeChoiceOrder)
                    if (hit) return
                    void confirmMiniprogramAccept(acceptModeChoiceOrder)
                  })()
                }}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-950/30 px-4 py-3 text-sm font-medium text-emerald-100 hover:bg-emerald-900/40 disabled:opacity-50"
              >
                <Smartphone className="h-4 w-4" />
                {mpAcceptBusy ? '创建中…' : '小程序招募'}
              </button>
              )}
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
                  商家订单 {mpShareInfo.merchantOrderId} 已标记为已处理，并生成小程序单{' '}
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
              以下为 dev 本机偏好：待处理数量增加时可弹出浏览器通知。邮件与 Webhook 需接生产消息服务后生效。
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
              待处理增加时使用浏览器通知（需授权）
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
