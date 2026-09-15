import { Navigate } from "react-router-dom";
import { usuarioActual } from "../api/client.js";

export default function RutaProtegida({ rolesPermitidos, children }) {
  const usuario = usuarioActual();
  const token = localStorage.getItem("token");

  if (!token || !usuario) {
    return <Navigate to="/login" replace />;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    return <Navigate to="/ventas/historial" replace />;
  }

  return children;
}
