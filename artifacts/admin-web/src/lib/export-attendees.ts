import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AdminTicket, EventSummary } from "./api";

const SEX_LABELS: Record<string, string> = { male: "Masculino", female: "Femenino" };

const COLUMNS = [
  { header: "Nombre",           key: "attendeeName" },
  { header: "Correo",           key: "attendeeEmail" },
  { header: "Teléfono",         key: "attendeePhone" },
  { header: "Documento",        key: "attendeeIdDocument" },
  { header: "Tipo boleta",      key: "_ticketType" },
  { header: "Estado",           key: "status" },
  { header: "Fecha nac.",       key: "attendeeDateOfBirth" },
  { header: "Sexo",             key: "_sex" },
  { header: "Talla camiseta",   key: "shirtSize" },
  { header: "Tipo de sangre",   key: "bloodType" },
  { header: "Contacto emerg.",  key: "emergencyContactName" },
  { header: "Tel. emergencia",  key: "emergencyContactPhone" },
  { header: "EPS",              key: "eps" },
  { header: "Fecha registro",   key: "_createdAt" },
  { header: "ID boleta",        key: "id" },
  { header: "Orden",            key: "orderId" },
] as const;

type ColKey = typeof COLUMNS[number]["key"];

function rowValues(ticket: AdminTicket, ticketTypeMap: Record<string, string>): Record<ColKey, string> {
  return {
    attendeeName:          ticket.attendeeName ?? "—",
    attendeeEmail:         ticket.attendeeEmail ?? "—",
    attendeePhone:         ticket.attendeePhone ?? "—",
    attendeeIdDocument:    ticket.attendeeIdDocument ?? "—",
    _ticketType:           ticket.ticketTypeId ? (ticketTypeMap[ticket.ticketTypeId] ?? ticket.ticketTypeId.slice(0, 8)) : "—",
    status:                ticket.status,
    attendeeDateOfBirth:   ticket.attendeeDateOfBirth ?? "—",
    _sex:                  ticket.attendeeSex ? (SEX_LABELS[ticket.attendeeSex] ?? ticket.attendeeSex) : "—",
    shirtSize:             ticket.shirtSize ?? "—",
    bloodType:             ticket.bloodType ?? "—",
    emergencyContactName:  ticket.emergencyContactName ?? "—",
    emergencyContactPhone: ticket.emergencyContactPhone ?? "—",
    eps:                   ticket.eps ?? "—",
    _createdAt:            new Date(ticket.createdAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    id:                    ticket.id,
    orderId:               ticket.orderId,
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

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function downloadAttendeesCSV(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  eventLabel: string,
) {
  const headers = COLUMNS.map((c) => c.header).join(",");
  const rows = tickets.map((t) => {
    const vals = rowValues(t, ticketTypeMap);
    return COLUMNS.map((c) => escapeCsvCell(vals[c.key])).join(",");
  });
  const csv = [headers, ...rows].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `asistentes_${eventLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAttendeesPDF(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  event: EventSummary,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header background strip
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageWidth, 30, "F");

  // Tapee logo
  const logoData = await loadImageAsDataUrl("/tapee-logo.png");
  if (logoData) {
    doc.addImage(logoData, "PNG", 8, 5, 20, 20);
  }

  // Event name
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.text(event.name, 32, 13);

  // Date range
  const dateRange = event.startsAt
    ? event.endsAt && event.endsAt !== event.startsAt
      ? `${formatEventDate(event.startsAt)} — ${formatEventDate(event.endsAt)}`
      : formatEventDate(event.startsAt)
    : "—";
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(dateRange, 32, 19);

  // Promoter
  if (event.promoterCompanyName) {
    doc.text(`Promotor: ${event.promoterCompanyName}`, 32, 24);
  }

  // Generated / count (right-aligned)
  const meta = `${tickets.length} asistentes · ${new Date().toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}`;
  doc.setFontSize(7);
  doc.setTextColor(140, 140, 140);
  doc.text(meta, pageWidth - 8, 26, { align: "right" });

  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 34,
    head: [COLUMNS.map((c) => c.header)],
    body: tickets.map((t) => {
      const vals = rowValues(t, ticketTypeMap);
      return COLUMNS.map((c) => vals[c.key]);
    }),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [0, 190, 200], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 8, right: 8 },
  });

  const slug = event.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  doc.save(`asistentes_${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
