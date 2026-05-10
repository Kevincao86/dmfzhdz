/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MERCHANT_ERP_ORIGIN?: string
  readonly VITE_OPS_API_BASE_URL?: string
  /** 覆盖客服 ws；不设时 dev 下为「ERP 源」`/__meoo_support_relay`（须先起 merchant-erp dev） */
  readonly VITE_SUPPORT_RELAY_WS?: string
  /** 与 Vercel 环境变量 MEOO_SUPPORT_OPS_HTTP_TOKEN 相同；启用在线客服云端 HTTP 轮询（需迁移 support_relay_messages） */
  readonly VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN?: string
  /** 启用后「手动创建客户」会先调 Supabase Edge Function 开通租户与 Auth 用户 */
  readonly VITE_SUPABASE_URL?: string
  /** 与 ERP、Edge Function 一致；默认 users.meoo.test */
  readonly VITE_SUPABASE_TENANT_EMAIL_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
