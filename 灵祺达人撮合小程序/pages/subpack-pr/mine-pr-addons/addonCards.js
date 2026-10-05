const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const upgradeHint = require('../../../utils/mpAddonUpgradeHint.js')

/** 顺序与商家小程序「AI 创作」一致。AI 运营方案只在商家端。 */
const AI_ADDONS = [
  {
    key: 'visualStudio',
    perm: 'visualStudio',
    title: 'AI 视觉工坊',
    sub: '海报文案与出图',
    glyph: '◈',
    tone: 'indigo',
    url: '/pages/subpack-pr/mine-pr-addon-visual-studio/mine-pr-addon-visual-studio',
  },
  {
    key: 'brief',
    perm: 'brief',
    title: '爆款 Brief 生成',
    sub: '文章话题与探店 Brief',
    glyph: 'B',
    tone: 'violet',
    url: '/pages/subpack-pr/mine-pr-addon-ai-content/mine-pr-addon-ai-content',
  },
  {
    key: 'shortvideo',
    perm: 'shortvideo',
    title: '短视频AI处理',
    sub: '脚本诊断与出片',
    glyph: '▶',
    tone: 'violet',
    url: '/pages/subpack-pr/mine-pr-addon-shortvideo/mine-pr-addon-shortvideo',
  },
  {
    key: 'digitalHuman',
    perm: 'digitalHuman',
    title: '数字人口播',
    sub: '口播成片（形象、文案、动作）',
    glyph: '◉',
    tone: 'rose',
    url: '/pages/subpack-pr/mine-pr-addon-digital-human/mine-pr-addon-digital-human',
  },
  {
    key: 'aiDrama',
    perm: 'aiDrama',
    title: 'AI短剧',
    sub: '场景、故事、角色，再出片',
    glyph: '剧',
    tone: 'rose',
    url: '/pages/subpack-pr/mine-pr-addon-short-drama/mine-pr-addon-short-drama',
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
