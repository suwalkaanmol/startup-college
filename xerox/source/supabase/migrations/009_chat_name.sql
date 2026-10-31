-- Run this ONE file. Students can type an optional chat nickname (max 20 characters).
alter table messages add column if not exists sender_name text check (char_length(sender_name) <= 20);
