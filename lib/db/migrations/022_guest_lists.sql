-- Guest lists feature: guest_lists and guest_list_entries tables
-- Also makes ticket_type_id nullable on tickets for guest list tickets

-- 1. Create guest_list_status enum
DO $$ BEGIN
  CREATE TYPE guest_list_status AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create guest_lists table
CREATE TABLE IF NOT EXISTS guest_lists (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id varchar NOT NULL REFERENCES events(id),
  name varchar(255) NOT NULL,
  slug varchar(100) NOT NULL UNIQUE,
  max_guests integer NOT NULL,
  current_count integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT false,
  status guest_list_status NOT NULL DEFAULT 'active',
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT guest_lists_count_non_negative CHECK (current_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_guest_lists_event_id ON guest_lists(event_id);
CREATE INDEX IF NOT EXISTS idx_guest_lists_slug ON guest_lists(slug);

-- 3. Create guest_list_entries table
CREATE TABLE IF NOT EXISTS guest_list_entries (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_list_id varchar NOT NULL REFERENCES guest_lists(id),
  name varchar(255) NOT NULL,
  email varchar(320) NOT NULL,
  phone varchar(30),
  ticket_id varchar REFERENCES tickets(id),
  order_id varchar REFERENCES ticket_orders(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT guest_list_entries_list_email_unique UNIQUE (guest_list_id, email)
);

CREATE INDEX IF NOT EXISTS idx_guest_list_entries_guest_list_id ON guest_list_entries(guest_list_id);
CREATE INDEX IF NOT EXISTS idx_guest_list_entries_email ON guest_list_entries(email);

-- 4. Make ticket_type_id nullable on tickets (for guest list tickets without a ticket type)
ALTER TABLE tickets ALTER COLUMN ticket_type_id DROP NOT NULL;
