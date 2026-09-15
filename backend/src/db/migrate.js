import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  try {
    await pool.query(sql);
    console.log("✅ Esquema de base de datos creado correctamente.");
  } catch (err) {
    console.error("❌ Error al crear el esquema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
