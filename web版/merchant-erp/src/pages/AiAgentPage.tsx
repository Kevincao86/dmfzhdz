import {
  Bot,
  CalendarDays,
  ChevronDown,
  FileText,
  Loader2,
  Mic,
  Send,
  Sparkles,
} from 'lucide-react'
import { useAiAgent } from '../context/AiAgentContext'
import { AI_AGENT_SHORTCUTS } from '../lib/aiAgentTypes'
import { cn } from '../cn'

/**
 * 智能体主页：主输入区 + 模型下拉（与 /api/meoo-ai-chat 网关对应，不含任何 API Key）。
 */
export default function AiAgentPage() {
  const {
    inputDraft,
    setInputDraft,
    sendUserText,
    applyShortcut,
    modelPickerKey,
    setModelPickerKey,
    modelPickerOptions,
    aiSending,
    pendingPreviewId,
    openDrawer,
  } = useAiAgent()

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-8 sm:py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">我们该做什么？</h1>
        <p className="mt-2 text-sm text-slate-500">
          选择模型后输入任务或问题；涉及创建、修改、发布等操作会先展示预览，需确认后再走业务接口。
        </p>
        <button
          type="button"
          onClick={() =>
            openDrawer({
              pageLabel: 'AI 智能体',
              pagePath: '/ai-agent',
              suggestedTasks: AI_AGENT_SHORTCUTS.map((s) => s.label),
            })
          }
          className="mt-3 text-xs font-medium text-indigo-600 underline-offset-2 hover:underline"
        >
          在右侧抽屉中继续会话
        </button>
      </div>

      <div className="rounded-3xl border border-slate-200/90 bg-white shadow-sm shadow-slate-900/5 ring-1 ring-slate-100">
        <textarea
          value={inputDraft}
          onChange={(e) => setInputDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendUserText(inputDraft)
            }
          }}
          rows={5}
          disabled={Boolean(pendingPreviewId)}
          placeholder="描述任务或提问，例如：帮我规划一个双人火锅套餐的上架步骤…"
          className="w-full resize-none rounded-t-3xl border-0 bg-transparent px-5 py-4 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5 sm:px-4">
          <p className="hidden min-w-0 flex-1 text-[11px] text-slate-400 sm:block">
            模型由运营在服务端配置；此处仅选择厂商与模型名。
          </p>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="relative">
              <select
                aria-label="选择 AI 模型"
                value={modelPickerKey}
                disabled={aiSending}
                onChange={(e) => setModelPickerKey(e.target.value)}
                className={cn(
                  'h-10 max-w-[min(100vw-8rem,14rem)] cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 py-0 pl-3 pr-9',
                  'text-xs font-medium text-slate-800 hover:border-slate-300 hover:bg-white',
                  'focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100',
                  aiSending && 'cursor-not-allowed opacity-60',
                )}
              >
                {modelPickerOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600"
              title="语音（即将接入）"
              aria-label="语音输入"
              onClick={() => {
                window.alert('语音输入将后续对接浏览器语音识别或服务端 ASR。')
              }}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => sendUserText(inputDraft)}
              disabled={!inputDraft.trim() || aiSending || Boolean(pendingPreviewId)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="发送"
            >
              {aiSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-2">
        <p className="text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">快捷任务</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {AI_AGENT_SHORTCUTS.map((s) => (
            <button
              key={s.type}
              type="button"
              disabled={aiSending || Boolean(pendingPreviewId)}
              onClick={() => applyShortcut(s.type)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm',
                'transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-900',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-indigo-600 ring-1 ring-slate-100">
                {s.type === 'create_product' || s.type === 'generate_copywriting' ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <CalendarDays className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-10 rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/50 to-violet-50/40 p-5">
        <div className="flex gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md">
            <Bot className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 text-sm text-slate-600">
            <p className="font-medium text-slate-800">店魔方 AI 智能体</p>
            <p className="mt-1 leading-relaxed">
              对话经同源网关 <span className="font-mono text-xs text-slate-500">/api/meoo-ai-chat</span>{' '}
              转发至所选厂商；API Key 仅保存在服务端环境变量，不会出现在浏览器。
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-500">
              <li className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                顶部搜索框同样会走网关并发起到右侧抽屉
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
