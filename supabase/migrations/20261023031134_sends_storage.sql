-- S3-06: sends and the private photos bucket (docs/plans/2026-10-22-s3-backend.md, "Functions", "Row policies" and
-- "Storage"; D40 a send is a frozen copy, D50 blocking). A send is read by its sender and, while it is not withdrawn
-- and they haven't blocked the sender, its recipient; it is written only through the four functions below. A photo
-- object is read by whoever reads its spot or its send, and written only under the writer's own spot or send.
-- Append new migrations; never edit this one.

-- Sends ---------------------------------------------------------------------------------------------------------------

-- Whether the caller reads send p_send: its sender (withdrawn or not), or its recipient while the send is not
-- withdrawn and the recipient hasn't blocked the sender (D50 hides a blocked user's sends). The one rule for the sends
-- policy, send photos in storage, and Save / Dismiss.
create function public.can_read_send(p_send uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.sender = auth.uid()
      or (s.recipient = auth.uid() and s.withdrawn_at is null
          and not exists (select 1 from public.blocks b where b.blocker = s.recipient and b.blocked = s.sender))
    from public.sends s
    where s.id = p_send
  ), false);
$$;

-- A send of a frozen payload (D40, a JSON object of at most 1 MB) with the client's id. A recipient must be an accepted friend (§1: friends are who
-- you Send to) with no block either way; not a friend and blocked raise the same error (D50: they aren't told).
-- p_recipient NULL = a link-only send (S9). The pair lock (block_user takes it too) orders a send racing a block: it
-- commits first and the block hides it, or it waits and sees the block. Reusing an existing id raises (23505).
create function public.create_send(p_id uuid, p_recipient uuid, p_payload jsonb)
returns uuid
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
  if p_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 1048576 then
    raise exception 'a send needs an id and a payload object of at most 1 MB' using errcode = '22023';
  end if;
  if p_recipient = v_uid then
    raise exception 'you cannot send to yourself' using errcode = '22023';
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
  insert into public.sends (id, sender, recipient, payload) values (p_id, v_uid, p_recipient, p_payload);
  return p_id;
end;
$$;

-- The sender takes a send back until the recipient saves it (D40: a saved send is the recipient's copy). Withdrawing
-- twice keeps the first time. Anyone but the sender, or an unknown id, gets the same 'no such send'.
create function public.withdraw_send(p_id uuid)
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
  if not found or v_row.sender <> v_uid then
    raise exception 'no such send' using errcode = '42501';
  end if;
  if v_row.saved_at is not null then
    raise exception 'this send was saved: it is their copy now' using errcode = '55000';
  end if;
  if v_row.withdrawn_at is null then
    update public.sends set withdrawn_at = now() where id = p_id;
  end if;
end;
$$;

-- The recipient's Save and Dismiss: only a send they can read (not withdrawn, sender not blocked). The row lock orders
-- Save against withdraw_send, so a send is never both saved and withdrawn.
create function public.mark_send_saved(p_id uuid)
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
  update public.sends set saved_at = coalesce(saved_at, now()) where id = p_id;
end;
$$;

create function public.dismiss_send(p_id uuid)
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
  update public.sends set dismissed_at = coalesce(dismissed_at, now()) where id = p_id;
end;
$$;

grant execute on function public.can_read_send(uuid), public.create_send(uuid, uuid, jsonb),
  public.withdraw_send(uuid), public.mark_send_saved(uuid), public.dismiss_send(uuid)
  to authenticated;

-- sends: read per can_read_send (the sender/recipient test first, so the indexes on sender and recipient serve a
-- pull); no INSERT, UPDATE or DELETE policy, so the recipient can't change a payload and nobody rewrites a send.
create policy sends_select on public.sends for select to authenticated
  using ((sender = (select auth.uid()) or recipient = (select auth.uid())) and public.can_read_send(id));

-- Storage -------------------------------------------------------------------------------------------------------------

-- One private bucket (D45: a link preview gets short-lived signed URLs, never public ones). JPEG only, as D46
-- re-encodes every upload (long edge ≤ 2048 px); 10 MB is far above such a file. A bucket made earlier (say, in a
-- dashboard) is set to the same, never left public.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- NULL instead of an error for text that is not a uuid.
create function public.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- A photo path is exactly '<owner uuid>/<spot uuid>/<media uuid>.jpg' or 'sends/<send uuid>/<media uuid>.jpg', in
-- lowercase as uuid::text and the app's ids (expo-crypto lowercases) print them; anything else is refused.
create function public.photo_path_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_name ~ '^(sends|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$',
    false
  );
$$;

-- Whether the caller reads a photo object. A send's photo: whoever reads the send. A spot's photo: the owner reads
-- everything under their own prefix (a photo uploads before its media row, S5); anyone else needs the prefix to be
-- the spot's owner, a live media row for that photo on that spot (a removed photo is gone for members, as in
-- media_select), and can_read_spot, evaluated on every query, so a removed member's next read is empty.
create function public.can_read_photo(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_spot uuid;
begin
  if v_uid is null or not public.photo_path_ok(p_name) then
    return false;
  end if;
  v_spot := public.try_uuid(split_part(p_name, '/', 2));
  if split_part(p_name, '/', 1) = 'sends' then
    return public.can_read_send(v_spot);
  end if;
  if public.try_uuid(split_part(p_name, '/', 1)) = v_uid then
    return true;
  end if;
  return exists (
      select 1
      from public.spots s
      join public.media m on m.spot_id = s.id
      where s.id = v_spot
        and s.owner_id = public.try_uuid(split_part(p_name, '/', 1))
        and m.id = public.try_uuid(left(split_part(p_name, '/', 3), -4))
        and m.deleted_at is null
    )
    and public.can_read_spot(v_spot);
end;
$$;

-- Whether the caller may p_op ('insert' | 'update' | 'delete') a photo object: anything under their own prefix for a
-- spot they own. A send's photos are the sender's and write-once (D40: the recipient keeps what they were sent): a new
-- one only while the send is neither withdrawn nor saved, never an overwrite or a move, and a delete until it is
-- saved (a withdrawn send's photos can go).
create function public.can_write_photo(p_name text, p_op text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
begin
  if v_uid is null or not public.photo_path_ok(p_name) then
    return false;
  end if;
  v_target := public.try_uuid(split_part(p_name, '/', 2));
  if split_part(p_name, '/', 1) = 'sends' then
    return exists (select 1 from public.sends s
                   where s.id = v_target and s.sender = v_uid and s.saved_at is null
                     and (p_op = 'delete' or (p_op = 'insert' and s.withdrawn_at is null)));
  end if;
  return public.try_uuid(split_part(p_name, '/', 1)) = v_uid
    and exists (select 1 from public.spots s where s.id = v_target and s.owner_id = v_uid);
end;
$$;

grant execute on function public.can_read_photo(text), public.can_write_photo(text, text) to authenticated;

-- storage.objects, bucket 'photos' only (no other bucket has a policy, so nothing else is readable or writable). The
-- Storage API runs these as the signed-in user; an upsert needs SELECT and UPDATE, a move UPDATE on both names.
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.can_read_photo(name));
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.can_write_photo(name, 'insert'));
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.can_write_photo(name, 'update'))
  with check (bucket_id = 'photos' and public.can_write_photo(name, 'update'));
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.can_write_photo(name, 'delete'));
