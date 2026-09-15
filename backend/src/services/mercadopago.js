import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import crypto from "crypto";

const accessToken = process.env.MP_ACCESS_TOKEN;

const client = accessToken ? new MercadoPagoConfig({ accessToken }) : null;

function requiereCliente() {
  if (!client) {
    throw new Error(
      "MP_ACCESS_TOKEN no está configurado. Completá backend/.env para cobrar con Mercado Pago."
    );
  }
  return client;
}

// Crea el link/QR de cobro para una venta puntual. external_reference = id de la venta,
// así el webhook sabe a qué venta corresponde el pago que llegue.
export async function crearPreferenciaPago({ ventaId, total, descripcion }) {
  const preference = new Preference(requiereCliente());
  const notificationUrl = process.env.APP_BASE_URL
    ? `${process.env.APP_BASE_URL.replace(/\/$/, "")}/api/mercadopago/webhook`
    : undefined;

  const { body } = await preference.create({
    body: {
      items: [
        {
          title: descripcion || `Venta #${ventaId}`,
          quantity: 1,
          unit_price: Number(total),
          currency_id: "ARS"
        }
      ],
      external_reference: String(ventaId),
      notification_url: notificationUrl,
      back_urls: process.env.APP_BASE_URL
        ? {
            success: process.env.APP_BASE_URL,
            pending: process.env.APP_BASE_URL,
            failure: process.env.APP_BASE_URL
          }
        : undefined
    }
  });

  return {
    preferenceId: body.id,
    initPoint: body.init_point || body.sandbox_init_point
  };
}

// Trae el estado real de un pago desde la API de Mercado Pago (nunca confiamos
// en lo que diga el webhook sin volver a consultar).
export async function consultarPago(paymentId) {
  const payment = new Payment(requiereCliente());
  const { body } = await payment.get({ id: paymentId });
  return body;
}

// Valida la firma x-signature que manda Mercado Pago en cada webhook.
// Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
export function validarFirmaWebhook({ xSignature, xRequestId, dataId }) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // sin secreto configurado (ej. dev local), no se valida

  if (!xSignature || !xRequestId || !dataId) return false;

  const partes = Object.fromEntries(
    xSignature.split(",").map((p) => p.trim().split("=").map((s) => s.trim()))
  );
  const ts = partes.ts;
  const hashRecibido = partes.v1;
  if (!ts || !hashRecibido) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hashEsperado = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const bufEsperado = Buffer.from(hashEsperado);
  const bufRecibido = Buffer.from(hashRecibido);
  if (bufEsperado.length !== bufRecibido.length) return false;

  return crypto.timingSafeEqual(bufEsperado, bufRecibido);
}
