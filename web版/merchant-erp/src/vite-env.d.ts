/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 商家管理后台源地址：dev 客服转发；线上用于 ERP 拉取 /api/ops-sync/*（注册表）跨域请求 */
  readonly VITE_MERCHANT_ADMIN_ORIGIN?: string
  /** 网关 API 根 URL；不设则同源 */
  readonly VITE_MERCHANT_API_BASE_URL?: string
  /** 覆盖在线客服 ws；不设时 dev 下为同源 `/__meoo_support_online`（经 ERP Vite 代理到 `VITE_MERCHANT_ADMIN_ORIGIN`） */
  readonly VITE_SUPPORT_RELAY_WS?: string
  /** 配置后启用 Supabase 登录与租户会话；不设则保持原有开放演示模式 */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 与运营开通账号、Edge Function `TENANT_EMAIL_DOMAIN` 一致；默认 users.meoo.test */
  readonly VITE_SUPABASE_TENANT_EMAIL_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
