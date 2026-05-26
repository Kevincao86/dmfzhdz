/**
 * 首页宫格：字形图标 + 浅色 UI；特色入口由 menu featuredOnly 单独展示。
 */
const { SECTIONS } = require('./menu.js')

/** title -> { glyph, tone } */
const GRID_VISUAL = {
  经营概览: { glyph: '览', tone: 'blue' },
  我的钱包: { glyph: '钱', tone: 'amber' },
  店铺信息: { glyph: '店', tone: 'cyan' },
  店铺装修: { glyph: '装', tone: 'purple' },
  商品列表: { glyph: '列', tone: 'orange' },
  新建商品: { glyph: '建', tone: 'green' },
  达人招募: { glyph: '募', tone: 'indigo' },
  'AI达人Brief生成': { glyph: '简', tone: 'violet' },
  'Brief生成记录': { glyph: '档', tone: 'slate' },
  查看达人订单: { glyph: '单', tone: 'indigo' },
  活动中心: { glyph: '活', tone: 'rose' },
  评论管理: { glyph: '评', tone: 'green' },
  评价管理: { glyph: '评', tone: 'green' },
  'GEO 运营优化': { glyph: '址', tone: 'green' },
  'AI 文章与话题': { glyph: '文', tone: 'purple' },
  短视频AI处理: { glyph: '剪', tone: 'orange' },
  '短视频优化 · 看板': { glyph: '视', tone: 'orange' },
  直播间分析: { glyph: '播', tone: 'pink' },
  平台签框: { glyph: '签', tone: 'slate' },
  投流: { glyph: '流', tone: 'red' },
  线索: { glyph: '索', tone: 'blue' },
  财务对账: { glyph: '账', tone: 'cyan' },
  报税管理: { glyph: '税', tone: 'slate' },
  系统设置: { glyph: '设', tone: 'slate' },
}

function itemUrl(it) {
  if (it.kind === 'link') return it.url
  if (it.kind === 'mod') return `/pages/module-detail/module-detail?k=${it.key}`
  return it.url
}

function visualFor(title) {
  const g = GRID_VISUAL[title] || { glyph: title.slice(0, 1), tone: 'slate' }
  return { glyph: g.glyph, tone: g.tone }
}

function flattenMenuCells() {
  const cells = []
  for (const sec of SECTIONS) {
    for (const it of sec.items) {
      if (it.featuredOnly) continue
      const v = visualFor(it.title)
      cells.push({
        title: it.title,
        url: itemUrl(it),
        glyph: v.glyph,
        tone: v.tone,
      })
    }
  }
  return cells
}

function buildFeaturedList() {
  const arr = []
  for (const sec of SECTIONS) {
    for (const it of sec.items) {
      if (!it.featuredOnly) continue
      const title = it.featuredTitle || it.title
      const desc = it.featuredShortDesc || '点击进入'
      arr.push({
        id: String(it.featuredRank) + (it.key || it.title),
        title,
        desc,
        url: itemUrl(it),
        glyph: it.featuredGlyph || title.slice(0, 1),
        theme: it.featuredTheme || 'cyan',
        rank: it.featuredRank || 99,
      })
    }
  }
  arr.sort((a, b) => a.rank - b.rank)
  return arr
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const GRID_PAGE_SIZE = 10

function buildIconPages() {
  return chunk(flattenMenuCells(), GRID_PAGE_SIZE)
}

module.exports = { flattenMenuCells, buildIconPages, buildFeaturedList, GRID_PAGE_SIZE }
