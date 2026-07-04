const { createAddonAiCompliancePage } = require('../../utils/addonAiCompliancePageCore.js')

const pageDef = createAddonAiCompliancePage('script')
Page({
  behaviors: [require('../../behaviors/identityTheme')],
  ...pageDef,
})
