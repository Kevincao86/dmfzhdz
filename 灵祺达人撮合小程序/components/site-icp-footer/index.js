const { MP_ICP_FILING } = require('../../utils/siteIcp')

Component({
  properties: {
    compact: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    filing: MP_ICP_FILING,
  },
})
