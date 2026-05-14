import { db, transactionLogsTable, transactionLineItemsTable, merchantsTable, braceletsTable, eventsTable, ticketCheckinsTable, ticketsTable, ticketOrdersTable, ticketTypesTable } from "@workspace/db";
import { eq, and, sql, inArray, gte } from "drizzle-orm";

export type EventSnapshot = {
  event: {
    id: string;
    name: string;
    currencyCode: string;
    capacity: number | null;
    ticketingEnabled: boolean;
    nfcBraceletsEnabled: boolean;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
  };
  generatedAt: string;
  sales: {
    grossTotal: number;
    transactionCount: number;
    avgTicket: number;
    last30MinGross: number;
    last30MinCount: number;
  };
  topProducts: Array<{ productId: string; name: string; units: number; revenue: number }>;
  topMerchants: Array<{ merchantId: string; name: string; revenue: number; txCount: number }>;
  merchantsHealth: {
    total: number;
    activeLast30Min: number;
    idleOver30Min: number;
  };
  bracelets: {
    total: number;
    pendingBalanceSum: number;
    flagged: number;
  };
  ticketing: {
    enabled: boolean;
    ticketsSold: number;
    ticketsCheckedIn: number;
    capacity: number | null;
    checkinRate: number;
    revenueConfirmed: number;
  };
};

const fmt = (n: number) => Math.round(n);

export async function buildEventSnapshot(eventId: string): Promise<EventSnapshot> {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

  const [event] = await db
    .select({
      id: eventsTable.id,
      name: eventsTable.name,
      currencyCode: eventsTable.currencyCode,
      capacity: eventsTable.capacity,
      ticketingEnabled: eventsTable.ticketingEnabled,
      nfcBraceletsEnabled: eventsTable.nfcBraceletsEnabled,
      startsAt: eventsTable.startsAt,
      endsAt: eventsTable.endsAt,
      timezone: eventsTable.timezone,
    })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId));

  if (!event) throw new Error(`Event not found: ${eventId}`);

  // Sales aggregates
  const [txAgg] = await db
    .select({
      grossTotal: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
      txCount: sql<number>`COUNT(*)`.mapWith(Number),
      last30MinGross: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${thirtyMinAgo}), 0)`.mapWith(Number),
      last30MinCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${thirtyMinAgo})`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.eventId, eventId));

  const grossTotal = txAgg?.grossTotal ?? 0;
  const txCount = txAgg?.txCount ?? 0;
  const avgTicket = txCount > 0 ? Math.round(grossTotal / txCount) : 0;

  // Top 3 products by units sold
  const topProductsRows = await db
    .select({
      productId: transactionLineItemsTable.productId,
      name: sql<string>`MAX(${transactionLineItemsTable.productNameSnapshot})`.as("name"),
      units: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
      revenue: sql<number>`SUM(${transactionLineItemsTable.unitPriceSnapshot} * ${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(eq(transactionLogsTable.eventId, eventId))
    .groupBy(transactionLineItemsTable.productId)
    .orderBy(sql`SUM(${transactionLineItemsTable.quantity}) DESC`)
    .limit(3);

  // Top 3 merchants by revenue
  const topMerchantsRows = await db
    .select({
      merchantId: transactionLogsTable.merchantId,
      revenue: sql<number>`SUM(${transactionLogsTable.grossAmount})`.mapWith(Number),
      txCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.eventId, eventId))
    .groupBy(transactionLogsTable.merchantId)
    .orderBy(sql`SUM(${transactionLogsTable.grossAmount}) DESC`)
    .limit(3);

  const merchantIds = topMerchantsRows.map((m) => m.merchantId);
  const merchantNames = merchantIds.length > 0
    ? await db.select({ id: merchantsTable.id, name: merchantsTable.name }).from(merchantsTable).where(inArray(merchantsTable.id, merchantIds))
    : [];
  const merchantNameMap = new Map(merchantNames.map((m) => [m.id, m.name]));

  // Merchants health
  const merchantsActivity = await db
    .select({
      merchantId: transactionLogsTable.merchantId,
      lastTx: sql<Date>`MAX(${transactionLogsTable.createdAt})`,
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.eventId, eventId))
    .groupBy(transactionLogsTable.merchantId);

  let activeLast30Min = 0;
  let idleOver30Min = 0;
  for (const m of merchantsActivity) {
    const last = new Date(m.lastTx);
    if (last >= thirtyMinAgo) activeLast30Min++;
    else idleOver30Min++;
  }

  // Bracelets
  const [braceletAgg] = await db
    .select({
      total: sql<number>`COUNT(*)`.mapWith(Number),
      pendingBalanceSum: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalance}), 0)`.mapWith(Number),
      flagged: sql<number>`COUNT(*) FILTER (WHERE ${braceletsTable.flagged} = true)`.mapWith(Number),
    })
    .from(braceletsTable)
    .where(eq(braceletsTable.eventId, eventId));

  // Ticketing (only if enabled)
  let ticketsSold = 0;
  let ticketsCheckedIn = 0;
  let ticketingRevenue = 0;
  if (event.ticketingEnabled) {
    const [tt] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(ticketsTable)
      .where(and(eq(ticketsTable.eventId, eventId), eq(ticketsTable.status, "valid")));
    ticketsSold = tt?.count ?? 0;

    const [ck] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${ticketCheckinsTable.ticketId})`.mapWith(Number) })
      .from(ticketCheckinsTable)
      .where(eq(ticketCheckinsTable.eventId, eventId));
    ticketsCheckedIn = ck?.count ?? 0;

    const [rev] = await db
      .select({ total: sql<number>`COALESCE(SUM(${ticketOrdersTable.totalAmount}), 0)`.mapWith(Number) })
      .from(ticketOrdersTable)
      .where(and(eq(ticketOrdersTable.eventId, eventId), eq(ticketOrdersTable.paymentStatus, "confirmed")));
    ticketingRevenue = rev?.total ?? 0;
  }

  return {
    event: {
      id: event.id,
      name: event.name,
      currencyCode: event.currencyCode,
      capacity: event.capacity,
      ticketingEnabled: event.ticketingEnabled,
      nfcBraceletsEnabled: event.nfcBraceletsEnabled,
      startsAt: event.startsAt ? event.startsAt.toISOString() : null,
      endsAt: event.endsAt ? event.endsAt.toISOString() : null,
      timezone: event.timezone,
    },
    generatedAt: now.toISOString(),
    sales: {
      grossTotal: fmt(grossTotal),
      transactionCount: txCount,
      avgTicket: fmt(avgTicket),
      last30MinGross: fmt(txAgg?.last30MinGross ?? 0),
      last30MinCount: txAgg?.last30MinCount ?? 0,
    },
    topProducts: topProductsRows.map((p) => ({
      productId: p.productId ?? "unknown",
      name: p.name ?? "Sin nombre",
      units: Number(p.units),
      revenue: fmt(Number(p.revenue)),
    })),
    topMerchants: topMerchantsRows.map((m) => ({
      merchantId: m.merchantId,
      name: merchantNameMap.get(m.merchantId) ?? m.merchantId,
      revenue: fmt(Number(m.revenue)),
      txCount: Number(m.txCount),
    })),
    merchantsHealth: {
      total: merchantsActivity.length,
      activeLast30Min,
      idleOver30Min,
    },
    bracelets: {
      total: braceletAgg?.total ?? 0,
      pendingBalanceSum: fmt(braceletAgg?.pendingBalanceSum ?? 0),
      flagged: braceletAgg?.flagged ?? 0,
    },
    ticketing: {
      enabled: event.ticketingEnabled,
      ticketsSold,
      ticketsCheckedIn,
      capacity: event.capacity,
      checkinRate: ticketsSold > 0 ? Math.round((ticketsCheckedIn / ticketsSold) * 100) / 100 : 0,
      revenueConfirmed: fmt(ticketingRevenue),
    },
  };
}

export function formatSnapshotForPrompt(snap: EventSnapshot): string {
  const cur = (n: number) => `${snap.event.currencyCode} ${n.toLocaleString("es-CO")}`;
  return `<event_snapshot generated_at="${snap.generatedAt}">
EVENTO: ${snap.event.name} (id=${snap.event.id})
Moneda: ${snap.event.currencyCode} · Aforo: ${snap.event.capacity ?? "no definido"}
Boletería: ${snap.event.ticketingEnabled ? "activa" : "inactiva"} · Pulseras NFC: ${snap.event.nfcBraceletsEnabled ? "activas" : "inactivas"}
Inicio: ${snap.event.startsAt ?? "N/A"} · Fin: ${snap.event.endsAt ?? "N/A"} · TZ: ${snap.event.timezone}

VENTAS (cashless):
- Total facturado: ${cur(snap.sales.grossTotal)} en ${snap.sales.transactionCount} transacciones
- Ticket promedio: ${cur(snap.sales.avgTicket)}
- Últimos 30 min: ${cur(snap.sales.last30MinGross)} en ${snap.sales.last30MinCount} ventas

TOP PRODUCTOS (por unidades):
${snap.topProducts.map((p, i) => `${i + 1}. ${p.name}: ${p.units} unidades · ${cur(p.revenue)}`).join("\n") || "(sin ventas aún)"}

TOP BARES (por facturación):
${snap.topMerchants.map((m, i) => `${i + 1}. ${m.name}: ${cur(m.revenue)} en ${m.txCount} ventas`).join("\n") || "(sin ventas aún)"}

SALUD DE BARES:
- Total con ventas: ${snap.merchantsHealth.total}
- Activos (<30 min): ${snap.merchantsHealth.activeLast30Min}
- Idle (>30 min sin venta): ${snap.merchantsHealth.idleOver30Min}

PULSERAS NFC:
- Total registradas en este evento: ${snap.bracelets.total}
- Saldo total atrapado (sin gastar): ${cur(snap.bracelets.pendingBalanceSum)}
- Pulseras marcadas (fraude/anomalía): ${snap.bracelets.flagged}

BOLETERÍA:
${snap.ticketing.enabled
  ? `- Boletas vendidas (válidas): ${snap.ticketing.ticketsSold}\n- Check-ins realizados: ${snap.ticketing.ticketsCheckedIn} (${Math.round(snap.ticketing.checkinRate * 100)}%)\n- Facturación boletería confirmada: ${cur(snap.ticketing.revenueConfirmed)}`
  : "- Boletería no habilitada en este evento."}
</event_snapshot>`;
}
