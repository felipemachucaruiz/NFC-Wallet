-- Add mifare_ultralight_c to nfc_chip_type enum
ALTER TYPE nfc_chip_type ADD VALUE IF NOT EXISTS 'mifare_ultralight_c';

-- Add 3DES key storage for MIFARE Ultralight C events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ultralight_c_des_key varchar(32);
