import type { AiTaskType } from './aiAgentTypes'
import { isKnownScenarioTaskType } from './aiAgentScenarioWorkflows'

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
export function shouldUseFullAgentSystemPrompt(userText: string, taskType?: AiTaskType | string): boolean {
  if (isKnownScenarioTaskType(taskType)) return true
  const x = userText.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return false
  if (isBusinessMetricsQuery(x)) return true
  if (isPlanOrNineScenarioQuery(x) || isPlanDesignQuery(x)) return true
  if (/备案|ICP|EDI|合规|资质/.test(x)) return true
  if (/融资|商业计划|路演|政策|对比分析|深度分析|研究报告|战略|OPC|AI创业/.test(x)) return true
  return x.length > 120
}

export function isAgentShortcutTaskLine(text: string): boolean {
  return /^使用快捷任务：/.test(text.replace(/\[引用[\s\S]*?\n\n/, '').trim())
}

/**
 * 经营数据/营收类查询：只回答、不触发九大场景工具与执行预览。
 * （如「近三个月总营收」「拉取数据明细」勿误走 create_product）
 */
export function isBusinessMetricsQuery(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return false
  if (isAgentShortcutTaskLine(x)) return false
  if (/(?:创建|上架|组品|确认执行|开始创建|立即上架|按方案执行)/.test(x)) return false
  if (
    /(?:营收|营业额|成交额|销售额|核销额|订单量|订单数|客单价|毛利率|经营数据|数据明细)/.test(x) &&
    /(?:查|看|拉|给|帮|分析|汇总|明细|多少|情况|数据|报告|一份|拉取)/.test(x)
  ) {
    return true
  }
  if (
    /近\s*(?:一|两|三|1|2|3|[一二三])\s*个?月|最近\s*\d+\s*个?月|本月|上月/.test(x) &&
    /(?:数据|营收|营业额|成交|订单|明细|报告)/.test(x)
  ) {
    return true
  }
  if (/\d{4}\s*年.{0,24}(?:到|至|~|—|-|－).{0,24}(?:数据|营收|明细)/.test(x)) return true
  return false
}

/** 合规/政策/选型类咨询（含团购等词但非九大场景执行意图） */
export function isInformationalOnlyQuery(text: string): boolean {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()
  if (!x) return false
  if (isAgentShortcutTaskLine(x)) return false
  if (/确认执行|按.*方案执行|开始创建|立即上架|需要执行|同意执行|执行方案|确认创建|帮我执行|按上述方案/.test(x)) {
    return false
  }
  if (isBusinessMetricsQuery(x)) return true
  if (
    /ICP|EDI|备案|资质|许可证|托管协议|域名证书|通信管理局|增值电信|经营性|非经营性|电信业务/.test(
      x,
    )
  ) {
    return true
  }
  if (
    /(?:是否|是不是|要不要|需不需要|有没有必要|应该选择|选哪个|怎么选|如何选择|有什么区别|区别是|哪个更|还是做|抑或)/.test(
      x,
    ) &&
    !/(?:创建|上架|组品|上传|发布|帮我做|帮我上|立即|确认执行|开始创建)/.test(x)
  ) {
    return true
  }
  if (
    /^(?:请问|帮我看|了解一下|想知道|咨询一下|咨询|想了解|能否解释|解释一下)/.test(x) &&
    !/(?:创建|上架|组品|上传|发布|帮我做|帮我上|立即|确认执行|开始创建)/.test(x)
  ) {
    return true
  }
  return false
}
