import { Router, type IRouter, type Request, type Response } from "express";
import { db, savedCardsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

router.get(
  "/cards",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const cards = await db
      .select({
        id: savedCardsTable.id,
        brand: savedCardsTable.brand,
        lastFour: savedCardsTable.lastFour,
        cardHolderName: savedCardsTable.cardHolderName,
        expiryMonth: savedCardsTable.expiryMonth,
        expiryYear: savedCardsTable.expiryYear,
        alias: savedCardsTable.alias,
        createdAt: savedCardsTable.createdAt,
      })
      .from(savedCardsTable)
      .where(eq(savedCardsTable.userId, req.user.id))
      .orderBy(savedCardsTable.createdAt);

    res.json({ cards });
  },
);

const saveCardSchema = z.object({
  wompiToken: z.string().min(1).max(256),
  brand: z.string().min(1).max(30),
  lastFour: z.string().length(4),
  cardHolderName: z.string().min(1).max(255),
  expiryMonth: z.string().min(1).max(2),
  expiryYear: z.string().min(2).max(4),
  alias: z.string().max(100).optional(),
});

router.post(
  "/cards",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const parsed = saveCardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { wompiToken, brand, lastFour, cardHolderName, expiryMonth, expiryYear, alias } = parsed.data;

    const [card] = await db
      .insert(savedCardsTable)
      .values({
        userId: req.user.id,
        wompiToken,
        brand,
        lastFour,
        cardHolderName,
        expiryMonth,
        expiryYear,
        alias: alias ?? null,
      })
      .returning({
        id: savedCardsTable.id,
        brand: savedCardsTable.brand,
        lastFour: savedCardsTable.lastFour,
        cardHolderName: savedCardsTable.cardHolderName,
        expiryMonth: savedCardsTable.expiryMonth,
        expiryYear: savedCardsTable.expiryYear,
        alias: savedCardsTable.alias,
        createdAt: savedCardsTable.createdAt,
      });

    res.status(201).json({ card });
  },
);

const updateCardSchema = z.object({
  alias: z.string().max(100).nullable(),
});

router.patch(
  "/cards/:id",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const parsed = updateCardSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [card] = await db
      .update(savedCardsTable)
      .set({ alias: parsed.data.alias, updatedAt: new Date() })
      .where(and(eq(savedCardsTable.id, id), eq(savedCardsTable.userId, req.user.id)))
      .returning({
        id: savedCardsTable.id,
        brand: savedCardsTable.brand,
        lastFour: savedCardsTable.lastFour,
        alias: savedCardsTable.alias,
      });

    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json({ card });
  },
);

router.delete(
  "/cards/:id",
  requireRole("attendee"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const deleted = await db
      .delete(savedCardsTable)
      .where(and(eq(savedCardsTable.id, id), eq(savedCardsTable.userId, req.user.id)))
      .returning({ id: savedCardsTable.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    res.json({ success: true });
  },
);

export default router;
