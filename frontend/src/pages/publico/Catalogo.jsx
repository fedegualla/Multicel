import { useState, useEffect } from "react";
import "./Catalogo.css";

// Se usa mientras carga la configuración real desde /api/configuracion/publica
// (editable desde Administración → Configuración).
const WHATSAPP_NUMERO_POR_DEFECTO = "5493400000000";

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

export default function Catalogo() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [whatsappNumero, setWhatsappNumero] = useState(WHATSAPP_NUMERO_POR_DEFECTO);

  useEffect(() => {
    fetch("/api/configuracion/publica")
      .then((r) => r.json())
      .then((data) => {
        if (data.whatsapp_numero) setWhatsappNumero(data.whatsapp_numero);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetch(`/api/catalogo?q=${encodeURIComponent(busqueda)}`)
        .then((r) => r.json())
        .then(setProductos)
        .catch(() => setProductos([]));
    }, 250);
    return () => clearTimeout(timeout);
  }, [busqueda]);

  function linkWhatsapp(producto) {
    const texto = `Hola! Quería consultar por ${producto.nombre}.`;
    return `https://wa.me/${whatsappNumero}?text=${encodeURIComponent(texto)}`;
  }

  return (
    <div className="catalogo">
      <div className="catalogo-header">
        <div className="catalogo-marca">
          <span className="catalogo-logo">M</span>
          <span className="catalogo-marca-nombre">Multicel</span>
        </div>
        <h1>Catálogo</h1>
        <p>Consultá disponibilidad y precio por WhatsApp</p>
        <div className="catalogo-buscador">
          <input
            type="text"
            placeholder="Buscar producto..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      <div className="catalogo-grid">
        {productos.map((p) => {
          const Icono = p.tipo === "equipo" ? IconoEquipo : IconoAccesorio;
          return (
            <div className="producto-card" key={p.id}>
              <div className="producto-card-icono">
                <Icono />
              </div>
              <div className="producto-nombre">{p.nombre}</div>
              {(p.marca || p.modelo) && (
                <div className="producto-detalle">
                  {[p.marca, p.modelo].filter(Boolean).join(" · ")}
                </div>
              )}
              <div className={`producto-disponibilidad ${p.disponible ? "si" : "no"}`}>
                <span className="punto" />
                {p.disponible ? "Hay stock" : "Sin stock"}
              </div>
              <a className="boton-whatsapp" href={linkWhatsapp(p)} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
            </div>
          );
        })}

        {productos.length === 0 && (
          <div className="catalogo-vacio">No se encontraron productos.</div>
        )}
      </div>

      <a
        className="whatsapp-flotante"
        href={`https://wa.me/${whatsappNumero}`}
        target="_blank"
        rel="noreferrer"
      >
        Escribinos por WhatsApp
      </a>
    </div>
  );
}
