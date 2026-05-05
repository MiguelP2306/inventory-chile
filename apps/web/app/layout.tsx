import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Inventario',
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
        {children}
      </body>
    </html>
  );
}
