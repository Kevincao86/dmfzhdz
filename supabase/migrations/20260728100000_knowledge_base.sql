-- 知识库：运营全局 + 租户隔离（OSS 存原文件，Postgres 存元数据与文本切片）
-- 动库前须 pg_dump 备份。auth-api 直连 5433，不依赖 PostgREST schema cache。

create table if not exists public.kb_spaces (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('ops_global', 'tenant')),
  tenant_id uuid references public.tenants (id) on delete cascade,
  title text not null default '默认知识库',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kb_spaces_scope_tenant_chk check (
    (scope = 'ops_global' and tenant_id is null)
    or (scope = 'tenant' and tenant_id is not null)
  )
);

create unique index if not exists kb_spaces_ops_global_uidx
  on public.kb_spaces (scope)
  where scope = 'ops_global' and status = 'active';

create unique index if not exists kb_spaces_tenant_uidx
  on public.kb_spaces (tenant_id)
  where scope = 'tenant' and status = 'active';

create table if not exists public.kb_documents (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.kb_spaces (id) on delete cascade,
  title text not null,
  file_type text not null default 'other'
    check (file_type in ('pdf', 'docx', 'pptx', 'md', 'txt', 'image', 'video', 'other')),
  file_name text not null default '',
  content_type text not null default 'application/octet-stream',
  oss_url text not null default '',
  object_path text not null default '',
  size_bytes bigint not null default 0,
  parse_status text not null default 'pending'
    check (parse_status in ('pending', 'ready', 'failed', 'manual')),
  parse_error text,
  summary text not null default '',
  tags text[] not null default '{}',
  visibility text not null default 'ops_only'
    check (visibility in ('ops_only', 'tenant_agents', 'all_agents')),
  feed_enabled boolean not null default true,
  uploaded_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_documents_space_id_idx on public.kb_documents (space_id);
create index if not exists kb_documents_parse_status_idx on public.kb_documents (parse_status);
create index if not exists kb_documents_visibility_idx on public.kb_documents (visibility);
create index if not exists kb_documents_created_at_idx on public.kb_documents (created_at desc);

create table if not exists public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.kb_documents (id) on delete cascade,
  chunk_index integer not null default 0,
  content text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint kb_chunks_doc_idx_uidx unique (document_id, chunk_index)
);

create index if not exists kb_chunks_document_id_idx on public.kb_chunks (document_id);
create index if not exists kb_chunks_content_fts_idx
  on public.kb_chunks using gin (to_tsvector('simple', content));

comment on table public.kb_spaces is '知识库空间：ops_global 全局或 tenant 租户隔离';
comment on table public.kb_documents is '知识库文档元数据与可见性（原文件在 OSS）';
comment on table public.kb_chunks is '知识库文本切片，供关键词检索投喂智能体';

grant select, insert, update, delete on public.kb_spaces to postgres;
grant select, insert, update, delete on public.kb_documents to postgres;
grant select, insert, update, delete on public.kb_chunks to postgres;
