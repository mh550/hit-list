-- S8-02: shared lists from the client (docs/plans/2026-10-22-s8-shared-lists.md, "Server"; D83 an invitee sees the
-- list's name, owner and spot count but no spots until Join). list_invitations() is the caller's open invitations of
-- live, shared lists with the count a member would read; share_list(p_list) turns sharing on for the owner only.
begin;
select plan(26);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.ana', tests.create_user('ana@test.local', 'ana')::text, true);
select set_config('t.ben', tests.create_user('ben@test.local', 'ben')::text, true);
select set_config('t.cal', tests.create_user('cal@test.local', 'cal')::text, true);
select set_config('t.dan', tests.create_user('dan@test.local', 'dan')::text, true);
select set_config('t.eve', tests.create_user('eve@test.local', 'eve')::text, true);
select set_config('t.fay', tests.create_user('fay@test.local', 'fay')::text, true);
select set_config('t.hal', tests.create_user('hal@test.local', 'hal')::text, true);
update public.profiles set display_name = 'Ana A' where id = current_setting('t.ana')::uuid;

-- ana's friends: ben, cal, dan, fay, hal. eve is nobody's friend.
insert into public.friendships (user_a, user_b, status, requested_by)
select least(o, f), greatest(o, f), 'accepted', o
from (select current_setting('t.ana')::uuid as o, current_setting('t.' || who)::uuid as f
      from unnest(array['ben', 'cal', 'dan', 'fay', 'hal']) as who) p;

-- Lists, all ana's (as postgres): f1 'Downtown' shared manual · f2 'Area' shared area (1 km round 40,-105, rails) ·
-- f3 'Gone' shared manual, soft-deleted · f4 'Crew' shared manual (stop sharing) · f5 'Private' manual, not shared.
insert into public.hit_lists (id, owner_id, name, kind, shared, area_center_lat, area_center_lng, area_radius_m,
                              area_filters, updated_at, deleted_at)
select id::uuid, current_setting('t.ana')::uuid, name, kind, shared, clat, clng, r, filters, '2026-10-22T12:00:00Z',
       deleted
from (values
  ('00000000-0000-0000-0000-0000000011f1', 'Downtown', 'manual', true, null::float8, null::float8, null::int,
   null::jsonb, null::timestamptz),
  ('00000000-0000-0000-0000-0000000011f2', 'Area', 'area', true, 40.0, -105.0, 1000, '{"types": ["rail"]}', null),
  ('00000000-0000-0000-0000-0000000011f3', 'Gone', 'manual', true, null, null, null, null, now()),
  ('00000000-0000-0000-0000-0000000011f4', 'Crew', 'manual', true, null, null, null, null, null),
  ('00000000-0000-0000-0000-0000000011f5', 'Private', 'manual', false, null, null, null, null, null)
) as v(id, name, kind, shared, clat, clng, r, filters, deleted);

-- Spots: a1–a3 ana's in f1 · a4 ana's in f1, deleted · c1 cal's in f1 (cal is a member) · e1 eve's, a stray row in
-- f1 (eve is not in the list) · r1 ana's rail inside f2's circle · r2 ana's ledge inside it · r3 ana's rail outside it ·
-- r4 ana's rail with no location · x1 cal's rail inside the circle (not the owner's).
insert into public.spots (id, owner_id, lat, lng, feature_types, updated_at, deleted_at)
select id::uuid, current_setting('t.' || who)::uuid, lat, lng, types, '2026-10-22T12:00:00Z', deleted
from (values
  ('00000000-0000-0000-0000-0000000011a1', 'ana', 40.0, -105.0, '{}'::text[], null::timestamptz),
  ('00000000-0000-0000-0000-0000000011a2', 'ana', 40.0, -105.0, '{}', null),
  ('00000000-0000-0000-0000-0000000011a3', 'ana', 40.0, -105.0, '{}', null),
  ('00000000-0000-0000-0000-0000000011a4', 'ana', 40.0, -105.0, '{}', now()),
  ('00000000-0000-0000-0000-0000000011c1', 'cal', 40.0, -105.0, '{}', null),
  ('00000000-0000-0000-0000-0000000011e1', 'eve', 40.0, -105.0, '{}', null),
  ('00000000-0000-0000-0000-0000000011b1', 'ana', 40.0, -105.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000011b2', 'ana', 40.001, -105.0, '{ledge}', null),
  ('00000000-0000-0000-0000-0000000011b3', 'ana', 41.0, -105.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000011b4', 'ana', 0.0, 0.0, '{rail}', null),
  ('00000000-0000-0000-0000-0000000011b5', 'cal', 40.0, -105.0, '{rail}', null)
) as v(id, who, lat, lng, types, deleted);

insert into public.hit_list_members (list_id, user_id, role, status, invited_by, invited_at)
select l::uuid, current_setting('t.' || who)::uuid, role, status, current_setting('t.ana')::uuid, at::timestamptz
from (values
  ('00000000-0000-0000-0000-0000000011f1', 'cal', 'add', 'member', '2026-10-20T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f1', 'ben', 'add', 'invited', '2026-10-21T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f2', 'ben', 'view', 'invited', '2026-10-22T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f3', 'ben', 'add', 'invited', '2026-10-22T11:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f1', 'dan', 'view', 'invited', '2026-10-21T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f1', 'fay', 'add', 'invited', '2026-10-21T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f4', 'hal', 'add', 'invited', '2026-10-21T10:00:00Z'),
  ('00000000-0000-0000-0000-0000000011f4', 'cal', 'add', 'member', '2026-10-20T10:00:00Z')
) as v(l, who, role, status, at);

insert into public.hit_list_spots (list_id, spot_id, added_by)
select '00000000-0000-0000-0000-0000000011f1'::uuid, s::uuid, current_setting('t.' || who)::uuid
from (values
  ('00000000-0000-0000-0000-0000000011a1', 'ana'),
  ('00000000-0000-0000-0000-0000000011a2', 'ana'),
  ('00000000-0000-0000-0000-0000000011a3', 'ana'),
  ('00000000-0000-0000-0000-0000000011a4', 'ana'),
  ('00000000-0000-0000-0000-0000000011c1', 'cal'),
  ('00000000-0000-0000-0000-0000000011e1', 'eve')
) as v(s, who);

-- list_invitations -------------------------------------------------------------------------------------------------
select has_function('public', 'list_invitations', array[]::text[], 'list_invitations() exists');
select ok((select prosecdef from pg_proc where proname = 'list_invitations'), 'list_invitations is security definer');

select tests.clear_auth();
select throws_ok($$ select * from public.list_invitations() $$, '42501', null, 'anon cannot call list_invitations');
reset role;

select tests.authenticate_as(current_setting('t.eve')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'a stranger has no invitations');

select tests.authenticate_as(current_setting('t.ben')::uuid);
select results_eq(
  $$ select name, kind, owner_id, owner_username, owner_display_name, role, spot_count
     from public.list_invitations() order by name $$,
  $$ values ('Area'::text, 'area'::text, current_setting('t.ana')::uuid, 'ana'::text, 'Ana A'::text, 'view'::text, 1),
            ('Downtown', 'manual', current_setting('t.ana')::uuid, 'ana', 'Ana A', 'add', 4) $$,
  'an invitee sees each live shared list''s name, kind, owner and the count a member would read (no deleted list)'
);
select results_eq(
  $$ select list_id from public.list_invitations() $$,
  $$ values ('00000000-0000-0000-0000-0000000011f2'::uuid), ('00000000-0000-0000-0000-0000000011f1'::uuid) $$,
  'newest invitation first'
);
select is(
  (select invited_at from public.list_invitations() where name = 'Downtown'),
  '2026-10-21T10:00:00Z'::timestamptz,
  'each row carries invited_at'
);
select is_empty($$ select * from public.spots where id::text like '00000000-0000-0000-0000-0000000011%' $$,
                'an invitee still reads none of the spots (D83)');

select tests.authenticate_as(current_setting('t.cal')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'a joined member has no invitation');

-- answers and withdrawals take the row away ------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.dan')::uuid);
select results_eq($$ select name from public.list_invitations() $$, $$ values ('Downtown'::text) $$,
                  'dan is invited to Downtown');
delete from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000011f1' and user_id = auth.uid();
select is_empty($$ select * from public.list_invitations() $$, 'after Decline the invitation is gone');

select tests.authenticate_as(current_setting('t.ben')::uuid);
update public.hit_list_members set status = 'member'
where list_id = '00000000-0000-0000-0000-0000000011f1' and user_id = auth.uid();
select results_eq($$ select name from public.list_invitations() $$, $$ values ('Area'::text) $$,
                  'after Join the joined list leaves the invitations');

select tests.authenticate_as(current_setting('t.ana')::uuid);
select lives_ok($$ select public.remove_member('00000000-0000-0000-0000-0000000011f2', current_setting('t.ben')::uuid) $$,
                'the owner withdraws an invitation');
select tests.authenticate_as(current_setting('t.ben')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'a withdrawn invitation is gone');

select tests.authenticate_as(current_setting('t.ana')::uuid);
select lives_ok($$ select public.stop_sharing('00000000-0000-0000-0000-0000000011f4') $$, 'ana stops sharing Crew');
select tests.authenticate_as(current_setting('t.hal')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'after Stop sharing the invitation is gone');

reset role;
select tests.authenticate_as(current_setting('t.fay')::uuid);
select results_eq($$ select name from public.list_invitations() $$, $$ values ('Downtown'::text) $$,
                  'fay is invited to Downtown');
reset role;
insert into public.blocks (blocker, blocked) values (current_setting('t.fay')::uuid, current_setting('t.ana')::uuid);
select tests.authenticate_as(current_setting('t.fay')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'a block between invitee and owner hides it');

-- and the other way round: the owner blocks the invitee (S8-02 review #9)
reset role;
insert into public.hit_list_members (list_id, user_id, role, status, invited_by)
values ('00000000-0000-0000-0000-0000000011f1', current_setting('t.dan')::uuid, 'view', 'invited',
        current_setting('t.ana')::uuid);
select tests.authenticate_as(current_setting('t.dan')::uuid);
select results_eq($$ select name from public.list_invitations() $$, $$ values ('Downtown'::text) $$,
                  'dan is invited to Downtown again');
reset role;
insert into public.blocks (blocker, blocked) values (current_setting('t.ana')::uuid, current_setting('t.dan')::uuid);
select tests.authenticate_as(current_setting('t.dan')::uuid);
select is_empty($$ select * from public.list_invitations() $$, 'a block by the owner hides it from the invitee');

-- share_list -------------------------------------------------------------------------------------------------------
reset role;
select set_config('t.rev_before', (select rev::text from public.hit_lists where id = '00000000-0000-0000-0000-0000000011f5'), true);
select tests.authenticate_as(current_setting('t.ana')::uuid);
select results_eq(
  $$ select id, shared, rev > current_setting('t.rev_before')::bigint
     from public.share_list('00000000-0000-0000-0000-0000000011f5') $$,
  $$ values ('00000000-0000-0000-0000-0000000011f5'::uuid, true, true) $$,
  'the owner turns sharing on and gets the row back with a new rev'
);

select tests.authenticate_as(current_setting('t.cal')::uuid);
select throws_ok($$ select public.share_list('00000000-0000-0000-0000-0000000011f1') $$, '42501', null,
                 'a member cannot turn sharing on');
select tests.authenticate_as(current_setting('t.eve')::uuid);
select throws_ok($$ select public.share_list('00000000-0000-0000-0000-0000000011f5') $$, '42501', null,
                 'a stranger cannot turn sharing on');
select tests.authenticate_as(current_setting('t.ana')::uuid);
select throws_ok($$ select public.share_list('00000000-0000-0000-0000-0000000011f3') $$, '42501', null,
                 'a deleted list cannot be shared');

-- after Stop sharing (server now() as updated_at) a phone whose clock is behind still turns it on again
reset role;
update public.hit_lists set updated_at = now() + interval '1 hour' where id = '00000000-0000-0000-0000-0000000011f4';
select tests.authenticate_as(current_setting('t.ana')::uuid);
select results_eq(
  $$ select shared from public.share_list('00000000-0000-0000-0000-0000000011f4') $$,
  $$ values (true) $$,
  'sharing comes back on after Stop sharing, whatever the phone''s clock'
);
reset role;
select is_empty($$ select * from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000011f4' $$,
                'its old members stay gone');

select * from finish();
rollback;
