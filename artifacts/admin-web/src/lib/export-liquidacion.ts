import ExcelJS from "exceljs";
import type { AdminTicket, EventSummary } from "./api";
import { apiFetchTicketTypes, apiFetchPricingStages } from "./api";

// ─── Palette (matches attendees export) ──────────────────────────────────────
const TEAL  = "00BEC8";
const DARK  = "0A0A0A";
const WHITE = "FFFFFF";
const GREEN = "D1FAE5"; // net-to-promoter highlight
const RED   = "FEE2E2"; // Tapee total highlight

type TicketType = Awaited<ReturnType<typeof apiFetchTicketTypes>>[number];
type PricingStage = Awaited<ReturnType<typeof apiFetchPricingStages>>[number];

function fmt(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "short", year: "numeric",
  });
}

function headerStyle(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number, label: string) {
  const row = ws.getRow(rowIdx);
  row.height = 20;
  ws.mergeCells(rowIdx, 1, rowIdx, colCount);
  const cell = row.getCell(1);
  cell.value = label;
  cell.font = { bold: true, color: { argb: "FF" + WHITE }, size: 10, name: "Calibri" };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TEAL } };
  cell.alignment = { vertical: "middle", indent: 1 };
}

function setCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  opts: { bold?: boolean; bg?: string; align?: ExcelJS.Alignment["horizontal"]; indent?: number } = {},
) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font = { name: "Calibri", size: 10, bold: opts.bold };
  cell.alignment = { vertical: "middle", horizontal: opts.align ?? "left", indent: opts.indent ?? 1 };
  if (opts.bg) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + opts.bg } };
  cell.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
}

export async function downloadLiquidacionExcel(
  rawTickets: AdminTicket[],
  event: EventSummary,
) {
  const currency = event.currencyCode ?? "COP";
  const commissionRate = parseFloat(event.platformCommissionRate ?? "0") / 100;

  // ── Fetch ticket types + pricing stages ──────────────────────────────────
  const ticketTypes = await apiFetchTicketTypes(event.id);
  const stagesByType: Record<string, PricingStage[]> = {};
  await Promise.all(
    ticketTypes.map(async (tt: TicketType) => {
      try {
        const stages = await apiFetchPricingStages(event.id, tt.id);
        if (stages.length) stagesByType[tt.id] = stages.sort((a, b) => a.displayOrder - b.displayOrder);
      } catch { /* no stages */ }
    }),
  );

  // ── Filter non-cancelled tickets ─────────────────────────────────────────
  const tickets = rawTickets.filter(t => t.status !== "cancelled");
  const typeMap = Object.fromEntries(ticketTypes.map((tt: TicketType) => [tt.id, tt]));

  // ── Build breakdown rows: group by (ticketTypeId, unitPrice) ─────────────
  interface BreakdownRow {
    typeName: string;
    stageName: string;
    count: number;
    unitPrice: number;
    serviceFeePerTicket: number;  // average (should be uniform per price level)
    gross: number;
    totalServiceFees: number;
    commission: number;
    netPromoter: number;
  }

  const grouped = new Map<string, BreakdownRow>();
  for (const t of tickets) {
    const typeId = t.ticketTypeId ?? "__unknown__";
    const key = `${typeId}__${t.unitPrice}`;
    const tt = typeId !== "__unknown__" ? typeMap[typeId] : null;

    // Find matching stage name by price
    let stageName = "Precio único";
    const stages = typeId !== "__unknown__" ? (stagesByType[typeId] ?? []) : [];
    if (stages.length > 1) {
      const match = stages.find(s => s.price === t.unitPrice);
      stageName = match ? match.name : `$${t.unitPrice.toLocaleString("es-CO")}`;
    }

    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.gross += t.unitPrice;
      existing.totalServiceFees += t.serviceFeeAmount;
      existing.commission += Math.round(t.unitPrice * commissionRate);
      existing.netPromoter += t.unitPrice - Math.round(t.unitPrice * commissionRate);
    } else {
      grouped.set(key, {
        typeName: tt?.name ?? "Sin tipo",
        stageName,
        count: 1,
        unitPrice: t.unitPrice,
        serviceFeePerTicket: t.serviceFeeAmount,
        gross: t.unitPrice,
        totalServiceFees: t.serviceFeeAmount,
        commission: Math.round(t.unitPrice * commissionRate),
        netPromoter: t.unitPrice - Math.round(t.unitPrice * commissionRate),
      });
    }
  }

  // Sort: by typeName, then by unitPrice asc
  const rows = [...grouped.values()].sort((a, b) =>
    a.typeName.localeCompare(b.typeName) || a.unitPrice - b.unitPrice,
  );

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalTickets     = rows.reduce((s, r) => s + r.count, 0);
  const totalGross       = rows.reduce((s, r) => s + r.gross, 0);
  const totalServiceFees = rows.reduce((s, r) => s + r.totalServiceFees, 0);
  const totalCommission  = rows.reduce((s, r) => s + r.commission, 0);
  const totalTapee       = totalServiceFees + totalCommission;
  const totalNet         = totalGross - totalCommission;

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tapee";
  wb.created = new Date();
  const ws = wb.addWorksheet("Liquidación");

  const DATA_COLS = 8; // columns used in detail table

  // ── Row 1: dark logo bar ──────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, DATA_COLS);
  const logoCell = ws.getCell("A1");
  logoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + DARK } };
  logoCell.value = "TAPEE  ·  Liquidación de Ventas";
  logoCell.font = { bold: true, color: { argb: "FF" + TEAL }, size: 13, name: "Calibri" };
  logoCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 38;

  try {
    const res = await fetch("/tapee-logo.png");
    const buf = await res.arrayBuffer();
    const imgId = wb.addImage({ buffer: buf, extension: "png" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 } as any, ext: { width: 110, height: 42 }, editAs: "oneCell" });
    logoCell.value = "";
  } catch { /* text fallback */ }

  // ── Rows 2–5: event info ──────────────────────────────────────────────────
  const eventDateRange = event.startsAt
    ? event.endsAt && event.endsAt !== event.startsAt
      ? `${fmtDate(event.startsAt)} — ${fmtDate(event.endsAt)}`
      : fmtDate(event.startsAt)
    : "—";

  const infoRows: [string, string][] = [
    ["Evento:",      event.name],
    ["Promotor:",    event.promoterCompanyName ?? "—"],
    ["Fechas:",      eventDateRange],
    ["Generado:",    new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })],
  ];
  infoRows.forEach(([label, value], i) => {
    const r = i + 2;
    ws.mergeCells(r, 2, r, DATA_COLS);
    const lc = ws.getCell(r, 1);
    lc.value = label;
    lc.font = { bold: true, size: 10, name: "Calibri" };
    lc.alignment = { vertical: "middle", indent: 1 };
    ws.getCell(r, 2).value = value;
    ws.getCell(r, 2).font = { size: 10, name: "Calibri" };
    ws.getCell(r, 2).alignment = { vertical: "middle" };
    ws.getRow(r).height = 18;
  });

  // ── Row 6: spacer ─────────────────────────────────────────────────────────
  ws.getRow(6).height = 8;

  // ── Section A: RESUMEN ────────────────────────────────────────────────────
  headerStyle(ws, 7, DATA_COLS, "RESUMEN FINANCIERO");

  const summaryData: [string, string, string?][] = [
    ["Boletas vendidas (excl. canceladas)", String(totalTickets)],
    ["Ingresos brutos de boletas",          fmt(totalGross, currency)],
    ["Cargos por servicio (Tapee)",         fmt(totalServiceFees, currency)],
    [`Comisión de plataforma (${(commissionRate * 100).toFixed(1)}%)`, fmt(totalCommission, currency)],
    ["Total ingresos Tapee",               fmt(totalTapee, currency), RED],
    ["Neto para el promotor",              fmt(totalNet, currency),   GREEN],
  ];

  summaryData.forEach(([label, value, bg], i) => {
    const r = 8 + i;
    ws.getRow(r).height = 18;
    const lc = ws.getCell(r, 1);
    const vc = ws.getCell(r, 2);
    ws.mergeCells(r, 1, r, 4);
    ws.mergeCells(r, 5, r, DATA_COLS);
    lc.value = label;
    lc.font = { bold: !!bg, size: 10, name: "Calibri" };
    lc.alignment = { vertical: "middle", indent: 2 };
    vc.value = value;
    vc.font = { bold: !!bg, size: 10, name: "Calibri" };
    vc.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    if (bg) {
      [lc, vc].forEach(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } }; });
    }
    lc.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
    vc.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
  });

  // ── Row spacer ────────────────────────────────────────────────────────────
  ws.getRow(8 + summaryData.length).height = 10;

  // ── Section B: DETALLE POR TIPO Y ETAPA ──────────────────────────────────
  const detailStart = 8 + summaryData.length + 1;
  headerStyle(ws, detailStart, DATA_COLS, "DETALLE POR TIPO DE BOLETA Y ETAPA DE PRECIO");

  const headers = [
    "Tipo de boleta", "Etapa / Precio", "Boletas", "Precio unit.",
    "Cargo serv./boleta", "Ingreso bruto", "Cargos serv.", "Comisión plat.", // 8 cols
  ];
  // We have 8 data columns — add "Neto promotor" by bumping to 9
  const DETAIL_COLS = 9;
  headers.push("Neto promotor");

  // Re-draw header spanning DETAIL_COLS
  ws.unMergeCells(detailStart, 1, detailStart, DATA_COLS);
  ws.mergeCells(detailStart, 1, detailStart, DETAIL_COLS);
  const hs = ws.getCell(detailStart, 1);
  hs.value = "DETALLE POR TIPO DE BOLETA Y ETAPA DE PRECIO";
  hs.font = { bold: true, color: { argb: "FF" + WHITE }, size: 10, name: "Calibri" };
  hs.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TEAL } };
  hs.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(detailStart).height = 20;

  const hdrRow = ws.getRow(detailStart + 1);
  hdrRow.height = 20;
  headers.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, name: "Calibri", color: { argb: "FF334155" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F7FA" } };
    cell.alignment = { vertical: "middle", horizontal: i <= 1 ? "left" : "right", wrapText: false };
    cell.border = { bottom: { style: "thin", color: { argb: "FF" + TEAL } } };
  });

  rows.forEach((row, i) => {
    const r = detailStart + 2 + i;
    ws.getRow(r).height = 16;
    const isAlt = i % 2 === 1;
    const bgArgb = isAlt ? "FFEFF8F9" : "FF" + WHITE;

    const vals: (string | number)[] = [
      row.typeName,
      row.stageName,
      row.count,
      fmt(row.unitPrice, currency),
      fmt(row.serviceFeePerTicket, currency),
      fmt(row.gross, currency),
      fmt(row.totalServiceFees, currency),
      fmt(row.commission, currency),
      fmt(row.netPromoter, currency),
    ];
    vals.forEach((v, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = v;
      cell.font = { size: 9, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: ci <= 1 ? "left" : "right", indent: ci <= 1 ? 1 : 0 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
    });
    // Highlight net promoter column green
    const netCell = ws.getCell(r, 9);
    netCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
    netCell.font = { size: 9, name: "Calibri", bold: true };
  });

  // Totals row
  const totRow = detailStart + 2 + rows.length;
  ws.getRow(totRow).height = 18;
  const totVals: (string | number)[] = [
    "TOTAL", "",
    totalTickets, "",
    "",
    fmt(totalGross, currency),
    fmt(totalServiceFees, currency),
    fmt(totalCommission, currency),
    fmt(totalNet, currency),
  ];
  totVals.forEach((v, ci) => {
    const cell = ws.getCell(totRow, ci + 1);
    cell.value = v;
    cell.font = { bold: true, size: 10, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.font = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + WHITE } };
    cell.alignment = { vertical: "middle", horizontal: ci <= 1 ? "left" : "right", indent: ci <= 1 ? 1 : 0 };
    cell.border = { top: { style: "thin", color: { argb: "FF" + TEAL } } };
  });
  // Net promoter total — green on dark
  ws.getCell(totRow, 9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

  // ── Column widths ──────────────────────────────────────────────────────────
  const colWidths = [24, 20, 10, 14, 18, 16, 14, 16, 16];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  // ── Download ───────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = event.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  a.download = `liquidacion_${slug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
