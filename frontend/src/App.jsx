import { Routes, Route, Navigate } from "react-router-dom";
import RutaProtegida from "./components/RutaProtegida.jsx";
import Layout from "./components/Layout.jsx";

// Rutas públicas
import Catalogo from "./pages/publico/Catalogo.jsx";

// Rutas internas
import Login from "./pages/Login.jsx";
import PantallaVenta from "./pages/vendedor/PantallaVenta.jsx";
import HistorialVentas from "./pages/vendedor/HistorialVentas.jsx";
import FichaReparacion from "./pages/admin/FichaReparacion.jsx";
import PanelAdmin from "./pages/admin/PanelAdmin.jsx";

// Combina la protección por rol con la barra lateral fija, para no repetir
// ambas cosas en cada ruta.
function PaginaConLayout({ rolesPermitidos, children }) {
  return (
    <RutaProtegida rolesPermitidos={rolesPermitidos}>
      <Layout>{children}</Layout>
    </RutaProtegida>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Público: catálogo de la tienda online */}
      <Route path="/" element={<Catalogo />} />

      {/* Interno */}
      <Route path="/login" element={<Login />} />

      <Route
        path="/venta"
        element={
          <PaginaConLayout>
            <PantallaVenta />
          </PaginaConLayout>
        }
      />
      <Route
        path="/ventas/historial"
        element={
          <PaginaConLayout>
            <HistorialVentas />
          </PaginaConLayout>
        }
      />
      <Route
        path="/reparaciones/nueva"
        element={
          <PaginaConLayout>
            <FichaReparacion />
          </PaginaConLayout>
        }
      />
      <Route
        path="/admin/*"
        element={
          <RutaProtegida rolesPermitidos={["admin"]}>
            <PanelAdmin />
          </RutaProtegida>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
