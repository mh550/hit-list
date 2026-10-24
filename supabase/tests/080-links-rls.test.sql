-- S3-07: links (D44 send and invite links, D45 only a token's SHA-256 is stored). Nobody touches the links table
-- directly; create_link / revoke_link / list_my_links are for the signed-in creator, preview_link is for the service
-- role (the share-preview Edge Function, S9), redeem_invite joins a shared list once. §3.3 cases; the Case table in
-- docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(116);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.sender', tests.create_user('sender@test.local', 'sender')::text, true);
select set_config('t.owner', tests.create_user('owner@test.local', 'owner')::text, true);
select set_config('t.member', tests.create_user('member@test.local', 'member')::text, true);
select set_config('t.invitee', tests.create_user('invitee@test.local', 'invitee')::text, true);
select set_config('t.joiner', tests.create_user('joiner@test.local', 'joiner')::text, true);
select set_config('t.joiner2', tests.create_user('joiner2@test.local', 'joiner2')::text, true);
select set_config('t.viewer', tests.create_user('viewer@test.local', 'viewer')::text, true);
select set_config('t.blocked', tests.create_user('blocked@test.local', 'blocked')::text, true);
select set_config('t.blocker', tests.create_user('blocker@test.local', 'blocker')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
update public.profiles set display_name = 'Sam Sender' where id = current_setting('t.sender')::uuid;
update public.profiles set display_name = 'Olive Owner' where id = current_setting('t.owner')::uuid;

-- The owner is friends with the invitee (who has an open invitation to e1) and has blocked 'blocked'; 'blocker' has
-- blocked the owner. Nobody else is anybody's friend: an invite link needs no friendship (the link is the consent).
insert into public.friendships (user_a, user_b, status, requested_by)
select least(o, i), greatest(o, i), 'accepted', o
from (select current_setting('t.owner')::uuid as o, current_setting('t.invitee')::uuid as i) p;
insert into public.blocks (blocker, blocked)
values (current_setting('t.owner')::uuid, current_setting('t.blocked')::uuid),
       (current_setting('t.blocker')::uuid, current_setting('t.owner')::uuid);

-- Lists (as postgres) ----------------------------------------------------------------------------------------------
-- e1 shared (member is a member, invitee is invited) · e2 not shared · e3 shared, deleted · e4 shared (unshared
-- later) · e5 shared (deleted later) · e6 the stranger's, shared.
insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at, deleted_at)
select id::uuid, current_setting('t.' || who)::uuid, name, 'manual', shared, '2026-10-22T12:00:00Z', deleted::timestamptz
from (values
  ('00000000-0000-0000-0000-0000000008e1', 'owner', 'Downtown rails', true, null),
  ('00000000-0000-0000-0000-0000000008e2', 'owner', 'Private', false, null),
  ('00000000-0000-0000-0000-0000000008e3', 'owner', 'Gone', true, '2026-10-22T12:00:00Z'),
  ('00000000-0000-0000-0000-0000000008e4', 'owner', 'Unshared later', true, null),
  ('00000000-0000-0000-0000-0000000008e5', 'owner', 'Deleted later', true, null),
  ('00000000-0000-0000-0000-0000000008e6', 'stranger', 'Not yours', true, null)
) as v(id, who, name, shared, deleted);
insert into public.hit_list_members (list_id, user_id, role, status, invited_by, joined_at)
values ('00000000-0000-0000-0000-0000000008e1', current_setting('t.member')::uuid, 'add', 'member',
        current_setting('t.owner')::uuid, now()),
       ('00000000-0000-0000-0000-0000000008e1', current_setting('t.invitee')::uuid, 'view', 'invited',
        current_setting('t.owner')::uuid, null);

-- Spots: o1 the owner's, in e1 · j1 the joiner's, a row in e1 left from an earlier membership (joining clears it).
insert into public.spots (id, owner_id, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000008a1', current_setting('t.owner')::uuid, 40.0, -105.0, '2026-10-22T12:00:00Z'),
       ('00000000-0000-0000-0000-0000000008a2', current_setting('t.joiner')::uuid, 40.0, -105.0, '2026-10-22T12:00:00Z');
insert into public.hit_list_spots (list_id, spot_id, added_by)
values ('00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008a1', current_setting('t.owner')::uuid),
       ('00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008a2', current_setting('t.joiner')::uuid);

-- Sends (link-only, recipient NULL): d1 live · d2 withdrawn after its link is made · d3 already withdrawn.
insert into public.sends (id, sender, recipient, payload, withdrawn_at)
values ('00000000-0000-0000-0000-0000000008d1', current_setting('t.sender')::uuid, null,
        '{"spots": [{"name": "Library rail"}]}', null),
       ('00000000-0000-0000-0000-0000000008d2', current_setting('t.sender')::uuid, null, '{"spots": []}', null),
       ('00000000-0000-0000-0000-0000000008d3', current_setting('t.sender')::uuid, null, '{"spots": []}', now());

-- Token hashes the way a client makes them: SHA-256 of the token, lowercase hex.
select set_config('t.sha_' || tok, encode(extensions.digest(tok, 'sha256'), 'hex'), true)
from unnest(array['send_live', 'send_never', 'send_withdrawn', 'send_expired', 'send_revoked', 'inv_view',
                  'inv_invitee', 'inv_expired', 'inv_revoked', 'inv_blocked', 'inv_unshare', 'inv_deleted',
                  'inv_owner', 'inv_long', 'refused']) as tok;

-- create_link -----------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select isnt(
  public.create_link('send', '00000000-0000-0000-0000-0000000008d1', current_setting('t.sha_send_live'),
                     now() + interval '30 days'),
  null,
  'create_link for a send by its sender succeeds'
);
select lives_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                             current_setting('t.sha_send_never'), null) $$,
                'a send link may never expire (D44)');
select lives_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d2',
                                             current_setting('t.sha_send_withdrawn'), now() + interval '1 day') $$,
                'sender links the send they will withdraw');
select lives_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                             current_setting('t.sha_send_expired'), now() + interval '1 day') $$,
                'sender makes a link that will expire');
select set_config('t.link_revoked',
  public.create_link('send', '00000000-0000-0000-0000-0000000008d1', current_setting('t.sha_send_revoked'),
                     now() + interval '7 days')::text, true);
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d3',
                                              current_setting('t.sha_refused'), null) $$,
                 '55000', null, 'create_link refuses a withdrawn send');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_refused'), null, 'add') $$,
                 '22023', null, 'a send link takes no role');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_refused'), now() - interval '1 minute') $$,
                 '22023', null, 'create_link refuses an expiry in the past');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              upper(current_setting('t.sha_refused')), null) $$,
                 '22023', null, 'create_link refuses a hash that is not lowercase hex');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1', 'abc123', null) $$,
                 '22023', null, 'create_link refuses a hash that is not 64 characters');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1', 'my-secret-token',
                                              null) $$,
                 '22023', null, 'create_link refuses a plain token (only a hash is stored, D45)');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_send_live'), null) $$,
                 '23505', null, 'create_link cannot reuse a token hash');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '42501', null, 'the sender cannot make an invite link to someone else''s list');

select tests.authenticate_as(current_setting('t.owner')::uuid);
select isnt(
  public.create_link('invite', '00000000-0000-0000-0000-0000000008e1', encode(extensions.digest('abc', 'sha256'), 'hex'),
                     now() + interval '7 days', 'add'),
  null,
  'create_link for an invite by the list owner succeeds'
);
select lives_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                             current_setting('t.sha_' || tok), now() + interval '7 days', role)
                   from (values ('inv_view', 'view'), ('inv_invitee', 'add'), ('inv_expired', 'add'),
                                ('inv_revoked', 'add'), ('inv_blocked', 'add'), ('inv_owner', 'add'))
                        as v(tok, role) $$,
                'the owner makes more invite links to the list');
select lives_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e4',
                                             current_setting('t.sha_inv_unshare'), now() + interval '1 day', 'add'),
                          public.create_link('invite', '00000000-0000-0000-0000-0000000008e5',
                                             current_setting('t.sha_inv_deleted'), now() + interval '1 day', 'add') $$,
                'the owner links the lists they will unshare and delete');
select lives_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                             current_setting('t.sha_inv_long'), now() + interval '30 days', 'view') $$,
                'the owner asks for a 30-day invite link');
select throws_ok($$ select public.create_link('page', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now() + interval '1 day', 'add') $$,
                 '22023', null, 'create_link takes only send or invite');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now(), 'add') $$,
                 '22023', null, 'create_link refuses a link that expires now');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now() + interval '7 days') $$,
                 '22023', null, 'an invite link needs a role');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'admin') $$,
                 '22023', null, 'an invite link''s role is add or view');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), null, 'add') $$,
                 '22023', null, 'an invite link must expire');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e2',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '55000', null, 'create_link refuses an invite to a list that is not shared');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e3',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '42501', null, 'create_link refuses an invite to a deleted list');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e6',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '42501', null, 'the owner cannot make an invite link to someone else''s list');
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008ff',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '42501', null, 'an invite link to an unknown list raises the same error');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_refused'), null) $$,
                 '42501', null, 'someone else cannot link the sender''s send');

select tests.authenticate_as(current_setting('t.member')::uuid);
select throws_ok($$ select public.create_link('invite', '00000000-0000-0000-0000-0000000008e1',
                                              current_setting('t.sha_refused'), now() + interval '7 days', 'add') $$,
                 '42501', null, 'a member cannot make an invite link');

select tests.clear_auth();
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_refused'), null) $$,
                 '42501', null, 'anon cannot call create_link');

reset role;
select results_eq(
  $$ select kind, send_id, list_id, role, created_by, expires_at, revoked_at, used_by, used_at from public.links
     where token_sha256 in (current_setting('t.sha_send_live'), encode(extensions.digest('abc', 'sha256'), 'hex'))
     order by kind desc $$,
  $$ values ('send', '00000000-0000-0000-0000-0000000008d1'::uuid, null::uuid, null::text,
             current_setting('t.sender')::uuid, now() + interval '30 days', null::timestamptz, null::uuid,
             null::timestamptz),
            ('invite', null::uuid, '00000000-0000-0000-0000-0000000008e1'::uuid, 'add',
             current_setting('t.owner')::uuid, now() + interval '7 days', null::timestamptz, null::uuid,
             null::timestamptz) $$,
  'create_link stores the kind, target, role, creator and expiry'
);
select is((select expires_at from public.links where token_sha256 = current_setting('t.sha_inv_long')),
          now() + interval '7 days', 'an invite link lasts at most 7 days (D44)');
select is((select expires_at from public.links where token_sha256 = current_setting('t.sha_inv_unshare')),
          now() + interval '1 day', 'a shorter invite expiry is kept');
select is((select count(*)::int from public.links where token_sha256 = current_setting('t.sha_refused')), 0,
          'no refused link left a row');
select is((select count(*)::int from public.links), 15, 'fifteen links were made');

-- No direct access ------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select is_empty($$ select id from public.links $$, 'authenticated reads no links');
select throws_ok(
  $$ insert into public.links (kind, token_sha256, send_id, created_by)
     values ('send', current_setting('t.sha_refused'), '00000000-0000-0000-0000-0000000008d1',
             current_setting('t.sender')::uuid) $$,
  '42501', null, 'authenticated cannot insert links'
);
select is_empty($$ update public.links set revoked_at = null, expires_at = null returning id $$,
                'authenticated cannot update links');
select is_empty($$ delete from public.links returning id $$, 'authenticated cannot delete links');
select tests.clear_auth();
select is_empty($$ select id from public.links $$, 'anon reads no links');
reset role;
select is((select count(*)::int from public.links), 15, 'the direct writes changed nothing');

-- list_my_links ---------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select is((select count(*)::int from public.list_my_links('send')), 5, 'list_my_links returns the sender''s send links');
select is_empty($$ select id from public.list_my_links('invite') $$, 'the sender has no invite links');
select tests.authenticate_as(current_setting('t.owner')::uuid);
select is((select count(*)::int from public.list_my_links('invite')), 10,
          'list_my_links returns the owner''s invite links');
select is((select count(*)::int from public.list_my_links(null)), 10, 'list_my_links(NULL) returns every kind');
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.list_my_links(null) $$, 'a stranger lists no links');
reset role;
select ok(pg_get_function_result('public.list_my_links(text)'::regprocedure) !~ 'sha',
          'list_my_links never returns the hash');

-- revoke_link -----------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.stranger')::uuid);
select throws_ok($$ select public.revoke_link(current_setting('t.link_revoked')::uuid) $$, '42501', 'no such link',
                 'someone else cannot revoke a link');
select throws_ok($$ select public.revoke_link('00000000-0000-0000-0000-0000000008ff') $$, '42501', 'no such link',
                 'revoking an unknown link raises the same error');
select tests.authenticate_as(current_setting('t.sender')::uuid);
select lives_ok($$ select public.revoke_link(current_setting('t.link_revoked')::uuid) $$, 'the creator revokes a link');
select is((select revoked_at from public.list_my_links('send') where id = current_setting('t.link_revoked')::uuid),
          now(), 'list_my_links shows the revoked link with revoked_at set');
-- An earlier revoke (the clock can't move inside a test): revoking again keeps that time.
reset role;
update public.links set revoked_at = '2026-10-01T00:00:00Z' where id = current_setting('t.link_revoked')::uuid;
select tests.authenticate_as(current_setting('t.sender')::uuid);
select lives_ok($$ select public.revoke_link(current_setting('t.link_revoked')::uuid) $$, 'revoking again is harmless');
select is((select revoked_at from public.list_my_links('send') where id = current_setting('t.link_revoked')::uuid),
          '2026-10-01T00:00:00Z'::timestamptz, 'revoking again keeps the first time');
select lives_ok($$ select public.withdraw_send('00000000-0000-0000-0000-0000000008d2') $$, 'the sender withdraws a linked send');

-- Expire two links and revoke one invite (as postgres: the clock can't move inside a test).
reset role;
update public.links set expires_at = now() - interval '1 second'
where token_sha256 in (current_setting('t.sha_send_expired'), current_setting('t.sha_inv_expired'));
select set_config('t.link_inv_revoked',
                  (select id::text from public.links where token_sha256 = current_setting('t.sha_inv_revoked')), true);
select tests.authenticate_as(current_setting('t.owner')::uuid);
select lives_ok($$ select public.revoke_link(current_setting('t.link_inv_revoked')::uuid) $$,
                'the owner revokes an invite link');
select lives_ok($$ select public.stop_sharing('00000000-0000-0000-0000-0000000008e4') $$, 'the owner stops sharing e4');
select lives_ok($$ update public.hit_lists set deleted_at = now(), updated_at = now()
                   where id = '00000000-0000-0000-0000-0000000008e5' $$, 'the owner deletes e5');
reset role;
select is((select count(*)::int from public.links
           where token_sha256 in (current_setting('t.sha_inv_unshare'), current_setting('t.sha_inv_deleted'))
             and revoked_at is not null), 2,
          'stopping sharing or deleting a list revokes its invite links');
select is((select count(*)::int from public.links
           where revoked_at is not null
             and token_sha256 not in (current_setting('t.sha_inv_unshare'), current_setting('t.sha_inv_deleted'),
                                      current_setting('t.sha_inv_revoked'), current_setting('t.sha_send_revoked'))), 0,
          'it leaves other lists'' invite links and send links alone');
update public.hit_lists set shared = true where id = '00000000-0000-0000-0000-0000000008e4';
-- Live invite links to the unshared e2 and the deleted e3, as only the service role could make them.
insert into public.links (kind, token_sha256, list_id, role, created_by, expires_at)
select 'invite', encode(extensions.digest(tok, 'sha256'), 'hex'), list_id::uuid, 'add',
       current_setting('t.owner')::uuid, now() + interval '1 day'
from (values ('inv_private', '00000000-0000-0000-0000-0000000008e2'),
             ('inv_gone', '00000000-0000-0000-0000-0000000008e3')) as v(tok, list_id);

-- preview_link (the service role) ---------------------------------------------------------------------------------
select tests.authenticate_as_service_role();
select results_eq(
  $$ select kind, send_id, payload, list_name, sender_username::text, sender_display_name, expires_at
     from public.preview_link(current_setting('t.sha_send_live')) $$,
  $$ values ('send', '00000000-0000-0000-0000-0000000008d1'::uuid, '{"spots": [{"name": "Library rail"}]}'::jsonb,
             null::text, 'sender', 'Sam Sender', now() + interval '30 days') $$,
  'preview_link returns a live send link''s kind, send id (photos are signed only under sends/<id>/), payload, sender and expiry'
);
select results_eq(
  $$ select kind, expires_at from public.preview_link(current_setting('t.sha_send_never')) $$,
  $$ values ('send', null::timestamptz) $$,
  'a send link that never expires previews'
);
select results_eq(
  $$ select kind, send_id, payload, list_name, sender_username::text, sender_display_name, expires_at
     from public.preview_link(encode(extensions.digest('abc', 'sha256'), 'hex')) $$,
  $$ values ('invite', null::uuid, null::jsonb, 'Downtown rails', 'owner', 'Olive Owner', now() + interval '7 days') $$,
  'preview_link returns a live invite link''s kind, list name and inviter'
);
select is_empty($$ select * from public.preview_link(current_setting('t.sha_send_expired')) $$,
                'expired link previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_send_revoked')) $$,
                'revoked link previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_send_withdrawn')) $$,
                'withdrawn send link previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_refused')) $$,
                'unknown link previews nothing');
select is_empty($$ select * from public.preview_link('not a hash') $$, 'a malformed hash previews nothing');
select is_empty($$ select * from public.preview_link(null) $$, 'a NULL hash previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_inv_expired')) $$,
                'an expired invite link previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_inv_revoked')) $$,
                'a revoked invite link previews nothing');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_inv_unshare')) $$,
                'an invite link of a list that stopped sharing previews nothing, even shared again');
select is_empty($$ select * from public.preview_link(current_setting('t.sha_inv_deleted')) $$,
                'an invite link of a deleted list previews nothing');
select is_empty($$ select * from public.preview_link(encode(extensions.digest('inv_private', 'sha256'), 'hex'))
                   union all
                   select * from public.preview_link(encode(extensions.digest('inv_gone', 'sha256'), 'hex')) $$,
                'an unrevoked invite link of an unshared or deleted list previews nothing');
reset role;
select set_config('role', 'service_role', true);
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$ select * from public.preview_link(current_setting('t.sha_send_live')) $$, '42501', null,
                 'preview_link checks the JWT role claim is service_role');
reset role;
select tests.authenticate_as(current_setting('t.sender')::uuid);
select throws_ok($$ select * from public.preview_link(current_setting('t.sha_send_live')) $$, '42501', null,
                 'preview_link raises for authenticated');
select tests.clear_auth();
select throws_ok($$ select * from public.preview_link(current_setting('t.sha_send_live')) $$, '42501', null,
                 'preview_link raises for anon');

-- redeem_invite ---------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.joiner')::uuid);
select is(public.redeem_invite('abc'), '00000000-0000-0000-0000-0000000008e1'::uuid,
          'redeem_invite returns the list id (the token''s SHA-256 hex matches a client''s)');
reset role;
select results_eq(
  $$ select role, status, invited_by, joined_at from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000008e1' and user_id = current_setting('t.joiner')::uuid $$,
  $$ values ('add', 'member', current_setting('t.owner')::uuid, now()) $$,
  'redeem_invite makes the caller a member with the link''s role'
);
select results_eq(
  $$ select used_by, used_at from public.links where token_sha256 = encode(extensions.digest('abc', 'sha256'), 'hex') $$,
  $$ values (current_setting('t.joiner')::uuid, now()) $$,
  'redeem_invite marks the link used by the caller'
);
select is_empty($$ select 1 from public.hit_list_spots
                   where list_id = '00000000-0000-0000-0000-0000000008e1'
                     and spot_id = '00000000-0000-0000-0000-0000000008a2' $$,
                'joining by link clears a row left from an earlier membership');
select tests.authenticate_as(current_setting('t.joiner')::uuid);
select ok(public.can_read_spot('00000000-0000-0000-0000-0000000008a1'), 'the new member reads the list''s spots');
select is(public.redeem_invite('abc'), '00000000-0000-0000-0000-0000000008e1'::uuid,
          'the redeemer retrying the same link gets the list again');
select tests.authenticate_as(current_setting('t.joiner2')::uuid);
select throws_ok($$ select public.redeem_invite('abc') $$, '42501', 'invalid invite', 'second redeem raises invalid invite');
reset role;
select tests.authenticate_as_service_role();
select is_empty($$ select * from public.preview_link(encode(extensions.digest('abc', 'sha256'), 'hex')) $$,
                'a used invite link previews nothing');
reset role;
select is((select count(*)::int from public.hit_list_members
           where list_id = '00000000-0000-0000-0000-0000000008e1'
             and user_id in (current_setting('t.joiner')::uuid, current_setting('t.joiner2')::uuid)), 1,
          'two redeems of one token yield one member row');

select tests.authenticate_as(current_setting('t.viewer')::uuid);
select lives_ok($$ select public.redeem_invite('inv_view') $$, 'a view link''s redeemer joins');
select tests.authenticate_as(current_setting('t.invitee')::uuid);
select lives_ok($$ select public.redeem_invite('inv_invitee') $$, 'an invitee joins by link');
reset role;
select results_eq(
  $$ select user_id, role, status, joined_at is not null from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000008e1'
       and user_id in (current_setting('t.viewer')::uuid, current_setting('t.invitee')::uuid)
     order by role desc $$,
  $$ values (current_setting('t.viewer')::uuid, 'view', 'member', true),
            (current_setting('t.invitee')::uuid, 'add', 'member', true) $$,
  'a view link makes a view member; an invitee''s row becomes a member with the link''s role'
);
select is((select used_by from public.links where token_sha256 = current_setting('t.sha_inv_invitee')),
          current_setting('t.invitee')::uuid, 'an invitee joining by link uses the link up');

select tests.authenticate_as(current_setting('t.owner')::uuid);
select is(public.redeem_invite('inv_owner'), '00000000-0000-0000-0000-0000000008e1'::uuid,
          'the owner opening their own link gets the list');
select tests.authenticate_as(current_setting('t.member')::uuid);
select is(public.redeem_invite('inv_owner'), '00000000-0000-0000-0000-0000000008e1'::uuid,
          'a member opening a link gets the list');
reset role;
select results_eq(
  $$ select used_by, used_at, (select role from public.hit_list_members
                               where list_id = '00000000-0000-0000-0000-0000000008e1'
                                 and user_id = current_setting('t.member')::uuid)
     from public.links where token_sha256 = current_setting('t.sha_inv_owner') $$,
  $$ values (null::uuid, null::timestamptz, 'add') $$,
  'the owner and a member leave the link unused and the member''s role as it was'
);

select tests.authenticate_as(current_setting('t.stranger')::uuid);
select throws_ok($$ select public.redeem_invite('no_such_token') $$, '42501', 'invalid invite',
                 'an unknown invite raises invalid invite');
select throws_ok($$ select public.redeem_invite('inv_expired') $$, '42501', 'invalid invite',
                 'expired invite raises invalid invite');
select throws_ok($$ select public.redeem_invite('inv_revoked') $$, '42501', 'invalid invite',
                 'revoked invite raises invalid invite');
select throws_ok($$ select public.redeem_invite('inv_unshare') $$, '42501', 'invalid invite',
                 'an invite to a list that stopped sharing raises invalid invite');
select throws_ok($$ select public.redeem_invite('inv_deleted') $$, '42501', 'invalid invite',
                 'an invite to a deleted list raises invalid invite');
select throws_ok($$ select public.redeem_invite('send_live') $$, '42501', 'invalid invite',
                 'a send link is not an invite');
select throws_ok($$ select public.redeem_invite('inv_private') $$, '42501', 'invalid invite',
                 'an unrevoked invite to an unshared list raises invalid invite');
select throws_ok($$ select public.redeem_invite('inv_gone') $$, '42501', 'invalid invite',
                 'an unrevoked invite to a deleted list raises invalid invite');
select throws_ok($$ select public.redeem_invite(null) $$, '42501', 'invalid invite', 'a NULL token raises invalid invite');
select throws_ok(format('select public.redeem_invite(%L)', encode(extensions.digest('abc', 'sha256'), 'hex')),
                 '42501', 'invalid invite', 'redeem_invite takes the token, not its hash');
select tests.authenticate_as(current_setting('t.blocked')::uuid);
select throws_ok($$ select public.redeem_invite('inv_blocked') $$, '42501', 'invalid invite',
                 'blocked user cannot redeem invite');
select tests.authenticate_as(current_setting('t.blocker')::uuid);
select throws_ok($$ select public.redeem_invite('inv_blocked') $$, '42501', 'invalid invite',
                 'a user who blocked the owner cannot redeem their invite');
reset role;
select results_eq(
  $$ select l.used_at, (select count(*)::int from public.hit_list_members m
                        where m.user_id in (current_setting('t.blocked')::uuid, current_setting('t.blocker')::uuid))
     from public.links l where l.token_sha256 = current_setting('t.sha_inv_blocked') $$,
  $$ values (null::timestamptz, 0) $$,
  'the refused redeems left the link unused and made no member'
);

select tests.authenticate_as(current_setting('t.joiner')::uuid);
select lives_ok($$ select public.leave_list('00000000-0000-0000-0000-0000000008e1') $$, 'the joiner leaves');
select throws_ok($$ select public.redeem_invite('abc') $$, '42501', 'invalid invite',
                 'a redeemer who left cannot rejoin with the used link');
select tests.clear_auth();
select throws_ok($$ select public.redeem_invite('inv_long') $$, '42501', null, 'anon cannot redeem');
reset role;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok($$ select public.redeem_invite('inv_long') $$, '42501', 'not signed in',
                 'redeem_invite refuses a token without a user');
select throws_ok($$ select public.create_link('send', '00000000-0000-0000-0000-0000000008d1',
                                              current_setting('t.sha_refused'), null) $$, '42501', 'not signed in',
                 'create_link refuses a token without a user');
select throws_ok($$ select public.revoke_link(current_setting('t.link_revoked')::uuid) $$, '42501', 'not signed in',
                 'revoke_link refuses a token without a user');

-- Privileges ------------------------------------------------------------------------------------------------------
reset role;
select ok(not has_function_privilege('anon', p, 'execute'), 'anon cannot execute ' || p)
from unnest(array['public.create_link(text, uuid, text, timestamp with time zone, text)', 'public.revoke_link(uuid)',
                  'public.preview_link(text)', 'public.redeem_invite(text)', 'public.list_my_links(text)']) as p;
select ok(not has_function_privilege('authenticated', 'public.preview_link(text)', 'execute'),
          'authenticated cannot execute public.preview_link(text)');
select ok(has_function_privilege('service_role', 'public.preview_link(text)', 'execute'),
          'the service role executes public.preview_link(text)');

select * from finish();
rollback;
