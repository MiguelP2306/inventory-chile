/**
 * Runner de migraciones standalone — usado por el script `start:prod` en
 * Railway. Corre `dataSource.runMigrations()` desde el `dist/` compilado
 * (sin depender de ts-node).
 */
import 'reflect-metadata';
import dataSource from './data-source';

async function main() {
  console.log('[migrations] Inicializando DataSource...');
  await dataSource.initialize();
  console.log('[migrations] Corriendo migraciones pendientes...');
  const ran = await dataSource.runMigrations({ transaction: 'each' });
  if (ran.length === 0) {
    console.log('[migrations] No hay migraciones pendientes.');
  } else {
    console.log(`[migrations] Aplicadas ${ran.length}:`);
    for (const m of ran) console.log(`  - ${m.name}`);
  }
  await dataSource.destroy();
  console.log('[migrations] OK');
}

main().catch((err) => {
  console.error('[migrations] ERROR:', err);
  process.exit(1);
});
