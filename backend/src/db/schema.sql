-- =========================================================
-- Sistema de Stock y Ventas - Local de Celulares
-- Esquema de base de datos PostgreSQL
-- =========================================================

-- ---------- SUCURSALES Y USUARIOS ----------

CREATE TABLE sucursales (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  direccion VARCHAR(255),
  telefono VARCHAR(50),
  activa BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE rol_usuario AS ENUM ('admin', 'vendedor');

CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'vendedor',
  sucursal_id INTEGER REFERENCES sucursales(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PROVEEDORES ----------

CREATE TABLE proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  contacto VARCHAR(150),
  telefono VARCHAR(50),
  cuit VARCHAR(20),
  notas TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- PRODUCTOS ----------

CREATE TYPE tipo_producto AS ENUM ('equipo', 'accesorio');

CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  tipo tipo_producto NOT NULL,
  nombre VARCHAR(200) NOT NULL,
  marca VARCHAR(100),
  modelo VARCHAR(100),
  categoria VARCHAR(100),
  codigo_barras VARCHAR(100) UNIQUE,
  proveedor_id INTEGER REFERENCES proveedores(id),
  precio_costo NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_ganancia NUMERIC(6,2) NOT NULL DEFAULT 0,
  porcentaje_iva NUMERIC(5,2) NOT NULL DEFAULT 21,
  precio_venta NUMERIC(12,2) NOT NULL DEFAULT 0, -- calculado: costo*(1+gan)*(1+iva), redondeado a $100
  recargo_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0, -- % que se suma al precio_venta al pagar con tarjeta/QR
  umbral_stock_bajo INTEGER DEFAULT 3, -- solo aplica a accesorios
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_productos_tipo ON productos(tipo);
CREATE INDEX idx_productos_codigo_barras ON productos(codigo_barras);

-- Equipos: unidad individual por IMEI/serie
CREATE TYPE estado_equipo AS ENUM ('disponible', 'reservado', 'vendido');

CREATE TABLE equipos_imei (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  imei VARCHAR(50) NOT NULL UNIQUE,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  estado estado_equipo NOT NULL DEFAULT 'disponible',
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_equipos_imei_sucursal ON equipos_imei(sucursal_id, estado);

-- Accesorios: stock por cantidad, por sucursal
CREATE TABLE stock_accesorios (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  cantidad INTEGER NOT NULL DEFAULT 0,
  UNIQUE (producto_id, sucursal_id)
);

-- Transferencias de stock entre sucursales
CREATE TABLE transferencias_stock (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  imei_id INTEGER REFERENCES equipos_imei(id), -- null si es accesorio
  cantidad INTEGER, -- null si es equipo (siempre 1 por IMEI)
  sucursal_origen_id INTEGER NOT NULL REFERENCES sucursales(id),
  sucursal_destino_id INTEGER NOT NULL REFERENCES sucursales(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- CLIENTES (opcional, para facturación) ----------

CREATE TABLE clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  cuil VARCHAR(20),
  telefono VARCHAR(50),
  email VARCHAR(150),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- VENTAS ----------

CREATE TYPE tipo_comprobante AS ENUM ('factura', 'consumidor_final');
CREATE TYPE forma_pago AS ENUM ('efectivo', 'transferencia', 'tarjeta_mp', 'qr_mp');

-- Efectivo/transferencia quedan "aprobado" al toque (el vendedor las confirma a ojo).
-- tarjeta_mp/qr_mp arrancan "pendiente" hasta que el webhook de Mercado Pago confirma el cobro.
CREATE TYPE estado_pago_venta AS ENUM ('pendiente', 'aprobado', 'rechazado');

CREATE TABLE ventas (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_id INTEGER REFERENCES clientes(id),
  tipo_comprobante tipo_comprobante NOT NULL DEFAULT 'consumidor_final',
  forma_pago forma_pago NOT NULL,
  subtotal NUMERIC(12,2) NOT NULL,
  descuento_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  estado_pago estado_pago_venta NOT NULL DEFAULT 'aprobado',
  mp_preference_id VARCHAR(100),
  mp_payment_id VARCHAR(100),
  cierre_caja_id INTEGER, -- se completa al cerrar caja del día
  fecha TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ventas_sucursal_fecha ON ventas(sucursal_id, fecha);
CREATE INDEX idx_ventas_mp_payment_id ON ventas(mp_payment_id);

CREATE TABLE venta_items (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  imei_id INTEGER REFERENCES equipos_imei(id), -- null si es accesorio
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL,
  costo_unitario NUMERIC(12,2) NOT NULL, -- copia del costo al momento de vender, para el balance
  cantidad_devuelta INTEGER NOT NULL DEFAULT 0
);

-- ---------- REPARACIONES ----------

CREATE TYPE estado_reparacion AS ENUM ('recibido', 'listo_para_entregar', 'entregado');

CREATE TABLE reparaciones (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  cliente_nombre VARCHAR(150) NOT NULL,
  cliente_contacto VARCHAR(100) NOT NULL,
  equipo VARCHAR(150) NOT NULL,
  estado_fisico TEXT,
  falla_reportada TEXT NOT NULL,
  presupuesto NUMERIC(12,2),
  senia_pagada NUMERIC(12,2) DEFAULT 0,
  clave_desbloqueo VARCHAR(100),
  costo_repuesto NUMERIC(12,2),
  ganancia NUMERIC(12,2), -- calculada: presupuesto - costo_repuesto
  estado estado_reparacion NOT NULL DEFAULT 'recibido',
  fecha_ingreso TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_listo TIMESTAMPTZ,
  fecha_entrega TIMESTAMPTZ
);

CREATE INDEX idx_reparaciones_estado ON reparaciones(estado, fecha_listo);

-- ---------- CIERRES DE CAJA ----------

CREATE TABLE cierres_caja (
  id SERIAL PRIMARY KEY,
  sucursal_id INTEGER NOT NULL REFERENCES sucursales(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha DATE NOT NULL,
  total_esperado NUMERIC(12,2) NOT NULL, -- calculado por el sistema
  total_contado NUMERIC(12,2), -- ingresado manualmente
  diferencia NUMERIC(12,2), -- contado - esperado
  observacion TEXT,
  abierto_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en TIMESTAMPTZ,
  UNIQUE (sucursal_id, fecha)
);

ALTER TABLE ventas
  ADD CONSTRAINT fk_ventas_cierre FOREIGN KEY (cierre_caja_id) REFERENCES cierres_caja(id);

-- ---------- CONFIGURACIÓN GENERAL ----------

CREATE TABLE configuracion (
  clave VARCHAR(100) PRIMARY KEY,
  valor VARCHAR(255) NOT NULL
);

-- Config inicial sugerida
INSERT INTO configuracion (clave, valor) VALUES
  ('descuento_efectivo_transferencia', '10'),      -- % de descuento por pagar en efectivo/transferencia
  ('dias_aviso_reparacion_sin_retirar', '7');       -- días para avisar reparación lista sin retirar
