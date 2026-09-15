import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";
import "./NotasPanel.css";

// Esquelas de texto libre compartidas por todos los vendedores de la misma
// sucursal (ej. "cliente de la reparación 45 pasa a las 18hs"). Se leen al
// entrar a la pantalla de venta y se pueden tirar (borrar) cuando ya no sirven.
export default function NotasPanel() {
  const [notas, setNotas] = useState([]);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(true);

  function cargar() {
    apiFetch("/notas")
      .then((r) => r.json())
      .then((data) => setNotas(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setCargando(false));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function agregarNota(e) {
    e.preventDefault();
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    try {
      const res = await apiFetch("/notas", {
        method: "POST",
        body: JSON.stringify({ texto })
      });
      const nota = await res.json();
      if (!res.ok) throw new Error(nota.error);
      setNotas((prev) => [nota, ...prev]);
      setTexto("");
    } catch {
      // Si falla, el texto queda escrito para reintentar; no hace falta más feedback acá.
    } finally {
      setGuardando(false);
    }
  }

  async function borrarNota(id) {
    setNotas((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiFetch(`/notas/${id}`, { method: "DELETE" });
    } catch {
      cargar(); // si falló el borrado en el server, volvemos a traer la lista real
    }
  }

  function fechaCorta(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) +
      " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="notas-panel">
      <h3 className="notas-panel-titulo">Notas</h3>

      <form className="notas-panel-form" onSubmit={agregarNota}>
        <textarea
          placeholder="Escribí un recordatorio..."
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
        />
        <button type="submit" disabled={!texto.trim() || guardando}>
          {guardando ? "Agregando..." : "+ Agregar nota"}
        </button>
      </form>

      <div className="notas-panel-lista">
        {cargando && <div className="notas-panel-vacio">Cargando...</div>}
        {!cargando && notas.length === 0 && (
          <div className="notas-panel-vacio">Sin notas por ahora.</div>
        )}
        {notas.map((n) => (
          <div className="nota-tarjeta" key={n.id}>
            <button className="nota-tarjeta-borrar" onClick={() => borrarNota(n.id)} aria-label="Borrar nota">
              ×
            </button>
            <p className="nota-tarjeta-texto">{n.texto}</p>
            <div className="nota-tarjeta-meta">
              {n.usuario_nombre} · {fechaCorta(n.creado_en)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
