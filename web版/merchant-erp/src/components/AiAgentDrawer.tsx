import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Shield, X } from 'lucide-react'
import { BRAND_LOGO_URL, BRAND_NAME_SHORT } from '../lib/brand'
import { useEffect, useRef, useState } from 'react'
import { AiAgentComposerBar } from './AiAgentComposerBar'
import { AiAgentMessageBubble } from './AiAgentMessageBubble'
import { AiAgentPreviewActions } from './AiAgentPreviewActions'
import { AiAgentThinkingIndicator } from './AiAgentThinkingIndicator'
import { cn } from '../cn'
import { useAiAgent } from '../context/AiAgentContext'
import type { AiPermissionId } from '../lib/aiAgentTypes'

const PERMISSION_ORDER: AiPermissionId[] = [
  'product',
  'store',
  'influencer',
  'review',
  'local_ads',
  'local_leads',
  'sync',
  'finance_tax',
]

const PERMISSION_BADGE_SHORT: Record<AiPermissionId, string> = {
  product: '商品',
  store: '店铺',
  influencer: '达人',
  review: '评价',
  local_ads: '投流',
  local_leads: '线索',
  sync: '同步',
  finance_tax: '报税',
}

export default function AiAgentDrawer() {
  const {
    drawerOpen,
    closeDrawer,
    pageContext,
    permissions,
    messages,
    applyShortcut,
    isPreviewLoading,
    isPreviewConfirming,
    aiSending,
    agentProfile,
  } = useAiAgent()

  const listRef = useRef<HTMLDivElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    if (!drawerOpen) return
    requestAnimationFrame(() => {
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [drawerOpen, messages, aiSending])

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
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/20">
                    <img src={BRAND_LOGO_URL} alt={BRAND_NAME_SHORT} className="h-8 w-8 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="meoo-ai-agent-title" className="truncate text-base font-semibold tracking-tight">
                      灵祺 AI 助手
                    </h2>
                    <p className="text-xs text-indigo-100/95">可咨询问题，也可生成任务方案</p>
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

            <div className="shrink-0 border-b border-slate-100 px-4 py-2">
              <button
                type="button"
                onClick={() => setShortcutsOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-left text-[11px] font-medium text-slate-600 hover:bg-slate-100/80"
              >
                <span>快捷任务（{agentProfile.shortcuts.length}）</span>
                {shortcutsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {shortcutsOpen ? (
                <div className="mt-2 flex flex-wrap gap-2 pb-1">
                  {agentProfile.shortcuts.map((s) => (
                    <button
                      key={s.type}
                      type="button"
                      disabled={aiSending}
                      onClick={() => applyShortcut(s.type)}
                      className={cn(
                        'rounded-xl border border-indigo-200/80 bg-white px-3 py-1.5 text-xs font-medium text-indigo-800 shadow-sm transition-colors',
                        'hover:border-indigo-300 hover:bg-indigo-50/80',
                        aiSending && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.map((m) => (
                <div key={m.id}>
                  <AiAgentMessageBubble m={m} />
                  {m.role === 'task_preview' && (m.previewStatus ?? 'pending') === 'pending' ? (
                    <AiAgentPreviewActions
                      previewMessageId={m.id}
                      confirmDisabled={
                        isPreviewLoading(m.id) || isPreviewConfirming(m.id) || aiSending
                      }
                      showProductPlatforms={m.preview?.taskType === 'create_product'}
                    />
                  ) : null}
                </div>
              ))}
              {aiSending ? <AiAgentThinkingIndicator /> : null}
            </div>

            <footer className="shrink-0 border-t border-slate-100 bg-white p-3">
              <AiAgentComposerBar layout="dock" />
              <p className="mt-2 text-center text-[10px] text-slate-400">
                涉及创建、修改、删除、发布等操作前将展示预览并由您确认
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
      className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-slate-950 shadow-lg shadow-indigo-900/25 ring-2 ring-cyan-400/40 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
      aria-label="打开灵祺 AI 助手"
      title="AI 助手"
    >
      <img src={BRAND_LOGO_URL} alt="" className="h-11 w-11 object-contain" />
    </button>
  )
}
