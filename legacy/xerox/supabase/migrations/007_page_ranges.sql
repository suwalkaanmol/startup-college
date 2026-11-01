-- Run this ONE file. Orders can now print several page ranges per file (e.g. 4-20 and 30-35).
alter table order_files add column if not exists ranges jsonb;
create or replace function sheets_for(p_pages int, p_ranges jsonb, p_copies int, p_layout int, p_sides text) returns int
 language sql immutable as $$
 select case when p_sides = 'double' then ceil(f / 2.0)::int else f end
 from (select ceil((case when jsonb_typeof(p_ranges) = 'array' and jsonb_array_length(p_ranges) > 0
         then (select sum((r->>'to')::int - (r->>'from')::int + 1) from jsonb_array_elements(p_ranges) r) else p_pages end * p_copies)::numeric / p_layout)::int as f) x $$;

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
    if jsonb_typeof(f->'ranges') = 'array' and jsonb_array_length(f->'ranges') > 0 then
      if jsonb_array_length(f->'ranges') > 10 or exists (select 1 from jsonb_array_elements(f->'ranges') r
         where (r->>'from')::int < 1 or (r->>'to')::int < (r->>'from')::int or (r->>'to')::int > (f->>'pages')::int) then
        raise exception 'Invalid page range'; end if;
    end if;
    n := sheets_for((f->>'pages')::int, f->'ranges', (f->>'copies')::int, (f->>'layout')::int, f->>'sides');
    rate := case f->>'color' when 'bw' then (case f->>'sides' when 'single' then s.price_bw_single else s.price_bw_double end)
            else (case f->>'sides' when 'single' then s.price_color_single else s.price_color_double end) end;
    c := n * rate + case when (f->>'spiral')::boolean then s.price_spiral else 0 end;
    if f->>'color' = 'bw' then bw := bw + n * rate; else col := col + n * rate; end if;
    if (f->>'spiral')::boolean then sp := sp + s.price_spiral; end if;
    insert into order_files (order_id, name, storage_path, pages, color, sides, layout, arrangement,
                             ranges, copies, spiral, cost)  -- table CHECKs validate every field
    values (oid, f->>'name', f->>'storage_path', (f->>'pages')::int, f->>'color', f->>'sides',
            (f->>'layout')::int, f->>'arrangement', f->'ranges',
            (f->>'copies')::int, coalesce((f->>'spiral')::boolean, false), c);
  end loop;
  update orders set total = bw + col + sp,
    breakdown = jsonb_build_object('bw', bw, 'color', col, 'spiral', sp) where id = oid;
  return oid;
end $$;
