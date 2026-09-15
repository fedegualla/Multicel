import { useState, useEffect } from "react";
import { apiFetch } from "../../api/client.js";
import "./FichaReparacion.css";

export default function FichaReparacion() {
  const [vista, setVista] = useState("nueva"); // "nueva" | "abiertas"

  return (
    <div className="reparacion-screen">
      <div className="reparacion-tabs">
        <button className={vista === "nueva" ? "activo" : ""} onClick={() => setVista("nueva")}>
          Nueva reparación
        </button>
        <button className={vista === "abiertas" ? "activo" : ""} onClick={() => setVista("abiertas")}>
          Reparaciones abiertas
        </button>
      </div>

      {vista === "nueva" ? <NuevaReparacion /> : <ReparacionesAbiertas />}
    </div>
  );
}

function NuevaReparacion() {
  const [form, setForm] = useState({
    cliente_nombre: "",
    cliente_contacto: "",
    equipo: "",
    estado_fisico: "",
    falla_reportada: "",
    presupuesto: "",
    senia_pagada: "",
    clave_desbloqueo: ""
  });
  const [mostrarClave, setMostrarClave] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  function actualizar(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function guardar(e) {
    e.preventDefault();
    setMensaje(null);
    try {
      const res = await apiFetch("/reparaciones", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          presupuesto: parseFloat(form.presupuesto) || null,
          senia_pagada: parseFloat(form.senia_pagada) || 0
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: "error", texto: data.error || "No se pudo guardar la ficha." });
        return;
      }
      setMensaje({ tipo: "ok", texto: "Ficha de reparación creada." });
      setForm({
        cliente_nombre: "",
        cliente_contacto: "",
        equipo: "",
        estado_fisico: "",
        falla_reportada: "",
        presupuesto: "",
        senia_pagada: "",
        clave_desbloqueo: ""
      });
    } catch {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    }
  }

  return (
    <div className="reparacion-card">
      <h1>Ingreso de equipo al taller</h1>
      <form onSubmit={guardar}>
        <div className="fila-doble">
          <div className="campo">
            <label>Nombre del cliente</label>
            <input
              value={form.cliente_nombre}
              onChange={(e) => actualizar("cliente_nombre", e.target.value)}
              required
            />
          </div>
          <div className="campo">
            <label>Contacto (teléfono)</label>
            <input
              value={form.cliente_contacto}
              onChange={(e) => actualizar("cliente_contacto", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="campo">
          <label>Equipo (marca y modelo)</label>
          <input value={form.equipo} onChange={(e) => actualizar("equipo", e.target.value)} required />
        </div>

        <div className="campo">
          <label>Estado físico al ingresar (rayones, golpes, etc.)</label>
          <textarea
            value={form.estado_fisico}
            onChange={(e) => actualizar("estado_fisico", e.target.value)}
          />
        </div>

        <div className="campo">
          <label>Falla reportada</label>
          <textarea
            value={form.falla_reportada}
            onChange={(e) => actualizar("falla_reportada", e.target.value)}
            required
          />
        </div>

        <div className="fila-doble">
          <div className="campo">
            <label>Presupuesto</label>
            <input
              type="number"
              value={form.presupuesto}
              onChange={(e) => actualizar("presupuesto", e.target.value)}
            />
          </div>
          <div className="campo">
            <label>Seña / adelanto pagado</label>
            <input
              type="number"
              value={form.senia_pagada}
              onChange={(e) => actualizar("senia_pagada", e.target.value)}
            />
          </div>
        </div>

        <div className="campo">
          <label>Contraseña o patrón de desbloqueo</label>
          <div className="clave-campo">
            <input
              type={mostrarClave ? "text" : "password"}
              value={form.clave_desbloqueo}
              onChange={(e) => actualizar("clave_desbloqueo", e.target.value)}
            />
            <button type="button" onClick={() => setMostrarClave((v) => !v)}>
              {mostrarClave ? "Ocultar" : "Revelar"}
            </button>
          </div>
        </div>

        {mensaje && (
          <div className={mensaje.tipo === "error" ? "mensaje-error" : "mensaje-ok"}>
            {mensaje.texto}
          </div>
        )}

        <button className="boton-guardar" type="submit">Guardar ficha</button>
      </form>
    </div>
  );
}

function ReparacionesAbiertas() {
  const [reparaciones, setReparaciones] = useState([]);
  const [avisos, setAvisos] = useState([]);
  const [costosRepuesto, setCostosRepuesto] = useState({});

  async function cargar() {
    const [recibidas, listas, sinRetirar] = await Promise.all([
      apiFetch("/reparaciones?estado=recibido").then((r) => r.json()),
      apiFetch("/reparaciones?estado=listo_para_entregar").then((r) => r.json()),
      apiFetch("/reparaciones/aviso-sin-retirar").then((r) => r.json())
    ]);
    setReparaciones([...recibidas, ...listas]);
    setAvisos(sinRetirar);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function marcarLista(id) {
    await apiFetch(`/reparaciones/${id}/listo`, { method: "PATCH" });
    cargar();
  }

  async function entregar(id) {
    const costo = costosRepuesto[id] || 0;
    await apiFetch(`/reparaciones/${id}/entregar`, {
      method: "PATCH",
      body: JSON.stringify({ costo_repuesto: parseFloat(costo) || 0 })
    });
    cargar();
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      {avisos.length > 0 && (
        <div className="aviso-lista">
          {avisos.length} reparación(es) lista(s) hace tiempo sin retirar:{" "}
          {avisos.map((a) => a.equipo).join(", ")}
        </div>
      )}

      {reparaciones.length === 0 && (
        <div className="reparacion-card">No hay reparaciones abiertas.</div>
      )}

      {reparaciones.map((r) => (
        <div className="ficha-item" key={r.id}>
          <div className="ficha-item-header">
            <span className="ficha-item-equipo">{r.equipo}</span>
            <span className={`ficha-item-estado ${r.estado === "listo_para_entregar" ? "listo" : ""}`}>
              {r.estado === "recibido" ? "En taller" : "Listo para entregar"}
            </span>
          </div>
          <div className="ficha-item-detalle">
            {r.cliente_nombre} · {r.cliente_contacto} · {r.falla_reportada}
          </div>
          <div className="ficha-item-acciones">
            {r.estado === "recibido" && (
              <button onClick={() => marcarLista(r.id)}>Marcar lista para entregar</button>
            )}
            {r.estado === "listo_para_entregar" && (
              <>
                <input
                  type="number"
                  placeholder="Costo repuesto"
                  value={costosRepuesto[r.id] || ""}
                  onChange={(e) =>
                    setCostosRepuesto((prev) => ({ ...prev, [r.id]: e.target.value }))
                  }
                />
                <button onClick={() => entregar(r.id)}>Entregar</button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
