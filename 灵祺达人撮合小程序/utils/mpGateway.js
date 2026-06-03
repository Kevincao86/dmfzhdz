const mp = require('./mpEcsClient.js')

module.exports = {
  gatewayBase: () => '',
  hasGateway: () => false,
  apiUrl: (path) => mp.toUrl(path),
  gatewayGet: (path) => mp.call({ method: 'GET', path }),
  gatewayPost: (path, body, opts = {}) =>
    mp.call({ method: 'POST', path, body, headers: opts.header || {} }),
}
