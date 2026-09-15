import { Router } from "express";
import { pool } from "../db/pool.js";

export const clientesRouter = Router();

// Listado de clientes, con búsqueda por nombre/apellido/CUIL.
// GET /api/clientes?q=texto
clientesRouter.get("/", async (req, res) => {
  const { q = "" } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM clientes
       WHERE ($1 = '' OR nombre ILIKE '%' || $1 || '%' OR apellido ILIKE '%' || $1 || '%' OR cuil ILIKE '%' || $1 || '%')
       ORDER BY apellido, nombre`,
      [q]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar los datos de contacto de un cliente ya cargado.
// PUT /api/clientes/:id
clientesRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nombre, apellido, cuil = null, telefono = null, email = null } = req.body;

  if (!nombre?.trim() || !apellido?.trim()) {
    return res.status(400).json({ error: "Nombre y apellido son obligatorios." });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE clientes SET nombre = $1, apellido = $2, cuil = $3, telefono = $4, email = $5
       WHERE id = $6 RETURNING *`,
      [nombre.trim(), apellido.trim(), cuil?.trim() || null, telefono?.trim() || null, email?.trim() || null, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Cliente no encontrado." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Da de alta un cliente para facturar, o reutiliza uno ya cargado con el
// mismo CUIL (así no se duplica el mismo cliente en cada venta).
// POST /api/clientes
// body: { nombre, apellido, cuil?, telefono?, email? }
clientesRouter.post("/", async (req, res) => {
  const { nombre, apellido, cuil = null, telefono = null, email = null } = req.body;

  if (!nombre?.trim() || !apellido?.trim()) {
    return res.status(400).json({ error: "Nombre y apellido son obligatorios." });
  }

  try {
    if (cuil?.trim()) {
      const { rows: existentes } = await pool.query(
        "SELECT * FROM clientes WHERE cuil = $1 LIMIT 1",
        [cuil.trim()]
      );
      if (existentes[0]) {
        return res.json(existentes[0]);
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO clientes (nombre, apellido, cuil, telefono, email)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [nombre.trim(), apellido.trim(), cuil?.trim() || null, telefono?.trim() || null, email?.trim() || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
