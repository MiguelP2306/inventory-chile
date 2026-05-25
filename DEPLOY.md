# DEPLOY — Fase 12 (Railway + Vercel + Resend + TiDB Cloud + Cloudinary)

Guía paso a paso para subir el sistema a producción **de forma gratuita** para
que el jefe lo testee. Tiempo total estimado: **45-60 min** la primera vez.

> Repo: <https://github.com/MiguelP2306/inventory-chile>

## TL;DR — Arquitectura del deploy

```
   Browser (jefe)
        │
        ├──► https://inventory-chile.vercel.app  ← Next.js (Vercel)
        │
        └──► https://inventory-chile-api.up.railway.app/api  ← NestJS (Railway)
                       │
                       ├──► TiDB Cloud Serverless (MySQL, 5 GB gratis)
                       ├──► Cloudinary (fotos producto + facturas PDF, 25 GB gratis)
                       └──► Resend (email cotizaciones, modo dev → a.eduardoperez.fp2019@gmail.com)
```

Costo: **$0/mes** mientras no se supere ningún tier gratuito.

---

## Pre-requisitos

- Repo en GitHub al día (push del branch `main` con los cambios de Fase 12).
- Tarjeta NO requerida en ningún proveedor de esta guía.
- Acceso al email `a.eduardoperez.fp2019@gmail.com` (para Resend).

---

## Paso 1 — TiDB Cloud Serverless (base de datos MySQL gratis)

1. Ir a <https://tidbcloud.com/free-trial> y registrarse con Google.
2. Después de loguearse, click en **Create Cluster** → **Serverless** (Free).
3. Configurar:
   - **Cluster Name**: `inventory-chile`
   - **Cloud Provider**: AWS
   - **Region**: la más cercana a Chile — `us-west-2 (Oregon)` o `us-east-1 (Virginia)`.
4. Click **Create** → espera ~30 segundos.
5. Click el cluster → tab **Connect** → método **General** → MySQL CLI.
6. Click **Create password** → guardá la password mostrada (no aparece dos veces).
7. **Copiá** los datos de conexión:
   - `Host`: algo como `gateway01.us-west-2.prod.aws.tidbcloud.com`
   - `Port`: `4000` (no es un typo, TiDB Serverless usa 4000)
   - `User`: algo como `2m6Q9Y.root`
   - `Password`: la que generaste arriba.
   - `Database`: `inventory` (lo creamos en el paso 5).

> **Importante**: TiDB Serverless **exige TLS** — ya está manejado vía `DB_SSL=true`.

---

## Paso 2 — Cloudinary (almacenamiento de archivos)

1. Ir a <https://cloudinary.com/users/register_free> → registro con email.
2. Después de verificar el email, en el **Dashboard** vas a ver:
   - `Cloud Name`: ej. `dxxxxxxx`
   - `API Key`: ej. `123456789012345`
   - `API Secret`: click **View API Secret** para revelarlo.
3. Copiá los 3 valores.

> El **free tier** cubre 25 GB de almacenamiento + 25 GB/mes de bandwidth, más
> que suficiente para el MVP de testing.

---

## Paso 3 — Resend (envío de email)

1. Ir a <https://resend.com/signup> → registrarse con `a.eduardoperez.fp2019@gmail.com`.
2. Verificar el email.
3. En el dashboard, ir a **API Keys** → **Create API Key** → nombre `inventory-chile-prod`, permiso `Full access`.
4. Copiá el `re_xxxxxxxx` (se muestra una sola vez).

> **Modo dev**: sin dominio verificado solo podés enviar `desde onboarding@resend.dev`
> y **únicamente al email dueño de la cuenta** (`a.eduardoperez.fp2019@gmail.com`).
> Es suficiente para que el jefe vea cómo llega un email de cotización al inbox.

---

## Paso 4 — Railway (backend NestJS)

### 4.1 Crear cuenta y proyecto

1. Ir a <https://railway.com> → **Login with GitHub**.
2. Autorizar Railway en GitHub (solo lectura del repo `inventory-chile`).
3. En el dashboard, click **+ New Project** → **Deploy from GitHub repo**.
4. Buscar y seleccionar `MiguelP2306/inventory-chile`.
5. Railway detecta el `railway.json` y `nixpacks.toml` automáticamente. Aparece
   un primer deploy que VA A FALLAR (faltan las env vars) — **no te preocupes**.

### 4.2 Configurar variables de entorno

Click en el servicio → tab **Variables** → **Raw editor** → pegá todo esto:

```
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://inventory-chile.vercel.app,https://*.vercel.app

DB_HOST=<host de TiDB Cloud>
DB_PORT=4000
DB_USERNAME=<user de TiDB Cloud>
DB_PASSWORD=<password de TiDB Cloud>
DB_DATABASE=inventory
DB_SSL=true
DB_LOGGING=false

JWT_SECRET=<generar con: openssl rand -hex 64>
JWT_REFRESH_SECRET=<generar con: openssl rand -hex 64>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=<de Cloudinary>
CLOUDINARY_API_KEY=<de Cloudinary>
CLOUDINARY_API_SECRET=<de Cloudinary>

RESEND_API_KEY=<re_xxx de Resend>
RESEND_FROM_EMAIL=onboarding@resend.dev
EMAIL_FROM=onboarding@resend.dev

PUBLIC_API_URL=https://<tu-backend>.up.railway.app
PUBLIC_BASE_URL=https://inventory-chile.vercel.app

SEED_ADMIN_EMAIL=a.eduardoperez.fp2019@gmail.com
SEED_ADMIN_PASSWORD=<generar 20 chars seguros>
```

> **Generar secrets seguros**: en cualquier terminal `openssl rand -hex 64`. Si
> no tenés openssl a mano, usá <https://passwords-generator.org/> con 64 chars
> alfanuméricos.

> **CORS_ORIGIN**: dejá `https://*.vercel.app` para aceptar los preview
> deployments de PRs. Si querés ser estricto, dejá solo el dominio final.

### 4.3 Crear la base de datos en TiDB

Antes del próximo deploy, hay que crear la database vacía `inventory`:

1. En TiDB Cloud → cluster → tab **SQL Editor** (o conectarte por el CLI).
2. Ejecutá: `CREATE DATABASE inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

### 4.4 Re-deploy

1. Volver a Railway → tab **Deployments** → click **Redeploy** en el último deploy fallido.
2. Mirar los logs en vivo. Deberías ver:
   ```
   [migrations] Aplicadas N: ...
   [seed] Admin creado: a.eduardoperez.fp2019@gmail.com / ...
   [seed] 346 comunas insertadas
   [api] listening on port 4000 (prefix /api)
   ```
3. Settings → **Networking** → **Generate Domain** → te da una URL pública tipo
   `inventory-chile-api-production.up.railway.app`. **Copiala**.
4. **Actualizá** la env var `PUBLIC_API_URL` con esa URL exacta (https://...) →
   Railway redeploya solo.
5. Probá: <https://TU-BACKEND.up.railway.app/api/health> → debe devolver
   `{"status":"ok",...}`.

---

## Paso 5 — Vercel (frontend Next.js)

### 5.1 Crear proyecto

1. Ir a <https://vercel.com/signup> → **Continue with GitHub**.
2. Click **Add New** → **Project** → buscar `inventory-chile` → **Import**.
3. **Configurar antes de deployar**:
   - **Framework Preset**: `Next.js` (debería auto-detectarse).
   - **Root Directory**: dejá `./` (raíz del repo). Vercel va a leer el `vercel.json`.
   - **Build Command** (override si no se autodetectó): `pnpm --filter @inventory/shared build && pnpm --filter @inventory/web build`
   - **Install Command**: `pnpm install --frozen-lockfile`
   - **Output Directory**: `apps/web/.next`

> **Si Vercel se queja** de "no Next.js project found", cambiá **Root Directory**
> a `apps/web` y dejá los commands en default (Vercel autodetecta). Necesitarás
> tildar **"Include source files outside of the Root Directory"** en
> Settings → General.

### 5.2 Variables de entorno

En el wizard de import o después en Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://TU-BACKEND.up.railway.app/api
```

**Importante el `/api` al final.**

### 5.3 Deploy

1. Click **Deploy**. Tarda ~2 minutos.
2. Te da una URL tipo `inventory-chile.vercel.app`.
3. **Volver a Railway** y actualizar:
   - `CORS_ORIGIN=https://inventory-chile.vercel.app,https://*.vercel.app`
   - `PUBLIC_BASE_URL=https://inventory-chile.vercel.app`
4. Railway redeploya solo.

---

## Paso 6 — Verificación end-to-end

Desde un browser (Incógnito ayuda para no arrastrar cookies viejas):

1. **Login**: ir a `https://inventory-chile.vercel.app/login` → entrar con
   `a.eduardoperez.fp2019@gmail.com` + la password de `SEED_ADMIN_PASSWORD`.
   - Si funciona, las cookies cross-site están OK.
2. **Crear producto con foto**:
   - `/productos/nuevo` → llenar datos → tab "Imágenes" → subir JPG.
   - Guardar → la foto debería verse en la lista de productos.
   - En Cloudinary dashboard → Media Library → carpeta `inventory-chile/products`
     → debería aparecer el archivo.
3. **Crear cotización + email**:
   - `/cotizaciones/nueva` → llenar → "Guardar y enviar por email".
   - Revisar inbox de `a.eduardoperez.fp2019@gmail.com` → debería llegar el
     email con el PDF adjunto.
4. **Crear cotización + WhatsApp**:
   - Misma pantalla → "Guardar y enviar por WhatsApp".
   - Debería abrir `wa.me/...` en una pestaña nueva con el link público al PDF.
5. **Pegar el link público en Incógnito**:
   - El link `/p/cotizacion/<token>` debería abrir sin pedir login.

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
| --- | --- | --- |
| Build falla en Railway con "Cannot find module @inventory/shared" | El build de shared no corrió antes que api | Verificá `buildCommand` en `railway.json` |
| 401 en todos los endpoints después de login | Cookies no se setean cross-site | Verificá que el deploy de Railway tenga `NODE_ENV=production` y que el frontend mande `withCredentials: true` (ya lo hace) |
| "CORS error" en consola del browser | `CORS_ORIGIN` no incluye el dominio Vercel | Actualizar var en Railway y redeploy |
| Email no llega | API key de Resend mal o destinatario != email de la cuenta Resend | Solo podés enviar al email dueño en modo dev |
| Imagen de producto se ve rota | `STORAGE_DRIVER` no es `cloudinary` o falta una de las 3 credenciales | Revisar logs de Railway al boot: "StorageService driver=..." |
| Healthcheck timeout en Railway | Migraciones tardan más de 60s la primera vez | Subir `healthcheckTimeout` a 300 en `railway.json`, redeploy |
| "ER_ACCESS_DENIED" en TiDB | Password mal copiada o falta `DB_SSL=true` | Re-copiar password (sin espacios), confirmar SSL |

---

## Limpieza si algo sale mal

- **Railway**: Settings → Danger → Delete service / project. Sin costos pendientes.
- **Vercel**: Settings → Advanced → Delete project. Idem.
- **TiDB Cloud**: cluster → Settings → Delete cluster.
- **Cloudinary** y **Resend**: dejá las cuentas — son gratis y reusables.

---

## Próximos pasos (post-MVP)

- Dominio propio en Vercel (Settings → Domains) + verificar dominio en Resend
  para mandar emails desde `cotizaciones@tudominio.cl`.
- Backup automático diario de la DB (Railway o TiDB schedule).
- Rate limiting con `@nestjs/throttler` en endpoints críticos.
- Sentry / Logtail para logs estructurados.
- Migrar a un plan pago de TiDB cuando se acerque a 5 GB.
