import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST = path.join(__dirname, "dist/public");
const API_BASE = "https://attendee.tapee.app/attendee-api/api";
const STORAGE_ORIGIN = "https://prod.tapee.app";
const SITE = "https://tapeetickets.com";

const BOT_RE =
  /Googlebot|AdsBot-Google|Twitterbot|facebookexternalhit|WhatsApp|Slackbot|LinkedInBot|TelegramBot|Discordbot|Pinterest|Bingbot|YandexBot|Applebot|Bytespider|crawler|spider|bot\b/i;

const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: blob: https://images.unsplash.com https://prod.tapee.app https://flagcdn.com https://*.basemaps.cartocdn.com https://api.qrserver.com https://attendee.tapee.app; " +
  "frame-src 'self' https://challenges.cloudflare.com https://wompi.co https://checkout.wompi.co https://*.wompi.co; " +
  "connect-src 'self' https://attendee.tapee.app https://prod.tapee.app https://wompi.co https://checkout.wompi.co https://*.wompi.co https://*.sentry.io https://sentry.io https://accounts.google.com; " +
  "object-src 'none'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; upgrade-insecure-requests; block-all-mixed-content";

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".map": "application/json",
};

function getMime(ext) {
  return MIME[ext] || "application/octet-stream";
}

function resolveImageUrl(p) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return `${STORAGE_ORIGIN}${p}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchEventData(slugOrId) {
  try {
    const res = await fetch(`${API_BASE}/public/events/${encodeURIComponent(slugOrId)}`, {
      headers: { "User-Agent": "TapeeBot/1.0 (SEO prerender)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchHomeEvents() {
  try {
    const res = await fetch(`${API_BASE}/public/events?limit=20`, {
      headers: { "User-Agent": "TapeeBot/1.0 (SEO prerender)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.events || [];
  } catch {
    return [];
  }
}

function buildHomeHTML(events) {
  const websiteSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "name": "Tapee Tickets",
        "url": SITE,
        "potentialAction": {
          "@type": "SearchAction",
          "target": { "@type": "EntryPoint", "urlTemplate": `${SITE}/?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "name": "Tapee",
        "url": SITE,
        "logo": { "@type": "ImageObject", "url": `${SITE}/favicon.png` },
        "contactPoint": {
          "@type": "ContactPoint",
          "contactType": "customer support",
          "email": "soporte@tapee.app",
          "areaServed": "CO",
        },
      },
    ],
  };

  const eventItems = events
    .map((e) => {
      const slug = e.slug || e.id;
      const img = resolveImageUrl(e.coverImageUrl || e.flyerImageUrl);
      return `  <li><a href="${SITE}/event/${slug}">${escapeHtml(e.name)}</a>${img ? ` — <img src="${img}" alt="${escapeHtml(e.name)}" loading="lazy" width="400" height="400" />` : ""}</li>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tapee Tickets - Compra boletas para los mejores eventos en Colombia</title>
  <meta name="description" content="Compra boletas para conciertos, festivales, deportes y teatro en Colombia. Plataforma segura con tecnología NFC." />
  <link rel="canonical" href="${SITE}/" />
  <meta property="og:site_name" content="Tapee Tickets" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE}/" />
  <meta property="og:title" content="Tapee Tickets - Boletas para eventos en Colombia" />
  <meta property="og:description" content="Descubre y compra boletas para los mejores eventos en Colombia." />
  <meta property="og:image" content="${SITE}/og-default.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tapeeapp" />
  <meta name="twitter:image" content="${SITE}/og-default.jpg" />
  <script type="application/ld+json">${JSON.stringify(websiteSchema)}</script>
</head>
<body>
  <h1>Tapee Tickets — Boletas para los mejores eventos en Colombia</h1>
  <p>Compra boletas para conciertos, festivales, deportes y teatro. Plataforma segura con tecnología NFC.</p>
  ${events.length > 0 ? `<h2>Próximos eventos</h2>\n<ul>\n${eventItems}\n</ul>` : ""}
  <p><a href="${SITE}">Ver todos los eventos</a></p>
</body>
</html>`;
}

function buildEventHTML(data, slugOrId) {
  const { event, venues, ticketTypes, promoterCompany } = data;
  const venue = venues?.[0];
  const image = resolveImageUrl(event.coverImageUrl || event.flyerImageUrl);
  const rawDesc =
    (event.longDescription || event.description || "")
      .replace(/<[^>]*>?/gm, "")
      .trim()
      .substring(0, 160) || `Compra boletas para ${event.name}`;
  const url = `${SITE}/event/${slugOrId}`;

  const priceFrom =
    ticketTypes?.length > 0
      ? Math.min(...ticketTypes.map((tt) => tt.currentPrice ?? tt.basePrice ?? 0))
      : 0;

  const images = [
    resolveImageUrl(event.coverImageUrl),
    resolveImageUrl(event.flyerImageUrl),
  ].filter(Boolean);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: rawDesc,
    image: images.length ? images : undefined,
    url,
    startDate: event.startsAt,
    endDate: event.endsAt || event.startsAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: venue?.name || event.venueName || "TBD",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.venueAddress || venue?.address || "",
        addressLocality: venue?.city || "",
        addressCountry: "CO",
      },
      ...(event.latitude && event.longitude
        ? {
            geo: {
              "@type": "GeoCoordinates",
              latitude: parseFloat(event.latitude),
              longitude: parseFloat(event.longitude),
            },
          }
        : {}),
    },
    offers:
      ticketTypes?.length > 0
        ? ticketTypes.map((tt) => ({
            "@type": "Offer",
            name: tt.name,
            price: tt.currentPrice ?? tt.basePrice ?? 0,
            priceCurrency: event.currencyCode || "COP",
            availability:
              tt.available === 0
                ? "https://schema.org/SoldOut"
                : "https://schema.org/InStock",
            url,
            validFrom: event.startsAt,
          }))
        : undefined,
    ...(promoterCompany?.companyName
      ? {
          organizer: {
            "@type": "Organization",
            name: promoterCompany.companyName,
            url: SITE,
          },
        }
      : {}),
  };

  const dateStr = event.startsAt
    ? new Date(event.startsAt).toLocaleDateString("es-CO", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(event.name)} | Tapee Tickets</title>
  <meta name="description" content="${escapeHtml(rawDesc)}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:site_name" content="Tapee Tickets" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escapeHtml(event.name)} | Tapee Tickets" />
  <meta property="og:description" content="${escapeHtml(rawDesc)}" />
  ${image ? `<meta property="og:image" content="${image}" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tapeeapp" />
  <meta name="twitter:title" content="${escapeHtml(event.name)} | Tapee Tickets" />
  <meta name="twitter:description" content="${escapeHtml(rawDesc)}" />
  ${image ? `<meta name="twitter:image" content="${image}" />` : ""}
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <h1>${escapeHtml(event.name)}</h1>
  <p>${escapeHtml(rawDesc)}</p>
  ${image ? `<img src="${image}" alt="${escapeHtml(event.name)}" width="1200" height="630" />` : ""}
  ${dateStr ? `<p>Fecha: ${escapeHtml(dateStr)}</p>` : ""}
  ${event.venueAddress || venue?.address ? `<p>Lugar: ${escapeHtml(event.venueAddress || venue?.address || "")}</p>` : ""}
  ${priceFrom > 0 ? `<p>Desde $${priceFrom.toLocaleString("es-CO")} ${escapeHtml(event.currencyCode || "COP")}</p>` : ""}
  <p><a href="${url}">Ver y comprar boletas en Tapee Tickets</a></p>
</body>
</html>`;
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);
  if (ext !== ".html") {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  res.writeHead(200, { "Content-Type": getMime(ext) });
  res.end(content);
}

function serveIndex(res) {
  const indexPath = path.join(DIST, "index.html");
  const content = fs.readFileSync(indexPath);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const ua = req.headers["user-agent"] || "";
  const isBot = BOT_RE.test(ua);

  // Apply security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }

  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  // Bot handling: pre-render pages with real data + structured markup
  if (isBot) {
    const eventMatch = pathname.match(/^\/event\/([^/?#]+)/);
    if (eventMatch) {
      const slugOrId = eventMatch[1];
      const data = await fetchEventData(slugOrId);
      if (data?.event) {
        const html = buildEventHTML(data, slugOrId);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      // Event not found → 404 for bots so Google doesn't index dead links
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Event not found");
      return;
    }

    if (pathname === "/" || pathname === "") {
      const events = await fetchHomeEvents();
      const html = buildHomeHTML(events);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
  }

  // Attempt to serve a real static file
  const filePath = path.join(DIST, pathname);
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const indexFile = path.join(filePath, "index.html");
      if (fs.existsSync(indexFile)) {
        serveFile(res, indexFile);
        return;
      }
    } else {
      serveFile(res, filePath);
      return;
    }
  } catch {
    // Not a file — fall through to SPA
  }

  // SPA fallback: all other routes return index.html
  try {
    serveIndex(res);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal server error");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Tapee Tickets server running on port ${PORT}`);
});
