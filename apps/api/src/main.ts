import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Detrás del proxy de Railway / Vercel: necesario para que Express vea el
  // protocolo real (HTTPS) y las cookies con `secure: true` se acepten.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS_ORIGIN admite múltiples valores separados por coma. Soporta tanto
  // dominios exactos (`https://app.vercel.app`) como wildcards básicos para
  // los preview deployments de Vercel (`https://*.vercel.app`).
  const corsRaw = config.get<string>('CORS_ORIGIN') ?? 'http://localhost:3000';
  const corsList = corsRaw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      // Requests sin origin (curl, server-to-server, healthcheck): permitir.
      if (!origin) return callback(null, true);
      const allowed = corsList.some((pattern) => matchOrigin(pattern, origin));
      if (allowed) return callback(null, true);
      callback(new Error(`Origin ${origin} no permitido por CORS`));
    },
    credentials: true,
  });

  // Railway/Heroku/etc inyectan PORT. En local default a 4000.
  const port = Number(process.env.PORT ?? config.get<number>('PORT') ?? 4000);
  // En PaaS (Railway) hay que escuchar en 0.0.0.0 para que el load balancer
  // exterior pueda alcanzarnos. En local también funciona.
  await app.listen(port, '0.0.0.0');
  console.log(`[api] listening on port ${port} (prefix /api)`);
}

function matchOrigin(pattern: string, origin: string): boolean {
  if (pattern === origin) return true;
  if (!pattern.includes('*')) return false;
  // Escapamos regex chars excepto `*` y luego reemplazamos `*` por `.*`.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(origin);
}

bootstrap();
