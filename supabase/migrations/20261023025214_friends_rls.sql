-- S3-05: who reads a profile, and friend requests and blocks (docs/plans/2026-10-22-s3-backend.md, "Functions" and
-- "Row policies"; D39 exact usernames, D50 blocking). A profile is read by its user, their friends, either side of a
-- pending request (the Inbox shows who asked) and co-members of a shared list; anyone else gets only find_profile.
-- Requests and blocks are written only through the functions below. Append new migrations; never edit this one.

-- Whether the caller reads p_id's profile: themselves; an accepted friend; someone who asked them (the Inbox shows who
-- asked; the asker doesn't read the target's row, which would follow it through a rename: find_profile is their way);
-- or a live shared list both are in: both joined members, or the owner and a member or invitee.
-- security definer so the profiles policy can look at the list tables without their policies applying.
create function public.can_read_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.user_a = least(auth.uid(), p_id) and f.user_b = greatest(auth.uid(), p_id)
        and (f.status = 'accepted' or f.requested_by = p_id)
    )
    or exists (
      select 1
      from public.hit_list_members a
      join public.hit_list_members b on b.list_id = a.list_id
      join public.hit_lists l on l.id = a.list_id
      where a.user_id = auth.uid() and b.user_id = p_id and a.status = 'member' and b.status = 'member'
        and l.shared and l.deleted_at is null
    )
    or exists (
      select 1
      from public.hit_lists l
      join public.hit_list_members m on m.list_id = l.id
      where l.shared and l.deleted_at is null
        and ((l.owner_id = auth.uid() and m.user_id = p_id) or (l.owner_id = p_id and m.user_id = auth.uid()))
    ),
    false
  );
$$;

-- One transaction at a time per pair of users, so a request, a block and a new list membership between the same two
-- never interleave (two crossed requests would both insert; a request or an invitation could slip in behind a
-- block). Each caller re-reads blocks after taking it: a plpgsql statement in a volatile function sees what committed
-- before it started.
create function public.lock_user_pair(p_a uuid, p_b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(least(p_a, p_b)::text || greatest(p_a, p_b)::text, 5));
$$;

-- Exact, case-insensitive username lookup (D39: no search, no enumerating riders). No row for an unknown name, a
-- NULL name (not onboarded yet) or a target who blocked the caller; the three are indistinguishable. citext's '='
-- lives in the extensions schema, which is off this function's search_path, so it is named explicitly (a bare '='
-- would compare as text, case-sensitively).
create function public.find_profile(p_username text)
returns table (id uuid, username extensions.citext, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return query
    select p.id, p.username, p.display_name
    from public.profiles p
    where p.username operator(extensions.=) p_username::extensions.citext
      and not exists (select 1 from public.blocks b where b.blocker = p.id and b.blocked = v_uid);
end;
$$;

-- A friend request by exact username. The pair is stored once, ordered (user_a < user_b). Asking again returns the
-- same row; asking someone who already asked you accepts their request. 'user not found' for an unknown name or a
-- target who blocked the caller (same error, D50); a caller must unblock before asking.
create function public.send_friend_request(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_other uuid;
  v_row public.friendships;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select p.id into v_other from public.profiles p
  where p.username operator(extensions.=) p_username::extensions.citext;
  if v_other = v_uid then
    raise exception 'you cannot add yourself' using errcode = '22023';
  end if;
  if v_other is not null then
    perform public.lock_user_pair(v_uid, v_other);
  end if;
  if v_other is null
     or exists (select 1 from public.blocks b where b.blocker = v_other and b.blocked = v_uid) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.blocks b where b.blocker = v_uid and b.blocked = v_other) then
    raise exception 'unblock this user first' using errcode = '42501';
  end if;

  select * into v_row from public.friendships f
  where f.user_a = least(v_uid, v_other) and f.user_b = greatest(v_uid, v_other);
  if not found then
    insert into public.friendships (user_a, user_b, status, requested_by)
    values (least(v_uid, v_other), greatest(v_uid, v_other), 'pending', v_uid)
    returning * into v_row;
  elsif v_row.status = 'pending' and v_row.requested_by <> v_uid then
    update public.friendships set status = 'accepted' where id = v_row.id;
  end if;
  return v_row.id;
end;
$$;

-- The person asked accepts (the row becomes a friendship) or declines (the row goes). Nobody else answers, and a
-- friendship is not answered twice.
create function public.respond_friend_request(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.friendships;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('accept', 'decline') then
    raise exception 'action must be accept or decline' using errcode = '22023';
  end if;
  select * into v_row from public.friendships f where f.id = p_id for update;
  if not found or v_uid not in (v_row.user_a, v_row.user_b) or v_row.requested_by = v_uid
     or v_row.status <> 'pending' then
    raise exception 'no friend request to answer' using errcode = '42501';
  end if;
  if p_action = 'accept' then
    update public.friendships set status = 'accepted' where id = p_id;
  else
    delete from public.friendships where id = p_id;
  end if;
end;
$$;

-- D50: the block row, and the friendship (or either side's pending request) go; t30_withdraw_invitations (below) takes
-- any pending invitation to a list between the two with it. They aren't told. Shared lists both are in stay as they are; their pending sends are hidden by
-- the sends policy (S3-06), and find_profile, send_friend_request and invitations check blocks from now on.
create function public.block_user(p_user uuid)
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
end;
$$;

-- Lifting a block restores nothing (no friendship comes back); asking again is a new request.
create function public.unblock_user(p_user uuid)
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
  delete from public.blocks b where b.blocker = v_uid and b.blocked = p_user;
end;
$$;

grant execute on function public.can_read_profile(uuid), public.find_profile(text),
  public.send_friend_request(text), public.respond_friend_request(uuid, text), public.block_user(uuid),
  public.unblock_user(uuid)
  to authenticated;

-- profiles: the signup trigger inserts the row and the account's deletion removes it (S4, service role); the user
-- edits their username and display name. A profile's id and created_at never change.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.can_read_profile(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create function public.keep_profile_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'profile id and created_at are fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t05_keep_identity before update on public.profiles
  for each row execute function public.keep_profile_identity();

-- friendships: either side reads the row and removes it (Remove friend, or withdrawing a request); requests and
-- answers go through send_friend_request and respond_friend_request.
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- blocks: only the blocker sees or lifts a block (the blocked user can't tell); block_user inserts.
create policy blocks_select on public.blocks for select to authenticated
  using (blocker = (select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker = (select auth.uid()));

-- D58 *default*: a display name is at most 50 characters (it is shown to friends, co-members and find_profile).
alter table public.profiles add constraint profiles_display_name_length check (char_length(display_name) <= 50);

-- D50: no new membership between a blocked pair, whichever path adds it (an owner's invite, S3-07's redeem_invite, the
-- service role). The invite policy checked blocks in its own snapshot; this takes the pair lock block_user takes and
-- reads blocks again, so an invitation racing a block either commits first (and block_user deletes it) or fails.
create function public.guard_invite_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select l.owner_id into v_owner from public.hit_lists l where l.id = new.list_id;
  if v_owner is null or v_owner = new.user_id then
    return new;
  end if;
  perform public.lock_user_pair(v_owner, new.user_id);
  if exists (select 1 from public.blocks b
             where (b.blocker = v_owner and b.blocked = new.user_id)
                or (b.blocker = new.user_id and b.blocked = v_owner)) then
    raise exception 'blocked users cannot be added to each other''s lists' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t05_block_guard before insert on public.hit_list_members
  for each row execute function public.guard_invite_block();

-- An invitation needs a friendship (can_invite_to_list), so when the friendship goes (Remove friend, a block) the
-- pending invitations between the two go with it. Joined members stay (D50: shared lists stay as they are).
create function public.withdraw_pair_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.hit_list_members m
  using public.hit_lists l
  where m.list_id = l.id and m.status = 'invited'
    and ((l.owner_id = old.user_a and m.user_id = old.user_b) or (l.owner_id = old.user_b and m.user_id = old.user_a));
  return null;
end;
$$;

create trigger t30_withdraw_invitations after delete on public.friendships
  for each row execute function public.withdraw_pair_invitations();
