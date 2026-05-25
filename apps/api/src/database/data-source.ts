import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';

// El CLI de TypeORM se ejecuta fuera del runtime de Nest, así que cargamos
// el .env manualmente. La app usa ConfigModule de Nest que ya hace lo mismo.
// En producción (Railway) las env vars vienen de process.env y estos archivos
// no existen → `config()` no falla, solo no hace nada.
config({ path: join(__dirname, '../../.env.local'), override: true });
config({ path: join(__dirname, '../../.env') });

// TiDB Cloud Serverless (y otros MySQL gestionados) exigen TLS. Activable con
// `DB_SSL=true` en producción. mysql2 acepta un objeto con la config TLS;
// `minVersion: 'TLSv1.2'` cumple con el requerimiento de TiDB sin pedir un
// CA bundle local (TiDB usa cadenas reconocidas por el SO).
const dbSsl =
  (process.env.DB_SSL ?? 'false').toLowerCase() === 'true'
    ? { minVersion: 'TLSv1.2' as const, rejectUnauthorized: true }
    : undefined;

export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  username: process.env.DB_USERNAME ?? 'inventory',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'inventory',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
  entities: [join(__dirname, 'entities/*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations/*.{ts,js}')],
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
  ...(dbSsl ? { ssl: dbSsl } : {}),
  extra: {
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    ...(dbSsl ? { ssl: dbSsl } : {}),
  },
};

export default new DataSource(dataSourceOptions);
