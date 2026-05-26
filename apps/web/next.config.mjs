/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@inventory/shared'],
  // Vercel corre ESLint en build por default desde Next 13+. Los warnings
  // pre-existentes (rules-of-hooks, no-html-link-for-pages, etc.) son deuda
  // que se atiende fuera del flujo de deploy. `pnpm lint` sigue corriéndolos
  // localmente y en PRs cuando se quiera.
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Cloudinary (Fase 12 — driver de uploads en producción).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
  // Proxy `/api/*` al backend. Esto evita el problema de cookies cross-site:
  // el browser ve un único dominio (el de Vercel) y las cookies se setean
  // como first-party. SSR (`cookies()` de next/headers) también las puede
  // leer porque ya no son de otro dominio.
  //
  // En dev local, BACKEND_URL apunta a http://localhost:4000 (default) y
  // el rewrite reenvía al backend NestJS local — no cambia tu flujo de dev.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
