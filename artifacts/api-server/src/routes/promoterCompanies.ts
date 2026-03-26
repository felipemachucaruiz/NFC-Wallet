import { Router, type IRouter, type Request, type Response } from "express";
import { db, promoterCompaniesTable, usersTable, eventsTable, transactionLogsTable, braceletsTable, topUpsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const companySchema = z.object({
  companyName: z.string().min(1),
  nit: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
});

router.get("/promoter-companies", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  const companies = await db.select().from(promoterCompaniesTable).orderBy(promoterCompaniesTable.companyName);
  res.json({ companies });
});

router.get("/promoter-companies/:id", requireRole("admin", "event_admin"), async (req: Request, res: Response) => {
  const [company] = await db
    .select()
    .from(promoterCompaniesTable)
    .where(eq(promoterCompaniesTable.id, req.params.id as string));
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(company);
});

router.post("/promoter-companies", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = companySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { companyName, nit, address, phone, email } = parsed.data;
  const [company] = await db
    .insert(promoterCompaniesTable)
    .values({ companyName, nit, address, phone, email: email || undefined })
    .returning();
  res.status(201).json(company);
});

router.patch("/promoter-companies/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const parsed = companySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const updates: Record<string, unknown> = {};
  if (parsed.data.companyName !== undefined) updates.companyName = parsed.data.companyName;
  if (parsed.data.nit !== undefined) updates.nit = parsed.data.nit;
  if (parsed.data.address !== undefined) updates.address = parsed.data.address;
  if (parsed.data.phone !== undefined) updates.phone = parsed.data.phone;
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  updates.updatedAt = new Date();

  const [company] = await db
    .update(promoterCompaniesTable)
    .set(updates)
    .where(eq(promoterCompaniesTable.id, req.params.id as string))
    .returning();
  if (!company) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json(company);
});

router.delete("/promoter-companies/:id", requireRole("admin"), async (req: Request, res: Response) => {
  const [deleted] = await db
    .delete(promoterCompaniesTable)
    .where(eq(promoterCompaniesTable.id, req.params.id as string))
    .returning({ id: promoterCompaniesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Company not found" });
    return;
  }
  res.json({ success: true });
});

router.patch(
  "/promoter-companies/:companyId/assign-user/:userId",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const [user] = await db
      .update(usersTable)
      .set({ promoterCompanyId: req.params.companyId as string, updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.userId as string))
      .returning({ id: usersTable.id });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true });
  },
);

router.get(
  "/promoter-companies/:id/summary",
  requireRole("admin", "event_admin"),
  async (req: Request, res: Response) => {
    const companyId = req.params.id as string;

    const user = req.user!;
    if (user.role === "event_admin" && (user as { promoterCompanyId?: string | null }).promoterCompanyId !== companyId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [company] = await db
      .select()
      .from(promoterCompaniesTable)
      .where(eq(promoterCompaniesTable.id, companyId));

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const events = await db
      .select({ id: eventsTable.id, name: eventsTable.name, active: eventsTable.active })
      .from(eventsTable)
      .where(eq(eventsTable.promoterCompanyId, companyId));

    const eventCount = events.length;

    if (eventCount === 0) {
      res.json({
        companyId,
        companyName: company.companyName,
        eventCount: 0,
        totalRevenueCop: 0,
        totalTopupsCop: 0,
        totalUnclaimedCop: 0,
        totalAttendees: 0,
      });
      return;
    }

    const eventIds = events.map((e) => e.id);

    const txRows = await db
      .select({ grossAmountCop: transactionLogsTable.grossAmountCop })
      .from(transactionLogsTable)
      .where(inArray(transactionLogsTable.eventId, eventIds));

    const totalRevenueCop = txRows.reduce((s, r) => s + r.grossAmountCop, 0);

    const eventBracelets = await db
      .select({ nfcUid: braceletsTable.nfcUid, lastKnownBalanceCop: braceletsTable.lastKnownBalanceCop })
      .from(braceletsTable)
      .where(inArray(braceletsTable.eventId, eventIds));

    const braceletUids = eventBracelets.map((b) => b.nfcUid);
    const totalAttendees = braceletUids.length;
    const totalUnclaimedCop = eventBracelets.reduce((s, b) => s + (b.lastKnownBalanceCop ?? 0), 0);

    let totalTopupsCop = 0;
    if (braceletUids.length > 0) {
      const topUpRows = await db
        .select({ amountCop: topUpsTable.amountCop })
        .from(topUpsTable)
        .where(
          sql`${topUpsTable.braceletUid} = ANY(ARRAY[${sql.join(braceletUids.map((uid) => sql`${uid}`), sql`, `)}]::text[])`,
        );
      totalTopupsCop = topUpRows.reduce((s, t) => s + t.amountCop, 0);
    }

    res.json({
      companyId,
      companyName: company.companyName,
      eventCount,
      totalRevenueCop,
      totalTopupsCop,
      totalUnclaimedCop,
      totalAttendees,
      events: events.map((e) => ({ id: e.id, name: e.name, active: e.active })),
    });
  },
);

export default router;
