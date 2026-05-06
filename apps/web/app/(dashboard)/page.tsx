import { getCurrentUser } from '@/lib/server-api';

export default async function DashboardHome() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Hola, {user?.name ?? 'Admin'}</h1>
      <p className="text-muted-foreground">
        Sesión iniciada. Próximas fases: catálogo, inventario, cotizaciones, ventas y caja.
      </p>
    </div>
  );
}
