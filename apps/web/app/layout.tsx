import type { Metadata } from 'next';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'Autopartes Gran Pacífico',
  description: 'Sistema de gestión de inventario, cotizaciones, ventas y caja',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
