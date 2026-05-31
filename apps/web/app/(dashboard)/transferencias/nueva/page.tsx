'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TransferForm } from '@/components/forms/transfer-form';

/**
 * /transferencias/nueva — Rediseño UI (look de TransferCreate).
 *
 * SOLO UI/UX. La lógica es idéntica: <TransferForm> maneja todo (selección de
 * bodegas, productos, validación de stock y el submit real). Acá solo se
 * reestiliza el header (back redondeado + título font-black).
 *
 * ⚠️ IMPORTANTE: el grueso del diseño de TransferCreate (card de selectores
 * origen→destino, tabla "Productos a transferir", modal selector de producto,
 * botones inferiores) vive DENTRO de <TransferForm>, no en esta page. Para
 * portar ese look completo necesito el archivo `transfer-form.tsx`
 * (components/forms/transfer-form). Pasámelo y lo reestilizo 1:1 con
 * TransferCreate conservando su mutación/validaciones reales.
 */
export default function NuevaTransferenciaPage() {
  const router = useRouter();
  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/transferencias"
          title="Volver"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition-colors hover:bg-slate-50 dark:border-slate-850 dark:bg-[#11151C] dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Nueva transferencia
        </h1>
      </div>

      {/* Formulario real (sin cambios de lógica). Para el look completo de
          TransferCreate, reestilizar transfer-form.tsx. */}
      <div className="max-w-5xl">
        <TransferForm
          onSuccess={(t) => router.push(`/transferencias/${t.id}`)}
          onCancel={() => router.push('/transferencias')}
        />
      </div>
    </div>
  );
}
