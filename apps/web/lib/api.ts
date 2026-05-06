import axios, { AxiosError, AxiosRequestConfig } from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// --- refresh interceptor: en 401, intenta /auth/refresh y reintenta el request original.
let refreshing: Promise<void> | null = null;

async function doRefresh(): Promise<void> {
  await axios.post(
    `${API_BASE}/auth/refresh`,
    {},
    { withCredentials: true },
  );
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const url = original?.url ?? '';

    // Sólo intentamos refresh para 401, una vez por request, y nunca sobre el
    // propio /auth/refresh ni /auth/login (evitamos loops).
    if (
      status === 401 &&
      !original._retry &&
      !url.includes('/auth/refresh') &&
      !url.includes('/auth/login')
    ) {
      original._retry = true;
      try {
        // Compartimos la misma promesa para requests concurrentes.
        if (!refreshing) {
          refreshing = doRefresh().finally(() => {
            refreshing = null;
          });
        }
        await refreshing;
        return api.request(original);
      } catch (refreshErr) {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);
