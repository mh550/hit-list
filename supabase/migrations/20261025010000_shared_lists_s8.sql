-- S8-02: shared lists from the client (docs/plans/2026-10-22-s8-shared-lists.md, "Server"). Append new migrations;
-- never edit this one.

-- The caller's open invitations (D83): an invitee reads the list row but none of its spot rows (RLS), so the count
-- '(12 spots)' comes from here. Live, shared lists only, and none where either side blocked the other (D50). The
-- count is what a member would read (can_read_spot): a manual list's live spots added by their own owner while that
-- owner is the list's owner or a joined member; an area list's owner's live, located spots inside the circle that
-- pass its filters. Nothing about any spot but the count leaves.
create function public.list_invitations()
returns table (list_id uuid, name text, kind text, owner_id uuid, owner_username text, owner_display_name text,
               role text, spot_count integer, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.name, l.kind, l.owner_id, p.username, p.display_name, m.role,
    case
      when l.kind = 'manual' then (
        select count(*)::integer
        from public.hit_list_spots hs
        join public.spots s on s.id = hs.spot_id
        where hs.list_id = l.id
          and s.deleted_at is null
          and hs.added_by = s.owner_id
          and (
            s.owner_id = l.owner_id
            or exists (
              select 1 from public.hit_list_members mm
              where mm.list_id = l.id and mm.user_id = s.owner_id and mm.status = 'member'
            )
          )
      )
      else (
        select count(*)::integer
        from public.spots s
        where s.owner_id = l.owner_id
          and s.deleted_at is null
          and not (s.lat = 0 and s.lng = 0)
          and extensions.st_dwithin(s.geog, l.area_center, l.area_radius_m, false)
          and public.spot_matches_filters(s, l.area_filters)
      )
    end,
    m.invited_at
  from public.hit_list_members m
  join public.hit_lists l on l.id = m.list_id
  join public.profiles p on p.id = l.owner_id
  where m.user_id = auth.uid()
    and m.status = 'invited'
    and l.shared
    and l.deleted_at is null
    and not exists (
      select 1 from public.blocks b
      where (b.blocker = l.owner_id and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = l.owner_id)
    )
  order by m.invited_at desc, l.id;
$$;

-- The owner turns sharing on and gets the row back (with its new rev). updated_at never moves backwards: a client
-- update stamped with the phone's clock would lose to the stale guard after stop_sharing's server now().
create function public.share_list(p_list uuid)
returns public.hit_lists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.hit_lists;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.hit_lists set shared = true, updated_at = greatest(updated_at, now())
  where id = p_list and owner_id = v_uid and deleted_at is null
  returning * into v_row;
  if not found then
    raise exception 'not a live list of yours' using errcode = '42501';
  end if;
  return v_row;
end;
$$;

revoke execute on function public.list_invitations(), public.share_list(uuid) from public, anon;
grant execute on function public.list_invitations(), public.share_list(uuid) to authenticated;
