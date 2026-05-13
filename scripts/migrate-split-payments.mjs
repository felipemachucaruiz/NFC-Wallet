import { Client } from "pg";

const c = new Client({
  connectionString: process.env.RAILWAY_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

const steps = [
  {
    name: "enum split_payment_status",
    sql: "CREATE TYPE split_payment_status AS ENUM ('open','completed','cancelled')",
  },
  {
    name: "table split_payment_sessions",
    sql: `CREATE TABLE IF NOT EXISTS split_payment_sessions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES events(id),
      merchant_id varchar NOT NULL REFERENCES merchants(id),
      location_id varchar NOT NULL REFERENCES locations(id),
      total_amount integer NOT NULL,
      paid_amount integer NOT NULL DEFAULT 0,
      tip_amount integer NOT NULL DEFAULT 0,
      status split_payment_status NOT NULL DEFAULT 'open',
      opened_by_user_id varchar NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      cancelled_at timestamptz
    )`,
  },
  {
    name: "table split_payment_session_items",
    sql: `CREATE TABLE IF NOT EXISTS split_payment_session_items (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id varchar NOT NULL REFERENCES split_payment_sessions(id),
      product_id varchar REFERENCES products(id),
      product_name_snapshot varchar(255) NOT NULL,
      unit_price_snapshot integer NOT NULL,
      unit_cost_snapshot integer NOT NULL DEFAULT 0,
      quantity integer NOT NULL
    )`,
  },
  {
    name: "alter transaction_logs add split_session_id",
    sql: `ALTER TABLE transaction_logs ADD COLUMN IF NOT EXISTS split_session_id varchar REFERENCES split_payment_sessions(id)`,
  },
];

for (const step of steps) {
  try {
    await c.query(step.sql);
    console.log("OK:", step.name);
  } catch (e) {
    console.log("ERR:", step.name, "-", e.message);
  }
}

await c.end();
