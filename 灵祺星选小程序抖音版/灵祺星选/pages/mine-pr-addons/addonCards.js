const prFeatureAccess = require('../../utils/prFeatureAccess.js')

const AI_ADDONS = [
  {
    key: 'shortvideo',
    perm: 'shortvideo',
    title: '短视频 AI 处理',
    sub: '参考画面 · 文生/图生视频',
    glyph: '▶',
    tone: 'violet',
    url: '/pages/mine-pr-addon-shortvideo/mine-pr-addon-shortvideo',
  },
  {
    key: 'cloudEdit',
    perm: 'cloudEdit',
    title: '灵祺 AI 云剪',
    sub: '批量素材 · ICE 多图/视频成片',
    glyph: '✂',
    tone: 'amber',
    url: '/pages/mine-pr-addon-shortvideo/mine-pr-addon-shortvideo?pane=cloud',
    onlyWithoutShortvideo: true,
  },
  {
    key: 'aiContent',
    perm: 'brief',
    title: '爆款 Brief 生成',
    sub: '抖音/小红书钩子 · 分镜 · 话题 · 审片清单',
    glyph: '✎',
    tone: 'sky',
    url: '/pages/mine-pr-addon-ai-content/mine-pr-addon-ai-content',
  },
  {
    key: 'digitalHuman',
    perm: 'digitalHuman',
    title: '数字人口播',
    sub: 'TTS 配音 · 口播视频一键生成',
    glyph: '◉',
    tone: 'rose',
    url: '/pages/mine-pr-addon-digital-human/mine-pr-addon-digital-human',
  },
  {
    key: 'aiVideoReview',
    perm: 'aiVideoReview',
    title: 'AI短视频审核',
    sub: '成片口播/字幕/画面 · 单条/批量检核',
    glyph: '⎈',
    tone: 'emerald',
    url: '/pages/mine-pr-addon-ai-video-review/mine-pr-addon-ai-video-review',
  },
  {
    key: 'aiReview',
    perm: 'aiReview',
    title: 'AI审核',
    sub: 'doc/txt/文档链接 · 与内置文稿审核一致',
    glyph: '✓',
    tone: 'teal',
    url: '/pages/mine-pr-addon-ai-review/mine-pr-addon-ai-review',
  },
]

function buildAiAddonsFromAccount(account) {
  const access = prFeatureAccess.readAccountPrFeatureAccess(account)
  const cards = AI_ADDONS.filter((item) => {
    if (item.onlyWithoutShortvideo) return access.cloudEdit && !access.shortvideo
    if (item.perm === 'cloudEdit') return false
    if (item.perm === 'shortvideo') return access.shortvideo
    if (item.perm === 'brief') return access.brief
    if (item.perm === 'digitalHuman') return access.digitalHuman
    if (item.perm === 'aiVideoReview') return access.aiVideoReview
    if (item.perm === 'aiReview') return access.aiReview
    return false
  })
  return cards.map((item) => ({
    ...item,
    cardClass: `addon-card--${item.tone}`,
  }))
}

module.exports = {
  AI_ADDONS,
  buildAiAddonsFromAccount,
}
