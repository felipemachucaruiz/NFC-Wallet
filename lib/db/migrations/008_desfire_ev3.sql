-- Add desfire_ev3 to nfc_chip_type enum
ALTER TYPE nfc_chip_type ADD VALUE IF NOT EXISTS 'desfire_ev3';

-- Add AES master key storage for DESFire EV3 events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS desfire_aes_key varchar(64);
