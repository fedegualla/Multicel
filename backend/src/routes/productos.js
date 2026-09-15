import { Router } from "express";
import { pool } from "../db/pool.js";
import { calcularPrecioVenta } from "../utils/precios.js";

export const productosRouter = Router();

// Buscar productos por nombre o código de barras, con stock por sucursal.
// Los accesorios tienen stock por cantidad (stock_accesorios); los equipos, uno
// por IMEI (equipos_imei) — para vender un equipo alcanza con tomar cualquier
// IMEI "disponible" de la sucursal, por eso acá se devuelve la lista completa
// (imeis_disponibles) y el frontend va tomando uno por cada unidad que se agrega.
// GET /api/productos/buscar?q=texto&sucursal_id=1
productosRouter.get("/buscar", async (req, res) => {
  const { q = "", sucursal_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT p.*,
              CASE
                WHEN p.tipo = 'equipo' THEN COALESCE(imei_propia.cantidad, 0)
                ELSE COALESCE(sa_propia.cantidad, 0)
              END AS stock_propia,
              CASE
                WHEN p.tipo = 'equipo' THEN COALESCE(imei_otra.cantidad, 0)
                ELSE COALESCE(sa_otra.cantidad, 0)
              END AS stock_otra,
              imei_propia.imeis_disponibles
       FROM productos p
       LEFT JOIN stock_accesorios sa_propia
         ON sa_propia.producto_id = p.id AND sa_propia.sucursal_id = $2
       LEFT JOIN stock_accesorios sa_otra
         ON sa_otra.producto_id = p.id AND sa_otra.sucursal_id <> $2
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cantidad, ARRAY_AGG(id ORDER BY id) AS imeis_disponibles
         FROM equipos_imei ei
         WHERE ei.producto_id = p.id AND ei.sucursal_id = $2 AND ei.estado = 'disponible'
       ) imei_propia ON p.tipo = 'equipo'
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS cantidad
         FROM equipos_imei ei
         WHERE ei.producto_id = p.id AND ei.sucursal_id <> $2 AND ei.estado = 'disponible'
       ) imei_otra ON p.tipo = 'equipo'
       WHERE p.activo = true
         AND (p.nombre ILIKE '%' || $1 || '%' OR p.codigo_barras = $1)
       LIMIT 20`,
      [q, sucursal_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catálogo completo para el panel de stock del admin: todos los productos
// activos con su stock desglosado por sucursal (accesorios: cantidad cargada;
// equipos: cuántos IMEI quedan "disponible"). Con incluirInactivos=true trae
// también los dados de baja, para poder reactivarlos.
// GET /api/productos?q=texto&incluirInactivos=true
productosRouter.get("/", async (req, res) => {
  const { q = "", incluirInactivos } = req.query;
  try {
    const { rows: productos } = await pool.query(
      `SELECT * FROM productos
       WHERE ($1::boolean OR activo = true)
         AND ($2 = '' OR nombre ILIKE '%' || $2 || '%' OR codigo_barras = $2)
       ORDER BY activo DESC, nombre`,
      [incluirInactivos === "true", q]
    );
    const { rows: sucursales } = await pool.query(
      "SELECT id, nombre FROM sucursales WHERE activa = true ORDER BY id"
    );
    const { rows: stockAccesorios } = await pool.query(
      "SELECT producto_id, sucursal_id, cantidad FROM stock_accesorios"
    );
    const { rows: stockEquipos } = await pool.query(
      `SELECT producto_id, sucursal_id, COUNT(*) AS cantidad
       FROM equipos_imei WHERE estado = 'disponible'
       GROUP BY producto_id, sucursal_id`
    );

    const cantidadPorProductoYSucursal = {};
    for (const fila of [...stockAccesorios, ...stockEquipos]) {
      cantidadPorProductoYSucursal[fila.producto_id] ??= {};
      cantidadPorProductoYSucursal[fila.producto_id][fila.sucursal_id] = Number(fila.cantidad);
    }

    const resultado = productos.map((p) => ({
      ...p,
      stock: sucursales.map((s) => ({
        sucursal_id: s.id,
        sucursal_nombre: s.nombre,
        cantidad: cantidadPorProductoYSucursal[p.id]?.[s.id] ?? 0
      }))
    }));

    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar los datos y el precio de un producto ya cargado.
// PUT /api/productos/:id
productosRouter.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    nombre, marca, modelo, categoria,
    precio_costo, porcentaje_ganancia, porcentaje_iva, recargo_porcentaje,
    umbral_stock_bajo
  } = req.body;

  const precio_venta = calcularPrecioVenta(precio_costo, porcentaje_ganancia, porcentaje_iva);

  try {
    const { rows } = await pool.query(
      `UPDATE productos SET
         nombre = $1, marca = $2, modelo = $3, categoria = $4,
         precio_costo = $5, porcentaje_ganancia = $6, porcentaje_iva = $7,
         recargo_porcentaje = $8, precio_venta = $9, umbral_stock_bajo = $10,
         actualizado_en = now()
       WHERE id = $11
       RETURNING *`,
      [nombre, marca, modelo, categoria, precio_costo, porcentaje_ganancia,
       porcentaje_iva, recargo_porcentaje || 0, precio_venta, umbral_stock_bajo, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Producto no encontrado." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Activar o desactivar un producto (baja lógica: deja de aparecer en ventas
// y en este listado, pero no se borra el historial de ventas ya hechas).
// PATCH /api/productos/:id/estado
productosRouter.patch("/:id/estado", async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE productos SET activo = $1 WHERE id = $2 RETURNING *",
      [!!activo, id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Producto no encontrado." });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Alta de producto (equipo o accesorio) con cálculo automático de precio
// POST /api/productos
productosRouter.post("/", async (req, res) => {
  const {
    tipo, nombre, marca, modelo, categoria, codigo_barras,
    proveedor_id, precio_costo, porcentaje_ganancia, porcentaje_iva,
    recargo_porcentaje, umbral_stock_bajo
  } = req.body;

  const precio_venta = calcularPrecioVenta(precio_costo, porcentaje_ganancia, porcentaje_iva);

  try {
    const { rows } = await pool.query(
      `INSERT INTO productos
        (tipo, nombre, marca, modelo, categoria, codigo_barras, proveedor_id,
         precio_costo, porcentaje_ganancia, porcentaje_iva, precio_venta, recargo_porcentaje, umbral_stock_bajo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [tipo, nombre, marca, modelo, categoria, codigo_barras, proveedor_id,
       precio_costo, porcentaje_ganancia, porcentaje_iva, precio_venta, recargo_porcentaje || 0, umbral_stock_bajo]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Agregar un IMEI/serie al stock (solo para productos tipo "equipo")
// POST /api/productos/:id/imei
// body: { imei, sucursal_id }
productosRouter.post("/:id/imei", async (req, res) => {
  const { id } = req.params;
  const { imei, sucursal_id } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO equipos_imei (producto_id, imei, sucursal_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, imei, sucursal_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Ese IMEI ya está cargado en el sistema." });
    }
    res.status(500).json({ error: err.message });
  }
});

// Sumar cantidad al stock de un accesorio en una sucursal
// POST /api/productos/:id/stock
// body: { sucursal_id, cantidad }
productosRouter.post("/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { sucursal_id, cantidad } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO stock_accesorios (producto_id, sucursal_id, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (producto_id, sucursal_id)
       DO UPDATE SET cantidad = stock_accesorios.cantidad + EXCLUDED.cantidad
       RETURNING *`,
      [id, sucursal_id, cantidad]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Corregir el stock de un accesorio en una sucursal a un valor exacto (a
// diferencia del POST de arriba, que suma; esto se usa para arreglar un
// número mal cargado, no para sumar mercadería nueva).
// PUT /api/productos/:id/stock
// body: { sucursal_id, cantidad }
productosRouter.put("/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { sucursal_id, cantidad } = req.body;
  const cantidadNumero = parseInt(cantidad);
  if (!sucursal_id || isNaN(cantidadNumero) || cantidadNumero < 0) {
    return res.status(400).json({ error: "Sucursal y cantidad son obligatorios (cantidad >= 0)." });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO stock_accesorios (producto_id, sucursal_id, cantidad)
       VALUES ($1, $2, $3)
       ON CONFLICT (producto_id, sucursal_id)
       DO UPDATE SET cantidad = EXCLUDED.cantidad
       RETURNING *`,
      [id, sucursal_id, cantidadNumero]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/productos/stock-bajo?sucursal_id=1
productosRouter.get("/stock-bajo", async (req, res) => {
  const { sucursal_id } = req.query;
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.nombre, sa.cantidad, p.umbral_stock_bajo, sa.sucursal_id
       FROM productos p
       JOIN stock_accesorios sa ON sa.producto_id = p.id
       WHERE p.tipo = 'accesorio'
         AND sa.cantidad <= p.umbral_stock_bajo
         AND ($1::int IS NULL OR sa.sucursal_id = $1)`,
      [sucursal_id || null]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
