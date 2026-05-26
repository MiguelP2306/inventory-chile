# DEPLOY — Fase 12 (Render + Vercel + Resend + TiDB Cloud + Cloudinary)

Guía paso a paso para subir el sistema a producción **de forma gratuita** para
que el jefe lo testee. Tiempo total estimado: **45-60 min** la primera vez.

> Repo: <https://github.com/MiguelP2306/inventory-chile>

## TL;DR — Arquitectura del deploy

```
   Browser (jefe)
        │
        ├──► https://inventory-chile.vercel.app  ← Next.js (Vercel)
        │
        └──► https://inventory-chile-api.onrender.com/api  ← NestJS (Render)
                       │
                       ├──► TiDB Cloud Serverless (MySQL, 5 GB gratis)
                       ├──► Cloudinary (fotos producto + facturas PDF, 25 GB gratis)
                       └──► Resend (email cotizaciones, modo dev → a.eduardoperez.fp2019@gmail.com)
```

Costo: **$0/mes** indefinido. Sin tarjeta requerida en ningún servicio.

**Trade-off de Render Free**: el servicio entra en "sleep" después de 15 min
sin tráfico. La primera request después del sleep tarda ~30 segundos en
despertar. Para una demo donde el jefe entra ocasionalmente esto es aceptable.

---

## Pre-requisitos

- Repo en GitHub al día (push del branch `main` con los cambios de Fase 12).
- Tarjeta NO requerida en ningún proveedor de esta guía.
- Acceso al email `a.eduardoperez.fp2019@gmail.com` (para Resend).

## Estructura de archivos de deploy en el repo

- [render.yaml](render.yaml) — Blueprint de Render (backend).
- [vercel.json](vercel.json) — Configuración de Vercel (frontend).
- [apps/api/.env.example](apps/api/.env.example) — Plantilla de variables del backend.
- [apps/web/.env.example](apps/web/.env.example) — Plantilla de variables del frontend.

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

## Paso 4 — Render (backend NestJS)

### 4.1 Crear la base de datos en TiDB

Antes del deploy del backend, hay que crear la database vacía `inventory` en
TiDB Cloud (el cluster crea una llamada `sys` por default, que es de sistema):

1. En TiDB Cloud → cluster → click **Connect** → método **SQL Editor**.
2. Ejecutá:
   ```sql
   CREATE DATABASE inventory CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

### 4.2 Crear el servicio en Render

1. Ir a <https://render.com> → **Sign up with GitHub** (no pide tarjeta).
2. Autorizar Render en GitHub para el repo `MiguelP2306/inventory-chile`.
3. En el dashboard, click **+ New** → **Web Service**.
4. Seleccionar el repo `inventory-chile`.
5. Render detecta el `render.yaml` y propone la configuración. Confirmar:
   - **Name**: `inventory-chile-api`
   - **Region**: `Oregon (US West)` — más cerca de TiDB Cloud us-west-2
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Plan**: **Free**
6. Click **Create Web Service**. El primer deploy va a fallar (faltan env vars) — no pasa nada.

### 4.3 Configurar variables de entorno

En el servicio recién creado → tab **Environment** → click **+ Add Environment Variable** y agregar uno por uno (o usar **Add from .env** y pegar todo el bloque de abajo):

```
NODE_ENV=production

CORS_ORIGIN=https://inventory-chile.vercel.app,https://*.vercel.app

DB_HOST=gateway01.us-west-2.prod.aws.tidbcloud.com
DB_PORT=4000
DB_USERNAME=3PU4bb8dioDGbU9.root
DB_PASSWORD=5K9ftK4Mw9pPKkTq
DB_DATABASE=inventory
DB_SSL=true
DB_LOGGING=false

JWT_SECRET=GENERAR_64_CHARS_HEX
JWT_REFRESH_SECRET=GENERAR_OTROS_64_CHARS_HEX
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=dlqnie9eq
CLOUDINARY_API_KEY=754461635753731
CLOUDINARY_API_SECRET=PEsA30J2vCS_XkdfAdVbUM-NhwY

RESEND_API_KEY=re_GZmU88DH_AAmStfsyry7ygLHvjnrgtq6M
RESEND_FROM_EMAIL=onboarding@resend.dev
EMAIL_FROM=onboarding@resend.dev

PUBLIC_API_URL=https://inventory-chile-api.onrender.com
PUBLIC_BASE_URL=https://inventory-chile.vercel.app

SEED_ADMIN_EMAIL=a.eduardoperez.fp2019@gmail.com
SEED_ADMIN_PASSWORD=GENERAR_20_CHARS_FUERTES
```

> **Generar secrets seguros**:
> - **PowerShell**: `[Convert]::ToHexString((1..64 | ForEach-Object { Get-Random -Maximum 256 }))`
> - **Online**: <https://passwords-generator.org/> → 64 chars alfanuméricos
> - **Git Bash / WSL**: `openssl rand -hex 64`

> **`PUBLIC_API_URL`**: la URL real te la da Render después del primer deploy
> exitoso. Si tu servicio se llama `inventory-chile-api`, por convención queda
> `https://inventory-chile-api.onrender.com`. Render te muestra la URL exacta
> en la cabecera del servicio — ajustá si es distinta.

### 4.4 Re-deploy

1. Una vez agregadas las env vars, Render redeploya automáticamente.
2. Tab **Logs** → mirá el deploy en vivo. Deberías ver:
   ```
   [migrations] Aplicadas N: ...
   [seed] Admin creado: a.eduardoperez.fp2019@gmail.com / ...
   [seed] 346 comunas insertadas
   [api] listening on port 10000 (prefix /api)
   ```
3. El **healthcheck** debería pasar (Render hace ping a `/api/health` cada cierto rato).
4. Probá en el browser: `https://inventory-chile-api.onrender.com/api/health`
   → debe devolver `{"status":"ok",...}`. La primera vez tarda ~30 seg (cold start).

> **Si la URL real no es `inventory-chile-api.onrender.com`**: copiala del
> dashboard de Render y actualizá `PUBLIC_API_URL` con la correcta. Render
> redeploya solo. También vas a usarla en el Paso 5 para `NEXT_PUBLIC_API_URL`.

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
NEXT_PUBLIC_API_URL=https://inventory-chile-api.onrender.com/api
```

**Importante el `/api` al final.**

### 5.3 Deploy

1. Click **Deploy**. Tarda ~2 minutos.
2. Te da una URL tipo `inventory-chile.vercel.app`.
3. **Volver a Render** → tab **Environment** y actualizar (si los valores
   anteriores eran placeholder):
   - `CORS_ORIGIN=https://inventory-chile.vercel.app,https://*.vercel.app`
   - `PUBLIC_BASE_URL=https://inventory-chile.vercel.app`
4. Render redeploya solo al guardar.

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
| Build falla en Render con "Cannot find module @inventory/shared" | El build de shared no corrió antes que api | Verificá `buildCommand` en `render.yaml` |
| 401 en todos los endpoints después de login | Cookies no se setean cross-site | Verificá que el deploy de Render tenga `NODE_ENV=production` y que el frontend mande `withCredentials: true` (ya lo hace) |
| "CORS error" en consola del browser | `CORS_ORIGIN` no incluye el dominio Vercel | Actualizar var en Render Environment y redeploy |
| Email no llega | API key de Resend mal o destinatario != email de la cuenta Resend | Solo podés enviar al email dueño en modo dev |
| Imagen de producto se ve rota | `STORAGE_DRIVER` no es `cloudinary` o falta una de las 3 credenciales | Revisar logs de Render al boot: "StorageService driver=..." |
| Healthcheck timeout en Render | Migraciones tardan más de lo permitido la primera vez | Esperar y refrescar — Render reintenta. Si insiste, subir el plan o partir el seed a un job aparte |
| "ER_ACCESS_DENIED" en TiDB | Password mal copiada o falta `DB_SSL=true` | Re-copiar password (sin espacios), confirmar SSL |
| Primera carga de la app tarda 30+ seg | Cold start de Render Free (sleep tras 15 min) | Esperar. Si el jefe va a usar seguido, considerar plan Starter ($7/mes) sin sleep |
| "DATABASE 'inventory' doesn't exist" | No creaste la database en TiDB antes del deploy | Ejecutar el `CREATE DATABASE` del Paso 4.1 en el SQL Editor de TiDB |

---

## Limpieza si algo sale mal

- **Render**: dashboard → service → Settings → Danger Zone → Delete service.
- **Vercel**: Settings → Advanced → Delete project.
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
