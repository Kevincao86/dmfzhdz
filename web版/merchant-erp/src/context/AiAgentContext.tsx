import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AiAgentMessage,
  AiAgentOpenContext,
  AiPermissionId,
  AiTaskPreviewPayload,
  AiTaskType,
} from '../lib/aiAgentTypes'
import { AI_TASK_TYPE_LABELS, createAgentMessage } from '../lib/aiAgentTypes'
import { listAiModelPickerOptions, parseAiModelPickerKey } from '../services/ai/modelRegistry'
import { postAiChat } from '../services/ai/aiClient'
import type { AIMessage } from '../services/ai/types'

const PREFS_KEY = 'meoo_ai_model_picker_key'

function loadPickerKey(): string {
  const fallback = listAiModelPickerOptions()[0]?.key ?? 'tokenmix::openai::__default__'
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const opts = listAiModelPickerOptions()
    return opts.some((o) => o.key === raw) ? raw : fallback
  } catch {
    return fallback
  }
}

function savePickerKey(key: string): void {
  try {
    localStorage.setItem(PREFS_KEY, key)
  } catch {
    /* ignore */
  }
}

function inferTaskType(t: string): AiTaskType | undefined {
  if (/创建|商品|套餐|上架|双人|单人/.test(t)) return 'create_product'
  if (/达人|招募|探店/.test(t)) return 'recruit_influencer'
  if (/差评|评价|评论/.test(t)) return 'handle_review'
  if (/分析|原因|异常/.test(t)) return 'analyze_exception'
  if (/同步|失败/.test(t)) return 'sync_platform'
  return undefined
}

function agentMessagesToChatMessages(msgs: AiAgentMessage[]): AIMessage[] {
  const out: AIMessage[] = []
  for (const m of msgs) {
    if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out.slice(-24)
}

type AiAgentContextValue = {
  drawerOpen: boolean
  openDrawer: (ctx?: AiAgentOpenContext) => void
  closeDrawer: () => void
  pageContext: AiAgentOpenContext | null
  permissions: Record<AiPermissionId, boolean>
  messages: AiAgentMessage[]
  inputDraft: string
  setInputDraft: (v: string) => void
  sendUserText: (text: string) => void
  applyShortcut: (taskType: AiTaskType) => void
  pendingPreviewId: string | null
  confirmPendingTask: () => void
  cancelPendingTask: () => void
  modifyPendingTask: () => void
  submitTopSearchQuery: (query: string) => void
  /** 多模型：下拉 key，与 modelRegistry 中 listAiModelPickerOptions 一致 */
  modelPickerKey: string
  setModelPickerKey: (key: string) => void
  modelPickerOptions: ReturnType<typeof listAiModelPickerOptions>
  aiSending: boolean
}

const AiAgentContext = createContext<AiAgentContextValue | null>(null)

function buildPreviewForTask(taskType: AiTaskType, pageLabel?: string): AiTaskPreviewPayload {
  const ctxLine = pageLabel ? `页面上下文：${pageLabel}` : ''
  switch (taskType) {
    case 'create_product':
      return {
        taskType,
        title: '创建商品任务',
        steps: [
          ...(ctxLine ? [ctxLine] : []),
          '解析商品类型与适用平台（抖音来客 / 美团 / 小红书等）',
          '生成 3 个候选商品标题与套餐结构草稿',
          '校验类目模板字段与图片规范',
          '在确认后调用商品创建流程并写入草稿或提交审核',
        ],
      }
    case 'recruit_influencer':
      return {
        taskType,
        title: '达人招募任务',
        steps: [
          '根据门店与城市筛选达人池与粉丝量级',
          '生成招募话术与报价区间建议',
          '创建邀约批次并等待你确认后发送',
        ],
      }
    case 'handle_review':
      return {
        taskType,
        title: '评价处理任务',
        steps: [
          '拉取最近差评与中评列表',
          '生成回复草稿（可多条）',
          '在确认后提交至平台或标记为已跟进',
        ],
      }
    case 'sync_platform':
      return {
        taskType,
        title: '平台同步任务',
        steps: [
          '比对 ERP 与各平台商品/库存差异',
          '生成同步项清单（新增、更新、下架）',
          '在确认后逐项调用同步接口并输出结果报告',
        ],
      }
    case 'analyze_exception':
      return {
        taskType,
        title: '异常分析任务',
        steps: [
          '聚合最近同步失败、审核驳回、接口报错日志',
          '归纳根因类别（权限、字段、图片、类目变更等）',
          '输出修复建议清单；高风险项需你二次确认后再改',
        ],
      }
    case 'generate_copywriting':
    default:
      return {
        taskType: 'generate_copywriting',
        title: '推广文案生成',
        steps: [
          '读取商品/活动卖点与限制词表',
          '生成多平台适配文案（标题、短描述、话题标签）',
          '在确认后写入素材库或同步至投放草稿',
        ],
      }
  }
}

export function AiAgentProvider({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pageContext, setPageContext] = useState<AiAgentOpenContext | null>(null)
  const [messages, setMessages] = useState<AiAgentMessage[]>(() => [
    createAgentMessage(
      'assistant',
      '你好，我是店魔方 AI 智能体。在下方选择模型后输入问题或任务；写操作前我会展示执行预览，需你确认后再走业务接口。',
    ),
  ])
  const [inputDraft, setInputDraft] = useState('')
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null)
  const [modelPickerKey, setModelPickerKeyState] = useState('tokenmix::openai::__default__')
  const [aiSending, setAiSending] = useState(false)

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    setModelPickerKeyState(loadPickerKey())
  }, [])

  const modelPickerOptions = useMemo(() => listAiModelPickerOptions(), [])

  const setModelPickerKey = useCallback((key: string) => {
    setModelPickerKeyState(key)
    savePickerKey(key)
  }, [])

  const permissions = useMemo<Record<AiPermissionId, boolean>>(
    () => ({
      product: true,
      store: true,
      influencer: true,
      review: true,
      sync: true,
    }),
    [],
  )

  const openDrawer = useCallback((ctx?: AiAgentOpenContext) => {
    setPageContext(ctx ?? null)
    setDrawerOpen(true)
    if (ctx?.draftInput) setInputDraft(ctx.draftInput)
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
  }, [])

  const pushPreview = useCallback((taskType: AiTaskType, intro: string, pageLabelOverride?: string) => {
    const preview = buildPreviewForTask(taskType, pageLabelOverride ?? pageContext?.pageLabel)
    const msg = createAgentMessage('task_preview', intro, { preview })
    setPendingPreviewId(msg.id)
    setMessages((prev) => {
      const next = [...prev, msg]
      messagesRef.current = next
      return next
    })
  }, [pageContext?.pageLabel])

  const scheduleKeywordPreview = useCallback(
    (trimmed: string, pageLabel?: string) => {
      const intro = '根据你的描述，我准备执行以下步骤（预览）。请确认后继续。'
      if (/创建|商品|套餐|上架|双人|单人/.test(trimmed)) {
        setTimeout(() => pushPreview('create_product', intro, pageLabel), 200)
      } else if (/达人|招募|探店/.test(trimmed)) {
        setTimeout(() => pushPreview('recruit_influencer', intro, pageLabel), 200)
      } else if (/差评|评价|评论/.test(trimmed)) {
        setTimeout(() => pushPreview('handle_review', intro, pageLabel), 200)
      } else if (/同步|失败|异常|分析/.test(trimmed)) {
        setTimeout(
          () => pushPreview(/分析|原因|异常/.test(trimmed) ? 'analyze_exception' : 'sync_platform', intro, pageLabel),
          200,
        )
      }
    },
    [pushPreview],
  )

  const runGatewayForSnapshot = useCallback(
    async (snapshot: AiAgentMessage[], trimmed: string, taskType: AiTaskType | undefined, previewPage?: string) => {
      const parsed = parseAiModelPickerKey(modelPickerKey)
      if (!parsed) return
      setAiSending(true)
      try {
        const history = agentMessagesToChatMessages(snapshot)
        const res = await postAiChat({
          provider: parsed.provider,
          model: parsed.model || undefined,
          ...(parsed.provider === 'tokenmix' ? { modelFamily: parsed.modelFamily } : {}),
          messages: history,
          taskType,
        })
        const assistantMsg = createAgentMessage('assistant', res.content)
        setMessages((prev) => {
          const next = [...prev, assistantMsg]
          messagesRef.current = next
          return next
        })
        scheduleKeywordPreview(trimmed, previewPage ?? pageContext?.pageLabel)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setMessages((prev) => {
          const next = [...prev, createAgentMessage('assistant', `请求失败（请检查是否已登录及 Vercel 是否已配置 TOKENMIX_API_KEY 或 DeepSeek/Kimi/MiniMax 对应 Key）：${msg}`)]
          messagesRef.current = next
          return next
        })
      } finally {
        setAiSending(false)
      }
    },
    [modelPickerKey, pageContext?.pageLabel, scheduleKeywordPreview],
  )

  const sendUserText = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || aiSending || pendingPreviewId) return
      const userMsg = createAgentMessage('user', trimmed)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      setInputDraft('')
      queueMicrotask(() => {
        void runGatewayForSnapshot(messagesRef.current, trimmed, inferTaskType(trimmed), pageContext?.pageLabel)
      })
    },
    [aiSending, pendingPreviewId, pageContext?.pageLabel, runGatewayForSnapshot],
  )

  const applyShortcut = useCallback(
    (taskType: AiTaskType) => {
      if (aiSending || pendingPreviewId) return
      const label = AI_TASK_TYPE_LABELS[taskType]
      const line = `使用快捷任务：${label}`
      const userMsg = createAgentMessage('user', line)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      queueMicrotask(() => {
        void runGatewayForSnapshot(messagesRef.current, line, taskType, pageContext?.pageLabel)
      })
    },
    [aiSending, pendingPreviewId, pageContext?.pageLabel, runGatewayForSnapshot],
  )

  const confirmPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const p = prev.find((m) => m.id === pendingPreviewId)?.preview
      const title = p?.title ?? '任务'
      const next = [
        ...prev,
        createAgentMessage(
          'task_result',
          `「${title}」已确认。后续将按步骤调用业务接口；若接口未就绪，请稍后在对应模块查看执行结果。`,
          { resultSummary: 'confirmed' },
        ),
      ]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const cancelPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const next = [...prev, createAgentMessage('system', '已取消本次待执行操作。')]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const modifyPendingTask = useCallback(() => {
    if (!pendingPreviewId) return
    setMessages((prev) => {
      const next = [
        ...prev,
        createAgentMessage(
          'assistant',
          '请直接在输入框中说明需要调整的部分（例如：只要同步抖音、先不要发布等）。我会根据你的补充重新生成方案。',
        ),
      ]
      messagesRef.current = next
      return next
    })
    setPendingPreviewId(null)
  }, [pendingPreviewId])

  const submitTopSearchQuery = useCallback(
    (query: string) => {
      const q = query.trim()
      if (!q || aiSending) return
      const pl = '顶部搜索 / AI 指令'
      setPageContext({ pageLabel: pl })
      setDrawerOpen(true)
      setInputDraft('')
      const userMsg = createAgentMessage('user', q)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      queueMicrotask(() => {
        void runGatewayForSnapshot(messagesRef.current, q, inferTaskType(q), pl)
      })
    },
    [aiSending, runGatewayForSnapshot],
  )

  const value = useMemo<AiAgentContextValue>(
    () => ({
      drawerOpen,
      openDrawer,
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
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      aiSending,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      pageContext,
      permissions,
      messages,
      inputDraft,
      sendUserText,
      applyShortcut,
      pendingPreviewId,
      confirmPendingTask,
      cancelPendingTask,
      modifyPendingTask,
      submitTopSearchQuery,
      modelPickerKey,
      setModelPickerKey,
      modelPickerOptions,
      aiSending,
    ],
  )

  return <AiAgentContext.Provider value={value}>{children}</AiAgentContext.Provider>
}

export function useAiAgent(): AiAgentContextValue {
  const v = useContext(AiAgentContext)
  if (!v) throw new Error('useAiAgent must be used within AiAgentProvider')
  return v
}

export function useAiAgentOptional(): AiAgentContextValue | null {
  return useContext(AiAgentContext)
}
