import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE = "https://tapeetickets.com";
const STORAGE_ORIGIN = "https://prod.tapee.app";

function resolveImageUrl(p) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return `${STORAGE_ORIGIN}${p}`;
}

function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function generateSitemap() {
  console.log("Generating sitemap...");
  const today = new Date().toISOString().split("T")[0];

  try {
    const res = await fetch(
      "https://attendee.tapee.app/attendee-api/api/public/events?limit=1000"
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch events: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const events = data.events || [];

    const staticPages = [
      { url: "/", priority: "1.0", changefreq: "daily" },
      { url: "/terminos", priority: "0.3", changefreq: "monthly" },
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
      const lastmod = event.startsAt
        ? event.startsAt.split("T")[0]
        : today;

      xml += `  <url>\n`;
      xml += `    <loc>${SITE}/event/${slugOrId}</loc>\n`;
      xml += `    <lastmod>${lastmod}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;

      const coverUrl = resolveImageUrl(event.coverImageUrl);
      const flyerUrl = resolveImageUrl(event.flyerImageUrl);
      const imageAdded = new Set();

      for (const imgUrl of [coverUrl, flyerUrl]) {
        if (imgUrl && !imageAdded.has(imgUrl)) {
          imageAdded.add(imgUrl);
          xml += `    <image:image>\n`;
          xml += `      <image:loc>${escapeXml(imgUrl)}</image:loc>\n`;
          xml += `      <image:title>${escapeXml(event.name)}</image:title>\n`;
          xml += `    </image:image>\n`;
        }
      }

      xml += `  </url>\n`;
    }

    xml += `</urlset>`;

    const publicPath = path.join(__dirname, "..", "public", "sitemap.xml");
    fs.writeFileSync(publicPath, xml);
    console.log(
      `Sitemap generated with ${staticPages.length + events.length} URLs at ${publicPath}`
    );
  } catch (error) {
    console.error("Error generating sitemap:", error);
  }
}

generateSitemap();
