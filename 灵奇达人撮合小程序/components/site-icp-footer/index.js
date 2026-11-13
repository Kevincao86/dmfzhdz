const { MP_ICP_FILING, MP_PSB_FILING } = require('../../utils/siteIcp')

Component({
  properties: {
    compact: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    filing: MP_ICP_FILING,
    psbFiling: MP_PSB_FILING,
  },
})
