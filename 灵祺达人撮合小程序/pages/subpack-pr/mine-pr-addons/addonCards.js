const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const upgradeHint = require('../../../utils/mpAddonUpgradeHint.js')

const AI_ADDONS = [
  {
    key: 'shortvideo',
    perm: 'shortvideo',
    title: '短视频 AI 处理',
    sub: '文生/图生视频 · AI 混剪',
    glyph: '▶',
    tone: 'violet',
    url: '/pages/subpack-pr/mine-pr-addon-shortvideo/mine-pr-addon-shortvideo',
  },
  {
    key: 'digitalHuman',
    perm: 'digitalHuman',
    title: '数字人口播',
    sub: 'TTS 配音 · 口播视频一键生成',
    glyph: '◉',
    tone: 'rose',
    url: '/pages/subpack-pr/mine-pr-addon-digital-human/mine-pr-addon-digital-human',
  },
  {
    key: 'visualStudio',
    perm: 'visualStudio',
    title: 'AI 视觉工坊',
    sub: '多端海报 · AI 文案 · 一键出图',
    glyph: '◈',
    tone: 'indigo',
    url: '/pages/subpack-pr/mine-pr-addon-visual-studio/mine-pr-addon-visual-studio',
  },
]

/** 展示矩阵中可售卖的 AI 增值卡片；未开通标 locked，点击提示升级 */
function buildAiAddonsFromAccount(account) {
  return AI_ADDONS.map((item) => {
    const unlocked = prFeatureAccess.canUseAddonPerm(account, item.perm)
    const upgradePlan = unlocked ? '' : upgradeHint.suggestUpgradePlanLabel(account, item.perm)
    return {
      ...item,
      unlocked,
      locked: !unlocked,
      upgradePlan,
      cardClass: `addon-card--${item.tone}${unlocked ? '' : ' addon-card--locked'}`,
      sub: unlocked
        ? item.sub
        : upgradePlan
          ? `需升级至${upgradePlan}`
          : '需升级会员后使用',
    }
  })
}

module.exports = {
  AI_ADDONS,
  buildAiAddonsFromAccount,
}
