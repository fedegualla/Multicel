import { Router } from "express";
import { pool } from "../db/pool.js";

export const notasRouter = Router();

// Notas de la sucursal del usuario logueado, más nuevas primero.
// GET /api/notas
notasRouter.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, u.nombre AS usuario_nombre
       FROM notas n
       JOIN usuarios u ON u.id = n.usuario_id
       WHERE n.sucursal_id = $1
       ORDER BY n.creado_en DESC`,
      [req.usuario.sucursal_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/notas  body: { texto }
notasRouter.post("/", async (req, res) => {
  const { texto } = req.body;
  if (!texto?.trim()) {
    return res.status(400).json({ error: "El texto no puede estar vacío." });
  }
  try {
    const { rows } = await pool.query(
      `WITH inserted AS (
         INSERT INTO notas (sucursal_id, usuario_id, texto) VALUES ($1, $2, $3) RETURNING *
       )
       SELECT inserted.*, u.nombre AS usuario_nombre
       FROM inserted JOIN usuarios u ON u.id = inserted.usuario_id`,
      [req.usuario.sucursal_id, req.usuario.id, texto.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Solo se puede borrar (no editar): es una esquela, se tira y se escribe otra.
// DELETE /api/notas/:id
notasRouter.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `DELETE FROM notas WHERE id = $1 AND sucursal_id = $2 RETURNING id`,
      [id, req.usuario.sucursal_id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Nota no encontrada." });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
