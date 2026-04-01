ALTER TABLE events
  ADD COLUMN IF NOT EXISTS allowed_nfc_types jsonb;

UPDATE events
SET allowed_nfc_types = jsonb_build_array(nfc_chip_type::text)
WHERE allowed_nfc_types IS NULL;

ALTER TABLE events
  ALTER COLUMN allowed_nfc_types SET DEFAULT '["ntag_21x"]'::jsonb,
  ALTER COLUMN allowed_nfc_types SET NOT NULL;
