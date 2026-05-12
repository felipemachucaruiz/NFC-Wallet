import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { AdminTicket } from "./api";

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

export function downloadAttendeesPDF(
  tickets: AdminTicket[],
  ticketTypeMap: Record<string, string>,
  eventLabel: string,
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(14);
  doc.text(`Asistentes — ${eventLabel}`, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `Generado: ${new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" })}   |   Total: ${tickets.length} asistentes`,
    14,
    21,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 26,
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

  doc.save(`asistentes_${eventLabel}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
