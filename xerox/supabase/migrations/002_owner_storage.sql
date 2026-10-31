-- Owners may delete their own shop's uploaded files once an order is completed.
create policy files_owner_delete on storage.objects for delete to authenticated using (bucket_id = 'print-files' and exists
 (select 1 from order_files f join orders o on o.id = f.order_id where f.storage_path = objects.name and is_owner(o.shop_id)));
