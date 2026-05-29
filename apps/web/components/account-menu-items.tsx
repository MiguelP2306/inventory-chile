'use client';

import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { ChangePasswordDialog } from '@/components/change-password-dialog';

/**
 * Items cliente que se insertan en el dropdown de cuenta del header.
 * Hoy: solo "Cambiar contraseña". Se hace componente aparte para que el
 * layout siga siendo server component y solo este bloque sea client.
 */
export function AccountMenuItems() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <KeyRound className="h-4 w-4" />
        Cambiar contraseña
      </button>
      <ChangePasswordDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
