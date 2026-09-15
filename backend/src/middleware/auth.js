import jwt from "jsonwebtoken";

// Verifica que venga un token válido en el header Authorization: Bearer <token>
export function requiereAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado." });
  }
  try {
    const token = header.split(" ")[1];
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o vencido." });
  }
}

// Restringe una ruta solo a ciertos roles, ej: requiereRol("admin")
export function requiereRol(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: "No tenés permiso para esta acción." });
    }
    next();
  };
}
