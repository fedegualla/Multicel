import bcrypt from "bcryptjs";
import { pool } from "./pool.js";

async function seed() {
  try {
    const { rows: sucursales } = await pool.query(`
      INSERT INTO sucursales (nombre, direccion)
      VALUES ('Sucursal Centro', 'Dirección de prueba 123'),
             ('Sucursal Norte', 'Dirección de prueba 456')
      RETURNING id, nombre
    `);
    const [centro, norte] = sucursales;

    const passwordHash = await bcrypt.hash("prueba123", 10);

    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol, sucursal_id)
       VALUES
        ('Admin Prueba', 'admin@prueba.com', $1, 'admin', $2),
        ('Vendedor Prueba', 'vendedor@prueba.com', $1, 'vendedor', $2)`,
      [passwordHash, centro.id]
    );

    console.log("✅ Datos de prueba creados:");
    console.log(`   Sucursales: ${centro.nombre} (id ${centro.id}), ${norte.nombre} (id ${norte.id})`);
    console.log("   Usuario admin    → admin@prueba.com    / prueba123");
    console.log("   Usuario vendedor → vendedor@prueba.com / prueba123");
  } catch (err) {
    console.error("❌ Error cargando datos de prueba:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
