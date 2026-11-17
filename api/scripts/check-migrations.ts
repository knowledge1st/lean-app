import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { neon } from '@neondatabase/serverless';

type JournalEntry = { tag: string; when: number };

export function pendingMigrations(
  journalEntries: JournalEntry[],
  appliedCreatedAt: (number | string)[],
): JournalEntry[] {
  const applied = new Set(appliedCreatedAt.map(Number));
  return journalEntries.filter((entry) => !applied.has(Number(entry.when)));
}

async function main() {
  const url = process.env.MIGRATIONS_DATABASE_URL;
  if (!url) {
    console.error('::error::Falta MIGRATIONS_DATABASE_URL');
    process.exitCode = 1;
    return;
  }

  const journal = JSON.parse(
    readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
  ) as { entries: JournalEntry[] };
  const sql = neon(url);
  let appliedCreatedAt: (number | string)[] = [];
  try {
    const rows = await sql`SELECT created_at FROM drizzle.__drizzle_migrations`;
    appliedCreatedAt = rows.map((row) => row.created_at as number | string);
  } catch (error: unknown) {
    // Only an absent table means no migrations. Permission and connection errors must fail.
    if (!(error && typeof error === 'object' && 'code' in error && error.code === '42P01'))
      throw error;
  }

  const pending = pendingMigrations(journal.entries, appliedCreatedAt);
  if (pending.length) {
    console.error(
      `::error::Migraciones pendientes en producción: ${pending.map((entry) => entry.tag).join(', ')}. ` +
        "Ejecutá DATABASE_URL='<url de production con el rol dueño>' pnpm --filter @lean/api db:migrate",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Producción tiene las ${journal.entries.length} migraciones del journal.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    // Driver errors can contain connection strings. Never print them.
    console.error(
      '::error::No se pudieron comprobar las migraciones de producción. Revisá el journal, la configuración, los permisos y la conexión.',
    );
    process.exitCode = 1;
  });
}
