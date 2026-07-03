-- ECS：报名分享表关闭 RLS（PostgREST service_role 直写）

alter table if exists public.mp_applicant_pick_share_links disable row level security;
alter table if exists public.mp_applicant_pick_share_notes disable row level security;

grant select, insert, update, delete on table public.mp_applicant_pick_share_links to service_role;
grant select, insert, update, delete on table public.mp_applicant_pick_share_notes to service_role;
