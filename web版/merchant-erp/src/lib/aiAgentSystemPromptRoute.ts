import type { AiTaskType } from './aiAgentTypes'

/** 用户是否在请求方案 / 九大场景（才展示「确认执行」引导与推迟预览） */
export function isPlanOrNineScenarioQuery(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return false
  if (isAgentShortcutTaskLine(x)) return true
  if (/9\s*大\s*场景|九大场景|九\s*大/.test(x)) return true
  if (/方案/.test(x)) return true
  return isPlanDesignQuery(x)
}

/** 用户是否在请求方案/规划类设计（先出方案，再确认执行） */
export function isPlanDesignQuery(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (/确认执行|开始创建|立即上架|按方案执行/.test(x)) return false
  return /规划|方案设计|活动安排|活动方案|套餐搭配|组品|618|达人合作|营销策略|推广计划|抖音推广|推广活动|帮我规划|帮我设计|融资|商业计划|路演|BP\b|政策对比|OPC/.test(
    x,
  )
}

/** 闲聊路由是否应使用完整 ERP 系统提示（避免「2～5 句话」浅答方案/融资/政策类问题） */
export function shouldUseFullAgentSystemPrompt(userText: string, taskType?: AiTaskType): boolean {
  if (taskType) return true
  const x = userText.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return false
  if (isPlanOrNineScenarioQuery(x) || isPlanDesignQuery(x)) return true
  if (/融资|商业计划|路演|政策|对比分析|深度分析|研究报告|战略|OPC|AI创业/.test(x)) return true
  return x.length > 120
}

export function isAgentShortcutTaskLine(text: string): boolean {
  return /^使用快捷任务：/.test(text.replace(/\[引用[\s\S]*?\n\n/, '').trim())
}
