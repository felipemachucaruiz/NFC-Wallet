import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireRole, requireAuth } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const userRoles = ["attendee", "bank", "merchant_staff", "merchant_admin", "warehouse_admin", "admin"] as const;

router.get("/users", requireRole("admin"), async (_req: Request, res: Response) => {
  const users = await db.select().from(usersTable);
  res.json({ users });
});

router.patch(
  "/users/:userId/role",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(userRoles),
      merchantId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const updates: Record<string, unknown> = {
      role: parsed.data.role,
      updatedAt: new Date(),
    };

    if (parsed.data.merchantId !== undefined) {
      updates.merchantId = parsed.data.merchantId;
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.params.userId as string))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  },
);

router.get("/users/me", requireAuth, async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));
  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
});

export default router;
