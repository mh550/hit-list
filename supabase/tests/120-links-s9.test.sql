-- S9-02: list_my_links names who used an invite link (the members screen's 'Used by @ben',
-- docs/plans/2026-10-22-s9-links.md "Server"). The old columns stay as they were; the hash never shows; only the
-- creator lists a link; anon can't call it.
begin;
select plan(9);

select set_config('t.owner', tests.create_user('owner9@test.local', 'owner9')::text, true);
select set_config('t.ben', tests.create_user('ben9@test.local', 'ben9')::text, true);
select set_config('t.stranger', tests.create_user('stranger9@test.local', 'stranger9')::text, true);

insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at)
values ('00000000-0000-0000-0000-0000000009e1', current_setting('t.owner')::uuid, 'Downtown', 'manual', true,
        '2026-10-22T12:00:00Z');

select tests.authenticate_as(current_setting('t.owner')::uuid);
select set_config('t.used', public.create_link('invite', '00000000-0000-0000-0000-0000000009e1',
                                               encode(extensions.digest('used_token', 'sha256'), 'hex'),
                                               now() + interval '7 days', 'add')::text, true);
select set_config('t.unused', public.create_link('invite', '00000000-0000-0000-0000-0000000009e1',
                                                 encode(extensions.digest('unused_token', 'sha256'), 'hex'),
                                                 now() + interval '7 days', 'view')::text, true);

select tests.authenticate_as(current_setting('t.ben')::uuid);
select is(public.redeem_invite('used_token'), '00000000-0000-0000-0000-0000000009e1'::uuid, 'ben joins by the link');

select tests.authenticate_as(current_setting('t.owner')::uuid);
select is((select used_by from public.list_my_links('invite') where id = current_setting('t.used')::uuid),
          current_setting('t.ben')::uuid, 'a used invite link lists used_by');
select is((select used_by_username::text from public.list_my_links('invite')
           where id = current_setting('t.used')::uuid),
          'ben9', 'a used invite link lists the user''s username');
select is((select row(used_by, used_by_username)::text from public.list_my_links('invite')
           where id = current_setting('t.unused')::uuid),
          row(null::uuid, null::text)::text, 'an unused link has NULL used_by and used_by_username');
select is((select count(*)::int from public.list_my_links(null)), 2, 'the owner still lists both links');
select is(
  pg_get_function_result('public.list_my_links(text)'::regprocedure),
  'TABLE(id uuid, kind text, send_id uuid, list_id uuid, role text, created_at timestamp with time zone, '
  'expires_at timestamp with time zone, revoked_at timestamp with time zone, used_at timestamp with time zone, '
  'used_by uuid, used_by_username citext)',
  'list_my_links keeps the old columns and adds used_by, used_by_username (never the hash)'
);

select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select id from public.list_my_links(null) $$, 'another rider lists none of them');

reset role;
select ok(not has_function_privilege('anon', 'public.list_my_links(text)', 'execute'), 'anon can''t list links');
select ok(has_function_privilege('authenticated', 'public.list_my_links(text)', 'execute'),
          'a signed-in rider can list their links');

select * from finish();
rollback;
