/** 知识库文档类型（运营台 / 商家共用声明） */
export type KbVisibility = 'ops_only' | 'tenant_agents' | 'all_agents'
export type KbParseStatus = 'pending' | 'ready' | 'failed' | 'manual'

export type KbDocument = {
  id: string
  title: string
  file_type: string
  file_name: string
  oss_url: string
  size_bytes: number
  parse_status: KbParseStatus
  parse_error: string | null
  summary: string
  tags: string[]
  visibility: KbVisibility
  feed_enabled: boolean
  created_at: string
  updated_at: string
}
