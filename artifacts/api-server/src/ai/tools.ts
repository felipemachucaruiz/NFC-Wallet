import {
  db,
  transactionLogsTable,
  transactionLineItemsTable,
  merchantsTable,
  locationsTable,
  locationInventoryTable,
  productsTable,
  braceletsTable,
  eventsTable,
  ticketCheckinsTable,
  ticketsTable,
  ticketOrdersTable,
  ticketTypesTable,
  attendeeRefundRequestsTable,
  topUpsTable,
} from "@workspace/db";
import { eq, and, sql, inArray, ilike, desc, gte } from "drizzle-orm";

// ── OpenAI tool definitions (function-calling schema) ───────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_sales_summary",
      description: "Resumen de ventas cashless del evento (total, ticket promedio, número de transacciones). Acepta un timeframe relativo.",
      parameters: {
        type: "object",
        properties: {
          timeframe: { type: "string", enum: ["last_30_min", "last_1_hour", "last_3_hours", "today", "all"], description: "Ventana de tiempo. 'all' = todo el evento." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_sales_by_merchant",
      description: "Ventas agrupadas por bar/comerciante en el evento, ordenadas por facturación.",
      parameters: {
        type: "object",
        properties: {
          timeframe: { type: "string", enum: ["last_30_min", "last_1_hour", "last_3_hours", "today", "all"] },
          limit: { type: "integer", minimum: 1, maximum: 50, description: "Top N (default 10)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_sales_by_hour",
      description: "Curva temporal de ventas por hora. Útil para detectar picos y valles.",
      parameters: {
        type: "object",
        properties: {
          merchantName: { type: "string", description: "Opcional: filtrar por nombre de bar (búsqueda parcial)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compare_to_previous_hour",
      description: "Compara ventas de la última hora completa vs la hora anterior (% de cambio).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_products",
      description: "Productos más vendidos (por unidades o por revenue).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 30, description: "default 10" },
          sortBy: { type: "string", enum: ["units", "revenue"], description: "default units" },
          timeframe: { type: "string", enum: ["last_30_min", "last_1_hour", "last_3_hours", "today", "all"] },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_payment_method_breakdown",
      description: "Desglose de métodos de pago en recargas (efectivo, transferencia, tarjeta, Nequi, etc.).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "forecast_stockout",
      description: "Proyecta cuándo se va a agotar un producto basado en su velocidad de venta de los últimos 60 minutos y el stock actual.",
      parameters: {
        type: "object",
        required: ["productName"],
        properties: {
          productName: { type: "string", description: "Nombre o parte del nombre del producto (búsqueda parcial, case-insensitive)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_low_stock_products",
      description: "Lista todos los productos con stock bajo o agotándose. Útil para 'qué productos están por acabarse'.",
      parameters: {
        type: "object",
        properties: {
          maxQuantity: { type: "integer", description: "Umbral de stock máximo a listar (default 20)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_product_performance",
      description: "Deep dive de un producto: ventas totales, top horas, top bares que lo venden, stock actual.",
      parameters: {
        type: "object",
        required: ["productName"],
        properties: {
          productName: { type: "string", description: "Búsqueda parcial del nombre" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_merchant_health",
      description: "Salud operativa de bares: cuáles están vendiendo activamente, cuáles llevan rato idle, cuáles nunca han vendido.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_merchant_performance",
      description: "Deep dive de un bar/comerciante específico: ventas totales, ticket promedio, top productos, comparativa.",
      parameters: {
        type: "object",
        required: ["merchantName"],
        properties: {
          merchantName: { type: "string", description: "Nombre o parte del nombre del bar" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_checkin_breakdown",
      description: "Desglose de check-ins (ingresos al evento): total, ritmo por hora, por tipo de boleta.",
      parameters: {
        type: "object",
        properties: {
          byTicketType: { type: "boolean", description: "Si true, agrupa por tipo de boleta" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_event_capacity_status",
      description: "Estado del aforo: capacidad total vs boletas vendidas vs ingresadas vs disponibles.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_event_revenue_projection",
      description: "Proyección de facturación total al final del evento basada en el ritmo actual.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_wallet_behavior_snapshot",
      description: "Métricas de uso de la billetera: activación, recargas, spending, distribución de saldos.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_unclaimed_balances",
      description: "Saldo total atrapado en pulseras (no gastado) y número de pulseras con saldo.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_flagged_bracelets",
      description: "Pulseras marcadas por sospecha de fraude o anomalía.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "default 20" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_ticket_sales_summary",
      description: "Resumen de ventas de boletería: por tipo, etapa activa, sold-outs, % vendido.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_pending_refund_requests",
      description: "Solicitudes de reembolso pendientes de procesar.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "default 20" },
        },
      },
    },
  },
];

function timeframeToDate(timeframe?: string): Date | null {
  const now = Date.now();
  switch (timeframe) {
    case "last_30_min": return new Date(now - 30 * 60 * 1000);
    case "last_1_hour": return new Date(now - 60 * 60 * 1000);
    case "last_3_hours": return new Date(now - 3 * 60 * 60 * 1000);
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "all":
    default:
      return null;
  }
}

export type ToolResult = Record<string, unknown> | { error: string };

export async function executeTool(name: string, args: Record<string, unknown>, eventId: string): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_sales_summary": return await toolSalesSummary(eventId, args);
      case "get_sales_by_merchant": return await toolSalesByMerchant(eventId, args);
      case "get_sales_by_hour": return await toolSalesByHour(eventId, args);
      case "compare_to_previous_hour": return await toolCompareToPreviousHour(eventId);
      case "get_top_products": return await toolTopProducts(eventId, args);
      case "get_payment_method_breakdown": return await toolPaymentMethodBreakdown(eventId);
      case "forecast_stockout": return await toolForecastStockout(eventId, args);
      case "list_low_stock_products": return await toolLowStockProducts(eventId, args);
      case "get_product_performance": return await toolProductPerformance(eventId, args);
      case "get_merchant_health": return await toolMerchantHealth(eventId);
      case "get_merchant_performance": return await toolMerchantPerformance(eventId, args);
      case "get_checkin_breakdown": return await toolCheckinBreakdown(eventId, args);
      case "get_event_capacity_status": return await toolCapacityStatus(eventId);
      case "get_event_revenue_projection": return await toolRevenueProjection(eventId);
      case "get_wallet_behavior_snapshot": return await toolWalletBehavior(eventId);
      case "get_unclaimed_balances": return await toolUnclaimedBalances(eventId);
      case "list_flagged_bracelets": return await toolFlaggedBracelets(eventId, args);
      case "get_ticket_sales_summary": return await toolTicketSalesSummary(eventId);
      case "list_pending_refund_requests": return await toolPendingRefunds(eventId, args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Tool implementations ────────────────────────────────────────────────────

async function toolSalesSummary(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const from = timeframeToDate(args.timeframe as string | undefined);
  const conds = [eq(transactionLogsTable.eventId, eventId)];
  if (from) conds.push(gte(transactionLogsTable.createdAt, from));
  const [row] = await db
    .select({
      gross: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
      net: sql<number>`COALESCE(SUM(${transactionLogsTable.netAmount}), 0)`.mapWith(Number),
      commission: sql<number>`COALESCE(SUM(${transactionLogsTable.commissionAmount}), 0)`.mapWith(Number),
      tip: sql<number>`COALESCE(SUM(${transactionLogsTable.tipAmount}), 0)`.mapWith(Number),
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(and(...conds));
  const count = row?.count ?? 0;
  return {
    timeframe: args.timeframe ?? "all",
    grossRevenue: row?.gross ?? 0,
    netRevenue: row?.net ?? 0,
    commissionCollected: row?.commission ?? 0,
    tipsCollected: row?.tip ?? 0,
    transactionCount: count,
    avgTicket: count > 0 ? Math.round((row?.gross ?? 0) / count) : 0,
  };
}

async function toolSalesByMerchant(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const from = timeframeToDate(args.timeframe as string | undefined);
  const limit = Math.min(Math.max((args.limit as number) ?? 10, 1), 50);
  const conds = [eq(transactionLogsTable.eventId, eventId)];
  if (from) conds.push(gte(transactionLogsTable.createdAt, from));
  const rows = await db
    .select({
      merchantId: transactionLogsTable.merchantId,
      revenue: sql<number>`SUM(${transactionLogsTable.grossAmount})`.mapWith(Number),
      txCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(and(...conds))
    .groupBy(transactionLogsTable.merchantId)
    .orderBy(sql`SUM(${transactionLogsTable.grossAmount}) DESC`)
    .limit(limit);
  const merchantIds = rows.map((r) => r.merchantId);
  const names = merchantIds.length > 0
    ? await db.select({ id: merchantsTable.id, name: merchantsTable.name }).from(merchantsTable).where(inArray(merchantsTable.id, merchantIds))
    : [];
  const nameMap = new Map(names.map((n) => [n.id, n.name]));
  return {
    timeframe: args.timeframe ?? "all",
    merchants: rows.map((r) => ({
      merchantId: r.merchantId,
      name: nameMap.get(r.merchantId) ?? r.merchantId,
      revenue: r.revenue,
      transactionCount: r.txCount,
      avgTicket: r.txCount > 0 ? Math.round(r.revenue / r.txCount) : 0,
    })),
  };
}

async function toolSalesByHour(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const merchantName = (args.merchantName as string | undefined)?.trim();
  let merchantIds: string[] | null = null;
  if (merchantName) {
    const m = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(and(eq(merchantsTable.eventId, eventId), ilike(merchantsTable.name, `%${merchantName}%`)));
    merchantIds = m.map((x) => x.id);
    if (merchantIds.length === 0) return { error: `No se encontró bar con nombre similar a "${merchantName}"` };
  }
  const [ev] = await db.select({ tz: eventsTable.timezone }).from(eventsTable).where(eq(eventsTable.id, eventId));
  const tz = ev?.tz ?? "UTC";
  const conds = [eq(transactionLogsTable.eventId, eventId)];
  if (merchantIds) conds.push(inArray(transactionLogsTable.merchantId, merchantIds));
  const localTs = sql`(${transactionLogsTable.createdAt} AT TIME ZONE ${tz})`;
  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${localTs})`.mapWith(Number).as("hour"),
      day: sql<string>`DATE(${localTs})`.as("day"),
      revenue: sql<number>`SUM(${transactionLogsTable.grossAmount})`.mapWith(Number),
      txCount: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(and(...conds))
    .groupBy(sql`1`, sql`2`)
    .orderBy(sql`2`, sql`1`);
  return {
    timezone: tz,
    merchantFilter: merchantName ?? null,
    buckets: rows.map((r) => ({ day: r.day, hour: r.hour, revenue: r.revenue, transactionCount: r.txCount })),
  };
}

async function toolCompareToPreviousHour(eventId: string): Promise<ToolResult> {
  const now = new Date();
  const startCurrent = new Date(now.getTime() - 60 * 60 * 1000);
  const startPrev = new Date(now.getTime() - 120 * 60 * 1000);
  const [agg] = await db
    .select({
      current: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${startCurrent}), 0)`.mapWith(Number),
      previous: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${startPrev} AND ${transactionLogsTable.createdAt} < ${startCurrent}), 0)`.mapWith(Number),
      currentCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${startCurrent})`.mapWith(Number),
      previousCount: sql<number>`COUNT(*) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${startPrev} AND ${transactionLogsTable.createdAt} < ${startCurrent})`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(and(eq(transactionLogsTable.eventId, eventId), gte(transactionLogsTable.createdAt, startPrev)));
  const current = agg?.current ?? 0;
  const previous = agg?.previous ?? 0;
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;
  return {
    currentHourRevenue: current,
    previousHourRevenue: previous,
    currentHourTransactions: agg?.currentCount ?? 0,
    previousHourTransactions: agg?.previousCount ?? 0,
    pctChange: pct,
    direction: pct == null ? "no_data" : pct > 0 ? "up" : pct < 0 ? "down" : "flat",
  };
}

async function toolTopProducts(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const from = timeframeToDate(args.timeframe as string | undefined);
  const limit = Math.min(Math.max((args.limit as number) ?? 10, 1), 30);
  const sortBy = (args.sortBy as string | undefined) ?? "units";
  const conds = [eq(transactionLogsTable.eventId, eventId)];
  if (from) conds.push(gte(transactionLogsTable.createdAt, from));
  const orderClause = sortBy === "revenue"
    ? sql`SUM(${transactionLineItemsTable.unitPriceSnapshot} * ${transactionLineItemsTable.quantity}) DESC`
    : sql`SUM(${transactionLineItemsTable.quantity}) DESC`;
  const rows = await db
    .select({
      productId: transactionLineItemsTable.productId,
      name: sql<string>`MAX(${transactionLineItemsTable.productNameSnapshot})`.as("name"),
      units: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
      revenue: sql<number>`SUM(${transactionLineItemsTable.unitPriceSnapshot} * ${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(and(...conds))
    .groupBy(transactionLineItemsTable.productId)
    .orderBy(orderClause)
    .limit(limit);
  return {
    timeframe: args.timeframe ?? "all",
    sortBy,
    products: rows.map((r) => ({ productId: r.productId, name: r.name, unitsSold: Number(r.units), revenue: Number(r.revenue) })),
  };
}

async function toolPaymentMethodBreakdown(eventId: string): Promise<ToolResult> {
  // Top-ups by payment method (the recharges that fund cashless spending)
  const rows = await db.execute(sql`
    SELECT t.payment_method as method, COUNT(*)::int as count, COALESCE(SUM(t.amount), 0)::bigint as total
    FROM top_ups t
    INNER JOIN bracelets b ON t.bracelet_uid = b.nfc_uid
    WHERE b.event_id = ${eventId}
    GROUP BY t.payment_method
    ORDER BY total DESC
  `);
  return { topUpsByPaymentMethod: rows.rows };
}

async function toolForecastStockout(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const productName = (args.productName as string).trim();
  if (!productName) return { error: "productName es requerido" };

  // Find matching products in this event's merchants
  const eventMerchants = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.eventId, eventId));
  if (eventMerchants.length === 0) return { error: "Este evento no tiene comerciantes registrados" };
  const merchantIds = eventMerchants.map((m) => m.id);

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(and(inArray(productsTable.merchantId, merchantIds), ilike(productsTable.name, `%${productName}%`)));
  if (products.length === 0) return { error: `No se encontró producto con nombre similar a "${productName}"` };

  const productIds = products.map((p) => p.id);

  // Velocity: units sold in last 60 min
  const sixtyMinAgo = new Date(Date.now() - 60 * 60 * 1000);
  const velocityRows = await db
    .select({
      productId: transactionLineItemsTable.productId,
      unitsLast60Min: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(and(
      eq(transactionLogsTable.eventId, eventId),
      gte(transactionLogsTable.createdAt, sixtyMinAgo),
      inArray(transactionLineItemsTable.productId, productIds),
    ))
    .groupBy(transactionLineItemsTable.productId);
  const velocityMap = new Map(velocityRows.map((v) => [v.productId, Number(v.unitsLast60Min)]));

  // Current stock across all locations for this event
  const stockRows = await db
    .select({
      productId: locationInventoryTable.productId,
      stock: sql<number>`SUM(${locationInventoryTable.quantityOnHand})`.mapWith(Number),
    })
    .from(locationInventoryTable)
    .innerJoin(locationsTable, eq(locationInventoryTable.locationId, locationsTable.id))
    .where(and(eq(locationsTable.eventId, eventId), inArray(locationInventoryTable.productId, productIds)))
    .groupBy(locationInventoryTable.productId);
  const stockMap = new Map(stockRows.map((s) => [s.productId, Number(s.stock)]));

  return {
    products: products.map((p) => {
      const v = velocityMap.get(p.id) ?? 0;
      const stock = stockMap.get(p.id) ?? 0;
      const unitsPerMinute = v / 60;
      const minutesRemaining = unitsPerMinute > 0 ? Math.floor(stock / unitsPerMinute) : null;
      return {
        productId: p.id,
        name: p.name,
        currentStock: stock,
        unitsSoldLast60Min: v,
        unitsPerMinute: Math.round(unitsPerMinute * 100) / 100,
        minutesUntilStockout: minutesRemaining,
        forecastNote: minutesRemaining === null
          ? "Sin ventas en los últimos 60 min — no se puede proyectar"
          : minutesRemaining < 30
            ? "Crítico: agotamiento inminente"
            : minutesRemaining < 90
              ? "Atención: agotamiento en menos de 1.5 horas"
              : "Stock OK por ahora",
      };
    }),
  };
}

async function toolLowStockProducts(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const maxQty = Math.max((args.maxQuantity as number) ?? 20, 1);
  const rows = await db
    .select({
      productId: locationInventoryTable.productId,
      productName: productsTable.name,
      locationId: locationInventoryTable.locationId,
      locationName: locationsTable.name,
      quantityOnHand: locationInventoryTable.quantityOnHand,
      restockTrigger: locationInventoryTable.restockTrigger,
    })
    .from(locationInventoryTable)
    .innerJoin(locationsTable, eq(locationInventoryTable.locationId, locationsTable.id))
    .innerJoin(productsTable, eq(locationInventoryTable.productId, productsTable.id))
    .where(and(eq(locationsTable.eventId, eventId), sql`${locationInventoryTable.quantityOnHand} <= ${maxQty}`))
    .orderBy(locationInventoryTable.quantityOnHand)
    .limit(100);
  return {
    threshold: maxQty,
    items: rows.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      locationId: r.locationId,
      locationName: r.locationName,
      quantityOnHand: r.quantityOnHand,
      belowRestockTrigger: r.quantityOnHand <= (r.restockTrigger ?? 0),
    })),
  };
}

async function toolProductPerformance(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const productName = (args.productName as string).trim();
  const eventMerchants = await db.select({ id: merchantsTable.id }).from(merchantsTable).where(eq(merchantsTable.eventId, eventId));
  if (eventMerchants.length === 0) return { error: "Evento sin comerciantes" };
  const merchantIds = eventMerchants.map((m) => m.id);

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, cost: productsTable.cost })
    .from(productsTable)
    .where(and(inArray(productsTable.merchantId, merchantIds), ilike(productsTable.name, `%${productName}%`)))
    .limit(5);
  if (products.length === 0) return { error: `Sin coincidencias para "${productName}"` };

  const productIds = products.map((p) => p.id);

  const totals = await db
    .select({
      productId: transactionLineItemsTable.productId,
      units: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
      revenue: sql<number>`SUM(${transactionLineItemsTable.unitPriceSnapshot} * ${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(and(eq(transactionLogsTable.eventId, eventId), inArray(transactionLineItemsTable.productId, productIds)))
    .groupBy(transactionLineItemsTable.productId);
  const totalsMap = new Map(totals.map((t) => [t.productId, t]));

  // Top merchants selling this product
  const merchantBreakdown = await db
    .select({
      productId: transactionLineItemsTable.productId,
      merchantId: transactionLogsTable.merchantId,
      units: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(and(eq(transactionLogsTable.eventId, eventId), inArray(transactionLineItemsTable.productId, productIds)))
    .groupBy(transactionLineItemsTable.productId, transactionLogsTable.merchantId)
    .orderBy(sql`SUM(${transactionLineItemsTable.quantity}) DESC`);

  const allMerchantIds = [...new Set(merchantBreakdown.map((m) => m.merchantId))];
  const merchantNames = allMerchantIds.length > 0
    ? await db.select({ id: merchantsTable.id, name: merchantsTable.name }).from(merchantsTable).where(inArray(merchantsTable.id, allMerchantIds))
    : [];
  const nameMap = new Map(merchantNames.map((m) => [m.id, m.name]));

  return {
    products: products.map((p) => {
      const t = totalsMap.get(p.id);
      const merchants = merchantBreakdown.filter((m) => m.productId === p.id).slice(0, 5);
      return {
        productId: p.id,
        name: p.name,
        listPrice: p.price,
        unitsSold: t ? Number(t.units) : 0,
        revenue: t ? Number(t.revenue) : 0,
        topMerchants: merchants.map((m) => ({ name: nameMap.get(m.merchantId) ?? m.merchantId, units: Number(m.units) })),
      };
    }),
  };
}

async function toolMerchantHealth(eventId: string): Promise<ToolResult> {
  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const rows = await db
    .select({
      merchantId: transactionLogsTable.merchantId,
      lastAt: sql<string>`MAX(${transactionLogsTable.createdAt})`,
      totalTx: sql<number>`COUNT(*)`.mapWith(Number),
      recentTx: sql<number>`COUNT(*) FILTER (WHERE ${transactionLogsTable.createdAt} >= ${thirtyMinAgo})`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.eventId, eventId))
    .groupBy(transactionLogsTable.merchantId);
  const merchantIds = rows.map((r) => r.merchantId);
  const allMerchants = await db
    .select({ id: merchantsTable.id, name: merchantsTable.name })
    .from(merchantsTable)
    .where(eq(merchantsTable.eventId, eventId));
  const nameMap = new Map(allMerchants.map((m) => [m.id, m.name]));
  const haveSold = new Set(merchantIds);
  const neverSold = allMerchants.filter((m) => !haveSold.has(m.id));
  return {
    active: rows.filter((r) => r.recentTx > 0).map((r) => ({
      merchantId: r.merchantId,
      name: nameMap.get(r.merchantId) ?? r.merchantId,
      lastTransactionAt: r.lastAt,
      recentTransactions: Number(r.recentTx),
    })),
    idle: rows.filter((r) => r.recentTx === 0).map((r) => {
      const lastAt = new Date(r.lastAt);
      return {
        merchantId: r.merchantId,
        name: nameMap.get(r.merchantId) ?? r.merchantId,
        minutesSinceLastSale: Math.floor((now.getTime() - lastAt.getTime()) / 60000),
        lastTransactionAt: r.lastAt,
      };
    }),
    neverSold: neverSold.map((m) => ({ merchantId: m.id, name: m.name })),
  };
}

async function toolMerchantPerformance(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const merchantName = (args.merchantName as string).trim();
  const candidates = await db
    .select({ id: merchantsTable.id, name: merchantsTable.name })
    .from(merchantsTable)
    .where(and(eq(merchantsTable.eventId, eventId), ilike(merchantsTable.name, `%${merchantName}%`)));
  if (candidates.length === 0) return { error: `No se encontró bar con nombre similar a "${merchantName}"` };
  if (candidates.length > 1) {
    return { error: `Hay varios bares que coinciden: ${candidates.map((c) => c.name).join(", ")}. Sé más específico.` };
  }
  const merchant = candidates[0];

  const [totals] = await db
    .select({
      revenue: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
      txCount: sql<number>`COUNT(*)`.mapWith(Number),
      avgTicket: sql<number>`COALESCE(AVG(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number),
    })
    .from(transactionLogsTable)
    .where(eq(transactionLogsTable.merchantId, merchant.id));

  const topProducts = await db
    .select({
      productId: transactionLineItemsTable.productId,
      name: sql<string>`MAX(${transactionLineItemsTable.productNameSnapshot})`.as("name"),
      units: sql<number>`SUM(${transactionLineItemsTable.quantity})`.mapWith(Number),
      revenue: sql<number>`SUM(${transactionLineItemsTable.unitPriceSnapshot} * ${transactionLineItemsTable.quantity})`.mapWith(Number),
    })
    .from(transactionLineItemsTable)
    .innerJoin(transactionLogsTable, eq(transactionLineItemsTable.transactionLogId, transactionLogsTable.id))
    .where(eq(transactionLogsTable.merchantId, merchant.id))
    .groupBy(transactionLineItemsTable.productId)
    .orderBy(sql`SUM(${transactionLineItemsTable.quantity}) DESC`)
    .limit(5);

  return {
    merchantId: merchant.id,
    name: merchant.name,
    revenue: totals?.revenue ?? 0,
    transactionCount: totals?.txCount ?? 0,
    avgTicket: Math.round(totals?.avgTicket ?? 0),
    topProducts: topProducts.map((p) => ({ name: p.name, unitsSold: Number(p.units), revenue: Number(p.revenue) })),
  };
}

async function toolCheckinBreakdown(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const byType = (args.byTicketType as boolean) === true;
  const [total] = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${ticketCheckinsTable.ticketId})`.mapWith(Number) })
    .from(ticketCheckinsTable)
    .where(eq(ticketCheckinsTable.eventId, eventId));

  const [ticketsValidAgg] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(ticketsTable)
    .where(and(eq(ticketsTable.eventId, eventId), eq(ticketsTable.status, "valid")));

  const totalSold = ticketsValidAgg?.count ?? 0;
  const totalCheckedIn = total?.count ?? 0;

  const result: Record<string, unknown> = {
    totalTicketsValid: totalSold,
    totalCheckedIn,
    pendingEntry: Math.max(totalSold - totalCheckedIn, 0),
    checkinRate: totalSold > 0 ? Math.round((totalCheckedIn / totalSold) * 100) : 0,
  };

  if (byType) {
    const byTypeRows = await db
      .select({
        ticketType: ticketCheckinsTable.ticketType,
        count: sql<number>`COUNT(DISTINCT ${ticketCheckinsTable.ticketId})`.mapWith(Number),
      })
      .from(ticketCheckinsTable)
      .where(eq(ticketCheckinsTable.eventId, eventId))
      .groupBy(ticketCheckinsTable.ticketType);
    result.byTicketType = byTypeRows;
  }
  return result;
}

async function toolCapacityStatus(eventId: string): Promise<ToolResult> {
  const [ev] = await db.select({ capacity: eventsTable.capacity, name: eventsTable.name }).from(eventsTable).where(eq(eventsTable.id, eventId));
  const [soldAgg] = await db.select({ count: sql<number>`COUNT(*)`.mapWith(Number) }).from(ticketsTable).where(and(eq(ticketsTable.eventId, eventId), eq(ticketsTable.status, "valid")));
  const [checkedAgg] = await db.select({ count: sql<number>`COUNT(DISTINCT ${ticketCheckinsTable.ticketId})`.mapWith(Number) }).from(ticketCheckinsTable).where(eq(ticketCheckinsTable.eventId, eventId));
  const capacity = ev?.capacity ?? null;
  const sold = soldAgg?.count ?? 0;
  const checked = checkedAgg?.count ?? 0;
  return {
    capacity,
    ticketsSold: sold,
    ticketsCheckedIn: checked,
    pendingEntry: Math.max(sold - checked, 0),
    seatsAvailable: capacity != null ? Math.max(capacity - sold, 0) : null,
    capacityUtilization: capacity ? Math.round((sold / capacity) * 100) : null,
  };
}

async function toolRevenueProjection(eventId: string): Promise<ToolResult> {
  const [ev] = await db.select({ startsAt: eventsTable.startsAt, endsAt: eventsTable.endsAt, currencyCode: eventsTable.currencyCode }).from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!ev || !ev.endsAt) return { error: "El evento no tiene fecha de fin configurada — no se puede proyectar." };

  const now = new Date();
  const endsAt = new Date(ev.endsAt);
  const startsAt = ev.startsAt ? new Date(ev.startsAt) : new Date(now.getTime() - 60 * 60 * 1000);

  if (now >= endsAt) {
    const [total] = await db.select({ gross: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number) }).from(transactionLogsTable).where(eq(transactionLogsTable.eventId, eventId));
    return { status: "event_ended", finalRevenue: total?.gross ?? 0 };
  }

  const sinceStart = Math.max(now.getTime() - startsAt.getTime(), 60_000);
  const remainingMs = endsAt.getTime() - now.getTime();
  const [agg] = await db.select({ gross: sql<number>`COALESCE(SUM(${transactionLogsTable.grossAmount}), 0)`.mapWith(Number) }).from(transactionLogsTable).where(eq(transactionLogsTable.eventId, eventId));
  const currentRevenue = agg?.gross ?? 0;
  const ratePerMs = currentRevenue / sinceStart;
  const projectedAdditional = Math.round(ratePerMs * remainingMs);
  return {
    currentRevenue,
    minutesSinceStart: Math.round(sinceStart / 60000),
    minutesRemaining: Math.round(remainingMs / 60000),
    projectedAdditionalRevenue: projectedAdditional,
    projectedFinalRevenue: currentRevenue + projectedAdditional,
    note: "Proyección lineal basada en la velocidad promedio desde el inicio del evento. Eventos con curva no lineal (picos en horas pico) pueden divergir significativamente.",
  };
}

async function toolWalletBehavior(eventId: string): Promise<ToolResult> {
  const [braceletAgg] = await db
    .select({
      total: sql<number>`COUNT(*)`.mapWith(Number),
      activated: sql<number>`COUNT(*) FILTER (WHERE ${braceletsTable.lastKnownBalance} > 0 OR ${braceletsTable.lastCounter} > 0)`.mapWith(Number),
      pendingBalance: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalance}), 0)`.mapWith(Number),
    })
    .from(braceletsTable)
    .where(eq(braceletsTable.eventId, eventId));

  const [topupAgg] = await db
    .select({
      totalAmount: sql<number>`COALESCE(SUM(${topUpsTable.amount}), 0)`.mapWith(Number),
      count: sql<number>`COUNT(*)`.mapWith(Number),
      uniqueBraceletsTopped: sql<number>`COUNT(DISTINCT ${topUpsTable.braceletUid})`.mapWith(Number),
    })
    .from(topUpsTable)
    .innerJoin(braceletsTable, eq(topUpsTable.braceletUid, braceletsTable.nfcUid))
    .where(eq(braceletsTable.eventId, eventId));

  const total = braceletAgg?.total ?? 0;
  const activated = braceletAgg?.activated ?? 0;
  const topped = topupAgg?.uniqueBraceletsTopped ?? 0;
  return {
    totalBracelets: total,
    activatedBracelets: activated,
    activationRate: total > 0 ? Math.round((activated / total) * 100) : 0,
    reloadRate: total > 0 ? Math.round((topped / total) * 100) : 0,
    totalTopUpAmount: topupAgg?.totalAmount ?? 0,
    totalTopUpCount: topupAgg?.count ?? 0,
    avgTopUpAmount: (topupAgg?.count ?? 0) > 0 ? Math.round((topupAgg?.totalAmount ?? 0) / (topupAgg?.count ?? 1)) : 0,
    pendingBalanceTotal: braceletAgg?.pendingBalance ?? 0,
  };
}

async function toolUnclaimedBalances(eventId: string): Promise<ToolResult> {
  const [agg] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${braceletsTable.lastKnownBalance}), 0)`.mapWith(Number),
      withBalance: sql<number>`COUNT(*) FILTER (WHERE ${braceletsTable.lastKnownBalance} > 0)`.mapWith(Number),
      avgBalance: sql<number>`COALESCE(AVG(${braceletsTable.lastKnownBalance}) FILTER (WHERE ${braceletsTable.lastKnownBalance} > 0), 0)`.mapWith(Number),
    })
    .from(braceletsTable)
    .where(eq(braceletsTable.eventId, eventId));
  return {
    totalUnclaimedAmount: agg?.total ?? 0,
    braceletsWithBalance: agg?.withBalance ?? 0,
    averageBalance: Math.round(agg?.avgBalance ?? 0),
  };
}

async function toolFlaggedBracelets(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Math.max((args.limit as number) ?? 20, 1), 100);
  const rows = await db
    .select({
      nfcUid: braceletsTable.nfcUid,
      flagReason: braceletsTable.flagReason,
      lastKnownBalance: braceletsTable.lastKnownBalance,
      updatedAt: braceletsTable.updatedAt,
    })
    .from(braceletsTable)
    .where(and(eq(braceletsTable.eventId, eventId), eq(braceletsTable.flagged, true)))
    .orderBy(desc(braceletsTable.updatedAt))
    .limit(limit);
  return { flagged: rows };
}

async function toolTicketSalesSummary(eventId: string): Promise<ToolResult> {
  const [ev] = await db.select({ ticketingEnabled: eventsTable.ticketingEnabled }).from(eventsTable).where(eq(eventsTable.id, eventId));
  if (!ev?.ticketingEnabled) return { enabled: false, note: "Boletería no habilitada en este evento" };

  const types = await db
    .select({
      id: ticketTypesTable.id,
      name: ticketTypesTable.name,
      price: ticketTypesTable.price,
      quantity: ticketTypesTable.quantity,
      soldCount: ticketTypesTable.soldCount,
      isActive: ticketTypesTable.isActive,
    })
    .from(ticketTypesTable)
    .where(eq(ticketTypesTable.eventId, eventId));

  const [orderAgg] = await db
    .select({
      confirmed: sql<number>`COUNT(*) FILTER (WHERE ${ticketOrdersTable.paymentStatus} = 'confirmed')`.mapWith(Number),
      pending: sql<number>`COUNT(*) FILTER (WHERE ${ticketOrdersTable.paymentStatus} = 'pending')`.mapWith(Number),
      revenue: sql<number>`COALESCE(SUM(${ticketOrdersTable.totalAmount}) FILTER (WHERE ${ticketOrdersTable.paymentStatus} = 'confirmed'), 0)`.mapWith(Number),
    })
    .from(ticketOrdersTable)
    .where(eq(ticketOrdersTable.eventId, eventId));

  return {
    enabled: true,
    ticketTypes: types.map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
      quantity: t.quantity,
      soldCount: t.soldCount,
      remaining: Math.max(t.quantity - t.soldCount, 0),
      soldOut: t.soldCount >= t.quantity,
      pctSold: t.quantity > 0 ? Math.round((t.soldCount / t.quantity) * 100) : 0,
      isActive: t.isActive,
    })),
    orders: {
      confirmed: orderAgg?.confirmed ?? 0,
      pending: orderAgg?.pending ?? 0,
      revenueConfirmed: orderAgg?.revenue ?? 0,
    },
  };
}

async function toolPendingRefunds(eventId: string, args: Record<string, unknown>): Promise<ToolResult> {
  const limit = Math.min(Math.max((args.limit as number) ?? 20, 1), 100);
  const rows = await db
    .select({
      id: attendeeRefundRequestsTable.id,
      amount: attendeeRefundRequestsTable.amount,
      refundMethod: attendeeRefundRequestsTable.refundMethod,
      status: attendeeRefundRequestsTable.status,
      braceletUid: attendeeRefundRequestsTable.braceletUid,
      createdAt: attendeeRefundRequestsTable.createdAt,
    })
    .from(attendeeRefundRequestsTable)
    .where(and(eq(attendeeRefundRequestsTable.eventId, eventId), eq(attendeeRefundRequestsTable.status, "pending")))
    .orderBy(desc(attendeeRefundRequestsTable.createdAt))
    .limit(limit);
  return { pendingRefunds: rows, count: rows.length };
}
