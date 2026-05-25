/** @type {import('next').NextConfig} */
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
};

export default nextConfig;
