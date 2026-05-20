import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { MobileNav } from '@/components/mobile-nav';
import { OperationButton } from '@/components/operation-button';
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
            <OperationButton />
            <ThemeToggle />
            <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
