-- Add registeredByUserId to bracelets so gate portal can show who registered each bracelet
ALTER TABLE bracelets ADD COLUMN IF NOT EXISTS registered_by_user_id varchar REFERENCES users(id);
