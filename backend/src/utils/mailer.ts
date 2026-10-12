import nodemailer from 'nodemailer';

function crearTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export async function enviarEmailRecuperacion(
  destinatario: string,
  nombre: string,
  resetUrl: string
): Promise<boolean> {
  const transporter = crearTransporter();
  if (!transporter) return false;

  const fromName = process.env.SMTP_FROM_NAME || 'Maíz';
  const fromEmail = process.env.SMTP_USER!;

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: destinatario,
    subject: 'Recuperación de contraseña — Maíz',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#0a3c20;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
          <h1 style="color:#fff;font-size:20px;margin:0;">Maíz</h1>
          <p style="color:#86efac;font-size:13px;margin:4px 0 0;">Sistema de Maíz Almacenado y Controlado</p>
        </div>
        <h2 style="color:#1a202c;font-size:18px;">Hola, ${nombre}</h2>
        <p style="color:#4a5568;font-size:15px;line-height:1.6;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta.
          Haz clic en el botón de abajo para crear una nueva contraseña.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetUrl}" style="background:#0a3c20;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:700;display:inline-block;">
            Restablecer contraseña
          </a>
        </div>
        <p style="color:#718096;font-size:13px;line-height:1.6;">
          Este enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, ignora este correo.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
        <p style="color:#a0aec0;font-size:11px;text-align:center;">Maíz · Secretaría de Agricultura y Desarrollo Rural</p>
      </div>
    `,
  });
  return true;
}

export function smtpConfigurado(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

// Credenciales de un técnico recién dado de alta (contraseña temporal que debe cambiar al entrar).
export async function enviarCredencialesTecnico(
  destinatario: string,
  nombre: string,
  passwordTemporal: string
): Promise<boolean> {
  const transporter = crearTransporter();
  if (!transporter) return false;

  const fromName = process.env.SMTP_FROM_NAME || 'SIMAC';
  const fromEmail = process.env.SMTP_USER!;
  const urlBase = (process.env.APP_URL || '').replace(/\/+$/, '');
  const urlEntrada = urlBase ? `${urlBase}/` : '';

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: destinatario,
    subject: 'Tu acceso como técnico — SIMAC',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="color:#1a202c;font-size:18px;">Hola, ${nombre}</h2>
        <p style="color:#4a5568;font-size:15px;line-height:1.6;">Se creó tu cuenta de técnico. Entra con tu correo y esta contraseña temporal; el sistema te pedirá cambiarla en tu primer acceso.</p>
        <p style="background:#f1f5f9;border-radius:10px;padding:12px 16px;font-size:16px;letter-spacing:.04em;"><b>${destinatario}</b><br>Contraseña temporal: <b>${passwordTemporal}</b></p>
        ${urlEntrada ? `<p style="font-size:14px;"><a href="${urlEntrada}">Abrir SIMAC</a></p>` : ''}
      </div>`,
  });
  return true;
}
