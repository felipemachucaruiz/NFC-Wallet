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

const WWW_HOST = "www.tapeetickets.com";

const BOT_RE =
  /Googlebot|AdsBot-Google|Twitterbot|facebookexternalhit|WhatsApp|Slackbot|LinkedInBot|TelegramBot|Discordbot|Pinterest|Bingbot|YandexBot|Applebot|Bytespider|crawler|spider|bot\b/i;

function getClientIP(req) {
  return (
    req.headers["cf-connecting-ip"] ||
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    ""
  );
}

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

// --- Dynamic sitemap with 1-hour in-memory cache ---
let _sitemapXml = null;
let _sitemapBuiltAt = 0;
const SITEMAP_TTL_MS = 60 * 60 * 1000;

async function buildSitemap() {
  const now = Date.now();
  if (_sitemapXml && now - _sitemapBuiltAt < SITEMAP_TTL_MS) return _sitemapXml;

  const today = new Date().toISOString().split("T")[0];
  let events = [];
  try {
    const res = await fetch(`${API_BASE}/public/events?limit=1000`, {
      headers: { "User-Agent": "TapeeBot/1.0 (sitemap)" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      events = data.events || [];
    }
  } catch { /* serve with static pages only on API failure */ }

  const staticPages = [
    { url: "/",           priority: "1.0", changefreq: "daily"   },
    { url: "/terminos",   priority: "0.3", changefreq: "monthly" },
    { url: "/privacidad", priority: "0.3", changefreq: "monthly" },
    { url: "/devoluciones", priority: "0.3", changefreq: "monthly" },
  ];

  let xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  for (const page of staticPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${SITE}${page.url}</loc>\n`;
    xml += `    <lastmod>${today}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  for (const event of events) {
    const slugOrId = event.slug || event.id;
    const lastmod = (event.updatedAt || event.startsAt || today).split("T")[0];

    xml += `  <url>\n`;
    xml += `    <loc>${SITE}/event/${encodeURIComponent(slugOrId)}</loc>\n`;
    xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>0.8</priority>\n`;

    const coverUrl = resolveImageUrl(event.coverImageUrl);
    const flyerUrl = resolveImageUrl(event.flyerImageUrl);
    const seen = new Set();
    for (const imgUrl of [coverUrl, flyerUrl]) {
      if (imgUrl && !seen.has(imgUrl)) {
        seen.add(imgUrl);
        xml += `    <image:image>\n`;
        xml += `      <image:loc>${escapeHtml(imgUrl)}</image:loc>\n`;
        xml += `      <image:title>${escapeHtml(event.name)}</image:title>\n`;
        xml += `    </image:image>\n`;
      }
    }
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;
  _sitemapXml = xml;
  _sitemapBuiltAt = now;
  return xml;
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
  const fullDesc =
    (event.longDescription || event.description || "")
      .replace(/<[^>]*>?/gm, "")
      .trim() || `Compra boletas para ${event.name} en Tapee Tickets.`;
  const metaDesc = fullDesc.substring(0, 160);
  const url = `${SITE}/event/${slugOrId}`;
  const isPast = event.endsAt ? new Date(event.endsAt) < new Date() : false;

  const priceFrom =
    ticketTypes?.length > 0
      ? Math.min(...ticketTypes.map((tt) => tt.currentPrice ?? tt.basePrice ?? 0))
      : 0;
  const currency = event.currencyCode || "COP";

  const images = [
    resolveImageUrl(event.coverImageUrl),
    resolveImageUrl(event.flyerImageUrl),
  ].filter(Boolean);

  const schema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    description: fullDesc.substring(0, 500),
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
            priceCurrency: currency,
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

  const ticketListHtml = ticketTypes?.length > 0
    ? `<ul>${ticketTypes.map((tt) => {
        const price = tt.currentPrice ?? tt.basePrice ?? 0;
        const avail = tt.available === 0 ? " (Agotado)" : "";
        return `<li>${escapeHtml(tt.name)} — $${price.toLocaleString("es-CO")} ${escapeHtml(currency)}${avail}</li>`;
      }).join("")}</ul>`
    : "";

  const venueStr = [event.venueAddress || venue?.address, venue?.city].filter(Boolean).join(", ");
  const promoterStr = promoterCompany?.companyName || "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(event.name)} | Tapee Tickets</title>
  <meta name="description" content="${escapeHtml(metaDesc)}" />
  <meta name="robots" content="${isPast ? "noindex, follow" : "index, follow"}" />
  <link rel="canonical" href="${url}" />
  <meta property="og:site_name" content="Tapee Tickets" />
  <meta property="og:locale" content="es_CO" />
  <meta property="og:type" content="event" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${escapeHtml(event.name)} | Tapee Tickets" />
  <meta property="og:description" content="${escapeHtml(metaDesc)}" />
  ${image ? `<meta property="og:image" content="${image}" />\n  <meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tapeeapp" />
  <meta name="twitter:title" content="${escapeHtml(event.name)} | Tapee Tickets" />
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}" />
  ${image ? `<meta name="twitter:image" content="${image}" />` : ""}
  <script type="application/ld+json">${JSON.stringify(schema)}</script>
</head>
<body>
  <header>
    <p><a href="${SITE}">← Tapee Tickets — Todos los eventos</a></p>
  </header>
  <main>
    <h1>${escapeHtml(event.name)}</h1>
    ${image ? `<img src="${image}" alt="${escapeHtml(event.name)}" width="1200" height="630" />` : ""}
    ${dateStr ? `<p><strong>Fecha:</strong> ${escapeHtml(dateStr)}</p>` : ""}
    ${venueStr ? `<p><strong>Lugar:</strong> ${escapeHtml(venueStr)}</p>` : ""}
    ${promoterStr ? `<p><strong>Organiza:</strong> ${escapeHtml(promoterStr)}</p>` : ""}
    ${priceFrom > 0 ? `<p><strong>Desde:</strong> $${priceFrom.toLocaleString("es-CO")} ${escapeHtml(currency)}</p>` : ""}
    ${ticketListHtml ? `<h2>Tipos de boleta</h2>${ticketListHtml}` : ""}
    ${fullDesc ? `<h2>Acerca del evento</h2><p>${escapeHtml(fullDesc)}</p>` : ""}
    <p><a href="${url}">Comprar boletas en Tapee Tickets</a></p>
  </main>
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
  res.setHeader("Cache-Control", "no-store");
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

  // Redirect www → apex (belt-and-suspenders in case traffic bypasses Cloudflare)
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (host === WWW_HOST || host.startsWith("www.")) {
    res.writeHead(301, { Location: `${SITE}${req.url}` });
    res.end();
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }

  // Dynamic sitemap — served to everyone, cached 1 hour at edge
  if (pathname === "/sitemap.xml") {
    const xml = await buildSitemap();
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
    res.end(xml);
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
        // Cache pre-rendered pages at Cloudflare edge for 5 min
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      // Event not found → 404 for bots so Google doesn't index dead links
      res.setHeader("Cache-Control", "no-store");
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Event not found");
      return;
    }

    if (pathname === "/" || pathname === "") {
      const events = await fetchHomeEvents();
      const html = buildHomeHTML(events);
      // Cache home pre-render for 2 min (event list changes more often)
      res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
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
