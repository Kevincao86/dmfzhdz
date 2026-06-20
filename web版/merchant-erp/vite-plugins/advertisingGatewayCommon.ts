/** 投流网关共用：空数据响应、AI 提示词、洞察解析 */

export const AD_INSIGHT_ACTIONS_MARKER = '---ACTIONS---'

export function parseAdInsightResponse(raw: string): {
  insight: string
  actions: Array<{
    actionId: string
    promotionId?: string
    promotionName?: string
    actionType: 'enable' | 'disable' | 'note'
    reason: string
  }>
} {
  const markerIdx = raw.indexOf(AD_INSIGHT_ACTIONS_MARKER)
  const insight = (markerIdx >= 0 ? raw.slice(0, markerIdx) : raw).trim()
  const actions: Array<{
    actionId: string
    promotionId?: string
    promotionName?: string
    actionType: 'enable' | 'disable' | 'note'
    reason: string
  }> = []
  if (markerIdx < 0) return { insight, actions }
  const tail = raw.slice(markerIdx + AD_INSIGHT_ACTIONS_MARKER.length).trim()
  const jsonStart = tail.indexOf('[')
  if (jsonStart < 0) return { insight, actions }
  try {
    const arr = JSON.parse(tail.slice(jsonStart)) as unknown[]
    if (!Array.isArray(arr)) return { insight, actions }
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i]
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const opt = String(o.optStatus ?? o.actionType ?? '').toUpperCase()
      const actionType: 'enable' | 'disable' | 'note' =
        opt === 'ENABLE' || opt === 'enable'
          ? 'enable'
          : opt === 'DISABLE' || opt === 'disable'
            ? 'disable'
            : 'note'
      const promotionId = String(o.promotionId ?? o.promotion_id ?? '').trim() || undefined
      const promotionName = String(o.promotionName ?? o.promotion_name ?? '').trim() || undefined
      const reason = String(o.reason ?? o.note ?? 'AI 建议调整').trim()
      actions.push({
        actionId: `${promotionId ?? promotionName ?? 'act'}_${i}`,
        actionType,
        promotionId,
        promotionName,
        reason,
      })
    }
  } catch {
    /* ignore malformed actions */
  }
  return { insight, actions }
}

export function emptyAdvertisingList(message = '请先绑定账号') {
  return { ok: true as const, list: [] as unknown[], demoMode: false as const, message }
}

export function emptyAdvertisingSummary(range: { start: string; end: string }, message = '请先绑定账号') {
  return {
    ok: true as const,
    summary: {
      statCost: 0,
      showCnt: 0,
      clickCnt: 0,
      convertCnt: 0,
      ctr: 0,
      dateRange: range,
    },
    demoMode: false as const,
    message,
  }
}

export function emptyAdvertisingClues(message = '请先绑定账号') {
  return {
    ok: true as const,
    list: [] as unknown[],
    pageInfo: { page: 1, page_size: 20, total_number: 0 },
    demoMode: false as const,
    message,
  }
}

export function buildAdInsightPrompt(input: {
  platformLabel: string
  pane: string
  mode: string
  summary?: Record<string, unknown>
  promotions: unknown[]
  clues: unknown[]
  channelStats: unknown[]
}): { system: string; user: string } {
  const paneLabels: Record<string, string> = {
    live: '直播间投流',
    video: '短视频投流',
    leads: '线索分析',
    ai: 'AI 整体分析',
  }
  const paneLabel = paneLabels[input.pane] ?? '投流'
  const clueCount = input.clues.length
  const statCost = input.summary?.statCost ?? '—'
  const convertCnt = input.summary?.convertCnt ?? '—'
  const leadCpl =
    clueCount > 0 && typeof statCost === 'number'
      ? Math.round((statCost / clueCount) * 100) / 100
      : '—'

  if (input.pane === 'ai') {
    const system = `你是${input.platformLabel}投流投产分析顾问。请用中文输出，分点清晰，每点不超过3行。`
    const user = `请对以下近7日数据进行「整体投产分析」，按直播间、短视频、线索三个板块分别展开：

要求：
1. 逐条列出每个广告计划的投产情况：消耗、展示、点击、转化、CTR、关联线索量、单转化成本、单线索成本
2. 评价每条计划投产优/良/差及原因
3. 给出每条计划的具体调整建议（出价/预算/素材/定向/承接）
4. 总结「新建计划时可参考」的要点（基于历史表现，供商家下次建计划对照）

数据：
- 总消耗 ${statCost} 元；平台转化 ${convertCnt}；线索 ${clueCount} 条；线索成本约 ${leadCpl} 元
- 概览 CTR ${input.summary?.ctr ?? '—'}%，点击 ${input.summary?.clickCnt ?? '—'}
- 分渠道：${JSON.stringify(input.channelStats).slice(0, 1200)}
- 广告计划：${JSON.stringify(input.promotions).slice(0, 2000)}
- 线索：${JSON.stringify(input.clues).slice(0, 800)}

不要输出启停动作 JSON，仅文字分析与参考建议。`
    return { system, user }
  }

  const actionHint =
    input.mode === 'auto_adjust'
      ? `\n\n请在全文最后单独一行输出标记 ${AD_INSIGHT_ACTIONS_MARKER}，其后紧跟 JSON 数组（不要有其它文字），每项格式：{"promotionId":"计划ID","promotionName":"计划名","optStatus":"ENABLE或DISABLE","reason":"一句话原因"}。仅建议暂停/启用且你有把握的计划，最多5条。`
      : ''

  const system = `你是${input.platformLabel}投流顾问。当前板块：${paneLabel}。介入模式：${input.mode}。请用中文、分点清晰回答。`
  const user = `根据以下近7日数据给出分析：
- 投流消耗：${statCost}元；平台转化：${convertCnt}；线索量：${clueCount}；线索成本约：${leadCpl}元
- 概览 CTR ${input.summary?.ctr ?? '—'}%，点击 ${input.summary?.clickCnt ?? '—'}
- 分渠道：${JSON.stringify(input.channelStats).slice(0, 1000)}
- 广告计划：${JSON.stringify(input.promotions).slice(0, 1200)}
- 线索样本：${JSON.stringify(input.clues).slice(0, 600)}
请针对【${paneLabel}】给出：①现状诊断 ②优化建议 ③本周优先动作（2-3条）。${actionHint}`

  return { system, user }
}
