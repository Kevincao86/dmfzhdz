/** 登录页环墙：走 CDN/OSS，包内不上传大图 */
const mpCdnAssets = require('./mpCdnAssets.js')

const ORBIT_IMAGES = mpCdnAssets.loginOrbitImages

module.exports = { ORBIT_IMAGES, ORBIT_IMAGES_HD: ORBIT_IMAGES }
