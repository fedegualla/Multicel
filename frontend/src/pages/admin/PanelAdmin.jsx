import { useState, useEffect, Fragment } from "react";
import { Link } from "react-router-dom";
import { apiFetch, usuarioActual, hoyISO } from "../../api/client.js";
import AltaProducto from "./AltaProducto.jsx";
import "./PanelAdmin.css";

const SECCIONES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "ventas", label: "Ventas" },
  { id: "stock", label: "Stock" },
  { id: "clientes", label: "Clientes" },
  { id: "caja", label: "Caja" },
  { id: "reparaciones", label: "Historial de reparaciones" },
  { id: "balance", label: "Balance" },
  { id: "proveedores", label: "Proveedores" },
  { id: "configuracion", label: "Configuración" }
];

export default function PanelAdmin() {
  const [seccion, setSeccion] = useState("dashboard");
  const usuario = usuarioActual();

  return (
    <div className="panel">
      <div className="panel-sidebar">
        <h2>Administración</h2>
        <Link to="/ventas/historial" className="panel-volver">← Volver a ventas</Link>
        {SECCIONES.map((s) => (
          <button
            key={s.id}
            className={seccion === s.id ? "activo" : ""}
            onClick={() => setSeccion(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="panel-contenido">
        {seccion === "dashboard" && <Dashboard usuario={usuario} />}
        {seccion === "ventas" && <VentasSeccion usuario={usuario} />}
        {seccion === "stock" && <StockSeccion usuario={usuario} />}
        {seccion === "clientes" && <ClientesSeccion />}
        {seccion === "caja" && <CajaSeccion usuario={usuario} />}
        {seccion === "reparaciones" && <ReparacionesSeccion usuario={usuario} />}
        {seccion === "balance" && <BalanceSeccion usuario={usuario} />}
        {seccion === "proveedores" && <ProveedoresSeccion />}
        {seccion === "configuracion" && <ConfiguracionSeccion />}
      </div>
    </div>
  );
}

// Selector de sucursal reutilizado en Dashboard, Ventas, Caja y Balance: por
// defecto la propia del usuario, pero un admin puede elegir cualquier otra o
// "Todas" — antes estas pantallas quedaban ancladas para siempre a su sucursal.
function useSucursales() {
  const [sucursales, setSucursales] = useState([]);
  useEffect(() => {
    apiFetch("/sucursales").then((r) => r.json()).then(setSucursales).catch(() => {});
  }, []);
  return sucursales;
}

function SelectorSucursal({ sucursales, value, onChange, incluirTodas = true }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {incluirTodas && <option value="">Todas las sucursales</option>}
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>{s.nombre}</option>
      ))}
    </select>
  );
}

function Dashboard({ usuario }) {
  const [ventasHoy, setVentasHoy] = useState([]);
  const [stockBajo, setStockBajo] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [balance, setBalance] = useState(null);
  const [sucursalId, setSucursalId] = useState(String(usuario.sucursal_id || ""));
  const sucursales = useSucursales();

  useEffect(() => {
    const filtro = sucursalId ? `?sucursal_id=${sucursalId}` : "";
    apiFetch(`/ventas/dia${filtro}`).then((r) => r.json()).then(setVentasHoy);
    apiFetch(`/productos/stock-bajo${filtro}`).then((r) => r.json()).then(setStockBajo);
    apiFetch("/reparaciones/aviso-sin-retirar").then((r) => r.json()).then(setAvisos);
    apiFetch(`/balance${filtro}`).then((r) => r.json()).then(setBalance);
  }, [sucursalId]);

  const totalHoy = ventasHoy.reduce((acc, v) => acc + Number(v.total), 0);
  const nombreSucursal = sucursalId
    ? sucursales.find((s) => String(s.id) === sucursalId)?.nombre
    : "todas las sucursales";

  return (
    <div>
      <div className="panel-encabezado">
        <h1>Dashboard</h1>
        <SelectorSucursal sucursales={sucursales} value={sucursalId} onChange={setSucursalId} />
      </div>

      {stockBajo.length > 0 && (
        <div className="panel-alerta">
          {stockBajo.length} producto(s) con stock bajo.
        </div>
      )}
      {avisos.length > 0 && (
        <div className="panel-alerta">
          {avisos.length} reparación(es) lista(s) sin retirar hace tiempo.
        </div>
      )}

      <div className="panel-grid">
        <div className="panel-stat">
          <div className="label">Ventas de hoy ({nombreSucursal})</div>
          <div className="valor">${totalHoy.toLocaleString("es-AR")}</div>
        </div>
        <div className="panel-stat">
          <div className="label">Cantidad de ventas hoy</div>
          <div className="valor">{ventasHoy.length}</div>
        </div>
        <div className="panel-stat">
          <div className="label">Ganancia bruta del mes</div>
          <div className="valor">
            {balance ? `$${balance.ganancia_bruta_total.toLocaleString("es-AR")}` : "…"}
          </div>
        </div>
      </div>
    </div>
  );
}

function VentasSeccion({ usuario }) {
  const [ventas, setVentas] = useState([]);
  const [fecha, setFecha] = useState(hoyISO());
  const [sucursalId, setSucursalId] = useState(String(usuario.sucursal_id || ""));
  const sucursales = useSucursales();
  const viendoTodas = sucursalId === "";

  useEffect(() => {
    const filtroSucursal = sucursalId ? `sucursal_id=${sucursalId}&` : "";
    apiFetch(`/ventas/dia?${filtroSucursal}fecha=${fecha}`)
      .then((r) => r.json())
      .then(setVentas);
  }, [fecha, sucursalId]);

  return (
    <div>
      <h1>Ventas</h1>
      <div className="panel-filtros">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <SelectorSucursal sucursales={sucursales} value={sucursalId} onChange={setSucursalId} />
      </div>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Hora</th>
            {viendoTodas && <th>Sucursal</th>}
            <th>Vendedor</th>
            <th>Forma de pago</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.id}>
              <td>{new Date(v.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</td>
              {viendoTodas && <td>{v.sucursal_nombre}</td>}
              <td>{v.vendedor}</td>
              <td>{v.forma_pago}</td>
              <td>${Number(v.total).toLocaleString("es-AR")}</td>
            </tr>
          ))}
          {ventas.length === 0 && (
            <tr><td colSpan={viendoTodas ? 5 : 4}>No hay ventas para esa fecha.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const CAMPOS_EDICION_VACIOS = {
  nombre: "", marca: "", modelo: "", categoria: "",
  precio_costo: "", porcentaje_ganancia: "", porcentaje_iva: "",
  recargo_porcentaje: "", umbral_stock_bajo: ""
};

function StockSeccion() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [stockBajo, setStockBajo] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [tipoEditando, setTipoEditando] = useState("accesorio");
  const [formEdicion, setFormEdicion] = useState(CAMPOS_EDICION_VACIOS);
  const [formStock, setFormStock] = useState({}); // sucursal_id -> cantidad (string), solo accesorios
  const [imeiNuevo, setImeiNuevo] = useState("");
  const [imeiSucursalId, setImeiSucursalId] = useState("");
  const [guardandoImei, setGuardandoImei] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const sucursales = useSucursales();

  function cargarProductos(q) {
    const filtroInactivos = mostrarInactivos ? "&incluirInactivos=true" : "";
    apiFetch(`/productos?q=${encodeURIComponent(q)}${filtroInactivos}`).then((r) => r.json()).then(setProductos);
  }

  useEffect(() => {
    apiFetch("/productos/stock-bajo").then((r) => r.json()).then(setStockBajo);
  }, []);

  useEffect(() => {
    const espera = setTimeout(() => cargarProductos(busqueda), 250);
    return () => clearTimeout(espera);
  }, [busqueda, mostrarInactivos]);

  async function reactivarProducto(p) {
    await apiFetch(`/productos/${p.id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ activo: true })
    });
    cargarProductos(busqueda);
  }

  function abrirEdicion(p) {
    setEditandoId(p.id);
    setTipoEditando(p.tipo);
    setMensaje(null);
    setFormEdicion({
      nombre: p.nombre,
      marca: p.marca || "",
      modelo: p.modelo || "",
      categoria: p.categoria || "",
      precio_costo: p.precio_costo,
      porcentaje_ganancia: p.porcentaje_ganancia,
      porcentaje_iva: p.porcentaje_iva,
      recargo_porcentaje: p.recargo_porcentaje,
      umbral_stock_bajo: p.umbral_stock_bajo
    });
    setFormStock(Object.fromEntries(p.stock.map((s) => [s.sucursal_id, String(s.cantidad)])));
    setImeiNuevo("");
    setImeiSucursalId(p.stock[0]?.sucursal_id ? String(p.stock[0].sucursal_id) : "");
  }

  function actualizarCampoEdicion(campo, valor) {
    setFormEdicion((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardarEdicion(id) {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await apiFetch(`/productos/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...formEdicion,
          precio_costo: parseFloat(formEdicion.precio_costo) || 0,
          porcentaje_ganancia: parseFloat(formEdicion.porcentaje_ganancia) || 0,
          porcentaje_iva: parseFloat(formEdicion.porcentaje_iva) || 0,
          recargo_porcentaje: parseFloat(formEdicion.recargo_porcentaje) || 0,
          umbral_stock_bajo: parseInt(formEdicion.umbral_stock_bajo) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }

      if (tipoEditando === "accesorio") {
        for (const [sucursal_id, cantidad] of Object.entries(formStock)) {
          await apiFetch(`/productos/${id}/stock`, {
            method: "PUT",
            body: JSON.stringify({ sucursal_id, cantidad: parseInt(cantidad) || 0 })
          });
        }
      }

      setEditandoId(null);
      cargarProductos(busqueda);
      apiFetch("/productos/stock-bajo").then((r) => r.json()).then(setStockBajo);
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  async function agregarImeiExistente(id) {
    if (!imeiNuevo.trim() || !imeiSucursalId) {
      setMensaje({ tipo: "error", texto: "Elegí la sucursal y escribí el IMEI." });
      return;
    }
    setGuardandoImei(true);
    setMensaje(null);
    try {
      const res = await apiFetch(`/productos/${id}/imei`, {
        method: "POST",
        body: JSON.stringify({ imei: imeiNuevo.trim(), sucursal_id: imeiSucursalId })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo agregar el IMEI." });
        return;
      }
      setImeiNuevo("");
      cargarProductos(busqueda);
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardandoImei(false);
    }
  }

  async function desactivarProducto(p) {
    if (!confirm(`¿Dar de baja "${p.nombre}"? Deja de aparecer en ventas, pero no se borra el historial.`)) return;
    await apiFetch(`/productos/${p.id}/estado`, {
      method: "PATCH",
      body: JSON.stringify({ activo: false })
    });
    cargarProductos(busqueda);
  }

  return (
    <div>
      <h1>Stock</h1>

      {mostrarAlta && (
        <div className="modal-alta-fondo" onClick={() => setMostrarAlta(false)}>
          <div className="modal-alta-flotante" onClick={(e) => e.stopPropagation()}>
            <button className="modal-alta-cerrar" onClick={() => setMostrarAlta(false)} aria-label="Cerrar">×</button>
            <AltaProducto
              onCreado={() => {
                cargarProductos(busqueda);
                apiFetch("/productos/stock-bajo").then((r) => r.json()).then(setStockBajo);
              }}
            />
          </div>
        </div>
      )}

      {stockBajo.length > 0 && (
        <div className="panel-alerta">
          {stockBajo.length} producto(s) con stock bajo.
        </div>
      )}

      <div className="panel-filtros">
        <input
          placeholder="Buscar producto por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <label className="stock-check-inactivos">
          <input
            type="checkbox"
            checked={mostrarInactivos}
            onChange={(e) => setMostrarInactivos(e.target.checked)}
          />
          Mostrar dados de baja
        </label>
        <button
          className="stock-tabla-boton"
          onClick={() => setMostrarAlta(true)}
        >
          + Nuevo producto
        </button>
      </div>

      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Precio de venta</th>
            <th>Recargo tarjeta</th>
            <th>Stock por sucursal</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {productos.map((p) => {
            const stockTotal = p.stock.reduce((acc, s) => acc + s.cantidad, 0);
            const sinStock = stockTotal === 0;
            const bajoStock = !sinStock && stockTotal <= p.umbral_stock_bajo;
            const filaClase = !p.activo
              ? "stock-tabla-fila-inactiva"
              : sinStock
                ? "stock-tabla-fila-sin-stock"
                : bajoStock
                  ? "stock-tabla-fila-bajo-stock"
                  : "";
            return (
            <Fragment key={p.id}>
              <tr className={filaClase}>
                <td>
                  {p.nombre}
                  {(p.marca || p.modelo) && (
                    <div className="stock-tabla-marca">{[p.marca, p.modelo].filter(Boolean).join(" ")}</div>
                  )}
                </td>
                <td>${Number(p.precio_venta).toLocaleString("es-AR")}</td>
                <td>{p.recargo_porcentaje > 0 ? `+${p.recargo_porcentaje}%` : "—"}</td>
                <td>
                  {p.stock.map((s) => (
                    <span key={s.sucursal_id} className="stock-tabla-sucursal">
                      {s.sucursal_nombre}: <strong>{s.cantidad}</strong>
                    </span>
                  ))}
                  {!p.activo && <span className="stock-tabla-etiqueta stock-tabla-etiqueta-gris">Dado de baja</span>}
                  {p.activo && sinStock && <span className="stock-tabla-etiqueta stock-tabla-etiqueta-roja">Sin stock</span>}
                  {p.activo && bajoStock && <span className="stock-tabla-etiqueta stock-tabla-etiqueta-amarilla">Stock bajo</span>}
                </td>
                <td className="stock-tabla-acciones">
                  {p.activo ? (
                    <>
                      <button className="stock-tabla-boton" onClick={() => abrirEdicion(p)}>Editar</button>
                      <button className="stock-tabla-boton stock-tabla-boton-baja" onClick={() => desactivarProducto(p)}>
                        Dar de baja
                      </button>
                    </>
                  ) : (
                    <button className="stock-tabla-boton stock-tabla-boton-guardar" onClick={() => reactivarProducto(p)}>
                      Reactivar
                    </button>
                  )}
                </td>
              </tr>
              {editandoId === p.id && (
                <tr>
                  <td colSpan={5}>
                    <div className="stock-edicion">
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Nombre</label>
                          <input
                            value={formEdicion.nombre}
                            onChange={(e) => actualizarCampoEdicion("nombre", e.target.value)}
                          />
                        </div>
                        <div className="campo">
                          <label>Categoría</label>
                          <input
                            value={formEdicion.categoria}
                            onChange={(e) => actualizarCampoEdicion("categoria", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Marca</label>
                          <input
                            value={formEdicion.marca}
                            onChange={(e) => actualizarCampoEdicion("marca", e.target.value)}
                          />
                        </div>
                        <div className="campo">
                          <label>Modelo</label>
                          <input
                            value={formEdicion.modelo}
                            onChange={(e) => actualizarCampoEdicion("modelo", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Precio de costo</label>
                          <input
                            type="number"
                            value={formEdicion.precio_costo}
                            onChange={(e) => actualizarCampoEdicion("precio_costo", e.target.value)}
                          />
                        </div>
                        <div className="campo">
                          <label>% Ganancia</label>
                          <input
                            type="number"
                            value={formEdicion.porcentaje_ganancia}
                            onChange={(e) => actualizarCampoEdicion("porcentaje_ganancia", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="fila-doble">
                        <div className="campo">
                          <label>% IVA</label>
                          <input
                            type="number"
                            value={formEdicion.porcentaje_iva}
                            onChange={(e) => actualizarCampoEdicion("porcentaje_iva", e.target.value)}
                          />
                        </div>
                        <div className="campo">
                          <label>% Recargo tarjeta</label>
                          <input
                            type="number"
                            value={formEdicion.recargo_porcentaje}
                            onChange={(e) => actualizarCampoEdicion("recargo_porcentaje", e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="campo">
                        <label>Umbral de stock bajo</label>
                        <input
                          type="number"
                          value={formEdicion.umbral_stock_bajo}
                          onChange={(e) => actualizarCampoEdicion("umbral_stock_bajo", e.target.value)}
                        />
                      </div>

                      {tipoEditando === "accesorio" ? (
                        <div className="campo">
                          <label>Stock por sucursal</label>
                          <div className="stock-edicion-cantidades">
                            {sucursales.map((s) => (
                              <div key={s.id} className="stock-edicion-cantidad-item">
                                <span>{s.nombre}</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={formStock[s.id] ?? "0"}
                                  onChange={(e) =>
                                    setFormStock((prev) => ({ ...prev, [s.id]: e.target.value }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="campo">
                          <label>Agregar otra unidad (IMEI)</label>
                          <div className="stock-edicion-imei">
                            <select
                              value={imeiSucursalId}
                              onChange={(e) => setImeiSucursalId(e.target.value)}
                            >
                              <option value="">Sucursal...</option>
                              {sucursales.map((s) => (
                                <option key={s.id} value={s.id}>{s.nombre}</option>
                              ))}
                            </select>
                            <input
                              placeholder="IMEI"
                              value={imeiNuevo}
                              onChange={(e) => setImeiNuevo(e.target.value)}
                            />
                            <button
                              type="button"
                              className="stock-tabla-boton"
                              onClick={() => agregarImeiExistente(p.id)}
                              disabled={guardandoImei}
                            >
                              {guardandoImei ? "..." : "Agregar"}
                            </button>
                          </div>
                        </div>
                      )}

                      {mensaje && (
                        <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>
                          {mensaje.texto}
                        </div>
                      )}

                      <div className="stock-edicion-botones">
                        <button
                          className="stock-tabla-boton"
                          onClick={() => setEditandoId(null)}
                          disabled={guardando}
                        >
                          Cancelar
                        </button>
                        <button
                          className="stock-tabla-boton stock-tabla-boton-guardar"
                          onClick={() => guardarEdicion(p.id)}
                          disabled={guardando}
                        >
                          {guardando ? "Guardando..." : "Guardar cambios"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
            );
          })}
          {productos.length === 0 && (
            <tr><td colSpan={5}>No hay productos que coincidan con la búsqueda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CajaSeccion({ usuario }) {
  const [cierres, setCierres] = useState([]);
  const [totalContado, setTotalContado] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const [sucursalId, setSucursalId] = useState(String(usuario.sucursal_id || ""));
  const sucursales = useSucursales();
  const viendoTodas = sucursalId === "";

  function cargar() {
    const filtro = sucursalId ? `?sucursal_id=${sucursalId}` : "";
    apiFetch(`/caja/cierres${filtro}`).then((r) => r.json()).then(setCierres);
  }

  useEffect(() => {
    cargar();
  }, [sucursalId]);

  async function cerrarCaja() {
    const res = await apiFetch("/caja/cerrar", {
      method: "POST",
      body: JSON.stringify({ total_contado: parseFloat(totalContado) || 0 })
    });
    const data = await res.json();
    if (res.ok) {
      setMensaje(`Caja cerrada. Diferencia: $${Number(data.diferencia).toLocaleString("es-AR")}`);
      setTotalContado("");
      cargar();
    } else {
      setMensaje(data.error);
    }
  }

  return (
    <div>
      <h1>Caja</h1>
      <div className="caja-resumen">
        <div className="fila"><span>Cerrar caja de hoy</span></div>
        <input
          type="number"
          placeholder="Total contado en efectivo"
          value={totalContado}
          onChange={(e) => setTotalContado(e.target.value)}
        />
        <button onClick={cerrarCaja}>Cerrar caja</button>
        {mensaje && <p style={{ fontSize: 13, marginTop: 10 }}>{mensaje}</p>}
      </div>

      <div className="panel-seccion">
        <div className="panel-encabezado">
          <h3>Historial de cierres</h3>
          <SelectorSucursal sucursales={sucursales} value={sucursalId} onChange={setSucursalId} />
        </div>
        <table className="panel-tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              {viendoTodas && <th>Sucursal</th>}
              <th>Esperado</th>
              <th>Contado</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {cierres.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.fecha).toLocaleDateString("es-AR")}</td>
                {viendoTodas && <td>{c.sucursal_nombre}</td>}
                <td>${Number(c.total_esperado).toLocaleString("es-AR")}</td>
                <td>${Number(c.total_contado).toLocaleString("es-AR")}</td>
                <td>${Number(c.diferencia).toLocaleString("es-AR")}</td>
              </tr>
            ))}
            {cierres.length === 0 && (
              <tr><td colSpan={viendoTodas ? 5 : 4}>Todavía no hay cierres registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReparacionesSeccion() {
  const [reparaciones, setReparaciones] = useState([]);

  useEffect(() => {
    apiFetch("/reparaciones").then((r) => r.json()).then(setReparaciones);
  }, []);

  return (
    <div>
      <h1>Historial de reparaciones</h1>
      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Equipo</th>
            <th>Cliente</th>
            <th>Estado</th>
            <th>Ganancia</th>
          </tr>
        </thead>
        <tbody>
          {reparaciones.map((r) => (
            <tr key={r.id}>
              <td>{r.equipo}</td>
              <td>{r.cliente_nombre}</td>
              <td>{r.estado}</td>
              <td>{r.ganancia != null ? `$${Number(r.ganancia).toLocaleString("es-AR")}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BalanceSeccion() {
  const [balance, setBalance] = useState(null);
  const [sucursalId, setSucursalId] = useState("");
  const sucursales = useSucursales();

  useEffect(() => {
    const filtro = sucursalId ? `?sucursal_id=${sucursalId}` : "";
    apiFetch(`/balance${filtro}`).then((r) => r.json()).then(setBalance);
  }, [sucursalId]);

  return (
    <div>
      <div className="panel-encabezado">
        <h1>Balance del mes</h1>
        <SelectorSucursal sucursales={sucursales} value={sucursalId} onChange={setSucursalId} />
      </div>
      {!balance ? (
        <p>Cargando...</p>
      ) : (
      <div className="panel-grid">
        <div className="panel-stat">
          <div className="label">Ventas totales</div>
          <div className="valor">${balance.total_ventas.toLocaleString("es-AR")}</div>
        </div>
        <div className="panel-stat">
          <div className="label">Costo de productos vendidos</div>
          <div className="valor">${balance.total_costo_productos.toLocaleString("es-AR")}</div>
        </div>
        <div className="panel-stat">
          <div className="label">Ganancia de reparaciones</div>
          <div className="valor">${balance.ganancia_reparaciones.toLocaleString("es-AR")}</div>
        </div>
        <div className="panel-stat">
          <div className="label">Ganancia bruta total</div>
          <div className="valor">${balance.ganancia_bruta_total.toLocaleString("es-AR")}</div>
        </div>
      </div>
      )}
    </div>
  );
}

const PROVEEDOR_VACIO = { nombre: "", contacto: "", telefono: "", cuit: "", notas: "" };

function ProveedoresSeccion() {
  const [proveedores, setProveedores] = useState([]);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [formNuevo, setFormNuevo] = useState(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState(PROVEEDOR_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  function cargar() {
    apiFetch("/proveedores").then((r) => r.json()).then(setProveedores);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crearProveedor() {
    if (!formNuevo.nombre.trim()) {
      setMensaje({ tipo: "error", texto: "El nombre es obligatorio." });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await apiFetch("/proveedores", { method: "POST", body: JSON.stringify(formNuevo) });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setFormNuevo(PROVEEDOR_VACIO);
      setMostrarAlta(false);
      cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  function abrirEdicion(p) {
    setEditandoId(p.id);
    setMensaje(null);
    setFormEdicion({
      nombre: p.nombre,
      contacto: p.contacto || "",
      telefono: p.telefono || "",
      cuit: p.cuit || "",
      notas: p.notas || ""
    });
  }

  async function guardarEdicion(id) {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await apiFetch(`/proveedores/${id}`, { method: "PUT", body: JSON.stringify(formEdicion) });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setEditandoId(null);
      cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div className="panel-encabezado">
        <h1>Proveedores</h1>
        <button
          className="stock-tabla-boton"
          onClick={() => { setMostrarAlta((v) => !v); setMensaje(null); }}
        >
          {mostrarAlta ? "Cancelar" : "+ Nuevo proveedor"}
        </button>
      </div>

      {mostrarAlta && (
        <div className="stock-edicion">
          <div className="fila-doble">
            <div className="campo">
              <label>Nombre</label>
              <input
                value={formNuevo.nombre}
                onChange={(e) => setFormNuevo((p) => ({ ...p, nombre: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="campo">
              <label>CUIT</label>
              <input
                value={formNuevo.cuit}
                onChange={(e) => setFormNuevo((p) => ({ ...p, cuit: e.target.value }))}
              />
            </div>
          </div>
          <div className="fila-doble">
            <div className="campo">
              <label>Contacto</label>
              <input
                value={formNuevo.contacto}
                onChange={(e) => setFormNuevo((p) => ({ ...p, contacto: e.target.value }))}
                placeholder="Nombre de la persona de contacto"
              />
            </div>
            <div className="campo">
              <label>Teléfono</label>
              <input
                value={formNuevo.telefono}
                onChange={(e) => setFormNuevo((p) => ({ ...p, telefono: e.target.value }))}
              />
            </div>
          </div>
          <div className="campo">
            <label>Notas</label>
            <input
              value={formNuevo.notas}
              onChange={(e) => setFormNuevo((p) => ({ ...p, notas: e.target.value }))}
            />
          </div>
          {mensaje && (
            <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>{mensaje.texto}</div>
          )}
          <div className="stock-edicion-botones">
            <button className="stock-tabla-boton stock-tabla-boton-guardar" onClick={crearProveedor} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar proveedor"}
            </button>
          </div>
        </div>
      )}

      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>CUIT</th>
            <th>Contacto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {proveedores.map((p) => (
            <Fragment key={p.id}>
              <tr>
                <td>
                  {p.nombre}
                  {p.notas && <div className="stock-tabla-marca">{p.notas}</div>}
                </td>
                <td>{p.cuit || "—"}</td>
                <td>{[p.contacto, p.telefono].filter(Boolean).join(" · ") || "—"}</td>
                <td className="stock-tabla-acciones">
                  <button className="stock-tabla-boton" onClick={() => abrirEdicion(p)}>Editar</button>
                </td>
              </tr>
              {editandoId === p.id && (
                <tr>
                  <td colSpan={4}>
                    <div className="stock-edicion">
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Nombre</label>
                          <input
                            value={formEdicion.nombre}
                            onChange={(e) => setFormEdicion((prev) => ({ ...prev, nombre: e.target.value }))}
                          />
                        </div>
                        <div className="campo">
                          <label>CUIT</label>
                          <input
                            value={formEdicion.cuit}
                            onChange={(e) => setFormEdicion((prev) => ({ ...prev, cuit: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Contacto</label>
                          <input
                            value={formEdicion.contacto}
                            onChange={(e) => setFormEdicion((prev) => ({ ...prev, contacto: e.target.value }))}
                          />
                        </div>
                        <div className="campo">
                          <label>Teléfono</label>
                          <input
                            value={formEdicion.telefono}
                            onChange={(e) => setFormEdicion((prev) => ({ ...prev, telefono: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="campo">
                        <label>Notas</label>
                        <input
                          value={formEdicion.notas}
                          onChange={(e) => setFormEdicion((prev) => ({ ...prev, notas: e.target.value }))}
                        />
                      </div>
                      {mensaje && (
                        <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>{mensaje.texto}</div>
                      )}
                      <div className="stock-edicion-botones">
                        <button className="stock-tabla-boton" onClick={() => setEditandoId(null)} disabled={guardando}>
                          Cancelar
                        </button>
                        <button
                          className="stock-tabla-boton stock-tabla-boton-guardar"
                          onClick={() => guardarEdicion(p.id)}
                          disabled={guardando}
                        >
                          {guardando ? "Guardando..." : "Guardar cambios"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {proveedores.length === 0 && (
            <tr><td colSpan={4}>No hay proveedores cargados.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const CLIENTE_VACIO = { nombre: "", apellido: "", cuil: "", telefono: "", email: "" };

function ClientesSeccion() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [formNuevo, setFormNuevo] = useState(CLIENTE_VACIO);
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState(CLIENTE_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  function cargar(q) {
    apiFetch(`/clientes?q=${encodeURIComponent(q)}`).then((r) => r.json()).then(setClientes);
  }

  useEffect(() => {
    const espera = setTimeout(() => cargar(busqueda), 250);
    return () => clearTimeout(espera);
  }, [busqueda]);

  async function crearCliente() {
    if (!formNuevo.nombre.trim() || !formNuevo.apellido.trim()) {
      setMensaje({ tipo: "error", texto: "Nombre y apellido son obligatorios." });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await apiFetch("/clientes", { method: "POST", body: JSON.stringify(formNuevo) });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setFormNuevo(CLIENTE_VACIO);
      setMostrarAlta(false);
      cargar(busqueda);
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  function abrirEdicion(c) {
    setEditandoId(c.id);
    setMensaje(null);
    setFormEdicion({
      nombre: c.nombre,
      apellido: c.apellido,
      cuil: c.cuil || "",
      telefono: c.telefono || "",
      email: c.email || ""
    });
  }

  async function guardarEdicion(id) {
    setGuardando(true);
    setMensaje(null);
    try {
      const res = await apiFetch(`/clientes/${id}`, { method: "PUT", body: JSON.stringify(formEdicion) });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setEditandoId(null);
      cargar(busqueda);
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>Clientes</h1>

      <div className="panel-filtros">
        <input
          placeholder="Buscar por nombre, apellido o CUIL..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <button
          className="stock-tabla-boton"
          onClick={() => { setMostrarAlta((v) => !v); setMensaje(null); }}
        >
          {mostrarAlta ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </div>

      {mostrarAlta && (
        <div className="stock-edicion">
          <div className="fila-doble">
            <div className="campo">
              <label>Nombre</label>
              <input
                value={formNuevo.nombre}
                onChange={(e) => setFormNuevo((p) => ({ ...p, nombre: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="campo">
              <label>Apellido</label>
              <input
                value={formNuevo.apellido}
                onChange={(e) => setFormNuevo((p) => ({ ...p, apellido: e.target.value }))}
              />
            </div>
          </div>
          <div className="fila-doble">
            <div className="campo">
              <label>CUIL / CUIT</label>
              <input
                value={formNuevo.cuil}
                onChange={(e) => setFormNuevo((p) => ({ ...p, cuil: e.target.value }))}
                placeholder="20-12345678-9"
              />
            </div>
            <div className="campo">
              <label>Teléfono</label>
              <input
                value={formNuevo.telefono}
                onChange={(e) => setFormNuevo((p) => ({ ...p, telefono: e.target.value }))}
              />
            </div>
          </div>
          <div className="campo">
            <label>Email</label>
            <input
              type="email"
              value={formNuevo.email}
              onChange={(e) => setFormNuevo((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          {mensaje && (
            <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>{mensaje.texto}</div>
          )}
          <div className="stock-edicion-botones">
            <button className="stock-tabla-boton stock-tabla-boton-guardar" onClick={crearCliente} disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cliente"}
            </button>
          </div>
        </div>
      )}

      <table className="panel-tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>CUIL</th>
            <th>Contacto</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <Fragment key={c.id}>
              <tr>
                <td>{c.nombre} {c.apellido}</td>
                <td>{c.cuil || "—"}</td>
                <td>
                  {[c.telefono, c.email].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="stock-tabla-acciones">
                  <button className="stock-tabla-boton" onClick={() => abrirEdicion(c)}>Editar</button>
                </td>
              </tr>
              {editandoId === c.id && (
                <tr>
                  <td colSpan={4}>
                    <div className="stock-edicion">
                      <div className="fila-doble">
                        <div className="campo">
                          <label>Nombre</label>
                          <input
                            value={formEdicion.nombre}
                            onChange={(e) => setFormEdicion((p) => ({ ...p, nombre: e.target.value }))}
                          />
                        </div>
                        <div className="campo">
                          <label>Apellido</label>
                          <input
                            value={formEdicion.apellido}
                            onChange={(e) => setFormEdicion((p) => ({ ...p, apellido: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="fila-doble">
                        <div className="campo">
                          <label>CUIL / CUIT</label>
                          <input
                            value={formEdicion.cuil}
                            onChange={(e) => setFormEdicion((p) => ({ ...p, cuil: e.target.value }))}
                          />
                        </div>
                        <div className="campo">
                          <label>Teléfono</label>
                          <input
                            value={formEdicion.telefono}
                            onChange={(e) => setFormEdicion((p) => ({ ...p, telefono: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="campo">
                        <label>Email</label>
                        <input
                          type="email"
                          value={formEdicion.email}
                          onChange={(e) => setFormEdicion((p) => ({ ...p, email: e.target.value }))}
                        />
                      </div>
                      {mensaje && (
                        <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>{mensaje.texto}</div>
                      )}
                      <div className="stock-edicion-botones">
                        <button className="stock-tabla-boton" onClick={() => setEditandoId(null)} disabled={guardando}>
                          Cancelar
                        </button>
                        <button
                          className="stock-tabla-boton stock-tabla-boton-guardar"
                          onClick={() => guardarEdicion(c.id)}
                          disabled={guardando}
                        >
                          {guardando ? "Guardando..." : "Guardar cambios"}
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {clientes.length === 0 && (
            <tr><td colSpan={4}>No hay clientes que coincidan con la búsqueda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Etiqueta y ayuda para las claves conocidas; cualquier otra que se agregue
// se muestra igual, solo que sin esta descripción.
const CONFIG_CONOCIDA = {
  whatsapp_numero: {
    label: "Número de WhatsApp",
    ayuda: "Se usa en el catálogo público para los links de \"Consultar por WhatsApp\". Con código de país y área, sin espacios ni +. Ej: 5493400000000"
  },
  descuento_efectivo_transferencia: {
    label: "Descuento efectivo/transferencia (%)",
    ayuda: "Se aplica al toque en la pantalla de venta y en el alta de productos al pagar en efectivo o transferencia."
  },
  dias_aviso_reparacion_sin_retirar: {
    label: "Días para avisar reparación sin retirar",
    ayuda: "Cuántos días tiene que estar \"lista para entregar\" sin que la retiren para que aparezca en los avisos."
  }
};

function ConfiguracionSeccion() {
  const [config, setConfig] = useState([]);
  const [valores, setValores] = useState({});
  const [guardandoClave, setGuardandoClave] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [claveNueva, setClaveNueva] = useState("");
  const [valorNuevo, setValorNuevo] = useState("");
  const [sucursales, setSucursales] = useState([]);
  const [formSucursales, setFormSucursales] = useState({}); // id -> { nombre, direccion, telefono, activa }
  const [guardandoSucursalId, setGuardandoSucursalId] = useState(null);

  function cargar() {
    apiFetch("/configuracion").then((r) => r.json()).then((data) => {
      setConfig(data);
      setValores(Object.fromEntries(data.map((c) => [c.clave, c.valor])));
    });
  }

  function cargarSucursales() {
    apiFetch("/sucursales?todas=true").then((r) => r.json()).then((data) => {
      setSucursales(data);
      setFormSucursales(Object.fromEntries(data.map((s) => [s.id, {
        nombre: s.nombre,
        direccion: s.direccion || "",
        telefono: s.telefono || "",
        activa: s.activa
      }])));
    });
  }

  useEffect(() => {
    cargar();
    cargarSucursales();
  }, []);

  function actualizarCampoSucursal(id, campo, valor) {
    setFormSucursales((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  async function guardarSucursal(id) {
    setGuardandoSucursalId(id);
    setMensaje(null);
    try {
      const res = await apiFetch(`/sucursales/${id}`, {
        method: "PUT",
        body: JSON.stringify(formSucursales[id])
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Sucursal actualizada." });
      cargarSucursales();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardandoSucursalId(null);
    }
  }

  async function guardar(clave) {
    setGuardandoClave(clave);
    setMensaje(null);
    try {
      const res = await apiFetch(`/configuracion/${encodeURIComponent(clave)}`, {
        method: "PUT",
        body: JSON.stringify({ valor: valores[clave] })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Guardado." });
      cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardandoClave(null);
    }
  }

  async function agregarClave() {
    const clave = claveNueva.trim().toLowerCase().replace(/\s+/g, "_");
    if (!clave || !valorNuevo.trim()) {
      setMensaje({ tipo: "error", texto: "Completá la clave y el valor." });
      return;
    }
    setGuardandoClave(clave);
    setMensaje(null);
    try {
      const res = await apiFetch(`/configuracion/${encodeURIComponent(clave)}`, {
        method: "PUT",
        body: JSON.stringify({ valor: valorNuevo })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar." });
        return;
      }
      setClaveNueva("");
      setValorNuevo("");
      cargar();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setGuardandoClave(null);
    }
  }

  return (
    <div>
      <h1>Configuración</h1>

      {mensaje && (
        <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"} style={{ marginBottom: 14 }}>
          {mensaje.texto}
        </div>
      )}

      <div className="config-lista">
        {config.map((c) => {
          const info = CONFIG_CONOCIDA[c.clave];
          return (
            <div className="config-item" key={c.clave}>
              <div className="campo config-item-campo">
                <label>{info?.label || c.clave}</label>
                <input
                  value={valores[c.clave] ?? ""}
                  onChange={(e) => setValores((prev) => ({ ...prev, [c.clave]: e.target.value }))}
                />
                {info?.ayuda && <div className="config-item-ayuda">{info.ayuda}</div>}
              </div>
              <button
                className="stock-tabla-boton stock-tabla-boton-guardar"
                onClick={() => guardar(c.clave)}
                disabled={guardandoClave === c.clave}
              >
                {guardandoClave === c.clave ? "..." : "Guardar"}
              </button>
            </div>
          );
        })}
      </div>

      <h3 className="config-nueva-titulo">Sucursales</h3>
      <div className="config-lista">
        {sucursales.map((s) => {
          const form = formSucursales[s.id];
          if (!form) return null;
          return (
            <div className="config-item config-item-sucursal" key={s.id}>
              <div className="campo config-item-campo">
                <label>Nombre</label>
                <input
                  value={form.nombre}
                  onChange={(e) => actualizarCampoSucursal(s.id, "nombre", e.target.value)}
                />
                <label className="config-sucursal-activa">
                  <input
                    type="checkbox"
                    checked={form.activa}
                    onChange={(e) => actualizarCampoSucursal(s.id, "activa", e.target.checked)}
                  />
                  Activa (aparece para elegir al vender y cargar stock)
                </label>
              </div>
              <button
                className="stock-tabla-boton stock-tabla-boton-guardar"
                onClick={() => guardarSucursal(s.id)}
                disabled={guardandoSucursalId === s.id}
              >
                {guardandoSucursalId === s.id ? "..." : "Guardar"}
              </button>
            </div>
          );
        })}
      </div>

      <h3 className="config-nueva-titulo">Agregar otro valor</h3>
      <div className="panel-form-inline">
        <input
          placeholder="Clave (ej: instagram_usuario)"
          value={claveNueva}
          onChange={(e) => setClaveNueva(e.target.value)}
        />
        <input
          placeholder="Valor"
          value={valorNuevo}
          onChange={(e) => setValorNuevo(e.target.value)}
        />
        <button onClick={agregarClave} disabled={guardandoClave !== null}>Agregar</button>
      </div>
    </div>
  );
}
