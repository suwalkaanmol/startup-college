-- Run this ONE file (it includes everything from 003 and 004). Safe to run more than once.
create or replace function owner_can_access_file(p_path text) returns boolean
 language sql stable security definer set search_path = public as $$
 select exists (select 1 from order_files f join orders o on o.id = f.order_id
                join shop_owners so on so.shop_id = o.shop_id
                where f.storage_path = p_path and so.user_id = auth.uid()) $$;
grant execute on function owner_can_access_file(text) to authenticated;

drop policy if exists files_owner_read on storage.objects;
drop policy if exists files_owner_delete on storage.objects;
create policy files_owner_read on storage.objects for select to authenticated
 using (bucket_id = 'print-files' and public.owner_can_access_file(name));
create policy files_owner_delete on storage.objects for delete to authenticated
 using (bucket_id = 'print-files' and public.owner_can_access_file(name));

-- Tells the owner app WHY a file cannot be opened: 'missing' (not in storage), 'denied' (no permission) or 'ok'.
create or replace function file_status(p_path text) returns text
 language sql stable security definer set search_path = public, storage as $$
 select case when not exists (select 1 from storage.objects where bucket_id = 'print-files' and name = p_path) then 'missing'
             when not owner_can_access_file(p_path) then 'denied' else 'ok' end $$;
grant execute on function file_status(text) to authenticated;
