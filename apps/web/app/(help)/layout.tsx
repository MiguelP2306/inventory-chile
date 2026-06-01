/*
 * HelpLayout — layout del Centro de Ayuda (route group `(help)`).
 *
 * · Detrás del login: igual que el dashboard, si no hay sesión redirige a
 *   /login. Es una guía interna para el operador.
 * · SIN sidebar: la página vive a pantalla completa con una barra superior
 *   propia (HelpTopBar) y un botón "Volver al sistema".
 * · Respeta el tema (claro/oscuro) del operador — no fuerza force-light.
 */

import { redirect } from 'next/navigation';
import { HelpTopBar } from '@/components/help/help-top-bar';
import { CurrentUserProvider } from '@/lib/current-user-context';
import { getCurrentUser } from '@/lib/server-api';

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <CurrentUserProvider user={user}>
      <div className="min-h-screen bg-background">
        <HelpTopBar />
        <main>{children}</main>
      </div>
    </CurrentUserProvider>
  );
}
