-- Create nfc_chip_type enum if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nfc_chip_type') THEN
    CREATE TYPE nfc_chip_type AS ENUM ('ntag_21x', 'mifare_classic');
  END IF;
END
$$;

-- Add nfc_chip_type column to events table, default ntag_21x for existing rows
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS nfc_chip_type nfc_chip_type NOT NULL DEFAULT 'ntag_21x';
