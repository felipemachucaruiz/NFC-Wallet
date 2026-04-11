import { logger } from "./logger";

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM ?? "no-reply@mailing.tapee.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Tapee";
const APP_URL = process.env.APP_URL ?? "";

function getLogoUrl(): string {
  const base = process.env.LOGO_URL ?? "";
  if (base) return base;
  if (APP_URL) return `${APP_URL}/api/static/tapee-logo.png`;
  return "";
}

function getLogoImg(): string {
  const url = getLogoUrl();
  if (url) {
    return `<img src="${url}" alt="Tapee" width="140" style="display:block;margin:0 auto 8px;" />`;
  }
  return `<h1 style="color: #00f1ff; font-size: 28px; margin: 0 0 8px;">Tapee</h1>`;
}

export function getAppUrl(): string {
  return APP_URL;
}

function emailWrapper(body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="font-family: Arial, sans-serif; background: #f4f4f5; color: #1a1a1a; margin: 0; padding: 0;">
  <div style="max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7;">
    <div style="background: linear-gradient(135deg, #0a0a0a, #111827); padding: 32px 32px 24px; text-align: center;">
      ${getLogoImg()}
      <p style="color: #8b949e; margin: 0; font-size: 14px;">Pagos cashless para eventos</p>
    </div>
    <div style="padding: 32px;">
      ${body}
    </div>
    <div style="padding: 16px 32px; background: #f4f4f5; text-align: center; border-top: 1px solid #e4e4e7;">
      <p style="color: #71717a; font-size: 12px; margin: 0;">&copy; Tapee &middot; Eventos cashless</p>
    </div>
  </div>
</body>
</html>`;
}

export interface InlineImage {
  name: string;
  content: string;
}

interface SendEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  inlineImages?: InlineImage[];
}

export async function sendEmail(opts: SendEmailOptions): Promise<boolean> {
  if (!BREVO_API_KEY) {
    logger.warn("BREVO_API_KEY not set — skipping email send");
    return false;
  }

  try {
    const payload: Record<string, unknown> = {
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email: opts.to, name: opts.toName ?? opts.to }],
      subject: opts.subject,
      htmlContent: opts.htmlContent,
      textContent: opts.textContent,
    };

    if (opts.inlineImages && opts.inlineImages.length > 0) {
      payload.attachment = opts.inlineImages.map((img) => ({
        name: img.name,
        content: img.content,
      }));
    }

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(`Brevo email send failed — status=${res.status} body=${body}`);
      return false;
    }

    logger.info(`Brevo email sent successfully to=${opts.to}`);
    return true;
  } catch (err) {
    logger.error(`Brevo email send error — ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function buildPasswordResetEmail(opts: {
  firstName: string | null;
  resetUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = opts.firstName ?? "";
  const greeting = name ? `Hola ${name},` : "Hola,";
  const subject = "Restablece tu contraseña de Tapee";
  const body = `
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">Restablecer contraseña</h2>
      <p style="color: #52525b; margin: 0 0 24px;">${greeting} recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${opts.resetUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Restablecer Contraseña</a>
      </div>
      <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">Este enlace expira en 1 hora. Si no solicitaste un cambio de contraseña, puedes ignorar este correo.</p>`;
  const htmlContent = emailWrapper(body);
  const textContent = `${greeting}\n\nRecibimos una solicitud para restablecer tu contraseña de Tapee.\n\nRestablece tu contraseña aquí:\n${opts.resetUrl}\n\nEste enlace expira en 1 hora. Si no solicitaste un cambio de contraseña, ignora este correo.\n\n— El equipo de Tapee`;
  return { subject, htmlContent, textContent };
}

export function buildVerificationEmail(opts: {
  firstName: string | null;
  verifyUrl: string;
}): { subject: string; htmlContent: string; textContent: string } {
  const name = opts.firstName ?? "";
  const greeting = name ? `Hola ${name},` : "Hola,";
  const subject = "Verifica tu correo electrónico de Tapee";
  const body = `
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">Verificar correo electrónico</h2>
      <p style="color: #52525b; margin: 0 0 24px;">${greeting} ¡bienvenido/a a Tapee! Haz clic en el botón de abajo para verificar tu correo electrónico y activar tu cuenta.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${opts.verifyUrl}" style="display: inline-block; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px 32px; border-radius: 8px; text-decoration: none;">Verificar Correo</a>
      </div>
      <p style="color: #71717a; font-size: 13px; margin: 24px 0 0;">Este enlace expira en 24 horas.</p>`;
  const htmlContent = emailWrapper(body);
  const textContent = `${greeting}\n\n¡Bienvenido/a a Tapee! Verifica tu correo electrónico visitando:\n${opts.verifyUrl}\n\nEste enlace expira en 24 horas.\n\n— El equipo de Tapee`;
  return { subject, htmlContent, textContent };
}

export function buildVerifySuccessPage(): string {
  return emailWrapper(`
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">&#x2705; Correo verificado</h2>
      <p style="color: #52525b; margin: 0 0 24px;">Tu correo electrónico ha sido verificado exitosamente. Ya puedes volver a la app de Tapee.</p>
  `);
}

export function buildVerifyErrorPage(message: string): string {
  return emailWrapper(`
      <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px;">&#x274C; Error de verificación</h2>
      <p style="color: #52525b; margin: 0 0 24px;">${escapeHtml(message)}</p>
  `);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/</g, "\\x3c").replace(/>/g, "\\x3e").replace(/\n/g, "\\n");
}

export function buildResetPasswordPage(token: string, appUrl: string): string {
  const safeToken = escapeJs(token);
  const safeAppUrl = escapeJs(appUrl);
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restablecer Contraseña - Tapee</title>
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f5; color: #1a1a1a; margin: 0; padding: 0; }
  .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e4e4e7; }
  .header { background: linear-gradient(135deg, #0a0a0a, #111827); padding: 32px 32px 24px; text-align: center; }
  .header h1 { color: #00f1ff; font-size: 28px; margin: 0 0 8px; }
  .header p { color: #8b949e; margin: 0; font-size: 14px; }
  .body { padding: 32px; }
  .body h2 { color: #1a1a1a; font-size: 20px; margin: 0 0 16px; }
  .body label { color: #52525b; display: block; margin-bottom: 8px; font-size: 14px; }
  .body input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #d4d4d8; background: #ffffff; color: #1a1a1a; font-size: 16px; box-sizing: border-box; margin-bottom: 16px; }
  .body input:focus { outline: none; border-color: #00f1ff; }
  .body button { width: 100%; background-color: #00f1ff; color: #000000; font-weight: bold; font-size: 16px; padding: 14px; border-radius: 8px; border: none; cursor: pointer; }
  .body button:disabled { opacity: 0.5; cursor: not-allowed; }
  .footer { padding: 16px 32px; background: #f4f4f5; text-align: center; border-top: 1px solid #e4e4e7; }
  .footer p { color: #71717a; font-size: 12px; margin: 0; }
  .msg { padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
  .msg-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
  .msg-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    ${getLogoImg()}
    <p>Pagos cashless para eventos</p>
  </div>
  <div class="body">
    <h2>Restablecer contraseña</h2>
    <div id="msg" style="display:none"></div>
    <form id="form">
      <label for="password">Nueva contraseña</label>
      <input type="password" id="password" name="password" minlength="6" placeholder="Mínimo 6 caracteres" required />
      <label for="confirm">Confirmar contraseña</label>
      <input type="password" id="confirm" name="confirm" minlength="6" placeholder="Repite tu contraseña" required />
      <button type="submit" id="btn">Restablecer Contraseña</button>
    </form>
  </div>
  <div class="footer"><p>&copy; Tapee &middot; Eventos cashless</p></div>
</div>
<script>
  var form = document.getElementById('form');
  var msg = document.getElementById('msg');
  var btn = document.getElementById('btn');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var pw = document.getElementById('password').value;
    var cf = document.getElementById('confirm').value;
    if (pw.length < 6) { showMsg('La contraseña debe tener al menos 6 caracteres.', true); return; }
    if (pw !== cf) { showMsg('Las contraseñas no coinciden.', true); return; }
    btn.disabled = true;
    btn.textContent = 'Procesando...';
    fetch('${safeAppUrl}/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '${safeToken}', password: pw })
    }).then(function(r) { return r.json().then(function(d) { return { ok: r.ok, data: d }; }); })
    .then(function(res) {
      if (res.ok) {
        form.style.display = 'none';
        showMsg('¡Contraseña restablecida! Ya puedes iniciar sesión en la app.', false);
      } else {
        showMsg(res.data.error || 'Error al restablecer la contraseña. Intenta de nuevo.', true);
        btn.disabled = false;
        btn.textContent = 'Restablecer Contraseña';
      }
    }).catch(function() {
      showMsg('Error de conexión. Intenta de nuevo.', true);
      btn.disabled = false;
      btn.textContent = 'Restablecer Contraseña';
    });
  });
  function showMsg(text, isError) {
    msg.style.display = 'block';
    msg.className = 'msg ' + (isError ? 'msg-error' : 'msg-success');
    msg.textContent = text;
  }
</script>
</body>
</html>`;
}
