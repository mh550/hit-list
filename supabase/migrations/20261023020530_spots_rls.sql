-- S3-03: who reads a spot and its photos, and who writes them (docs/plans/2026-10-22-s3-backend.md, "Functions" and
-- "Row policies"). Readers: the owner; the owner and 'member's of a shared, live, manual list holding the spot; the
-- 'member's of a shared, live, area list of the same owner whose circle and filters take the spot. Writes: the owner.
-- Append new migrations; never edit this one.

-- The area list's filters as the app applies them (selectAreaSpots → selectFilteredSpots): What's here is any-of,
-- Skate stopped is exact when set, Natural speed is an inclusive range that keeps unrated spots. A key that is missing
-- or of the wrong JSON type is no filter. Called only from can_read_spot (no client grant).
create function public.spot_matches_filters(p_spot public.spots, p_filters jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_filters is null or jsonb_typeof(p_filters) <> 'object' then true
    else
      (case
         -- nested, not `and`: SQL doesn't promise evaluation order and jsonb_array_length raises on a scalar
         when jsonb_typeof(p_filters -> 'types') = 'array' then
           case
             when jsonb_array_length(p_filters -> 'types') > 0
               then p_spot.feature_types && array(select jsonb_array_elements_text(p_filters -> 'types'))
             else true
           end
         else true
       end)
      and (case
             when jsonb_typeof(p_filters -> 'stopped') = 'boolean'
               then p_spot.stopped = (p_filters ->> 'stopped')::boolean
             else true
           end)
      and (case
             when p_spot.natural_speed is null then true
             else
               (case
                  when jsonb_typeof(p_filters -> 'natural_speed_min') = 'number'
                    then p_spot.natural_speed >= (p_filters ->> 'natural_speed_min')::numeric
                  else true
                end)
               and (case
                      when jsonb_typeof(p_filters -> 'natural_speed_max') = 'number'
                        then p_spot.natural_speed <= (p_filters ->> 'natural_speed_max')::numeric
                      else true
                    end)
           end)
  end;
$$;

-- Whether p_uid may read the spot. security definer so the policies can look at lists and members without their own
-- policies applying (no RLS recursion). Any caller with a JWT may only ask about themselves (only the service role,
-- or a direct connection with no JWT, may pass another uid). Evaluated per query, so a removed member loses read on
-- the next one. The owner reads their spot deleted or not; nobody else reads a deleted one.
-- Manual list: the row must have been added by the spot's owner, who must still be the list's owner or a 'member'
-- (so a bad hit_list_spots row, or one left behind by a member who left, grants nothing).
-- Area list: same owner as the spot; never an unlocated (0, 0) spot (D53); the circle on the sphere, like the app's
-- haversine (use_spheroid false: PostGIS's sphere is R 6370986 m, the app's 6371 km; the spheroid differs by ~0.3%).
create function public.can_read_spot(p_spot_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_uid is null then false
    when p_uid is distinct from auth.uid() and auth.jwt() is not null and coalesce(auth.role(), '') <> 'service_role'
      then false
    else exists (
      select 1
      from public.spots s
      where s.id = p_spot_id
        and (
          s.owner_id = p_uid
          or (
            s.deleted_at is null
            and (
              exists (
                select 1
                from public.hit_list_spots hs
                join public.hit_lists l on l.id = hs.list_id
                where hs.spot_id = s.id
                  and hs.added_by = s.owner_id
                  and l.kind = 'manual'
                  and l.shared
                  and l.deleted_at is null
                  and (
                    l.owner_id = s.owner_id
                    or exists (
                      select 1 from public.hit_list_members m
                      where m.list_id = l.id and m.user_id = s.owner_id and m.status = 'member'
                    )
                  )
                  and (
                    l.owner_id = p_uid
                    or exists (
                      select 1 from public.hit_list_members m
                      where m.list_id = l.id and m.user_id = p_uid and m.status = 'member'
                    )
                  )
              )
              or (
                not (s.lat = 0 and s.lng = 0)
                and exists (
                  select 1
                  from public.hit_list_members m
                  join public.hit_lists l on l.id = m.list_id
                  where m.user_id = p_uid
                    and m.status = 'member'
                    and l.owner_id = s.owner_id
                    and l.kind = 'area'
                    and l.shared
                    and l.deleted_at is null
                    and extensions.st_dwithin(s.geog, l.area_center, l.area_radius_m, false)
                    and public.spot_matches_filters(s, l.area_filters)
                )
              )
            )
          )
        )
    )
  end;
$$;

grant execute on function public.can_read_spot(uuid, uuid) to authenticated;

-- spots: no DELETE policy (a delete is a soft delete, an UPDATE; account deletion runs as the service role).
create policy spots_select on public.spots for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_read_spot(id));
create policy spots_insert on public.spots for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy spots_update on public.spots for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- media: readable with its spot, a deleted photo by its owner only; written by the owner, on their own spot. The
-- owner test comes first so the owner's own rows skip can_read_spot.
create policy media_select on public.media for select to authenticated
  using (owner_id = (select auth.uid()) or (deleted_at is null and public.can_read_spot(spot_id)));
create policy media_insert on public.media for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
  );
create policy media_update on public.media for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.spots s where s.id = spot_id and s.owner_id = (select auth.uid()))
  );

-- A row's identity never changes: a spot keeps its id, owner and created_at; a photo its id, spot, owner and
-- created_at (no moving a photo, no re-keying a spot under the sync engine). An upsert that sets them to the same
-- values passes. Runs before the stale guard (t10) and rev (t20).
create function public.keep_spot_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
     or new.created_at is distinct from old.created_at then
    raise exception 'spot id, owner_id and created_at are fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create function public.keep_media_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id or new.spot_id is distinct from old.spot_id
     or new.owner_id is distinct from old.owner_id or new.created_at is distinct from old.created_at then
    raise exception 'media id, spot_id, owner_id and created_at are fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger t05_keep_identity before update on public.spots
  for each row execute function public.keep_spot_identity();
create trigger t05_keep_identity before update on public.media
  for each row execute function public.keep_media_identity();
