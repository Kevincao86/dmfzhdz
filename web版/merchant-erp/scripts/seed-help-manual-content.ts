/**
 * 将内置帮助手册种子写入 ops_registry_snapshot（三版或指定 edition）。
 * 用法（轻量 ECS，需 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY）：
 *   cd web版/merchant-erp && node --experimental-strip-types scripts/seed-help-manual-content.ts
 *   node --experimental-strip-types scripts/seed-help-manual-content.ts partner
 */
import { readMerchantSupabaseAdminEnv } from '../vite-plugins/merchantSupabaseAdminEnv.ts'
import { getAllHelpManualSeeds, HELP_MANUAL_SEED_VERSION } from '../src/lib/helpManualSeedContent.ts'
import { setHelpManualForEdition } from '../src/lib/helpManualRegistryCore.ts'
import { createRegistrySnapshotIoFetch } from '../src/lib/registrySnapshotIoFetch.ts'
import type { HelpManualEdition } from '../src/lib/helpManualTypes.ts'

const ALL: HelpManualEdition[] = ['merchant', 'partner', 'fulfillment']

async function main() {
  const arg = String(process.argv[2] || 'all').trim().toLowerCase()
  const targets =
    arg === 'all'
      ? ALL
      : ALL.includes(arg as HelpManualEdition)
        ? [arg as HelpManualEdition]
        : null
  if (!targets) {
    console.error('用法: seed-help-manual-content.ts [all|merchant|partner|fulfillment]')
    process.exit(1)
  }

  const { supabaseUrl, serviceRole, missingParts } = readMerchantSupabaseAdminEnv()
  if (missingParts.length > 0) {
    console.error('缺少环境变量:', missingParts.join(', '))
    process.exit(1)
  }

  const seeds = getAllHelpManualSeeds()
  const io = createRegistrySnapshotIoFetch(supabaseUrl, serviceRole)
  const data = await io.load()

  for (const edition of targets) {
    const seed = seeds[edition]
    setHelpManualForEdition(data, edition, seed.categories, seed.articles)
    console.log(
      `OK ${edition}: ${seed.categories.length} 分类, ${seed.articles.length} 文章 (seed ${HELP_MANUAL_SEED_VERSION})`,
    )
  }

  await io.save(data)
  console.log('已写入 ops_registry_snapshot')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
