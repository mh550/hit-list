-- S3-04: who reads and writes a hit list, its spots and its members (D42 roles, D43 a member's spots leave with them,
-- D57 invitations). §3.3 cases; the Case table in docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(79);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.owner', tests.create_user('owner@test.local', 'owner')::text, true);
select set_config('t.adder', tests.create_user('adder@test.local', 'adder')::text, true);
select set_config('t.viewer', tests.create_user('viewer@test.local', 'viewer')::text, true);
select set_config('t.invited', tests.create_user('invited@test.local', 'invited')::text, true);
select set_config('t.leaver', tests.create_user('leaver@test.local', 'leaver')::text, true);
select set_config('t.removee', tests.create_user('removee@test.local', 'removee')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
select set_config('t.friend', tests.create_user('friend@test.local', 'friend')::text, true);
select set_config('t.friend2', tests.create_user('friend2@test.local', 'friend2')::text, true);
select set_config('t.blocker', tests.create_user('blocker@test.local', 'blocker')::text, true);

-- owner's accepted friends: friend, friend2 and blocker (who has also blocked owner; D50 says a block deletes the
-- friendship, the row is kept here to prove the block check on its own). stranger is nobody's friend.
insert into public.friendships (user_a, user_b, status, requested_by)
select least(o, f), greatest(o, f), 'accepted', o
from (select current_setting('t.owner')::uuid as o, current_setting('t.' || who)::uuid as f
      from unnest(array['friend', 'friend2', 'blocker']) as who) p;
insert into public.blocks (blocker, blocked)
values (current_setting('t.blocker')::uuid, current_setting('t.owner')::uuid);

-- Spots (as postgres: RLS bypassed for the setup) ------------------------------------------------------------------
-- o1 owner's, in L1 · o2, o3 owner's, in no list · o5 owner's, in L5 · a1 adder's, in L1 · a2 adder's, in no list ·
-- a3 adder's, in L5 · v1 viewer's · i1 invited's · l1 leaver's, in L1 · r1 removee's, in L1 · s1 stranger's.
insert into public.spots (id, owner_id, lat, lng, updated_at)
select id::uuid, current_setting('t.' || who)::uuid, 40.0, -105.0, '2026-10-22T12:00:00Z'
from (values
  ('00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', 'owner'),
  ('00000000-0000-0000-0000-0000000000a3', 'owner'),
  ('00000000-0000-0000-0000-0000000000a5', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', 'adder'),
  ('00000000-0000-0000-0000-0000000000b2', 'adder'),
  ('00000000-0000-0000-0000-0000000000b3', 'adder'),
  ('00000000-0000-0000-0000-0000000000c1', 'viewer'),
  ('00000000-0000-0000-0000-0000000000c2', 'invited'),
  ('00000000-0000-0000-0000-0000000000c3', 'leaver'),
  ('00000000-0000-0000-0000-0000000000c4', 'removee'),
  ('00000000-0000-0000-0000-0000000000c5', 'stranger')
) as v(id, who);

-- Lists, all owner's: e1 'Shared' shared manual · e2 'Private' manual, not shared · e3 'Area' shared area ·
-- e4 'Gone' shared manual, soft-deleted · e5 'Crew' shared manual (for stop_sharing).
insert into public.hit_lists (id, owner_id, name, kind, shared, area_center_lat, area_center_lng, area_radius_m,
                              updated_at, deleted_at)
select id::uuid, current_setting('t.owner')::uuid, name, kind, shared, clat, clng, r, '2026-10-22T12:00:00Z', deleted
from (values
  ('00000000-0000-0000-0000-0000000000e1', 'Shared', 'manual', true, null::float8, null::float8, null::int,
   null::timestamptz),
  ('00000000-0000-0000-0000-0000000000e2', 'Private', 'manual', false, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000e3', 'Area', 'area', true, 40.0, -105.0, 1000, null),
  ('00000000-0000-0000-0000-0000000000e4', 'Gone', 'manual', true, null, null, null, now()),
  ('00000000-0000-0000-0000-0000000000e5', 'Crew', 'manual', true, null, null, null, null)
) as v(id, name, kind, shared, clat, clng, r, deleted);

insert into public.hit_list_members (list_id, user_id, role, status, invited_by)
select l::uuid, current_setting('t.' || who)::uuid, role, status, current_setting('t.owner')::uuid
from (values
  ('00000000-0000-0000-0000-0000000000e1', 'adder', 'add', 'member'),
  ('00000000-0000-0000-0000-0000000000e1', 'viewer', 'view', 'member'),
  ('00000000-0000-0000-0000-0000000000e1', 'invited', 'add', 'invited'),
  ('00000000-0000-0000-0000-0000000000e1', 'leaver', 'add', 'member'),
  ('00000000-0000-0000-0000-0000000000e1', 'removee', 'add', 'member'),
  ('00000000-0000-0000-0000-0000000000e4', 'adder', 'add', 'member'),
  ('00000000-0000-0000-0000-0000000000e5', 'adder', 'add', 'member'),
  ('00000000-0000-0000-0000-0000000000e5', 'viewer', 'view', 'member')
) as v(l, who, role, status);

insert into public.hit_list_spots (list_id, spot_id, added_by)
select l::uuid, s::uuid, current_setting('t.' || who)::uuid
from (values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'adder'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c3', 'leaver'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c4', 'removee'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000a5', 'owner'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-0000000000b3', 'adder')
) as v(l, s, who);

-- Shape -------------------------------------------------------------------------------------------------------------
select policies_are('public', 'hit_lists', array['hit_lists_select', 'hit_lists_insert', 'hit_lists_update'],
                    'hit_lists has select, insert and update policies (no delete: soft delete is an update)');
select policies_are('public', 'hit_list_spots',
                    array['hit_list_spots_select', 'hit_list_spots_insert', 'hit_list_spots_delete'],
                    'hit_list_spots has select, insert and delete policies (no update)');
select policies_are('public', 'hit_list_members',
                    array['hit_list_members_select', 'hit_list_members_insert', 'hit_list_members_update',
                          'hit_list_members_delete'],
                    'hit_list_members has select, insert, update and delete policies');
select ok((select count(*) > 0 and bool_and(roles = array['authenticated']::name[]) from pg_policies
           where schemaname = 'public' and tablename in ('hit_lists', 'hit_list_spots', 'hit_list_members')),
          'every list policy applies to authenticated only (anon gets none)');
select is(
  array(select p from unnest(array['is_list_owner', 'is_list_member', 'is_list_invitee', 'can_add_to_list',
                                   'can_invite_to_list', 'leave_list', 'remove_member', 'stop_sharing',
                                   'remove_member_spots']) as p
        where not exists (select 1 from pg_proc
                          where proname = p and pronamespace = 'public'::regnamespace
                            and prosecdef and 'search_path=""' = any(proconfig))),
  '{}'::text[],
  'every S3-04 function is security definer with search_path pinned'
);
select is(
  array(select proname::text from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('is_list_owner', 'is_list_member', 'is_list_invitee', 'can_add_to_list',
                          'can_invite_to_list', 'leave_list', 'remove_member', 'stop_sharing', 'remove_member_spots',
                          'guard_member_update', 'keep_list_identity')
          and has_function_privilege('authenticated', oid, 'execute')
          and not has_function_privilege('anon', oid, 'execute')
        order by 1),
  array['can_add_to_list', 'can_invite_to_list', 'is_list_invitee', 'is_list_member', 'is_list_owner', 'leave_list',
        'remove_member', 'stop_sharing'],
  'authenticated executes the list helpers and functions, anon none, nobody the trigger functions'
);

-- Owner: everything on their own list -------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq(
  $$ select id from public.hit_lists order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid), ('00000000-0000-0000-0000-0000000000e2'::uuid),
            ('00000000-0000-0000-0000-0000000000e3'::uuid), ('00000000-0000-0000-0000-0000000000e4'::uuid),
            ('00000000-0000-0000-0000-0000000000e5'::uuid) $$,
  'owner reads own lists, deleted included'
);
select lives_ok(
  $$ insert into public.hit_lists (id, owner_id, name, kind, updated_at)
     values ('00000000-0000-0000-0000-0000000000e9', current_setting('t.owner')::uuid, 'New', 'manual', now()) $$,
  'owner inserts own list'
);
select throws_ok(
  $$ insert into public.hit_lists (id, owner_id, name, kind, updated_at)
     values ('00000000-0000-0000-0000-0000000000e8', current_setting('t.stranger')::uuid, 'Theirs', 'manual', now()) $$,
  '42501', null, 'insert list with another owner_id fails'
);
select results_eq(
  $$ update public.hit_lists set name = 'Renamed' where id = '00000000-0000-0000-0000-0000000000e9' returning name $$,
  $$ values ('Renamed') $$,
  'owner renames own list'
);
select results_eq(
  $$ update public.hit_lists set deleted_at = now() where id = '00000000-0000-0000-0000-0000000000e9' returning id $$,
  $$ values ('00000000-0000-0000-0000-0000000000e9'::uuid) $$,
  'owner soft-deletes own list'
);
select is_empty($$ delete from public.hit_lists where id = '00000000-0000-0000-0000-0000000000e9' returning id $$,
                'owner cannot hard-delete a list (soft delete only)');
select throws_ok(
  $$ update public.hit_lists set owner_id = current_setting('t.stranger')::uuid
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'hit list id, owner_id, kind and created_at are fixed', 'owner cannot hand a list to another owner'
);
select throws_ok(
  $$ update public.hit_lists set kind = 'area', area_center_lat = 40, area_center_lng = -105, area_radius_m = 1000
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'hit list id, owner_id, kind and created_at are fixed', 'owner cannot change a list''s kind'
);
select is((select count(*) from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000000e1'),
          5::bigint, 'owner reads every membership of their list, invited included');
select is((select count(*) from public.hit_list_spots where list_id = '00000000-0000-0000-0000-0000000000e1'),
          4::bigint, 'owner reads every spot row of their list');
select lives_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2',
             current_setting('t.owner')::uuid) $$,
  'owner adds own spot to own list'
);
select lives_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2',
             current_setting('t.owner')::uuid) $$,
  'owner adds own spot to an unshared list'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c5',
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'owner cannot add a spot they do not own'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a3',
             current_setting('t.adder')::uuid) $$,
  '42501', null, 'owner cannot add a row in someone else''s name'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a3',
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'nobody adds a spot row to an area list'
);
select is_empty(
  $$ update public.hit_list_spots set added_by = current_setting('t.adder')::uuid
     where list_id = '00000000-0000-0000-0000-0000000000e1' returning spot_id $$,
  'nobody updates a spot row'
);
select lives_ok(
  $$ insert into public.hit_list_members (list_id, user_id, role, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.friend')::uuid, 'view',
             current_setting('t.owner')::uuid) $$,
  'owner invites an accepted friend'
);
select results_eq(
  $$ select status from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.friend')::uuid $$,
  $$ values ('invited') $$,
  'an invitation starts as invited'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.stranger')::uuid,
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'owner cannot invite someone who is not a friend'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.blocker')::uuid,
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'blocked owner cannot invite the blocker'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, status, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.friend2')::uuid, 'member',
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'owner cannot make someone a member without their Join'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, invited_by)
     values ('00000000-0000-0000-0000-0000000000e2', current_setting('t.friend2')::uuid,
             current_setting('t.owner')::uuid) $$,
  '42501', null, 'owner cannot invite to an unshared list'
);
select results_eq(
  $$ update public.hit_list_members set role = 'add'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.friend')::uuid
     returning role $$,
  $$ values ('add') $$,
  'owner changes a member''s role'
);
select throws_ok(
  $$ update public.hit_list_members set status = 'member'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.friend')::uuid $$,
  '42501', null, 'owner cannot join on an invitee''s behalf'
);
select throws_ok(
  $$ update public.hit_list_members set user_id = current_setting('t.friend2')::uuid
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.friend')::uuid $$,
  '42501', null, 'owner cannot move a membership to another user'
);

-- Stranger: nothing -------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.hit_lists $$, 'stranger reads no list');
select is_empty($$ select spot_id from public.hit_list_spots $$, 'stranger reads no list spot row');
select is_empty($$ select user_id from public.hit_list_members $$, 'stranger reads no membership');
select is_empty(
  $$ update public.hit_lists set name = 'Mine now' where id = '00000000-0000-0000-0000-0000000000e1' returning id $$,
  'stranger cannot rename a list'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.friend2')::uuid,
             current_setting('t.stranger')::uuid) $$,
  '42501', null, 'stranger cannot invite to a list'
);
select throws_ok($$ select public.leave_list('00000000-0000-0000-0000-0000000000e1') $$,
                 'not a member of this list', 'leave_list raises for someone not in the list');

-- anon: nothing -----------------------------------------------------------------------------------------------------
reset role;
select tests.clear_auth();
select is_empty($$ select id from public.hit_lists $$, 'anon reads no list');
select throws_ok($$ select public.leave_list('00000000-0000-0000-0000-0000000000e1') $$,
                 '42501', null, 'anon cannot call leave_list');
reset role;

-- Invited (D57): the list's name and owner, nothing else, until Join -------------------------------------------------
select tests.authenticate_as(current_setting('t.invited')::uuid);
select results_eq(
  $$ select name, owner_id from public.hit_lists $$,
  $$ values ('Shared', current_setting('t.owner')::uuid) $$,
  'invited user reads the list row (name and owner)'
);
select is_empty($$ select spot_id from public.hit_list_spots $$, 'invited user reads no list spot row (no count)');
select results_eq(
  $$ select user_id from public.hit_list_members $$,
  $$ values (current_setting('t.invited')::uuid) $$,
  'invited user reads only their own membership'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2',
             current_setting('t.invited')::uuid) $$,
  '42501', null, 'invited user cannot add a spot'
);
select results_eq(
  $$ update public.hit_list_members set status = 'member'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.invited')::uuid
     returning status, joined_at is not null $$,
  $$ values ('member', true) $$,
  'invitee joins (invited → member, joined_at set)'
);
select throws_ok(
  $$ update public.hit_list_members set status = 'invited'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.invited')::uuid $$,
  '42501', null, 'a member cannot go back to invited'
);

select tests.authenticate_as(current_setting('t.friend')::uuid);
select results_eq(
  $$ delete from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.friend')::uuid
     returning user_id $$,
  $$ values (current_setting('t.friend')::uuid) $$,
  'invitee declines by deleting their own row'
);

-- Member with role 'add' --------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.adder')::uuid);
select results_eq(
  $$ select name from public.hit_lists where id = '00000000-0000-0000-0000-0000000000e1' $$,
  $$ values ('Shared') $$,
  'member reads the list row'
);
select is((select count(*) from public.hit_list_spots where list_id = '00000000-0000-0000-0000-0000000000e1'),
          5::bigint, 'member reads every spot row of the list');
select is((select count(*) from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000000e1'),
          5::bigint, 'member reads the member strip');
select lives_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b2',
             current_setting('t.adder')::uuid) $$,
  'add member adds own spot'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a3',
             current_setting('t.adder')::uuid) $$,
  '42501', null, 'add member cannot add owner spot'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000b2',
             current_setting('t.adder')::uuid) $$,
  '42501', null, 'member cannot add to a deleted list'
);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2',
             current_setting('t.adder')::uuid) $$,
  '42501', null, 'member cannot add to a list they are not in'
);
select results_eq(
  $$ delete from public.hit_list_spots
     where list_id = '00000000-0000-0000-0000-0000000000e1' and spot_id = '00000000-0000-0000-0000-0000000000b1'
     returning spot_id $$,
  $$ values ('00000000-0000-0000-0000-0000000000b1'::uuid) $$,
  'member removes a spot they added'
);
select is_empty(
  $$ delete from public.hit_list_spots
     where list_id = '00000000-0000-0000-0000-0000000000e1' and spot_id = '00000000-0000-0000-0000-0000000000a1'
     returning spot_id $$,
  'member cannot remove a spot someone else added'
);
select is_empty(
  $$ update public.hit_lists set name = 'Ours' where id = '00000000-0000-0000-0000-0000000000e1' returning id $$,
  'member cannot rename the list'
);
select is_empty(
  $$ update public.hit_lists set shared = false where id = '00000000-0000-0000-0000-0000000000e1' returning id $$,
  'member cannot unshare the list'
);
select throws_ok(
  $$ insert into public.hit_list_members (list_id, user_id, invited_by)
     values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.friend2')::uuid,
             current_setting('t.adder')::uuid) $$,
  '42501', null, 'member cannot invite'
);
select is_empty(
  $$ update public.hit_list_members set role = 'add'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.viewer')::uuid
     returning user_id $$,
  'member cannot change another member''s role'
);
select is_empty(
  $$ delete from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.viewer')::uuid
     returning user_id $$,
  'member cannot remove another member'
);
select throws_ok($$ select public.remove_member('00000000-0000-0000-0000-0000000000e1',
                                                current_setting('t.viewer')::uuid) $$,
                 'not the list owner', 'only the owner can remove_member');

-- Member with role 'view' -------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.viewer')::uuid);
select throws_ok(
  $$ insert into public.hit_list_spots (list_id, spot_id, added_by)
     values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
             current_setting('t.viewer')::uuid) $$,
  '42501', null, 'view member cannot add a spot'
);
select throws_ok(
  $$ update public.hit_list_members set role = 'add'
     where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.viewer')::uuid $$,
  '42501', null, 'view member cannot make themselves an adder'
);

-- leave_list (D43) --------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select throws_ok($$ select public.leave_list('00000000-0000-0000-0000-0000000000e1') $$,
                 'the owner cannot leave their own list', 'owner cannot leave their own list');
select tests.authenticate_as(current_setting('t.leaver')::uuid);
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1'), true, 'member reads the list spot before leaving');
select lives_ok($$ select public.leave_list('00000000-0000-0000-0000-0000000000e1') $$, 'member leaves the list');
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1'), false, 'left member can_read_spot false');
reset role;
select ok(
  not exists (select 1 from public.hit_list_members
              where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.leaver')::uuid)
  and not exists (select 1 from public.hit_list_spots
                  where list_id = '00000000-0000-0000-0000-0000000000e1'
                    and added_by = current_setting('t.leaver')::uuid)
  and exists (select 1 from public.hit_list_spots
              where list_id = '00000000-0000-0000-0000-0000000000e1'
                and spot_id = '00000000-0000-0000-0000-0000000000a1')
  and exists (select 1 from public.spots where id = '00000000-0000-0000-0000-0000000000c3'),
  'leave_list removes member and their spots (the owner''s stay, the spot itself stays)'
);

-- remove_member (D43) -----------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select lives_ok($$ select public.remove_member('00000000-0000-0000-0000-0000000000e1',
                                               current_setting('t.removee')::uuid) $$,
                'owner removes a member');
select throws_ok($$ select public.remove_member('00000000-0000-0000-0000-0000000000e1',
                                                current_setting('t.stranger')::uuid) $$,
                 'not a member of this list', 'remove_member raises for someone not in the list');
select tests.authenticate_as(current_setting('t.removee')::uuid);
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a1'), false, 'remove_member drops read');
select is_empty($$ select id from public.hit_lists $$, 'removed member reads the list no more');
reset role;
select ok(
  not exists (select 1 from public.hit_list_spots
              where list_id = '00000000-0000-0000-0000-0000000000e1'
                and added_by = current_setting('t.removee')::uuid),
  'remove_member takes the member''s spots out of the list'
);

-- A direct DELETE by the owner does the same (one trigger for Leave, Remove, Decline, Stop sharing) ----------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
delete from public.hit_list_members
where list_id = '00000000-0000-0000-0000-0000000000e1' and user_id = current_setting('t.adder')::uuid;
reset role;
select ok(
  not exists (select 1 from public.hit_list_spots
              where list_id = '00000000-0000-0000-0000-0000000000e1'
                and added_by = current_setting('t.adder')::uuid),
  'a direct delete of a membership takes the member''s spots out too'
);

-- stop_sharing on e5 (members adder 'add' with b3, viewer 'view'; owner's a5) --------------------------------------
select tests.authenticate_as(current_setting('t.adder')::uuid);
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a5'), true,
          'member reads the list spot before stop_sharing');
select throws_ok($$ select public.stop_sharing('00000000-0000-0000-0000-0000000000e5') $$,
                 'not the list owner', 'only the owner can stop sharing');
select tests.authenticate_as(current_setting('t.owner')::uuid);
select lives_ok($$ select public.stop_sharing('00000000-0000-0000-0000-0000000000e5') $$, 'owner stops sharing');
select tests.authenticate_as(current_setting('t.adder')::uuid);
select is(public.can_read_spot('00000000-0000-0000-0000-0000000000a5'), false, 'stop_sharing drops every member read');
reset role;
select results_eq(
  $$ select l.shared,
            (select count(*) from public.hit_list_members m where m.list_id = l.id),
            array(select s.spot_id from public.hit_list_spots s where s.list_id = l.id)
     from public.hit_lists l where l.id = '00000000-0000-0000-0000-0000000000e5' $$,
  $$ values (false, 0::bigint, array['00000000-0000-0000-0000-0000000000a5'::uuid]) $$,
  'stop_sharing unshares, drops every member and their spots, keeps the owner''s'
);

select * from finish();
rollback;
