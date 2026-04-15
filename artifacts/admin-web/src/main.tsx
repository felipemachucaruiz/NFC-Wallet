import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";

const SENSITIVE_KEYS = /password|token|authorization|card.?number|cvv|secret/i;

Sentry.init({
  dsn: "https://4730c7036d662c2078ad9e0293962feb@o4511219507265536.ingest.us.sentry.io/4511219595149312",
  environment: import.meta.env.PROD ? "production" : "development",
  integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
  profilesSampleRate: 0.1,
  attachStacktrace: true,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
  beforeSend(event, hint) {
    if (event.request?.data && typeof event.request.data === "object") {
      const data = event.request.data as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        if (SENSITIVE_KEYS.test(key)) data[key] = "[Filtered]";
      }
    }
    if (event.request?.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_KEYS.test(key)) event.request.headers[key] = "[Filtered]";
      }
    }
    if (Array.isArray(event.breadcrumbs)) {
      for (const crumb of event.breadcrumbs as Sentry.Breadcrumb[]) {
        if (crumb.data && typeof crumb.data === "object") {
          for (const key of Object.keys(crumb.data)) {
            if (SENSITIVE_KEYS.test(key)) crumb.data[key] = "[Filtered]";
          }
        }
      }
    }
    if (hint?.data && typeof hint.data === "object") {
      const hintData = hint.data as Record<string, unknown>;
      for (const key of Object.keys(hintData)) {
        if (SENSITIVE_KEYS.test(key)) hintData[key] = "[Filtered]";
      }
    }
    return event;
  },
});

createRoot(document.getElementById("root")!).render(<App />);
