import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/forms/product-form';
import { serverFetch } from '@/lib/server-api';
import type { ProductDto } from '@inventory/shared';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await serverFetch<ProductDto>(`/products/${id}`);
  if (!product) notFound();
  return <ProductForm product={product} />;
}
