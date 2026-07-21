/**
 * 录播工坊：口播稿解析与时间轴导出（半自动录屏）
 */

export type CourseRecordPage = {
  pageNo: number
  title: string
  script: string
}

/** 解析「### 第 N 页 · 标题」格式口播稿；无匹配时按空行分块 */
export function parseOralScriptMarkdown(raw: string): CourseRecordPage[] {
  const text = String(raw || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!text) return []

  const headingRe = /^###\s*第\s*(\d+)\s*页(?:\s*[·•.\-—]\s*(.+))?$/gm
  const hits: { pageNo: number; title: string; index: number; endTitle: number }[] = []
  let m: RegExpExecArray | null
  while ((m = headingRe.exec(text)) != null) {
    hits.push({
      pageNo: Number(m[1]),
      title: String(m[2] || '').trim() || `第 ${m[1]} 页`,
      index: m.index,
      endTitle: m.index + m[0].length,
    })
  }

  if (hits.length > 0) {
    return hits.map((h, i) => {
      const bodyStart = h.endTitle
      const bodyEnd = i + 1 < hits.length ? hits[i + 1]!.index : text.length
      const script = text
        .slice(bodyStart, bodyEnd)
        .replace(/^[\s>\-*]+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return { pageNo: h.pageNo, title: h.title, script }
    }).filter((p) => p.script.length > 0 || p.title)
  }

  const blocks = text
    .split(/\n{2,}|(?:\n---+\n)/)
    .map((b) => b.trim())
    .filter(Boolean)
  return blocks.map((block, i) => {
    const lines = block.split('\n')
    const first = lines[0]!.replace(/^#+\s*/, '').trim()
    const rest = lines.slice(1).join('\n').trim()
    if (rest) {
      return { pageNo: i + 1, title: first.slice(0, 40), script: rest }
    }
    return { pageNo: i + 1, title: `第 ${i + 1} 页`, script: first }
  })
}

export function estimateSpeechSec(script: string): number {
  const chars = script.replace(/\s/g, '').length
  // 约 4.2 字/秒（口播偏慢）
  return Math.max(3, Math.round((chars / 4.2) * 10) / 10)
}

export function formatTimelineChecklist(
  pages: CourseRecordPage[],
  meta?: { courseTitle?: string; voiceLabel?: string },
): string {
  const title = meta?.courseTitle?.trim() || '录播课'
  const voice = meta?.voiceLabel?.trim() || '未指定音色'
  const lines = [
    `# ${title} · 录屏时间轴清单`,
    '',
    `音色：${voice}`,
    '用法：另窗打开 PPT 全屏 → OBS 录该窗 → 本工坊点「开始导播」播音；听到提示后翻 PPT 到对应页。',
    '',
    '| 页 | 标题 | 预估秒 | 音频文件 |',
    '|----|------|--------|----------|',
  ]
  let t = 0
  for (const p of pages) {
    const sec = estimateSpeechSec(p.script)
    const start = t
    t += sec + 0.8
    lines.push(
      `| ${p.pageNo} | ${p.title.replace(/\|/g, '/')} | ~${sec}s（起 ${start.toFixed(0)}s） | page-${String(p.pageNo).padStart(2, '0')}.mp3 |`,
    )
  }
  lines.push('', `合计约 ${Math.ceil(t)} 秒（含页间停顿）`, '')
  return lines.join('\n')
}

/** 开场白总目录示例（与 html-讲义开场白对齐，可替换） */
export const SAMPLE_OPENING_ORAL_SCRIPT = `### 第 1 页 · 封面
家人们好。欢迎来到灵祺星选商家 ERP 月订阅课程。这一页是口播稿总目录的展示 PPT——开课前我们先把整包课的地图过一遍。

### 第 2 页 · 今天开场
开课前不急着点功能。今天只要带走三件事：学什么、怎么学、怎么练。

### 第 3 页 · 怎么用
录播用法就三步：打开讲义进对应课；同目录打开口播稿按页念；赶进度先念一口气版，再补演示。

### 第 4 页 · 九子项目
九个子项目一张图装下：开营、上手、AI、达人、内容、获客、财务、月更，外加四周直播。

### 第 5 页 · 模块0-1
入门段：模块零讲清为什么累、ERP 省什么、怎么学；模块一走通登录门店看板权益。正式学员务必完成零点三和一点四。

### 第 6 页 · 模块2
核心能力在模块二：九大场景、预览确认、组品、Brief、差评，最后实操产出。AI 可以写草稿，签字确认还是你。

### 第 7 页 · 模块3
钱最容易打水漂的地方——找达人。从为什么亏讲到发单、档位、履约、结款，最后发一单测试招募。

### 第 8 页 · 模块4-5
内容产能与曝光获客：能产出，还能跟进，才叫闭环。

### 第 9 页 · 模块6-7
财务盘点与月更专题：订阅不是听完就扔，每月有专题加深。

### 第 10 页 · 四周直播
四周直播，把「会」变成「做过」：组品、发招募、口播混剪、线索复盘。

### 第 11 页 · 学练用
月订阅等于学加练加用。散点经营一定累；流水线才省人、省口径、省月底扯皮。

### 第 12 页 · 课表速览
整包大约四十堂课，按模块推进。完整链接表见口播稿总目录。

### 第 13 页 · 今天带走
先看地图再进单课；录播对着按页口播念；正式学员先完成零点三和一点四。

### 第 14 页 · 结束
好地图讲完了。下一页进入模块零——建议首课零点一。我们正式开始。
`
