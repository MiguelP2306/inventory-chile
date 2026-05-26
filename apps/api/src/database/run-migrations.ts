/**
 * Runner de migraciones standalone — usado por el script `start:prod` en
 * Render/Railway. Corre `dataSource.runMigrations()` desde el `dist/` compilado
 * (sin depender de ts-node).
 */
import 'reflect-metadata';
import dataSource from './data-source';

// stdout buffering: Render captura logs pero a veces los pierde si el proceso
// termina rápido. Forzamos flush con un write line dedicado.
function log(msg: string) {
  process.stdout.write(`[migrations] ${msg}\n`);
}
function logErr(msg: string) {
  process.stderr.write(`[migrations] ${msg}\n`);
}

async function main() {
  log(`Conectando a ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE} (SSL=${process.env.DB_SSL})`);
  await dataSource.initialize();
  log('DataSource inicializado, listando migraciones...');

  const all = dataSource.migrations.map((m) => m.name).sort();
  log(`Total de migraciones definidas: ${all.length}`);
  for (const n of all) log(`  · ${n}`);

  log('Corriendo migraciones pendientes...');
  const ran = await dataSource.runMigrations({ transaction: 'each' });
  if (ran.length === 0) {
    log('No hay migraciones pendientes.');
  } else {
    log(`Aplicadas ${ran.length}:`);
    for (const m of ran) log(`  ✓ ${m.name}`);
  }
  await dataSource.destroy();
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
  // Forzar flush antes de exit — Render a veces pierde la última línea.
  process.stdout.write('', () => process.exit(1));
  setTimeout(() => process.exit(1), 1000);
});
