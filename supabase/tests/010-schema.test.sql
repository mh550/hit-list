-- S3-02: every §3.2 table exists with RLS on (no policies yet = deny all), the extensions, the generated geog.
begin;
select plan(39);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'spots', 'spots exists');
select has_table('public', 'media', 'media exists');
select has_table('public', 'hit_lists', 'hit_lists exists');
select has_table('public', 'hit_list_spots', 'hit_list_spots exists');
select has_table('public', 'hit_list_members', 'hit_list_members exists');
select has_table('public', 'friendships', 'friendships exists');
select has_table('public', 'blocks', 'blocks exists');
select has_table('public', 'sends', 'sends exists');
select has_table('public', 'links', 'links exists');

select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false),
          t || ' has RLS enabled')
from unnest(array['profiles', 'spots', 'media', 'hit_lists', 'hit_list_spots', 'hit_list_members', 'friendships',
                  'blocks', 'sends', 'links']) as t;

-- Deny all: no policy on a table until its feature's migration (spots and media: S3-03, 030-spots-rls; the three
-- list tables: S3-04, 040-lists-rls; profiles, friendships and blocks: S3-05, 050-friends-rls).
select policies_are('public', t, '{}'::name[], t || ' has no policies')
from unnest(array['sends', 'links']) as t;

-- Privileges: nobody but the trigger can move the pull cursor; anon/authenticated can't TRUNCATE (RLS doesn't cover
-- it), now or for a later table; a later function starts with no EXECUTE for anon or authenticated.
select sequence_privs_are('public', 'sync_rev', 'authenticated', '{}'::text[],
                          'authenticated has no privilege on sync_rev');
select sequence_privs_are('public', 'sync_rev', 'anon', '{}'::text[], 'anon has no privilege on sync_rev');
create table public.zz_probe_table (id int);
create function public.zz_probe_fn() returns int language sql as 'select 1';
select ok(not has_table_privilege('authenticated', 'public.spots', 'truncate'), 'authenticated cannot truncate spots');
select ok(not has_table_privilege('authenticated', 'public.zz_probe_table', 'truncate'),
          'authenticated cannot truncate a later table');
select ok(not has_function_privilege('anon', 'public.zz_probe_fn()', 'execute'),
          'anon cannot execute a later function');
select ok(not has_function_privilege('authenticated', 'public.zz_probe_fn()', 'execute'),
          'authenticated cannot execute a later function');
select ok(not exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
                      and has_function_privilege('anon', oid, 'execute')),
          'anon executes no function in public');

select has_extension('extensions', 'postgis', 'postgis is installed in extensions');
select has_extension('extensions', 'citext', 'citext is installed in extensions');
select has_sequence('public', 'sync_rev', 'sync_rev sequence exists');

select is(
  -- format_type qualifies the name only when extensions is off the search_path.
  (select regexp_replace(format_type(atttypid, atttypmod), '^extensions\.', '') from pg_attribute
   where attrelid = to_regclass('public.spots') and attname = 'geog'),
  'geography(Point,4326)',
  'spots.geog is geography(Point,4326)'
);
select is(
  (select attgenerated::text from pg_attribute where attrelid = to_regclass('public.spots') and attname = 'geog'),
  's',
  'spots.geog is a stored generated column'
);

-- A spot's geog equals ST_MakePoint(lng, lat).
insert into public.spots (id, owner_id, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000000a1', tests.create_user('geo@test.local'), 47.6097, -122.3331, now());
select ok(
  (select extensions.st_equals(geog::extensions.geometry,
                               extensions.st_setsrid(extensions.st_makepoint(-122.3331, 47.6097), 4326))
   from public.spots where id = '00000000-0000-0000-0000-0000000000a1'),
  'spots.geog equals ST_MakePoint(lng, lat)'
);

-- A manual list carries no area columns; an area list needs centre and radius.
select throws_ok(
  $$insert into public.hit_lists (id, owner_id, name, kind, area_radius_m, updated_at)
    select gen_random_uuid(), owner_id, 'M', 'manual', 500, now() from public.spots limit 1$$,
  '23514', null, 'a manual list with an area radius is rejected'
);
select throws_ok(
  $$insert into public.hit_lists (id, owner_id, name, kind, area_center_lat, updated_at)
    select gen_random_uuid(), owner_id, 'M', 'manual', 47.6, now() from public.spots limit 1$$,
  '23514', null, 'a manual list with only a centre latitude is rejected'
);
select throws_ok(
  $$insert into public.hit_lists (id, owner_id, name, kind, area_center_lat, area_center_lng, updated_at)
    select gen_random_uuid(), owner_id, 'A', 'area', 47.6, -122.3, now() from public.spots limit 1$$,
  '23514', null, 'an area list without a radius is rejected'
);
select lives_ok(
  $$insert into public.hit_lists (id, owner_id, name, kind, area_center_lat, area_center_lng, area_radius_m,
                                  area_filters, area_place, updated_at)
    select gen_random_uuid(), owner_id, 'A', 'area', 47.6, -122.3, 3219, '{}', 'Capitol Hill', now()
    from public.spots limit 1$$,
  'an area list with centre, radius, filters and place is accepted'
);

select * from finish();
rollback;
