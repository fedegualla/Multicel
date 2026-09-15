import { Router } from "express";
import { pool } from "../db/pool.js";

export const reparacionesRouter = Router();

// Alta de una ficha de reparación
// POST /api/reparaciones
reparacionesRouter.post("/", async (req, res) => {
  const {
    cliente_nombre, cliente_contacto, equipo, estado_fisico,
    falla_reportada, presupuesto, senia_pagada, clave_desbloqueo
  } = req.body;

  const sucursal_id = req.usuario.sucursal_id;
  const usuario_id = req.usuario.id;

  try {
    const { rows } = await pool.query(
      `INSERT INTO reparaciones
        (sucursal_id, usuario_id, cliente_nombre, cliente_contacto, equipo,
         estado_fisico, falla_reportada, presupuesto, senia_pagada, clave_desbloqueo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [sucursal_id, usuario_id, cliente_nombre, cliente_contacto, equipo,
       estado_fisico, falla_reportada, presupuesto || null, senia_pagada || 0, clave_desbloqueo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listado de reparaciones, filtrable por estado y sucursal
// GET /api/reparaciones?estado=recibido&sucursal_id=1
reparacionesRouter.get("/", async (req, res) => {
  const { estado, sucursal_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reparaciones
       WHERE ($1::text IS NULL OR estado = $1)
         AND ($2::int IS NULL OR sucursal_id = $2)
       ORDER BY fecha_ingreso DESC`,
      [estado || null, sucursal_id || null]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reparaciones listas para entregar hace más de N días sin retirar. Si no se
// pasa ?dias, se usa el valor configurado en Administración → Configuración
// (clave "dias_aviso_reparacion_sin_retirar"), con 7 como último respaldo.
// GET /api/reparaciones/aviso-sin-retirar?dias=7
reparacionesRouter.get("/aviso-sin-retirar", async (req, res) => {
  let dias = parseInt(req.query.dias);
  try {
    if (!dias) {
      const { rows: configRows } = await pool.query(
        "SELECT valor FROM configuracion WHERE clave = 'dias_aviso_reparacion_sin_retirar'"
      );
      const valor = Number(configRows[0]?.valor);
      dias = Number.isFinite(valor) && valor > 0 ? valor : 7;
    }
    const { rows } = await pool.query(
      `SELECT * FROM reparaciones
       WHERE estado = 'listo_para_entregar'
         AND fecha_listo < now() - ($1 || ' days')::interval
       ORDER BY fecha_listo ASC`,
      [dias]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Marcar una reparación como lista para entregar
// PATCH /api/reparaciones/:id/listo
reparacionesRouter.patch("/:id/listo", async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `UPDATE reparaciones
       SET estado = 'listo_para_entregar', fecha_listo = now()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Entregar el equipo: carga costo de repuesto, calcula ganancia, cierra la ficha
// PATCH /api/reparaciones/:id/entregar
// body: { costo_repuesto }
reparacionesRouter.patch("/:id/entregar", async (req, res) => {
  const { id } = req.params;
  const { costo_repuesto } = req.body;
  try {
    const { rows: actuales } = await pool.query(
      "SELECT presupuesto FROM reparaciones WHERE id = $1",
      [id]
    );
    if (!actuales[0]) return res.status(404).json({ error: "Reparación no encontrada." });

    const presupuesto = Number(actuales[0].presupuesto) || 0;
    const costo = Number(costo_repuesto) || 0;
    const ganancia = presupuesto - costo;

    const { rows } = await pool.query(
      `UPDATE reparaciones
       SET costo_repuesto = $1, ganancia = $2, estado = 'entregado', fecha_entrega = now()
       WHERE id = $3 RETURNING *`,
      [costo, ganancia, id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
