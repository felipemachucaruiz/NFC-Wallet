import { db, eventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { deriveEventKey } from "./kdf";

export interface HmacKeyResult {
  primaryKey: string;
  candidateKeys: string[];
  useKdf: boolean;
}

export async function resolveHmacKey(eventId: string | null): Promise<HmacKeyResult> {
  const globalSecret = process.env.HMAC_SECRET ?? null;

  if (!eventId) {
    if (!globalSecret) throw new Error("HMAC_SECRET not configured");
    return { primaryKey: globalSecret, candidateKeys: [globalSecret], useKdf: false };
  }

  const [event] = await db
    .select({ useKdf: eventsTable.useKdf, hmacSecret: eventsTable.hmacSecret })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));

  if (event?.useKdf) {
    const masterKey = process.env.HMAC_MASTER_KEY;
    if (!masterKey) throw new Error("HMAC_MASTER_KEY not configured");
    const derivedKey = deriveEventKey(masterKey, eventId);
    const candidates: string[] = [derivedKey];
    if (event.hmacSecret) candidates.push(event.hmacSecret);
    if (globalSecret) candidates.push(globalSecret);
    return { primaryKey: derivedKey, candidateKeys: candidates, useKdf: true };
  }

  if (event?.hmacSecret) {
    const candidates: string[] = [event.hmacSecret];
    if (globalSecret) candidates.push(globalSecret);
    return { primaryKey: event.hmacSecret, candidateKeys: candidates, useKdf: false };
  }

  if (!globalSecret) throw new Error("HMAC_SECRET not configured and event has no per-event key");
  return { primaryKey: globalSecret, candidateKeys: [globalSecret], useKdf: false };
}
