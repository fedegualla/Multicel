import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

export const authRouter = Router();

// POST /api/auth/login
// body: { email, password }
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.rol, u.sucursal_id, u.activo,
              s.nombre AS sucursal_nombre
       FROM usuarios u
       LEFT JOIN sucursales s ON s.id = u.sucursal_id
       WHERE u.email = $1`,
      [email]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    const coincide = await bcrypt.compare(password, usuario.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, sucursal_id: usuario.sucursal_id },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        sucursal_id: usuario.sucursal_id,
        sucursal_nombre: usuario.sucursal_nombre
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/usuarios  (solo para que un admin cree cuentas nuevas)
// body: { nombre, email, password, rol, sucursal_id }
authRouter.post("/usuarios", async (req, res) => {
  const { nombre, email, password, rol, sucursal_id } = req.body;
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nombre, email, rol, sucursal_id`,
      [nombre, email, password_hash, rol, sucursal_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
