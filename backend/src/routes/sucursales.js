import { Router } from "express";
import { pool } from "../db/pool.js";
import { requiereRol } from "../middleware/auth.js";

export const sucursalesRouter = Router();

// Por defecto solo trae las activas (para los selectores de venta/alta/etc).
// Con ?todas=true trae también las deshabilitadas, para poder reactivarlas
// desde Administración → Configuración.
// GET /api/sucursales?todas=true
sucursalesRouter.get("/", async (req, res) => {
  const { todas } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM sucursales WHERE ($1::boolean OR activa = true) ORDER BY nombre`,
      [todas === "true"]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar nombre/contacto de una sucursal, o habilitarla/deshabilitarla. Una
// sucursal deshabilitada deja de aparecer en los selectores de venta y alta
// de stock (pero no borra nada: las ventas y el stock ya cargados siguen ahí).
// PUT /api/sucursales/:id
sucursalesRouter.put("/:id", requiereRol("admin"), async (req, res) => {
  const { id } = req.params;
  const { nombre, direccion, telefono, activa } = req.body;
  if (!nombre?.trim()) {
    return res.status(400).json({ error: "El nombre es obligatorio." });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE sucursales SET nombre = $1, direccion = $2, telefono = $3, activa = $4
       WHERE id = $5 RETURNING *`,
      [nombre.trim(), direccion || null, telefono || null, activa !== false, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Sucursal no encontrada." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
