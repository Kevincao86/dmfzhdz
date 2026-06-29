-- PR 待视频审核 · 外部分享标注（无需登录）

create table if not exists public.mp_video_review_share_links (
  id uuid primary key default gen_random_uuid(),
  mp_order_id text not null,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mp_video_review_share_links_order_idx
  on public.mp_video_review_share_links (mp_order_id, created_at desc);

create table if not exists public.mp_video_review_share_annotations (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.mp_video_review_share_links (id) on delete cascade,
  applicant_id text not null,
  visitor_name text not null default '访客',
  frame_time_sec numeric,
  rect_x numeric not null default 0,
  rect_y numeric not null default 0,
  rect_w numeric not null default 0.2,
  rect_h numeric not null default 0.2,
  comment_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mp_video_review_share_annotations_link_idx
  on public.mp_video_review_share_annotations (share_link_id, applicant_id, created_at desc);

alter table public.mp_video_review_share_links enable row level security;
alter table public.mp_video_review_share_annotations enable row level security;

grant select, insert, update, delete on table public.mp_video_review_share_links to service_role;
grant select, insert, update, delete on table public.mp_video_review_share_annotations to service_role;

comment on table public.mp_video_review_share_links is 'PR 视频审核外部分享链接（token 公开访问）';
comment on table public.mp_video_review_share_annotations is '外部分享页视频标注与问题评论';
