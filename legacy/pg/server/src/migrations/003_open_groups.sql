-- Open groups: a group has a size chosen by its creator, an owner who approves joiners,
-- roommate "picks" (who each member wants as roommate) and join requests.
ALTER TABLE groups ADD COLUMN capacity int NOT NULL DEFAULT 2 CHECK (capacity BETWEEN 2 AND 6);
ALTER TABLE groups ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE group_members ADD COLUMN joined_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE roommate_requests ADD COLUMN group_size int NOT NULL DEFAULT 2 CHECK (group_size BETWEEN 2 AND 6);

UPDATE groups g SET owner_id = (SELECT user_id FROM group_members m WHERE m.group_id = g.id ORDER BY user_id LIMIT 1);

-- "from_user wants to_user as a roommate". Two people are roommates when each picked the other.
CREATE TABLE roommate_picks (
  group_id  uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  to_user   uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, from_user, to_user),
  CHECK (from_user <> to_user)
);
-- Carry over the old "confirm as roommates" clicks.
INSERT INTO roommate_picks (group_id, from_user, to_user)
  SELECT a.group_id, a.user_id, b.user_id FROM group_members a
  JOIN group_members b ON b.group_id = a.group_id AND b.user_id <> a.user_id
  WHERE a.confirmed_at IS NOT NULL;

CREATE TABLE group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE UNIQUE INDEX one_pending_join ON group_join_requests (group_id, user_id) WHERE status = 'pending';
CREATE INDEX group_join_user_idx ON group_join_requests (user_id);
