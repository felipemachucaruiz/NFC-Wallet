/**
 * Creates an initial admin user.
 * Run with: pnpm --filter scripts tsx src/seed-admin.ts
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=yourpassword pnpm --filter scripts tsx src/seed-admin.ts
 */
import { createHash } from "crypto";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter scripts tsx src/seed-admin.ts");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const { default: bcrypt } = await import("bcryptjs");
const { db, usersTable } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

const normalizedEmail = email.toLowerCase().trim();

const [existing] = await db
  .select({ id: usersTable.id, role: usersTable.role })
  .from(usersTable)
  .where(eq(usersTable.email, normalizedEmail));

if (existing) {
  if (existing.role === "admin") {
    console.log(`Admin user already exists: ${normalizedEmail}`);
    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.email, normalizedEmail));
    console.log("Password updated.");
  } else {
    console.log(`User exists with role '${existing.role}'. Upgrading to admin and setting password.`);
    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(usersTable)
      .set({ passwordHash, role: "admin" })
      .where(eq(usersTable.email, normalizedEmail));
    console.log("User upgraded to admin.");
  }
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);

const [newUser] = await db
  .insert(usersTable)
  .values({
    email: normalizedEmail,
    passwordHash,
    firstName: "Admin",
    role: "admin",
  })
  .returning();

console.log(`✓ Admin user created:`);
console.log(`  Email: ${newUser.email}`);
console.log(`  Role:  ${newUser.role}`);
console.log(`  ID:    ${newUser.id}`);
process.exit(0);
