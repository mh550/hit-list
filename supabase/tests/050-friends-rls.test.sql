-- S3-05: profiles, friendships and blocks (D39 exact usernames, D50 blocking). §3.3 cases; the Case table in
-- docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(76);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.me', tests.create_user('me@test.local', 'rider_me')::text, true);
select set_config('t.ana', tests.create_user('ana@test.local', 'ana')::text, true);
select set_config('t.friend', tests.create_user('friend@test.local', 'friend')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
select set_config('t.owner', tests.create_user('owner@test.local', 'owner')::text, true);
select set_config('t.co', tests.create_user('co@test.local', 'comember')::text, true);
select set_config('t.inv', tests.create_user('inv@test.local', 'invitee')::text, true);
select set_config('t.goner', tests.create_user('goner@test.local', 'goner')::text, true);
select set_config('t.blocker', tests.create_user('blocker@test.local', 'blocker')::text, true);
select set_config('t.blockee', tests.create_user('blockee@test.local', 'blockee')::text, true);
select set_config('t.noname', tests.create_user('noname@test.local')::text, true);
select set_config('t.asker', tests.create_user('asker@test.local', 'asker')::text, true);
select set_config('t.asker2', tests.create_user('asker2@test.local', 'asker_two')::text, true);
select set_config('t.victim', tests.create_user('victim@test.local', 'victim')::text, true);
select set_config('t.pest', tests.create_user('pest@test.local', 'pest')::text, true);
update public.profiles set display_name = 'Ana R' where id = current_setting('t.ana')::uuid;

-- Friendships (as postgres): me–friend and me–victim accepted; asker, asker2 and pest asked me (pending).
insert into public.friendships (user_a, user_b, status, requested_by)
select least(m, o), greatest(m, o), status, case when status = 'accepted' then m else o end
from (select current_setting('t.me')::uuid as m, current_setting('t.' || who)::uuid as o, status
      from (values ('friend', 'accepted'), ('victim', 'accepted')) as v(who, status)) p;
with r as (
  insert into public.friendships (user_a, user_b, status, requested_by)
  select least(m, o), greatest(m, o), 'pending', o
  from (select current_setting('t.me')::uuid as m, current_setting('t.' || who)::uuid as o, who
        from unnest(array['asker', 'asker2', 'pest']) as who) p
  returning id, requested_by
)
select set_config('t.f_' || case requested_by when current_setting('t.asker')::uuid then 'asker'
                                              when current_setting('t.asker2')::uuid then 'asker2'
                                              else 'pest' end, id::text, true)
from r;

-- Blocks: blocker blocked me; I blocked blockee.
insert into public.blocks (blocker, blocked)
values (current_setting('t.blocker')::uuid, current_setting('t.me')::uuid),
       (current_setting('t.me')::uuid, current_setting('t.blockee')::uuid);

-- Lists: f1 owner's shared 'Crew' (me and comember members, invitee invited) · f2 owner's shared but deleted 'Old
-- crew' (me and goner members) · f3 mine, shared (victim invited, pest a member) · f4 pest's, shared (me invited).
insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at, deleted_at)
select id::uuid, current_setting('t.' || who)::uuid, name, 'manual', true, '2026-10-22T12:00:00Z', deleted
from (values
  ('00000000-0000-0000-0000-0000000000f1', 'owner', 'Crew', null::timestamptz),
  ('00000000-0000-0000-0000-0000000000f2', 'owner', 'Old crew', now()),
  ('00000000-0000-0000-0000-0000000000f3', 'me', 'Mine', null),
  ('00000000-0000-0000-0000-0000000000f4', 'pest', 'Pest list', null)
) as v(id, who, name, deleted);
insert into public.hit_list_members (list_id, user_id, role, status)
select l::uuid, current_setting('t.' || who)::uuid, 'add', status
from (values
  ('00000000-0000-0000-0000-0000000000f1', 'me', 'member'),
  ('00000000-0000-0000-0000-0000000000f1', 'co', 'member'),
  ('00000000-0000-0000-0000-0000000000f1', 'inv', 'invited'),
  ('00000000-0000-0000-0000-0000000000f2', 'me', 'member'),
  ('00000000-0000-0000-0000-0000000000f2', 'goner', 'member'),
  ('00000000-0000-0000-0000-0000000000f3', 'victim', 'invited'),
  ('00000000-0000-0000-0000-0000000000f3', 'pest', 'member'),
  ('00000000-0000-0000-0000-0000000000f4', 'me', 'invited')
) as v(l, who, status);

-- Shape -------------------------------------------------------------------------------------------------------------
select policies_are('public', 'profiles', array['profiles_select', 'profiles_update'],
                    'profiles has select and update policies (no insert: the signup trigger; no delete)');
select policies_are('public', 'friendships', array['friendships_select', 'friendships_delete'],
                    'friendships has select and delete policies (requests and answers go through functions)');
select policies_are('public', 'blocks', array['blocks_select', 'blocks_delete'],
                    'blocks has select and delete policies (block_user inserts)');
select ok((select count(*) = 6 and bool_and(roles = array['authenticated']::name[]) from pg_policies
           where schemaname = 'public' and tablename in ('profiles', 'friendships', 'blocks')),
          'every profile, friendship and block policy applies to authenticated only (anon gets none)');
select is(
  array(select p from unnest(array['can_read_profile', 'find_profile', 'send_friend_request',
                                   'respond_friend_request', 'block_user', 'unblock_user']) as p
        where not exists (select 1 from pg_proc
                          where proname = p and pronamespace = 'public'::regnamespace
                            and prosecdef and 'search_path=""' = any(proconfig))),
  '{}'::text[],
  'every S3-05 function is security definer with search_path pinned'
);
select is(
  array(select proname::text from pg_proc
        where pronamespace = 'public'::regnamespace
          and proname in ('can_read_profile', 'find_profile', 'send_friend_request', 'respond_friend_request',
                          'block_user', 'unblock_user', 'keep_profile_identity')
          and has_function_privilege('authenticated', oid, 'execute')
          and not has_function_privilege('anon', oid, 'execute')
        order by 1),
  array['block_user', 'can_read_profile', 'find_profile', 'respond_friend_request', 'send_friend_request',
        'unblock_user'],
  'authenticated executes the S3-05 functions, anon none, nobody the trigger function'
);

-- Who reads a profile -----------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.me')::uuid);
select set_eq(
  $$ select id from public.profiles $$,
  $$ select current_setting('t.' || who)::uuid
     from unnest(array['me', 'friend', 'victim', 'asker', 'asker2', 'pest', 'owner', 'co']) as who $$,
  'a user reads exactly their own, friends'', pending requests'' and co-members'' profiles'
);
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.profiles where id <> current_setting('t.stranger')::uuid $$,
                'stranger reads no profile');
select tests.authenticate_as(current_setting('t.friend')::uuid);
select results_eq($$ select username::text from public.profiles where id = current_setting('t.me')::uuid $$,
                  $$ values ('rider_me') $$, 'accepted friend reads the profile');
select tests.authenticate_as(current_setting('t.co')::uuid);
select results_eq($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                  $$ values (current_setting('t.me')::uuid) $$, 'co-member reads the profile (both members)');
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                  $$ values (current_setting('t.me')::uuid) $$, 'list owner reads a member''s profile');
select results_eq($$ select id from public.profiles where id = current_setting('t.inv')::uuid $$,
                  $$ values (current_setting('t.inv')::uuid) $$, 'list owner reads an invitee''s profile');
select tests.authenticate_as(current_setting('t.inv')::uuid);
select results_eq($$ select id from public.profiles where id = current_setting('t.owner')::uuid $$,
                  $$ values (current_setting('t.owner')::uuid) $$, 'invitee reads the list owner''s profile');
select is_empty($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                'invitee reads no member''s profile');
select tests.authenticate_as(current_setting('t.goner')::uuid);
select is_empty($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                'a deleted list makes no co-members');
select tests.authenticate_as(current_setting('t.asker')::uuid);
select results_eq($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                  $$ values (current_setting('t.me')::uuid) $$,
                  'the sender of a pending request reads the receiver''s profile');
select tests.authenticate_as(current_setting('t.me')::uuid);
select is(public.can_read_profile(current_setting('t.stranger')::uuid), false,
          'can_read_profile is false for a stranger');
reset role;
select tests.clear_auth();
select is_empty($$ select id from public.profiles $$, 'anon reads no profile');
select throws_ok($$ select * from public.find_profile('ana') $$, '42501', null, 'anon cannot call find_profile');
reset role;

-- find_profile: exact, case-insensitive, three columns, silent for unknown, NULL and blocked ---------------------
select tests.authenticate_as(current_setting('t.me')::uuid);
select results_eq(
  $$ select * from public.find_profile('Ana') $$,
  $$ values (current_setting('t.ana')::uuid, 'ana'::extensions.citext, 'Ana R'::text) $$,
  'find_profile(''Ana'') returns ana''s id, username and display name and nothing else'
);
select is_empty($$ select * from public.find_profile('an') $$, 'find_profile is exact (no prefix match)');
select is_empty($$ select * from public.find_profile('nobody_here') $$,
                'find_profile returns nothing for an unknown username');
select is_empty($$ select * from public.find_profile(null) $$, 'find_profile(NULL) never matches a NULL username');
select is_empty($$ select * from public.find_profile('') $$, 'find_profile('''') matches nothing');
select is_empty($$ select * from public.find_profile('blocker') $$,
                'find_profile returns nothing to someone the target blocked');
select results_eq($$ select id from public.find_profile('blockee') $$,
                  $$ values (current_setting('t.blockee')::uuid) $$,
                  'the blocker still finds the user they blocked (to unblock them)');

-- send_friend_request -----------------------------------------------------------------------------------------------
select lives_ok($$ select set_config('t.req', public.send_friend_request('ANA')::text, true) $$,
                'a user sends a friend request by username, any case');
select results_eq(
  $$ select user_a = least(current_setting('t.me')::uuid, current_setting('t.ana')::uuid),
            user_b = greatest(current_setting('t.me')::uuid, current_setting('t.ana')::uuid),
            status, requested_by = current_setting('t.me')::uuid
     from public.friendships where id = current_setting('t.req', true)::uuid $$,
  $$ values (true, true, 'pending', true) $$,
  'send_friend_request inserts an ordered pending row requested by the caller'
);
select results_eq($$ select public.send_friend_request('ana') = current_setting('t.req', true)::uuid $$,
                  $$ values (true) $$, 'a repeated request returns the same row');
select tests.authenticate_as(current_setting('t.ana')::uuid);
select results_eq($$ select public.send_friend_request('rider_me') = current_setting('t.req', true)::uuid $$,
                  $$ values (true) $$, 'a request the other way returns the same row');
reset role;
select results_eq(
  $$ select count(*), bool_and(status = 'accepted') from public.friendships
     where user_a = least(current_setting('t.me')::uuid, current_setting('t.ana')::uuid)
       and user_b = greatest(current_setting('t.me')::uuid, current_setting('t.ana')::uuid) $$,
  $$ values (1::bigint, true) $$,
  'a request the other way accepts instead of duplicating'
);
select tests.authenticate_as(current_setting('t.me')::uuid);
select throws_ok($$ select public.send_friend_request('blocker') $$, 'P0002', 'user not found',
                 'blocked user cannot send friend request');
select throws_ok($$ select public.send_friend_request('nobody_here') $$, 'P0002', 'user not found',
                 'a request to an unknown username raises the same error as a block');
select throws_ok($$ select public.send_friend_request('blockee') $$, '42501', null,
                 'a user cannot send a friend request to someone they blocked');
select throws_ok($$ select public.send_friend_request('rider_me') $$, '22023', null,
                 'a user cannot send a friend request to themselves');
reset role;
select tests.clear_auth();
select throws_ok($$ select public.send_friend_request('ana') $$, '42501', null,
                 'anon cannot call send_friend_request');
reset role;

-- respond_friend_request --------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.asker')::uuid);
select throws_ok($$ select public.respond_friend_request(current_setting('t.f_asker')::uuid, 'accept') $$,
                 '42501', null, 'the requester cannot accept their own request');
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select throws_ok($$ select public.respond_friend_request(current_setting('t.f_asker')::uuid, 'accept') $$,
                 '42501', null, 'someone outside the pair cannot respond');
select tests.authenticate_as(current_setting('t.me')::uuid);
select throws_ok($$ select public.respond_friend_request(current_setting('t.f_asker')::uuid, 'maybe') $$,
                 '22023', null, 'respond_friend_request takes only accept or decline');
select lives_ok($$ select public.respond_friend_request(current_setting('t.f_asker')::uuid, 'accept') $$,
                'the person asked accepts');
select results_eq($$ select status from public.friendships where id = current_setting('t.f_asker')::uuid $$,
                  $$ values ('accepted') $$, 'an accepted request is a friendship');
select throws_ok($$ select public.respond_friend_request(current_setting('t.f_asker')::uuid, 'decline') $$,
                 '42501', null, 'an accepted friendship cannot be answered again');
select lives_ok($$ select public.respond_friend_request(current_setting('t.f_asker2')::uuid, 'decline') $$,
                'the person asked declines');
reset role;
select is_empty($$ select id from public.friendships where id = current_setting('t.f_asker2')::uuid $$,
                'a declined request is deleted');

-- friendships: read and remove only your own; no direct writes ----------------------------------------------------
select tests.authenticate_as(current_setting('t.me')::uuid);
select set_eq(
  $$ select case when user_a = current_setting('t.me')::uuid then user_b else user_a end from public.friendships $$,
  $$ select current_setting('t.' || who)::uuid from unnest(array['friend', 'victim', 'asker', 'pest', 'ana']) as who $$,
  'a user reads exactly the friendships they are in'
);
select throws_ok(
  $$ insert into public.friendships (user_a, user_b, status, requested_by)
     values (least(current_setting('t.me')::uuid, current_setting('t.stranger')::uuid),
             greatest(current_setting('t.me')::uuid, current_setting('t.stranger')::uuid), 'accepted',
             current_setting('t.me')::uuid) $$,
  '42501', null, 'nobody inserts a friendship directly'
);
select is_empty($$ update public.friendships set status = 'accepted' where id = current_setting('t.f_pest')::uuid
                   returning id $$, 'nobody updates a friendship directly');
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.friendships $$, 'stranger reads no friendship');
select is_empty($$ delete from public.friendships returning id $$, 'stranger removes no friendship');
select tests.authenticate_as(current_setting('t.friend')::uuid);
select results_eq(
  $$ delete from public.friendships where current_setting('t.me')::uuid in (user_a, user_b) returning status $$,
  $$ values ('accepted') $$, 'either friend removes the friendship'
);
select is_empty($$ select id from public.profiles where id = current_setting('t.me')::uuid $$,
                'a removed friend reads the profile no more');

-- block_user / unblock_user (D50) ---------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.me')::uuid);
select lives_ok($$ select public.block_user(current_setting('t.victim')::uuid) $$, 'a user blocks a friend');
select lives_ok($$ select public.block_user(current_setting('t.victim')::uuid) $$, 'blocking twice is harmless');
select lives_ok($$ select public.block_user(current_setting('t.pest')::uuid) $$,
                'a user blocks someone with a pending request');
select throws_ok($$ select public.block_user(current_setting('t.me')::uuid) $$, '22023', null,
                 'a user cannot block themselves');
select throws_ok($$ select public.block_user('00000000-0000-0000-0000-00000000dead') $$, 'P0002', 'user not found',
                 'blocking an unknown id raises');
select set_eq($$ select blocked from public.blocks $$,
              $$ select current_setting('t.' || who)::uuid from unnest(array['victim', 'pest', 'blockee']) as who $$,
              'the blocker reads their blocks');
reset role;
select is((select count(*) from public.blocks
           where blocker = current_setting('t.me')::uuid and blocked = current_setting('t.victim')::uuid),
          1::bigint, 'block_user inserts one block row');
select is_empty(
  $$ select id from public.friendships
     where current_setting('t.me')::uuid in (user_a, user_b)
       and (current_setting('t.victim')::uuid in (user_a, user_b) or current_setting('t.pest')::uuid in (user_a, user_b)) $$,
  'block_user deletes the friendship and the blocked user''s pending request'
);
select is_empty(
  $$ select 1 from public.hit_list_members
     where (list_id = '00000000-0000-0000-0000-0000000000f3' and user_id = current_setting('t.victim')::uuid)
        or (list_id = '00000000-0000-0000-0000-0000000000f4' and user_id = current_setting('t.me')::uuid) $$,
  'block_user deletes pending invitations between the two, both ways'
);
select results_eq(
  $$ select status from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000000f3' and user_id = current_setting('t.pest')::uuid $$,
  $$ values ('member') $$,
  'a shared list both are in stays as it is (D50)'
);
select tests.authenticate_as(current_setting('t.victim')::uuid);
select is_empty($$ select * from public.blocks $$, 'the blocked user reads nothing about the block');
select is_empty($$ delete from public.blocks returning blocked $$, 'the blocked user cannot lift the block');
select is_empty($$ select * from public.find_profile('rider_me') $$, 'find_profile returns nothing for a blocked caller');
select throws_ok($$ select public.send_friend_request('rider_me') $$, 'P0002', 'user not found',
                 'a newly blocked user cannot send friend request either');
select throws_ok(
  $$ insert into public.blocks (blocker, blocked)
     values (current_setting('t.victim')::uuid, current_setting('t.me')::uuid) $$,
  '42501', null, 'nobody inserts a block directly'
);
select tests.authenticate_as(current_setting('t.me')::uuid);
select lives_ok($$ select public.unblock_user(current_setting('t.blockee')::uuid) $$, 'a user unblocks someone');
select is_empty($$ select blocked from public.blocks where blocked = current_setting('t.blockee')::uuid $$,
                'unblock_user deletes the block');
select lives_ok($$ select public.send_friend_request('blockee') $$, 'after unblocking, a friend request works again');

-- Own profile: update username and display name; id fixed; no insert or delete ----------------------------------
select results_eq(
  $$ update public.profiles set username = 'Me_Two', display_name = 'Me Two'
     where id = current_setting('t.me')::uuid returning username::text, display_name $$,
  $$ values ('Me_Two', 'Me Two') $$,
  'a user updates their own username and display name'
);
select throws_ok($$ update public.profiles set id = current_setting('t.stranger')::uuid
                    where id = current_setting('t.me')::uuid $$,
                 '42501', null, 'a user cannot change their profile id');
select is_empty($$ update public.profiles set display_name = 'Hacked' where id = current_setting('t.owner')::uuid
                   returning id $$, 'a user cannot update someone else''s profile');
select throws_ok($$ insert into public.profiles (id) values (gen_random_uuid()) $$, '42501', null,
                 'nobody inserts a profile directly');
select is_empty($$ delete from public.profiles where id = current_setting('t.me')::uuid returning id $$,
                'nobody deletes a profile directly');
select throws_ok($$ update public.profiles set username = 'ANA' where id = current_setting('t.me')::uuid $$,
                 '23505', null, 'a username taken in another case is refused');
select is_empty($$ select * from public.find_profile('rider_me') $$, 'the old username finds nothing after a rename');

select * from finish();
rollback;
