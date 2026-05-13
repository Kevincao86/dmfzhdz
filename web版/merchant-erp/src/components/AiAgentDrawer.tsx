import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Loader2,
  Mic,
  Paperclip,
  Send,
  Shield,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { cn } from '../cn'
import { useAiAgent } from '../context/AiAgentContext'
import type { AiAgentMessage, AiPermissionId } from '../lib/aiAgentTypes'
import { AI_AGENT_SHORTCUTS } from '../lib/aiAgentTypes'

const PERMISSION_ORDER: AiPermissionId[] = ['product', 'store', 'influencer', 'review', 'sync']

const PERMISSION_BADGE_SHORT: Record<AiPermissionId, string> = {
  product: '商品',
  store: '店铺',
  influencer: '达人',
  review: '评价',
  sync: '同步',
}

function MessageBubble({ m }: { m: AiAgentMessage }) {
  if (m.role === 'task_preview' && m.preview) {
    return (
      <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-indigo-50/80 p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2 text-violet-900">
          <ClipboardList className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold">执行预览 · 需确认</span>
        </div>
        <p className="text-sm text-slate-700">{m.content}</p>
        <p className="mt-2 text-xs font-medium text-violet-900">{m.preview.title}</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
          {m.preview.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          类型：<span className="font-mono">{m.preview.taskType}</span>
        </p>
      </div>
    )
  }

  if (m.role === 'task_result') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[95%] rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            任务结果
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
        </div>
      </div>
    )
  }

  const isUser = m.role === 'user'
  const isSystem = m.role === 'system'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white'
            : isSystem
              ? 'border border-slate-200 bg-slate-100 text-slate-700'
              : 'border border-slate-100 bg-white text-slate-800',
        )}
      >
        <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
      </div>
    </div>
  )
}

export default function AiAgentDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    pageContext,
    permissions,
    messages,
    inputDraft,
    setInputDraft,
    sendUserText,
    applyShortcut,
    pendingPreviewId,
    confirmPendingTask,
    cancelPendingTask,
    modifyPendingTask,
    modelPickerKey,
    setModelPickerKey,
    modelPickerOptions,
    aiSending,
  } = useAiAgent()

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!drawerOpen) return
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [drawerOpen, messages])

  return (
    <AnimatePresence>
      {drawerOpen ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[70] bg-slate-950/40 backdrop-blur-[2px]"
            aria-label="关闭 AI 抽屉"
            onClick={closeDrawer}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="meoo-ai-agent-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className={cn(
              'fixed right-0 top-0 z-[71] flex h-full w-full max-w-full flex-col border-l border-slate-200/90 bg-white shadow-2xl shadow-slate-900/15 sm:max-w-[520px]',
              'sm:rounded-l-2xl',
            )}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 px-5 py-4 text-white">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                    <Bot className="h-5 w-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2 id="meoo-ai-agent-title" className="truncate text-base font-semibold tracking-tight">
                      店魔方 AI 智能体
                    </h2>
                    <p className="text-xs text-indigo-100/95">可咨询问题，也可执行运营任务</p>
                  </div>
                </div>
                {pageContext?.pageLabel ? (
                  <p className="mt-2 truncate rounded-lg bg-black/15 px-2 py-1 text-[11px] text-indigo-50">
                    上下文：{pageContext.pageLabel}
                    {pageContext.suggestedTasks?.length
                      ? ` · 可执行：${pageContext.suggestedTasks.join('、')}`
                      : ''}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="shrink-0 rounded-xl p-2 text-white/90 transition-colors hover:bg-white/15"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="shrink-0 space-y-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                <span className="text-[11px] font-medium text-slate-600">权限状态</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PERMISSION_ORDER.map((id) => (
                  <span
                    key={id}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1',
                      permissions[id]
                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                        : 'bg-slate-100 text-slate-500 ring-slate-200',
                    )}
                  >
                    {permissions[id] ? '已接入' : '未接入'}
                    {PERMISSION_BADGE_SHORT[id]}权限
                  </span>
                ))}
              </div>
            </div>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">快捷任务</p>
              <div className="flex flex-wrap gap-2">
                {AI_AGENT_SHORTCUTS.map((s) => (
                  <button
                    key={s.type}
                    type="button"
                    disabled={Boolean(pendingPreviewId) || aiSending}
                    onClick={() => applyShortcut(s.type)}
                    className={cn(
                      'rounded-xl border border-indigo-200/80 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 shadow-sm transition-colors',
                      'hover:border-indigo-300 hover:bg-indigo-50/80',
                      pendingPreviewId && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div key={m.id}>
                  <MessageBubble m={m} />
                  {m.role === 'task_preview' && m.id === pendingPreviewId ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-violet-100 pt-3">
                      <button
                        type="button"
                        onClick={confirmPendingTask}
                        className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:brightness-110"
                      >
                        确认执行
                      </button>
                      <button
                        type="button"
                        onClick={modifyPendingTask}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        修改方案
                      </button>
                      <button
                        type="button"
                        onClick={cancelPendingTask}
                        className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-800 hover:bg-red-100"
                      >
                        取消
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            <footer className="shrink-0 border-t border-slate-100 bg-white p-4">
              <div className="mb-2 flex items-center justify-end gap-2">
                <div className="relative max-w-[min(100%,12rem)] flex-1">
                  <select
                    aria-label="选择 AI 模型"
                    value={modelPickerKey}
                    disabled={aiSending}
                    onChange={(e) => setModelPickerKey(e.target.value)}
                    className={cn(
                      'h-9 w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-0 pl-2.5 pr-8',
                      'text-[11px] font-medium text-slate-800 hover:bg-white',
                      aiSending && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {modelPickerOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 ring-1 ring-slate-100">
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-indigo-600"
                  title="附件（即将支持）"
                  aria-label="添加附件"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={inputDraft}
                  onChange={(e) => setInputDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendUserText(inputDraft)
                    }
                  }}
                  rows={2}
                  placeholder="描述你想让 AI 完成的任务..."
                  className="max-h-32 min-h-[2.5rem] min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white hover:text-indigo-600"
                  title="语音（即将接入）"
                  aria-label="语音输入"
                  onClick={() => {
                    window.alert('语音输入能力将对接浏览器语音识别或服务端 ASR，敬请期待。')
                  }}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => sendUserText(inputDraft)}
                  disabled={!inputDraft.trim() || Boolean(pendingPreviewId) || aiSending}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="发送"
                >
                  {aiSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">
                涉及创建、修改、删除、发布等操作前将展示预览并由你确认
              </p>
            </footer>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  )
}

export function AiAgentFloatingButton() {
  const { openDrawer, drawerOpen } = useAiAgent()
  if (drawerOpen) return null
  return (
    <button
      type="button"
      onClick={() => openDrawer()}
      className="pointer-events-auto fixed bottom-32 right-6 z-[58] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/25 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 sm:right-8"
      aria-label="打开店魔方 AI 智能体"
      title="AI 智能体"
    >
      <span className="sr-only">AI</span>
      <Sparkles className="h-6 w-6" aria-hidden />
    </button>
  )
}
