-- S3-07: links (docs/plans/2026-10-22-s3-backend.md, "Functions"; D44 send and invite links, D45 a token is a secret
-- and only its SHA-256 is stored). The links table keeps RLS on with no policies: nobody reads or writes it directly.
-- The creator makes, lists and revokes links; the service role (the share-preview Edge Function, S9) previews one;
-- a signed-in user redeems an invite link once. Expired, revoked, used and withdrawn links all look unknown.
-- Append new migrations; never edit this one.

-- A link to a send (by its sender, while it is not withdrawn; NULL expiry = never) or an invite link to a shared list
-- (by its owner, with a role; it expires within 7 days, a later expiry is cut to 7 days, D44). p_token_sha256 is the
-- lowercase hex SHA-256 of the client's random token (D45: the token itself never reaches the server here).
create function public.create_link(p_kind text, p_target uuid, p_token_sha256 text, p_expires_at timestamptz,
                                   p_role text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('send', 'invite') then
    raise exception 'a link is a send or an invite' using errcode = '22023';
  end if;
  if p_token_sha256 is null or p_token_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'a link needs the token''s SHA-256 in lowercase hex' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'a link cannot expire in the past' using errcode = '22023';
  end if;

  if p_kind = 'send' then
    if p_role is not null then
      raise exception 'a send link takes no role' using errcode = '22023';
    end if;
    perform 1 from public.sends s where s.id = p_target and s.sender = v_uid;
    if not found then
      raise exception 'no such send' using errcode = '42501';
    end if;
    if exists (select 1 from public.sends s where s.id = p_target and s.withdrawn_at is not null) then
      raise exception 'this send was withdrawn' using errcode = '55000';
    end if;
    insert into public.links (kind, token_sha256, send_id, created_by, expires_at)
    values ('send', p_token_sha256, p_target, v_uid, p_expires_at)
    returning id into v_id;
  else
    if p_role is null or p_role not in ('add', 'view') then
      raise exception 'an invite link needs the role add or view' using errcode = '22023';
    end if;
    if p_expires_at is null then
      raise exception 'an invite link must expire' using errcode = '22023';
    end if;
    -- FOR SHARE waits for (and conflicts with) a concurrent stop sharing or delete, so its revoke trigger can't miss
    -- this link: either it commits first and this sees the list unshared, or it waits until this link is in.
    perform 1 from public.hit_lists l where l.id = p_target and l.owner_id = v_uid and l.deleted_at is null for share;
    if not found then
      raise exception 'not the list owner' using errcode = '42501';
    end if;
    if not exists (select 1 from public.hit_lists l where l.id = p_target and l.shared) then
      raise exception 'share the list first' using errcode = '55000';
    end if;
    insert into public.links (kind, token_sha256, list_id, role, created_by, expires_at)
    values ('invite', p_token_sha256, p_target, p_role, v_uid, least(p_expires_at, now() + interval '7 days'))
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- The creator revokes a link (Sent, the member screen). Revoking again keeps the first time; anyone else, or an
-- unknown id, gets the same 'no such link'.
create function public.revoke_link(p_id uuid)
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
  update public.links set revoked_at = coalesce(revoked_at, now()) where id = p_id and created_by = v_uid;
  if not found then
    raise exception 'no such link' using errcode = '42501';
  end if;
end;
$$;

-- The creator's own links, newest first (the Sent screen's Active · Expired · Revoked, a list's invite links); never
-- the hash. p_kind NULL = both kinds.
create function public.list_my_links(p_kind text)
returns table (id uuid, kind text, send_id uuid, list_id uuid, role text, created_at timestamptz,
               expires_at timestamptz, revoked_at timestamptz, used_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.kind, l.send_id, l.list_id, l.role, l.created_at, l.expires_at, l.revoked_at, l.used_at
  from public.links l
  where l.created_by = auth.uid() and (p_kind is null or l.kind = p_kind)
  order by l.created_at desc, l.id;
$$;

-- What a link shows before sign-in, for the share-preview Edge Function only (the service role: granted to nobody
-- else, and the JWT role claim is checked too). A live send link gives the send's frozen payload and its sender; a
-- live invite link gives the list's name and the inviter. Unknown, expired, revoked, used (invite), withdrawn (send)
-- and unshared or deleted (list) all give the same empty result (§3.6: never say which). Security invoker: the
-- service role reads past RLS on its own. send_id is for the photos: S9 signs URLs only for objects under
-- sends/<send_id>/ that pass photo_path_ok, never for a path read from the payload (the sender wrote it, and the
-- service role would sign anyone's photo).
create function public.preview_link(p_sha text)
returns table (kind text, send_id uuid, payload jsonb, list_name text, sender_username extensions.citext,
               sender_display_name text, expires_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'role') is distinct from 'service_role' then
    raise exception 'service role only' using errcode = '42501';
  end if;
  return query
    select l.kind, s.id, s.payload, null::text, p.username, p.display_name, l.expires_at
    from public.links l
    join public.sends s on s.id = l.send_id
    join public.profiles p on p.id = s.sender
    where l.token_sha256 = p_sha and l.kind = 'send'
      and l.revoked_at is null and (l.expires_at is null or l.expires_at > now())
      and s.withdrawn_at is null
    union all
    select l.kind, null::uuid, null::jsonb, h.name, p.username, p.display_name, l.expires_at
    from public.links l
    join public.hit_lists h on h.id = l.list_id
    join public.profiles p on p.id = l.created_by
    where l.token_sha256 = p_sha and l.kind = 'invite'
      and l.revoked_at is null and l.expires_at > now() and l.used_at is null
      and h.shared and h.deleted_at is null;
end;
$$;

-- A signed-in user joins a shared list with an invite link's token (pasted or scanned, §3.6); returns the list id.
-- The token is hashed here as the client hashed it (SHA-256, lowercase hex). The link row is locked, so two redeems
-- of one token run one after the other and the second finds it used. Unknown, expired, revoked, used, a list no longer
-- shared or deleted, and a block either way between the caller and the owner (D50) all raise the same
-- 'invalid invite'. The owner or a member (the redeemer retrying, say) gets the list id and nothing changes.
-- An invitee's 'invited' row becomes 'member' (the Join trigger clears old spot rows); anyone else gets a new
-- 'member' row with the link's role, and any spot row left from an earlier membership goes (D43). A definer function,
-- so guard_member_update and the invite policy don't apply; the block guard trigger does, and its error is mapped as a
-- second layer (the block check above, under the same pair lock, normally answers first).
-- Against stop sharing / delete: the list is read without a lock, but the link row lock makes
-- t30_revoke_invite_links (on the same link) wait for this redeem, and t30_unshare fires after it (name order), so
-- its member delete sees the new row. Keep that trigger name sorting before t30_unshare. (Locking the list here
-- after the link would deadlock with stop sharing, which goes list then link.)
create function public.redeem_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_link public.links;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_link from public.links l
  where l.token_sha256 = encode(extensions.digest(p_token, 'sha256'), 'hex') and l.kind = 'invite'
  for update;
  select h.owner_id into v_owner from public.hit_lists h
  where h.id = v_link.list_id and h.shared and h.deleted_at is null;
  if v_link.id is null or v_owner is null or v_link.revoked_at is not null or v_link.expires_at <= now() then
    raise exception 'invalid invite' using errcode = '42501';
  end if;
  if v_uid = v_owner
     or exists (select 1 from public.hit_list_members m
                where m.list_id = v_link.list_id and m.user_id = v_uid and m.status = 'member') then
    return v_link.list_id;
  end if;
  if v_link.used_at is not null then
    raise exception 'invalid invite' using errcode = '42501';
  end if;

  perform public.lock_user_pair(v_owner, v_uid);
  -- Two links of one list redeemed at once by the same user: the second waits here and finds the first's row.
  if exists (select 1 from public.hit_list_members m
             where m.list_id = v_link.list_id and m.user_id = v_uid and m.status = 'member') then
    return v_link.list_id;
  end if;
  if exists (select 1 from public.blocks b
             where (b.blocker = v_owner and b.blocked = v_uid) or (b.blocker = v_uid and b.blocked = v_owner)) then
    raise exception 'invalid invite' using errcode = '42501';
  end if;
  begin
    update public.hit_list_members m set status = 'member', role = v_link.role, joined_at = now()
    where m.list_id = v_link.list_id and m.user_id = v_uid and m.status = 'invited';
    if not found then
      delete from public.hit_list_spots s where s.list_id = v_link.list_id and s.added_by = v_uid;
      insert into public.hit_list_members (list_id, user_id, role, status, invited_by, joined_at)
      values (v_link.list_id, v_uid, v_link.role, 'member', v_link.created_by, now());
    end if;
  exception when insufficient_privilege then
    raise exception 'invalid invite' using errcode = '42501';
  end;
  update public.links set used_by = v_uid, used_at = now() where id = v_link.id;
  return v_link.list_id;
end;
$$;

-- The revoke trigger, the cascades from sends and hit_lists, and list_my_links look links up by these.
create index links_list_idx on public.links (list_id);
create index links_send_idx on public.links (send_id);
create index links_created_by_idx on public.links (created_by);

-- An invite link dies with its list's sharing: stopping sharing or deleting the list revokes every live invite link,
-- so sharing again later doesn't bring old links back.
create function public.revoke_list_invite_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.links set revoked_at = now()
  where list_id = new.id and kind = 'invite' and revoked_at is null;
  return null;
end;
$$;

create trigger t30_revoke_invite_links after update of shared, deleted_at on public.hit_lists
  for each row when ((old.shared and not new.shared) or (old.deleted_at is null and new.deleted_at is not null))
  execute function public.revoke_list_invite_links();

grant execute on function public.create_link(text, uuid, text, timestamptz, text), public.revoke_link(uuid),
  public.list_my_links(text), public.redeem_invite(text)
  to authenticated;
revoke execute on function public.preview_link(text) from public, anon, authenticated;
grant execute on function public.preview_link(text) to service_role;
