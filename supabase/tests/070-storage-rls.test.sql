-- S3-06: the private photos bucket. A spot's photo '<owner>/<spot>/<media>.jpg' is read by whoever reads the spot
-- (can_read_spot) while the photo is live; a send's photo 'sends/<send>/<media>.jpg' by whoever reads the send. Writes
-- land only under the writer's own spot or send. Rows are inserted into storage.objects as the users, as the Storage
-- API does. §3.3 cases; the Case table in docs/plans/2026-10-22-s3-backend.md names each test.
begin;
select plan(47);

-- People ----------------------------------------------------------------------------------------------------------
select set_config('t.owner', tests.create_user('owner@test.local', 'owner')::text, true);
select set_config('t.member', tests.create_user('member@test.local', 'member')::text, true);
select set_config('t.stranger', tests.create_user('stranger@test.local', 'stranger')::text, true);
select set_config('t.sender', tests.create_user('sender@test.local', 'sender')::text, true);
select set_config('t.rec', tests.create_user('rec@test.local', 'recipient')::text, true);
select set_config('t.third', tests.create_user('third@test.local', 'third')::text, true);

-- Spots: b1 (owner, in shared list 'Crew' where member is a member), b2 (owner, in no list), b3 (stranger's).
insert into public.spots (id, owner_id, lat, lng, updated_at)
values ('00000000-0000-0000-0000-0000000000b1', current_setting('t.owner')::uuid, 47.6, -122.3, now()),
       ('00000000-0000-0000-0000-0000000000b2', current_setting('t.owner')::uuid, 47.6, -122.3, now()),
       ('00000000-0000-0000-0000-0000000000b3', current_setting('t.stranger')::uuid, 47.6, -122.3, now());
-- Photos: c1 live and c2 removed (soft-deleted) on b1, c3 on b2.
insert into public.media (id, spot_id, owner_id, updated_at, deleted_at)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1',
        current_setting('t.owner')::uuid, now(), null),
       ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1',
        current_setting('t.owner')::uuid, now(), now()),
       ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b2',
        current_setting('t.owner')::uuid, now(), null);
insert into public.hit_lists (id, owner_id, name, kind, shared, updated_at)
values ('00000000-0000-0000-0000-0000000000d1', current_setting('t.owner')::uuid, 'Crew', 'manual', true, now());
insert into public.hit_list_spots (list_id, spot_id, added_by)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1',
        current_setting('t.owner')::uuid);
insert into public.hit_list_members (list_id, user_id, role, status)
values ('00000000-0000-0000-0000-0000000000d1', current_setting('t.member')::uuid, 'add', 'member');
-- Sends: e1 sender → recipient (live), e2 sender → recipient (withdrawn), e3 sender → recipient (saved).
insert into public.sends (id, sender, recipient, payload, withdrawn_at, saved_at)
values ('00000000-0000-0000-0000-0000000000e1', current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
        '{}', null, null),
       ('00000000-0000-0000-0000-0000000000e2', current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
        '{}', now(), null),
       ('00000000-0000-0000-0000-0000000000e3', current_setting('t.sender')::uuid, current_setting('t.rec')::uuid,
        '{}', null, now());
-- Objects written past the policies (as postgres): photos of the withdrawn and the saved send, a stray object under the
-- stranger's prefix that names the owner's spot, a four-segment name under the owner's prefix that would parse as
-- c1's photo, and the owner's path in another bucket.
insert into storage.objects (bucket_id, name)
values ('photos', 'sends/00000000-0000-0000-0000-0000000000e2/00000000-0000-0000-0000-0000000000f2.jpg'),
       ('photos', 'sends/00000000-0000-0000-0000-0000000000e3/00000000-0000-0000-0000-0000000000f6.jpg'),
       ('photos', current_setting('t.stranger') || '/00000000-0000-0000-0000-0000000000b1/'
                  || '00000000-0000-0000-0000-0000000000c1.jpg'),
       ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                  || '00000000-0000-0000-0000-0000000000c1.jpg/x');
insert into storage.buckets (id, name, public) values ('zz_other', 'zz_other', false);
insert into storage.objects (bucket_id, name)
values ('zz_other', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                    || '00000000-0000-0000-0000-0000000000c1.jpg');

-- The bucket -------------------------------------------------------------------------------------------------------
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'photos' $$,
                  $$ values (false, 10485760::bigint, array['image/jpeg']) $$,
                  'the photos bucket exists, private, JPEG only, 10 MB');

-- The path parser: exactly '<uuid>/<uuid>/<uuid>.jpg' or 'sends/<uuid>/<uuid>.jpg'.
select results_eq(
  $$ select n, public.photo_path_ok(n) from (values
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/x/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.png'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg/x'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/photo.jpg'),
       ('00000000-0000-0000-0000-0000000000a1/spot/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('owner/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000A1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('SENDS/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/'),
       (''),
       (null)
     ) as v(n) $$,
  $$ values
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg', true),
       ('sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000c1.jpg', true),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/x/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.png', false),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg/x', false),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/photo.jpg', false),
       ('00000000-0000-0000-0000-0000000000a1/spot/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('owner/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('00000000-0000-0000-0000-0000000000A1/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('SENDS/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000c1.jpg', false),
       ('00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000b1/', false),
       ('', false),
       (null::text, false) $$,
  'photo_path_ok accepts only three-segment <uuid>/<uuid>/<uuid>.jpg and sends/<uuid>/<uuid>.jpg paths, lowercase'
);
select is(public.try_uuid('not a uuid'), null, 'try_uuid returns NULL for text that is not a uuid');

-- Spot photos: writes -----------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     select 'photos', current_setting('t.owner') || '/' || s || '/' || m || '.jpg'
     from (values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1'),
                  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2'),
                  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3')) as v(s, m) $$,
  'owner uploads photos of their own spots'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c9.jpg') $$,
  'owner uploads a photo before its media row exists'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b3/'
                       || '00000000-0000-0000-0000-0000000000c8.jpg') $$,
  '42501', null, 'owner cannot upload under their prefix for a spot they do not own'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.stranger') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c8.jpg') $$,
  '42501', null, 'owner cannot upload under someone else''s prefix, even for their own spot'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000c8.jpg') $$,
  '42501', null, 'a path with fewer than three segments is refused'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/x/'
                       || '00000000-0000-0000-0000-0000000000c8.jpg') $$,
  '42501', null, 'a path with four segments is refused'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('zz_other', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                         || '00000000-0000-0000-0000-0000000000c8.jpg') $$,
  '42501', null, 'nobody writes to another bucket'
);
select throws_ok(
  $$ update storage.objects set name = current_setting('t.stranger') || '/00000000-0000-0000-0000-0000000000b1/'
                                       || '00000000-0000-0000-0000-0000000000c3.jpg'
     where name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b2/'
                  || '00000000-0000-0000-0000-0000000000c3.jpg' $$,
  '42501', null, 'owner cannot move a photo object under someone else''s prefix'
);
select throws_ok(
  $$ update storage.objects set name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b3/'
                                       || '00000000-0000-0000-0000-0000000000c3.jpg'
     where name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b2/'
                  || '00000000-0000-0000-0000-0000000000c3.jpg' $$,
  '42501', null, 'owner cannot move a photo object to a spot they do not own'
);
select results_eq(
  $$ insert into storage.objects (bucket_id, name, metadata)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c1.jpg', '{"v": 1}')
     on conflict (bucket_id, name collate "C", version) do update set metadata = excluded.metadata
     returning metadata $$,
  $$ values ('{"v": 1}'::jsonb) $$,
  'owner overwrites their own photo object (upsert)'
);
select results_eq(
  $$ update storage.objects set name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b2/'
                                       || '00000000-0000-0000-0000-0000000000c9.jpg'
     where name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                  || '00000000-0000-0000-0000-0000000000c9.jpg'
     returning name $$,
  $$ values (current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b2/'
             || '00000000-0000-0000-0000-0000000000c9.jpg') $$,
  'owner moves a photo object between their own spots'
);
update storage.objects set name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                                  || '00000000-0000-0000-0000-0000000000c9.jpg'
where name = current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b2/'
             || '00000000-0000-0000-0000-0000000000c9.jpg';

select tests.authenticate_as(current_setting('t.stranger')::uuid);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c7.jpg') $$,
  '42501', null, 'stranger cannot upload under the owner''s prefix'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.stranger') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c7.jpg') $$,
  '42501', null, 'stranger cannot upload under their own prefix for the owner''s spot'
);

-- Spot photos: reads ----------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq(
  $$ select name from storage.objects order by name $$,
  $$ select current_setting('t.owner') || n from (values
       ('/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c1.jpg'),
       ('/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c2.jpg'),
       ('/00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-0000000000c9.jpg'),
       ('/00000000-0000-0000-0000-0000000000b2/00000000-0000-0000-0000-0000000000c3.jpg')) as v(n) order by 1 $$,
  'owner reads exactly their own photo objects, removed photos and not-yet-recorded ones included'
);

select tests.authenticate_as(current_setting('t.member')::uuid);
select results_eq(
  $$ select name from storage.objects $$,
  $$ values (current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
             || '00000000-0000-0000-0000-0000000000c1.jpg') $$,
  'member reads exactly the live photo objects of spots they can read'
);
select is_empty($$ select name from storage.objects where name like '%/00000000-0000-0000-0000-0000000000b2/%' $$,
                'member reads no photo object of a spot they cannot read');
select is_empty($$ select name from storage.objects where name like '%/00000000-0000-0000-0000-0000000000c2.jpg' $$,
                'member reads no object of a removed photo');
select is_empty($$ select name from storage.objects where name like '%/00000000-0000-0000-0000-0000000000c9.jpg' $$,
                'member reads no object without a media row');
select is_empty($$ select name from storage.objects where name like current_setting('t.stranger') || '/%' $$,
                'member reads no object whose prefix is not the spot owner''s');
select is_empty($$ update storage.objects set metadata = '{"x": 1}' where name like '%/00000000-0000-0000-0000-0000000000c1.jpg'
                   returning name $$,
                'member cannot overwrite the owner''s photo object');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c6.jpg') $$,
  '42501', null, 'member cannot upload a photo to the owner''s spot'
);
select set_config('storage.allow_delete_query', 'true', true);
select is_empty($$ delete from storage.objects where name like '%/00000000-0000-0000-0000-0000000000c1.jpg' returning name $$,
                'member cannot delete the owner''s photo object');

select tests.authenticate_as(current_setting('t.stranger')::uuid);
select is_empty($$ select name from storage.objects where bucket_id = 'photos' and name not like current_setting('t.stranger') || '/%' $$,
                'stranger reads no photo object');
reset role;
select tests.clear_auth();
select is_empty($$ select name from storage.objects $$, 'anon reads no photo object');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
                       || '00000000-0000-0000-0000-0000000000c5.jpg') $$,
  '42501', null, 'anon cannot upload a photo'
);
reset role;

-- The owner deletes their own object (the Storage API sets storage.allow_delete_query for its deletes).
select tests.authenticate_as(current_setting('t.owner')::uuid);
select results_eq(
  $$ delete from storage.objects where name like '%/00000000-0000-0000-0000-0000000000c9.jpg' returning name $$,
  $$ values (current_setting('t.owner') || '/00000000-0000-0000-0000-0000000000b1/'
             || '00000000-0000-0000-0000-0000000000c9.jpg') $$,
  'owner deletes their own photo object'
);

-- Removed member loses read immediately, photos included.
reset role;
delete from public.hit_list_members
where list_id = '00000000-0000-0000-0000-0000000000d1' and user_id = current_setting('t.member')::uuid;
select tests.authenticate_as(current_setting('t.member')::uuid);
select is_empty($$ select name from storage.objects $$, 'removed member reads no photo object');

-- Send photos -------------------------------------------------------------------------------------------------------
select tests.authenticate_as(current_setting('t.sender')::uuid);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000f1.jpg') $$,
  'the sender uploads a photo into their send'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000000e2/00000000-0000-0000-0000-0000000000f3.jpg') $$,
  '42501', null, 'the sender cannot upload into a withdrawn send'
);
-- S7 (D77): a photo is staged under a send id before the send exists, owned by its stager (100-sends-s7).
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-00000000dead/00000000-0000-0000-0000-0000000000f3.jpg') $$,
  '42501', null, 'nobody uploads into a send that does not exist without owning the object'
);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('photos', 'sends/00000000-0000-0000-0000-00000000dead/00000000-0000-0000-0000-0000000000f3.jpg',
             current_setting('t.sender')) $$,
  'a rider stages a photo for a send id nobody has used'
);
select results_eq(
  $$ select name from storage.objects order by name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000f1.jpg'),
            ('sends/00000000-0000-0000-0000-0000000000e2/00000000-0000-0000-0000-0000000000f2.jpg'),
            ('sends/00000000-0000-0000-0000-0000000000e3/00000000-0000-0000-0000-0000000000f6.jpg'),
            ('sends/00000000-0000-0000-0000-00000000dead/00000000-0000-0000-0000-0000000000f3.jpg') $$,
  'the sender reads their sends'' photo objects, a withdrawn one''s and a staged one''s included'
);

select tests.authenticate_as(current_setting('t.rec')::uuid);
select results_eq(
  $$ select name from storage.objects order by name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000f1.jpg'),
            ('sends/00000000-0000-0000-0000-0000000000e3/00000000-0000-0000-0000-0000000000f6.jpg') $$,
  'the recipient reads the photo objects of live and saved sends and none of a withdrawn send'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000f4.jpg') $$,
  '42501', null, 'the recipient cannot upload into a send'
);
select is_empty($$ update storage.objects set metadata = '{"x": 1}' returning name $$,
                'the recipient cannot overwrite a send photo object');

select tests.authenticate_as(current_setting('t.third')::uuid);
select is_empty($$ select name from storage.objects $$, 'a third user reads no send photo object');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000000e1/00000000-0000-0000-0000-0000000000f5.jpg') $$,
  '42501', null, 'a third user cannot upload into someone else''s send'
);

-- Send photos are write-once (D40: the recipient keeps what they were sent): no overwrite, and nothing new or
-- deleted once the recipient saved.
select tests.authenticate_as(current_setting('t.sender')::uuid);
select set_config('storage.allow_delete_query', 'true', true);
select is_empty($$ update storage.objects set metadata = '{"x": 1}'
                   where name like 'sends/00000000-0000-0000-0000-0000000000e1/%' returning name $$,
                'the sender cannot overwrite a send photo object');
select is_empty($$ update storage.objects set metadata = '{"x": 1}'
                   where name like 'sends/00000000-0000-0000-0000-0000000000e2/%' returning name $$,
                'the sender cannot overwrite a withdrawn send''s photo object');
select is_empty($$ update storage.objects set metadata = '{"x": 1}'
                   where name like 'sends/00000000-0000-0000-0000-0000000000e3/%' returning name $$,
                'the sender cannot overwrite a saved send''s photo object');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('photos', 'sends/00000000-0000-0000-0000-0000000000e3/00000000-0000-0000-0000-0000000000f7.jpg') $$,
  '42501', null, 'the sender cannot upload into a saved send'
);
select is_empty($$ delete from storage.objects where name like 'sends/00000000-0000-0000-0000-0000000000e3/%'
                   returning name $$,
                'the sender cannot delete a saved send''s photo object');
select results_eq(
  $$ delete from storage.objects where name like 'sends/00000000-0000-0000-0000-0000000000e2/%' returning name $$,
  $$ values ('sends/00000000-0000-0000-0000-0000000000e2/00000000-0000-0000-0000-0000000000f2.jpg') $$,
  'the sender deletes a withdrawn send''s photo object'
);

-- D50: once the recipient blocks the sender, the send's photos go with the send.
reset role;
insert into public.blocks (blocker, blocked) values (current_setting('t.rec')::uuid, current_setting('t.sender')::uuid);
select tests.authenticate_as(current_setting('t.rec')::uuid);
select is_empty($$ select name from storage.objects $$, 'a recipient who blocked the sender reads no photo of their send');

select * from finish();
rollback;
