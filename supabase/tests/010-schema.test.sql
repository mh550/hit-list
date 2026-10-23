-- S3-02: every §3.2 table exists with RLS on (no policies yet = deny all), the extensions, the generated geog.
begin;
select plan(26);

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

select has_extension('extensions', 'postgis', 'postgis is installed in extensions');
select has_extension('extensions', 'citext', 'citext is installed in extensions');
select has_sequence('public', 'sync_rev', 'sync_rev sequence exists');

select is(
  (select format_type(atttypid, atttypmod) from pg_attribute
   where attrelid = to_regclass('public.spots') and attname = 'geog'),
  'extensions.geography(Point,4326)',
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

select * from finish();
rollback;
