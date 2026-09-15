import { Router } from "express";
import { pool } from "../db/pool.js";
import { consultarPago, validarFirmaWebhook } from "../services/mercadopago.js";
import { revertirStockVenta } from "./ventas.js";

export const mercadopagoRouter = Router();

// Mercado Pago llama a esta URL solo, sin token nuestro, cada vez que hay novedades
// de un pago (creado, actualizado). Acá es donde "se entera" el sistema de que
// entró la plata, sin que nadie tenga que ir a mirar la app de MP.
// POST /api/mercadopago/webhook
mercadopagoRouter.post("/webhook", async (req, res) => {
  // Mercado Pago espera una respuesta 2xx rápida; si no, reintenta la notificación.
  // Devolvemos 200 apenas la validamos y seguimos procesando antes de eso.
  const tipo = req.query.type || req.body?.type;
  const dataId = req.query["data.id"] || req.body?.data?.id;

  if (tipo !== "payment" || !dataId) {
    return res.sendStatus(200);
  }

  const firmaValida = validarFirmaWebhook({
    xSignature: req.headers["x-signature"],
    xRequestId: req.headers["x-request-id"],
    dataId
  });
  if (!firmaValida) {
    return res.sendStatus(401);
  }

  try {
    const pago = await consultarPago(dataId);
    const ventaId = pago.external_reference;
    if (!ventaId) return res.sendStatus(200);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT * FROM ventas WHERE id = $1 FOR UPDATE",
        [ventaId]
      );
      const venta = rows[0];

      // Venta inexistente, o ya resuelta antes (reintento del webhook): no hacemos nada más.
      if (!venta || venta.estado_pago !== "pendiente") {
        await client.query("ROLLBACK");
        return res.sendStatus(200);
      }

      if (pago.status === "approved") {
        await client.query(
          "UPDATE ventas SET estado_pago = 'aprobado', mp_payment_id = $1 WHERE id = $2",
          [String(pago.id), ventaId]
        );
      } else if (["rejected", "cancelled"].includes(pago.status)) {
        await revertirStockVenta(client, ventaId);
        await client.query(
          "UPDATE ventas SET estado_pago = 'rechazado', mp_payment_id = $1 WHERE id = $2",
          [String(pago.id), ventaId]
        );
      }
      // Otros estados (in_process, pending) todavía no son definitivos: no tocamos la venta.

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Error procesando webhook de Mercado Pago:", err.message);
    // 200 igual: si devolvemos error, MP reintenta con el mismo payload roto en loop.
    res.sendStatus(200);
  }
});
