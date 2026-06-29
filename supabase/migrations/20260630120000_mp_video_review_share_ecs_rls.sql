-- ECS：分享审片表关闭 RLS（与 mp_talent_chat 一致，否则 PostgREST service_role 无法 INSERT/UPDATE）

alter table if exists public.mp_video_review_share_links disable row level security;
alter table if exists public.mp_video_review_share_annotations disable row level security;

grant select, insert, update, delete on table public.mp_video_review_share_links to service_role;
grant select, insert, update, delete on table public.mp_video_review_share_annotations to service_role;
