import { Bot, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { useAiAgent } from '../context/AiAgentContext'

/**
 * AI 智能体工作台入口：打开右侧抽屉并带上本页上下文。
 * 后续可在此放置「会话列表 / 任务队列 / 权限管理」等模块。
 */
export default function AiAgentPage() {
  const { openDrawer } = useAiAgent()

  useEffect(() => {
    openDrawer({
      pageLabel: 'AI 智能体',
      pagePath: '/ai-agent',
      suggestedTasks: [
        '创建商品',
        '招募达人',
        '处理评价',
        '同步平台',
        '分析异常',
        '生成推广文案',
      ],
    })
  }, [openDrawer])

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-violet-50/50 p-8 shadow-sm">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-900/20">
            <Bot className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="erp-page-title text-slate-900">店魔方 AI 智能体</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              已为你打开右侧助手。你可以用自然语言描述任务，或使用快捷按钮；涉及创建、修改、发布等操作前，系统会先展示执行预览，需你确认后再执行。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" />
                顶部搜索框支持关键词检索与 AI 指令（回车发送）
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" />
                右下角悬浮按钮可在任意页面唤起助手
              </li>
              <li className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-500" />
                在「商品管理」等页面可使用场景化入口带入上下文
              </li>
            </ul>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-slate-400">
        当前为前端工作台与演示对话流；接入后端 Agent 与权限校验后，将执行真实业务接口。
      </p>
    </div>
  )
}
