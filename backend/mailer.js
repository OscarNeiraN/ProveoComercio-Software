/**
 * mailer.js — Envío de correos de confirmación con boleta DTE adjunta
 */

require('dotenv').config();
const nodemailer = require('nodemailer');

const {
  SMTP_HOST,
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASSWORD,
  SMTP_SECURE,
  ALLOW_SIMULATED_MAIL,
  MAIL_FROM,
  RAZON_SOCIAL = 'ProveoComercio SpA',
} = process.env;

const smtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);
const simulatedMailAllowed = ALLOW_SIMULATED_MAIL === 'true';

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: SMTP_SECURE === 'true' || Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    })
  : null;

const fmtCLP = n => '$' + Number(n || 0).toLocaleString('es-CL');

function buildHtml({ user, items, total, address, folio, tipo }) {
  const filasItems = items.map(i => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee">${i.name || i.sku}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtCLP(i.unit_price)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${fmtCLP(i.unit_price * i.quantity)}</td>
    </tr>`).join('');

  const dirHtml = address ? `
    <p style="margin:14px 0 6px;font-weight:600">Dirección de envío</p>
    <p style="margin:0;color:#555;line-height:1.5">
      ${address.street} ${address.number}${address.apartment ? `, Depto/Casa ${address.apartment}` : ''}<br/>
      ${address.commune}, ${address.region}
    </p>` : '';

  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#222;max-width:620px;margin:0 auto">
  <h2 style="color:#0a0a0a">¡Gracias por tu compra, ${user.first_name}!</h2>
  <p>Confirmamos tu pedido en <strong>${RAZON_SOCIAL}</strong>.</p>
  <p style="margin:14px 0 6px;font-weight:600">Boleta electrónica</p>
  <p style="margin:0;color:#555">Tipo DTE ${tipo} · Folio N° ${folio} (adjunta en formato XML SII)</p>
  ${dirHtml}
  <p style="margin:14px 0 6px;font-weight:600">Detalle</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 8px;text-align:left">Producto</th>
        <th style="padding:6px 8px;text-align:center">Cant.</th>
        <th style="padding:6px 8px;text-align:right">Precio</th>
        <th style="padding:6px 8px;text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filasItems}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="padding:10px 8px;text-align:right;font-weight:600">Total</td>
        <td style="padding:10px 8px;text-align:right;font-weight:600">${fmtCLP(total)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:24px;color:#777;font-size:12px">
    Este correo es una confirmación automática. La boleta electrónica adjunta cumple el formato DTE del SII.
  </p>
</body></html>`;
}

async function enviarConfirmacionCompra({ user, items, total, address, folio, tipo, boletaXML }) {
  const from = MAIL_FROM || SMTP_USER || 'no-reply@proveocomercio.cl';
  const to = user.email;
  const subject = `Confirmación de compra · Boleta N° ${folio}`;
  const html = buildHtml({ user, items, total, address, folio, tipo });

  const attachments = boletaXML ? [{
    filename: `DTE_T${tipo}F${folio}.xml`,
    content: boletaXML,
    contentType: 'application/xml; charset=ISO-8859-1',
  }] : [];

  if (!smtpConfigured) {
    if (!simulatedMailAllowed) {
      throw new Error('SMTP no configurado: faltan SMTP_HOST, SMTP_USER o SMTP_PASSWORD');
    }

    console.log('[mailer] SMTP no configurado — correo simulado:');
    console.log(`  De: ${from}`);
    console.log(`  Para: ${to}`);
    console.log(`  Asunto: ${subject}`);
    console.log(`  Adjunto: DTE_T${tipo}F${folio}.xml (${boletaXML?.length || 0} bytes)`);
    return { simulated: true, to, subject };
  }

  const info = await transporter.sendMail({ from, to, subject, html, attachments });
  console.log(`[mailer] Correo enviado a ${to} — messageId: ${info.messageId}`);
  return { simulated: false, to, subject, messageId: info.messageId };
}

module.exports = { enviarConfirmacionCompra, smtpConfigured };
