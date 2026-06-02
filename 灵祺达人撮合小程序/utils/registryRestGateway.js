const supabase = require('./supabaseRest.js')

const RPC_NAME = 'mp_talent_fetch_hall_registry'

function isRestRegistryAvailableError(msg) {
  return /42883|does not exist|PGRST202|function.*not found|mp_talent_fetch_hall_registry/i.test(
    String(msg || ''),
  )
}

/** 经 PostgREST 拉招募大厅（与 /erp-api/meoo-ops-mp-hall-registry 同结构） */
async function fetchHallRegistryViaRest() {
  if (!supabase.hasSupabase()) {
    throw new Error('未配置 ECS 数据网关')
  }
  const data = await supabase.rpc(RPC_NAME, {})
  if (!data || typeof data !== 'object') {
    throw new Error('registry_rest_empty')
  }
  if (data.ok === false) {
    throw new Error(String(data.error || data.detail || 'registry_rest_failed'))
  }
  return data
}

module.exports = {
  RPC_NAME,
  isRestRegistryAvailableError,
  fetchHallRegistryViaRest,
}
