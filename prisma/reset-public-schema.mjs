/**
 * Limpieza total del esquema `public` en Supabase.
 *
 * Uso (destructivo, pide confirmacion explicita):
 *   node prisma/reset-public-schema.mjs --yes
 *
 * Deja la base de datos vacia para que `npx prisma migrate deploy` cree
 * unicamente las tablas de GU-01 / GU-02. No toca los esquemas internos de
 * Supabase (auth, storage, realtime, extensions...).
 */
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

if (!process.argv.includes('--yes')) {
  console.error('Operacion destructiva. Vuelve a ejecutar con --yes para confirmar.');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const client = new Client({ connectionString: env.DIRECT_URL });
await client.connect();

const { rows: antes } = await client.query(
  `select tablename from pg_tables where schemaname = 'public' order by tablename`,
);
console.log(`Tablas antes de limpiar (${antes.length}):`, antes.map((r) => r.tablename).join(', ') || '(ninguna)');

await client.query(`
  DROP SCHEMA IF EXISTS public CASCADE;
  CREATE SCHEMA public;
  GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, service_role;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, service_role;
`);

const { rows: despues } = await client.query(
  `select tablename from pg_tables where schemaname = 'public' order by tablename`,
);
console.log(`Tablas despues de limpiar (${despues.length}):`, despues.map((r) => r.tablename).join(', ') || '(ninguna)');

await client.end();
