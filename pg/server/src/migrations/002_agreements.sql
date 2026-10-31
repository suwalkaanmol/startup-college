-- Roommate checklist: each member ticks the items they agree to. An item is "agreed" when both have ticked it.
CREATE TABLE group_agreements (
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  item     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id, item)
);
