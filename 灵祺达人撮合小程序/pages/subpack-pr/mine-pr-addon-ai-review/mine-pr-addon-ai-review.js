const { createAddonAiCompliancePage } = require('../../../utils/addonAiCompliancePageCore.js')

const pageDef = createAddonAiCompliancePage('merged')
Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  ...pageDef,
})
