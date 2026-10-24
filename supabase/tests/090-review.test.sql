-- S3-08: the milestone review's written answers, each proved here over the catalog (so a later migration that breaks
-- one fails this file) or by behaviour: definer functions, no RLS recursion, can_read_spot's indexes, the rev
-- triggers and soft deletes, and what anon can execute. The storage path parser is proved in 070
-- ('photo_path_ok accepts only three-segment …', 'a path with fewer than three segments is refused').
begin;
select plan(31);

-- 1. Every security definer function pins search_path and checks the caller.
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not coalesce(p.proconfig @> array['search_path=""'], false) $$,
  'every security definer function in public pins search_path to empty'
);
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and has_function_privilege('authenticated', p.oid, 'execute')
       and position('auth.uid()' in regexp_replace(p.prosrc, '--[^\n]*', '', 'g')) = 0 $$,
  'every security definer function a signed-in client can call checks auth.uid()'
);
select results_eq(
  $$ select p.proname::text collate "default" from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef
       and not has_function_privilege('authenticated', p.oid, 'execute')
       and p.prorettype <> 'trigger'::regtype
     order by 1 $$,
  $$ values ('lock_user_pair') $$,
  'the only definer function no client calls that is not a trigger is lock_user_pair'
);
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)) $$,
  'no function in public is executable by PUBLIC'
);

-- 2. No RLS recursion: a policy reads another table only through a definer helper, except the insert/update checks
-- that read spots, and no spots policy reads a table.
select results_eq(
  $$ select distinct lower(m[2]) collate "default" from pg_policies pol,
       regexp_matches(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''), '(FROM|JOIN)\s+([a-z_.]+)', 'gi') m
     where pol.schemaname in ('public', 'storage') order by 1 $$,
  $$ values ('spots') $$,
  'the only table a policy reads directly is spots'
);
select is_empty(
  $$ select pol.policyname from pg_policies pol
     where pol.schemaname = 'public' and pol.tablename = 'spots'
       and coalesce(pol.qual, '') || coalesce(pol.with_check, '') ~* '(from|join)\s' $$,
  'no spots policy reads another table'
);

-- A member of a shared list reads every policy table without a recursion error.
select set_config('t.owner', tests.create_user('owner9@test.local', 'owner9')::text, true);
select set_config('t.member', tests.create_user('member9@test.local', 'member9')::text, true);
insert into public.spots (id, owner_id, name, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000009b1', current_setting('t.owner')::uuid, 'Rail', 47.6, -122.3, now());
insert into public.media (id, spot_id, owner_id, updated_at)
values ('00000000-0000-0000-0000-0000000009c1', '00000000-0000-0000-0000-0000000009b1',
        current_setting('t.owner')::uuid, now());
insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at)
values ('00000000-0000-0000-0000-0000000009d1', current_setting('t.owner')::uuid, 'Shared', 'manual', true, now());
insert into public.hit_list_spots (list_id, spot_id, added_by)
values ('00000000-0000-0000-0000-0000000009d1', '00000000-0000-0000-0000-0000000009b1',
        current_setting('t.owner')::uuid);
insert into public.hit_list_members (list_id, user_id, role, status, invited_by, joined_at)
values ('00000000-0000-0000-0000-0000000009d1', current_setting('t.member')::uuid, 'view', 'member',
        current_setting('t.owner')::uuid, now());

select tests.authenticate_as(current_setting('t.member')::uuid);
select results_eq(
  $$ select (select count(*) from public.profiles)::int, (select count(*) from public.hit_lists)::int,
            (select count(*) from public.hit_list_members)::int, (select count(*) from public.hit_list_spots)::int,
            (select count(*) from public.spots)::int, (select count(*) from public.media)::int $$,
  $$ values (2, 1, 1, 1, 1, 1) $$,
  'a member reads profiles, the list, its members, rows, spot and photo with no recursion'
);
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq(
  $$ select (select count(*) from public.profiles)::int, (select count(*) from public.hit_list_members)::int $$,
  $$ values (2, 1) $$,
  'the owner reads the member''s profile and membership with no recursion'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- 3. can_read_spot is STABLE and its shared-list lookup uses indexes. The plan is of the function's own body (taken
-- from pg_proc, parameters bound as literals), with sequential scans priced out so a missing index would show up.
select volatility_is('public', 'can_read_spot', array['uuid', 'uuid'], 'stable', 'can_read_spot is STABLE');
select is_indexed('public', 'hit_list_spots', array['spot_id'], 'hit_list_spots has an index on spot_id');
select col_is_pk('public', 'hit_list_members', array['list_id', 'user_id'],
                 'hit_list_members is keyed by (list_id, user_id)');
select is_indexed('public', 'hit_list_members', array['user_id', 'list_id'],
                  'hit_list_members has an index on (user_id, list_id)');

create function pg_temp.can_read_spot_plan() returns setof text language plpgsql as $f$
declare
  body text;
  r text;
begin
  select replace(replace(p.prosrc, 'p_spot_id', quote_literal('00000000-0000-0000-0000-0000000009b1') || '::uuid'),
                 'p_uid', quote_literal(current_setting('t.member')) || '::uuid')
    into body from pg_proc p where p.oid = 'public.can_read_spot(uuid, uuid)'::regprocedure;
  for r in execute 'explain (costs off) ' || body loop
    return next r;
  end loop;
end
$f$;
set local enable_seqscan = off;
select set_config('t.plan', (select string_agg(l, E'\n') from pg_temp.can_read_spot_plan() l), true);
reset enable_seqscan;
select unalike(current_setting('t.plan'), '%Seq Scan%', 'can_read_spot''s plan has no sequential scan');
select matches(current_setting('t.plan'), 'Index Scan using spots_pkey on spots',
               'can_read_spot finds the spot by its primary key');
select matches(current_setting('t.plan'), '(Index Scan using|Index Only Scan using|Bitmap Index Scan on) hit_list_spots_spot_idx',
               'can_read_spot finds the spot''s list rows by hit_list_spots(spot_id)');
select matches(current_setting('t.plan'), '(Index Scan using|Index Only Scan using|Bitmap Index Scan on) hit_list_members_(pkey|user_idx)',
               'can_read_spot finds memberships by an index on hit_list_members (list_id, user_id)');

-- 4. One rev trigger, BEFORE INSERT OR UPDATE FOR EACH ROW on any column, on every synced table, and soft deletes
-- bump it.
select results_eq(
  $$ select c.relname::text collate "default" from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where t.tgname = 't20_rev' and t.tgfoid = 'public.bump_rev()'::regprocedure
       and (t.tgtype & 31) = 23 and cardinality(t.tgattr::int2[]) = 0 and t.tgenabled = 'O'
     order by 1 $$,
  $$ values ('hit_list_members'), ('hit_list_spots'), ('hit_lists'), ('media'), ('profiles'), ('spots') $$,
  'every synced table has t20_rev BEFORE INSERT OR UPDATE FOR EACH ROW on any column'
);
select is_empty(
  $$ select tgname from pg_trigger where tgfoid = 'public.bump_rev()'::regprocedure and tgname <> 't20_rev' $$,
  'bump_rev is used by no other trigger'
);

select set_config('t.media_rev', (select rev::text from public.media where id = '00000000-0000-0000-0000-0000000009c1'),
                  true);
update public.media set deleted_at = now() + interval '1 minute', updated_at = now() + interval '1 minute'
where id = '00000000-0000-0000-0000-0000000009c1';
select cmp_ok((select rev from public.media where id = '00000000-0000-0000-0000-0000000009c1'), '>',
              current_setting('t.media_rev')::bigint, 'a photo soft delete bumps rev');
select set_config('t.list_rev', (select rev::text from public.hit_lists where id = '00000000-0000-0000-0000-0000000009d1'),
                  true);
update public.hit_lists set deleted_at = now() + interval '1 minute', updated_at = now() + interval '1 minute'
where id = '00000000-0000-0000-0000-0000000009d1';
select cmp_ok((select rev from public.hit_lists where id = '00000000-0000-0000-0000-0000000009d1'), '>',
              current_setting('t.list_rev')::bigint, 'a list soft delete bumps rev');
select set_config('t.spot_rev', (select rev::text from public.spots where id = '00000000-0000-0000-0000-0000000009b1'),
                  true);
update public.spots set deleted_at = now() + interval '1 minute', updated_at = now() + interval '1 minute'
where id = '00000000-0000-0000-0000-0000000009b1';
select cmp_ok((select rev from public.spots where id = '00000000-0000-0000-0000-0000000009b1'), '>',
              current_setting('t.spot_rev')::bigint, 'a spot soft delete bumps rev');

-- 5. anon: executes no function in public (also 010), and the two link entry points refuse it.
select is_empty(
  $$ select p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon executes no function in public'
);
select ok(not has_function_privilege('authenticated', 'public.preview_link(text)', 'execute')
          and has_function_privilege('service_role', 'public.preview_link(text)', 'execute'),
          'preview_link is executable by the service role only');
select tests.clear_auth();
select throws_ok($$ select public.redeem_invite('any-token') $$, '42501', null, 'anon cannot redeem an invite');

-- Every action a client calls refuses a token without a user (role authenticated, no sub), not just anon (which fails
-- on EXECUTE first). Each one is called with NULL arguments; anything but 42501 'not signed in' is listed.
create function pg_temp.actions_without_user() returns setof text language plpgsql as $f$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.oid::regproc::text as fn,
           (select string_agg('null::' || format_type(t, null), ', ' order by o)
              from unnest(p.proargtypes::oid[]) with ordinality as a(t, o)) as args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.provolatile = 'v'
      and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')
  loop
    begin
      execute format('select %s(%s)', f.fn, coalesce(f.args, ''));
      return next f.sig::text || ': no error';
    exception when others then
      if sqlstate <> '42501' or sqlerrm <> 'not signed in' then
        return next f.sig::text || ': ' || sqlstate || ' ' || sqlerrm;
      end if;
    end;
  end loop;
end
$f$;
select set_config('role', 'authenticated', true);
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select is_empty($$ select * from pg_temp.actions_without_user() $$,
                'every client action raises not signed in for a token without a user');
reset role;
select set_config('request.jwt.claims', '', true);

-- seed.sql's helpers: tests.create_user writes auth.users as its definer, so no client role may call it.
select ok(not has_function_privilege('anon', 'tests.create_user(text, text)', 'execute')
          and not has_function_privilege('authenticated', 'tests.create_user(text, text)', 'execute'),
          'no client role executes tests.create_user');

-- Review fixes (S3-08). D50: an invitation that outlived its friendship (an invite racing Remove friend) still goes
-- when either rider blocks the other, and a blocked pair can't Join.
select set_config('t.rider', tests.create_user('rider9@test.local', 'rider9')::text, true);
select set_config('t.rider2', tests.create_user('rider9b@test.local', 'rider9b')::text, true);
insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at)
values ('00000000-0000-0000-0000-0000000009d2', current_setting('t.owner')::uuid, 'Second', 'manual', true, now());
insert into public.hit_list_members (list_id, user_id, role, status, invited_by)
values ('00000000-0000-0000-0000-0000000009d2', current_setting('t.rider')::uuid, 'add', 'invited',
        current_setting('t.owner')::uuid),
       ('00000000-0000-0000-0000-0000000009d2', current_setting('t.rider2')::uuid, 'add', 'invited',
        current_setting('t.owner')::uuid);
select tests.authenticate_as(current_setting('t.owner')::uuid);
select public.block_user(current_setting('t.rider')::uuid);
reset role;
select is_empty(
  $$ select 1 from public.hit_list_members
     where list_id = '00000000-0000-0000-0000-0000000009d2' and user_id = current_setting('t.rider')::uuid $$,
  'block_user withdraws an invitation between the pair even with no friendship'
);
insert into public.blocks (blocker, blocked) values (current_setting('t.rider2')::uuid, current_setting('t.owner')::uuid);
select tests.authenticate_as(current_setting('t.rider2')::uuid);
select throws_ok(
  $$ update public.hit_list_members set status = 'member'
     where list_id = '00000000-0000-0000-0000-0000000009d2' and user_id = current_setting('t.rider2')::uuid $$,
  '42501', null, 'a blocked pair cannot Join through an invitation left from before the block'
);

-- media.uploaded_by names the uploader: the owner can't put someone else's id there.
select tests.authenticate_as(current_setting('t.owner')::uuid);
insert into public.spots (id, owner_id, name, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000009b2', current_setting('t.owner')::uuid, 'Bank', 47.6, -122.3, now());
select throws_ok(
  $$ insert into public.media (id, spot_id, owner_id, uploaded_by, updated_at)
     values ('00000000-0000-0000-0000-0000000009c2', '00000000-0000-0000-0000-0000000009b2',
             current_setting('t.owner')::uuid, current_setting('t.member')::uuid, now()) $$,
  '42501', null, 'owner cannot insert a photo uploaded_by someone else'
);
select lives_ok(
  $$ insert into public.media (id, spot_id, owner_id, uploaded_by, updated_at)
     values ('00000000-0000-0000-0000-0000000009c3', '00000000-0000-0000-0000-0000000009b2',
             current_setting('t.owner')::uuid, current_setting('t.owner')::uuid, now()) $$,
  'owner inserts a photo uploaded_by themselves'
);
select throws_ok(
  $$ update public.media set uploaded_by = current_setting('t.member')::uuid, updated_at = now() + interval '2 minutes'
     where id = '00000000-0000-0000-0000-0000000009c3' $$,
  '42501', null, 'owner cannot set a photo''s uploaded_by to someone else'
);
reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
