import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WIDTH = 1200;
const HEIGHT = 630;

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#060d14"/>
      <stop offset="100%" stop-color="#0a0a0a"/>
    </linearGradient>
    <radialGradient id="glow1" cx="30%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#00f1ff" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#00f1ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="75%" cy="65%" r="45%">
      <stop offset="0%" stop-color="#0066ff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#0066ff" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow1)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow2)"/>

  <!-- Border glow line at top -->
  <rect x="0" y="0" width="${WIDTH}" height="2" fill="#00f1ff" opacity="0.4"/>

  <!-- Decorative grid lines -->
  <line x1="0" y1="200" x2="${WIDTH}" y2="200" stroke="#00f1ff" stroke-width="0.4" opacity="0.07"/>
  <line x1="0" y1="430" x2="${WIDTH}" y2="430" stroke="#00f1ff" stroke-width="0.4" opacity="0.07"/>
  <line x1="300" y1="0" x2="300" y2="${HEIGHT}" stroke="#00f1ff" stroke-width="0.4" opacity="0.05"/>
  <line x1="900" y1="0" x2="900" y2="${HEIGHT}" stroke="#00f1ff" stroke-width="0.4" opacity="0.05"/>

  <!-- Tapee wordmark -->
  <text
    x="600" y="230"
    font-family="Arial Black, Arial, sans-serif"
    font-size="108"
    font-weight="900"
    text-anchor="middle"
    letter-spacing="-2"
    fill="#00f1ff"
  >TAPEE</text>

  <!-- TICKETS subtitle -->
  <text
    x="600" y="295"
    font-family="Arial, sans-serif"
    font-size="36"
    font-weight="700"
    text-anchor="middle"
    letter-spacing="14"
    fill="#ffffff"
    opacity="0.55"
  >TICKETS</text>

  <!-- Separator line -->
  <line x1="460" y1="338" x2="740" y2="338" stroke="#00f1ff" stroke-width="1" opacity="0.35"/>

  <!-- Tagline -->
  <text
    x="600" y="390"
    font-family="Arial, sans-serif"
    font-size="22"
    text-anchor="middle"
    fill="#ffffff"
    opacity="0.65"
  >Boletas para conciertos, festivales y más en Colombia</text>

  <!-- URL badge -->
  <rect x="465" y="435" width="270" height="40" rx="20" fill="#00f1ff" opacity="0.10"/>
  <rect x="465" y="435" width="270" height="40" rx="20" fill="none" stroke="#00f1ff" stroke-width="1" opacity="0.3"/>
  <text
    x="600" y="461"
    font-family="Arial, sans-serif"
    font-size="17"
    text-anchor="middle"
    fill="#00f1ff"
    opacity="0.85"
  >tapeetickets.com</text>

  <!-- Corner dots -->
  <circle cx="60" cy="60" r="3" fill="#00f1ff" opacity="0.25"/>
  <circle cx="${WIDTH - 60}" cy="60" r="3" fill="#00f1ff" opacity="0.25"/>
  <circle cx="60" cy="${HEIGHT - 60}" r="3" fill="#00f1ff" opacity="0.25"/>
  <circle cx="${WIDTH - 60}" cy="${HEIGHT - 60}" r="3" fill="#00f1ff" opacity="0.25"/>
</svg>`;

async function generateOgImage() {
  const outputPath = path.join(__dirname, "..", "public", "og-default.jpg");
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);
  console.log(`OG default image generated at ${outputPath}`);
}

generateOgImage().catch((err) => {
  console.error("Failed to generate OG image:", err);
  process.exit(1);
});
