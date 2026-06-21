/** Promise 超时，避免注册表请求一直转圈 */
function withTimeout(promise, ms, label) {
  const tag = label || '请求'
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${tag}超时（${ms / 1000}s）`)), ms)
    promise
      .then((v) => {
        clearTimeout(t)
        resolve(v)
      })
      .catch((e) => {
        clearTimeout(t)
        reject(e)
      })
  })
}

module.exports = { withTimeout }
