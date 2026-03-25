import { Router, type IRouter, type Request, type Response } from "express";
import { db, promoterCompaniesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

export default router;
