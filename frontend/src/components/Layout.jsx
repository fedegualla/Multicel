import { NavLink, useNavigate } from "react-router-dom";
import { usuarioActual, cerrarSesion } from "../api/client.js";
import "./Layout.css";

function IconoHistorial(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 4.5h13a3 3 0 013 3V20l-3.5-2-3.5 2-3.5-2-3.5 2V6a1.5 1.5 0 00-1.5-1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 9h8M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconoReparaciones(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M14.7 6.3a3.5 3.5 0 00-4.6 4.2L4 16.6V20h3.4l6.1-6.1a3.5 3.5 0 004.2-4.6l-2.4 2.4-2-2 2.4-2.4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconoAdmin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

// La venta ya no es un ítem propio: se abre como modal flotante con
// "+ Nueva venta" desde Historial, que ahora es la pantalla principal.
const NAV_ITEMS = [
  { to: "/ventas/historial", label: "Ventas", icono: IconoHistorial },
  { to: "/reparaciones/nueva", label: "Reparaciones", icono: IconoReparaciones },
  { to: "/admin", label: "Administración", icono: IconoAdmin, soloAdmin: true }
];

export default function Layout({ children }) {
  const usuario = usuarioActual();
  const navigate = useNavigate();

  function salir() {
    cerrarSesion();
    navigate("/login");
  }

  const items = NAV_ITEMS.filter((item) => !item.soloAdmin || usuario?.rol === "admin");

  return (
    <div className="layout">
      <aside className="layout-sidebar">
        <div className="layout-marca">
          <span className="layout-logo">M</span>
          <div>
            <div className="layout-titulo">Multicel</div>
            <div className="layout-sucursal">{usuario?.sucursal_nombre || "Sucursal"}</div>
          </div>
        </div>

        <nav className="layout-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `layout-nav-link ${isActive ? "activo" : ""}`}
            >
              <item.icono className="layout-nav-icono" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="layout-usuario">
          <div className="layout-usuario-nombre">{usuario?.nombre}</div>
          <button className="layout-salir" onClick={salir}>Salir</button>
        </div>
      </aside>

      <main className="layout-contenido">{children}</main>
    </div>
  );
}
