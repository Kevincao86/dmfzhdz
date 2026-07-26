/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ERP_AUTH_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
