-- UniHub Print: schema, RLS, server-side pricing, atomic tokens, storage policies, seed.
create table shops (
  id text primary key, name text not null, grp text not null check (grp in ('main','hostel')),
  override text check (override in ('open','closed')),
  closed_date date, open_time time not null default '09:00', close_time time not null default '18:00',
  price_bw_single int not null default 2 check (price_bw_single >= 0),
  price_bw_double int not null default 3 check (price_bw_double >= 0),
  price_color_single int not null default 10 check (price_color_single >= 0),
  price_color_double int not null default 20 check (price_color_double >= 0),
  price_spiral int not null default 30 check (price_spiral >= 0));
insert into shops (id, name, grp) values
 ('prp','PRP Xerox','main'),('tt','TT Xerox','main'),('ganga','Ganga Xerox','main'),
 ('little','Little Shop Xerox','main'),('h-block','H Block','hostel'),('j-block','J Block','hostel');

create table shop_owners (user_id uuid primary key references auth.users on delete cascade,
  shop_id text not null unique references shops);

create table orders (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null references shops, student_id uuid not null default auth.uid(),
  status text not null default 'pending_payment' check (status in ('pending_payment','preparing','ready','completed','expired')),
  total int not null check (total >= 0), breakdown jsonb not null,
  token text, token_day date, created_at timestamptz not null default now(),
  unique (shop_id, token_day, token));
create table order_files (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade,
  name text not null, storage_path text not null, pages int not null check (pages >= 1),
  color text not null check (color in ('bw','color')), sides text not null check (sides in ('single','double')),
  layout int not null check (layout between 1 and 4), arrangement text check (arrangement in ('horizontal','vertical')),
  range_from int, range_to int, copies int not null check (copies between 1 and 100),
  spiral boolean not null default false, cost int not null,
  check ((range_from is null) = (range_to is null)),
  check (range_from is null or (range_from >= 1 and range_from <= range_to and range_to <= pages)));
create table token_counters (shop_id text, day date, seq int not null default 0, primary key (shop_id, day));
create table messages (
  id uuid primary key default gen_random_uuid(), shop_id text not null references shops,
  student_id uuid not null, sender text not null check (sender in ('student','shop')),
  body text not null check (length(body) between 1 and 1000), created_at timestamptz not null default now());

-- Helpers
create function is_owner(p_shop text) returns boolean language sql stable security definer set search_path = public
 as $$ select exists (select 1 from shop_owners where user_id = auth.uid() and shop_id = p_shop) $$;
create function ist_now() returns timestamp language sql stable as $$ select now() at time zone 'Asia/Kolkata' $$;
create function shop_is_open(s shops) returns boolean language sql stable as $$
 select case when s.override = 'open' then true when s.override = 'closed' then false
  when s.closed_date = ist_now()::date then false
  when s.open_time <= s.close_time then ist_now()::time >= s.open_time and ist_now()::time < s.close_time
  else ist_now()::time >= s.open_time or ist_now()::time < s.close_time end $$;
-- Mirrors sheetsForFile() in packages/shared/src/pricing.js.
create function sheets_for(pages int, p_from int, p_to int, copies int, layout int, sides text) returns int
 language sql immutable as $$
 select case when sides = 'double' then ceil(f / 2.0)::int else f end
 from (select ceil(((coalesce(p_to, pages) - coalesce(p_from, 1) + 1) * copies)::numeric / layout)::int as f) x $$;

-- Creates an unpaid order; the price is computed here, never taken from the client.
-- p_files: [{name, storage_path, pages, color, sides, layout, arrangement, from, to, copies, spiral}]
create function place_order(p_shop text, p_files jsonb) returns uuid
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
    -- Files must live in the student's own folder of the private bucket.
    if (f->>'storage_path') not like auth.uid()::text || '/%' then raise exception 'Invalid file path'; end if;
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

-- TEST PAYMENT ONLY. Replace with a payment-gateway webhook (service role) before going live.
-- Checks the password, then issues the token atomically (row-locked counter; no duplicates).
create function pay_order_test(p_order uuid, p_password text) returns text
 language plpgsql security definer set search_path = public as $$
declare o orders; d date := ist_now()::date; n_seq int; letter text;
begin
  select * into o from orders where id = p_order and student_id = auth.uid() for update;
  if not found or o.status <> 'pending_payment' then raise exception 'Order not payable'; end if;
  if p_password is distinct from '36918' then raise exception 'Payment failed: wrong test password'; end if;
  insert into token_counters (shop_id, day, seq) values (o.shop_id, d, 1)
   on conflict (shop_id, day) do update set seq = token_counters.seq + 1 returning token_counters.seq into n_seq;
  -- Letter A on launch day (2026-11-01), then B, C ... wrapping after Z. Keep in sync with tokenLetter().
  letter := chr(65 + (((d - date '2026-11-01') % 26) + 26) % 26);
  update orders set status = 'preparing', token = letter || n_seq, token_day = d where id = p_order;
  return letter || n_seq;
end $$;

-- Owner marks an order ready. Storage deletion is done by the Edge Function (next phase).
create function complete_order(p_order uuid) returns void
 language plpgsql security definer set search_path = public as $$
declare sid text;
begin
  select shop_id into sid from orders where id = p_order;
  if sid is null or not is_owner(sid) then raise exception 'Not allowed'; end if;
  update orders set status = 'ready' where id = p_order and status = 'preparing';
end $$;

-- Row Level Security
alter table shops enable row level security;       alter table shop_owners enable row level security;
alter table orders enable row level security;      alter table order_files enable row level security;
alter table token_counters enable row level security; alter table messages enable row level security;
create policy shops_read on shops for select using (true);
create policy shops_owner_update on shops for update using (is_owner(id)) with check (is_owner(id));
create policy owners_self on shop_owners for select using (user_id = auth.uid());
create policy orders_student on orders for select using (student_id = auth.uid());
create policy orders_owner on orders for select using (is_owner(shop_id));
create policy files_student on order_files for select using
 (exists (select 1 from orders o where o.id = order_id and o.student_id = auth.uid()));
create policy files_owner on order_files for select using
 (exists (select 1 from orders o where o.id = order_id and is_owner(o.shop_id)));
create policy msg_student_read on messages for select using (student_id = auth.uid());
create policy msg_student_send on messages for insert with check (student_id = auth.uid() and sender = 'student');
create policy msg_owner_read on messages for select using (is_owner(shop_id));
create policy msg_owner_send on messages for insert with check (is_owner(shop_id) and sender = 'shop');
-- No direct insert/update/delete on orders, order_files or token_counters: only the RPCs above.
revoke execute on function place_order, pay_order_test, complete_order from public;
grant execute on function place_order, pay_order_test, complete_order to authenticated;

-- Private storage bucket: students write only to their own folder; owners read their shop's files.
insert into storage.buckets (id, name, public, file_size_limit) values ('print-files', 'print-files', false, 104857600);
create policy files_upload on storage.objects for insert to authenticated
 with check (bucket_id = 'print-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_student_read on storage.objects for select to authenticated
 using (bucket_id = 'print-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy files_owner_read on storage.objects for select to authenticated using (bucket_id = 'print-files' and exists
 (select 1 from order_files f join orders o on o.id = f.order_id where f.storage_path = objects.name and is_owner(o.shop_id)));

alter publication supabase_realtime add table orders, messages, shops;
