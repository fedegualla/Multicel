import { useState, useRef, useEffect } from "react";
import QRCode from "qrcode";
import { apiFetch, usuarioActual } from "../../api/client.js";
import NotasPanel from "../../components/NotasPanel.jsx";
import "./PantallaVenta.css";

const SUCURSAL_OTRA_NOMBRE = "la otra sucursal";
const DESCUENTO_POR_DEFECTO = 10; // se usa mientras carga el valor real de Configuración
const FORMAS_PAGO_MP = ["tarjeta_mp", "qr_mp"];
const INTERVALO_POLLING_MS = 2500;

const FORMAS_PAGO = [
  { id: "efectivo", label: "Efectivo", icono: IconoEfectivo },
  { id: "transferencia", label: "Transferencia", icono: IconoTransferencia },
  { id: "tarjeta_mp", label: "Tarjeta / QR", icono: IconoTarjeta }
];

function IconoEfectivo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconoTransferencia(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 8h13M17 8l-3-3M17 8l-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7M7 16l3-3M7 16l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconoTarjeta(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoEquipo(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 18h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoAccesorio(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12v9M4 7.5L12 12l8-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconoBuscar(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-4.5-4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// Efectivo/transferencia pagan "de contado" (con descuento parejo).
function precioContado(precioVenta, descuentoPct) {
  return precioVenta * (1 - descuentoPct / 100);
}

// Tarjeta/QR pagan el precio de lista más el recargo propio de ese producto.
function precioTarjeta(precioVenta, recargoPorcentaje) {
  return precioVenta * (1 + (Number(recargoPorcentaje) || 0) / 100);
}

export default function PantallaVenta({ onVentaRealizada, onCerrar } = {}) {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [descuentoPct, setDescuentoPct] = useState(DESCUENTO_POR_DEFECTO);
  const [carrito, setCarrito] = useState([]);
  const [formaPago, setFormaPago] = useState("efectivo");
  const [cobrando, setCobrando] = useState(false);
  const [pagoMp, setPagoMp] = useState(null); // { ventaId, qrDataUrl, initPoint, estado }
  const [ventaConfirmada, setVentaConfirmada] = useState(null); // { total, vendedor }
  const [facturar, setFacturar] = useState(false);
  const [panelFacturacion, setPanelFacturacion] = useState(false);
  const [datosFacturacion, setDatosFacturacion] = useState({
    nombre: "",
    apellido: "",
    cuil: "",
    telefono: "",
    email: ""
  });
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [errorFacturacion, setErrorFacturacion] = useState(null);
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [sugerenciasCliente, setSugerenciasCliente] = useState([]);
  const [clienteIdSeleccionado, setClienteIdSeleccionado] = useState(null);
  // Recargo de tarjeta cargado a mano para una línea puntual del carrito (ej. según
  // cuotas), que pisa el recargo por defecto de ese producto. Clave: imei_id o "acc-<producto_id>".
  const [recargosManuales, setRecargosManuales] = useState({});
  const inputRef = useRef(null);
  const usuario = usuarioActual();
  // IMEIs disponibles por producto, tal como los devolvió la última búsqueda:
  // permite agregar más de una unidad del mismo equipo sin volver a buscar.
  const poolesImeiRef = useRef({});

  // El % de descuento por efectivo/transferencia sale de Administración →
  // Configuración, no de un número fijo en el código.
  useEffect(() => {
    apiFetch("/configuracion/publica")
      .then((r) => r.json())
      .then((data) => {
        const valor = Number(data.descuento_efectivo_transferencia);
        if (Number.isFinite(valor)) setDescuentoPct(valor);
      })
      .catch(() => {});
  }, []);

  // Mientras hay un cobro con Mercado Pago pendiente, consultamos la venta cada
  // pocos segundos: en cuanto el webhook la marca aprobada/rechazada, se entera solo.
  useEffect(() => {
    if (!pagoMp || pagoMp.estado !== "pendiente") return;
    const intervalo = setInterval(async () => {
      try {
        const res = await apiFetch(`/ventas/${pagoMp.ventaId}`);
        const venta = await res.json();
        if (venta.estado_pago && venta.estado_pago !== "pendiente") {
          setPagoMp((prev) => (prev ? { ...prev, estado: venta.estado_pago } : prev));
        }
      } catch {
        // Reintenta en la próxima vuelta del intervalo; no hace falta romper el flujo por un fallo puntual.
      }
    }, INTERVALO_POLLING_MS);
    return () => clearInterval(intervalo);
  }, [pagoMp?.ventaId, pagoMp?.estado]);

  useEffect(() => {
    if (pagoMp?.estado === "aprobado") {
      setCarrito([]);
      setRecargosManuales({});
      onVentaRealizada?.();
    }
  }, [pagoMp?.estado]);

  useEffect(() => {
    if (!ventaConfirmada) return;
    const timeout = setTimeout(() => setVentaConfirmada(null), 5000);
    return () => clearTimeout(timeout);
  }, [ventaConfirmada]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!busqueda) {
      setResultados([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/productos/buscar?q=${encodeURIComponent(busqueda)}&sucursal_id=${usuario?.sucursal_id}`
        );
        const data = await res.json();
        data.forEach((p) => {
          if (p.tipo === "equipo") poolesImeiRef.current[p.id] = p.imeis_disponibles || [];
        });
        setResultados(data);
      } catch {
        setResultados([]);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  // Busca clientes ya cargados mientras el vendedor escribe en el panel de
  // facturación, para no tener que volver a tipear todos los datos de alguien
  // que ya compró antes.
  useEffect(() => {
    if (!busquedaCliente.trim()) {
      setSugerenciasCliente([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await apiFetch(`/clientes?q=${encodeURIComponent(busquedaCliente)}`);
        const data = await res.json();
        setSugerenciasCliente(Array.isArray(data) ? data.slice(0, 6) : []);
      } catch {
        setSugerenciasCliente([]);
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [busquedaCliente]);

  // Agrega la próxima unidad disponible de un equipo (un IMEI puntual, nunca
  // se acumula cantidad en la misma línea: cada unidad física es su propia línea).
  function agregarUnidadEquipo(producto_id, datos, carritoActual) {
    const pool = poolesImeiRef.current[producto_id] || [];
    const usados = new Set(
      carritoActual.filter((i) => i.producto_id === producto_id).map((i) => i.imei_id)
    );
    const imei_id = pool.find((id) => !usados.has(id));
    if (!imei_id) return carritoActual; // no queda otra unidad disponible
    return [...carritoActual, { producto_id, imei_id, ...datos, cantidad: 1 }];
  }

  function agregarAlCarrito(producto) {
    if (producto.stock_propia <= 0) return; // sin stock local, no se puede agregar
    const datos = {
      nombre: producto.nombre,
      marca: producto.marca,
      modelo: producto.modelo,
      precio_unitario: Number(producto.precio_venta),
      recargo_porcentaje: Number(producto.recargo_porcentaje) || 0
    };

    if (producto.tipo === "equipo") {
      poolesImeiRef.current[producto.id] = producto.imeis_disponibles || [];
      setCarrito((prev) => agregarUnidadEquipo(producto.id, datos, prev));
    } else {
      setCarrito((prev) => {
        const existente = prev.find((i) => i.producto_id === producto.id);
        if (existente) {
          return prev.map((i) =>
            i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i
          );
        }
        return [...prev, { producto_id: producto.id, ...datos, cantidad: 1 }];
      });
    }
    setBusqueda("");
    setResultados([]);
    inputRef.current?.focus();
  }

  // Botón "+": para accesorios suma una unidad a la misma línea; para equipos
  // agrega otra línea con el próximo IMEI disponible (si queda alguno).
  function sumarCantidad(item) {
    if (item.imei_id) {
      const datos = {
        nombre: item.nombre,
        marca: item.marca,
        modelo: item.modelo,
        precio_unitario: item.precio_unitario,
        recargo_porcentaje: item.recargo_porcentaje
      };
      setCarrito((prev) => agregarUnidadEquipo(item.producto_id, datos, prev));
    } else {
      setCarrito((prev) =>
        prev.map((i) => (i.producto_id === item.producto_id ? { ...i, cantidad: i.cantidad + 1 } : i))
      );
    }
  }

  function marcaModelo(p) {
    return [p.marca, p.modelo].filter(Boolean).join(" ");
  }

  // Botón "−": para accesorios resta una unidad (y saca la línea si llega a 0);
  // para equipos, cada línea es una sola unidad, así que directamente la saca.
  function restarCantidad(item) {
    if (item.imei_id || item.cantidad <= 1) {
      quitarDelCarrito(item);
    } else {
      setCarrito((prev) =>
        prev.map((i) => (i.producto_id === item.producto_id ? { ...i, cantidad: i.cantidad - 1 } : i))
      );
    }
  }

  function quitarDelCarrito(item) {
    setCarrito((prev) =>
      prev.filter((i) => (item.imei_id ? i.imei_id !== item.imei_id : i.producto_id !== item.producto_id))
    );
  }

  function claveItem(item) {
    return item.imei_id ?? `acc-${item.producto_id}`;
  }

  // Recargo manual cargado a mano para esta línea (0 si no se tocó nada).
  function recargoManualDe(item) {
    const manual = recargosManuales[claveItem(item)];
    return manual !== undefined && manual !== "" ? Number(manual) : 0;
  }

  function actualizarRecargoManual(item, valor) {
    setRecargosManuales((prev) => ({ ...prev, [claveItem(item)]: valor }));
  }

  const subtotal = carrito.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0);
  const aplicaDescuento = formaPago === "efectivo" || formaPago === "transferencia";

  // El recargo fijo del producto es solo para tarjeta, nunca se mezcla con el
  // contado. El recargo manual, en cambio, es aparte y sube los dos precios.
  function precioTarjetaLinea(item) {
    return precioTarjeta(item.precio_unitario, Number(item.recargo_porcentaje || 0) + recargoManualDe(item));
  }
  function precioContadoLinea(item) {
    return precioContado(precioTarjeta(item.precio_unitario, recargoManualDe(item)), descuentoPct);
  }
  function precioLineaActual(item) {
    return aplicaDescuento ? precioContadoLinea(item) : precioTarjetaLinea(item);
  }
  const total = carrito.reduce((acc, i) => acc + precioLineaActual(i) * i.cantidad, 0);

  function abrirCobro() {
    if (carrito.length === 0 || cobrando) return;
    if (facturar) {
      setErrorFacturacion(null);
      setPanelFacturacion(true);
      return;
    }
    cobrar();
  }

  async function cobrar(cliente_id = null) {
    if (carrito.length === 0 || cobrando) return;
    setCobrando(true);
    try {
      const items = carrito.map((item) => {
        const manual = recargosManuales[claveItem(item)];
        return {
          producto_id: item.producto_id,
          imei_id: item.imei_id || null,
          cantidad: item.cantidad,
          recargo_manual: manual !== undefined && manual !== "" ? manual : undefined
        };
      });

      const res = await apiFetch("/ventas", {
        method: "POST",
        body: JSON.stringify({
          forma_pago: formaPago,
          tipo_comprobante: facturar ? "factura" : "consumidor_final",
          cliente_id,
          items
        })
      });
      const venta = await res.json();
      if (!res.ok) throw new Error(venta.error || "No se pudo registrar la venta.");

      if (FORMAS_PAGO_MP.includes(formaPago) && venta.estado_pago === "pendiente") {
        const qrDataUrl = venta.mp_init_point
          ? await QRCode.toDataURL(venta.mp_init_point, { width: 260 })
          : null;
        setPagoMp({
          ventaId: venta.id,
          initPoint: venta.mp_init_point,
          qrDataUrl,
          estado: "pendiente"
        });
      } else {
        setCarrito([]);
        setRecargosManuales({});
        setFacturar(false);
        setDatosFacturacion({ nombre: "", apellido: "", cuil: "", telefono: "", email: "" });
        setClienteIdSeleccionado(null);
        setVentaConfirmada({ total: Number(venta.total), vendedor: usuario?.nombre });
        onVentaRealizada?.();
      }
    } catch (err) {
      alert(err.message || "No se pudo registrar la venta. Reintentá.");
    } finally {
      setCobrando(false);
    }
  }

  function actualizarDatoFacturacion(campo, valor) {
    // Si venía de un cliente ya elegido por búsqueda y ahora lo editan a mano,
    // dejamos de tratarlo como "ese cliente exacto" — se guardará como nuevo/actualizado.
    setClienteIdSeleccionado(null);
    setDatosFacturacion((prev) => ({ ...prev, [campo]: valor }));
  }

  function seleccionarClienteExistente(cliente) {
    setClienteIdSeleccionado(cliente.id);
    setDatosFacturacion({
      nombre: cliente.nombre,
      apellido: cliente.apellido,
      cuil: cliente.cuil || "",
      telefono: cliente.telefono || "",
      email: cliente.email || ""
    });
    setBusquedaCliente("");
    setSugerenciasCliente([]);
  }

  async function confirmarFacturacion(e) {
    e.preventDefault();
    if (!datosFacturacion.nombre.trim() || !datosFacturacion.apellido.trim()) {
      setErrorFacturacion("Nombre y apellido son obligatorios.");
      return;
    }
    setGuardandoCliente(true);
    setErrorFacturacion(null);
    try {
      // Si es un cliente elegido de la búsqueda y no se tocó nada, no hace
      // falta volver a guardarlo: se usa directo.
      let clienteId = clienteIdSeleccionado;
      if (!clienteId) {
        const res = await apiFetch("/clientes", {
          method: "POST",
          body: JSON.stringify(datosFacturacion)
        });
        const cliente = await res.json();
        if (!res.ok) throw new Error(cliente.error || "No se pudo guardar el cliente.");
        clienteId = cliente.id;
      }
      setPanelFacturacion(false);
      await cobrar(clienteId);
    } catch (err) {
      setErrorFacturacion(err.message || "No se pudo guardar el cliente.");
    } finally {
      setGuardandoCliente(false);
    }
  }

  async function cancelarPagoMp() {
    if (!pagoMp) return;
    try {
      await apiFetch(`/ventas/${pagoMp.ventaId}/cancelar`, { method: "POST" });
    } catch {
      // Si falla la cancelación en el servidor, igual cerramos el modal:
      // el vendedor puede reintentar el cobro y el webhook resuelve la venta vieja solo.
    }
    setPagoMp(null);
  }

  return (
    <div className="venta-screen">
      {ventaConfirmada && (
        <div className="venta-confirmada">
          ✓ Venta registrada · ${ventaConfirmada.total.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
          <span className="venta-confirmada-vendedor">Vendido por {ventaConfirmada.vendedor}</span>
        </div>
      )}

      <div className="venta-layout">
        <div className="venta-principal">
          <div className="venta-buscador">
            <div className="venta-buscador-campo">
              <IconoBuscar className="venta-buscador-icono" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Escanear código o buscar producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            {onCerrar && (
              <button className="venta-buscador-cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
            )}
          </div>

          {resultados.length > 0 && (
            <div className="resultados">
              {resultados.map((p) => {
                const sinStockLocal = p.stock_propia <= 0;
                const Icono = p.tipo === "equipo" ? IconoEquipo : IconoAccesorio;
                return (
                  <div
                    key={p.id}
                    className={`resultado-item ${sinStockLocal ? "sin-stock-local" : ""}`}
                    onClick={() => agregarAlCarrito(p)}
                  >
                    <div className="resultado-item-icono">
                      <Icono />
                    </div>
                    <div className="resultado-item-info">
                      <div className="resultado-item-nombre">{p.nombre}</div>
                      {marcaModelo(p) && <div className="resultado-item-marca">{marcaModelo(p)}</div>}
                      {sinStockLocal && p.stock_otra > 0 && (
                        <div className="etiqueta-otra-sucursal">
                          Sin stock acá · Disponible en {SUCURSAL_OTRA_NOMBRE}
                        </div>
                      )}
                      {sinStockLocal && p.stock_otra <= 0 && (
                        <div className="etiqueta-sin-stock">Sin stock</div>
                      )}
                    </div>
                    <div className="resultado-item-precios">
                      <div className="precio-contado">
                        ${precioContado(Number(p.precio_venta), descuentoPct).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        <span className="precio-etiqueta">contado</span>
                      </div>
                      <div className="precio-tarjeta">
                        ${precioTarjeta(Number(p.precio_venta), p.recargo_porcentaje).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                        <span className="precio-etiqueta">tarjeta</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="carrito">
            {carrito.length === 0 ? (
              <div className="carrito-vacio">
                <IconoBuscar className="carrito-vacio-icono" />
                <span>Escaneá un producto para empezar la venta</span>
              </div>
            ) : (
              carrito.map((item) => {
                const precioLinea = precioLineaActual(item);
                return (
                  <div className="carrito-item" key={item.imei_id ?? `acc-${item.producto_id}`}>
                    <div className="carrito-item-icono">
                      {item.imei_id ? <IconoEquipo /> : <IconoAccesorio />}
                    </div>
                    <div className="carrito-item-info">
                      <div className="carrito-item-nombre">{item.nombre}</div>
                      {marcaModelo(item) && <div className="carrito-item-marca">{marcaModelo(item)}</div>}
                      <div className="carrito-item-detalle">
                        ${precioContadoLinea(item).toLocaleString("es-AR", { maximumFractionDigits: 0 })} contado
                        {" · "}
                        ${precioTarjetaLinea(item).toLocaleString("es-AR", { maximumFractionDigits: 0 })} tarjeta
                        {item.recargo_porcentaje > 0 && (
                          <span className="carrito-item-recargo-fijo"> (tarjeta ya incluye +{item.recargo_porcentaje}% del producto)</span>
                        )}
                      </div>
                      <label className="carrito-item-recargo">
                        Recargo manual
                        <input
                          type="number"
                          min="0"
                          max="200"
                          placeholder="0"
                          value={recargosManuales[claveItem(item)] ?? ""}
                          onChange={(e) => actualizarRecargoManual(item, e.target.value)}
                        />
                        %
                      </label>
                    </div>
                    {item.imei_id ? (
                      <div className="carrito-item-cantidad-fija">1 un.</div>
                    ) : (
                      <div className="stepper">
                        <button onClick={() => restarCantidad(item)} aria-label="Restar unidad">−</button>
                        <span>{item.cantidad}</span>
                        <button onClick={() => sumarCantidad(item)} aria-label="Sumar unidad">+</button>
                      </div>
                    )}
                    <div className="carrito-item-precio">
                      ${(precioLinea * item.cantidad).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </div>
                    <button className="quitar-item" onClick={() => quitarDelCarrito(item)} aria-label="Quitar">
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="barra-total">
            <div className="formas-pago-label">Forma de pago</div>
            <div className="formas-pago">
              {FORMAS_PAGO.map((fp) => (
                <button
                  key={fp.id}
                  className={`forma-pago-btn ${formaPago === fp.id ? "activa" : ""}`}
                  onClick={() => setFormaPago(fp.id)}
                >
                  <fp.icono className="forma-pago-icono" />
                  {fp.label}
                </button>
              ))}
            </div>

            {aplicaDescuento && subtotal > 0 && (
              <div className="descuento-nota">
                Descuento del {descuentoPct}% aplicado
              </div>
            )}

            <label className="facturar-check">
              <input
                type="checkbox"
                checked={facturar}
                onChange={(e) => setFacturar(e.target.checked)}
              />
              Facturar esta venta
            </label>

            <div className="total-row">
              <span className="total-label">Total</span>
              <span className="total-valor">${total.toLocaleString("es-AR")}</span>
            </div>

            <button
              className="boton-cobrar"
              disabled={carrito.length === 0 || cobrando}
              onClick={abrirCobro}
            >
              {cobrando ? "Cobrando..." : "Cobrar"}
            </button>
          </div>
        </div>

        <NotasPanel />
      </div>

      {panelFacturacion && (
        <div className="modal-pago-mp-fondo">
          <form className="modal-pago-mp panel-facturacion" onSubmit={confirmarFacturacion}>
            <h3>Datos para facturar</h3>

            <div className="campo-facturacion campo-busqueda-cliente">
              <label>Buscar cliente ya cargado</label>
              <input
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                placeholder="Nombre, apellido o CUIL..."
                autoFocus
              />
              {sugerenciasCliente.length > 0 && (
                <div className="sugerencias-cliente">
                  {sugerenciasCliente.map((c) => (
                    <div
                      key={c.id}
                      className="sugerencia-cliente-item"
                      onClick={() => seleccionarClienteExistente(c)}
                    >
                      <span>{c.nombre} {c.apellido}</span>
                      {c.cuil && <span className="sugerencia-cliente-cuil">{c.cuil}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {clienteIdSeleccionado && (
              <div className="cliente-seleccionado-nota">
                ✓ Usando el cliente ya cargado — si editás algo de abajo, se guarda como nuevo.
              </div>
            )}

            <div className="fila-doble">
              <div className="campo-facturacion">
                <label>Nombre</label>
                <input
                  value={datosFacturacion.nombre}
                  onChange={(e) => actualizarDatoFacturacion("nombre", e.target.value)}
                  required
                />
              </div>
              <div className="campo-facturacion">
                <label>Apellido</label>
                <input
                  value={datosFacturacion.apellido}
                  onChange={(e) => actualizarDatoFacturacion("apellido", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="campo-facturacion">
              <label>CUIL / CUIT</label>
              <input
                value={datosFacturacion.cuil}
                onChange={(e) => actualizarDatoFacturacion("cuil", e.target.value)}
                placeholder="20-12345678-9"
              />
            </div>

            <div className="fila-doble">
              <div className="campo-facturacion">
                <label>Teléfono</label>
                <input
                  value={datosFacturacion.telefono}
                  onChange={(e) => actualizarDatoFacturacion("telefono", e.target.value)}
                />
              </div>
              <div className="campo-facturacion">
                <label>Email</label>
                <input
                  type="email"
                  value={datosFacturacion.email}
                  onChange={(e) => actualizarDatoFacturacion("email", e.target.value)}
                />
              </div>
            </div>

            {errorFacturacion && <div className="panel-facturacion-error">{errorFacturacion}</div>}

            <div className="panel-facturacion-botones">
              <button
                type="button"
                className="modal-pago-mp-cancelar"
                onClick={() => {
                  setPanelFacturacion(false);
                  setBusquedaCliente("");
                  setSugerenciasCliente([]);
                }}
                disabled={guardandoCliente}
              >
                Cancelar
              </button>
              <button type="submit" className="modal-pago-mp-cerrar" disabled={guardandoCliente}>
                {guardandoCliente ? "Guardando..." : "Confirmar y cobrar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {pagoMp && (
        <div className="modal-pago-mp-fondo">
          <div className="modal-pago-mp">
            {pagoMp.estado === "pendiente" && (
              <>
                <h3>Esperando el pago...</h3>
                <p className="modal-pago-mp-texto">
                  Escaneá el código con la app de Mercado Pago o acercá la tarjeta.
                  Se confirma solo, no hace falta apretar nada acá.
                </p>
                {pagoMp.qrDataUrl && (
                  <img className="modal-pago-mp-qr" src={pagoMp.qrDataUrl} alt="QR de pago" />
                )}
                <button className="modal-pago-mp-cancelar" onClick={cancelarPagoMp}>
                  Cancelar cobro
                </button>
              </>
            )}
            {pagoMp.estado === "aprobado" && (
              <>
                <h3 className="modal-pago-mp-ok">✓ Pago recibido</h3>
                <p className="modal-pago-mp-texto">Vendido por {usuario?.nombre}</p>
                <button className="modal-pago-mp-cerrar" onClick={() => setPagoMp(null)}>
                  Listo
                </button>
              </>
            )}
            {pagoMp.estado === "rechazado" && (
              <>
                <h3 className="modal-pago-mp-error">El pago no se concretó</h3>
                <p className="modal-pago-mp-texto">El stock ya se repuso. Podés reintentar el cobro.</p>
                <button className="modal-pago-mp-cerrar" onClick={() => setPagoMp(null)}>
                  Cerrar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
