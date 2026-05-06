import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import {
  Category,
  CompanySettings,
  ExpenseCategory,
  User,
  Warehouse,
} from '../entities';
import { UserRole } from '@inventory/shared';

// Seeds idempotentes: usan upsert/findOne para no duplicar al re-ejecutar.
async function run() {
  await dataSource.initialize();
  console.log('[seed] DataSource inicializado');

  const userRepo = dataSource.getRepository(User);
  const warehouseRepo = dataSource.getRepository(Warehouse);
  const categoryRepo = dataSource.getRepository(Category);
  const expenseCategoryRepo = dataSource.getRepository(ExpenseCategory);
  const settingsRepo = dataSource.getRepository(CompanySettings);

  // 1. Usuario admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@inventory.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin123';
  const existingAdmin = await userRepo.findOne({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await userRepo.insert({
      name: 'Administrador',
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    });
    console.log(`[seed] Admin creado: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`[seed] Admin ya existe: ${adminEmail}`);
  }

  // 2. Almacén único inicial
  const existingWarehouse = await warehouseRepo.findOne({
    where: { name: 'Principal' },
  });
  if (!existingWarehouse) {
    await warehouseRepo.insert({
      name: 'Principal',
      address: null,
    });
    console.log('[seed] Almacén "Principal" creado');
  } else {
    console.log('[seed] Almacén "Principal" ya existe');
  }

  // 3. Categorías base de productos
  const baseCategories = [
    'Motor',
    'Frenos',
    'Suspensión',
    'Eléctrico',
    'Carrocería',
    'Filtros',
    'Aceites y lubricantes',
    'Otros',
  ];
  for (const name of baseCategories) {
    const existing = await categoryRepo.findOne({ where: { name } });
    if (!existing) {
      await categoryRepo.insert({ name, parentId: null });
    }
  }
  console.log(`[seed] ${baseCategories.length} categorías de producto verificadas`);

  // 4. Categorías de gasto
  const expenseCategories = [
    'Arriendo',
    'Transporte',
    'Publicidad',
    'Servicios',
    'Sueldos',
    'Otros',
  ];
  for (const name of expenseCategories) {
    const existing = await expenseCategoryRepo.findOne({ where: { name } });
    if (!existing) {
      await expenseCategoryRepo.insert({ name });
    }
  }
  console.log(`[seed] ${expenseCategories.length} categorías de gasto verificadas`);

  // 5. CompanySettings (singleton)
  const existingSettings = await settingsRepo.find({ take: 1 });
  if (existingSettings.length === 0) {
    await settingsRepo.insert({
      name: 'Mi Empresa',
      address: null,
      phone: null,
      email: null,
      taxId: null,
      logoUrl: null,
      currency: 'USD',
      quotationFooter:
        'Esta cotización tiene una validez de 15 días desde su emisión.',
      defaultValidityDays: 15,
    });
    console.log('[seed] CompanySettings creado con valores placeholder');
  } else {
    console.log('[seed] CompanySettings ya existe');
  }

  await dataSource.destroy();
  console.log('[seed] OK');
}

run().catch((err) => {
  console.error('[seed] ERROR:', err);
  process.exit(1);
});
