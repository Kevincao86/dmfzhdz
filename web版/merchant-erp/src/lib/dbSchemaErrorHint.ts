/** PostgREST / PG：表未创建或 schema 缓存未刷新时的典型英文报错片段 */
export function shouldSuggestDbMigration(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('relation') ||
    m.includes('schema cache') ||
    m.includes('merchant_payment_orders') ||
    m.includes('tenant_wallet_ledger') ||
    m.includes('could not find the table') ||
    (m.includes('does not exist') && (m.includes('table') || m.includes('column')))
  )
}

/** 展示给用户的中文说明（需在本地或云端执行 migrations） */
export const DB_MIGRATION_HINT_ZH =
  '数据库尚未创建「充值/订单」等相关表。请在项目根执行迁移：本地先确保 Docker 已运行，再执行 npm run supabase:start，然后执行 npm run supabase:db:reset（会重置本地数据）或 npm run supabase:migrate；若使用 Supabase 云端，打开 Dashboard → SQL Editor，将仓库 supabase/migrations 目录下的 SQL 按文件名顺序执行。完成后刷新本页再试。'
