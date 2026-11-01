-- Each student gives a window (from..to) and an exact move-in date inside it.
ALTER TABLE profiles ADD COLUMN move_in_from date, ADD COLUMN move_in_to date, ADD COLUMN move_in_date date;
ALTER TABLE profiles ADD CONSTRAINT move_in_order CHECK (
  (move_in_from IS NULL AND move_in_to IS NULL AND move_in_date IS NULL)
  OR (move_in_from <= move_in_date AND move_in_date <= move_in_to));
