-- Run this once on an existing database. The earlier owner policies compared f.storage_path with
-- order_files.name (the file's display name) instead of storage.objects.name, so owners were refused.
drop policy if exists files_owner_read on storage.objects;
drop policy if exists files_owner_delete on storage.objects;
create policy files_owner_read on storage.objects for select to authenticated using (bucket_id = 'print-files' and exists
 (select 1 from order_files f join orders o on o.id = f.order_id where f.storage_path = objects.name and is_owner(o.shop_id)));
create policy files_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'print-files' and exists
 (select 1 from order_files f join orders o on o.id = f.order_id where f.storage_path = objects.name and is_owner(o.shop_id)));
