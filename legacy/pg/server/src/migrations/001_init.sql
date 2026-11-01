-- PlaceMate initial schema. Every personal table cascades from users(id).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reg_no text NOT NULL UNIQUE,
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  name text NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male','female')),
  password_hash text NOT NULL,
  token_version int NOT NULL DEFAULT 0,
  email_verified_at timestamptz,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_otps (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify','reset')),
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_otps_user_idx ON email_otps (user_id, purpose, created_at DESC);

CREATE TABLE hubs (
  id text PRIMARY KEY,
  city text NOT NULL,
  area text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company text NOT NULL,
  hub_id text NOT NULL REFERENCES hubs(id),
  max_distance_km int NOT NULL CHECK (max_distance_km BETWEEN 1 AND 200),
  move_in_month text CHECK (move_in_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  budget int CHECK (budget BETWEEN 1000 AND 200000),
  bio text CHECK (char_length(bio) <= 300),
  tags text[] NOT NULL DEFAULT '{}',
  priorities text[] NOT NULL DEFAULT '{}' CHECK (cardinality(priorities) <= 3),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roommate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK (from_user <> to_user)
);
-- Only one pending request per pair, whichever direction it was sent.
CREATE UNIQUE INDEX one_pending_pair ON roommate_requests
  (LEAST(from_user, to_user), GREATEST(from_user, to_user)) WHERE status = 'pending';

CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_at timestamptz,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX group_members_user_idx ON group_members (user_id);

CREATE TABLE messages (
  id bigserial PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE CASCADE, -- NULL = system note
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_group_idx ON messages (group_id, id);

CREATE TABLE blocks (
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE reports (
  id bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('fake_profile','harassment','inappropriate','scam','other')),
  details text CHECK (char_length(details) <= 1000),
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pgs (
  id text PRIMARY KEY,
  name text NOT NULL,
  hub_id text NOT NULL REFERENCES hubs(id),
  locality text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  gender text NOT NULL CHECK (gender IN ('male','female')),
  rent_single int NOT NULL,
  rent_double int NOT NULL,
  rent_triple int NOT NULL,
  deposit_months int NOT NULL CHECK (deposit_months BETWEEN 1 AND 3),
  food text NOT NULL CHECK (food IN ('none','veg','veg_nonveg')),
  gate_closes time,                       -- NULL = no curfew
  rules text[] NOT NULL DEFAULT '{}',
  amenities text[] NOT NULL DEFAULT '{}',
  beds_total int NOT NULL CHECK (beds_total > 0),
  is_sample boolean NOT NULL DEFAULT true
);
CREATE INDEX pgs_hub_idx ON pgs (hub_id, gender);

CREATE TABLE bookings (
  id text PRIMARY KEY,                    -- 'PM-XXXXXX'
  pg_id text NOT NULL REFERENCES pgs(id),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES groups(id) ON DELETE SET NULL,
  sharing text NOT NULL CHECK (sharing IN ('single','double','triple')),
  move_in date NOT NULL,
  rent_per_bed int NOT NULL,
  deposit_per_bed int NOT NULL,
  status text NOT NULL CHECK (status IN ('pending_partner','confirmed','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  closed_at timestamptz
);
CREATE TABLE booking_members (
  booking_id text NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  PRIMARY KEY (booking_id, user_id)
);
CREATE INDEX booking_members_user_idx ON booking_members (user_id);

CREATE TABLE credit_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id text REFERENCES bookings(id) ON DELETE SET NULL,
  delta int NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);
