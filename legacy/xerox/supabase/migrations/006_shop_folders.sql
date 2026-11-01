-- Run this ONE file. Files are now stored as <shop id>/<student id>/<file>.
-- Owners may open and delete everything in their own shop's folder; students only their own folder.
-- This replaces all earlier file rules (no lookups into other tables, so nothing can mismatch).
create or replace function my_shop_id() returns text
 language sql stable security definer set search_path = public as $$
 select shop_id from shop_owners where user_id = auth.uid() $$;
grant execute on function my_shop_id() to authenticated;

drop policy if exists files_upload on storage.objects;
drop policy if exists files_student_read on storage.objects;
drop policy if exists files_owner_read on storage.objects;
drop policy if exists files_owner_delete on storage.objects;
create policy files_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'print-files' and (storage.foldername(name))[2] = auth.uid()::text);
create policy files_student_read on storage.objects for select to authenticated
 using (bucket_id = 'print-files' and (storage.foldername(name))[2] = auth.uid()::text);
create policy files_owner_read on storage.objects for select to authenticated
 using (bucket_id = 'print-files' and (storage.foldername(name))[1] = public.my_shop_id());
create policy files_owner_delete on storage.objects for delete to authenticated
 using (bucket_id = 'print-files' and (storage.foldername(name))[1] = public.my_shop_id());

-- Reason a file cannot be opened, shown in the owner app: 'missing', 'denied' or 'ok'.
create or replace function file_status(p_path text) returns text
 language sql stable security definer set search_path = public, storage as $$
 select case when not exists (select 1 from storage.objects where bucket_id = 'print-files' and name = p_path) then 'missing'
             when (storage.foldername(p_path))[1] is distinct from my_shop_id() then 'denied' else 'ok' end $$;
grant execute on function file_status(text) to authenticated;

create or replace function place_order(p_shop text, p_files jsonb) returns uuid
 language plpgsql security definer set search_path = public as $$
declare s shops; f jsonb; n int; rate int; c int; oid uuid; bw int := 0; col int := 0; sp int := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from shops where id = p_shop;
  if not found then raise exception 'Unknown shop'; end if;
  if not shop_is_open(s) then raise exception 'Shop is closed'; end if;
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) not between 1 and 20 then
    raise exception 'Add 1 to 20 files'; end if;
  insert into orders (shop_id, total, breakdown) values (p_shop, 0, '{}') returning id into oid;
  for f in select * from jsonb_array_elements(p_files) loop
    -- Files must live in <shop>/<student id>/ of the private bucket.
    if (f->>'storage_path') not like p_shop || '/' || auth.uid()::text || '/%' then raise exception 'Invalid file path'; end if;
    n := sheets_for((f->>'pages')::int, (f->>'from')::int, (f->>'to')::int, (f->>'copies')::int,
                    (f->>'layout')::int, f->>'sides');
    rate := case f->>'color' when 'bw' then (case f->>'sides' when 'single' then s.price_bw_single else s.price_bw_double end)
            else (case f->>'sides' when 'single' then s.price_color_single else s.price_color_double end) end;
    c := n * rate + case when (f->>'spiral')::boolean then s.price_spiral else 0 end;
    if f->>'color' = 'bw' then bw := bw + n * rate; else col := col + n * rate; end if;
    if (f->>'spiral')::boolean then sp := sp + s.price_spiral; end if;
    insert into order_files (order_id, name, storage_path, pages, color, sides, layout, arrangement,
                             range_from, range_to, copies, spiral, cost)  -- table CHECKs validate every field
    values (oid, f->>'name', f->>'storage_path', (f->>'pages')::int, f->>'color', f->>'sides',
            (f->>'layout')::int, f->>'arrangement', (f->>'from')::int, (f->>'to')::int,
            (f->>'copies')::int, coalesce((f->>'spiral')::boolean, false), c);
  end loop;
  update orders set total = bw + col + sp,
    breakdown = jsonb_build_object('bw', bw, 'color', col, 'spiral', sp) where id = oid;
  return oid;
end $$;
