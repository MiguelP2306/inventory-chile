import { redirect } from 'next/navigation';
import { LogoutButton } from '@/components/logout-button';
import { OperationFab } from '@/components/operation-fab';
import { QuickSearch } from '@/components/quick-search';
import { Sidebar } from '@/components/sidebar';
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
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b bg-card px-4">
          <QuickSearch />
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{user.email}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
      <OperationFab />
    </div>
  );
}
