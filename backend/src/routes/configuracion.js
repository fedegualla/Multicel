import { Router } from "express";
import { pool } from "../db/pool.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

export const configuracionRouter = Router();
const soloAdmin = [requiereAuth, requiereRol("admin")];

// Claves que se pueden leer sin login: el catálogo público necesita el número
// de WhatsApp, y la pantalla de venta necesita el % de descuento para calcular
// precios (no es información sensible). El resto queda solo para admin.
const CLAVES_PUBLICAS = ["whatsapp_numero", "descuento_efectivo_transferencia"];

// GET /api/configuracion/publica — sin auth, para el catálogo online
configuracionRouter.get("/publica", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT clave, valor FROM configuracion WHERE clave = ANY($1)",
      [CLAVES_PUBLICAS]
    );
    res.json(Object.fromEntries(rows.map((r) => [r.clave, r.valor])));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/configuracion — listado completo, solo admin
configuracionRouter.get("/", soloAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM configuracion ORDER BY clave");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crea o actualiza un valor de configuración.
// PUT /api/configuracion/:clave
// body: { valor }
configuracionRouter.put("/:clave", soloAdmin, async (req, res) => {
  const { clave } = req.params;
  const { valor } = req.body;
  if (valor === undefined || valor === null || String(valor).trim() === "") {
    return res.status(400).json({ error: "El valor no puede estar vacío." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO configuracion (clave, valor) VALUES ($1, $2)
       ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor
       RETURNING *`,
      [clave, String(valor).trim()]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
