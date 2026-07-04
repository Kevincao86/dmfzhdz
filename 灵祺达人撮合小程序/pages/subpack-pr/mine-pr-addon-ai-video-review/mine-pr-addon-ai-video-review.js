const { createAddonAiCompliancePage } = require('../../../utils/addonAiCompliancePageCore.js')

const pageDef = createAddonAiCompliancePage('video')
Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  ...pageDef,
})
