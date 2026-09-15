import { useState, useEffect, useRef } from "react";
import { apiFetch, usuarioActual, hoyISO } from "../../api/client.js";
import PantallaVenta from "./PantallaVenta.jsx";
import "./HistorialVentas.css";

const INTERVALO_POLLING_MS = 5000;

const FORMAS_PAGO_LABEL = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta_mp: "Tarjeta / QR",
  qr_mp: "Tarjeta / QR"
};

const ESTADO_PAGO_LABEL = {
  pendiente: "Pendiente",
  aprobado: "Aprobado",
  rechazado: "Rechazado"
};

export default function HistorialVentas() {
  const usuario = usuarioActual();
  const [fecha, setFecha] = useState(hoyISO());
  const [ventas, setVentas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);
  const [mostrarVenta, setMostrarVenta] = useState(false);
  const primeraCarga = useRef(true);

  function cargar() {
    if (!usuario?.sucursal_id) return;
    apiFetch(`/ventas/dia?sucursal_id=${usuario.sucursal_id}&fecha=${fecha}`)
      .then((r) => r.json())
      .then((data) => {
        setVentas(Array.isArray(data) ? data : []);
        primeraCarga.current = false;
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }

  useEffect(() => {
    setCargando(true);
    cargar();
  }, [fecha]);

  // Mientras se está mirando el día de hoy, se actualiza sola cada pocos
  // segundos: cada venta que se cierra (desde esta u otra caja) aparece acá.
  useEffect(() => {
    if (fecha !== hoyISO()) return;
    const intervalo = setInterval(cargar, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [fecha]);

  const totalDia = ventas
    .filter((v) => v.estado_pago === "aprobado")
    .reduce((acc, v) => acc + Number(v.total), 0);

  return (
    <div className="historial-screen">
      <div className="historial-header">
        <div>
          <h1>Ventas</h1>
          <div className="historial-subtitulo">{usuario?.sucursal_nombre}</div>
        </div>
        <div className="historial-header-acciones">
          <input
            type="date"
            className="historial-fecha"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            max={hoyISO()}
          />
          <button className="historial-boton-nueva-venta" onClick={() => setMostrarVenta(true)}>
            + Nueva venta
          </button>
        </div>
      </div>

      <div className="historial-resumen">
        <div className="historial-resumen-item">
          <span className="label">Ventas</span>
          <span className="valor">{ventas.length}</span>
        </div>
        <div className="historial-resumen-item">
          <span className="label">Total del día</span>
          <span className="valor">${totalDia.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      <div className="historial-lista">
        {cargando && ventas.length === 0 && (
          <div className="historial-vacio">Cargando...</div>
        )}
        {!cargando && ventas.length === 0 && (
          <div className="historial-vacio">Todavía no hay ventas para este día.</div>
        )}
        {ventas.map((v) => (
          <div
            className="historial-item historial-item-clickeable"
            key={v.id}
            onClick={() => setVentaSeleccionada(v.id)}
          >
            <div className="historial-item-hora">
              {new Date(v.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="historial-item-info">
              <div className="historial-item-linea1">
                <span className="historial-item-forma">{FORMAS_PAGO_LABEL[v.forma_pago] || v.forma_pago}</span>
                {v.tipo_comprobante === "factura" && (
                  <span className="historial-item-chip historial-item-chip-factura">Factura</span>
                )}
                {v.estado_pago !== "aprobado" && (
                  <span className={`historial-item-chip historial-item-chip-${v.estado_pago}`}>
                    {ESTADO_PAGO_LABEL[v.estado_pago] || v.estado_pago}
                  </span>
                )}
              </div>
              <div className="historial-item-linea2">
                {v.vendedor}
                {v.cliente_nombre && ` · ${v.cliente_nombre} ${v.cliente_apellido || ""}`.trimEnd()}
              </div>
            </div>
            <div className="historial-item-total">
              ${Number(v.total).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
            </div>
          </div>
        ))}
      </div>

      {ventaSeleccionada && (
        <DetalleVenta
          ventaId={ventaSeleccionada}
          onCerrar={() => setVentaSeleccionada(null)}
          onCambio={cargar}
        />
      )}

      {mostrarVenta && (
        <div className="modal-venta-fondo">
          <div className="modal-venta-flotante">
            <PantallaVenta onVentaRealizada={cargar} onCerrar={() => setMostrarVenta(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function DetalleVenta({ ventaId, onCerrar, onCambio }) {
  const [venta, setVenta] = useState(null);
  const [cantidades, setCantidades] = useState({}); // itemId -> cantidad a devolver (accesorios)
  const [procesando, setProcesando] = useState(null); // itemId en curso
  const [error, setError] = useState(null);

  function cargarDetalle() {
    apiFetch(`/ventas/${ventaId}`).then((r) => r.json()).then(setVenta);
  }

  useEffect(() => {
    cargarDetalle();
  }, [ventaId]);

  async function devolverItem(item) {
    const pendiente = item.cantidad - item.cantidad_devuelta;
    const cantidad = item.imei_id ? 1 : parseInt(cantidades[item.id]) || pendiente;
    if (cantidad <= 0 || cantidad > pendiente) return;
    if (!confirm(`¿Registrar la devolución de ${cantidad} unidad(es) de "${item.producto_nombre}"? Se repone el stock y se descuenta del total.`)) {
      return;
    }
    setProcesando(item.id);
    setError(null);
    try {
      const res = await apiFetch(`/ventas/${ventaId}/items/${item.id}/devolucion`, {
        method: "POST",
        body: JSON.stringify({ cantidad })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo registrar la devolución.");
      cargarDetalle();
      onCambio();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal-detalle-venta" onClick={(e) => e.stopPropagation()}>
        {!venta ? (
          <div className="historial-vacio">Cargando...</div>
        ) : (
          <>
            <div className="modal-detalle-header">
              <div>
                <h3>Venta #{venta.id}</h3>
                <div className="modal-detalle-subtitulo">
                  {new Date(venta.fecha).toLocaleString("es-AR")} · {venta.vendedor}
                  {venta.cliente_nombre && ` · ${venta.cliente_nombre} ${venta.cliente_apellido || ""}`.trimEnd()}
                </div>
              </div>
              <button className="modal-detalle-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
            </div>

            <div className="modal-detalle-items">
              {venta.items.map((item) => {
                const pendiente = item.cantidad - item.cantidad_devuelta;
                return (
                  <div className="modal-detalle-item" key={item.id}>
                    <div className="modal-detalle-item-info">
                      <div className="modal-detalle-item-nombre">
                        {item.producto_nombre}
                        {(item.marca || item.modelo) && (
                          <span className="modal-detalle-item-marca"> · {[item.marca, item.modelo].filter(Boolean).join(" ")}</span>
                        )}
                      </div>
                      <div className="modal-detalle-item-detalle">
                        {item.imei && `IMEI ${item.imei} · `}
                        {item.cantidad} × ${Number(item.precio_unitario).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        {item.cantidad_devuelta > 0 && (
                          <span className="modal-detalle-item-devuelto"> · {item.cantidad_devuelta} devuelta(s)</span>
                        )}
                      </div>
                    </div>
                    <div className="modal-detalle-item-acciones">
                      {pendiente > 0 ? (
                        <>
                          {!item.imei_id && pendiente > 1 && (
                            <input
                              type="number"
                              min="1"
                              max={pendiente}
                              placeholder={String(pendiente)}
                              value={cantidades[item.id] ?? ""}
                              onChange={(e) => setCantidades((prev) => ({ ...prev, [item.id]: e.target.value }))}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <button
                            className="modal-detalle-boton-devolver"
                            disabled={procesando === item.id}
                            onClick={() => devolverItem(item)}
                          >
                            {procesando === item.id ? "..." : "Devolver"}
                          </button>
                        </>
                      ) : (
                        <span className="modal-detalle-item-completo">Devuelto</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {error && <div className="mensaje-error">{error}</div>}

            <div className="modal-detalle-total">
              <span>Total actual</span>
              <span className="valor">${Number(venta.total).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
