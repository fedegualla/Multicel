import { Router } from "express";
import { pool } from "../db/pool.js";

export const proveedoresRouter = Router();

proveedoresRouter.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM proveedores ORDER BY nombre");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

proveedoresRouter.post("/", async (req, res) => {
  const { nombre, contacto, telefono, cuit, notas } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO proveedores (nombre, contacto, telefono, cuit, notas)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre, contacto, telefono, cuit, notas]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar los datos de un proveedor ya cargado.
// PUT /api/proveedores/:id
proveedoresRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, contacto, telefono, cuit, notas } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE proveedores SET nombre = $1, contacto = $2, telefono = $3, cuit = $4, notas = $5
       WHERE id = $6 RETURNING *`,
      [nombre, contacto, telefono, cuit, notas, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Proveedor no encontrado." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
