import { Router } from "express";
import { pool } from "../db/pool.js";

export const cajaRouter = Router();

// Cerrar la caja del día: calcula lo esperado (ventas en efectivo del día)
// y lo compara contra lo contado manualmente.
// POST /api/caja/cerrar
// body: { total_contado, observacion? }
cajaRouter.post("/cerrar", async (req, res) => {
  const { total_contado, observacion } = req.body;
  const sucursal_id = req.usuario.sucursal_id;
  const usuario_id = req.usuario.id;

  try {
    const { rows: esperadoRows } = await pool.query(
      `SELECT COALESCE(SUM(total), 0) AS total
       FROM ventas
       WHERE sucursal_id = $1
         AND forma_pago = 'efectivo'
         AND fecha::date = CURRENT_DATE`,
      [sucursal_id]
    );
    const totalEsperado = Number(esperadoRows[0].total);
    const totalContado = Number(total_contado) || 0;
    const diferencia = totalContado - totalEsperado;

    const { rows } = await pool.query(
      `INSERT INTO cierres_caja
        (sucursal_id, usuario_id, fecha, total_esperado, total_contado, diferencia, observacion, cerrado_en)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, now())
       ON CONFLICT (sucursal_id, fecha)
       DO UPDATE SET total_contado = $4, diferencia = $5, observacion = $6, cerrado_en = now()
       RETURNING *`,
      [sucursal_id, usuario_id, totalEsperado, totalContado, diferencia, observacion || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de cierres de caja
// GET /api/caja/cierres?sucursal_id=1
cajaRouter.get("/cierres", async (req, res) => {
  const { sucursal_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT c.*, s.nombre AS sucursal_nombre
       FROM cierres_caja c
       JOIN sucursales s ON s.id = c.sucursal_id
       WHERE ($1::int IS NULL OR c.sucursal_id = $1)
       ORDER BY c.fecha DESC
       LIMIT 60`,
      [sucursal_id || null]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
