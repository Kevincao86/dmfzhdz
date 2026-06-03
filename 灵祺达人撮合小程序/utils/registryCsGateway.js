/** @deprecated 请用 opsRegistryTalentMp → merchantApi → mpEcsClient（仅 ECS） */
const mp = require('./mpEcsClient.js')
const HALL = '/api/meoo-ops-mp-hall-registry'

module.exports = {
  hallRegistryUrl: () => mp.toUrl(HALL),
  fetchHallRegistryViaCsGateway: () => mp.call({ method: 'GET', path: HALL }),
}
