/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ERP_AUTH_API_BASE?: string
  readonly VITE_MEEO_SUPPORT_OPS_HTTP_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
