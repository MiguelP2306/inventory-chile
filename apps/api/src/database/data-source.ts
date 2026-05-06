import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';

// El CLI de TypeORM se ejecuta fuera del runtime de Nest, así que cargamos
// el .env manualmente. La app usa ConfigModule de Nest que ya hace lo mismo.
config({ path: join(__dirname, '../../.env.local'), override: true });
config({ path: join(__dirname, '../../.env') });

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
};

export default new DataSource(dataSourceOptions);
