-- S3-03: who reads a spot and its photos (can_read_spot), and who writes one (the owner only). §3.3 cases; the Case
-- table in docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(47);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.owner', tests.create_user('owner@test.local', 'owner')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
select set_config('t.friend', tests.create_user('friend@test.local', 'friend')::text, true);
select set_config('t.member', tests.create_user('member@test.local', 'member')::text, true);
select set_config('t.member2', tests.create_user('member2@test.local', 'member2')::text, true);
select set_config('t.invited', tests.create_user('invited@test.local', 'invited')::text, true);
select set_config('t.other', tests.create_user('other@test.local', 'other')::text, true);

-- An accepted friendship between owner and friend, nothing shared with friend.
insert into public.friendships (user_a, user_b, status, requested_by)
select least(o, f), greatest(o, f), 'accepted', o
from (select current_setting('t.owner')::uuid as o, current_setting('t.friend')::uuid as f) p;

-- Spots (as postgres: RLS bypassed for the setup) ------------------------------------------------------------------
-- a1 in list A · a2 in list B · a3 inside the area circle (rail) · a4 outside it (rail) · a5 inside it but a ledge
-- (the filters want rail) · a6 soft-deleted, in A · a7 in an unshared list · a8 in a deleted list · a9 unlocated (0, 0)
-- · b1 the other owner's rail inside the circle · c1 member's own spot, added to A.
insert into public.spots (id, owner_id, name, lat, lng, feature_types, updated_at, deleted_at)
select id::uuid, current_setting('t.' || who)::uuid, name, lat, lng, types::text[], '2026-10-22T12:00:00Z', deleted
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'owner', 'In A', 40.0, -105.0, '{rail}', null::timestamptz),
  ('00000000-0000-0000-0000-0000000000a2', 'owner', 'In B', 40.1, -105.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000a3', 'owner', 'Inside', 47.601, -122.3, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000a4', 'owner', 'Outside', 47.62, -122.3, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000a5', 'owner', 'Filtered', 47.6005, -122.3, '{ledge}', null),
  ('00000000-0000-0000-0000-0000000000a6', 'owner', 'Deleted', 40.2, -105.0, '{rail}', '2026-10-22T13:00:00Z'),
  ('00000000-0000-0000-0000-0000000000a7', 'owner', 'Unshared', 40.3, -105.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000a8', 'owner', 'Gone list', 40.4, -105.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000a9', 'owner', 'Nowhere', 0, 0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000b1', 'other', 'Not owner', 47.6, -122.3001, '{rail}', null),
  ('00000000-0000-0000-0000-0000000000c1', 'member', 'Mine', 40.5, -105.0, '{ledge}', null)
) as v(id, who, name, lat, lng, types, deleted);

insert into public.media (id, spot_id, owner_id, storage_path, updated_at, deleted_at)
select id::uuid, spot::uuid, current_setting('t.owner')::uuid, 'p', now(), deleted
from (values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', null::timestamptz),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a2', null),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000a1', now())
) as v(id, spot, deleted);

-- Lists: A, B shared manual · C shared area (1 km round 47.6, -122.3, rail only) · D manual not shared ·
-- E shared manual, soft-deleted · F shared area round (0.001, 0.001).
insert into public.hit_lists (id, owner_id, name, kind, shared, area_center_lat, area_center_lng, area_radius_m,
                              area_filters, updated_at, deleted_at)
select id::uuid, current_setting('t.owner')::uuid, name, kind, shared, clat, clng, r, f::jsonb, now(), deleted
from (values
  ('00000000-0000-0000-0000-0000000000e1', 'A', 'manual', true, null::float8, null::float8, null::int, null::text,
   null::timestamptz),
  ('00000000-0000-0000-0000-0000000000e2', 'B', 'manual', true, null, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000e3', 'C', 'area', true, 47.6, -122.3, 1000, '{"types":["rail"]}', null),
  ('00000000-0000-0000-0000-0000000000e4', 'D', 'manual', false, null, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000e5', 'E', 'manual', true, null, null, null, null, now()),
  ('00000000-0000-0000-0000-0000000000e6', 'F', 'area', true, 0.001, 0.001, 1000, null, null)
) as v(id, name, kind, shared, clat, clng, r, f, deleted);

insert into public.hit_list_spots (list_id, spot_id, added_by)
select l::uuid, s::uuid, current_setting('t.' || who)::uuid
from (values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a6', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'member'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'owner'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a7', 'owner'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a8', 'owner')
) as v(l, s, who);

-- member: A, C, D, E, F · member2: A only · invited: A, not yet joined (D57).
insert into public.hit_list_members (list_id, user_id, status)
select l::uuid, current_setting('t.' || who)::uuid, status
from (values
  ('00000000-0000-0000-0000-0000000000e1', 'member', 'member'),
  ('00000000-0000-0000-0000-0000000000e3', 'member', 'member'),
  ('00000000-0000-0000-0000-0000000000e4', 'member', 'member'),
  ('00000000-0000-0000-0000-0000000000e5', 'member', 'member'),
  ('00000000-0000-0000-0000-0000000000e6', 'member', 'member'),
  ('00000000-0000-0000-0000-0000000000e1', 'member2', 'member'),
  ('00000000-0000-0000-0000-0000000000e1', 'invited', 'invited')
) as v(l, who, status);

-- Shape -------------------------------------------------------------------------------------------------------------
select policies_are('public', 'spots', array['spots_select', 'spots_insert', 'spots_update'],
                    'spots has select, insert and update policies (no delete: soft delete is an update)');
select policies_are('public', 'media', array['media_select', 'media_insert', 'media_update'],
                    'media has select, insert and update policies (no delete)');
select ok((select bool_and(roles = array['authenticated']::name[]) from pg_policies
           where schemaname = 'public' and tablename in ('spots', 'media')),
          'every spots and media policy applies to authenticated only (anon gets none)');
select is((select provolatile::text || prosecdef::text from pg_proc where oid = 'public.can_read_spot(uuid, uuid)'::regprocedure),
          'strue', 'can_read_spot is stable and security definer');
select ok((select 'search_path=""' = any(proconfig) from pg_proc
           where oid = 'public.can_read_spot(uuid, uuid)'::regprocedure),
          'can_read_spot pins search_path');
select ok(not has_function_privilege('anon', 'public.can_read_spot(uuid, uuid)', 'execute'),
          'anon cannot execute can_read_spot');

-- Owner -------------------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq(
  $$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'owner reads own spot'
);
select results_eq(
  $$ select id from public.media order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1'::uuid), ('00000000-0000-0000-0000-0000000000f2'::uuid),
            ('00000000-0000-0000-0000-0000000000f3'::uuid) $$,
  'owner reads own media, deleted included'
);
select results_eq(
  $$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a6' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a6'::uuid) $$,
  'owner reads own soft-deleted spot'
);
select results_eq(
  $$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000c1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'list owner reads a member spot in the list'
);

-- Stranger and friend: nothing --------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.spots $$, 'stranger reads no spot');
select is_empty($$ select id from public.media $$, 'stranger reads no media');
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1', current_setting('t.member')::uuid), false,
          'stranger cannot probe another user''s access');

select tests.authenticate_as(current_setting('t.friend')::uuid);
select is_empty($$ select id from public.spots $$, 'friend with nothing shared reads no spot');
select is_empty($$ select id from public.media $$, 'friend with nothing shared reads no media');

-- Invited, not joined: nothing (D57) --------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.invited')::uuid);
select is_empty($$ select id from public.spots $$, 'invited user reads no spot');
select is_empty($$ select id from public.media $$, 'invited user reads no media');

-- Member of shared manual list A ------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.member')::uuid);
select results_eq(
  $$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'member of A reads spot in A'
);
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1'), true, 'member can_read_spot true for A spot');
select results_eq(
  $$ select id from public.media where spot_id = '00000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('00000000-0000-0000-0000-0000000000f1'::uuid) $$,
  'member of A reads media of a spot in A, not deleted media'
);
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a2' $$,
                'member of A reads no spot of B');
select is_empty($$ select id from public.media where id = '00000000-0000-0000-0000-0000000000f2' $$,
                'member of A reads no media of B');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a6' $$,
                'member reads no soft-deleted spot');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a7' $$,
                'member reads nothing through an unshared list');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a8' $$,
                'member reads nothing through a deleted list');

-- Member of shared area list C (1 km round 47.6, -122.3, rail only) and F (round 0.001, 0.001) ------------------------
select results_eq(
  $$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a3' $$,
  $$ values ('00000000-0000-0000-0000-0000000000a3'::uuid) $$,
  'area member reads owner spot inside circle'
);
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a4' $$,
                'area member reads no owner spot outside circle');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000b1' $$,
                'area member reads no other owner spot inside circle');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a5' $$,
                'area member reads no spot the filters exclude');
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000000a9' $$,
                'area member reads no unlocated spot (D53)');
select results_eq(
  $$ select id from public.spots order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000a3'::uuid),
            ('00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'member reads exactly A''s live spots, the area spot and their own'
);

-- Writes are the owner's ----------------------------------------------------------------------------------------------
select is_empty($$ update public.spots set name = 'Hacked' where id = '00000000-0000-0000-0000-0000000000a1'
                   returning id $$,
                'member cannot update spot');
select is_empty($$ delete from public.spots where id = '00000000-0000-0000-0000-0000000000a1' returning id $$,
                'member cannot delete spot');
select throws_ok(
  $$ insert into public.media (id, spot_id, owner_id, updated_at)
     values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000a1',
             current_setting('t.member')::uuid, now()) $$,
  '42501', null, 'member cannot add media to a spot they do not own'
);
select is_empty($$ update public.media set storage_path = 'x' where id = '00000000-0000-0000-0000-0000000000f1'
                   returning id $$,
                'member cannot update media');

select tests.authenticate_as(current_setting('t.owner')::uuid);
select lives_ok(
  $$ insert into public.spots (id, owner_id, lat, lng, updated_at)
     values ('00000000-0000-0000-0000-0000000000d1', current_setting('t.owner')::uuid, 1, 1, now()) $$,
  'owner inserts own spot'
);
select throws_ok(
  $$ insert into public.spots (id, owner_id, lat, lng, updated_at)
     values ('00000000-0000-0000-0000-0000000000d2', current_setting('t.stranger')::uuid, 1, 1, now()) $$,
  '42501', null, 'insert with another owner_id fails'
);
select results_eq(
  $$ update public.spots set name = 'Renamed', updated_at = now() where id = '00000000-0000-0000-0000-0000000000a1'
     returning name $$,
  $$ values ('Renamed') $$,
  'owner updates own spot'
);
select throws_ok(
  $$ update public.spots set owner_id = current_setting('t.stranger')::uuid
     where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'owner cannot hand a spot to another owner'
);
select is_empty($$ delete from public.spots where id = '00000000-0000-0000-0000-0000000000d1' returning id $$,
                'owner cannot hard-delete a spot (soft delete only)');
select lives_ok(
  $$ insert into public.media (id, spot_id, owner_id, updated_at)
     values ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000d1',
             current_setting('t.owner')::uuid, now()) $$,
  'owner inserts media on own spot'
);
select throws_ok(
  $$ insert into public.media (id, spot_id, owner_id, updated_at)
     values ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000c1',
             current_setting('t.owner')::uuid, now()) $$,
  '42501', null, 'owner cannot add own media to someone else''s spot'
);

reset role;
select is((select name from public.spots where id = '00000000-0000-0000-0000-0000000000a1'), 'Renamed',
          'the member''s update and delete changed nothing');

-- Removed member loses read on the next query -----------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.member2')::uuid);
select results_eq(
  $$ select id from public.spots order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000c1'::uuid) $$,
  'co-member reads the list''s spots, another member''s included'
);
reset role;
delete from public.hit_list_members
where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.member2')::uuid;
select tests.authenticate_as(current_setting('t.member2')::uuid);
select is_empty($$ select id from public.spots $$, 'removed member reads nothing next select');
select is_empty($$ select id from public.media $$, 'removed member reads no media next select');
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1'), false, 'removed member can_read_spot false');

select * from finish();
rollback;
