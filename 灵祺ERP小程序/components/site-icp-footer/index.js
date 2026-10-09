const { MP_ICP_FILING, MP_PSB_FILING } = require('../../utils/siteIcp')

Component({
  data: {
    copyright: `© ${new Date().getFullYear()} 温州灵祺智能科技有限公司 Copyright. All Rights Reserved.`,
    filing: MP_ICP_FILING,
    psbFiling: MP_PSB_FILING,
  },
})
