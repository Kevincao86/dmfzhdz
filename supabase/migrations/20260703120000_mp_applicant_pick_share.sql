-- PR 报名管理 · 外部分享商家反选备注（无需登录）

create table if not exists public.mp_applicant_pick_share_links (
  id uuid primary key default gen_random_uuid(),
  mp_order_id text not null,
  token text not null unique,
  applicant_ids jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mp_applicant_pick_share_links_order_idx
  on public.mp_applicant_pick_share_links (mp_order_id, created_at desc);

create table if not exists public.mp_applicant_pick_share_notes (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.mp_applicant_pick_share_links (id) on delete cascade,
  applicant_id text not null,
  visitor_name text not null default '商家',
  note_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (share_link_id, applicant_id)
);

create index if not exists mp_applicant_pick_share_notes_link_idx
  on public.mp_applicant_pick_share_notes (share_link_id, applicant_id);

alter table public.mp_applicant_pick_share_links enable row level security;
alter table public.mp_applicant_pick_share_notes enable row level security;

grant select, insert, update, delete on table public.mp_applicant_pick_share_links to service_role;
grant select, insert, update, delete on table public.mp_applicant_pick_share_notes to service_role;

comment on table public.mp_applicant_pick_share_links is 'PR 报名明细外部分享链接（含已选达人 ID 列表）';
comment on table public.mp_applicant_pick_share_notes is '外部分享页商家对达人的反选备注';
