-- S9-02: links (docs/plans/2026-10-22-s9-links.md "Server"). list_my_links also names who used an invite link, for
-- the members screen's 'Used by @ben'. Same columns as S3-07 plus used_by and used_by_username; still never the
-- hash; still only the creator's links; still for signed-in riders only. Append new migrations; never edit this one.

drop function public.list_my_links(text);

create function public.list_my_links(p_kind text)
returns table (id uuid, kind text, send_id uuid, list_id uuid, role text, created_at timestamptz,
               expires_at timestamptz, revoked_at timestamptz, used_at timestamptz, used_by uuid,
               used_by_username extensions.citext)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.kind, l.send_id, l.list_id, l.role, l.created_at, l.expires_at, l.revoked_at, l.used_at, l.used_by,
         p.username
  from public.links l
  left join public.profiles p on p.id = l.used_by
  where l.created_by = auth.uid() and (p_kind is null or l.kind = p_kind)
  order by l.created_at desc, l.id;
$$;

revoke execute on function public.list_my_links(text) from public, anon;
grant execute on function public.list_my_links(text) to authenticated;
