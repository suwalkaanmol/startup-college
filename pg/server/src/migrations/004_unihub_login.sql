-- Login now belongs to UniHub. PlaceMate keeps no passwords.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN external_id text UNIQUE; -- the student's id inside UniHub
UPDATE users SET password_hash = NULL;
