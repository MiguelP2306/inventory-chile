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
    />
  );
}
