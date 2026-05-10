import {
  Clock,
  Download,
  MessageCircle,
  Send,
  Settings2,
  UserCircle,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../cn'
import { readSupportReplyTemplates, writeSupportReplyTemplates } from '../../lib/opsSupportTemplates'
import {
  formatSupportRelayTime,
  getSupportRelayWsUrl,
  type SupportRelayChatLine,
  type SupportRelayExportResultMessage,
  type SupportRelaySessionMetaMessage,
} from '../../lib/supportRelay'

type SessionRow = { lastText: string; lastTs: number; unread: number }

type SessionProfile = { customerId?: string; enterpriseName?: string }

function shortSessionLabel(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function toDatetimeLocalValue(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function parseDatetimeLocal(s: string): number {
  const t = Date.parse(s)
  return Number.isNaN(t) ? NaN : t
}

function defaultExportRange(): { start: string; end: string } {
  const now = Date.now()
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return { start: toDatetimeLocalValue(d.getTime()), end: toDatetimeLocalValue(now) }
}

function csvEscapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function senderLabelForExport(from: SupportRelayChatLine['from']): string {
  switch (from) {
    case 'user':
      return '商家'
    case 'ops':
      return '客服'
    case 'agent':
      return '人工客服'
    case 'system':
      return '系统'
    case 'bot':
      return '智能助手'
    default:
      return from
  }
}

function buildSupportExportCsv(
  lines: SupportRelayChatLine[],
  profiles: Record<string, SessionProfile>,
): string {
  const header = ['时间', '会话编号', '企业名称', '客户ID', '发送方', '消息内容']
  const rows = lines.map((line) => {
    const prof = profiles[line.sessionId] ?? {}
    const time = new Date(line.ts).toLocaleString('zh-CN')
    return [
      csvEscapeCell(time),
      csvEscapeCell(line.sessionId),
      csvEscapeCell(prof.enterpriseName?.trim() || ''),
      csvEscapeCell(prof.customerId?.trim() || ''),
      csvEscapeCell(senderLabelForExport(line.from)),
      csvEscapeCell(line.text.replace(/\r\n/g, '\n')),
    ].join(',')
  })
  return `\uFEFF${header.join(',')}\n${rows.join('\n')}`
}

function triggerCsvDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function safeFilenamePart(s: string): string {
  return s.replace(/[/\\?*:|"<>]/g, '-').replace(/\s+/g, '_')
}

/** 最后一条非运营回复 → 视为「待回复」 */
function needsOpsReply(lines: SupportRelayChatLine[] | undefined): boolean {
  if (!lines || lines.length === 0) return false
  return lines[lines.length - 1]!.from !== 'ops'
}

export default function OpsSupportWorkbenchPage() {
  const wsRef = useRef<WebSocket | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [relayReady, setRelayReady] = useState(false)
  const [sessions, setSessions] = useState<Record<string, SessionRow>>({})
  const [msgsBySession, setMsgsBySession] = useState<Record<string, SupportRelayChatLine[]>>({})
  const [sessionProfiles, setSessionProfiles] = useState<Record<string, SessionProfile>>({})
  const [listFilter, setListFilter] = useState<'all' | 'unreplied'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [templates, setTemplates] = useState<string[]>(() => readSupportReplyTemplates())
  const [tplEditorOpen, setTplEditorOpen] = useState(false)
  const [tplDraft, setTplDraft] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportStart, setExportStart] = useState('')
  const [exportEnd, setExportEnd] = useState('')
  const [exportScope, setExportScope] = useState<'selected' | 'all'>('all')
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const exportPendingRef = useRef<{
    exportId: string
    resolve: (lines: SupportRelayChatLine[]) => void
  } | null>(null)

  const relayUrl = getSupportRelayWsUrl()
  const relayUrlConfigured =
    typeof import.meta.env.VITE_SUPPORT_RELAY_WS === 'string' &&
    import.meta.env.VITE_SUPPORT_RELAY_WS.trim().length > 0

  const httpPollToken =
    typeof import.meta.env.VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN === 'string'
      ? import.meta.env.VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN.trim()
      : ''
  const useHttpPoll = !relayUrl && Boolean(httpPollToken)
  const maxPollTsRef = useRef(0)
  const [httpPollReady, setHttpPollReady] = useState(false)
  const channelReady = relayUrl ? relayReady : useHttpPoll ? httpPollReady : false

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const applyIncomingChatLine = useCallback((line: SupportRelayChatLine) => {
    const sid = line.sessionId
    const sel = selectedIdRef.current
    const isActive = sel === sid || sel === null
    const cid = line.customerId?.trim()
    const en = line.enterpriseName?.trim()
    if (cid || en) {
      setSessionProfiles((prev) => ({
        ...prev,
        [sid]: {
          customerId: cid || prev[sid]?.customerId,
          enterpriseName: en || prev[sid]?.enterpriseName,
        },
      }))
    }
    setSessions((prev) => {
      const cur = prev[sid]
      const nextUnread = isActive ? 0 : (cur?.unread ?? 0) + 1
      return {
        ...prev,
        [sid]: {
          lastText: line.text,
          lastTs: line.ts,
          unread: nextUnread,
        },
      }
    })
    setMsgsBySession((prev) => {
      const list = prev[sid] ?? []
      if (list.some((x) => x.id === line.id)) return prev
      const core: SupportRelayChatLine = {
        type: 'chat',
        sessionId: sid,
        from: line.from,
        text: line.text,
        ts: line.ts,
        id: line.id,
      }
      return { ...prev, [sid]: [...list, core] }
    })
    setSelectedId((prev) => prev ?? sid)
  }, [])

  useEffect(() => {
    if (!useHttpPoll || !httpPollToken) return

    let cancelled = false

    const tick = async () => {
      if (cancelled) return
      try {
        const since = maxPollTsRef.current
        const res = await fetch(`/api/support-poll?sinceTs=${since}`, {
          headers: { Authorization: `Bearer ${httpPollToken}` },
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          ok?: boolean
          messages?: SupportRelayChatLine[]
        }
        if (!data.ok || !Array.isArray(data.messages)) return
        setHttpPollReady(true)
        const initialSince = since
        for (const raw of data.messages) {
          const line = raw as SupportRelayChatLine
          if (!line.sessionId || !line.id) continue
          applyIncomingChatLine(line)
          maxPollTsRef.current = Math.max(maxPollTsRef.current, line.ts)
        }
        if (initialSince === 0 && maxPollTsRef.current === 0) {
          maxPollTsRef.current = Date.now()
        }
      } catch {
        /* ignore */
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [useHttpPoll, httpPollToken, applyIncomingChatLine])

  useEffect(() => {
    if (!relayUrl) {
      setRelayReady(false)
      return
    }

    let disposed = false
    let reconnectTimer: number | null = null
    let attempt = 0
    let activeWs: WebSocket | null = null

    const connect = () => {
      if (disposed) return
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      try {
        activeWs?.close()
      } catch {
        /* ignore */
      }
      const ws = new WebSocket(relayUrl)
      activeWs = ws
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) {
          try {
            ws.close()
          } catch {
            /* ignore */
          }
          return
        }
        attempt = 0
        ws.send(JSON.stringify({ type: 'identify', role: 'ops' }))
        setRelayReady(true)
      }

      ws.onclose = () => {
        setRelayReady(false)
        if (wsRef.current === ws) wsRef.current = null
        if (disposed || ws !== activeWs) return
        const delay = Math.min(20_000, 500 + attempt * 800)
        attempt += 1
        reconnectTimer = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        setRelayReady(false)
      }

      ws.onmessage = (ev) => {
        let data: unknown
        try {
          data = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (!data || typeof data !== 'object') return
        const typ = (data as { type?: string }).type
        if (typ === 'session_meta') {
          const sm = data as SupportRelaySessionMetaMessage
          const sid = typeof sm.sessionId === 'string' ? sm.sessionId.trim() : ''
          if (!sid) return
          setSessionProfiles((prev) => {
            const legacy =
              'customerName' in sm && typeof (sm as { customerName?: string }).customerName === 'string'
                ? String((sm as { customerName?: string }).customerName || '').trim()
                : ''
            return {
              ...prev,
              [sid]: {
                customerId: sm.customerId?.trim() || prev[sid]?.customerId,
                enterpriseName:
                  sm.enterpriseName?.trim() || legacy || prev[sid]?.enterpriseName,
              },
            }
          })
          setSessions((prev) => {
            if (prev[sid]) return prev
            return { ...prev, [sid]: { lastText: '', lastTs: Date.now(), unread: 0 } }
          })
          setSelectedId((prev) => prev ?? sid)
          return
        }
        if (typ === 'export_result') {
          const er = data as SupportRelayExportResultMessage
          const pending = exportPendingRef.current
          if (pending && er.exportId === pending.exportId) {
            pending.resolve(Array.isArray(er.lines) ? er.lines : [])
          }
          return
        }
        if (typ !== 'chat') return
        applyIncomingChatLine(data as SupportRelayChatLine)
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current === activeWs) wsRef.current = null
      try {
        activeWs?.close()
      } catch {
        /* ignore */
      }
      activeWs = null
    }
  }, [relayUrl, applyIncomingChatLine])

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [selectedId, msgsBySession])

  const sessionIds = useMemo(
    () => Object.keys(sessions).sort((a, b) => sessions[b]!.lastTs - sessions[a]!.lastTs),
    [sessions],
  )

  const filteredSessionIds = useMemo(() => {
    if (listFilter !== 'unreplied') return sessionIds
    return sessionIds.filter((id) => needsOpsReply(msgsBySession[id]))
  }, [sessionIds, listFilter, msgsBySession])

  const unrepliedCount = useMemo(
    () => sessionIds.filter((id) => needsOpsReply(msgsBySession[id])).length,
    [sessionIds, msgsBySession],
  )

  const pickSession = useCallback((id: string) => {
    setSelectedId(id)
    setSessions((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { lastText: '', lastTs: 0, unread: 0 }), unread: 0 },
    }))
  }, [])

  const applyTemplate = (text: string) => {
    setReply((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text))
  }

  const openTplEditor = () => {
    setTplDraft(templates.join('\n'))
    setTplEditorOpen(true)
  }

  const saveTplEditor = () => {
    const lines = tplDraft.split('\n').map((x) => x.trim()).filter(Boolean)
    writeSupportReplyTemplates(lines)
    setTemplates(readSupportReplyTemplates())
    setTplEditorOpen(false)
  }

  const collectLocalExportLines = useCallback(
    (startTs: number, endTs: number, sessionId: string | null): SupportRelayChatLine[] => {
      const ids = sessionId ? [sessionId] : Object.keys(msgsBySession)
      const out: SupportRelayChatLine[] = []
      for (const sid of ids) {
        for (const line of msgsBySession[sid] ?? []) {
          if (line.ts >= startTs && line.ts <= endTs) out.push(line)
        }
      }
      out.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.id.localeCompare(b.id)))
      return out
    },
    [msgsBySession],
  )

  const requestExportLines = useCallback(
    (startTs: number, endTs: number, sessionId: string | null): Promise<SupportRelayChatLine[]> => {
      const local = () => collectLocalExportLines(startTs, endTs, sessionId)
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.resolve(local())
      }
      const exportId = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
          if (exportPendingRef.current?.exportId === exportId) {
            exportPendingRef.current = null
          }
          resolve(local())
        }, 2500)
        exportPendingRef.current = {
          exportId,
          resolve: (lines) => {
            window.clearTimeout(timer)
            exportPendingRef.current = null
            resolve(lines)
          },
        }
        try {
          ws.send(
            JSON.stringify({
              type: 'export_query',
              exportId,
              startTs,
              endTs,
              ...(sessionId ? { sessionId } : {}),
            }),
          )
        } catch {
          window.clearTimeout(timer)
          exportPendingRef.current = null
          resolve(local())
        }
      })
    },
    [collectLocalExportLines],
  )

  const openExportModal = () => {
    const { start, end } = defaultExportRange()
    setExportStart(start)
    setExportEnd(end)
    setExportError(null)
    setExportOpen(true)
  }

  const runExport = async () => {
    setExportError(null)
    const startTs = parseDatetimeLocal(exportStart)
    const endTs = parseDatetimeLocal(exportEnd)
    if (Number.isNaN(startTs) || Number.isNaN(endTs)) {
      setExportError('请填写有效的时间范围')
      return
    }
    if (startTs > endTs) {
      setExportError('开始时间不能晚于结束时间')
      return
    }
    if (exportScope === 'selected' && !selectedId) {
      setExportError('请先在左侧选择一个会话')
      return
    }
    setExportBusy(true)
    try {
      const sessionId = exportScope === 'selected' ? selectedId : null
      const lines = await requestExportLines(startTs, endTs, sessionId)
      if (lines.length === 0) {
        setExportError('该时间段内没有可导出的消息')
        return
      }
      const csv = buildSupportExportCsv(lines, sessionProfiles)
      const fn = `客服对话导出_${safeFilenamePart(new Date(startTs).toLocaleString('zh-CN'))}_${safeFilenamePart(new Date(endTs).toLocaleString('zh-CN'))}.csv`
      triggerCsvDownload(fn, csv)
      setExportOpen(false)
    } catch {
      setExportError('导出失败，请重试')
    } finally {
      setExportBusy(false)
    }
  }

  const sendOpsReply = () => {
    const t = reply.trim()
    const sid = selectedId
    if (!t || !sid) return
    const id = `ops_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const line: SupportRelayChatLine = {
      type: 'chat',
      sessionId: sid,
      from: 'ops',
      text: t,
      ts: Date.now(),
      id,
    }

    const ws = wsRef.current
    if (relayUrl && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(line))
      setReply('')
      setMsgsBySession((prev) => {
        const list = prev[sid] ?? []
        if (list.some((x) => x.id === line.id)) return prev
        return { ...prev, [sid]: [...list, line] }
      })
      setSessions((prev) => ({
        ...prev,
        [sid]: {
          lastText: line.text,
          lastTs: line.ts,
          unread: 0,
        },
      }))
      maxPollTsRef.current = Math.max(maxPollTsRef.current, line.ts)
      return
    }

    if (useHttpPoll && httpPollToken) {
      void (async () => {
        const res = await fetch('/api/support-ops-send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${httpPollToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ sessionId: sid, text: t, id }),
        })
        if (!res.ok) return
        setReply('')
        setMsgsBySession((prev) => {
          const list = prev[sid] ?? []
          if (list.some((x) => x.id === line.id)) return prev
          return { ...prev, [sid]: [...list, line] }
        })
        setSessions((prev) => ({
          ...prev,
          [sid]: {
            lastText: line.text,
            lastTs: line.ts,
            unread: 0,
          },
        }))
        maxPollTsRef.current = Math.max(maxPollTsRef.current, line.ts)
      })()
    }
  }

  const lines = selectedId ? (msgsBySession[selectedId] ?? []) : []

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">在线客服</h1>
        <p className="mt-1 text-sm text-slate-500">
          开发环境可走 WebSocket（/__meoo_support_online）；生产可在 Supabase 表 support_relay_messages 上启用云端同步，并在本项目中配置{' '}
          <code className="rounded bg-black/30 px-1">VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN</code> 与 Vercel 服务端同名密钥及{' '}
          <code className="rounded bg-black/30 px-1">SUPABASE_SERVICE_ROLE_KEY</code>。
        </p>
      </div>

      {!relayUrl && !useHttpPoll ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-900/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-100/90">
          <WifiOff className="h-4 w-4 shrink-0" />
          未配置客服通道：请设置{' '}
          <code className="rounded bg-black/30 px-1">VITE_SUPPORT_RELAY_WS</code>（自建 WS），或在执行迁移 support_relay_messages 后设置{' '}
          <code className="rounded bg-black/30 px-1">VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN</code> 启用云端 HTTP 轮询。
        </div>
      ) : null}

      {relayUrl ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            relayReady
              ? 'border-emerald-900/40 bg-emerald-950/30 text-emerald-100/90'
              : 'border-slate-700 bg-slate-900 text-slate-300'
          }`}
        >
          {relayReady ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          {relayReady
            ? relayUrlConfigured
              ? `已连接 ${relayUrl}`
              : `已连接本机开发服务 ${relayUrl}（可在 .env 中覆盖 VITE_SUPPORT_RELAY_WS）`
            : `正在连接 ${relayUrl}… 请先启动本项目的 npm run dev（终端出现 [support-online-ws] 已挂载）。`}
        </div>
      ) : null}

      {useHttpPoll ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            httpPollReady
              ? 'border-emerald-900/40 bg-emerald-950/30 text-emerald-100/90'
              : 'border-slate-700 bg-slate-900 text-slate-300'
          }`}
        >
          {httpPollReady ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          {httpPollReady
            ? '云端会话同步已启用（HTTP 轮询 Supabase，约每 2 秒刷新）'
            : '正在连接云端会话接口… 请确认 Vercel 已配置 MEOO_SUPPORT_OPS_HTTP_TOKEN 与 SUPABASE_SERVICE_ROLE_KEY。'}
        </div>
      ) : null}

      {tplEditorOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setTplEditorOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white">编辑自动回复模版</h3>
            <p className="mt-1 text-xs text-slate-500">一行一条；点击模版将追加到输入框。</p>
            <textarea
              value={tplDraft}
              onChange={(e) => setTplDraft(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTplEditorOpen(false)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveTplEditor}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="support-export-title"
          onClick={() => !exportBusy && setExportOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="support-export-title" className="text-lg font-semibold text-white">
              导出对话记录
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              按消息时间筛选；开发直连服务会从服务端内存汇总（每会话最多保留最近 200 条）。若网关不支持导出协议，则仅导出本页已加载的消息。
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400">开始时间</label>
                <input
                  type="datetime-local"
                  value={exportStart}
                  onChange={(e) => setExportStart(e.target.value)}
                  disabled={exportBusy}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-400">结束时间</label>
                <input
                  type="datetime-local"
                  value={exportEnd}
                  onChange={(e) => setExportEnd(e.target.value)}
                  disabled={exportBusy}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <p className="text-[11px] font-medium text-slate-400">范围</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={exportBusy}
                    onClick={() => setExportScope('all')}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      exportScope === 'all'
                        ? 'bg-indigo-600/35 text-indigo-100 ring-1 ring-indigo-500/40'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800',
                    )}
                  >
                    全部会话
                  </button>
                  <button
                    type="button"
                    disabled={exportBusy || !selectedId}
                    onClick={() => setExportScope('selected')}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      exportScope === 'selected'
                        ? 'bg-indigo-600/35 text-indigo-100 ring-1 ring-indigo-500/40'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800',
                      !selectedId ? 'opacity-40' : '',
                    )}
                  >
                    当前选中会话
                  </button>
                </div>
              </div>
            </div>
            {exportError ? (
              <p className="mt-3 text-xs text-rose-400">{exportError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => setExportOpen(false)}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={exportBusy || (!relayUrl && !useHttpPoll)}
                onClick={() => void runExport()}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
              >
                {exportBusy ? '导出中…' : '下载 CSV'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-200">实时会话</h2>
            <button
              type="button"
              onClick={openExportModal}
              disabled={!relayUrl && !useHttpPoll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-indigo-500 hover:text-white disabled:pointer-events-none disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              导出对话记录
            </button>
          </div>
          <div className="grid min-h-[22rem] gap-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 lg:grid-cols-[minmax(0,11rem)_1fr]">
            <aside className="border-b border-slate-800 lg:border-b-0 lg:border-r lg:border-slate-800">
              <div className="border-b border-slate-800 p-2">
                <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">会话筛选</p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setListFilter('unreplied')}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
                      listFilter === 'unreplied'
                        ? 'bg-amber-600/35 text-amber-100 ring-1 ring-amber-500/40'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                    )}
                  >
                    未回复
                    {unrepliedCount > 0 ? (
                      <span className="ml-1 rounded-full bg-amber-500/25 px-1 text-[10px]">{unrepliedCount}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setListFilter('all')}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-colors',
                      listFilter === 'all'
                        ? 'bg-indigo-600/35 text-indigo-100 ring-1 ring-indigo-500/40'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200',
                    )}
                  >
                    全部对话
                  </button>
                </div>
              </div>
              <div className="max-h-[min(28rem,70vh)] overflow-y-auto p-2">
                {sessionIds.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-500">
                    暂无会话。打开商家 ERP 右下角在线客服并发消息后，将在此出现会话条目。
                  </p>
                ) : filteredSessionIds.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-slate-500">
                    {listFilter === 'unreplied' ? '当前没有待回复会话。' : '没有匹配的会话。'}
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filteredSessionIds.map((id) => {
                      const row = sessions[id]!
                      const prof = sessionProfiles[id]
                      const displayEnterprise = prof?.enterpriseName?.trim() || '未知企业'
                      const displayCustomerId = prof?.customerId?.trim()
                      const active = id === selectedId
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => pickSession(id)}
                            className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-colors ${
                              active ? 'bg-indigo-600/40 text-white' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate font-medium">{displayEnterprise}</span>
                              {row.unread > 0 ? (
                                <span className="shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  {row.unread > 99 ? '99+' : row.unread}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-[10px] text-slate-400" title={displayCustomerId || ''}>
                              客户ID：{displayCustomerId || '—'}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-600">会话：{shortSessionLabel(id)}</p>
                            {row.lastText ? (
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{row.lastText}</p>
                            ) : null}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </aside>

            <section className="flex min-h-[22rem] flex-col">
              <div className="border-b border-slate-800 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-200">
                  <MessageCircle className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="font-medium">
                    {selectedId
                      ? sessionProfiles[selectedId]?.enterpriseName?.trim() || '未知企业'
                      : '请选择会话'}
                  </span>
                </div>
                {selectedId ? (
                  <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                    <p className="truncate text-slate-300">
                      <span className="text-slate-600">客户ID：</span>
                      {sessionProfiles[selectedId]?.customerId?.trim() || '—'}
                    </p>
                    <p className="truncate font-mono text-slate-600" title={selectedId}>
                      <span className="text-slate-600">会话编号：</span>
                      {selectedId}
                    </p>
                  </div>
                ) : null}
              </div>

              <div
                ref={listRef}
                className="flex-1 space-y-3 overflow-y-auto bg-slate-950/40 p-4 max-h-[min(28rem,70vh)]"
              >
                {!selectedId ? (
                  <p className="py-8 text-center text-sm text-slate-500">从左侧选择会话查看消息流</p>
                ) : lines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">该会话暂无消息记录（或直连服务内存已清空）</p>
                ) : (
                  lines.map((m) => (
                    <div
                      key={m.id}
                      className={`flex gap-2 ${m.from === 'ops' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                          m.from === 'user'
                            ? 'bg-slate-600'
                            : m.from === 'ops'
                              ? 'bg-violet-600'
                              : m.from === 'agent'
                                ? 'bg-emerald-600'
                                : m.from === 'system'
                                  ? 'bg-slate-500'
                                  : m.from === 'bot'
                                    ? 'bg-sky-600'
                                    : 'bg-slate-500'
                        }`}
                      >
                        {m.from === 'user'
                          ? '商'
                          : m.from === 'ops'
                            ? '运'
                            : m.from === 'agent'
                              ? '服'
                              : m.from === 'system'
                                ? '!'
                                : m.from === 'bot'
                                  ? 'AI'
                                  : '?'}
                      </div>
                      <div
                        className={`max-w-[min(100%,28rem)] rounded-2xl px-3 py-2 text-sm ${
                          m.from === 'ops'
                            ? 'bg-violet-600 text-white'
                            : m.from === 'user'
                              ? 'bg-slate-800 text-slate-100 ring-1 ring-slate-700'
                              : 'bg-slate-900 text-slate-100 ring-1 ring-slate-800'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            m.from === 'ops' ? 'text-violet-100/80' : 'text-slate-500'
                          }`}
                        >
                          {formatSupportRelayTime(m.ts)} ·{' '}
                          {m.from === 'user'
                            ? '商家'
                            : m.from === 'ops'
                              ? '运营'
                              : m.from === 'agent'
                                ? '人工客服'
                                : m.from === 'system'
                                  ? '系统'
                                  : m.from === 'bot'
                                    ? '智能助手'
                                    : m.from}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-slate-800 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">自动回复模版</span>
                  <button
                    type="button"
                    onClick={openTplEditor}
                    className="inline-flex items-center gap-1 rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                  >
                    <Settings2 className="h-3 w-3" />
                    管理
                  </button>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {templates.map((t, i) => (
                    <button
                      key={`${i}-${t.slice(0, 8)}`}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      disabled={!selectedId || !channelReady}
                      className="max-w-[14rem] truncate rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-left text-[11px] text-slate-300 hover:border-indigo-600 hover:text-white disabled:opacity-40"
                      title={t}
                    >
                      {t.length > 20 ? `${t.slice(0, 20)}…` : t}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        sendOpsReply()
                      }
                    }}
                    disabled={!selectedId || !channelReady}
                    placeholder={selectedId ? '输入回复…' : '请先选择会话'}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={sendOpsReply}
                    disabled={!selectedId || !channelReady}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                    发送
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <UserCircle className="h-4 w-4 text-indigo-400" />
              使用说明
            </h3>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex gap-2">
                <Clock className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
                先启动本后台 dev，再开商家 ERP dev；会话与回复经本机内存广播（刷新会丢失未持久化历史）。
              </li>
              <li>
                顶部为企业名称（租户 tenants.name）；「客户ID」为商家登录账户编号（如 DMF001）；会话编号为客服通道内唯一标识。
              </li>
              <li>
                「导出对话记录」可按时间段导出 CSV（UTF-8）；直连 dev 服务侧每会话仅缓存最近 200 条，刷新或服务重启后更早记录不可用。
              </li>
              <li>「未回复」表示最后一条消息尚非运营回复；商家侧会话编号仍存于浏览器本地。</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
