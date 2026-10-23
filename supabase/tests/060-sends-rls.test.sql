-- S3-06: sends (D40 frozen copy, D50 blocking). A send is read by its sender and, while it is not withdrawn and they
-- haven't blocked the sender, its recipient; every write goes through create_send / withdraw_send / mark_send_saved /
-- dismiss_send. §3.3 cases; the Case table in docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(60);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.sender', tests.create_user('sender@test.local', 'sender')::text, true);
select set_config('t.rec', tests.create_user('rec@test.local', 'recipient')::text, true);
select set_config('t.third', tests.create_user('third@test.local', 'third')::text, true);
select set_config('t.nofriend', tests.create_user('nofriend@test.local', 'nofriend')::text, true);
select set_config('t.blocker', tests.create_user('blocker@test.local', 'blocker')::text, true);
select set_config('t.blockee', tests.create_user('blockee@test.local', 'blockee')::text, true);
select set_config('t.later', tests.create_user('later@test.local', 'later')::text, true);
select set_config('t.asked', tests.create_user('asked@test.local', 'asked')::text, true);

-- Accepted friendships with the sender: recipient, third's friend is the recipient (so third can call create_send
-- at all), later (blocks the sender after a send). blocker and blockee also have a friendship row next to a block:
-- block_user deletes it, so this is the state a send racing a block would see, and create_send must still refuse.
-- The sender has only asked 'asked' (pending).
insert into public.friendships (user_a, user_b, status, requested_by)
select least(a, b), greatest(a, b), 'accepted', a
from (select current_setting('t.' || x)::uuid as a, current_setting('t.' || y)::uuid as b
      from (values ('sender', 'rec'), ('sender', 'later'), ('third', 'rec'), ('sender', 'blocker'),
                   ('sender', 'blockee')) as v(x, y)) p;
insert into public.friendships (user_a, user_b, status, requested_by)
select least(a, b), greatest(a, b), 'pending', a
from (select current_setting('t.sender')::uuid as a, current_setting('t.asked')::uuid as b) p;
insert into public.blocks (blocker, blocked)
values (current_setting('t.blocker')::uuid, current_setting('t.sender')::uuid),
       (current_setting('t.sender')::uuid, current_setting('t.blockee')::uuid);

-- create_send ------------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select is(
  public.create_send('00000000-0000-0000-0000-0000000005e1', current_setting('t.rec')::uuid,
                     '{"spots": [{"name": "Library rail"}]}'),
  '00000000-0000-0000-0000-0000000005e1'::uuid,
  'create_send returns the new send''s id'
);
select lives_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005e2', current_setting('t.rec')::uuid,
                                             '{"spots": []}') $$, 'sender sends a second spot set');
select lives_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005e3', current_setting('t.rec')::uuid,
                                             '{"spots": []}') $$, 'sender sends a third spot set');
select lives_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005e4', null, '{"spots": []}') $$,
                'sender creates a link-only send (no recipient)');
select lives_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005e5', current_setting('t.later')::uuid,
                                             '{"spots": []}') $$, 'sender sends to a friend who blocks them later');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f1',
                                              current_setting('t.nofriend')::uuid, '{}') $$,
                 '42501', 'you can only send to friends', 'create_send to someone who is not a friend raises');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f8',
                                              current_setting('t.asked')::uuid, '{}') $$,
                 '42501', 'you can only send to friends', 'create_send to someone who has not accepted yet raises');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f2',
                                              current_setting('t.blocker')::uuid, '{}') $$,
                 '42501', 'you can only send to friends', 'blocked sender cannot create_send');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f3',
                                              current_setting('t.blockee')::uuid, '{}') $$,
                 '42501', 'you can only send to friends', 'a sender cannot send to someone they blocked');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f4',
                                              current_setting('t.sender')::uuid, '{}') $$,
                 '22023', null, 'create_send to yourself raises');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f5', current_setting('t.rec')::uuid,
                                              null) $$,
                 '22023', null, 'create_send refuses a NULL payload');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f9', current_setting('t.rec')::uuid,
                                              '[{"name": "x"}]') $$,
                 '22023', null, 'create_send refuses a payload that is not a JSON object');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005fa', current_setting('t.rec')::uuid,
                                              jsonb_build_object('notes', repeat('x', 1048577))) $$,
                 '22023', null, 'create_send refuses a payload over 1 MB');
select throws_ok(
  $$ insert into public.sends (id, sender, recipient, payload)
     values ('00000000-0000-0000-0000-0000000005f6', current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
             '{}') $$,
  '42501', null, 'nobody inserts a send directly'
);

reset role;
select results_eq(
  $$ select sender, recipient, payload, withdrawn_at, saved_at, dismissed_at from public.sends
     where id = '00000000-0000-0000-0000-0000000005e1' $$,
  $$ values (current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
             '{"spots": [{"name": "Library rail"}]}'::jsonb, null::timestamptz, null::timestamptz,
             null::timestamptz) $$,
  'create_send inserts one row with the caller as sender'
);
select is((select count(*)::int from public.sends where id::text like '00000000-0000-0000-0000-0000000005f%'), 0,
          'no refused send left a row');

-- The recipient (a friend of the sender, too) cannot take over an existing send by reusing its id.
select tests.authenticate_as(current_setting('t.rec')::uuid);
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005e1',
                                              current_setting('t.sender')::uuid, '{"spots": "mine now"}') $$,
                 '23505', null, 'create_send cannot take over an existing send id');

-- Who reads a send -------------------------------------------------------------------------------------------------
select results_eq(
  $$ select id from public.sends order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid), ('00000000-0000-0000-0000-0000000005e2'::uuid),
            ('00000000-0000-0000-0000-0000000005e3'::uuid) $$,
  'recipient reads exactly the sends to them'
);
select results_eq(
  $$ select payload from public.sends where id = '00000000-0000-0000-0000-0000000005e1' $$,
  $$ values ('{"spots": [{"name": "Library rail"}]}'::jsonb) $$,
  'recipient reads the send''s payload'
);
select is_empty($$ select id from public.sends where id = '00000000-0000-0000-0000-0000000005e4' $$,
                'a link-only send is not readable by a friend of its sender');

select tests.authenticate_as(current_setting('t.third')::uuid);
select is_empty($$ select id from public.sends $$, 'third user reads no send');

select tests.authenticate_as(current_setting('t.sender')::uuid);
select results_eq(
  $$ select id from public.sends order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid), ('00000000-0000-0000-0000-0000000005e2'::uuid),
            ('00000000-0000-0000-0000-0000000005e3'::uuid), ('00000000-0000-0000-0000-0000000005e4'::uuid),
            ('00000000-0000-0000-0000-0000000005e5'::uuid) $$,
  'sender reads every send they made, the link-only one included'
);

reset role;
select tests.clear_auth();
select is_empty($$ select id from public.sends $$, 'anon reads no send');
select throws_ok($$ select public.create_send('00000000-0000-0000-0000-0000000005f7', current_setting('t.rec')::uuid,
                                              '{}') $$,
                 '42501', null, 'anon cannot call create_send');
reset role;
select ok(not has_function_privilege('anon', p, 'execute'), 'anon cannot execute ' || p)
from unnest(array['public.create_send(uuid, uuid, jsonb)', 'public.withdraw_send(uuid)',
                  'public.mark_send_saved(uuid)', 'public.dismiss_send(uuid)', 'public.can_read_send(uuid)',
                  'public.can_read_photo(text)', 'public.can_write_photo(text, text)']) as p;

-- No direct writes ------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.rec')::uuid);
select is_empty($$ update public.sends set payload = '{"spots": "changed"}'
                   where id = '00000000-0000-0000-0000-0000000005e1' returning id $$,
                'the recipient cannot update the payload');
select is_empty($$ update public.sends set withdrawn_at = null, saved_at = now()
                   where id = '00000000-0000-0000-0000-0000000005e1' returning id $$,
                'the recipient cannot set saved_at directly');
select is_empty($$ delete from public.sends where id = '00000000-0000-0000-0000-0000000005e1' returning id $$,
                'the recipient cannot delete a send');
select tests.authenticate_as(current_setting('t.sender')::uuid);
select is_empty($$ update public.sends set recipient = current_setting('t.third')::uuid
                   where id = '00000000-0000-0000-0000-0000000005e1' returning id $$,
                'the sender cannot redirect a send directly');
select is_empty($$ delete from public.sends where id = '00000000-0000-0000-0000-0000000005e1' returning id $$,
                'the sender cannot delete a send directly');
reset role;
select results_eq(
  $$ select recipient, payload, saved_at from public.sends where id = '00000000-0000-0000-0000-0000000005e1' $$,
  $$ values (current_setting('t.rec')::uuid, '{"spots": [{"name": "Library rail"}]}'::jsonb, null::timestamptz) $$,
  'the direct updates and deletes changed nothing'
);

-- Save and Dismiss (recipient only) ----------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'the sender cannot mark their send saved');
select throws_ok($$ select public.dismiss_send('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'the sender cannot dismiss their send');
select tests.authenticate_as(current_setting('t.third')::uuid);
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'a third user cannot mark a send saved');
select throws_ok($$ select public.dismiss_send('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'a third user cannot dismiss a send');
select throws_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'a third user cannot withdraw a send');
select tests.authenticate_as(current_setting('t.rec')::uuid);
select throws_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000005e2') $$, '42501', 'no such send',
                 'the recipient cannot withdraw a send');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e4') $$, '42501', 'no such send',
                 'nobody saves a link-only send through mark_send_saved');
select lives_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e2') $$, 'the recipient saves a send');
select lives_ok($$ select public.dismiss_send('00000000-0000-0000-0000-0000000005e1') $$,
                'the recipient dismisses a send');
select results_eq(
  $$ select id, saved_at is not null, dismissed_at is not null from public.sends
     where id in ('00000000-0000-0000-0000-0000000005e1', '00000000-0000-0000-0000-0000000005e2') order by id $$,
  $$ values ('00000000-0000-0000-0000-0000000005e1'::uuid, false, true),
            ('00000000-0000-0000-0000-0000000005e2'::uuid, true, false) $$,
  'mark_send_saved sets saved_at and dismiss_send sets dismissed_at'
);

-- Withdraw (sender only, until saved, D40) ----------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select throws_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000005e2') $$, '55000', null,
                 'withdraw_send after the recipient saved raises');
select lives_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000005e3') $$, 'the sender withdraws a send');
select set_config('t.withdrawn_at', (select withdrawn_at::text from public.sends
                                      where id = '00000000-0000-0000-0000-0000000005e3'), true);
select ok(current_setting('t.withdrawn_at') <> '', 'the sender still sees a withdrawn send, withdrawn_at set');
select lives_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000005e3') $$,
                'withdrawing again is harmless');
select is((select withdrawn_at::text from public.sends where id = '00000000-0000-0000-0000-0000000005e3'),
          current_setting('t.withdrawn_at'), 'withdrawing again keeps the first withdrawn_at');
select throws_ok($$ select public.withdraw_send('00000000-0000-0000-0000-00000000dead') $$, '42501', 'no such send',
                 'withdraw_send on an unknown id raises the same error');

select tests.authenticate_as(current_setting('t.rec')::uuid);
select is_empty($$ select id from public.sends where id = '00000000-0000-0000-0000-0000000005e3' $$,
                'recipient reads nothing after withdraw');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e3') $$, '42501', 'no such send',
                 'the recipient cannot save a withdrawn send');
select throws_ok($$ select public.dismiss_send('00000000-0000-0000-0000-0000000005e3') $$, '42501', 'no such send',
                 'the recipient cannot dismiss a withdrawn send');

-- D50: a recipient who blocks the sender sees their pending sends no more ------------------------------------------------
select tests.authenticate_as(current_setting('t.later')::uuid);
select results_eq($$ select id from public.sends $$, $$ values ('00000000-0000-0000-0000-0000000005e5'::uuid) $$,
                  'the friend reads the send before blocking');
select lives_ok($$ select public.block_user(current_setting('t.sender')::uuid) $$, 'the friend blocks the sender');
select is_empty($$ select id from public.sends $$, 'a recipient who blocks the sender reads their send no more');
select throws_ok($$ select public.mark_send_saved('00000000-0000-0000-0000-0000000005e5') $$, '42501', 'no such send',
                 'a recipient cannot save a send from someone they blocked');

select * from finish();
rollback;
