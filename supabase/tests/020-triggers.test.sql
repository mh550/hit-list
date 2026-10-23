-- S3-02: the rev counter (one sequence for every synced table), the D48 updated_at guard, the profile-on-signup
-- trigger and the username rules (D39).
begin;
select plan(33);

-- Users (the profile trigger fires on the auth.users insert inside tests.create_user).
select set_config('t.owner', tests.create_user('owner@test.local')::text, true);
select set_config('t.other', tests.create_user('other@test.local')::text, true);

-- Profile on signup.
select is(
  (select count(*)::int from public.profiles where id = current_setting('t.owner')::uuid),
  1,
  'inserting into auth.users creates a profiles row'
);
select is(
  (select username::text from public.profiles where id = current_setting('t.owner')::uuid),
  null,
  'a new profile has username NULL'
);
select isnt(
  (select rev from public.profiles where id = current_setting('t.owner')::uuid),
  null,
  'a new profile gets a rev'
);

-- rev: as the service role (RLS bypassed).
select tests.authenticate_as_service_role();

insert into public.spots (id, owner_id, name, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000000b1', current_setting('t.owner')::uuid, 'Ledge', 47.6, -122.3,
        '2026-10-22T12:00:00Z');
select set_config('t.rev1', (select rev::text from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
                  true);
select isnt((select rev from public.spots where id = '00000000-0000-0000-0000-0000000000b1'), null,
            'a spot insert sets rev');

update public.spots set name = 'Big ledge', updated_at = '2026-10-22T12:05:00Z'
where id = '00000000-0000-0000-0000-0000000000b1';
select cmp_ok(
  (select rev from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
  '>',
  current_setting('t.rev1')::bigint,
  'a spot update bumps rev strictly'
);
select set_config('t.rev2', (select rev::text from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
                  true);

insert into public.hit_lists (id, owner_id, name, kind, updated_at)
values ('00000000-0000-0000-0000-0000000000c1', current_setting('t.owner')::uuid, 'Weekend', 'manual', now());
select cmp_ok(
  (select rev from public.hit_lists where id = '00000000-0000-0000-0000-0000000000c1'),
  '>',
  current_setting('t.rev2')::bigint,
  'rev is global: a hit_lists insert gets a rev greater than the last spots rev'
);

insert into public.media (id, spot_id, owner_id, storage_path, updated_at)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1',
        current_setting('t.owner')::uuid, 'x/y/z.jpg', now());
select isnt((select rev from public.media where id = '00000000-0000-0000-0000-0000000000d1'), null,
            'a media insert sets rev');
insert into public.hit_list_spots (list_id, spot_id, added_by)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
        current_setting('t.owner')::uuid);
select isnt((select rev from public.hit_list_spots where list_id = '00000000-0000-0000-0000-0000000000c1'), null,
            'a hit_list_spots insert sets rev');
insert into public.hit_list_members (list_id, user_id)
values ('00000000-0000-0000-0000-0000000000c1', current_setting('t.other')::uuid);
select isnt((select rev from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000000c1'), null,
            'a hit_list_members insert sets rev');

-- D48: an update older than the stored row is skipped and does not bump rev (the guard runs before the rev
-- trigger, so it doesn't even take a number from the sequence).
reset role; -- no client role may read sync_rev
select set_config('t.seq', (select last_value::text from public.sync_rev), true);
select tests.authenticate_as_service_role();
update public.spots set name = 'Stale name', updated_at = '2026-10-22T12:01:00Z'
where id = '00000000-0000-0000-0000-0000000000b1';
select is(
  (select name from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
  'Big ledge',
  'an update with an older updated_at leaves the row unchanged'
);
select is(
  (select rev from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
  current_setting('t.rev2')::bigint,
  'an update with an older updated_at does not bump rev'
);
reset role;
select is((select last_value from public.sync_rev), current_setting('t.seq')::bigint,
          'a skipped update takes no number from sync_rev');
select tests.authenticate_as_service_role();

update public.media set storage_path = 'stale', updated_at = now() - interval '1 day'
where id = '00000000-0000-0000-0000-0000000000d1';
select is((select storage_path from public.media where id = '00000000-0000-0000-0000-0000000000d1'), 'x/y/z.jpg',
          'a stale media update is skipped');
update public.hit_lists set name = 'Stale', updated_at = now() - interval '1 day'
where id = '00000000-0000-0000-0000-0000000000c1';
select is((select name from public.hit_lists where id = '00000000-0000-0000-0000-0000000000c1'), 'Weekend',
          'a stale hit_lists update is skipped');
update public.spots set name = 'Same time', updated_at = '2026-10-22T12:05:00Z'
where id = '00000000-0000-0000-0000-0000000000b1';
select is(
  (select name from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
  'Same time',
  'an update with an equal updated_at is applied'
);
select set_config('t.rev3', (select rev::text from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
                  true);
update public.spots set deleted_at = '2026-10-22T12:10:00Z', updated_at = '2026-10-22T12:10:00Z'
where id = '00000000-0000-0000-0000-0000000000b1';
select cmp_ok(
  (select rev from public.spots where id = '00000000-0000-0000-0000-0000000000b1'),
  '>',
  current_setting('t.rev3')::bigint,
  'a soft delete bumps rev'
);

reset role;

-- Every synced table has the rev trigger (insert and update); spots, media and hit_lists have the stale guard.
select trigger_is('public', t, 't20_rev', 'public', 'bump_rev', t || ' has t20_rev')
from unnest(array['profiles', 'spots', 'media', 'hit_lists', 'hit_list_spots', 'hit_list_members']) as t;
select trigger_is('public', t, 't10_stale_guard', 'public', 'skip_stale_update', t || ' has t10_stale_guard')
from unnest(array['spots', 'media', 'hit_lists']) as t;
select set_config('t.prof_rev', (select rev::text from public.profiles where id = current_setting('t.owner')::uuid),
                  true);
update public.profiles set display_name = 'Owner' where id = current_setting('t.owner')::uuid;
select cmp_ok((select rev from public.profiles where id = current_setting('t.owner')::uuid), '>',
              current_setting('t.prof_rev')::bigint, 'a profile update bumps rev');
select set_config('t.hlm_rev', (select rev::text from public.hit_list_members
                                where list_id = '00000000-0000-0000-0000-0000000000c1'), true);
update public.hit_list_members set status = 'member' where list_id = '00000000-0000-0000-0000-0000000000c1';
select cmp_ok((select rev from public.hit_list_members where list_id = '00000000-0000-0000-0000-0000000000c1'), '>',
              current_setting('t.hlm_rev')::bigint, 'a hit_list_members update bumps rev');

-- Usernames (D39): 3–20 of letters, digits, '_' and '.', unique case-insensitively.
select throws_ok(
  format('update public.profiles set username = %L where id = %L', 'Ab', current_setting('t.owner')),
  '23514', null, 'username Ab (too short) is rejected'
);
select throws_ok(
  format('update public.profiles set username = %L where id = %L', 'a-b', current_setting('t.owner')),
  '23514', null, 'username a-b (hyphen) is rejected'
);
select throws_ok(
  format('update public.profiles set username = %L where id = %L', repeat('a', 21), current_setting('t.owner')),
  '23514', null, 'a 21-char username is rejected'
);
select lives_ok(
  format('update public.profiles set username = %L where id = %L', 'rider_1.a', current_setting('t.owner')),
  'username rider_1.a is accepted'
);
select lives_ok(
  format('update public.profiles set username = %L where id = %L', 'abc', current_setting('t.other')),
  'username abc is accepted'
);
select throws_ok(
  format('update public.profiles set username = %L where id = %L', 'ABC', current_setting('t.owner')),
  '23505', null, 'username ABC is rejected when abc exists (citext unique)'
);

select * from finish();
rollback;
