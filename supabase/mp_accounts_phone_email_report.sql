-- 只读。列出「微信账号」和「手机号账号」不是同一条的可疑拆号。不更新、不删除。
WITH members AS (
  SELECT
    m->>'wxOpenId' AS wx_open_id,
    right(regexp_replace(coalesce(m->>'contact', m->>'wechatId', ''), '\D', '', 'g'), 11) AS phone
  FROM public.ops_registry_snapshot,
       jsonb_array_elements(coalesce(registry->'mpTalentMembers', '[]'::jsonb)) m
  WHERE id = 1
    AND coalesce(m->>'wxOpenId', '') <> ''
),
prs AS (
  SELECT
    u->>'wxOpenId' AS wx_open_id,
    right(regexp_replace(coalesce(u->>'contactPhone', u->>'wechatId', ''), '\D', '', 'g'), 11) AS phone
  FROM public.ops_registry_snapshot,
       jsonb_array_elements(coalesce(registry->'mpPrUsers', '[]'::jsonb)) u
  WHERE id = 1
    AND coalesce(u->>'wxOpenId', '') <> ''
),
links AS (
  SELECT wx_open_id, phone, 'talent' AS kind FROM members
  UNION ALL
  SELECT wx_open_id, phone, 'pr' AS kind FROM prs
)
SELECT
  links.kind,
  links.phone,
  a.id AS wx_account_id,
  b.id AS phone_account_id,
  a.login_name AS wx_login_name,
  b.login_name AS phone_login_name
FROM links
JOIN public.mp_accounts a ON a.openid = links.wx_open_id
JOIN public.mp_accounts b
  ON b.id <> a.id
 AND (b.phone = links.phone OR b.login_name = links.phone)
WHERE length(links.phone) = 11
ORDER BY links.kind, links.phone;
