import { Router } from "express";
import { pool } from "../db/pool.js";

export const catalogoRouter = Router();

// Catálogo público: nombre, marca/modelo, categoría y disponibilidad combinada
// de ambas sucursales. Sin precio, sin cantidad exacta. No requiere login.
// GET /api/catalogo?q=texto&categoria=
catalogoRouter.get("/", async (req, res) => {
  const { q = "", categoria = "" } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT
         p.id, p.nombre, p.marca, p.modelo, p.categoria, p.tipo,
         CASE
           WHEN p.tipo = 'equipo' THEN
             EXISTS (SELECT 1 FROM equipos_imei e WHERE e.producto_id = p.id AND e.estado = 'disponible')
           ELSE
             EXISTS (SELECT 1 FROM stock_accesorios sa WHERE sa.producto_id = p.id AND sa.cantidad > 0)
         END AS disponible
       FROM productos p
       WHERE p.activo = true
         AND p.nombre ILIKE '%' || $1 || '%'
         AND ($2 = '' OR p.categoria = $2)
       ORDER BY p.nombre`,
      [q, categoria]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
