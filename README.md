# Sistema de Stock y Ventas — Local de Celulares

## Estructura
- `backend/` — API en Node.js + Express + PostgreSQL
- `frontend/` — Aplicación React (Vite): catálogo público + caja/stock/reparaciones/admin

## Cómo levantarlo en local

### 1) Base de datos
Necesitás una base PostgreSQL corriendo (local o en Render). Copiá `backend/.env.example`
a `backend/.env` y completá `DATABASE_URL` con los datos de conexión.

### 2) Backend
```
cd backend
npm install
npm run migrate   # crea todas las tablas
npm run seed      # carga sucursales + usuarios de prueba
npm run dev        # levanta el servidor en http://localhost:4000
```

Usuarios de prueba (creados por `npm run seed`):
- Admin: `admin@prueba.com` / `prueba123`
- Vendedor: `vendedor@prueba.com` / `prueba123`

### 3) Frontend
```
cd frontend
npm install
npm run dev        # levanta la app en http://localhost:5173
```

El frontend redirige automáticamente las llamadas a `/api` hacia `http://localhost:4000`
(configurado en `vite.config.js`), así que con ambos corriendo ya podés loguearte y
probar el flujo completo: login → venta → alta de stock → reparaciones → panel admin.

El catálogo público (`/`) no requiere login.

## Cobro con Mercado Pago (tarjeta/QR)

Cuando en la pantalla de venta se elige "Tarjeta / QR", el sistema genera un cobro
en Mercado Pago y queda esperando la confirmación: apenas Mercado Pago avisa que el
pago se acreditó (vía webhook), la venta pasa sola a "aprobado" — no hace falta que
el vendedor confirme nada a mano.

Para que funcione hace falta:
1. Completar en `backend/.env`: `MP_ACCESS_TOKEN` (panel de developers de Mercado Pago),
   `MP_WEBHOOK_SECRET` (clave secreta del webhook, mismo panel) y `APP_BASE_URL`.
2. Que Mercado Pago pueda llegar a tu backend. En local no alcanza con `localhost`:
   hace falta un túnel público (ej. `ngrok http 4000`) y poner esa URL en `APP_BASE_URL`.
3. Configurar esa misma URL + `/api/mercadopago/webhook` como notification URL en el
   panel de Mercado Pago (o dejar que el sistema la mande sola en cada preferencia,
   que es lo que hace por defecto).

Si el pago se rechaza o el vendedor cancela el cobro, el stock reservado se repone
automáticamente.

## Qué falta todavía
- Facturación electrónica AFIP (integración real)
- Transferencias de stock entre sucursales
- Datos de clientes para facturación
- Deploy en Render (backend + base de datos)
