import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { logger } from "./logger";

export interface TicketPdfData {
  attendeeName: string;
  eventName: string;
  eventDates: string[];
  venueName: string;
  venueAddress: string;
  sectionName: string;
  ticketTypeName: string;
  validDays: string[];
  qrCodeToken: string;
  ticketId: string;
  orderId: string;
}

async function renderTicketPage(doc: PDFKit.PDFDocument, data: TicketPdfData): Promise<void> {
  const W = 396;
  const pageOriginY = doc.page.margins.top ? 0 : 0;

  doc.rect(0, pageOriginY, W, 612).fill("#0a0a0a");

  doc.rect(0, pageOriginY, W, 90).fill("#111111");

  doc.fontSize(28).font("Helvetica-Bold").fillColor("#00f1ff")
    .text("tapee", 30, pageOriginY + 25, { width: 336, align: "center" });
  doc.fontSize(10).font("Helvetica").fillColor("#8b949e")
    .text("Eventos Cashless", 30, pageOriginY + 58, { width: 336, align: "center" });

  const contentTop = pageOriginY + 105;

  doc.fontSize(16).font("Helvetica-Bold").fillColor("#ffffff")
    .text(data.eventName, 30, contentTop, { width: 336, align: "center" });

  let y = contentTop + 30;

  const dateStr = data.eventDates.length > 0
    ? data.eventDates.join(" \u2022 ")
    : "";
  if (dateStr) {
    doc.fontSize(10).font("Helvetica").fillColor("#00f1ff")
      .text(dateStr, 30, y, { width: 336, align: "center" });
    y += 18;
  }

  y += 10;

  doc.strokeColor("#333333").lineWidth(0.5)
    .moveTo(30, y).lineTo(366, y).stroke();
  y += 15;

  const labelColor = "#8b949e";
  const valueColor = "#ffffff";

  const addField = (label: string, value: string) => {
    doc.fontSize(9).font("Helvetica").fillColor(labelColor)
      .text(label.toUpperCase(), 30, y, { width: 160 });
    doc.fontSize(11).font("Helvetica-Bold").fillColor(valueColor)
      .text(value, 30, y + 12, { width: 336 });
    y += 32;
  };

  addField("Asistente", data.attendeeName);
  addField("Lugar", data.venueName);
  if (data.venueAddress && data.venueAddress !== data.venueName) {
    addField("Direccion", data.venueAddress);
  }
  addField("Seccion", data.sectionName);
  addField("Tipo", data.ticketTypeName);

  const validDaysStr = data.validDays.length > 0
    ? data.validDays.join(", ")
    : "Todos los dias";
  addField("Dias validos", validDaysStr);

  doc.strokeColor("#333333").lineWidth(0.5)
    .moveTo(30, y).lineTo(366, y).stroke();
  y += 15;

  const qrSize = 150;
  const qrX = (W - qrSize) / 2;

  try {
    const qrDataUrl = await QRCode.toDataURL(data.qrCodeToken, {
      width: qrSize * 2,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });

    const qrImageData = qrDataUrl.replace(/^data:image\/png;base64,/, "");
    const qrBuffer = Buffer.from(qrImageData, "base64");

    doc.roundedRect(qrX - 8, y - 8, qrSize + 16, qrSize + 16, 8).fill("#ffffff");
    doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR for PDF");
    doc.roundedRect(qrX - 8, y - 8, qrSize + 16, qrSize + 16, 8).fill("#ffffff");
    doc.fontSize(10).fillColor("#ef4444")
      .text("QR no disponible", qrX, y + qrSize / 2 - 5, { width: qrSize, align: "center" });
  }

  y += qrSize + 20;

  doc.fontSize(8).font("Helvetica").fillColor("#8b949e")
    .text("Presenta este codigo QR en la puerta del evento", 30, y, { width: 336, align: "center" });
  y += 14;

  doc.fontSize(7).font("Helvetica").fillColor("#555555")
    .text(`Orden: ${data.orderId.slice(0, 8)} | Ticket: ${data.ticketId.slice(0, 8)}`, 30, y, { width: 336, align: "center" });
}

export async function generateTicketPdf(data: TicketPdfData): Promise<Buffer> {
  return generateMultiTicketPdf([data]);
}

export async function generateMultiTicketPdf(tickets: TicketPdfData[]): Promise<Buffer> {
  if (tickets.length === 0) throw new Error("No tickets to generate PDF for");

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [396, 612],
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        info: {
          Title: `Tapee - ${tickets[0].eventName}`,
          Author: "Tapee",
          Subject: tickets.length === 1
            ? `Ticket for ${tickets[0].attendeeName}`
            : `${tickets.length} tickets for ${tickets[0].eventName}`,
        },
        autoFirstPage: false,
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      for (let i = 0; i < tickets.length; i++) {
        doc.addPage({ size: [396, 612], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        await renderTicketPage(doc, tickets[i]);
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
