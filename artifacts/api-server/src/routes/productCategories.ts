import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

function canAccessEvent(req: Request, eventId: string): boolean {
  const user = req.user!;
  if (user.role === "admin") return true;
  if (user.role === "event_admin") return (user as { eventId?: string | null }).eventId === eventId;
  return false;
}

const categoryNameSchema = z.object({
  name: z.string().min(1).max(100).trim(),
});

router.get("/events/:eventId/product-categories", requireAuth, async (req: Request, res: Response) => {
  const { eventId } = req.params as { eventId: string };
  if (!canAccessEvent(req, eventId)) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    `SELECT id, event_id AS "eventId", name, created_at AS "createdAt"
     FROM product_categories
     WHERE event_id = $1
     ORDER BY name ASC`,
    [eventId],
  );
  return res.json({ categories: rows });
});

router.post("/events/:eventId/product-categories", requireRole(["admin", "event_admin"]), async (req: Request, res: Response) => {
  const { eventId } = req.params as { eventId: string };
  if (!canAccessEvent(req, eventId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = categoryNameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const { name } = parsed.data;

  const { rows: existing } = await pool.query(
    `SELECT id FROM product_categories WHERE event_id = $1 AND LOWER(name) = LOWER($2)`,
    [eventId, name],
  );
  if (existing.length > 0) return res.status(409).json({ error: "Category already exists" });

  const { rows } = await pool.query(
    `INSERT INTO product_categories (event_id, name) VALUES ($1, $2)
     RETURNING id, event_id AS "eventId", name, created_at AS "createdAt"`,
    [eventId, name],
  );
  return res.status(201).json({ category: rows[0] });
});

router.patch("/events/:eventId/product-categories/:categoryId", requireRole(["admin", "event_admin"]), async (req: Request, res: Response) => {
  const { eventId, categoryId } = req.params as { eventId: string; categoryId: string };
  if (!canAccessEvent(req, eventId)) return res.status(403).json({ error: "Forbidden" });

  const parsed = categoryNameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const { name } = parsed.data;

  const { rows: catRows } = await pool.query(
    `SELECT name FROM product_categories WHERE id = $1 AND event_id = $2`,
    [categoryId, eventId],
  );
  if (catRows.length === 0) return res.status(404).json({ error: "Category not found" });
  const oldName = (catRows[0] as { name: string }).name;

  const { rows: dup } = await pool.query(
    `SELECT id FROM product_categories WHERE event_id = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
    [eventId, name, categoryId],
  );
  if (dup.length > 0) return res.status(409).json({ error: "Category already exists" });

  const { rows } = await pool.query(
    `UPDATE product_categories SET name = $1 WHERE id = $2 AND event_id = $3
     RETURNING id, name, created_at AS "createdAt"`,
    [name, categoryId, eventId],
  );

  // Also rename on all products belonging to this event's merchants
  await pool.query(
    `UPDATE products p SET category = $1
     FROM merchants m
     WHERE p.merchant_id = m.id AND m.event_id = $2 AND p.category = $3`,
    [name, eventId, oldName],
  );

  return res.json({ category: rows[0] });
});

router.delete("/events/:eventId/product-categories/:categoryId", requireRole(["admin", "event_admin"]), async (req: Request, res: Response) => {
  const { eventId, categoryId } = req.params as { eventId: string; categoryId: string };
  if (!canAccessEvent(req, eventId)) return res.status(403).json({ error: "Forbidden" });

  const { rows } = await pool.query(
    `DELETE FROM product_categories WHERE id = $1 AND event_id = $2 RETURNING id, name`,
    [categoryId, eventId],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Category not found" });

  return res.json({ deleted: rows[0] });
});

export default router;
