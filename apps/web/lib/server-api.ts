import type { UserRole } from '@inventory/shared';
import { cookies } from 'next/headers';

/**
 * Resolución del endpoint del backend para Server Components.
 *
 * - Dev local: `NEXT_PUBLIC_API_URL=http://localhost:4000/api` (absoluto).
 *   El SSR hace fetch directo al backend.
 * - Prod Vercel: `NEXT_PUBLIC_API_URL=/api` (relativo, usado por axios en
 *   client). Para SSR necesitamos URL absoluta — caemos a `BACKEND_URL`
 *   (env var server-only).
 */
function resolveServerApiBase(): string {
  const fromPublic = process.env.NEXT_PUBLIC_API_URL ?? '/api';
  if (fromPublic.startsWith('http://') || fromPublic.startsWith('https://')) {
    return fromPublic;
  }
  const backend = process.env.BACKEND_URL ?? 'http://localhost:4000';
  // Si NEXT_PUBLIC_API_URL es `/api`, lo concatenamos al backend.
  return `${backend.replace(/\/$/, '')}${fromPublic.startsWith('/') ? fromPublic : `/${fromPublic}`}`;
}

const API_BASE = resolveServerApiBase();

// Helper para Server Components: forwarda las cookies del request entrante
// al backend. No intenta refresh — el layout protegido se encarga del redirect.
export async function serverFetch<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export const getCurrentUser = () => serverFetch<AuthUser>('/auth/me');
