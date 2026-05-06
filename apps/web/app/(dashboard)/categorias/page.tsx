'use client';

import { SimpleNameList } from '@/components/simple-name-list';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/lib/catalog-api';

export default function CategoriasPage() {
  return (
    <SimpleNameList
      title="Categorías"
      resourceLabel="categoría"
      queryKey="categories"
      list={listCategories}
      create={(input) => createCategory({ name: input.name })}
      update={(id, input) => updateCategory(id, { name: input.name })}
      remove={deleteCategory}
    />
  );
}
