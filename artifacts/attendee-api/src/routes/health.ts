import { Router, type IRouter, type Request, type Response } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/email-diag", async (req: Request, res: Response) => {
  const secret = process.env.HMAC_SECRET ?? "";
  const provided = req.headers["x-diag-secret"] ?? "";
  if (!secret || provided !== secret) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? "no-reply@mailing.tapee.app";
  const fromName = process.env.EMAIL_FROM_NAME ?? "Tapee";

  if (!apiKey) {
    res.json({ ok: false, issue: "BREVO_API_KEY is not set in Railway environment" });
    return;
  }

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: "diag-test@tapee.app", name: "Diag Test" }],
        subject: "Tapee email diagnostic test",
        htmlContent: "<p>This is an email diagnostic test from Tapee attendee API.</p>",
        textContent: "This is an email diagnostic test from Tapee attendee API.",
      }),
    });

    const body = await brevoRes.text();
    res.json({
      ok: brevoRes.ok,
      status: brevoRes.status,
      brevoResponse: body,
      config: { fromEmail, fromName, apiKeyPrefix: apiKey.substring(0, 10) + "..." },
    });
  } catch (err) {
    res.json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
