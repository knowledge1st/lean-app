import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { neon } from '@neondatabase/serverless';

class InputError extends Error {}

async function main() {
  const envFile = new URL('../.dev.vars', import.meta.url);
  if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL');
  console.log(`Base de datos: ${new URL(url).hostname}`);
  if (!process.stdin.isTTY) throw new Error('Se requiere una terminal interactiva');

  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  let username: string;
  let displayName: string;
  let password: string;
  async function secret(prompt: string) {
    process.stdout.write(prompt);
    muted = true;
    try {
      return await rl.question('');
    } finally {
      muted = false;
      process.stdout.write('\n');
    }
  }
  try {
    username = (await rl.question('Usuario: ')).trim().toLowerCase();
    displayName = (await rl.question('Nombre visible: ')).trim();
    password = await secret('Contraseña: ');
    const confirmation = await secret('Repetir contraseña: ');
    if (username.length < 1 || username.length > 64)
      throw new InputError('Usuario: entre 1 y 64 caracteres');
    if (displayName.length < 1 || displayName.length > 64)
      throw new InputError('Nombre visible: entre 1 y 64 caracteres');
    if (password.length < 10 || new TextEncoder().encode(password).length > 72)
      throw new InputError('Contraseña: entre 10 caracteres y 72 bytes');
    if (password !== confirmation) throw new InputError('Las contraseñas no coinciden');
  } finally {
    rl.close();
  }
  const sql = neon(url);
  // The CTE keeps upsert and session revocation in a single atomic statement.
  const rows = await sql`
    WITH saved AS (
      INSERT INTO users (username, display_name, password_hash)
      VALUES (${username}, ${displayName}, crypt(${password}, gen_salt('bf', 10)))
      ON CONFLICT (username) DO UPDATE SET
        display_name = EXCLUDED.display_name, password_hash = EXCLUDED.password_hash
      RETURNING id, (xmax = 0) AS created
    ), revoked AS (
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM saved WHERE NOT created)
    )
    SELECT created FROM saved
  `;
  if (!rows[0]) throw new Error('No se guardó el usuario');
  console.log(`${rows[0].created ? 'creado' : 'actualizado'}: ${username}`);
}

main().catch((error: unknown) => {
  // Never print driver errors: they can contain connection strings or parameters.
  console.error(
    error instanceof InputError
      ? error.message
      : 'No se pudo guardar el usuario. Revisá la configuración, los datos y la conexión.',
  );
  process.exitCode = 1;
});
