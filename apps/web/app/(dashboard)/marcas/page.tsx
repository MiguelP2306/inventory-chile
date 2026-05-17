'use client';

import { SimpleNameList } from '@/components/simple-name-list';
import {
  createBrand,
  deleteBrand,
  listBrandsPaginated,
  updateBrand,
} from '@/lib/catalog-api';

export default function MarcasPage() {
  return (
    <SimpleNameList
      title="Marcas"
      resourceLabel="marca"
      queryKey="brands"
      listPaginated={listBrandsPaginated}
      create={createBrand}
      update={updateBrand}
      remove={deleteBrand}
      // Ronda 7 — click en el nombre abre /marcas/[id] con los productos
      // de esa marca. Sin bulk actions (solo categorías tiene ese flujo).
      getDetailHref={(item) => `/marcas/${item.id}`}
    />
  );
}
