-- S3-08 milestone review fixes (docs/plans/2026-10-22-s3-backend.md, Review: S3-08).

-- D50: a pending invitation between a blocked pair goes even when no friendship row is left to delete (an invite that
-- raced Remove friend outlives the friendship, so t30_withdraw_invitations never saw it). Same body as before plus
-- the direct delete, both directions, under the pair lock.
create or replace function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_user = v_uid then
    raise exception 'you cannot block yourself' using errcode = '22023';
  end if;
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  perform public.lock_user_pair(v_uid, p_user);
  insert into public.blocks (blocker, blocked) values (v_uid, p_user) on conflict do nothing;
  delete from public.friendships f where f.user_a = least(v_uid, p_user) and f.user_b = greatest(v_uid, p_user);
  delete from public.hit_list_members m
  using public.hit_lists l
  where m.list_id = l.id and m.status = 'invited'
    and ((l.owner_id = v_uid and m.user_id = p_user) or (l.owner_id = p_user and m.user_id = v_uid));
end;
$$;

-- D50: Join (invited → member) is a new membership too, so it passes the same block guard as an insert (pair lock,
-- blocks re-read). Sorts before t10_member_guard.
create trigger t05_block_guard_join before update of status on public.hit_list_members
  for each row when (old.status = 'invited' and new.status = 'member') execute function public.guard_invite_block();

-- media.uploaded_by names the uploader: a client may leave it empty or put their own id there, never someone else's.
drop policy media_insert on public.media;
drop policy media_update on public.media;
create policy media_insert on public.media for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (uploaded_by is null or uploaded_by = (select auth.uid()))
    and exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
  );
create policy media_update on public.media for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (uploaded_by is null or uploaded_by = (select auth.uid()))
    and exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
  );
