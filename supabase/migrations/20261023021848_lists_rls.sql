-- S3-04: who reads and writes a hit list, its spots and its members (docs/plans/2026-10-22-s3-backend.md, "Functions"
-- and "Row policies"; D42 roles, D43 a member's spots leave with them, D50 blocks, D57 invitations). The owner does
-- everything; a 'member' with role 'add' adds and removes their own spots; a 'view' member reads; an 'invited' user
-- sees the list's name and owner and their own row until Join. Append new migrations; never edit this one.

-- Helpers for the policies. security definer so a policy on one of the three tables can look at the others without
-- their policies applying (no RLS recursion). They answer for auth.uid() only, so nobody can probe another user.

create function public.is_list_owner(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.hit_lists l where l.id = p_list and l.owner_id = auth.uid());
$$;

-- A joined member ('invited' is not a member, D57), of the given role when one is given.
create function public.is_list_member(p_list uuid, p_role text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hit_list_members m
    where m.list_id = p_list and m.user_id = auth.uid() and m.status = 'member'
      and (p_role is null or m.role = p_role)
  );
$$;

create function public.is_list_invitee(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hit_list_members m
    where m.list_id = p_list and m.user_id = auth.uid() and m.status = 'invited'
  );
$$;

-- Whether the caller may put a spot row in the list: a live manual list (area lists compute their spots, S2) that
-- they own, or that is shared and they joined with role 'add' (D42). Spot ownership is checked by the policy.
create function public.can_add_to_list(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hit_lists l
    where l.id = p_list
      and l.kind = 'manual'
      and l.deleted_at is null
      and (
        l.owner_id = auth.uid()
        or (
          l.shared
          and exists (
            select 1 from public.hit_list_members m
            where m.list_id = l.id and m.user_id = auth.uid() and m.status = 'member' and m.role = 'add'
          )
        )
      )
  );
$$;

-- Whether the caller may invite p_user: the caller owns the live, shared list; p_user is someone else, an accepted
-- friend (§1: friends are who you share with), and neither has blocked the other (D50). Links are S3-07's path.
create function public.can_invite_to_list(p_list uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is distinct from auth.uid()
    and exists (
      select 1 from public.hit_lists l
      where l.id = p_list and l.owner_id = auth.uid() and l.shared and l.deleted_at is null
    )
    and exists (
      select 1 from public.friendships f
      where f.user_a = least(auth.uid(), p_user) and f.user_b = greatest(auth.uid(), p_user)
        and f.status = 'accepted'
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker = p_user and b.blocked = auth.uid()) or (b.blocker = auth.uid() and b.blocked = p_user)
    );
$$;

-- Whether the caller reads the list's spot rows: the owner always; a 'member' while the list is shared and live (a
-- deleted list's rows say nothing a member needs).
create function public.can_read_list_spots(p_list uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.hit_lists l
    where l.id = p_list
      and (
        l.owner_id = auth.uid()
        or (
          l.shared
          and l.deleted_at is null
          and exists (
            select 1 from public.hit_list_members m
            where m.list_id = l.id and m.user_id = auth.uid() and m.status = 'member'
          )
        )
      )
  );
$$;

grant execute on function public.is_list_owner(uuid), public.is_list_member(uuid, text),
  public.is_list_invitee(uuid), public.can_add_to_list(uuid), public.can_invite_to_list(uuid, uuid),
  public.can_read_list_spots(uuid)
  to authenticated;

-- hit_lists: no DELETE policy (a delete is a soft delete, an UPDATE). Only the owner writes; members and invitees
-- read the row (an invitee sees the name and owner, and the row's other columns such as an area's circle; the spot
-- rows need 'member', so no count leaks).
create policy hit_lists_select on public.hit_lists for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_list_member(id) or public.is_list_invitee(id));
create policy hit_lists_insert on public.hit_lists for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy hit_lists_update on public.hit_lists for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- A list's identity never changes: can_read_spot's area branch trusts owner_id, and kind decides whether spot rows
-- or a circle grant read (S3-03 review). Runs before the stale guard (t10) and rev (t20).
create function public.keep_list_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
     or new.kind is distinct from old.kind or new.created_at is distinct from old.created_at then
    raise exception 'hit list id, owner_id, kind and created_at are fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t05_keep_identity before update on public.hit_lists
  for each row execute function public.keep_list_identity();

-- Turning sharing off, by stop_sharing or by a plain UPDATE (a sync push), drops every member and invitee (their
-- spots go with them, D43) and every spot row the owner didn't add, so turning it on again restores nobody.
create function public.drop_list_sharing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.hit_list_members m where m.list_id = new.id;
  delete from public.hit_list_spots s where s.list_id = new.id and s.added_by <> new.owner_id;
  return null;
end;
$$;

create trigger t30_unshare after update of shared on public.hit_lists
  for each row when (old.shared and not new.shared) execute function public.drop_list_sharing();

-- hit_list_spots: read by the owner and members; added only by its writer, for a spot the writer owns, everyone the
-- owner included (otherwise anyone could expose another rider's spot through their own shared list, §3.3); removed
-- by whoever added it or by the list owner (D42). No UPDATE.
create policy hit_list_spots_select on public.hit_list_spots for select to authenticated
  using (public.can_read_list_spots(list_id));
create policy hit_list_spots_insert on public.hit_list_spots for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
    and public.can_add_to_list(list_id)
  );
create policy hit_list_spots_delete on public.hit_list_spots for delete to authenticated
  using (added_by = (select auth.uid()) or public.is_list_owner(list_id));

-- A member's add locks their membership row (FOR SHARE) until the add commits, so a concurrent Leave, Remove or Stop
-- sharing waits for it and its D43 delete then sees the new row (no row outlives its adder's membership). The
-- policy has already checked the role; this re-checks it under the lock.
create function public.lock_adder_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_list_owner(new.list_id) then
    return new;
  end if;
  perform 1 from public.hit_list_members m
  where m.list_id = new.list_id and m.user_id = new.added_by and m.status = 'member' and m.role = 'add'
  for share;
  if not found then
    raise exception 'not a member who can add to this list' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t10_lock_membership before insert on public.hit_list_spots
  for each row execute function public.lock_adder_membership();

-- hit_list_members: the owner sees every row, a member sees the member strip, an invitee only their own row. The
-- owner invites (an 'invited' row, D57); the owner changes roles; the row's user joins; the owner or the row's user
-- deletes it (Remove, Decline, Leave).
create policy hit_list_members_select on public.hit_list_members for select to authenticated
  using (public.is_list_owner(list_id) or user_id = (select auth.uid()) or public.is_list_member(list_id));
create policy hit_list_members_insert on public.hit_list_members for insert to authenticated
  with check (
    status = 'invited'
    and joined_at is null
    and invited_by = (select auth.uid())
    and public.can_invite_to_list(list_id, user_id)
  );
create policy hit_list_members_update on public.hit_list_members for update to authenticated
  using (public.is_list_owner(list_id) or user_id = (select auth.uid()))
  with check (public.is_list_owner(list_id) or user_id = (select auth.uid()));
create policy hit_list_members_delete on public.hit_list_members for delete to authenticated
  using (public.is_list_owner(list_id) or user_id = (select auth.uid()));

-- What a client may change in a membership: the owner the role; the row's user only 'invited' → 'member' (Join,
-- which stamps joined_at). Nobody re-points a row. The security-definer functions (current_user is their owner) and
-- the service role are not limited here.
create function public.guard_member_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.list_id is distinct from old.list_id or new.user_id is distinct from old.user_id
     or new.invited_by is distinct from old.invited_by or new.invited_at is distinct from old.invited_at then
    raise exception 'a membership''s list, user and invitation are fixed' using errcode = '42501';
  end if;
  if public.is_list_owner(old.list_id) then
    if new.status is distinct from old.status or new.joined_at is distinct from old.joined_at then
      raise exception 'the owner changes only a member''s role' using errcode = '42501';
    end if;
  elsif old.user_id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'only the owner changes a role' using errcode = '42501';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'invited' and new.status = 'member' then
        if not exists (select 1 from public.hit_lists l
                       where l.id = old.list_id and l.shared and l.deleted_at is null) then
          raise exception 'this list is not shared any more' using errcode = '42501';
        end if;
        new.joined_at := now();
      else
        raise exception 'a member can only join' using errcode = '42501';
      end if;
    elsif new.joined_at is distinct from old.joined_at then
      raise exception 'joined_at is set by Join' using errcode = '42501';
    end if;
  else
    raise exception 'not the list owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t10_member_guard before update on public.hit_list_members
  for each row execute function public.guard_member_update();

-- D43 in one place: whenever a membership row goes (Leave, Remove, Decline, Stop sharing, a direct DELETE, a deleted
-- account), the spots that member added leave the list with them. The spots themselves stay theirs. On Join it
-- also clears any row left from an earlier membership, so rejoining never brings old spots back.
create function public.remove_member_spots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.hit_list_spots where list_id = old.list_id and added_by = old.user_id;
  return null;
end;
$$;

create trigger t30_member_spots_leave after delete on public.hit_list_members
  for each row execute function public.remove_member_spots();
create trigger t30_member_spots_join after update of status on public.hit_list_members
  for each row when (old.status = 'invited' and new.status = 'member') execute function public.remove_member_spots();

-- Functions --------------------------------------------------------------------------------------------------------

-- A member or invitee leaves (or declines); their spots leave with them (the trigger). The owner can't leave: they
-- stop sharing or delete the list.
create function public.leave_list(p_list uuid)
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
  if exists (select 1 from public.hit_lists l where l.id = p_list and l.owner_id = v_uid) then
    raise exception 'the owner cannot leave their own list' using errcode = '42501';
  end if;
  delete from public.hit_list_members m where m.list_id = p_list and m.user_id = v_uid;
  if not found then
    raise exception 'not a member of this list' using errcode = '42501';
  end if;
end;
$$;

-- The owner removes a member or withdraws an invitation; the member's spots leave with them (the trigger).
create function public.remove_member(p_list uuid, p_user uuid)
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
  if not exists (select 1 from public.hit_lists l where l.id = p_list and l.owner_id = v_uid) then
    raise exception 'not the list owner' using errcode = '42501';
  end if;
  delete from public.hit_list_members m where m.list_id = p_list and m.user_id = p_user;
  if not found then
    raise exception 'not a member of this list' using errcode = '42501';
  end if;
end;
$$;

-- The owner stops sharing: the list is private again; t30_unshare drops every member and invitee and every spot row
-- not added by the owner (D43; members lose read on their next query). updated_at never moves backwards (D48 guard).
create function public.stop_sharing(p_list uuid)
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
  if not exists (select 1 from public.hit_lists l where l.id = p_list and l.owner_id = v_uid) then
    raise exception 'not the list owner' using errcode = '42501';
  end if;
  update public.hit_lists set shared = false, updated_at = greatest(updated_at, now()) where id = p_list;
end;
$$;

grant execute on function public.leave_list(uuid), public.remove_member(uuid, uuid), public.stop_sharing(uuid)
  to authenticated;
