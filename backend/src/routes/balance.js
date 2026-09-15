import { Router } from "express";
import { pool } from "../db/pool.js";

export const balanceRouter = Router();

// Reporte de ganancia bruta por período (ventas - costos + ganancia de reparaciones)
// GET /api/balance?sucursal_id=&desde=2026-09-01&hasta=2026-09-14
balanceRouter.get("/", async (req, res) => {
  const { sucursal_id, desde, hasta } = req.query;
  try {
    const { rows: ventasRows } = await pool.query(
      `SELECT
         COALESCE(SUM(v.total), 0) AS total_ventas,
         COALESCE(SUM(vi.costo_unitario * vi.cantidad), 0) AS total_costo
       FROM ventas v
       JOIN venta_items vi ON vi.venta_id = v.id
       WHERE v.estado_pago = 'aprobado'
         AND ($1::int IS NULL OR v.sucursal_id = $1)
         AND v.fecha::date >= COALESCE($2::date, date_trunc('month', CURRENT_DATE))
         AND v.fecha::date <= COALESCE($3::date, CURRENT_DATE)`,
      [sucursal_id || null, desde || null, hasta || null]
    );

    const { rows: reparacionesRows } = await pool.query(
      `SELECT COALESCE(SUM(ganancia), 0) AS ganancia_reparaciones
       FROM reparaciones
       WHERE estado = 'entregado'
         AND ($1::int IS NULL OR sucursal_id = $1)
         AND fecha_entrega::date >= COALESCE($2::date, date_trunc('month', CURRENT_DATE))
         AND fecha_entrega::date <= COALESCE($3::date, CURRENT_DATE)`,
      [sucursal_id || null, desde || null, hasta || null]
    );

    const totalVentas = Number(ventasRows[0].total_ventas);
    const totalCosto = Number(ventasRows[0].total_costo);
    const gananciaReparaciones = Number(reparacionesRows[0].ganancia_reparaciones);
    const gananciaVentas = totalVentas - totalCosto;

    res.json({
      total_ventas: totalVentas,
      total_costo_productos: totalCosto,
      ganancia_ventas: gananciaVentas,
      ganancia_reparaciones: gananciaReparaciones,
      ganancia_bruta_total: gananciaVentas + gananciaReparaciones
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
