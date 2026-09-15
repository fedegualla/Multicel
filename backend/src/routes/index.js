import { Router } from "express";
import { productosRouter } from "./productos.js";
import { ventasRouter } from "./ventas.js";
import { authRouter } from "./auth.js";
import { proveedoresRouter } from "./proveedores.js";
import { sucursalesRouter } from "./sucursales.js";
import { reparacionesRouter } from "./reparaciones.js";
import { cajaRouter } from "./caja.js";
import { balanceRouter } from "./balance.js";
import { catalogoRouter } from "./catalogo.js";
import { mercadopagoRouter } from "./mercadopago.js";
import { clientesRouter } from "./clientes.js";
import { configuracionRouter } from "./configuracion.js";
import { notasRouter } from "./notas.js";
import { requiereAuth, requiereRol } from "../middleware/auth.js";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/catalogo", catalogoRouter); // público, sin login
apiRouter.use("/mercadopago", mercadopagoRouter); // público: lo llama Mercado Pago, no un usuario logueado
// Sin requiereAuth acá: /configuracion/publica es abierta a propósito, el resto
// de sus rutas se protegen adentro del propio router (soloAdmin por ruta).
apiRouter.use("/configuracion", configuracionRouter);
apiRouter.use("/productos", requiereAuth, productosRouter);
apiRouter.use("/ventas", requiereAuth, ventasRouter);
apiRouter.use("/clientes", requiereAuth, clientesRouter);
apiRouter.use("/proveedores", requiereAuth, proveedoresRouter);
apiRouter.use("/sucursales", requiereAuth, sucursalesRouter);
apiRouter.use("/reparaciones", requiereAuth, reparacionesRouter);
apiRouter.use("/caja", requiereAuth, cajaRouter);
apiRouter.use("/notas", requiereAuth, notasRouter);
apiRouter.use("/balance", requiereAuth, requiereRol("admin"), balanceRouter);

// Próximos módulos a implementar en las siguientes iteraciones:
// apiRouter.use("/sucursales", sucursalesRouter);
// apiRouter.use("/usuarios", usuariosRouter);
// apiRouter.use("/proveedores", proveedoresRouter);
// apiRouter.use("/reparaciones", reparacionesRouter);
// apiRouter.use("/caja", cajaRouter);
// apiRouter.use("/balance", balanceRouter);
// apiRouter.use("/catalogo", catalogoPublicoRouter); // sin precios, solo disponibilidad
