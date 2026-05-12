import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ExcelJS from "exceljs";
import type { AdminTicket, EventSummary } from "./api";

const SEX_LABELS: Record<string, string> = { male: "Masculino", female: "Femenino" };

function formatDateOfBirth(raw: string | null | undefined): string {
  if (!raw) return "—";
  // Normalize YYYY-MM-DD → DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-");
    return `${d}/${m}/${y}`;
  }
  return raw;
}

interface Column { header: string; key: string; width: number; }

const BASE_COLUMNS: Column[] = [
  { header: "Nombre",           key: "attendeeName",          width: 24 },
  { header: "Correo",           key: "attendeeEmail",         width: 28 },
  { header: "Teléfono",         key: "attendeePhone",         width: 19 },
  { header: "Documento",        key: "attendeeIdDocument",    width: 18 },
  { header: "Tipo boleta",      key: "_ticketType",           width: 18 },
  { header: "Estado",           key: "status",                width: 13 },
  { header: "Fecha nac.",       key: "attendeeDateOfBirth",   width: 16 },
  { header: "Sexo",             key: "_sex",                  width: 15 },
  { header: "Fecha registro",   key: "_createdAt",            width: 21 },
  { header: "ID boleta",        key: "_idShort",              width: 16 },
  { header: "Orden",            key: "_orderShort",           width: 16 },
];

const RACE_COLUMNS: Column[] = [
  { header: "Nombre",           key: "attendeeName",          width: 24 },
  { header: "Correo",           key: "attendeeEmail",         width: 28 },
  { header: "Teléfono",         key: "attendeePhone",         width: 19 },
  { header: "Documento",        key: "attendeeIdDocument",    width: 18 },
  { header: "Tipo boleta",      key: "_ticketType",           width: 18 },
  { header: "Estado",           key: "status",                width: 13 },
  { header: "Fecha nac.",       key: "attendeeDateOfBirth",   width: 16 },
  { header: "Sexo",             key: "_sex",                  width: 15 },
  { header: "Talla",            key: "shirtSize",             width: 11 },
  { header: "Sangre",           key: "bloodType",             width: 12 },
  { header: "Contacto emerg.",  key: "emergencyContactName",  width: 20 },
  { header: "Tel. emerg.",      key: "emergencyContactPhone", width: 19 },
  { header: "EPS",              key: "eps",                   width: 14 },
  { header: "Fecha registro",   key: "_createdAt",            width: 21 },
  { header: "ID boleta",        key: "_idShort",              width: 16 },
  { header: "Orden",            key: "_orderShort",           width: 16 },
  { header: "#Corredor",        key: "_raceNumber",           width: 14 },
];

function getColumns(event: EventSummary): Column[] {
  return event.category === "race" ? RACE_COLUMNS : BASE_COLUMNS;
}

function rowValues(ticket: AdminTicket, ticketTypeMap: Record<string, string>): Record<string, string> {
  return {
    attendeeName:          ticket.attendeeName ?? "—",
    attendeeEmail:         ticket.attendeeEmail ?? "—",
    attendeePhone:         ticket.attendeePhone ?? "—",
    attendeeIdDocument:    ticket.attendeeIdDocument ?? "—",
    _ticketType:           ticket.ticketTypeId ? (ticketTypeMap[ticket.ticketTypeId] ?? ticket.ticketTypeId.slice(0, 8)) : "—",
    status:                ticket.status,
    attendeeDateOfBirth:   formatDateOfBirth(ticket.attendeeDateOfBirth),
    _sex:                  ticket.attendeeSex ? (SEX_LABELS[ticket.attendeeSex] ?? ticket.attendeeSex) : "—",
    shirtSize:             ticket.shirtSize ?? "—",
    bloodType:             ticket.bloodType ?? "—",
    emergencyContactName:  ticket.emergencyContactName ?? "—",
    emergencyContactPhone: ticket.emergencyContactPhone ?? "—",
    eps:                   ticket.eps ?? "—",
    _createdAt:            new Date(ticket.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    _idShort:              ticket.id ? ticket.id.slice(0, 8) : "—",
    _orderShort:           ticket.orderId ? ticket.orderId.slice(0, 8) : "—",
    _raceNumber:           ticket.raceNumber != null ? String(ticket.raceNumber) : "—",
  };
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function formatEventDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function loadImageAsDataUrl(src: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 129, height: 48 });
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

export function downloadAttendeesCSV(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  event: EventSummary,
) {
  const columns = getColumns(event);
  const headers = columns.map((c) => c.header).join(",");
  const rows = tickets.map((t) => {
    const vals = rowValues(t, ticketTypeMap);
    return columns.map((c) => escapeCsvCell(vals[c.key] ?? "—")).join(",");
  });
  const csv = [headers, ...rows].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = event.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  a.download = `asistentes_${slug}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAttendeesPDF(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  event: EventSummary,
) {
  const columns = getColumns(event);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header background strip
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageWidth, 30, "F");

  // Tapee logo — maintain aspect ratio
  const logo = await loadImageAsDataUrl("/tapee-logo.png");
  let eventNameX = 12;
  if (logo) {
    const logoH = 12;
    const logoW = logoH * (logo.width / logo.height);
    const logoY = (30 - logoH) / 2;
    doc.addImage(logo.dataUrl, "PNG", 8, logoY, logoW, logoH);
    eventNameX = 8 + logoW + 5;
  }

  // Event name
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(event.name, eventNameX, 13);

  // Date range
  const dateRange = event.startsAt
    ? event.endsAt && event.endsAt !== event.startsAt
      ? `${formatEventDate(event.startsAt)} — ${formatEventDate(event.endsAt)}`
      : formatEventDate(event.startsAt)
    : "—";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(dateRange, eventNameX, 19);

  // Promoter
  if (event.promoterCompanyName) {
    doc.text(`Promotor: ${event.promoterCompanyName}`, eventNameX, 24);
  }

  // Generated / count (right-aligned)
  const meta = `${tickets.length} asistentes · ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`;
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(meta, pageWidth - 8, 26, { align: "right" });

  doc.setTextColor(0, 0, 0);

  // Scale column widths proportionally so they always fill the usable page width exactly
  const usableWidth = pageWidth - 16; // 8mm left + 8mm right margin
  const totalRaw = columns.reduce((s, c) => s + c.width, 0);
  const scale = usableWidth / totalRaw;
  const columnStyles: Record<number, { cellWidth: number }> = {};
  columns.forEach((col, i) => { columnStyles[i] = { cellWidth: col.width * scale }; });

  autoTable(doc, {
    startY: 34,
    head: [columns.map((c) => c.header)],
    body: tickets.map((t) => {
      const vals = rowValues(t, ticketTypeMap);
      return columns.map((c) => vals[c.key] ?? "—");
    }),
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: "linebreak",
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [0, 190, 200], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles,
    margin: { left: 8, right: 8 },
  });

  const slug = event.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  doc.save(`asistentes_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─── Excel ───────────────────────────────────────────────────────────────────

const TEAL  = "00BEC8"; // header fill
const DARK  = "0A0A0A"; // logo bar background
const ALT   = "F0FAFA"; // alternate row tint
const WHITE = "FFFFFF";

export async function downloadAttendeesExcel(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  event: EventSummary,
) {
  const columns = getColumns(event);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tapee";
  wb.created = new Date();

  const ws = wb.addWorksheet("Asistentes", { views: [{ state: "frozen", ySplit: 6 }] });

  // ── Logo bar (row 1, merged, dark background) ──────────────────────────────
  ws.mergeCells("A1:C1");
  const logoCell = ws.getCell("A1");
  logoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + DARK } };
  logoCell.value = "TAPEE";
  logoCell.font = { bold: true, color: { argb: "FF" + TEAL }, size: 14, name: "Calibri" };
  logoCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 32;

  // Try to embed the actual logo image
  try {
    const res = await fetch("/tapee-logo.png");
    const buf = await res.arrayBuffer();
    const imgId = wb.addImage({ buffer: buf, extension: "png" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ws.addImage(imgId, { tl: { col: 0.1, row: 0.1 } as any, ext: { width: 110, height: 26 }, editAs: "oneCell" });
    logoCell.value = ""; // image covers it
  } catch { /* logo fetch failed, text fallback stays */ }

  // Fill the rest of row 1 with dark background
  for (let c = 4; c <= columns.length; c++) {
    ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + DARK } };
  }

  // ── Event info block (rows 2–5) ────────────────────────────────────────────
  const infoRows: [string, string][] = [
    ["Evento:",      event.name],
    ["Promotor:",    event.promoterCompanyName ?? "—"],
    ["Fechas:",      event.startsAt
      ? event.endsAt && event.endsAt !== event.startsAt
        ? `${formatEventDate(event.startsAt)} — ${formatEventDate(event.endsAt)}`
        : formatEventDate(event.startsAt)
      : "—"],
    ["Generado:",    new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })],
  ];

  infoRows.forEach(([label, value], i) => {
    const rowIdx = i + 2;
    const labelCell = ws.getCell(rowIdx, 1);
    const valueCell = ws.getCell(rowIdx, 2);
    ws.mergeCells(rowIdx, 2, rowIdx, columns.length);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: "FF334155" }, size: 10 };
    labelCell.alignment = { vertical: "middle", indent: 1 };
    valueCell.value = value;
    valueCell.font = { color: { argb: "FF0F172A" }, size: 10 };
    valueCell.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(rowIdx).height = 18;
  });

  // ── Attendee count (top-right of row 2) ────────────────────────────────────
  // Already merged above; add count as a note in last column of row 1
  const countCell = ws.getCell(1, columns.length);
  countCell.value = `${tickets.length} asistentes`;
  countCell.font = { color: { argb: "FF94A3B8" }, size: 9 };
  countCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + DARK } };

  // ── Column headers (row 6) ─────────────────────────────────────────────────
  const headerRow = ws.getRow(6);
  headerRow.height = 22;
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FF" + WHITE }, size: 10, name: "Calibri" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + TEAL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border = {
      bottom: { style: "medium", color: { argb: "FF007A83" } },
    };
  });

  // ── Data rows (from row 7) ─────────────────────────────────────────────────
  tickets.forEach((ticket, rowOffset) => {
    const vals = rowValues(ticket, ticketTypeMap);
    const dataRow = ws.getRow(7 + rowOffset);
    dataRow.height = 16;
    const isAlt = rowOffset % 2 === 1;
    columns.forEach((col, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = vals[col.key] ?? "—";
      cell.font = { size: 9, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: false };
      if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + ALT } };
      }
      cell.border = {
        bottom: { style: "hair", color: { argb: "FFDDE1E7" } },
      };
    });
  });

  // ── Column widths ──────────────────────────────────────────────────────────
  const charWidths: Record<string, number> = {
    attendeeName: 22, attendeeEmail: 30, attendeePhone: 16, attendeeIdDocument: 16,
    _ticketType: 18, status: 10, attendeeDateOfBirth: 13, _sex: 12,
    shirtSize: 8, bloodType: 8, emergencyContactName: 22, emergencyContactPhone: 18,
    eps: 20, _createdAt: 20, _idShort: 12, _orderShort: 12, _raceNumber: 10,
  };
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = charWidths[col.key] ?? 14;
  });

  // ── Download ───────────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileSlug = event.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  a.download = `asistentes_${fileSlug}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
