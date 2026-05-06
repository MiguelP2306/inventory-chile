'use client';

import { SimpleNameList } from '@/components/simple-name-list';
import { createBrand, deleteBrand, listBrands, updateBrand } from '@/lib/catalog-api';

export default function MarcasPage() {
  return (
    <SimpleNameList
      title="Marcas"
      resourceLabel="marca"
      queryKey="brands"
      list={listBrands}
      create={createBrand}
      update={updateBrand}
      remove={deleteBrand}
    />
  );
}
