/**
 * Runner de migraciones standalone — usado por el script `start:prod` en
 * Render/Railway. Corre las migraciones desde el `dist/` compilado
 * (sin depender de ts-node).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { dataSourceOptions } from './data-source';

function log(msg: string) {
  process.stdout.write(`[migrations] ${msg}\n`);
}
function logErr(msg: string) {
  process.stderr.write(`[migrations] ${msg}\n`);
}

// Logger de TypeORM que imprime cada query (acortada) a stdout. Útil para
// debug en plataformas como Render donde no podemos ver más que el log stream.
const sqlLogger = {
  logQuery(query: string, _parameters?: unknown[]) {
    const snippet = query.replace(/\s+/g, ' ').trim().slice(0, 180);
    process.stdout.write(`[sql] ${snippet}\n`);
  },
  logQueryError(error: string | Error, query: string) {
    const snippet = query.replace(/\s+/g, ' ').trim().slice(0, 180);
    process.stderr.write(
      `[sql-error] ${snippet} :: ${error instanceof Error ? error.message : error}\n`,
    );
  },
  logQuerySlow() {},
  logSchemaBuild() {},
  logMigration(message: string) {
    process.stdout.write(`[typeorm] ${message}\n`);
  },
  log(_level: 'log' | 'info' | 'warn', message: unknown) {
    process.stdout.write(`[typeorm] ${String(message)}\n`);
  },
};

async function main() {
  log(
    `Conectando a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE} (SSL=${process.env.DB_SSL})`,
  );

  // Construimos un DataSource dedicado con logging activo, para que veamos
  // cada CREATE TABLE / ALTER en los logs de Render aunque DB_LOGGING esté
  // off en runtime.
  const ds = new DataSource({
    ...dataSourceOptions,
    logging: 'all',
    logger: sqlLogger as any,
  });
  await ds.initialize();
  log('DataSource inicializado, listando migraciones...');

  const all = ds.migrations.map((m) => m.name).sort();
  log(`Total de migraciones definidas: ${all.length}`);
  for (const n of all) log(`  · ${n}`);

  log('Corriendo migraciones pendientes (transaction=none)...');
  // `transaction: 'none'` — TiDB tiene comportamiento estricto con DDL dentro
  // de BEGIN/COMMIT. Como MySQL/TiDB hace auto-commit implícito en CREATE/ALTER,
  // envolver en transacción no aporta nada y puede causar cuelgues.
  const ran = await ds.runMigrations({ transaction: 'none' });
  if (ran.length === 0) {
    log('No hay migraciones pendientes.');
  } else {
    log(`Aplicadas ${ran.length}:`);
    for (const m of ran) log(`  ✓ ${m.name}`);
  }
  await ds.destroy();
  log('OK');
}

main().catch((err) => {
  logErr('ERROR:');
  if (err instanceof Error) {
    logErr(err.message);
    if (err.stack) logErr(err.stack);
  } else {
    logErr(String(err));
  }
  process.stdout.write('', () => process.exit(1));
  setTimeout(() => process.exit(1), 1000);
});
