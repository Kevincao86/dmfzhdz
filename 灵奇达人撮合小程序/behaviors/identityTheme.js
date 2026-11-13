const identityTheme = require('../utils/identityTheme.js')

module.exports = Behavior({
  data: {
    lqThemeClass: identityTheme.themeClass('talent'),
  },
  lifetimes: {
    attached() {
      identityTheme.applyToPage(this)
    },
  },
  pageLifetimes: {
    show() {
      const userProfile = require('../utils/userProfile.js')
      const id = userProfile.readIdentity()
      if (this.data.lqThemeClass === identityTheme.themeClass(id)) {
        identityTheme.applyChrome(id, { animate: false })
        return
      }
      identityTheme.applyToPage(this)
    },
  },
})
