import { notFound } from 'next/navigation';
import { SupplierDetail } from '@/components/supplier-detail';
import { serverFetch } from '@/lib/server-api';
import type { SupplierDto } from '@inventory/shared';

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplier = await serverFetch<SupplierDto>(`/suppliers/${id}`);
  if (!supplier) notFound();
  return <SupplierDetail supplier={supplier} />;
}
