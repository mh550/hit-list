-- S7-03: sending (docs/plans/2026-10-22-s7-send.md, "Photo copy" and "Server migration"; D77 photos are staged
-- before the send row, D80 the sender's name comes from the server). A staged photo is an object under sends/<id>/
-- with the stager's owner_id and no sends row with that id: only its stager writes, reads and deletes it, and
-- create_send refuses an id somebody else staged into. mark_send_saved saves once. spots.from_username is a
-- username. staged_send_objects is the service role's (account-delete).
begin;
select plan(34);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.sender', tests.create_user('sender@test.local', 'Ana_B')::text, true);
select set_config('t.rec', tests.create_user('rec@test.local', 'recipient')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
select set_config('t.noname', tests.create_user('noname@test.local')::text, true);
update public.profiles set display_name = 'Ana B' where id = current_setting('t.sender')::uuid;

-- The sender and the noname rider are the recipient's friends.
insert into public.friendships (user_a, user_b, status, requested_by)
select least(a, b), greatest(a, b), 'accepted', a
from (select current_setting('t.' || x)::uuid as a, current_setting('t.' || y)::uuid as b
      from (values ('sender', 'rec'), ('noname', 'rec')) as v(x, y)) p;

-- An existing send of the sender's (e0), and objects written past the policies (as postgres): one the stranger
-- staged under a1, one with no owner under a2.
insert into public.sends (id, sender, recipient, payload)
values ('00000000-0000-0000-0000-0000000007e0', current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
        '{}');
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'sends/00000000-0000-0000-0000-0000000007a1/00000000-0000-0000-0000-0000000007f1.jpg',
        current_setting('t.stranger')),
       ('photos', 'sends/00000000-0000-0000-0000-0000000007a2/00000000-0000-0000-0000-0000000007f2.jpg', null);

-- Staging ------------------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007c1.jpg',
             current_setting('t.sender')) $$,
  'a rider stages a photo for a send id nobody has used'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007c2.jpg',
             current_setting('t.stranger')) $$,
  '42501', null, 'staging with another rider''s owner_id is refused'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007c3.jpg') $$,
  '42501', null, 'staging without an owner_id is refused'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b1/not-a-uuid.jpg', current_setting('t.sender')) $$,
  '42501', null, 'staging still needs a photo path'
);
select results_eq(
  $$ select name from storage.objects where name like 'sends/%' order by name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007c1.jpg') $$,
  'the stager reads their own staged photo and nobody else''s'
);

select tests.authenticate_as(current_setting('t.rec')::uuid);
select is_empty($$ select name from storage.objects where name like 'sends/%' $$,
                'the recipient-to-be reads no staged photo');

select tests.authenticate_as(current_setting('t.stranger')::uuid);
select set_config('storage.allow_delete_query', 'true', true);
select is_empty($$ select name from storage.objects where name like 'sends/00000000-0000-0000-0000-0000000007b1/%' $$,
                'a stranger reads no staged photo of another rider');
select is_empty($$ delete from storage.objects where name like 'sends/00000000-0000-0000-0000-0000000007b1/%'
                   returning name $$,
                'a stranger cannot delete a staged photo of another rider');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007e0/00000000-0000-0000-0000-0000000007c4.jpg',
             current_setting('t.stranger')) $$,
  '42501', null, 'another rider cannot stage into an existing send''s id'
);

select tests.clear_auth();
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b9/00000000-0000-0000-0000-0000000007c5.jpg', null) $$,
  '42501', null, 'anon cannot stage a photo'
);

select tests.authenticate_as(current_setting('t.sender')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007c6.jpg',
             current_setting('t.sender')) $$,
  'the sender stages a photo for a send they will abandon'
);
select results_eq(
  $$ delete from storage.objects where name like 'sends/00000000-0000-0000-0000-0000000007b2/%' returning name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000007b2/00000000-0000-0000-0000-0000000007c6.jpg') $$,
  'the stager deletes their own staged photo'
);

-- create_send ------------------------------------------------------------------------------------------------------
select throws_ok(
  $$ select public.create_send('00000000-0000-0000-0000-0000000007a1', current_setting('t.rec')::uuid,
                               '{"v": 1, "spots": []}') $$,
  '42501', null, 'create_send refuses an id another rider staged a photo under'
);
select throws_ok(
  $$ select public.create_send('00000000-0000-0000-0000-0000000007a2', current_setting('t.rec')::uuid,
                               '{"v": 1, "spots": []}') $$,
  '42501', null, 'create_send refuses an id with a staged photo nobody owns'
);
select lives_ok(
  $$ select public.create_send('00000000-0000-0000-0000-0000000007b1', current_setting('t.rec')::uuid,
                               '{"v": 1, "sender": {"username": "forged", "display_name": "Not Ana"}, "spots": []}') $$,
  'create_send takes the staged id'
);
select results_eq(
  $$ select payload from public.sends where id = '00000000-0000-0000-0000-0000000007b1' $$,
  $$ values ('{"v": 1, "sender": {"username": "Ana_B", "display_name": "Ana B"}, "spots": []}'::jsonb) $$,
  'create_send writes the sender from the caller''s profile over a forged one'
);
select lives_ok(
  $$ select public.create_send('00000000-0000-0000-0000-0000000007b3', current_setting('t.rec')::uuid,
                               '{"v": 1, "spots": []}') $$,
  'create_send without a sender in the payload adds one'
);
select is(
  (select payload -> 'sender' from public.sends where id = '00000000-0000-0000-0000-0000000007b3'),
  '{"username": "Ana_B", "display_name": "Ana B"}'::jsonb,
  'the added sender is the caller''s username and display name'
);

select tests.authenticate_as(current_setting('t.rec')::uuid);
select results_eq(
  $$ select name from storage.objects where name like 'sends/%' order by name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000007b1/00000000-0000-0000-0000-0000000007c1.jpg') $$,
  'once the send exists its recipient reads the photo staged for it'
);

select tests.authenticate_as(current_setting('t.noname')::uuid);
select throws_ok(
  $$ select public.create_send('00000000-0000-0000-0000-0000000007b4', current_setting('t.rec')::uuid,
                               '{"v": 1, "spots": []}') $$,
  '22023', null, 'create_send refuses a rider who has no username yet'
);

-- mark_send_saved saves once ---------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.rec')::uuid);
select lives_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b1') $$,
                'the recipient saves a send');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b1') $$, '55000', null,
                 'saving a send twice raises 55000');
select lives_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b3',
                                                 '00000000-0000-0000-0000-0000000007a9') $$,
                'a phone saves a send with its save token');
select lives_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b3',
                                                 '00000000-0000-0000-0000-0000000007a9') $$,
                'the same token again (a retry after a lost answer) succeeds');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b3',
                                                  '00000000-0000-0000-0000-0000000007aa') $$, '55000', null,
                 'another phone''s token raises 55000');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000007b3') $$, '55000', null,
                 'no token after a tokened save raises 55000');

-- spots.from_username ----------------------------------------------------------------------------------------------
select has_column('public', 'spots', 'from_username', 'spots has from_username');
select lives_ok(
  $$ insert into public.spots (id, owner_id, lat, lng, updated_at, copied_from_send, from_username)
     values ('00000000-0000-0000-0000-0000000007d1', current_setting('t.rec')::uuid, 47.6, -122.3, now(),
             '00000000-0000-0000-0000-0000000007b1', 'Ana_B') $$,
  'a copy keeps the sender''s username as it is spelled'
);
select throws_ok(
  $$ insert into public.spots (id, owner_id, lat, lng, updated_at, from_username)
     values ('00000000-0000-0000-0000-0000000007d2', current_setting('t.rec')::uuid, 47.6, -122.3, now(), 'a b') $$,
  '23514', null, 'from_username must be a username'
);
select results_eq(
  $$ select copied_from_send, from_username from public.spots where id = '00000000-0000-0000-0000-0000000007d1' $$,
  $$ values ('00000000-0000-0000-0000-0000000007b1'::uuid, 'Ana_B'::text) $$,
  'the copy reads back with its send and its sender'
);
select tests.authenticate_as(current_setting('t.sender')::uuid);
select is_empty($$ select id from public.spots where id = '00000000-0000-0000-0000-0000000007d1' $$,
                'the sender cannot read the recipient''s copy');

-- staged_send_objects (account-delete's leftovers) -----------------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'sends/00000000-0000-0000-0000-0000000007b5/00000000-0000-0000-0000-0000000007c7.jpg',
        current_setting('t.sender'));
select ok(not has_function_privilege('authenticated', 'public.staged_send_objects(uuid)', 'execute'),
          'authenticated cannot execute staged_send_objects');
select ok(not has_function_privilege('anon', 'public.staged_send_objects(uuid)', 'execute'),
          'anon cannot execute staged_send_objects');
select tests.authenticate_as_service_role();
select results_eq(
  $$ select * from public.staged_send_objects(current_setting('t.sender')::uuid) $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000007b5/00000000-0000-0000-0000-0000000007c7.jpg'::text) $$,
  'staged_send_objects lists the rider''s staged photos and none of a send that exists'
);

select * from finish();
rollback;
