import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { AdminTicket, EventSummary } from "./api";
import { apiFetchTicketTypes, apiFetchPricingStages } from "./api";

// ─── Palette ──────────────────────────────────────────────────────────────────
const TEAL  = "00BEC8";
const DARK  = "0A0A0A";
const WHITE = "FFFFFF";
const GREEN = "D1FAE5";
const RED   = "FEE2E2";

type TicketType   = Awaited<ReturnType<typeof apiFetchTicketTypes>>[number];
type PricingStage = Awaited<ReturnType<typeof apiFetchPricingStages>>[number];

// ─── Shared types ─────────────────────────────────────────────────────────────
export interface LiqBreakdownRow {
  typeName: string;
  stageName: string;
  count: number;
  unitPrice: number;
  serviceFeePerTicket: number;
  gross: number;
  totalServiceFees: number;
  commission: number;
  netPromoter: number;
}

export interface LiqReport {
  currency: string;
  commissionRate: number;
  rows: LiqBreakdownRow[];
  totalTickets: number;
  totalGross: number;
  totalServiceFees: number;
  totalCommission: number;
  totalTapee: number;
  totalNet: number;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmt(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "short", year: "numeric",
  });
}

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function eventSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// ─── Core computation (shared across all formats) ─────────────────────────────
async function buildReport(rawTickets: AdminTicket[], event: EventSummary): Promise<LiqReport> {
  const currency      = event.currencyCode ?? "COP";
  const commissionRate = parseFloat(event.platformCommissionRate ?? "0") / 100;

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

  const tickets  = rawTickets.filter(t => t.status !== "cancelled");
  const typeMap  = Object.fromEntries(ticketTypes.map((tt: TicketType) => [tt.id, tt]));
  const grouped  = new Map<string, LiqBreakdownRow>();

  for (const t of tickets) {
    const typeId = t.ticketTypeId ?? "__unknown__";
    const key    = `${typeId}__${t.unitPrice}`;
    const tt     = typeId !== "__unknown__" ? typeMap[typeId] : null;

    let stageName = "Precio único";
    const stages  = typeId !== "__unknown__" ? (stagesByType[typeId] ?? []) : [];
    if (stages.length > 1) {
      const match = stages.find(s => s.price === t.unitPrice);
      stageName   = match ? match.name : `$${t.unitPrice.toLocaleString("es-CO")}`;
    }

    const ex = grouped.get(key);
    if (ex) {
      ex.count            += 1;
      ex.gross            += t.unitPrice;
      ex.totalServiceFees += t.serviceFeeAmount;
      ex.commission       += Math.round(t.unitPrice * commissionRate);
      ex.netPromoter      += t.unitPrice - Math.round(t.unitPrice * commissionRate);
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

  const rows = [...grouped.values()].sort(
    (a, b) => a.typeName.localeCompare(b.typeName) || a.unitPrice - b.unitPrice,
  );

  const totalTickets     = rows.reduce((s, r) => s + r.count, 0);
  const totalGross       = rows.reduce((s, r) => s + r.gross, 0);
  const totalServiceFees = rows.reduce((s, r) => s + r.totalServiceFees, 0);
  const totalCommission  = rows.reduce((s, r) => s + r.commission, 0);
  const totalTapee       = totalServiceFees + totalCommission;
  const totalNet         = totalGross - totalCommission;

  return { currency, commissionRate, rows, totalTickets, totalGross, totalServiceFees, totalCommission, totalTapee, totalNet };
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
export async function downloadLiquidacionCSV(rawTickets: AdminTicket[], event: EventSummary) {
  const r = await buildReport(rawTickets, event);
  const { currency, rows, totalTickets, totalGross, totalServiceFees, totalCommission, totalNet } = r;

  const headers = [
    "Tipo de boleta", "Etapa / Precio", "Boletas", "Precio unit.",
    "Cargo serv./boleta", "Ingreso bruto", "Cargos serv.", "Comisión plat.", "Neto promotor",
  ];

  const dataRows = rows.map(row => [
    row.typeName,
    row.stageName,
    String(row.count),
    fmt(row.unitPrice, currency),
    fmt(row.serviceFeePerTicket, currency),
    fmt(row.gross, currency),
    fmt(row.totalServiceFees, currency),
    fmt(row.commission, currency),
    fmt(row.netPromoter, currency),
  ].map(escapeCsv).join(","));

  const totalsRow = [
    "TOTAL", "", String(totalTickets), "", "",
    fmt(totalGross, currency),
    fmt(totalServiceFees, currency),
    fmt(totalCommission, currency),
    fmt(totalNet, currency),
  ].map(escapeCsv).join(",");

  const csv = [headers.map(escapeCsv).join(","), ...dataRows, totalsRow].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `liquidacion_${eventSlug(event.name)}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function loadLogoDataUrl(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res    = await fetch("/tapee-logo.png");
    const blob   = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror   = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>(resolve => {
      const img   = new Image();
      img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 864, h: 326 });
      img.src     = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch { return null; }
}

export async function downloadLiquidacionPDF(rawTickets: AdminTicket[], event: EventSummary) {
  const rep = await buildReport(rawTickets, event);
  const { currency, commissionRate, rows, totalTickets, totalGross, totalServiceFees, totalCommission, totalNet } = rep;

  const doc       = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW     = doc.internal.pageSize.getWidth();
  const HEADER_H  = 28;

  // ── Dark header bar ────────────────────────────────────────────────────────
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageW, HEADER_H, "F");

  const logo = await loadLogoDataUrl();
  let textX  = 10;
  if (logo) {
    const lH = 11;
    const lW = lH * (logo.w / logo.h);
    doc.addImage(logo.dataUrl, "PNG", 8, (HEADER_H - lH) / 2, lW, lH);
    textX = 8 + lW + 5;
  }
  doc.setTextColor(0, 190, 200);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Liquidación de Ventas", textX, HEADER_H / 2 + 4);

  // ── Event info block ───────────────────────────────────────────────────────
  const eventDateRange = event.startsAt
    ? event.endsAt && event.endsAt !== event.startsAt
      ? `${fmtDate(event.startsAt)} — ${fmtDate(event.endsAt)}`
      : fmtDate(event.startsAt)
    : "—";

  let y = HEADER_H + 7;
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  const infoLines: [string, string][] = [
    ["Evento:",    event.name],
    ["Promotor:",  event.promoterCompanyName ?? "—"],
    ["Fechas:",    eventDateRange],
    ["Generado:",  new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })],
  ];
  infoLines.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");   doc.text(label, 10, y);
    doc.setFont("helvetica", "normal"); doc.text(value, 32, y);
    y += 5;
  });

  y += 3;

  // ── RESUMEN FINANCIERO ────────────────────────────────────────────────────
  const summaryRows: [string, string, boolean][] = [
    ["Boletas vendidas (excl. canceladas)", String(totalTickets),                          false],
    ["Ingresos brutos de boletas",          fmt(totalGross, currency),                    false],
    ["Cargos por servicio (Tapee)",         fmt(totalServiceFees, currency),              false],
    [`Comisión de plataforma (${(commissionRate * 100).toFixed(1)}%)`, fmt(totalCommission, currency), false],
    ["Total ingresos Tapee",                fmt(totalCommission + totalServiceFees, currency), true],
    ["Neto para el promotor",               fmt(totalNet, currency),                      true],
  ];

  autoTable(doc, {
    startY: y,
    head: [["RESUMEN FINANCIERO", ""]],
    body: summaryRows.map(([label, value]) => [label, value]),
    columnStyles: { 0: { cellWidth: 100 }, 1: { halign: "right", cellWidth: 50 } },
    headStyles: { fillColor: [0, 190, 200], textColor: 255, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    didParseCell(data) {
      const [, , highlight] = summaryRows[data.row.index] ?? [, , false];
      if (highlight && data.section === "body") {
        data.cell.styles.fontStyle = "bold";
        if (data.column.index === 1) {
          data.cell.styles.textColor = data.row.index === summaryRows.length - 1
            ? [4, 120, 87]   // green — net promoter
            : [185, 28, 28]; // red   — tapee total
        }
      }
    },
    margin: { left: 10, right: 10 },
    tableWidth: 160,
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── DETALLE POR TIPO Y ETAPA ──────────────────────────────────────────────
  const detailHeaders = [
    "Tipo de boleta", "Etapa / Precio", "Boletas", "Precio unit.",
    "Cargo serv./boleta", "Ingreso bruto", "Cargos serv.", "Comisión plat.", "Neto promotor",
  ];

  const detailRows = rows.map(r => [
    r.typeName, r.stageName, String(r.count),
    fmt(r.unitPrice, currency), fmt(r.serviceFeePerTicket, currency),
    fmt(r.gross, currency), fmt(r.totalServiceFees, currency),
    fmt(r.commission, currency), fmt(r.netPromoter, currency),
  ]);

  const totalsRow = [
    "TOTAL", "", String(totalTickets), "", "",
    fmt(totalGross, currency), fmt(totalServiceFees, currency),
    fmt(totalCommission, currency), fmt(totalNet, currency),
  ];

  const usableW  = pageW - 20;
  const rawW     = [28, 22, 12, 18, 20, 18, 16, 18, 18];
  const totalRaw = rawW.reduce((s, w) => s + w, 0);
  const scale    = usableW / totalRaw;

  autoTable(doc, {
    startY: y,
    head: [detailHeaders],
    body: detailRows,
    foot: [totalsRow],
    columnStyles: Object.fromEntries(
      rawW.map((w, i) => [i, { cellWidth: w * scale, halign: i <= 1 ? "left" : "right" }])
    ),
    headStyles: { fillColor: [0, 190, 200], textColor: 255, fontStyle: "bold", fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    footStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 7 },
    didParseCell(data) {
      if (data.section === "foot" && data.column.index === 8) {
        data.cell.styles.textColor = [52, 211, 153];
      }
      if (data.section === "body" && data.column.index === 8) {
        data.cell.styles.textColor = [4, 120, 87];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`liquidacion_${eventSlug(event.name)}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Excel ────────────────────────────────────────────────────────────────────
function excelHeaderStyle(ws: ExcelJS.Worksheet, rowIdx: number, colCount: number, label: string) {
  ws.mergeCells(rowIdx, 1, rowIdx, colCount);
  const row  = ws.getRow(rowIdx);
  row.height = 20;
  const cell = row.getCell(1);
  cell.value     = label;
  cell.font      = { bold: true, color: { argb: "FF" + WHITE }, size: 10, name: "Calibri" };
  cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TEAL } };
  cell.alignment = { vertical: "middle", indent: 1 };
}

export async function downloadLiquidacionExcel(rawTickets: AdminTicket[], event: EventSummary) {
  const rep = await buildReport(rawTickets, event);
  const { currency, commissionRate, rows, totalTickets, totalGross, totalServiceFees, totalCommission, totalTapee, totalNet } = rep;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Tapee";
  wb.created = new Date();
  const ws = wb.addWorksheet("Liquidación");
  const DATA_COLS = 8;

  // ── Row 1: dark logo bar ───────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, DATA_COLS);
  const logoCell = ws.getCell("A1");
  logoCell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + DARK } };
  logoCell.value     = "TAPEE  ·  Liquidación de Ventas";
  logoCell.font      = { bold: true, color: { argb: "FF" + TEAL }, size: 13, name: "Calibri" };
  logoCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 38;

  try {
    const res   = await fetch("/tapee-logo.png");
    const buf   = await res.arrayBuffer();
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
    ["Evento:",    event.name],
    ["Promotor:",  event.promoterCompanyName ?? "—"],
    ["Fechas:",    eventDateRange],
    ["Generado:",  new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })],
  ];
  infoRows.forEach(([label, value], i) => {
    const r = i + 2;
    ws.mergeCells(r, 2, r, DATA_COLS);
    const lc = ws.getCell(r, 1);
    lc.value     = label;
    lc.font      = { bold: true, size: 10, name: "Calibri" };
    lc.alignment = { vertical: "middle", indent: 1 };
    const vc = ws.getCell(r, 2);
    vc.value     = value;
    vc.font      = { size: 10, name: "Calibri" };
    vc.alignment = { vertical: "middle" };
    ws.getRow(r).height = 18;
  });

  ws.getRow(6).height = 8;

  // ── Section A: RESUMEN ────────────────────────────────────────────────────
  excelHeaderStyle(ws, 7, DATA_COLS, "RESUMEN FINANCIERO");

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
    ws.mergeCells(r, 1, r, 4);
    ws.mergeCells(r, 5, r, DATA_COLS);
    const lc = ws.getCell(r, 1);
    const vc = ws.getCell(r, 5);
    lc.value     = label;
    lc.font      = { bold: !!bg, size: 10, name: "Calibri" };
    lc.alignment = { vertical: "middle", indent: 2 };
    vc.value     = value;
    vc.font      = { bold: !!bg, size: 10, name: "Calibri" };
    vc.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    if (bg) {
      [lc, vc].forEach(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } }; });
    }
    lc.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
    vc.border = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
  });

  ws.getRow(8 + summaryData.length).height = 10;

  // ── Section B: DETALLE ────────────────────────────────────────────────────
  const detailStart = 8 + summaryData.length + 1;
  const DETAIL_COLS = 9;

  ws.mergeCells(detailStart, 1, detailStart, DETAIL_COLS);
  const hs = ws.getCell(detailStart, 1);
  hs.value     = "DETALLE POR TIPO DE BOLETA Y ETAPA DE PRECIO";
  hs.font      = { bold: true, color: { argb: "FF" + WHITE }, size: 10, name: "Calibri" };
  hs.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TEAL } };
  hs.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(detailStart).height = 20;

  const detailHeaders = [
    "Tipo de boleta", "Etapa / Precio", "Boletas", "Precio unit.",
    "Cargo serv./boleta", "Ingreso bruto", "Cargos serv.", "Comisión plat.", "Neto promotor",
  ];
  const hdrRow = ws.getRow(detailStart + 1);
  hdrRow.height = 20;
  detailHeaders.forEach((h, i) => {
    const cell     = hdrRow.getCell(i + 1);
    cell.value     = h;
    cell.font      = { bold: true, size: 9, name: "Calibri", color: { argb: "FF334155" } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F7FA" } };
    cell.alignment = { vertical: "middle", horizontal: i <= 1 ? "left" : "right" };
    cell.border    = { bottom: { style: "thin", color: { argb: "FF" + TEAL } } };
  });

  rows.forEach((row, i) => {
    const r      = detailStart + 2 + i;
    ws.getRow(r).height = 16;
    const bgArgb = i % 2 === 1 ? "FFEFF8F9" : "FF" + WHITE;
    const vals: (string | number)[] = [
      row.typeName, row.stageName, row.count,
      fmt(row.unitPrice, currency), fmt(row.serviceFeePerTicket, currency),
      fmt(row.gross, currency), fmt(row.totalServiceFees, currency),
      fmt(row.commission, currency), fmt(row.netPromoter, currency),
    ];
    vals.forEach((v, ci) => {
      const cell     = ws.getCell(r, ci + 1);
      cell.value     = v;
      cell.font      = { size: 9, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: ci <= 1 ? "left" : "right", indent: ci <= 1 ? 1 : 0 };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: bgArgb } };
      cell.border    = { bottom: { style: "hair", color: { argb: "FFDDE1E7" } } };
    });
    const netCell  = ws.getCell(r, 9);
    netCell.fill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
    netCell.font   = { size: 9, name: "Calibri", bold: true };
  });

  const totRow = detailStart + 2 + rows.length;
  ws.getRow(totRow).height = 18;
  const totVals: (string | number)[] = [
    "TOTAL", "", totalTickets, "", "",
    fmt(totalGross, currency), fmt(totalServiceFees, currency),
    fmt(totalCommission, currency), fmt(totalNet, currency),
  ];
  totVals.forEach((v, ci) => {
    const cell     = ws.getCell(totRow, ci + 1);
    cell.value     = v;
    cell.font      = { bold: true, size: 10, name: "Calibri", color: { argb: "FF" + WHITE } };
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: ci <= 1 ? "left" : "right", indent: ci <= 1 ? 1 : 0 };
    cell.border    = { top: { style: "thin", color: { argb: "FF" + TEAL } } };
  });
  ws.getCell(totRow, 9).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };

  const colWidths = [24, 20, 10, 14, 18, 16, 14, 16, 16];
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `liquidacion_${eventSlug(event.name)}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
