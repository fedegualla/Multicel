import { useState, useEffect, useRef } from "react";
import { apiFetch } from "../../api/client.js";
import "./AltaProducto.css";

const DESCUENTO_POR_DEFECTO = 10; // se usa mientras carga el valor real de Configuración

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

export default function AltaProducto({ onCreado }) {
  const [tipo, setTipo] = useState("accesorio");
  const [proveedores, setProveedores] = useState([]);
  const [sucursales, setSucursales] = useState([]);

  const [form, setForm] = useState({
    nombre: "",
    marca: "",
    modelo: "",
    categoria: "",
    codigo_barras: "",
    proveedor_id: "",
    sucursal_id: "",
    precio_costo: "",
    porcentaje_ganancia: "30",
    porcentaje_iva: "21",
    recargo_porcentaje: "0",
    umbral_stock_bajo: "3",
    cantidad: "1"
  });

  const [productoCreado, setProductoCreado] = useState(null);
  const [imeis, setImeis] = useState([]);
  const [imeiActual, setImeiActual] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const imeiInputRef = useRef(null);
  const [descuentoPct, setDescuentoPct] = useState(DESCUENTO_POR_DEFECTO);

  useEffect(() => {
    apiFetch("/proveedores").then((r) => r.json()).then(setProveedores).catch(() => {});
    apiFetch("/sucursales").then((r) => r.json()).then(setSucursales).catch(() => {});
    apiFetch("/configuracion/publica")
      .then((r) => r.json())
      .then((data) => {
        const valor = Number(data.descuento_efectivo_transferencia);
        if (Number.isFinite(valor)) setDescuentoPct(valor);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (productoCreado && tipo === "equipo") {
      imeiInputRef.current?.focus();
    }
  }, [productoCreado, tipo]);

  const precioCalculado = (() => {
    const costo = parseFloat(form.precio_costo) || 0;
    const ganancia = parseFloat(form.porcentaje_ganancia) || 0;
    const iva = parseFloat(form.porcentaje_iva) || 0;
    const conGanancia = costo * (1 + ganancia / 100);
    const conIva = conGanancia * (1 + iva / 100);
    return Math.round(conIva / 100) * 100;
  })();

  const recargo = parseFloat(form.recargo_porcentaje) || 0;
  const precioContado = precioCalculado * (1 - descuentoPct / 100);
  const precioTarjeta = precioCalculado * (1 + recargo / 100);

  function actualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function crearProducto(e) {
    e.preventDefault();
    setMensaje(null);
    try {
      const res = await apiFetch("/productos", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          nombre: form.nombre,
          marca: form.marca,
          modelo: form.modelo,
          categoria: form.categoria,
          codigo_barras: form.codigo_barras || null,
          proveedor_id: form.proveedor_id || null,
          precio_costo: parseFloat(form.precio_costo) || 0,
          porcentaje_ganancia: parseFloat(form.porcentaje_ganancia) || 0,
          porcentaje_iva: parseFloat(form.porcentaje_iva) || 0,
          recargo_porcentaje: parseFloat(form.recargo_porcentaje) || 0,
          umbral_stock_bajo: parseInt(form.umbral_stock_bajo) || 3
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo crear el producto." });
        return;
      }
      setProductoCreado(data);

      // Accesorio: ya con el producto creado, cargamos la cantidad inicial directo
      if (tipo === "accesorio") {
        await apiFetch(`/productos/${data.id}/stock`, {
          method: "POST",
          body: JSON.stringify({
            sucursal_id: form.sucursal_id,
            cantidad: parseInt(form.cantidad) || 0
          })
        });
        setMensaje({ tipo: "ok", texto: `"${data.nombre}" creado con ${form.cantidad} unidades en stock.` });
        onCreado?.();
      }
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    }
  }

  async function agregarImei(e) {
    e.preventDefault();
    if (!imeiActual.trim() || !productoCreado) return;
    try {
      const res = await apiFetch(`/productos/${productoCreado.id}/imei`, {
        method: "POST",
        body: JSON.stringify({ imei: imeiActual.trim(), sucursal_id: form.sucursal_id })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error });
        return;
      }
      setImeis((prev) => [...prev, data]);
      setImeiActual("");
      setMensaje(null);
      onCreado?.();
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo cargar el IMEI." });
    } finally {
      imeiInputRef.current?.focus();
    }
  }

  function quitarImeiDeLista(id) {
    setImeis((prev) => prev.filter((i) => i.id !== id));
    // Nota: esto solo lo saca de la lista visual de esta carga; si ya se guardó
    // en el servidor, el borrado real se haría desde el panel de stock.
  }

  function nuevoProducto() {
    setProductoCreado(null);
    setImeis([]);
    setForm((prev) => ({
      ...prev,
      nombre: "",
      marca: "",
      modelo: "",
      codigo_barras: "",
      precio_costo: "",
      cantidad: "1"
    }));
    setMensaje(null);
  }

  // ---------- Vista: cargando IMEIs de un equipo recién creado ----------
  if (productoCreado && tipo === "equipo") {
    return (
      <div className="alta-screen">
        <div className="alta-card">
          <h1>
            <IconoEquipo className="alta-titulo-icono" />
            Escanear IMEI — {productoCreado.nombre}
          </h1>
          <div className="contador-imei">{imeis.length} equipo(s) cargado(s)</div>

          <form className="imei-escaner" onSubmit={agregarImei}>
            <div className="campo">
              <label>Escanear o escribir IMEI</label>
              <input
                ref={imeiInputRef}
                type="text"
                value={imeiActual}
                onChange={(e) => setImeiActual(e.target.value)}
                autoFocus
              />
            </div>
          </form>

          <div className="imei-lista">
            {imeis.map((i) => (
              <div className="imei-item" key={i.id}>
                {i.imei}
                <button onClick={() => quitarImeiDeLista(i.id)}>×</button>
              </div>
            ))}
          </div>

          {mensaje && (
            <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>
              {mensaje.texto}
            </div>
          )}

          <button className="boton-guardar" onClick={nuevoProducto} style={{ marginTop: 20 }}>
            Terminar y cargar otro producto
          </button>
        </div>
      </div>
    );
  }

  // ---------- Vista: formulario de alta ----------
  return (
    <div className="alta-screen">
      <div className="alta-card">
        <h1>Alta de producto</h1>

        <div className="tipo-toggle">
          <button
            type="button"
            className={tipo === "accesorio" ? "activo" : ""}
            onClick={() => setTipo("accesorio")}
          >
            <IconoAccesorio className="tipo-toggle-icono" />
            Accesorio (por cantidad)
          </button>
          <button
            type="button"
            className={tipo === "equipo" ? "activo" : ""}
            onClick={() => setTipo("equipo")}
          >
            <IconoEquipo className="tipo-toggle-icono" />
            Equipo (por IMEI)
          </button>
        </div>

        <form onSubmit={crearProducto}>
          <div className="seccion-label">Datos del producto</div>

          <div className="campo">
            <label>Nombre</label>
            <input
              value={form.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
              required
            />
          </div>

          <div className="fila-doble">
            <div className="campo">
              <label>Marca</label>
              <input value={form.marca} onChange={(e) => actualizarCampo("marca", e.target.value)} />
            </div>
            <div className="campo">
              <label>Modelo</label>
              <input value={form.modelo} onChange={(e) => actualizarCampo("modelo", e.target.value)} />
            </div>
          </div>

          <div className="campo">
            <label>Código de barras</label>
            <input
              value={form.codigo_barras}
              onChange={(e) => actualizarCampo("codigo_barras", e.target.value)}
            />
          </div>

          <div className="fila-doble">
            <div className="campo">
              <label>Proveedor</label>
              <select
                value={form.proveedor_id}
                onChange={(e) => actualizarCampo("proveedor_id", e.target.value)}
              >
                <option value="">Sin especificar</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Sucursal</label>
              <select
                value={form.sucursal_id}
                onChange={(e) => actualizarCampo("sucursal_id", e.target.value)}
                required
              >
                <option value="">Elegir...</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="seccion-label">Precio</div>

          <div className="fila-doble">
            <div className="campo">
              <label>Precio de costo</label>
              <input
                type="number"
                value={form.precio_costo}
                onChange={(e) => actualizarCampo("precio_costo", e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label>% Ganancia</label>
              <input
                type="number"
                value={form.porcentaje_ganancia}
                onChange={(e) => actualizarCampo("porcentaje_ganancia", e.target.value)}
              />
            </div>
          </div>
          <div className="fila-doble">
            <div className="campo">
              <label>% IVA</label>
              <input
                type="number"
                value={form.porcentaje_iva}
                onChange={(e) => actualizarCampo("porcentaje_iva", e.target.value)}
              />
            </div>
            <div className="campo">
              <label>% Recargo tarjeta</label>
              <input
                type="number"
                value={form.recargo_porcentaje}
                onChange={(e) => actualizarCampo("recargo_porcentaje", e.target.value)}
              />
            </div>
          </div>

          <div className="precio-resumen">
            <div className="precio-resumen-principal">
              <span>Precio de venta calculado</span>
              <span className="valor">${precioCalculado.toLocaleString("es-AR")}</span>
            </div>
            <div className="precio-resumen-detalle">
              <span>${precioContado.toLocaleString("es-AR", { maximumFractionDigits: 0 })} contado</span>
              <span>
                ${precioTarjeta.toLocaleString("es-AR", { maximumFractionDigits: 0 })} tarjeta
                {recargo > 0 ? ` (+${recargo}%)` : ""}
              </span>
            </div>
          </div>

          {tipo === "accesorio" && (
            <>
              <div className="seccion-label">Stock</div>
              <div className="fila-doble">
                <div className="campo">
                  <label>Cantidad que ingresa</label>
                  <input
                    type="number"
                    value={form.cantidad}
                    onChange={(e) => actualizarCampo("cantidad", e.target.value)}
                    required
                  />
                </div>
                <div className="campo">
                  <label>Umbral de stock bajo</label>
                  <input
                    type="number"
                    value={form.umbral_stock_bajo}
                    onChange={(e) => actualizarCampo("umbral_stock_bajo", e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {mensaje && (
            <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>
              {mensaje.texto}
            </div>
          )}

          <button className="boton-guardar" type="submit">
            {tipo === "equipo" ? "Crear y empezar a escanear IMEIs" : "Guardar producto"}
          </button>
        </form>
      </div>
    </div>
  );
}
