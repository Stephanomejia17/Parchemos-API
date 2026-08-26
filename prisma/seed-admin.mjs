/**
 * Crea (o actualiza) la cuenta de administrador de la plataforma.
 *
 *   node prisma/seed-admin.mjs
 *   node prisma/seed-admin.mjs --email otro@correo.com --password 'OtraClave1'
 *
 * La contrasena se puede pasar por ADMIN_EMAIL / ADMIN_PASSWORD para no
 * dejarla en el historial de la terminal.
 */
import { Client } from 'pg';
import { hash, Algorithm } from '@node-rs/argon2';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? 'edison100ospina@gmail.com').toLowerCase();
const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? 'Edison#101';
const fullName = arg('name') ?? process.env.ADMIN_NAME ?? 'Edison Ospina';

// Misma politica que el registro (GU-01 Esc. 4).
if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  console.error('La contrasena debe tener 8+ caracteres, 1 mayuscula y 1 numero.');
  process.exit(1);
}

const passwordHash = await hash(password, {
  algorithm: Algorithm.Argon2id,
  memoryCost: Number(env.PASSWORD_HASH_MEMORY_KIB ?? 65536),
  timeCost: Number(env.PASSWORD_HASH_ITERATIONS ?? 3),
  parallelism: Number(env.PASSWORD_HASH_PARALLELISM ?? 4),
});

const client = new Client({ connectionString: env.DIRECT_URL });
await client.connect();

const { rows } = await client.query(
  `insert into public.users
     (email, password_hash, full_name, role, status, terms_accepted_at, privacy_accepted_at)
   values ($1, $2, $3, 'administrador', 'activa', now(), now())
   on conflict (email) do update
     set password_hash = excluded.password_hash,
         full_name     = excluded.full_name,
         role          = 'administrador',
         status        = 'activa',
         suspension_reason = null,
         failed_login_attempts = 0,
         locked_until  = null,
         password_updated_at = now()
   returning id, email, full_name, role, status, created_at`,
  [email, passwordHash, fullName],
);

console.table(rows);
console.log('Administrador listo. La contrasena NO queda guardada en texto plano.');

await client.end();
