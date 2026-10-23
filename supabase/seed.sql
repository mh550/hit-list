-- pgTAP helpers (docs/plans/2026-10-22-s3-backend.md, "pgTAP harness").
-- seed.sql runs only on `supabase start` (fresh volume) and `supabase db reset`; `supabase db push` never sends it,
-- so this schema cannot reach a cloud database.

create schema if not exists tests;
grant usage on schema tests to anon, authenticated, service_role;

-- A user as GoTrue would insert one; the profile trigger creates the profiles row. Sets the username when given.
create or replace function tests.create_user(email text, username text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', email, now(), now());
  if username is not null then
    update public.profiles set username = create_user.username where id = uid;
  end if;
  return uid;
end;
$$;

-- Act as a signed-in user for the rest of the transaction: auth.uid() returns uid, RLS applies.
create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end;
$$;

-- Act as the service role (RLS bypassed; preview_link's caller).
create or replace function tests.authenticate_as_service_role()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end;
$$;

-- Act as anon: no user, no claims.
create or replace function tests.clear_auth()
returns void
language plpgsql
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
