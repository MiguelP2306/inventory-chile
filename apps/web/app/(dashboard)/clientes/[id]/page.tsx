import { notFound } from 'next/navigation';
import { CustomerForm } from '@/components/forms/customer-form';
import { serverFetch } from '@/lib/server-api';
import type { CustomerDto } from '@inventory/shared';

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await serverFetch<CustomerDto>(`/customers/${id}`);
  if (!customer) notFound();
  return <CustomerForm customer={customer} />;
}
