import "dotenv/config";
import { defineConfig } from "prisma/config";

// Este archivo solo lo usa el CLI de Prisma (migrate, studio, db execute).
// Las migraciones necesitan la conexion en modo sesion (DIRECT_URL, puerto 5432):
// el pooler en modo transaccion (DATABASE_URL, puerto 6543) no soporta los
// advisory locks del motor de migraciones.
// Nota: en Prisma 7 el datasource del config solo acepta `url` y
// `shadowDatabaseUrl`; `directUrl` se ignora en silencio.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
