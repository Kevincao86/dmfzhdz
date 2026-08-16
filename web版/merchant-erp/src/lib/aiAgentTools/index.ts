import { AI_AGENT_TOOLS } from './registry'
import type { AiTaskType } from '../aiAgentTypes'
import {
  detectAgentDataQueryDomains,
  isAgentShortcutTaskLine,
  isInformationalOnlyQuery,
} from '../aiAgentSystemPromptRoute'
import { inferTaskTypeFromText, isExplicitExecutionIntent } from '../aiAgentActionParse'
import { isKnownScenarioTaskType } from '../aiAgentScenarioWorkflows'
import { detectImageGenerationIntent } from '../../services/ai/aiImageIntentRouting'
import type { AiAgentToolDef } from './types'

export { AI_AGENT_TOOLS, getAiAgentTool } from './registry'
export { toOpenAiTools, parseToolCallArguments } from './openaiTools'
export { executeAiAgentToolCalls, executeAiAgentToolClient } from './clientExecute'
export { extractToolCallsFromChatRaw } from './extractToolCalls'
export type {
  AiAgentToolDef,
  AiAgentToolCall,
  AiAgentClientToolResult,
  AiAgentJsonSchema,
} from './types'

export function listAiAgentTools() {
  return AI_AGENT_TOOLS
}

/** 九大场景任务 → 可下发的 OpenAI tools（无对应 tool 的场景不挂载，走预览 JSON） */
const SCENARIO_TOOL_NAMES: Partial<Record<AiTaskType, string[]>> = {
  create_product: ['create_product'],
  generate_copywriting: ['generate_copy'],
  recruit_influencer: ['recruit_influencer'],
}

function collectScenarioToolNames(types: AiTaskType[]): Set<string> {
  const allow = new Set<string>()
  for (const t of types) {
    for (const name of SCENARIO_TOOL_NAMES[t] ?? []) allow.add(name)
  }
  return allow
}

/**
 * 仅在命中九大场景执行意图（或明确的生图/混剪/数字人）时挂载写 tools。
 * 数据问答不挂 fetch_page_data：实数已由 intel 注入，直接文字作答；
 * 若挂 tool 会打断作答并把内部指令当回复。
 */
export function listAiAgentToolsForUserIntent(
  userText: string,
  taskType?: AiTaskType,
  deferredTaskTypes?: AiTaskType[],
): AiAgentToolDef[] {
  const x = userText.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return []

  if (detectAgentDataQueryDomains(x).length > 0) return []
  if (isInformationalOnlyQuery(x)) return []

  const allow = new Set<string>()
  const inferred = taskType ?? inferTaskTypeFromText(x)
  const scenarioBag = [
    ...(isKnownScenarioTaskType(inferred) ? [inferred] : []),
    ...((deferredTaskTypes ?? []).filter(isKnownScenarioTaskType) as AiTaskType[]),
  ]

  const wantsScenarioExec =
    isAgentShortcutTaskLine(x) ||
    isExplicitExecutionIntent(x) ||
    isKnownScenarioTaskType(taskType) ||
    Boolean(inferred && isKnownScenarioTaskType(inferred))

  if (wantsScenarioExec) {
    for (const name of collectScenarioToolNames(scenarioBag)) allow.add(name)
  }

  if (detectImageGenerationIntent(x)) allow.add('generate_image')
  if (/混剪|短视频混剪|AI\s*混剪/.test(x)) allow.add('mix_video')
  if (/数字人/.test(x)) allow.add('digital_human')

  if (!allow.size) return []
  return AI_AGENT_TOOLS.filter((t) => allow.has(t.name))
}
