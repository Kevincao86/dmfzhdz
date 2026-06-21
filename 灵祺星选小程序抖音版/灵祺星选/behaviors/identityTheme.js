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
      identityTheme.applyToPage(this)
    },
  },
})
