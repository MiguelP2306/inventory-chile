import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import dataSource from '../data-source';
import {
  Category,
  Commune,
  CompanySettings,
  ExpenseCategory,
  User,
  Warehouse,
} from '../entities';
import communesData from './data/communes-cl.json';
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
  const communeRepo = dataSource.getRepository(Commune);

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

  // 2. Almacenes iniciales — siempre precargados: "Bodega", "Tienda" y
  //    "Mercado libre", las tres activas.
  //
  //    Migración de nombres legacy (idempotente, preserva stock/historial e
  //    ids): las instalaciones viejas tenían "Principal" y "Mercado Libre Full".
  //    Los renombramos a "Bodega" y "Mercado libre" en vez de crear duplicados.
  //    "Bodega" es la bodega operativa por defecto (la lógica de ventas/compras
  //    la prefiere por nombre — ver *.service.ts `defaultWarehouseId`).
  const warehouseRenames: Array<{ from: string; to: string }> = [
    { from: 'Principal', to: 'Bodega' },
    { from: 'Mercado Libre Full', to: 'Mercado libre' },
  ];
  for (const { from, to } of warehouseRenames) {
    // Si ya existe la bodega con el nombre nuevo, no hay nada que migrar.
    const alreadyRenamed = await warehouseRepo.findOne({ where: { name: to } });
    if (alreadyRenamed) continue;
    const legacy = await warehouseRepo.findOne({ where: { name: from } });
    if (legacy) {
      legacy.name = to;
      legacy.isActive = true;
      await warehouseRepo.save(legacy);
      console.log(`[seed] Almacén "${from}" renombrado a "${to}" (activo)`);
    }
  }

  // Asegurar las 3 bodegas requeridas, activas. Crea las que falten y reactiva
  // las que estuvieran inactivas. Idempotente.
  const requiredWarehouses = ['Bodega', 'Tienda', 'Mercado libre'];
  for (const name of requiredWarehouses) {
    const existing = await warehouseRepo.findOne({ where: { name } });
    if (!existing) {
      await warehouseRepo.insert({ name, address: null, isActive: true });
      console.log(`[seed] Almacén "${name}" creado (activo)`);
    } else if (!existing.isActive) {
      await warehouseRepo.update({ id: existing.id }, { isActive: true });
      console.log(`[seed] Almacén "${name}" reactivado`);
    } else {
      console.log(`[seed] Almacén "${name}" ya existe`);
    }
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

  // 4. Categorías de gasto. Las de "sistema" (IVA Compra, IVA Venta,
  // Comisión Tarjeta) NO pueden eliminarse desde la UI porque la lógica
  // automática las referencia por nombre.
  const expenseCategories: Array<{ name: string; isSystem: boolean }> = [
    { name: 'Arriendo', isSystem: false },
    { name: 'Transporte', isSystem: false },
    { name: 'Publicidad', isSystem: false },
    { name: 'Servicios', isSystem: false },
    { name: 'Sueldos', isSystem: false },
    { name: 'Otros', isSystem: false },
    { name: 'IVA Compra', isSystem: true },
    { name: 'IVA Venta', isSystem: true },
    { name: 'Comisión Tarjeta', isSystem: true },
  ];
  for (const { name, isSystem } of expenseCategories) {
    const existing = await expenseCategoryRepo.findOne({ where: { name } });
    if (!existing) {
      await expenseCategoryRepo.insert({ name, isSystem });
    } else if (existing.isSystem !== isSystem) {
      await expenseCategoryRepo.update({ id: existing.id }, { isSystem });
    }
  }
  console.log(`[seed] ${expenseCategories.length} categorías de gasto verificadas`);

  // 5. Comunas chilenas (catálogo de 346, idempotente)
  const expectedCommunes: Array<{ name: string; region: string }> = (
    communesData as { regiones: Array<{ region: string; comunas: string[] }> }
  ).regiones.flatMap((r) => r.comunas.map((c) => ({ name: c, region: r.region })));
  const existingCount = await communeRepo.count();
  if (existingCount === 0) {
    // Carga masiva primera vez (chunks de 100 para no pasar el max_packet_size)
    const chunkSize = 100;
    for (let i = 0; i < expectedCommunes.length; i += chunkSize) {
      await communeRepo.insert(expectedCommunes.slice(i, i + chunkSize));
    }
    console.log(`[seed] ${expectedCommunes.length} comunas insertadas`);
  } else {
    // Idempotente: agregar las que falten (sin duplicar por unique (name, region))
    let inserted = 0;
    for (const c of expectedCommunes) {
      const found = await communeRepo.findOne({
        where: { name: c.name, region: c.region },
      });
      if (!found) {
        await communeRepo.insert(c);
        inserted++;
      }
    }
    console.log(
      `[seed] Comunas: ${existingCount} ya existían, ${inserted} nuevas insertadas`,
    );
  }

  // 6. CompanySettings (singleton). taxRate y cardCommissionRate tienen
  // defaults en la migración (0.1900 y 0.0250); los explicito acá para que
  // el insert inicial tenga valores legibles si alguien lo audita.
  const existingSettings = await settingsRepo.find({ take: 1 });
  if (existingSettings.length === 0) {
    await settingsRepo.insert({
      name: 'Mi Empresa',
      address: null,
      phone: null,
      email: null,
      taxId: null,
      logoUrl: null,
      currency: 'CLP',
      // Footer genérico sujeto a personalización desde /configuracion. La
      // validez real de cada cotización se muestra como "Válida hasta: <fecha>"
      // — no la duplicamos acá para no generar inconsistencias con validUntil.
      quotationFooter:
        'Sujeta a confirmación de stock al momento de la venta. Precios en pesos chilenos (CLP), IVA incluido.',
      defaultValidityDays: 15,
      taxRate: '0.1900',
      cardCommissionRate: '0.0250',
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
