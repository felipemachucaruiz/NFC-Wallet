import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  imageWidth?: string;
  imageHeight?: string;
  url?: string;
  type?: string;
  schema?: string; // JSON string for structured data
  noindex?: boolean;
}

export function SEO({
  title = "Tapee Tickets - Compra boletas para los mejores eventos",
  description = "Compra boletas para conciertos, festivales, deportes y teatro en Colombia. Plataforma segura con tecnología NFC.",
  image = "https://tapeetickets.com/og-default.jpg",
  imageWidth = "1200",
  imageHeight = "630",
  url = "https://tapeetickets.com",
  type = "website",
  schema,
  noindex = false,
}: SEOProps) {
  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:site_name" content="Tapee Tickets" />
      <meta property="og:locale" content="es_CO" />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content={imageWidth} />
      <meta property="og:image:height" content={imageHeight} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@tapeeapp" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Structured Data (JSON-LD) */}
      {schema && (
        <script type="application/ld+json">
          {schema}
        </script>
      )}
    </Helmet>
  );
}
