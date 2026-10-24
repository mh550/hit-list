-- S3-02: the §3.2 server data model (docs/plans/2026-10-22-s3-backend.md, "Schema").
-- RLS is enabled on every table and no policy exists yet, so anon and authenticated read and write nothing; the
-- policies arrive with their pgTAP tests in the later S3 migrations. Append new migrations; never edit this one.

create extension if not exists postgis with schema extensions;
create extension if not exists citext with schema extensions;

-- One counter for every synced table: a pull cursor is one number (spec §3.4).
create sequence public.sync_rev;

-- Tables --------------------------------------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext unique,
  display_name text,
  created_at timestamptz not null default now(),
  rev bigint,
  -- D39: 3–20 letters (any case on input), digits, '_' or '.'; citext makes the unique index case-insensitive.
  constraint profiles_username_format check (username::text ~ '^[A-Za-z0-9_.]{3,20}$')
);

create table public.spots (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text,
  generated_name text,
  lat double precision not null,
  lng double precision not null,
  geog extensions.geography(Point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored,
  feature_types text[] not null default '{}',
  stopped boolean not null default false,
  natural_speed smallint check (natural_speed between 0 and 4),
  notes text,
  primary_photo_id uuid,
  copied_from_send uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  rev bigint
);
create index spots_owner_idx on public.spots (owner_id);
create index spots_geog_idx on public.spots using gist (geog);

create table public.media (
  id uuid primary key,
  spot_id uuid not null references public.spots (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text,
  captured_at timestamptz,
  lat double precision,
  lng double precision,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  rev bigint
);
create index media_spot_idx on public.media (spot_id);
create index media_owner_idx on public.media (owner_id);

create table public.hit_lists (
  id uuid primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('manual', 'area')),
  area_center_lat double precision,
  area_center_lng double precision,
  area_center extensions.geography(Point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(area_center_lng, area_center_lat), 4326)::extensions.geography)
    stored,
  area_radius_m integer check (area_radius_m > 0),
  area_filters jsonb,
  area_place text,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  rev bigint,
  constraint hit_lists_area_shape check (
    (kind = 'area' and area_center_lat is not null and area_center_lng is not null and area_radius_m is not null)
    or (kind = 'manual' and area_center_lat is null and area_center_lng is null and area_radius_m is null
        and area_filters is null and area_place is null)
  )
);
create index hit_lists_owner_idx on public.hit_lists (owner_id);

-- Manual lists only; area lists compute their spots (S2).
create table public.hit_list_spots (
  list_id uuid not null references public.hit_lists (id) on delete cascade,
  spot_id uuid not null references public.spots (id) on delete cascade,
  added_by uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  rev bigint,
  primary key (list_id, spot_id)
);
create index hit_list_spots_spot_idx on public.hit_list_spots (spot_id);

-- The owner is implicit (hit_lists.owner_id). status is D57 *default*: 'invited' until Join; only 'member' reads.
create table public.hit_list_members (
  list_id uuid not null references public.hit_lists (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'add' check (role in ('add', 'view')),
  status text not null default 'invited' check (status in ('invited', 'member')),
  invited_by uuid references public.profiles (id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  rev bigint,
  primary key (list_id, user_id)
);
create index hit_list_members_user_idx on public.hit_list_members (user_id, list_id);

-- One row per pair, ordered.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted')),
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_pair_unique unique (user_a, user_b),
  constraint friendships_requester check (requested_by in (user_a, user_b))
);
create index friendships_user_b_idx on public.friendships (user_b);

create table public.blocks (
  blocker uuid not null references public.profiles (id) on delete cascade,
  blocked uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  constraint blocks_not_self check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

-- A frozen copy of spots (D40). recipient NULL = a link-only send (S9).
create table public.sends (
  id uuid primary key,
  sender uuid not null references public.profiles (id) on delete cascade,
  recipient uuid references public.profiles (id) on delete cascade,
  link_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  saved_at timestamptz,
  dismissed_at timestamptz
);
create index sends_sender_idx on public.sends (sender);
create index sends_recipient_idx on public.sends (recipient);

-- Only a token's SHA-256 is stored (D45); no direct access ever (no policies, S3-07).
create table public.links (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('send', 'invite')),
  token_sha256 text not null unique check (token_sha256 ~ '^[0-9a-f]{64}$'),
  send_id uuid references public.sends (id) on delete cascade,
  list_id uuid references public.hit_lists (id) on delete cascade,
  role text check (role in ('add', 'view')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  constraint links_target check (
    (kind = 'send' and send_id is not null and list_id is null and role is null)
    or (kind = 'invite' and list_id is not null and send_id is null and role is not null and expires_at is not null)
  )
);

-- RLS on everywhere, no policies: deny all to anon and authenticated (the service role bypasses RLS).
alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.media enable row level security;
alter table public.hit_lists enable row level security;
alter table public.hit_list_spots enable row level security;
alter table public.hit_list_members enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.sends enable row level security;
alter table public.links enable row level security;

-- Triggers ------------------------------------------------------------------------------------------------------------
-- Same-event triggers fire in name order: t10 (stale guard) skips the row before t20 (rev) can bump it.

-- rev: every write to a synced table takes the next number. security definer so no client role needs a grant on the
-- sequence (a grant would also let it setval the cursor backwards).
create function public.bump_rev()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.rev := nextval('public.sync_rev');
  return new;
end;
$$;

create trigger t20_rev before insert or update on public.profiles
  for each row execute function public.bump_rev();
create trigger t20_rev before insert or update on public.spots
  for each row execute function public.bump_rev();
create trigger t20_rev before insert or update on public.media
  for each row execute function public.bump_rev();
create trigger t20_rev before insert or update on public.hit_lists
  for each row execute function public.bump_rev();
create trigger t20_rev before insert or update on public.hit_list_spots
  for each row execute function public.bump_rev();
create trigger t20_rev before insert or update on public.hit_list_members
  for each row execute function public.bump_rev();

-- D48: an update older than the stored row is skipped (equal is applied), so a late push never overwrites newer data.
create function public.skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger t10_stale_guard before update on public.spots
  for each row execute function public.skip_stale_update();
create trigger t10_stale_guard before update on public.media
  for each row execute function public.skip_stale_update();
create trigger t10_stale_guard before update on public.hit_lists
  for each row execute function public.skip_stale_update();

-- A profile for every new auth user; username stays NULL until onboarding (S4). security definer: the auth admin
-- role inserts users.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privileges ----------------------------------------------------------------------------------------------------------

revoke all on sequence public.sync_rev from public, anon, authenticated, service_role;

-- RLS does not cover TRUNCATE; the default covers tables later migrations add.
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon, authenticated;

-- No client role executes a function in public unless its migration grants it (to authenticated, or service_role
-- alone for preview_link). PUBLIC's EXECUTE is a global default (an in-schema revoke can't remove it), so it is
-- revoked for every function postgres creates; extension functions belong to supabase_admin and keep theirs.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
