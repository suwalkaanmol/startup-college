-- Run this ONE file AFTER enabling the pg_cron extension (Supabase: Database > Extensions > pg_cron).
-- Deletes every chat message once a day at midnight India time (18:30 UTC).
create extension if not exists pg_cron with schema extensions;
select cron.schedule('delete-chats-daily', '30 18 * * *', $$delete from public.messages$$);
