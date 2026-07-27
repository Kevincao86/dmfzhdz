import * as XLSX from 'xlsx'
import {
  AI_OPS_MILESTONE_KIND_LABELS,
  aiOpsPlanToMarkdown,
  isAiOpsPlanSimpleEdition,
  type AiOpsPlanResult,
} from './aiOpsPlanTypes'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function sheetFromAoA(rows: (string | number)[][]) {
  return XLSX.utils.aoa_to_sheet(rows)
}

export function exportAiOpsPlanExcel(plan: AiOpsPlanResult, basename: string) {
  if (isAiOpsPlanSimpleEdition(plan) && plan.simplePlan) {
    const s = plan.simplePlan
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      sheetFromAoA([
        ['结论', s.hero.headline],
        ['摘要', s.hero.summary],
        ['门店', s.hero.storeHint],
        ['周期', s.hero.periodHint],
        ['预算', s.hero.budgetHint],
        [],
        ['步骤', '说明', '小贴士'],
        ...s.steps.map((st) => [st.title, st.body, st.tip]),
        [],
        ['平台', '怎么发'],
        ...s.platforms.map((p) => [p.platform, p.how]),
        [],
        ['套餐', '卖点', '价格'],
        ...s.combos.map((c) => [c.name, c.sellingPoint, c.priceHint]),
        [],
        ['落地清单', '细流程', '备注'],
        ...s.checklist.map((item) => [
          item.text,
          item.detailFlow
            .map(
              (f) =>
                `${f.title}：${f.body}` +
                (f.actions?.length
                  ? ' / ' + f.actions.map((a) => `${a.label}→${a.detail}`).join('；')
                  : ''),
            )
            .join(' | '),
          item.detailNote,
        ]),
      ]),
      '简易方案',
    )
    XLSX.writeFile(wb, `${basename}.xlsx`)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['背景', plan.opsPlan.background],
      ['背景详情', plan.opsPlan.backgroundDetail],
      ['定位', plan.opsPlan.positioning],
      ['活动', plan.opsPlan.activities],
      ['活动详情', plan.opsPlan.activitiesDetail],
      ['人群', plan.opsPlan.targetAudience],
      ['人群详情', plan.opsPlan.audienceDetail],
      ['目标', plan.opsPlan.goals.join('；')],
      ['内容支柱', plan.opsPlan.contentPillars.join(' / ')],
      [],
      ['指标', '目标', '客单', '订单', 'GMV', '测算说明'],
      ...plan.opsPlan.goalsDetail.map((g) => [
        g.metric,
        g.target,
        g.aovYuan,
        g.orders,
        g.gmvYuan,
        g.rationale,
      ]),
      [],
      ['平台', '打法', '内容形态', '频次', 'KPI', '示例', '详情'] as (string | number)[],
      ...plan.opsPlan.platformStrategy.map((r) => [
        r.platform,
        r.approach,
        r.contentTypes,
        r.publishFreq,
        r.kpi,
        r.examples,
        r.detail,
      ]),
    ]),
    '运营方案',
  )
  const phaseDetailRows: (string | number)[][] = []
  for (const r of plan.executionPlan.phases) {
    phaseDetailRows.push([r.phase, r.dateRange, r.actions, r.ownerRole, r.deliverable, r.successMetric, ''])
    for (const d of r.detailItems || []) {
      phaseDetailRows.push([
        `  ${r.phase}`,
        d.day,
        d.task,
        d.ownerRole,
        d.deliverable,
        '',
        d.howTo || '',
      ])
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['总览', plan.executionPlan.overview],
      ['阶段', '日期', '动作/任务', '角色', '产出', '成功指标', '怎么做'],
      ...phaseDetailRows,
      [],
      ['周次', '日期', '重点', '任务', '角色', '详情'],
      ...plan.executionPlan.weeklyActions.map((r) => [
        r.week,
        r.dateRange,
        r.focus,
        r.tasks,
        r.ownerRole,
        r.detail,
      ]),
      [],
      ['直播小时排期', '开始', '结束', '任务', '角色', '地点', '备注'],
      ...plan.executionPlan.hourlySchedule.map((r) => [
        r.date,
        r.timeStart,
        r.timeEnd,
        r.task,
        r.ownerRole,
        r.location,
        r.notes,
      ]),
    ]),
    '具体执行方案',
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['总预算', plan.marketingBudget.totalBudget],
      ['预备金%', plan.marketingBudget.contingencyPct],
      ['ROI总述', plan.marketingBudget.roiSummary],
      [],
      ['渠道', '月份', '金额', '占比%', '说明'],
      ...plan.marketingBudget.channels.map((r) => [
        r.channel,
        r.month,
        r.amountYuan,
        r.ratioPct,
        r.note,
      ]),
      [],
      ['ROI渠道', '投入', '周期预计GMV', '预计订单', '毛利ROI', '回本天数', '说明'],
      ...plan.marketingBudget.roiAnalysis.map((r) => [
        r.channel,
        r.investYuan,
        r.expectedGmvYuan,
        r.expectedOrders,
        r.roi,
        r.paybackDays,
        r.note,
      ]),
    ]),
    '营销预算',
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['日期', '时间', '类型', '事项', '依赖', '角色', '建议'],
      ...plan.calendar.milestones.map((r) => [
        r.date,
        r.time,
        AI_OPS_MILESTONE_KIND_LABELS[r.kind] || r.kind || '',
        r.item,
        r.dependency,
        r.ownerRole,
        r.statusHint,
      ]),
    ]),
    '项目进度日历',
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['类别', '平台', '层级', '人数', '单场/人', '投流预算', '小计', '备注'],
      ...plan.talentBudget.budgetLines.map((r) => [
        r.category,
        r.platform,
        r.tier,
        r.headcount,
        r.unitBudgetYuan,
        r.trafficBudgetYuan,
        r.subtotalYuan,
        r.note,
      ]),
      [],
      ['平台', '层级', '类型', '人数', '单场', '小计', '形态', '窗口', '备注'],
      ...plan.talentBudget.talentRows.map((r) => [
        r.platform,
        r.tier,
        r.talentType,
        r.headcount,
        r.unitBudgetYuan,
        r.subtotalYuan,
        r.contentForm,
        r.publishWindow,
        r.note,
      ]),
    ]),
    '预算分配明细',
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromAoA([
      ['套餐', '包含', '售价', '原价', '毛利', '平台', '卖点', '库存'],
      ...plan.productBoard.combos.map((r) => [
        r.name,
        r.items,
        r.priceYuan,
        r.originYuan,
        r.marginHint,
        r.platforms,
        r.sellingPoint,
        r.stockHint,
      ]),
    ]),
    '组品货盘',
  )
  XLSX.writeFile(wb, `${basename}.xlsx`)
}

export function exportAiOpsPlanWord(plan: AiOpsPlanResult, basename: string) {
  const md = aiOpsPlanToMarkdown(plan, { title: 'AI 运营方案' })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AI运营方案</title>
<style>body{font-family:Arial,"Microsoft YaHei",sans-serif;line-height:1.6;padding:24px}
h1,h2,h3{color:#111}table{border-collapse:collapse;width:100%;margin:12px 0}
td,th{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}</style></head><body>
${md
  .replace(/^### (.*)$/gm, '<h3>$1</h3>')
  .replace(/^## (.*)$/gm, '<h2>$1</h2>')
  .replace(/^# (.*)$/gm, '<h1>$1</h1>')
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  .replace(/^\| (.+) \|$/gm, (line) => {
    if (/^\|?\s*---/.test(line)) return ''
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim())
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`
  })
  .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => `<table>${block}</table>`)
  .replace(/\n/g, '<br/>')}
</body></html>`
  downloadBlob(
    new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }),
    `${basename}.doc`,
  )
}

export function exportAiOpsPlanPdf(plan: AiOpsPlanResult, basename: string) {
  const md = aiOpsPlanToMarkdown(plan, { title: 'AI 运营方案' })
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${basename}</title>
<style>
@page{margin:16mm}
body{font-family:"Microsoft YaHei",Arial,sans-serif;font-size:12px;line-height:1.55;color:#111;white-space:pre-wrap;padding:12px}
h1{font-size:20px} h2{font-size:16px;margin-top:18px} h3{font-size:14px}
@media print{button{display:none}}
.toolbar{margin-bottom:12px}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">打印 / 另存为 PDF</button></div>
<pre>${md.replace(/</g, '&lt;')}</pre>
<script>setTimeout(function(){window.print()},400)</script>
</body></html>`
  const w = window.open('', '_blank')
  if (!w) {
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${basename}.html`)
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
}
