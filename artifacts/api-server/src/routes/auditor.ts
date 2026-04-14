import { Router, type IRouter, type Request, type Response } from "express";
import { db, ticketOrdersTable, ticketTypesTable, eventsTable, usersTable, auditorCsvDownloadsTable } from "@workspace/db";
import { eq, and, gte, lte, inArray, sql, desc, count, sum } from "drizzle-orm";
import { requireRole } from "../middlewares/requireRole";
import { z } from "zod";

const router: IRouter = Router();

const isValidDate = (s: string) => !isNaN(Date.parse(s));

const AuditorSalesQuerySchema = z.object({
  eventId: z.string().optional(),
  ticketTypeId: z.string().optional(),
  dateFrom: z.string().optional().refine((s) => s === undefined || isValidDate(s), { message: "dateFrom must be a valid date string" }),
  dateTo: z.string().optional().refine((s) => s === undefined || isValidDate(s), { message: "dateTo must be a valid date string" }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /auditor/ticket-sales
 * Returns paginated confirmed ticket orders across all events.
 * Accessible to ticketing_auditor and admin roles.
 * Supports filtering by eventId, ticketTypeId, dateFrom, dateTo.
 */
router.get(
  "/auditor/ticket-sales",
  requireRole("admin", "ticketing_auditor"),
  async (req: Request, res: Response) => {
    const parsed = AuditorSalesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters", details: parsed.error.flatten() });
      return;
    }

    const { eventId, ticketTypeId, dateFrom, dateTo, page, pageSize } = parsed.data;

    const conditions = [eq(ticketOrdersTable.paymentStatus, "confirmed")];

    if (eventId) {
      conditions.push(eq(ticketOrdersTable.eventId, eventId));
    }

    if (dateFrom) {
      conditions.push(gte(ticketOrdersTable.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ticketOrdersTable.createdAt, toDate));
    }

    // If filtering by ticketTypeId, we need to join with tickets
    // and find orders that contain that ticket type
    let orderIds: string[] | null = null;
    if (ticketTypeId) {
      const { ticketsTable } = await import("@workspace/db");
      const matchingOrders = await db
        .selectDistinct({ orderId: ticketsTable.orderId })
        .from(ticketsTable)
        .where(eq(ticketsTable.ticketTypeId, ticketTypeId));
      orderIds = matchingOrders.map((r) => r.orderId);
      if (orderIds.length === 0) {
        res.json({
          orders: [],
          total: 0,
          page,
          pageSize,
          totals: { totalOrders: 0, totalTickets: 0, totalRevenue: 0 },
        });
        return;
      }
    }

    const whereConditions = orderIds
      ? and(...conditions, inArray(ticketOrdersTable.id, orderIds))
      : and(...conditions);

    // Get totals
    const [totalsRow] = await db
      .select({
        totalOrders: count(ticketOrdersTable.id),
        totalTickets: sum(ticketOrdersTable.ticketCount),
        totalRevenue: sum(ticketOrdersTable.totalAmount),
      })
      .from(ticketOrdersTable)
      .where(whereConditions);

    // Get paginated data
    const orders = await db
      .select({
        orderId: ticketOrdersTable.id,
        eventId: ticketOrdersTable.eventId,
        eventName: eventsTable.name,
        buyerName: ticketOrdersTable.buyerName,
        buyerEmail: ticketOrdersTable.buyerEmail,
        paymentMethod: ticketOrdersTable.paymentMethod,
        wompiTransactionId: ticketOrdersTable.wompiTransactionId,
        ticketCount: ticketOrdersTable.ticketCount,
        totalAmount: ticketOrdersTable.totalAmount,
        saleDate: ticketOrdersTable.createdAt,
      })
      .from(ticketOrdersTable)
      .innerJoin(eventsTable, eq(ticketOrdersTable.eventId, eventsTable.id))
      .where(whereConditions)
      .orderBy(desc(ticketOrdersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      orders,
      total: Number(totalsRow?.totalOrders ?? 0),
      page,
      pageSize,
      totals: {
        totalOrders: Number(totalsRow?.totalOrders ?? 0),
        totalTickets: Number(totalsRow?.totalTickets ?? 0),
        totalRevenue: Number(totalsRow?.totalRevenue ?? 0),
      },
    });
  },
);

/**
 * GET /auditor/ticket-sales/export.csv
 * Streams a CSV export of confirmed ticket orders.
 * Accessible to ticketing_auditor and admin roles.
 * Logs each export to auditor_csv_downloads.
 */
router.get(
  "/auditor/ticket-sales/export.csv",
  requireRole("admin", "ticketing_auditor"),
  async (req: Request, res: Response) => {
    const parsed = AuditorSalesQuerySchema.omit({ page: true, pageSize: true }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query parameters" });
      return;
    }

    const { eventId, ticketTypeId, dateFrom, dateTo } = parsed.data;

    const conditions = [eq(ticketOrdersTable.paymentStatus, "confirmed")];

    if (eventId) {
      conditions.push(eq(ticketOrdersTable.eventId, eventId));
    }

    if (dateFrom) {
      conditions.push(gte(ticketOrdersTable.createdAt, new Date(dateFrom)));
    }

    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ticketOrdersTable.createdAt, toDate));
    }

    let orderIds: string[] | null = null;
    if (ticketTypeId) {
      const { ticketsTable } = await import("@workspace/db");
      const matchingOrders = await db
        .selectDistinct({ orderId: ticketsTable.orderId })
        .from(ticketsTable)
        .where(eq(ticketsTable.ticketTypeId, ticketTypeId));
      orderIds = matchingOrders.map((r) => r.orderId);
    }

    const whereConditions = orderIds !== null
      ? (orderIds.length === 0 ? and(...conditions, sql`false`) : and(...conditions, inArray(ticketOrdersTable.id, orderIds)))
      : and(...conditions);

    const orders = await db
      .select({
        orderId: ticketOrdersTable.id,
        eventName: eventsTable.name,
        buyerName: ticketOrdersTable.buyerName,
        buyerEmail: ticketOrdersTable.buyerEmail,
        paymentMethod: ticketOrdersTable.paymentMethod,
        wompiTransactionId: ticketOrdersTable.wompiTransactionId,
        ticketCount: ticketOrdersTable.ticketCount,
        totalAmount: ticketOrdersTable.totalAmount,
        saleDate: ticketOrdersTable.createdAt,
      })
      .from(ticketOrdersTable)
      .innerJoin(eventsTable, eq(ticketOrdersTable.eventId, eventsTable.id))
      .where(whereConditions)
      .orderBy(desc(ticketOrdersTable.createdAt));

    // Log the CSV download — mandatory for auditability; fail the request if logging fails
    const filters = { eventId, ticketTypeId, dateFrom, dateTo };
    await db.insert(auditorCsvDownloadsTable).values({
      userId: req.user!.id,
      filters,
    });

    // Build CSV
    const csvEscape = (v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = [
      "Evento",
      "ID Orden",
      "Nombre Comprador",
      "Email Comprador",
      "Método de Pago",
      "ID Transacción Wompi",
      "Tickets Comprados",
      "Monto Total (COP)",
      "Fecha y Hora Venta",
    ];

    const rows = orders.map((o) => [
      csvEscape(o.eventName),
      csvEscape(o.orderId),
      csvEscape(o.buyerName),
      csvEscape(o.buyerEmail),
      csvEscape(o.paymentMethod),
      csvEscape(o.wompiTransactionId),
      csvEscape(o.ticketCount),
      csvEscape(o.totalAmount),
      csvEscape(o.saleDate ? new Date(o.saleDate).toISOString() : ""),
    ]);

    // Summary row
    const totalTickets = orders.reduce((s, o) => s + (o.ticketCount ?? 0), 0);
    const totalRevenue = orders.reduce((s, o) => s + (o.totalAmount ?? 0), 0);
    const summaryRow = [
      "TOTALES",
      `${orders.length} órdenes`,
      "",
      "",
      "",
      "",
      String(totalTickets),
      String(totalRevenue),
      "",
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
      summaryRow.join(","),
    ].join("\r\n");

    const filename = `auditoria-ventas-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csvContent); // BOM for Excel compatibility
  },
);

/**
 * GET /auditor/events
 * Returns basic event list for filter dropdowns. Accessible to ticketing_auditor and admin.
 */
router.get(
  "/auditor/events",
  requireRole("admin", "ticketing_auditor"),
  async (_req: Request, res: Response) => {
    const events = await db
      .select({ id: eventsTable.id, name: eventsTable.name })
      .from(eventsTable)
      .orderBy(eventsTable.name);
    res.json({ events });
  },
);

/**
 * GET /auditor/ticket-types
 * Returns ticket types for a given event (for filter dropdowns).
 * Accessible to ticketing_auditor and admin.
 */
router.get(
  "/auditor/ticket-types",
  requireRole("admin", "ticketing_auditor"),
  async (req: Request, res: Response) => {
    const { eventId } = req.query as { eventId?: string };
    if (!eventId) {
      res.json({ ticketTypes: [] });
      return;
    }
    const types = await db
      .select({ id: ticketTypesTable.id, name: ticketTypesTable.name })
      .from(ticketTypesTable)
      .where(eq(ticketTypesTable.eventId, eventId))
      .orderBy(ticketTypesTable.name);
    res.json({ ticketTypes: types });
  },
);

export default router;
