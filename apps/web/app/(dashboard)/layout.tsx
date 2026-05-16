import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { MobileNav } from '@/components/mobile-nav';
import { OperationFab } from '@/components/operation-fab';
import { QuickSearch } from '@/components/quick-search';
import { Sidebar } from '@/components/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { getCurrentUser } from '@/lib/server-api';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-2 border-b bg-card px-3 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MobileNav />
            <QuickSearch />
          </div>
          <div className="flex items-center gap-2 text-sm sm:gap-3">
            <ThemeToggle />
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </header>
        {/* `pb-24` reserva espacio en mobile para que la última fila de las
            tablas no quede tapada por el FAB fijo bottom-right. En md+ vuelve
            al padding normal porque el FAB no tapa contenido relevante. */}
        <main className="min-w-0 flex-1 p-3 pb-24 sm:p-4 md:p-6 md:pb-6">{children}</main>
      </div>
      <OperationFab />
    </div>
  );
}
