import { Router } from "express";
import { pool } from "../db/pool.js";
import { crearPreferenciaPago } from "../services/mercadopago.js";

export const ventasRouter = Router();

const FORMAS_PAGO_MP = ["tarjeta_mp", "qr_mp"];

// % de descuento por pagar en efectivo/transferencia, configurable desde
// Administración → Configuración (clave "descuento_efectivo_transferencia").
async function obtenerDescuentoEfectivoTransferencia(client) {
  const { rows } = await client.query(
    "SELECT valor FROM configuracion WHERE clave = 'descuento_efectivo_transferencia'"
  );
  const valor = Number(rows[0]?.valor);
  return Number.isFinite(valor) ? valor : 10;
}

// Devuelve el stock (IMEI o cantidad de accesorio) de una venta a disponible.
// Se usa cuando un pago con Mercado Pago se rechaza/cancela y la venta no se concreta.
export async function revertirStockVenta(client, ventaId) {
  const { rows: items } = await client.query(
    "SELECT producto_id, imei_id, cantidad FROM venta_items WHERE venta_id = $1",
    [ventaId]
  );
  const { rows: ventaRows } = await client.query(
    "SELECT sucursal_id FROM ventas WHERE id = $1",
    [ventaId]
  );
  const sucursal_id = ventaRows[0]?.sucursal_id;

  for (const item of items) {
    if (item.imei_id) {
      await client.query(
        "UPDATE equipos_imei SET estado = 'disponible' WHERE id = $1 AND estado = 'vendido'",
        [item.imei_id]
      );
    } else {
      await client.query(
        "UPDATE stock_accesorios SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sucursal_id = $3",
        [item.cantidad, item.producto_id, sucursal_id]
      );
    }
  }
}

// Registrar una venta completa: valida stock, descuenta, calcula totales.
// POST /api/ventas
// body: { sucursal_id, usuario_id, cliente_id?, tipo_comprobante?, forma_pago, items: [{producto_id, imei_id?, cantidad}] }
ventasRouter.post("/", async (req, res) => {
  const {
    cliente_id = null,
    tipo_comprobante = "consumidor_final",
    forma_pago,
    items
  } = req.body;

  // La sucursal y el usuario salen del token, no del body: un vendedor
  // solo puede vender a nombre de su propia sucursal.
  const usuario_id = req.usuario.id;
  const sucursal_id = req.usuario.sucursal_id;

  if (!sucursal_id) {
    return res.status(400).json({ error: "El usuario no tiene sucursal asignada." });
  }

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "La venta no tiene ítems." });
  }

  const aplicaDescuento = forma_pago === "efectivo" || forma_pago === "transferencia";
  const requierePago = FORMAS_PAGO_MP.includes(forma_pago);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const DESCUENTO_EFECTIVO_TRANSFERENCIA = await obtenerDescuentoEfectivoTransferencia(client);

    let subtotal = 0;
    const itemsResueltos = [];

    for (const item of items) {
      const { rows } = await client.query(
        "SELECT id, tipo, precio_venta, precio_costo, recargo_porcentaje FROM productos WHERE id = $1 FOR UPDATE",
        [item.producto_id]
      );
      const producto = rows[0];
      if (!producto) throw new Error(`Producto ${item.producto_id} no existe.`);

      if (producto.tipo === "equipo") {
        // Cada equipo se vende por su IMEI puntual
        if (!item.imei_id) throw new Error(`Falta el IMEI para el producto ${producto.id}.`);
        const { rows: imeiRows } = await client.query(
          "SELECT id, estado FROM equipos_imei WHERE id = $1 AND sucursal_id = $2 FOR UPDATE",
          [item.imei_id, sucursal_id]
        );
        const equipo = imeiRows[0];
        if (!equipo || equipo.estado !== "disponible") {
          throw new Error(`El equipo (IMEI id ${item.imei_id}) no está disponible en esta sucursal.`);
        }
        await client.query(
          "UPDATE equipos_imei SET estado = 'vendido' WHERE id = $1",
          [item.imei_id]
        );
      } else {
        // Accesorio: descuenta cantidad del stock de la sucursal
        const cantidad = item.cantidad || 1;
        const { rows: stockRows } = await client.query(
          "SELECT cantidad FROM stock_accesorios WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE",
          [item.producto_id, sucursal_id]
        );
        const stockActual = stockRows[0]?.cantidad ?? 0;
        if (stockActual < cantidad) {
          throw new Error(`Stock insuficiente para el producto ${producto.id} en esta sucursal.`);
        }
        await client.query(
          "UPDATE stock_accesorios SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sucursal_id = $3",
          [cantidad, item.producto_id, sucursal_id]
        );
      }

      const cantidad = item.cantidad || 1;
      const precioLista = Number(producto.precio_venta);
      // El recargo fijo del producto (cargado en el alta) es solo para tarjeta,
      // nunca se pisa ni se mezcla con el contado. El recargo manual que carga
      // el vendedor en el carrito, en cambio, es aparte: sube los dos precios
      // (contado y tarjeta), porque es un ajuste puntual de esa venta.
      let recargoManualItem = 0;
      if (item.recargo_manual !== undefined && item.recargo_manual !== null && item.recargo_manual !== "") {
        recargoManualItem = Number(item.recargo_manual);
        if (isNaN(recargoManualItem) || recargoManualItem < 0 || recargoManualItem > 200) {
          throw new Error(`El recargo cargado para el producto ${producto.id} no es válido.`);
        }
      }
      const recargoProducto = Number(producto.recargo_porcentaje || 0);
      const precioConManual = precioLista * (1 + recargoManualItem / 100);
      const precioTarjetaFinal = precioLista * (1 + (recargoProducto + recargoManualItem) / 100);
      const precioUnitario = aplicaDescuento
        ? precioConManual * (1 - DESCUENTO_EFECTIVO_TRANSFERENCIA / 100)
        : precioTarjetaFinal;
      subtotal += precioLista * cantidad;

      itemsResueltos.push({
        producto_id: producto.id,
        imei_id: item.imei_id || null,
        cantidad,
        precio_unitario: precioUnitario,
        costo_unitario: Number(producto.precio_costo)
      });
    }

    const descuentoPorcentaje = aplicaDescuento ? DESCUENTO_EFECTIVO_TRANSFERENCIA : 0;
    const total = itemsResueltos.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);

    // efectivo/transferencia: el vendedor ya vio el pago, queda aprobada al toque.
    // tarjeta_mp/qr_mp: queda pendiente hasta que el webhook de Mercado Pago confirme el cobro.
    const estadoPago = requierePago ? "pendiente" : "aprobado";

    const { rows: ventaRows } = await client.query(
      `INSERT INTO ventas
        (sucursal_id, usuario_id, cliente_id, tipo_comprobante, forma_pago, subtotal, descuento_porcentaje, total, estado_pago)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [sucursal_id, usuario_id, cliente_id, tipo_comprobante, forma_pago, subtotal, descuentoPorcentaje, total, estadoPago]
    );
    let venta = ventaRows[0];

    for (const item of itemsResueltos) {
      await client.query(
        `INSERT INTO venta_items
          (venta_id, producto_id, imei_id, cantidad, precio_unitario, costo_unitario)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [venta.id, item.producto_id, item.imei_id, item.cantidad, item.precio_unitario, item.costo_unitario]
      );
    }

    let mpInitPoint = null;
    if (requierePago) {
      const { preferenceId, initPoint } = await crearPreferenciaPago({
        ventaId: venta.id,
        total,
        descripcion: `Venta #${venta.id}`
      });
      mpInitPoint = initPoint;
      const { rows } = await client.query(
        "UPDATE ventas SET mp_preference_id = $1 WHERE id = $2 RETURNING *",
        [preferenceId, venta.id]
      );
      venta = rows[0];
    }

    await client.query("COMMIT");
    res.status(201).json({ ...venta, items: itemsResueltos, mp_init_point: mpInitPoint });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Cancela una venta con pago de Mercado Pago que quedó pendiente (el vendedor
// se arrepiente, el cliente se va sin pagar, etc.) y repone el stock reservado.
// POST /api/ventas/:id/cancelar
ventasRouter.post("/:id/cancelar", async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM ventas WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    const venta = rows[0];
    if (!venta) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venta no encontrada." });
    }
    if (venta.estado_pago !== "pendiente") {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Esta venta ya no está pendiente de pago." });
    }

    await revertirStockVenta(client, venta.id);
    const { rows: actualizada } = await client.query(
      "UPDATE ventas SET estado_pago = 'rechazado' WHERE id = $1 RETURNING *",
      [venta.id]
    );
    await client.query("COMMIT");
    res.json(actualizada[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Ventas del día por sucursal, para la vista "Ventas en vivo". Sin sucursal_id
// trae las de todas las sucursales (lo usa el panel admin para ver todo junto).
// GET /api/ventas/dia?sucursal_id=1&fecha=2026-09-14
ventasRouter.get("/dia", async (req, res) => {
  const { sucursal_id, fecha } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.nombre AS vendedor, s.nombre AS sucursal_nombre,
              c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       JOIN sucursales s ON s.id = v.sucursal_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE ($1::int IS NULL OR v.sucursal_id = $1)
         AND v.fecha::date = COALESCE($2::date, CURRENT_DATE)
       ORDER BY v.fecha DESC`,
      [sucursal_id || null, fecha || null]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detalle completo de una venta: además de los campos de la venta, trae sus
// ítems (con nombre de producto e IMEI si corresponde) para el historial, y
// sirve también para que la caja haga polling mientras espera la confirmación
// automática del pago con Mercado Pago (ahí solo importan los campos de arriba).
// Va al final: si fuera antes de /dia, "/dia" matchearía acá como si "dia" fuese un id.
// GET /api/ventas/:id
ventasRouter.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT v.*, u.nombre AS vendedor,
              c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
       FROM ventas v
       JOIN usuarios u ON u.id = v.usuario_id
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1`,
      [req.params.id]
    );
    const venta = rows[0];
    if (!venta) return res.status(404).json({ error: "Venta no encontrada." });

    const { rows: items } = await pool.query(
      `SELECT vi.*, p.nombre AS producto_nombre, p.marca, p.modelo, ei.imei
       FROM venta_items vi
       JOIN productos p ON p.id = vi.producto_id
       LEFT JOIN equipos_imei ei ON ei.id = vi.imei_id
       WHERE vi.venta_id = $1
       ORDER BY vi.id`,
      [req.params.id]
    );

    res.json({ ...venta, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Devolución de un ítem (total o parcial si es un accesorio con cantidad > 1):
// repone el stock (el IMEI vuelve a "disponible", o se suma la cantidad de
// accesorios) y descuenta el total de la venta. No se toca la venta original
// más que eso, para conservar el historial de lo que realmente se cobró.
// POST /api/ventas/:id/items/:itemId/devolucion
// body: { cantidad? } — por defecto devuelve todo lo que quede pendiente
ventasRouter.post("/:id/items/:itemId/devolucion", async (req, res) => {
  const { id, itemId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: ventaRows } = await client.query(
      "SELECT * FROM ventas WHERE id = $1 FOR UPDATE",
      [id]
    );
    const venta = ventaRows[0];
    if (!venta) throw new Error("Venta no encontrada.");
    if (venta.estado_pago !== "aprobado") {
      throw new Error("Solo se pueden devolver ítems de una venta aprobada.");
    }

    const { rows: itemRows } = await client.query(
      "SELECT * FROM venta_items WHERE id = $1 AND venta_id = $2 FOR UPDATE",
      [itemId, id]
    );
    const item = itemRows[0];
    if (!item) throw new Error("Ítem no encontrado en esta venta.");

    const pendiente = item.cantidad - item.cantidad_devuelta;
    const cantidadPedida = req.body.cantidad != null ? parseInt(req.body.cantidad) : pendiente;
    if (!Number.isInteger(cantidadPedida) || cantidadPedida <= 0 || cantidadPedida > pendiente) {
      throw new Error("La cantidad a devolver no es válida.");
    }

    if (item.imei_id) {
      await client.query(
        "UPDATE equipos_imei SET estado = 'disponible' WHERE id = $1",
        [item.imei_id]
      );
    } else {
      await client.query(
        "UPDATE stock_accesorios SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sucursal_id = $3",
        [cantidadPedida, item.producto_id, venta.sucursal_id]
      );
    }

    await client.query(
      "UPDATE venta_items SET cantidad_devuelta = cantidad_devuelta + $1 WHERE id = $2",
      [cantidadPedida, item.id]
    );

    // El total de la venta se recalcula desde los ítems (con lo ya devuelto
    // descontado), en vez de restar a mano, para que nunca se desincronice.
    const { rows: totalRows } = await client.query(
      `SELECT COALESCE(SUM(precio_unitario * (cantidad - cantidad_devuelta)), 0) AS total
       FROM venta_items WHERE venta_id = $1`,
      [id]
    );
    const { rows: actualizada } = await client.query(
      "UPDATE ventas SET total = $1 WHERE id = $2 RETURNING *",
      [totalRows[0].total, id]
    );

    await client.query("COMMIT");
    res.json(actualizada[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});
