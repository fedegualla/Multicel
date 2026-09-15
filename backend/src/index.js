import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { apiRouter } from "./routes/index.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.join(__dirname, "../../frontend/dist");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api", apiRouter);

// En producción el build del frontend se sirve desde el mismo servicio
// (un solo deploy en Render, sin CORS entre frontend y backend). En local
// cada uno corre por su lado (vite en :5173 con proxy a :4000), así que
// frontend/dist ni siquiera existe todavía.
app.use(express.static(frontendDist));
app.get(/^(?!\/api|\/health).*/, (req, res) => {
  res.sendFile(path.join(frontendDist, "index.html"), (err) => {
    if (err) res.status(404).send("Frontend no compilado (correr npm run build).");
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
