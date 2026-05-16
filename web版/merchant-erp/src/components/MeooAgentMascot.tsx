import { cn } from '../cn'

type MascotState = 'outputting' | 'idle' | 'userTyping'

function resolveState(aiSending: boolean, inputDraft: string): MascotState {
  if (aiSending) return 'outputting'
  if (inputDraft.trim().length > 0) return 'userTyping'
  return 'idle'
}

/** 待机：2D 卡通静态图 */
const IDLE_SRC = '/meoo-agent-idle.png'
/** 输入中 / 生成中：笔刷书写动图 */
const WRITING_SRC = '/meoo-agent-writing.gif'

/**
 * 墨典智能体输入区旁吉祥物：
 * - idle：静态卡通
 * - userTyping / outputting：书写 GIF 动图
 */
export function MeooAgentMascot({
  aiSending,
  inputDraft,
  className,
}: {
  aiSending: boolean
  inputDraft: string
  className?: string
}) {
  const state = resolveState(aiSending, inputDraft)
  const isWriting = state === 'userTyping' || state === 'outputting'

  return (
    <div
      className={cn('relative flex w-[4.75rem] flex-col items-center select-none', className)}
      aria-hidden
      title="墨典小助手"
    >
      <div className="relative h-[5.5rem] w-[4.5rem] overflow-hidden">
        <img
          src={isWriting ? WRITING_SRC : IDLE_SRC}
          alt=""
          className="h-full w-full object-contain object-bottom [filter:drop-shadow(0_6px_10px_rgba(15,23,42,0.16))]"
          draggable={false}
        />
      </div>
      <span className="mt-0.5 max-w-[4.75rem] truncate text-center text-[9px] font-medium text-indigo-600/90">
        {state === 'outputting' ? '生成中…' : state === 'userTyping' ? '在书写…' : '待机'}
      </span>
    </div>
  )
}
