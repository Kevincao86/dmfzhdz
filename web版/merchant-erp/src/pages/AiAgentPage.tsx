import {
  Bot,
  Clapperboard,
  MessageSquarePlus,
  MessagesSquare,
  Sparkles,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AiAgentComposerBar } from '../components/AiAgentComposerBar'
import { AiAgentMessageBubble } from '../components/AiAgentMessageBubble'
import { AiAgentPreviewActions } from '../components/AiAgentPreviewActions'
import { AiAgentThinkingIndicator } from '../components/AiAgentThinkingIndicator'
import { useAiAgent } from '../context/AiAgentContext'
import { cn } from '../cn'

const ShortVideoOptimizationPage = lazy(() => import('./ShortVideoOptimizationPage'))

const INFO_COPY = {
  title: '灵祺 AI 助手',
  body: '我会协助您处理门店经营里的咨询和任务草稿。涉及改价、上架、发消息等操作时，会先给您看执行说明，由您确认后再提交，避免误操作。',
  bullet: '您也可以从顶部搜索框发起指令，在右侧抽屉里继续同一段对话。',
}

type AgentWorkspace = 'chat' | 'shortvideo'

/**
 * 智能体主页：对话助手 + 短视频出片同页切换，减少去「短视频 AI 处理」单独开页。
 */
export default function AiAgentPage() {
  const {
    messages,
    openDrawer,
    applyShortcut,
    aiSending,
    streamingReply,
    isPreviewLoading,
    isPreviewConfirming,
    archivedSessions,
    startNewChat,
    resumeArchivedSession,
    sidebarActiveArchiveId,
    agentProfile,
  } = useAiAgent()

  const hasChat = useMemo(() => messages.some((m) => m.role === 'user'), [messages])
  const scrollRef = useRef<HTMLDivElement>(null)
  const [workspace, setWorkspace] = useState<AgentWorkspace>('chat')

  const confirmDisabledFor = (previewMessageId: string) =>
    isPreviewLoading(previewMessageId) || isPreviewConfirming(previewMessageId) || aiSending

  useEffect(() => {
    if (!hasChat || workspace !== 'chat') return
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [messages, hasChat, aiSending, streamingReply, workspace])

  const workspaceTabs = (
    <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => setWorkspace('chat')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition',
          workspace === 'chat'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
        )}
      >
        <MessagesSquare className="h-4 w-4" aria-hidden />
        对话助手
      </button>
      <button
        type="button"
        onClick={() => setWorkspace('shortvideo')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition',
          workspace === 'shortvideo'
            ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/25'
            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
        )}
      >
        <Clapperboard className="h-4 w-4" aria-hidden />
        短视频出片
      </button>
    </div>
  )

  if (workspace === 'shortvideo') {
    return (
      <div className="mx-auto w-full min-w-0 max-w-6xl px-1 py-4 sm:px-2 sm:py-6">
        <div className="mb-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">我们该做什么？</h1>
          <p className="mt-2 text-sm text-slate-500">对话与短视频出片同页切换，无需再进侧栏「短视频 AI 处理」</p>
        </div>
        {workspaceTabs}
        <Suspense
          fallback={
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
              正在加载短视频创作台…
            </div>
          }
        >
          <ShortVideoOptimizationPage embed />
        </Suspense>
      </div>
    )
  }

  return (
    <div
      className={cn(
        hasChat
          ? 'flex h-[calc(100dvh-7.5rem)] max-h-[calc(100dvh-7.5rem)] w-full min-h-0 flex-1 flex-col gap-0 -mx-6 -mb-6 lg:-mx-8 lg:flex-row'
          : 'mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-8 sm:py-12',
      )}
    >
      {!hasChat ? (
        <>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">我们该做什么？</h1>
            <p className="mt-2 text-sm text-slate-500">
              <span className="mr-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                {agentProfile.planLabel}
              </span>
              {agentProfile.composerHint}
            </p>
            <button
              type="button"
              onClick={() =>
                openDrawer({
                  pageLabel: 'AI 智能体',
                  pagePath: '/ai-agent',
                  suggestedTasks: agentProfile.shortcuts.map((s) => s.label),
                })
              }
              className="mt-3 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
            >
              在右侧抽屉中继续会话
            </button>
          </div>

          {workspaceTabs}

          <AiAgentComposerBar layout="centered" />

          <div className="mt-5">
            <p className="mb-2.5 text-center text-xs font-medium text-slate-500">
              快捷任务（{agentProfile.shortcuts.length}）· 点击即可开始
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {agentProfile.shortcuts.map((s) => (
                <button
                  key={s.type}
                  type="button"
                  disabled={aiSending}
                  onClick={() => applyShortcut(s.type)}
                  className={cn(
                    'rounded-full border border-slate-200/90 bg-white px-3 py-2.5 text-center text-sm font-medium text-slate-700 shadow-sm',
                    'transition hover:border-indigo-300 hover:bg-indigo-50/70 hover:text-indigo-900',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/50 to-violet-50/40 p-5">
            <div className="flex gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md">
                <Bot className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 text-sm text-slate-600">
                <p className="font-medium text-slate-800">{INFO_COPY.title}</p>
                <p className="mt-1 leading-relaxed">{INFO_COPY.body}</p>
                <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
                  <li className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                    {INFO_COPY.bullet}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Clapperboard className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                    点上方「短视频出片」可同页打开 Seedance 创作台，无需切换侧栏菜单。
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <aside className="flex shrink-0 flex-col border-b border-slate-200/90 bg-gradient-to-b from-slate-50 to-white lg:w-[12rem] lg:border-b-0 lg:border-r lg:border-slate-200/90">
            <div className="space-y-2 p-2 lg:p-3">
              <button
                type="button"
                disabled={aiSending}
                onClick={() => startNewChat()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200/90 bg-white px-2 py-2 text-xs font-medium text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50 lg:justify-start lg:px-3"
              >
                <MessageSquarePlus className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
                <span className="truncate">返回新建对话</span>
              </button>
              <button
                type="button"
                onClick={() => setWorkspace('shortvideo')}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-200/90 bg-cyan-50 px-2 py-2 text-xs font-medium text-cyan-900 shadow-sm transition hover:bg-cyan-100 lg:justify-start lg:px-3"
              >
                <Clapperboard className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">短视频出片</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 border-t border-slate-200/70 lg:border-t-0">
              <p className="hidden px-3 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-400 lg:block">
                本次对话
              </p>
              {archivedSessions.length === 0 ? (
                <p className="hidden px-3 py-2 text-[11px] leading-snug text-slate-400 lg:block">
                  开始新对话时，当前主题会自动存档，最多保留 10 条。
                </p>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto px-2 py-2 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-2 lg:pb-3">
                  {archivedSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={aiSending}
                      onClick={() => resumeArchivedSession(s.id)}
                      title={s.title}
                      className={cn(
                        'shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition lg:w-full lg:truncate',
                        sidebarActiveArchiveId === s.id
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                          : 'border-transparent bg-slate-100/90 text-slate-600 hover:border-slate-200 hover:bg-white',
                        aiSending && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <span className="line-clamp-2 lg:line-clamp-3">{s.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl space-y-3 px-4 py-2 sm:space-y-4 sm:py-3">
                {messages.map((m) => (
                  <div key={m.id}>
                    <AiAgentMessageBubble m={m} />
                    {m.role === 'task_preview' && (m.previewStatus ?? 'pending') === 'pending' ? (
                      <AiAgentPreviewActions
                        previewMessageId={m.id}
                        confirmDisabled={confirmDisabledFor(m.id)}
                        showProductPlatforms={m.preview?.taskType === 'create_product'}
                      />
                    ) : null}
                  </div>
                ))}
                {aiSending && !messages.some((m) => m.isStreaming) ? (
                  <AiAgentThinkingIndicator />
                ) : null}
              </div>
            </div>

            <div className="shrink-0 border-t border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85">
              <div className="mx-auto w-full max-w-3xl">
                <AiAgentComposerBar layout="dock" />
              </div>
              <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-slate-400">
                涉及创建、修改、删除、发布等操作前将展示预览并由您确认
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
