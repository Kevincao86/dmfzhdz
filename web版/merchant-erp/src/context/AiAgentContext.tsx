import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type {
  AiAgentArchivedSession,
  AiAgentMessage,
  AiAgentOpenContext,
  AiPermissionId,
  AiTaskPreviewPayload,
  AiTaskType,
} from '../lib/aiAgentTypes'
import { AI_AGENT_WELCOME_CONTENT, AI_TASK_TYPE_LABELS, createAgentMessage } from '../lib/aiAgentTypes'
import { compressImageFileToDataUrl } from '../lib/aiImageCompress'
import { resolveModelPickerKeyForImageIntent } from '../services/ai/aiImageIntentRouting'
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

const MAX_ARCHIVED_SESSIONS = 10

function cloneAgentMessages(msgs: AiAgentMessage[]): AiAgentMessage[] {
  return structuredClone(msgs) as AiAgentMessage[]
}

function sessionTitleFromMessages(msgs: AiAgentMessage[]): string {
  const u = msgs.find((m) => m.role === 'user')
  const raw = (u?.content ?? '对话').trim().replace(/\s+/g, ' ')
  if (!raw) return '对话'
  return raw.length <= 32 ? raw : `${raw.slice(0, 31)}…`
}

type AiAgentContextValue = {
  drawerOpen: boolean
  openDrawer: (ctx?: AiAgentOpenContext) => void
  closeDrawer: () => void
  pageContext: AiAgentOpenContext | null
  permissions: Record<AiPermissionId, boolean>
  messages: AiAgentMessage[]
  inputDraft: string
  setInputDraft: Dispatch<SetStateAction<string>>
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
  /** 主输入区待发送的截图（最多 4 张） */
  pendingComposerImages: string[]
  addComposerImages: (files: FileList | null) => Promise<void>
  removeComposerImage: (index: number) => void
  clearComposerImages: () => void
  /** 有用户发言后的侧边栏：历史对话快照，最多 10 条 */
  archivedSessions: AiAgentArchivedSession[]
  /** 将当前对话存档并回到欢迎空态 */
  startNewChat: () => void
  /** 从历史恢复一条对话到主区域（当前有内容会先被存档） */
  resumeArchivedSession: (sessionId: string) => void
  /** 侧边栏当前高亮的历史项（从 resume 进入时） */
  sidebarActiveArchiveId: string | null
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
    createAgentMessage('assistant', AI_AGENT_WELCOME_CONTENT),
  ])
  const [archivedSessions, setArchivedSessions] = useState<AiAgentArchivedSession[]>([])
  const [sidebarActiveArchiveId, setSidebarActiveArchiveId] = useState<string | null>(null)
  const [inputDraft, setInputDraft] = useState('')
  const [pendingComposerImages, setPendingComposerImages] = useState<string[]>([])
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null)
  const [modelPickerKey, setModelPickerKeyState] = useState('tokenmix::openai::__default__')
  const [aiSending, setAiSending] = useState(false)

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const archivedRef = useRef(archivedSessions)
  archivedRef.current = archivedSessions

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

  const addComposerImages = useCallback(async (files: FileList | null) => {
    if (!files?.length) return
    const urls: string[] = []
    for (let i = 0; i < files.length && urls.length < 4; i++) {
      try {
        urls.push(await compressImageFileToDataUrl(files[i]))
      } catch {
        /* 跳过无法解析的文件 */
      }
    }
    if (!urls.length) return
    setPendingComposerImages((prev) => [...prev, ...urls].slice(0, 4))
  }, [])

  const removeComposerImage = useCallback((index: number) => {
    setPendingComposerImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearComposerImages = useCallback(() => {
    setPendingComposerImages([])
  }, [])

  const pushCurrentToArchiveIfHasUser = useCallback(() => {
    const cur = messagesRef.current
    if (!cur.some((m) => m.role === 'user')) return
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const entry: AiAgentArchivedSession = {
      id,
      title: sessionTitleFromMessages(cur),
      messages: cloneAgentMessages(cur),
      updatedAt: Date.now(),
    }
    setArchivedSessions((prev) => [entry, ...prev].slice(0, MAX_ARCHIVED_SESSIONS))
  }, [])

  const resetToWelcome = useCallback(() => {
    const fresh = [createAgentMessage('assistant', AI_AGENT_WELCOME_CONTENT)]
    setMessages(fresh)
    messagesRef.current = fresh
    setPendingPreviewId(null)
    setInputDraft('')
    setPendingComposerImages([])
  }, [])

  const startNewChat = useCallback(() => {
    pushCurrentToArchiveIfHasUser()
    resetToWelcome()
    setSidebarActiveArchiveId(null)
  }, [pushCurrentToArchiveIfHasUser, resetToWelcome])

  const resumeArchivedSession = useCallback(
    (sessionId: string) => {
      if (sessionId === sidebarActiveArchiveId) return
      const hit = archivedRef.current.find((s) => s.id === sessionId)
      if (!hit) return
      pushCurrentToArchiveIfHasUser()
      const next = cloneAgentMessages(hit.messages)
      setMessages(next)
      messagesRef.current = next
      setPendingPreviewId(null)
      setInputDraft('')
      setPendingComposerImages([])
      setSidebarActiveArchiveId(sessionId)
    },
    [pushCurrentToArchiveIfHasUser, sidebarActiveArchiveId],
  )

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
    async (
      snapshot: AiAgentMessage[],
      trimmed: string,
      taskType: AiTaskType | undefined,
      previewPage?: string,
      imageDataUrls: string[] = [],
      pickerKeyOverride?: string,
    ) => {
      const key = pickerKeyOverride ?? modelPickerKey
      const parsed = parseAiModelPickerKey(key)
      if (!parsed) return
      setAiSending(true)
      try {
        const history = agentMessagesToChatMessages(snapshot)
        const res = await postAiChat({
          provider: parsed.provider,
          model: parsed.model || undefined,
          ...(parsed.provider === 'tokenmix' ? { modelFamily: parsed.modelFamily } : {}),
          messages: history,
          ...(imageDataUrls.length ? { imageDataUrls } : {}),
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
          const next = [
            ...prev,
            createAgentMessage(
              'assistant',
              `暂时连不上助手服务。请确认已登录；若仍失败，请联系管理员检查智能助手配置。详情：${msg}`,
            ),
          ]
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
      const imgs = [...pendingComposerImages]
      if ((!trimmed && imgs.length === 0) || aiSending || pendingPreviewId) return
      const line = trimmed || '请结合附图说明你的需求。'
      setSidebarActiveArchiveId(null)
      setPendingComposerImages([])
      const nextPickerKey = resolveModelPickerKeyForImageIntent(
        modelPickerKey,
        modelPickerOptions,
        line,
        imgs.length > 0,
      )
      if (nextPickerKey !== modelPickerKey) {
        setModelPickerKeyState(nextPickerKey)
        savePickerKey(nextPickerKey)
      }
      const userMsg = createAgentMessage('user', line, { imageUrls: imgs.length ? imgs : undefined })
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      setInputDraft('')
      queueMicrotask(() => {
        void runGatewayForSnapshot(
          messagesRef.current,
          line,
          inferTaskType(line),
          pageContext?.pageLabel,
          imgs,
          nextPickerKey,
        )
      })
    },
    [
      aiSending,
      pendingComposerImages,
      pendingPreviewId,
      pageContext?.pageLabel,
      runGatewayForSnapshot,
      modelPickerKey,
      modelPickerOptions,
    ],
  )

  const applyShortcut = useCallback(
    (taskType: AiTaskType) => {
      if (aiSending || pendingPreviewId) return
      setSidebarActiveArchiveId(null)
      setPendingComposerImages([])
      const label = AI_TASK_TYPE_LABELS[taskType]
      const line = `使用快捷任务：${label}`
      const userMsg = createAgentMessage('user', line)
      setMessages((prev) => {
        const next = [...prev, userMsg]
        messagesRef.current = next
        return next
      })
      queueMicrotask(() => {
        void runGatewayForSnapshot(messagesRef.current, line, taskType, pageContext?.pageLabel, [])
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
      setPendingComposerImages([])
      const nextPickerKey = resolveModelPickerKeyForImageIntent(
        modelPickerKey,
        modelPickerOptions,
        q,
        false,
      )
      if (nextPickerKey !== modelPickerKey) {
        setModelPickerKeyState(nextPickerKey)
        savePickerKey(nextPickerKey)
      }
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
        void runGatewayForSnapshot(messagesRef.current, q, inferTaskType(q), pl, [], nextPickerKey)
      })
    },
    [aiSending, runGatewayForSnapshot, modelPickerKey, modelPickerOptions],
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
      pendingComposerImages,
      addComposerImages,
      removeComposerImage,
      clearComposerImages,
      archivedSessions,
      startNewChat,
      resumeArchivedSession,
      sidebarActiveArchiveId,
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
      pendingComposerImages,
      addComposerImages,
      removeComposerImage,
      clearComposerImages,
      archivedSessions,
      startNewChat,
      resumeArchivedSession,
      sidebarActiveArchiveId,
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
