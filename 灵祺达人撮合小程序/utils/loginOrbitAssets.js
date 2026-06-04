/** 登录页环墙：环墙用 520px 原图；展开大图用 -hd 960px（均 <200KB） */
const ORBIT_IMAGES = [
  '/images/login-orbit/orbit-01.jpg',
  '/images/login-orbit/orbit-02.jpg',
  '/images/login-orbit/orbit-03.jpg',
  '/images/login-orbit/orbit-04.jpg',
  '/images/login-orbit/orbit-05.jpg',
  '/images/login-orbit/orbit-06.jpg',
]

const ORBIT_IMAGES_HD = ORBIT_IMAGES.map((p) => p.replace(/(\.jpe?g)$/i, '-hd$1'))

module.exports = { ORBIT_IMAGES, ORBIT_IMAGES_HD }
