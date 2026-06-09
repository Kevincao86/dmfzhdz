/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MP_API_BASE?: string
  readonly VITE_ERP_AUTH_API_BASE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** 逗号/分号分隔：accountId、loginName、lingqiTalentId、lingqiPrId 等 */
  readonly VITE_MP_ADDON_BETA_ALLOWLIST?: string
  /** true/1 时增值服务对全部登录用户开放 */
  readonly VITE_MP_ADDON_OPEN_ALL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
