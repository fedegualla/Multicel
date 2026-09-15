import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// En Render, DATABASE_URL viene provista automáticamente al conectar
// la base de datos PostgreSQL con el servicio web.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
});
