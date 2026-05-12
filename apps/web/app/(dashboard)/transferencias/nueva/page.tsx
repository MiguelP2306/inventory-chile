'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TransferForm } from '@/components/forms/transfer-form';
import { Button } from '@/components/ui/button';

export default function NuevaTransferenciaPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/transferencias">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Nueva transferencia</h1>
      </div>
      <TransferForm
        onSuccess={(t) => router.push(`/transferencias/${t.id}`)}
        onCancel={() => router.push('/transferencias')}
      />
    </div>
  );
}
