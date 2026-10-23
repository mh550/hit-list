-- S7-03: sending (docs/plans/2026-10-22-s7-send.md, "Photo copy"; D77 photos are staged before the send row, D80 the
-- sender's name comes from the server). The client copies every photo to sends/<id>/ under a send id it made, then
-- calls create_send, so a recipient never reads a send whose photos are missing. Append new migrations; never edit
-- this one.

-- Staging ---------------------------------------------------------------------------------------------------------

-- Whether p_name is the caller's staged photo: a send photo path whose object the caller owns (p_owner_id, the
-- object's owner_id) under a send id no send has yet. Once the send exists, can_read_send / can_write_photo decide.
create function public.is_own_staged_photo(p_name text, p_owner_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_owner_id is distinct from v_uid::text or not public.photo_path_ok(p_name)
     or split_part(p_name, '/', 1) <> 'sends' then
    return false;
  end if;
  return not exists (select 1 from public.sends s where s.id = public.try_uuid(split_part(p_name, '/', 2)));
end;
$$;

grant execute on function public.is_own_staged_photo(text, text) to authenticated;

-- Storage's copy needs SELECT and INSERT, its remove DELETE and SELECT: the stager gets all three on their own staged
-- objects, nobody else any.
drop policy photos_select on storage.objects;
drop policy photos_insert on storage.objects;
drop policy photos_delete on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (public.can_read_photo(name) or public.is_own_staged_photo(name, owner_id)));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos'
              and (public.can_write_photo(name, 'insert') or public.is_own_staged_photo(name, owner_id)));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos'
         and (public.can_write_photo(name, 'delete') or public.is_own_staged_photo(name, owner_id)));

-- A rider's staged photos (a send that never got its row: the app was killed between the copy and create_send), for
-- account-delete, which can't find them with Storage's list without walking every send folder. Service role only;
-- not a definer function (the service role reads past RLS on its own).
create function public.staged_send_objects(p_uid uuid)
returns setof text
language sql
stable
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'photos' and o.name like 'sends/%' and o.owner_id = p_uid::text
    and not exists (select 1 from public.sends s where s.id = public.try_uuid(split_part(o.name, '/', 2)))
  order by o.name;
$$;

revoke execute on function public.staged_send_objects(uuid) from public, anon, authenticated;
grant execute on function public.staged_send_objects(uuid) to service_role;

-- create_send -----------------------------------------------------------------------------------------------------

-- As shipped (S3-06), plus: an id somebody else staged a photo under (or one nobody owns) is refused, so a send never
-- shows another rider's photos; the caller needs a username; the payload's sender is the caller's profile (D80), so a
-- forged one never reaches the recipient.
create or replace function public.create_send(p_id uuid, p_recipient uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 1048576 then
    raise exception 'a send needs an id and a payload object of at most 1 MB' using errcode = '22023';
  end if;
  if p_recipient = v_uid then
    raise exception 'you cannot send to yourself' using errcode = '22023';
  end if;
  select * into v_profile from public.profiles p where p.id = v_uid;
  if v_profile.username is null then
    raise exception 'choose a username before sending' using errcode = '22023';
  end if;
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'photos' and o.name like 'sends/' || p_id::text || '/%'
               and o.owner_id is distinct from v_uid::text) then
    raise exception 'another rider''s photos are under this send id' using errcode = '42501';
  end if;
  if p_recipient is not null then
    perform public.lock_user_pair(v_uid, p_recipient);
    if not exists (select 1 from public.friendships f
                   where f.user_a = least(v_uid, p_recipient) and f.user_b = greatest(v_uid, p_recipient)
                     and f.status = 'accepted')
       or exists (select 1 from public.blocks b
                  where (b.blocker = v_uid and b.blocked = p_recipient)
                     or (b.blocker = p_recipient and b.blocked = v_uid)) then
      raise exception 'you can only send to friends' using errcode = '42501';
    end if;
  end if;
  insert into public.sends (id, sender, recipient, payload)
  values (p_id, v_uid, p_recipient,
          p_payload || jsonb_build_object('sender', jsonb_build_object('username', v_profile.username::text,
                                                                      'display_name', v_profile.display_name)));
  return p_id;
end;
$$;

-- mark_send_saved -------------------------------------------------------------------------------------------------

-- As shipped, but a send saves once: a second phone or a stale Inbox item gets 55000 instead of saving a second set
-- of copies. p_token is the saving phone's: the same token again (a retry after a lost answer) succeeds, so only the
-- phone whose save went through inserts the copies. save_token is readable by the sender too: a random uuid.
alter table public.sends add column save_token uuid;

drop function public.mark_send_saved(uuid);
create function public.mark_send_saved(p_id uuid, p_token uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.sends;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_row from public.sends s where s.id = p_id for update;
  if not found or v_row.recipient is distinct from v_uid or not public.can_read_send(p_id) then
    raise exception 'no such send' using errcode = '42501';
  end if;
  if v_row.saved_at is not null then
    if p_token is not null and v_row.save_token = p_token then
      return;
    end if;
    raise exception 'this send was saved already' using errcode = '55000';
  end if;
  update public.sends set saved_at = now(), save_token = p_token where id = p_id;
end;
$$;

revoke execute on function public.mark_send_saved(uuid, uuid) from public, anon;
grant execute on function public.mark_send_saved(uuid, uuid) to authenticated;

-- spots.from_username ---------------------------------------------------------------------------------------------

-- 'From @ana' on a saved copy (D80: frozen at save time, synced with the spot). The profiles_username_format rule
-- (citext keeps the case), so a mixed-case name never parks the recipient's push with 23514.
alter table public.spots add column from_username text
  constraint spots_from_username_format check (from_username is null or from_username ~ '^[A-Za-z0-9_.]{3,20}$');
