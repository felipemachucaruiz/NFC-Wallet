/**
 * POS Wallet Sync — Digital Wallet Cashless Reconciliation
 *
 * Endpoints:
 *   GET  /api/pos/vas-config        → public key + ECIES hex for POS bootstrap
 *   POST /api/pos/wallet-charge     → online single-transaction debit (instant pass update)
 *   POST /api/pos/batch-sync        → offline batch upload after connectivity restored
 *
 * Security model:
 *   - Each POS must be authenticated as merchant_staff (existing session auth)
 *   - HMAC re-signatures are verified with the event's hmacSecret
 *   - seq gaps > 1 trigger fraud alerts (double-spend detection)
 *   - Stale tokens (ts > TOKEN_MAX_AGE_DAYS days old) are rejected even if sig is valid
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db, braceletsTable, eventsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  decodeVASToken,
  verifyVASTokenHmac,
  mintVASToken,
  encodeVASToken,
  loadSigningPrivateKey,
  loadSigningPublicKey,
  deriveVASUid,
  type SignedVASToken,
} from "../utils/vasToken.js";
import { requireRole } from "../middlewares/requireRole.js";

const router: IRouter = Router();

const TOKEN_MAX_AGE_DAYS = 30;
const TOKEN_MAX_AGE_SECS = TOKEN_MAX_AGE_DAYS * 86400;

// ─── GET /api/pos/vas-config ─────────────────────────────────────────────────
// POS bootstrap: called once after login to download signing public key + ECIES hex.
// The POS caches these in its Keystore alongside the hmacSecret.

router.get(
  "/api/pos/vas-config",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (_req: Request, res: Response) => {
    try {
      const publicKeyPem = loadSigningPublicKey();
      const eciesPublicKeyHex = process.env.VAS_ECIES_PUBLIC_KEY_HEX ?? null;

      res.json({
        ecdsaPublicKeyPem: publicKeyPem,
        eciesPublicKeyHex,           // terminal ECIES public key (compressed X9.62, 33 bytes)
        tokenMaxAgeDays: TOKEN_MAX_AGE_DAYS,
      });
    } catch {
      res.status(503).json({ error: "VAS keys not configured" });
    }
  }
);

// ─── POST /api/pos/wallet-charge ─────────────────────────────────────────────
// Online real-time charge: POS presents the decoded token + amount.
// Server verifies, debits bracelet, re-mints token, triggers pass push update.

router.post(
  "/api/pos/wallet-charge",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    const { encodedToken, amountCents, locationId } = req.body as {
      encodedToken: string;
      amountCents: number;
      locationId?: string;
    };

    if (!encodedToken || typeof amountCents !== "number" || amountCents <= 0) {
      res.status(400).json({ error: "encodedToken and amountCents required" });
      return;
    }

    let token: SignedVASToken;
    try {
      token = decodeVASToken(encodedToken);
    } catch {
      res.status(400).json({ error: "Malformed VAS token" });
      return;
    }

    const nowSecs = Math.floor(Date.now() / 1000);
    if (nowSecs - token.ts > TOKEN_MAX_AGE_SECS) {
      res.status(409).json({ error: "TOKEN_EXPIRED", message: "Token más antiguo de 30 días — pide al usuario que sincronice" });
      return;
    }

    if (token.bal < amountCents) {
      res.status(422).json({
        error: "INSUFFICIENT_BALANCE",
        available: token.bal,
        required: amountCents,
      });
      return;
    }

    // Fetch bracelet from DB to cross-validate seq and apply authoritative balance
    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, token.uid));

    if (!bracelet) {
      res.status(404).json({ error: "Pulsera no encontrada. El UID del token no coincide con ninguna pulsera registrada." });
      return;
    }

    if (bracelet.lastKnownBalance < amountCents) {
      res.status(422).json({
        error: "INSUFFICIENT_BALANCE",
        available: bracelet.lastKnownBalance,
        required: amountCents,
      });
      return;
    }

    const newBalance = bracelet.lastKnownBalance - amountCents;
    const newSeq     = token.seq + 1;
    const newTs      = nowSecs;

    // Re-mint with backend ECDSA key so the POS receives an authoritative token
    let newToken: SignedVASToken;
    try {
      const privKey = loadSigningPrivateKey();
      newToken = mintVASToken(
        { uid: token.uid, bal: newBalance, seq: newSeq, ts: newTs, eid: token.eid },
        privKey
      );
    } catch {
      res.status(503).json({ error: "Signing key not configured" });
      return;
    }

    // Update bracelet balance in DB
    await db
      .update(braceletsTable)
      .set({ lastKnownBalance: newBalance, updatedAt: new Date() })
      .where(eq(braceletsTable.id, bracelet.id));

    // TODO: trigger Apple Wallet pass push notification here
    // This requires adding webServiceURL + authenticationToken to pass.json at generation
    // and implementing APNs push via the passkit-generator pushUpdate() method.
    void schedulePassPushUpdate(bracelet.attendeeUserId ?? "", token.eid);

    res.json({
      success: true,
      newBalance,
      newSeq,
      encodedToken: encodeVASToken(newToken),
    });
  }
);

// ─── POST /api/pos/batch-sync ─────────────────────────────────────────────────
// Offline reconciliation: called when POS regains connectivity.
// Accepts an ordered array of transactions (oldest first) for one or more uids.
// Detects seq gaps > 1 (possible double-spend or lost transactions).

interface WalletTransaction {
  uid:         string;   // derived VAS uid (matches token.uid)
  eid:         string;   // event slug
  oldSeq:      number;
  newSeq:      number;
  oldBal:      number;
  newBal:      number;
  amountCents: number;
  ts:          number;   // Unix seconds when transaction happened
  locationId?: string;
  encodedResignedToken: string;  // HMAC-re-signed token produced by POS after debit
}

interface SyncResult {
  uid:     string;
  seq:     number;
  status:  "applied" | "skipped_already_applied" | "fraud_alert" | "invalid_sig";
  message?: string;
}

router.post(
  "/api/pos/batch-sync",
  requireRole("merchant_staff", "merchant_admin", "admin"),
  async (req: Request, res: Response) => {
    const { transactions, hmacSecret: clientHmacSecret } = req.body as {
      transactions: WalletTransaction[];
      hmacSecret: string;
    };

    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ error: "transactions array required" });
      return;
    }

    if (!clientHmacSecret) {
      res.status(400).json({ error: "hmacSecret required" });
      return;
    }

    const results: SyncResult[] = [];

    // Group by uid and process sequentially within each uid
    const byUid = new Map<string, WalletTransaction[]>();
    for (const tx of transactions) {
      const arr = byUid.get(tx.uid) ?? [];
      arr.push(tx);
      byUid.set(tx.uid, arr);
    }

    for (const [uid, txList] of byUid) {
      // Sort by oldSeq ascending
      txList.sort((a, b) => a.oldSeq - b.oldSeq);

      const [bracelet] = await db
        .select()
        .from(braceletsTable)
        .where(eq(braceletsTable.nfcUid, uid));

      if (!bracelet) {
        for (const tx of txList) {
          results.push({ uid, seq: tx.newSeq, status: "fraud_alert", message: "UID not found in DB" });
        }
        continue;
      }

      let serverBalance = bracelet.lastKnownBalance;

      for (const tx of txList) {
        // Verify HMAC re-signature
        let resignedToken: SignedVASToken;
        try {
          resignedToken = decodeVASToken(tx.encodedResignedToken);
        } catch {
          results.push({ uid, seq: tx.newSeq, status: "invalid_sig", message: "Cannot decode re-signed token" });
          continue;
        }

        if (!verifyVASTokenHmac(resignedToken, clientHmacSecret)) {
          results.push({ uid, seq: tx.newSeq, status: "invalid_sig", message: "HMAC verification failed" });
          continue;
        }

        // Seq continuity check: gap > 1 means transactions from another POS not yet synced
        // OR potential double-spend (the user tapped at two offline terminals)
        if (tx.newSeq !== tx.oldSeq + 1) {
          results.push({ uid, seq: tx.newSeq, status: "fraud_alert", message: `Expected seq ${tx.oldSeq + 1}, got ${tx.newSeq}` });
          continue;
        }

        // Integrity check: reported amounts must match token fields
        if (resignedToken.bal !== tx.newBal || resignedToken.seq !== tx.newSeq) {
          results.push({ uid, seq: tx.newSeq, status: "fraud_alert", message: "Token fields do not match reported amounts" });
          continue;
        }

        // Apply debit against server-tracked balance
        if (serverBalance < tx.amountCents) {
          results.push({ uid, seq: tx.newSeq, status: "fraud_alert", message: `Server balance ${serverBalance} < debit ${tx.amountCents}` });
          continue;
        }

        serverBalance -= tx.amountCents;
        results.push({ uid, seq: tx.newSeq, status: "applied" });
      }

      // Persist final balance
      if (serverBalance !== bracelet.lastKnownBalance) {
        await db
          .update(braceletsTable)
          .set({ lastKnownBalance: serverBalance, updatedAt: new Date() })
          .where(eq(braceletsTable.id, bracelet.id));

        void schedulePassPushUpdate(bracelet.attendeeUserId ?? "", txList[0]!.eid);
      }
    }

    // Surface fraud alerts
    const fraudAlerts = results.filter((r) => r.status === "fraud_alert" || r.status === "invalid_sig");
    res.json({ results, fraudAlerts });
  }
);

// ─── GET /api/pos/vas-token/:nfcUid ──────────────────────────────────────────
// Mint (or re-mint) a fresh VAS token for a bracelet.
// Called when generating or refreshing a digital wallet pass.

router.get(
  "/api/pos/vas-token/:nfcUid",
  requireRole("merchant_staff", "merchant_admin", "event_admin", "admin"),
  async (req: Request, res: Response) => {
    const { nfcUid } = req.params as { nfcUid: string };
    const eventSlug  = req.query.eventSlug as string;

    if (!eventSlug) {
      res.status(400).json({ error: "eventSlug required" });
      return;
    }

    const [bracelet] = await db
      .select()
      .from(braceletsTable)
      .where(eq(braceletsTable.nfcUid, nfcUid));

    if (!bracelet) {
      res.status(404).json({ error: "Pulsera no encontrada" });
      return;
    }

    let privKey: string;
    try {
      privKey = loadSigningPrivateKey();
    } catch {
      res.status(503).json({ error: "VAS signing key not configured" });
      return;
    }

    const uid     = deriveVASUid(nfcUid, eventSlug);
    const payload = {
      uid,
      bal: bracelet.lastKnownBalance,
      seq: 0,
      ts:  Math.floor(Date.now() / 1000),
      eid: eventSlug,
    };

    const token   = mintVASToken(payload, privKey);
    const encoded = encodeVASToken(token);

    res.json({ encoded, payload: token });
  }
);

// ─── Stub: Apple Wallet pass push update ─────────────────────────────────────
// Full implementation requires:
//   1. webServiceURL + authenticationToken in pass.json at generation time
//   2. Device registration store (device pushToken → serial number mapping)
//   3. APNs push via node-apn or passkit-generator's pushUpdate()
//   4. Re-generate pass with new balance, serve at /v1/passes/{passTypeId}/{serialNumber}

async function schedulePassPushUpdate(attendeeUserId: string, _eventSlug: string): Promise<void> {
  if (!attendeeUserId) return;
  // TODO: look up registered devices for this user, send APNs push
  console.log(`[posWalletSync] TODO: push pass update for user ${attendeeUserId}`);
}

export default router;
