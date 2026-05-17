'use client';

import { SimpleNameList } from '@/components/simple-name-list';
import {
  createCategory,
  deleteCategory,
  listCategoriesPaginated,
  updateCategory,
} from '@/lib/catalog-api';

export default function CategoriasPage() {
  return (
    <SimpleNameList
      title="Categorías"
      resourceLabel="categoría"
      queryKey="categories"
      listPaginated={listCategoriesPaginated}
      create={(input) => createCategory({ name: input.name })}
      update={(id, input) => updateCategory(id, { name: input.name })}
      remove={deleteCategory}
      // Ronda 7 — click en el nombre abre el detalle con los productos
      // asociados y opciones de bulk (desvincular / mover).
      getDetailHref={(item) => `/categorias/${item.id}`}
    />
  );
}
