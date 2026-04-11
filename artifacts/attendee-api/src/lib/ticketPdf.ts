import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { logger } from "./logger";

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    logger.warn({ err, url }, "Failed to fetch image for PDF");
    return null;
  }
}

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
  flyerImageUrl?: string | null;
}

async function renderTicketPage(doc: PDFKit.PDFDocument, data: TicketPdfData): Promise<void> {
  const W = 396;
  const H = 612;

  doc.rect(0, 0, W, H).fill("#0a0a0a");

  const flyerH = 200;
  let flyerLoaded = false;

  if (data.flyerImageUrl) {
    const imgBuf = await fetchImageBuffer(data.flyerImageUrl);
    if (imgBuf) {
      try {
        const img = doc.openImage(imgBuf);
        const imgAspect = img.width / img.height;
        const boxAspect = W / flyerH;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (imgAspect > boxAspect) {
          drawH = flyerH;
          drawW = flyerH * imgAspect;
          drawX = (W - drawW) / 2;
          drawY = 0;
        } else {
          drawW = W;
          drawH = W / imgAspect;
          drawX = 0;
          drawY = (flyerH - drawH) / 2;
        }
        doc.save();
        doc.rect(0, 0, W, flyerH).clip();
        doc.image(imgBuf, drawX, drawY, { width: drawW, height: drawH });
        doc.restore();
        flyerLoaded = true;
      } catch (err) {
        logger.warn({ err }, "Failed to embed flyer image in PDF");
      }
    }
  }

  if (!flyerLoaded) {
    doc.rect(0, 0, W, flyerH).fill("#111111");
    doc.fontSize(28).font("Helvetica-Bold").fillColor("#00f1ff")
      .text("tapee", 30, 70, { width: 336, align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#8b949e")
      .text("Eventos Cashless", 30, 105, { width: 336, align: "center" });
  }

  doc.save();
  doc.rect(0, flyerH - 60, W, 60).clip();
  const grad = doc.linearGradient(0, flyerH - 60, 0, flyerH);
  grad.stop(0, "#0a0a0a", 0);
  grad.stop(1, "#0a0a0a", 1);
  doc.rect(0, flyerH - 60, W, 60).fill(grad);
  doc.restore();

  let y = flyerH + 10;

  doc.fontSize(16).font("Helvetica-Bold").fillColor("#ffffff")
    .text(data.eventName, 30, y, { width: 336, align: "center" });
  y += 25;

  const dateStr = data.eventDates.length > 0
    ? data.eventDates.join(" \u2022 ")
    : "";
  if (dateStr) {
    doc.fontSize(10).font("Helvetica").fillColor("#00f1ff")
      .text(dateStr, 30, y, { width: 336, align: "center" });
    y += 18;
  }

  y += 5;

  doc.strokeColor("#333333").lineWidth(0.5)
    .moveTo(30, y).lineTo(366, y).stroke();
  y += 10;

  const labelColor = "#8b949e";
  const valueColor = "#ffffff";

  const addField = (label: string, value: string) => {
    doc.fontSize(8).font("Helvetica").fillColor(labelColor)
      .text(label.toUpperCase(), 30, y, { width: 160 });
    doc.fontSize(10).font("Helvetica-Bold").fillColor(valueColor)
      .text(value, 30, y + 10, { width: 336 });
    y += 26;
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
  y += 8;

  const qrSize = 120;
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

    doc.roundedRect(qrX - 6, y - 6, qrSize + 12, qrSize + 12, 6).fill("#ffffff");
    doc.image(qrBuffer, qrX, y, { width: qrSize, height: qrSize });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR for PDF");
    doc.roundedRect(qrX - 6, y - 6, qrSize + 12, qrSize + 12, 6).fill("#ffffff");
    doc.fontSize(10).fillColor("#ef4444")
      .text("QR no disponible", qrX, y + qrSize / 2 - 5, { width: qrSize, align: "center" });
  }

  y += qrSize + 14;

  doc.fontSize(8).font("Helvetica").fillColor("#8b949e")
    .text("Presenta este codigo QR en la puerta del evento", 30, y, { width: 336, align: "center" });
  y += 12;

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
