/**
 * Crea o actualiza el administrador de la plataforma.
 *
 *   node prisma/seed-admin.mjs
 *   node prisma/seed-admin.mjs --email admin@ejemplo.com --password 'Admin1234' --name 'Administrador'
 *
 * El usuario se crea en Supabase Auth y en la base local. El login usa la
 * contraseña de Supabase; public.users solo conserva el perfil y el rol.
 */
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? 'admin@parchemos.local')
  .trim()
  .toLowerCase();
const password = arg('password') ?? process.env.ADMIN_PASSWORD;
const fullName = arg('name') ?? process.env.ADMIN_NAME ?? 'Administrador';

if (!password) {
  console.error('Debes indicar --password o definir ADMIN_PASSWORD.');
  process.exit(1);
}

if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password)) {
  console.error('La contraseña debe tener 8+ caracteres, 1 mayúscula y 1 número.');
  process.exit(1);
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw new Error(`No se pudo consultar Supabase Auth: ${listError.message}`);

const existingAuthUser = listed.users.find((user) => user.email?.toLowerCase() === email);
let authUser;

if (existingAuthUser) {
  const { data, error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
    password,
    email_confirm: true,
    user_metadata: { ...existingAuthUser.user_metadata, full_name: fullName },
  });
  if (error || !data.user) throw new Error(`No se pudo actualizar Supabase Auth: ${error?.message}`);
  authUser = data.user;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`No se pudo crear Supabase Auth: ${error?.message}`);
  authUser = data.user;
}

const client = new Client({ connectionString: env.DIRECT_URL });
await client.connect();

try {
  await client.query('BEGIN');
  const existingLocal = await client.query('SELECT id FROM public.users WHERE email = $1', [email]);

  if (existingLocal.rows[0] && existingLocal.rows[0].id !== authUser.id) {
    throw new Error('El correo ya existe en public.users con otro id. Corrige ese registro antes de continuar.');
  }

  await client.query(
    `INSERT INTO public.users
       (id, email, password_hash, role, status, terms_accepted_at, privacy_accepted_at)
     VALUES ($1, $2, NULL, 'administrador', 'activa', now(), now())
     ON CONFLICT (email) DO UPDATE SET
       role = 'administrador', status = 'activa', suspension_reason = NULL,
       failed_login_attempts = 0, locked_until = NULL,
       password_updated_at = now(), updated_at = now()`,
    [authUser.id, email],
  );

  await client.query(
    `INSERT INTO public.user_profiles (user_id, full_name)
     VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()`,
    [authUser.id, fullName],
  );

  await client.query('COMMIT');
  console.log(`Administrador listo: ${email}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
